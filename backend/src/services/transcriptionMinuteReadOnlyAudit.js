"use strict";

const MAX_BACKUP_RECORDS = 100;
const MAX_READ_RESULTS = 200;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const BACKUP_COMPARISON_FIELDS = [
  "userId",
  "purchaseReference",
  "idempotencyKey",
  "minutes",
  "expectedAmountKes",
  "phoneNumber",
  "checkoutRequestId",
  "merchantRequestId",
  "paymentStatus"
];

function asString(value) {
  return value === null || value === undefined ? null : String(value);
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ""))];
}

function normalizeReceipt(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

function maskPhone(value) {
  if (typeof value !== "string" || value.length < 7) return null;
  return `${value.slice(0, 5)}…${value.slice(-2)}`;
}

function loadBackupRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("The backup must contain a non-empty JSON array.");
  }
  if (records.length > MAX_BACKUP_RECORDS) {
    throw new Error(`The backup exceeds the ${MAX_BACKUP_RECORDS}-record safety limit.`);
  }
  return records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Backup record ${index + 1} must be a JSON object.`);
    }
    const purchaseId = asString(record._id);
    if (!purchaseId || !OBJECT_ID_PATTERN.test(purchaseId)) {
      throw new Error(`Backup record ${index + 1} has an invalid purchase ID.`);
    }
    return { ...record, _id: purchaseId };
  });
}

async function readMany(Model, filter, projection, limit = MAX_READ_RESULTS) {
  let query = Model.find(filter);
  if (typeof query.select === "function") query = query.select(projection);
  if (typeof query.maxTimeMS === "function") query = query.maxTimeMS(15000);
  if (typeof query.readConcern === "function") query = query.readConcern("majority");
  if (typeof query.limit === "function") query = query.limit(limit);
  if (typeof query.lean === "function") query = query.lean();
  const rows = await query;
  return Array.isArray(rows) ? rows : [];
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function purchaseReferenceRegex(purchaseId) {
  return new RegExp(`^TRANSCRIPTION-MINUTE-PURCHASE-${purchaseId}$`, "i");
}

function matchingBackupKeys(backup, purchase) {
  return [
    ...(backup.purchaseReference && purchase.purchaseReference === backup.purchaseReference ? ["purchaseReference"] : []),
    ...(backup.checkoutRequestId && purchase.checkoutRequestId === backup.checkoutRequestId ? ["checkoutRequestId"] : []),
    ...(backup.merchantRequestId && purchase.merchantRequestId === backup.merchantRequestId ? ["merchantRequestId"] : []),
    ...(backup.userId && backup.idempotencyKey &&
      asString(purchase.userId) === asString(backup.userId) &&
      purchase.idempotencyKey === backup.idempotencyKey ? ["userId_and_idempotencyKey"] : [])
  ];
}

function makeAuditRecord({
  backup,
  live,
  alternatePurchases,
  callbacks,
  claims,
  ledger,
  wallet,
  backupDuplicateCount,
  wrongCreditReferencePurchaseIds,
  duplicatePurchaseIds,
  duplicateCallbackReceipts,
  duplicateClaimReceipts
}) {
  const purchaseId = backup._id;
  const expectedLedgerReference = `TRANSCRIPTION-MINUTE-PURCHASE-${purchaseId}`;
  const backupPaymentMismatchFields = live
    ? BACKUP_COMPARISON_FIELDS.filter(field => asString(backup[field]) !== asString(live[field]))
    : [];

  const callbacksForRecord = callbacks.filter(callback =>
    [backup.checkoutRequestId, live?.checkoutRequestId, backup.merchantRequestId, live?.merchantRequestId]
      .filter(Boolean)
      .some(key => key === callback.checkoutRequestId || key === callback.merchantRequestId)
  );
  const receiptCandidates = unique([
    normalizeReceipt(backup.mpesaReceipt),
    normalizeReceipt(live?.mpesaReceipt),
    ...callbacksForRecord.map(callback => normalizeReceipt(callback.callbackReceipt))
  ]);
  const claimsForRecord = claims.filter(claim =>
    asString(claim.referenceId) === purchaseId ||
    (normalizeReceipt(claim.receipt) && receiptCandidates.includes(normalizeReceipt(claim.receipt)))
  );
  const ledgerForRecord = ledger.filter(entry =>
    (entry.type === "purchase_credit" && (
      asString(entry.purchaseId) === purchaseId ||
      (live && asString(entry.userId) === asString(live.userId))
    )) || purchaseReferenceRegex(purchaseId).test(String(entry.reference || ""))
  );
  const purchaseCredits = ledgerForRecord.filter(entry => entry.type === "purchase_credit" && (
    asString(entry.purchaseId) === purchaseId ||
    purchaseReferenceRegex(purchaseId).test(String(entry.reference || ""))
  ));
  const ledgerReferenceConflicts = ledgerForRecord
    .filter(entry => purchaseReferenceRegex(purchaseId).test(String(entry.reference || "")) &&
      entry.type !== "purchase_credit")
    .map(entry => ({
      transactionId: asString(entry._id),
      type: entry.type || null,
      reference: entry.reference || null,
      purchaseId: asString(entry.purchaseId),
      userId: asString(entry.userId)
    }));

  const duplicateFlags = [];
  const actionRequiredFlags = [];
  if (backupDuplicateCount > 1) duplicateFlags.push("duplicate_purchase_id_in_backup");
  if (duplicatePurchaseIds.has(purchaseId)) {
    duplicateFlags.push("duplicate_live_purchase_reference");
    duplicateFlags.push("duplicate_live_user_idempotency_key");
  }
  if (alternatePurchases.length) duplicateFlags.push("backup_keys_match_different_live_purchase_id");
  if (callbacksForRecord.length > 1) duplicateFlags.push("multiple_callback_events_for_purchase_keys");
  if (purchaseCredits.length > 1) duplicateFlags.push("duplicate_purchase_credit_entries");
  if (claimsForRecord.filter(claim => asString(claim.referenceId) === purchaseId).length > 1) {
    duplicateFlags.push("multiple_receipt_claims_for_purchase");
  }
  if (receiptCandidates.some(receipt => duplicateClaimReceipts.has(receipt))) {
    duplicateFlags.push("duplicate_receipt_claim_records");
  }
  if (receiptCandidates.some(receipt => duplicateCallbackReceipts.has(receipt))) {
    duplicateFlags.push("receipt_reused_across_callback_events");
  }
  if (claimsForRecord.some(claim => asString(claim.referenceId) !== purchaseId)) {
    duplicateFlags.push("receipt_claim_owned_by_different_reference");
  }
  if (ledgerReferenceConflicts.length) duplicateFlags.push("purchase_credit_reference_used_by_non_credit_ledger_entry");
  if (wrongCreditReferencePurchaseIds.has(purchaseId)) actionRequiredFlags.push("purchase_credit_reference_mismatch");

  if (!live) actionRequiredFlags.push("live_purchase_missing");
  if (alternatePurchases.length) actionRequiredFlags.push("backup_lookup_keys_match_different_live_purchase_id");
  if (live && backupPaymentMismatchFields.length) actionRequiredFlags.push("backup_snapshot_differs_from_live_purchase");
  if (live?.checkoutRequestId && !callbacksForRecord.length) actionRequiredFlags.push("matching_daraja_callback_event_missing");

  const callbackMismatches = [];
  for (const callback of callbacksForRecord) {
    if (live && callback.callbackAmountKes !== null && callback.callbackAmountKes !== undefined &&
        callback.callbackAmountKes !== live.expectedAmountKes) {
      actionRequiredFlags.push("callback_amount_differs_from_live_purchase");
      callbackMismatches.push({ field: "callback_amount_vs_live_expected_amount", callbackEventId: asString(callback._id) });
    }
    if (live && callback.callbackPhoneNumber && live.phoneNumber &&
        String(callback.callbackPhoneNumber) !== String(live.phoneNumber)) {
      actionRequiredFlags.push("callback_phone_differs_from_live_purchase");
      callbackMismatches.push({ field: "callback_phone_vs_live_phone", callbackEventId: asString(callback._id) });
    }
    if (live && callback.callbackReceipt && live.mpesaReceipt &&
        normalizeReceipt(callback.callbackReceipt) !== normalizeReceipt(live.mpesaReceipt)) {
      actionRequiredFlags.push("callback_receipt_differs_from_live_purchase");
      callbackMismatches.push({ field: "callback_receipt_vs_live_receipt", callbackEventId: asString(callback._id) });
    }
    if (live && callback.merchantRequestId && live.merchantRequestId &&
        callback.merchantRequestId !== live.merchantRequestId) {
      actionRequiredFlags.push("callback_merchant_request_id_differs_from_live_purchase");
    }
  }

  for (const claim of claimsForRecord) {
    if (asString(claim.referenceId) === purchaseId &&
        (claim.purpose !== "transcription_minute_purchase" ||
         (live && claim.amountKes !== null && claim.amountKes !== undefined && claim.amountKes !== live.expectedAmountKes))) {
      actionRequiredFlags.push("receipt_claim_purpose_or_amount_mismatch");
    }
  }
  if (live && live.verifiedAmountKes !== null && live.verifiedAmountKes !== undefined &&
      live.verifiedAmountKes !== live.expectedAmountKes) {
    actionRequiredFlags.push("live_verified_amount_differs_from_expected_amount");
  }
  if (live && wallet && [wallet.availableMinutes, wallet.totalPurchasedMinutes,
    wallet.totalSpentMinutes, wallet.totalRefundedMinutes].every(Number.isSafeInteger) &&
      wallet.totalPurchasedMinutes - wallet.totalSpentMinutes + wallet.totalRefundedMinutes !== wallet.availableMinutes) {
    actionRequiredFlags.push("wallet_available_balance_differs_from_counters");
  }
  if (live && purchaseCredits.some(entry =>
    asString(entry.userId) !== asString(live.userId) || entry.minutes !== live.minutes ||
    (entry.purchaseId && asString(entry.purchaseId) !== purchaseId) ||
    !purchaseReferenceRegex(purchaseId).test(String(entry.reference || ""))
  )) actionRequiredFlags.push("purchase_credit_details_or_reference_differ_from_live_purchase");
  if (ledgerReferenceConflicts.length) actionRequiredFlags.push("purchase_credit_reference_conflicts_with_ledger_type");
  if (live && live.paymentStatus === "verified" && purchaseCredits.length === 0) {
    actionRequiredFlags.push("verified_purchase_missing_purchase_credit_ledger");
  }
  if (live && ["failed", "cancelled", "pending", "verification_required"].includes(live.paymentStatus) && purchaseCredits.length) {
    actionRequiredFlags.push("purchase_status_conflicts_with_purchase_credit_ledger");
  }
  if (live && live.paymentStatus === "verified" && !live.mpesaReceipt) actionRequiredFlags.push("verified_live_purchase_missing_receipt");
  if (live && live.paymentStatus === "verified" && live.verifiedAmountKes == null) actionRequiredFlags.push("verified_live_purchase_missing_verified_amount");
  if (live && live.paymentStatus === "verified" && live.verificationMethod !== "provider_confirmation") {
    actionRequiredFlags.push("verified_live_purchase_verification_method_not_provider_confirmation");
  }
  if (live && live.paymentStatus === "verified" && live.evidenceSource !== "daraja_provider_confirmation") {
    actionRequiredFlags.push("verified_live_purchase_evidence_source_not_provider_confirmation");
  }
  if (live && live.mpesaReceipt && !claimsForRecord.some(claim =>
    asString(claim.referenceId) === purchaseId && normalizeReceipt(claim.receipt) === normalizeReceipt(live.mpesaReceipt)
  )) actionRequiredFlags.push("live_purchase_receipt_has_no_matching_claim");
  if (!live && receiptCandidates.length && !claimsForRecord.length) actionRequiredFlags.push("receipt_candidate_has_no_matching_claim");

  const alreadyCredited = purchaseCredits.length > 0;
  let classification = "unresolved_uncredited";
  if (!live) classification = "unresolved_live_purchase_missing";
  else if (alreadyCredited) classification = "already_credited_check_consistency";
  else if (["failed", "cancelled"].includes(live.paymentStatus)) classification = "failed_or_cancelled_uncredited_preserve";
  else if (live.paymentStatus === "verified") classification = "database_verified_status_without_credit_ledger_action_required";

  return {
    purchaseId,
    classification,
    livePurchase: live ? {
      livePurchaseId: asString(live._id),
      purchaseReference: live.purchaseReference || null,
      userId: asString(live.userId),
      idempotencyKey: live.idempotencyKey || null,
      packageName: live.packageName || null,
      minutes: live.minutes ?? null,
      expectedAmountKes: live.expectedAmountKes ?? null,
      phoneNumberMasked: maskPhone(live.phoneNumber),
      checkoutRequestId: live.checkoutRequestId || null,
      merchantRequestId: live.merchantRequestId || null,
      paymentStatus: live.paymentStatus || null,
      mpesaReceipt: normalizeReceipt(live.mpesaReceipt),
      verifiedAmountKes: live.verifiedAmountKes ?? null,
      verificationMethod: live.verificationMethod || null,
      evidenceSource: live.evidenceSource || null,
      evidenceReference: live.evidenceReference || null,
      createdAt: toIso(live.createdAt),
      updatedAt: toIso(live.updatedAt)
    } : null,
    alternatePurchaseCandidates: alternatePurchases.map(({ purchase, matchKeys }) => ({
      purchaseId: asString(purchase._id),
      purchaseReference: purchase.purchaseReference || null,
      userId: asString(purchase.userId),
      idempotencyKey: purchase.idempotencyKey || null,
      paymentStatus: purchase.paymentStatus || null,
      matchKeys
    })),
    backupSnapshot: {
      usedFor: "purchase-id/key lookup and snapshot comparison only; never payment evidence",
      paymentStatus: backup.paymentStatus || null,
      failureCode: backup.failureCode || null,
      minutes: backup.minutes ?? null,
      expectedAmountKes: backup.expectedAmountKes ?? null,
      phoneNumberMasked: maskPhone(backup.phoneNumber),
      receiptPresent: Boolean(normalizeReceipt(backup.mpesaReceipt)),
      duplicateBackupEntries: backupDuplicateCount
    },
    backupPaymentMismatchFields,
    paymentDetailMismatches: callbackMismatches,
    callbackEvents: callbacksForRecord.map(callback => ({
      callbackEventId: asString(callback._id),
      matchBasis: live?.checkoutRequestId && callback.checkoutRequestId === live.checkoutRequestId
        ? "live_checkout_request_id"
        : "backup_or_merchant_identifier_lookup_only",
      checkoutRequestId: callback.checkoutRequestId || null,
      merchantRequestId: callback.merchantRequestId || null,
      resultCode: callback.resultCode ?? null,
      resultDescription: callback.resultDescription || null,
      callbackAmountKes: callback.callbackAmountKes ?? null,
      callbackReceipt: normalizeReceipt(callback.callbackReceipt),
      callbackPhoneNumberMasked: maskPhone(callback.callbackPhoneNumber),
      processingStatus: callback.processingStatus || null,
      transactionDate: callback.transactionDate || null,
      receivedAt: toIso(callback.receivedAt || callback.createdAt),
      warning: "Callback payload is untrusted reconciliation metadata, not independent payment evidence."
    })),
    receiptClaims: claimsForRecord.map(claim => ({
      receipt: normalizeReceipt(claim.receipt),
      purpose: claim.purpose || null,
      referenceId: asString(claim.referenceId),
      amountKes: claim.amountKes ?? null,
      claimedBy: asString(claim.claimedBy),
      evidenceSource: claim.evidenceSource || null,
      evidenceReference: claim.evidenceReference || null,
      claimedAt: toIso(claim.claimedAt || claim.createdAt),
      matchedBy: asString(claim.referenceId) === purchaseId ? "purchase_reference_id" : "receipt_candidate_only"
    })),
    purchaseCreditLedgerEntries: purchaseCredits.map(entry => ({
      transactionId: asString(entry._id),
      purchaseId: asString(entry.purchaseId),
      userId: asString(entry.userId),
      walletId: asString(entry.walletId),
      type: entry.type || null,
      minutes: entry.minutes ?? null,
      reference: entry.reference || null,
      description: entry.description || null,
      createdAt: toIso(entry.createdAt),
      matchesExpectedReference: purchaseReferenceRegex(purchaseId).test(String(entry.reference || ""))
    })),
    ledgerReferenceConflicts,
    wallet: wallet ? {
      userId: asString(wallet.userId),
      lookupUserIdSource: live ? "live_purchase" : "backup_lookup_only",
      availableMinutes: wallet.availableMinutes ?? null,
      totalPurchasedMinutes: wallet.totalPurchasedMinutes ?? null,
      totalSpentMinutes: wallet.totalSpentMinutes ?? null,
      totalRefundedMinutes: wallet.totalRefundedMinutes ?? null,
      updatedAt: toIso(wallet.updatedAt)
    } : null,
    creditLedgerEntryCount: purchaseCredits.length,
    alreadyCredited,
    independentlyVerifiedBySafaricom: false,
    statusConclusion: live?.paymentStatus === "verified"
      ? "MongoDB/provider-verification state only; Safaricom portal or statement not independently inspected"
      : "No successful-payment conclusion; Safaricom portal or statement not independently inspected",
    duplicateFlags: unique(duplicateFlags),
    actionRequiredFlags: unique(actionRequiredFlags),
    evidenceWarning: "Database status, provider callback/query data, receipt claims, ledger entries, wallet balances, and backup fields do not independently prove Safaricom settlement."
  };
}

async function auditTranscriptionMinutePurchases({
  backupRecords,
  Purchase,
  CallbackEvent,
  ReceiptClaim,
  MinuteTransaction,
  MinuteWallet,
  generatedAt = new Date()
}) {
  for (const [name, Model] of Object.entries({ Purchase, CallbackEvent, ReceiptClaim, MinuteTransaction, MinuteWallet })) {
    if (!Model || typeof Model.find !== "function") throw new Error(`${name} read model is required.`);
  }
  const backups = loadBackupRecords(backupRecords);
  const backupById = new Map();
  const backupCounts = new Map();
  for (const backup of backups) {
    backupCounts.set(backup._id, (backupCounts.get(backup._id) || 0) + 1);
    if (!backupById.has(backup._id)) backupById.set(backup._id, backup);
  }
  const purchaseIds = [...backupById.keys()];

  const livePurchases = await readMany(
    Purchase,
    { _id: { $in: purchaseIds } },
    "_id purchaseReference userId idempotencyKey packageName minutes expectedAmountKes phoneNumber checkoutRequestId merchantRequestId paymentStatus mpesaReceipt verifiedAmountKes verificationMethod evidenceSource evidenceReference createdAt updatedAt",
    MAX_BACKUP_RECORDS
  );
  const backupsWithLookupKeys = backups.filter(record =>
    record.purchaseReference || record.checkoutRequestId || record.merchantRequestId ||
    (record.userId && record.idempotencyKey)
  );
  const backupLookupBranches = backupsWithLookupKeys.flatMap(record => [
    ...(record.purchaseReference ? [{ purchaseReference: record.purchaseReference }] : []),
    ...(record.checkoutRequestId ? [{ checkoutRequestId: record.checkoutRequestId }] : []),
    ...(record.merchantRequestId ? [{ merchantRequestId: record.merchantRequestId }] : []),
    ...(record.userId && record.idempotencyKey ? [{ userId: record.userId, idempotencyKey: record.idempotencyKey }] : [])
  ]);
  const backupKeyCandidates = backupLookupBranches.length
    ? await readMany(Purchase, { $or: backupLookupBranches }, "_id purchaseReference userId idempotencyKey", MAX_READ_RESULTS)
    : [];

  const liveKeys = [...livePurchases.flatMap(purchase => [
      ...(purchase.purchaseReference ? [{ purchaseReference: purchase.purchaseReference }] : []),
      ...(purchase.checkoutRequestId ? [{ checkoutRequestId: purchase.checkoutRequestId }] : []),
      ...(purchase.merchantRequestId ? [{ merchantRequestId: purchase.merchantRequestId }] : []),
      ...(purchase.userId && purchase.idempotencyKey ? [{ userId: purchase.userId, idempotencyKey: purchase.idempotencyKey }] : [])
    ]), ...backupLookupBranches];
  const duplicateCandidates = liveKeys.length
    ? await readMany(Purchase, { $or: liveKeys }, "_id purchaseReference userId idempotencyKey", MAX_READ_RESULTS)
    : [];
  const wrongCreditReferencePurchaseIds = new Set(livePurchases.map(purchase => asString(purchase._id)));
  const truncatedBackupKeyCandidates = backupKeyCandidates.length >= MAX_READ_RESULTS;
  const truncatedDuplicateCandidates = duplicateCandidates.length >= MAX_READ_RESULTS;
  const liveById = new Map(livePurchases.map(purchase => [asString(purchase._id), purchase]));
  const alternateByBackupId = new Map();
  for (const backup of backups) {
    const matches = backupKeyCandidates
      .filter(candidate => asString(candidate._id) !== backup._id)
      .map(purchase => ({ purchase, matchKeys: matchingBackupKeys(backup, purchase) }))
      .filter(match => match.matchKeys.length);
    alternateByBackupId.set(backup._id, matches);
  }

  const duplicatePurchaseIds = new Set();
  for (const purchase of livePurchases) {
    const ref = purchase.purchaseReference;
    const idem = `${asString(purchase.userId)}:${asString(purchase.idempotencyKey)}`;
    if (duplicateCandidates.some(candidate => asString(candidate._id) !== asString(purchase._id) && (
      (ref && candidate.purchaseReference === ref) ||
      (purchase.checkoutRequestId && candidate.checkoutRequestId === purchase.checkoutRequestId) ||
      (purchase.merchantRequestId && candidate.merchantRequestId === purchase.merchantRequestId) ||
      (purchase.idempotencyKey && `${asString(candidate.userId)}:${asString(candidate.idempotencyKey)}` === idem)
    ))) duplicatePurchaseIds.add(asString(purchase._id));
  }

  const checkoutIds = unique([
    ...backups.map(record => record.checkoutRequestId),
    ...livePurchases.map(purchase => purchase.checkoutRequestId),
    ...backupKeyCandidates.map(purchase => purchase.checkoutRequestId)
  ]);
  const merchantIds = unique([
    ...backups.map(record => record.merchantRequestId),
    ...livePurchases.map(purchase => purchase.merchantRequestId),
    ...backupKeyCandidates.map(purchase => purchase.merchantRequestId)
  ]);
  const callbackFilter = { $or: [
    ...(checkoutIds.length ? [{ checkoutRequestId: { $in: checkoutIds } }] : []),
    ...(merchantIds.length ? [{ merchantRequestId: { $in: merchantIds } }] : [])
  ] };
  const callbacks = checkoutIds.length || merchantIds.length
    ? await readMany(CallbackEvent, callbackFilter,
      "_id checkoutRequestId merchantRequestId resultCode resultDescription callbackAmountKes callbackReceipt callbackPhoneNumber transactionDate processingStatus receivedAt createdAt",
      MAX_READ_RESULTS)
    : [];

  const candidateReceipts = unique([
    ...backups.map(record => normalizeReceipt(record.mpesaReceipt)),
    ...livePurchases.map(purchase => normalizeReceipt(purchase.mpesaReceipt)),
    ...backupKeyCandidates.map(purchase => normalizeReceipt(purchase.mpesaReceipt)),
    ...callbacks.map(callback => normalizeReceipt(callback.callbackReceipt))
  ]);
  const claimBranches = [
    { referenceId: { $in: purchaseIds } },
    ...(candidateReceipts.length ? [{ receipt: { $in: candidateReceipts } }] : [])
  ];
  const claims = await readMany(ReceiptClaim, { $or: claimBranches },
    "_id receipt purpose referenceId amountKes claimedBy evidenceSource evidenceReference claimedAt createdAt",
    MAX_READ_RESULTS);

  const ledgerBranches = [
    { purchaseId: { $in: purchaseIds }, type: "purchase_credit" },
    { reference: { $in: purchaseIds.map(purchaseReferenceRegex) } },
    ...unique(livePurchases.map(purchase => asString(purchase.userId)))
      .filter(userId => OBJECT_ID_PATTERN.test(userId))
      .map(userId => ({ userId, type: "purchase_credit" }))
  ];
  const ledger = await readMany(MinuteTransaction, { $or: ledgerBranches },
    "_id userId walletId type minutes reference purchaseId description createdAt", MAX_READ_RESULTS);

  const userIds = unique([
    ...livePurchases.map(purchase => asString(purchase.userId)),
    ...backups.filter(backup => !liveById.has(backup._id)).map(backup => asString(backup.userId))
  ]).filter(userId => OBJECT_ID_PATTERN.test(userId));
  const wallets = userIds.length
    ? await readMany(MinuteWallet, { userId: { $in: userIds } },
      "_id userId availableMinutes totalPurchasedMinutes totalSpentMinutes totalRefundedMinutes updatedAt",
      MAX_BACKUP_RECORDS * 2)
    : [];

  const receiptCounts = values => {
    const counts = new Map();
    for (const receipt of values.map(normalizeReceipt).filter(Boolean)) counts.set(receipt, (counts.get(receipt) || 0) + 1);
    return counts;
  };
  const duplicateCallbackReceipts = new Set([...receiptCounts(callbacks.map(row => row.callbackReceipt))]
    .filter(([, count]) => count > 1).map(([receipt]) => receipt));
  const duplicateClaimReceipts = new Set([...receiptCounts(claims.map(row => row.receipt))]
    .filter(([, count]) => count > 1).map(([receipt]) => receipt));

  const records = purchaseIds.map(purchaseId => {
    const backup = backupById.get(purchaseId);
    const live = liveById.get(purchaseId) || null;
    const alternatePurchases = alternateByBackupId.get(purchaseId) || [];
    const recordUserId = asString(live?.userId || backup.userId);
    const wallet = wallets.find(item => asString(item.userId) === recordUserId) || null;
    const recordLedger = ledger.filter(entry =>
      (entry.type === "purchase_credit" && (
        asString(entry.purchaseId) === purchaseId || (live && asString(entry.userId) === asString(live.userId))
      )) || purchaseReferenceRegex(purchaseId).test(String(entry.reference || ""))
    );
    return makeAuditRecord({
      backup,
      live,
      alternatePurchases,
      callbacks,
      claims,
      ledger: recordLedger,
      wallet,
      backupDuplicateCount: backupCounts.get(purchaseId),
      wrongCreditReferencePurchaseIds,
      duplicatePurchaseIds,
      duplicateCallbackReceipts,
      duplicateClaimReceipts
    });
  });

  const truncated = {
    purchases: livePurchases.length >= MAX_BACKUP_RECORDS,
    backupKeyLookups: truncatedBackupKeyCandidates,
    duplicatePurchaseLookups: truncatedDuplicateCandidates,
    callbacks: callbacks.length >= MAX_READ_RESULTS,
    receiptClaims: claims.length >= MAX_READ_RESULTS,
    purchaseCreditLedgerEntries: ledger.length >= MAX_READ_RESULTS,
    wallets: wallets.length >= MAX_BACKUP_RECORDS * 2
  };
  const truncatedCollections = Object.entries(truncated).filter(([, value]) => value).map(([name]) => name);
  return {
    reportType: "primetask_transcription_minute_read_only_audit",
    generatedAt: toIso(generatedAt),
    mode: "read_only",
    sourceBackup: {
      recordCount: backups.length,
      uniquePurchaseIdCount: purchaseIds.length,
      usedFor: "purchase ID/key lookup and snapshot comparison only",
      warning: "Backup contents are not payment evidence and do not authorize a credit."
    },
    databaseAccess: {
      operations: ["bounded MongoDB find queries only"],
      writeOperationsIssued: false,
      indexCreationDisabledByRunner: true,
      safaricomQueried: false,
      readOnlyDatabaseRoleIndependentlyConfirmed: false
    },
    summary: {
      backupRecords: backups.length,
      uniquePurchaseIds: purchaseIds.length,
      livePurchasesFound: records.filter(record => record.livePurchase).length,
      livePurchasesMissing: records.filter(record => !record.livePurchase).length,
      livePurchasesMarkedVerifiedInMongoDB: records.filter(record => record.livePurchase?.paymentStatus === "verified").length,
      alreadyCreditedByPurchaseCreditLedger: records.filter(record => record.alreadyCredited).length,
      purchasesWithoutPurchaseCreditLedger: records.filter(record => !record.alreadyCredited).length,
      liveFailedOrCancelled: records.filter(record => ["failed", "cancelled"].includes(record.livePurchase?.paymentStatus)).length,
      unresolved: records.filter(record => !record.livePurchase || ["pending", "verification_required"].includes(record.livePurchase.paymentStatus)).length,
      databaseVerifiedStatusWithoutLedger: records.filter(record =>
        record.livePurchase?.paymentStatus === "verified" && !record.alreadyCredited
      ).length,
      actionRequired: records.filter(record => record.actionRequiredFlags.length || record.duplicateFlags.length).length,
      independentlyVerifiedBySafaricom: 0,
      recordsRequiringHumanReviewBeforeAnyWrite: records.length,
      truncatedCollections
    },
    records
  };
}

module.exports = { auditTranscriptionMinutePurchases, loadBackupRecords, maskPhone };