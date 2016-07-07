#!/usr/bin/env node
'use strict'

/**
 * Dump a user's most recent tweets to standard output.
 *
 * Usage: ./dump-tweets.js realDonaldTrump > tweets-realDonaldTrump.csv
 */

const Environment = require('./lib/environment')
const stream_user_timeline = require('./lib/stream-user-timeline')

const CsvNeedsEscaping = /[\x00-\x1f",]/
function csv_quote(s) {
  if (CsvNeedsEscaping.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  } else {
    return s
  }
}

function main(screen_name, environment, callback) {
  let n_tweets = 0

  process.stderr.write(`Dumping ${screen_name} tweets: `)

  process.stdout.write('id,screen_name,text,retweet_count\n')

  stream_user_timeline(screen_name, environment)
    .on('data', (array) => {
      process.stderr.write('.')
      for (const tweet of array) {
        process.stdout.write([
          tweet.id_str,
          tweet.screen_name,
          tweet.text,
          tweet.retweet_count
        ].map(csv_quote).join(',') + '\n')
      }
    })
    .on('end', () => {
      process.stderr.write('\n')
      callback(null)
    })
    .on('error', (error) => { callback(error) })
}

function die_if_error(error) {
  if (error) {
    console.error(error)
    process.exit(1)
  }
}

Environment.load((error, environment) => {
  die_if_error(error)

  const screen_name = process.argv[2]
  if (!screen_name) {
    process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} twitter_user_name\n`)
    process.exit(1)
  }

  main(screen_name, environment, die_if_error)
})
