'use strict'

const fs = require('fs')
const Twitter = require('./twitter')
const sqlite3 = require('sqlite3')

function load_config() {
  // TODO maybe don't write this to the environment...
  const regex = /^([A-Z0-9_]+)="?(.*)"?$/
  const text = fs.readFileSync(`${__dirname}/../config`, 'utf-8') // Or throw error
  text.split('\n').forEach((line) => {
    const m = regex.exec(line)
    if (m) {
      const name = m[1]
      const value = m[2]

      if (!process.env[name]) {
        process.env[name] = value
      }
    }
  })
}

function default_database() {
  return new sqlite3.Database('database.sqlite3')
}

function default_twitter() {
  if (!process.env.TWITTER_CONSUMER_KEY
      || !process.env.TWITTER_CONSUMER_SECRET
      || !process.env.TWITTER_TOKEN
      || !process.env.TWITTER_TOKEN_SECRET
      ) {
    throw new Error('Your ./config is missing a TWITTER_ variable. Back it up, delete it and run ./gather-tweeps.sh to fix it.')
  }

  return new Twitter(
    process.env.TWITTER_CONSUMER_KEY,
    process.env.TWITTER_CONSUMER_SECRET,
    process.env.TWITTER_TOKEN,
    process.env.TWITTER_TOKEN_SECRET
  )
}

class Environment {
  constructor(options) {
    this.database = (options && options.database) ? options.database : default_database()
    this.twitter = (options && options.twitter) ? options.writter : default_twitter()
  }

  init_database(callback) {
    this.database.exec(`
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
    `, (error) => {
      callback(error, this)
    })
  }
}

// Load the config during require() -- so you can call:
//
// const Environment = require('./lib/environment')
// const debug = require('debug')('foo')
// ... and the "debug" will see env variables from Environment
load_config()

/**
 * Holds Twitter and sqlite3 handles.
 *
 * Usage:
 *
 *   const Environment = require('./lib/environment')
 *   // ... other require()s...
 *
 *   Environment.load((error, env) => {
 *     if (error) throw error
 *
 *     // ... pass `env` to things...
 *   })
 */
module.exports = {
  load(options, callback) {
    if (!callback) callback = options

    const env = new Environment(options)
    env.init_database(callback)
  }
};
