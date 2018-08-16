/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
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
  GITLAB_REPO_URL: process.env.GITLAB_REPO_URL || '',
  TC_URL: process.env.TC_URL || 'https://www.topcoder-dev.com',
  TC_DEV_API_URL: process.env.TC_DEV_API_URL || 'https://api.topcoder-dev.com/v3',
  WAIT_TIME: process.env.WAIT_TIME || 60000
};

module.exports = Object.assign(defaultConfig, testConfig);
