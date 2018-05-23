/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes incoming issue events.
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
const _ = require('lodash');
const Joi = require('joi');
const MarkdownIt = require('markdown-it');
const config = require('config');

const models = require('../models');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const gitHubService = require('./GithubService');
const emailService = require('./EmailService');
const ragnarService = require('./RagnarToolService');
const gitlabService = require('./GitlabService');

const Issue = models.Issue;
const md = new MarkdownIt();

/**
 * Generate the contest url, given the challenge id
 * @param {String} challengeId The id of the challenge in topcoder
 * @returns {String} The topcoder url to access the challenge
 * @private
 */
function getUrlForChallengeId(challengeId) {
  return `${config.TC_URL}/challenges/${challengeId}`;
}

/**
 * Parse the prize from issue title.
 * @param {Object} issue the issue
 * @private
 */
function parsePrizes(issue) {
  const matches = issue.title.match(/(\$[0-9]+)(?=.*\])/g);

  if (!matches || matches.length === 0) {
    throw new Error(`Cannot parse prize from title: ${issue.title}`);
  }

  issue.prizes = _.map(matches, (match) => parseInt(match.replace('$', ''), 10));
  issue.title = issue.title.replace(/^(\[.*\])/, '');
}

/**
 * Parse the comments from issue comment.
 * @param {Object} comment the comment
 * @returns {Object} the parsed comment
 * @private
 */
function parseComment(comment) {
  const parsedComment = {};

  parsedComment.isBid = /\/bid/.test(comment.body);
  if (parsedComment.isBid) {
    // parse bid amount
    const amountWithCommand = comment.body.match(/\/bid[ \t]+\$[0-9]+/g);
    if (!amountWithCommand || amountWithCommand.length === 0) {
      throw new Error(`Cannot parse bid amount from comment: '${comment.body}'`);
    }
    const numberPart = amountWithCommand[0].match(/\$[0-9]+/g)[0].replace('$', '');
    parsedComment.bidAmount = parseInt(numberPart, 10);
  }

  parsedComment.isAcceptBid = /\/accept_bid/.test(comment.body);
  if (parsedComment.isAcceptBid) {
    // eslint-disable-next-line no-useless-escape
    const command = comment.body.match(/\/accept_bid[ \t]+\@([^\s]+)[ \t]+\$[0-9]+/g);
    if (!command || command.length === 0) {
      throw new Error('Accept bid command is not valid');
    }
    // parse the accepted user
    // any word after @ till first space
    parsedComment.assignedUser = command[0].match(/@([^\s]+)/g)[0].replace('@', '');
    // parse accepted bid amount
    const numberPart = command[0].match(/\$[0-9]+/g)[0].replace('$', '');
    logger.debug(`parsed dollar amount out as ${numberPart}`);
    parsedComment.acceptedBidAmount = parseInt(numberPart, 10);
  }
  return parsedComment;
}

