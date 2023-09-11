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


const USER_ROLE_TO_REDIRECT_URI_MAP = {
  owner: config.GITLAB_OWNER_USER_CALLBACK_URL,
  guest: config.GITLAB_GUEST_USER_CALLBACK_URL
};

/**
 * A schema for a Gitlab user, as stored in the TCX database.
 * @typedef {Object} User
 * @property {String} accessToken the access token
 * @property {Date} accessTokenExpiration the access token expiration date
 * @property {String} refreshToken the refresh token
 * @property {Number} userProviderId the user provider id
 * @property {String} topcoderUsername the topcoder username
 * @property {String} username the username
 * @property {String} type the type
 * @property {String} id the id
 * @property {String} role the role
 */

const USER_SCHEMA = Joi.object().keys({
  accessToken: Joi.string().required(),
  accessTokenExpiration: Joi.date().required(),
  refreshToken: Joi.string().required(),
  userProviderId: Joi.number().required(),
  topcoderUsername: Joi.string(),
  username: Joi.string().optional(),
  type: Joi.string().valid('gitlab').required(),
  id: Joi.string().optional(),
  role: Joi.string().valid('owner', 'guest').required()
}).required();

/**
 * @typedef {Object} ProjectWithId
 * @property {Number} id the project id
 */

const PROJECT_WITH_ID_SCHEMA = Joi.object().keys({
  id: Joi.number().positive().required()
}).unknown(true).required();

class GitlabService {
  /** @type {User} */
  #user = null;

  /** @type {Gitlab} */
  #gitlab = null;

  constructor(user) {
    if (!user) {
      throw new Error('User is required.');
    }
    Joi.attempt(user, USER_SCHEMA);
    this.#user = user;
  }

