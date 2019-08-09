/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

const kafka = require('./utils/kafka');
const logger = require('./utils/logger');

process.on('uncaughtException', (err) => {
  // Check if error related to Dynamodb conn
  if (err.code === 'NetworkingError' && err.region) {
    logger.error('DynamoDB connection failed.');
  }
  logger.logFullError(err, 'system');
});

// handle and log unhanled rejection
process.on('unhandledRejection', (err) => {
  logger.logFullError(err, 'system');
});

// run the server
kafka.run();
