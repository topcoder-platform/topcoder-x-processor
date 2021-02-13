# Topcoder X Processor Configuration

The following config parameters are supported, they are defined in `config/default.js` and can be configured as env variables:

| Name                           | Description                                | Default                          |
| :----------------------------- | :----------------------------------------: | :------------------------------: |
| LOG_LEVEL                      | the log level                              |  debug                           |
| PARTITION                  | The Kafka partition            |  0|
|TOPIC  | The Kafka topic where events are published.  This must be the same as the configured value for topcoder-x-processor| |
|KAFKA_OPTIONS | Kafka connection options| |
|KAFKA_URL | The Kafka host to connect to| localhost:9092 |
|KAFKA_GROUP_ID | The Kafka group id name| topcoder-x-processor |
|KAFKA_CLIENT_CERT | The Kafka SSL certificate to use when connecting| Read from kafka_client.cer file, but this can be set as a string like it is on Heroku |
|KAFKA_CLIENT_CERT_KEY | The Kafka SSL certificate key to use when connecting| Read from kafka_client.key file, but this can be set as a string like it is on Heroku|
| NEW_CHALLENGE_TEMPLATE | the body template for new challenge request. You can change the subTrack, reviewTypes, technologies, .. here | see `default.js` |
| NEW_CHALLENGE_DURATION_IN_DAYS | the duration of new challenge | 5 |
|TC_URL| the base URL of topcoder to get the challenge URL| defaults to `https://www.topcoder-dev.com`|
|GITLAB_API_BASE_URL| the URL for gitlab host| defaults to `https://gitlab.com`|
|PAID_ISSUE_LABEL|the label name for paid, should be one of the label configured in topcoder x ui|'tcx_Paid'|
|FIX_ACCEPTED_ISSUE_LABEL|the label name for fix accepted, should be one of the label configured in topcoder x ui|'tcx_FixAccepted'|
|ASSIGNED_ISSUE_LABEL| the label name for assigned, should be one of the label configured in topcoder x ui| 'tcx_Assigned'|
|OPEN_FOR_PICKUP_ISSUE_LABEL| the label name for open for pickup, should be one of the label configured in topcoder x ui| 'tcx_OpenForPickup'|
|RETRY_COUNT| the number of times an event should be retried to process| 3|
|RETRY_INTERVAL| the interval at which the event should be retried to process in milliseconds | 120000|
|READY_FOR_REVIEW_ISSUE_LABEL| the label name for ready for review, should be one of the label configured in topcoder x ui|'tcx_ReadyForReview'|
|NOT_READY_ISSUE_LABEL| the label name for not ready, should be one of the label configured in topcoder x ui|'tcx_NotReady'|
|CANCELED_ISSUE_LABEL| the label name for canceled, should be one of the label configured in topcoder x ui|'tcx_Canceled'|
|AWS_ACCESS_KEY_ID | The Amazon certificate key to use when connecting. Use local dynamodb you can set fake value|FAKE_ACCESS_KEY_ID |
|AWS_SECRET_ACCESS_KEY | The Amazon certificate access key to use when connecting. Use local dynamodb you can set fake value|FAKE_SECRET_ACCESS_KEY |
|AWS_REGION | The Amazon certificate region to use when connecting. Use local dynamodb you can set fake value|FAKE_REGION |
|IS_LOCAL | Use Amazon DynamoDB Local or server. |'false' |
|AUTH0_URL| The Auth0 URL for generating Machine-to-machine token |https://topcoder-dev.auth0.com/oauth/token|
|AUTH0_AUDIENCE| The audience of Auth0 to generate M2M Token |https://m2m.topcoder-dev.com/|
|TOKEN_CACHE_TIME| The machine-to-machine token cache validation time |43200|
|AUTH0_CLIENT_ID| The Auth0 ClientID for generating Machine-to-machine token ||
|AUTH0_CLIENT_SECRET| The Auth0 Client Secret for generating Machine-to-machine token ||
|ROLE_ID_COPILOT| The registered role id of copilot ||
|ROLE_ID_SUBMITTER| The registered role id of submitter ||
|TYPE_ID_TASK| The registered type id of a task ||
|DEFAULT_TIMELINE_TEMPLATE_ID| The default timeline template id ||
|TC_API_URL| The topcoder backend API url |`https://api.topcoder-dev.com/v5`|
|DEFAULT_TRACK_ID| The default track id ||

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

| Name | Description | Default |
|:--|:--|:--|
| TC_URL | the topcoder development url |https://www.topcoder-dev.com |
| TC_DEV_API_URL | the topcoder development api url |https://api.topcoder-dev.com/v3|
| MAX_RETRY_COUNT | the maximum number of times to re-test before concluding that test failed | 17 |
| WAIT_TIME | the amount of time in milliseconds to wait before running a re-test | 60000 |
| TC_DIRECT_ID | the topcoder direct id of the repository which is set up with a valid billing account | 7377 |
| TOPCODER_USER_NAME | a valid username for topcoder dev platform | mess |
| HOOK_BASE_URL | the webhook url of topcoder-x-receiver | |
| GITHUB_ACCESS_TOKEN | github personal access token | |
| GITHUB_REPOSITORY_NAME | the name of the repository to create for testing (should not already exist) | |
| GITLAB_USERNAME | gitlab username | |
| GITLAB_PASSWORD | gitlab password | |
| GITLAB_REPOSITORY_NAME | the name of the repository to create for testing (should already exist) | |
| GITLAB_REPO_URL | the URL of the repository to create for testing (should already exist) | |

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
