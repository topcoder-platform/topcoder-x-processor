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
const config = require('config');
const GitHubApi = require('github');
const logger = require('../utils/logger');

const github = new GitHubApi();
github.authenticate({
  type: 'oauth',
  token: config.GITHUB_ADMIN_TOKEN
});

/**
 * Removes assignees from issue
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {Array} assignees the users to remove
 * @private
 */
async function _removeAssignees(owner, repo, number, assignees) {
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
 * @param {Number} id the user id
 * @returns {string} username if found
 */
async function _getUsernameById(id) {
  const user = await github.users.getById({id});
  return user ? user.data.login : null;
}

/**
 * updates the title of github issue
 * @param {Number} ownerId the owner user id
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} title new title
 */
async function updateIssue(ownerId, repo, number, title) {
  Joi.attempt({ownerId, repo, number, title}, updateIssue.schema);
  const owner = await _getUsernameById(ownerId);
  await github.issues.edit({owner, repo, number, title});
  logger.debug(`Issue title is updated for issue number ${number}`);
}

updateIssue.schema = {
  ownerId: Joi.number().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user
 * @param {Number} ownerId the owner id
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function assignUser(ownerId, repo, number, user) {
  Joi.attempt({ownerId, repo, number, user}, assignUser.schema);
  const owner = await _getUsernameById(ownerId);

  const issue = await github.issues.get({owner, repo, number});
  const oldAssignees = _(issue.data.assignees).map('login').without(user).value();
  if (oldAssignees && oldAssignees.length > 0) {
    await _removeAssignees(owner, repo, number, oldAssignees);
  }
  await github.issues.addAssigneesToIssue({owner, repo, number, assignees: [user]});
  logger.debug(`Issue with number ${number} is assigned to ${user}`);
}

assignUser.schema = {
  ownerId: Joi.number().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  user: Joi.string().required()
};

/**
 * Removes an assignee from the issue
 * @param {Number} ownerId the owner id
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function removeAssign(ownerId, repo, number, user) {
  Joi.attempt({ownerId, repo, number, user}, removeAssign.schema);

  const owner = await _getUsernameById(ownerId);

  await _removeAssignees(owner, repo, number, [user]);
  logger.debug(`User ${user} is unassigned from issue number ${number}`);
}

removeAssign.schema = assignUser.schema;

/**
 * creates the comments on github issue
 * @param {Number} ownerId the owner user id
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} body the comment body text
 */
async function createComment(ownerId, repo, number, body) {
  Joi.attempt({ownerId, repo, number, body}, createComment.schema);

  const owner = await _getUsernameById(ownerId);

  await github.issues.createComment({owner, repo, number, body});
  logger.debug('Comment is added on issue notifying user to assign using Ragnar tool');
}

createComment.schema = {
  ownerId: Joi.number().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  body: Joi.string().required()
};

/**
 * Gets the user name by user id
 * @param {Number} userId the user id
 * @returns {string} the username if found else null
 */
async function getUsernameById(userId) {
  Joi.attempt({userId}, getUsernameById.schema);
  const login = await _getUsernameById(userId);
  return login;
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
  const user = await github.users.getForUser({username: login});
  return user.length ? user.id : null;
}

getUserIdByLogin.schema = {
  login: Joi.string().required()
};

module.exports = {
  updateIssue,
  assignUser,
  removeAssign,
  createComment,
  getUsernameById,
  getUserIdByLogin
};
