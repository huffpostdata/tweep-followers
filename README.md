Fetches follower information from Twitter.

# Step 1: Download from Twitter to SQLite3

## Usage

1. Install [NodeJS](https://nodejs.org)
2. `git clone` this repository
3. Run `npm install`
4. Run `./gather-tweeps.sh realDonaldTrump` and follow instructions

This will:

0. Help you set up `./config` with Twitter OAuth stuff.
1. GET from `followers/ids`, page after page, until all results are in.
2. GET from `users/lookup` until all IDs have been looked up.

It will write to `database.sqlite3`, which will have:

* `followers_ids_http_cache`: `id`, `screen_name`, `cursor`, `created_at`, `json`
* `users_lookup_http_cache`: `id`, `user_id`, `created_at`, `compressed_json`

## Disk usage

This is going to get large.

Each user object takes about 2kb. As I write this (Oct. 2016), @realDonaldTrump
has 12.3M followers. That means storing that raw JSON will take about 24.6GB.
Ouch.

So our `users_lookup_http_cache` uses a fancy compression pipeline:

* [UTF-8](https://en.wikipedia.org/wiki/UTF-8) to turn Twitter's text into bytes
* [VCDIFF](https://en.wikipedia.org/wiki/VCDIFF) to delta-encode those bytes
  against a pre-made dictinoary of sample Twitter JSON responses. (Most bytes in
  most of these JSON objects are the same, so this compresses to ~45%.)
* [zlib](https://en.wikipedia.org/wiki/Zlib) to Huffman-encode the resulting
  bytes. (Most VCDIFF output is text, so this compresses a further ~45%.)

In total, these tweaks drop us to ~20% disk usage. Add some ~25% overhead for
SQLite and the lists of IDs, and we're looking at **One 10M-follower Tweep =>
4.6GB**

# Step 2: Pull from SQLite3 to CSV

Okay, using a database was _maybe_ a good idea (it's enormous overhead, but it
helps avoid file corruption.) But in retrospect, Node and SQLite3 were bad
choices: Node balks at sets with >1M items, and SQLite3 is far slower than it
should be. (In a database with 10M users on a t2.large, SQLite3 was almost more
of a bottleneck than the actual Twitter API limits.)

Also, VCDiff has its place, but we should eliminate it early so everything
later in the pipeline doesn't need to decipher it.

## Dump followers' Twitter bios

We want to compare the followers of two Tweeps, based on their bios. Here's how
to dump the data:

1. Install [Go](https://golang.org/)
2. `git clone` this repository and build `database.sqlite3` (see Step 1 above).
3. Install [XDelta3](http://xdelta.org/) as a library. (TODO publish the code I
   used to compile XDelta3 as a library.)
4. Run `go run dump-descriptions.go hillaryclinton realDonaldTrump > out.csv`

This will create `out.csv`. The CSV is *near*-valid
[RFC4180](https://tools.ietf.org/html/rfc4180) and has no column names. Here
they are:

* `id`: Twitter user ID: 64-bit integer
* `follows_hillaryclinton`: `1` if this user followed Clinton when fetched
* `follows_realDonaldTrump`: `1` if this user followed Trump when fetched
* `description`: exact text from Twitter API

The `description` is raw, straight from Twitter. Twitter's guarantees:

* The bytes are valid UTF-8.
* There are at most 160 (not 140) Unicode codepoints.

*Non*-guarantees:

* The strings aren't guaranteed to be NFKC-normalized. NFKC-normalize text
  before processing.
* The strings *can* include ASCII control characters, such as `\r`, `\n`, beep,
  tab, and so forth. Really, any darned character.
* The CSV does not conform to the RFC exactly: it may include ASCII control
  characters! To conform to spec, you can byte-wise replace all instances of
  `\x00-\x09`, `\x0b`, `\x0c` and `\x0e-\x1f` in the CSV with `\x20` (`" "`)).

## Process the TSV

See [Twittok](https://github.com/huffpostdata/twittok) for a fast data processor
that accepts this CSV as input.
