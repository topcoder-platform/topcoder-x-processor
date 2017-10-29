/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This service processes incoming issue events.
 * @author TCSCODER
 * @version 1.0
 */
const _ = require('lodash');
const Joi = require('joi');
const MarkdownIt = require('markdown-it');

const models = require('../models');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');

const Issue = models.Issue;
const md = new MarkdownIt();

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

    // Create a new project
    // eslint-disable-next-line new-cap
    const projectId = await topcoderApiHelper.createProject(event.data.repository.full_name);
    logger.debug(`new project created with id ${projectId} for issue ${issue.number}`);

    // Create a new challenge
    issue.challengeId = await topcoderApiHelper.createChallenge({
      name: issue.title,
      projectId,
      detailedRequirements: issue.body,
      prizes: issue.prizes
    });

    // Save
    await Issue.create(issue);

    logger.debug(
      `new challenge created with id ${issue.challengeId} for issue ${issue.number}`);
  } else {
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

    logger.debug(
      `updated challenge ${dbIssue.challengeId} for for issue ${issue.number}`);
  }
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('issue.created', 'issue.updated').required(),
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
      full_name: Joi.string().required()
    }).required()
  }).required()
});


module.exports = {
  process
};
