/**
 * Module wrapper for sending messages to kafka.
 *
 * @author TCSCODER
 * @version 1.0
 */
'use strict';

const config = require('config');
const kafka = require('./kafka');

/**
 * Send message to general topic in kafka.
 * @param {String} message the message to send
 * @returns {Object} Result from kafka
 */
function send(message) {
  const data = JSON.stringify({
    topic: config.TOPIC,
    originator: 'topcoder-x-processor',
    timestamp: (new Date()).toISOString(),
    'mime-type': 'application/json',
    payload: {
      value: message
    }
  });
  return kafka.producer.send({
    topic: config.TOPIC,
    message: {
      value: data
    }
  });
}

/**
 * Send message to notification topic in kafka.
 * @param {String} notification the message to send
 * @returns {Object} Result from kafka
 */
function sendNotification(notification) {
  const data = JSON.stringify({
    topic: config.TOPIC_NOTIFICATION,
    originator: 'topcoder-x-processor',
    timestamp: (new Date()).toISOString(),
    'mime-type': 'application/json',
    payload: {
      notifications: [notification]
    }
  });
  return kafka.producer.send({
    topic: config.TOPIC_NOTIFICATION,
    message: {
      value: data
    }
  });
}

module.exports = {
  send,
  sendNotification
};
