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

KAFKA_OPTIONS should be object as described in https://github.com/SOHU-Co/kafka-node#kafkaclient
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
