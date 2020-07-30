/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around azure api.
 * @author TCSCODER
 * @version 1.0
 */

const config = require('config');
const _ = require('lodash');
const Joi = require('joi');
const superagent = require('superagent');
const superagentPromise = require('superagent-promise');
const logger = require('../utils/logger');
const dbHelper = require('../utils/db-helper');
const errors = require('../utils/errors');
const helper = require('../utils/helper');
const models = require('../models');

const request = superagentPromise(superagent, Promise);
const MS_PER_SECOND = 1000;

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string()
}).required();

/**
 * creates the comments on azure issue
 * @param {Object} copilot the copilot
 * @param {String} repoFullName the organization/project-name
 * @param {Number} workItemId the issue number
 * @param {string} body the comment body text
 */
async function createComment(copilot, repoFullName, workItemId, body) {
  Joi.attempt({copilot, repoFullName, workItemId, body}, createComment.schema);
  try {
    body = helper.prepareAutomatedComment(body, copilot);
    await request
      .post(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${workItemId}/comments?api-version=5.1-preview.3`)
      .send({
        text: body
      })
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during creating comment on issue.');
  }
  logger.debug(`Azure comment is added on issue with message: "${body}"`);
}

createComment.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  workItemId: Joi.number().positive().required(),
  body: Joi.string().required()
};

/**
 * updates the title of azure issue
 * @param {Object} copilot the copilot
 * @param {Number} repoFullName the project id
 * @param {Number} issueId the issue number
 * @param {string} title new title
 */
async function updateIssue(copilot, repoFullName, issueId, title) {
  Joi.attempt({copilot, repoFullName, issueId, title}, updateIssue.schema);
  try {
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.Title',
        value: title
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during updating issue.');
  }
  logger.debug(`Azure issue title is updated for issue number ${issueId}`);
}

updateIssue.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  issueId: Joi.number().positive().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user login
 * @param {Object} copilot the copilot
 * @param {Number} repoFullName the project id
 * @param {Number} issueId the issue number
 * @param {Number} user the user id of assignee
 */
async function assignUser(copilot, repoFullName, issueId, user) {
  Joi.attempt({copilot, repoFullName, issueId, user}, assignUser.schema);
  try {
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: user
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during update assignee.');
  }
  logger.debug(`Azure issue with number ${issueId} is assigned to ${issueId}`);
}

assignUser.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  issueId: Joi.number().positive().required(),
  user: Joi.string()
};

/**
 * Removes an assignee from the issue
 * @param {Object} copilot the copilot
 * @param {Number} repoFullName the project id
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee to remove
 */
async function removeAssign(copilot, repoFullName, issueId) {
  Joi.attempt({copilot, repoFullName, issueId}, removeAssign.schema);
  try {
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: ''
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during remove assignee.');
  }
  logger.debug(`Azure user is unassigned from issue number ${issueId}`);
}

removeAssign.schema = assignUser.schema;

/**
 * Gets the user name by user id
 * @param {Object} copilot the copilot
 * @param {Number} userId the user id
 * @returns {string} the username if found else null
 */
async function getUsernameById(copilot, userId) {
  Joi.attempt({copilot, userId}, getUsernameById.schema);
  const userProfile = await request
    .get(`${config.AZURE_API_BASE_URL}/_apis/profile/profiles/${userId}?api-version=5.1`)
    .set('Authorization', `Bearer ${copilot.accessToken}`)
    .end()
    .then((res) => res.body);
  return userProfile ? userProfile.emailAddress : null;
}

getUsernameById.schema = {
  copilot: copilotUserSchema,
  userId: Joi.alternatives().try(Joi.string(), Joi.number()).required()
};

/**
 * updates the azure issue as paid and fix accepted
 * @param {Object} copilot the copilot
 * @param {Number} repoFullName the project id
 * @param {Number} issueId the issue number
 * @param {Number} challengeId the challenge id
 * @param {Array} existLabels the issue labels
 * @param {String} winner the winner topcoder handle
 * @param {Boolean} createCopilotPayments the option to create copilot payments or not
 */
async function markIssueAsPaid(copilot, repoFullName, issueId, challengeId, existLabels, winner, createCopilotPayments) { // eslint-disable-line max-params
  Joi.attempt({copilot, repoFullName, issueId, challengeId}, markIssueAsPaid.schema);
  const labels = _(existLabels).filter((i) => i !== config.FIX_ACCEPTED_ISSUE_LABEL)
    .push(config.FIX_ACCEPTED_ISSUE_LABEL, config.PAID_ISSUE_LABEL).value();
  try {
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.Tags',
        value: _.join(labels, '; ')
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();

    let commentMessage = '```\n';
    commentMessage += '*Payments Complete*\n';
    commentMessage += `Winner: ${winner}\n`;
    if (createCopilotPayments) {
      commentMessage += `Copilot: ${copilot.topcoderUsername}\n`;
    }
    commentMessage += '```\n';
    commentMessage += `Payment task has been updated: ${config.TC_OR_DETAIL_LINK}${challengeId}`;
    const body = helper.prepareAutomatedComment(commentMessage, copilot);
    await request
      .post(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}/comments?api-version=5.1-preview.3`)
      .send({
        text: body
      })
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during updating issue as paid.');
  }
  logger.debug(`Azure issue is updated for as paid and fix accepted for ${issueId}`);
}

markIssueAsPaid.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  issueId: Joi.number().positive().required(),
  challengeId: Joi.number().positive().required()
};

/**
 * change the state of azure issue
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the project id
 * @param {Number} issueId the issue issue id
 * @param {string} state new state
 */
async function changeState(copilot, repoFullName, issueId, state) {
  Joi.attempt({copilot, repoFullName, issueId, state}, changeState.schema);
  try {
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.State',
        value: state
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during updating status of issue.');
  }
  logger.debug(`Azure issue state is updated to '${state}' for issue number ${issueId}`);
}

changeState.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  issueId: Joi.number().positive().required(),
  state: Joi.string().required()
};

/**
 * updates the azure issue with new labels
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the project id
 * @param {Number} issueId the issue issue id
 * @param {Array} labels the labels
 */
async function addLabels(copilot, repoFullName, issueId, labels) {
  Joi.attempt({copilot, repoFullName, issueId, labels}, addLabels.schema);
  try {
    // https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/{id}?api-version=5.1
    await request
      .patch(`${config.AZURE_DEVOPS_API_BASE_URL}/${repoFullName}/_apis/wit/workItems/${issueId}?api-version=5.1`)
      .send([{
        op: 'add',
        path: '/fields/System.Tags',
        value: _.join(labels, '; ')
      }])
      .set('Authorization', `Bearer ${copilot.accessToken}`)
      .set('Content-Type', 'application/json-patch+json')
      .end();
  } catch (err) {
    throw errors.convertAzureError(err, 'Error occurred during adding label in issue.');
  }
  logger.debug(`Azure issue is updated with new labels for ${issueId}`);
}

addLabels.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  issueId: Joi.number().required(),
  labels: Joi.array().items(Joi.string()).required()
};

/**
 * Refresh the owner user access token if needed
 * @param {Object} azureOwner the azure owner
 * @returns {Object} the user object
 */
async function refreshAzureUserAccessToken(azureOwner) {
  const refreshTokenResult = await request
    .post('https://app.vssps.visualstudio.com/oauth2/token')
    .send({
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: encodeURIComponent(config.AZURE_CLIENT_SECRET),
      assertion: encodeURIComponent(azureOwner.refreshToken),
      grant_type: 'refresh_token',
      redirect_uri: `${config.WEBSITE_SECURE}${config.AZURE_OWNER_CALLBACK_URL}`
    })
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .end();
    // save user token data
  const expiresIn = refreshTokenResult.body.expires_in || config.AZURE_ACCESS_TOKEN_DEFAULT_EXPIRATION;
  return await dbHelper.update(models.User, azureOwner.id, {
    accessToken: refreshTokenResult.body.access_token,
    accessTokenExpiration: new Date(new Date().getTime() + expiresIn * MS_PER_SECOND),
    refreshToken: refreshTokenResult.body.refresh_token
  });
}

refreshAzureUserAccessToken.schema = Joi.object().keys({
  azureOwner: Joi.object().keys({
    id: Joi.string().required(),
    accessTokenExpiration: Joi.date().required(),
    refreshToken: Joi.string().required(),
    role: Joi.string(),
    userProviderId: Joi.number(),
    type: Joi.string(),
    accessToken: Joi.string(),
    username: Joi.string()
  })
});

module.exports = {
  createComment,
  updateIssue,
  assignUser,
  removeAssign,
  getUsernameById,
  markIssueAsPaid,
  changeState,
  addLabels,
  refreshAzureUserAccessToken
};

logger.buildService(module.exports);
