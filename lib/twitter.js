'use strict'

const request = require('request')

const debug = require('debug')('twitter')
const ms = require('ms') // for debugging
const querystring = require('querystring') // for debugging
const truncate = require('./truncate') // for debugging

const ROOT = 'https://api.twitter.com'

/**
 * An Application-only Twitter client.
 *
 * In what must be an API terms-of-use gray area, we sped things up by allowing
 * multiple employees to enter their API keys. So after we've used up one
 * token's 15-minute window, we move on to the next.
 */
module.exports = class Twitter {
  /**
   * Constructor.
   *
   * Params:
   *
   * * consumer_key App key
   * * consumer_secret App secret
   * * token User API token -- or multiple tokens, comma-separated.
   * * token_secret User API secret -- or multiple secrets, comma-separated.
   */
  constructor(consumer_key, consumer_secret, token, token_secret) {
    const tokens = token.split(',')
    const token_secrets = token_secret.split(',')

    if (tokens.length != token_secrets.length) {
      throw new Error(`Watch the commas in your config. Got ${tokens.length} Twitter API tokens, but ${token_secrets.length} secrets.`)
    }

    // this.oauth is a simple priority queue of oauth tokens. When a token
    // expires, we adjust doNotTryBeforeEpochMs, which switches its place in the
    // queue.
    this.oauth = tokens.map((token, i) => {
      return {
        consumer_key: consumer_key,
        consumer_secret: consumer_secret,
        token: token,
        token_secret: token_secrets[i],
        doNotTryBeforeEpochMs: 0
      }
    })
  }

  /**
   * Runs GET or POST, as appropriate.
   *
   * Error handling:
   *
   * * Status code 429: reschedule for when Twitter says is okay
   * * Status code 404: return `null`
   */
  request(method, endpoint, params, callback) {
    const options = {
      method: method,
      url: `${ROOT}/1.1/${endpoint}.json`,
      oauth: this.oauth[0],
      timeout: 20000 // we were hitting a bug on prod
    }

    if (method == 'GET') {
      options.qs = params
    } else {
      options.form = params
    }

    debug(`${options.method} ${truncate(`${options.url}${options.qs ? `?${querystring.stringify(options.qs)}` : ''}`)}`)

    request(options, (error, response, body) => {
      if (error) return callback(error)

      debug(`Response ${response.statusCode} from ${options.method} ${truncate(`${options.url}${options.qs ? `?${querystring.stringify(options.qs)}` : ''}`)}`)

      const retry = () => this.request(method, endpoint, params, callback)

      if (response.statusCode === 429) {
        // Hit rate limit on this oauth token.
        const rate_limit_reset_string = response.headers['x-rate-limit-reset']
        const rate_limit_reset = parseInt(rate_limit_reset_string, 10) * 1000 + 999 // assume clocks off by <1s
        this.oauth[0].doNotTryBeforeEpochMs = rate_limit_reset

        // Maintain priority queue: make this.oauth[0] the least-invalid token
        this.oauth.sort((a, b) => a.doNotTryBeforeEpochMs - b.doNotTryBeforeEpochMs)

        if (this.oauth[0].doNotTryBeforeEpochMs < new Date().getTime()) {
          debug(`Moving to token ${this.oauth[0].token}`)
          process.nextTick(retry)
        } else {
          const now = new Date().getTime()
          const wait = Math.max(0, this.oauth[0].doNotTryBeforeEpochMs - now)
          debug(`Hit rate limit. Waiting ${ms(wait)} and moving to token ${this.oauth[0].token}`)
          setTimeout(retry, wait)
        }

        return
      }

      if (response.statusCode === 500) {
        debug('Got 500 error. Will retry in 1s')
        setTimeout(retry, 1000)
        return
      }

      if (response.statusCode === 503) {
        debug('Got 503 error (congestion). Will retry in 5s')
        setTimeout(retry, 5000)
        return
      }

      if (response.statusCode === 404) {
        return callback(null, null)
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return callback(new Error(`GET ${endpoint} returned status code ${response.statusCode}: ${body}`))
      }

      return callback(null, body)
    })
  }

  /**
   * Requests using HTTP GET, authenticated.
   *
   * Example:
   *
   *     twitter = new Twitter(key, secret)
   *     twitter.get('followers/ids', { screen_name: 'adamhooper' }, (error, json) => {
   *         ...
   *     })
   *
   * Calls `callback` with an error if the request fails. Otherwise, the second
   * argument to `callback` will be a JSON _string_ from Twitter.
   *
   * That's right: a _string_. That's because `JSON.parse()` mangles IDs. We
   * leave the JSON parsing to the caller.
   */
  GET(endpoint, query_params, callback) {
    this.request('GET', endpoint, query_params, callback)
  }

  /**
   * Requests using HTTP POST, authenticated.
   */
  POST(endpoint, form, callback) {
    this.request('POST', endpoint, form, callback)
  }
}
