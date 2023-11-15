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
const logger = require('../utils/logger');
const errors = require('../utils/errors');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const helper = require('../utils/helper');
const gitHelper = require('../utils/git-helper');
const constants = require('../constants');
const userService = require('./UserService');
const eventService = require('./EventService');


// A variable to store issue creation lock to prevent duplicate creation process.
// The key is `${provider}-${repositoryId}-${number}`. The value is True.
const issueCreationLock = {};

/**
 * Generate the contest url, given the challenge id
 * @param {Object} issue The issue
 * @returns {String} The topcoder url to access the challenge
 * @private
 */
function getUrlForChallengeId(issue) {
  return `${config.TC_URL}/challenges/${issue.challengeUUID}`;
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
  logger.debugWithContext('Enter ensureChallengeExists to scan an issue record', event, issue);
  logger.debugWithContext(`Enter ensureChallengeExists. Number: ${issue.number}`, event, issue);
  logger.debugWithContext(`Enter ensureChallengeExists. provider: ${issue.provider}`, event, issue);
  logger.debugWithContext(`Enter ensureChallengeExists. repositoryId: ${issue.repositoryId}`, event, issue);

  let dbIssue = await dbHelper.queryOneIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);
  logger.debugWithContext(`DB Issue number: ${issue.number}`, event, issue);
  logger.debugWithContext(`DB Issue provider: ${issue.provider}`, event, issue);
  logger.debugWithContext(`DB Issue repository: ${issue.repositoryId}`, event, issue);

  if (dbIssue && dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_CREATION_PENDING) {
    logger.debugWithContext('dbIssue is PENDING', event, issue);
    throw errors.internalDependencyError(`Challenge for the updated issue ${issue.number} is creating, rescheduling this event`);
  }
  const hasOpenForPickupLabel = _.includes(issue.labels, config.OPEN_FOR_PICKUP_ISSUE_LABEL);
  if (dbIssue && dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_CREATION_FAILED && hasOpenForPickupLabel) {
    // remove issue from db
    await dbHelper.removeIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);
    dbIssue = null;
  }
  if (dbIssue && dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_CANCELLED) {
    dbIssue = null;
  }

  if (!dbIssue && create) {
    logger.debugWithContext('dbIssue is NULL, process to create new record and challenge', event, issue);

    await handleIssueCreate(event, issue, true);
    dbIssue = await dbHelper.queryOneIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);
    logger.debugWithContext(`dbIssue is CREATED ${dbIssue ? 'Successfully' : 'Failed'}`, event, issue);
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
  const project = await dbHelper.queryOneActiveProject(models.Project, fullRepoUrl);

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
  logger.debugWithContext(`Looking up TC handle of git user: ${assigneeUserId}`, event, issue);
  const userMapping = await userService.getTCUserName(event.provider, assigneeUserId);
  if (userMapping && userMapping.topcoderUsername) {
    let dbIssue;
    try {
      dbIssue = await ensureChallengeExists(event, issue);

      if (!dbIssue) {
        const err = errors.internalDependencyError('Can\'t find the issue in DB. It\'s not found or not accessible');
        // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
        // Handle it for rescheduling.
        if (issue.tcxReady) {
          await eventService.handleEventGracefully(event, issue, err);
        }
        return;
      }
      // if the issue has payment success we'll ignore this process.
      if (dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL) {
        logger.debugWithContext('Ignoring this issue processing. The issue has challenge_payment_successful.', event, issue);
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
        logger.debugWithContext(`${userMapping.topcoderUsername} Already registered as assignee`, event, issue);
        return;
      }
      const hasAssignedLabel = _.includes(issue.labels, config.ASSIGNED_ISSUE_LABEL);
      // Gitlab doesn't send separate unassignment hook if we unassigne and assigne users in the same step
      // in result new assignee was not handled previously
      if (dbIssue.assignee && event.provider === 'gitlab' && dbIssue.assignee !== assigneeUserId && hasAssignedLabel) {
        await handleIssueUnAssignment(event, issue);
        return;
      }
      // The github issue has registered assignee. Ignore it.
      // If there is assignee changes, it will be handled at handleIssueUnassignment and this func will be called again.
      if (dbIssue.assignee) {
        return;
      }
      // ensure issue has open for pickup label
      const hasOpenForPickupLabel = _(issue.labels).includes(config.OPEN_FOR_PICKUP_ISSUE_LABEL); // eslint-disable-line lodash/chaining
      const hasNotReadyLabel = _(issue.labels).includes(config.NOT_READY_ISSUE_LABEL); // eslint-disable-line lodash/chaining
      if (!hasOpenForPickupLabel && !force) {
        if (!issue.assignee) {
          const issueLabels = _(issue.labels).push(config.NOT_READY_ISSUE_LABEL).value(); // eslint-disable-line lodash/chaining
          const comment = `This ticket isn't quite ready to be worked on yet.Please wait until it has the ${config.OPEN_FOR_PICKUP_ISSUE_LABEL} label`;

          logger.debugWithContext(`Adding label ${config.NOT_READY_ISSUE_LABEL}`, event, issue);
          await gitHelper.addLabels(event, issue.number, issueLabels);

          await rollbackAssignee(event, assigneeUserId, issue, false, comment);
        } else {
          logger.debugWithContext('Does not has Open for pickup but has assignee, remain labels', event, issue);
          await gitHelper.addLabels(event, issue.number, issue.labels);

          if (!hasNotReadyLabel) { // eslint-disable-line max-depth
            const contestUrl = getUrlForChallengeId(dbIssue);
            const comment = `Challenge ${contestUrl} ${userMapping.topcoderUsername} has been unassigned.`;
            await rollbackAssignee(event, assigneeUserId, issue, false, comment);
            const additionalComment = `${userMapping.topcoderUsername} has been unassigned because this ticket doesn't have the ${config.OPEN_FOR_PICKUP_ISSUE_LABEL} label.`; // eslint-disable-line max-len
            await gitHelper.createComment(event, issue.number, additionalComment);
          } else {
            const comment = `This ticket isn't quite ready to be worked on yet. Please wait until it has the ${config.OPEN_FOR_PICKUP_ISSUE_LABEL} label`;
            await rollbackAssignee(event, assigneeUserId, issue, false, comment);
          }
        }
        return;
      }

      logger.debugWithContext(`Getting the topcoder member ID for member name: ${userMapping.topcoderUsername}`, event, issue);
      // Update the challenge
      logger.debugWithContext(`Assigning user to challenge: ${userMapping.topcoderUsername}`, event, issue);
      await topcoderApiHelper.assignUserAsRegistrant(userMapping.topcoderUsername, dbIssue.challengeUUID);
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
    const contestUrl = getUrlForChallengeId(dbIssue);
    const comment = `Challenge ${contestUrl} has been assigned to ${userMapping.topcoderUsername}.`;
    await gitHelper.createComment(event, issue.number, comment);

    logger.debugWithContext(`Member ${userMapping.topcoderUsername} is assigned to challenge with id ${dbIssue.challengeUUID}`, event, issue);
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
    logger.debugWithContext(`New bid is received with amount ${parsedComment.bidAmount}.`, event, issue);
  }
  if (parsedComment.isAcceptBid) {
    logger.debugWithContext(`Bid by ${parsedComment.assignedUser} is accepted with amount ${parsedComment.bidAmount} `, event, issue);
    const newTitle = `[$${parsedComment.acceptedBidAmount}] ${issue.title}`;
    logger.debugWithContext(`updating issue: ${event.data.repository.name}/${issue.number}`, event, issue);

    await gitHelper.updateIssue(event, issue.number, newTitle);

    // assign user
    logger.debugWithContext(`assigning user, ${parsedComment.assignedUser} to issue: ${event.data.repository.name}/${issue.number}`, event, issue);
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
    dbIssue = await ensureChallengeExists(event, issue, true);

    if (!dbIssue) {
      const err = errors.internalDependencyError('Can\'t find the issue in DB. It\'s not found or not accessible');
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Handle it for rescheduling.
      if (issue.tcxReady) {
        await eventService.handleEventGracefully(event, issue, err);
      }
      return;
    }
    // if the issue has payment success we'll ignore this process.
    if (dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL) {
      logger.debugWithContext('Ignoring this issue processing. The issue has challenge_payment_successful.', event, issue);
      return;
    }
    if (dbIssue.title === issue.title &&
      dbIssue.body === issue.body &&
      dbIssue.prizes.length === issue.prizes.length &&
      dbIssue.prizes[0] === issue.prizes[0]) {
      // Title, body, prizes doesn't change, just ignore
      logger.debugWithContext(`nothing changed for issue ${issue.number}`, event, issue);
      return;
    }

    // Update the challenge
    await topcoderApiHelper.updateChallenge(dbIssue.challengeUUID, {
      name: issue.title,
      description: issue.body,
      prizeSets: [{
        type: 'placement',
        prizes: _.map(issue.prizes, (prize) => ({type: 'USD', value: prize}))
      }]
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

  logger.debugWithContext(`updated challenge ${dbIssue.challengeUUID} for for issue ${issue.number}`, event, issue);
}


/**
 * handles the issue closed event
 * @param {Object} event the event
 * @param {Object} issue the issue
 * @private
 */
async function handleIssueClose(event, issue) { // eslint-disable-line
  let dbIssue;
  try {
    dbIssue = await ensureChallengeExists(event, issue);

    if (!dbIssue) {
      const err = errors.internalDependencyError('Can\'t find the issue in DB. It\'s not found or not accessible');
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Handle it for rescheduling.
      if (issue.tcxReady) {
        await eventService.handleEventGracefully(event, issue, err);
      }
      return;
    }

    event.dbIssue = dbIssue;

    // if the issue has payment success or payment pending status, we'll ignore this process.
    if (dbIssue && dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL) {
      logger.debugWithContext('Ignoring close issue processing. The issue has challenge_payment_successful.', event, issue);
      return;
    }
    if (dbIssue && dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_PENDING) {
      logger.debugWithContext('Ignoring close issue processing. The issue has challenge_payment_pending.', event, issue);
      return;
    }

    if (!event.paymentSuccessful) {
      let closeChallenge = false;
      // if issue is closed without Fix accepted and cancel label
      if (!_.includes(event.data.issue.labels, config.FIX_ACCEPTED_ISSUE_LABEL) && !_.includes(event.data.issue.labels, config.CANCELED_ISSUE_LABEL)) {
        logger.debugWithContext(`This issue ${issue.number} is closed without fix accepted label.`, event, issue);
        let comment = 'This ticket was not processed for payment. If you would like to process it for payment,';
        comment += ' please reopen it, add the ```' + config.FIX_ACCEPTED_ISSUE_LABEL + '``` label, and then close it again';// eslint-disable-line
        await gitHelper.createComment(event, issue.number, comment);
        return;
      }

      // if issue is close with cancelled label
      if (_.includes(event.data.issue.labels, config.CANCELED_ISSUE_LABEL)) {
        const comment = `Challenge ${dbIssue.challengeUUID} has been cancelled`;
        await topcoderApiHelper.cancelPrivateContent(dbIssue.challengeUUID);
        await gitHelper.createComment(event, issue.number, comment);
        // update the issue status to payment pending to prevent double processing.
        await dbHelper.update(models.Issue, dbIssue.id, {
          status: constants.ISSUE_STATUS.CHALLENGE_CANCELLED,
          updatedAt: new Date()
        });
        closeChallenge = true;
      }

      if (issue.prizes[0] === 0) {
        closeChallenge = true;
      }

      if (closeChallenge) {
        logger.debugWithContext(`The associated challenge ${dbIssue.challengeUUID} is being scheduled for cancellation since no payment will be given`,
          event, issue);
        await dbHelper.update(models.Issue, dbIssue.id, {
          status: constants.ISSUE_STATUS.CHALLENGE_CANCELLED,
          updatedAt: new Date()
        });
        return;
      }

      // if issue is closed without assignee then do nothing
      if (!event.data.assignee.id) {
        logger.debugWithContext(`This issue ${issue.number} doesn't have assignee so ignoring this event.`, event, issue);
        return;
      }

      // if issue has paid label don't process further
      if (_.includes(event.data.issue.labels, config.PAID_ISSUE_LABEL)) {
        logger.debugWithContext(`This issue ${issue.number} is already paid with challenge ${dbIssue.challengeUUID}`, event, issue);
        return;
      }
      logger.debugWithContext(`Getting the challenge meta-data for challenge ID : ${dbIssue.challengeUUID}`, event, issue);

      const challenge = await topcoderApiHelper.getChallengeById(dbIssue.challengeUUID);
      if (challenge.status === constants.CHALLENGE_STATUS.COMPLETED) {
        logger.debugWithContext('Challenge is already complete, so no point in trying to do anything further', event, issue);
        return;
      }

      // update the issue status to payment pending to prevent double processing.
      await dbHelper.update(models.Issue, dbIssue.id, {
        status: constants.ISSUE_STATUS.CHALLENGE_PAYMENT_PENDING,
        updatedAt: new Date()
      });

      logger.debugWithContext(`Looking up TC handle of git user: ${event.data.assignee.id}`, event, issue);
      const assigneeMember = await userService.getTCUserName(event.provider, event.data.assignee.id);
      event.assigneeMember = assigneeMember;

      // no mapping is found for current assignee remove assign, re-open issue and make comment
      // to assignee to login with Topcoder X
      if (!(assigneeMember && assigneeMember.topcoderUsername)) {
        await rollbackAssignee(event, event.data.assignee.id, issue, true);
      }

      // get project detail from db
      const project = await getProjectDetail(event);

      // adding assignees as well if it is missed/failed during update
      // prize needs to be again set after adding billing account otherwise it won't let activate
      const updateBody = {
        prizeSets: [{
          type: 'placement',
          prizes: _.map(issue.prizes, (prize) => ({type: 'USD', value: prize}))
        }]
      };
      await topcoderApiHelper.updateChallenge(dbIssue.challengeUUID, updateBody);

      const createCopilotPayments = project.createCopilotPayments === 'true' &&
            event.copilot.topcoderUsername.toLowerCase() !== assigneeMember.topcoderUsername.toLowerCase();
      event.createCopilotPayments = createCopilotPayments;

      if (createCopilotPayments) {
        logger.debugWithContext('Setting copilot payment');

        const _updateBody = {
          prizeSets: [{
            type: 'placement',
            prizes: _.map(issue.prizes, (prize) => ({type: 'USD', value: prize}))
          },
          {
            type: 'copilot',
            prizes: [{type: 'USD', value: 40}]
          }
          ]
        };
        await topcoderApiHelper.updateChallenge(dbIssue.challengeUUID, _updateBody);
      } else {
        logger.debugWithContext('Create copilot payments is unchecked on the Topcoder-X project setup, so skipping', event, issue);
      }

      logger.debugWithContext(`Getting the topcoder member ID for member name: ${assigneeMember.topcoderUsername}`, event, issue);
      const winnerId = await topcoderApiHelper.getTopcoderMemberId(assigneeMember.topcoderUsername);
      const assigneeAlreadySet = await topcoderApiHelper.roleAlreadySet(dbIssue.challengeUUID, config.ROLE_ID_SUBMITTER);

      if (!assigneeAlreadySet) {
        // adding reg
        logger.debugWithContext('Adding assignee because one was not set', event, issue);
        await topcoderApiHelper.assignUserAsRegistrant(assigneeMember.topcoderUsername, dbIssue.challengeUUID);
      } else {
        logger.debugWithContext('Assignee is already set, so skipping', event, issue);
      }

      // activate challenge

      if (challenge.status === 'Draft') {
        await topcoderApiHelper.activateChallenge(dbIssue.challengeUUID);
        // HACK - sleep 30 seconds so the legacy processor has time to "catch up"
        // logger.debugWithContext('Sleeping for 1 seconds after activation so everything propagates...', event, issue);
        // await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.debugWithContext(`Closing challenge with winner ${assigneeMember.topcoderUsername}(${winnerId})`, event, issue);
      await topcoderApiHelper.closeChallenge(dbIssue.challengeUUID, winnerId, assigneeMember.topcoderUsername);
      event.paymentSuccessful = true;
    }
  } catch (e) {
    event.paymentSuccessful = event.paymentSuccessful === true; // if once paid shouldn't be false
    // update the issue status to payment failed
    if (!event.paymentSuccessful && dbIssue && dbIssue.id) {
      await dbHelper.update(models.Issue, dbIssue.id, {
        status: constants.ISSUE_STATUS.CHALLENGE_PAYMENT_FAILED,
        updatedAt: new Date()
      });
    }
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  // Only update the label to paid if the payment successfully processed.
  if (event.paymentSuccessful) {
    try {
      logger.debugWithContext('update issue as paid', event, issue);
      const labels = _(dbIssue.labels)
        .filter((i) => i !== config.OPEN_FOR_PICKUP_ISSUE_LABEL && i !== config.ASSIGNED_ISSUE_LABEL)
        .push(config.ASSIGNED_ISSUE_LABEL)
        .value();
      dbIssue = await dbHelper.update(models.Issue, dbIssue.id, {
        labels,
        status: constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL,
        updatedAt: new Date()
      });
      await gitHelper.markIssueAsPaid(event, issue.number, dbIssue.challengeUUID, labels, event.assigneeMember.topcoderUsername,
        event.createCopilotPayments);
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
 * @param {Boolean} forceAssign force the creation process to assign user
 * @private
 */
async function handleIssueCreate(event, issue, forceAssign = false) {
  // check if project for such repository is already created
  const project = await getProjectDetail(event);

  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }// if existing found don't create a project

  // Check if duplicated
  let dbIssue = await dbHelper.queryOneIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);

  if (dbIssue && dbIssue.status !== constants.ISSUE_STATUS.CHALLENGE_CANCELLED) {
    throw new Error(
      `Issue ${issue.number} is already in ${dbIssue.status}`);
  }

  if (!issue.tcxReady) {
    logger.debugWithContext('The issue doesn\'t have tcx_ labels. Creation ignored.', event, issue);
    return;
  }

  const creationLockKey = `${issue.provider}-${issue.repositoryId}-${issue.number}`;
  if (issueCreationLock[creationLockKey]) {
    throw new Error(
      `Issue ${creationLockKey} is creating.`);
  }
  issueCreationLock[creationLockKey] = true;

  try {
    // create issue with challenge creation pending
    const issueObject = _.assign({}, _.omit(issue, 'assignee'), {
      id: helper.generateIdentifier(),
      status: constants.ISSUE_STATUS.CHALLENGE_CREATION_PENDING
    });

    if (!dbIssue) {
      dbIssue = await dbHelper.create(models.Issue, issueObject);
    } else if (dbIssue && dbIssue.status !== 'challenge_cancelled') {
      await dbHelper.update(models.Issue, dbIssue.id, {
        status: constants.ISSUE_STATUS.CHALLENGE_CREATION_PENDING,
        updatedAt: new Date()
      });
    }

    const projectId = project.tcDirectId;

    logger.debugWithContext(`existing project was found with id ${projectId} for repository ${event.data.repository.full_name}`, event, issue);

    // Create a new challenge
    issue.challengeUUID = await topcoderApiHelper.createChallenge({
      name: issue.title,
      projectId,
      tags: project.tags ? project.tags.map((tag) => tag.name) : [],
      detailedRequirements: issue.body,
      prizes: issue.prizes
    });

    // Apply skills to the challenge
    await topcoderApiHelper.applySkillsSetToChallenge(issue.challengeUUID, project.tags);

    // Save
    // update db payment
    await dbHelper.update(models.Issue, dbIssue.id, {
      challengeUUID: issue.challengeUUID,
      status: constants.ISSUE_STATUS.CHALLENGE_CREATION_SUCCESSFUL,
      updatedAt: new Date()
    });

    logger.debugWithContext(`Adding copilot to issue: ${event.copilot.topcoderUsername}`, event, issue);
    // get copilot tc user id
    await topcoderApiHelper.addResourceToChallenge(issue.challengeUUID, event.copilot.topcoderUsername, config.ROLE_ID_COPILOT);
    await topcoderApiHelper.addResourceToChallenge(issue.challengeUUID, event.copilot.topcoderUsername, config.ROLE_ID_ITERATIVE_REVIEWER);
  } catch (e) {
    logger.error(`Challenge creation failure: ${e}`);
    delete issueCreationLock[creationLockKey];
    await dbHelper.removeIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  try {
    const contestUrl = getUrlForChallengeId(issue);
    const comment = `Challenge ${contestUrl} has been created for this ticket.`;
    await gitHelper.createComment(event, issue.number, comment);

    if (event.provider === 'gitlab' || forceAssign) {
      // if assignee is added during issue create then assign as well
      if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
        event.data.assignee = {
          id: event.data.issue.assignees[0].id
        };
        await handleIssueAssignment(event, issue, true);
      }
    }
    delete issueCreationLock[creationLockKey];
  } catch (err) {
    logger.error(`Comment creation failure: ${err}`, err);
    delete issueCreationLock[creationLockKey];
    logger.debugWithContext(`new challenge created with id ${issue.challengeUUID} for issue ${issue.number}`, event, issue);
  }
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
    dbIssue = await ensureChallengeExists(event, issue, true);
  } catch (e) {
    await eventService.handleEventGracefully(event, issue, e);
    return;
  }
  // Sometimes Github send label updated event before issue created event.
  // This process will be ignored. The label will be processed (stored) at hanleIssueCreated.
  if (!dbIssue) {
    logger.debugWithContext('DB record not found. Issue label update ignored.', event, issue);
    return;
  }
  // if the issue has payment success we'll ignore this process.
  if (dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL) {
    logger.debugWithContext('Ignoring this issue processing. The issue has challenge_payment_successful.', event, issue);
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
    dbIssue = await ensureChallengeExists(event, issue, false);

    if (!dbIssue) {
      // The dbissue is not found, the db is not accessible, or the issue is still in creation process.
      // Ignore it.
      return;
    }
    // if the issue has payment success we'll ignore this process.
    if (dbIssue.status === constants.ISSUE_STATUS.CHALLENGE_PAYMENT_SUCCESSFUL) {
      logger.debugWithContext('Ignoring this issue processing. The issue has challenge_payment_successful.', event, issue);
      return;
    }
    if (dbIssue.assignee) {
      const assigneeUserId = await gitHelper.getUserIdByLogin(event, dbIssue.assignee);
      if (!assigneeUserId) {
        // The assignement of this user was failed and broken.
        // We don't need to handle the unassignment.
        return;
      }
      logger.debugWithContext(`Looking up TC handle of git user: ${assigneeUserId}`, event, issue);
      const userMapping = await userService.getTCUserName(event.provider, assigneeUserId);
      logger.debugWithContext(userMapping, event, issue);

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
        logger.debugWithContext(`Getting the topcoder member ID for member name: ${userMapping.topcoderUsername}`, event, issue);
        // Update the challenge to remove the assignee
        logger.debugWithContext(`un-assigning user from challenge: ${userMapping.topcoderUsername}`, event, issue);
        await topcoderApiHelper.removeResourceToChallenge(dbIssue.challengeUUID, userMapping.topcoderUsername, config.ROLE_ID_SUBMITTER);
        const contestUrl = getUrlForChallengeId(dbIssue);
        const comment = `Challenge ${contestUrl} ${userMapping.topcoderUsername} has been unassigned.`;
        await gitHelper.createComment(event, issue.number, comment);
        await gitHelper.addLabels(event, issue.number, updateLabels);
        logger.debugWithContext(`Member ${userMapping.topcoderUsername} is unassigned from challenge with id ${dbIssue.challengeUUID}`, event, issue);
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
  const dbIssue = await dbHelper.queryOneIssue(models.Issue, issue.repositoryId, issue.number, issue.provider);

  // remove open for pickup and add assigned
  const updateLabels = _(issue.labels) // eslint-disable-line lodash/chaining
    .filter((i) => !i.startsWith(config.ISSUE_LABEL_PREFIX))
    .value();

  await gitHelper.addLabels(event, issue.number, updateLabels);

  // Unassign the user.
  if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
    event.data.assignee = {
      id: event.data.issue.assignees[0].id
    };
    const assigneeUserId = event.data.assignee.id;
    const assigneeUsername = await gitHelper.getUsernameById(event, assigneeUserId);
    await gitHelper.removeAssign(event, issue.number, assigneeUserId, assigneeUsername);
  }

  try {
    await dbIssue.delete();
  } catch (err) {
    // Just log the error, keep the process go on.
    logger.error(`Error cleaning the old DB and its challenge.\n ${err}`);
  }

  const issueLabels = _(updateLabels).push(config.OPEN_FOR_PICKUP_ISSUE_LABEL).value(); // eslint-disable-line lodash/chaining
  logger.debugWithContext(`Adding label ${config.OPEN_FOR_PICKUP_ISSUE_LABEL}`, event, issue);
  await gitHelper.addLabels(event, issue.number, issueLabels);

  const creationLockKey = `${issue.provider}-${issue.repositoryId}-${issue.number}`;
  delete issueCreationLock[creationLockKey];
  await handleIssueCreate(event, issue, false);

  if (event.data.issue.assignees && event.data.issue.assignees.length > 0 && event.data.issue.assignees[0].id) {
    event.data.assignee = {
      id: event.data.issue.assignees[0].id
    };
    const assigneeUserId = event.data.assignee.id;
    const assigneeUsername = await gitHelper.getUsernameById(event, assigneeUserId);
    await gitHelper.assignUser(event, issue.number, assigneeUsername);
  }
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
    labels: event.data.issue.labels,
    tcxReady: true
  };
  const fullRepoUrl = gitHelper.getFullRepoUrl(event);
  event.data.repository.repoUrl = fullRepoUrl;

  const project = await dbHelper.queryOneActiveProject(models.Project, fullRepoUrl);

  issue.projectId = project.id;
  issue.repoUrl = fullRepoUrl;

  // Parse prize from title
  const hasPrizes = parsePrizes(issue);
  // If the issue does not have prizes set, skip all processing
  if (!hasPrizes) {
    return;
  }

  const tcxLabels = _(issue.labels) // eslint-disable-line lodash/chaining
    .filter((i) => i.startsWith(config.ISSUE_LABEL_PREFIX))
    .value();

  if (!tcxLabels || tcxLabels.length === 0) {
    issue.tcxReady = false;
  }

  const copilot = await userService.getRepositoryCopilotOrOwner(event.provider, event.data.repository.full_name);
  event.copilot = copilot;

  // Some provider has non numeric repo id. we need to convert it to number by hashing it.
  if (_.isString(issue.repositoryId)) {
    issue.repositoryIdStr = issue.repositoryId;
    issue.repositoryId = helper.hashCode(issue.repositoryId);
  }

  issue.body = _.get(issue, 'body', '');
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
        id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
      })),
      owner: Joi.object().keys({
        id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
      })
    }).required(),
    repository: Joi.object().keys({
      id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
      name: Joi.string().required(),
      full_name: Joi.string().required(),
      repoUrl: Joi.string().optional()
    }).required(),
    comment: Joi.object().keys({
      id: Joi.number().required(),
      body: Joi.string().allow(''),
      user: Joi.object().keys({
        id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
      })
    }),
    assignee: Joi.object().keys({
      id: Joi.alternatives().try(Joi.string(), Joi.number()).required().allow(null)
    }),
    labels: Joi.array().items(Joi.string())
  }).required(),
  retryCount: Joi.number().integer().default(0).optional(),
  paymentSuccessful: Joi.boolean().default(false).optional(),
  createCopilotPayments: Joi.boolean().default(false).optional(),
  challengeValid: Joi.boolean().default(false).optional(),
  dbIssue: Joi.object().optional(),
  assigneeMember: Joi.object().optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
