/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around Self service tool.
 * @author veshu
 * @version 1.0
 */

const config = require('config');
const Joi = require('joi');
const _ = require('lodash');
const logger = require('../utils/logger');
const dbHelper = require('../utils/db-helper');
const models = require('../models');
const azureService = require('./AzureService');

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
    } else if (provider === 'azure') {
      criteria.azureUserId = gitUser;
    }
  }
  if (_.isString(gitUser)) {
    if (provider === 'github') {
      criteria.githubUsername = gitUser;
    } else if (provider === 'gitlab') {
      criteria.gitlabUsername = gitUser;
    } else if (provider === 'azure') {
      criteria.azureUserId = gitUser;
    }
  }
  if (_.isEmpty(criteria)) {
    throw new Error('Can\'t find the TCUserName. Invalid gitUser.');
  }
  return await dbHelper.scanOne(models.UserMapping, criteria);
}

getTCUserName.schema = {
  provider: Joi.string().valid('github', 'gitlab', 'azure').required(),
  gitUser: Joi.any().required()
};


/**
 * gets the access token of repository's copilot/owner captured by Topcoder x tool
 * @param {String} provider the repo provider
 * @param {String} repoFullName the full name of repository
 * @returns {String} the copilot/owner if exists
 */
async function getRepositoryCopilotOrOwner(provider, repoFullName) {
  Joi.attempt({provider, repoFullName}, getRepositoryCopilotOrOwner.schema);
  let fullRepoUrl;
  if (provider === 'github') {
    fullRepoUrl = `https://github.com/${repoFullName}`;
  } else if (provider === 'gitlab') {
    fullRepoUrl = `${config.GITLAB_API_BASE_URL}/${repoFullName}`;
  } else if (provider === 'azure') {
    fullRepoUrl = `${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}`;
  }
  const project = await dbHelper.scanOne(models.Project, {
    repoUrl: fullRepoUrl
  });

  const hasCopilot = project.copilot !== undefined; // eslint-disable-line no-undefined
  if (!project || !project.owner) {
    // throw this repo is not managed by Topcoder x tool
    throw new Error(`This repository '${repoFullName}' is not managed by Topcoder X tool.`);
  }

  const userMapping = await dbHelper.scanOne(models.UserMapping, {
    topcoderUsername: {eq: hasCopilot ? project.copilot.toLowerCase() : project.owner.toLowerCase()}
  });

  logger.debug('userMapping');
  logger.debug(userMapping);

  if (!userMapping ||
    (provider === 'github' && !userMapping.githubUserId) ||
    (provider === 'gitlab' && !userMapping.gitlabUserId) ||
    (provider === 'azure' && !userMapping.azureUserId)) {
    throw new Error(`Couldn't find githost username for '${provider}' for this repository '${repoFullName}'.`);
  }
  let user = await dbHelper.scanOne(models.User, {
    username: provider === 'github' ? userMapping.githubUsername :  // eslint-disable-line no-nested-ternary
      provider === 'gitlab' ? userMapping.gitlabUsername : userMapping.azureEmail,
    type: provider
  });

  if (provider === 'azure') {
    user = await azureService.refreshAzureUserAccessToken(user);
  }

  if (!user && !hasCopilot) {
    // throw no copilot is configured
    throw new Error(`No owner is configured for the this repository: ${provider}`);
  } else if (!user) {
    // is copilot not set, return null
    return null;
  }

  return {
    accessToken: user.accessToken,
    userProviderId: user.userProviderId,
    topcoderUsername: userMapping.topcoderUsername
  };
}

getRepositoryCopilotOrOwner.schema = {
  provider: Joi.string().valid('github', 'gitlab', 'azure').required(),
  repoFullName: Joi.string().required()
};

module.exports = {
  getTCUserName,
  getRepositoryCopilotOrOwner
};

logger.buildService(module.exports);
