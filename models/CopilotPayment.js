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

/**
 * @typedef {Object} CopilotPayment
 * @property {String} id The unique identifier for the CopilotPayment entity.
 * @property {String} project The project associated with the payment.
 * @property {Number} amount The payment amount.
 * @property {String} description The description of the payment.
 * @property {Number} challengeId The ID of the associated challenge (if applicable).
 * @property {String} challengeUUID The UUID of the associated challenge (if applicable).
 * @property {String} closed Indicates whether the payment is closed or not (default is 'false').
 * @property {String} username The username of the Copilot receiving the payment.
 * @property {String} status The status of the payment.
 */

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
