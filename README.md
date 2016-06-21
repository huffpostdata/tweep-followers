Fetches follower information from Twitter.

Usage: `./index.js realDonaldTrump`

This will:

1. GET from `followers/ids`, page after page, until all results are in.
2. GET from `users/lookup` until all IDs have been looked up.

It will write to `database.sqlite3`, which will have:

`followers_ids_http_cache`: `id`, `screen_name`, `cursor`, `created_at`, `json`
`users_lookup_http_cache`: `id`, `ids` (string with commas), `created_at`, `json`
