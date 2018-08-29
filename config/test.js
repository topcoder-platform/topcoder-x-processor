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
  MAX_RETRY_COUNT: process.env.MAX_RETRY_COUNT || 25,
  WAIT_TIME: process.env.WAIT_TIME || 30000,
  TC_DIRECT_ID: process.env.TC_DIRECT_ID || 7377,
  TOPCODER_USER_NAME: process.env.TOPCODER_USER_NAME || 'mess',
  HOOK_BASE_URL: process.env.HOOK_BASE_URL || '',
  GITHUB_ACCESS_TOKEN: process.env.GITHUB_ACCESS_TOKEN || '',
  GITHUB_REPOSITORY_NAME: process.env.GITHUB_REPOSITORY_NAME || '',
  GITLAB_USERNAME: process.env.GITLAB_USERNAME || '',
  GITLAB_PASSWORD: process.env.GITLAB_PASSWORD || '',
  GITLAB_REPOSITORY_NAME: process.env.GITLAB_REPOSITORY_NAME || '',
};

module.exports = Object.assign(defaultConfig, testConfig);
