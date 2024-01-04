/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */

/**
 * This module contains the winston logger configuration.
 *
 * @author TCSCODER
 * @version 1.0
 */
'use strict';
const util = require('util');
const config = require('config');
const _ = require('lodash');
const winston = require('winston');
const globalLog = require('global-request-logger');

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: config.LOG_LEVEL
    })
  ]
});

/**
 * Log error details with signature
 * @param {Error} err the error
 * @param {String} signature the signature
 */
logger.logFullError = function logFullError(err, signature) {
  if (!err || err.logged) {
    return;
  }
  logger.error(`Error happened in ${signature}\n${err.stack || err.message}`);
  err.logged = true;
};

/**
 * Remove invalid properties from the object and hide long arrays
 * @param {Object} obj the object
 * @returns {Object} the new object with removed properties
 * @private
 */
function sanitizeObject(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, (name, value) => {
      // Array of field names that should not be logged
      const removeFields = ['refreshToken', 'accessToken', 'access_token', 'authorization'];
      if (_.includes(removeFields, name)) {
        return '<removed>';
      }
      if (_.isArray(value) && value.length > 30) { // eslint-disable-line
        return `Array(${value.length}`;
      }
      return value;
    }));
  } catch (e) {
    return obj;
  }
}

/**
 * Decorate all functions of a service and log debug information if DEBUG is enabled
 * @param {Object} service the service
 */
logger.decorateWithLogging = function decorateWithLogging(service, isClass = false) {
  if (config.LOG_LEVEL !== 'debug') {
    return;
  }
  const forEachIteratee = (method, name, obj) => {
    obj[name] = async function serviceMethodWithLogging() {
      try {
        const result = await method.apply(this, arguments); // eslint-disable-line
        return result;
      } catch (e) {
        logger.logFullError(e, name);
        throw e;
      }
    };
  };
  if (isClass) {
    _.forEach(service.prototype, forEachIteratee);
  } else {
    _.forEach(service, forEachIteratee);
  }
};

/**
 * Apply logger and validation decorators
 * @param {Object} service the service to wrap
 * @param {Boolean} isClass whether the service is an ES6 class
 */
logger.buildService = function buildService(service, isClass = false) {
  logger.decorateWithLogging(service, isClass);
};

/**
 * Log with event context and issue.
 * @param {String} message the log message
 * @param {Object} event the event object
 * @param {Object} issue the issue object (optional)
 */
logger.debugWithContext = function debugWithContext(message, event, issue = null) {
  if (!event) {
    logger.debug(message);
    return;
  }
  let prefix = '';
  try {
    if (event.data.repository.repoUrl) {
      prefix += event.data.repository.repoUrl;
      if (issue) {
        prefix += ` Issue #${issue.number}`;
      }
    }
  } catch (error) {
    // Ignore error
  }
  logger.debug(`${prefix} ${message}`);
};

// globalLog.initialize();

// global any http success request interceptor
globalLog.on('success', (request, response) => {
  logger.debug('Request', util.inspect(sanitizeObject(request)));
  logger.debug('Response', util.inspect(sanitizeObject(response)));
});

// global any http error request interceptor
globalLog.on('error', (request, response) => {
  logger.error('Request', util.inspect(sanitizeObject(request)));
  logger.error('Response', util.inspect(sanitizeObject(response)));
});

module.exports = logger;
