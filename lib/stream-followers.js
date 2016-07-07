'use strict'

const debug = require('debug')('fetch-followers')
const stream = require('stream')
const truncate = require('./truncate')

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
 * Returns an `objectMode` stream of Arrays of String Twitter user IDs.
 *
 * Use it like this:
 *
 *   stream_followers('realDonaldTrump', environment)
 *     .pipe(in_groups_of(ids_to_users.USERS_PER_REQUEST))
 *     .pipe(ids_to_users(environment))
 *     .on('data', (users) => { console.log(`Fetched ${users.length} more users`) })
 *     .on('error', (error) => { throw error })
 *     .on('finish', () => { })
 */
module.exports = function stream_followers(screen_name, environment) {
  let cursor = '-1'   // to page through responses; -1 is "page 1"
  let n_followers = 0 // for debug messages
  const ids_regex = /"ids"\s*:\s*\[\s*((?:\d+\s*,\s*)*\d+)\s*\]/
  const cursor_regex = /"next_cursor"\s*:\s*(\d+)/

  return new stream.Readable({
    objectMode: true,
    highWaterMark: 999999, // We want to exhaust Twitter's API

    read(ignored_size) {
      if (cursor === '0') return this.push(null)

      cached_fetch(screen_name, cursor, environment, (error, json) => {
        if (error) {
          cursor = '0'
          return process.nextTick(() => this.emit('error', error))
        }

        // Handle JSON via regex. Otherwise we'd need JSONbig.
        const ids_match = ids_regex.exec(json)
        if (!ids_match) {
          const e = new Error(`No "ids" key in Twitter JSON: ${json}`)
          cursor = '0'
          return process.nextTick(() => this.emit('error', e))
        }

        const id_strings = ids_match[1].split(/\s*,\s*/)
        n_followers += id_strings.length

        const cursor_match = cursor_regex.exec(json)
        if (!cursor_match) {
          const e = new Error(`no "next_cursor" key in Twitter JSON: ${json}`)
          cursor = '0'
          return process.nextTick(() => this.emit('error', e))
        }

        cursor = cursor_match[1]

        this.push(id_strings)
        debug(`Fetched a total of ${n_followers} followers of ${screen_name}`)
      })
    }
  })
}
