#!/usr/bin/env node
'use strict'

const debug = require('debug')('index')
const sqlite3 = require('sqlite3')
const Twitter = require('./lib/twitter')
const Environment = require('./lib/environment')
const fetch_followers = require('./lib/fetch-followers')
const fetch_users = require('./lib/fetch-users')

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

  fetch_followers(screen_name, environment, function(error, ids) {
    if (error) throw error

    debug(`Fetched ${ids.length} IDs`)

    fetch_users(ids, environment, function(error, users) {
      if (error) throw error

      debug(`Fetched ${users.length} users`)
    })
  })
})
