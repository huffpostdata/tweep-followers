const stream = require('stream')

/**
 * A Transform stream that takes in Arrays and outputs Arrays of fixed length.
 *
 * This is an object stream, not a String/Buffer stream. Inputs and outputs
 * are Arrays. There will usually be more of one than the other.
 *
 * Example:
 *
 *   const transform = new InGroupsOf(2)
 *   transform.on('data', function(array) { console.log(array) })
 *   transform.push([ '1', '2', '3' ]) // outputs [ 1, 2 ]
 *   transform.end()                   // outputs 3
 */
class InGroupsOf extends stream.Transform {
  constructor(group_size) {
    super({ objectMode: true })
    this.group_size = group_size
    this.remainder = []
  }

  _transform(chunk, encoding, callback) {
    var array = this.remainder.concat(chunk)

    while (array.length >= this.group_size) {
      this.push(array.slice(0, this.group_size))
      array = array.slice(this.group_size)
    }

    this.remainder = array

    callback(null)
  }

  _flush(callback) {
    if (this.remainder.length > 0) {
      this.push(this.remainder)
    }

    callback(null)
  }
}

/**
 * An object-mode Transform stream that outputs Arrays of the same size (except
 * the final Array, which may be smaller).
 *
 * Usage:
 *
 *   get_stream_of_arrays_somehow()
 *     .pipe(in_groups_of(100))
 *     .pipe(do_something)
 */
module.exports = function in_groups_of(group_size) {
  return new InGroupsOf(group_size)
}
