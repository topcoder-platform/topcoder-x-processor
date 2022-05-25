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
  TOPIC_NOTIFICATION: process.env.TOPIC_NOTIFICATION || 'notifications.action.create',
  KAFKA_OPTIONS: {
    connectionString: process.env.KAFKA_URL || 'localhost:9092',
    groupId: process.env.KAFKA_GROUP_ID || 'topcoder-x-processor',
    ssl: {
      cert: process.env.KAFKA_CLIENT_CERT || fs.readFileSync('./kafka_client.cer'), // eslint-disable-line no-sync
      key: process.env.KAFKA_CLIENT_CERT_KEY || fs.readFileSync('./kafka_client.key'), // eslint-disable-line no-sync
      passphrase: 'secret', // NOTE:* This configuration specifies the private key passphrase used while creating it.
    }
  },
  MAIL_NOTICIATION: {
    type: 'tcx.mail_notification',
    sendgridTemplateId: 'xxxxxx',
    subject: 'Topcoder X Alert'
  },
  NEW_CHALLENGE_TEMPLATE: process.env.NEW_CHALLENGE_TEMPLATE || {
    status: 'Draft'
  },

  // NOTE: if subTrack is FIRST_2_FINISH,
  // this config has no effect since the ***EndsAt will be set automatically by TC APIs
  NEW_CHALLENGE_DURATION_IN_DAYS: process.env.NEW_CHALLENGE_DURATION_IN_DAYS || 5,
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  TC_API_URL: process.env.TC_API_URL || 'https://api.topcoder-dev.com/v5',
  GITLAB_API_BASE_URL: process.env.GITLAB_API_BASE_URL || 'https://gitlab.com',
  ISSUE_LABEL_PREFIX: process.env.ISSUE_LABEL_PREFIX || 'tcx_',
  PAID_ISSUE_LABEL: process.env.PAID_ISSUE_LABEL || 'tcx_Paid',
  FIX_ACCEPTED_ISSUE_LABEL: process.env.FIX_ACCEPTED_ISSUE_LABEL || 'tcx_FixAccepted',
  READY_FOR_REVIEW_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_ReadyForReview',
  ASSIGNED_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_Assigned',
  OPEN_FOR_PICKUP_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_OpenForPickup',
  NOT_READY_ISSUE_LABEL: process.env.NOT_READY_ISSUE_LABEL || 'tcx_NotReady',
  CANCELED_ISSUE_LABEL: process.env.CANCELED_ISSUE_LABEL || 'tcx_Canceled',
  RETRY_COUNT: process.env.RETRY_COUNT || 2,
  RETRY_INTERVAL: process.env.RETRY_INTERVAL || 120000, // 2 minutes
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
  WEBSITE_SECURE: process.env.WEBSITE_SECURE || 'https://topcoderx.topcoder-dev.com',

  ROLE_ID_COPILOT: process.env.ROLE_ID_COPILOT || 'cfe12b3f-2a24-4639-9d8b-ec86726f76bd',
  ROLE_ID_ITERATIVE_REVIEWER: process.env.ROLE_ID_ITERATIVE_REVIEWER || 'f6df7212-b9d6-4193-bfb1-b383586fce63',  
  ROLE_ID_SUBMITTER: process.env.ROLE_ID_SUBMITTER || '732339e7-8e30-49d7-9198-cccf9451e221',
  TYPE_ID_TASK: process.env.TYPE_ID_TASK || 'ecd58c69-238f-43a4-a4bb-d172719b9f31',
  DEFAULT_TIMELINE_TEMPLATE_ID: process.env.DEFAULT_TIMELINE_TEMPLATE_ID || '53a307ce-b4b3-4d6f-b9a1-3741a58f77e6',
  DEFAULT_TRACK_ID: process.env.DEFAULT_TRACK_ID || '9b6fc876-f4d9-4ccb-9dfd-419247628825'
};
