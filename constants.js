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
  CANCELED: 'Canceled'
};

const SERVICE_ERROR_STATUS = 500;

module.exports = {
  USER_ROLES,
  USER_TYPES,
  SERVICE_ERROR_STATUS,
  CHALLENGE_STATUS
};
