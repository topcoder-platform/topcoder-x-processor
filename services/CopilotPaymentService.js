/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes incoming payment events.
 *
 * @author TCSCODER
 * @version 1.0
 */
const _ = require('lodash');
const Joi = require('joi');
const config = require('config');
const MarkdownIt = require('markdown-it');
const moment = require('moment');
const models = require('../models');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const eventService = require('./EventService');

const CopilotPayment = models.CopilotPayment;
const Project = models.Project;
const md = new MarkdownIt();


/**
 * constructs contest name
 * @param {Object} project topcoder project
 * @returns {String} challenge title
 */
function constructChallengeName(project) {
  let today = moment().format('LL').toString();
  const divisor = 3;
  today = today.replace(',', parseInt(/.,/.exec(today)[0], 10) === divisor ? 'rd,' : 'th,');
  return `Copilot payment for ${project.title} ${today}`;
}

/**
 * update payment details requirements,prize
 * @param {Object} payments db payments
 * @returns {Object} changed challenge details
 */
function updateChallengeDetails(payments) {
  let challengeRequirements = '';
  let challengePrizes = 0;
  for (let i = 0; i < payments.length; i++) { // eslint-disable-line no-restricted-syntax
    const _payment = payments[i];
    challengeRequirements += md.render(`$${_payment.amount} - ${_payment.description}  `);
    challengePrizes += _payment.amount;
  }
  return {
    requirements: challengeRequirements,
    prizes: [challengePrizes]
  };
}

/**
 * gets the existing payments to get the latest challenge id
 * @param {Object} event the event
 * @param {Object} dbPayment the payment
 * @returns {Object} the updated payment
 */
async function getExistingChallengeIdIfExists(event, dbPayment) {
  // check if there is existing active challenge associated with this project
  const existingPayments = await CopilotPayment.findOne({
    project: dbPayment.project,
    username: event.project.copilot,
    closed: false,
    challengeId: {
      $gt: 0
    }
  });
  // if no existing challenge found then it will be created by processor
  if (existingPayments) {
    dbPayment.challengeId = existingPayments.challengeId;
    // update db payment
    await CopilotPayment.updateOne({_id: dbPayment.id}, {
      challengeId: existingPayments.challengeId
    });
  }
  return dbPayment;
}

/**
 * updates the challenges for copilot payment
 * @param {String} copilotUsername the topcoder handle for copilot
 * @param {String} projectId the project id
 * @param {Number} challengeId the challenge id
 * @private
 */
async function _updateChallenge(copilotUsername, projectId, challengeId) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }

  const challenge = await topcoderApiHelper.getChallengeById(challengeId);
  if (!challenge) {
    throw new Error('There isn\'t any challenge related to the payment.');
  }

  // get all unclosed payments for given project and user
  const dbPayments = await CopilotPayment.find({
    project: projectId,
    username: copilotUsername,
    closed: false
  });

  if (dbPayments.length) {
    const {requirements, prizes} = updateChallengeDetails(dbPayments);

    const challengeTitle = constructChallengeName(project);

    const changedPayment = {
      name: challengeTitle,
      detailedRequirements: requirements,
      prizes: [prizes[0] - 1] // 1 is reduced for copilot fee
    };

    await topcoderApiHelper.updateChallenge(challengeId, changedPayment);
    logger.debug(`challenge with id:${challengeId} was updated successfully.`);
  } else { // if there is no payment due to delete cancel the challenge as well
    topcoderApiHelper.cancelPrivateContent(challengeId);
  }
}

/**
 * checks if any existing challenge is creating matching payment detail if yes then it will reschedule this event
 * @param {Object} event the event
 * @param {Object} payment the payment detail
 * @returns {Boolean} true if rescheduled, false otherwise.
 */
async function _checkAndReSchedule(event, payment) {
  // get all unclosed payments for given project and user
  const existingPending = await CopilotPayment.find({
    project: payment.project,
    username: event.project.copilot,
    closed: false,
    status: 'challenge_creation_pending'
  });
  if (existingPending.length) {
    // reschedule
    setTimeout(async () => {
      const kafka = require('../utils/kafka'); // eslint-disable-line
      await kafka.send(JSON.stringify(event));
      logger.debug('The event is scheduled for retry');
    }, config.RETRY_INTERVAL);
    return true;
  }
  return false;
}

