/**
 * This defines github user mapping model.
 */
'use strict';

const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} GithubUserMapping
 * @property {String} id The unique identifier for the GithubUserMapping entity.
 * @property {String} topcoderUsername The Topcoder username associated with the GitHub user.
 * @property {String} githubUsername The GitHub username.
 * @property {Number} githubUserId The GitHub user's numeric identifier.
 */

const schema = new Schema({
  id: {
    type: String,
    required: true,
    hashKey: true
  },
  topcoderUsername: {
    type: String,
    required: true,
    index: {
      global: true,
      project: true,
      rangKey: 'id',
      name: 'TopcoderUsernameIndex'
    }
  },
  githubUsername: {
    type: String,
    index: {
      global: true,
      project: true,
      rangKey: 'id',
      name: 'GithubUsernameIndex'
    }
  },
  githubUserId: {
    type: Number,
    index: {
      global: true,
      project: true,
      rangKey: 'id',
      name: 'GithubUserIdIndex'
    }
  }
});

module.exports = schema;
