/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */

/**
 * This module contains the helper methods.
 *
 * @author veshu
 * @version 1.0
 */
'use strict';
const uuid = require('uuid/v4');

/**
 * prepares the comment body with automated footer note
 * @param {String} body the body text
 * @param {Object} copilot the copilot
 * @returns {String} the comment body with automated note
 */
function prepareAutomatedComment(body, copilot) {
  body += '<br/><br/>';
  body += '```This is an automated message for ' + copilot.topcoderUsername + ' via Topcoder X```'; // eslint-disable-line
  return body;
}

/**
 * Generate an unique identifier
 *
 * @returns {String} the generated id
 */
function generateIdentifier() {
  return `${uuid()}-${new Date().getTime()}`;
}

/**
 * Generate simple hash of string
 *
 * @param {String} s the str
 * @returns {String} the hash
 */
function hashCode(s) {
  return s.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0); // eslint-disable-line no-bitwise, no-magic-numbers
    return a & a; // eslint-disable-line no-bitwise
  }, 0);
}

module.exports = {
  prepareAutomatedComment,
  generateIdentifier,
  hashCode
};

