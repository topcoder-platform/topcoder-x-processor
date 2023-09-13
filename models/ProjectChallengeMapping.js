/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This defines TCX project to TC challenge mapping model.
 */
const dynamoose = require('dynamoose');

const Schema = dynamoose.Schema;

/**
 * @typedef {Object} ProjectChallengeMapping
 * @property {String} id the id
 * @property {String} projectId the project id
 * @property {String} challengeId the challenge id
 */

const schema = new Schema({
  id: {
    type: String,
    required: true,
    hashKey: true
  },
  projectId: {
    type: String,
    required: true,
    index: {
      global: true,
      project: true,
      name: 'ProjectIdIndex'
    }
  },
  challengeId: {
    type: String,
    required: true
  }
});

module.exports = schema;
