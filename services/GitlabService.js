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
const {Gitlab} = require('@gitbeaker/rest');
const superagent = require('superagent');
const superagentPromise = require('superagent-promise');
const logger = require('../utils/logger');
const errors = require('../utils/errors');
const models = require('../models');
const helper = require('../utils/helper');
const dbHelper = require('../utils/db-helper');

const request = superagentPromise(superagent, Promise);
// milliseconds per second
const MS_PER_SECOND = 1000;

const copilotUserSchema = Joi.object().keys({
  accessToken: Joi.string().required(),
  accessTokenExpiration: Joi.date().required(),
  refreshToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string(),
  username: Joi.string().optional(),
  type: Joi.string().optional(),
  id: Joi.string().optional(),
  role: Joi.string().optional()
}).required();

/**
 * Refresh the user access token if needed
 * @param {Object} user the copilot
 * @returns {Promise} the promise result of copilot with refreshed token
 */
async function _refreshAccessToken(user) {
  if (user.accessTokenExpiration && new Date().getTime() > user.accessTokenExpiration.getTime() -
    (config.GITLAB_REFRESH_TOKEN_BEFORE_EXPIRATION * MS_PER_SECOND)) {
    const refreshTokenResult = await request
      .post(`${config.GITLAB_API_BASE_URL}/oauth/token`)
      .query({
        client_id: config.GITLAB_CLIENT_ID,
        client_secret: config.GITLAB_CLIENT_SECRET,
        refresh_token: user.refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: config.GITLAB_OWNER_USER_CALLBACK_URL
      })
      .end();
    // save user token data
    const expiresIn = refreshTokenResult.body.expires_in || config.GITLAB_ACCESS_TOKEN_DEFAULT_EXPIRATION;
    const updates = {
      accessToken: refreshTokenResult.body.access_token,
      accessTokenExpiration: new Date(new Date().getTime() + expiresIn * MS_PER_SECOND),
      refreshToken: refreshTokenResult.body.refresh_token
    };
    _.assign(user, updates);
    await dbHelper.update(models.User, user.id, updates);
  }
  return user;
}

/**
 * authenticate the gitlab using access token
 * @param {Object} user the user
 * @private
 */
async function _getClient(user) {
  try {
    const refreshedUser = await _refreshAccessToken(user);
    const gitlab = new Gitlab({
      host: config.GITLAB_API_BASE_URL,
      oauthToken: refreshedUser.accessToken
    });
    return gitlab;
  } catch (err) {
    throw errors.handleGitLabError(err, 'Failed to authenticate to Gitlab using access token of copilot.', err);
  }
}

/**
 * Removes assignees from issue
 * @param {import('@gitbeaker/core').Gitlab} gitlab the gitlab instance
 * @param {Number} projectId the project id
 * @param {Number} issueId the issue number
 * @param {Array} assignees the users to remove
 * @private
 */
async function _removeAssignees(gitlab, projectId, issueId, assignees) {
  try {
    const issue = await gitlab.Issues.show(issueId, {projectId});
    const oldAssignees = _.difference(issue.assignee_ids, assignees);
    await gitlab.Issues.edit(projectId, issueId, {assigneeIds: oldAssignees});
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during remove assignees from issue.');
  }
}

/**
 * Get gitlab issue url
 * @param {String} repoPath the repo path
 * @param {Number} issueId the issue number
 * @returns {String} the url
 * @private
 */
function _getIssueUrl(repoPath, issueId) {
  return `https://gitlab.com/${repoPath}/issues/${issueId}`;
}

/**
 * creates the comments on gitlab issue
 * @param {Object} copilot the copilot
 * @param {Object} project the project object
 * @param {Number} issueId the issue number
 * @param {string} body the comment body text
 */
async function createComment(copilot, project, issueId, body) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, body}, createComment.schema);
  const gitlab = await _getClient(copilot);
  try {
    body = helper.prepareAutomatedComment(body, copilot);
    await gitlab.IssueNotes.create(projectId, issueId, body);
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during creating comment on issue.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
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
 * @param {Object} project the project object
 * @param {Number} issueId the issue number
 * @param {string} title new title
 */
async function updateIssue(copilot, project, issueId, title) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, title}, updateIssue.schema);
  const gitlab = await _getClient(copilot);
  try {
    await gitlab.Issues.edit(projectId, issueId, {title});
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during updating issue.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
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
 * @param {Object} project the project object
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee
 */
async function assignUser(copilot, project, issueId, userId) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, userId}, assignUser.schema);
  const gitlab = await _getClient(copilot);
  try {
    const issue = await gitlab.Issues.show(issueId, {projectId});
    const oldAssignees = _.without(issue.assignees.map((a) => a.id), userId);
    if (oldAssignees && oldAssignees.length > 0) {
      await _removeAssignees(gitlab, projectId, issueId, oldAssignees);
    }
    await gitlab.Issues.edit(projectId, issueId, {assigneeIds: [userId]});
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during assigning issue user.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
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
 * @param {Object} project the project object
 * @param {Number} issueId the issue number
 * @param {Number} userId the user id of assignee to remove
 */
async function removeAssign(copilot, project, issueId, userId) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, userId}, removeAssign.schema);
  const gitlab = await _getClient(copilot);
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
  const gitlab = await _getClient(copilot);
  const user = await gitlab.Users.show(userId);
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
  const gitlab = await _getClient(copilot);
  const user = await gitlab.Users.all({username: login});
  return user.length ? user[0].id : null;
}

