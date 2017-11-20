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

const kafka = require('kafka-node');
const config = require('config');
const _ = require('lodash');
const IssueService = require('../services/IssueService');
const logger = require('./logger');

class Kafka {
  constructor() {
    this.client = new kafka.KafkaClient(config.KAFKA_OPTIONS);
    this.consumer = new kafka.Consumer(this.client, [{topic: config.TOPIC, partition: 0}], {autoCommit: true});
  }

  run() {
    this.consumer.on('message', (message) => {
      logger.info(`received message from kafka: ${message.value}`);

      // The event should be a JSON object
      let event;
      try {
        event = JSON.parse(message.value);
      } catch (err) {
        logger.error(`"message" is not a valid JSON-formatted string: ${err.message}`);
        return;
      }

      if (event && _.includes(['issue.created', 'issue.updated', 'comment.created', 'comment.updated', 'issue.assigned'], event.event)) {
        IssueService
          .process(event)
          .catch(logger.error);
      }
    });
  }
}

module.exports = new Kafka();
