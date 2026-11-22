"use strict";

(() => {
  const allowedRoles = document.documentElement.dataset.operatorRoles
    ?.split(",").map(role => role.trim()).filter(Boolean) || ["admin", "founder"];
  document.documentElement.classList.add("operator-auth-pending");
  const style = document.createElement("style");
  style.textContent = ".operator-auth-pending body{visibility:hidden}";
  document.head.appendChild(style);

  fetch("/api/auth/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store"
  }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    const role = String(payload?.user?.role || "").toLowerCase();
    if (!response.ok || !allowedRoles.includes(role)) {
      // A member-domain session is not an operator session. Keep the user
      // on the operator origin so they can explicitly authenticate there.
      window.location.replace("/login.html");
      return;
    }
    document.documentElement.classList.remove("operator-auth-pending");
    document.documentElement.dataset.operatorRole = role;
  }).catch(() => window.location.replace("/login.html"));
})();