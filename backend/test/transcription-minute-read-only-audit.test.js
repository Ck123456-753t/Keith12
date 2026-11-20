"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  auditTranscriptionMinutePurchases,
  loadBackupRecords,
  maskPhone
} = require("../src/services/transcriptionMinuteReadOnlyAudit");

function query(rows, calls, name) {
  return {
    select(projection) { calls.push({ name, projection }); return this; },
    maxTimeMS(milliseconds) { calls.push({ name, maxTimeMS: milliseconds }); return this; },
    readConcern(level) { calls.push({ name, readConcern: level }); return this; },
    limit(limit) { calls.push({ name, limit }); return this; },
    lean() { return Promise.resolve(rows); }
  };
}

function createModels(fixtures = {}) {
  const calls = [];
  const build = (name, rows) => ({
    find(filter) {
      calls.push({ name, filter });
      let selectedRows = rows.filter(row => {
        if (filter?._id?.$in) return filter._id.$in.map(String).includes(String(row._id));
        const equalsOrIn = (condition, value) => condition && typeof condition === "object" && "$in" in condition
          ? condition.$in.includes(value)
          : condition === value;
        const matchesBranch = branch => {
          if (branch.purchaseId && !equalsOrIn(branch.purchaseId, row.purchaseId)) return false;
        if (branch.reference && !(branch.reference instanceof RegExp && typeof row.reference === "string"
          ? branch.reference.test(row.reference)
          : equalsOrIn(branch.reference, row.reference))) return false;
          if (branch.receipt && !equalsOrIn(branch.receipt, row.receipt)) return false;
          if (branch.referenceId && !equalsOrIn(branch.referenceId, row.referenceId)) return false;
          if (branch.type && !equalsOrIn(branch.type, row.type)) return false;
          if (branch.checkoutRequestId && !equalsOrIn(branch.checkoutRequestId, row.checkoutRequestId)) return false;
          if (branch.merchantRequestId && !equalsOrIn(branch.merchantRequestId, row.merchantRequestId)) return false;
          if (branch.purchaseReference && !equalsOrIn(branch.purchaseReference, row.purchaseReference)) return false;
          if (branch.userId && !equalsOrIn(branch.userId, row.userId)) return false;
          if (branch.idempotencyKey && !equalsOrIn(branch.idempotencyKey, row.idempotencyKey)) return false;
          if (branch._id?.$nin && branch._id.$nin.map(String).includes(String(row._id))) return false;
          return true;
        };
        if (filter?.$or) return filter.$or.some(matchesBranch);
        if (filter?.userId && String(filter.userId) !== String(row.userId)) return false;
        if (filter?.type && filter.type !== row.type) return false;
        if (filter?.userId && filter?.type) return String(filter.userId) === String(row.userId) && filter.type === row.type;
        return true;
      });
      if (filter?.userId?.$in) {
        selectedRows = rows.filter(row => filter.userId.$in.map(String).includes(String(row.userId)));
      }
      return query(selectedRows, calls, name);
    }
  });
  return {
    calls,
    Purchase: build("purchase", fixtures.purchases || []),
    CallbackEvent: build("callback", fixtures.callbacks || []),
    ReceiptClaim: build("claim", fixtures.claims || []),
    MinuteTransaction: build("ledger", fixtures.ledger || []),
    MinuteWallet: build("wallet", fixtures.wallets || [])
  };
}

const purchaseId = "6ae8a6b7398afb985a3813a8";
const userId = "6acf3c35cd675fec9616958b";
const backup = {
  _id: purchaseId,
  userId,
  purchaseReference: "PTW-TM-test-reference",
  idempotencyKey: "minute-test-key-123",
  minutes: 17,
  expectedAmountKes: 258,
  phoneNumber: "254700000001",
  checkoutRequestId: "ws_CO_backup_lookup_only",
  merchantRequestId: "merchant-backup-lookup-only",
  paymentStatus: "failed",
  mpesaReceipt: null
};