getUserIdByLogin.schema = {
  copilot: copilotUserSchema,
  login: Joi.string().required()
};

/**
 * updates the gitlab issue as paid and fix accepted
 * @param {Object} copilot the copilot
 * @param {Object} project the project object
 * @param {Number} issueId the issue number
 * @param {String} challengeUUID the challenge uuid
 * @param {Array} existLabels the issue labels
 * @param {String} winner the winner topcoder handle
 * @param {Boolean} createCopilotPayments the option to create copilot payments or not
 */
async function markIssueAsPaid(copilot, project, issueId, challengeUUID, existLabels, winner, createCopilotPayments) { // eslint-disable-line max-params
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, challengeUUID, existLabels, winner, createCopilotPayments}, markIssueAsPaid.schema);
  const gitlab = await _getClient(copilot);
  const labels = _(existLabels).filter((i) => i !== config.FIX_ACCEPTED_ISSUE_LABEL)
    .push(config.FIX_ACCEPTED_ISSUE_LABEL, config.PAID_ISSUE_LABEL).value();
  try {
    await gitlab.Issues.edit(projectId, issueId, {labels});
    let commentMessage = '';

    commentMessage += `Payment task has been updated: ${config.TC_URL}/challenges/${challengeUUID}\n\n`;
    commentMessage += '*Payments Complete*\n\n';
    commentMessage += `Winner: ${winner}\n\n`;
    if (createCopilotPayments) {
      commentMessage += `Copilot: ${copilot.topcoderUsername}\n\n`;
    }
    commentMessage += `Challenge \`${challengeUUID}\` has been paid and closed.`;

    const body = helper.prepareAutomatedComment(commentMessage, copilot);
    await gitlab.IssueNotes.create(projectId, issueId, body);
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during updating issue as paid.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
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
 * @param {Object} project the project object
 * @param {Number} issueId the issue issue id
 * @param {string} state new state
 */
async function changeState(copilot, project, issueId, state) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, state}, changeState.schema);
  const gitlab = await _getClient(copilot);
  try {
    await gitlab.Issues.edit(projectId, issueId, {stateEvent: state});
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during updating status of issue.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
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
 * @param {Object} project the project object
 * @param {Number} issueId the issue issue id
 * @param {Number} labels the labels
 */
async function addLabels(copilot, project, issueId, labels) {
  const projectId = project.id;
  Joi.attempt({copilot, projectId, issueId, labels}, addLabels.schema);
  const gitlab = await _getClient(copilot);
  try {
    await gitlab.Issues.edit(projectId, issueId, {labels: _.join(labels, ',')});
  } catch (err) {
    throw errors.handleGitLabError(err, 'Error occurred during adding label in issue.', copilot.topcoderUsername, _getIssueUrl(project.full_name, issueId));
  }
  logger.debug(`Gitlab issue is updated with new labels for ${issueId}`);
}

addLabels.schema = {
  copilot: copilotUserSchema,
  projectId: Joi.number().positive().required(),
  issueId: Joi.number().required(),
  labels: Joi.array().items(Joi.string()).required()
};

/**
 * Get gitlab repository
 * @param {Object} user The user
 * @param {Object} repoURL The repository URL
 */
async function getRepository(user, repoURL) {
  Joi.attempt({user, repoURL}, getRepository.schema);
  const gitlab = await _getClient(user);
  const _repoURL = repoURL.replace(`${config.GITLAB_API_BASE_URL}/`, '');
  return await gitlab.Projects.show(_repoURL);
}

getRepository.schema = {
  user: Joi.object().required(),
  repoURL: Joi.string().required()
};

/**
 * Add a user to a gitlab repository
 * @param {Object} copilot The copilot
 * @param {import('@gitbeaker/rest').ProjectSchema} repository The repository
 * @param {Object} user The user
 * @param {import('@gitbeaker/rest').AccessLevel} accessLevel The user role
 */
async function addUserToRepository(copilot, repository, user, accessLevel) {
  Joi.attempt({copilot, repository, user, accessLevel}, addUserToRepository.schema);
  const gitlab = await _getClient(copilot);
  const member = await new Promise(async (resolve, reject) => {
    try {
      const res = await gitlab.ProjectMembers.show(repository.id, user.userProviderId);
      resolve(res);
    } catch (err) {
      // eslint-disable-next-line no-magic-numbers
      if (_.get(err, 'cause.response.status') === 404) {
        resolve(null);
      }
      reject(err);
    }
  });
  if (!member) {
    await gitlab.ProjectMembers.add(repository.id, user.userProviderId, accessLevel);
    return;
  }
  if (member.access_level !== accessLevel) {
    await gitlab.ProjectMembers.edit(repository.id, user.userProviderId, accessLevel);
  }
}

addUserToRepository.schema = {
  copilot: copilotUserSchema,
  repository: Joi.object().required(),
  user: Joi.object().required(),
  accessLevel: Joi.number().required()
};

/**
 * Fork a gitlab repository
 * @param {Object} user The user
 * @param {ProjectSchema} repository The repository
 */
async function forkRepository(user, repository) {
  Joi.attempt({user, repository}, forkRepository.schema);
  const gitlab = await _getClient(user);
  await gitlab.Projects.fork(repository.id);
}

forkRepository.schema = {
  user: Joi.object().required(),
  repository: Joi.object().required()
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
  addLabels,
  getRepository,
  addUserToRepository,
  forkRepository
};

logger.buildService(module.exports);
