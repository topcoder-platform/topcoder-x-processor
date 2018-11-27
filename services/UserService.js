/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around Self service tool.
 * @author veshu
 * @version 1.0
 */

const Joi = require('joi');
const _ = require('lodash');
const config = require('config');
const logger = require('../utils/logger');
const dbHelper = require('../utils/db-helper');
const models = require('../models');

/**
 * gets the tc handle for given git user id from a mapping captured by Topcoder x tool
 * @param {String} provider the git provider
 * @param {String} gitUser the user id in git provider
 * @returns {Object} user mapping if found else null
 */
async function getTCUserName(provider, gitUser) {
  Joi.attempt({provider, gitUser}, getTCUserName.schema);
  const criteria = {};
  if (_.isNumber(gitUser)) {
    if (provider === 'github') {
      criteria.githubUserId = gitUser;
    } else if (provider === 'gitlab') {
      criteria.gitlabUserId = gitUser;
    }
  }
  if (_.isString(gitUser)) {
    if (provider === 'github') {
      criteria.githubUsername = gitUser;
    } else if (provider === 'gitlab') {
      criteria.gitlabUsername = gitUser;
    }
  }
  return await dbHelper.scanOne(models.UserMapping, criteria);
}

getTCUserName.schema = {
  provider: Joi.string().valid('github', 'gitlab').required(),
  gitUser: Joi.any().required()
};


/**
 * gets the access token of repository's copilot captured by Topcoder x tool
 * @param {String} provider the repo provider
 * @param {String} repoFullName the full name of repository
 * @returns {String} the copilot if exists
 */
async function getRepositoryCopilot(provider, repoFullName) {
  Joi.attempt({provider, repoFullName}, getRepositoryCopilot.schema);
  let fullRepoUrl;
  if (provider === 'github') {
    fullRepoUrl = `https://github.com/${repoFullName}`;
  } else if (provider === 'gitlab') {
    fullRepoUrl = `${config.GITLAB_API_BASE_URL}/${repoFullName}`;
  }
  const project = await dbHelper.scanOne(models.Project, {
    repoUrl: fullRepoUrl
  });

  if (!project || !project.owner || !project.copilot) {
    // throw this repo is not managed by Topcoder x tool
    throw new Error(`This repository '${repoFullName}' is not managed by Topcoder X tool.`);
  }
  const userMapping = await dbHelper.scanOne(models.UserMapping, {
    topcoderUsername: {eq: project.copilot.toLowerCase()}
  });

  if (!userMapping || (provider === 'github' && !userMapping.githubUserId) || (provider === 'gitlab' && !userMapping.gitlabUserId)) {
    throw new Error(`Couldn't find githost username for '${provider}' for this repository '${repoFullName}'.`);
  }
  const copilot = await dbHelper.scanOne(models.User, {
    username: provider === 'github' ? userMapping.githubUsername : userMapping.gitlabUsername,
    type: provider
  });

  if (!copilot) {
    // throw no copilot is configured
    throw new Error(`No copilot is configured for the this repository: ${provider}`);
  }

  return {
    accessToken: copilot.accessToken,
    userProviderId: copilot.userProviderId,
    topcoderUsername: userMapping.topcoderUsername
  };
}

getRepositoryCopilot.schema = {
  provider: Joi.string().valid('github', 'gitlab').required(),
  repoFullName: Joi.string().required()
};

module.exports = {
  getTCUserName,
  getRepositoryCopilot
};

logger.buildService(module.exports);
