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

const Issue = models.Issue;
const Project = models.Project;
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
  if (event.provider !== 'github') {
    throw new Error(`This provider ${event.provider} is not supported`);
  }
  const assigneeUsername = event.data.assignee.name;
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
    logger.debug(`Assinging user to challenge: ${userMapping.topcoderUsername}`);
    await topcoderApiHelper.updateChallenge(dbIssue.challengeId, {
      // task: true,
      assignees: [userMapping.topcoderUsername]
    });

    const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
    const comment = `Contest ${contestUrl} has been updated - it has been assigned to @${userMapping.topcoderUsername}.`;
    await gitHubService.createComment(event.data.issue.owner.name, event.data.repository.name, issue.number, comment);

    logger.debug(`Member ${userMapping.topcoderUsername} is assigned to challenge with id ${dbIssue.challengeId}`);
  } else {
    // comment on the git ticket for the user to self-sign up with the Ragnar Self-Service tool
    const comment = `@${assigneeUsername}, please sign-up with Ragnar Self-service tool`;
    await gitHubService.createComment(event.data.issue.owner.name, event.data.repository.name, issue.number, comment);
    // un-assign the user from the ticket
    await gitHubService.removeAssign(event.data.issue.owner.name, event.data.repository.name, issue.number, assigneeUsername);
  }
}

/**
 * handles the issue comment event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueComment(event, issue) {
  if (event.provider !== 'github') {
    throw new Error(`This provider ${event.provider} is not supported`);
  }
  const parsedComment = parseComment(event.data.comment);
  if (parsedComment.isBid) {
    logger.debug(`New bid is received with amount ${parsedComment.bidAmount}.`);
    await emailService.sendNewBidEmail(event.data, parsedComment.bidAmount);
  }
  if (parsedComment.isAcceptBid) {
    logger.debug(`Bid by ${parsedComment.assignedUser} is accepted with amount ${parsedComment.bidAmount} `);
    const newTitle = `[$${parsedComment.acceptedBidAmount}] ${issue.title}`;
    logger.debug(`updating issue: ${event.data.repository.name}/${issue.number}`);
    await gitHubService.updateIssue(event.data.issue.owner.name, event.data.repository.name, issue.number, newTitle);
    // assign user
    logger.debug(`assigning user, ${event.data.issue.owner.name} to issue: ${event.data.repository.name}/${issue.number}`);
    await gitHubService.assignUser(event.data.issue.owner.name, event.data.repository.name, issue.number, parsedComment.assignedUser);
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
  // comment on the git ticket for the user to self-sign up with the Ragnar Self-Service tool
  const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
  const comment = `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`;
  await gitHubService.createComment(event.data.issue.owner.name, event.data.repository.name, issue.number, comment);

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
  const project = await Project.findOne({
    provider: issue.provider,
    repositoryId: issue.repositoryId
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
  let projectId;
  if (project) { // if existing found don't create a project
    projectId = project.projectId;
    logger.debug(`existing project was found with id ${projectId} for repository ${event.data.repository.full_name}`);
  } else {
    // Create a new project
    projectId = await topcoderApiHelper.createProject(event.data.repository.full_name);

    // save project and repository mapping in db
    await Project.create({
      projectId,
      provider: issue.provider,
      repositoryId: issue.repositoryId
    });

    logger.debug(`new project created with id ${projectId} for issue ${issue.number}`);
  }

  // Create a new challenge
  issue.challengeId = await topcoderApiHelper.createChallenge({
    name: issue.title,
    projectId,
    detailedRequirements: issue.body,
    prizes: issue.prizes,
    task: true
  });

  // Save
  await Issue.create(issue);

  const contestUrl = getUrlForChallengeId(issue.challengeId);
  const comment = `Contest ${contestUrl} has been created for this ticket.`;
  await gitHubService.createComment(event.data.issue.owner.name, event.data.repository.name, issue.number, comment);

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
        id: Joi.number().required(),
        name: Joi.string()
      })),
      owner: Joi.object().keys({
        id: Joi.number().required(),
        name: Joi.string()
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
        id: Joi.number().required(),
        name: Joi.string()
      })
    }),
    assignee: Joi.object().keys({
      id: Joi.number().required(),
      name: Joi.string().required()
    })
  }).required()
});


module.exports = {
  process
};
