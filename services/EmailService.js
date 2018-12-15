/*
 * Copyright (c) 2017 TopCoder, Inc. All rights reserved.
 */
'use strict';

/**
 * This provides methods for email.
 * @author TCSCODER
 * @version 1.0
 */

const config = require('config');
const nodemailer = require('nodemailer');
const Joi = require('joi');
const logger = require('../utils/logger');

// create reusable transporter object using the default SMTP transport
const smtpTransport = nodemailer.createTransport(config.NODE_MAILER_OPTIONS);

/**
 * Sends the email with bid amount.
 * @param {Object} issue the issue
 * @param {Number} bidAmount the bid amount
 */
async function sendNewBidEmail(issue, bidAmount) {
  Joi.validate({issue, bidAmount}, sendNewBidEmail.schema);

  const body = `New bid has been placed on issue '${issue.issue.title}' with amount $${bidAmount} by ${issue.comment.user.name}`;
  const mailOptions = {
    from: config.EMAIL_SENDER_ADDRESS,
    to: config.ISSUE_BID_EMAIL_RECEIVER,
    text: body,
    subject: 'New bid on issue'
  };
  await new Promise((resolve, reject) => {
    smtpTransport.sendMail(mailOptions, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
  logger.debug(`bid email is sent to ${config.ISSUE_BID_EMAIL_RECEIVER}`);
}

sendNewBidEmail.schema = {
  issue: Joi.object().keys({
    issue: Joi.object().keys({
      title: Joi.string().required()
    }).required(),
    comment: Joi.object().keys({
      user: Joi.object().keys({
        id: Joi.number().required(),
        name: Joi.string()
      })
    })
  }).required(),
  bidAmount: Joi.number().required()
};

module.exports = {
  sendNewBidEmail
};

logger.buildService(module.exports);
