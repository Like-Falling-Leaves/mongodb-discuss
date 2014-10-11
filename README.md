# mongodb-discuss

This is a simple small module which implements the core features of a forum or discussion list.  This is intended to be the backend that drives a few different apps (discussions list, tasks management etc).

If you are looking for a full fledged bulletin-board functionality, I recommend looking at [NodeBB](https://nodebb.org/).  This module is meant to be simple enough to embed in other locations but also change to suit any specific needs and as such is not meant to be a complete product.

[![NPM info](https://nodei.co/npm/mongodb-discuss.png?downloads=true)](https://npmjs.org/package/mongodb-discuss)

[![Travis build status](https://api.travis-ci.org/Like-Falling-Leaves/mongodb-discuss.png?branch=master)](
https://travis-ci.org/Like-Falling-Leaves/mongodb-discuss)

## Install

    npm install mongodb-disucc

## Initialization

```javascript

   // Initialization via mongo URLs of the form: mongodb://user:password@host:port/database
   var discuss = require('mongodb-discuss')({mongoUrl: 'mongodb://user:password@host:port/database'});

```

## API

This document is a work in progress.  The unit tests cover bulk of the functionality and are probably easy enough to read at this point.

All APIs are of the following form:

```js

   discuss.method(userId, params, done);
````

* *userId* is expected to be the ID of the caller and should always be present. 
* *params* is expected to be an object giving the parameters.  This is sanitized for mongodb-injection type security issues.
* *done* is a regular Node-style callback to report errors as well as the JSON response.

As such, the APIs are modeled to be fairly simple to expose directly to a browser-based client for example -- with the caveat that no authorization or authentication is done by the module and that is left to the caller.

### createTopic

All interactions with topics start from creating a topic.

```javascript

   var params = {
     subject: "This is the subject of the topic",
     body: "This is the body of the topic",
     subscriberIds: ["A list of userIds who should be subscribed to this from day one"],
     altTopicId: "An alternate ID to record with this topic; cf. findTopicIdFromAltId"
   };

   discuss.createTopic(creatorUserId, params, function (err, result) {
     // if the call succeeds, result contains the fields topicId, subject, body and altTopicId
   });

   // if a new topic is created, in addition to a success return above,
   // an event is generated on the discuss object.  This will happen
   // before the callback above returns.  This can be used to send a message
   // to the creator that the topic was created
   discuss.once('newTopic', function (topic) { // the newly created topic data object is provided here }
```

### getSubscriptionState and setSubscriptionState

These methods allow a given user to figure out if (s)he is subscribed to a given topic.

```javascript

   discuss.getSubscriptionState(userId, {topicId: topicId}, function (err, result) {
     if (!result.isSubscribed) {
       discuss.setSubscriptionState(userId, {topicId: topicId, isSubscribed: true}, function (err) {
       });
     }
   });

```

### postMessage

This allows a user to post a message. Note that it possible to subscribe more people to the topic at this time and also note that a user who posts is automatically added to the list of subscribers.

```javascript

   discuss.postMessage(userId, {topicId: topicId, body: body, subscriberIds: newSubscriberIds}, function (err) {
     // did the post succeed?
  });

  // also, when a message is successfully posted, it might need to delivered
  // to all users currently subscribed.  The delivery mechanism depends on the
  // app.  So, there is an event which is fired every time a message is delivered.
  discuss.on('mail', function (info) {
     // info.topic is a topic object (_id, subject, body, authorId are 
     //   valid fields.
     // info.from is the userId of the sender
     // info.to is an array of userIds of those who were already subscribed
     // info.addedTo is an array of userIds which got added with the message
     // info.message is a message object (_id, authorId, topicId, body) are
     //   valid fields
  });
```

### getRecentTopics

This fetches all recent topics on the system or all topics created by the current user.

```javascript

   var params = {type: 'all'};
   discuss.getRecentTopics(userId, params, done);

   // if params.type = 'my' -- only topics created by the current user are returned.
   // if params.type = 'subscribed' -- only topics the current user is subscribed to
   //    are returned.
```

### getAllTopicDetails

This fetches all subscribers and messages for a topic.

```javascript
   
   discuss.getAllTopicDetails(userId, {topicId: topicId}, function (err, info) {
      // info has all regular topic fields (topicId, body, subject, authorId etc)
      // in addition:
      // info.subscriberIds = array of subscriber ids
      // info.messages = array of message where each message has
      //   * body, authorId, createdTime and updatedTime fields
   });
```

### Not yet implemented

* Emoji
* Attachments
* Likes
* Tags