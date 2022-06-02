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
async function handleChallengeTagsUpdate(event) {
  const tags = event.data.tags.split(',');
  await Promise.all(
    event.data.challengeUUIDsList.map(async (challengeUUIDs) => {
      if (_.isString(challengeUUIDs)) { // repoUrl
        challengeUUIDs = await dbHelper.queryChallengeUUIDsByRepoUrl(challengeUUIDs);
      }
      return challengeUUIDs.map(async (challengeUUID) => await topcoderApiHelper.updateChallenge(challengeUUID, {tags}));
    }).reduce((a, b) => _.concat(a, b), [])
  ).then((resps) => {
    logger.debug(`handleChallengeTagsUpdate updated ${_.size(resps)} challenges successfully.`);
  }).catch((err) => {
    logger.error(`handleChallengeTagsUpdate failed. Internal Error: ${err}`);
    throw new Error(`handleChallengeTagsUpdate failed. Internal Error: ${err}`);
  });
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
    tags: Joi.string().required()
  }).required(),
  retryCount: Joi.number().integer().default(0).optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
