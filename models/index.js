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
  region: config.DYNAMODB.AWS_REGION
});

if (config.DYNAMODB.IS_LOCAL === 'true') {
  dynamoose.local();
}

dynamoose.setDefaults({
  create: false,
  update: false
});

if (process.env.CREATE_DB) {
  dynamoose.setDefaults({
    create: true,
    update: true
  });
}

/* eslint-disable global-require */
const models = {
  Issue: dynamoose.model('Topcoder_X.Issue', require('./Issue')),
  Project: dynamoose.model('Topcoder_X.Project', require('./Project')),
  User: dynamoose.model('Topcoder_X.User', require('./User')),
  CopilotPayment: dynamoose.model('Topcoder_X.CopilotPayment', require('./CopilotPayment')),
  GithubUserMapping: dynamoose.model('Topcoder_X.GithubUserMapping', require('./GithubUserMapping')),
  GitlabUserMapping: dynamoose.model('Topcoder_X.GitlabUserMapping', require('./GitlabUserMapping')),
  Repository: dynamoose.model('Topcoder_X.Repository', require('./Repository'))
};
/* eslint-enable global-require */


module.exports = models;
