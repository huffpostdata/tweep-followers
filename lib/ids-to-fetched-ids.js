const debug = require('debug')('ids-to-fetched-ids')
const stream = require('stream')
const fetch_users = require('./fetch-users')

/**
 * Calls `callback` with a Set of user-id Strings.
 *
 * Calls `callback` with `null` if there's a database error.
 *
 * With large databases, this method will be quite slow.
 */
function fetch_fetched_user_ids(database, callback) {
  const sql = `SELECT CAST(id AS TEXT) AS id_string FROM users_lookup_http_cache`
  debug(sql)
  database.all(sql, (error, rows) => {
    if (error) return callback(error)

    debug(`Converting ${rows.length} ID strings to Set...`)
    const id_strings = rows.map(row => row.id_string)
    const set = new Set(id_strings)

    return callback(null, set)
  })
}

/**
 * Passes through a stream of Arrays of String user IDs, ensuring each is
 * fetched and stored in the database.
 *
 * Why just echo the input? Because in the process, we make sure each Twitter
 * User JSON object is stored in the database. When the stream is finished, all
 * IDs are fetched.
 *
 * The input must be an `objectMode` stream of Arrays of String user IDs. Each
 * Array _should_ have a maximum length of 100. (Longer are supported, but
 * they're inefficient.)
 */
module.exports = function ids_to_fetched_ids(environment) {
  let id_set = null

  function transform(user_ids, callback) {
    const missing_ids = user_ids.filter(id => !id_set.has(id))

    if (missing_ids.length === 0) return callback(null, user_ids) // optimization

    // fetch_users will create JSONbig objects for users fetched from Twitter.
    // We can't avoid that. But since we filtered out IDs already in the
    // database, we won't have to JSONbig-parse all those.
    fetch_users(user_ids, environment, error => callback(error, user_ids))
  }

  return new stream.Transform({
    objectMode: true,

    transform(chunk, encoding, callback) {
      if (id_set) {
        transform(chunk, callback)
      } else {
        fetch_fetched_user_ids(environment.database, (error, a_set) => {
          if (error) return callback(error)

          id_set = a_set
          transform(chunk, callback)
        })
      }
    }
  })
}

module.exports.USERS_PER_REQUEST = fetch_users.USERS_PER_REQUEST
