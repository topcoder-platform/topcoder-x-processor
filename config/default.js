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
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  GITLAB_API_BASE_URL: process.env.GITLAB_API_BASE_URL || 'https://gitlab.com',
  AZURE_API_BASE_URL: process.env.AZURE_API_BASE_URL || 'https://app.vssps.visualstudio.com',
  AZURE_DEVOPS_API_BASE_URL: process.env.AZURE_DEVOPS_API_BASE_URL || 'https://dev.azure.com',
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

  AZURE_ACCESS_TOKEN_DEFAULT_EXPIRATION: 3600 * 24 * 14,
  AZURE_REFRESH_TOKEN_BEFORE_EXPIRATION: 300,
  AZURE_OWNER_CALLBACK_URL: '/api/v1/azure/owneruser/callback',
  AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,

  // used as base to construct various URLs
  WEBSITE: process.env.WEBSITE || 'http://topcoderx.topcoder-dev.com',
  WEBSITE_SECURE: process.env.WEBSITE_SECURE || 'https://topcoderx.topcoder-dev.com',

};
