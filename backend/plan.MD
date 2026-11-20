TASK: Investigate and Fix PrimeTask Workspace Payment Unavailability

You are working on the PrimeTask Workspace project.

Project path: "~/primetask-workspace-1"

Your assignment is to independently investigate why users currently see that payments are unavailable and restore the payment functionality.

1. Investigate the complete payment system

Inspect both frontend and backend payment implementations, including:

- Daraja/M-Pesa integration.
- STK Push initiation.
- Payment callback handling.
- Callback URL configuration.
- Deposit creation and confirmation.
- Wallet crediting.
- Membership purchases.
- Transcription minutes purchases.
- Notes Points purchases.
- Data Entry bid purchases.
- Academic Writing bid purchases.
- Payment recovery workers.

2. Inspect configuration

Check:

- "DARAJA_ENV"
- "DARAJA_LIVE_ENABLED"
- "DARAJA_CONSUMER_KEY"
- "DARAJA_CONSUMER_SECRET"
- "DARAJA_SHORTCODE"
- "DARAJA_PASSKEY"
- "DARAJA_CALLBACK_URL"
- "DARAJA_TRANSACTION_TYPE"

Inspect ".env" and ".env.transcription" without exposing credentials in terminal output or reports.

Determine whether the application is accidentally using sandbox configuration, rejecting live payments, or missing required environment variables.

3. Trace the payment flow

Follow an actual payment request from:

1. User clicks Pay.
2. Frontend sends payment request.
3. Backend validates the request.
4. Backend authenticates with Daraja.
5. STK Push request is submitted.
6. Safaricom processes the request.
7. Callback reaches the backend.
8. Transaction is verified.
9. Correct wallet or purchase is credited.

Identify exactly where the process fails.

4. Inspect production compatibility

Check:

- Whether the production backend has the correct configuration.
- Whether the callback URL is publicly accessible over HTTPS.
- Whether CORS or authentication blocks payment requests.
- Whether frontend API configuration points to the correct backend.
- Whether production and local environment variables are consistent.
- Whether recent code changes introduced regressions.

Do not assume that a successful local health check means Daraja payments work.

5. Fix confirmed problems

After identifying the root cause:

- Fix the responsible frontend or backend code.
- Preserve existing payment security checks.
- Prevent duplicate callback processing.
- Preserve transaction idempotency.
- Never credit wallets before verified successful callbacks.
- Preserve existing USD financial accounting.
- Keep KES values restricted to M-Pesa payment-side records.
- Do not introduce exchange-rate conversions into wallet balances.
- Preserve existing purchase and recovery workflows.

Do not disable security checks to make payments appear available.

6. Testing

Run relevant existing tests:

"npm --prefix backend test"

Add or update tests where necessary.

Test:

- Payment initiation.
- Invalid Daraja credentials.
- Failed STK Push requests.
- Successful callbacks.
- Duplicate callbacks.
- Invalid callback data.
- Wallet crediting.
- Payment recovery.

Do not initiate real customer charges during testing.

7. Final report

Provide:

1. Exact root cause of payment unavailability.
2. Files inspected.
3. Files modified.
4. Fixes implemented.
5. Tests executed and results.
6. Whether local payments work.
7. Whether production payments are ready.
8. Any remaining Safaricom or production configuration requirements.

IMPORTANT: Investigate first, establish the actual cause, then fix it. Do not rewrite the entire payment system or modify unrelated modules. Never expose API secrets or commit changes to Git without authorization.
