/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */

/**
 * Schema for Payment.
 * @author TCSCODER
 * @version 1.0
 */

'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  project: {type: String, required: true},
  amount: {type: Number, required: true},
  description: {type: String, required: true},
  challenge: {type: Number, required: true},
  closed: {type: String, required: true, default: 'false'}
});

schema.index({tcDirectId: 1});

module.exports = schema;
