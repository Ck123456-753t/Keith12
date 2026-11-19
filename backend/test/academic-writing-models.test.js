"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const AcademicJob = require("../src/models/AcademicJob");
const AcademicApplication = require("../src/models/AcademicApplication");
const AcademicBidWallet = require("../src/models/AcademicBidWallet");
const AcademicBidTransaction = require("../src/models/AcademicBidTransaction");
const AcademicBidPurchase = require("../src/models/AcademicBidPurchase");

const id = () => new mongoose.Types.ObjectId();

test("Academic job validates USD cents, bid cost and application/deadline ordering", async () => {
  const now = Date.now();
  const good = new AcademicJob({
    title: "Proofreading support", description: "Review an academic draft.", discipline: "Humanities", subject: "History", academicLevel: "Undergraduate", serviceCategory: "Editing",
    budgetMinCents: 1000, budgetMaxCents: 5000, requiredBids: 2,
    applicationClosesAt: new Date(now + 86400000), deadline: new Date(now + 172800000), createdBy: id()
  });
  await assert.doesNotReject(good.validate());
  const invalid = new AcademicJob({ ...good.toObject(), _id: undefined, budgetMinCents: 1000.5 });
  await assert.rejects(invalid.validate());
  assert.equal(AcademicJob.schema.indexes().some(([keys, options]) => keys.status && keys.applicationClosesAt), true);
});

test("Academic applications have unique member/job key and immutable bid price", () => {
  const index = AcademicApplication.schema.indexes().find(([keys]) => keys.jobId && keys.userId);
  assert.equal(index?.[1]?.unique, true);
  assert.equal(AcademicApplication.schema.path("bidCost").options.immutable, true);
});

test("bid wallet rejects negative credits and keeps integer-only counters", async () => {
  const wallet = new AcademicBidWallet({ userId: id(), balanceBids: -1 });
  await assert.rejects(wallet.validate());
  const fractional = new AcademicBidWallet({ userId: id(), balanceBids: 1.5 });
  await assert.rejects(fractional.validate());
});

test("bid ledger is immutable, uniquely referenced, and forbids zero-credit entries", async () => {
  const transaction = new AcademicBidTransaction({
    userId: id(), walletId: id(), type: "APPLICATION_DEDUCTION", bids: 0,
    previousBalance: 2, newBalance: 2, reference: "AW-test-1", description: "test"
  });
  await assert.rejects(transaction.validate());
  const index = AcademicBidTransaction.schema.indexes().find(([keys]) => keys.reference);
  assert.equal(index?.[1]?.unique, true);
});

test("bid purchase records require idempotency and only permit whole-number bid packages", async () => {
  const purchase = new AcademicBidPurchase({
    userId: id(), packageId: id(), packageName: "Starter", bids: 1.5,
    expectedAmountKes: 100, phoneNumber: "254712345678", idempotencyKey: "12345678"
  });
  await assert.rejects(purchase.validate());
  assert.equal(AcademicBidPurchase.schema.indexes().some(([keys, options]) => keys.userId && keys.idempotencyKey && options.unique), true);
});