/**
 * handles the issue assignment
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueAssignment(event, issue) {
  const assigneeUserId = event.data.assignee.id;
  let assigneeUsername;
  if (event.provider === 'github') {
    assigneeUsername = await gitHubService.getUsernameById(event.copilot, assigneeUserId);
  } else {
    assigneeUsername = await gitlabService.getUsernameById(event.copilot, assigneeUserId);
  }
  logger.debug(`Looking up TC handle of github user: ${assigneeUsername}`);
  const userMapping = await ragnarService.getTCUserName(event.provider, assigneeUsername);
  if (userMapping && userMapping.topcoderUsername) {
    // take found git user's topcoder handle and update the challenge assignment
    const dbIssue = await Issue.findOne({
      number: issue.number,
      provider: issue.provider,
      repositoryId: issue.repositoryId
    });

    if (!dbIssue) {
      throw new Error(`there is no challenge for the assigned issue ${issue.number}`);
    }

    // Update the challenge
    logger.debug(`Assigning user to challenge: ${userMapping.topcoderUsername}`);
    await topcoderApiHelper.updateChallenge(dbIssue.challengeId, {
      // task: true,
      assignees: [userMapping.topcoderUsername]
    });

    const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
    const comment = `Contest ${contestUrl} has been updated - it has been assigned to ${userMapping.topcoderUsername}.`;
    await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);

    logger.debug(`Member ${userMapping.topcoderUsername} is assigned to challenge with id ${dbIssue.challengeId}`);
  } else {
    // comment on the git ticket for the user to self-sign up with the Topcoder x Self-Service tool
    const comment = `@${assigneeUsername}, please sign-up with Topcoder X tool`;
    if (event.provider === 'github') {
      await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
      // un-assign the user from the ticket
      await gitHubService.removeAssign(event.copilot, event.data.repository.name, issue.number, assigneeUsername);
    } else {
      await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
      // un-assign the user from the ticket
      await gitlabService.removeAssign(event.copilot, event.data.repository.id, issue.number, assigneeUserId);
    }
  }
}

/**
 * handles the issue comment event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueComment(event, issue) {
  const parsedComment = parseComment(event.data.comment);
  if (parsedComment.isBid) {
    logger.debug(`New bid is received with amount ${parsedComment.bidAmount}.`);
    await emailService.sendNewBidEmail(event.data, parsedComment.bidAmount);
  }
  if (parsedComment.isAcceptBid) {
    logger.debug(`Bid by ${parsedComment.assignedUser} is accepted with amount ${parsedComment.bidAmount} `);
    const newTitle = `[$${parsedComment.acceptedBidAmount}] ${issue.title}`;
    logger.debug(`updating issue: ${event.data.repository.name}/${issue.number}`);

    if (event.provider === 'github') {
      await gitHubService.updateIssue(event.copilot, event.data.repository.name, issue.number, newTitle);
    } else {
      await gitlabService.updateIssue(event.copilot, event.data.repository.id, issue.number, newTitle);
    }

    // assign user
    logger.debug(`assigning user, ${parsedComment.assignedUser} to issue: ${event.data.repository.name}/${issue.number}`);
    if (event.provider === 'github') {
      await gitHubService.assignUser(event.copilot, event.data.repository.name, issue.number, parsedComment.assignedUser);
    } else {
      const userId = await gitlabService.getUserIdByLogin(event.copilot, parsedComment.assignedUser);
      await gitlabService.assignUser(event.copilot, event.data.repository.id, issue.number, userId);
    }
  }
}

/**
 * handles the issue update event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueUpdate(event, issue) {
  // Updated issue
  const dbIssue = await Issue.findOne({
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  if (!dbIssue) {
    throw new Error(`there is no challenge for the updated issue ${issue.number}`);
  }

  if (_.isMatch(dbIssue, issue)) {
    // Title, body, prizes doesn't change, just ignore
    logger.debug(`nothing changed for issue ${issue.number}`);
    return;
  }

  // Update the challenge
  await topcoderApiHelper.updateChallenge(dbIssue.challengeId, {
    name: issue.title,
    detailedRequirements: issue.body,
    prizes: issue.prizes
  });

  // Save
  dbIssue.set({
    title: issue.title,
    body: issue.body,
    prizes: issue.prizes
  });
  await dbIssue.save();
  // comment on the git ticket for the user to self-sign up with the Topcoder x Self-Service tool
  const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
  const comment = `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`;
  if (event.provider === 'github') {
    await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
  } else {
    await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
  }

  logger.debug(`updated challenge ${dbIssue.challengeId} for for issue ${issue.number}`);
}

/**
 * handles the issue create event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueCreate(event, issue) {
  // check if project for such repository is already created

  let fullRepoUrl;
  if (issue.provider === 'github') {
    fullRepoUrl = `https://github.com/${event.data.repository.full_name}`;
  } else if (issue.provider === 'gitlab') {
    fullRepoUrl = `${config.GITLAB_API_BASE_URL}/${event.data.repository.full_name}`;
  }
  const project = await models.Project.findOne({
    repoUrl: fullRepoUrl
  });

  // Check if duplicated
  const dbIssue = await Issue.findOne({
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  if (dbIssue) {
    throw new Error(
      `challenge ${dbIssue.challengeId} existed already for the issue ${issue.number}`);
  }

  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }// if existing found don't create a project
  const projectId = project.tcDirectId;
  logger.debug(`existing project was found with id ${projectId} for repository ${event.data.repository.full_name}`);

  // Create a new challenge
  issue.challengeId = await topcoderApiHelper.createChallenge({
    name: issue.title,
    projectId,
    detailedRequirements: issue.body,
    prizes: issue.prizes,
    task: true
  }, issue.provider, event.data.repository.full_name);

  // Save
  await Issue.create(issue);

  const contestUrl = getUrlForChallengeId(issue.challengeId);
  const comment = `Contest ${contestUrl} has been created for this ticket.`;
  if (event.provider === 'github') {
    await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
  } else {
    await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
  }

  logger.debug(`new challenge created with id ${issue.challengeId} for issue ${issue.number}`);
}

/**
 * Process issue event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  const issue = {
    number: event.data.issue.number,
    title: event.data.issue.title,
    body: event.data.issue.body,
    provider: event.provider,
    repositoryId: event.data.repository.id
  };

  // Parse prize from title
  parsePrizes(issue);
  const copilot = await ragnarService.getRepositoryCopilot(event.provider, event.data.repository.full_name);
  event.copilot = copilot;

  // Markdown the body
  issue.body = md.render(_.get(issue, 'body', ''));

  if (event.event === 'issue.created') {
    await handleIssueCreate(event, issue);
  } else if (event.event === 'issue.updated') {
    await handleIssueUpdate(event, issue);
  } else if (event.event === 'comment.created' || event.event === 'comment.updated') {
    await handleIssueComment(event, issue);
  } else if (event.event === 'issue.assigned') {
    await handleIssueAssignment(event, issue);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('issue.created', 'issue.updated', 'comment.created', 'comment.updated', 'issue.assigned').required(),
  provider: Joi.string().valid('github', 'gitlab').required(),
  data: Joi.object().keys({
    issue: Joi.object().keys({
      number: Joi.number().required(),
      title: Joi.string().required(),
      body: Joi.string().allow(''),
      labels: Joi.array().items(Joi.string()),
      assignees: Joi.array().items(Joi.object().keys({
        id: Joi.number().required()
      })),
      owner: Joi.object().keys({
        id: Joi.number().required()
      })
    }).required(),
    repository: Joi.object().keys({
      id: Joi.number().required(),
      name: Joi.string().required(),
      full_name: Joi.string().required()
    }).required(),
    comment: Joi.object().keys({
      id: Joi.number().required(),
      body: Joi.string().allow(''),
      user: Joi.object().keys({
        id: Joi.number().required()
      })
    }),
    assignee: Joi.object().keys({
      id: Joi.number().required()
    })
  }).required()
});


module.exports = {
  process
};
