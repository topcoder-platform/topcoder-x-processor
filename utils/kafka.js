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
const healthcheck = require('topcoder-healthcheck-dropin');
const IssueService = require('../services/IssueService');
const CopilotPaymentService = require('../services/CopilotPaymentService');
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
    this.check = this.check.bind(this);
  }

  messageHandler(messageSet) {
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
    });
  }

  // check if there is kafka connection alive
  check() {
    if (!this.consumer.client.initialBrokers && !this.consumer.client.initialBrokers.length) {
      logger.info(`Brokers Exist Check Failed ${this.consumer.client.initialBrokers} ${this.consumer.client.initialBrokers.length}`)
      return false;
    }
    let connected = true;
    this.consumer.client.initialBrokers.forEach((conn) => {
      logger.info(`Brokers Check Failed ${conn.connected}`)
      connected = conn.connected && connected;
    });

    return connected;
  }

  run() {
    this.consumer.init().then(() => {
      logger.info('kafka consumer is ready');
      healthcheck.init([this.check]);
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
