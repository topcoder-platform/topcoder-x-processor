/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */

/**
 * Define errors.
 *
 * @author veshu
 * @version 1.0
 */
'use strict';

const _ = require('lodash');
const constants = require('../constants');
const notification = require('./notification');

// the error class wrapper
class ProcessorError extends Error {
  constructor(statusCode, message, errorAt) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorAt = errorAt;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errors = {};

/**
* Handle github api error. Return converted error.
* @param {Error} err the github api error
* @param {String} message the error message
* @param {String} copilotHandle the handle name of the copilot
* @param {String} repoPath the link to related github page
* @returns {Error} converted error
*/
errors.handleGitHubError = function handleGitHubError(err, message, copilotHandle, repoPath) {
  if (err.statusCode === 401 && copilotHandle && repoPath) { // eslint-disable-line no-magic-numbers
    notification.sendTokenExpiredAlert(copilotHandle, repoPath, 'Github');
  }
  let resMsg = `${message}. ${err.message}.`;
  const detail = _.get(err, 'response.body.message');
  if (detail) {
    resMsg += ` Detail: ${detail}`;
  }
  const apiError = new ProcessorError(
    _.get(err, 'response.status', constants.SERVICE_ERROR_STATUS),
    resMsg,
    'github'
  );
  return apiError;
};

/**
 * Handle gitlab api error. Return converted error.
 * @param {Error} err the gitlab api error
 * @param {String} message the error message
* @param {String} copilotHandle the handle name of the copilot
* @param {String} repoPath the link to related gitlab page
 * @returns {Error} converted error
 */
errors.handleGitLabError = function handleGitLabError(err, message, copilotHandle, repoPath) {
  if (err.statusCode === 401 && copilotHandle && repoPath) { // eslint-disable-line no-magic-numbers
    notification.sendTokenExpiredAlert(copilotHandle, repoPath, 'Gitlab');
  }
  let resMsg = `${message}. ${err.message}.`;
  const detail = _.get(err, 'response.body.message');
  if (detail) {
    resMsg += ` Detail: ${detail}`;
  }
  const apiError = new ProcessorError(
    err.status || _.get(err, 'response.status', constants.SERVICE_ERROR_STATUS),
    resMsg,
    'gitlab'
  );
  return apiError;
};

/**
 * Convert topcoder api error.
 * @param {Error} err the topcoder api error
 * @param {String} message the error message
 * @returns {Error} converted error
 */
errors.convertTopcoderApiError = function convertTopcoderApiError(err, message) {
  let resMsg = `${message}`;
  const detail = _.get(err, 'response.data.message');
  if (detail) {
    resMsg += ` Detail: ${detail}`;
  }
  const apiError = new ProcessorError(
    err.response.status || _.get(err, 'response.body.result.status', constants.SERVICE_ERROR_STATUS),
    resMsg,
    'topcoder'
  );
  return apiError;
};

/**
 * Convert internal error which needs to be handle gracefully.
 * @param {String} message the error message
 * @returns {Error} converted error
 */
errors.internalDependencyError = function internalDependencyError(message) {
  const resMsg = `${message}`;
  const apiError = new ProcessorError(
    constants.SERVICE_ERROR_STATUS,
    resMsg,
    'processor'
  );
  return apiError;
};

module.exports = errors;
