#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const DEFAULT_BACKUP_PATH = "/storage/emulated/0/Download/primetask-backups/failed-minute-purchases-backup-2026-11-20T08-20-00-535Z.json";

async function main() {
  // Read only the explicitly supplied read-only URI from the process
  // environment. Do not load general app/Daraja .env files or provider secrets.
  const mongoose = require("mongoose");
  // Disable automatic index and collection creation before importing models.
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);

  const backupPath = path.resolve(
    process.env.MINUTE_PURCHASE_AUDIT_BACKUP || DEFAULT_BACKUP_PATH
  );
  const databaseUri = process.env.MONGODB_READ_ONLY_URI;
  if (!databaseUri) {
    throw new Error("A dedicated MongoDB read-only connection is not configured.");
  }

  const backupRecords = JSON.parse(await fs.readFile(backupPath, "utf8"));
  const {
    auditTranscriptionMinutePurchases
  } = require("../src/services/transcriptionMinuteReadOnlyAudit");
  const Purchase = require("../src/models/TranscriptionMinutePurchase");
  const CallbackEvent = require("../src/models/DarajaCallbackEvent");
  const ReceiptClaim = require("../src/models/MpesaReceiptClaim");
  const MinuteTransaction = require("../src/models/TranscriptionMinuteTransaction");
  const MinuteWallet = require("../src/models/TranscriptionMinuteWallet");

  try {
    await mongoose.connect(databaseUri, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 1,
      readPreference: "primary",
      readConcern: { level: "majority" },
      autoEncryption: undefined,
      monitorCommands: false
    });

    const report = await auditTranscriptionMinutePurchases({
      backupRecords,
      Purchase,
      CallbackEvent,
      ReceiptClaim,
      MinuteTransaction,
      MinuteWallet
    });
    report.sourceBackup.path = path.basename(backupPath);
    report.databaseAccess.connectionSource = "MONGODB_READ_ONLY_URI";
    report.databaseAccess.databaseName = mongoose.connection.name || null;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    // Intentionally omit exception text: MongoDB driver errors can include the
    // URI, host details, or other sensitive connection metadata.
    process.stderr.write("Read-only minute-purchase audit failed. Configure MONGODB_READ_ONLY_URI with a database-enforced read-only account and check the backup path privately. No database write was issued by this utility.\n");
    process.exitCode = 1;
  });
}

module.exports = { main };