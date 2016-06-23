const stream = require('stream')
const fetch_users = require('./fetch-users')

/**
 * Transforms a stream of user IDs into a stream of User JSONbig objects.
 *
 * The input must be an `objectMode` stream of Arrays of String user IDs. Each
 * Array _should_ have a maximum length of 100. (Longer are supported, but
 * they're inefficient.)
 */
module.exports = function ids_to_users(environment) {
  return new stream.Transform({
    objectMode: true,

    transform(chunk, encoding, callback) {
      fetch_users(chunk, environment, (error, array) => {
        if (error) return callback(error)

        this.push(array)
        callback(null)
      })
    }
  })
}

module.exports.USERS_PER_REQUEST = fetch_users.USERS_PER_REQUEST
