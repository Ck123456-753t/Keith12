"use strict";

const webPush = require("web-push");

function createPushDeliveryService({
  webPushClient = webPush,
  env = process.env
} = {}) {
  function isConfigured() {
    return Boolean(
      env.VAPID_PUBLIC_KEY &&
      env.VAPID_PRIVATE_KEY &&
      env.VAPID_SUBJECT
    );
  }

  async function sendPushNotification(subscription, payload) {
    if (!isConfigured()) {
      const error = new Error("Web Push VAPID configuration is incomplete.");
      error.code = "PUSH_NOT_CONFIGURED";
      throw error;
    }

    webPushClient.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    return webPushClient.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload),
      {
        TTL: 3600,
        urgency: "normal"
      }
    );
  }

  return {
    isConfigured,
    sendPushNotification
  };
}

const productionService = createPushDeliveryService();

module.exports = {
  ...productionService,
  createPushDeliveryService
};
