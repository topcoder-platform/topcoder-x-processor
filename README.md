## Requirements

- Nodejs 8 is required
- [Apache Kafka](https://kafka.apache.org/)
- MongoDB 3.4

## Install dependencies

```shell
npm install
```

## Source code lint

eslint is used to lint the javascript source code:

```shell
npm run lint
```



## Configuration

The following config parameters are supported, they are defined in `config/default.js` and can be configured in system environment:


| Name                           | Description                                | Default                          |
| :----------------------------- | :----------------------------------------: | :------------------------------: |
| LOG_LEVEL                      | the log level                              |  debug                           |
| TOPIC                          | the kafka subscribe topic name             |  events_topic                    |
| KAFKA_OPTIONS                  | the connection option for kafka            |  see below about KAFKA options                  |
| MONGODB_URL  | the MongoDB URL | mongodb://127.0.0.1:27017/events |
| TC_AUTHN_URL | the Topcoder authentication url | https://topcoder-dev.auth0.com/oauth/ro |
| TC_AUTHN_REQUEST_BODY | the Topcoder authentication request body. This makes use of some environment variables: `TC_USERNAME`, `TC_PASSWORD`, `TC_CLIENT_ID`, `CLIENT_V2CONNECTION` | see `default.js` |
| TC_AUTHZ_URL | the Topcoder authorization url | https://api.topcoder-dev.com/v3/authorizations |
| NEW_CHALLENGE_TEMPLATE | the body template for new challenge request. You can change the subTrack, reviewTypes, technologies, .. here | see `default.js` |
| NEW_CHALLENGE_DURATION_IN_DAYS | the duration of new challenge | 5 |
| GITHUB_ADMIN_TOKEN| the github repo admin/owner personal access token | see below section 'GitHub OAuth Admin Token'|
| NODE_MAILER_OPTIONS| the node mailer smtp options, see [here](https://nodemailer.com/smtp/ for more detail)| see `default.js` |
|EMAIL_SENDER_ADDRESS| the email sender email address||
|ISSUE_BID_EMAIL_RECEIVER| the email receiver about bid email||
|TC_RAGNAR_USER_MAPPING_URL| the api URL of Ragnar self service tool to get user mapping | see `default.js`|
|TC_RAGNAR_ADMIN_LOGIN_BODY| the login request body of Admin user for Ragnar self service tool| see `default.js`|
|TC_RAGNAR_LOGIN_URL| the api URL of Ragnar self service tool to login| see `default.js`|
|TC_DEV_ENV| the flag whether to use topcoder development api or production| false|
|GITLAB_API_BASE_URL| the URL for gitlab host| defaults to `https://gitlab.com`|
|GITLAB_ADMIN_TOKEN|the gitlab repo admin/owner personal access token | see below section 'Gitlab Admin Token'|

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

## GitHub OAuth Admin Token

- login into github.com
- click the upper right avatar, then click `Settings`
- click the left pannel --> Developer settings --> Personal access tokens
- click the `Generate new token`, fill in the fields,
  select all scopes,
- after creating the token, you can see personal access token,
  these should be set to GITHUB_ADMIN_TOKEN environment variables

## Gitlab Admin Token

- Log in to your GitLab account.
- Go to your Profile settings.
- Go to Access tokens.
- Choose a name and optionally an expiry date for the token.
- Choose the `api` scope at minimum.
- Click on Create personal access token.
- after creating the token, you can see personal access token,
  these should be set to GITLAB_ADMIN_TOKEN environment variables.

## Local Setup

Create a MongoDB database, and configure `MONGODB_URL`.

```shell
npm start
```

Run and configure the Ragnar self-service tool

## Verification

- properly config and run the `receiver` app.
- properly config and run the `processor` app.
- properly config and run the Ragnar self service tool.
- create an issue in the repo, you can see the logs in `receiver` and `processor`, the `issue.created` event is generated.
- update an issue in the repo, you can see the logs in `receiver` and `processor`, the `issue.updated` event is generated.
- create a comment on an issue, you can see the logs in `receiver` and `processor`, the `comment.created` event is generated.
- update a comment on an issue, you can see the logs in `receiver` and `processor`, the `comment.updated` event is generated.
- assigned a user to an issue, you can see the logs in `receiver` and `processor`, the `issue.assigned` event is generated.
- unassigned a user to an issue, you can see the logs in `receiver` and `processor`, the `issue.unassigned` event is generated.
- add or remove a label to an issue, you can see the logs in `receiver` and `processor`, the `issue.labelUpdated` event is generated.
- create a pull request, you can see the logs in `receiver` and `processor`, the `pull_request.created` event is generated.
- close a pull request without merge, you can see the logs in `receiver` and `processor`, the `pull_request.closed` event is generated and the `merged` property is `false`.
- merge a pull request, you can see the logs in `receiver` and `processor`, the `pull_request.closed` event is generated and the `merged` property is `true`.

### Create a new challenge for a new issue
- Create a new issue in the repo. E.g.
  - With the title: [$20] A new issue title
  - With the body (Markdown supported):
    ```
    ## A new issue body header

    A new issue body content with ***bold*** text and a [link](https://github.com/ngoctay/Luettich-test/issues/).
    ```
- You will see a new project created in the logs if project for that repository is not created already. E.g.
  ```
  debug: new project created with id 11916 for issue 3
  ```
- Then a new challenge created in the logs. E.g.
  ```
  debug: new challenge created with id 30051089 for issue 3
  ```
- Wait a minute or 2 for Topcoder internal systems to process the new challenge. You may get an error page `HTTP Status 404` if the internal processings haven't completed yet.
- Visit challenge url to verify the challenge:
  ```
  https://www.topcoder-dev.com/challenge-details/30051089/?type=develop&noncache=true
  ```
  ***NOTE***: change 30051089 to the your challenge id created in the previous step

### Update the challenge when the issue was updated

- Update title of the issue above. E.g.
  - With the title: [$50] A new issue title - Updated the prize
- Wait a minute or 2
- Visit the challenge url to verify the updated prize and title

- Update the body of the issue. E.g.
  ```
  ## A new issue body header - Updated

  A new issue body content with ***bold*** text and a [link](https://github.com/ngoctay/Luettich-test/issues/). Updated
  ```
- Wait a minute or 2
- Visit the challenge url to verify the updated body

- Now try to update the title by adding a space after $50: [$50 ] A new issue title - Updated the prize
- The event will be ignored by processor:
  ```
  debug: nothing changed for issue 3
  ```

- Update the tilte by removing `[$50 ]`, you'll get an error:
  ```
  error:  Error: Cannot parse prize from title: A new issue title - Updated the prize
  ```

### Process Bidding Comments
- Add/update comment to bid or accept the bid
- To bid on the issue, comment as `/bid $50`. Minimum one space is need between /bid and $ sign. This will trigger `comment.created` or `comment.updated` event based on comment create/edit.
- if comment is bid then an email is sent to the user configured in `ISSUE_BID_EMAIL_RECEIVER` in config file
- To accept bid on the issue, comment as `/accept_bid @username $50`
- if comment is accepting bid then 
  - title of issue will be changed with accepted bid amount
  - issue will be assigned to user `username` if not already assigned

### Issue Assignment
When an user is assigned to an issue then 'issue.assigned' event will be captured and processed as
- processor will get the Topcoder handle for such user using Ragnar self service tool api
- if user is found then the topcoder challenge associated with that issue will be updated as
  - topcoder user will be assigned
- if user is not found in mapping
  - comment on github/gitlab issue will added as :
  ```
  @username, please sign-up with Ragnar Self-service tool.
  ```
  - user will be unassigned from issue
