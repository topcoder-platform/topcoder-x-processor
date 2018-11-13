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

const _ = require('lodash');
const {assert} = require('chai');
const config = require('config');
const {ProjectsBundle} = require('gitlab');
const models = require('../models');
const data = require('./data');
const utils = require('./utils');

const PROVIDER = 'gitlab';

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


describe('Topcoder X gitlab tests', function tcXTests() {
  this.timeout(config.WAIT_TIME * config.MAX_RETRY_COUNT * 2); // eslint-disable-line no-invalid-this, no-magic-numbers

  let project;
  let userMapping;
  let copilot;
  let issueIid;
  let gitlabServices;

  before('gather project and user details', async () => {
    this.timeout(config.WAIT_TIME * config.MAX_RETRY_COUNT); // eslint-disable-line

    const dbProject = await models.Project.findOne({
      repoUrl: config.GITLAB_REPO_URL
    });

    if (!dbProject || !dbProject.owner) {
      // throw this repo is not managed by Topcoder x tool
      throw new Error(`This repository '${config.GITLAB_REPO_URL}' is not managed by Topcoder X tool.`);
    }

    userMapping = await models.UserMapping.findOne({
      topcoderUsername: dbProject.copilot.toLowerCase()
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
      search: dbProject.title,
      owned: true
    });
    project = projects[0];
  });

  after('cleanup', async () => {
    await gitlabServices.Issues.remove(project.id, issueIid);
  });

  describe('tests for creating a new Gitlab ticket', async () => {
    before('create an issue in gitlab', async () => {
      const gitlabIssue = await gitlabServices.Issues.create(project.id, {
        title: data.issueTitle,
        description: data.issueDescription,
        labels: data.openForPickupLabel
      });
      issueIid = gitlabIssue.iid;

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the challenge is created properly in the Topcoder platform', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeIsCreated(issue.challengeId);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestCreatedComment(contestUrl), userMapping.topcoderUsername);
        assert.strictEqual(comments[0].body, comment);
      });
    });
  });

  describe('tests for updating a Gitlab ticket - prize', () => {
    before('update prize of an issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        title: data.updatedPrizeTitle
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the prize is updated properly on the TC challenge', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengePrizeIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);
        assert.deepEqual(comments[1].body, data.updatedPrizeNote);
      });
    });
  });

  describe('tests for updating a Gitlab ticket - title', () => {
    before('update title of an issue in gitlab', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        title: data.updatedIssueTitle
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the title is updated properly on the TC challenge', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeTitleIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);
        assert.deepEqual(comments[1].body, data.updatedTitleNote);
      });
    });
  });

  describe('tests for updating a Gitlab ticket - description', () => {
    before('update description of an issue in gitlab', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        description: data.updatedIssueDescription
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensure that the description is updated properly on the TC challenge', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeDescriptionIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);
        assert.deepEqual(comments[1].body, data.updatedDescriptionNote);
      });
    });
  });

  describe('tests for assigning a gitlab ticket', () => {
    before('assign issue to member', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC member is added to the TC challenge as expected', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeIsAssigned(issue.challengeId, userMapping.topcoderUsername);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestAssignedComment(contestUrl, config.TOPCODER_USER_NAME), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);
        assert.deepEqual(comments[1].body, `assigned to @${userMapping.gitlabUsername}`);
      });
    });
  });

  describe('tests for assigning a gitlab ticket - no mapping exists', () => {
    before('remove all assignees, remove user mapping, assign issue to member', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await utils.removeUserMapping(userMapping.gitlabUserId, PROVIDER);

      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });
    });

    after('add back user mapping, reassign user', async () => {
      await utils.addBackUserMapping(userMapping.gitlabUserId, PROVIDER);

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC member assignment is rolled back', async() => {
      await utils.test(async() => {
        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.signUpComment(userMapping.gitlabUsername), userMapping.topcoderUsername);
        assert.deepEqual(comments[1].body, comment);
        assert.deepEqual(comments[0].body, `unassigned @${userMapping.gitlabUsername}`);
      });
    });
  });


  describe('tests for unassigning a gitlab ticket', () => {
    before('unassign an issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC challenge goes back to unassigned and the existing assignee is removed', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeIsUnassigned(issue.challengeId);

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUnAssignedComment(contestUrl, userMapping.topcoderUsername), userMapping.topcoderUsername);
        assert.strictEqual(comments[0].body, comment);
        assert.strictEqual(comments[1].body, `unassigned @${userMapping.gitlabUsername}`);
      });
    });
  });

  // THIS TEST WILL FAIL as the issue is not reopened if no assignee exists. It is ignored with a log message
  describe('tests for closing a gitlab ticket - no assigne exists', () => {
    before('remove assignees, close an issue', async () => {
      // add tcx_FixAccepted Label
      const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
      const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
      const updateLabels = _(gitlabIssue.labels)  // eslint-disable-line lodash/chaining
        .push(config.FIX_ACCEPTED_ISSUE_LABEL)
        .value();
      await gitlabServices.Issues.edit(project.id, issueIid, {
        labels: _.join(updateLabels, ',')
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // remove member
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // close ticket
      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'close'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue to member, reopen issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'reopen'
      });
    });

    it('ensures a comment is added to the Gitlab ticket and the ticket is reopened', async() => {
      await utils.test(async() => {
        /** Ensure that ticket state correct **/
        const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
        const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
        assert.deepEqual(gitlabIssue.state, 'opened');

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        assert.deepEqual(comments[0].body, data.issueClosedWithNoAssigneeComment);
      });
    });
  });

  describe('tests for closing a gitlab ticket - without tcx_FixAccepted label', () => {
    before('remove tcx_FixAccepted label, close an issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // remove tcx_FixAccepted Label
      const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
      const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
      const updateLabels = _.filter(gitlabIssue.labels, (l) => l !== config.FIX_ACCEPTED_ISSUE_LABEL);
      await gitlabServices.Issues.edit(project.id, issueIid, {
        labels: _.join(updateLabels, ',')
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // close ticket
      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'close'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue, reopen issue', async () => {
      // for subsequent tests
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'reopen'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures a comment is added to the Gitlab ticket and the ticket is close', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeActive(issue.challengeId);

        /** Ensure that ticket state correct **/
        const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
        const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
        assert.deepEqual(gitlabIssue.state, 'closed');

        /** Ensure that comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.noPaymentTaskComment(config.FIX_ACCEPTED_ISSUE_LABEL), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);
      });
    });
  });

  describe('tests for closing a gitlab ticket', () => {
    before('add assignee, close an issue', async () => {
      await gitlabServices.Issues.edit(project.id, issueIid, {
        assignee_ids: [userMapping.gitlabUserId]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // add tcx_FixAccepted Label
      const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
      const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
      const updateLabels = _(gitlabIssue.labels) // eslint-disable-line lodash/chaining
        .push(config.FIX_ACCEPTED_ISSUE_LABEL)
        .value();
      await gitlabServices.Issues.edit(project.id, issueIid, {
        labels: _.join(updateLabels, ',')
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await gitlabServices.Issues.edit(project.id, issueIid, {
        state_event: 'close'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the copilot is assigned and the challenge is closed', async() => {
      await utils.test(async() => {
        /** Ensure that TC challenge correct **/
        const issue = await utils.getIssue(project.id, issueIid, PROVIDER);
        await utils.ensureChallengeCompleted(issue.challengeId);

        /** Ensure that issue state correct **/
        const gitlabIssues = await gitlabServices.Issues.all(project.id, issueIid);
        const gitlabIssue = gitlabIssues.find((i) => i.iid === issueIid);
        assert.deepEqual(gitlabIssue.state, 'closed');

        /** Ensure that TC comment correct **/
        const comments = await gitlabServices.IssueNotes.all(project.id, issueIid);
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.paymentTaskComment(issue.challengeId), userMapping.topcoderUsername);
        assert.deepEqual(comments[0].body, comment);

        /** Ensure that labels correct **/
        assert.exists(gitlabIssue.labels);
        assert.isArray(gitlabIssue.labels);
        assert.deepEqual(gitlabIssue.labels[1], data.fixAcceptedLabel);
        assert.deepEqual(gitlabIssue.labels[2], data.paidLabel); // eslint-disable-line no-magic-numbers
      });
    });
  });
});
