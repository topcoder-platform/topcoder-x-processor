'use strict';

const _ = require('lodash');
const Joi = require('joi');
const uuid = require('uuid').v4;
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const logger = require('../utils/logger');
const GitlabService = require('../services/GitlabService');

const GitlabUserMapping = models.GitlabUserMapping;

/**
 * Handles a pull request creation event.
 * @param {Object} payload The event payload.
 * @param {String} payload.provider The provider (gitlab or github)
 * @param {Object} payload.data The event payload.
 * @param {Object} payload.data.pull_request The pull request.
 * @param {Number} payload.data.pull_request.number The pull request number.
 * @param {Number} payload.data.pull_request.id The pull request id.
 * @param {Object} payload.data.pull_request.merged The pull request merged flag.
 * @param {Object} payload.data.pull_request.body The pull request body.
 * @param {Object} payload.data.pull_request.title The pull request title.
 * @param {Object} payload.data.pull_request.user The pull request user.
 * @param {Number} payload.data.pull_request.user.id The pull request user id.
 * @param {Object} payload.data.repository The repository.
 * @param {Number} payload.data.repository.id The repository id.
 * @param {String} payload.data.repository.name The repository name.
 * @param {String} payload.data.repository.full_name The repository full name.
 */
async function process(payload) {
  const {provider, data: {pull_request: pullRequest, repository}} = payload;
  const {number: prNumber, id, user} = pullRequest;
  const {id: userId} = user;
  const {id: repoId, name: repoName, full_name: repoFullName} = repository;
  const correlationId = uuid();
  const logPrefix = `[${correlationId}][PullRequestService#process]`;
  logger.debug(`${logPrefix}: Provider: ${provider}`);
  logger.debug(`${logPrefix}: PR Number: ${prNumber}`);
  logger.debug(`${logPrefix}: PR Id: ${id}`);
  logger.debug(`${logPrefix}: User Id: ${userId}`);
  logger.debug(`${logPrefix}: Repo Id: ${repoId}`);
  logger.debug(`${logPrefix}: Repo Name: ${repoName}`);
  logger.debug(`${logPrefix}: Repo Full Name: ${repoFullName}`);
  // 1. Find the TCX user using the GitLab user id (if not found, return)
  const submitter = await dbHelper.queryOneUserMappingByGitlabUserId(GitlabUserMapping, userId);
  if (!submitter) {
    logger.info(`${logPrefix} GitlabUserMapping not found for userId: ${userId}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUserMapping[Submitter]: ${JSON.stringify(submitter)}`);
  // 2. Get the full GitLab project link
  const gitlabProjectLink = await GitlabService.getRepoUrl(repoFullName);
  logger.debug(`${logPrefix} GitLab project link: ${gitlabProjectLink}`);
  // 3. Find the TCX project using the GitLab project link (if not found, return)
  const project = await dbHelper.queryOneProjectByRepositoryLink(gitlabProjectLink);
  if (!project) {
    logger.info(`${logPrefix} Project not found for gitlabProjectLink: ${gitlabProjectLink}`);
    return;
  }
  logger.debug(`${logPrefix} Project: ${JSON.stringify(project)}`);
  // 4. Find all repositories corresponding to the TCX project
  const repositories = await dbHelper.queryAllRepositoriesByProjectId(project.id);
  if (!repositories || repositories.length === 0) {
    logger.info(`${logPrefix} Repositories not found for projectId: ${project.id}`);
    return;
  }
  logger.debug(`${logPrefix} Repositories: ${JSON.stringify(repositories)}`);
  // 5. Get co-pilot's GitlabUserMapping
  const copilot = await dbHelper.queryOneUserMappingByTCUsername(GitlabUserMapping, project.copilot);
  if (!copilot) {
    logger.info(`${logPrefix} GitlabUserMapping not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUserMapping[Copilot]: ${JSON.stringify(copilot)}`);
  // 6. Get co-pilot's Gitlab user
  const copilotGitlabUser = await dbHelper.queryOneUserByType(models.User, copilot.gitlabUsername, 'gitlab');
  if (!copilotGitlabUser) {
    logger.info(`${logPrefix} GitlabUser not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUser[Copilot]: ${JSON.stringify(copilotGitlabUser)}`);
  // 7. For each project, get the repositories
  const gitRepositories = await Promise.all(repositories.map((repo) => GitlabService.getRepository(copilotGitlabUser, repo.url)));
  if (!gitRepositories || gitRepositories.length === 0) {
    logger.info(`${logPrefix} Git repositories not found for repositories: ${JSON.stringify(repositories)}`);
    return;
  }
  logger.debug(`${logPrefix} Git repositories: ${JSON.stringify(gitRepositories)}`);
  // 8. For each repository, get the merge requests
  const mergeRequests = await Promise.all(
    gitRepositories.map((repo) => GitlabService.getOpenMergeRequestsByUser(copilotGitlabUser, repo, submitter.gitlabUserId))
  );
  if (!mergeRequests || mergeRequests.length === 0) {
    logger.info(`${logPrefix} Merge requests not found for repositories: ${JSON.stringify(gitRepositories)}`);
    return;
  }
  logger.debug(`${logPrefix} Merge requests: ${JSON.stringify(mergeRequests)}`);
  // 9. Ensure that there exists a merge request by the same member as the pull request for each project (if not, return)
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < mergeRequests.length; i += 1) {
    const mr = mergeRequests[i];
    if (!mr || mr.length === 0) {
      logger.info(`${logPrefix} Merge request not found for repository: ${gitRepositories[i].web_url}`);
      return;
    }
  }
  // 10. Get the latest merge request for each project
  const latestMergeRequests = mergeRequests.map((mrs) => _.maxBy(mrs, (mr) => new Date(mr.created_at).getTime()));
  logger.debug(`${logPrefix} Latest merge requests: ${JSON.stringify(latestMergeRequests)}`);
  // 11. Create patch files for each merge request
  const patches = await Promise.all(
    latestMergeRequests.map((mr) => GitlabService.getMergeRequestDiffPatches(copilotGitlabUser, mr))
  );
  if (!patches || patches.length !== latestMergeRequests.length) {
    logger.info(`${logPrefix} Patches not found for merge requests.`);
    return;
  }
  logger.debug(`${logPrefix} Patches: ${JSON.stringify(patches)}`);
  // 11. Get the topcoder M2M token
  // 10. Create a zip file containing all patch files
  // 11. Use the submission API to submit the zip file
}

process.schema = Joi.object().keys({
  event: Joi.string().valid('pull_request.created').required(),
  provider: Joi.string().valid('gitlab').required(),
  data: Joi.object().keys({
    pullRequest: Joi.object().keys({
      number: Joi.number().required(),
      id: Joi.number().required(),
      user: Joi.object().keys({
        id: Joi.number().required()
      }).required(),
      repository: Joi.object().keys({
        id: Joi.number().required(),
        name: Joi.string().required(),
        full_name: Joi.string().required()
      }).required()
    }).required()
  }).required()
});

module.exports = {
  process
};

logger.buildService(module.exports);
