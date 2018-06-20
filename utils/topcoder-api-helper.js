/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */

/**
 * This module contains the helper methods to work with Topcoder APIs.
 *
 * Changes in 1.1:
 * - added support for switching topcoder dev and prod API through configuration
 * @author TCSCODER
 * @version 1.1
 */
'use strict';

const jwtDecode = require('jwt-decode');
const axios = require('axios');
const config = require('config');
const _ = require('lodash');
const moment = require('moment');

let topcoderApiProjects = require('topcoder-api-projects');
let topcoderApiChallenges = require('topcoder-api-challenges');

const topcoderDevApiProjects = require('topcoder-dev-api-projects');
const topcoderDevApiChallenges = require('topcoder-dev-api-challenges');

const logger = require('./logger');
const errors = require('./errors');


if (config.TC_DEV_ENV) {
  topcoderApiProjects = topcoderDevApiProjects;
  topcoderApiChallenges = topcoderDevApiChallenges;
}

// Cache the access token
let cachedAccessToken;

// Init the API instances
const projectsClient = topcoderApiProjects.ApiClient.instance;
const challengesClient = topcoderApiChallenges.ApiClient.instance;
const bearer = projectsClient.authentications.bearer;
bearer.apiKeyPrefix = 'Bearer';
challengesClient.authentications.bearer = bearer;
const projectsApiInstance = new topcoderApiProjects.DefaultApi();
const challengesApiInstance = new topcoderApiChallenges.DefaultApi();

/**
 * Authenticate with Topcoder API and get the access token.
 * @returns {String} the access token issued by Topcoder
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
  const v2Response = await axios.post(config.TC_AUTHN_URL, config.TC_AUTHN_REQUEST_BODY);
  const v2IdToken = _.get(v2Response, 'data.id_token');
  const v2RefreshToken = _.get(v2Response, 'data.refresh_token');

  if (!v2IdToken || !v2RefreshToken) {
    throw new Error(`cannot authenticate with topcoder: ${config.TC_AUTHN_URL}`);
  }

  // Authorize
  const v3Response = await axios.post(
    config.TC_AUTHZ_URL, {
      param: {
        externalToken: v2IdToken,
        refreshToken: v2RefreshToken
      }
    }, {
      headers: {
        authorization: `Bearer ${v2IdToken}`
      }
    });

  cachedAccessToken = _.get(v3Response, 'data.result.content.token');

  if (!cachedAccessToken) {
    throw new Error(`cannot authorize with topcoder: ${config.TC_AUTHZ_URL}`);
  }

  return cachedAccessToken;
}

/**
 * Create a new project.
 * @param {String} projectName the project name
 * @returns {Number} the created project id
 */
