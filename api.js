var EventEmitter = require('events').EventEmitter;
var models = require('mongodb-models');
var _ = require('lazy.js');
module.exports = api;

function api(options) {
  var modeler = models(options);
  var Topic = modeler.createClass('Topic', options.topicsCollectionName || 'topics');
  var AltTopicID = modeler.createClass('AltTopicID', options.altTopicIDsCollectionName || 'alternateTopicIds');
  var Comment = modeler.createClass('Comment', options.commentsCollectionName || 'comments');
  var Subscriber = modeler.createClass('Subscriber', options.subscribersCollectionName || 'subscribers');

  AltTopicID.addReference('topic', 'topicId', Topic);
  Topic.addLink('comments', '_id', {query: {topicId: Topic, commentId: Comment}}, 'topicComments')
    .addLink('subscribers', '_id', {query: {topicId: Topic, subscriberId: Subscriber}}, 'topicSubscribers')
    .addLink('likes', '_id', {query: {postId: Topic, subscriberId: Subscriber, type: 'topic'}}, 'postLikes')
    .addReference('author', 'authorId', Subscriber);

  Comment.addLink('topics', '_id', {query: {topicId: Topic, commentId: Comment}}, 'topicComments')
    .addLink('likes', '_id', {query: {postId: Comment, subscriberId: Subscriber, type: 'comment'}}, 'postLikes')
    .addReference('author', 'authorId', Subscriber);

  Subscriber.addLink('likedTopics', '_id', {query: {postId: Topic, subscriberId: Subscriber, type: 'topic'}}, 'postLikes')
    .addLink('likedComments', '_id', {query: {postId: Comment, subscriberId: Subscriber, type: 'comment'}}, 'postLikes')
    .addLink('subscribedTopics', '_id', {query: {topicId: Topic, subscriberId: Subscriber}}, 'topicSubscribers');

  var ret = new EventEmitter();
  ret.createTopic = createTopic;
  ret.findTopicIdFromAltId = findTopicIdFromAltId;
  ret.setSubscriptionState = setSubscriptionState;
  ret.getSubscriptionState = getSubscriptionState;
  ret.postMessage = postMessage;
  ret.getRecentTopics = getRecentTopics;
  ret.getAllTopicDetails = getAllTopicDetails;
  return ret;

  function createTopic(userId, params, done) {
    if (!userId) return done('Access denied');
    if (!params.subject) return done ('Missing parameter: subject');
    if (!params.body) return done('Missing parameter: body');

    var subscriberIds = sanitizeSubscriberIds(params.subscriberIds);
    var topicId = params.topicId && params.topicId.toString();
    var topicPrefix = params.topicPrefix && params.topicPrefix.toString();
    params = {
      authorId: userId.toString(),
      subject: params.subject.toString(),
      body: params.body.toString(),
      altTopicId: params.altTopicId && params.altTopicId.toString()
    };
    if (topicId) params._id = topicId;
    else if (topicPrefix) params._id = {prefix: topicPrefix};

    return addAlternateID.wrapped(Topic.create.one(params)).done(done);
    function addAlternateID(topic, done) {
      return emitCreatedNotification.wrapped(
        topic,
        topic.addSubscriberIds([params.authorId].concat(subscriberIds)),
        params.altTopicId && AltTopicID.find.orCreate(params.altTopicId, {topicId: topic._id})
      ).sync(true).done(done);
    }
    function emitCreatedNotification(topic, _subscriberIgnored, altCreated) {
      ret.emit('newTopic', topic);
      return {topicId: topic._id};
    }
  }

  function findTopicIdFromAltId(userId, params, done) {
    if (!params.altTopicId) return done('Missing parameter: altTopicId');
    var altTopicId = params.altTopicId.toString();
    return formatResponse.wrapped(AltTopicID.find.byId(altTopicId).get('topicId')).sync(true).done(done)();
    function formatResponse(topicId) { return {topicId: topicId}; }
  }

  function getSubscriptionState(userId, params, done) {
    if (!userId) return done('Access denied');
    if (!params.topicId) return done('Missing parameter: topicId');

    userId = userId.toString();
    return formatResponse.wrapped(Topic.find.byId(params.topicId.toString()).method('findSubscriberId', userId))
      .sync(true).done(done);

    function formatResponse(subId) { return {isSubscribed: (subId == userId)}; }
  }

  function setSubscriptionState(userId, params, done) {
    if (!userId) return done('Access denied');
    if (!params.topicId) return done('Missing parameter: topicId');

    userId = userId.toString();
    return setState.wrapped(Topic.find.byId(params.topicId.toString())).done(done);
    function setState(topic, done) {
      var op = params.isSubscribed ? topic.addSubscriberId(userId) : topic.removeSubscriberId(userId);
      return op.successValue({}).done(done);
    }
  }

  function postMessage(userId, params, done) {
    if (!userId) return done('Access denied');
    if (!params.topicId) return done('Missing parameter: topicId');
    if (!params.body) return done('Missing parameter: body');

    userId = userId.toString();
    var newSubscriberIds = [userId].concat(sanitizeSubscriberIds(params.subscriberIds));
    var topic = Topic.find.byId(params.topicId.toString());
    var message = Comment.create.one({body: params.body.toString(), authorId: userId});
    var linked = topic.method("addComment", message);
    return postProcess.wrapped(topic, message, linked).done(done);

    function postProcess(topic, message, linked, done) {
      return deliverMessagesAndAddSubscription.wrapped(topic, message, topic.subscriberIds())
        .done(done)();
    }

    function deliverMessagesAndAddSubscription(topic, message, subscriberIds, done) {
      var needToAddIds = [];
      newSubscriberIds.forEach(function (id) {
        if (id && subscriberIds.indexOf(id) == -1 && needToAddIds.indexOf(id) == -1) needToAddIds.push(id);
      });
      if (needToAddIds.length) return topic.addSubscriberIds(needToAddIds).done(deliver)();
      return deliver(null);
      function deliver(err) {
        deliverMessage(topic, message, userId, subscriberIds, needToAddIds);
        return done(err);
      }
    }
  }

  function getRecentTopics(userId, params, done) {
    if (!userId) return done('Access denied');
    userId = userId.toString();

    var query;
    if (params.type == 'all') query = {deleted: {$ne: 1}};
    else if (params.type == 'my') query = {deleted: {$ne: 1}, authorId: userId};
    else if (params.type == 'subscribed') return formatTopics.wrapped(getSubscribedTopics(userId)).sync(true).done(done);
    else return done('Invalid or missing parameter: type');

    var skip = parseInt(params.skip || 0), limit = parseInt(params.limit || 100);
    if (isNaN(skip)) skip = 0;
    if (isNaN(limit)) limit = 100;

    Topic.find.bySearch(query, {_id: -1}, skip, limit, function (err, ret) {
      if (err) return done(err);
      return done(null, formatTopics(ret));
    });
  }

  function getAllTopicDetails(userId, params, done) {
    if (!userId) return done('Access denied');
    if (!params.topicId) return done('Missing parameter: topicId');
    userId = userId.toString();
    
    var topic = Topic.find.byId(params.topicId.toString());
    var messages = topic.method('comments');
    var subscriberIds = topic.method('subscriberIds');
    return formatResponse.wrapped(topic, messages, subscriberIds).sync(true).done(done);

    function formatResponse(topic, messages, subscriberIds) {
      var ret = {messages: [], subscriberIds: subscriberIds || []};
      ret.topicId = topic._id;
      ret.authorId = topic.authorId;
      ret.body = topic.body;
      ret.subject = topic.subject;
      ret.altTopicId = topic.altTopicId;
      ret.createdTime = topic.createdTime;
      ret.updatedTime = topic.updatedTime;
      messages = messages || [];
      messages.forEach(function (mm) { ret.messages.push({
        messageId: mm._id,
        body: mm.body, 
        authorId: mm.authorId, 
        createdTime: mm.createdTime, 
        updatedTime: mm.updatedTime
      }); });
      return ret;
    }
  }
  
  function formatTopics(topics) {
    var result = {topics: []};
    (topics || []).forEach(function (rr) { 
      result.topics.push({topicId: rr._id, subject: rr.subject, body: rr.body, authorId: rr.authorId});
    });
    return result;
  }

  function sanitizeSubscriberIds(ids) {
    var ret = [];
    if (!ids) return ret;
    if (ids instanceof Array) ids.forEach(function (id) { if (id) ret.push(id.toString()); });
    return ret;
  }

  function getSubscribedTopics(userId, done) {
    return Topic.fromSubscriberIds([userId.toString()]).done(done || function () {});
  }

  // expected callbacks
  function deliverMessage(topic, message, from, to, addedTo) {
    to = _(to).without(from).value();
    addTo = _(addedTo).without(from).value();
    return ret.emit('mail', {topic: topic, from: from, to: to, addedTo: addedTo, message: message});
  }
}
