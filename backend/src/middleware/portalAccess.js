"use strict";

const PORTAL_ROLES = Object.freeze({
  member: Object.freeze(["user"]),
  operator: Object.freeze(["admin", "founder", "notes_operator"]),
  admin: Object.freeze(["admin"]),
  founder: Object.freeze(["founder"]),
  notes_operator: Object.freeze(["notes_operator"])
});

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function rolesForPortal(portal) {
  return PORTAL_ROLES[String(portal || "").trim().toLowerCase()] || null;
}

function canUsePortal(portal, role) {
  const roles = rolesForPortal(portal);
  return Boolean(roles && roles.includes(normalizeRole(role)));
}

function matchesOperatorCredentials(user, { email } = {}) {
  if (!user?._id || !canUsePortal("operator", user.role)) return false;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return Boolean(
    normalizedEmail &&
    String(user.email || "").trim().toLowerCase() === normalizedEmail
  );
}

function requireRoles(allowedRoles, message = "You are not authorized to access this area.") {
  const roles = new Set(allowedRoles.map(normalizeRole));

  return function roleAuthorization(req, res, next) {
    if (!req.user || !roles.has(normalizeRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        code: "ROLE_NOT_AUTHORIZED",
        message
      });
    }

    return next();
  };
}

const requirePlatformAdmin = requireRoles(
  ["admin", "founder"],
  "Administrator access is required."
);
const requireFounder = requireRoles(
  ["founder"],
  "Founder access is required."
);
const requireNotesAdmin = requireRoles(
  ["notes_operator", "admin", "founder"],
  "Notes administration access is required."
);
const requireNotesMemberOrPlatformAdmin = requireRoles(
  ["user", "admin", "founder"],
  "This Notes member service is not available to Notes operators."
);

module.exports = {
  PORTAL_ROLES,
  normalizeRole,
  rolesForPortal,
  canUsePortal,
  matchesOperatorCredentials,
  requireRoles,
  requirePlatformAdmin,
  requireFounder,
  requireNotesAdmin,
  requireNotesMemberOrPlatformAdmin
};