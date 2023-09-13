/**
 * This defines gitlab user mapping model.
 */
'use strict';

const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} GitlabUserMapping
 * @property {String} id The unique identifier for the GitlabUserMapping entity.
 * @property {String} topcoderUsername The Topcoder username associated with the GitLab user.
 * @property {String} gitlabUsername The GitLab username.
 * @property {Number} gitlabUserId The GitLab user's numeric identifier.
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
  gitlabUsername: {
    type: String,
    index: {
      global: true,
      project: true,
      rangKey: 'id',
      name: 'GitlabUsernameIndex'
    }
  },
  gitlabUserId: {
    type: Number,
    index: {
      global: true,
      project: true,
      rangKey: 'id',
      name: 'GitlabUserIdIndex'
    }
  }
});

module.exports = schema;