const livePurchase = {
  ...backup,
  _id: purchaseId,
  packageName: "17 minutes",
  checkoutRequestId: "ws_CO_live_id",
  merchantRequestId: "merchant_live_id",
  paymentStatus: "verification_required",
  createdAt: new Date("2026-11-01T10:00:00.000Z"),
  updatedAt: new Date("2026-11-01T10:01:00.000Z")
};

test("rejects malformed backups before issuing model reads", async () => {
  assert.throws(() => loadBackupRecords([]), /non-empty JSON array/);
  assert.throws(() => loadBackupRecords([{ _id: "not-an-object-id" }]), /invalid purchase ID/);
  const models = createModels();
  await assert.rejects(auditTranscriptionMinutePurchases({
    backupRecords: [{ _id: "bad" }], ...models
  }));
  assert.equal(models.calls.length, 0);
});

test("audits live records and does not treat backup or callback data as settlement proof", async () => {
  const models = createModels({
    purchases: [livePurchase],
    callbacks: [{
      _id: "callback-1",
      checkoutRequestId: livePurchase.checkoutRequestId,
      merchantRequestId: livePurchase.merchantRequestId,
      resultCode: 0,
      callbackAmountKes: 258,
      callbackReceipt: "ABC123XYZ",
      callbackPhoneNumber: "254700000001",
      processingStatus: "reconciliation_required",
      receivedAt: new Date("2026-11-01T10:02:00.000Z")
    }],
    claims: [{
      _id: "claim-1",
      receipt: "ABC123XYZ",
      purpose: "transcription_minute_purchase",
      referenceId: purchaseId,
      amountKes: 258,
      evidenceSource: "daraja_provider_confirmation"
    }],
    wallets: [{
      userId,
      availableMinutes: 12,
      totalPurchasedMinutes: 50,
      totalSpentMinutes: 38,
      totalRefundedMinutes: 0
    }]
  });

  const report = await auditTranscriptionMinutePurchases({
    backupRecords: [backup],
    ...models,
    generatedAt: new Date("2026-11-20T12:00:00.000Z")
  });

  const record = report.records[0];
  assert.equal(report.mode, "read_only");
  assert.equal(report.databaseAccess.writeOperationsIssued, false);
  assert.equal(report.databaseAccess.safaricomQueried, false);
  assert.equal(record.livePurchase.paymentStatus, "verification_required");
  assert.equal(record.callbackEvents.length, 1);
  assert.equal(record.callbackEvents[0].matchBasis, "live_checkout_request_id");
  assert.equal(record.receiptClaims.length, 1);
  assert.equal(record.wallet.availableMinutes, 12);
  assert.equal(record.alreadyCredited, false);
  assert.equal(record.independentlyVerifiedBySafaricom, false);
  assert.ok(record.evidenceWarning.includes("do not independently prove"));
  assert.ok(record.backupPaymentMismatchFields.includes("paymentStatus"));
  assert.ok(record.actionRequiredFlags.includes("backup_snapshot_differs_from_live_purchase"));

  const purchaseReads = models.calls.filter(call => call.name === "purchase");
  assert.ok(purchaseReads.length >= 1);
  for (const call of models.calls) {
    if (call.filter) assert.ok(Object.keys(call.filter).every(key => ["_id", "$or", "checkoutRequestId", "userId", "purchaseReference", "idempotencyKey", "type"].includes(key)));
  }
  const ledgerQuery = models.calls.find(call => call.name === "ledger");
  assert.ok(ledgerQuery.filter.$or.some(branch => branch.reference?.$in?.[0] instanceof RegExp));
  assert.ok(models.calls.some(call => call.name === "purchase" && call.filter._id));
  assert.ok(models.calls.some(call => call.name === "callback"));
  assert.ok(models.calls.some(call => call.name === "claim"));
  assert.ok(models.calls.some(call => call.name === "ledger"));
  assert.ok(models.calls.some(call => call.name === "wallet"));
  assert.ok(models.calls.filter(call => call.readConcern).every(call => call.readConcern === "majority"));
});

