/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around gitlab api.
 * @author TCSCODER
 * @version 1.0
 */

const config = require('config');
const _ = require('lodash');
const Joi = require('joi');
const GitlabAPI = require('node-gitlab-api');
const logger = require('../utils/logger');
const errors = require('../utils/errors');
const helper = require('../utils/helper');

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string()
}).required();

/**
 * authenticate the gitlab using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the gitlab instance
 * @private
 */
async function _authenticate(accessToken) {
  try {
    const gitlab = GitlabAPI({
      url: config.GITLAB_API_BASE_URL,
      oauthToken: accessToken
    });
    return gitlab;
  } catch (err) {
    throw errors.convertGitLabError(err, 'Failed to during authenticate to Github using access token of copilot.');
  }
}

/**
 * Removes assignees from issue
 * @param {Object} gitlab the gitlab instance
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Array} assignees the users to remove
 * @private
 */
async function _removeAssignees(gitlab, projectId, issueId, assignees) {
  try {
    const issue = await gitlab.projects.issues.show(projectId, issueId);
    const oldAssignees = _.difference(issue.assignee_ids, assignees);
    await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: oldAssignees});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during remove assignees from issue.');
  }
}

/**
 * creates the comments on gitlab issue
 * @param {Object} copilot the copilot
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {string} body the comment body text
 */
async function createComment(copilot, projectId, issueId, body) {
  Joi.attempt({copilot, projectId, issueId, body}, createComment.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  try {
    body = helper.prepareAutomatedComment(body, copilot);
    await gitlab.projects.issues.notes.create(projectId, issueId, {body});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during creating comment on issue.');
  }
  logger.debug(`Gitlab comment is added on issue with message: "${body}"`);
}

createComment.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  body: Joi.string().required()
};

/**
 * updates the title of gitlab issue
 * @param {Object} copilot the copilot
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {string} title new title
 */
async function updateIssue(copilot, projectId, issueId, title) {
  Joi.attempt({copilot, projectId, issueId, title}, updateIssue.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  try {
    await gitlab.projects.issues.edit(projectId, issueId, {title});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during updating issue.');
  }
  logger.debug(`Gitlab issue title is updated for issue number ${issueId}`);
}

updateIssue.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user login
 * @param {Object} copilot the copilot
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee
 */
async function assignUser(copilot, projectId, issueId, userId) {
  Joi.attempt({copilot, projectId, issueId, userId}, assignUser.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  try {
    const issue = await gitlab.projects.issues.show(projectId, issueId);
    const oldAssignees = _.without(issue.assignee_ids, userId);
    if (oldAssignees && oldAssignees.length > 0) {
      await _removeAssignees(gitlab, projectId, issueId, oldAssignees);
    }
    await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: [userId]});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during assigning issue user.');
  }
  logger.debug(`Gitlab issue with number ${issueId} is assigned to ${issueId}`);
}

assignUser.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  userId: Joi.number().required()
};

/**
 * Removes an assignee from the issue
 * @param {Object} copilot the copilot
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee to remove
 */
async function removeAssign(copilot, projectId, issueId, userId) {
  Joi.attempt({copilot, projectId, issueId, userId}, removeAssign.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  await _removeAssignees(gitlab, projectId, issueId, [userId]);
  logger.debug(`Gitlab user ${userId} is unassigned from issue number ${issueId}`);
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
  const gitlab = await _authenticate(copilot.accessToken);
  const user = await gitlab.users.show(userId);
  return user ? user.username : null;
}

getUsernameById.schema = {
  copilot: copilotUserSchema,
  userId: Joi.number().required()
};

/**
 * Gets the user id by username
 * @param {Object} copilot the copilot
 * @param {string} login the username
 * @returns {Number} the user id if found else null
 */
async function getUserIdByLogin(copilot, login) {
  Joi.attempt({copilot, login}, getUserIdByLogin.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  const user = await gitlab.users.all({username: login});
  return user.length ? user[0].id : null;
}

getUserIdByLogin.schema = {
  copilot: copilotUserSchema,
  login: Joi.string().required()
};

/**
 * updates the gitlab issue as paid and fix accepted
 * @param {Object} copilot the copilot
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {String} challengeUUID the challenge uuid
 * @param {Array} existLabels the issue labels
 * @param {String} winner the winner topcoder handle
 * @param {Boolean} createCopilotPayments the option to create copilot payments or not
 */
async function markIssueAsPaid(copilot, projectId, issueId, challengeUUID, existLabels, winner, createCopilotPayments) { // eslint-disable-line max-params
  Joi.attempt({copilot, projectId, issueId, challengeUUID, existLabels, winner, createCopilotPayments}, markIssueAsPaid.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  const labels = _(existLabels).filter((i) => i !== config.FIX_ACCEPTED_ISSUE_LABEL)
    .push(config.FIX_ACCEPTED_ISSUE_LABEL, config.PAID_ISSUE_LABEL).value();
  try {
    await gitlab.projects.issues.edit(projectId, issueId, {labels: labels.join(',')});
    let commentMessage = '';

    commentMessage += `Payment task has been updated: ${config.TC_URL}/challenges/${challengeUUID}\n\n`;
    commentMessage += '*Payments Complete*\n\n';
    commentMessage += `Winner: ${winner}\n\n`;
    if (createCopilotPayments) {
      commentMessage += `Copilot: ${copilot.topcoderUsername}\n\n`;
    }
    commentMessage += `Challenge \`${challengeUUID}\` has been paid and closed.`;

    const body = helper.prepareAutomatedComment(commentMessage, copilot);
    await gitlab.projects.issues.notes.create(projectId, issueId, {body});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during updating issue as paid.');
  }
  logger.debug(`Gitlab issue is updated for as paid and fix accepted for ${issueId}`);
}

markIssueAsPaid.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  challengeUUID: Joi.string().required(),
  existLabels: Joi.array().items(Joi.string()).required(),
  winner: Joi.string().required(),
  createCopilotPayments: Joi.boolean().default(false).optional()
};

/**
 * change the state of gitlab issue
 * @param {Object} copilot the copilot
 * @param {string} projectId the project id
 * @param {Number} issueId the issue issue id
 * @param {string} state new state
 */
async function changeState(copilot, projectId, issueId, state) {
  Joi.attempt({copilot, projectId, issueId, state}, changeState.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  try {
    await gitlab.projects.issues.edit(projectId, issueId, {state_event: state});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during updating status of issue.');
  }
  logger.debug(`Gitlab issue state is updated to '${state}' for issue number ${issueId}`);
}

changeState.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  state: Joi.string().required()
};

/**
 * updates the gitlab issue with new labels
 * @param {Object} copilot the copilot
 * @param {string} projectId the project id
 * @param {Number} issueId the issue issue id
 * @param {Number} labels the labels
 */
async function addLabels(copilot, projectId, issueId, labels) {
  Joi.attempt({copilot, projectId, issueId, labels}, addLabels.schema);
  const gitlab = await _authenticate(copilot.accessToken);
  try {
    await gitlab.projects.issues.edit(projectId, issueId, {labels: _.join(labels, ',')});
  } catch (err) {
    throw errors.convertGitLabError(err, 'Error occurred during adding label in issue.');
  }
  logger.debug(`Gitlab issue is updated with new labels for ${issueId}`);
}

addLabels.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().required(),
  labels: Joi.array().items(Joi.string()).required()
};


module.exports = {
  createComment,
  updateIssue,
  assignUser,
  removeAssign,
  getUsernameById,
  getUserIdByLogin,
  markIssueAsPaid,
  changeState,
  addLabels
};

logger.buildService(module.exports);
