'use strict'

const debug = require('debug')('fetch-followers')

function truncate(s) {
  if (s.length > 80) {
    return s.substring(0, 79) + '…'
  } else {
    return s
  }
}

/**
 * Fetches the HTTP response for followers/ids based on screen_name and cursor.
 *
 * Calls `callback` with a JSON _string_.
 * Calls `callback` with `null` if the database hasn't cached this result.
 * Calls `callback` with error if there's a database error.
 */
function database_fetch(screen_name, cursor, database, callback) {
  const sql = [
    'SELECT json FROM followers_ids_http_cache WHERE screen_name = ? AND cursor = ?',
    screen_name,
    cursor
  ]

  debug(sql.join(', '))
  database.all(sql[0], sql[1], sql[2], function(error, rows) {
    if (error) return callback(error)

    if (rows.length > 0) {
      return callback(null, rows[0].json)
    } else {
      return callback(null, null)
    }
  })
}

/**
 * Fetches the HTTP response for followers/ids from Twitter.
 *
 * Calls callback with error if there's an HTTP or Twitter-side error.
 */
function twitter_fetch(screen_name, cursor, twitter, callback) {
  twitter.GET('followers/ids', { screen_name: screen_name, cursor: cursor }, callback)
}

/** Saves an HTTP response to the database.
 *
 * Calls callback with error if there's a database error.
 */
function database_write(screen_name, cursor, json, database, callback) {
  const sql = [
    "INSERT INTO followers_ids_http_cache (screen_name, cursor, created_at, json) VALUES (?, ?, DATETIME('now'), ?)",
    screen_name, cursor, json
  ]

  debug(sql.map(truncate).join(', '))
  database.run(sql[0], sql[1], sql[2], sql[3], callback)
}

function cached_fetch(screen_name, cursor, environment, callback) {
  database_fetch(screen_name, cursor, environment.database, function(error, json) {
    if (error) return callback(error)
    if (json) return callback(null, json)

    twitter_fetch(screen_name, cursor, environment.twitter, function(error, json) {
      if (error) return callback(error)

      database_write(screen_name, cursor, json, environment.database, function(error) {
        if (error) return callback(error)
        callback(null, json)
      })
    })
  })
}

/**
 * Calls `callback` with an Array of String user IDs who follow screen_name.
 *
 * Calls `callback` with an Error if calls to Twitter or the database fail.
 */
module.exports = function fetch_followers(screen_name, environment, callback) {
  let cursor = '-1' // "-1" returns the topmost

  const ids_strings = [] // Array of "123,234, 345" strings
  const ids_regex = /"ids"\s*:\s*\[\s*((?:\d+\s*,\s*)*\d+)\s*\]/
  const cursor_regex = /"next_cursor"\s*:\s*(\d+)/

  function step() {
    cached_fetch(screen_name, cursor, environment, function(error, json) {
      if (error) return callback(error)

      const ids_match = ids_regex.exec(json)
      if (!ids_match) {
        return callback(new Error(`No "ids" key in Twitter JSON: ${json}`))
      }

      ids_strings.push(ids_match[1])

      const cursor_match = cursor_regex.exec(json)
      if (!cursor_match) {
        return callback(new Error(`no "next_cursor" key in Twitter JSON: ${json}`))
      }

      cursor = cursor_match[1]

      if (cursor === 0) {
        const ids = ids_strings.join(',').split(/\s*,\s*/)
        return callback(null, ids)
      } else {
        process.nextTick(step)
      }
    })
  }

  step()
}
