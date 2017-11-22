/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * Schema for project and repository mapping.
 * @author TCSCODER
 * @version 1.0
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  provider: {type: String, required: true}, // github or gitlab
  repositoryId: {type: Number, required: true, unique: true},
  projectId: {type: Number, required: true, unique: true}
});

// project id, provider, repositoryId must be unique
schema.index({projectId: 1, provider: 1, repositoryId: 1}, {unique: true});


module.exports = schema;
