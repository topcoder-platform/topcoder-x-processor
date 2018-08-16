/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides tests for topcoder-x.
 * @author TCSCODER
 * @version 1.0
 */
/* eslint-env node, mocha */

process.env.NODE_ENV = 'test';

const {assert} = require('chai');
const axios = require('axios');
const config = require('config');
const {ProjectsBundle} = require('gitlab');
const models = require('../models');

const PROVIDER = 'gitlab';
const WAIT_TIME_MULTIPLIER = 10;

/**
 * get challenge with challengeId
 * @param {String} challengeId the challenge id of the challenge
 * @returns {Object} the challenge in TC platform
 * @private
 */
async function _getChallenge(challengeId) {
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
 * Generate the contest url, given the challenge id
 * @param {String} challengeId The id of the challenge in topcoder
 * @returns {String} The topcoder url to access the challenge
 * @private
 */
function getUrlForChallengeId(challengeId) {
  return `${config.TC_URL}/challenges/${challengeId}`;
}

/**
 * authenticate the gitlab using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the gitlab instance
 * @private
 */
async function _authenticate(accessToken) {
  try {
    const gitlabServices = new ProjectsBundle({
      url: config.GITLAB_API_BASE_URL,
      oauthToken: accessToken
    });
    return gitlabServices;
  } catch (err) {
    throw new Error(`Failed to authenticate to Gitlab using access token of copilot. ${err.message}`);
  }
}

/**
 * get issue with projectId and issueIid
 * @param {String} projectId the project id of the issue
 * @param {String} issueIid the iid of the issue
 * @returns {Object} the issue in the database
 * @private
 */
async function _getIssue(projectId, issueIid) {
  if (!issueIid) {
    throw new Error('issue is null');
  }

  const dbIssue = await models.Issue.findOne({
    number: issueIid,
    provider: PROVIDER,
    repositoryId: projectId
  });

  if (!dbIssue) {
    throw new Error(`there is no issue in the database ${issueIid}`);
  }

  return dbIssue;
}


describe('Topcoder-X-Processor tests', function tcXTests() {
    this.timeout(config.WAIT_TIME); // eslint-disable-line

  let project;
  let tcDirectId;
  let userMapping;
  let copilot;
  let issueIid;
  let challengeId;
  let gitlabServices;

  const data = {
    issueTitle: '[$1] This is a test issue',
    challengeTitle: 'This is a test issue',
    issueDescription: 'This is a description',
    challengeDescription: '<p>This is a description</p>\n',
    prize: [1],
    updatedIssuePrizeTitle: '[$2] This is a test issue',
        updatedPrizeNote: 'changed title from **[${-1-}] This is a test issue** to **[${+2+}] This is a test issue**', // eslint-disable-line
        updatedPrize: [2], // eslint-disable-line
    updatedIssueTitle: '[$2] This is an updated test issue',
    updatedChallengeTitle: 'This is an updated test issue',
        updatedTitleNote: 'changed title from **[$2] This is a test issue** to **[$2] This is a{+n updated+} test issue**', // eslint-disable-line
    updatedIssueDescription: 'This is an updated description',
    updatedChallengeDescription: '<p>This is an updated description</p>\n'
  };

  before('gather project and user details', async() => {
    this.timeout(config.WAIT_TIME * 2); // eslint-disable-line

    const dbProject = await models.Project.findOne({
      repoUrl: config.GITLAB_REPO_URL
    });

    if (!dbProject || !dbProject.username) {
      // throw this repo is not managed by Topcoder x tool
      throw new Error(`This repository '${config.GITLAB_REPO_URL}' is not managed by Topcoder X tool.`);
    }

    tcDirectId = dbProject.tcDirectId;

    userMapping = await models.UserMapping.findOne({
      topcoderUsername: dbProject.username.toLowerCase()
    });

    if (!userMapping || (PROVIDER === 'github' && !userMapping.githubUserId) || (PROVIDER === 'gitlab' && !userMapping.gitlabUserId)) {
      throw new Error(`Couldn't find githost username for '${PROVIDER}' for this repository '${config.GITLAB_REPO_URL}'.`);
    }

    copilot = await models.User.findOne({
      username: PROVIDER === 'github' ? userMapping.githubUsername : userMapping.gitlabUsername,
      type: PROVIDER
    });

    if (!copilot) {
      // throw no copilot is configured
      throw new Error(`No copilot is configured for the this repository: ${PROVIDER}`);
    }

    gitlabServices = await _authenticate(copilot.accessToken);
    const projects = await gitlabServices.Projects.all({
      search: dbProject.title
    });
    project = projects[0];
  });

  after('cleanup', async() => {
    await gitlabServices.Issues.remove(project.id, issueIid);
  });

  describe('tests for creating a new Gitlab ticket', () => {
    before('create an issue in gitlab', async() => {
      const response = await gitlabServices.Issues.create(project.id, {
        title: data.issueTitle,
        description: data.issueDescription
      });
      issueIid = response.iid;
    });

    it('ensures that the challenge is created properly in the Topcoder platform', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const issue = await _getIssue(project.id, issueIid);
          const challenge = await _getChallenge(issue.challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);
          challengeId = challenge.challengeId;

          assert.exists(challenge);
          assert.strictEqual(challenge.projectId, tcDirectId);
          assert.strictEqual(challenge.challengeName, data.challengeTitle);
          assert.strictEqual(challenge.detailedRequirements, data.challengeDescription);
          assert.deepEqual(challenge.prize, data.prize);

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been created for this ticket.`;
          assert.strictEqual(notes[0].body, note);

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME);
    });
  });

  describe('tests for updating a Gitlab ticket - prize', () => {
    before('update prize of an issue in gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        title: data.updatedIssuePrizeTitle
      });
    });

    it('ensures that the prize is updated properly on the TC challenge', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const challenge = await _getChallenge(challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(challenge);
          assert.deepEqual(challenge.prize, data.updatedPrize);

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`;
          assert.deepEqual(notes[0].body, note);
          assert.deepEqual(notes[1].body, data.updatedPrizeNote);

          done();
        } catch (err) {
          done(err);
        }
        }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER); // eslint-disable-line
    });
  });

  describe('tests for updating a Gitlab ticket - title', () => {
    before('update title of an issue in gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        title: data.updatedIssueTitle
      });
    });

    it('ensures that the title is updated properly on the TC challenge', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const challenge = await _getChallenge(challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(challenge);
          assert.deepEqual(challenge.challengeName, data.updatedChallengeTitle);

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`;
          assert.deepEqual(notes[0].body, note);
          assert.deepEqual(notes[1].body, data.updatedTitleNote);

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER);
    });
  });

  describe('tests for updating a Gitlab ticket - description', () => {
    before('update description of an issue in gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        description: data.updatedIssueDescription
      });
    });

    it('ensure that the description is updated properly on the TC challenge', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const challenge = await _getChallenge(challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(challenge);
          assert.deepEqual(challenge.detailedRequirements, data.updatedChallengeDescription);

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`;
          assert.deepEqual(notes[0].body, note);
          assert.deepEqual(notes[1].body, 'changed the description');

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER);
    });
  });

  describe('tests for assigning a gitlab ticket', () => {
    before('assign issue to member on gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
    });

    it('ensures that the TC member is added to the TC challenge as expected', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const challenge = await _getChallenge(challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(challenge);
          assert.isArray(challenge.registrants);
          assert.lengthOf(challenge.registrants, 1);
          assert.equal(challenge.registrants[0].handle, userMapping.topcoderUsername);
          assert.equal(challenge.numberOfRegistrants, 1);

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been updated - it has been assigned to ${userMapping.topcoderUsername}.`;
          assert.deepEqual(notes[0].body, note);
          assert.deepEqual(notes[1].body, `assigned to @${userMapping.gitlabUsername}`);

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER);
    });
  });

  describe('tests for assigning a gitlab ticket - unregistered user', () => {
    before('remove mapping from userMapping, unassign and then assign issue to member on gitlab', async() => {
      // Temporarily remove mapping in DB
      await models.UserMapping.update({
        gitlabUserId: userMapping.gitlabUserId
      }, {
        gitlabUserId: 123
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
    });

    after('add back correct mapping to userMapping, reassign', async() => {
      // Add back mapping in DB
      await models.UserMapping.update({
        gitlabUserId: 123
      }, {
        gitlabUserId: userMapping.gitlabUserId
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
    });

    it('ensures that the TC member assignment is rolled back', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME + 60000); // eslint-disable-line
      setTimeout(async() => {
        try {
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(notes);
          assert.isArray(notes);
          assert.deepEqual(notes[0].body, `unassigned @${userMapping.gitlabUsername}`);
          assert.deepEqual(notes[1].body, `@${userMapping.gitlabUsername}, please sign-up with Topcoder X tool`);

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME);
    });
  });

  // THIS TEST WILL FAIL as the member is not removed as a registrant on TC challenge
  describe('tests for unassigning a gitlab ticket', () => {
    before('unassign issue to member on gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });
    });

    after('reassign issue to member', async() => {
            // for subsequent tests
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
    });

    it('ensures that the TC challenge goes back to unassigned and the existing assignee is removed', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const challenge = await _getChallenge(challengeId);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.exists(challenge);
          assert.isArray(challenge.registrants);
          assert.lengthOf(challenge.registrants, 0);
          assert.equal(challenge.numberOfRegistrants, 0);

          assert.exists(notes);
          assert.isArray(notes);
          assert.deepEqual(notes[0].body, `unassigned @${userMapping.gitlabUsername}`);

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER);
    });
  });

    // THIS TEST WILL FAIL as the issue is not reopened if no assignee exists. It is ignored with a log message
  describe('tests for closing a gitlab ticket - no assigne exists', () => {
    before('close an issue on gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'close'
      });
    });

    after('reassign issue to member, reopen issue', async() => {
      // for subsequent tests
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'reopen'
      });
    });

    it('ensures a comment is added to the Gitlab ticket and the ticket is reopened', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
          const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);

          assert.deepEqual(gitlabIssue.state, 'opened');

          assert.exists(notes);
          assert.isArray(notes);
          const contestUrl = getUrlForChallengeId(challengeId);
          const note = `Contest ${contestUrl} has been updated - it has been assigned to ${userMapping.topcoderUsername}.`;
          assert.deepEqual(notes[0].body, note);
          assert.deepEqual(notes[1].body, 'closed');

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME);
    });
  });

  describe('tests for closing a gitlab ticket', () => {
    before('close an issue on gitlab', async() => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'close'
      });
    });

    it('ensures that the copilot is assigned and the challenge is closed', function(done) { // eslint-disable-line
      this.timeout(config.WAIT_TIME * WAIT_TIME_MULTIPLIER + 60000); // eslint-disable-line

      setTimeout(async() => {
        try {
          const notes = await gitlabServices.IssueNotes.all(project.id, issueIid);
          const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
          const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);

          assert.exists(notes);
          assert.isArray(notes);
          assert.deepEqual(notes[0].body, `Payment task has been updated: https://software.topcoder-dev.com/review/actions/ViewProjectDetails?pid=${challengeId}`); // eslint-disable-line
          assert.deepEqual(notes[1].body, 'added ~7432900 ~7432901 labels');

          assert.deepEqual(gitlabIssue.state, 'closed');

          done();
        } catch (err) {
          done(err);
        }
      }, config.WAIT_TIME * WAIT_TIME_MULTIPLIER);
    });
  });
});
