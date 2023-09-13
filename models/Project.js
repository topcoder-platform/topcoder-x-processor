/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Schema for project and repository mapping.
 * @author TCSCODER
 * @version 1.0
 */
const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} ProjectChallengeMapping
 * @property {String} id The id.
 * @property {String} title The title.
 * @property {Number} tcDirectId The tc direct id.
 * @property {String} tags The tags.
 * @property {String} rocketChatWebhook The rocket chat webhook.
 * @property {String} rocketChatChannelName The rocket chat channel name.
 * @property {String} archived The archived.
 * @property {String} owner The owner.
 * @property {String} secretWebhookKey The secret webhook key.
 * @property {String} copilot The copilot.
 * @property {Date} updatedAt The updated at.
 * @property {String} createCopilotPayments The create copilot payments.
 * @property {Boolean} isConnect Is Topcoder connect.
 */

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
  },
  title: {type: String, required: true},
  tcDirectId: {
    type: Number,
    required: true
  },
  tags: {
    type: String,
    required: true,
    default: ''
  },
  rocketChatWebhook: {type: String, required: false},
  rocketChatChannelName: {type: String, required: false},
  archived: {type: String, required: true},
  owner: {type: String, required: true},
  secretWebhookKey: {type: String, required: true},
  copilot: {type: String, required: false},
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createCopilotPayments: {type: String, required: false},
  isConnect: {type: Boolean, required: false, default: true}
});

module.exports = schema;
