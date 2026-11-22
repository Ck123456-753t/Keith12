"use strict";

const crypto = require("node:crypto");
const { cookieOptions } = require("./authCookiePolicy");

const DEVICE_COOKIE_NAME = "ptw_device";
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

function createDeviceCredential() {
  const credential = crypto.randomBytes(32).toString("base64url");

  return {
    credential,
    hash: hashDeviceCredential(credential)
  };
}

function hashDeviceCredential(credential) {
  if (
    typeof credential !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(credential)
  ) {
    throw new TypeError("Invalid device credential.");
  }

  return crypto
    .createHash("sha256")
    .update(credential, "utf8")
    .digest("hex");
}

function deviceCookieOptions() {
  return {
    ...cookieOptions(null),
    maxAge: DEVICE_COOKIE_MAX_AGE
  };
}

function clearDeviceCookieOptions(req) {
  return cookieOptions(req);
}

function setDeviceCookie(res, credential, req) {
  if (
    typeof credential !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(credential)
  ) {
    throw new TypeError("Invalid device credential.");
  }

  res.cookie(
    DEVICE_COOKIE_NAME,
    credential,
    {
      ...cookieOptions(req),
      maxAge: DEVICE_COOKIE_MAX_AGE
    }
  );
}

function clearDeviceCookie(res, req) {
  res.clearCookie(
    DEVICE_COOKIE_NAME,
    clearDeviceCookieOptions(req)
  );
}

module.exports = {
  DEVICE_COOKIE_NAME,
  DEVICE_COOKIE_MAX_AGE,
  createDeviceCredential,
  hashDeviceCredential,
  deviceCookieOptions,
  clearDeviceCookieOptions,
  setDeviceCookie,
  clearDeviceCookie
};
