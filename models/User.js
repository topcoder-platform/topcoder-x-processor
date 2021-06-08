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
  refreshToken: {type: String, required: false}
});

module.exports = schema;
