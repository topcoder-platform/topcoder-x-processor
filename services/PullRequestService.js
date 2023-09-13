'use strict';

const _ = require('lodash');
const Joi = require('joi');
const uuid = require('uuid').v4;
const archiver = require('archiver');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const logger = require('../utils/logger');
const GitlabService = require('../services/GitlabService');
const TopcoderApiHelper = require('../utils/topcoder-api-helper');

const GitlabUserMapping = models.GitlabUserMapping;

/**
 * Normalizes a string to be used as a file name.
 * @param {String} fileName File name to normalize
 * @returns {String} Normalized file name
 */
function normalizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

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
  // 4. Find the challenge ID for the TCX project
  const challengeId = await dbHelper.queryChallengeIdByProjectId(project.id);
  if (!challengeId) {
    logger.info(`${logPrefix} ProjectChallengeMapping not found for projectId: ${project.id}`);
    return;
  }
  logger.debug(`${logPrefix} Challenge ID: ${challengeId}`);
  // 5. Find all repositories corresponding to the TCX project
  const repositories = await dbHelper.queryAllRepositoriesByProjectId(project.id);
  if (!repositories || repositories.length === 0) {
    logger.info(`${logPrefix} Repositories not found for projectId: ${project.id}`);
    return;
  }
  logger.debug(`${logPrefix} Repositories: ${JSON.stringify(repositories)}`);
  // 6. Get co-pilot's GitlabUserMapping
  const copilot = await dbHelper.queryOneUserMappingByTCUsername(GitlabUserMapping, project.copilot);
  if (!copilot) {
    logger.info(`${logPrefix} GitlabUserMapping not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUserMapping[Copilot]: ${JSON.stringify(copilot)}`);
  // 7. Get co-pilot's Gitlab user
  const copilotGitlabUser = await dbHelper.queryOneUserByType(models.User, copilot.gitlabUsername, 'gitlab');
  if (!copilotGitlabUser) {
    logger.info(`${logPrefix} GitlabUser not found for copilot: ${project.copilot}`);
    return;
  }
  logger.debug(`${logPrefix} GitlabUser[Copilot]: ${JSON.stringify(copilotGitlabUser)}`);
  // 8. Init the Gitlab service for co-pilot
  const copilotGitlabService = await GitlabService.create(copilotGitlabUser);
  // 9. For each project, get the repositories
  const gitRepositories = await Promise.all(repositories.map((repo) => copilotGitlabService.getRepository(repo.url)));
  if (!gitRepositories || gitRepositories.length === 0) {
    logger.info(`${logPrefix} Git repositories not found for repositories: ${JSON.stringify(repositories)}`);
    return;
  }
  logger.debug(`${logPrefix} Git repositories: ${JSON.stringify(gitRepositories)}`);
  // 10. For each repository, get the merge requests
  const mergeRequests = await Promise.all(
    gitRepositories.map((repo) => copilotGitlabService.getOpenMergeRequestsByUser(repo, submitter.gitlabUserId))
  );
  if (!mergeRequests || mergeRequests.length === 0) {
    logger.info(`${logPrefix} Merge requests not found for repositories: ${JSON.stringify(gitRepositories)}`);
    return;
  }
  logger.debug(`${logPrefix} Merge requests: ${JSON.stringify(mergeRequests)}`);
  // 11. Ensure that there exists a merge request by the same member as the pull request for each project (if not, return)
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < mergeRequests.length; i += 1) {
    const mr = mergeRequests[i];
    if (!mr || mr.length === 0) {
      logger.info(`${logPrefix} Merge request not found for repository: ${gitRepositories[i].web_url}`);
      return;
    }
  }
  // 12. Get the latest merge request for each project
  const latestMergeRequests = mergeRequests.map((mrs) => _.maxBy(mrs, (mr) => new Date(mr.created_at).getTime()));
  logger.debug(`${logPrefix} Latest merge requests: ${JSON.stringify(latestMergeRequests)}`);
  // 13. Create patch files for each merge request
  const patches = await Promise.all(
    latestMergeRequests.map((mr) => copilotGitlabService.getMergeRequestDiffPatches(mr))
  );
  if (!patches || patches.length !== latestMergeRequests.length) {
    logger.info(`${logPrefix} Patches not found for merge requests.`);
    return;
  }
  logger.debug(`${logPrefix} Patches: ${JSON.stringify(patches)}`);
  // 14. Create a zip file containing all patch files
  logger.debug(`${logPrefix} Creating zip file...`);
  const zipStream = archiver('zip');
  const zipBufferPromise = new Promise((resolve, reject) => {
    const buffers = [];
    zipStream.on('data', (data) => {
      buffers.push(data);
    });
    zipStream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    zipStream.on('error', reject);
  });
  patches.forEach((patch) => {
    const buffer = Buffer.from(patch);
    zipStream.append(buffer, {name: `${normalizeFileName(repoFullName)}.patch`});
  });
  await zipStream.finalize();
  const zipBuffer = await zipBufferPromise;
  logger.debug(`${logPrefix} Zip file size: ${zipBuffer.length}`);
  // 15. Get the Topcoder user's member ID
  const memberId = await TopcoderApiHelper.getTopcoderMemberId(submitter.topcoderUsername);
  if (!memberId) {
    logger.info(`${logPrefix} Member ID not found for topcoderUsername: ${submitter.topcoderUsername}`);
    return;
  }
  logger.debug(`${logPrefix} Member ID: ${memberId}`);
  // 16. Use the submission API to submit the zip file
  logger.debug(`${logPrefix} Submitting the zip file...`);
  const submission = await TopcoderApiHelper.createSubmission(
    challengeId,
    memberId,
    zipBuffer,
    `${correlationId}.zip`,
  );
  logger.debug(`${logPrefix} Submission: ${JSON.stringify(submission.data)}`);
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
