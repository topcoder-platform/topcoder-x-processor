/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */

/**
 * This module contains the winston logger to file
 *
 * @author TCSCODER
 * @version 1.0
 */
'use strict';
const fs = require('fs-extra');
const winston = require('winston');
const moment = require('moment');

const logPath = './logs';
fs.ensureDir(logPath);

const logger = new winston.Logger({
  transports: [
    new winston.transports.File({
      filename: `./logs/topcoder-api-${moment().format('YYYY-MM-DD')}-logs.log`,
      maxsize: 1024 * 1024 * 10, // eslint-disable-line no-magic-numbers
      handleExceptions: true,
      json: false
    })
  ],
  exitOnError: false
});

module.exports = logger;
