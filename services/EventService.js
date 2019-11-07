/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes event retry
 * @author TCSCODER
 * @version 1.1
 */
const config = require('config');
const _ = require('lodash');
const logger = require('../utils/logger');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const gitHubService = require('./GithubService');
const gitlabService = require('./GitlabService');

const timeoutMapper = {};

/**
 * re opens the issue
 * @param {Object} event the event
 * @param {Object} issue the issue
 */
async function reOpenIssue(event, issue) {
  if (event.provider === 'github') {
    await gitHubService.changeState(event.copilot, event.data.repository.full_name, issue.number, 'open');
  } else {
    await gitlabService.changeState(event.copilot, event.data.repository.id, issue.number, 'reopen');
  }
}

/**
 * handles the event gracefully when there is error processing the event
 * @param {Object} event the event
 * @param {Object} data the issue data or the copilot payment data
 * @param {Object} err the error
 */
async function handleEventGracefully(event, data, err) {
  if (err.errorAt === 'topcoder' || err.errorAt === 'processor') {
    event.retryCount = _.toInteger(event.retryCount);
    let keyName = '';
    if (event.provider === 'copilotPayment') {
      keyName = `${event.provider}-${event.data.payment._id}-${event.data.payment.description}-${event.data.payment.amount}`;
    } else {
      keyName = `${event.provider}-${event.data.repository.id}-${event.data.issue.number}`;
    }
    timeoutMapper[keyName] = timeoutMapper[keyName] ? timeoutMapper[keyName] : [];
    // reschedule event
    if (event.retryCount < config.RETRY_COUNT) {
      logger.debug('Scheduling event for next retry');
      const newEvent = {...event};
      newEvent.retryCount += 1;
      delete newEvent.copilot;
      const timeoutKey = setTimeout(async () => {
        const kafka = require('../utils/kafka'); // eslint-disable-line
        await kafka.send(JSON.stringify(newEvent));
        logger.debug('The event is scheduled for retry');
      }, config.RETRY_INTERVAL);
      timeoutMapper[keyName].push(timeoutKey);
    }

    if (event.retryCount === config.RETRY_COUNT) {
      // Clear out the kafka queue of any queued messages (assignment, label changes, etc...)
      const timeoutsToClear = timeoutMapper[keyName];
      for (let i = 0; i < timeoutsToClear.length; i++) {  // eslint-disable-line no-restricted-syntax
        clearTimeout(timeoutsToClear[i]);
      }
      let comment = `[${err.statusCode}]: ${err.message}`;
      if (event.event === 'issue.closed') {
        if (event.paymentSuccessful !== undefined && event.paymentSuccessful === false) { // eslint-disable-line no-undefined
          comment = `Payment failed: ${comment}`;
        }

        if (event.cancelSuccessful !== undefined && event.cancelSuccessful === false) { // eslint-disable-line no-undefined
          comment = `The challenge cancel failed: ${comment}`;
        }
      } else if (event.event === 'issue.created') {
        // comment for challenge creation failed
        comment = 'The challenge creation on the Topcoder platform failed.  Please contact support to try again';
      } else if (event.event === 'copilotPayment.add') {
        // comment for copilot payment challenge create failed
        comment = 'The copilot payment challenge creation on the Topcoder platform failed.  Please contact support to try again';
        await dbHelper.remove(models.CopilotPayment, {
          id: {eq: data.id}
        });
        // we dont need to put comment for copilot payment
        return;
      }
      // notify error in git host
      if (event.provider === 'github') {
        await gitHubService.createComment(event.copilot, event.data.repository.full_name, data.number, comment);
      } else {
        await gitlabService.createComment(event.copilot, event.data.repository.id, data.number, comment);
      }

      if (event.event === 'issue.closed') {
        // reopen
        await reOpenIssue(event, data);
        // ensure label is ready for review
        const readyForReviewLabels = [config.READY_FOR_REVIEW_ISSUE_LABEL];
        if (event.provider === 'github') {
          await gitHubService.addLabels(event.copilot, event.data.repository.full_name, data.number, readyForReviewLabels);
        } else {
          await gitlabService.addLabels(event.copilot, event.data.repository.id, data.number, readyForReviewLabels);
        }
      }
    }
  }
  throw err;
}

module.exports = {
  handleEventGracefully,
  reOpenIssue
};

logger.buildService(module.exports);
