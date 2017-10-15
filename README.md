## Requirements

- Nodejs 8 is required
- [Apache Kafka](https://kafka.apache.org/)

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
| PORT                           | the port the application will listen on    |  3000                            |
| LOG_LEVEL                      | the log level                              |  debug                           |
| TOPIC                          | the kafka subscribe topic name             |  events_topic                    |
| ZOO_KEEPER                     | the ip:port to connect to ZOO_KEEPER       |  localhost:2181                  |


To change the WATCH_REPOS, you'd better create a `config/local.js` file to override the WATCH_REPOS, see `config/sample-local.js` for example.

`config/local.js` will not tracked by git.

Normally you just need config the ZOO_KEEPER:

```shell
export ZOO_KEEPER=...
```

Or on windows:

```shell
set ZOO_KEEPER=...
```



## Local Setup

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



