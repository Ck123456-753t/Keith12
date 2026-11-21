"use strict";

const Notification = require("../models/Notification");
const PushOutbox = require("../models/PushOutbox");

async function createAccountNotification({
  recipientId,
  type,
  title,
  body,
  category = "account",
  url = "/dashboard/",
  dedupeKey,
  session
}) {
  if (!recipientId) {
    throw new Error("Notification recipient is required.");
  }

  if (!type || !title || !body) {
    throw new Error("Notification type, title, and body are required.");
  }

  if (!session) {
    throw new Error("A MongoDB transaction session is required.");
  }

  const [notification] = await Notification.create(
    [{
      recipientId,
      type,
      title,
      body,
      category,
      url,
      ...(dedupeKey ? { dedupeKey } : {})
    }],
    { session }
  );

  await PushOutbox.create(
    [{
      notificationId: notification._id,
      recipientId
    }],
    { session }
  );

  return notification;
}

module.exports = {
  createAccountNotification
};
