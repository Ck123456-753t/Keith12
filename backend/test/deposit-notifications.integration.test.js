"use strict";

require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const Deposit = require("../src/models/Deposit");
const Wallet = require("../src/models/Wallet");
const WalletTransaction = require("../src/models/WalletTransaction");
const AdminAuditLog = require("../src/models/AdminAuditLog");
const Notification = require("../src/models/Notification");
const PushOutbox = require("../src/models/PushOutbox");

const {
  createPendingDeposit,
  reviewManualDeposit
} = require("../src/services/depositService");

const uri = process.env.PTW_TEST_MONGODB_URI;

const fixtures = [];

let connected = false;

before(async () => {
  assert.ok(uri, "PTW_TEST_MONGODB_URI must be configured");

  const databaseName = decodeURIComponent(
    new URL(uri).pathname.replace(/^\/+/, "")
  );

  assert.match(
    databaseName.toLowerCase(),
    /test/,
    "Refusing to run outside a database whose name contains 'test'"
  );

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000
  });

  connected = true;

  await Promise.all([
    Deposit.init(),
    Wallet.init(),
    WalletTransaction.init(),
    AdminAuditLog.init(),
    Notification.init(),
    PushOutbox.init()
  ]);
});

after(async () => {
  if (!connected) return;

  for (const fixture of fixtures) {
    const deposits = await Deposit.find({
      requestId: fixture.requestId,
      userId: fixture.userId
    }).select("_id").lean();

    const depositIds = deposits.map(item => item._id);

    if (depositIds.length) {
      await WalletTransaction.deleteMany({
        depositId: { $in: depositIds }
      });

      await Deposit.deleteMany({
        _id: { $in: depositIds }
      });
    }

    await PushOutbox.deleteMany({
      recipientId: fixture.userId
    });

    await Notification.deleteMany({
      recipientId: fixture.userId
    });

    await AdminAuditLog.deleteMany({
      targetUserId: fixture.userId
    });

    await Wallet.deleteOne({
      userId: fixture.userId
    });
  }

  await mongoose.disconnect();
});

async function makeManualDeposit(amountCents = 1250) {
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  const requestId = `DP-${crypto.randomUUID()}`;
  const idempotencyKey = crypto.randomUUID();

  const fixture = {
    userId,
    adminId,
    requestId
  };

  fixtures.push(fixture);

  const result = await createPendingDeposit({
    requestId,
    idempotencyKey,
    userId: userId.toString(),
    amountCents,
    paymentMode: "manual",
    paymentReason: "Offline bank transfer",
    paymentReference: "TEST-TRANSFER-001",
    supportingDetails: "Integration test payment"
  });

  assert.equal(result.created, true);

  return {
    ...fixture,
    deposit: result.deposit
  };
}

test("manual deposit approval credits wallet and creates one notification and outbox record", async t => {
  if (!uri) return t.skip("Test database URI is not configured");

  const fixture = await makeManualDeposit();

  const result = await reviewManualDeposit({
    requestId: fixture.requestId,
    adminId: fixture.adminId.toString(),
    decision: "approve",
    reason: "Payment verified",
    ipAddress: "127.0.0.1"
  });

  assert.equal(result.status, "approved");
  assert.equal(result.amount, 12.5);
  assert.equal(result.availableBalance, 12.5);

  const wallet = await Wallet.findOne({
    userId: fixture.userId
  }).lean();

  assert.equal(wallet.availableBalanceCents, 1250);

  const ledger = await WalletTransaction.find({
    depositId: fixture.deposit._id
  }).lean();

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, "completed");
  assert.equal(ledger[0].amountCents, 1250);

  const notifications = await Notification.find({
    recipientId: fixture.userId
  }).lean();

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "deposit_completed");
  assert.equal(notifications[0].category, "payments");
  assert.equal(
    notifications[0].dedupeKey,
    `deposit:manual:${fixture.requestId}:approved`
  );

  const outbox = await PushOutbox.find({
    recipientId: fixture.userId
  }).lean();

  assert.equal(outbox.length, 1);
  assert.equal(
    String(outbox[0].notificationId),
    String(notifications[0]._id)
  );
  assert.equal(outbox[0].status, "pending");
});

