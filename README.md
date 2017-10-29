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
| ZOO_KEEPER                     | the ip:port to connect to ZOO_KEEPER       |  localhost:2181                  |
| MONGODB_URL  | the MongoDB URL | mongodb://127.0.0.1:27017/events |
| TC_AUTHN_URL | the Topcoder authentication url | https://topcoder-dev.auth0.com/oauth/ro |
| TC_AUTHN_REQUEST_BODY | the Topcoder authentication request body. This makes use of some environment variables: `TC_USERNAME`, `TC_PASSWORD`, `TC_CLIENT_ID`, `CLIENT_V2CONNECTION` | see `default.js` |
| TC_AUTHZ_URL | the Topcoder authorization url | https://api.topcoder-dev.com/v3/authorizations |
| NEW_CHALLENGE_TEMPLATE | the body template for new challenge request. You can change the subTrack, reviewTypes, technologies, .. here | see `default.js` |
| NEW_CHALLENGE_DURATION_IN_DAYS | the duration of new challenge | 5 |


## Local Setup

Create a MongoDB database, and configure `MONGODB_URL`.

```shell
npm start
```


## Verification

- properly config and run the `receiver` app.
- properly config and run the `processor` app.
- create an issue in the repo, you can see the logs in `receiver` and `processor`, the `issue.created` event is generated.
- update an issue in the repo, you can see the logs in `receiver` and `processor`, the `issue.updated` event is generated.
- create a comment on an issue, you can see the logs in `receiver` and `processor`, the `comment.created` event is generated.
- assigned a user to an issue, you can see the logs in `receiver` and `processor`, the `issue.assigned` event is generated.
- assigned a user to an issue, you can see the logs in `receiver` and `processor`, the `issue.unassigned` event is generated.
- add a label to an issue, you can see the logs in `receiver` and `processor`, the `issue.labeled` event is generated.
- remove a label to an issue, you can see the logs in `receiver` and `processor`, the `issue.unlabeled` event is generated.
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
- You will see a new project created in the logs. E.g.
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
