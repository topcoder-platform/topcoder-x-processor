/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides gitlab tests for topcoder-x.
 * @author TCSCODER
 * @version 1.0
 */
/* eslint-env node, mocha */

const {assert} = require('chai');
const config = require('config');
const uuidv4 = require('uuid/v4');
const axios = require('axios');
const Gitlab = require('gitlab/dist/es5').default;
const utils = require('./utils');
const data = require('./data');

const PROVIDER = 'gitlab';

/**
 * authenticate the gitlab using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the gitlab instance
 * @private
 */
async function _authenticate(accessToken) {
  try {
    const gitlab = new Gitlab({
      url: config.GITLAB_API_BASE_URL,
      oauthToken: accessToken
    });
    return gitlab;
  } catch (err) {
    throw new Error(`Failed to authenticate to Gitlab using access token of copilot. ${err.message}`);
  }
}

/**
 * creates an oauth token for Gitlab
 * @param {String} username the gitlab username
 * @param {String} password the gitlab password
 * @returns {Object} the oauth response with tokens
 * @private
 */
async function _getOauthToken(username, password) {
  try {
    const response = await axios.post(`${config.GITLAB_API_BASE_URL}/oauth/token`, {
      grant_type: 'password',
      username,
      password
    });
    return response.data;
  } catch (err) {
    throw err;
  }
}

