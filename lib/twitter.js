'use strict'

const request = require('request')

const debug = require('debug')('twitter')
const ms = require('ms') // for debugging
const querystring = require('querystring') // for debugging
const truncate = require('./truncate') // for debugging

const ROOT = 'https://api.twitter.com'

/**
 * An Application-only Twitter client.
 */
module.exports = class Twitter {
  constructor(consumer_key, consumer_secret, token, token_secret) {
    this.oauth = {
      consumer_key: consumer_key,
      consumer_secret: consumer_secret,
      token: token,
      token_secret: token_secret
    }
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
      oauth: this.oauth,
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

      if (response.statusCode === 429) {
        const rate_limit_reset_string = response.headers['x-rate-limit-reset']
        const rate_limit_reset = parseInt(rate_limit_reset_string, 10) * 1000 + 999 // assume clocks off by <1s
        const now = new Date().getTime()
        const wait = Math.max(0, rate_limit_reset - now)
        debug(`Hit rate limit. Will retry in ${ms(wait)}`)
        setTimeout(() => this.request(method, endpoint, params, callback), wait)
        return
      }

      if (response.statusCode === 500) {
        debug('Got 500 error. Will retry in 1s')
        setTimeout(() => this.request(method, endpoint, params, callback), 1000)
        return
      }

      if (response.statusCode === 503) {
        debug('Got 503 error (congestion). Will retry in 5s')
        setTimeout(() => this.request(method, endpoint, params, callback), 5000)
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