test("finds already-credited purchases and flags ledger/status inconsistencies", async () => {
  const models = createModels({
    purchases: [{ ...livePurchase, paymentStatus: "failed" }],
    ledger: [{
      _id: "ledger-1",
      purchaseId,
      userId,
      walletId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      type: "purchase_credit",
      minutes: 17,
      reference: "wrong-reference"
    }],
    wallets: [{ userId, availableMinutes: 17, totalPurchasedMinutes: 17 }]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });
  const record = report.records[0];

  assert.equal(record.alreadyCredited, true);
  assert.equal(record.creditLedgerEntryCount, 1);
  assert.equal(record.classification, "already_credited_check_consistency");
  assert.ok(record.actionRequiredFlags.includes("purchase_status_conflicts_with_purchase_credit_ledger"));
  assert.equal(report.summary.alreadyCreditedByPurchaseCreditLedger, 1);
});

test("flags missing live purchases, duplicate ledger entries, and receipt claims owned elsewhere", async () => {
  const models = createModels({
    callbacks: [{
      _id: "callback-1",
      checkoutRequestId: backup.checkoutRequestId,
      callbackReceipt: "ABC123XYZ",
      resultCode: 0
    }],
    claims: [{
      receipt: "ABC123XYZ",
      purpose: "deposit",
      referenceId: "some-other-reference",
      amountKes: 258,
      evidenceSource: "safaricom_portal"
    }],
    ledger: [1, 2].map(index => ({
      _id: `ledger-${index}`,
      purchaseId,
      userId,
      type: "purchase_credit",
      minutes: 17,
      reference: "wrong-reference"
    })),
    wallets: [{ userId, availableMinutes: 29, totalPurchasedMinutes: 46 }]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });
  const record = report.records[0];

  assert.equal(record.classification, "unresolved_live_purchase_missing");
  assert.equal(record.alreadyCredited, true);
  assert.ok(record.duplicateFlags.includes("duplicate_purchase_credit_entries"));
  assert.ok(record.duplicateFlags.includes("receipt_claim_owned_by_different_reference"));
  assert.ok(record.actionRequiredFlags.includes("live_purchase_missing"));
  assert.equal(record.wallet.availableMinutes, 29);
  assert.equal(record.wallet.lookupUserIdSource, "backup_lookup_only");
});

test("reports duplicate live purchase reference and idempotency values", async () => {
  const duplicate = {
    ...livePurchase,
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb"
  };
  const models = createModels({
    purchases: [livePurchase, duplicate],
    wallets: [{ userId, availableMinutes: 0, totalPurchasedMinutes: 0 }]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });

  assert.ok(report.records[0].duplicateFlags.includes("duplicate_live_purchase_reference"));
  assert.ok(report.records[0].duplicateFlags.includes("duplicate_live_user_idempotency_key"));
  assert.ok(models.calls.some(call =>
    call.name === "purchase" && call.filter?.$or?.some(branch => branch.purchaseReference === livePurchase.purchaseReference)
  ));
});

test("finds a duplicate reference on a separate live purchase document", async () => {
  const duplicateId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const models = createModels({
    purchases: [
      livePurchase,
      { ...livePurchase, _id: duplicateId, userId: "cccccccccccccccccccccccc", idempotencyKey: "different-key" }
    ]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });

  assert.ok(report.records[0].duplicateFlags.includes("duplicate_live_purchase_reference"));
  const duplicateQuery = models.calls.find(call => call.name === "purchase" && call.filter?.$or);
  assert.ok(duplicateQuery.filter.$or.some(branch => branch.purchaseReference));
  assert.equal(report.records[0].livePurchase.purchaseReference, livePurchase.purchaseReference);
});

test("recovers a missing purchase by stored idempotency/reference lookup keys", async () => {
  const models = createModels({
    purchases: [{
      ...livePurchase,
      _id: "dddddddddddddddddddddddd",
      checkoutRequestId: null,
      merchantRequestId: null,
      idempotencyKey: backup.idempotencyKey
    }]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });

  assert.equal(report.records[0].livePurchase, null);
  assert.equal(report.records[0].alternatePurchaseCandidates[0].purchaseReference, livePurchase.purchaseReference);
  assert.ok(report.records[0].actionRequiredFlags.includes("live_purchase_missing"));
  assert.ok(report.records[0].duplicateFlags.includes("backup_keys_match_different_live_purchase_id"));
  assert.ok(report.records[0].alternatePurchaseCandidates[0].matchKeys.includes("userId_and_idempotencyKey"));
});

