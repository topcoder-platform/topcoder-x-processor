'use strict';
/* eslint-disable no-magic-numbers */

const Joi = require('joi');
const uuid = require('uuid').v4;
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const logger = require('../utils/logger');
const GitlabService = require('../services/GitlabService');
const {GITLAB_ACCESS_LEVELS} = require('../constants');

const ProjectChallengeMapping = models.ProjectChallengeMapping;
const Project = models.Project;
const Repository = models.Repository;
const User = models.User;
const GitlabUserMapping = models.GitlabUserMapping;

/**
 * Handles a user registration event.
 * @param {Object} payload The event payload.
 * @param {String} payload.challengeId The user handle.
 * @param {String} payload.memberId The user email.
 * @param {String} payload.memberHandle The user first name.
 */
async function process(payload) {
  const {challengeId, memberId, memberHandle} = payload;
  const correlationId = uuid();
  const logPrefix = `[${correlationId}][PullRequestService#process]`;
  logger.debug(`${logPrefix}: Challenge ID: ${challengeId}`);
  logger.debug(`${logPrefix}: Member ID: ${memberId}`);
  logger.debug(`${logPrefix}: Member Handle: ${memberHandle}`);
  // Check if there are projects mapped to the challenge
  const filterValues = {};
  const filter = {
    FilterExpression: '#challengeId = :challengeId',
    ExpressionAttributeNames: {
      '#challengeId': 'challengeId'
    },
    ExpressionAttributeValues: {
      ':challengeId': challengeId
    }
  };
  const projectChallengeMapping = await dbHelper.scan(ProjectChallengeMapping, filter, filterValues);
  if (projectChallengeMapping.length === 0) {
    logger.info(`${logPrefix} ProjectChallengeMapping not found for challengeId: ${challengeId}`);
    return;
  }
  logger.debug(`${logPrefix} ProjectChallengeMapping: ${JSON.stringify(projectChallengeMapping)}`);
  // Get Project
  const projectId = projectChallengeMapping[0].projectId;
  const project = await dbHelper.getById(Project, projectId);
  if (!project) {
    logger.info(`${logPrefix} Project not found for projectId: ${projectId}`);
    return;
  }
  logger.debug(`${logPrefix} Project: ${JSON.stringify(project)}`);
  // Get Repositories
  const repositories = await dbHelper.queryAllRepositoriesByProjectId(Repository, project.id);
  if (!repositories || repositories.length === 0) {
    logger.info(`${logPrefix} Repository not found for projectId: ${project.id}`);
    return;
  }
  logger.debug(`${logPrefix} Repository: ${JSON.stringify(repositories)}`);
  // Get Co-pilot GitlabUserMapping
  const copilotGitlabUserMapping = await dbHelper.queryOneUserMappingByTCUsername(GitlabUserMapping, project.copilot);
  if (!copilotGitlabUserMapping) {
    logger.info(`${logPrefix} GitlabUserMapping not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUserMapping[Copilot]: ${JSON.stringify(copilotGitlabUserMapping)}`);
  // Get Gitlab User
  const copilotGitlabUser = await dbHelper.queryOneUserByType(User, copilotGitlabUserMapping.gitlabUsername, 'gitlab');
  if (!copilotGitlabUser) {
    logger.info(`${logPrefix} GitlabUser not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUser[Copilot]: ${JSON.stringify(copilotGitlabUser)}`);
  // Initialize Copilot Gitlab Service
  const copilotGitlabService = await GitlabService.create(copilotGitlabUser);
  // Get Member GitlabUserMapping
  const memberGitlabUserMapping = await dbHelper.queryOneUserMappingByTCUsername(GitlabUserMapping, memberHandle);
  if (!memberGitlabUserMapping) {
    logger.info(`${logPrefix} GitlabUserMapping not found for memberHandle: ${memberHandle}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUserMapping[Member]: ${JSON.stringify(memberGitlabUserMapping)}`);
  // Get Gitlab User
  const memberGitlabUser = await dbHelper.queryOneUserByType(User, memberGitlabUserMapping.gitlabUsername, 'gitlab');
  if (!memberGitlabUser) {
    logger.info(`${logPrefix} GitlabUser not found for memberHandle: ${memberHandle}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUser[Member]: ${JSON.stringify(memberGitlabUser)}`);
  // Initialize Member Gitlab Service
  const memberGitlabService = await GitlabService.create(memberGitlabUser);
  await Promise.all(repositories.map(async (repo) => {
    try {
      const repository = await memberGitlabService.getRepository(repo.url);
      if (!repository) {
        logger.info(`${logPrefix} Repository not found for repo: ${repo}`);
        return;
      }
      // Add user as a guest to the repo
      await copilotGitlabService.addUserToRepository(repository, memberGitlabUser, GITLAB_ACCESS_LEVELS.DEVELOPER);
      // Fork the repository
      await memberGitlabService.forkRepository(repository);
    } catch (err) {
      logger.error(`${logPrefix} Error: ${err.message}`, err);
    }
  }));
}
process.schema = Joi.object().keys({
  payload: Joi.object().keys({
    challengeId: Joi.string().required(),
    memberId: Joi.string().required(),
    memberHandle: Joi.string().required()
  }).required()
});

module.exports = {
  process
};

logger.buildService(module.exports);

