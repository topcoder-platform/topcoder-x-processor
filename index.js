/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

const config = require('config');
const _ = require('lodash');
const kafkaConsumer = require('./utils/kafka-consumer');
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

// dump the configuration to logger
const ignoreConfigLog = ['cert', 'key', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'];
/**
 * Print configs to logger
 * @param {Object} params the config params
 * @param {Number} level the level of param object
 */
function dumpConfigs(params, level) {
  Object.keys(params).forEach((key) => {
    if (_.includes(ignoreConfigLog, key)) {
      return;
    }
    const item = params[key];
    let str = '';
    let n = 0;
    while (n < level) { // eslint-disable-line no-restricted-syntax
      n++;
      str += '  ';
    }
    if (item && _.isObject(item)) {
      str += `${key}=`;
      logger.debug(str);
      dumpConfigs(item, level + 1);
    } else {
      str += `${key}=${item}`;
      logger.debug(str);
    }
  });
}
logger.debug('--- List of Configurations ---');
dumpConfigs(config, 0);
logger.debug('--- End of List of Configurations ---');

// run the server
kafkaConsumer.run();
