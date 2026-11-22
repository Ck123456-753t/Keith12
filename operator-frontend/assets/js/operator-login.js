"use strict";

(() => {
  const form = document.getElementById("operatorLogin");
  if (!form) return;
  const message = document.getElementById("message");
  const button = document.getElementById("submit");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "";
    button.disabled = true;
    button.textContent = "Verifying credentials…";

    try {
      const response = await fetch(window.PTW_AUTH_API_LOGIN || "/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          portal: "operator",
          email: form.elements.email.value.trim(),
          accountId: form.elements.accountId.value.trim(),
          password: form.elements.password.value
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Operator sign in failed.");

      const session = await fetch(window.PTW_AUTH_API_ME || "/api/auth/me", {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const verified = await session.json().catch(() => ({}));
      if (!session.ok || !["admin", "founder", "notes_operator"].includes(verified?.user?.role)) {
        throw new Error("The authenticated account is not authorized for the operator portal.");
      }

      window.location.replace(verified.user.role === "notes_operator"
        ? "/dashboard/services/note-taking/admin/"
        : "/dashboard/admin/Keith/keith");
    } catch (error) {
      message.textContent = error.message || "Unable to sign in. Please try again.";
      button.disabled = false;
      button.textContent = "Verify and sign in";
    }
  });
})();