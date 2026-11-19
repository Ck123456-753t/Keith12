(() => {
  const base = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  const root = document.getElementById("minutePackages");
  const notice = document.getElementById("minuteNotice");
  const phone = document.getElementById("minutePhone");

  let packages = [];
  let purchaseInProgress = false;

  if (!root || !notice || !phone) return;

  function message(text, error = false) {
    notice.textContent = text;
    notice.setAttribute("role", error ? "alert" : "status");
  }

  function usd(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(Number(value) || 0);
  }

  async function api(path, options = {}) {
    if (!base) throw new Error("API is not configured for this website.");

    const response = await fetch(`${base}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `Request failed (${response.status}).`);
    }
    return data;
  }

  function add(parent, tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  async function loadMinutesBalance() {
    const available = document.getElementById("availableMinutes");
    const balanceNotice = document.getElementById("minuteBalanceNotice");

    if (!available || !balanceNotice) return;

    balanceNotice.textContent = "Loading your minute balance…";

    try {
      const data = await api("/transcription/minute-purchases/wallet");
      const wallet = data.wallet;

      if (!wallet || !Number.isSafeInteger(wallet.availableMinutes)) {
        throw new Error("The server returned an invalid minute balance.");
      }

      available.textContent = wallet.availableMinutes.toLocaleString("en-US");
      balanceNotice.textContent = "";
      balanceNotice.setAttribute("role", "status");
    } catch (error) {
      available.textContent = "Unavailable";
      balanceNotice.textContent = error.message;
      balanceNotice.setAttribute("role", "alert");
    }
  }

  function renderPackages() {
    root.replaceChildren();

    if (!packages.length) {
      add(root, "p", "No active minute packages are available.");
      return;
    }

    for (const pkg of packages) {
      const card = document.createElement("article");
      card.className = "card minute-package-card";

      add(card, "h3", pkg.name);
      add(card, "p", `${Number(pkg.minutes).toLocaleString("en-US")} minutes`);

      const price = add(card, "div", usd(pkg.price));
      price.className = "minute-package-price";

      const mpesa = add(
        card,
        "p",
        `M-Pesa amount: KSh ${Number(pkg.priceKes).toLocaleString("en-KE")}`
      );
      mpesa.className = "minute-package-mpesa";

      const purchase = add(card, "button", "Purchase package");
      purchase.type = "button";
      purchase.className = "btn orange minute-package-button";
      purchase.disabled = purchaseInProgress;
      purchase.addEventListener("click", () => purchasePackage(pkg, purchase));

      root.appendChild(card);
    }
  }

  async function loadPackages() {
    root.textContent = "Loading available packages…";

    try {
      const data = await api("/transcription/minute-purchases/packages");
      packages = Array.isArray(data.packages) ? data.packages : [];
      renderPackages();
      message(packages.length
        ? ""
        : "No active minute packages are available.", !packages.length);
    } catch (error) {
      packages = [];
      root.textContent = "Could not load packages.";
      message(error.message, true);
    }
  }

  async function purchasePackage(pkg, clickedButton) {
    if (purchaseInProgress) return;

    const phoneNumber = phone.value.trim();
    if (!phoneNumber) {
      phone.reportValidity();
      phone.focus();
      message("Enter your M-Pesa phone number before purchasing.", true);
      return;
    }

    purchaseInProgress = true;
    const buttons = [...root.querySelectorAll(".minute-package-button")];
    buttons.forEach(button => {
      button.disabled = true;
    });

    const originalText = clickedButton.textContent;
    clickedButton.textContent = "Requesting prompt…";
    message(`Requesting purchase for ${pkg.name}.`);

    try {
      const key = `minute-${crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`}`;

      const data = await api("/transcription/minute-purchases", {
        method: "POST",
        body: JSON.stringify({
          packageId: pkg.id,
          phoneNumber,
          idempotencyKey: key
        })
      });

      message(
        data.message || "Purchase request submitted. Minutes are credited after backend payment verification."
      );
    } catch (error) {
      message(
        `${error.message} Check your purchase status before trying again.`,
        true
      );
    } finally {
      await loadMinutesBalance();
      purchaseInProgress = false;
      renderPackages();
    }
  }

  loadPackages();
  loadMinutesBalance();
})();
