/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides github tests for topcoder-x.
 * @author TCSCODER
 * @version 1.0
 */
/* eslint-env node, mocha */

const {assert} = require('chai');
const config = require('config');
const uuidv4 = require('uuid/v4');
const Octokit = require('@octokit/rest');
const utils = require('./utils');
const data = require('./data');

const PROVIDER = 'github';
const LAST_ELEMENT_OFFSET = 1;

/**
 * authenticate the github using access token
 * @param {String} accessToken the access token of copilot
 * @returns {Object} the github instance
 * @private
 */
async function _authenticate(accessToken) {
  try {
    const github = new Octokit();
    github.authenticate({
      type: 'oauth',
      token: accessToken
    });
    return github;
  } catch (err) {
    throw new Error(`Failed to authenticate to Github using access token of copilot. ${err.message}`);
  }
}

describe('Topcoder X github tests', function test() {
  this.timeout(config.WAIT_TIME * config.MAX_RETRY_COUNT * 2); // eslint-disable-line no-magic-numbers, no-invalid-this

  let github;
  let user;
  let issue;
  let repo;

  before('create user, usermapping, repository, webhook', async () => {
    github = await _authenticate(config.GITHUB_ACCESS_TOKEN);

    ({data: user} = await github.users.get());

    ({data: repo} = await github.repos.create({
      name: config.GITHUB_REPOSITORY_NAME
    }));

    const secretWebhookKey = uuidv4();
    await github.repos.createHook({
      owner: user.login,
      repo: repo.name,
      name: 'web',
      active: true,
      events: [
        'push',
        'pull_request',
        'create',
        'commit_comment',
        'issue_comment',
        'issues',
        'label'
      ],
      config: {
        url: `${config.HOOK_BASE_URL}/webhooks/github`,
        content_type: 'json',
        secret: secretWebhookKey
      }
    });

    await utils.createUser({
      role: 'owner',
      type: PROVIDER,
      userProviderId: user.id,
      username: user.login,
      accessToken: config.GITHUB_ACCESS_TOKEN
    });
    await utils.createUserMapping(user.id, user.login, PROVIDER);
    await utils.createProject({
      title: repo.name,
      tcDirectId: config.TC_DIRECT_ID,
      repoUrl: repo.html_url,
      username: config.TOPCODER_USER_NAME,
      secretWebhookKey
    });
  });

  after('delete user, usermapping, repository, issue', async () => {
    await github.repos.delete({
      owner: user.login,
      repo: repo.name
    });
    await utils.cleanup(user.id, {
      repoUrl: repo.html_url,
      repositoryId: repo.id
    }, issue.number, PROVIDER);
  });

  describe('Tests for creating a Github ticket', async () => {
    before('create an issue', async () => {
      const {data: githubIssue} = await github.issues.create({
        owner: user.login,
        repo: repo.name,
        title: data.issueTitle,
        body: data.issueDescription
      });
      await utils.test(async () => {
        issue = await utils.getIssue(repo.id, githubIssue.number, PROVIDER);
      });
    });

    it('ensures that the challenge is created properly in the Topcoder platform', async () => {
      await utils.ensureChallengeIsCreated(issue.challengeId);

      const {data: comments} = await github.issues.getComments({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(comments);
      assert.isArray(comments);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const comment = data.contestCreatedComment(contestUrl);
      assert.strictEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);
    });
  });

  describe('Tests for updating a Github ticket - prize', () => {
    before('update prize of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        title: data.updatedPrizeTitle
      });
    });

    it('ensures that the prize is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengePrizeIsUpdated(issue.challengeId);
      const {data: comments} = await github.issues.getComments({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });

      assert.exists(comments);
      assert.isArray(comments);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const comment = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

      const {data: events} = await github.issues.getEvents({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });

      assert.exists(events);
      assert.isArray(events);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'renamed');
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].rename);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].rename, data.renamePrizeEvent);
    });
  });

  describe('Tests for updating a Github ticket - title', () => {
    before('update title of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        title: data.updatedIssueTitle
      });
    });

    it('ensures that the title is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengeTitleIsUpdated(issue.challengeId);
      const {data: comments} = await github.issues.getComments({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(comments);
      assert.isArray(comments);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const comment = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

      const {data: events} = await github.issues.getEvents({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(events);
      assert.isArray(events);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'renamed');
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].rename);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].rename, data.renameTitleEvent);
    });
  });

  describe('Tests for updating a Github ticket - description', () => {
    before('update description of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        body: data.updatedIssueDescription
      });
    });

    it('ensures that the description is updated properly in the Topcoder challenge', async () => {
      await utils.ensureChallengeDescriptionIsUpdated(issue.challengeId);

      const {data: comments} = await github.issues.getComments({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(comments);
      assert.isArray(comments);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const comment = data.contestUpdatedComment(contestUrl);
      assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);
    });
  });

  describe('Tests for assigning a Github ticket', () => {
    before('assign issue to member', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
    });

    it('ensures that the TC member is added to the TC challenge as expected', async () => {
      await utils.ensureChallengeIsAssigned(issue.challengeId, config.TOPCODER_USER_NAME);

      const {data: comments} = await github.issues.getComments({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(comments);
      assert.isArray(comments);
      const contestUrl = data.getUrlForChallengeId(issue.challengeId);
      const comment = data.contestAssignedComment(contestUrl, config.TOPCODER_USER_NAME);
      assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

      const {data: events} = await github.issues.getEvents({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });

      assert.exists(events);
      assert.isArray(events);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'assigned');
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assignee);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assignee.login, user.login);
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assigner);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assigner.login, user.login);
    });
  });

  describe('Tests for assigning a Github ticket - no mapping exists', () => {
    before('remove all assignees, remove user mapping, assign issue to member', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: []
      });

      await utils.removeUserMapping(user.id, PROVIDER);

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
    });

    after('add back user mapping, reassign user', async () => {
      await utils.addBackUserMapping(user.id, PROVIDER);
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
    });

    it('ensures that the TC member assignment is rolled back', async () => {
      await utils.test(async () => {
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(comments);
        assert.isArray(comments);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, data.signUpComment(user.login));

        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(events);
        assert.isArray(events);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'unassigned');
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assignee);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assignee.login, user.login);
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assigner);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assigner.login, user.login);
      });
    });
  });

  // THIS TEST WILL FAIL as the member is not removed as a registrant on TC challenge
  describe('Tests for unassigning a github ticket', () => {
    before('unassign an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: []
      });
    });

    after('reassign issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
    });

    it('ensures that the TC challenge goes back to unassigned and the existing assignee is removed', async () => {
      await utils.ensureChallengeIsUnassigned(issue.challengeId);

      const {data: events} = await github.issues.getEvents({
        owner: user.login,
        repo: repo.name,
        number: issue.number
      });
      assert.exists(events);
      assert.isArray(events);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'unassigned');
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assignee);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assignee.login, user.login);
      assert.exists(events[events.length - LAST_ELEMENT_OFFSET].assigner);
      assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].assigner.login, user.login);
    });
  });

  // THIS TEST WILL FAIL as the issue is not reopened if no assignee exists. It is ignored with a log message
  describe('Tests for closing a github ticket - no assigne exists', () => {
    before('remove assignees, close an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: []
      });
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        state: 'closed'
      });
    });

    after('reassign issue, reopen issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        state: 'open'
      });
    });

    it('ensures a comment is added to the Github ticket and the ticket is reopened', async () => {
      await utils.test(async () => {
        const {data: githubIssue} = await github.issues.get({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.deepEqual(githubIssue.state, 'open');

        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(comments);
        assert.isArray(comments);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, data.issueClosedWithNoAssigneeComment);
      });
    });
  });

  describe('Tests for closing a github ticket', () => {
    before('add assignee, close an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        assignees: [user.login]
      });
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issue.number,
        state: 'closed'
      });
    });

    it('ensures that the copilot is assigned and the challenge is closed', async () => {
      await utils.test(async () => {
        const {data: githubIssue} = await github.issues.get({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.deepEqual(githubIssue.state, 'closed');

        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(comments);
        assert.isArray(comments);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, data.paymentTaskComment(issue.challengeId));

        const {data: labels} = await github.issues.getLabels({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(labels);
        assert.isArray(labels);
        assert.deepEqual(labels[0].name, data.fixAcceptedLabel);
        assert.deepEqual(labels[1].name, data.paidLabel);
      });
    });
  });
});
