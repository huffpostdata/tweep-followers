const fs = require('fs')
const vcdiff = require('vcdiff')
const zlib = require('zlib')

/*
 * To create vcdiff-dicrionaty.fmz:
 *
 * 1. Download a bunch of Twitter users files from the users/lookup API.
 * 2. Write each JSON object to its own file.
 * 3. Download and compile Femtozip: https://github.com/gtoubassi/femtozip/wiki/Tutorial
 * 4. `/path/to/femtozip/fzip/src/fzip --model vcdiff-dictionary.fmz --build /path/to/json/files`
 *
 * That will write vcdiff-dictionary.fmz, at which point you won't need the JSON
 * files any more.
 */
const dictionary = fs.readFileSync(`${__dirname}/vcdiff-dictionary.fzm`)
const hashedDictionary = new vcdiff.HashedDictionary(dictionary)

/**
 * Compression and decompression scheme for Twitter User JSONs.
 *
 * The good: super compression because we rely on the format of Twitter User
 * JSON.
 *
 * The bad: this is a proprietary and tricky compression format.
 *
 * We use `vcdiff` to extract every common string we can find; then we
 * use `deflate` to Huffman-encode. We get great compression (~15%) because
 * Twitter User JSON has tons of boilerplate data.
 *
 * `compress()` turns a String into a (much-smaller) Buffer.
 *
 * `decompress()` turns a `compress()`-created Buffer into a String. It throws
 * an error if the Buffer is obviously malformed.
 */
module.exports = {
  compress: (string) => {
    const buffer = new Buffer(string, 'utf-8')
    const vcdBuffer = vcdiff.vcdiffEncodeSync(buffer, { hashedDictionary: hashedDictionary })
    const deflatedBuffer = zlib.deflateSync(vcdBuffer)
    return deflatedBuffer
  },

  decompress: (compressedBuffer) => {
    const vcdBuffer = zlib.inflateSync(compressedBuffer)
    const buffer = vcdiff.vcdiffDecodeSync(vcdBuffer, { dictionary: dictionary })
    const string = buffer.toString('utf-8')
    return string
  }
}
