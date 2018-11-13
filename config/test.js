/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';
/**
 * This module is the test configuration of the app.
 * @author TCSCODER
 * @version 1.1
 */
/* eslint-disable */
const defaultConfig = require('./default');

const testConfig = {
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  TC_DEV_API_URL: process.env.TC_DEV_API_URL || 'https://api.topcoder-dev.com/v3',
  MAX_RETRY_COUNT: process.env.MAX_RETRY_COUNT || 17,
  WAIT_TIME: process.env.WAIT_TIME || 60000,
  TC_DIRECT_ID: process.env.TC_DIRECT_ID || 7377,
  TOPCODER_USER_NAME: process.env.TOPCODER_USER_NAME || 'mess',
  HOOK_BASE_URL: process.env.HOOK_BASE_URL || '',
  GITHUB_ACCESS_TOKEN: process.env.GITHUB_ACCESS_TOKEN || '',
  GITHUB_REPOSITORY_NAME: process.env.GITHUB_REPOSITORY_NAME || '',
  GITLAB_USERNAME: process.env.GITLAB_USERNAME || '',
  GITLAB_PASSWORD: process.env.GITLAB_PASSWORD || '',
  GITLAB_REPOSITORY_NAME: process.env.GITLAB_REPOSITORY_NAME || 'test-unit',
  GITLAB_REPO_URL: process.env.GITLAB_REPO_URL || 'https://gitlab.com/nauhil/test-unit',
  LABELS: process.env.LABELS || [{ name: 'tcx_OpenForPickup', color: '428BCA' }, { name: 'tcx_Assigned', color: '004E00' }, { name: 'tcx_ReadyForReview', color: 'D1D100' }, { name: 'tcx_Paid', color: '7F8C8D' }, { name: 'tcx_Feedback', color: 'FF0000' }, { name: 'tcx_FixAccepted', color: '69D100' },
    {name:'tcx_NotReady', color: '000000'}],
  READY_FOR_REVIEW_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_ReadyForReview',
  ASSIGNED_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_Assigned',
  OPEN_FOR_PICKUP_ISSUE_LABEL: process.env.READY_FOR_REVIEW_ISSUE_LABEL || 'tcx_OpenForPickup',
  FIX_ACCEPTED_ISSUE_LABEL: process.env.FIX_ACCEPTED_ISSUE_LABEL || 'tcx_FixAccepted',
};

module.exports = Object.assign(defaultConfig, testConfig);
