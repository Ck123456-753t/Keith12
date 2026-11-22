const express = require("express");
const { randomUUID } = require("crypto");

const Deposit = require("../models/Deposit");
const requireAuth = require("../middleware/requireAuth");

const {
  calculateExpectedKes,
  createPendingDeposit,
  completeSimulatedDeposit
} = require("../services/depositService");

const {
  initiateStkPush
} = require("../services/darajaService");

const router = express.Router();

router.use(requireAuth);

function paymentLog(event, details = {}) {
  const safeMessage = typeof details.message === "string"
    ? details.message.slice(0, 240)
    : null;

  console.info("Payment diagnostic:", JSON.stringify({
    event,
    requestId: details.requestId || null,
    traceId: details.traceId || null,
    stage: details.stage || null,
    httpStatus: details.httpStatus || null,
    code: details.code || null,
    providerCode: details.providerCode || null,
    message: safeMessage
  }));
}

function normalizePhoneNumber(value) {
  if (typeof value !== "string") {
    throw new Error("Enter a valid Kenyan phone number.");
  }

  const digits = value.trim().replace(/[\s()-]/g, "");

  let normalized = digits;

  if (/^0[17]\d{8}$/.test(digits)) {
    normalized = `254${digits.slice(1)}`;
  } else if (/^\+254[17]\d{8}$/.test(digits)) {
    normalized = digits.slice(1);
  }

  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new Error("Enter a valid Kenyan mobile number.");
  }

  return normalized;
}

function parseAmountCents(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new Error("Enter the deposit amount in USD.");
  }

  const text = String(value).trim();

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter a valid USD amount with up to two decimals.");
  }

  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 +
    Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) {
    throw new Error("Deposit amount is too large.");
  }

  calculateExpectedKes(cents);

  return cents;
}

function centsToUSD(cents) {
  return Number((cents / 100).toFixed(2));
}

function publicDeposit(deposit) {
  return {
    requestId: deposit.requestId,
    amount: centsToUSD(deposit.amountCents),
    currency: "USD",
    status: deposit.status,
    checkoutRequestId: deposit.checkoutRequestId || null,
    resultDescription: deposit.resultDescription || "",
    receipt: deposit.status === "completed"
      ? deposit.mpesaReceipt
      : null,
    createdAt: deposit.createdAt,
    completedAt: deposit.completedAt
  };
}

/*
 * POST /api/wallet/deposits
 *
 * Body:
 * {
 *   "amount": "1.00",
 *   "phoneNumber": "0712345678"
 * }
 *
 * Requires Idempotency-Key header.
 *
 * This endpoint never credits the wallet.
 */

// POST /api/wallet/deposits/simulate
// Development-only test endpoint. It never contacts Daraja.
router.post("/simulate", async (req, res) => {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DEPOSIT_SIMULATION_ENABLED !== "true"
  ) {
    return res.status(404).json({
      success: false,
      message: "Not found."
    });
  }

  try {
    const idempotencyKey = req.get("Idempotency-Key");

    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 100 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid Idempotency-Key header is required."
      });
    }

    const amountCents = parseAmountCents(req.body?.amount);
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    const outcome = req.body?.outcome;

    if (!["success", "failed"].includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: 'Outcome must be "success" or "failed".'
      });
    }

    const expectedAmountKes = calculateExpectedKes(amountCents);
    const minKes = Number(process.env.WALLET_TOPUP_MIN_KES);
    const maxKes = Number(process.env.WALLET_TOPUP_MAX_KES);

    if (
      (Number.isSafeInteger(minKes) && minKes > 0 &&
        expectedAmountKes < minKes) ||
      (Number.isSafeInteger(maxKes) && maxKes > 0 &&
        expectedAmountKes > maxKes)
    ) {
      return res.status(400).json({
        success: false,
        message: "Deposit amount is outside the configured limits."
      });
    }

    const requestId = `DP-${randomUUID()}`;
    const created = await createPendingDeposit({
      requestId,
      idempotencyKey,
      userId: req.user._id,
      amountCents,
      phoneNumber,
      paymentMode: "simulation"
    });

    if (!created.created) {
      return res.status(200).json({
        success: true,
        simulated: true,
        reused: true,
        message: "Existing simulation returned; its outcome was not changed.",
        deposit: created.deposit
      });
    }

    const result = await completeSimulatedDeposit({
      requestId: created.deposit.requestId,
      outcome
    });

    return res.status(201).json({
      success: true,
      simulated: true,
      message: "Local simulation completed. No M-Pesa payment occurred.",
      deposit: result
    });
  } catch (error) {
    if (/Idempotency key was already used/.test(error.message)) {
      return res.status(409).json({
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        message: error.message
      });
    }

    console.error("Deposit simulation error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Deposit simulation failed."
    });
  }
});

