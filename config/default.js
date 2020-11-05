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
    connectionString: process.env.KAFKA_URL || 'localhost:9092',
    groupId: process.env.KAFKA_GROUP_ID || 'topcoder-x-processor',
    ssl: {
      cert: process.env.KAFKA_CLIENT_CERT || fs.readFileSync('./kafka_client.cer'), // eslint-disable-line no-sync
      key: process.env.KAFKA_CLIENT_CERT_KEY || fs.readFileSync('./kafka_client.key'), // eslint-disable-line no-sync
      passphrase: 'secret', // NOTE:* This configuration specifies the private key passphrase used while creating it.
    }
  },
  TC_DEV_ENV: process.env.NODE_ENV === 'production' ? false : true,
  TC_AUTHN_URL: process.env.TC_AUTHN_URL || 'https://topcoder-dev.auth0.com/oauth/ro',
  TC_AUTHZ_URL: process.env.TC_AUTHZ_URL || 'https://api.topcoder-dev.com/v3/authorizations',
  TC_DIRECT_ID: 7377,
  NEW_CHALLENGE_TEMPLATE: process.env.NEW_CHALLENGE_TEMPLATE || {
    status: 'Draft'
  },

  // NOTE: if subTrack is FIRST_2_FINISH,
  // this config has no effect since the ***EndsAt will be set automatically by TC APIs
  NEW_CHALLENGE_DURATION_IN_DAYS: process.env.NEW_CHALLENGE_DURATION_IN_DAYS || 5,
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  TC_API_URL: process.env.TC_API_URL || 'https://api.topcoder-dev.com/v5',
  TC_API_URL_V3: process.env.TC_API_URL || 'https://api.topcoder-dev.com/v3',
  GITLAB_API_BASE_URL: process.env.GITLAB_API_BASE_URL || 'https://gitlab.com',
  ISSUE_LABEL_PREFIX: process.env.ISSUE_LABEL_PREFIX || 'tcx_',
  PAID_ISSUE_LABEL: process.env.PAID_ISSUE_LABEL || 'tcx_Paid',
  FIX_ACCEPTED_ISSUE_LABEL: process.env.FIX_ACCEPTED_ISSUE_LABEL || 'tcx_FixAccepted',
  READY_FOR_REVIEW_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_ReadyForReview',
  ASSIGNED_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_Assigned',
  OPEN_FOR_PICKUP_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_OpenForPickup',
  NOT_READY_ISSUE_LABEL: process.env.NOT_READY_ISSUE_LABEL || 'tcx_NotReady',
  CANCELED_ISSUE_LABEL: process.env.CANCELED_ISSUE_LABEL || 'tcx_Canceled',
  TC_OR_DETAIL_LINK: process.env.TC_OR_DETAIL_LINK || 'https://software.topcoder-dev.com/review/actions/ViewProjectDetails?pid=',
  RETRY_COUNT: process.env.RETRY_COUNT || 2,
  RETRY_INTERVAL: process.env.RETRY_INTERVAL || 120000, // 2 minutes
  CANCEL_CHALLENGE_INTERVAL: process.env.CANCEL_CHALLENGE_INTERVAL || 24 * 60 * 60 * 1000, // 24 Hours
  DYNAMODB: {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    IS_LOCAL: process.env.IS_LOCAL
  },
  // Configuration for m2m token generation
  AUTH0_URL: process.env.AUTH0_URL, // Auth0 credentials for Submission Service
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
  TOKEN_CACHE_TIME: process.env.TOKEN_CACHE_TIME || 43200,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  AUTH0_PROXY_SERVER_URL: process.env.AUTH0_PROXY_SERVER_URL,
  GRANT_TYPE: 'client_credentials',

  // used as base to construct various URLs
  WEBSITE: process.env.WEBSITE || 'http://topcoderx.topcoder-dev.com',
  WEBSITE_SECURE: process.env.WEBSITE_SECURE || 'https://topcoderx.topcoder-dev.com',

  ROLE_ID_COPILOT: process.env.ROLE_ID_COPILOT || 'cfe12b3f-2a24-4639-9d8b-ec86726f76bd',
  ROLE_ID_SUBMITTER: process.env.ROLE_ID_SUBMITTER || '732339e7-8e30-49d7-9198-cccf9451e221',
  TYPE_ID_FIRST2FINISH: process.env.TYPE_ID_FIRST2FINISH || '927abff4-7af9-4145-8ba1-577c16e64e2e',
  DEFAULT_TIMELINE_TEMPLATE_ID: process.env.DEFAULT_TIMELINE_TEMPLATE_ID || '7ebf1c69-f62f-4d3a-bdfb-fe9ddb56861c',
  DEFAULT_TRACK_ID : process.env.DEFAULT_TIMELINE_TEMPLATE_ID || '9b6fc876-f4d9-4ccb-9dfd-419247628825'
};
