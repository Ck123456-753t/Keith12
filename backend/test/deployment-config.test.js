const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("frontend API config supports explicit production configuration", () => {
  const source = fs.readFileSync(
    path.join(root, "frontend/assets/js/config.js"),
    "utf8"
  );

  assert.match(source, /window\.PTW_API_BASE/);
  assert.match(source, /ptw-api-base/);
  assert.match(
    source,
    /https:\/\/primetask-workspace\.onrender\.com\/api/
  );
  assert.match(source, /Production cannot use a localhost API URL/);
  assert.match(source, /An HTTPS website requires an HTTPS API URL/);
});

test("Vercel configuration is valid and preserves registration rewrite", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/vercel.json"), "utf8")
  );

  assert.ok(
    fs.existsSync(path.join(root, "frontend/auth/register.html")),
    "Registration rewrite target must exist"
  );

  assert.ok(
    config.rewrites.some(
      item =>
        item.source === "/register/:username" &&
        item.destination === "/auth/register"
    )
  );
});

test("Vercel API rewrite targets the backend configured by the frontend", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/vercel.json"), "utf8")
  );
  const frontendConfig = fs.readFileSync(
    path.join(root, "frontend/assets/js/config.js"),
    "utf8"
  );
  const apiRewrite = config.rewrites.find(
    item => item.source === "/api/:path*"
  );

  assert.ok(apiRewrite, "Missing API proxy rewrite");
  const apiBase = frontendConfig.match(/https:\/\/[^"`\s]+\/api/);
  const rewriteUrl = new URL(
    apiRewrite.destination.replace(":path*", "health")
  );

  assert.ok(apiBase, "Missing frontend production API base");
  assert.equal(new URL(apiBase[0]).origin, rewriteUrl.origin);
  assert.equal(rewriteUrl.pathname, "/api/health");
});

test("Vercel includes baseline security headers", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/vercel.json"), "utf8")
  );

  const headers = config.headers.flatMap(item => item.headers);
  const names = headers.map(item => item.key.toLowerCase());

  for (const name of [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy"
  ]) {
    assert.ok(names.includes(name), `Missing header: ${name}`);
  }
});

test("backend refuses to start without required production secrets", () => {
  const source = fs.readFileSync(
    path.join(root, "backend/src/server.js"),
    "utf8"
  );

  assert.match(source, /JWT_SECRET/);
  assert.match(source, /MONGODB_URI/);
  assert.match(source, /length < 32/);
});

test("Daraja callbacks do not directly trust callback data for wallet credit", () => {
  const source = fs.readFileSync(
    path.join(root, "backend/src/routes/darajaCallbacks.js"),
    "utf8"
  );

  assert.match(source, /reconciliation_required/);
  assert.match(source, /verifyAndCompleteDepositCallback/);
  assert.match(source, /Callback data is untrusted/i);

  const verificationService = fs.readFileSync(
    path.join(root, "backend/src/services/depositDarajaVerificationService.js"),
    "utf8"
  );

  assert.match(verificationService, /queryStkPush/);
  assert.match(verificationService, /verification\.mode !== "live"/);
  assert.match(verificationService, /verification\.resultCode/);
  assert.match(verificationService, /completeVerifiedDeposit/);
});

test("transcription Daraja environment example documents the mounted STK callback", () => {
  const example = fs.readFileSync(
    path.join(root, "backend/.env.transcription.example"),
    "utf8"
  );
  const service = fs.readFileSync(
    path.join(root, "backend/src/services/transcriptionDarajaService.js"),
    "utf8"
  );
  const server = fs.readFileSync(
    path.join(root, "backend/src/server.js"),
    "utf8"
  );

  assert.match(example, /TRANSCRIPTION_DARAJA_ENABLED=false/);
  assert.match(service, /"TRANSCRIPTION_DARAJA_ENABLED",\s*"DARAJA_LIVE_ENABLED"/);
  assert.match(
    example,
    /TRANSCRIPTION_DARAJA_CALLBACK_URL=https:\/\/primetask-workspace\.onrender\.com\/api\/payments\/daraja\/callback\/stk/
  );
  assert.match(server, /app\.use\("\/api\/payments\/daraja\/callback", darajaCallbackRoutes\)/);
});
