"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  canUsePortal,
  matchesOperatorCredentials,
  requirePlatformAdmin,
  requireFounder,
  requireNotesAdmin,
  requireNotesMemberOrPlatformAdmin
} = require("../src/middleware/portalAccess");
const {
  cookieDomainForRequest,
  cookieOptions,
  isPrimeTaskPortalHost
} = require("../src/services/authCookiePolicy");

const ADMIN_ID = "507f1f77bcf86cd799439011";

function authorize(middleware, user) {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  const result = middleware(
    { user },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        body = value;
        return this;
      }
    },
    () => { nextCalled = true; }
  );
  return { result, nextCalled, statusCode, body };
}

test("portal role assignments keep Notes operators out of platform administration", () => {
  assert.equal(canUsePortal("member", "user"), true);
  assert.equal(canUsePortal("member", "admin"), false);
  assert.equal(canUsePortal("operator", "notes_operator"), true);
  assert.equal(canUsePortal("operator", "user"), false);
  assert.equal(canUsePortal("admin", "notes_operator"), false);
  assert.equal(canUsePortal("founder", "admin"), false);
});

test("operator email must match an authorized database user", () => {
  const user = { _id: ADMIN_ID, email: "operator@example.test", role: "admin" };
  assert.equal(matchesOperatorCredentials(user, {
    email: " OPERATOR@example.test "
  }), true);
  assert.equal(matchesOperatorCredentials(user, {
    email: "other@example.test"
  }), false);
  assert.equal(matchesOperatorCredentials({ ...user, role: "user" }, {
    email: user.email
  }), false);
});

test("operator login form and request use only email and password credentials", () => {
  const loginPage = fs.readFileSync(
    path.resolve(__dirname, "../../operator-frontend/login.html"),
    "utf8"
  );
  const loginScript = fs.readFileSync(
    path.resolve(__dirname, "../../operator-frontend/assets/js/operator-login.js"),
    "utf8"
  );

  assert.match(loginPage, /name="email"/);
  assert.match(loginPage, /name="password"/);
  assert.doesNotMatch(loginPage, /account\s*id/i);
  assert.doesNotMatch(loginScript, /accountId/i);
});

test("platform, founder, and Notes administrator guards are distinct", () => {
  const admin = { _id: ADMIN_ID, role: "admin" };
  const founder = { _id: ADMIN_ID, role: "founder" };
  const notesOperator = { _id: ADMIN_ID, role: "notes_operator" };
  assert.equal(authorize(requirePlatformAdmin, admin).nextCalled, true);
  assert.equal(authorize(requirePlatformAdmin, notesOperator).statusCode, 403);
  assert.equal(authorize(requireFounder, founder).nextCalled, true);
  assert.equal(authorize(requireFounder, admin).statusCode, 403);
  assert.equal(authorize(requireNotesAdmin, notesOperator).nextCalled, true);
  assert.equal(authorize(requireNotesMemberOrPlatformAdmin, notesOperator).statusCode, 403);
  assert.equal(authorize(requireNotesMemberOrPlatformAdmin, { role: "user" }).nextCalled, true);
});

test("production portal sessions use a secure parent-domain HttpOnly cookie", () => {
  const request = { headers: { origin: "https://operator.primetaskworkspace.com" } };
  const options = cookieOptions(request, { env: { NODE_ENV: "production" } });
  assert.deepEqual(options, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: ".primetaskworkspace.com"
  });
  assert.equal(cookieDomainForRequest({ headers: { origin: "https://evilprimetaskworkspace.com" } }, {
    NODE_ENV: "production"
  }), undefined);
});

test("non-portal origins and development do not receive a shared production cookie", () => {
  assert.equal(isPrimeTaskPortalHost("primetaskworkspace.com"), true);
  assert.equal(isPrimeTaskPortalHost("evil.primetaskworkspace.com"), false);
  assert.equal(cookieDomainForRequest({ headers: { origin: "https://primetaskworkspace.com" } }, {
    NODE_ENV: "development"
  }), undefined);
  assert.deepEqual(cookieOptions(null, { env: { NODE_ENV: "development" } }), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/"
  });
});

test("a member session on an operator page is redirected to operator login", () => {
  const guard = fs.readFileSync(
    path.resolve(__dirname, "../../operator-frontend/assets/js/operator-guard.js"),
    "utf8"
  );
  assert.match(guard, /window\.location\.replace\("\/login\.html"\)/);
  assert.doesNotMatch(guard, /primetaskworkspace\.com\/dashboard\/index\.html/);
});