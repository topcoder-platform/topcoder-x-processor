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
async function removeAssignees(owner, repo, number, assignees) {
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
 * updates the title of github issue
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} title new title
 */
async function updateIssue(owner, repo, number, title) {
  Joi.attempt({owner, repo, number, title}, updateIssue.schema);
  await github.issues.edit({owner, repo, number, title});
  logger.debug(`Issue title is updated for issue number ${number}`);
}

updateIssue.schema = {
  owner: Joi.string().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user login
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function assignUser(owner, repo, number, user) {
  Joi.attempt({owner, repo, number, user}, assignUser.schema);
  const issue = await github.issues.get({owner, repo, number});
  const oldAssignees = _(issue.data.assignees).map('login').without(user).value();
  if (oldAssignees && oldAssignees.length > 0) {
    await removeAssignees(owner, repo, number, oldAssignees);
  }
  await github.issues.addAssigneesToIssue({owner, repo, number, assignees: [user]});
  logger.debug(`Issue with number ${number} is assigned to ${user}`);
}

assignUser.schema = {
  owner: Joi.string().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  user: Joi.string().required()
};

/**
 * Removes an assignee from the issue
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function removeAssign(owner, repo, number, user) {
  Joi.attempt({owner, repo, number, user}, removeAssign.schema);
  await removeAssignees(owner, repo, number, [user]);
  logger.debug(`User ${user} is unassigned from issue number ${number}`);
}

removeAssign.schema = assignUser.schema;

/**
 * creates the comments on github issue
 * @param {string} owner the owner
 * @param {string} repo the repository
 * @param {Number} number the issue number
 * @param {string} body the comment body text
 */
async function createComment(owner, repo, number, body) {
  Joi.attempt({owner, repo, number, body}, createComment.schema);
  await github.issues.createComment({owner, repo, number, body});
  logger.debug('Comment is added on issue notifying user to assign using Ranger tool');
}

createComment.schema = {
  owner: Joi.string().required(),
  repo: Joi.string().required(),
  number: Joi.number().required(),
  body: Joi.string().required()
};

module.exports = {
  updateIssue,
  assignUser,
  removeAssign,
  createComment
};
