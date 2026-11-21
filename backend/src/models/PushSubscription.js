"use strict";

const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048
  },
  keys: {
    p256dh: {
      type: String,
      required: true,
      maxlength: 300
    },
    auth: {
      type: String,
      required: true,
      maxlength: 200
    }
  },
  expirationTime: {
    type: Number,
    default: null
  },
  userAgent: {
    type: String,
    maxlength: 500,
    default: null
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  versionKey: false
});

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
