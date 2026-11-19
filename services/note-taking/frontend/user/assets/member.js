"use strict";

(() => {
  const API = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  const usd = (cents) => Number.isSafeInteger(Number(cents))
    ? "$" + (Number(cents) / 100).toFixed(2)
    : "Not available";

  const date = (value) => {
    if (!value) return "Not recorded";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Not recorded"
      : parsed.toLocaleString();
  };

  const statusLabel = (value) => ({
    available: "Available",
    assigned: "In progress",
    submitted: "Awaiting review",
    approved: "Approved",
    completed: "Completed",
    rejected: "Changes required"
  }[value] || String(value || "Unknown").replaceAll("_", " "));

  async function api(path, options = {}) {
    if (!API) {
      throw new Error("API configuration did not load. Check /assets/js/config.js.");
    }

    const response = await fetch(API + path, {
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
      throw new Error(data.message || `Request failed (${response.status}).`);
    }

    return data;
  }

  function showMessage(text, isError = false) {
    let box = $("notesMemberMessage");

    if (!box) {
      box = document.createElement("div");
      box.id = "notesMemberMessage";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.style.cssText =
        "margin:16px 0;padding:12px 15px;border-radius:10px;" +
        "background:#edf4ff;color:#17365d;overflow-wrap:anywhere";

      const main = document.querySelector("main") || document.querySelector(".shell");
      if (main) main.prepend(box);
    }

    box.textContent = text;
    box.style.background = isError ? "#fff0f0" : "#edf4ff";
    box.style.color = isError ? "#8a2020" : "#17365d";
  }

  function audioMarkup(task) {
    if (!task.audioAvailable) {
      return "<span>Audio unavailable</span>";
    }

    return `
      <audio controls preload="none" crossorigin="use-credentials"
        aria-label="Audio for ${esc(task.title)}"
        src="${esc(API)}/notes/tasks/${encodeURIComponent(task.id)}/audio"
        style="display:block;width:min(280px,100%);margin-top:8px">
        Audio playback is not supported by this browser.
      </audio>`;
  }

  function toggleEmpty(tableBody, empty, hasRows) {
    if (tableBody) tableBody.hidden = !hasRows;
    if (empty) empty.hidden = hasRows;
  }

  async function loadAvailableTasks() {
    const rows = $("taskRows");
    const empty = $("emptyState");
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="5">Loading tasks…</td></tr>';

    try {
      const data = await api("/notes/tasks/available");
      const tasks = data.tasks || [];

      rows.innerHTML = tasks.map((task) => `
        <tr>
          <td>
            <strong>${esc(task.title)}</strong>
            <div>${esc(task.category || "General")}</div>
            ${audioMarkup(task)}
          </td>
          <td>
            ${esc(task.description || task.brief || task.expectedNotes || "See task requirements")}
          </td>
          <td>${esc(task.pointsCost)} Points</td>
          <td>${usd(task.rewardCents)}</td>
          <td>
            <button type="button" data-claim="${esc(task.id)}">
              Claim task
            </button>
          </td>
        </tr>
      `).join("");

      toggleEmpty(rows, empty, tasks.length > 0);
    } catch (error) {
      rows.innerHTML = "";
      toggleEmpty(rows, empty, false);
      showMessage(error.message, true);
    }
  }

  async function loadMyWork() {
    const rows = $("myWorkRows");
    const empty = $("emptyWork");
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="5">Loading your assignments…</td></tr>';

    try {
      const data = await api("/notes/tasks/mine");
      const tasks = data.assignments || [];

      rows.innerHTML = tasks.map((task) => {
        const active = task.status === "assigned" &&
          task.assignmentExpiresAt &&
          new Date(task.assignmentExpiresAt).getTime() > Date.now();

        const action = active
          ? `<button type="button" data-write="${esc(task.id)}">Write notes</button>`
          : task.status === "submitted"
            ? "Submitted for review"
            : task.status === "completed"
              ? "Completed"
              : "Assignment expired";

        return `
          <tr>
            <td>
              <strong>${esc(task.title)}</strong>
              <div>${esc(task.category || "General")}</div>
              ${audioMarkup(task)}
            </td>
            <td>${date(task.claimedAt)}</td>
            <td>${date(task.assignmentExpiresAt)}</td>
            <td>${esc(statusLabel(task.status))}</td>
            <td>${action}</td>
          </tr>
          <tr id="notes-form-row-${esc(task.id)}" hidden>
            <td colspan="5">
              <form data-submit-notes="${esc(task.id)}">
                <label for="notes-text-${esc(task.id)}">
                  Your completed notes
                </label>
                <textarea id="notes-text-${esc(task.id)}"
                  name="notesText" rows="8" maxlength="200000"
                  required style="display:block;width:100%;box-sizing:border-box;margin:8px 0"
                  placeholder="Write your notes here…"></textarea>
                <button type="submit">Submit notes</button>
                <button type="button" data-cancel-write="${esc(task.id)}">
                  Cancel
                </button>
              </form>
            </td>
          </tr>`;
      }).join("");

      toggleEmpty(rows, empty, tasks.length > 0);
    } catch (error) {
      rows.innerHTML = "";
      toggleEmpty(rows, empty, false);
      showMessage(error.message, true);
    }
  }

  async function loadSubmissions() {
    const rows = $("submissionRows");
    const empty = $("emptySubmissions");
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="5">Loading submission history…</td></tr>';

    try {
      const data = await api("/notes/tasks/submissions");
      const submissions = data.submissions || [];

      rows.innerHTML = submissions.map((item) => `
        <tr>
          <td>${esc(item.taskTitle)}</td>
          <td>${date(item.submittedAt)}</td>
          <td>${esc(statusLabel(item.status))}</td>
          <td>${esc(item.reviewNotes || "No reviewer feedback recorded.")}</td>
          <td>${item.status === "approved" ? usd(item.rewardCents) : "—"}</td>
        </tr>
      `).join("");

      toggleEmpty(rows, empty, submissions.length > 0);

      const counts = {
        submitted: submissions.filter((s) => s.status === "submitted").length,
        approved: submissions.filter((s) => s.status === "approved").length,
        rejected: submissions.filter((s) => s.status === "rejected").length
      };

      const stats = document.querySelectorAll(".stats .stat-value");
      if (stats[0]) stats[0].textContent = counts.submitted;
      if (stats[1]) stats[1].textContent = counts.approved;
      if (stats[2]) stats[2].textContent = counts.rejected;
    } catch (error) {
      rows.innerHTML = "";
      toggleEmpty(rows, empty, false);
      showMessage(error.message, true);
    }
  }

  document.addEventListener("click", async (event) => {
    const claim = event.target.closest("[data-claim]");
    const write = event.target.closest("[data-write]");
    const cancel = event.target.closest("[data-cancel-write]");

    if (claim) {
      const id = claim.dataset.claim;
      claim.disabled = true;

      try {
        await api(`/notes/tasks/${encodeURIComponent(id)}/claim`, {
          method: "POST",
          body: JSON.stringify({})
        });

        showMessage("Task claimed. It is now listed under My Work.");
        await loadAvailableTasks();
      } catch (error) {
        showMessage(error.message, true);
        claim.disabled = false;
      }
      return;
    }

    if (write) {
      const id = write.dataset.write;
      const row = $(`notes-form-row-${id}`);
      if (row) row.hidden = false;
      return;
    }

    if (cancel) {
      const row = $(`notes-form-row-${cancel.dataset.cancelWrite}`);
      if (row) row.hidden = true;
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-submit-notes]");
    if (!form) return;

    event.preventDefault();

    const id = form.dataset.submitNotes;
    const textarea = form.elements.namedItem("notesText");
    const notesText = String(textarea?.value || "").trim();

    if (!notesText) {
      showMessage("Write your notes before submitting.", true);
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await api(`/notes/tasks/${encodeURIComponent(id)}/submissions`, {
        method: "POST",
        body: JSON.stringify({ notesText })
      });

      showMessage("Notes submitted successfully.");
      await loadMyWork();
    } catch (error) {
      showMessage(error.message, true);
      if (submitButton) submitButton.disabled = false;
    }
  });


  async function loadNotesWallet() {
    const balance = $("availableBalance");
    const withdrawals = $("totalWithdrawals");
    const caption = $("balanceCaption");

    if (!balance || !withdrawals) return;

    balance.textContent = "Loading…";
    withdrawals.textContent = "Loading…";

    try {
      const data = await api("/notes/wallet/");
      const wallet = data.wallet || {};

      balance.textContent = usd(wallet.availableBalanceCents);
      withdrawals.textContent = usd(wallet.totalWithdrawalsCents || 0);

      if (caption) {
        caption.textContent = "Available Notes earnings in USD.";
      }
    } catch (error) {
      balance.textContent = "Unavailable";
      withdrawals.textContent = "Unavailable";
      if (caption) caption.textContent = "Your Notes wallet could not be loaded.";
      showMessage(error.message, true);
    }
  }

  function initializeNotesWallet() {
    const balance = $("availableBalance");
    const panel = $("withdrawalPanel");
    const toggle = $("toggleWithdrawForm");
    const form = $("notesWithdrawForm");
    const amount = $("withdrawAmount");
    const phone = $("withdrawPhone");
    const quoteBox = $("withdrawalQuote");
    const submit = $("submitNotesWithdrawal");
    const cancel = $("cancelNotesWithdrawal");

    if (!balance || !panel || !toggle || !form || !amount || !phone) return;

    loadNotesWallet();

    let quoteTimer = null;

    async function loadWithdrawalQuote(value) {
      const entered = String(value || "").trim();

      if (!entered) {
        quoteBox.textContent = "Enter an amount to view the estimated M-Pesa payout.";
        return;
      }

      quoteBox.textContent = "Calculating estimated payout…";

      try {
        const data = await api(
          "/notes/withdrawals/quote?amount=" + encodeURIComponent(entered)
        );

        if (data.minimumAmount != null) {
          amount.min = String(data.minimumAmount);
        }
        if (data.maximumAmount != null) {
          amount.max = String(data.maximumAmount);
        }

        if (data.payoutAmountKes == null) {
          quoteBox.textContent =
            `Minimum: $${Number(data.minimumAmount).toFixed(2)} · ` +
            `Maximum: $${Number(data.maximumAmount).toFixed(2)}. ` +
            "Enter an amount within these limits.";
          return;
        }

        quoteBox.textContent =
          `Estimated M-Pesa payout: KSh ${Number(data.payoutAmountKes).toLocaleString()}. ` +
          `Rate: KSh ${Number(data.exchangeRateKesPerUsd).toLocaleString()} per USD. ` +
          "The final payout uses the rate saved with your request.";
      } catch (error) {
        quoteBox.textContent = error.message;
      }
    }

    toggle.addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));

      if (!panel.hidden) {
        amount.focus();
        await loadWithdrawalQuote("0");
      }
    });

    amount.addEventListener("input", () => {
      if (quoteTimer) clearTimeout(quoteTimer);
      quoteTimer = setTimeout(() => loadWithdrawalQuote(amount.value), 350);
    });

    cancel.addEventListener("click", () => {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      form.reset();
      quoteBox.textContent = "Enter an amount to view the estimated M-Pesa payout.";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (submit.disabled) return;

      submit.disabled = true;
      submit.textContent = "Submitting…";

      try {
        const data = await api("/notes/withdrawals/", {
          method: "POST",
          body: JSON.stringify({
            amount: amount.value.trim(),
            phoneNumber: phone.value.trim()
          })
        });

        showMessage(
          data.message || "Your Notes withdrawal request has been submitted."
        );

        form.reset();
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");

        // The available balance is reduced when the request is reserved.
        // Completed withdrawals update only after a successful payout callback.
        await loadNotesWallet();
      } catch (error) {
        showMessage(error.message, true);
      } finally {
        submit.disabled = false;
        submit.textContent = "Submit withdrawal";
      }
    });
  }

  function initializeMemberPage() {
    if ($("taskRows")) loadAvailableTasks();
    if ($("myWorkRows")) loadMyWork();
    if ($("submissionRows")) loadSubmissions();
    if ($("availableBalance")) initializeNotesWallet();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMemberPage, {
      once: true
    });
  } else {
    initializeMemberPage();
  }
})();