router.post("/", async (req, res) => {
  const traceId = randomUUID();

  res.set("X-Request-Id", traceId);

  try {
    const idempotencyKey = req.get("Idempotency-Key");

    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 100 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid Idempotency-Key header is required."
      });
    }

    const amountCents = parseAmountCents(req.body?.amount);
    const phoneNumber = normalizePhoneNumber(
      req.body?.phoneNumber
    );

    const expectedAmountKes = calculateExpectedKes(amountCents);

    const minKes = Number(process.env.WALLET_TOPUP_MIN_KES);
    const maxKes = Number(process.env.WALLET_TOPUP_MAX_KES);

    if (
      Number.isSafeInteger(minKes) &&
      minKes > 0 &&
      expectedAmountKes < minKes
    ) {
      return res.status(400).json({
        success: false,
        message: "Deposit amount is below the minimum allowed."
      });
    }

    if (
      Number.isSafeInteger(maxKes) &&
      maxKes > 0 &&
      expectedAmountKes > maxKes
    ) {
      return res.status(400).json({
        success: false,
        message: "Deposit amount exceeds the maximum allowed."
      });
    }

    /*
     * Do not create a pending deposit when STK initiation
     * is disabled. This avoids leaving new, unusable records.
     */
    if (process.env.DARAJA_LIVE_ENABLED !== "true") {
      paymentLog("stk_disabled", {
        traceId,
        stage: "feature_gate",
        message: "DARAJA_LIVE_ENABLED is not exactly true."
      });

      return res.status(503).json({
        success: false,
        code: "DARAJA_DISABLED",
        message: "STK payments are temporarily unavailable. Check the backend payment configuration.",
        requestId: traceId,
        traceId
      });
    }

    // Enforce expiry immediately, without waiting for MongoDB's TTL monitor.
    // Only accepted Daraja requests with an elapsed expiry are eligible.
    await Deposit.deleteOne({
      userId: req.user._id,
      idempotencyKey,
      paymentMode: "daraja",
      status: "pending",
      expiresAt: { $type: "date", $lte: new Date() }
    });

    const existing = await Deposit.findOne({
      userId: req.user._id,
      idempotencyKey
    }).lean();

    if (existing) {
      if (
        existing.amountCents !== amountCents ||
        existing.phoneNumber !== phoneNumber ||
        existing.paymentMode !== "daraja"
      ) {
        return res.status(409).json({
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          message:
            "This idempotency key was already used with different deposit details. Use a new key for a new request."
        });
      }

      return res.status(200).json({
        success: true,
        reused: true,
        message: "This deposit request already exists. No new STK prompt was sent.",
        deposit: publicDeposit(existing)
      });
    }

    const requestId = `DP-${randomUUID()}`;

    const created = await createPendingDeposit({
      requestId,
      idempotencyKey,
      userId: req.user._id,
      amountCents,
      phoneNumber
    });

    /*
     * Another concurrent request may have created this
     * idempotency key. Never initiate a second STK prompt.
     */
    if (!created.created) {
      return res.status(200).json({
        success: true,
        reused: true,
        message: "This deposit request already exists. No new STK prompt was sent.",
        deposit: publicDeposit(created.deposit)
      });
    }

    const deposit = created.deposit;

    paymentLog("stk_initiation_started", {
      requestId: deposit.requestId,
      traceId,
      stage: "stk_push"
    });

    let stkResult;

    try {
      stkResult = await initiateStkPush({
        phoneNumber,
        amountKes: expectedAmountKes,
        accountReference: requestId,
        transactionDesc: "PTW wallet deposit"
      });
    } catch (error) {
      /*
       * A timeout may occur after Safaricom accepts a request.
       * Keep the deposit pending and never retry automatically.
       */
      await Deposit.updateOne(
        { _id: deposit._id, status: "pending" },
        {
          $set: {
            resultDescription:
              "STK initiation outcome is uncertain. Reconciliation is required before retrying."
          }
        }
      );

      const providerError = error.providerResponse || {};

      paymentLog("stk_initiation_error", {
        requestId: deposit.requestId,
        traceId,
        stage: error.stage || "unknown",
        code: error.code || null,
        httpStatus: error.statusCode || null,
        providerCode:
          providerError.errorCode || providerError.error || providerError.code || null,
        message:
          providerError.errorMessage ||
          providerError.error_description ||
          providerError.message ||
          error.message ||
          null
      });

      return res.status(202).json({
        success: true,
        deposit: {
          requestId,
          amount: centsToUSD(amountCents),
          currency: "USD",
          status: "pending"
        },
        message: "Payment initiation requires status reconciliation. Do not submit another payment request.",
        requestId: traceId,
        traceId
      });
    }

    if (!stkResult.accepted) {
      paymentLog("stk_provider_rejected", {
        requestId: deposit.requestId,
        traceId,
        stage: "stk_response",
        providerCode: stkResult.responseCode || null,
        message: stkResult.responseDescription || stkResult.customerMessage || null
      });

      await Deposit.updateOne(
        { _id: deposit._id, status: "pending" },
        {
          $set: {
            status: "failed",
            resultDescription:
              stkResult.responseDescription ||
              "Daraja did not accept the STK request."
          }
        }
      );

      return res.status(502).json({
        success: false,
        message: "Daraja did not accept the payment request.",
        requestId: traceId,
        traceId,
        deposit: {
          requestId,
          status: "failed"
        }
      });
    }

    if (
      !stkResult.checkoutRequestId ||
      !stkResult.merchantRequestId
    ) {
      await Deposit.updateOne(
        { _id: deposit._id, status: "pending" },
        {
          $set: {
            resultDescription:
              "Daraja response is missing request identifiers. Reconciliation is required."
          }
        }
      );

      return res.status(202).json({
        success: true,
        message: "Payment request needs reconciliation.",
        requestId: traceId,
        traceId,
        deposit: {
          requestId,
          status: "pending"
        }
      });
    }

    const updated = await Deposit.findOneAndUpdate(
      {
        _id: deposit._id,
        status: "pending"
      },
      {
        $set: {
          merchantRequestId: stkResult.merchantRequestId,
          checkoutRequestId: stkResult.checkoutRequestId,
          expiresAt: new Date(Date.now() + 180 * 1000),
          resultDescription:
            stkResult.customerMessage ||
            stkResult.responseDescription ||
            "STK request accepted. Awaiting verified payment."
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    );

    if (!updated) {
      paymentLog("stk_accepted_reconciliation_required", {
        requestId: deposit.requestId,
        traceId,
        stage: "database_persist_identifiers",
        providerCode: stkResult.responseCode
      });

      return res.status(202).json({
        success: true,
        message: "Payment was initiated, but deposit status needs reconciliation.",
        requestId: traceId,
        traceId,
        deposit: {
          requestId,
          status: "pending"
        }
      });
    }

    paymentLog("stk_accepted", {
      requestId: deposit.requestId,
      traceId,
      stage: "stk_response",
      providerCode: stkResult.responseCode
    });

    return res.status(202).json({
      success: true,
      message: "STK request accepted. Wallet credit awaits independent payment verification.",
      deposit: publicDeposit(updated),
      requestId: traceId,
      traceId
    });
  } catch (error) {
    if (
      error.message &&
      (
        error.message.includes("Deposit amount") ||
        error.message.includes("USD amount") ||
        error.message.includes("Kenyan") ||
        error.message.includes("phone number") ||
        error.message.includes("normalized") ||
        error.message.includes("Invalid deposit") ||
        error.message.includes("Idempotency key")
      )
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A deposit request with these details already exists. Check deposit status before trying again."
      });
    }

    paymentLog("deposit_request_failed", {
      traceId,
      stage: "deposit_request",
      code: error.code || null,
      message: error.message || "Unknown deposit request error."
    });

    return res.status(500).json({
      success: false,
      message: "Could not create the deposit request.",
      requestId: traceId,
      traceId
    });
  }
});

/*
 * GET /api/wallet/deposits/:requestId
 *
 * A user can only retrieve their own deposit.
 */
router.get("/:requestId", async (req, res) => {
  try {
    const requestId = req.params.requestId;

    if (
      typeof requestId !== "string" ||
      !/^DP-[0-9a-f-]{36}$/i.test(requestId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit request ID."
      });
    }

    const deposit = await Deposit.findOne({
      requestId,
      userId: req.user._id
    }).lean();

    if (
      deposit &&
      deposit.status === "pending" &&
      deposit.expiresAt instanceof Date &&
      deposit.expiresAt <= new Date()
    ) {
      await Deposit.deleteOne({
        _id: deposit._id,
        status: "pending",
        expiresAt: { $lte: new Date() }
      });

      return res.status(404).json({
        success: false,
        message: "This unpaid deposit request expired and was deleted. Start a fresh payment."
      });
    }

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found."
      });
    }

    return res.json({
      success: true,
      deposit: publicDeposit(deposit)
    });
  } catch (error) {
    console.error("Deposit status error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve deposit status."
    });
  }
});

module.exports = router;
