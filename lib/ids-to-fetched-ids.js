'use strict'

const debug = require('debug')('ids-to-fetched-ids')
const stream = require('stream')
const fetch_users = require('./fetch-users')

/**
 * A Set of Strings constructed from an Array of Arrays of Strings.
 *
 * We assume the total number of elements is in the millions. The cost is:
 *
 * * O(n lg n) for construction
 * * O(lg n) for search
 *
 * This takes less memory and seems to be faster than a Set or Object.
 */
class SpecialSet {
  constructor(arrays) {
    debug(`Merging ${arrays.length} arrays...`)
    this.array = Array.prototype.concat.apply([], arrays)
    this.array.sort()
    debug(`Merged`)
  }

  has(id) {
    let min = 0, max = this.array.length
    while (min < max) {
      let mid = (min + max) >> 2
      let v = this.array[mid]
      if (v < id) {
        min = mid + 1
      } else {
        max = mid
      }
    }

    return min < this.array.length && this.array[min] === id
  }

  /**
   * Returns:
   *
   * * this.array.length if id is larger than any element of this set
   * * the index _before_ id if id is not in this set
   * * the index _of_ id if id is in this set
   */
  _indexOf(id, min, max) {
    while (min < max) {
      let mid = (min + max) >> 1
      let v = this.array[mid]
      if (v < id) {
        min = mid + 1
      } else {
        max = mid
      }
    }

    return min
  }

  /**
   * Returns an Array of IDs that are _not_ in this set.
   */
  missing(ids) {
    debug(`Testing ${ids.length} ids...`)
    ids.sort()

    const ret = []

    let min = 0, max = this.array.length
    for (const id of ids) {
      min = this._indexOf(id, min, max)
      if (min < max && this.array[min] !== id) ret.push(id)
    }

    return ret
  }
}

/**
 * Calls `callback` with an Array of user-id Strings.
 *
 * Calls `callback` with `null` if there's a database error.
 *
 * This method uses a LIMIT so that sqlite3 doesn't become slow when faced
 * with millions of IDs.
 */
function fetch_some_fetched_user_ids(last_maximum, database, callback) {
  const sql = `SELECT CAST(id AS TEXT) AS id_string FROM users_lookup_http_cache WHERE id > ${last_maximum} ORDER BY id LIMIT 5000`
  debug(sql)
  database.all(sql, (error, rows) => {
    if (error) return callback(error)

    const array = new Array(rows.length)
    for (const i in rows) {
      array[i] = rows[i].id_string
    }
    return callback(null, array)
  })
}

/**
 * Calls `callback` with a Set of user-id Strings.
 *
 * Calls `callback` with `null` if there's a database error.
 *
 * With large databases, this method will be quite slow.
 */
function fetch_fetched_user_ids(database, callback) {
  const arrays = []

  function step(last_maximum) {
    fetch_some_fetched_user_ids(last_maximum, database, (error, id_strings) => {
      if (error) return callback(error)

      if (id_strings.length === 0) {
        debug('NO MORE IDs')
        return callback(null, new SpecialSet(arrays))
      } else {
        arrays.push(id_strings)
        process.nextTick(() => step(id_strings[id_strings.length - 1]))
      }
    })
  }

  step('-1')
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
    const missing_ids = id_set.missing(user_ids)

    if (missing_ids.length === 0) return callback(null, user_ids) // optimization

    // fetch_users will create JSONbig objects for users fetched from Twitter.
    // We can't avoid that. But since we filtered out IDs already in the
    // database, we won't have to JSONbig-parse all those.
    fetch_users(missing_ids, environment, error => callback(error, user_ids))
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
