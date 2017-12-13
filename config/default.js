/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

const fs = require('fs');

/**
 * This module is the configuration of the app.
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
/* eslint-disable */

module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  TOPIC: process.env.TOPIC || 'events_topic',
  KAFKA_OPTIONS: {
    partition: process.env.KAFKA_PARTITION || 0,
    kafkaHost: process.env.KAFKA_HOST || 'localhost:9092',
    sslOptions: {
      cert: process.env.KAFKA_CLIENT_CERT || fs.readFileSync('./kafka_client.cer'),
      key: process.env.KAFKA_CLIENT_CERT_KEY || fs.readFileSync('./kafka_client.key')
   }
  },
  MONGODB_URL: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/events',
  TC_DEV_ENV: process.env.NODE_ENV === 'production' ? false : true,
  TC_AUTHN_URL: process.env.TC_AUTHN_URL || 'https://topcoder-dev.auth0.com/oauth/ro',
  TC_AUTHN_REQUEST_BODY: {
    username: process.env.TC_USERNAME || 'mess',
    password: process.env.TC_PASSWORD || 'appirio123',
    client_id: process.env.TC_CLIENT_ID || 'JFDo7HMkf0q2CkVFHojy3zHWafziprhT',
    sso: false,
    scope: 'openid profile offline_access',
    response_type: 'token',
    connection: process.env.CLIENT_V2CONNECTION || 'TC-User-Database',
    grant_type: 'password',
    device: 'Browser'
  },
  TC_AUTHZ_URL: process.env.TC_AUTHZ_URL || 'https://api.topcoder-dev.com/v3/authorizations',
  NEW_CHALLENGE_TEMPLATE: process.env.NEW_CHALLENGE_TEMPLATE || {
    milestoneId: 1,
    subTrack: 'FIRST_2_FINISH',
    reviewType: 'COMMUNITY',
    technologies: [],
    platforms: [],
    finalDeliverableTypes: [],
    confidentialityType: 'PUBLIC',
    submissionGuidelines: 'Upload the updated code to TopCoder',

    // From here, the properties will be set by the processor.
    // Just leave them here for readability
    name: null,
    projectId: null,
    registrationStartDate: null,
    registrationStartsAt: null,

    // NOTE: if subTrack is FIRST_2_FINISH,
    // the ***EndsAt will be set automatically by TC APIs
    registrationEndsAt: null,
    submissionEndsAt: null,
    detailedRequirements: null,
    prizes: null
  },

  // NOTE: if subTrack is FIRST_2_FINISH,
  // this config has no effect since the ***EndsAt will be set automatically by TC APIs
  NEW_CHALLENGE_DURATION_IN_DAYS: process.env.NEW_CHALLENGE_DURATION_IN_DAYS || 5,
  GITHUB_ADMIN_TOKEN: process.env.GITHUB_ADMIN_TOKEN || '',
  // node mailer option
  NODE_MAILER_OPTIONS: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 465,
    secure: process.env.SMTP_IS_SECURE || true,
    auth: {
      user: process.env.SMTP_USERNAME || '',
      pass: process.env.SMTP_PASSWORD || ''
    }
  },
  EMAIL_SENDER_ADDRESS: process.env.EMAIL_SENDER_ADDRESS || '',
  ISSUE_BID_EMAIL_RECEIVER: process.env.ISSUE_BID_EMAIL_RECEIVER || '',
  TC_RAGNAR_USER_MAPPING_URL: process.env.TC_RAGNAR_LOGIN_URL || 'http://localhost:3001/api/v1/admin/tcuser',
  TC_RAGNAR_ADMIN_LOGIN_BODY: {
    username: "admin",
    password: "password"
  },
  TC_RAGNAR_LOGIN_URL: process.env.TC_RAGNAR_LOGIN_URL || 'http://localhost:3001/api/v1/admin/login'
};
