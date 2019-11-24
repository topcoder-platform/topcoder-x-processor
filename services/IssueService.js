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
const config = require('config');
const _ = require('lodash');
const Joi = require('joi');
const MarkdownIt = require('markdown-it');
const logger = require('../utils/logger');
const errors = require('../utils/errors');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const helper = require('../utils/helper');
const gitHelper = require('../utils/git-helper');
const userService = require('./UserService');
const eventService = require('./EventService');

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
 * @returns {boolean} true if the prizes can be parsed; or false otherwise
 * @private
 */
function parsePrizes(issue) {
  const matches = issue.title.match(/(\$[0-9]+)(?=.*\])/g);

  if (!matches || matches.length === 0) {
    return false;
  }

  issue.prizes = _.map(matches, (match) => parseInt(match.replace('$', ''), 10));
  issue.title = issue.title.replace(/^(\[.*\])/, '').trim();
  return true;
}

/**
 * check if challenge is exists for given issue in db/topcoder
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @param {Boolean} create create if not found
 * @returns {Promise<Object>} the found db issue if exists
 * @private
 */
async function ensureChallengeExists(event, issue, create = true) {
  logger.debug('Enter ensureChallengeExists to scan an issue record');
  logger.debug(`Enter ensureChallengeExists. Number: ${issue.number}`);
  logger.debug(`Enter ensureChallengeExists. provider: ${issue.provider}`);
  logger.debug(`Enter ensureChallengeExists. repositoryId: ${issue.repositoryId}`);

  let dbIssue = await dbHelper.scanOne(models.Issue, {
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  if (dbIssue && dbIssue.status === 'challenge_creation_pending') {
    logger.debug('dbIssue is PENDING');
    throw errors.internalDependencyError(`Challenge for the updated issue ${issue.number} is creating, rescheduling this event`);
  }
  if (dbIssue && dbIssue.status === 'challenge_creation_failed') {
    // remove issue from db
    await dbHelper.remove(models.Issue, {
      number: issue.number,
      provider: issue.provider,
      repositoryId: issue.repositoryId
    });
    dbIssue = null;
  }

  if (!dbIssue && create) {
    logger.debug('dbIssue is NULL, process to create new record and challenge');

    await handleIssueCreate(event, issue);
    dbIssue = await dbHelper.scanOne(models.Issue, {
      number: issue.number,
      provider: issue.provider,
      repositoryId: issue.repositoryId
    });
    logger.debug(`dbIssue is CREATED ${dbIssue ? 'Succesfully' : 'Failed'}`);
  }
  return dbIssue;
}

/**
 * gets the project detail
 * @param {Object} event the event data
 * @returns {Promise<Object>} the project detail
 * @private
 */
async function getProjectDetail(event) {
  const fullRepoUrl = gitHelper.getFullRepoUrl(event);
  const project = await dbHelper.scanOne(models.Project, {
    repoUrl: fullRepoUrl
  });

  return project;
}

/**
 * removes the current assignee if user is not found in topcoder X mapping.
 * user first need to sign up in Topcoder X
 * @param {Object} event the event
 * @param {Number} assigneeUserId the issue assignee id
 * @param {Object} issue the issue
 * @param {boolean} reOpen the flag whether to reopen the issue or not
 * @param {String} comment if any predefined message us there
 * @private
 */
async function rollbackAssignee(event, assigneeUserId, issue, reOpen = false, comment = null) {
  const assigneeUsername = await gitHelper.getUsernameById(event, assigneeUserId);
  if (!comment) {
    // comment on the git ticket for the user to self-sign up with the Topcoder x Self-Service tool
    comment = `@${assigneeUsername}, please sign-up with Topcoder X tool`;
  }
  await gitHelper.createComment(event, issue.number, comment);
  await gitHelper.removeAssign(event, issue.number, assigneeUserId, assigneeUsername);
  if (reOpen) {
    await eventService.reOpenIssue(event, issue);
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
 * @param {Boolean} force force to assign (if there is no OpenForPickup label)
 * @private
 */
async function handleIssueAssignment(event, issue, force = false) {
  const assigneeUserId = event.data.assignee.id;
  logger.debug(`Looking up TC handle of git user: ${assigneeUserId}`);
  const userMapping = await userService.getTCUserName(event.provider, assigneeUserId);
  if (userMapping && userMapping.topcoderUsername) {
    let dbIssue;
    try {
      dbIssue = await ensureChallengeExists(event, issue);

      if (!dbIssue) {
        const err = errors.internalDependencyError(`Can't find the issue in DB. It's not found or not accessible`);
        // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
        // Handle it for rescheduling.
        await eventService.handleEventGracefully(event, issue, err);
        return;
      }
  
      // Handle multiple assignees. TC-X allows only one assignee.
      if (event.data.issue.assignees && event.data.issue.assignees.length > 1) {
        const comment = 'Topcoder-X only supports a single assignee on a ticket to avoid issues with payment';
        await gitHelper.createComment(event, issue.number, comment);
        return;
      }

      // The assignees is updated but the assignee has already registered.
      if (dbIssue.assignee === issue.assignee) {
        logger.debug(`${userMapping.topcoderUsername} Already registered as assignee`);
        return;
      }

      // ensure issue has open for pickup label
      const hasOpenForPickupLabel = _(issue.labels).includes(config.OPEN_FOR_PICKUP_ISSUE_LABEL); // eslint-disable-line lodash/chaining
      const hasNotReadyLabel = _(issue.labels).includes(config.NOT_READY_ISSUE_LABEL); // eslint-disable-line lodash/chaining
      if (!hasOpenForPickupLabel && !force) {
        if (!issue.assignee) {
          const issueLabels = _(issue.labels).push(config.NOT_READY_ISSUE_LABEL).value(); // eslint-disable-line lodash/chaining
          const comment = `This ticket isn't quite ready to be worked on yet.Please wait until it has the ${config.OPEN_FOR_PICKUP_ISSUE_LABEL} label`;

          logger.debug(`Adding label ${config.NOT_READY_ISSUE_LABEL}`);
          await gitHelper.addLabels(event, issue.number, issueLabels);

          await rollbackAssignee(event, assigneeUserId, issue, false, comment);
        } else {
          logger.debug('Does not has Open for pickup but has assignee, remain labels');
          await gitHelper.addLabels(event, issue.number, issue.labels);

          if (!hasNotReadyLabel) { // eslint-disable-line max-depth
            const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
            const comment = `Contest ${contestUrl} has been updated - ${userMapping.topcoderUsername} has been unassigned.`;
            await rollbackAssignee(event, assigneeUserId, issue, false, comment);
          } else {
            const comment = `This ticket isn't quite ready to be worked on yet. Please wait until it has the ${config.OPEN_FOR_PICKUP_ISSUE_LABEL} label`;
            await rollbackAssignee(event, assigneeUserId, issue, false, comment);
          }
        }
        return;
      }

      logger.debug(`Getting the topcoder member ID for member name: ${userMapping.topcoderUsername}`);
      const topcoderUserId = await topcoderApiHelper.getTopcoderMemberId(userMapping.topcoderUsername);
      // Update the challenge
      logger.debug(`Assigning user to challenge: ${userMapping.topcoderUsername}`);
      topcoderApiHelper.assignUserAsRegistrant(topcoderUserId, dbIssue.challengeId);
      dbIssue = await dbHelper.update(models.Issue, dbIssue.id, {
        assignee: issue.assignee,
        assignedAt: new Date(),
        updatedAt: new Date()
      });

      // remove open for pickup and add assigned
      const updateLabels = _(issue.labels)
        .filter((i) => i !== config.OPEN_FOR_PICKUP_ISSUE_LABEL)
        .push(config.ASSIGNED_ISSUE_LABEL)
        .value();

      await gitHelper.addLabels(event, issue.number, updateLabels);
    } catch (err) {
      eventService.handleEventGracefully(event, issue, err);
      return;
    }
    const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
    const comment = `Contest ${contestUrl} has been updated - it has been assigned to ${userMapping.topcoderUsername}.`;
    await gitHelper.createComment(event, issue.number, comment);

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
  }
  if (parsedComment.isAcceptBid) {
    logger.debug(`Bid by ${parsedComment.assignedUser} is accepted with amount ${parsedComment.bidAmount} `);
    const newTitle = `[$${parsedComment.acceptedBidAmount}] ${issue.title}`;
    logger.debug(`updating issue: ${event.data.repository.name}/${issue.number}`);

    await gitHelper.updateIssue(event, issue.number, newTitle);

    // assign user
    logger.debug(`assigning user, ${parsedComment.assignedUser} to issue: ${event.data.repository.name}/${issue.number}`);
    await gitHelper.assignUser(event, issue.number, parsedComment.assignedUser);
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
    dbIssue = await ensureChallengeExists(event, issue, false);

    if (!dbIssue) {
      const err = errors.internalDependencyError(`Can't find the issue in DB. It's not found or not accessible`);
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Handle it for rescheduling.
      await eventService.handleEventGracefully(event, issue, err);
      return;
    }

    if (dbIssue.title === issue.title &&
      dbIssue.body === issue.body &&
      dbIssue.prizes.length === issue.prizes.length &&
      dbIssue.prizes[0] === issue.prizes[0]) {
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
    await dbHelper.update(models.Issue, dbIssue.id, {
      title: issue.title,
      body: issue.body,
      prizes: issue.prizes,
      labels: issue.labels,
      assignee: issue.assignee,
      updatedAt: new Date()
    });
  } catch (e) {
    await eventService.handleEventGracefully(event, issue, e);
    return;
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
    dbIssue = await ensureChallengeExists(event, issue);
    
    if (!dbIssue) {
      const err = errors.internalDependencyError(`Can't find the issue in DB. It's not found or not accessible`);
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Handle it for rescheduling.
      await eventService.handleEventGracefully(event, issue, err);
      return;
    }

    event.dbIssue = dbIssue;

    // if the issue has payment success or payment pending status, we'll ignore this process.
    if (dbIssue && dbIssue.status === 'challenge_payment_successful') {
      logger.debug(`Ignoring close issue processing. The issue has challenge_payment_successful.`);
      return;
    }
    if (dbIssue && dbIssue.status === 'challenge_payment_pending') {
      logger.debug(`Ignoring close issue processing. The issue has challenge_payment_pending.`);
      return;
    }

    if (!event.paymentSuccessful) {
      let closeChallenge = false;
      // if issue is closed without Fix accepted label
      if (!_.includes(event.data.issue.labels, config.FIX_ACCEPTED_ISSUE_LABEL) || _.includes(event.data.issue.labels, config.CANCELED_ISSUE_LABEL)) {
        logger.debug(`This issue ${issue.number} is closed without fix accepted label.`);
        let comment = 'This ticket was not processed for payment. If you would like to process it for payment,';
        comment += ' please reopen it, add the ```' + config.FIX_ACCEPTED_ISSUE_LABEL + '``` label, and then close it again';// eslint-disable-line
        await gitHelper.createComment(event, issue.number, comment);
        closeChallenge = true;
      }

      if (issue.prizes[0] === 0) {
        closeChallenge = true;
      }

      if (closeChallenge) {
        logger.debug(`The associated challenge ${dbIssue.challengeId} is being scheduled for cancellation since no payment will be given`);
        setTimeout(async () => {
          await topcoderApiHelper.cancelPrivateContent(dbIssue.challengeId);
          logger.debug(`The challenge ${dbIssue.challengeId} is deleted`);
        }, config.CANCEL_CHALLENGE_INTERVAL); //eslint-disable-line
        return;
      }

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
      logger.debug(`Getting the challenge meta-data for challenge ID : ${dbIssue.challengeId}`);

      const challenge = await topcoderApiHelper.getChallengeById(dbIssue.challengeId);
      if (challenge.currentStatus === 'Completed') {
        logger.debug('Challenge is already complete, so no point in trying to do anything further');
        return;
      }

      // update the issue status to payment pending to prevent double processing.
      await dbHelper.update(models.Issue, dbIssue.id, {
        status: 'challenge_payment_pending',
        updatedAt: new Date()
      });

      logger.debug(`Looking up TC handle of git user: ${event.data.assignee.id}`);
      const assigneeMember = await userService.getTCUserName(event.provider, event.data.assignee.id);
      event.assigneeMember = assigneeMember;

      // no mapping is found for current assignee remove assign, re-open issue and make comment
      // to assignee to login with Topcoder X
      if (!(assigneeMember && assigneeMember.topcoderUsername)) {
        await rollbackAssignee(event, event.data.assignee.id, issue, true);
      }

      // get project detail from db
      const project = await getProjectDetail(event);

      logger.debug(`Getting the billing account ID for project ID: ${project.tcDirectId}`);
      const accountId = await topcoderApiHelper.getProjectBillingAccountId(project.tcDirectId);

      logger.debug(`Assigning the billing account id ${accountId} to challenge`);

      // adding assignees as well if it is missed/failed during update
      // prize needs to be again set after adding billing account otherwise it won't let activate
      const updateBody = {
        billingAccountId: accountId,
        prizes: issue.prizes
      };
      await topcoderApiHelper.updateChallenge(dbIssue.challengeId, updateBody);

      const copilotAlreadySet = await topcoderApiHelper.roleAlreadySet(dbIssue.challengeId, 'Copilot');

      if (!copilotAlreadySet) {
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
      } else {
        logger.debug('Copilot is already set, so skipping');
      }

      logger.debug(`Getting the topcoder member ID for member name: ${assigneeMember.topcoderUsername}`);
      const winnerId = await topcoderApiHelper.getTopcoderMemberId(assigneeMember.topcoderUsername);
      const assigneeAlreadySet = await topcoderApiHelper.roleAlreadySet(dbIssue.challengeId, 'Submitter');

      if (!assigneeAlreadySet) {
        // adding reg
        logger.debug('Adding assignee because one was not set');
        await topcoderApiHelper.assignUserAsRegistrant(winnerId, dbIssue.challengeId);
      } else {
        logger.debug('Assignee is already set, so skipping');
      }

      // activate challenge
      if (challenge.currentStatus === 'Draft') {
        await topcoderApiHelper.activateChallenge(dbIssue.challengeId);
      }

      logger.debug(`Closing challenge with winner ${assigneeMember.topcoderUsername}(${winnerId})`);
      await topcoderApiHelper.closeChallenge(dbIssue.challengeId, winnerId);
      event.paymentSuccessful = true;
    }
  } catch (e) {
    event.paymentSuccessful = event.paymentSuccessful === true; // if once paid shouldn't be false
    // update the issue status to payment failed
    if (!event.paymentSuccessful) {
      await dbHelper.update(models.Issue, dbIssue.id, {
        status: 'challenge_payment_failed',
        updatedAt: new Date()
      });
    }
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  // Only update the label to paid if the payment successfully processed.
  if (event.paymentSuccessful) {
    try {
      logger.debug('update issue as paid');
      const labels = _(dbIssue.labels)
        .filter((i) => i !== config.OPEN_FOR_PICKUP_ISSUE_LABEL && i !== config.ASSIGNED_ISSUE_LABEL)
        .push(config.ASSIGNED_ISSUE_LABEL)
        .value();
      dbIssue = await dbHelper.update(models.Issue, dbIssue.id, {
        labels,
        status: 'challenge_payment_successful',
        updatedAt: new Date()
      });
      await gitHelper.markIssueAsPaid(event, issue.number, dbIssue.challengeId, labels);
    } catch (e) {
      await eventService.handleEventGracefully(event, issue, e);
      return;
    }
  }
}


/**
 * handles the issue create event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @param {Boolean} recreate indicate that the process is to recreate an issue
 * @private
 */
async function handleIssueCreate(event, issue, recreate = false) {
  // check if project for such repository is already created
  const project = await getProjectDetail(event);

  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }// if existing found don't create a project

  // Check if duplicated
  let dbIssue = await dbHelper.scanOne(models.Issue, {
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  if (dbIssue) {
    throw new Error(
      `Issue ${issue.number} is already in ${dbIssue.status}`);
  }

  // create issue with challenge creation pending
  const issueObject = _.assign({}, _.omit(issue, 'assignee'), {
    id: helper.generateIdentifier(),
    status: 'challenge_creation_pending'
  });
  dbIssue = await dbHelper.create(models.Issue, issueObject);

  const projectId = project.tcDirectId;

  let fullRepoUrl;
  if (issue.provider === 'github') {
    fullRepoUrl = `https://github.com/${event.data.repository.full_name}`;
  } else if (issue.provider === 'gitlab') {
    fullRepoUrl = `${config.GITLAB_API_BASE_URL}/${event.data.repository.full_name}`;
  }

  logger.debug(`existing project was found with id ${projectId} for repository ${event.data.repository.full_name}`);
  try {
    // Create a new challenge
    issue.challengeId = await topcoderApiHelper.createChallenge({
      name: issue.title,
      projectId,
      detailedRequirements: issue.body,
      prizes: issue.prizes,
      task: true,
      submissionGuidelines: `Git issue link: ${fullRepoUrl}/issues/${issue.number}`
    });

    // Save
    // update db payment
    await dbHelper.update(models.Issue, dbIssue.id, {
      challengeId: issue.challengeId,
      status: 'challenge_creation_successful',
      updatedAt: new Date()
    });
  } catch (e) {
    logger.error(`Challenge creation failure: ${e}`);
    await dbHelper.remove(models.Issue, {
      number: issue.number,
      provider: issue.provider,
      repositoryId: issue.repositoryId
    });
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }

  const contestUrl = getUrlForChallengeId(issue.challengeId);
  const comment = `Contest ${contestUrl} has been created for this ticket.`;
  await gitHelper.createComment(event, issue.number, comment);

  if (event.provider === 'gitlab' || recreate) {
    // if assignee is added during issue create then assign as well
    if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
      event.data.assignee = {
        id: event.data.issue.assignees[0].id
      };
      await handleIssueAssignment(event, issue, true);
    }
  }
  logger.debug(`new challenge created with id ${issue.challengeId} for issue ${issue.number}`);
}

/**
 * handles the issue label updated event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueLabelUpdated(event, issue) {
  let dbIssue;
  try {
    dbIssue = await ensureChallengeExists(event, issue, false);
  } catch (e) {
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  // Sometimes Github send label updated event before issue created event.
  // This process will be ignored. The label will be processed (stored) at hanleIssueCreated.
  if (!dbIssue) {
    logger.debug(`DB record not found. Issue label update ignored.`);
    return;
  }
  await dbHelper.update(models.Issue, dbIssue.id, {
    labels: issue.labels,
    updatedAt: new Date()
  });
}

/**
 * handles the issue un assignment event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueUnAssignment(event, issue) {
  let dbIssue;
  try {
    dbIssue = await ensureChallengeExists(event, issue);

    if (!dbIssue) {
      const err = errors.internalDependencyError(`Can't find the issue in DB. It's not found or not accessible`);
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Handle it for rescheduling.
      await eventService.handleEventGracefully(event, issue, err);
      return;
    }

    if (dbIssue.assignee) {
      const assigneeUserId = gitHelper.getUserIdByLogin(event, dbIssue.assignee);
      logger.debug(`Looking up TC handle of git user: ${assigneeUserId}`);
      const userMapping = await userService.getTCUserName(event.provider, assigneeUserId);

      // We still have assignee(s) left on the ticket.
      if (event.data.issue.assignees && event.data.issue.assignees.length > 0) {
        for (const assignee of event.data.issue.assignees) { // eslint-disable-line
          assignee.username = await gitHelper.getUsernameById(event, assignee.id);
        }
        if (_.find(event.data.issue.assignees, {username: dbIssue.assignee})) {
          return;
        }
      }

      if (userMapping && userMapping.topcoderUsername) {
        // remove assigned and add open for pickup
        const updateLabels = _(issue.labels)
          .filter((i) => i !== config.ASSIGNED_ISSUE_LABEL)
          .push(config.OPEN_FOR_PICKUP_ISSUE_LABEL)
          .value();
        issue.labels = updateLabels;
        logger.debug(`Getting the topcoder member ID for member name: ${userMapping.topcoderUsername}`);
        const topcoderUserId = await topcoderApiHelper.getTopcoderMemberId(userMapping.topcoderUsername);
        // Update the challenge to remove the assignee
        logger.debug(`un-assigning user from challenge: ${userMapping.topcoderUsername}`);
        topcoderApiHelper.removeResourceToChallenge(dbIssue.challengeId, {
          roleId: 1,
          resourceUserId: topcoderUserId
        });
        const contestUrl = getUrlForChallengeId(dbIssue.challengeId);
        const comment = `Contest ${contestUrl} has been updated - ${userMapping.topcoderUsername} has been unassigned.`;
        await gitHelper.createComment(event, issue.number, comment);
        await gitHelper.addLabels(event, issue.number, updateLabels);
        logger.debug(`Member ${userMapping.topcoderUsername} is unassigned from challenge with id ${dbIssue.challengeId}`);
      }
    } else {
      // Handle multiple assignees. TC-X allows only one assignee.
      if (event.data.issue.assignees && event.data.issue.assignees.length > 1) {
        const comment = 'Topcoder-X only supports a single assignee on a ticket to avoid issues with payment';
        await gitHelper.createComment(event, issue.number, comment);
        return;
      }

      // There is one left assignee. Register it to the system.
      if (event.data.issue.assignees && event.data.issue.assignees.length === 1) {
        event.data.assignee = event.data.issue.assignees[0];
        await handleIssueAssignment(event, issue);
        return;
      }
    }
  } catch (e) {
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  await dbHelper.update(models.Issue, dbIssue.id, {
    assignee: null,
    assignedAt: null,
    updatedAt: new Date()
  });

  // There is one left assignee. Register it to the system.
  if (event.data.issue.assignees && event.data.issue.assignees.length === 1) {
    event.data.assignee = event.data.issue.assignees[0];
    await handleIssueAssignment(event, issue);
    return;
  }
}

/**
 * handles the issue recreate event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueRecreate(event, issue) {
  const dbIssue = await dbHelper.scanOne(models.Issue, {
    number: issue.number,
    provider: issue.provider,
    repositoryId: issue.repositoryId
  });

  try {
    await dbIssue.delete();
  } catch (err) {
    // Just log the error, keep the process go on.
    logger.error(`Error cleaning the old DB and its challenge.\n ${err}`);
  }

  await handleIssueCreate(event, issue, true);
  // handleIssueLabelUpdated(event, issue);
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
    repositoryId: event.data.repository.id,
    labels: event.data.issue.labels
  };
  const fullRepoUrl = gitHelper.getFullRepoUrl(event);
  const project = await dbHelper.scanOne(models.Project, {
    repoUrl: fullRepoUrl
  });

  issue.projectId = project.id;

  // Parse prize from title
  const hasPrizes = parsePrizes(issue);
  // If the issue does not have prizes set, skip all processing
  if (!hasPrizes) {
    return;
  }
  const copilot = await userService.getRepositoryCopilotOrOwner(event.provider, event.data.repository.full_name);
  event.copilot = copilot;

  // Markdown the body
  issue.body = md.render(_.get(issue, 'body', ''));
  if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
    issue.assignee = await gitHelper.getUsernameById(event, event.data.issue.assignees[0].id);
  }
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
  } else if (event.event === 'issue.labelUpdated') {
    await handleIssueLabelUpdated(event, issue);
  } else if (event.event === 'issue.unassigned') {
    await handleIssueUnAssignment(event, issue);
  } else if (event.event === 'issue.recreated') {
    await handleIssueRecreate(event, issue);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('issue.created', 'issue.updated', 'issue.closed', 'comment.created', 'comment.updated', 'issue.assigned',
    'issue.labelUpdated', 'issue.unassigned', 'issue.recreated').required(),
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
    }),
    labels: Joi.array().items(Joi.string())
  }).required(),
  retryCount: Joi.number().integer().default(0).optional(),
  paymentSuccessful: Joi.boolean().default(false).optional(),
  challengeValid: Joi.boolean().default(false).optional(),
  dbIssue: Joi.object().optional(),
  assigneeMember: Joi.object().optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
