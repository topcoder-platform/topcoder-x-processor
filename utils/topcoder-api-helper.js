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

const config = require('config');
const axios = require('axios');
const _ = require('lodash');
const circularJSON = require('circular-json');

const m2mAuth = require('tc-core-library-js').auth.m2m;

const m2m = m2mAuth(_.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL', 'GRANT_TYPE']));
const constants = require('../constants');
const logger = require('./logger');
const loggerFile = require('./logger-file');
const errors = require('./errors');

/**
 * Function to get M2M token
 * @returns {Promise} The promised token
 */
async function getM2Mtoken() {
  return await m2m.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET);
}

/**
 * Create a new project.
 * @param {String} projectName the project name
 * @returns {Number} the created project id
 */
async function createProject(projectName) {
  const apiKey = await getM2Mtoken();
  try {
    const response = await axios.post(`${config.TC_API_URL}/projects`, {name: projectName}, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: POST /projects,  POST parameters: ${circularJSON.stringify({name: projectName})},
    Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    return _.get(response, 'data.id');
  } catch (err) {
    loggerFile.info(`EndPoint: POST /direct/projects, POST parameters: ${circularJSON.stringify({name: projectName})},
    Status Code:null, Error: 'Failed to create project.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to create project.');
  }
}

/**
 * Create a new challenge.
 * @param {Object} challenge the challenge to create
 * @returns {Number} the created challenge id
 */
async function createChallenge(challenge) {
  const apiKey = await getM2Mtoken();
  const body = _.assign({}, config.NEW_CHALLENGE_TEMPLATE, {
    typeId: config.TYPE_ID_TASK,
    name: challenge.name,
    description: challenge.detailedRequirements,
    prizeSets: [{
      type: 'placement',
      prizes: _.map(challenge.prizes, (prize) => ({type: 'USD', value: prize}))
    }],
    timelineTemplateId: config.DEFAULT_TIMELINE_TEMPLATE_ID,
    projectId: challenge.projectId,
    trackId: config.DEFAULT_TRACK_ID,
    legacy: {
      pureV5Task: true
    },
    startDate: new Date()
  });
  try {
    const response = await axios.post(`${config.TC_API_URL}/challenges`, body, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    logger.debug(`EndPoint: POST /challenges,  POST parameters: ${circularJSON.stringify(body)},
    Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    return _.get(response, 'data.id');
  } catch (err) {
    logger.debug(`EndPoint: POST /challenges,  POST parameters: ${circularJSON.stringify(body)}, Status Code:null,
    Error: 'Failed to create challenge.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to create challenge.');
  }
}

/**
 * Update a challenge.
 * @param {String} id the challenge id
 * @param {Object} challenge the challenge to update
 */
async function updateChallenge(id, challenge) {
  const apiKey = await getM2Mtoken();
  logger.debug(`Updating challenge ${id} with ${circularJSON.stringify(challenge)}`);
  try {
    const response = await axios.patch(`${config.TC_API_URL}/challenges/${id}`, challenge, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    logger.debug(`EndPoint: PATCH /challenges/${id},  PATCH parameters: ${circularJSON.stringify(challenge)},
    Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
  } catch (err) {
    logger.error('updateChallenge ERROR.');
    logger.error(`EndPoint: PATCH /challenges/${id}`);
    logger.error(`${err.message}`);
    logger.error(`Request: ${JSON.stringify(err.config)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);

    loggerFile.info(`EndPoint: PATCH /challenges/${id},  PATCH parameters: null, Status Code:null,
    Error: 'Failed to update challenge.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to update challenge.');
  }
}

/**
 * activates the topcoder challenge
 * @param {String} id the challenge id
 */
async function activateChallenge(id) {
  const apiKey = await getM2Mtoken();
  logger.debug(`Activating challenge ${id}`);
  try {
    const response = await axios.patch(`${config.TC_API_URL}/challenges/${id}`, {status: constants.CHALLENGE_STATUS.ACTIVE}, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: PATCH /challenges/${id},
    PATCH parameters: { status: '${constants.CHALLENGE_STATUS.ACTIVE}' }, Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    logger.debug(`Challenge ${id} is activated successfully.`);
  } catch (err) {
    logger.error('activateChallenge ERROR.');
    logger.error(`EndPoint: PATCH /challenges/${id}`);
    logger.error(`${err.message}`);
    logger.error(`Request: ${JSON.stringify(err.config)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);

    loggerFile.info(`EndPoint: PATCH /challenges/${id},  PATCH parameters: { status: '${constants.CHALLENGE_STATUS.ACTIVE}' }, Status Code:null,
    Error: 'Failed to activate challenge.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to activate challenge.');
  }
}

/**
 * Get challenge details by id
 * @param {String} id challenge ID
 * @returns {Object} topcoder challenge
 */
async function getChallengeById(id) {
  const apiKey = await getM2Mtoken();
  logger.debug('Getting topcoder challenge details');
  try {
    const response = await axios.get(`${config.TC_API_URL}/challenges/${id}`, {
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      'Content-Type': 'application/json'
    });
    const challenge = _.get(response, 'data');
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: GET challenges/${id},  GET parameters: null, Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    return challenge;
  } catch (err) {
    logger.error('getChallengeById ERROR.');
    logger.error(`EndPoint: GET challenges/${id}`);
    logger.error(`${err.message}`);
    logger.error(`Request: ${JSON.stringify(err.config)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);

    logger.error(JSON.stringify(err));
    throw errors.convertTopcoderApiError(err, 'Failed to get challenge details by Id');
  }
}

/**
 * closes the topcoder challenge
 * @param {String} id the challenge id
 * @param {Number} winnerId the winner id
 * @param {String} winnerUsername the winner handle
 */
async function closeChallenge(id, winnerId, winnerUsername) {
  const apiKey = await getM2Mtoken();
  logger.debug(`Closing challenge ${id}`);
  try {
    const response = await axios.patch(`${config.TC_API_URL}/challenges/${id}`, {
      status: constants.CHALLENGE_STATUS.COMPLETED,
      winners: [{
        userId: winnerId,
        handle: winnerUsername,
        placement: 1
      }]
    }, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    logger.debug(`EndPoint: PATCH /challenges/${id},
    PATCH parameters: { status: '${constants.CHALLENGE_STATUS.COMPLETED}' }, Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    logger.debug(`Challenge ${id} is closed successfully.`);
  } catch (err) {
    logger.error('Closing challenge ERROR.');
    logger.error(`EndPoint: PATCH /challenges/${id}`);
    logger.error(`${err.message}`);
    logger.error(`Request: ${JSON.stringify(err.config)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);

    logger.error(`EndPoint: PATCH /challenges/${id},  PATCH parameters: { status: '${constants.CHALLENGE_STATUS.COMPLETED}' }, Status Code:null,
    Error: 'Failed to close challenge.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to close challenge.');
  }
}

/**
 * gets the project billing account id
 * @param {Number} id the project id
 * @returns {Number} the billing account id
 */
async function getProjectBillingAccountId(id) {
  const apiKey = await getM2Mtoken();
  logger.debug(`Getting project billing detail ${id}`);
  try {
    const response = await axios.get(`${config.TC_API_URL}/projects/${id}`, {
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });
    const billingAccountId = _.get(response, 'data.billingAccountId');
    if (!billingAccountId) {
      _.set(response, 'data', `There is no billing account id associated with project ${id}`);
      return null;
    }
    const statusCode = response ? response.status : null;
    loggerFile.info(`EndPoint: GET /projects/${id},
    GET parameters: null, Status Code:${statusCode}, Response:${circularJSON.stringify(response.data)}`);
    return billingAccountId;
  } catch (err) {
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);
    logger.error(`EndPoint: GET /projects/${id}, GET parameters: null, Status Code:null,
    Error: 'Failed to get billing detail for the project.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to get billing detail for the project.');
  }
}

/**
 * gets the topcoder user id from handle
 * @param {String} handle the topcoder handle
 * @returns {Number} the user id
 */
async function getTopcoderMemberId(handle) {
  try {
    const response = await axios.get(`${config.TC_API_URL}/members/${handle}`);
    const statusCode = response ? response.status : null;
    loggerFile.info(`EndPoint: GET members/${handle},  GET parameters: null, Status Code:${statusCode}, Response:${circularJSON.stringify(response.data)}`);
    return _.get(response, 'data.userId');
  } catch (err) {
    loggerFile.info(`EndPoint: GET members/${handle}, GET parameters: null, Status Code:null,
    Error: 'Failed to get topcoder member id.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to get topcoder member id.');
  }
}

/**
 * adds the resource to the topcoder challenge
 * @param {String} id the challenge id
 * @param {String} handle the user handle to add
 * @param {String} roleId the role id
 */
async function addResourceToChallenge(id, handle, roleId) {
  const apiKey = await getM2Mtoken();
  logger.debug(`adding resource to challenge ${id}`);
  try {
    const response = await axios.post(`${config.TC_API_URL}/resources`, {
      challengeId: id,
      memberHandle: handle,
      roleId
    }, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: POST /resources,
    POST parameters: null, Status Code:${statusCode}, Response:${circularJSON.stringify(response.data)}`);
  } catch (err) {
    loggerFile.info(`EndPoint: POST /resources, POST parameters: null, Status Code:null,
    Error: 'Failed to add resource to the challenge.', Details: ${circularJSON.stringify(err)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to add resource to the challenge.');
  }
}

/**
 * Get challenge resources details by id
 * @param {String} id challenge ID
 * @returns {Object} topcoder challenge resources
 */
async function getResourcesFromChallenge(id) {
  const apiKey = await getM2Mtoken();
  logger.debug(`fetch resource from challenge ${id}`);
  try {
    const response = await axios.get(`${config.TC_API_URL}/resources?challengeId=${id}`, {
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      'Content-Type': 'application/json'
    });
    const resources = _.get(response, 'data');
    return resources;
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to fetch resource from the challenge.');
  }
}

/**
 * Check if role is already set
 * @param {Number} id the challenge id
 * @param {String} roleId the role to check
 * @returns {Promise<Boolean>}
 */
async function roleAlreadySet(id, roleId) {
  let result = false;
  try {
    const resources = await getResourcesFromChallenge(id);
    resources.forEach((resource) => {
      if (resource.roleId === roleId) {
        result = true;
      }
    });
  } catch (err) {
    throw errors.convertTopcoderApiError(err, 'Failed to fetch resource from the challenge.');
  }
  return result;
}
/**
 * unregister user from topcoder challenge
 * @param {String} id the challenge id
 * @param {String} handle the user handle to unregister
 * @param {String} roleId the role id of registered user
 */
async function unregisterUserFromChallenge(id, handle, roleId) {
  await removeResourceToChallenge(id, handle, roleId);
}

/**
 * cancels the private contents
 * @param {Number} id the challenge id
 */
async function cancelPrivateContent(id) {
  const apiKey = await getM2Mtoken();
  logger.debug(`Cancelling challenge ${id}`);
  try {
    const response = await axios.patch(`${config.TC_API_URL}/challenges/${id}`, {status: constants.CHALLENGE_STATUS.CANCELED}, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: PATCH /challenges/${id},
    PATCH parameters: { status: '${constants.CHALLENGE_STATUS.CANCELED}' }, Status Code:${statusCode}, Response: ${circularJSON.stringify(response.data)}`);
    logger.debug(`Challenge ${id} is cancelled successfully.`);
  } catch (err) {
    logger.error(`EndPoint: PATCH /challenges/${id}`);
    logger.error(`${err.message}`);
    logger.error(`Request: ${JSON.stringify(err.config)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);

    loggerFile.info(`EndPoint: PATCH /challenges/${id},  PATCH parameters: { status: '${constants.CHALLENGE_STATUS.CANCELED}' }, Status Code:null,
    Error: 'Failed to cancel challenge.', Details: ${circularJSON.stringify(err)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to cancel challenge.');
  }
}

/**
 * adds assignee as challenge registrant
 * @param {String} topcoderUsername the topcoder user handle
 * @param {String} challengeId the challenge id
 * @private
 */
async function assignUserAsRegistrant(topcoderUsername, challengeId) {
  await addResourceToChallenge(challengeId, topcoderUsername, config.ROLE_ID_SUBMITTER);
}

/**
 * removes the resource from the topcoder challenge
 * @param {String} id the challenge id
 * @param {String} handle the user handle to unregister
 * @param {String} roleId the role id of registered user
 */
async function removeResourceToChallenge(id, handle, roleId) {
  const apiKey = await getM2Mtoken();
  logger.debug(`removing resource from challenge ${id}`);
  try {
    const response = await axios.delete(`${config.TC_API_URL}/resources`, {
      data: {
        challengeId: id,
        memberHandle: handle,
        roleId
      },
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const statusCode = response.status ? response.status : null;
    loggerFile.info(`EndPoint: DELETE /resources,
    DELETE parameters: null, Status Code:${statusCode}, Response:${circularJSON.stringify(response.data)}`);
  } catch (err) {
    loggerFile.info(`EndPoint: DELETE /resources, DELETE parameters: null, Status Code:null,
    Error: 'Failed to remove resource from the challenge.', Details: ${circularJSON.stringify(err)}`);
    logger.error(`Response Data: ${JSON.stringify(err.response.data)}`);
    throw errors.convertTopcoderApiError(err, 'Failed to remove resource from the challenge.');
  }
}
/**
 * Finds project by given direct id and returns it
 * @param {id} id in the database
 * @param {Number} directId
 * @returns {Promise}
 */
async function getProjectByDirectId(id, directId) {
  const apiKey = await getM2Mtoken();
  return axios.get(`${config.TC_API_URL}/projects`, {
    params: {
      directProjectId: directId
    },
    headers: {
      authorization: `Bearer ${apiKey}`
    }
  }).then((data) => {
    // Append database project id to response
    data.dbId = id;
    // Log to debug if project is empty
    if (data.data.length === 0) {
      logger.debug(`Project with direct id ${directId} (database: ${id}) was not found in connect`);
    }
    return data;
  }).catch((err) => {
    logger.logFullError(err);
    throw errors.convertTopcoderApiError(err, `Failed to fetch project with direct id ${directId}`);
  });
}


module.exports = {
  createProject,
  getChallengeById,
  createChallenge,
  updateChallenge,
  activateChallenge,
  closeChallenge,
  getProjectBillingAccountId,
  getTopcoderMemberId,
  addResourceToChallenge,
  getResourcesFromChallenge,
  roleAlreadySet,
  unregisterUserFromChallenge,
  cancelPrivateContent,
  assignUserAsRegistrant,
  removeResourceToChallenge,
  getProjectByDirectId
};
