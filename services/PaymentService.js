/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes incoming payment events.
 * Changes in 1.1:
 * - changes related to https://www.topcoder.com/challenges/30060466
 * @author TCSCODER
 * @version 1.1
 */
const _ = require('lodash');
const Joi = require('joi');
const MarkdownIt = require('markdown-it');
const moment = require('moment');
const models = require('../models');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');

const Payment = models.Payment;
const Project = models.Project;
const md = new MarkdownIt();


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
 * contructs contest name
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
  for (let i = 0; i <= payments.length; i++) { // eslint-disable-line no-restricted-syntax
    if (i === payments.length) {
      return {
        requirements: challengeRequirements,
        prizes: [challengePrizes]
      };
    }

    const _payment = payments[i];
    challengeRequirements += md.render(`$${_payment.amount} - ${_payment.description}  `);
    challengePrizes += _payment.amount;
  }
  return {
    requirements: '',
    prizes: 0
  };
}

/**
 * handles the issue create event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @returns {Any} added payment item
 * @private
 */
async function handlePaymentAdd(event, payment) {
  const copilot = event.data.copilot;

  // check if project for such repository is already created
  const project = await Project.findById(payment.project);
  const dbPayment = await Payment.find({_id: payment.id});
  const projectId = project.tcDirectId;
  let challengeId = payment.challenge;
  const challengeTitle = constructChallengeName(project);
  // Check if duplicated
  const dbPayments = await Payment.find({
    _id: {$ne: payment.id},
    challenge: payment.challenge,
    project: payment.project
  });

  if (!dbPayment) {
    throw new Error('Error - there is not new payment in db');
  }

  const challenge = await topcoderApiHelper.getChallengeById(payment.challenge);
  logger.debug(`challenge ${payment.challenge} was found updating challenge.`);

  if (challenge && (dbPayments.length > 0 || dbPayment)) {
    let {requirements, prizes} = updateChallengeDetails(dbPayments); // eslint-disable-line prefer-const
    requirements += md.render(`$${payment.amount} - ${payment.description}  `);
    prizes[0] += payment.amount;

    const changedPayment = {
      name: challengeTitle,
      projectId,
      detailedRequirements: requirements,
      prizes,
      task: true
    };
    await topcoderApiHelper.updateChallenge(payment.challenge, changedPayment);
    logger.debug(`challenge with id:${challengeId} was updated successfully.`);
    // update db payemnt item
    return await Payment.update({_id: payment.id}, {
      project: payment.project,
      amount: payment.amount,
      description: payment.description,
      challenge: payment.challenge
    });
  }

  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }
  logger.debug(`existing project was found with id ${projectId}.`);

  try {
    const challengeRequirements = md.render(`$${payment.amount} - ${payment.description}  `);
    const newChallenge = {
      name: challengeTitle,
      projectId,
      detailedRequirements: challengeRequirements,
      prizes: [payment.amount],
      task: true
    };
    // Create a new challenge
    challengeId = await topcoderApiHelper.createChallenge(newChallenge);

    logger.debug(`updating database payment with new challenge id:${challengeId}`);
    // update db payment
    await Payment.update({_id: payment.id}, {
      challenge: challengeId
    });

    logger.debug(`Getting the billing account ID for project ID: ${project.tcDirectId}`);
    const accountId = await topcoderApiHelper.getProjectBillingAccountId(project.tcDirectId);

    logger.debug(`Assigning the billing account id ${accountId} to challenge`);

    // add billing account
    const challengeBody = {
      billingAccountId: accountId
    };

    await topcoderApiHelper.addResourceToChallenge(challengeId, challengeBody);

    // use copilot id as the copilot of the challenge
    const topcoderMemberId = await topcoderApiHelper.getTopcoderMemberId(copilot.handle);

    logger.debug(`Registering ${copilot.handle} to challenge ${challengeId}`);

    // add registrant resource
    const copilotResourceBody = {
      roleId: 14,
      resourceUserId: topcoderMemberId,
      phaseId: 0,
      addNotification: true,
      addForumWatch: false
    };
    await topcoderApiHelper.addResourceToChallenge(challengeId, copilotResourceBody);

    // adding registrant
    await assignUserAsRegistrant(topcoderMemberId, challengeId);

    // active challenge
    await topcoderApiHelper.activateChallenge(challengeId);

    logger.debug(`challenge ${challengeId} has been activated!`);
  } catch (e) {
    logger.debug(`Error - adding new payment to contest ${e}`);
  }

  logger.debug(`new challenge created with id ${challengeId} for issue ${payment.number}`);
  return null;
}


