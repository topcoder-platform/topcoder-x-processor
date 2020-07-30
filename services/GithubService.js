/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods around github api.
 * @author TCSCODER
 * @version 1.0
 */

const config = require('config');
const _ = require('lodash');
const Joi = require('joi');
const GitHubApi = require('github');
const logger = require('../utils/logger');
const errors = require('../utils/errors');
const helper = require('../utils/helper');

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string()
}).required();

/**
 * parse the repository name and repoFullName owner
 * @param {String} fullName the full repository name
 * @returns {Object} the parsed data
 * @private
 */
function _parseRepoUrl(fullName) {
  const results = fullName.split('/');
  const repo = results[results.length - 1];
  const owner = _(results).slice(0, results.length - 1).join('/');
  return {owner, repo};
}

/**
 * authenticate the github using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the github instance
 * @private
 */
async function _authenticate(accessToken) {
  try {
    const github = new GitHubApi();
    github.authenticate({
      type: 'oauth',
      token: accessToken
    });
    return github;
  } catch (err) {
    throw errors.convertGitHubError(err, 'Failed to authenticate to Github using access token of copilot.');
  }
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
  try {
    await github.issues.removeAssigneesFromIssue({
      owner,
      repo,
      number,
      body: {
        assignees
      }
    });
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during remove assignees from issue.');
  }
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
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {string} title new title
 */
async function updateIssue(copilot, repoFullName, number, title) {
  Joi.attempt({copilot, repoFullName, number, title}, updateIssue.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  try {
    await github.issues.edit({owner, repo, number, title});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during updating issue.');
  }
  logger.debug(`Github issue title is updated for issue number ${number}`);
}

updateIssue.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  number: Joi.number().required(),
  title: Joi.string().required()
};

/**
 * Assigns the issue to user
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function assignUser(copilot, repoFullName, number, user) {
  Joi.attempt({copilot, repoFullName, number, user}, assignUser.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  try {
    const issue = await github.issues.get({owner, repo, number});

    const oldAssignees = _(issue.data.assignees).map('login').without(user).value();
    if (oldAssignees && oldAssignees.length > 0) {
      await _removeAssignees(github, owner, repo, number, oldAssignees);
    }
    await github.issues.addAssigneesToIssue({owner, repo, number, assignees: [user]});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during assigning issue user.');
  }
  logger.debug(`Github issue with number ${number} is assigned to ${user}`);
}

assignUser.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  number: Joi.number().required(),
  user: Joi.string().required()
};

/**
 * Removes an assignee from the issue
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {string} user the user login of assignee
 */
async function removeAssign(copilot, repoFullName, number, user) {
  Joi.attempt({copilot, repoFullName, number, user}, removeAssign.schema);

  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  await _removeAssignees(github, owner, repo, number, [user]);
  logger.debug(`Github user ${user} is unassigned from issue number ${number}`);
}

removeAssign.schema = assignUser.schema;

/**
 * creates the comments on github issue
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {string} body the comment body text
 */
async function createComment(copilot, repoFullName, number, body) {
  Joi.attempt({copilot, repoFullName, number, body}, createComment.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  try {
    body = helper.prepareAutomatedComment(body, copilot);
    await github.issues.createComment({owner, repo, number, body});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during creating comment on issue.');
  }
  logger.debug(`Github comment is added on issue with message: "${body}"`);
}

createComment.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
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
  return user.data ? user.data.id : null;
}

getUserIdByLogin.schema = {
  copilot: copilotUserSchema,
  login: Joi.string().required()
};

/**
 * updates the github issue as paid and fix accepted
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {Number} challengeId the challenge id
 * @param {Array} existLabels the issue labels
 * @param {String} winner the winner topcoder handle
 * @param {Boolean} createCopilotPayments the option to create copilot payments or not
 *
 */
async function markIssueAsPaid(copilot, repoFullName, number, challengeId, existLabels, winner, createCopilotPayments) { // eslint-disable-line max-params
  Joi.attempt({copilot, repoFullName, number, challengeId, existLabels, winner, createCopilotPayments}, markIssueAsPaid.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  const labels = _(existLabels).filter((i) => i !== config.FIX_ACCEPTED_ISSUE_LABEL)
      .push(config.FIX_ACCEPTED_ISSUE_LABEL, config.PAID_ISSUE_LABEL).value();
  try {
    await github.issues.edit({owner, repo, number, labels});
    let commentMessage = '```\n';
    commentMessage += '*Payments Complete*\n';
    commentMessage += `Winner: ${winner}\n`;
    if (createCopilotPayments) {
      commentMessage += `Copilot: ${copilot.topcoderUsername}\n`;
    }
    commentMessage += '```\n';
    commentMessage += `Payment task has been updated: ${config.TC_OR_DETAIL_LINK}${challengeId}`;

    const body = helper.prepareAutomatedComment(commentMessage, copilot);
    await github.issues.createComment({owner, repo, number, body});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during updating issue as paid.');
  }
  logger.debug(`Github issue title is updated for as paid and fix accepted for ${number}`);
}

markIssueAsPaid.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  number: Joi.number().required(),
  challengeId: Joi.number().positive().required(),
  existLabels: Joi.array().items(Joi.string()).required(),
  winner: Joi.string().required(),
  createCopilotPayments: Joi.boolean().default(false).optional()
};

/**
 * change the state of github issue
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {string} state new state
 */
async function changeState(copilot, repoFullName, number, state) {
  Joi.attempt({copilot, repoFullName, number, state}, changeState.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  try {
    await github.issues.edit({owner, repo, number, state});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during updating status of issue.');
  }
  logger.debug(`Github issue state is updated to '${state}' for issue number ${number}`);
}

changeState.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  number: Joi.number().required(),
  state: Joi.string().required()
};

/**
 * updates the github issue with new labels
 * @param {Object} copilot the copilot
 * @param {string} repoFullName the repository
 * @param {Number} number the issue number
 * @param {Number} labels the challenge id
 */
async function addLabels(copilot, repoFullName, number, labels) {
  Joi.attempt({copilot, repoFullName, number, labels}, addLabels.schema);
  const github = await _authenticate(copilot.accessToken);
  const {owner, repo} = _parseRepoUrl(repoFullName);
  try {
    await github.issues.edit({owner, repo, number, labels});
  } catch (err) {
    throw errors.convertGitHubError(err, 'Error occurred during adding label in issue.');
  }
  logger.debug(`Github issue is updated with new labels for ${number}`);
}

addLabels.schema = {
  copilot: copilotUserSchema,
  repoFullName: Joi.string().required(),
  number: Joi.number().required(),
  labels: Joi.array().items(Joi.string()).required()
};

module.exports = {
  updateIssue,
  assignUser,
  removeAssign,
  createComment,
  getUsernameById,
  getUserIdByLogin,
  markIssueAsPaid,
  changeState,
  addLabels
};

logger.buildService(module.exports);
