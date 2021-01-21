'use strict';

const _ = require('lodash');
const models = require('../models');
const dbHelper = require('../utils/db-helper');
const logger = require('../utils/logger');
const topcoderApiHelper = require('../utils/topcoder-api-helper');

/**
 * Migrate direct ids to connect ids
 */
async function migrate() {
    // How many projects per scan
  const batchSize = process.env.BATCH_SIZE || 15; // eslint-disable-line no-magic-numbers
  let batch = 1;
    // How many projects have been returned in previous scan
  let previousSize = batchSize;
    // Key of a last project
  let previousKey = null;
  while (previousSize === batchSize) { // eslint-disable-line no-restricted-syntax
    logger.info(`Starting batch ${batch}`);
    // Scan for projects with field isConnect null and return its id and tcDirectId
    const projects = await models.Project.scan('isConnect')
            .null()
            .attributes(['id', 'tcDirectId'])
            .limit(batchSize)
            .startAt(previousKey)
            .consistent()
            .exec();
    previousSize = projects.count;
    previousKey = projects.lastKey;
    const promises = _.map(projects, (project) => topcoderApiHelper.getProjectByDirectId(project.id, project.tcDirectId));
        // Execute all promises and process data
    await Promise.all(promises).then(async (resArray) => {
            // Filter out empty arrays
      const directProjects = _.filter(resArray, (res) => res.data.length > 0);
      await Promise.all(_.map(directProjects, (directProject) =>
                // Promise to update tcDirectId and set isConnect field to true for project with its id
                 dbHelper.update(models.Project,
                   directProject.dbId,
                   {
                     tcDirectId: directProject.data[0].id,
                     isConnect: true
                   }).then(() => {
                     // eslint-disable-next-line max-len
                     logger.debug(`Migrated direct project: ${directProject.data[0].directProjectId} to connect: ${directProject.data[0].id}, database id: ${directProject.dbId}`);
                   })));
    });
    batch += 1;
  }
}

migrate().then(() => {
  logger.info('Migration completed');
}).catch((err) => {
  logger.logFullError(err, 'migration');
});
