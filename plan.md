PRIME TASK WORKSPACE: PRODUCTION ENDGAME

Device Transfer Administration + Complete M-Pesa Payment Initiation Recovery

You are working inside the existing PrimeTask Workspace repository:

"~/primetask-workspace-1"

Your assignment is to audit, repair, test, and prepare the entire platform for production.

This is an implementation task, not merely an audit or a list of recommendations.

Do not stop after identifying problems. Fix them, run tests, and provide evidence of successful implementation.

PART 1: DEVICE TRANSFER MANAGEMENT

Implement and verify the existing administrator-controlled device-transfer workflow.

Requirements:

1. Find the device-transfer model, routes, controllers, middleware, and services.
2. Inspect all existing pending device-transfer requests in MongoDB.
3. Identify their account, old device, proposed new device, status, creation date, and security information.
4. Verify that each request is legitimate and eligible for approval.
5. Approve all eligible pending requests through the existing backend approval service or authenticated administrator API.
6. Never approve suspicious, incomplete, expired, or invalid requests automatically.
7. Preserve the existing device identity and registration safeguards.
8. Never revoke an old device before the new device registration has completed successfully.
9. Record every approval in security events and maintain an audit trail.
10. Ensure users cannot approve their own device transfers.
11. Ensure future device transfers still require administrator approval.

Do not directly change MongoDB status fields to simulate approval. Use the actual approval workflow.

Report:

- Number of pending requests found.
- Number approved.
- Number rejected or requiring further review.
- Confirmation of old-device and new-device registration states.

PART 2: COMPLETE DAR AJA / M-PESA PAYMENT RECOVERY

The following user-facing error has occurred:

"A previous M-Pesa payment is still awaiting confirmation. Do not start another payment."

Another observed error:

"The purchase was recorded, but M-Pesa initiation is disabled. No payment prompt was requested. Check your purchase status before trying again."

Investigate the actual cause. Do not suppress these messages or bypass transaction protection.

A. Audit every payment initiation flow

Inspect:

- Main wallet deposits.
- Membership purchases.
- Transcription minutes purchases.
- Notes Points purchases.
- Data Entry bid purchases.
- Academic Writing bid purchases.
- Any marketing dashboard purchases or payment initiation workflows.

Identify every frontend payment initiation endpoint and its corresponding backend controller.

Trace each payment from:
Frontend → Backend API → Purchase record → Daraja OAuth → STK Push → Callback → Transaction verification → Wallet credit or purchase completion.

B. Daraja configuration

Inspect environment variable loading and configuration validation.

Verify:

- DARAJA_CONSUMER_KEY
- DARAJA_CONSUMER_SECRET
- DARAJA_SHORTCODE
- DARAJA_PASSKEY
- DARAJA_CALLBACK_URL
- DARAJA_TRANSACTION_TYPE
- Daraja environment (sandbox or production).

Check for:

- Incorrect variable names.
- Missing production variables.
- Incorrect callback URL.
- Incorrect API base URL.
- Invalid STK password generation.
- Timestamp formatting problems.
- OAuth token failures.
- Incorrect transaction type.
- Duplicate or conflicting configuration sources.
- Incorrect .env loading order.

Never print secrets in logs or reports.

C. Fix the pending-payment problem

Investigate why an earlier M-Pesa transaction remains pending.

Inspect:

- Deposit records.
- MembershipPurchase records.
- TranscriptionMinutePurchase records.
- NotesPointsPurchase records.
- DataEntryBidPurchase records.
- AcademicBidPurchase records.
- DarajaCallbackEvent records.

Find transactions stuck in pending or initiation states.

Implement safe reconciliation:

1. Determine whether an STK request was actually sent.
2. Recover its CheckoutRequestID and MerchantRequestID.
3. Check whether a callback was received.
4. Verify callback authenticity and transaction status.
5. Use Daraja transaction-status querying where supported and correctly configured.
6. Handle missing, delayed, duplicated, failed, cancelled, and successful callbacks.
7. Prevent duplicate payment initiation for an already active transaction.
8. Prevent duplicate wallet credits.
9. Allow a new payment only when the previous transaction has been conclusively resolved according to its state.

Never mark a payment successful without verified payment evidence.

Never automatically credit a wallet merely because an STK request returned successfully.

D. Repair STK Push initiation

Make sure the backend:

- Obtains a valid Daraja OAuth token.
- Generates the correct STK password.
- Sends a correctly formatted STK Push request.
- Uses the correct phone number format.
- Uses the correct amount and shortcode.
- Stores Daraja request identifiers.
- Handles timeout and network errors safely.
- Returns accurate, actionable responses to the frontend.

