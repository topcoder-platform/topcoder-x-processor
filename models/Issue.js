/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Schema for Issue.
 * @author TCSCODER
 * @version 1.0
 */
const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} Issue
 * @property {String} id The id.
 * @property {Number} number From the receiver service.
 * @property {String} title The title.
 * @property {String} body The body.
 * @property {Number[]} prizes Prizes extracted from title.
 * @property {String} provider Provider (github or gitlab).
 * @property {Number} repositoryId Repository ID.
 * @property {String} repoUrl Repository URL.
 * @property {String} repositoryIdStr Repository ID as a String.
 * @property {Array} labels Labels associated with the issue.
 * @property {String} assignee Assignee for the issue.
 * @property {Date} updatedAt Date when the issue was last updated.
 * @property {Number} challengeId Challenge ID from topcoder API.
 * @property {String} challengeUUID Challenge UUID.
 * @property {String} projectId Project ID.
 * @property {String} status Status of the issue.
 * @property {Date} assignedAt Date when the issue was assigned (if applicable).
 */

const schema = new Schema({
  id: {type: String, hashKey: true, required: true},
  // From the receiver service
  number: {
    type: Number,
    required: true
  },
  title: {type: String, required: true},
  body: {type: String},
  prizes: {type: [Number], required: true}, // extracted from title
  provider: {
    type: String,
    required: true
  }, // github or gitlab
  repositoryId: {
    type: Number,
    required: true,
    index: {
      global: true,
      rangeKey: 'number',
      project: true,
      name: 'RepositoryIdIndex'
    }
  },
  repoUrl: {
    type: String
  },
  repositoryIdStr: {type: String, required: false},
  labels: {
    type: Array,
    required: false
  },
  assignee: {type: String, required: false},
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // From topcoder api
  challengeId: {type: Number, required: false},
  challengeUUID: {type: String, required: false},
  projectId: {type: String},
  status: {type: String},
  assignedAt: {type: Date, required: false}
});

module.exports = schema;
