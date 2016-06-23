#!/usr/bin/env node

'use strict'

const OAuth = require('oauth').OAuth

// Adapted from https://gist.github.com/tanepiper/575303

if (!process.env.TWITTER_CONSUMER_KEY) {
  throw new Error('You must set the TWITTER_CONSUMER_KEY environment variable')
}
if (!process.env.TWITTER_CONSUMER_SECRET) {
  throw new Error('You must set the TWITTER_CONSUMER_SECRET environment variable')
}

function getAccessToken(oa, oauth_token, oauth_token_secret, pin) {
  oa.getOAuthAccessToken(oauth_token, oauth_token_secret, pin,
    function(error, oauth_access_token, oauth_access_token_secret, results2) {
      if (error) throw error

      process.stdout.write(`TWITTER_TOKEN=${oauth_access_token}\n`)
      process.stdout.write(`TWITTER_TOKEN_SECRET=${oauth_access_token_secret}\n`)
      process.exit(0)
    })
}

function getRequestToken(oa) {
  oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
    if (error) {
      throw new Error(`${error.statusCode}: ${error.data}`)
    } else { 
      process.stderr.write('Log in to Twitter and visit:\n\n')
      process.stderr.write(`https://twitter.com/oauth/authorize?oauth_token=${oauth_token}\n\n`)
      process.stderr.write('Enter the PIN Twitter gives you: ')

      const stdin = process.openStdin()
      stdin.on('data', function(chunk) {
        const pin = chunk.toString().trim()
        getAccessToken(oa, oauth_token, oauth_token_secret, pin)
      })
    }
  })
}

getRequestToken(new OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET,
  '1.0',
  'oob',
  'HMAC-SHA1'
))