test("flags amount, receipt, ledger-reference, and wallet-balance mismatches", async () => {
  const models = createModels({
    purchases: [{
      ...livePurchase,
      paymentStatus: "verified",
      mpesaReceipt: "LIVE123456",
      verifiedAmountKes: 300,
      verificationMethod: "admin_manual_reconciliation",
      evidenceSource: "safaricom_portal",
      evidenceReference: "saf-export-ref-123"
    }],
    callbacks: [{
      _id: "callback-mismatch",
      checkoutRequestId: livePurchase.checkoutRequestId,
      merchantRequestId: livePurchase.merchantRequestId,
      resultCode: 0,
      callbackAmountKes: 259,
      callbackReceipt: "DIFFERENT123",
      callbackPhoneNumber: "254711111111"
    }],
    claims: [{
      receipt: "LIVE123456",
      purpose: "transcription_minute_purchase",
      referenceId: purchaseId,
      amountKes: 300,
      evidenceSource: "safaricom_portal"
    }],
    ledger: [{
      _id: "ledger-mismatch",
      purchaseId,
      userId,
      type: "purchase_credit",
      minutes: 17,
      reference: "wrong-reference"
    }],
    wallets: [{
      userId,
      availableMinutes: 10,
      totalPurchasedMinutes: 14,
      totalSpentMinutes: 3,
      totalRefundedMinutes: 0
    }]
  });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });
  const record = report.records[0];

  assert.ok(record.actionRequiredFlags.includes("callback_amount_differs_from_live_purchase"));
  assert.ok(record.actionRequiredFlags.includes("callback_phone_differs_from_live_purchase"));
  assert.ok(record.actionRequiredFlags.includes("callback_receipt_differs_from_live_purchase"));
  assert.ok(record.actionRequiredFlags.includes("live_verified_amount_differs_from_expected_amount"));
  assert.ok(record.actionRequiredFlags.includes("purchase_credit_reference_mismatch"));
  assert.ok(record.actionRequiredFlags.includes("wallet_available_balance_differs_from_counters"));
  assert.ok(record.actionRequiredFlags.includes("purchase_credit_details_or_reference_differ_from_live_purchase"));
  assert.ok(record.paymentDetailMismatches.length >= 3);
  assert.equal(record.statusConclusion,
    "MongoDB/provider-verification state only; Safaricom portal or statement not independently inspected");
});

test("masks phone numbers and retains no full backup phone in audit output", async () => {
  const models = createModels({ purchases: [livePurchase] });
  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });
  const json = JSON.stringify(report);

  assert.equal(maskPhone("254700000001"), "25470…01");
  assert.equal(json.includes("254700000001"), false);
  assert.equal(report.records[0].livePurchase.phoneNumberMasked, "25470…01");
});

test("never invokes a model mutation or starts an STK/payment request", async () => {
  const models = createModels({ purchases: [livePurchase] });
  const forbidden = () => { throw new Error("write/provider operation must not be called"); };
  for (const Model of [models.Purchase, models.CallbackEvent, models.ReceiptClaim, models.MinuteTransaction, models.MinuteWallet]) {
    Model.updateOne = forbidden;
    Model.updateMany = forbidden;
    Model.findOneAndUpdate = forbidden;
    Model.create = forbidden;
    Model.insertMany = forbidden;
    Model.deleteOne = forbidden;
    Model.deleteMany = forbidden;
  }

  const report = await auditTranscriptionMinutePurchases({ backupRecords: [backup], ...models });
  assert.equal(report.databaseAccess.writeOperationsIssued, false);
  assert.equal(report.databaseAccess.safaricomQueried, false);
});