(() => {
  "use strict";

  const balanceEl = document.getElementById("pointsBalance");
  const captionEl = document.getElementById("balanceCaption");
  const packageList = document.getElementById("packageList");
  const form = document.getElementById("purchaseForm");
  const phoneInput = document.getElementById("mpesaPhone");
  const buyButton = document.getElementById("buyPointsButton");
  const messageEl = document.getElementById("purchaseMessage");

  if (!balanceEl || !packageList || !form) return;

  const configuredBase = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  if (!configuredBase) {
    showMessage("The API address is not configured. No purchase was started.", true);
    packageList.textContent = "Packages are unavailable until the API is configured.";
    return;
  }

  const apiBase = configuredBase;
  let packages = [];
  let selectedPackageId = "";
  let busy = false;
  let pollHandle = null;

  function showMessage(message, isError = false) {
    messageEl.style.display = "block";
    messageEl.textContent = message;
    messageEl.style.background = isError ? "#fff0ed" : "#edf8f0";
    messageEl.style.color = isError ? "#a12d21" : "#205e43";
    messageEl.style.border = isError
      ? "1px solid #f2c8c0"
      : "1px solid #d7e9dc";
  }

  async function request(path, options = {}) {
    const response = await fetch(apiBase + path, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "The request could not be completed.");
    }
    return data;
  }

  async function loadBalance() {
    const data = await request("/notes/dashboard");
    const dashboard = data.dashboard;
    if (!dashboard || !Number.isFinite(Number(dashboard.pointsBalance))) {
      throw new Error("The Notes Points balance was not returned by the server.");
    }
    balanceEl.textContent = Number(dashboard.pointsBalance).toLocaleString();
    captionEl.textContent = "Your current Notes Points balance.";
  }

  function renderPackages() {
    packageList.replaceChildren();

    if (!packages.length) {
      packageList.textContent = "No active Points packages are available right now.";
      return;
    }

    packages.forEach((item, index) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;gap:12px;align-items:center;padding:15px;margin-bottom:10px;" +
        "border:1px solid #dbe8df;border-radius:12px;cursor:pointer";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "pointsPackage";
      radio.value = item.id;
      radio.required = true;
      radio.checked = index === 0;
      if (radio.checked) selectedPackageId = item.id;

      radio.addEventListener("change", () => {
        selectedPackageId = item.id;
      });

      const details = document.createElement("span");
      details.style.cssText = "display:grid;gap:5px;min-width:0";

      const title = document.createElement("strong");
      title.textContent = item.name;

      const points = document.createElement("span");
      points.textContent = Number(item.points).toLocaleString() + " Notes Points";
      points.style.cssText = "font-size:12px;color:#74847d";

      const price = document.createElement("strong");
      price.textContent = "KSh " + Number(item.priceKes).toLocaleString();
      price.style.cssText = "color:#123b32";

      details.append(title, points, price);
      label.append(radio, details);
      packageList.appendChild(label);
    });
  }

  async function loadPackages() {
    const data = await request("/notes/points-purchases/packages");
    packages = Array.isArray(data.packages) ? data.packages : [];
    renderPackages();
  }

  function normalizePhone(value) {
    let phone = value.replace(/[\s()+-]/g, "");
    if (/^0[17]\d{8}$/.test(phone)) phone = "254" + phone.slice(1);
    if (/^[17]\d{8}$/.test(phone)) phone = "254" + phone;
    return /^254[17]\d{8}$/.test(phone) ? phone : "";
  }

  function stopPolling() {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = null;
  }

  async function checkStatus() {
    try {
      const data = await request("/notes/points-purchases/status");
      const purchase = data.purchase;
      if (!purchase) return;

      const status = String(purchase.paymentStatus || "").toLowerCase();

      if (["verified", "successful", "completed", "paid"].includes(status)) {
        stopPolling();
        showMessage(
          "Payment confirmed. " + Number(purchase.points).toLocaleString() +
          " Notes Points purchased. Refreshing your balance…"
        );
        await loadBalance();
        buyButton.disabled = false;
        buyButton.textContent = "Buy Points";
        busy = false;
      } else if (["failed", "cancelled", "canceled", "expired", "rejected"].includes(status)) {
        stopPolling();
        showMessage("The payment was not completed. Check your M-Pesa messages before trying again.", true);
        buyButton.disabled = false;
        buyButton.textContent = "Buy Points";
        busy = false;
      } else {
        showMessage(
          "Payment status: " + (status === "verification_required"
            ? "verification required"
            : "awaiting confirmation") +
          ". Do not start another payment while this one is unresolved."
        );
      }
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;

    const phoneNumber = normalizePhone(phoneInput.value);
    if (!selectedPackageId) {
      showMessage("Select an available Points package first.", true);
      return;
    }
    if (!phoneNumber) {
      showMessage("Enter a valid Kenyan M-Pesa number.", true);
      phoneInput.focus();
      return;
    }

    busy = true;
    buyButton.disabled = true;
    buyButton.textContent = "Requesting payment…";

    try {
      const idempotencyKey = crypto.randomUUID();
      const data = await request("/notes/points-purchases", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ packageId: selectedPackageId, phoneNumber })
      });

      showMessage(
        data.message ||
        "Payment request submitted. Notes Points will be added after verification."
      );
      buyButton.textContent = "Awaiting payment";
      await checkStatus();

      // Start polling only if the initial status check did not reach
      // a terminal state. Avoid creating an unnecessary interval.
      if (busy) {
        stopPolling();
        let attempts = 0;
        pollHandle = setInterval(async () => {
          attempts += 1;
          await checkStatus();

          if (!busy || attempts >= 36) {
            stopPolling();
            if (busy) {
              showMessage(
                "Payment is still awaiting confirmation. Do not retry while it remains unresolved."
              );
            }
          }
        }, 5000);
      }
    } catch (error) {
      showMessage(error.message, true);
      buyButton.disabled = false;
      buyButton.textContent = "Buy Points";
      busy = false;
    }
  });

  Promise.all([loadBalance(), loadPackages()]).catch(error => {
    showMessage(error.message, true);
  });
})();
