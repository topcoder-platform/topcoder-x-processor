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
const errors = require('../utils/errors');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const gitHubService = require('./GithubService');
const emailService = require('./EmailService');
const userService = require('./UserService');
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
 * handles the event gracefully when there is error processing the event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @param {Object} err the error
 */
async function handleEventGracefully(event, issue, err) {
  if (err.errorAt === 'topcoder' || err.errorAt === 'processor') {
    event.retryCount = _.toInteger(event.retryCount);
    // reschedule event
    if (event.retryCount <= config.RETRY_COUNT) {
      logger.debug('Scheduling event for next retry');
      const newEvent = { ...event };
      newEvent.retryCount += 1;
      delete newEvent.copilot;
      setTimeout(async () => {
        const kafka = require('../utils/kafka'); // eslint-disable-line
        await kafka.send(JSON.stringify(newEvent));
        logger.debug('The event is scheduled for retry');
      }, config.RETRY_INTERVAL);
    }
    let comment = `[${err.statusCode}]: ${err.message}`;
    if (event.event === 'issue.closed' && event.paymentSuccessful === false) {
      comment = `Payment failed: ${comment}`;
    }
    if (event.retryCount === config.RETRY_COUNT) {
      // notify error in git host
      if (event.provider === 'github') {
        await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
      } else {
        await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
      }
    }
    if (event.event === 'issue.closed') {
      // reopen
      await reOpenIssue(event, issue);
      // ensure label is ready for review
      const readyForReviewLabels = [config.READY_FOR_REVIEW_ISSUE_LABEL];
      if (event.provider === 'github') {
        await gitHubService.addLabels(event.copilot, event.data.repository.name, issue.number, readyForReviewLabels);
      } else {
        await gitlabService.addLabels(event.copilot, event.data.repository.id, issue.number, readyForReviewLabels);
      }
    }
  }
  throw err;
}

/**
 * check if challenge is exists for given issue in db/topcoder
 * @param {Object} issue the issue
 * @returns {Object} the found db issue if exists
 * @private
 */
