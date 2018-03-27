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

const gitlab = GitlabAPI({
  url: config.GITLAB_API_BASE_URL,
  token: config.GITLAB_ADMIN_TOKEN
});

/**
 * Removes assignees from issue
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Array} assignees the users to remove
 * @private
 */
async function _removeAssignees(projectId, issueId, assignees) {
  const issue = await gitlab.projects.issues.show(projectId, issueId);
  const oldAssignees = _.difference(issue.assignee_ids, assignees);
  await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: oldAssignees});
}

/**
 * creates the comments on gitlab issue
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {string} body the comment body text
 */
async function createComment(projectId, issueId, body) {
  Joi.attempt({projectId, issueId, body}, createComment.schema);
  await gitlab.projects.issues.notes.create(projectId, issueId, {body});
  logger.debug(`Comment is added on issue with message "${body}"`);
}

createComment.schema = {
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  body: Joi.string().required()
};

/**
 * updates the title of gitlab issue
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {string} title new title
 */
async function updateIssue(projectId, issueId, title) {
  Joi.attempt({projectId, issueId, title}, updateIssue.schema);
  await gitlab.projects.issues.edit(projectId, issueId, {title});
  logger.debug(`Issue title is updated for issue number ${issueId}`);
}

updateIssue.schema = {
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user login
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee
 */
async function assignUser(projectId, issueId, userId) {
  Joi.attempt({projectId, issueId, userId}, assignUser.schema);
  const issue = await gitlab.projects.issues.show(projectId, issueId);
  const oldAssignees = _.without(issue.assignee_ids, userId);
  if (oldAssignees && oldAssignees.length > 0) {
    await _removeAssignees(projectId, issueId, oldAssignees);
  }
  await gitlab.projects.issues.edit(projectId, issueId, {assignee_ids: [userId]});
  logger.debug(`Issue with number ${issueId} is assigned to ${issueId}`);
}

assignUser.schema = {
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().positive().required(),
  userId: Joi.number().required()
};

/**
 * Removes an assignee from the issue
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee to remove
 */
async function removeAssign(projectId, issueId, userId) {
  Joi.attempt({projectId, issueId, userId}, removeAssign.schema);
  await _removeAssignees(projectId, issueId, [userId]);
  logger.debug(`User ${userId} is unassigned from issue number ${issueId}`);
}

removeAssign.schema = assignUser.schema;

/**
 * Gets the user name by user id
 * @param {Number} userId the user id
 * @returns {string} the username if found else null
 */
async function getUsernameById(userId) {
  Joi.attempt({userId}, getUsernameById.schema);
  const user = await gitlab.users.show(userId);
  return user ? user.username : null;
}

getUsernameById.schema = {
  userId: Joi.number().required()
};

/**
 * Gets the user id by username
 * @param {string} login the username
 * @returns {Number} the user id if found else null
 */
async function getUserIdByLogin(login) {
  Joi.attempt({login}, getUserIdByLogin.schema);
  const user = await gitlab.users.all({username: login});
  return user.length ? user[0].id : null;
}

getUserIdByLogin.schema = {
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
