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
const _ = require('lodash');
const Joi = require('joi');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const dbHelper = require('../utils/db-helper');

/**
 * Update challenge tags
 * @param {Object} event the event
 */
async handleChallengeTagsUpdate(event) {
  const tags = event.data.tags;
  try {
    _.each(event.data.challengeUUIDsList, challengeUUIDs => {
      if (_.isString(challengeUUIDs)) { // repoUrl
        challengeUUIDs = await dbHelper.queryChallengeUUIDsByRepoUrl(challengeUUIDs);
      }
      _.each(challengeUUIDs, challengeUUID => await topcoderApiHelper.updateChallenge(challengeUUID, {tags}));
    });
  } catch (err) {
    logger.error(`handleChallengeTagsUpdate failed. Internal Error: ${err}`);
    throw new Error(`handleChallengeTagsUpdate failed. Internal Error: ${err}`);
  }
}

/**
 * Process pure challenge event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  if (event.event === 'challengeTags.update') {
    await handleChallengeTagsUpdate(event);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('challengeUUIDTags.update').required(),
  data: Joi.object().keys({
    challengeUUIDsList: Joi.array().items(
      Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string()))
    ).required(),
    tags: Joi.array().items(Joi.string().required()).min(1).required(),
  }).required(),
  retryCount: Joi.number().integer().default(0).optional(),
});


module.exports = {
  process
};

logger.buildService(module.exports);
