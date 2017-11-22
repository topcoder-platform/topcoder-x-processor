/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around Ragnar Self service tool api.
 * @author TCSCODER
 * @version 1.0
 */

const jwtDecode = require('jwt-decode');
const Joi = require('joi');
const axios = require('axios');
const config = require('config');
const _ = require('lodash');
const logger = require('../utils/logger');

// Cache the access token
let cachedAccessToken;

/**
 * Authenticate with Ragnar Self service tool API and get the access token.
 * @returns {String} the access token issued by tool
 * @private
 */
async function getAccessToken() {
  // Check the cached access token
  if (cachedAccessToken) {
    const decoded = jwtDecode(cachedAccessToken);
    if (decoded.iat > new Date().getTime()) {
      // Still not expired, just use it
      return cachedAccessToken;
    }
  }

  // Authenticate
  const response = await axios.post(config.TC_RAGNAR_LOGIN_URL, config.TC_RAGNAR_ADMIN_LOGIN_BODY);
  const token = _.get(response, 'data.token');

  if (!token) {
    throw new Error(`cannot authenticate with Ragnar self service tool: ${config.TC_RAGNAR_LOGIN_URL}`);
  }
  cachedAccessToken = token;
  return cachedAccessToken;
}

/**
 * gets the tc handle for given username from a provider
 * @param {String} provider the username provider
 * @param {String} username the username
 * @returns {Object} user mapping if found else null
 */
async function getTCUserName(provider, username) {
  Joi.attempt({provider, username}, getTCUserName.schema);
  const accessToken = await getAccessToken();
  let url = config.TC_RAGNAR_USER_MAPPING_URL;
  if (provider === 'github') {
    url += `?githubUsername=${username}`;
  } else if (provider === 'gitlab') {
    url += `?gitlabUsername=${username}`;
  }
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error occurred while getting username from Ragnar for user ${error}`);
    return null;
  }
}

getTCUserName.schema = {
  provider: Joi.string().valid('github', 'gitlab').required(),
  username: Joi.string().required()
};

module.exports = {
  getTCUserName
};
