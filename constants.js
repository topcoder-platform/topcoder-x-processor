'use strict';

/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */

/**
 * Define constants.
 *
 * @author TCSCODER
 * @version 1.0
 */

// The user types
const USER_TYPES = {
  GITHUB: 'github',
  GITLAB: 'gitlab'
};

// The user roles
const USER_ROLES = {
  OWNER: 'owner'
};

// The challenge status
const CHALLENGE_STATUS = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELED: 'Cancelled'
};

const SERVICE_ERROR_STATUS = 500;

// issue status
const ISSUE_STATUS = {
  CHALLENGE_CANCELLED: 'challenge_cancelled',
  CHALLENGE_CREATION_PENDING: 'challenge_creation_pending',
  CHALLENGE_CREATION_SUCCESSFUL: 'challenge_creation_successful',
  CHALLENGE_CREATION_FAILED: 'challenge_creation_failed',
  CHALLENGE_CREATION_RETRIED: 'challenge_creation_retried',
  CHALLENGE_PAYMENT_SUCCESSFUL: 'challenge_payment_successful',
  CHALLENGE_PAYMENT_PENDING: 'challenge_payment_pending',
  CHALLENGE_PAYMENT_FAILED: 'challenge_payment_failed'
};

module.exports = {
  USER_ROLES,
  USER_TYPES,
  SERVICE_ERROR_STATUS,
  CHALLENGE_STATUS,
  ISSUE_STATUS
};