/**
 * handles the issue create event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentAdd(event, payment) {
  const copilot = {handle: event.project.copilot};

  payment = await getExistingChallengeIdIfExists(event, payment);
  if (!_.isNil(payment.challengeId)) {
    await _updateChallenge(copilot.handle, payment.project, payment.challengeId);
  } else {
    if (await _checkAndReSchedule(event, payment)) {
      return;
    }
    // update issue as challenge creation pending
    // update db payment
    await CopilotPayment.updateOne({_id: payment.id}, {
      status: 'challenge_creation_pending'
    });
    // check if project for such repository is already created
    const project = await Project.findById(payment.project);
    if (!project) {
      throw new Error(
        'There is no project associated with this repository');
    }
    try {
      logger.debug(`Getting the billing account ID for project ID: ${project.tcDirectId}`);
      const accountId = await topcoderApiHelper.getProjectBillingAccountId(project.tcDirectId);

      // use copilot id as the copilot of the challenge
      const topcoderMemberId = await topcoderApiHelper.getTopcoderMemberId(copilot.handle);

      const challengeRequirements = md.render(`$${payment.amount} - ${payment.description}  `);
      const challengeTitle = constructChallengeName(project);
      const newChallenge = {
        name: challengeTitle,
        projectId: project.tcDirectId,
        detailedRequirements: challengeRequirements,
        prizes: [1],
        task: true,
        billingAccountId: accountId,
        copilotId: topcoderMemberId,
        copilotFee: payment.amount - 1,
        reviewType: 'INTERNAL'
      };

      // Create a new challenge
      const challengeId = await topcoderApiHelper.createChallenge(newChallenge);

      logger.debug(`updating database payment with new challenge id:${challengeId}`);

      // update db payment
      await CopilotPayment.updateOne({_id: payment.id}, {
        challengeId,
        status: 'challenge_creation_successful'
      });

      // adding user as registrants
      await topcoderApiHelper.assignUserAsRegistrant(topcoderMemberId, challengeId);

      // active challenge
      await topcoderApiHelper.activateChallenge(challengeId);

      logger.debug(`challenge ${challengeId} has been activated!`);
    } catch (ex) {
      await CopilotPayment.remove({
        _id: payment.id
      });
      await eventService.handleEventGracefully(event, payment, ex);
    }
  }
}

/**
 * handles the issue update event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentUpdate(event, payment) {
  const copilot = {handle: event.project.copilot};
  await _updateChallenge(copilot.handle, payment.project, payment.challengeId);
  logger.debug(`updated payment for challenge ${payment.challengeId} successful.`);
}


/**
 * handles the issue closed event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentDelete(event, payment) {
  const copilot = {handle: event.project.copilot};
  await _updateChallenge(copilot.handle, payment.project, payment.challengeId);
  logger.debug(`updated payment for challenge ${payment.challengeId} successful.`);
}

/**
 * Update payments status
 * @param {Object} event the event
 */
async function handlePaymentUpdates(event) {
  const projectIds = await Project.find({
    $or: [
      {owner: event.data.copilot.handle},
      {copilot: event.data.copilot.handle}
    ]
  }).select('_id');

  // get all unclosed payments for current user
  const dbPayments = await CopilotPayment.find({
    project: {$in: projectIds},
    closed: false
  });
  if (dbPayments) {
    const challengeIds = _(dbPayments).map('challengeId').uniq().filter(_.isNumber)
      .value();
    for (let i = 0; i < challengeIds.length; i++) { // eslint-disable-line no-restricted-syntax
      const challengeId = challengeIds[i];
      const challengeDetail = await topcoderApiHelper.getChallengeById(challengeId);
      if (challengeDetail && challengeDetail.currentStatus === 'Completed') {
        await CopilotPayment.updateMany({challengeId, closed: false}, {closed: true});
      }
    }
    logger.debug('Success updating payments status.');
  }
}

/**
 * Process payment event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  const payment = event.data && event.data.payment ? {
    id: event.data.payment._id,
    project: event.data.payment.project,
    amount: event.data.payment.amount,
    description: event.data.payment.description,
    challengeId: event.data.payment.challengeId
  } : {};
  if (_.isNil(payment.challengeId)) {
    delete payment.challengeId;
  }
  if (payment.project) {
    event.project = await Project.findById(payment.project);
    if (_.isNil(event.project.copilot)) {
      throw new Error('copilot cannot be empty for a project');
    }
  }
  if (event.event === 'copilotPayment.add') {
    await handlePaymentAdd(event, payment);
  } else if (event.event === 'copilotPayment.update') {
    await handlePaymentUpdate(event, payment);
  } else if (event.event === 'copilotPayment.delete') {
    await handlePaymentDelete(event, payment);
  } else if (event.event === 'copilotPayment.checkUpdates') {
    await handlePaymentUpdates(event);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('copilotPayment.add', 'copilotPayment.update', 'copilotPayment.delete', 'copilotPayment.checkUpdates').required(),
  data: Joi.object().keys({
    payment: Joi.object().keys({
      _id: Joi.string().optional(),
      project: Joi.string().optional(),
      amount: Joi.number().optional(),
      description: Joi.string().optional(),
      challengeId: Joi.number().optional().allow(null),
      username: Joi.string().optional(),
      closed: Joi.boolean().optional(),
      status: Joi.string().optional()
    }).optional(),
    copilot: Joi.object().keys({
      handle: Joi.string().optional(),
      roles: Joi.array().optional()
    }).optional().allow(null)
  }).optional(),
  retryCount: Joi.number().integer().default(0).optional(),
  provider: Joi.string().default('copilotPayment').allow(null)
});


module.exports = {
  process
};

logger.buildService(module.exports);
