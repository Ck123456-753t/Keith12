"use strict";

const DefaultPushOutbox = require("../models/PushOutbox");
const DefaultNotification = require("../models/Notification");
const DefaultPushSubscription = require("../models/PushSubscription");

const {
  sendPushNotification: defaultSendPushNotification,
  isConfigured: defaultIsConfigured
} = require("./pushDeliveryService");

const INTERVAL_MS = 15 * 1000;
const BATCH_SIZE = 25;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

function createPushOutboxWorker({
  PushOutbox = DefaultPushOutbox,
  Notification = DefaultNotification,
  PushSubscription = DefaultPushSubscription,
  sendPushNotification = defaultSendPushNotification,
  isConfigured = defaultIsConfigured,
  logger = console,
  clock = Date.now
} = {}) {
  let timer = null;
  let running = false;

  function retryDelay(attempts) {
    const exponent = Math.min(Math.max(attempts - 1, 0), 10);
    return Math.min(30 * 1000 * (2 ** exponent), MAX_BACKOFF_MS);
  }

  async function claimNextOutboxItem() {
    const now = new Date(clock());
    const staleLock = new Date(clock() - LOCK_TIMEOUT_MS);

    return PushOutbox.findOneAndUpdate(
      {
        $or: [
          {
            status: "pending",
            nextAttemptAt: { $lte: now }
          },
          {
            status: "processing",
            lockedAt: { $lte: staleLock }
          }
        ]
      },
      {
        $set: {
          status: "processing",
          lockedAt: now
        },
        $inc: {
          attempts: 1
        }
      },
      {
        sort: {
          nextAttemptAt: 1,
          createdAt: 1
        },
        new: true
      }
    );
  }

  async function updateOutbox(item, update) {
    await PushOutbox.updateOne(
      { _id: item._id, status: "processing" },
      { $set: update }
    );
  }

  async function processOutboxItem(item, summary) {
    const notification = await Notification.findOne({
      _id: item.notificationId,
      recipientId: item.recipientId
    }).lean();

    if (!notification) {
      await updateOutbox(item, {
        status: "sent",
        lockedAt: null,
        deliveredAt: new Date(clock()),
        lastError: "Notification record no longer exists."
      });
      summary.skipped += 1;
      return;
    }

    const subscriptions = await PushSubscription.find({
      userId: item.recipientId
    }).lean();

    if (!subscriptions.length) {
      await updateOutbox(item, {
        status: "no_subscriptions",
        lockedAt: null,
        lastError: null
      });
      summary.noSubscriptions += 1;
      return;
    }

    const payload = {
      notificationId: String(notification._id),
      type: notification.type,
      title: notification.title || "PrimeTask Workspace",
      body: notification.body || "You have a new account notification.",
      url: notification.url || "/dashboard/"
    };

    let delivered = 0;
    let expired = 0;
    let temporaryFailures = 0;
    const errors = [];

    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, payload);
        delivered += 1;
      } catch (error) {
        const statusCode = Number(
          error.statusCode || error.status || 0
        );

        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({
            _id: subscription._id
          });
          expired += 1;
        } else {
          temporaryFailures += 1;
          errors.push(String(error.message || "Push delivery failed"));
        }
      }
    }

    summary.delivered += delivered;
    summary.expiredSubscriptions += expired;

    if (delivered > 0) {
      await updateOutbox(item, {
        status: "sent",
        lockedAt: null,
        deliveredAt: new Date(clock()),
        lastError: temporaryFailures
          ? errors.join("; ").slice(0, 500)
          : null
      });

      summary.sent += 1;
      return;
    }

    if (temporaryFailures > 0) {
      const delay = retryDelay(item.attempts || 1);

      await updateOutbox(item, {
        status: "pending",
        lockedAt: null,
        nextAttemptAt: new Date(clock() + delay),
        lastError: errors.join("; ").slice(0, 500)
      });

      summary.retried += 1;
      return;
    }

    await updateOutbox(item, {
      status: "no_subscriptions",
      lockedAt: null,
      lastError: null
    });

    summary.noSubscriptions += 1;
  }

  async function processPushOutbox() {
    if (running) {
      return {
        skipped: true,
        examined: 0,
        sent: 0,
        retried: 0,
        noSubscriptions: 0,
        expiredSubscriptions: 0,
        delivered: 0,
        errors: 0
      };
    }

    if (!isConfigured()) {
      return {
        disabled: true,
        reason: "VAPID configuration is incomplete."
      };
    }

    running = true;

    const summary = {
      examined: 0,
      sent: 0,
      retried: 0,
      noSubscriptions: 0,
      expiredSubscriptions: 0,
      delivered: 0,
      skipped: 0,
      errors: 0
    };

    try {
      for (let index = 0; index < BATCH_SIZE; index += 1) {
        const item = await claimNextOutboxItem();

        if (!item) break;

        summary.examined += 1;

        try {
          await processOutboxItem(item, summary);
        } catch (error) {
          summary.errors += 1;

          const delay = retryDelay(item.attempts || 1);

          try {
            await updateOutbox(item, {
              status: "pending",
              lockedAt: null,
              nextAttemptAt: new Date(clock() + delay),
              lastError: String(
                error.message || "Unexpected push worker error"
              ).slice(0, 500)
            });
          } catch (persistenceError) {
            logger.error(
              "Could not persist push retry:",
              persistenceError.message
            );
          }

          logger.warn(
            "Push notification processing failed:",
            error.message
          );
        }
      }
    } catch (error) {
      summary.errors += 1;
      logger.error("Push outbox worker failed:", error.message);
    } finally {
      running = false;
    }

    return summary;
  }

  function startPushOutboxWorker() {
    if (timer) return;

    logger.info("Push notification outbox worker started.");

    void processPushOutbox();

    timer = setInterval(() => {
      void processPushOutbox();
    }, INTERVAL_MS);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  function stopPushOutboxWorker() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    processPushOutbox,
    startPushOutboxWorker,
    stopPushOutboxWorker
  };
}

const productionWorker = createPushOutboxWorker();

module.exports = {
  ...productionWorker,
  createPushOutboxWorker
};