async function createProject(projectName) {
  bearer.apiKey = await getAccessToken();

  // eslint-disable-next-line new-cap
  const projectBody = new topcoderApiProjects.ProjectRequestBody.constructFromObject({
    projectName
  });
  try {
    const projectResponse = await new Promise((resolve, reject) => {
      projectsApiInstance.directProjectsPost(projectBody, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
    return _.get(projectResponse, 'result.content.projectId');
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to create project.');
  }
}

/**
 * Create a new challenge.
 * @param {Object} challenge the challenge to create
 * @returns {Number} the created challenge id
 */
async function createChallenge(challenge) {
  bearer.apiKey = await getAccessToken();

  const start = new Date();
  const startTime = moment(start).toISOString();
  const end = moment(start).add(config.NEW_CHALLENGE_DURATION_IN_DAYS, 'days').toISOString();

  // eslint-disable-next-line new-cap
  const challengeBody = new topcoderApiChallenges.NewChallengeBodyParam.constructFromObject({
    param: _.assign({}, config.NEW_CHALLENGE_TEMPLATE, {
      registrationStartDate: start,
      registrationStartsAt: startTime,
      registrationEndsAt: end,
      submissionEndsAt: end
    }, challenge)
  });
  try {
    const challengeResponse = await new Promise((resolve, reject) => {
      challengesApiInstance.saveDraftContest(challengeBody, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });

    return _.get(challengeResponse, 'result.content.id');
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to create challenge.');
  }
}

/**
 * Update a challenge.
 * @param {Number} id the challenge id
 * @param {Object} challenge the challenge to update
 */
async function updateChallenge(id, challenge) {
  bearer.apiKey = await getAccessToken();
  logger.debug(`Updating challenge ${id} with ${JSON.stringify(challenge)}`);
  // eslint-disable-next-line new-cap
  const challengeBody = new topcoderApiChallenges.UpdateChallengeBodyParam.constructFromObject({
    param: challenge
  });
  try {
    await new Promise((resolve, reject) => {
      challengesApiInstance.challengesIdPut(id, challengeBody, (err, res) => {
        if (err) {
          logger.error(err);
          logger.debug(JSON.stringify(err));
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to update challenge.');
  }
}

/**
 * activates the topcoder challenge
 * @param {Number} id the challenge id
 */
async function activateChallenge(id) {
  const apiKey = await getAccessToken();
  logger.debug(`Activating challenge ${id}`);
  try {
    await axios.post(`${projectsClient.basePath}/challenges/${id}/activate`, null, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    logger.debug(`Challenge ${id} is activated successfully.`);
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to activate challenge.');
  }
}

/**
 * closes the topcoder challenge
 * @param {Number} id the challenge id
 * @param {Number} winnerId the winner id
 */
async function closeChallenge(id, winnerId) {
  const apiKey = await getAccessToken();
  logger.debug(`Closing challenge ${id}`);
  try {
    await axios.post(`${projectsClient.basePath}/challenges/${id}/close?winnerId=${winnerId}`, null, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    logger.debug(`Challenge ${id} is closed successfully.`);
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to close challenge.');
  }
}

/**
 * gets the project billing account id
 * @param {Number} id the project id
 * @returns {Number} the billing account id
 */
async function getProjectBillingAccountId(id) {
  const apiKey = await getAccessToken();
  logger.debug(`Getting project billing detail ${id}`);
  try {
    const response = await axios.get(`${projectsClient.basePath}/direct/projects/${id}`, {
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });
    return _.get(response, 'data.result.content.billingAccountIds[0]');
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to get billing detail for the project.');
  }
}

/**
 * gets the topcoder user id from handle
 * @param {String} handle the topcoder handle
 * @returns {Number} the user id
 */
async function getTopcoderMemberId(handle) {
  bearer.apiKey = await getAccessToken();
  try {
    const response = await axios.get(`${projectsClient.basePath}/members/${handle}`);
    return _.get(response, 'data.result.content.userId');
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to get topcoder member id.');
  }
}

/**
 * adds the resource to the topcoder challenge
 * @param {Number} id the challenge id
 * @param {Object} resource the resource resource to add
 */
async function addResourceToChallenge(id, resource) {
  bearer.apiKey = await getAccessToken();
  logger.debug(`adding resource to challenge ${id}`);
  try {
    await new Promise((resolve, reject) => {
      challengesApiInstance.challengesIdResourcesPost(id, resource, (err, res) => {
        if (err) {
          if (_.get(JSON.parse(_.get(err, 'response.text')), 'result.content')
            === `User ${resource.resourceUserId} with role ${resource.roleId} already exists`) {
            resolve();
          } else {
            logger.error(JSON.stringify(err));
            reject(err);
          }
        } else {
          logger.debug(`resource is added to challenge ${id} successfully.`);
          resolve(res);
        }
      });
    });
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to add resource to the challenge.');
  }
}

module.exports = {
  createProject,
  createChallenge,
  updateChallenge,
  activateChallenge,
  closeChallenge,
  getProjectBillingAccountId,
  getTopcoderMemberId,
  addResourceToChallenge
};
