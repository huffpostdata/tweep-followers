#!/usr/bin/env node
'use strict'

const debug = require('debug')('index')
const sqlite3 = require('sqlite3')
const Twitter = require('./lib/twitter')
const Environment = require('./lib/environment')
const stream_followers = require('./lib/stream-followers')
const in_groups_of = require('./lib/in-groups-of')
const ids_to_users = require('./lib/ids-to-users')

const twitter = new Twitter(
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET
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
      debug(`Fetched a total of ${n_ids} user IDs following ${screen_name}`)
    })
    .pipe(in_groups_of(200))
    .pipe(ids_to_users(environment))
    .on('data', (array) => {
      n_users += array.length
      debug(`Fetched a total of ${n_users} full-user followers of ${screen_name}`)
    })
    .on('error', (error) => { throw error })
})
