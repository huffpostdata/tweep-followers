#!/usr/bin/env node
'use strict'

const sqlite3 = require('sqlite3')
const Twitter = require('./lib/twitter')
const Environment = require('./lib/environment')
const fetch_followers = require('./lib/fetch-followers')

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
`, function(error) {
  if (error) throw error

  const environment = new Environment(twitter, database)

  const screen_name = process.argv[2]

  fetch_followers(screen_name, environment, function(error, ids) {
    if (error) throw error

    console.log(`Fetched ${ids.length} IDs`)
  })
})
