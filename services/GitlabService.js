/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around gitlab api.
 * @author TCSCODER
 * @version 1.0
 */

const _ = require('lodash');
const Joi = require('joi');
const config = require('config');
const GitlabAPI = require('node-gitlab-api');
const logger = require('../utils/logger');

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  userProviderId: Joi.number().required()
}).required();

/**
 * authenticate the gitlab using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the gitlab instance
 * @private
 */
async function _authenticate(accessToken) {
  const gitlab = GitlabAPI({
    url: config.GITLAB_API_BASE_URL,
    oauthToken: accessToken
  });
  return gitlab;
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
  const issue = await gitlab.projects.issues.show(projectId, issueId);
  const oldAssignees = _.difference(issue.assignee_ids, assignees);
  await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: oldAssignees});
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
  await gitlab.projects.issues.notes.create(projectId, issueId, {body});
  logger.debug(`Gitlab comment is added on issue with message "${body}"`);
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
  await gitlab.projects.issues.edit(projectId, issueId, {title});
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
  const issue = await gitlab.projects.issues.show(projectId, issueId);
  const oldAssignees = _.without(issue.assignee_ids, userId);
  if (oldAssignees && oldAssignees.length > 0) {
    await _removeAssignees(gitlab, projectId, issueId, oldAssignees);
  }
  await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: [userId]});
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

module.exports = {
  createComment,
  updateIssue,
  assignUser,
  removeAssign,
  getUsernameById,
  getUserIdByLogin
};
