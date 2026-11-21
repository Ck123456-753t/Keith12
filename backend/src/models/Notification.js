"use strict";

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      "chat_message",
      "chat_streak_unlocked",
      "chat_streak_reward",
      "deposit_completed",
      "deposit_rejected",
      "withdrawal_approved",
      "withdrawal_processing",
      "withdrawal_paid",
      "withdrawal_rejected",
      "membership_activated",
      "commission_received",
      "account_security",
      "admin_announcement"
    ],
    required: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ""
  },
  body: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ""
  },
  category: {
    type: String,
    trim: true,
    maxlength: 40,
    default: "account"
  },
  url: {
    type: String,
    trim: true,
    maxlength: 300,
    default: "/dashboard/"
  },
  dedupeKey: {
    type: String,
    trim: true,
    maxlength: 180,
    default: undefined
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatConversation",
    default: null
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatMessage",
    default: null
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } }
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
