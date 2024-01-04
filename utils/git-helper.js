/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
/**
 * This module is the wrapper for git services.
 *
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
'use strict';

const config = require('config');
const gitHubService = require('../services/GithubService');
const GitlabService = require('../services/GitlabService');
const azureService = require('../services/AzureService');

class GitHelper {
  /**
   * Creates the comments on github/gitlab issue
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {String} comment the comment body text
   */
  async createComment(event, issueNumber, comment) {
    if (event.provider === 'github') {
      await gitHubService.createComment(event.copilot, event.data.repository.full_name, issueNumber, comment);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.createComment(event.data.repository, issueNumber, comment);
    }
  }

  /**
   * Updates the github/gitlab issue with new labels
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {Array} labels the labels
   */
  async addLabels(event, issueNumber, labels) {
    if (event.provider === 'github') {
      await gitHubService.addLabels(event.copilot, event.data.repository.full_name, issueNumber, labels);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.addLabels(event.data.repository, issueNumber, labels);
    }
  }

  /**
   * Change the state of github/gitlab issue to open
   * @param {Object} event the event
   * @param {Object} issue the issue
   */
  async reOpenIssue(event, issue) {
    if (event.provider === 'github') {
      await gitHubService.changeState(event.copilot, event.data.repository.full_name, issue.number, 'open');
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.changeState(event.data.repository, issue.number, 'reopen');
    }
  }

  /**
   * Gets the user name by user id
   * @param {Object} event the event
   * @param {Number} assigneeUserId the user id
   * @returns {Promise<String>} the username
   */
  async getUsernameById(event, assigneeUserId) {
    if (event.provider === 'github') {
      return await gitHubService.getUsernameById(event.copilot, assigneeUserId);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      return await gitlabService.getUsernameById(assigneeUserId);
    }
    return null;
  }

  /**
   * Removes an assignee from the issue
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {Number} assigneeUserId the user id
   * @param {String} assigneeUsername the username
   */
  async removeAssign(event, issueNumber, assigneeUserId, assigneeUsername) {
    if (event.provider === 'github') {
      await gitHubService.removeAssign(event.copilot, event.data.repository.full_name, issueNumber, assigneeUsername);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.removeAssign(event.data.repository, issueNumber, assigneeUserId);
    }
  }

  /**
   * updates the title of github/gitlab issue
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {String} newTitle the issue's new title
   */
  async updateIssue(event, issueNumber, newTitle) {
    if (event.provider === 'github') {
      await gitHubService.updateIssue(event.copilot, event.data.repository.full_name, issueNumber, newTitle);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.updateIssue(event.data.repository, issueNumber, newTitle);
    }
  }

  /**
   * Assigns the issue to user
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {String} assignedUser the username
   */
  async assignUser(event, issueNumber, assignedUser) {
    if (event.provider === 'github') {
      await gitHubService.assignUser(event.copilot, event.data.repository.full_name, issueNumber, assignedUser);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      const userId = await gitlabService.getUserIdByLogin(event.copilot, assignedUser);
      await gitlabService.assignUser(event.data.repository, issueNumber, userId);
    }
  }

  /**
   * updates the github/gitlab issue as paid and fix accepted
   * @param {Object} event the event
   * @param {Number} issueNumber the issue Number
   * @param {String} challengeUUID the challenge id
   * @param {Array} existLabels the exist labels of the issue
   * @param {String} winner the winner topcoder handle
   * @param {Boolean} createCopilotPayments the option to create copilot payments or not
   */
  async markIssueAsPaid(event, issueNumber, challengeUUID, existLabels, winner, createCopilotPayments = false) {
    if (event.provider === 'github') {
      await gitHubService.markIssueAsPaid(event.copilot, event.data.repository.full_name, issueNumber, challengeUUID, existLabels, winner,
        createCopilotPayments);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      await gitlabService.markIssueAsPaid(event.data.repository, issueNumber, challengeUUID, existLabels, winner,
        createCopilotPayments);
    } else if (event.provider === 'azure') {
      await azureService.markIssueAsPaid(event.copilot, event.data.repository.full_name, issueNumber, challengeUUID, existLabels);
    }
  }

  /**
   * Returns repository full url
   * @param {Object} event the event
   * @returns {String} the repository full url
   */
  getFullRepoUrl(event) {
    if (event.provider === 'github') {
      return `https://github.com/${event.data.repository.full_name}`;
    } else if (event.provider === 'gitlab') {
      return `${config.GITLAB_API_BASE_URL}/${event.data.repository.full_name}`;
    }
    return null;
  }

  /**
   * Returns userid by login
   * @param {Object} event the event
   * @param {String} assignee the username
   * @returns {Promise<Number>}
   */
  async getUserIdByLogin(event, assignee) {
    if (event.provider === 'github') {
      return await gitHubService.getUserIdByLogin(event.copilot, assignee);
    } else if (event.provider === 'gitlab') {
      const gitlabService = await GitlabService.create(event.copilot);
      return gitlabService.getUserIdByLogin(assignee);
    }
    return null;
  }
}

module.exports = new GitHelper();
