'use strict'

const debug = require('debug')('stream-user-timeline')
const stream = require('stream')
const truncate = require('./truncate')
const JSONbig = require('json-bigint')

function twitter_fetch(screen_name, max_id_or_null, twitter, callback) {
  const options = { screen_name: screen_name }
  if (max_id_or_null) options.max_id = max_id_or_null
  twitter.GET('statuses/user_timeline', options, callback)
}

module.exports = function stream_user_timeline(screen_name, environment) {
  let done = false
  let max_id = null
  let n_tweets = 0
  const count = 200
  const seen_id_strs = {}

  return new stream.Readable({
    objectMode: true,

    read(ignored_size) {
      if (done) return this.push(null)

      twitter_fetch(screen_name, max_id, environment.twitter, (error, json) => {
        if (error) {
          done = true
          return process.nextTick(() => this.emit('error', error))
        }

        const tweets = JSONbig.parse(json)
          .filter(tweet => !seen_id_strs.hasOwnProperty(tweet.id_str))

        if (tweets.length === 0) {
          done = true
          return this.push(null)
        }

        for (const tweet of tweets) {
          seen_id_strs[tweet.id_str] = null
        }

        max_id = tweets[tweets.length - 1].id_str
        n_tweets += tweets.length
        this.push(tweets)
        debug(`Fetched a total of ${n_tweets} tweets from ${screen_name}`)
      })
    }
  })
}
