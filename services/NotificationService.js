/*
 * Copyright (c) 2022 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes incoming pure challenge events.
 *
 * @author TCSCODER
 * @version 1.0
 */
const Joi = require('joi');
const logger = require('../utils/logger');
const notification = require('../utils/notification');

/**
 * Send token expired notification
 * @param {Object} event the event
 */
async function handleTokenExpired(event) {
  try {
    const {copilotHandle, provider} = event.data;
    await notification.sendTokenExpiredAlert(copilotHandle, '', provider);
    logger.debug('Send token expired notification success');
  } catch (err) {
    logger.debug(`Send token expired notification failed. Internal Error: ${err}`);
  }
}

/**
 * Process notification event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  if (event.event === 'notification.tokenExpired') {
    await handleTokenExpired(event);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('notification.tokenExpired').required(),
  data: Joi.object().keys({
    copilotHandle: Joi.string().required(),
    provider: Joi.string().required()
  }).required(),
  retryCount: Joi.number().integer().default(0).optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