describe('Topcoder-X-Processor tests', function test() {
  this.timeout(config.WAIT_TIME * config.MAX_RETRY_COUNT * 2); // eslint-disable-line no-magic-numbers, no-invalid-this

  let gitlab;
  let user;
  let issue;
  let project;

  before('create user, usermapping, repository, webhook', async () => {
    const oauth = await _getOauthToken(config.GITLAB_USERNAME, config.GITLAB_PASSWORD);
    gitlab = await _authenticate(oauth.access_token);

    user = await gitlab.Users.current();

    project = await gitlab.Projects.create({
      name: config.GITLAB_REPOSITORY_NAME,
      issues_enabled: true
    });

    const secretWebhookKey = uuidv4();
    await gitlab.ProjectHooks.add(`${user.username}/${config.GITLAB_REPOSITORY_NAME}`,
    `${config.HOOK_BASE_URL}/webhooks/gitlab`, {
      push_events: true,
      issues_events: true,
      confidential_issues_events: true,
      merge_requests_events: true,
      tag_push_events: true,
      note_events: true,
      job_events: true,
      pipeline_events: true,
      wiki_page_events: true,
      token: secretWebhookKey
    });

    await utils.createUser({
      role: 'owner',
      type: PROVIDER,
      userProviderId: user.id,
      username: user.username,
      accessToken: oauth.access_token,
      refreshToken: oauth.refresh_token
    });
    await utils.createUserMapping(user.id, user.username, PROVIDER);
    await utils.createProject({
      title: project.name,
      tcDirectId: config.TC_DIRECT_ID,
      repoUrl: project.web_url,
      username: config.TOPCODER_USER_NAME,
      secretWebhookKey
    });
  });

  after('delete user, usermapping, repository, issue', async () => {
    await gitlab.Projects.remove(project.id);
    await utils.cleanup(user.id, {
      repoUrl: project.web_url,
      repositoryId: project.id
    }, issue.number, PROVIDER);
  });

  describe('Tests for creating a Gitlab ticket', () => {
    before('create an issue', async () => {
      const gitlabIssue = await gitlab.Issues.create(project.id, {
        title: data.issueTitle,
        description: data.issueDescription
      });
      await utils.test(async () => {
        issue = await utils.getIssue(project.id, gitlabIssue.iid, PROVIDER);
      });
    });

    it('ensures that the challenge is created properly in the Topcoder platform', async () => {
      await utils.ensureChallengeIsCreated(issue.challengeId);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      assert.exists(notes);
      assert.isArray(notes);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const note = data.contestCreatedComment(contestUrl);
      assert.strictEqual(notes[0].body, note);
    });
  });

  describe('Tests for updating a Gitlab ticket - prize', () => {
    before('update prize of an issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        title: data.updatedPrizeTitle
      });
    });

    it('ensures that the prize is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengePrizeIsUpdated(issue.challengeId);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      assert.exists(notes);
      assert.isArray(notes);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const note = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(notes[0].body, note);
      assert.deepEqual(notes[1].body, data.updatedPrizeNote);
    });
  });

  describe('Tests for updating a Gitlab ticket - title', () => {
    before('update title of an issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        title: data.updatedPrizeTitle
      });
    });

    it('ensures that the title is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengeTitleIsUpdated(issue.challengeId);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      assert.exists(notes);
      assert.isArray(notes);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const note = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(notes[0].body, note);
      assert.deepEqual(notes[1].body, data.updatedTitleNote);
    });
  });

  describe('Tests for updating a Gitlab ticket - description', () => {
    before('update description of an issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        description: data.updatedIssueDescription
      });
    });

    it('ensures that the description is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengeDescriptionIsUpdated(issue.challengeId);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      assert.exists(notes);
      assert.isArray(notes);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const note = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(notes[0].body, note);
      assert.deepEqual(notes[1].body, data.updatedDescriptionNote);
    });
  });

  describe('Tests for assigning a gitlab ticket', () => {
    before('assign issue to member', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
    });

    it('ensures that the TC member is added to the TC challenge as expected', async () => {
      await utils.ensureChallengeIsAssigned(issue.challengeId, config.TOPCODER_USER_NAME);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const note = data.contestAssignedComment(contestUrl, config.TOPCODER_USER_NAME);
      assert.deepEqual(notes[0].body, note);
      assert.deepEqual(notes[1].body, data.assignedComment(user.username));
    });
  });

  describe('Tests for assigning a Github ticket - no mapping exists', () => {
    before('remove all assignees, remove user mapping, assign issue to member', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: []
      });
      await utils.removeUserMapping(user.id, PROVIDER);
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
    });

    after('add back correct mapping to userMapping, reassign', async() => {
      await utils.addBackUserMapping(user.id, PROVIDER);
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
    });

    it('ensures that the TC member assignment is rolled back', async () => {
      await utils.test(async () => {
        const notes = await gitlab.IssueNotes.all(project.id, issue.number);
        assert.exists(notes);
        assert.isArray(notes);
        assert.deepEqual(notes[0].body, data.unassignedComment(user.username));
        assert.deepEqual(notes[1].body, data.signUpComment(user.username));
      });
    });
  });

  // THIS TEST WILL FAIL as the member is not removed as a registrant on TC challenge
  describe('Tests for unassigning a gitlab ticket', () => {
    before('unassign issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: []
      });
    });

    after('reassign issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
    });

    it('ensures that the TC challenge goes back to unassigned and the existing assignee is removed', async () => {
      await utils.ensureChallengeIsUnassigned(issue.challengeId);

      const notes = await gitlab.IssueNotes.all(project.id, issue.number);
      assert.exists(notes);
      assert.isArray(notes);
      assert.deepEqual(notes[0].body, data.unassignedComment(user.username));
    });
  });

  // THIS TEST WILL FAIL as the issue is not reopened if no assignee exists. It is ignored with a log message
  describe('Tests for closing a gitlab ticket - no assigne exists', () => {
    before('remove assignees, close an issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: []
      });
      await gitlab.Issues.edit(project.id, issue.number, {
        state_event: 'close'
      });
    });

    after('reassign issue, reopen issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
      await gitlab.Issues.edit(project.id, issue.number, {
        state_event: 'reopen'
      });
    });

    it('ensures a comment is added to the Gitlab ticket and the ticket is reopened', async () => {
      await utils.test(async () => {
        const gitlabIssues = await gitlab.Issues.all(project.id, issue.number);
        const gitlabIssue = gitlabIssues.find((i) => i.iid === issue.number);
        const notes = await gitlab.IssueNotes.all(project.id, issue.number);

        assert.deepEqual(gitlabIssue.state, 'opened');

        assert.exists(notes);
        assert.isArray(notes);
        assert.deepEqual(notes[0].body, data.issueClosedWithNoAssigneeComment);
      });
    });
  });

  describe('Tests for closing a gitlab ticket', () => {
    before('add assignee, close an issue', async() => {
      await gitlab.Issues.edit(project.id, issue.number, {
        assignee_ids: [user.id]
      });
      await gitlab.Issues.edit(project.id, issue.number, {
        state_event: 'close'
      });
    });

    it('ensures that the copilot is assigned and the challenge is closed', async () => {
      await utils.test(async () => {
        const notes = await gitlab.IssueNotes.all(project.id, issue.number);
        const gitlabIssues = await gitlab.Issues.all(project.id, issue.number);
        const gitlabIssue = gitlabIssues.find((i) => i.iid === issue.number);

        assert.deepEqual(gitlabIssue.state, 'closed');
        assert.exists(gitlabIssue.labels);
        assert.isArray(gitlabIssue.labels);
        assert.lengthOf(gitlabIssue.labels, 2); // eslint-disable-line no-magic-numbers
        assert.deepEqual(gitlabIssue.labels[0], data.fixAcceptedLabel);
        assert.deepEqual(gitlabIssue.labels[1], data.paidLabel);

        assert.exists(notes);
        assert.isArray(notes);
        assert.deepEqual(notes[0].body, data.paymentTaskComment(issue.challengeId));
      });
    });
  });
});
