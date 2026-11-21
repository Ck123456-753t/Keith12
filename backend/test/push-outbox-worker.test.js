"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPushOutboxWorker
} = require("../src/services/pushOutboxWorker");

function createHarness({
  notification = {
    _id: "notification-1",
    recipientId: "user-1",
    type: "deposit_completed",
    title: "PrimeTask Workspace",
    body: "Your account has an update.",
    url: "/dashboard/"
  },
  subscriptions = [
    {
      _id: "subscription-1",
      endpoint: "https://push.example.test/endpoint",
      keys: { p256dh: "public-key", auth: "auth-key" }
    }
  ],
  sendError = null,
  configured = true
} = {}) {
  const item = {
    _id: "outbox-1",
    notificationId: "notification-1",
    recipientId: "user-1",
    attempts: 1
  };

  const updates = [];
  const deletions = [];
  const sent = [];
  let claimed = false;

  const PushOutbox = {
    async findOneAndUpdate() {
      if (claimed) return null;
      claimed = true;
      return item;
    },
    async updateOne(filter, update) {
      updates.push(update.$set);
    }
  };

  const Notification = {
    findOne() {
      return { lean: async () => notification };
    }
  };

  const PushSubscription = {
    find() {
      return {
        lean: async () => subscriptions
      };
    },
    async deleteOne(filter) {
      deletions.push(filter);
    }
  };

  const worker = createPushOutboxWorker({
    PushOutbox,
    Notification,
    PushSubscription,
    isConfigured: () => configured,
    sendPushNotification: async (subscription, payload) => {
      if (sendError) throw sendError;
      sent.push({ subscription, payload });
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    clock: () => 1_800_000_000_000
  });

  return { worker, updates, deletions, sent };
}

test("sends a notification and marks its outbox item sent", async () => {
  const h = createHarness();

  const result = await h.worker.processPushOutbox();

  assert.equal(result.sent, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].payload.notificationId, "notification-1");
  assert.equal(h.updates.at(-1).status, "sent");
  assert.ok(h.updates.at(-1).deliveredAt instanceof Date);
});

test("marks an item no_subscriptions when the user has no devices", async () => {
  const h = createHarness({ subscriptions: [] });

  const result = await h.worker.processPushOutbox();

  assert.equal(result.noSubscriptions, 1);
  assert.equal(h.sent.length, 0);
  assert.equal(h.updates.at(-1).status, "no_subscriptions");
});

test("retries temporary delivery failures", async () => {
  const h = createHarness({
    sendError: new Error("Temporary push service failure")
  });

  const result = await h.worker.processPushOutbox();

  assert.equal(result.retried, 1);
  assert.equal(h.updates.at(-1).status, "pending");
  assert.ok(h.updates.at(-1).nextAttemptAt instanceof Date);
  assert.match(h.updates.at(-1).lastError, /Temporary push service failure/);
});

test("deletes expired subscriptions returned by the push service", async () => {
  const error = new Error("Subscription expired");
  error.statusCode = 410;

  const h = createHarness({ sendError: error });

  const result = await h.worker.processPushOutbox();

  assert.equal(result.noSubscriptions, 1);
  assert.equal(h.deletions.length, 1);
  assert.equal(h.updates.at(-1).status, "no_subscriptions");
});

test("does not claim outbox items when VAPID is not configured", async () => {
  const h = createHarness({ configured: false });

  const result = await h.worker.processPushOutbox();

  assert.equal(result.disabled, true);
  assert.equal(result.examined, undefined);
  assert.equal(h.updates.length, 0);
  assert.equal(h.sent.length, 0);
});

test("processes an item and stops when the queue is empty", async () => {
  const h = createHarness();
  h.worker.stopPushOutboxWorker();

  const result = await h.worker.processPushOutbox();

  assert.equal(result.examined, 1);
  assert.equal(result.sent, 1);
});