Do not disable payment initiation as a workaround.

E. Callback handling

Verify the production callback:

"/api/payments/daraja/callback/stk"

The complete callback URL must use the actual deployed backend hostname.

Ensure:

- The callback is publicly reachable.
- The callback handler parses the correct Daraja payload.
- Successful payments are verified before fulfillment.
- Failed and cancelled transactions remain unpaid.
- Duplicate callbacks are idempotent.
- Callback events are stored for reconciliation.
- No callback can credit the same purchase twice.

F. Marketing dashboard payment initiation

Specifically inspect the marketing dashboard and every purchase/payment component it uses.

Make sure:

- The payment button is connected to the correct backend endpoint.
- The frontend sends the correct purchase ID and phone number.
- The backend creates or retrieves the correct purchase record.
- Daraja STK Push is actually initiated.
- The user receives accurate payment status.
- Pending transactions are not duplicated.
- Successful payment is reflected in the correct wallet or entitlement.
- Failed payment does not incorrectly activate a service.

Identify whether marketing purchases use an existing payment service or need a dedicated integration. Reuse existing payment infrastructure wherever appropriate.

Do not invent a marketing purchase model or endpoint if one already exists.

PART 3: CURRENCY AND ACCOUNTING RULES

Preserve existing PrimeTask financial rules:

- All platform earnings, prices, balances, commissions, and withdrawals are stored and displayed in USD.
- KES is used only for the M-Pesa payment-side fields and withdrawal payout snapshots.
- Do not introduce automatic exchange-rate conversions into the platform UI or accounting.
- Do not alter existing wallet balances or historical transactions during repairs.
- Do not credit any wallet without verified payment evidence.
- Membership purchases must continue using the existing wallet-purchase workflow where applicable.

PART 4: TESTING

Run the complete backend test suite:

"npm --prefix backend test"

Add or update tests for:

- Daraja OAuth.
- STK Push initiation.
- Missing configuration.
- Invalid phone numbers.
- Pending transaction protection.
- Duplicate initiation.
- Callback verification.
- Duplicate callback handling.
- Successful payment fulfillment.
- Failed and cancelled payments.
- Wallet credit idempotency.
- Device-transfer approval authorization.
- Device-transfer registration safeguards.
- Marketing dashboard payment initiation.

Test frontend integration against the actual backend API.

Do not use fake successful responses or mock payment success as proof of production readiness.

Sandbox testing is acceptable for integration testing, but clearly distinguish sandbox results from verified production results.

PART 5: SECURITY AND DEPLOYMENT

- Never expose secrets.
- Never disable authentication, authorization, CSRF protection, or payment verification.
- Never weaken device registration security.
- Never delete transaction history.
- Never reset production databases.
- Never overwrite production environment variables blindly.
- Never change financial accounting rules.
- Preserve existing working features.
- Make backups before modifying important files.
- Do not commit or push to GitHub unless explicitly authorized.

Inspect the actual production deployment configuration and identify missing environment variables.

After implementation:

1. Run backend tests.
2. Run syntax checks.
3. Test relevant frontend flows.
4. Verify local backend health.
5. Verify production backend health.
6. Verify callback endpoint accessibility.
7. Report any tests that require real Daraja credentials or a real M-Pesa device.
8. Do not claim production success without actual evidence.

FINAL DELIVERABLE

Produce a detailed report containing:

1. Root cause of the M-Pesa initiation failure.
2. Files changed.
3. Device-transfer approval results.
4. Daraja configuration findings.
5. Pending transaction reconciliation results.
6. Marketing dashboard payment initiation results.
7. Tests passed and failed.
8. Production environment variables requiring attention.
9. Remaining deployment actions.
10. Exact commands needed to deploy and verify the production release.

The final objective is a fully functioning PrimeTask Workspace payment system, with reliable M-Pesa STK Push initiation, verified callbacks, correct purchase fulfillment, safe transaction recovery, and secure administrator-controlled device transfers.

Do not stop at an audit. Implement the fixes and demonstrate the results.





Device transfers All legitimate pending requests processed through admin approval. Daraja 
OAuth Production credentials successfully authenticate. STK Push A real M-Pesa prompt reaches 
the user's phone. Callback Payment result is received and verified. Wallet fulfillment Correct 
purchase is fulfilled exactly once. Pending recovery Old pending payments are reconciled 
without duplicate charges. Marketing dashboard Purchase and payment initiation work end to 
end. Financial integrity USD accounting and KES payment-side rules remain intact. Regression 
tests
Existing backend tests and new payment tests pass.
