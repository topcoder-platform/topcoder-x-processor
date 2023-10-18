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
const config = require('config');
const _ = require('lodash');
const Joi = require('joi');
const MarkdownIt = require('markdown-it');
const moment = require('moment');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const eventService = require('./EventService');
const constants = require('../constants');

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
  const existingPayments = await dbHelper.scan(models.CopilotPayment, {
    project: {eq: dbPayment.project},
    username: {eq: event.project.copilot},
    closed: {eq: 'false'}
  });

  const payment = _.find(existingPayments, (x) => x.challengeUUID);

  // if no existing challenge found then it will be created by processor
  if (payment) {
    // update db payment
    dbPayment = await dbHelper.update(models.CopilotPayment, dbPayment.id, {
      challengeUUID: payment.challengeUUID
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
  const project = await dbHelper.getById(models.Project, projectId);
  if (!project) {
    throw new Error(
      'There is no project associated with this repository');
  }

  const challenge = await topcoderApiHelper.getChallengeById(challengeId);
  if (!challenge) {
    throw new Error('There isn\'t any challenge related to the payment.');
  }

  // get all unclosed payments for given project and user
  const dbPayments = await dbHelper.scan(models.CopilotPayment, {
    project: projectId,
    username: copilotUsername,
    closed: 'false'
  });

  if (dbPayments.length) {
    const {requirements, prizes} = updateChallengeDetails(dbPayments);

    const challengeTitle = constructChallengeName(project);

    const changedPayment = {
      name: challengeTitle,
      detailedRequirements: requirements,
      prizeSets: [{
        type: 'copilot',
        prizes: _.map(prizes, (prize) => ({type: 'USD', value: prize}))
      }]
    };

    await topcoderApiHelper.updateChallenge(challengeId, changedPayment);
    logger.debug(`challenge with id:${challengeId} was updated successfully.`);
  } else { // if there is no payment due to delete cancel the challenge as well
    logger.debug(`challenge with id:${challengeId} is cancelled.`);
    // Currently, there is no working API for closing challenge.
    // The process is just ignored.
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
  const existingPending = await dbHelper.scan(models.CopilotPayment, {
    project: payment.project,
    username: event.project.copilot,
    closed: 'false',
    status: 'challenge_creation_pending'
  });

  if (existingPending.length) {
    // reschedule
    setTimeout(async () => {
      const kafka = require('../utils/kafka'); // eslint-disable-line
      const eventToHandle = _.omit(event, ['project']);
      await kafka.send(JSON.stringify(eventToHandle));
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
  if (!_.isNil(payment.challengeUUID)) {
    await _updateChallenge(copilot.handle, payment.project, payment.challengeUUID);
  } else {
    if (await _checkAndReSchedule(event, payment)) {
      return;
    }
    // update issue as challenge creation pending
    // update db payment
    payment = await dbHelper.update(models.CopilotPayment, payment.id, {
      status: 'challenge_creation_pending'
    });

    // check if project for such repository is already created
    const project = await dbHelper.getById(models.Project, payment.project);
    if (!project) {
      throw new Error(
        'There is no project associated with this repository');
    }
    try {
      logger.debug(`Getting the billing account ID for project ID: ${project.tcDirectId}`);

      const challengeRequirements = md.render(`$${payment.amount} - ${payment.description}  `);
      const challengeTitle = constructChallengeName(project);
      const newChallenge = {
        name: challengeTitle,
        projectId: project.tcDirectId,
        tags: project.tags ? project.tags.map((tag) => tag.name) : [],
        detailedRequirements: challengeRequirements,
        prizes: [payment.amount],
        reviewType: 'INTERNAL'
      };

      // Create a new challenge
      const challengeUUID = await topcoderApiHelper.createChallenge(newChallenge);

      logger.debug(`updating database payment with new challenge id:${challengeUUID}`);

      // update db payment
      payment = dbHelper.update(models.CopilotPayment, payment.id, {
        challengeUUID,
        status: 'challenge_creation_successful'
      });

      // adding user as registrants
      await topcoderApiHelper.assignUserAsRegistrant(copilot.handle, challengeUUID);

      // active challenge
      await topcoderApiHelper.activateChallenge(challengeUUID);

      logger.debug(`challenge ${challengeUUID} has been activated!`);
    } catch (ex) {
      await dbHelper.update(models.CopilotPayment, payment.id, {
        status: 'challenge_creation_retried'
      });
      const eventToHandle = _.omit(event, ['project']);
      await eventService.handleEventGracefully(eventToHandle, payment, ex);
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
  await _updateChallenge(copilot.handle, payment.project, payment.challengeUUID);
  logger.debug(`updated payment for challenge ${payment.challengeUUID} successful.`);
}


/**
 * handles the issue closed event
 * @param {Object} event the event
 * @param {Object} payment the issue
 * @private
 */
async function handlePaymentDelete(event, payment) {
  const copilot = {handle: event.project.copilot};
  await _updateChallenge(copilot.handle, payment.project, payment.challengeUUID);
  logger.debug(`updated payment for challenge ${payment.challengeUUID} successful.`);
}

/**
 * Update payments status
 * @param {Object} event the event
 */
async function handlePaymentUpdates(event) {
  const filterValues = {};
  const filter = {
    FilterExpression: '#owner= :handle or copilot = :handle',
    ExpressionAttributeNames: {
      '#owner': 'owner'
    },
    ExpressionAttributeValues: {
      ':handle': event.data.copilot.handle
    }
  };
  const projects = await dbHelper.scan(models.Project, filter);
  if (projects && projects.length > 0) {
    // get all unclosed payments for current user
    const filterProjectIds = _.join(projects.map((p, index) => {
      const id = `:id${index}`;
      filterValues[id] = p.id;
      return id;
    }), ',');

    const FilterExpression = `#project in (${filterProjectIds}) AND closed = :status`;
    filterValues[':status'] = 'false';

    const dbPayments = await dbHelper.scan(models.CopilotPayment, {
      FilterExpression,
      ExpressionAttributeNames: {
        '#project': 'project'
      },
      ExpressionAttributeValues: filterValues
    });

    if (dbPayments) {
      const challengeIds = _(dbPayments).map('challengeUUID').uniq().filter(_.isString)
        .value();
      for (let i = 0; i < challengeIds.length; i++) { // eslint-disable-line no-restricted-syntax
        const challengeUUID = challengeIds[i];
        const challengeDetail = await topcoderApiHelper.getChallengeById(challengeUUID);
        if (challengeDetail && challengeDetail.currentStatus === constants.CHALLENGE_STATUS.COMPLETED) {
          const dbChallenges = await dbHelper.scan(models.CopilotPayment, {
            challengeUUID,
            closed: 'false'
          });
          const updateChallenges = _.map(dbChallenges, (challenge) => {
            challenge.closed = 'true';
            return challenge;
          });
          await dbHelper.updateMany(models.CopilotPayment, updateChallenges);
        }
      }
      logger.debug('Success updating payments status.');
    }
  }
}

/**
 * Process payment event.
 * @param {Object} event the event
 */
async function process(event) {
  Joi.attempt(event, process.schema);

  const payment = event.data && event.data.payment ? {
    id: event.data.payment.id,
    project: event.data.payment.project,
    amount: event.data.payment.amount,
    description: event.data.payment.description,
    challengeUUID: event.data.payment.challengeUUID
  } : {};
  if (_.isNil(payment.challengeUUID)) {
    delete payment.challengeUUID;
  }
  if (payment.project) {
    event.project = await dbHelper.getById(models.Project, payment.project);

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
      id: Joi.string().optional(),
      project: Joi.string().optional(),
      amount: Joi.number().optional(),
      description: Joi.string().optional(),
      challengeId: Joi.string().optional().allow(null),
      challengeUUID: Joi.string().optional().allow(null),
      username: Joi.string().optional(),
      closed: Joi.boolean().optional(),
      status: Joi.string().optional(),
      createdAt: Joi.date().optional(),
      updatedAt: Joi.date().optional()
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
