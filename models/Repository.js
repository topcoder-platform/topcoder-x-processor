/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
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
 * @typedef {Object} Repository
 * @property {String} id The unique identifier for the Repository entity.
 * @property {String} projectId The project ID associated with the repository.
 * @property {String} url The URL of the repository.
 * @property {String} archived Indicates whether the repository is archived or not.
 * @property {String} repoId The repository ID (if applicable).
 * @property {String} registeredWebhookId The ID of the registered webhook (if applicable).
 */

const schema = new Schema({
  id: {
    type: String,
    hashKey: true,
    required: true
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
  url: {
    type: String,
    required: true,
    index: {
      global: true,
      project: true,
      rangKey: 'archived',
      name: 'URLIndex'
    }
  },
  archived: {type: String, required: true},
  repoId: {type: String, required: false},
  registeredWebhookId: {type: String, required: false}
});

module.exports = schema;
