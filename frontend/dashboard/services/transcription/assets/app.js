"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const toggle = $(".menu-toggle");
  const menu = $(".menu");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".menu-wrap")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  $$("[data-year]").forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  const money = value => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const date = value => {
    if (!value) return "Not set";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Not set"
      : parsed.toLocaleString();
  };

  async function api(path, options = {}) {
    if (typeof window.PTW_API_BASE !== "string" ||
        !window.PTW_API_BASE.trim()) {
      throw new Error(
        "The API URL is not configured for this website."
      );
    }

    const response = await fetch(
      window.PTW_API_BASE.replace(/\/+$/, "") + path,
      {
        ...options,
        credentials: "include",
        headers: (() => {
          const headers = new Headers(options.headers || {});
          headers.set("Accept", "application/json");

          const isFormData =
            typeof FormData !== "undefined" &&
            options.body instanceof FormData;

          if (
            options.body &&
            !isFormData &&
            !headers.has("Content-Type")
          ) {
            headers.set("Content-Type", "application/json");
          }

          return headers;
        })()
      }
    );

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok || data.success === false) {
      const error = new Error(
        data.message || `Request failed (${response.status}).`
      );
      error.status = response.status;
      error.code = data.code;
      throw error;
    }

    return data;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    if (className) node.className = className;
    return node;
  }

  function addMessage(parent, message, isError = false) {
    const node = element("p", message, "notice");
    node.setAttribute("role", "status");
    if (isError) node.setAttribute("aria-live", "assertive");
    parent.replaceChildren(node);
    return node;
  }

  function makeSection(title, description) {
    const section = element("section", undefined, "panel");
    section.style.marginTop = "15px";
    section.append(
      element("h2", title),
      element("p", description)
    );
    return section;
  }

  function table(parent, headings, records) {
    const wrapper = element("div");
    wrapper.style.overflowX = "auto";

    const tableNode = element("table");
    const thead = element("thead");
    const headerRow = element("tr");

    headings.forEach(heading => {
      headerRow.append(element("th", heading));
    });

    thead.append(headerRow);
    tableNode.append(thead);

    const tbody = element("tbody");

    if (!records.length) {
      const row = element("tr");
      const cell = element("td", "No records to display yet.");
      cell.colSpan = headings.length;
      row.append(cell);
      tbody.append(row);
    } else {
      records.forEach(record => {
        const row = element("tr");
        record.forEach(value => {
          const cell = element("td");
          if (value instanceof Node) cell.append(value);
          else cell.textContent = value == null ? "—" : String(value);
          row.append(cell);
        });
        tbody.append(row);
      });
    }

    tableNode.append(tbody);
    wrapper.append(tableNode);
    parent.append(wrapper);
  }

  function insertSection(section) {
    const main = $("main");
    const footer = $("footer");
    if (main) main.insertBefore(section, footer || null);
  }

  async function loadDashboard() {
    const name = $("#memberName");
    const accountMessage = $("#accountMessage");
    const accountStatus = $("#accountStatus");
    const walletMessage = $("#walletMessage");
    const walletStatus = $("#walletStatus");
    const retry = $("#retryDashboard");

    if (retry) retry.disabled = true;

    try {
      if (typeof window.PTW_AUTH_API_ME !== "string") {
        throw new Error("The authentication API is not configured.");
      }

      if (accountMessage) accountMessage.textContent = "Checking your session…";

      const session = await api("/auth/me");
      const user = session.user;

      if (!user) throw new Error("The session response did not include a user.");

      if (name) {
        name.textContent = [
          user.firstName,
          user.lastName
        ].filter(v => typeof v === "string" && v.trim()).join(" ")
          || user.username || user.email || "Member";
      }

      if (accountMessage) accountMessage.textContent = "Your account session is verified.";
      if (accountStatus) accountStatus.textContent = "Signed in";

      const result = await api("/transcription/wallet");
      const wallet = result.wallet;

      if (!wallet || wallet.currency !== "USD") {
        throw new Error("The transcription wallet response is missing or not in USD.");
      }

      if ($("#availableBalance")) {
        $("#availableBalance").textContent = money(wallet.availableBalance);
      }
      if ($("#pendingEarnings")) {
        $("#pendingEarnings").textContent = money(wallet.pendingEarnings);
      }
      if ($("#totalEarnings")) {
        $("#totalEarnings").textContent = money(wallet.totalEarnings);
      }
      if (walletMessage) walletMessage.textContent = "Transcription wallet loaded from your signed-in account.";
      if (walletStatus) walletStatus.textContent = "Connected";
    } catch (error) {
      if (accountMessage) accountMessage.textContent = error.message;
      if (accountStatus) accountStatus.textContent =
        error.status === 401 ? "Signed out" : "Connection error";

      if (walletMessage) walletMessage.textContent = error.message;
      if (walletStatus) walletStatus.textContent = "Not connected";

      ["availableBalance", "pendingEarnings", "totalEarnings"].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.textContent = "USD unavailable";
      });
    } finally {
      if (retry) retry.disabled = false;
    }
  }

  async function loadDashboardJobsPreview() {
    const list = $("#dashboardJobsList");
    if (!list) return;

    addMessage(list, "Loading available jobs…");

    try {
      const result = await api("/transcription/jobs?limit=4");
      const jobs = Array.isArray(result.jobs) ? result.jobs.slice(0, 4) : [];

      list.replaceChildren();

      if (!jobs.length) {
        addMessage(list, "There are no open transcription jobs at the moment.");
        return;
      }

      jobs.forEach(job => {
        const card = element("article", undefined, "card");
        card.append(
          element("h3", "Audio"),
          element("p", job.requiredTranscript || "Required transcript not specified."),
          element("p", `Duration: ${Number(job.durationMinutes) || 0} minutes`),
          element("p", `Reward: ${money(job.reward)}`),
          element("p", `Deadline: ${date(job.dueAt)}`)
        );
        list.append(card);
      });
    } catch (error) {
      addMessage(list, `Could not load available jobs: ${error.message}`, true);
    }
  }

  async function loadAvailableJobs() {
    const content = element("div", undefined, "available-jobs-content");
    content.style.marginTop = "18px";
    content.setAttribute("aria-label", "Available transcription assignments");

    const pageMain = $("main");
    if (pageMain) {
      const intro = pageMain.querySelector("h1");
      const introSection = intro?.closest("section");
      if (introSection) {
        introSection.insertAdjacentElement("afterend", content);
      } else {
        pageMain.prepend(content);
      }
    } else {
      document.body.append(content);
    }

    addMessage(content, "Loading available jobs…");

    function renderDetails(job, panel) {
      const heading = element("h3", "Audio");
      const details = element("div", undefined, "job-detail-grid");

      [
        ["Required transcript", job.requiredTranscript || "Not specified"],
        ["Audio length", Number.isFinite(Number(job.durationMinutes))
          ? `${Number(job.durationMinutes)} minutes`
          : "Not specified"],
        ["Reward", money(job.reward)],
        ["Published deadline", date(job.dueAt)],
        ["Assignment window", "1 hour after claiming"]
      ].forEach(([label, value]) => {
        const item = element("div", undefined, "job-detail-item");
        item.append(
          element("span", label, "job-detail-label"),
          element("strong", value)
        );
        details.append(item);
      });

            const audioSection = element("div", undefined, "job-audio-panel");
      audioSection.append(
        element("h4", "Source audio"),
        element(
          "p",
          "Audio playback is available when the jobs API supplies an audio URL."
        )
      );

      const audioUrl = typeof job.audioAssetUrl === "string"
        ? job.audioAssetUrl.trim()
        : "";

      if (audioUrl) {
        try {
          const parsed = new URL(audioUrl, window.location.href);
          if (["https:", "http:"].includes(parsed.protocol)) {
            const audio = element("audio");
            audio.controls = true;
            audio.preload = "none";
            audio.src = parsed.href;
            audio.className = "job-source-audio";
            audio.setAttribute("aria-label", "Source audio player");
            audioSection.append(audio);
          } else {
            audioSection.append(element("p", "Source audio URL is unsupported."));
          }
        } catch {
          audioSection.append(element("p", "Source audio URL is invalid."));
        }
      } else {
        audioSection.append(
          element("p", "Source audio is not provided by the current jobs API.")
        );
      }

      const panelHeading = element("div", undefined, "job-details-heading");
      panelHeading.append(
        element("div", undefined, "job-details-title-wrap")
      );
      panelHeading.firstChild.append(
        element("span", "JOB DETAILS", "eyebrow"),
        heading
      );

      const close = element("button", "Close details", "btn blue");
      close.type = "button";
      close.addEventListener("click", () => {
        panel.hidden = true;
        panel.replaceChildren();
      });

      panelHeading.append(close);
      panel.replaceChildren(
        panelHeading,
        details,
        audioSection
      );
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function refresh() {
      addMessage(content, "Loading available jobs…");

      try {
        const result = await api("/transcription/jobs");
        const jobs = Array.isArray(result.jobs) ? result.jobs : [];
        content.replaceChildren();

        if (!jobs.length) {
          addMessage(content, "There are no open transcription jobs at the moment.");
          return;
        }

        const detailsPanel = element("section", undefined, "job-details-panel");
        detailsPanel.hidden = true;
        detailsPanel.setAttribute("aria-live", "polite");

        const records = jobs.map(job => {
          const title = element("strong", "Audio");
          const titleCell = element("div");
          titleCell.append(title);

          const view = element("button", "View job", "btn blue");
          view.type = "button";
          view.addEventListener("click", () => renderDetails(job, detailsPanel));

          const claim = element("button", "Claim assignment", "btn orange");
          claim.type = "button";

          claim.addEventListener("click", async () => {
            claim.disabled = true;
            claim.textContent = "Claiming…";

            try {
              await api(
                `/transcription/jobs/${encodeURIComponent(job.id)}/claim`,
                { method: "POST" }
              );
              claim.textContent = "Claimed";
              await refresh();
            } catch (error) {
              claim.disabled = false;
              claim.textContent = "Claim assignment";
              window.alert(error.message);
            }
          });

          return [
            titleCell,
            job.requiredTranscript || "Not specified",
            Number.isFinite(Number(job.durationMinutes))
              ? `${Number(job.durationMinutes)} min`
              : "Not specified",
            money(job.reward),
            view,
            claim
          ];
        });

        table(
          content,
          [
            "Category",
            "Required transcript",
            "Audio length",
            "Amount (USD)",
            "View job",
            "Claim assignment"
          ],
          records
        );

        content.append(detailsPanel);
      } catch (error) {
        addMessage(content, `Could not load available jobs: ${error.message}`, true);
      }
    }

    await refresh();
  }

  async function loadMyJobs() {
    const jobsSection = makeSection(
      "My assignments",
      "Play assigned audio, review instructions and submit your transcript. Rejected work can be revised."
    );
    const jobsContent = element("div");
    jobsSection.append(jobsContent);
    insertSection(jobsSection);

    const submissionsSection = makeSection(
      "My submissions",
      "Submission history and review feedback from the transcription team."
    );
    const submissionsContent = element("div");
    submissionsSection.append(submissionsContent);
    insertSection(submissionsSection);

    async function refresh() {
      addMessage(jobsContent, "Loading your assignments…");
      addMessage(submissionsContent, "Loading your submissions…");

      try {
        const [jobResult, submissionResult] = await Promise.all([
          api("/transcription/my-jobs"),
          api("/transcription/submissions")
        ]);

        const jobs = Array.isArray(jobResult.jobs) ? jobResult.jobs : [];
        const submissions = Array.isArray(submissionResult.submissions)
          ? submissionResult.submissions : [];

        jobsContent.replaceChildren();

        if (!jobs.length) {
          addMessage(jobsContent, "No assignments are currently linked to your account.");
        } else {
          table(jobsContent,
            ["Assignment", "Duration", "Reward (USD)", "Status", "Deadline", "Work"],
            jobs.map(job => {
              const details = element("div");
              details.append(
                element("strong", "Audio"),
                element("p", "Required transcript: " + (job.requiredTranscript || "Not specified"))
              );

              if (["awarded", "submitted"].includes(job.status)) {
                const audio = element("audio");
                audio.controls = true;
                audio.preload = "none";
                audio.crossOrigin = "use-credentials";
                audio.setAttribute("aria-label", "Audio");
                audio.style.display = "block";
                audio.style.width = "min(100%, 420px)";
                audio.style.marginTop = "10px";
                audio.src =
                  window.PTW_API_BASE.replace(/\/+$/, "") +
                  "/transcription/jobs/" +
                  encodeURIComponent(job.id) +
                  "/audio";
                details.append(audio);
              }

              let work = element("span", "No submission action for this status.");

              if (job.status === "awarded") {
                work = element("div");
                const portalLink = element(
                  "a",
                  "Open submission workspace"
                );
                portalLink.href =
                  "submission?job=" +
                  encodeURIComponent(job.id);
                portalLink.className = "btn";
                portalLink.setAttribute(
                  "aria-label",
                  "Open Audio submission workspace"
                );
                work.append(portalLink);
              } else if (job.status === "submitted") {
                work = element("span", "Submitted for review");
              } else if (job.status === "completed") {
                work = element("span", "Completed");
              }

              return [
                details,
                `${job.durationMinutes} minutes`,
                money(job.reward),
                job.status || "Unknown",
                date(job.dueAt),
                work
              ];
            })
          );
        }

        submissionsContent.replaceChildren();
        table(submissionsContent,
          ["Audio", "Status", "Reward (USD)", "Review note", "Submitted"],
          submissions.map(item => [
            "Audio",
            item.status,
            money(item.reward),
            item.reviewNote || "No review note",
            date(item.createdAt)
          ])
        );
      } catch (error) {
        addMessage(jobsContent, error.message, true);
        addMessage(submissionsContent, error.message, true);
      }
    }

    await refresh();
  }

  async function loadWalletPage() {
    const main = $("main");
    if (!main) return;

    const cards = $$(".card", main);
    const firstMetric = $(".metric", cards[0] || document);
    if (firstMetric) firstMetric.id = "walletAvailableBalance";

    const formSection = makeSection(
      "Request a withdrawal",
      "Withdrawals are requests for manual review. Submitting a request does not mean payment has been sent."
    );
    const form = element("form");
    const amountLabel = element("label", "Amount (USD)");
    amountLabel.htmlFor = "withdrawAmount";
    const amount = element("input");
    amount.id = "withdrawAmount";
    amount.name = "amount";
    amount.type = "number";
    amount.min = "1.00";
    amount.step = "0.01";
    amount.required = true;

    const phoneLabel = element("label", "Kenyan M-Pesa phone number");
    phoneLabel.htmlFor = "withdrawPhone";
    const phone = element("input");
    phone.id = "withdrawPhone";
    phone.name = "phoneNumber";
    phone.type = "tel";
    phone.placeholder = "07XXXXXXXX or 2547XXXXXXXX";
    phone.required = true;

    const submit = element("button", "Request withdrawal", "btn gold");
    submit.type = "submit";
    const formMessage = element("p");
    formMessage.setAttribute("role", "status");

    form.append(amountLabel, amount, phoneLabel, phone, submit, formMessage);
    formSection.append(form);
    insertSection(formSection);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      submit.disabled = true;
      formMessage.textContent = "Submitting request…";

      try {
        const result = await api("/transcription/wallet/withdrawals", {
          method: "POST",
          body: JSON.stringify({
            amount: amount.value,
            phoneNumber: phone.value.trim()
          })
        });

        formMessage.textContent = result.message || "Withdrawal request recorded for review.";
        form.reset();
        await loadWalletData();
      } catch (error) {
        formMessage.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });

    const transactionsSection = makeSection(
      "Wallet transactions",
      "Recorded transcription wallet movements. All amounts are USD."
    );
    const transactionsContent = element("div");
    transactionsSection.append(transactionsContent);
    insertSection(transactionsSection);

    const withdrawalsSection = makeSection(
      "Withdrawal history",
      "Review the status of your submitted withdrawal requests."
    );
    const withdrawalsContent = element("div");
    withdrawalsSection.append(withdrawalsContent);
    insertSection(withdrawalsSection);

    async function loadWalletData() {
      try {
        const result = await api("/transcription/wallet");
        const wallet = result.wallet;

        if (!wallet || wallet.currency !== "USD") {
          throw new Error("The transcription wallet response is missing or not in USD.");
        }

        const metric = $("#walletAvailableBalance");
        if (metric) metric.textContent = money(wallet.availableBalance);

        const cards = $$(".card", main);
        if (cards[1]) {
          const status = $(".status", cards[1]);
          if (status) status.textContent = "Connected";
          const description = $("p", cards[1]);
          if (description) description.textContent =
            `Available: ${money(wallet.availableBalance)} · Pending earnings: ${money(wallet.pendingEarnings)} · Total earnings: ${money(wallet.totalEarnings)} · Total withdrawals: ${money(wallet.totalWithdrawals)}`;
        }

        const [transactionResult, withdrawalResult] = await Promise.all([
          api("/transcription/wallet/transactions"),
          api("/transcription/wallet/withdrawals")
        ]);

        transactionsContent.replaceChildren();
        table(transactionsContent,
          ["Type", "Amount (USD)", "Status", "Date"],
          (transactionResult.transactions || []).map(item => [
            String(item.reference || "").toUpperCase().startsWith("TRANSCRIPTION-EARNING-")
              ? "TRANSCRIPTION EARNING" : item.type,
            money(item.amount),
            item.status,
            date(item.createdAt)
          ])
        );

        withdrawalsContent.replaceChildren();
        table(withdrawalsContent,
          ["Request", "Amount (USD)", "Phone", "Status", "Receipt", "Date"],
          (withdrawalResult.withdrawals || []).map(item => [
            item.requestId || item.id,
            money(item.amount),
            item.phoneNumber,
            item.status,
            item.mpesaReceipt || "Not recorded",
            date(item.createdAt)
          ])
        );
      } catch (error) {
        addMessage(transactionsContent, error.message, true);
        addMessage(withdrawalsContent, error.message, true);
      }
    }

    await loadWalletData();
  }

  async function loadPayoutsPage() {
    const main = $("main");
    if (!main) return;

    const cards = $$(".card", main);
    const metrics = cards.map(card => $(".metric", card));

    const history = makeSection(
      "Withdrawal history",
      "Requests and recorded payment statuses from your transcription wallet."
    );
    const historyContent = element("div");
    history.append(historyContent);
    insertSection(history);

    const transactions = makeSection(
      "Earnings and wallet activity",
      "Recorded wallet movements. Approved earnings and paid withdrawals are different figures."
    );
    const transactionContent = element("div");
    transactions.append(transactionContent);
    insertSection(transactions);

    addMessage(historyContent, "Loading payout history…");
    addMessage(transactionContent, "Loading wallet activity…");

    try {
      const [walletResult, withdrawalResult, transactionResult] = await Promise.all([
        api("/transcription/wallet"),
        api("/transcription/wallet/withdrawals"),
        api("/transcription/wallet/transactions")
      ]);

      const wallet = walletResult.wallet;
      if (!wallet || wallet.currency !== "USD") {
        throw new Error("The transcription wallet response is missing or not in USD.");
      }

      const withdrawals = Array.isArray(withdrawalResult.withdrawals)
        ? withdrawalResult.withdrawals : [];
      const ledger = Array.isArray(transactionResult.transactions)
        ? transactionResult.transactions : [];

      const pendingAmount = withdrawals
        .filter(item => ["pending_review", "pending"].includes(item.status))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      const paidAmount = withdrawals
        .filter(item => item.status === "paid")
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      if (metrics[0]) metrics[0].textContent = money(wallet.totalEarnings);
      if (metrics[1]) metrics[1].textContent = money(pendingAmount);
      if (metrics[2]) metrics[2].textContent = money(paidAmount);

      historyContent.replaceChildren();
      table(historyContent,
        ["Request", "Amount (USD)", "Phone", "Status", "Receipt", "Date"],
        withdrawals.map(item => [
          item.requestId || item.id,
          money(item.amount),
          item.phoneNumber,
          item.status,
          item.mpesaReceipt || "Not recorded",
          date(item.createdAt)
        ])
      );

      transactionContent.replaceChildren();
      table(transactionContent,
        ["Type", "Amount (USD)", "Status", "Date"],
        ledger.map(item => [
          String(item.reference || "").toUpperCase().startsWith("TRANSCRIPTION-EARNING-")
            ? "TRANSCRIPTION EARNING" : item.type,
          money(item.amount),
          item.status,
          date(item.createdAt)
        ])
      );
    } catch (error) {
      addMessage(historyContent, error.message, true);
      addMessage(transactionContent, error.message, true);
    }
  }

  const page = location.pathname.replace(/\/+$/, "").split("/").pop();
  async function enforcePurchaseMinutesAccess() {
    const purchaseLinks = Array.from(
      document.querySelectorAll('a[href$="/purchase-minutes"]')
    );
    const purchasePage = page === "purchase-minutes";
    const purchaseMain = purchasePage
      ? document.querySelector("main")
      : null;

    // Hide links immediately while membership status is checked.
    purchaseLinks.forEach(link => {
      link.style.display = "none";
    });

    if (purchaseMain) {
      purchaseMain.style.display = "none";
    }

    try {
      const result = await api("/membership");
      const allowed =
        result &&
        result.success === true &&
        Array.isArray(result.allowedServices) &&
        result.allowedServices.includes("transcription");

      if (!allowed) {
        if (purchasePage) {
          location.replace("/dashboard/services/transcription");
        }
        return;
      }

      purchaseLinks.forEach(link => {
        link.style.display = "";
      });

      if (purchaseMain) {
        purchaseMain.style.display = "";
      }
    } catch (error) {
      // Fail closed if membership cannot be verified.
      if (purchasePage) {
        location.replace("/dashboard/services/transcription");
      }
    }
  }


  enforcePurchaseMinutesAccess();

  const retryDashboard = $("#retryDashboard");

  if (retryDashboard) {
    retryDashboard.addEventListener("click", loadDashboard);
  }

  if (page === "transcription" || page === "index.html" || page === "") {
    loadDashboard();
    loadDashboardJobsPreview();
  }

  if (page === "available-jobs") loadAvailableJobs();
  if (page === "my-jobs") loadMyJobs();
  if (page === "wallet") loadWalletPage();
  if (page === "payouts") loadPayoutsPage();
})();
