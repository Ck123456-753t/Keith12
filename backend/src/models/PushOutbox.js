"use strict";

const mongoose = require("mongoose");

const pushOutboxSchema = new mongoose.Schema({
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Notification",
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "processing", "sent", "no_subscriptions"],
    default: "pending",
    required: true
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now
  },
  lockedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  lastError: {
    type: String,
    maxlength: 500,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

pushOutboxSchema.index({ notificationId: 1 }, { unique: true });
pushOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
pushOutboxSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model("PushOutbox", pushOutboxSchema);
