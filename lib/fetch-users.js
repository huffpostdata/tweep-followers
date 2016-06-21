'use strict'

const debug = require('debug')('fetch-users')
const JSONbig = require('json-bigint')
const USERS_PER_REQUEST = 100

function truncate(s) {
  if (s.length > 80) {
    return s.substring(0, 79) + '…'
  } else {
    return s
  }
}

/**
 * Fetches JSON values for users with the given IDs.
 *
 * Calls `callback` with an Array containing only the users who are in the
 * database.
 *
 * Calls callback with error if there's a database error.
 */
function database_fetch(user_ids, database, callback) {
  if (user_ids.length === 0) return callback(null, [])
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error("database_fetch() must be called with an Array of String user IDs"))
  }

  const sql = `SELECT json FROM users_lookup_http_cache WHERE id IN (${user_ids.join(',')})`

  debug(truncate(sql))
  database.all(sql, function(error, rows) {
    if (error) return callback(error)

    return callback(null, rows.map((row) => row.json))
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
  if (typeof(user_ids[0]) === 'number') {
    return callback(new Error('You passed Twitter user IDs as integers. That is incorrect: JavaScript silently mangles large integers. You must pass an Array of Strings.'))
  }

  twitter.GET('users/lookup', { user_id: user_ids.join(',') }, callback)
}

/** Saves an HTTP response to the database.
 *
 * This expects the passed argument to be a JSON _String_ of an Array of User
 * objects as returned by Twitter. It's important for it to be a String, because
 * JSON.stringify(JSON.parse(twitter_json)) != twitter_json. (JavaScript can't
 * handle 64-bit integers.)
 *
 * Calls callback with error if there's a database error; otherwise calls it
 * with `null`.
 */
function database_write(json, database, callback) {
  const arr = JSONbig.parse(json)

  if (arr.length === 0) return callback(null)

  const sql_values = []
  const params = []

  arr.forEach((item) => {
    sql_values.push(`(${item.id.toString()},DATETIME('now'),?)`) // JS can't handle 64-bit ints
    params.push(JSONbig.stringify(item))
  })

  const sql = `INSERT INTO users_lookup_http_cache (id, created_at, json) VALUES ${sql_values.join(',')}`

  debug(`${truncate(sql)}, ${truncate(params[0])}, …`)
  database.run(sql, params, callback)
}

/**
 * Calls callback with an Array of JSONbig objects.
 *
 * Calls callback with error if a database or Twitter operation fails.
 *
 * The passed argument must be a _String_ of comma-separated user IDs.
 */
function cached_fetch(user_ids, environment, callback) {
  if (user_ids.length === 0) return callback(null, [])
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error("cached_fetch() must be called with an Array of String user IDs"))
  }
  if (user_ids.length > USERS_PER_REQUEST) {
    return callback(new Error(`cached_fetch() must be called with <=${USERS_PER_REQUEST} user IDs`))
  }

  database_fetch(user_ids, environment.database, function(error, jsons) {
    if (error) return callback(error)

    const database_jsons = jsons.map(JSONbig.parse)
    const database_ids = {}
    database_jsons.forEach((json) => database_ids[json.id.toString()] = null)

    const missing_ids = user_ids.filter((id) => !database_ids.hasOwnProperty(id))
    if (missing_ids.length === 0) return callback(null, database_jsons)

    twitter_fetch(missing_ids, environment.twitter, function(error, json) {
      if (error) return callback(error)

      database_write(json, environment.database, function(error) {
        if (error) return callback(error)

        const twitter_jsons = JSONbig.parse(json)
        const all_jsons = database_jsons.concat(twitter_jsons)
        return callback(null, all_jsons)
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
  if (user_ids.length === 0) return callback(null, [])
  if (typeof(user_ids[0]) !== 'string') {
    return callback(new Error("cached_fetch_many() must be called with an Array of String user IDs"))
  }

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
  return cached_fetch_many(user_ids, environment, callback)
}
