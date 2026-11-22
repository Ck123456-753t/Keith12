"use strict";

const { test, before, beforeEach, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const Module = require("node:module");

const USER_ID = "111111111111111111111111";
const ROUTE_PATH = require.resolve("../src/routes/deposits");
const originalLoad = Module._load;
const originalInfo = console.info;
const envKeys = [
  "DARAJA_LIVE_ENABLED",
  "WALLET_TOPUP_MIN_KES",
  "WALLET_TOPUP_MAX_KES"
];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

let router;
let server;
let baseUrl;
let infoMessages;
let darajaCalls;

function loadRoute() {
  const routeDepositModel = {
    async deleteOne() {
      throw new Error("Disabled gate must return before database access.");
    },
    findOne() {
      throw new Error("Disabled gate must return before database access.");
    }
  };
  const routeDepositService = {
    calculateExpectedKes: cents => (cents * 130) / 100,
    async createPendingDeposit() {
      throw new Error("Disabled gate must not create a deposit.");
    },
    async completeSimulatedDeposit() {
      throw new Error("Not used in this test.");
    }
  };

  Module._load = function (request, parent, isMain) {
    if (parent?.filename === ROUTE_PATH) {
      if (request === "../models/Deposit") return routeDepositModel;
      if (request === "../middleware/requireAuth") {
        return (req, res, next) => {
          req.user = { _id: USER_ID };
          next();
        };
      }
      if (request === "../services/depositService") return routeDepositService;
      if (request === "../services/darajaService") {
        return {
          async initiateStkPush() {
            darajaCalls += 1;
            throw new Error("Disabled gate must prevent Daraja call.");
          }
        };
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[ROUTE_PATH];
    router = require(ROUTE_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

before(() => {
  loadRoute();
});

beforeEach(async () => {
  for (const key of envKeys) delete process.env[key];
  process.env.DARAJA_LIVE_ENABLED = "false";
  infoMessages = [];
  darajaCalls = 0;
  console.info = (...args) => infoMessages.push(args.join(" "));

  const app = express();
  app.use(express.json());
  app.use("/api/wallet/deposits", router);
  server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (server) {
    const currentServer = server;
    server = null;
    await new Promise((resolve, reject) => {
      currentServer.close(error => error ? reject(error) : resolve());
      currentServer.closeAllConnections?.();
    });
  }

  console.info = originalInfo;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

after(() => {
  Module._load = originalLoad;
  console.info = originalInfo;
  delete require.cache[ROUTE_PATH];
});

test("disabled wallet STK gate returns a trace ID and logs without customer data", async () => {
  const response = await fetch(`${baseUrl}/api/wallet/deposits/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "diagnostic-test-001"
    },
    body: JSON.stringify({ amount: "1.00", phoneNumber: "0712345678" })
  });

  const body = await response.json();
  const logLine = infoMessages.join(" ");

  assert.equal(response.status, 503);
  assert.equal(body.code, "DARAJA_DISABLED");
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(body.traceId, body.requestId);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.match(logLine, /stk_disabled/);
  assert.match(logLine, /feature_gate/);
  assert.doesNotMatch(logLine, /0712345678|254712345678/);
  assert.equal(darajaCalls, 0);
});