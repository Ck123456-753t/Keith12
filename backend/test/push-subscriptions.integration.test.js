"use strict";

require("dotenv").config();

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const testUri = process.env.PTW_TEST_MONGODB_URI;
const enabled = Boolean(testUri);

process.env.JWT_SECRET =
  process.env.PTW_TEST_JWT_SECRET ||
  "ptw-v3-push-integration-test-secret-only";

const User = require("../src/models/User");
const Device = require("../src/models/Device");
const DeviceRegistration = require("../src/models/DeviceRegistration");
const PushSubscription = require("../src/models/PushSubscription");

const { createDeviceCredential } =
  require("../src/services/deviceCredentialService");

const pushSubscriptionsRoutes =
  require("../src/routes/pushSubscriptions");

const TEST_VAPID_PUBLIC_KEY =
  "B".repeat(80);

const originalVapidPublicKey = process.env.VAPID_PUBLIC_KEY;

let server;
let baseUrl;
let testUsers = [];
let testDeviceCredentials = new Map();

function makeToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      sv: Number(user.sessionVersion || 0)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
      issuer: "primetask-workspace",
      audience: "primetask-workspace-users"
    }
  );
}

function cookieFor(user) {
  const credential = testDeviceCredentials.get(String(user._id));

  if (!credential) {
    throw new Error(`Missing test device credential for ${user.username}`);
  }

  return `ptw_session=${makeToken(user)}; ptw_device=${credential}`;
}

async function request(path, user, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(user ? { Cookie: cookieFor(user) } : {}),
    ...options.headers
  };

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  return {
    response,
    body: await response.json()
  };
}

async function createUser(username) {
  const number = testUsers.length + 1;

  const user = await User.create({
    firstName: `PushTest${number}`,
    lastName: "Integration",
    username,
    email: `${username}@example.test`,
    phone: `+254711${String(number).padStart(6, "0")}`,
    passwordHash: "integration-test-hash-not-used-for-login",
    role: "user",
    status: "active",
    sessionVersion: 0
  });

  const credential = createDeviceCredential();

  const device = await Device.create({
    deviceKeyHash: credential.hash,
    status: "active",
    deviceLabel: `Push integration device ${number}`,
    registeredAt: new Date(),
    lastSeenAt: new Date()
  });

  await DeviceRegistration.create({
    userId: user._id,
    deviceId: device._id,
    status: "active",
    registeredAt: new Date(),
    lastSeenAt: new Date()
  });

  testUsers.push(user);
  testDeviceCredentials.set(String(user._id), credential.credential);

  return user;
}

function validSubscription(endpoint = `https://push.example.test/${crypto.randomUUID()}`) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: "A".repeat(65),
      auth: "B".repeat(24)
    }
  };
}

before(async () => {
  if (!enabled) return;

  let databaseName;

  try {
    databaseName = decodeURIComponent(
      new URL(testUri).pathname.replace(/^\/+/, "")
    );
  } catch {
    throw new Error("PTW_TEST_MONGODB_URI must be a valid MongoDB URI.");
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      "Safety stop: push integration tests require a database name containing 'test'."
    );
  }

  await mongoose.connect(testUri, {
    serverSelectionTimeoutMS: 10000
  });

  await Promise.all([
    User.init(),
    Device.init(),
    DeviceRegistration.init(),
    PushSubscription.init()
  ]);

  process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC_KEY;

  const app = express();
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());
  app.use("/api/notifications/push", pushSubscriptionsRoutes);

  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  if (!enabled || mongoose.connection.readyState !== 1) return;

  await Promise.all([
    PushSubscription.deleteMany({}),
    DeviceRegistration.deleteMany({}),
    Device.deleteMany({}),
    User.deleteMany({ username: /^push_test_/ })
  ]);

  testUsers = [];
  testDeviceCredentials = new Map();
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (mongoose.connection.readyState === 1) {
    await Promise.all([
      PushSubscription.deleteMany({}),
      DeviceRegistration.deleteMany({}),
      Device.deleteMany({}),
      User.deleteMany({ username: /^push_test_/ })
    ]);

    await mongoose.disconnect();
  }

  if (originalVapidPublicKey === undefined) {
    delete process.env.VAPID_PUBLIC_KEY;
  } else {
    process.env.VAPID_PUBLIC_KEY = originalVapidPublicKey;
  }
});

test("public key endpoint reports configured push notifications", {
  skip: !enabled
}, async () => {
  const result = await request("/api/notifications/push/public-key");

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.enabled, true);
  assert.equal(result.body.publicKey, TEST_VAPID_PUBLIC_KEY);
});

test("public key endpoint reports disabled when VAPID is not configured", {
  skip: !enabled
}, async () => {
  delete process.env.VAPID_PUBLIC_KEY;

  try {
    const result = await request("/api/notifications/push/public-key");

    assert.equal(result.response.status, 503);
    assert.equal(result.body.success, false);
    assert.equal(result.body.enabled, false);
  } finally {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC_KEY;
  }
});

