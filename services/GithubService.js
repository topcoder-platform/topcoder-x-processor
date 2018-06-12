/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around github api.
 * @author TCSCODER
 * @version 1.0
 */

const _ = require('lodash');
const Joi = require('joi');
const GitHubApi = require('github');
const config = require('config');
const logger = require('../utils/logger');

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string()
}).required();

/**
 * authenticate the github using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the github instance
 * @private
 */
async function _authenticate(accessToken) {
  const github = new GitHubApi();
  github.authenticate({
    type: 'oauth',
    token: accessToken
  });
  return github;
}

/**
 * Removes assignees from issue
 * @param {Object} github the instance of github
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {Array} assignees the users to remove
 * @private
 */
async function _removeAssignees(github, owner, repo, number, assignees) {
  await github.issues.removeAssigneesFromIssue({
    owner,
    repo,
    number,
    body: {
      assignees
    }
  });
}

/**
 * gets the username of given user id
 * @param {Object} github the instance of github
 * @param {Number} id the user id
 * @returns {string} username if found
 */
async function _getUsernameById(github, id) {
  const user = await github.users.getById({id});
  return user ? user.data.login : null;
}

/**
 * updates the title of github issue
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} title new title
 */
async function updateIssue(copilot, repo, number, title) {
  Joi.attempt({copilot, repo, number, title}, updateIssue.schema);
  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);
  await github.issues.edit({owner, repo, number, title});
  logger.debug(`Github issue title is updated for issue number ${number}`);
}

updateIssue.schema = {
  copilot: copilotUserSchema,
  repo: Joi.string().required(),
  number: Joi.number().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function assignUser(copilot, repo, number, user) {
  Joi.attempt({copilot, repo, number, user}, assignUser.schema);
  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);

  const issue = await github.issues.get({owner, repo, number});
  const oldAssignees = _(issue.data.assignees).map('login').without(user).value();
  if (oldAssignees && oldAssignees.length > 0) {
    await _removeAssignees(github, owner, repo, number, oldAssignees);
  }
  await github.issues.addAssigneesToIssue({owner, repo, number, assignees: [user]});
  logger.debug(`Github issue with number ${number} is assigned to ${user}`);
}

assignUser.schema = {
  copilot: copilotUserSchema,
  repo: Joi.string().required(),
  number: Joi.number().required(),
  user: Joi.string().required()
};

/**
 * Removes an assignee from the issue
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function removeAssign(copilot, repo, number, user) {
  Joi.attempt({copilot, repo, number, user}, removeAssign.schema);

  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);

  await _removeAssignees(github, owner, repo, number, [user]);
  logger.debug(`Github user ${user} is unassigned from issue number ${number}`);
}

removeAssign.schema = assignUser.schema;

/**
 * creates the comments on github issue
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} body the comment body text
 */
async function createComment(copilot, repo, number, body) {
  Joi.attempt({copilot, repo, number, body}, createComment.schema);

  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);
  await github.issues.createComment({owner, repo, number, body});
  logger.debug(`Github comment is added on issue with message: "${body}"`);
}

createComment.schema = {
  copilot: copilotUserSchema,
  repo: Joi.string().required(),
  number: Joi.number().required(),
  body: Joi.string().required()
};

/**
 * Gets the user name by user id
 * @param {Object} copilot the copilot
 * @param {Number} userId the user id
 * @returns {string} the username if found else null
 */
async function getUsernameById(copilot, userId) {
  Joi.attempt({copilot, userId}, getUsernameById.schema);
  const github = await _authenticate(copilot.accessToken);
  const login = await _getUsernameById(github, userId);
  return login;
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
  const github = await _authenticate(copilot.accessToken);
  const user = await github.users.getForUser({username: login});
  return user.length ? user.id : null;
}

getUserIdByLogin.schema = {
  copilot: copilotUserSchema,
  login: Joi.string().required()
};

/**
 * updates the github issue as paid and fix accepted
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {Number} challengeId the challenge id
 */
async function markIssueAsPaid(copilot, repo, number, challengeId) {
  Joi.attempt({copilot, repo, number, challengeId}, markIssueAsPaid.schema);
  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);
  const labels = [config.PAID_ISSUE_LABEL, config.FIX_ACCEPTED_ISSUE_LABEL];
  await github.issues.edit({owner, repo, number, labels});
  const body = `Payment task has been updated: ${config.TC_OR_DETAIL_LINK}${challengeId}`;
  await github.issues.createComment({owner, repo, number, body});
  logger.debug(`Github issue title is updated for as paid and fix accepted for ${number}`);
}

markIssueAsPaid.schema = {
  copilot: copilotUserSchema,
  repo: Joi.string().required(),
  number: Joi.number().required(),
  challengeId: Joi.number().positive().required()
};

/**
 * change the state of github issue
 * @param {Object} copilot the copilot
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} state new state
 */
async function changeState(copilot, repo, number, state) {
  Joi.attempt({copilot, repo, number, state}, changeState.schema);
  const github = await _authenticate(copilot.accessToken);
  const owner = await _getUsernameById(github, copilot.userProviderId);
  await github.issues.edit({owner, repo, number, state});
  logger.debug(`Github issue state is updated to '${state}' for issue number ${number}`);
}

changeState.schema = {
  copilot: copilotUserSchema,
  repo: Joi.string().required(),
  number: Joi.number().required(),
  state: Joi.string().required()
};

module.exports = {
  updateIssue,
  assignUser,
  removeAssign,
  createComment,
  getUsernameById,
  getUserIdByLogin,
  markIssueAsPaid,
  changeState
};