async function ensureChallengeExists(issue) {
  const dbIssue = await Issue.findOne({
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  if (!dbIssue) {
    throw errors.internalDependencyError(`there is no challenge for the updated issue ${issue.number}`);
  }
  return dbIssue;
}

/**
 * gets the project detail
 * @param {Object} issue the issue
 * @param {Object} event the event data
 * @returns {Object} the project detail
 * @private
 */
async function getProjectDetail(issue, event) {
  let fullRepoUrl;
  if (issue.provider === 'github') {
    fullRepoUrl = `https://github.com/${event.data.repository.full_name}`;
  } else if (issue.provider === 'gitlab') {
    fullRepoUrl = `${config.GITLAB_API_BASE_URL}/${event.data.repository.full_name}`;
  }
  const project = await models.Project.findOne({
    repoUrl: fullRepoUrl
  });
  return project;
}

/**
 * adds assignee as challenge registrant
 * @param {Number} topcoderUserId the topcoder user id
 * @param {Object} challengeId the challenge id
 * @private
 */
async function assignUserAsRegistrant(topcoderUserId, challengeId) {
  // role 1 from registrant
  const registrantBody = {
    roleId: 1,
    resourceUserId: topcoderUserId,
    phaseId: 0,
    addNotification: true,
    addForumWatch: true
  };
  await topcoderApiHelper.addResourceToChallenge(challengeId, registrantBody);
}

/**
 * re opens the issue
 * @param {Object} event the event
 * @param {Object} issue the issue
 */
async function reOpenIssue(event, issue) {
  if (event.provider === 'github') {
    await gitHubService.changeState(event.copilot, event.data.repository.name, issue.number, 'open');
  } else {
    await gitlabService.changeState(event.copilot, event.data.repository.id, issue.number, 'reopen');
  }
}

/**
 * removes the current assignee if user is not found in topcoder X mapping.
 * user first need to sign up in Topcoder X
 * @param {Object} event the event
 * @param {Number} assigneeUserId the issue assignee id
 * @param {Object} issue the issue
 * @param {boolean} reOpen the flag whether to reopen the issue or not
 * @private
 */
async function rollbackAssignee(event, assigneeUserId, issue, reOpen = false) {
  let assigneeUsername;
  if (event.provider === 'github') {
    assigneeUsername = await gitHubService.getUsernameById(event.copilot, assigneeUserId);
  } else {
    assigneeUsername = await gitlabService.getUsernameById(event.copilot, assigneeUserId);
  }
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
  if (reOpen) {
    await reOpenIssue(event, issue);
  }
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
  logger.debug(`Looking up TC handle of git user: ${assigneeUserId}`);
  const userMapping = await userService.getTCUserName(event.provider, assigneeUserId);
  if (userMapping && userMapping.topcoderUsername) {
    let dbIssue;
    try {
      dbIssue = await ensureChallengeExists(issue);

      logger.debug(`Getting the topcoder member ID for member name: ${userMapping.topcoderUsername}`);
      const topcoderUserId = await topcoderApiHelper.getTopcoderMemberId(userMapping.topcoderUsername);
      // Update the challenge
      logger.debug(`Assigning user to challenge: ${userMapping.topcoderUsername}`);
      assignUserAsRegistrant(topcoderUserId, dbIssue.challengeId);
    } catch (err) {
      handleEventGracefully(event, issue, err);
      return;
    }
    const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
    const comment = `Contest ${contestUrl} has been updated - it has been assigned to ${userMapping.topcoderUsername}.`;
    if (event.provider === 'github') {
      await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
    } else {
      await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
    }

    logger.debug(`Member ${userMapping.topcoderUsername} is assigned to challenge with id ${dbIssue.challengeId}`);
  } else {
    await rollbackAssignee(event, assigneeUserId, issue);
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
  let dbIssue;
  try {
    dbIssue = await ensureChallengeExists(issue);

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
  } catch (e) {
    await handleEventGracefully(event, issue, e);
    return;
  }
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
 * handles the issue closed event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueClose(event, issue) {
  let dbIssue;
  try {
    dbIssue = await ensureChallengeExists(issue);
    if (!event.paymentSuccessful) {
      // if issue is closed without assignee then do nothing
      if (!event.data.assignee.id) {
        logger.debug(`This issue ${issue.number} doesn't have assignee so ignoring this event.`);
        return;
      }
      // if issue has paid label don't process further
      if (_.includes(event.data.issue.labels, config.PAID_ISSUE_LABEL)) {
        logger.debug(`This issue ${issue.number} is already paid with challenge ${dbIssue.challengeId}`);
        return;
      }

      logger.debug(`Looking up TC handle of git user: ${event.data.assignee.id}`);
      const assigneeMember = await userService.getTCUserName(event.provider, event.data.assignee.id);

      // no mapping is found for current assignee remove assign, re-open issue and make comment
      // to assignee to login with Topcoder X
      if (!(assigneeMember && assigneeMember.topcoderUsername)) {
        await rollbackAssignee(event, event.data.assignee.id, issue, true);
      }

      // get project detail from db
      const project = await getProjectDetail(issue, event);

      logger.debug(`Getting the billing account ID for project ID: ${project.tcDirectId}`);
      const accountId = await topcoderApiHelper.getProjectBillingAccountId(project.tcDirectId);

      logger.debug(`assigning the billing account id ${accountId} to challenge`);

      // adding assignees as well if it is missed/failed during update
      // prize needs to be again set after adding billing account otherwise it won't let activate
      const updateBody = {
        billingAccountId: accountId,
        prizes: issue.prizes
      };
      await topcoderApiHelper.updateChallenge(dbIssue.challengeId, updateBody);

      logger.debug(`Getting the topcoder member ID for member name: ${assigneeMember.topcoderUsername}`);
      const winnerId = await topcoderApiHelper.getTopcoderMemberId(assigneeMember.topcoderUsername);

      logger.debug(`Getting the topcoder member ID for copilot name : ${event.copilot.topcoderUsername}`);
      // get copilot tc user id
      const copilotTopcoderUserId = await topcoderApiHelper.getTopcoderMemberId(event.copilot.topcoderUsername);

      // role id 14 for copilot
      const copilotResourceBody = {
        roleId: 14,
        resourceUserId: copilotTopcoderUserId,
        phaseId: 0,
        addNotification: true,
        addForumWatch: true
      };
      await topcoderApiHelper.addResourceToChallenge(dbIssue.challengeId, copilotResourceBody);

      // adding reg
      await assignUserAsRegistrant(winnerId, dbIssue.challengeId);

      // activate challenge
      await topcoderApiHelper.activateChallenge(dbIssue.challengeId);

      logger.debug(`close challenge with winner ${assigneeMember.topcoderUsername}(${winnerId})`);
      await topcoderApiHelper.closeChallenge(dbIssue.challengeId, winnerId);
      event.paymentSuccessful = true;
    }
  } catch (e) {
    event.paymentSuccessful = event.paymentSuccessful === true; // if once paid shouldn't be false
    await handleEventGracefully(event, issue, e, event.paymentSuccessful);
    return;
  }
  try {
    logger.debug('update issue as paid');
    if (event.provider === 'github') {
      await gitHubService.markIssueAsPaid(event.copilot, event.data.repository.name, issue.number, dbIssue.challengeId);
    } else {
      await gitlabService.markIssueAsPaid(event.copilot, event.data.repository.id, issue.number, dbIssue.challengeId);
    }
  } catch (e) {
    await handleEventGracefully(event, issue, e, event.paymentSuccessful);
    return;
  }
}


/**
 * handles the issue create event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueCreate(event, issue) {
  // check if project for such repository is already created
  const project = await getProjectDetail(issue, event);

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
  try {
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
  } catch (e) {
    await handleEventGracefully(event, issue, e);
    return;
  }

  const contestUrl = getUrlForChallengeId(issue.challengeId);
  const comment = `Contest ${contestUrl} has been created for this ticket.`;
  if (event.provider === 'github') {
    await gitHubService.createComment(event.copilot, event.data.repository.name, issue.number, comment);
  } else {
    await gitlabService.createComment(event.copilot, event.data.repository.id, issue.number, comment);
  }
  if (event.provider === 'gitlab') {
    // if assignee is added during issue create then assign as well
    if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
      event.data.assignee = {
        id: event.data.issue.assignees[0].id
      };
      await handleIssueAssignment(event, issue);
    }
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
  const copilot = await userService.getRepositoryCopilot(event.provider, event.data.repository.full_name);
  event.copilot = copilot;

  // Markdown the body
  issue.body = md.render(_.get(issue, 'body', ''));

  if (event.event === 'issue.created') {
    await handleIssueCreate(event, issue);
  } else if (event.event === 'issue.updated') {
    await handleIssueUpdate(event, issue);
  } else if (event.event === 'issue.closed') {
    await handleIssueClose(event, issue);
  } else if (event.event === 'comment.created' || event.event === 'comment.updated') {
    await handleIssueComment(event, issue);
  } else if (event.event === 'issue.assigned') {
    await handleIssueAssignment(event, issue);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('issue.created', 'issue.updated', 'issue.closed', 'comment.created', 'comment.updated', 'issue.assigned').required(),
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
      id: Joi.number().required().allow(null)
    })
  }).required(),
  retryCount: Joi.number().integer().default(0).optional(),
  paymentSuccessful: Joi.boolean().default(false).optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
