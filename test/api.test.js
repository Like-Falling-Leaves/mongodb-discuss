//
// test the DL API.
//
var assert = require('assert');
var api = require('../api.js');

describe('The API', function (done) {
  var dl = api({
    mongoUrl: 'mongodb://127.0.0.1/apiTest4',
    topicsCollectionName: 'testTopics',
    altTopicIDsCollectionName: 'testAlternateTopicIds',
    commentsCollectionName: 'testComments',
    subscribersCollectionName: 'testSubscribers'
  });

  var tests = {};
  function deepTest(test, cb) { 
    if (!tests[test]) tests[test] = cb;
    else tests[test](cb);
  }

  it ('should create a topic directly', function (done) {
    var altTopicId = 'topic' + (new Date().getTime()), creator = 'someone@example.com';
    var createdTopic = null;
    dl.once('newTopic', function (topic) { createdTopic = topic; });
    dl.createTopic(creator, {altTopicId: altTopicId, subject: 'Yo Yo!', body: 'Yo yo Ma!'}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      assert.equal(createdTopicId, createdTopic._id);
      assert.equal(createdTopic.altTopicId, altTopicId);

      dl.findTopicIdFromAltId(creator, {altTopicId: altTopicId}, function (err, res) {
        assert.ok(!err);
        assert.equal(res.topicId, createdTopicId);
        done();

        deepTest('should automatically add creator as subscriber', function (done) {
          dl.getSubscriptionState(creator, {topicId: createdTopicId}, function (err, res) {
            assert.ok(!err);
            assert.ok(res.isSubscribed);
            done();
          });
        });

        deepTest(': creating topics by alt id should only take the first one', function (done) {
          dl.createTopic(
            creator, {altTopicId: altTopicId, subject: 'Yo Yo 2!', body: 'Yo yo Ma 2!'}, function (err, res2) {
              assert.ok(!err);
              assert.ok(res2);

              dl.findTopicIdFromAltId(creator, {altTopicId: altTopicId}, function (err, res) {
                assert.ok(!err);
                assert.equal(res.topicId, createdTopicId);
                done();
              });
            });
        });

        deepTest('should add new posters automatically as subscribers', function (done) {
          var mailInfo = null;
          dl.once('mail', function (info) { mailInfo = info; });
          dl.postMessage('poster1@example.com', {
            topicId: createdTopicId,
            body: 'Whats that you say?'
          }, function (err, resp) {
            assert.ok(!err);
            assert.ok(mailInfo);
            assert.equal(mailInfo.from, 'poster1@example.com');
            assert.equal(mailInfo.to.toString(), creator);
            assert.equal(mailInfo.message.body, 'Whats that you say?');
            assert.equal(mailInfo.message.authorId, 'poster1@example.com');

            dl.getSubscriptionState('poster1@example.com', {topicId: createdTopicId}, function (err, res) {
              assert.ok(!err);
              assert.ok(res.isSubscribed);
              done();
            });
          });
        });
      });
    });
  });

  it ('should automatically add creator as subscriber', function (done) {
    deepTest('should automatically add creator as subscriber', done);
  });

  it('should add new posters automatically as subscribers', function (done) {
    deepTest('should add new posters automatically as subscribers', done);
  });

  it(': creating topics by alt id should only take the first one', function (done) {
    deepTest(': creating topics by alt id should only take the first one', done);
  });

  it ('should allow unsubscribing', function (done) {
    var creator = 'someone2@example.com';
    var createdTopic = null;
    dl.once('newTopic', function (topic) { createdTopic = topic; });
    dl.createTopic(creator, {subject: 'Yo Yo asdaszo!', body: 'Yo yo Ma!'}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      assert.equal(createdTopicId, createdTopic._id);
      dl.setSubscriptionState(creator, {topicId: createdTopicId, isSubscribed: false}, function (err, res) {
        assert.ok(!err);
        assert.equal("{}", JSON.stringify(res));
        dl.getSubscriptionState(creator, {topicId: createdTopicId}, function (err, ret) {
          assert.ok(!err);
          assert.ok(!ret.isSubscribed);
          done();
        });
      });
    });
  });

  it ('should fetch recent topics', function (done) {
    dl.getRecentTopics('someone@example2.com', {type: 'all', skip: 0, limit: 3}, function (err, results) {
      assert.ok(!err);
      assert.ok(results);
      results = results.topics;
      assert.ok(results);
      assert.equal(results.length, 3);
      assert.ok(results[0].topicId);
      assert.ok(results[0].subject);
      assert.ok(results[0].body);
      done();
    });
  });

  it ('should fetch my topics', function (done) {
    dl.getRecentTopics('someone2@example.com', {type: 'my', skip: 0, limit: 3}, function (err, results) {
      assert.ok(!err);
      assert.ok(results);
      results = results.topics;
      assert.ok(results);
      assert.equal(results.length, 3);
      results.forEach(function (rr) {
        assert.equal(rr.authorId, 'someone2@example.com');
      });
      done();
    });
  });

  it ('should fetch my subscribed topics', function (done) {
    dl.createTopic('author@example.com', {subject: 'Yo Yo!', body: 'Yo yo Ma!'}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      var subscriber = 'subsub' + (new Date()).getTime() + '@example.com';
      dl.setSubscriptionState(subscriber, {topicId: createdTopicId, isSubscribed: true}, function (err, res) {
        assert.ok(!err);

        dl.getRecentTopics(subscriber, {type: 'subscribed', skip: 0, limit: 5}, function (err, results) {
          assert.ok(!err);
          assert.ok(results);
          results = results.topics;
          assert.ok(results);
          assert.ok(results[0].authorId, 'author@example.com');
          assert.ok(results[0].topicId, createdTopicId);
          done();
        });
      });
    });
  });


  it ('should add subscribers when creating topics', function (done) {
    var subscriber = 'subsub' + (new Date()).getTime() + '@example.com';
    dl.createTopic('author@example.com', {subject: 'Yo Yo!', body: 'Yo yo Ma!', subscriberIds: [subscriber]}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      dl.getSubscriptionState(subscriber, {topicId: createdTopicId}, function (err, res) {
        assert.ok(!err);
        assert.ok(res.isSubscribed);
        done();
      });
    });
  });

  it ('should add subscribers when posting messages', function (done) {
    var subscriber = 'subsub' + (new Date()).getTime() + '@example.com';
    dl.createTopic('author@example.com', {subject: 'Yo Yo!', body: 'Yo yo Ma!', subscriberIds: []}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      dl.getSubscriptionState(subscriber, {topicId: createdTopicId}, function (err, res) {
        assert.ok(!err);
        assert.ok(!res.isSubscribed);
        dl.postMessage('someone@example.com', {topicId: createdTopicId, body: 'Whats up?', subscriberIds: [subscriber]}, function (err, resp) {
          assert.ok(!err);
          dl.getSubscriptionState(subscriber, {topicId: createdTopicId}, function (err, res) {
            assert.ok(!err);
            assert.ok(res.isSubscribed);
            done();
          });
        });
      });
    });
  });

  it ('should fetch all info in one shot', function (done) {
    var subscriber = 'subsub' + (new Date()).getTime() + '@example.com';
    dl.createTopic('author@example.com', {subject: 'Yo Yo!', body: 'Yo yo Ma!', subscriberIds: []}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      dl.getSubscriptionState(subscriber, {topicId: createdTopicId}, function (err, res) {
        assert.ok(!err);
        assert.ok(!res.isSubscribed);
        dl.postMessage('someone@example.com', {topicId: createdTopicId, body: 'Whats up?', subscriberIds: [subscriber]}, function (err, resp) {
          assert.ok(!err);
          dl.getSubscriptionState(subscriber, {topicId: createdTopicId}, function (err, res) {
            assert.ok(!err);
            assert.ok(res.isSubscribed);

            dl.getAllTopicDetails('soomeone', {topicId: createdTopicId}, function (err, allInfo) {
              assert.ok(!err);
              assert.equal(allInfo.topicId, createdTopicId);
              assert.equal(allInfo.subject, 'Yo Yo!');
              assert.equal(allInfo.body, 'Yo yo Ma!');
              assert.equal(allInfo.authorId, 'author@example.com');
              assert.equal(allInfo.subscriberIds.length, 3);
              assert.ok(allInfo.subscriberIds.indexOf('author@example.com') != -1);
              assert.ok(allInfo.subscriberIds.indexOf('someone@example.com') != -1);
              assert.ok(allInfo.subscriberIds.indexOf(subscriber) != -1);
              assert.ok(allInfo.messages.length, 1);
              assert.ok(allInfo.messages[0].authorId, 'someone@example.com');
              done();
            });
          });
        });
      });
    });
  });

  it ('should create topics with specified id prefix ', function (done) {
    dl.createTopic('author@example.com', {subject: 'Yo Yo!', body: 'Yo yo Ma!', topicPrefix: 'hello'}, function (err, res) {
      assert.ok(!err);
      var createdTopicId = res.topicId;
      assert.ok(createdTopicId);
      assert.ok(createdTopicId.indexOf('hello') === 0);
      done();
    });
  });
});
