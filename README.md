Fetches follower information from Twitter.

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
* `users_lookup_http_cache`: `id`, `user_id`, `created_at`, `json` (This isn't a
  straight cache of an HTTP response, but it's far more useful for lookups.)

## Disk usage

This is going to get large.

Each user object takes about 2kb. As I write this, @realDonaldTrump has 9.2M
followers. That means storing that raw JSON will take about 17.5GB. And if we
want to do this for multiple candidates? Ouch.

So our `users_lookup_http_cache` uses a fancy compression pipeline:

* [UTF-8](https://en.wikipedia.org/wiki/UTF-8) to turn Twitter's text into bytes
* [VCDIFF](https://en.wikipedia.org/wiki/VCDIFF) to delta-encode those bytes
  against a pre-made dictinoary of sample Twitter JSON responses. (Most bytes in
  most of these JSON objects are the same, so this compresses to ~45%.)
* [zlib](https://en.wikipedia.org/wiki/Zlib) to Huffman-encode the resulting
  bytes. (Most VCDIFF output is text, so this compresses a further ~45%.) (Since most of that vcdiff output is still text, this saves lots of

In total, these tweaks drop us to ~20% disk usage.
