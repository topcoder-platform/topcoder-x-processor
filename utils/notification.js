/**
 * This module contains the helper methods
 * for sending notification action to kafka service.
 *
 * @author TCSCODER
 * @version 1.0
 */
'use strict';

const config = require('config');

const kafkaSender = require('./kafka-sender');
const topcoderApiHelper = require('./topcoder-api-helper');
const logger = require('./logger');

const notification = {};

const content = `Hi {handle},
You made an update to ticket {link}, but Topcoder-X couldn't process it properly because your {provider} token has expired. To fix this, please login to x.topcoder.com, click your handle in the upper right and then "Settings" to refresh your token. You will need to redo the action that failed in {provider}.`; // eslint-disable-line max-len

notification.sendTokenExpiredAlert = async function sendTokenExpiredAlert(copilotHandle, repoPath, provider) {
  const copilotId = await topcoderApiHelper.getTopcoderMemberId(copilotHandle);
  const notificationConfigs = config.MAIL_NOTICIATION;
  logger.debug(`Sending mail notification to copilot ${copilotHandle} Repo: ${repoPath} Provider: ${provider}`);
  await kafkaSender.sendNotification({
    serviceId: 'email',
    type: notificationConfigs.type,
    details: {
      from: 'noreply@topcoder.com',
      recipients: [
        {
          userId: copilotId
        }
      ],
      cc: [],
      data: {
        subject: notificationConfigs.subject,
        body: content
          .replace(/{handle}/g, copilotHandle)
          .replace(/{link}/g, repoPath)
          .replace(/{provider}/g, provider)
      },
      sendgridTemplateId: notificationConfigs.sendgridTemplateId,
      version: 'v3'
    }
  });
};

module.exports = notification;
