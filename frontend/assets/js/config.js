"use strict";

(() => {
  const hostname = window.location.hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "::"].includes(hostname);
  const isHttps = window.location.protocol === "https:";

  const meta = document.querySelector('meta[name="ptw-api-base"]');
  const metaBase = meta ? meta.content.trim() : "";

  let apiBase = "";

  if (
    typeof window.PTW_API_BASE === "string" &&
    window.PTW_API_BASE.trim()
  ) {
    apiBase = window.PTW_API_BASE.trim();
  } else if (metaBase) {
    apiBase = metaBase;
  } else if (isLocal) {
    apiBase = "http://127.0.0.1:5001/api";
  } else {
    apiBase = "https://primetask-workspace.onrender.com/api";
  }

  apiBase = apiBase.replace(/\/+$/, "");

  if (!apiBase) {
    console.error(
      "PrimeTask API is not configured. Set window.PTW_API_BASE " +
      "or add a ptw-api-base meta tag with the production API URL."
    );
    return;
  }

  let parsed;

  try {
    parsed = new URL(apiBase);
  } catch {
    console.error("PrimeTask API URL is invalid.");
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    console.error("PrimeTask API must use HTTP or HTTPS.");
    return;
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    console.error(
      "PrimeTask API URL must not contain credentials, query parameters or a fragment."
    );
    return;
  }

  const pointsToLocalhost = [
    "localhost",
    "127.0.0.1",
    "::1"
  ].includes(parsed.hostname);

  if (!isLocal && pointsToLocalhost) {
    console.error("Production cannot use a localhost API URL.");
    return;
  }

  if (isHttps && parsed.protocol !== "https:") {
    console.error("An HTTPS website requires an HTTPS API URL.");
    return;
  }

  window.PTW_API_BASE = apiBase;
  window.PTW_AUTH_API_REGISTER = `${apiBase}/auth/register`;
  window.PTW_AUTH_API_LOGIN = `${apiBase}/auth/login`;
  window.PTW_AUTH_API_VERIFY_EMAIL = `${apiBase}/auth/verify-email`;
  window.PTW_AUTH_API_RESEND_VERIFICATION = `${apiBase}/auth/resend-verification`;
  window.PTW_AUTH_API_ME = `${apiBase}/auth/me`;
  window.PTW_AUTH_API_LOGOUT = `${apiBase}/auth/logout`;

  window.PTW_REFERRAL_API_ME = `${apiBase}/referrals/me`;

  function pushBase64UrlToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function registerPtwServiceWorker() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("This browser does not support background notifications.");
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/"
    });

    if ("Notification" in window && Notification.permission === "granted") {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        fetch(`${apiBase}/notifications/push/subscriptions`, {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(existing.toJSON())
        }).catch(() => {});
      }
    }

    return registration;
  }

  window.PTWEnablePushNotifications = async function () {
    if (!("Notification" in window) || !("PushManager" in window)) {
      throw new Error("This browser does not support push notifications.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error(
        permission === "denied"
          ? "Notifications are blocked. Change this site's permission in browser settings."
          : "Notification permission was not granted."
      );
    }

    const registration = await registerPtwServiceWorker();
    const keyResponse = await fetch(`${apiBase}/notifications/push/public-key`, {
      credentials: "omit",
      headers: { Accept: "application/json" }
    });
    const keyData = await keyResponse.json().catch(() => ({}));

    if (!keyResponse.ok || !keyData.enabled || !keyData.publicKey) {
      throw new Error(keyData.message || "Push notifications are not configured on the server.");
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushBase64UrlToBytes(keyData.publicKey)
      });
    }

    const saveResponse = await fetch(`${apiBase}/notifications/push/subscriptions`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(subscription.toJSON())
    });
    const saveData = await saveResponse.json().catch(() => ({}));

    if (!saveResponse.ok || saveData.success === false) {
      throw new Error(saveData.message || "Could not register this device for notifications.");
    }

    return saveData;
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      registerPtwServiceWorker().catch(error => {
        console.warn("PrimeTask background notifications unavailable:", error.message);
      });
    }, { once: true });
  }
})();
