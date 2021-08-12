/*
 * Copyright (c) 2018 TopCoder, Inc. All rights reserved.
 */
'use strict';
const logger = require('./logger');

/**
 * This module contains the database helper methods.
 *
 * @version 1.0
 */

/**
 * Get Data by model id
 * @param {Object} model The dynamoose model to query
 * @param {String} id The id value
 * @returns {Promise<void>}
 */
async function getById(model, id) {
  return await new Promise((resolve, reject) => {
    model.queryOne('id').eq(id).consistent().exec((err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result);
    });
  });
}

/**
 * Get data collection by scan parameters
 * @param {Object} model The dynamoose model to scan
 * @param {Object} scanParams The scan parameters object
 * @returns {Promise<void>}
 */
async function scan(model, scanParams) {
  return await new Promise((resolve, reject) => {
    model.scan(scanParams).consistent().all().exec((err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result.count === 0 ? [] : result);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} repositoryId The repository id to query
 * @param {Number} number The number id to query
 * @param {String} provider The provider id to query
 * @returns {Promise<void>}
 */
async function queryOneIssue(model, repositoryId, number, provider) {
  return await new Promise((resolve, reject) => {
    model.query('repositoryId').eq(repositoryId)
    .where('number')
    .eq(number)
    .filter('provider')
    .eq(provider)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOne. Error. ${err}`);
        return reject(err);
      }

      return resolve(result.count === 0 ? null : result[0]);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} repoUrl The repository url
 * @returns {Promise<void>}
 */
async function queryOneActiveProject(model, repoUrl) {
  return await new Promise((resolve, reject) => {
    model.scan('repoUrls').contains(repoUrl)
    .filter('archived')
    .eq('false')
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneActiveProject. Error. ${err}`);
        return reject(err);
      }
      return resolve(result.count === 0 ? null : result[0]);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} username The user username
 * @param {String} type The type of user
 * @returns {Promise<void>}
 */
async function queryOneUserByType(model, username, type) {
  return await new Promise((resolve, reject) => {
    model.query('username').eq(username)
    .where('type')
    .eq(type)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneUserByType. Error. ${err}`);
        return reject(err);
      }
      return resolve(result.count === 0 ? null : result[0]);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} tcusername The tc username
 * @returns {Promise<void>}
 */
async function queryOneUserMappingByTCUsername(model, tcusername) {
  return await new Promise((resolve, reject) => {
    model.queryOne('topcoderUsername').eq(tcusername)
    .all()
    .exec((err, result) => {
      if (err) {
        logger.debug(`queryOneUserMappingByTCUsername. Error. ${err}`);
        return reject(err);
      }
      return resolve(result);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} username The username
 * @returns {Promise<void>}
 */
async function queryOneUserMappingByGithubUsername(model, username) {
  return await new Promise((resolve, reject) => {
    model.queryOne('githubUsername').eq(username)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneUserMappingByGithubUsername. Error. ${err}`);
        return reject(err);
      }
      return resolve(result);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {String} username The username
 * @returns {Promise<void>}
 */
async function queryOneUserMappingByGitlabUsername(model, username) {
  return await new Promise((resolve, reject) => {
    model.queryOne('gitlabUsername').eq(username)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneUserMappingByGitlabUsername. Error. ${err}`);
        return reject(err);
      }
      return resolve(result);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {Number} userId The user id
 * @returns {Promise<void>}
 */
async function queryOneUserMappingByGithubUserId(model, userId) {
  return await new Promise((resolve, reject) => {
    model.queryOne('githubUserId').eq(userId)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneUserMappingByGithubUserId. Error. ${err}`);
        return reject(err);
      }
      return resolve(result);
    });
  });
}

/**
 * Get single data by query parameters
 * @param {Object} model The dynamoose model to query
 * @param {Number} userId The  The user id
 * @returns {Promise<void>}
 */
async function queryOneUserMappingByGitlabUserId(model, userId) {
  return await new Promise((resolve, reject) => {
    model.queryOne('gitlabUserId').eq(userId)
    .all()
    .exec((err, result) => {
      if (err || !result) {
        logger.debug(`queryOneUserMappingByGitlabUserId. Error. ${err}`);
        return reject(err);
      }
      return resolve(result);
    });
  });
}

/**
 * Update collection
 * @param {Object} model The dynamoose model to update
 * @param {Array} collection The update data collection
 */
async function updateMany(model, collection) {
  await new Promise((resolve, reject) => {
    model.batchPut(collection, (err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result);
    });
  });
}

/**
 * Create item in database
 * @param {Object} Model The dynamoose model to query
 * @param {Object} data The create data object
 * @returns {Promise<void>}
 */
async function create(Model, data) {
  return await new Promise((resolve, reject) => {
    const dbItem = new Model(data);
    dbItem.save((err) => {
      if (err) {
        return reject(err);
      }

      return resolve(dbItem);
    });
  });
}

/**
 * Update item in database
 * @param {Object} Model The dynamoose model to update
 * @param {String} id The id of item
 * @param {Object} data The updated data object
 * @returns {Promise<void>}
 */
async function update(Model, id, data) {
  const dbItem = await getById(Model, id);
  Object.keys(data).forEach((key) => {
    dbItem[key] = data[key];
  });
  return await new Promise((resolve, reject) => {
    dbItem.save((err) => {
      if (err) {
        return reject(err);
      }

      return resolve(dbItem);
    });
  });
}

/**
 * Delete item in database
 * @param {Object} Model The dynamoose model to delete
 * @param {String} id The id of copilot payment
 */
async function removeCopilotPayment(Model, id) {
  const dbItem = await getById(Model, id);
  await new Promise((resolve, reject) => {
    if (dbItem != null) {
      dbItem.delete((err) => {
        if (err) {
          return reject(err);
        }

        return resolve(dbItem);
      });
    }
  });
}

/**
 * Delete issue item in database
 * @param {Object} Model The dynamoose model to delete
 * @param {String} repositoryId The repository id to delete
 * @param {Number} number The number id to delete
 * @param {String} provider The provider id to delete
 */
async function removeIssue(Model, repositoryId, number, provider) {
  const dbItem = await queryOneIssue(Model, repositoryId, number, provider);
  await new Promise((resolve, reject) => {
    if (dbItem != null) {
      dbItem.delete((err) => {
        if (err) {
          return reject(err);
        }

        return resolve(dbItem);
      });
    }
  });
}

module.exports = {
  getById,
  scan,
  updateMany,
  create,
  update,
  queryOneActiveProject,
  queryOneIssue,
  queryOneUserByType,
  queryOneUserMappingByGithubUserId,
  queryOneUserMappingByGitlabUserId,
  queryOneUserMappingByGithubUsername,
  queryOneUserMappingByGitlabUsername,
  queryOneUserMappingByTCUsername,
  removeCopilotPayment,
  removeIssue
};