  /**
   * Helper method for initializing a GitlabService instance with an active
   * access token.
   * @param {User} user the user
   * @returns {Promise<GitlabService>} the GitlabService instance
   */
  static async create(user) {
    const svc = new GitlabService(user);
    try {
      await svc.refreshAccessToken();
      svc.#gitlab = new Gitlab({
        host: config.GITLAB_API_BASE_URL,
        oauthToken: user.accessToken
      });
      return svc;
    } catch (err) {
      throw errors.handleGitLabError(err, 'Authentication failed for Gitlab user');
    }
  }


  /**
   * Refresh the user access token if needed
   */
  async refreshAccessToken() {
    const user = this.#user;
    if (user.accessTokenExpiration && new Date().getTime() > user.accessTokenExpiration.getTime() -
      (config.GITLAB_REFRESH_TOKEN_BEFORE_EXPIRATION * MS_PER_SECOND)) {
      const query = {
        client_id: config.GITLAB_CLIENT_ID,
        client_secret: config.GITLAB_CLIENT_SECRET,
        refresh_token: user.refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: USER_ROLE_TO_REDIRECT_URI_MAP[user.role]
      };
      const refreshTokenResult = await request
        .post(`${config.GITLAB_API_BASE_URL}/oauth/token`)
        .query(query)
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
   * Removes assignees from issue
   * @param {Number} projectId the project id
   * @param {Number} issueId the issue number
   * @param {Array} assignees the users to remove
   * @private
   */
  async #removeAssignees(projectId, issueId, assignees) {
    try {
      const issue = await this.#gitlab.Issues.show(issueId, {projectId});
      const oldAssignees = _.difference(issue.assignee_ids, assignees);
      await this.#gitlab.Issues.edit(projectId, issueId, {assigneeIds: oldAssignees});
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
  #getIssueUrl(repoPath, issueId) {
    return `https://gitlab.com/${repoPath}/issues/${issueId}`;
  }

  /**
   * creates the comments on gitlab issue
   * @param {ProjectWithId} project the project object
   * @param {Number} issueId the issue number
   * @param {String} body the comment body text
   */
  async createComment(project, issueId, body) {
    Joi.attempt({project, issueId, body}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      body: Joi.string().required()
    });
    const projectId = project.id;
    try {
      body = helper.prepareAutomatedComment(body, this.#user);
      await this.#gitlab.IssueNotes.create(projectId, issueId, body);
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during creating comment on issue.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab comment is added on issue with message: "${body}"`);
  }

  /**
   * updates the title of gitlab issue
   * @param {ProjectWithId} project the project object
   * @param {Number} issueId the issue number
   * @param {String} title new title
   */
  async updateIssue(project, issueId, title) {
    Joi.attempt({project, issueId, title}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      title: Joi.string().required()
    });
    const projectId = project.id;
    try {
      await this.#gitlab.Issues.edit(projectId, issueId, {title});
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during updating issue.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab issue title is updated for issue number ${issueId}`);
  }

  /**
   * Assigns the issue to user login
   * @param {ProjectWithId} project the project object
   * @param {Number} issueId the issue number
   * @param {Number} userId the user id of assignee
   */
  async assignUser(project, issueId, userId) {
    Joi.attempt({project, issueId, userId}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      userId: Joi.number().required()
    });
    const projectId = project.id;
    try {
      const issue = await this.#gitlab.Issues.show(issueId, {projectId});
      const oldAssignees = _.without(issue.assignees.map((a) => a.id), userId);
      if (oldAssignees && oldAssignees.length > 0) {
        await this.#removeAssignees(projectId, issueId, oldAssignees);
      }
      await this.#gitlab.Issues.edit(projectId, issueId, {assigneeIds: [userId]});
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during assigning issue user.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab issue with number ${issueId} is assigned to ${issueId}`);
  }

  /**
   * Removes an assignee from the issue
   * @param {ProjectWithId} project the project object
   * @param {Number} issueId the issue number
   * @param {Number} userId the user id of assignee to remove
   */
  async removeAssign(project, issueId, userId) {
    Joi.attempt({project, issueId, userId}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      userId: Joi.number().required()
    });
    const projectId = project.id;
    await this.#removeAssignees(projectId, issueId, [userId]);
    logger.debug(`Gitlab user ${userId} is unassigned from issue number ${issueId}`);
  }

  /**
   * Gets the user name by user id
   * @param {Number} userId the user id
   * @returns {string} the username if found else null
   */
  async getUsernameById(userId) {
    Joi.attempt({userId}, {userId: Joi.number().required()});
    const user = await this.#gitlab.Users.show(userId);
    return user ? user.username : null;
  }

  /**
   * Gets the user id by username
   * @param {String} login the username
   * @returns {Number} the user id if found else null
   */
  async getUserIdByLogin(login) {
    Joi.attempt({login}, {login: Joi.string().required()});
    const user = await this.#gitlab.Users.all({username: login});
    return user.length ? user[0].id : null;
  }

  /** updates the gitlab issue as paid and fix accepted
   * @param {ProjectWithId} project the project object
   * @param {Number} issueId the issue number
   * @param {String} challengeUUID the challenge uuid
   * @param {Array} existLabels the issue labels
   * @param {String} winner the winner topcoder handle
   * @param {Boolean} createCopilotPayments the option to create copilot payments or not
   */
  async markIssueAsPaid(project, issueId, challengeUUID, existLabels, winner, createCopilotPayments) {
    Joi.attempt({project, issueId, challengeUUID, existLabels, winner, createCopilotPayments}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      challengeUUID: Joi.string().required(),
      existLabels: Joi.array().items(Joi.string()).required(),
      winner: Joi.string().required(),
      createCopilotPayments: Joi.boolean().default(false).optional()
    });
    const projectId = project.id;
    const labels = _(existLabels).filter((i) => i !== config.FIX_ACCEPTED_ISSUE_LABEL)
      .push(config.FIX_ACCEPTED_ISSUE_LABEL, config.PAID_ISSUE_LABEL).value();
    try {
      await this.#gitlab.Issues.edit(projectId, issueId, {labels});
      let commentMessage = '';

      commentMessage += `Payment task has been updated: ${config.TC_URL}/challenges/${challengeUUID}\n\n`;
      commentMessage += '*Payments Complete*\n\n';
      commentMessage += `Winner: ${winner}\n\n`;
      if (createCopilotPayments) {
        commentMessage += `Copilot: ${this.#user.topcoderUsername}\n\n`;
      }
      commentMessage += `Challenge \`${challengeUUID}\` has been paid and closed.`;

      const body = helper.prepareAutomatedComment(commentMessage, this.#user);
      await this.#gitlab.IssueNotes.create(projectId, issueId, body);
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during updating issue as paid.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab issue is updated for as paid and fix accepted for ${issueId}`);
  }

  /**
    * change the state of gitlab issue
    * @param {ProjectWithId} project the project object
    * @param {Number} issueId the issue issue id
    * @param {string} state new state
   */
  async changeState(project, issueId, state) {
    Joi.attempt({project, issueId, state}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      state: Joi.string().required()
    });
    const projectId = project.id;
    try {
      await this.#gitlab.Issues.edit(projectId, issueId, {stateEvent: state});
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during updating status of issue.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab issue state is updated to '${state}' for issue number ${issueId}`);
  }

  /**
    * updates the gitlab issue with new labels
    * @param {ProjectWithId} project the project object
    * @param {Number} issueId the issue issue id
    * @param {Number} labels the labels
    */
  async addLabels(project, issueId, labels) {
    Joi.attempt({project, issueId, labels}, {
      project: PROJECT_WITH_ID_SCHEMA,
      issueId: Joi.number().positive().required(),
      labels: Joi.array().items(Joi.string()).required()
    });
    const projectId = project.id;
    try {
      await this.#gitlab.Issues.edit(projectId, issueId, {labels: _.join(labels, ',')});
    } catch (err) {
      throw errors.handleGitLabError(
        err,
        'Error occurred during adding label in issue.',
        this.#user.topcoderUsername,
        this.#getIssueUrl(project.full_name, issueId)
      );
    }
    logger.debug(`Gitlab issue is updated with new labels for ${issueId}`);
  }

  /**
    * Get gitlab repository
    * @param {String} repoURL The repository URL
    */
  async getRepository(repoURL) {
    Joi.attempt({repoURL}, {repoURL: Joi.string().required()});
    const _repoURL = repoURL.replace(`${config.GITLAB_API_BASE_URL}/`, '');
    return await this.#gitlab.Projects.show(_repoURL);
  }

  /**
    * Add a user to a gitlab repository
    * @param {import('@gitbeaker/rest').ProjectSchema} repository The repository
    * @param {User} user The user
    * @param {import('@gitbeaker/rest').AccessLevel} accessLevel The user role
    */
  async addUserToRepository(repository, user, accessLevel) {
    Joi.attempt({repository, user, accessLevel}, {
      repository: Joi.object().required(),
      user: Joi.object().required(),
      accessLevel: Joi.number().required()
    });
    const member = await new Promise(async (resolve, reject) => {
      try {
        const res = await this.#gitlab.ProjectMembers.show(repository.id, user.userProviderId);
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
      await this.#gitlab.ProjectMembers.add(repository.id, user.userProviderId, accessLevel);
      return;
    }
    if (member.access_level !== accessLevel) {
      await this.#gitlab.ProjectMembers.edit(repository.id, user.userProviderId, accessLevel);
    }
  }

  /**
    * Fork a gitlab repository
    * @param {ProjectSchema} repository The repository
    */
  async forkRepository(repository) {
    Joi.attempt({repository}, {repository: Joi.object().required()});
    await this.#gitlab.Projects.fork(repository.id);
  }
}

module.exports = GitlabService;

logger.buildService(module.exports, true);
