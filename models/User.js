/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
/**
 * This defines user model.
 */
'use strict';

const _ = require('lodash');
const dynamoose = require('dynamoose');
const constants = require('../constants');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} User
 * @property {String} id The user's unique identifier.
 * @property {Number} userProviderId The user provider's numeric identifier.
 * @property {String} userProviderIdStr The user provider's identifier as a string.
 * @property {String} username The user's username.
 * @property {String} role The user's role, one of the allowed constants.USER_ROLES.
 * @property {String} type The user's type, one of the allowed constants.USER_TYPES.
 * @property {String} accessToken GitLab token data (if applicable).
 * @property {Date} accessTokenExpiration Expiration date of the access token (if applicable).
 * @property {String} refreshToken GitLab token refresh token (if applicable).
 * @property {String} lockId Lock identifier (if applicable).
 * @property {Date} lockExpiration Expiration date of the lock (if applicable).
 */

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
  },
  userProviderId: {
    type: Number,
    required: true
  },
  userProviderIdStr: {
    type: String,
    required: false
  },
  username: {
    type: String,
    required: true,
    index: {
      global: true,
      rangeKey: 'type',
      project: true,
      name: 'UsernameIndex'
    }
  },
  role: {
    type: String,
    required: true,
    enum: _.values(constants.USER_ROLES)
  },
  type: {
    type: String,
    required: true,
    enum: _.values(constants.USER_TYPES)
  },
  // gitlab token data
  accessToken: {type: String, required: false},
  accessTokenExpiration: {type: Date, required: false},
  refreshToken: {type: String, required: false},
  lockId: {type: String, required: false},
  lockExpiration: {type: Date, required: false}
});

module.exports = schema;
