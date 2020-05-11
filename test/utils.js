/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides utility functions for tests.
 * @author TCSCODER
 * @version 1.0
 */
const config = require('config');
const _ = require('lodash');
const {assert} = require('chai');
const axios = require('axios');
const models = require('../models');
const topcoderApiHelper = require('../utils/topcoder-api-helper');
const data = require('./data');


const assign = Object.assign;
const INVALID_USER_ID = 123;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const issueNotFoundError = (err) => err.message.startsWith('there is no issue with iid');

/**
 * creates a user in database
 * @param {Object} user the user to create
 */
async function createUser(user) {
  await models.User.update({
    userProviderId: user.userProviderId,
    type: user.type
  }, user, {upsert: true});
}

/**
 * creates a user mapping in database
 * @param {Number} id githost user id
 * @param {String} name topcoder user name
 * @param {String} provider git provider
 */
async function createUserMapping(id, name, provider) {
  await models.UserMapping.update({
    topcoderUsername: config.TOPCODER_USER_NAME
  }, {
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: id,
    [provider === 'github' ? 'githubUsername' : 'gitlabUsername']: name,
    topcoderUsername: config.TOPCODER_USER_NAME
  }, {upsert: true});
}

/**
 * creates a project in database
 * @param {Object} project the project to create
 */
async function createProject(project) {
  await models.Project.update({
    repoUrl: project.repoUrl
  }, assign({
    rocketChatWebhook: null,
    rocketChatChannelName: null,
    archived: false
  }, project), {upsert: true});
}

/**
 * cleans up database
 * @param {Number} userId the userId to remove
 * @param {Object} project the project to remove
 * @param {Number} issueNumber the issue to remove
 * @param {String} provider git provider
 */
async function cleanup(userId, project, issueNumber, provider) {
  await models.UserMapping.deleteOne({
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: userId
  });
  await models.User.deleteOne({
    userProviderId: userId,
    type: provider
  });
  await models.Project.deleteOne({
    repoUrl: project.repoUrl
  });
  await models.Issue.deleteOne({
    number: issueNumber,
    repositoryId: project.repositoryId
  });
}

/**
 * Get issue object
 * @param {String} projectId the id of the project to which issue belongs
 * @param {String} issueIid the iid of the issue
 * @param {String} provider either github or gitlab
 * @returns {Object} the found issue
 */
async function getIssue(projectId, issueIid, provider) {
  if (!issueIid) {
    throw new Error('issue iid is null');
  }

  const issue = await models.Issue.findOne({
    number: issueIid,
    provider,
    repositoryId: projectId
  });

  if (!issue) {
    throw new Error(`there is no issue with iid ${issueIid} in the database`);
  }

  return issue;
}

/**
 * Temporarily makes user mapping invalid
 * @param {String} userId the user id of the usermapping
 * @param {String} provider either github or gitlab
 */
async function removeUserMapping(userId, provider) {
  await models.UserMapping.update({
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: userId
  }, {
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: INVALID_USER_ID
  });
}

/**
 * Makes the invalid user mapping valid
 * @param {String} userId the user id of the usermapping
 * @param {String} provider either github or gitlab
 */
async function addBackUserMapping(userId, provider) {
  await models.UserMapping.update({
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: INVALID_USER_ID
  }, {
    [provider === 'github' ? 'githubUserId' : 'gitlabUserId']: userId
  });
}

/**
 * Get challenge with challengeId
 * @param {String} challengeId the challenge id of the challenge
 * @returns {Object} the challenge in TC platform
 */
async function getChallenge(challengeId) {
  try {
    const response = await axios.get(`${config.TC_DEV_API_URL}/challenges/${challengeId}`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (response.status !== 200 || response.data.result.status !== 200) { // eslint-disable-line
      throw new Error(`error getting challenge from topcoder, status code ${response.status}`);
    }

    return response.data.result.content;
  } catch (err) {
    throw err;
  }
}

/**
 * Tests a given function retryCount number of times with a configured delay between each re test
 * @param {Function} fn the function to test
 * @param {Number} retryCount max number of times to re test after which a failed error is thrown
 * @returns {Boolean} true if success else throws an error
 */
async function test(fn, retryCount = config.MAX_RETRY_COUNT) {
  try {
    --retryCount;
    await fn();
  } catch (err) {
    // List of allowed errors for which a re-test has possibility of success
    if (err.name !== 'AssertionError' && !issueNotFoundError(err)) {
      throw err;
    }
    if (retryCount === 0) {
      throw err;
    }
    await sleep(config.WAIT_TIME);
    return await test(fn, retryCount);
  }

  return true;
}

/**
 * Ensures challenge with challengeId is created in TC platform
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeIsCreated(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.strictEqual(challenge.projectId, config.TC_DIRECT_ID);
    assert.strictEqual(challenge.challengeName, data.challengeTitle);
    assert.strictEqual(challenge.detailedRequirements, data.challengeDescription);
    assert.deepEqual(challenge.prize, data.challengePrize);
  });
}

/**
 * Ensures challenge with challengeId has the updated prize value
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengePrizeIsUpdated(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.deepEqual(challenge.prize, data.updatedChallengePrize);
  });
}

/**
 * Ensures challenge with challengeId has the updated title
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeTitleIsUpdated(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.deepEqual(challenge.challengeName, data.updatedChallengeTitle);
  });
}

/**
 * Ensures challenge with challengeId has the updated description
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeDescriptionIsUpdated(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.deepEqual(challenge.detailedRequirements, data.updatedChallengeDescription);
  });
}

/**
 * Ensures challenge with challengeId has registered user assignedUser
 * @param {String} challengeId the challenge id of the challenge
 * @param {String} assignedUser the user handle who is registered
 */
async function ensureChallengeIsAssigned(challengeId, assignedUser) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.isArray(challenge.registrants);
    assert.lengthOf(challenge.registrants, 1);
    assert.equal(challenge.registrants[0].handle.toLowerCase(), assignedUser.toLowerCase());
    assert.equal(challenge.numberOfRegistrants, 1);
  });
}

/**
 * Ensures challenge with challengeId has no registrants
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeIsUnassigned(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.isArray(challenge.registrants);
    assert.lengthOf(challenge.registrants, 0);
    assert.equal(challenge.numberOfRegistrants, 0);
  });
}


/**
 * Ensures challenge with challengeId closed successfully
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeCompleted(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.equal(challenge.currentStatus, 'Completed');

    const resources = await topcoderApiHelper.getResourcesFromChallenge(challengeId);
    assert.isArray(resources);
    const copilot = _.filter(resources, (r) => r.role === 'Copilot'); // eslint-disable-line lodash/matches-prop-shorthand
    assert.lengthOf(copilot, 1);
  });
}

/**
 * Ensures challenge with challengeId active successfully
 * @param {String} challengeId the challenge id of the challenge
 */
async function ensureChallengeActive(challengeId) {
  await test(async () => {
    const challenge = await getChallenge(challengeId);
    assert.exists(challenge);
    assert.equal(challenge.currentStatus, 'Active');
  });
}

module.exports = {
  sleep,
  createUser,
  createUserMapping,
  createProject,
  cleanup,
  getIssue,
  removeUserMapping,
  addBackUserMapping,
  test,
  ensureChallengeIsCreated,
  ensureChallengePrizeIsUpdated,
  ensureChallengeTitleIsUpdated,
  ensureChallengeDescriptionIsUpdated,
  ensureChallengeIsAssigned,
  ensureChallengeIsUnassigned,
  ensureChallengeCompleted,
  ensureChallengeActive
};
