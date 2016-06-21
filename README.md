Fetches follower information from Twitter.

Usage: `./index.js realDonaldTrump`

This will:

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

So our `users_lookup_http_cache` uses gzip. That should save us several GB.
