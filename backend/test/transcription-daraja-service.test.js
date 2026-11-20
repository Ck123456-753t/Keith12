"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const SERVICE_PATH = require.resolve("../src/services/transcriptionDarajaService");
const ENV_KEYS = [
  "DARAJA_ENV",
  "DARAJA_LIVE_ENABLED",
  "DARAJA_TRANSACTION_TYPE",
  "DARAJA_CONSUMER_KEY",
  "DARAJA_CONSUMER_SECRET",
  "DARAJA_SHORTCODE",
  "DARAJA_TILL_NUMBER",
  "DARAJA_PASSKEY",
  "DARAJA_CALLBACK_URL",
  "TRANSCRIPTION_DARAJA_ENV",
  "TRANSCRIPTION_DARAJA_ENABLED",
  "TRANSCRIPTION_DARAJA_TRANSACTION_TYPE",
  "TRANSCRIPTION_DARAJA_CONSUMER_KEY",
  "TRANSCRIPTION_DARAJA_CONSUMER_SECRET",
  "TRANSCRIPTION_DARAJA_SHORTCODE",
  "TRANSCRIPTION_DARAJA_TILL_NUMBER",
  "TRANSCRIPTION_DARAJA_PASSKEY",
  "TRANSCRIPTION_DARAJA_CALLBACK_URL"
];

let originalEnvironment;
let originalFetch;
let originalLoad;

function setSharedDarajaEnvironment() {
  Object.assign(process.env, {
    DARAJA_ENV: "sandbox",
    DARAJA_LIVE_ENABLED: "true",
    DARAJA_TRANSACTION_TYPE: "CustomerPayBillOnline",
    DARAJA_CONSUMER_KEY: "shared-consumer-key",
    DARAJA_CONSUMER_SECRET: "shared-consumer-secret",
    DARAJA_SHORTCODE: "174379",
    DARAJA_TILL_NUMBER: "",
    DARAJA_PASSKEY: "shared-passkey",
    DARAJA_CALLBACK_URL:
      "https://primetask-workspace.onrender.com/api/payments/daraja/callback/stk"
  });

  for (const key of ENV_KEYS.filter(name => name.startsWith("TRANSCRIPTION_"))) {
    delete process.env[key];
  }
}

function loadServiceWithoutLocalEnvFile() {
  originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "dotenv") return { config() { return {}; } };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[SERVICE_PATH];
    return require(SERVICE_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify(data); }
  };
}

describe("transcription Daraja configuration", { concurrency: false }, () => {
  beforeEach(() => {
    originalEnvironment = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]])
    );
    originalFetch = global.fetch;
    setSharedDarajaEnvironment();
  });

  afterEach(() => {
    delete require.cache[SERVICE_PATH];
    for (const key of ENV_KEYS) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
    global.fetch = originalFetch;
    Module._load = originalLoad || Module._load;
  });

  test("inherits the shared Daraja settings and initiates an STK prompt", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return calls.length === 1
        ? jsonResponse({ access_token: "shared-test-token" })
        : jsonResponse({
            ResponseCode: "0",
            MerchantRequestID: "merchant-minute-test",
            CheckoutRequestID: "ws_CO_minute_test"
          });
    };

    const result = await loadServiceWithoutLocalEnvFile().initiateStkPush({
      phoneNumber: "254712345678",
      amountKes: 650,
      accountReference: "PTW-TM-TEST-1",
      transactionDesc: "Minutes 60"
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /^https:\/\/sandbox\.safaricom\.co\.ke\/oauth\//);
    assert.equal(
      calls[0].options.headers.Authorization,
      `Basic ${Buffer.from("shared-consumer-key:shared-consumer-secret").toString("base64")}`
    );
    assert.match(calls[1].url, /\/mpesa\/stkpush\/v1\/processrequest$/);
    const payload = JSON.parse(calls[1].options.body);
    assert.equal(payload.BusinessShortCode, "174379");
    assert.equal(payload.Amount, 650);
    assert.equal(payload.CallBackURL, process.env.DARAJA_CALLBACK_URL);
    assert.equal(result.accepted, true);
    assert.equal(result.checkoutRequestId, "ws_CO_minute_test");
  });

  test("respects an explicit transcription-specific disabled override", async () => {
    process.env.TRANSCRIPTION_DARAJA_ENABLED = "false";
    let called = false;
    global.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    const result = await loadServiceWithoutLocalEnvFile().initiateStkPush({
      phoneNumber: "254712345678",
      amountKes: 650,
      accountReference: "PTW-TM-TEST-1",
      transactionDesc: "Minutes 60"
    });

    assert.equal(result.mode, "disabled");
    assert.equal(called, false);
  });
});