test("manual deposit rejection creates one rejection notification without wallet credit", async t => {
  if (!uri) return t.skip("Test database URI is not configured");

  const fixture = await makeManualDeposit(2500);

  const result = await reviewManualDeposit({
    requestId: fixture.requestId,
    adminId: fixture.adminId.toString(),
    decision: "reject",
    reason: "Payment could not be verified",
    ipAddress: "127.0.0.1"
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "Payment could not be verified");

  const wallet = await Wallet.findOne({
    userId: fixture.userId
  }).lean();

  assert.equal(wallet, null);

  const ledgerCount = await WalletTransaction.countDocuments({
    depositId: fixture.deposit._id
  });

  assert.equal(ledgerCount, 0);

  const notifications = await Notification.find({
    recipientId: fixture.userId
  }).lean();

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "deposit_rejected");

  const outbox = await PushOutbox.find({
    recipientId: fixture.userId
  }).lean();

  assert.equal(outbox.length, 1);
  assert.equal(
    String(outbox[0].notificationId),
    String(notifications[0]._id)
  );
});

test("repeated manual deposit review cannot create duplicate notifications or credits", async t => {
  if (!uri) return t.skip("Test database URI is not configured");

  const fixture = await makeManualDeposit();

  await reviewManualDeposit({
    requestId: fixture.requestId,
    adminId: fixture.adminId.toString(),
    decision: "approve",
    reason: "Payment verified"
  });

  await assert.rejects(
    reviewManualDeposit({
      requestId: fixture.requestId,
      adminId: fixture.adminId.toString(),
      decision: "reject",
      reason: "Second review attempt"
    }),
    error => error.code === "MANUAL_DEPOSIT_NOT_PENDING"
  );

  const wallet = await Wallet.findOne({
    userId: fixture.userId
  }).lean();

  assert.equal(wallet.availableBalanceCents, 1250);

  assert.equal(
    await WalletTransaction.countDocuments({
      depositId: fixture.deposit._id
    }),
    1
  );

  assert.equal(
    await Notification.countDocuments({
      recipientId: fixture.userId
    }),
    1
  );

  assert.equal(
    await PushOutbox.countDocuments({
      recipientId: fixture.userId
    }),
    1
  );
});

test("notification insertion failure rolls back manual deposit approval", async t => {
  if (!uri) return t.skip("Test database URI is not configured");

  const fixture = await makeManualDeposit();

  const dedupeKey =
    `deposit:manual:${fixture.requestId}:approved`;

  // Deliberately occupy the unique dedupe key.
  // The notification insert inside the financial transaction must fail.
  await Notification.create({
    recipientId: fixture.userId,
    type: "deposit_completed",
    title: "Existing test notification",
    body: "This record deliberately blocks the transaction.",
    category: "payments",
    dedupeKey
  });

  await assert.rejects(
    reviewManualDeposit({
      requestId: fixture.requestId,
      adminId: fixture.adminId.toString(),
      decision: "approve",
      reason: "Payment verified"
    }),
    error => error.code === 11000
  );

  const deposit = await Deposit.findById(
    fixture.deposit._id
  ).lean();

  assert.equal(deposit.status, "pending");
  assert.equal(deposit.walletTransactionId, null);

  const wallet = await Wallet.findOne({
    userId: fixture.userId
  }).lean();

  assert.equal(wallet, null);

  assert.equal(
    await WalletTransaction.countDocuments({
      depositId: fixture.deposit._id
    }),
    0
  );

  assert.equal(
    await AdminAuditLog.countDocuments({
      targetUserId: fixture.userId
    }),
    0
  );

  // Only the deliberately pre-existing notification remains.
  assert.equal(
    await Notification.countDocuments({
      recipientId: fixture.userId
    }),
    1
  );

  assert.equal(
    await PushOutbox.countDocuments({
      recipientId: fixture.userId
    }),
    0
  );
});
