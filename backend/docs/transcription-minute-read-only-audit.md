# Transcription-minute read-only recovery audit

## Safety boundary

This utility is an investigation aid, not a payment verifier or a recovery/credit tool. It reads purchase IDs from the failed-purchase backup only to select records and compare snapshots. Backup data, Daraja callback payloads, stored receipt claims, database status, and wallet/ledger state are **not** independent evidence that Safaricom settled a payment.

The runner:

- Requires `MONGODB_READ_ONLY_URI`; it deliberately does not fall back to `MONGODB_URI`.
- Does not load application/Daraja `.env` files or request payment-provider credentials.
- Requires that URI to authenticate as a database-enforced read-only principal. The utility cannot independently establish the permissions attached to that principal; verify them with the database administrator before execution.
- Disables Mongoose automatic index and collection creation before loading models.
- Connects with primary read preference, majority query read concern, a single connection, and a 10-second server selection timeout.
- Runs bounded MongoDB `find` queries only; it has no payment-provider client, no STK flow, and no update/create/delete calls.
- Does not log environment values, connection strings, raw phone numbers, or raw driver errors. Phone numbers are masked in output.
- Exits without a report if a dedicated read-only URI or backup is unavailable.

Run from the backend directory after privately configuring a least-privilege read-only MongoDB URI:

```sh
MONGODB_READ_ONLY_URI='(set privately; do not paste into logs)' \
MINUTE_PURCHASE_AUDIT_BACKUP='/storage/emulated/0/Download/primetask-backups/failed-minute-purchases-backup-2026-11-20T08-20-00-535Z.json' \
node scripts/audit-transcription-minute-purchases.js > /secure/location/minute-purchase-audit.json
```

Prefer loading the URI from a protected environment/secret manager rather than putting it directly in a shell command line. Store the report only in an access-controlled location: it contains internal purchase IDs, receipt candidates, callback IDs, and transaction evidence references.

## JSON report contract

Top-level keys:

- `reportType`, `generatedAt`, `mode`: report identity and timestamp; mode is always `read_only`.
- `sourceBackup`: number of snapshot rows and unique IDs, source file basename when run by the CLI, and an explicit warning that the backup is not evidence.
- `databaseAccess`: read-only operation declaration, index-creation setting, source environment-variable name, database name, Safaricom query status, and whether read-only role permissions were independently confirmed (always false; an operator must confirm permissions outside this script).
- `summary`: counts for live/missing purchases, existing purchase-credit ledger rows, failed/cancelled statuses, records requiring review, and any read-result truncation.
- `records[]`: one item per unique backup purchase ID.

Each record includes:

- `purchaseId`, `classification`, and the current `livePurchase` status, references, expected payment facts and verification fields (phone masked). `database_verified_status_without_credit_ledger_action_required` means only that MongoDB says `verified`; it does not mean Safaricom independently verified payment.
- `backupSnapshot` and `backupPaymentMismatchFields`. Snapshot fields are explicitly labeled as lookup/comparison only.
- All matching `callbackEvents`, including result, amount, receipt candidate, masked callback phone, processing state, and match basis. Each is marked untrusted callback metadata.
- `receiptClaims` matched by purchase reference or receipt candidate, with owner/purpose/amount/evidence-reference fields.
- `purchaseCreditLedgerEntries`, `creditLedgerEntryCount`, and `alreadyCredited`. A purchase-credit row indicates an existing ledger credit; it does not prove payment settlement and must not be credited again. For a live user's wallet reconciliation, bounded purchase-credit entries for that user are included so wallet totals are not compared against just the 18 selected purchases.
- `wallet` balances are looked up using the live purchase user ID, or—only when the live purchase is absent—the backup user ID as a lookup key. Backup user data is never treated as payment evidence.
- `duplicateFlags`, `actionRequiredFlags`, and a warning that these database records do not independently prove settlement.
- `paymentDetailMismatches`: explicit callback/claim/ledger-vs-live mismatch items.

`independentlyVerifiedBySafaricom` is always `false`; no Safaricom API or portal is queried by this tool. Any collection listed in `summary.truncatedCollections` makes the relevant part of the report incomplete and requires a separately reviewed, read-only follow-up query before conclusions.

## Safaricom evidence required for human review

Before considering any status change or credit, an authorized reviewer must obtain independent evidence directly from the Safaricom M-Pesa Business portal or an authenticated Safaricom statement/export for the merchant account. For each proposed match, preserve the original export/document securely and record a non-secret evidence reference and verifier. Match at minimum:

1. Safaricom transaction/receipt code (exactly, unique and not already claimed for any PrimeTask payment purpose).
2. Successful/completed transaction status—not an STK checkout acceptance, timeout, callback code, screenshot alone, or checkout ID.
3. Exact settled amount in KSh against the live purchase's `expectedAmountKes`.
4. Transaction date/time compatible with the live STK initiation and callback record.
5. Paybill/till/merchant account receiving the funds.
6. Payer phone/account where available, reconciled to the live purchase's masked phone; resolve any mismatch rather than assuming it.
7. Evidence that the same receipt was not refunded, reversed, duplicated, or claimed by another payment/purchase.

Callback fields, callback result codes and callback receipts are useful for locating a transaction, but are untrusted callback metadata. Provider checkout-query success alone is not the Safaricom statement/portal evidence required for a manual recovery decision. A backup-only receipt or checkout identifier is never sufficient.

## Stop for review

This project change introduces no production write path and makes no purchase/status/ledger/wallet mutations. Do not extend or run a credit action until the completed read-only report and independent Safaricom evidence for every proposed payment have been reviewed and approved by an authorized human. Any subsequent production write/recovery execution and deployment require a separate explicit authorization and a separate change review.