/**
 * handles the issue update event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentUpdate(event, payment) {
  let dbPayment;
  let challenge;
  try {
    dbPayment = await Payment.findOne({_id: payment.id});
    challenge = await topcoderApiHelper.getChallengeById(payment.challenge);
    if (challenge) {
      if (_.isMatch(dbPayment, payment)) {
        // project, amount, description, challenge doesn't change, just ignore
        logger.debug(`nothing changed for issue ${payment.number}`);
        return;
      }

      const project = await Project.findById(payment.project);
      const projectId = project.tcDirectId;

      if (!project) {
        throw new Error('Error - cannot update payment of a non-existing project.');
      }
      logger.debug(`Project for payment [${payment.description}] was found.`);

      const challengeTitle = constructChallengeName(project);
      // Check if duplicated
      const dbPayments = await Payment.find({
        _id: {$ne: payment.id},
        challenge: payment.challenge,
        project: payment.project,
        closed: 'false'
      });


      challenge = await topcoderApiHelper.getChallengeById(payment.challenge);
      logger.debug(`challenge ${payment.challenge} was found updating challenge.`);

      if (challenge && (dbPayments.length > 0 || dbPayment)) {
        // update challenge details by appending existing payments
        let {requirements, prizes} = updateChallengeDetails(dbPayments); // eslint-disable-line prefer-const
        requirements += md.render(`$${payment.amount} - ${payment.description}  `);
        prizes[0] += payment.amount;

        const changedPayment = {
          name: challengeTitle,
          projectId,
          detailedRequirements: requirements,
          prizes,
          task: true
        };
        await topcoderApiHelper.updateChallenge(payment.challenge, changedPayment);
        delete changedPayment.task;
        dbPayment.amount = payment.amount;
        dbPayment.description = payment.description;
        await dbPayment.save();
      }
    } else {
      logger.debug('There isn\'t any challenge related to the payment.');
      return;
    }
  } catch (e) {
    logger.debug(`Error updating payment - ${e}`);
    return;
  }

  logger.debug(`updated payment for challenge ${challenge.id} successful.`);
}


/**
 * handles the issue closed event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentDelete(event, payment) {
  let dbPayments;
  try {
    const challenge = await topcoderApiHelper.getChallengeById(payment.challenge);

    if (challenge) {
      const challengeId = payment.challenge;
      // Check if duplicated
      dbPayments = await Payment.find({
        _id: {$ne: payment.id},
        challenge: payment.challenge,
        project: payment.project
      });

      if (dbPayments) {

        const {requirements, prizes} = updateChallengeDetails(dbPayments); /* eslint-disable-line prefer-const */
        const changedPayment = {
          detailedRequirements: requirements,
          prizes,
          task: true
        };
        await topcoderApiHelper.updateChallenge(payment.challenge, changedPayment);
        logger.debug(`challenge of id:${challengeId} was updated successfully.`);
      }
    }
  } catch (e) {
    logger.debug(`Error - deleting copilot payment. \n${e}`);
    return;
  }
}


/**
 * update payment execution
 * @param {Array} payments db payments
 */
async function updatePayments(payments) {
  for (let i = 0; i < payments.length; i++) { // eslint-disable-line no-restricted-syntax
    const payment = payments[i];
    const challenge = await topcoderApiHelper.getChallengeById(payment.challenge);
    if (challenge && challenge.currentStatus === 'Completed') {
      payment.closed = 'true';
      await payment.save();
    }
  }
}


/**
 * Update payments status
 */
async function handlePaymentUpdates() {
  let dbPayments;
  try {
    dbPayments = await Payment.find();
    if (dbPayments) {
      // const savePaymentsPromise = [];
      await updatePayments(dbPayments);
      logger.debug('Success updating payments status.');
    } else {
      throw new Error('Error - There are no payments to check updated for.');
    }
  } catch (err) {
    throw new Error(err);
  }
}

/**
 * Process payment event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  const payment = event.data ? {
    id: event.data.payment.id,
    project: event.data.payment.project,
    amount: event.data.payment.amount,
    description: event.data.payment.description,
    challenge: event.data.payment.challenge
  } : {};

  if (event.event === 'payment.add') {
    await handlePaymentAdd(event, payment);
  } else if (event.event === 'payment.update') {
    await handlePaymentUpdate(event, payment);
  } else if (event.event === 'payment.delete') {
    await handlePaymentDelete(event, payment);
  } else if (event.event === 'payment.checkUpdates') {
    await handlePaymentUpdates(event);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('payment.add', 'payment.update', 'payment.delete', 'payment.checkUpdates').required(),
  data: Joi.object().keys({
    payment: Joi.object().keys({
      id: Joi.string().optional(),
      project: Joi.string().optional(),
      amount: Joi.number().optional(),
      description: Joi.string().optional(),
      challenge: Joi.number().optional(),
      closed: Joi.string().optional()
    }).optional(),
    copilot: Joi.object().keys({
      handle: Joi.string().optional(),
      roles: Joi.array().optional()
    }).optional().allow(null)
  }).optional()
});


module.exports = {
  process
};

logger.buildService(module.exports);
