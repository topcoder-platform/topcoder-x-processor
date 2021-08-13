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
const v = require('validator');
const _ = require('lodash');
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
  if (_.isNumber(gitUser) || v.isUUID(gitUser)) {
    if (provider === 'github') {
      return await dbHelper.queryOneUserMappingByGithubUserId(models.GithubUserMapping, gitUser);
    } else if (provider === 'gitlab') {
      return await dbHelper.queryOneUserMappingByGitlabUserId(models.GitlabUserMapping, gitUser);
    }
  } else if (_.isString(gitUser) || v.isEmail(gitUser)) {
    if (provider === 'github') {
      return await dbHelper.queryOneUserMappingByGithubUsername(models.GithubUserMapping, gitUser);
    } else if (provider === 'gitlab') {
      return await dbHelper.queryOneUserMappingByGitlabUsername(models.GitlabUserMapping, gitUser);
    }
  }
  if (_.isEmpty(criteria)) {
    throw new Error('Can\'t find the TCUserName. Invalid gitUser.');
  }
}

getTCUserName.schema = {
  provider: Joi.string().valid('github', 'gitlab').required(),
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
  }
  const project = await dbHelper.queryOneActiveProject(models.Project, fullRepoUrl);

  const hasCopilot = project.copilot !== undefined; // eslint-disable-line no-undefined
  if (!project || !project.owner) {
    // throw this repo is not managed by Topcoder x tool
    throw new Error(`This repository '${repoFullName}' is not managed by Topcoder X tool.`);
  }

  const userMapping = await dbHelper.queryOneUserMappingByTCUsername(
    provider === 'github' ? models.GithubUserMapping : models.GitlabUserMapping,
    hasCopilot ? project.copilot.toLowerCase() : project.owner.toLowerCase());

  logger.debug('userMapping');
  logger.debug(userMapping);

  if (!userMapping ||
    (provider === 'github' && !userMapping.githubUserId) ||
    (provider === 'gitlab' && !userMapping.gitlabUserId)) {
    throw new Error(`Couldn't find githost username for '${provider}' for this repository '${repoFullName}'.`);
  }
  const user = await dbHelper.queryOneUserByType(models.User,
    provider === 'github' ? userMapping.githubUsername : userMapping.gitlabUsername, provider); // eslint-disable-line no-nested-ternary

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
  provider: Joi.string().valid('github', 'gitlab').required(),
  repoFullName: Joi.string().required()
};

module.exports = {
  getTCUserName,
  getRepositoryCopilotOrOwner
};

logger.buildService(module.exports);
