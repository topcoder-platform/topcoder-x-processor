/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around Ragnar Self service tool.
 * @author TCSCODER
 * @version 1.0
 */

const Joi = require('joi');
const config = require('config');
const models = require('../models');

/**
 * gets the tc handle for given username from a provider captured by Ragnar tool
 * @param {String} provider the username provider
 * @param {String} username the username
 * @returns {Object} user mapping if found else null
 */
async function getTCUserName(provider, username) {
  Joi.attempt({provider, username}, getTCUserName.schema);
  const criteria = {};
  if (provider === 'github') {
    criteria.githubUsername = username;
  } else if (provider === 'gitlab') {
    criteria.gitlabUsername = username;
  }
  return await models.UserMapping.findOne(criteria);
}

getTCUserName.schema = {
  provider: Joi.string().valid('github', 'gitlab').required(),
  username: Joi.string().required()
};

/**
 * gets the access token of repository's copilot captured by Ragnar tool
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

  const challenge = await models.Challenge.findOne({
    repoUrl: fullRepoUrl
  });

  if (!challenge || !challenge.username) {
    // throw this repo is not managed by Ragnar tool
    throw new Error(`This repository '${provider}' is not managed by Ragnar tool.`);
  }
  const copilot = await models.User.findOne({
    topcoderUsername: challenge.username.toLowerCase(),
    type: provider
  });

  if (!copilot) {
    // throw no copilot is configured
    throw new Error(`No copilot is configured for the this repository: ${provider}`);
  }

  return {
    accessToken: copilot.accessToken,
    userProviderId: copilot.userProviderId
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
