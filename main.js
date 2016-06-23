#!/usr/bin/env node
'use strict'

const debug = require('debug')('main')
const sqlite3 = require('sqlite3')
const Twitter = require('./lib/twitter')
const Environment = require('./lib/environment')
const stream_followers = require('./lib/stream-followers')
const in_groups_of = require('./lib/in-groups-of')
const ids_to_users = require('./lib/ids-to-users')

if (!process.env.TWITTER_CONSUMER_KEY
    || !process.env.TWITTER_CONSUMER_SECRET
    || !process.env.TWITTER_TOKEN
    || !process.env.TWITTER_TOKEN_SECRET
    ) {
  throw new Error('Your ./config is missing a TWITTER_ variable. Back it up, delete it and run ./gather-tweeps.sh to fix it.')
}

const twitter = new Twitter(
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET,
  process.env.TWITTER_TOKEN,
  process.env.TWITTER_TOKEN_SECRET
)

const database = new sqlite3.Database('database.sqlite3')

database.exec(`
  CREATE TABLE IF NOT EXISTS followers_ids_http_cache (
    id INTEGER PRIMARY KEY,
    screen_name TEXT NOT NULL,
    cursor INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users_lookup_http_cache (
    id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL,
    compressed_json BLOB
  );
`, function(error) {
  if (error) throw error

  const environment = new Environment(twitter, database)

  const screen_name = process.argv[2]
  let n_ids = 0
  let n_users = 0

  stream_followers(screen_name, environment)
    .on('data', (array) => {
      n_ids += array.length
      debug(`${screen_name} follower IDs: ${n_ids}`)
    })
    .pipe(in_groups_of(ids_to_users.USERS_PER_REQUEST, { highWaterMark: 99999999 }))
    .pipe(ids_to_users(environment))
    .on('data', (array) => {
      n_users += array.length
      debug(`${screen_name} followers: ${n_users}`)
    })
    .on('error', (error) => { throw error })
})
