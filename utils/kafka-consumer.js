/**
 * Module wrapper for consume kafka topic.
 *
 * @author TCSCODER
 * @version 1.0
 */
'use strict';

const config = require('config');
const _ = require('lodash');

const healthcheck = require('topcoder-healthcheck-dropin');
const IssueService = require('../services/IssueService');
const CopilotPaymentService = require('../services/CopilotPaymentService');
const ChallengeService = require('../services/ChallengeService');
const logger = require('./logger');
const kafka = require('./kafka');

/**
 * Handle the message from kafka
 * @param {Object} messageSet object to handle
 */
function messageHandler(messageSet) {
  logger.debug(` topics ======= ${JSON.stringify(messageSet)}`);
  messageSet.forEach((item) => {
  // The event should be a JSON object
    let event;
    try {
      const message = JSON.parse(item.message.value.toString('utf8'));
      event = JSON.parse(message.payload.value);
      message.payload.value = event;
      logger.debug(`received message from kafka: ${JSON.stringify(_.omit(message, 'payload.value.data.issue.body'))}`);
    } catch (err) {
      logger.error(`"message" is not a valid JSON-formatted string: ${err.message}`);
      return;
    }

    if (event && _.includes(['issue.created', 'issue.updated', 'issue.closed', 'issue.recreated',
      'comment.created', 'comment.updated', 'issue.assigned', 'issue.labelUpdated', 'issue.unassigned']
    , event.event)) {
      IssueService
      .process(event)
      .catch(logger.error);
    }
    if (event && _.includes(['copilotPayment.add', 'copilotPayment.update', 'copilotPayment.delete', 'copilotPayment.checkUpdates']
      , event.event)) {
      CopilotPaymentService
      .process(event)
      .catch(logger.error);
    }
    if (event && _.includes(['challengeTags.update']
      , event.event)) {
      ChallengeService
      .process(event)
      .catch(logger.error);
    }
  });
}

/**
 * check if there is kafka connection alive
 * @returns {Boolean} true
 */
function check() {
  // if (!this.consumer.client.initialBrokers && !this.consumer.client.initialBrokers.length) {
  //   logger.info(`Brokers Exist Check Failed ${this.consumer.client.initialBrokers} ${this.consumer.client.initialBrokers.length}`)
  //   return false;
  // }
  // let connected = true;
  // this.consumer.client.initialBrokers.forEach((conn) => {
  //   logger.info(`Brokers Check Failed ${conn.connected}`)
  //   connected = conn.connected && connected;
  // });

  // return connected;
  return true;
}

/**
 * run the consumer
 */
function run() {
  kafka.consumer.init().then(() => {
    logger.info('kafka consumer is ready');
    healthcheck.init([check]);
    kafka.consumer.subscribe(config.TOPIC, {}, messageHandler);
  }).catch((err) => {
    logger.error(`kafka consumer is not connected. ${err.stack}`);
  });
}

module.exports = {run};
