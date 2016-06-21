'use strict'

const debug = require('debug')('twitter')
const ms = require('ms')
const request = require('request')
const querystring = require('querystring') // for debugging

const ROOT = 'https://api.twitter.com'

/**
 * An Application-only Twitter client.
 */
module.exports = class Twitter {
  constructor(key, secret) {
    this.key = key
    this.secret = secret
    this.bearer_token = null
  }

  /**
   * Get a bearer token from Twitter.
   *
   * This must be the first request to the Twitter API: any other request will
   * fail without a bearer token.
   */
  get_bearer_token(callback) {
    if (this.bearer_token) return callback(null, this.bearer_token)

    const credentials = encodeURIComponent(this.key) + ':' + encodeURIComponent(this.secret)
    const auth = new Buffer(credentials).toString('base64')
    const url = `${ROOT}/oauth2/token`

    debug(`POST ${url}`)
    request({
      method: 'POST',
      url: url,
      form: { grant_type: 'client_credentials' },
      headers: {
        'User-Agent': 'tweep-followers',
        'Authorization': `Basic ${auth}`
      }
    }, (error, response, body) => {
      if (error) return callback(error)

      if (response.statusCode !== 200) {
        return callback(new Error(`POST oauth2/token returned status code ${response.statusCode}: ${body}`))
      }

      const json = JSON.parse(body)
      if (json.token_type !== 'bearer') {
        return callback(new Error(`POST oauth2/token returned a token that does not have type 'bearer': ${body}`))
      }

      this.bearer_token = json.access_token
      return callback(null, this.bearer_token)
    })
  }

  /**
   * Runs GET or POST, as appropriate.
   */
  request(method, endpoint, params, callback) {
    this.get_bearer_token((error, bearer_token) => {
      if (error) return callback(error)

      const options = {
        method: method,
        url: `${ROOT}/1.1/${endpoint}.json`,
        headers: { 'Authorization': `Bearer ${bearer_token}` }
      }

      if (method == 'GET') {
        options.qs = params
      } else {
        options.form = params
      }

      debug(`${options.method} ${options.url}${options.qs ? `?${querystring.stringify(options.qs)}` : ''}`)

      request(options, (error, response, body) => {
        if (error) return callback(error)

        if (response.statusCode === 429) {
          const rate_limit_reset_string = response.headers['x-rate-limit-reset']
          const rate_limit_reset = parseInt(rate_limit_reset_string, 10) * 1000
          const now = new Date().getTime()
          const wait = Math.max(0, rate_limit_reset - now)
          debug(`Hit rate limit. Will retry in ${ms(wait)}`)
          setTimeout(() => this.request(method, endpoint, params, callback), wait)
          return
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          return callback(new Error(`GET ${endpoint} returned status code ${response.statusCode}: ${body}`))
        }

        const json = JSON.parse(body)
        return callback(null, json)
      })
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
   * argument to `callback` will be a JSON object from Twitter.
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
