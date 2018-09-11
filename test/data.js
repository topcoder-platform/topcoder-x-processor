/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides data for tests
 * @author TCSCODER
 * @version 1.0
 */

const config = require('config');

const PRIZE = 1;
const UPDATED_PRIZE = 2;

module.exports = {
  issueTitle: `[$${PRIZE}] This is a test issue`,
  issueDescription: 'This is a description',
  updatedPrizeTitle: `[$${UPDATED_PRIZE}] This is a test issue`,
  updatedIssueTitle: `[$${UPDATED_PRIZE}] This is an updated test issue`,
  updatedIssueDescription: 'This is an updated description',
  challengeTitle: 'This is a test issue',
  challengeDescription: '<p>This is a description</p>\n',
  challengePrize: [PRIZE],
  updatedChallengeTitle: 'This is an updated test issue',
  updatedChallengePrize: [UPDATED_PRIZE],
  updatedChallengeDescription: '<p>This is an updated description</p>\n',
  updatedPrizeNote: 'changed title from **[${-1-}] This is a test issue** to **[${+2+}] This is a test issue**', // eslint-disable-line max-len, no-template-curly-in-string
  updatedTitleNote: 'changed title from **[$2] This is a test issue** to **[$2] This is a{+n updated+} test issue**',
  updatedDescriptionNote: 'changed the description',
  issueClosedWithNoAssigneeComment: 'Issue reopened as it was unassigned', // Change this when implemented
  fixAcceptedLabel: 'Fix accepted',
  paidLabel: 'Paid',
  renamePrizeEvent: {
    from: `[$${PRIZE}] This is a test issue`,
    to: `[$${UPDATED_PRIZE}] This is a test issue`
  },
  renameTitleEvent: {
    from: `[$${UPDATED_PRIZE}] This is a test issue`,
    to: `[$${UPDATED_PRIZE}] This is an updated test issue`
  },
  getUrlForChallengeId: (challengeId) => `${config.TC_URL}/challenges/${challengeId}`,
  contestCreatedComment: (contestUrl) => `Contest ${contestUrl} has been created for this ticket.`,
  contestUpdatedComment: (contestUrl) => `Contest ${contestUrl} has been updated - the new changes has been updated for this ticket.`,
  contestAssignedComment: (contestUrl, username) => `Contest ${contestUrl} has been updated - it has been assigned to ${username}.`,
  assignedComment: (username) => `assigned to @${username}`,
  unassignedComment: (username) => `unassigned @${username}`,
  signUpComment: (username) => `@${username}, please sign-up with Topcoder X tool`,
  paymentTaskComment: (challengeId) => `Payment task has been updated: https://software.topcoder-dev.com/review/actions/ViewProjectDetails?pid=${challengeId}`
};
