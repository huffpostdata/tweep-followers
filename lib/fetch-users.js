'use strict'

const debug = require('debug')('fetch-users')
const JSONbig = require('json-bigint')
const compression = require('./compression')
const stream = require('stream')
const truncate = require('./truncate')

const USERS_PER_REQUEST = 100

/**
 * Fetches JSON Strings for users with the given IDs, in arbitrary order.
 *
 * Calls `callback` with an Array containing a String per user who is in the
 * database.
 *
 * Calls callback with error if there's a database error.
 */
function database_fetch(user_ids, database, callback) {
  if (user_ids.length === 0) return callback(null, [])
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error("database_fetch() must be called with an Array of String user IDs"))
  }

  const sql = `SELECT compressed_json FROM users_lookup_http_cache WHERE compressed_json IS NOT NULL AND id IN (${user_ids.join(',')})`

  debug(truncate(sql))
  database.all(sql, function(error, rows) {
    if (error) return callback(error)

    const json_strings = rows.map((row) => compression.decompress(row.compressed_json))

    return callback(null, json_strings)
  })
}

function database_fetch_nulls(user_ids, database, callback) {
  if (user_ids.length === 0) return callback(null, [])
  const sql = `SELECT CAST(id AS TEXT) AS id_string FROM users_lookup_http_cache WHERE compressed_json IS NULL AND id IN (${user_ids.join(',')})`

  debug(truncate(sql))
  database.all(sql, (error, rows) => {
    if (error) return callback(error)
    const id_strings = rows.map((row) => row.id_string)
    return callback(null, id_strings)
  })
}

/**
 * Fetches the HTTP response for users/lookup from Twitter.
 *
 * Calls callback with the Twitter response: an Array of user IDs, in arbitrary
 * order.
 *
 * Calls callback with error if there's an HTTP or Twitter-side error.
 */
function twitter_fetch(user_ids, twitter, callback) {
  if (user_ids.length === 0) return callback(null, [])
  twitter.GET('users/lookup', { user_id: user_ids.join(',') }, callback)
}

/**
 * Saves an HTTP response to the database.
 *
 * This expects a JSONbig Array.
 *
 * Calls callback with error if there's a database error; otherwise calls it
 * with `null`.
 */
function database_write(jsonbig_array, database, callback) {
  if (jsonbig_array.length === 0) return callback(null)

  const sql_values = []
  const params = []

  jsonbig_array.forEach((item) => {
    sql_values.push(`(${item.id.toString()},DATETIME('now'),?)`) // JS can't handle 64-bit ints
    params.push(compression.compress(JSONbig.stringify(item)))
  })

  const sql = `INSERT INTO users_lookup_http_cache (id, created_at, compressed_json) VALUES ${sql_values.join(',')}`

  debug(`${truncate(sql)}, …`)
  database.run(sql, params, callback)
}

/**
 * Saves a _lack_ of HTTP response to the database.
 *
 * Twitter will return a 404 (or omit a user from a batch of users) if the ID
 * no longer refers to a user. We have to handle that case. So we'll write NULL
 * users to the database.
 */
function database_write_nulls(user_ids, database, callback) {
  if (user_ids.length === 0) return callback(null)
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error('You passed Twitter user IDs as integers. That is incorrect: JavaScript silently mangles large integers. You must pass an Array of Strings.'))
  }

  const parts = user_ids.map((id) => `(${id},DATETIME('now'),NULL)`) // JS can't handle 64-bit ints
  const sql = `INSERT INTO users_lookup_http_cache (id, created_at, compressed_json) VALUES ${parts.join(',')}`

  debug(`${truncate(sql)}`)
  database.run(sql, callback)
}

/**
 * Calls callback with an Array of JSONbig objects.
 *
 * Calls callback with error if a database or Twitter operation fails.
 *
 * The passed argument must be a _String_ of comma-separated user IDs.
 */
function cached_fetch(user_ids, environment, callback) {
  if (user_ids.length > USERS_PER_REQUEST) {
    return callback(new Error(`cached_fetch() must be called with <=${USERS_PER_REQUEST} user IDs`))
  }

  // 1. Fetch all full user objects from the database.
  database_fetch(user_ids, environment.database, function(error, jsons) {
    if (error) return callback(error)

    const database_jsons = jsons.map(JSONbig.parse)
    const database_ids = {}
    database_jsons.forEach((json) => database_ids[json.id.toString()] = null)

    let missing_ids = user_ids.filter((id) => !database_ids.hasOwnProperty(id))
    if (missing_ids.length === 0) return callback(null, database_jsons)

    // 2. Check the database for NULL users, so we don't request them of Twitter
    database_fetch_nulls(user_ids, environment.database, function(error, id_strings) {
      if (error) return callback(error)

      id_strings.forEach((id_string) => database_ids[id_string] = null)
      missing_ids = user_ids.filter((id) => !database_ids.hasOwnProperty(id))
      if (missing_ids.length === 0) return callback(null, database_jsons)

      // 3. Ask Twitter for missing users
      twitter_fetch(missing_ids, environment.twitter, function(error, json) {
        if (error) return callback(error)

        const twitter_jsons = json === null ? [] : JSONbig.parse(json)

        // 4. Write those users to the database
        database_write(twitter_jsons, environment.database, function(error) {
          if (error) return callback(error)

          twitter_jsons.forEach((json) => database_ids[json.id.toString()] = null)
          missing_ids = user_ids.filter((id) => !database_ids.hasOwnProperty(id))

          // 5. Write NULL users to the database (IDs neither in Twitter nor DB)
          database_write_nulls(missing_ids, environment.database, function(error) {
            if (error) return callback(error)

            // 6. Return non-NULL users from DB and Twitter
            const all_jsons = database_jsons.concat(twitter_jsons)
            return callback(null, all_jsons)
          })
        })
      })
    })
  })
}

/**
 * Calls cached_fetch(), USERS_PER_REQUEST ids at a time.
 *
 * Calls callback with an Array of JSONbig objects.
 *
 * Calls callback with an error if Twitter or database fails.
 */
function cached_fetch_many(user_ids, environment, callback) {
  let todo_ids = user_ids.slice()
  const json_arrays = []

  function step() {
    const step_ids = todo_ids.slice(0, USERS_PER_REQUEST)
    todo_ids = todo_ids.slice(USERS_PER_REQUEST)

    cached_fetch(step_ids, environment, (error, json_array) => {
      if (error) return callback(error)

      json_arrays.push(json_array)

      if (todo_ids.length === 0) {
        return callback(null, Array.prototype.concat.apply([], json_arrays))
      } else {
        process.nextTick(step)
      }
    })
  }

  step()
}

/**
 * Calls `callback` with an Array of JSONbig Twitter user objects.
 *
 * Calls `callback` with an Error if calls to Twitter or the database fail.
 */
module.exports = function fetch_users(user_ids, environment, callback) {
  if (user_ids.length === 0) return callback(null, [])
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error("cached_fetch_many() must be called with an Array of String user IDs"))
  }

  return cached_fetch_many(user_ids, environment, callback)
}

module.exports.USERS_PER_REQUEST = USERS_PER_REQUEST
