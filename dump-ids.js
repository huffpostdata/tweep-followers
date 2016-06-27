#!/usr/bin/env node
'use strict'

/**
 * Dump a follower's IDs to standard output.
 *
 * Usage: ./dump-ids.js realDonaldTrump > ids-realDonaldTrump.csv
 */

const Environment = require('./lib/environment')
const stream_followers = require('./lib/stream-followers')

function main(screen_name, environment, callback) {
  stream_followers(screen_name, environment)
    .on('data', (array) => {
      process.stdout.write(new Buffer(array.join('\n'), 'ascii'))
      process.stdout.write('\n')
      process.stderr.write('.')
    })
    .on('end', () => {
      process.stderr.write('\n')
      callback(null)
    })
    .on('error', (error) => { callback(error) })
}

Environment.load((error, environment) => {
  if (error) throw error

  const screen_name = process.argv[2]
  if (!screen_name) {
    process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} twitter_user_name\n`)
    process.exit(1)
  }

  main(screen_name, environment, (error) => {
    if (error) throw error
  })
})
