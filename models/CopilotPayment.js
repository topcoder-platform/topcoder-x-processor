/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */

/**
 * Schema for copilot Payment.
 * @author TCSCODER
 * @version 1.0
 */

'use strict';

const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
  },
  project: {
    type: String
  },
  amount: {type: Number, required: true},
  description: {type: String, required: true},
  challengeId: {
    type: Number,
    required: false
  },
  challengeUUID: {
    type: String,
    required: false
  },
  closed: {
    type: String,
    required: true,
    default: 'false'
  },
  username: {
    type: String,
    required: true
  },
  status: {
    type: String
  }
});

module.exports = schema;
