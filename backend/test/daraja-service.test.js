"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const SERVICE_PATH = require.resolve("../src/services/darajaService");
const ENV_KEYS = [
  "DARAJA_ENV",
  "DARAJA_LIVE_ENABLED",
  "DARAJA_TRANSACTION_TYPE",
  "DARAJA_CONSUMER_KEY",
  "DARAJA_CONSUMER_SECRET",
  "DARAJA_SHORTCODE",
  "DARAJA_TILL_NUMBER",
  "DARAJA_PASSKEY",
  "DARAJA_CALLBACK_URL"
];

let originalEnvironment;
let originalFetch;

function setTestEnvironment(overrides = {}) {
  Object.assign(process.env, {
    DARAJA_ENV: "sandbox",
    DARAJA_LIVE_ENABLED: "true",
    DARAJA_TRANSACTION_TYPE: "CustomerPayBillOnline",
    DARAJA_CONSUMER_KEY: "test-consumer-key",
    DARAJA_CONSUMER_SECRET: "test-consumer-secret",
    DARAJA_SHORTCODE: "174379",
    DARAJA_TILL_NUMBER: "",
    DARAJA_PASSKEY: "test-passkey",
    DARAJA_CALLBACK_URL:
      "https://primetask-workspace.onrender.com/api/payments/daraja/callback/stk",
    ...overrides
  });
}

function loadService() {
  delete require.cache[SERVICE_PATH];
  return require(SERVICE_PATH);
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(data);
    }
  };
}

describe("Daraja STK initiation service", { concurrency: false }, () => {
  beforeEach(() => {
    originalEnvironment = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]])
    );
    originalFetch = global.fetch;
    setTestEnvironment();
    global.fetch = async () => {
      throw new Error("Unexpected Daraja network request in test.");
    };
  });

  afterEach(() => {
    delete require.cache[SERVICE_PATH];
    for (const key of ENV_KEYS) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
    global.fetch = originalFetch;
  });

  test("requests OAuth then sends a correctly formed STK Push", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });

      if (calls.length === 1) {
        return jsonResponse({ access_token: "sandbox-access-token" });
      }

      return jsonResponse({
        ResponseCode: "0",
        MerchantRequestID: "merchant-test-1",
        CheckoutRequestID: "ws_CO_test123",
        CustomerMessage: "STK prompt sent"
      });
    };

    const result = await loadService().initiateStkPush({
      phoneNumber: "254712345678",
      amountKes: 130,
      accountReference: "PTW-TEST-123456789",
      transactionDesc: "Wallet deposit"
    });

    assert.equal(calls.length, 2);
    assert.match(
      calls[0].url,
      /^https:\/\/sandbox\.safaricom\.co\.ke\/oauth\/v1\/generate\?grant_type=client_credentials$/
    );
    assert.equal(
      calls[0].options.headers.Authorization,
      `Basic ${Buffer.from("test-consumer-key:test-consumer-secret").toString("base64")}`
    );
    assert.match(
      calls[1].url,
      /^https:\/\/sandbox\.safaricom\.co\.ke\/mpesa\/stkpush\/v1\/processrequest$/
    );
    assert.equal(
      calls[1].options.headers.Authorization,
      "Bearer sandbox-access-token"
    );

    const payload = JSON.parse(calls[1].options.body);
    assert.equal(payload.BusinessShortCode, "174379");
    assert.equal(payload.TransactionType, "CustomerPayBillOnline");
    assert.equal(payload.Amount, 130);
    assert.equal(payload.PartyA, "254712345678");
    assert.equal(payload.PartyB, "174379");
    assert.equal(payload.PhoneNumber, "254712345678");
    assert.equal(
      payload.CallBackURL,
      "https://primetask-workspace.onrender.com/api/payments/daraja/callback/stk"
    );
    assert.equal(payload.AccountReference, "PTW-TEST-123");
    assert.equal(payload.TransactionDesc, "Wallet deposi");
    assert.match(payload.Timestamp, /^\d{14}$/);
    assert.equal(
      Buffer.from(payload.Password, "base64").toString("utf8"),
      `174379test-passkey${payload.Timestamp}`
    );
    assert.equal(result.mode, "live");
    assert.equal(result.accepted, true);
    assert.equal(result.checkoutRequestId, "ws_CO_test123");
    assert.equal(result.merchantRequestId, "merchant-test-1");
  });

  test("does not contact Daraja when initiation is disabled", async () => {
    setTestEnvironment({ DARAJA_LIVE_ENABLED: "false" });
    let called = false;
    global.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    const result = await loadService().initiateStkPush({
      phoneNumber: "254712345678",
      amountKes: 130,
      accountReference: "PTW-TEST",
      transactionDesc: "Test"
    });

    assert.equal(result.mode, "disabled");
    assert.equal(result.accepted, false);
    assert.equal(called, false);
  });

  test("rejects missing configuration before requesting OAuth", async () => {
    setTestEnvironment({ DARAJA_PASSKEY: "" });
    let called = false;
    global.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    await assert.rejects(
      loadService().initiateStkPush({
        phoneNumber: "254712345678",
        amountKes: 130,
        accountReference: "PTW-TEST",
        transactionDesc: "Test"
      }),
      /credentials are not fully configured/
    );
    assert.equal(called, false);
  });

  test("rejects invalid phone numbers before requesting OAuth", async () => {
    let called = false;
    global.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    await assert.rejects(
      loadService().initiateStkPush({
        phoneNumber: "0712345678",
        amountKes: 130,
        accountReference: "PTW-TEST",
        transactionDesc: "Test"
      }),
      /Invalid Kenyan phone number/
    );
    assert.equal(called, false);
  });

  test("does not report an STK prompt when OAuth returns no access token", async () => {
    global.fetch = async () => jsonResponse({ error: "invalid_client" });

    await assert.rejects(
      loadService().initiateStkPush({
        phoneNumber: "254712345678",
        amountKes: 130,
        accountReference: "PTW-TEST",
        transactionDesc: "Test"
      }),
      /did not return an access token/
    );
  });
});