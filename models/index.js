/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Initialize and export all model schemas.
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
const config = require('config');
const dynamoose = require('dynamoose');

dynamoose.AWS.config.update({
  accessKeyId: config.DYNAMODB.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.DYNAMODB.AWS_SECRET_ACCESS_KEY,
  region: config.DYNAMODB.AWS_REGION
});

if (config.DYNAMODB.IS_LOCAL) {
  dynamoose.local();
}

dynamoose.setDefaults({
  create: false,
  update: false
});

/* eslint-disable global-require */
const models = {
  Issue: dynamoose.model('Issue', require('./Issue')),
  Project: dynamoose.model('Project', require('./Project')),
  User: dynamoose.model('User', require('./User')),
  UserMapping: dynamoose.model('UserMapping', require('./UserMapping')),
  CopilotPayment: dynamoose.model('CopilotPayment', require('./CopilotPayment'))
};
/* eslint-enable global-require */


module.exports = models;
