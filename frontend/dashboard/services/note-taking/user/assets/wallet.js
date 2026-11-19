"use strict";

(() => {
  const apiBase = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);

  const money = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? "$" + amount.toFixed(2) : "—";
  };

  async function api(path, options = {}) {
    if (!apiBase) throw new Error("The API address is not configured.");

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

    if (!response.ok || data.success !== true) {
      throw new Error(data.message || "The request could not be completed.");
    }

    return data;
  }

  function showMessage(message, isError = false) {
    const element = $("withdrawalMessage");
    if (!element) return;
    element.textContent = message;
    element.className = "withdrawal-message" + (isError ? " error" : "");
  }

  async function loadWallet() {
    const data = await api("/notes/wallet/");
    const wallet = data.wallet;

    if (!wallet) throw new Error("The Notes wallet response is incomplete.");

    const fields = [
      ["availableBalance", wallet.availableBalance],
      ["totalEarnings", wallet.totalEarnings],
      ["totalWithdrawals", wallet.totalWithdrawals]
    ];

    for (const [id, value] of fields) {
      if (!Number.isFinite(Number(value))) {
        throw new Error("The server did not return all three wallet figures.");
      }
      const element = $(id);
      if (element) element.textContent = money(value);
    }

    const caption = $("balanceCaption");
    if (caption) caption.textContent = "Your current available Notes earnings balance.";
  }

  async function loadWithdrawalHistory() {
    const data = await api("/notes/withdrawals/mine");
    const items = data.withdrawals || [];
    const host = $("withdrawalHistoryRows");
    if (!host) return;

    host.innerHTML = items.length ? items.map((item) => {
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString()
        : "—";
      const status = String(item.status || "unknown").replaceAll("_", " ");
      return `<tr>
        <td>${date}</td>
        <td>${money(item.amount)}</td>
        <td>KES ${Number(item.payoutAmountKes || 0).toLocaleString()}</td>
        <td>${status}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="4">No withdrawal requests yet.</td></tr>';
  }

  let quoteTimer;

  async function loadQuote() {
    const amount = $("withdrawalAmount")?.value.trim();
    const quote = $("withdrawalQuote");
    if (!quote) return;

    if (!amount) {
      quote.textContent = "Enter an amount to calculate the estimated M-Pesa payout.";
      return;
    }

    quote.textContent = "Calculating estimate...";

    try {
      const data = await api(
        "/notes/withdrawals/quote?amount=" + encodeURIComponent(amount)
      );

      if (data.payoutAmountKes === null) {
        quote.textContent =
          `Allowed amount: ${money(data.minimumAmount)} to ${money(data.maximumAmount)}.`;
        return;
      }

      quote.textContent =
        `Estimated payout: KES ${Number(data.payoutAmountKes).toLocaleString()} · ` +
        `Rate: 1 USD = KES ${Number(data.exchangeRateKesPerUsd).toFixed(2)}`;
    } catch (error) {
      quote.textContent = error.message;
    }
  }

  function openForm() {
    const form = $("withdrawalForm");
    if (form) {
      form.hidden = false;
      $("withdrawalAmount")?.focus();
    }
  }

  function closeForm() {
    const form = $("withdrawalForm");
    if (form) form.hidden = true;
    showMessage("");
  }

  async function submitWithdrawal() {
    const button = $("submitWithdrawalBtn");
    const amount = $("withdrawalAmount")?.value.trim();
    const phoneNumber = $("withdrawalPhone")?.value.trim();

    if (!amount || !phoneNumber) {
      showMessage("Enter both the withdrawal amount and M-Pesa phone number.", true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }

    showMessage("");

    try {
      const data = await api("/notes/withdrawals/", {
        method: "POST",
        body: JSON.stringify({ amount, phoneNumber })
      });

      showMessage(
        `Withdrawal request submitted. Reference: ${data.withdrawal.requestId}`
      );

      $("withdrawalAmount").value = "";
      $("withdrawalPhone").value = "";
      $("withdrawalQuote").textContent =
        "Enter an amount to calculate the estimated M-Pesa payout.";

      await Promise.all([loadWallet(), loadWithdrawalHistory()]);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Submit withdrawal";
      }
    }
  }

  $("openWithdrawalBtn")?.addEventListener("click", openForm);
  $("closeWithdrawalBtn")?.addEventListener("click", closeForm);
  $("submitWithdrawalBtn")?.addEventListener("click", submitWithdrawal);

  $("withdrawalAmount")?.addEventListener("input", () => {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(loadQuote, 350);
  });

  loadWallet().catch((error) => {
    const caption = $("balanceCaption");
    if (caption) caption.textContent = error.message;
    console.error("Notes wallet:", error);
  });

  loadWithdrawalHistory().catch((error) => {
    console.error("Notes withdrawal history:", error);
  });
})();
