#!/usr/bin/env node
'use strict'

const Environment = require('./lib/environment')
const debug = require('debug')('main')
const stream_followers = require('./lib/stream-followers')
const in_groups_of = require('./lib/in-groups-of')
const ids_to_fetched_ids = require('./lib/ids-to-fetched-ids')

function main(screen_name, environment, callback) {
  let n_ids = 0
  let n_users = 0

  stream_followers(screen_name, environment)
    .on('data', (array) => {
      n_ids += array.length
      debug(`${screen_name} follower IDs: ${n_ids}`)
    })
    .pipe(in_groups_of(ids_to_fetched_ids.USERS_PER_REQUEST, { highWaterMark: 99999999 }))
    .pipe(ids_to_fetched_ids(environment))
    .on('data', (array) => {
      n_users += array.length
      debug(`${screen_name} followers: ${n_users}`)
    })
    .on('end', () => {
      debug(`Done streaming ${n_users} users following ${screen_name}`)
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
