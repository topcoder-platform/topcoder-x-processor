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
  PARTITION: process.env.PARTITION || 0,
  TOPIC: process.env.TOPIC || 'tc-x-events',
  KAFKA_OPTIONS: {
    connectionString: process.env.KAFKA_HOST || 'localhost:9092',
    ssl: {
      cert: process.env.KAFKA_CLIENT_CERT || fs.readFileSync('./kafka_client.cer'), // eslint-disable-line no-sync
      key: process.env.KAFKA_CLIENT_CERT_KEY || fs.readFileSync('./kafka_client.key'), // eslint-disable-line no-sync
      passphrase: 'secret', // NOTE:* This configuration specifies the private key passphrase used while creating it.
    }
  },
  MONGODB_URL: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/topcoderx',
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
  // node mailer option
  NODE_MAILER_OPTIONS: {
    host: process.env.SMTP_HOST || process.env.MAILGUN_SMTP_SERVER || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || process.env.MAILGUN_SMTP_POR || 465,
    secure: process.env.SMTP_IS_SECURE || true,
    auth: {
      user: process.env.SMTP_USERNAME || process.env.MAILGUN_SMTP_LOGIN || '',
      pass: process.env.SMTP_PASSWORD || process.env.MAILGUN_SMTP_PASSWORD || ''
    }
  },
  EMAIL_SENDER_ADDRESS: process.env.EMAIL_SENDER_ADDRESS || '',
  ISSUE_BID_EMAIL_RECEIVER: process.env.ISSUE_BID_EMAIL_RECEIVER || '',
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  GITLAB_API_BASE_URL: process.env.GITLAB_API_BASE_URL || 'https://gitlab.com',
  PAID_ISSUE_LABEL: process.env.PAID_ISSUE_LABEL || 'tcx_Paid',
  FIX_ACCEPTED_ISSUE_LABEL: process.env.FIX_ACCEPTED_ISSUE_LABEL || 'tcx_FixAccepted',
  READY_FOR_REVIEW_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_ReadyForReview',
  TC_OR_DETAIL_LINK: process.env.TC_OR_DETAIL_LINK || 'https://software.topcoder-dev.com/review/actions/ViewProjectDetails?pid=',
  RETRY_COUNT: process.env.RETRY_COUNT || 3,
  RETRY_INTERVAL: process.env.RETRY_INTERVAL || 120000, // 2 minutes
};
