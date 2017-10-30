/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Schema for Issue.
 * @author TCSCODER
 * @version 1.0
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  // From the receiver service
  number: {type: Number, required: true},
  title: {type: String, required: true},
  body: String,
  prizes: [{type: Number, required: true}], // extracted from title
  provider: {type: String, required: true}, // github or gitlab
  repositoryId: {type: Number, required: true},

  // From topcoder api
  challengeId: {type: Number, required: true, unique: true}
});

// Issue number, provider, repositoryId must be unique
schema.index({number: 1, provider: 1, repositoryId: 1}, {unique: true});


module.exports = schema;
