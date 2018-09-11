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

module.exports = {
  prepareAutomatedComment
};

