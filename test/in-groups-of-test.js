const expect = require('chai').expect
const stream = require('stream')
const in_groups_of = require('../lib/in-groups-of')

function dummy_stream(arrays) {
  return new stream.Readable({
    objectMode: true,

    read(ignored_size) {
      this.push(arrays.shift() || null)
    }
  })
}

function sink(array) {
  return new stream.Writable({
    objectMode: true,

    write(chunk, encoding, callback) {
      array.push(chunk)
      callback(null)
    }
  })
}

describe('in-groups-of', () => {
  it('should output one small Array', (done) => {
    const out = []
    dummy_stream([[ 1, 2 ]])
      .pipe(in_groups_of(2))
      .pipe(sink(out))
      .on('finish', () => {
        expect(out).to.deep.eq([[ 1, 2 ]])
        done()
      })
  })

  it('should output two Arrays', (done) => {
    const out = []
    dummy_stream([[ 1, 2 ], [ 3, 4 ]])
      .pipe(in_groups_of(2))
      .pipe(sink(out))
      .on('finish', () => {
        expect(out).to.deep.eq([[ 1, 2 ], [ 3, 4 ]])
        done()
      })
  })

  it('should merge Arrays', (done) => {
    const out = []
    dummy_stream([ [1], [2], [3], [4] ])
      .pipe(in_groups_of(2))
      .pipe(sink(out))
      .on('finish', () => {
        expect(out).to.deep.eq([[ 1, 2 ], [ 3, 4 ]])
        done()
      })
  })

  it('should split an Array', (done) => {
    const out = []
    dummy_stream([[ 1, 2, 3, 4 ]])
      .pipe(in_groups_of(2))
      .pipe(sink(out))
      .on('finish', () => {
        expect(out).to.deep.eq([[ 1, 2 ], [ 3, 4 ]])
        done()
      })
  })

  it('should let the last Array be smaller', (done) => {
    const out = []
    dummy_stream([[ 1, 2 ], [ 3, 4 ]])
      .pipe(in_groups_of(3))
      .pipe(sink(out))
      .on('finish', () => {
        expect(out).to.deep.eq([[ 1, 2, 3 ], [ 4 ]])
        done()
      })
  })
})
