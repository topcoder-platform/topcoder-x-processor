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
  let issueNumber;

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
      secretWebhookKey,
      copilot: config.TOPCODER_USER_NAME,
      owner: user.login
    });
    await Promise.all(config.LABELS.map(async (label) => {
      await github.issues.createLabel({
        owner: user.login,
        repo: repo.name,
        name: label.name,
        color: label.color
      });
    }));
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
    before('create an issue in github', async () => {
      const {data: githubIssue} = await github.issues.create({
        owner: user.login,
        repo: repo.name,
        title: data.issueTitle,
        body: data.issueDescription,
        labels: data.issueLabels
      });
      issueNumber = githubIssue.number;

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the challenge is created properly in the Topcoder platform', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeIsCreated(issue.challengeId);

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issue.number
        });
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestCreatedComment(contestUrl), config.TOPCODER_USER_NAME);
        assert.strictEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);
      });
    });
  });

  describe('Tests for updating a Github ticket - prize', () => {
    before('update prize of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        title: data.updatedPrizeTitle
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the prize is updated properly in the Topcoder challenge', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengePrizeIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

        /** Ensure that event correct **/
        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(events);
        assert.isArray(events);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'renamed');
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET].rename);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].rename, data.renamePrizeEvent);
      });
    });
  });

  describe('Tests for updating a Github ticket - title', () => {
    before('update title of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        title: data.updatedIssueTitle
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the title is updated properly in the Topcoder challenge', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeTitleIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

        /** Ensure that event correct **/
        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(events);
        assert.isArray(events);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].event, 'renamed');
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET].rename);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET].rename, data.renameTitleEvent);
      });
    });
  });

  describe('Tests for updating a Github ticket - description', () => {
    before('update description of an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        body: data.updatedIssueDescription
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the description is updated properly in the Topcoder challenge', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeDescriptionIsUpdated(issue.challengeId);

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUpdatedComment(contestUrl), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);
      });
    });
  });

  describe('Tests for assigning a Github ticket', () => {
    before('assign issue to member', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: [user.login]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC member is added to the TC challenge as expected', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeIsAssigned(issue.challengeId, config.TOPCODER_USER_NAME);

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestAssignedComment(contestUrl, config.TOPCODER_USER_NAME), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

        /** Ensure that event correct **/
        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(events);
        assert.isArray(events);

        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].event, 'assigned');  // eslint-disable-line no-magic-numbers
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET - 2].assignee);  // eslint-disable-line no-magic-numbers
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].assignee.login, user.login);  // eslint-disable-line no-magic-numbers
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET - 2].assigner);  // eslint-disable-line no-magic-numbers
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].assigner.login, user.login);  // eslint-disable-line no-magic-numbers
      });
    });
  });

  describe('Tests for assigning a Github ticket - no mapping exists', () => {
    before('remove all assignees, remove user mapping, assign issue to member', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await utils.removeUserMapping(user.id, PROVIDER);

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: [user.login]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('add back user mapping, reassign user', async () => {
      await utils.addBackUserMapping(user.id, PROVIDER);

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: [user.login]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC member assignment is rolled back', async () => {
      await utils.test(async () => {
        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.signUpComment(user.login), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

        /** Ensure that event correct **/
        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
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

  describe('Tests for unassigning a github ticket', () => {
    before('unassign an issue', async () => {
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue', async () => {
      await utils.test(async () => {
        await github.issues.edit({
          owner: user.login,
          repo: repo.name,
          number: issueNumber,
          assignees: [user.login]
        });
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the TC challenge goes back to unassigned and the existing assignee is removed', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeIsUnassigned(issue.challengeId);
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });

        /** Ensure that comment correct **/
        const contestUrl = data.getUrlForChallengeId(issue.challengeId);
        const comment = data.prepareAutomatedComment(data.contestUnAssignedComment(contestUrl, config.TOPCODER_USER_NAME), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);

        /** Ensure that event correct **/
        const {data: events} = await github.issues.getEvents({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(events);
        assert.isArray(events);
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].event, 'unassigned'); // eslint-disable-line no-magic-numbers
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET - 2].assignee); // eslint-disable-line no-magic-numbers
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].assignee.login, user.login); // eslint-disable-line no-magic-numbers
        assert.exists(events[events.length - LAST_ELEMENT_OFFSET - 2].assigner); // eslint-disable-line no-magic-numbers
        assert.deepEqual(events[events.length - LAST_ELEMENT_OFFSET - 2].assigner.login, user.login); // eslint-disable-line no-magic-numbers
      });
    });
  });

 // THIS TEST WILL FAIL as the issue is not reopened if no assignee exists. It is ignored with a log message
  describe('Tests for closing a github ticket - no assigne exists', () => {
    before('remove assignees, close an issue', async () => {
      // add tcx_FixAccepted Label
      await github.issues.addLabels({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        labels: [config.FIX_ACCEPTED_ISSUE_LABEL]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // remove assignee
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: []
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      // close ticket
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        state: 'closed'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue, reopen issue', async () => {
      // remove tcx_FixAccepted label
      await github.issues.removeLabel({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        name: config.FIX_ACCEPTED_ISSUE_LABEL
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        assignees: [user.login]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        state: 'open'
      });
    });

    it('ensures a comment is added to the Github ticket and the ticket is reopened', async () => {
      await utils.test(async () => {
        /** Ensure that ticket state correct **/
        const {data: githubIssue} = await github.issues.get({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.deepEqual(githubIssue.state, 'open');

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, data.issueClosedWithNoAssigneeComment);
      });
    });
  });

  describe('Tests for closing a github ticket - without tcx_FixAccepted label', () => {
    before('remove tcx_FixAccepted label, close an issue', async () => {
      // close ticket
      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        state: 'closed'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    after('reassign issue, reopen issue', async () => {
      await utils.test(async () => {
        await github.issues.edit({
          owner: user.login,
          repo: repo.name,
          number: issueNumber,
          assignees: [user.login]
        });

        await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

        await github.issues.edit({
          owner: user.login,
          repo: repo.name,
          number: issueNumber,
          state: 'open'
        });

        await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
      });
    });

    it('ensures a comment is added to the Github ticket and the ticket is close', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeActive(issue.challengeId);

        /** Ensure that ticket state correct **/
        const {data: githubIssue} = await github.issues.get({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.deepEqual(githubIssue.state, 'closed');

        /** Ensure that comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.noPaymentTaskComment(config.FIX_ACCEPTED_ISSUE_LABEL), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);
      });
    });
  });

  describe('Tests for closing a github ticket', () => {
    before('add assignee, close an issue', async () => {
      // add FIX_ACCEPTED Label
      await github.issues.addLabels({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        labels: [config.FIX_ACCEPTED_ISSUE_LABEL]
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers

      await github.issues.edit({
        owner: user.login,
        repo: repo.name,
        number: issueNumber,
        state: 'closed'
      });

      await utils.sleep(config.WAIT_TIME / 2); // eslint-disable-line no-magic-numbers
    });

    it('ensures that the copilot is assigned and the challenge is closed', async () => {
      await utils.test(async () => {
        /** Ensure that TC challenge correct **/
        issue = await utils.getIssue(repo.id, issueNumber, PROVIDER);
        await utils.ensureChallengeCompleted(issue.challengeId);

        /** Ensure that issue state correct **/
        const {data: githubIssue} = await github.issues.get({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.deepEqual(githubIssue.state, 'closed');

        /** Ensure that TC comment correct **/
        const {data: comments} = await github.issues.getComments({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(comments);
        assert.isArray(comments);
        const comment = data.prepareAutomatedComment(data.paymentTaskComment(issue.challengeId), config.TOPCODER_USER_NAME);
        assert.deepEqual(comments[comments.length - LAST_ELEMENT_OFFSET].body, comment);


        /** Ensure that labels correct **/
        const {data: labels} = await github.issues.getIssueLabels({
          owner: user.login,
          repo: repo.name,
          number: issueNumber
        });
        assert.exists(labels);
        assert.isArray(labels);
        assert.deepEqual(labels[1].name, data.fixAcceptedLabel);
        assert.deepEqual(labels[2].name, data.paidLabel); // eslint-disable-line no-magic-numbers
      });
    });
  });
});
