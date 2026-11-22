"use strict";

const DEFAULT_PRODUCTION_COOKIE_DOMAIN = ".primetaskworkspace.com";
const PORTAL_ROOT_DOMAIN = "primetaskworkspace.com";
const PORTAL_HOSTS = new Set([
  "primetaskworkspace.com",
  "www.primetaskworkspace.com",
  "operator.primetaskworkspace.com"
]);

function requestOriginHost(req) {
  const origin = String(req?.get?.("origin") || req?.headers?.origin || "");
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    const forwardedHost = String(
      req?.get?.("x-forwarded-host") || req?.headers?.["x-forwarded-host"] ||
      req?.get?.("host") || req?.headers?.host || ""
    ).split(",")[0].trim();
    try {
      return new URL(`https://${forwardedHost}`).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}

function isPrimeTaskPortalHost(hostname) {
  return PORTAL_HOSTS.has(String(hostname || "").toLowerCase());
}

function cookieDomainForRequest(req, env = process.env) {
  if (env.NODE_ENV !== "production") return undefined;

  const hostname = requestOriginHost(req);
  if (!PORTAL_HOSTS.has(hostname)) return undefined;

  const configured = String(
    env.PTW_COOKIE_DOMAIN || DEFAULT_PRODUCTION_COOKIE_DOMAIN
  ).trim().toLowerCase();
  const domain = configured.replace(/^\./, "");

  if (domain !== PORTAL_ROOT_DOMAIN) return undefined;

  if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)?\.)*[a-z0-9]+(?:-[a-z0-9]+)?$/.test(domain)) {
    return undefined;
  }

  if (hostname !== domain && !hostname.endsWith(`.${domain}`)) {
    return undefined;
  }

  return `.${domain}`;
}

function cookieOptions(req, { maxAge, env = process.env } = {}) {
  const production = env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/"
  };
  const domain = cookieDomainForRequest(req, env);

  if (domain) options.domain = domain;
  if (Number.isFinite(maxAge)) options.maxAge = maxAge;

  return options;
}

module.exports = {
  DEFAULT_PRODUCTION_COOKIE_DOMAIN,
  PORTAL_ROOT_DOMAIN,
  PORTAL_HOSTS,
  isPrimeTaskPortalHost,
  cookieDomainForRequest,
  cookieOptions
};