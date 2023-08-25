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
const PrivateForkService = require('../services/PrivateForkService');
const NotificationService = require('../services/NotificationService');
const logger = require('./logger');
const kafka = require('./kafka');

/**
 * Parses the raw payload from a Kafka message
 * @param {import('no-kafka').Message} event the message
 * @returns {import('no-kafka').Message}
 */
function parsePayload(event) {
  try {
    const _message = JSON.parse(event.message.value.toString('utf8'));
    event.message.value = _message;
    logger.debug(`Decoded message from kafka: ${JSON.stringify(_.omit(event, 'payload.value.data.issue.body'))}`);
    return event;
  } catch (err) {
    logger.error('"message" is not a valid JSON-formatted string.', err);
    return null;
  }
}

/**
 * Handle the messages published to Topcoder-X topic of kafka
 * @param {import('no-kafka').Message[]} messageSet the message set
 */
function tcxMessageHandler(messageSet, topic) {
  logger.debug('Incoming message', {messageSet, topic});
  messageSet.forEach((event) => {
    // The event should be a JSON object
    event = parsePayload(event);
    try {
      event.message.value.payload.value = JSON.parse(event.message.value.payload.value);
    } catch (e) {
      logger.error('Invalid message payload', e);
      return;
    }
    const payload = event.message.value.payload.value;
    logger.debug(`[kafka-consumer#tcxMessageHandler] Decoded Payload  ${JSON.stringify(payload)}`);
    if (_.includes(['issue.created', 'issue.updated', 'issue.closed', 'issue.recreated',
      'comment.created', 'comment.updated', 'issue.assigned', 'issue.labelUpdated', 'issue.unassigned'], payload.event)) {
      IssueService
        .process(payload)
        .catch(logger.error);
    }
    if (_.includes(['copilotPayment.add', 'copilotPayment.update', 'copilotPayment.delete', 'copilotPayment.checkUpdates']
      , payload.event)) {
      CopilotPaymentService
        .process(payload)
        .catch(logger.error);
    }
    if (_.includes(['challengeTags.update']
      , payload.event)) {
      ChallengeService
        .process(payload)
        .catch(logger.error);
    }
    if (_.includes(['notification.tokenExpired']
      , payload.event)) {
      NotificationService
        .process(payload)
        .catch(logger.error);
    }
  });
}

/**
 * Handle the message published to Challenge-Action-Resource-Created topic of Kafka
 * @param {import('no-kafka').Message[]} messageSet the message set
 */
function challengeResourceCreationHandler(messageSet, topic) {
  logger.debug('Incoming message', {messageSet, topic});
  messageSet.forEach((event) => {
    event = parsePayload(event);
    const payload = event.message.value.payload;
    logger.debug(`[kafka-consumer#challengeResourceCreationHandler] Decoded Payload  ${JSON.stringify(payload)}`);
    PrivateForkService.process(payload);
  });
}

/**
 * run the consumer
 */
function run() {
  kafka.consumer.init().then(() => {
    logger.info('kafka consumer is ready');
    healthcheck.init();
    kafka.consumer.subscribe(config.TOPIC, {}, tcxMessageHandler);
    kafka.consumer.subscribe(config.TOPIC_CHALLENGE_ACTION_RESOURCE_CREATE, {}, challengeResourceCreationHandler);
  }).catch((err) => {
    logger.error(`kafka consumer is not connected. ${err.stack}`);
  });
}

module.exports = {run};
