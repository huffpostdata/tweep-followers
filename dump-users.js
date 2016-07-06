#!/usr/bin/env node
'use strict'

const Environment = require('./lib/environment')
const stream_followers = require('./lib/stream-followers')
const in_groups_of = require('./lib/in-groups-of')
const ids_to_users = require('./lib/ids-to-users')

const CsvNeedsEscaping = /[\x00-\x1f",]/
function csv_quote(s) {
  if (CsvNeedsEscaping.test(s)) {
    return `"${s.replace('"', '""')}"`
  } else {
    return s
  }
}

function main(screen_name, environment, callback) {
  let n_ids = 0
  let n_users = 0

  process.stderr.write(`Dumping users following ${screen_name}: `)

  process.stdout.write('id,screen_name,created_at,followers_count,friends_count,listed_count,description,location,time_zone,statuses_count,a_status_created_at,a_status_text,a_status_retweet_count')

  stream_followers(screen_name, environment)
    .pipe(in_groups_of(ids_to_users.USERS_PER_REQUEST))
    .pipe(ids_to_users(environment))
    .on('data', (array) => {
      process.stderr.write('.')
      for (const user of array) {
        process.stdout.write([
          user.id_str,
          user.screen_name,
          user.created_at,
          user.followers_count,
          user.friends_count,
          user.listed_count,
          user.description,
          user.location,
          user.time_zone,
          user.statuses_count,
          user.status ? user.status.created_at : '',
          user.status ? user.status.text : '',
          user.status ? user.status.retweet_count : ''
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
