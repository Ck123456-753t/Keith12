"use strict";

const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const PushSubscription = require("../models/PushSubscription");

const router = express.Router();

function validBase64Url(value, minLength, maxLength) {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function validEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

router.get("/public-key", (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(503).json({
      success: false,
      enabled: false,
      message: "Push notifications are not configured yet."
    });
  }

  return res.json({
    success: true,
    enabled: true,
    publicKey
  });
});

router.post("/subscriptions", requireAuth, async (req, res) => {
  const subscription = req.body || {};
  const keys = subscription.keys || {};

  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({
      success: false,
      message: "Push notifications are not configured yet."
    });
  }

  if (
    !validEndpoint(subscription.endpoint) ||
    !validBase64Url(keys.p256dh, 40, 200) ||
    !validBase64Url(keys.auth, 16, 100)
  ) {
    return res.status(400).json({
      success: false,
      message: "The browser push subscription is invalid."
    });
  }

  const expirationTime =
    subscription.expirationTime === null ||
    subscription.expirationTime === undefined
      ? null
      : Number(subscription.expirationTime);

  if (
    expirationTime !== null &&
    (!Number.isFinite(expirationTime) || expirationTime < 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "The subscription expiration time is invalid."
    });
  }

  try {
    const userAgent = String(req.get("user-agent") || "").slice(0, 500);

    // A browser endpoint belongs to only one account at a time.
    // Signing out does not remove it; signing into another account
    // safely transfers ownership to the newly authenticated account.
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId: req.user._id,
          endpoint: subscription.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth
          },
          expirationTime,
          userAgent,
          lastSeenAt: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    return res.json({
      success: true,
      message: "This browser is registered for account notifications."
    });
  } catch (error) {
    if (error.code === 11000) {
      try {
        await PushSubscription.updateOne(
          { endpoint: subscription.endpoint },
          {
            $set: {
              userId: req.user._id,
              keys: {
                p256dh: keys.p256dh,
                auth: keys.auth
              },
              expirationTime,
              lastSeenAt: new Date()
            }
          }
        );

        return res.json({
          success: true,
          message: "This browser is registered for account notifications."
        });
      } catch (retryError) {
        console.error("Push subscription update failed:", retryError.message);
      }
    } else {
      console.error("Push subscription registration failed:", error.message);
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register this browser for notifications."
    });
  }
});

router.delete("/subscriptions", requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint;

  if (!validEndpoint(endpoint)) {
    return res.status(400).json({
      success: false,
      message: "A valid browser subscription endpoint is required."
    });
  }

  try {
    const result = await PushSubscription.deleteOne({
      userId: req.user._id,
      endpoint
    });

    return res.json({
      success: true,
      removed: result.deletedCount === 1
    });
  } catch (error) {
    console.error("Push subscription removal failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to remove this browser subscription."
    });
  }
});

module.exports = router;
