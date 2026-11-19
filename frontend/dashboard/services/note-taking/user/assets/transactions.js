"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const rowsElement = $("transactionRows");
  const emptyElement = $("transactionEmpty");
  const searchElement = $("transactionSearch");
  const typeElement = $("transactionType");
  const statusElement = $("transactionStatus");

  let transactions = [];

  const pendingWithdrawalStatuses = new Set([
    "pending_review",
    "approved",
    "processing",
    "reconciliation_required"
  ]);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatUSD(cents) {
    const amount = Math.abs(Number(cents) || 0) / 100;
    return "$" + amount.toFixed(2);
  }

  function withdrawalStatus(status) {
    const map = {
      pending_review: {
        key: "pending",
        label: "Pending review"
      },
      approved: {
        key: "pending",
        label: "Approved"
      },
      processing: {
        key: "pending",
        label: "Processing"
      },
      reconciliation_required: {
        key: "pending",
        label: "Reconciliation required"
      },
      paid: {
        key: "completed",
        label: "Paid"
      },
      rejected: {
        key: "failed",
        label: "Rejected"
      }
    };

    return map[status] || {
      key: "completed",
      label: "Recorded"
    };
  }

  async function api(path) {
    if (!window.PTW_API_BASE) {
      throw new Error("PrimeTask API configuration is missing.");
    }

    const base = window.PTW_API_BASE.replace(/\/+$/, "");

    const response = await fetch(base + path, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || "Could not load transaction records."
      );
    }

    return data;
  }

  function normalizePoints(items) {
    return items.map((item) => {
      const points = Number(item.points) || 0;

      return {
        id: "points-" + item.id,
        source: "points",
        type: item.type,
        category: "points",
        categoryLabel: "Notes Points",
        description: item.description || "Notes Points transaction",
        reference: item.reference || item.id || "",
        date: item.createdAt,
        amountText:
          (points > 0 ? "+" : "") + points + " Points",
        amountClass: points >= 0 ? "credit" : "debit",
        statusKey: "completed",
        statusLabel: "Completed",
        icon: item.type === "purchase_credit" ? "✦" : "−"
      };
    });
  }

  function normalizeUSD(items, withdrawalsById) {
    return items.map((item) => {
      const cents = Number(item.amountCents) || 0;
      const reference = String(item.reference || "");
      const withdrawal = withdrawalsById.get(reference);

      let category = "other";
      let categoryLabel = "Other";
      let icon = "↔";
      let statusKey = "completed";
      let statusLabel = "Recorded";

      switch (item.type) {
        case "task_earning":
          category = "earnings";
          categoryLabel = "USD earnings";
          icon = "$";
          statusLabel = "Completed";
          break;

        case "withdrawal":
          category = "withdrawal";
          categoryLabel = "Withdrawal";
          icon = "↗";

          if (withdrawal) {
            const state = withdrawalStatus(withdrawal.status);
            statusKey = state.key;
            statusLabel = state.label;
          } else {
            statusLabel = "Recorded";
          }
          break;

        case "withdrawal_reversal":
          category = "withdrawal";
          categoryLabel = "Withdrawal reversal";
          icon = "↩";
          statusLabel = "Completed";
          break;

        case "admin_adjustment":
          category = "adjustment";
          categoryLabel = "Adjustment";
          icon = "±";
          statusLabel = "Recorded";
          break;

        case "credit_purchase":
          category = "earnings";
          categoryLabel = "USD credit";
          icon = "$";
          statusLabel = "Completed";
          break;

        case "task_reservation":
        case "task_debit":
        case "reservation_release":
        case "refund":
          category = "earnings";
          categoryLabel = "USD wallet movement";
          icon = "↔";
          statusLabel = "Completed";
          break;

        default:
          break;
      }

      return {
        id: "usd-" + item.id,
        source: "usd",
        type: item.type,
        category,
        categoryLabel,
        description: item.description || "Notes wallet transaction",
        reference,
        date: item.createdAt,
        amountText:
          (cents > 0 ? "+" : cents < 0 ? "−" : "") +
          formatUSD(cents),
        amountClass: cents >= 0 ? "credit" : "debit",
        statusKey,
        statusLabel,
        icon
      };
    });
  }

  function normalizeWithdrawals(items, existingRows) {
    const existingReferences = new Set(
      existingRows
        .filter((item) => item.type === "withdrawal")
        .map((item) => item.reference)
    );

    return items
      .filter((item) => !existingReferences.has(String(item.requestId)))
      .map((item) => {
        const state = withdrawalStatus(item.status);
        const amount = Math.abs(Number(item.amount) || 0);

        return {
          id: "withdrawal-" + item.requestId,
          source: "usd",
          type: "withdrawal",
          category: "withdrawal",
          categoryLabel: "Withdrawal",
          description: "Notes earnings withdrawal request",
          reference: item.requestId || "",
          date: item.createdAt,
          amountText: "−$" + amount.toFixed(2),
          amountClass: "debit",
          statusKey: state.key,
          statusLabel: state.label,
          icon: "↗"
        };
      });
  }

  function matchesFilters(item) {
    const search = searchElement.value.trim().toLowerCase();
    const category = typeElement.value;
    const status = statusElement.value;

    if (category !== "all" && item.category !== category) {
      return false;
    }

    if (status !== "all" && item.statusKey !== status) {
      return false;
    }

    if (search) {
      const searchable = [
        item.description,
        item.reference,
        item.categoryLabel,
        item.type
      ].join(" ").toLowerCase();

      if (!searchable.includes(search)) return false;
    }

    return true;
  }

  function render() {
    const filtered = transactions.filter(matchesFilters);

    rowsElement.innerHTML = filtered.map((item) => `
      <tr>
        <td>${escapeHtml(formatDate(item.date))}</td>
        <td>
          <div class="type-cell">
            <span class="type-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
            <div>
              <div class="type-name">${escapeHtml(item.description)}</div>
              <div class="type-detail">${escapeHtml(item.type)}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(item.categoryLabel)}</td>
        <td>
          <span class="amount ${escapeHtml(item.amountClass)}">
            ${escapeHtml(item.amountText)}
          </span>
        </td>
        <td>
          <span class="status ${escapeHtml(item.statusKey)}">
            ${escapeHtml(item.statusLabel)}
          </span>
        </td>
        <td>${escapeHtml(String(item.reference || "—").replace(/^(NOTES-(?:EARNING|POINTS-CLAIM|POINTS-PURCHASE))-.+$/i, "$1"))}</td>
      </tr>
    `).join("");

    emptyElement.hidden = filtered.length > 0;

    const heading = emptyElement.querySelector("h3");
    const message = emptyElement.querySelector("p");

    if (heading && message) {
      if (transactions.length && !filtered.length) {
        heading.textContent = "No matching transactions";
        message.textContent =
          "No real transaction records match the selected filters.";
      } else if (!transactions.length) {
        heading.textContent = "No transaction records found";
        message.textContent =
          "No Notes Points or USD wallet transactions were returned by the backend.";
      }
    }
  }

  function showLoadError(messages) {
    if (!messages.length) return;

    const notice = document.createElement("p");
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "margin:12px 20px;padding:12px;border-radius:10px;" +
      "background:#fff1db;color:#805719;font-size:12px;line-height:1.6";

    notice.textContent =
      "Some transaction sources could not be loaded: " +
      messages.join(" ");

    document.querySelector(".panel").appendChild(notice);
  }

  async function loadTransactions() {
    emptyElement.hidden = false;

    const heading = emptyElement.querySelector("h3");
    const message = emptyElement.querySelector("p");

    if (heading) heading.textContent = "Loading transactions";
    if (message) {
      message.textContent =
        "Retrieving your Notes Points, USD wallet and withdrawal records.";
    }

    const results = await Promise.allSettled([
      api("/notes/points-transactions?limit=50"),
      api("/notes/wallet/transactions?limit=50"),
      api("/notes/withdrawals/mine")
    ]);

    const errors = [];

    const pointsData = results[0].status === "fulfilled"
      ? results[0].value
      : (errors.push("Notes Points history unavailable."), null);

    const usdData = results[1].status === "fulfilled"
      ? results[1].value
      : (errors.push("USD wallet history unavailable."), null);

    const withdrawalsData = results[2].status === "fulfilled"
      ? results[2].value
      : (errors.push("Withdrawal history unavailable."), null);

    const withdrawals = Array.isArray(withdrawalsData?.withdrawals)
      ? withdrawalsData.withdrawals
      : [];

    const withdrawalsById = new Map(
      withdrawals.map((item) => [String(item.requestId), item])
    );

    const pointsRows = Array.isArray(pointsData?.transactions)
      ? normalizePoints(pointsData.transactions)
      : [];

    const usdRows = Array.isArray(usdData?.transactions)
      ? normalizeUSD(usdData.transactions, withdrawalsById)
      : [];

    const extraWithdrawalRows = normalizeWithdrawals(
      withdrawals,
      usdRows
    );

    transactions = [
      ...pointsRows,
      ...usdRows,
      ...extraWithdrawalRows
    ].sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      return dateB - dateA;
    });

    $("pointsActivityCount").textContent = pointsRows.length;
    $("usdActivityCount").textContent = usdRows.length +
      extraWithdrawalRows.length;

    $("pendingTransactionCount").textContent = withdrawals.filter(
      (item) => pendingWithdrawalStatuses.has(item.status)
    ).length;

    searchElement.disabled = false;
    typeElement.disabled = false;
    statusElement.disabled = false;

    render();
    showLoadError(errors);
  }

  searchElement.addEventListener("input", render);
  typeElement.addEventListener("change", render);
  statusElement.addEventListener("change", render);

  loadTransactions().catch((error) => {
    console.error("Notes transaction page failed:", error);

    const heading = emptyElement.querySelector("h3");
    const message = emptyElement.querySelector("p");

    if (heading) heading.textContent = "Could not load transactions";
    if (message) {
      message.textContent =
        error.message || "An unexpected error occurred.";
    }
  });
})();
