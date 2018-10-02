# Topcoder X Processor Configuration

The following config parameters are supported, they are defined in `config/default.js` and can be configured as env variables:

| Name                           | Description                                | Default                          |
| :----------------------------- | :----------------------------------------: | :------------------------------: |
| LOG_LEVEL                      | the log level                              |  debug                           |
| PARTITION                  | The Kafka partition            |  0|
| MONGODB_URI                            | The MongoDB URI.  This needs to be the same MongoDB used by topcoder-x-receiver, topcoder-x-processor, and topcoder-x-site                           | mongodb://127.0.0.1:27017/topcoderx |
|TOPIC  | The Kafka topic where events are published.  This must be the same as the configured value for topcoder-x-processor| |
|KAFKA_OPTIONS | Kafka connection options| |
|KAFKA_HOST | The Kafka host to connect to| localhost:9092 |
|KAFKA_CLIENT_CERT | The Kafka SSL certificate to use when connecting| Read from kafka_client.cer file, but this can be set as a string like it is on Heroku |
|KAFKA_CLIENT_CERT_KEY | The Kafka SSL certificate key to use when connecting| Read from kafka_client.key file, but this can be set as a string like it is on Heroku|
|TC_DEV_ENV| the flag whether to use topcoder development api or production| false|
| TC_AUTHN_URL | the Topcoder authentication url | https://topcoder-dev.auth0.com/oauth/ro |
| TC_AUTHN_REQUEST_BODY | the Topcoder authentication request body. This makes use of some environment variables: `TC_USERNAME`, `TC_PASSWORD`, `TC_CLIENT_ID`, `CLIENT_V2CONNECTION` | see `default.js` |
| TC_AUTHZ_URL | the Topcoder authorization url | https://api.topcoder-dev.com/v3/authorizations |
| NEW_CHALLENGE_TEMPLATE | the body template for new challenge request. You can change the subTrack, reviewTypes, technologies, .. here | see `default.js` |
| NEW_CHALLENGE_DURATION_IN_DAYS | the duration of new challenge | 5 |
| NODE_MAILER_OPTIONS| the node mailer smtp options, see [here](https://nodemailer.com/smtp/ for more detail)| see `default.js` |
|EMAIL_SENDER_ADDRESS| the email sender email address||
|ISSUE_BID_EMAIL_RECEIVER| the email receiver about bid email||
|TC_URL| the base URL of topcoder to get the challenge URL| defaults to `https://www.topcoder-dev.com`|
|GITLAB_API_BASE_URL| the URL for gitlab host| defaults to `https://gitlab.com`|
|PAID_ISSUE_LABEL|the label name for paid, should be one of the label configured in topcoder x ui|'tcx_Paid'|
|FIX_ACCEPTED_ISSUE_LABEL|the label name for fix accepted, should be one of the label configured in topcoder x ui|'tcx_FixAccepted'|
|ASSIGNED_ISSUE_LABEL| the label name for assigned, should be one of the label configured in topcoder x ui| 'tcx_Assigned'|
|OPEN_FOR_PICKUP_ISSUE_LABEL| the label name for open for pickup, should be one of the label configured in topcoder x ui| 'tcx_OpenForPickup'|
|TC_OR_DETAIL_LINK|the link to online review detail of challenge| see `default.js`, OR link for dev environment|
|RETRY_COUNT| the number of times an event should be retried to process| 3|
|RETRY_INTERVAL| the interval at which the event should be retried to process in milliseconds | 120000|
|READY_FOR_REVIEW_ISSUE_LABEL| the label name for ready for review, should be one of the label configured in topcoder x ui|'tcx_ReadyForReview'|
|NOT_READY_ISSUE_LABEL| the label name for not ready, should be one of the label configured in topcoder x ui|
'Not Ready'|
|CANCEL_CHALLENGE_INTERVAL| the time in millisecond after which the challenge will be closed| '24*60*60*1000'|

KAFKA_OPTIONS should be object as described in https://github.com/oleksiyk/kafka#ssl
For using with SSL, the options should be as
```
 {
    kafkaHost: '<server>',
    sslOptions: {
      cert: '<certificate>',
      key:  '<key>'
    }
 }
```

The following config paramaters are supported in the test environment defined in `config/test.js` and can be configured in the system environment. Note that the test config inherits all config options present in the default config and adds/overrides some config options.

| Name                           | Description                                | Default                          |
| :----------------------------- | :----------------------------------------: | :------------------------------: |                             |
| TC_URL                          | the topcoder development url             |  https://www.topcoder-dev.com                    |
| TC_DEV_API_URL                  | the topcoder development api url            |  https://api.topcoder-dev.com/v3|
| MAX_RETRY_COUNT                  | the maximum number of times to re-test before concluding that test failed            |  https://api.topcoder-dev.com/v3|
| WAIT_TIME                  | the amount of time in milliseconds to wait before running a re-test            |  30000                  |
| TC_DIRECT_ID                  | the topcoder direct id of the repository which is set up with a valid billing account            |  7377                  |
| TOPCODER_USER_NAME                  | a valid username for topcoder dev platform            |  mess                  |
| HOOK_BASE_URL                  | the webhook url of topcoder-x-receiver            |                    |
| GITHUB_ACCESS_TOKEN                  | github personal access token            |                    |
| GITHUB_REPOSITORY_NAME                  | the name of the repository to create for testing (should not already exist)            |                    |
| GITLAB_USERNAME                  | gitlab username            |                    |
| GITLAB_PASSWORD                  | gitlab password            |                    |
| GITLAB_REPOSITORY_NAME                  | the name of the repository to create for testing (should not already exist)            |                    |

## Github Verification

#### Webhook configuration

Configure a Github project with a webhook with a format like this: https://<receiver URL>:<receiver port>/webhooks/github

#### Smoke test
- Create an issue in the repo, you can see the logs in `receiver`, the `issue.created` event is generated.  You should then see the processor receive the event and process it accordingly.  It's important to validate that the issue.created event is seen by the receiver *and* the processor.  This ensures that the Kafka communication between the two services is working properly.

You can test other events, but just validating that an issue.created event is generated in Kafka is enough to smoke test the receiver is set up properly.  

## Github Verification

#### Webhook configuration

Configure a Gitlab project with a webhook with a format like this: https://<receiver URL>:<receiver port>/webhooks/gitlab

#### Smoke test

See above - the steps are the same for Github and Gitlab

## Debugging
You can re-run and debug the responses to webhook requests on Github and Gitlab, in the configuration for the webhook.  This can be useful if things aren't coming through properly in the receiver.

If you see the event come into the receiver but the processor doesn't see it, make sure that Kafka is configured the same between the processor and receiver and that there aren't any Kafka connection errors being raised in the processor.