test("subscription registration requires authentication", {
  skip: !enabled
}, async () => {
  const result = await request(
    "/api/notifications/push/subscriptions",
    null,
    {
      method: "POST",
      body: JSON.stringify(validSubscription())
    }
  );

  assert.equal(result.response.status, 401);
});

test("authenticated member can register a valid browser subscription", {
  skip: !enabled
}, async () => {
  const user = await createUser("push_test_register");
  const subscription = validSubscription();

  const result = await request(
    "/api/notifications/push/subscriptions",
    user,
    {
      method: "POST",
      body: JSON.stringify(subscription)
    }
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);

  const saved = await PushSubscription.findOne({
    endpoint: subscription.endpoint
  }).lean();

  assert.ok(saved);
  assert.equal(String(saved.userId), String(user._id));
  assert.equal(saved.keys.p256dh, subscription.keys.p256dh);
  assert.equal(saved.keys.auth, subscription.keys.auth);
  assert.equal(saved.expirationTime, null);
  assert.ok(saved.lastSeenAt);
});

test("registration rejects insecure endpoints and invalid subscription keys", {
  skip: !enabled
}, async () => {
  const user = await createUser("push_test_invalid");

  const insecure = validSubscription("http://push.example.test/insecure");

  const insecureResult = await request(
    "/api/notifications/push/subscriptions",
    user,
    {
      method: "POST",
      body: JSON.stringify(insecure)
    }
  );

  assert.equal(insecureResult.response.status, 400);

  const invalidKeys = validSubscription();
  invalidKeys.keys.auth = "invalid";

  const invalidKeysResult = await request(
    "/api/notifications/push/subscriptions",
    user,
    {
      method: "POST",
      body: JSON.stringify(invalidKeys)
    }
  );

  assert.equal(invalidKeysResult.response.status, 400);
  assert.equal(await PushSubscription.countDocuments({}), 0);
});

test("registration rejects invalid expiration times", {
  skip: !enabled
}, async () => {
  const user = await createUser("push_test_expiration");
  const subscription = validSubscription();
  subscription.expirationTime = "not-a-number";

  const result = await request(
    "/api/notifications/push/subscriptions",
    user,
    {
      method: "POST",
      body: JSON.stringify(subscription)
    }
  );

  assert.equal(result.response.status, 400);
  assert.equal(await PushSubscription.countDocuments({}), 0);
});

test("registering an endpoint under another account transfers its ownership", {
  skip: !enabled
}, async () => {
  const firstUser = await createUser("push_test_owner_a");
  const secondUser = await createUser("push_test_owner_b");
  const subscription = validSubscription();

  const firstRegistration = await request(
    "/api/notifications/push/subscriptions",
    firstUser,
    {
      method: "POST",
      body: JSON.stringify(subscription)
    }
  );

  assert.equal(firstRegistration.response.status, 200);

  const secondRegistration = await request(
    "/api/notifications/push/subscriptions",
    secondUser,
    {
      method: "POST",
      body: JSON.stringify(subscription)
    }
  );

  assert.equal(secondRegistration.response.status, 200);

  const records = await PushSubscription.find({
    endpoint: subscription.endpoint
  }).lean();

  assert.equal(records.length, 1);
  assert.equal(String(records[0].userId), String(secondUser._id));
});

test("subscription deletion requires authentication", {
  skip: !enabled
}, async () => {
  const subscription = validSubscription();

  const result = await request(
    "/api/notifications/push/subscriptions",
    null,
    {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint })
    }
  );

  assert.equal(result.response.status, 401);
});

test("member can remove only their own browser subscription", {
  skip: !enabled
}, async () => {
  const owner = await createUser("push_test_delete_owner");
  const otherUser = await createUser("push_test_delete_other");
  const subscription = validSubscription();

  const registered = await request(
    "/api/notifications/push/subscriptions",
    owner,
    {
      method: "POST",
      body: JSON.stringify(subscription)
    }
  );

  assert.equal(registered.response.status, 200);

  const forbiddenRemoval = await request(
    "/api/notifications/push/subscriptions",
    otherUser,
    {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint })
    }
  );

  assert.equal(forbiddenRemoval.response.status, 200);
  assert.equal(forbiddenRemoval.body.removed, false);
  assert.equal(
    await PushSubscription.countDocuments({ endpoint: subscription.endpoint }),
    1
  );

  const removal = await request(
    "/api/notifications/push/subscriptions",
    owner,
    {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint })
    }
  );

  assert.equal(removal.response.status, 200);
  assert.equal(removal.body.removed, true);
  assert.equal(
    await PushSubscription.countDocuments({ endpoint: subscription.endpoint }),
    0
  );
});

test("subscription deletion rejects invalid endpoints", {
  skip: !enabled
}, async () => {
  const user = await createUser("push_test_delete_invalid");

  const result = await request(
    "/api/notifications/push/subscriptions",
    user,
    {
      method: "DELETE",
      body: JSON.stringify({ endpoint: "not-a-valid-url" })
    }
  );

  assert.equal(result.response.status, 400);
});
