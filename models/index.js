/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Initialize and export all model schemas.
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
const config = require('config');
const mongoose = require('mongoose');

mongoose.Promise = global.Promise;
const connection = mongoose.createConnection(config.MONGODB_URL);

/* eslint-disable global-require */
const models = {
  Issue: connection.model('Issue', require('./Issue')),
  Project: connection.model('Project', require('./Project'))
};
/* eslint-enable global-require */


module.exports = models;
