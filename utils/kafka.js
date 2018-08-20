/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
/**
 * This module is the wrapper of the kafka consumer.
 *
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
'use strict';

const config = require('config');
const _ = require('lodash');
const kafka = require('no-kafka');
const IssueService = require('../services/IssueService');
const PaymentService = require('../services/PaymentService');
const logger = require('./logger');

class Kafka {
  constructor() {
    this.consumer = new kafka.SimpleConsumer(config.KAFKA_OPTIONS);

    this.producer = new kafka.Producer(config.KAFKA_OPTIONS);
    this.producer.init().then(() => {
      logger.info('kafka producer is ready.');
    }).catch((err) => {
      logger.error(`kafka producer is not connected. ${err.stack}`);
    });
  }

  messageHandler(messageSet) {
    logger.debug(` topics ======= ${JSON.stringify(messageSet)}`);
    messageSet.forEach((item) => {
      logger.debug(`received message from kafka: ${item.message.value.toString('utf8')}`);

      // The event should be a JSON object
      let event;
      try {
        event = JSON.parse(item.message.value.toString('utf8'));
        event = JSON.parse(event.payload.value);
      } catch (err) {
        logger.error(`"message" is not a valid JSON-formatted string: ${err.message}`);
        return;
      }

      if (event && _.includes(['issue.created', 'issue.updated', 'issue.closed',
        'comment.created', 'comment.updated', 'issue.assigned', 'issue.labelUpdated', 'issue.unassigned']
        , event.event)) {
        IssueService
          .process(event)
          .catch(logger.error);
      }
      if (event && _.includes(['payment.add', 'payment.update', 'payment.delete', 'payment.checkUpdates']
          , event.event)) {
        PaymentService
          .process(event)
          .catch(logger.error);
      }
    });
  }

  run() {
    this.consumer.init().then(() => {
      logger.info('kafka consumer is ready');
      this.consumer.subscribe(config.TOPIC, {}, this.messageHandler);
    }).catch((err) => {
      logger.error(`kafka consumer is not connected. ${err.stack}`);
    });
  }

  send(message) {
    const data = JSON.stringify({
      topic: config.TOPIC,
      originator: 'topcoder-x-processor',
      timestamp: (new Date()).toISOString(),
      'mime-type': 'application/json',
      payload: {
        value: message
      }
    });
    return this.producer.send({
      topic: config.TOPIC,
      message: {
        value: data
      }
    });
  }
}

module.exports = new Kafka();
