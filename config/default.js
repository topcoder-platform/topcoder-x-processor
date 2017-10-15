/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */

'use strict';
/**
 * This module is the configuration of the app.
 *
 * @author TCSCODER
 * @version 1.0
 */
module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  TOPIC: process.env.TOPIC || 'events_topic',
  ZOO_KEEPER: process.env.ZOO_KEEPER || 'localhost:2181'
};
