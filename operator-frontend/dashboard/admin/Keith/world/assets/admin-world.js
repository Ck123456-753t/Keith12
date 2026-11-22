"use strict";

(() => {
  const navigation = document.getElementById("world-navigation");
  const menu = document.getElementById("world-menu");
  const toggle = document.getElementById("menu-toggle");
  const content = document.getElementById("world-content");
  const clock = document.getElementById("world-clock");
  const date = document.getElementById("world-date");

  if (!navigation || !menu || !toggle || !content) {
    console.error("Admin World: required page elements are missing.");
    return;
  }

  const sections = [
    {
      id: "overview",
      name: "Platform Overview",
      icon: "◈",
      description: "Whole-platform operational summary",
      detail: "A central view of PrimeTask Workspace activity, service availability, account statistics and platform operations."
    },
    {
      id: "users",
      name: "User Directory",
      icon: "♙",
      description: "Accounts, roles and user activity",
      detail: "Search and inspect user accounts, roles, account status, registration dates and recorded activity."
    },
    {
      id: "api",
      name: "API Request Explorer",
      icon: "⌘",
      description: "Endpoints, requests and responses",
      detail: "Investigate incoming API requests, HTTP methods, endpoint paths, response codes, request duration and trace identifiers."
    },
    {
      id: "ip-origin",
      name: "IP and Origin Intelligence",
      icon: "◎",
      description: "IP addresses and request origins",
      detail: "Inspect observed client IP addresses, trusted proxy information, browser origins, referrers and approximate IP-based geography."
    },
    {
      id: "devices",
      name: "Device Registry",
      icon: "▣",
      description: "Registered browser devices",
      detail: "Inspect registered devices, device status, registration history, last activity and associated account records."
    },
    {
      id: "security",
      name: "Security Center",
      icon: "⛨",
      description: "Security events and device controls",
      detail: "Monitor device transfers, global device bans, security events and event-chain integrity."
    },
    {
      id: "authentication",
      name: "Authentication Monitor",
      icon: "⌑",
      description: "Login, logout and sessions",
      detail: "Investigate authentication activity, login failures, session events and account security changes."
    },
    {
      id: "errors",
      name: "Failed Requests and Errors",
      icon: "⚠",
      description: "Failed API calls and server errors",
      detail: "Review failed requests, server exceptions, error classifications and recurring failure patterns."
    },
    {
      id: "rate-limits",
      name: "Rate Limit Monitor",
      icon: "◷",
      description: "Request limits and blocked traffic",
      detail: "Inspect rate-limit events, blocked requests, affected routes and repeated request patterns."
    },
    {
      id: "admin-history",
      name: "Admin Action History",
      icon: "↺",
      description: "Administrator operations",
      detail: "Review administrative actions, the responsible administrator, affected records, timestamps and recorded reasons."
    },
    {
      id: "health",
      name: "Backend and Database Health",
      icon: "▤",
      description: "Services and infrastructure",
      detail: "Monitor backend availability, database connectivity, service response times and infrastructure health."
    },
    {
      id: "audit",
      name: "Audit Logs",
      icon: "▥",
      description: "Recorded platform events",
      detail: "Search security and operational audit records with filters for actor, event type, affected resource and date."
    },
    {
      id: "configuration",
      name: "Platform Configuration",
      icon: "⚙",
      description: "System settings and controls",
      detail: "Inspect authorized platform configuration, operational settings and controlled administrative changes."
    }
  ];

  const moduleStatus = {
    overview: "Live platform overview",
    users: "Live user directory",
    api: "Live API request telemetry",
    "ip-origin": "Live IP and client-signature records",
    devices: "Live device registry and security APIs",
    security: "Live security events and device controls",
    authentication: "Live authentication event monitor",
    errors: "Live failed-request telemetry",
    "rate-limits": "Live recorded rate-limit events (limited coverage)",
    "admin-history": "Live recorded admin actions",
    health: "Live API and database connectivity checks",
    audit: "Live AdminAuditLog records",
    configuration: "Live read-only platform settings"
  };

  let activeSection = "overview";

  const userDirectoryState = {
    page: 1,
    query: "",
    status: ""
  };


  const API_BASE = String(window.PTW_API_BASE || "").replace(/\/+$/, "");

  async function apiRequest(endpoint, allowConflict = false, includeMeta = false) {
    if (!API_BASE) {
      throw new Error("API base URL is not configured.");
    }

    const response = await fetch(API_BASE + endpoint, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok && !(allowConflict && response.status === 409)) {
      if (response.status === 401) {
        throw new Error("Admin session missing or expired. Sign in again.");
      }
      if (response.status === 403) {
        throw new Error("Administrator access is required.");
      }
      throw new Error(
        payload.message || `Backend request failed (${response.status}).`
      );
    }

    if (payload.success === false && !(allowConflict && response.status === 409)) {
      throw new Error(payload.message || "The backend rejected the request.");
    }

    return includeMeta ? payload : (payload.data || {});
  }

  function displayDate(value) {
    if (!value) return "Not available";

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Not available"
      : parsed.toLocaleString();
  }

  function addNotice(parent, message, kind = "info") {
    const notice = createElement("div", "world-data-notice", message);
    notice.dataset.kind = kind;
    parent.append(notice);
    return notice;
  }

  function addMetrics(parent, metrics) {
    const grid = createElement("div", "world-data-grid");

    metrics.forEach(([label, value]) => {
      const card = createElement("article", "world-data-card");
      card.append(
        createElement("span", "world-data-label", label),
        createElement("strong", "world-data-value", String(value))
      );
      grid.append(card);
    });

    parent.append(grid);
  }

  function addTable(parent, headings, rows, emptyMessage) {
    const wrapper = createElement("div", "world-table-wrap");

    if (!rows.length) {
      addNotice(wrapper, emptyMessage);
      parent.append(wrapper);
      return;
    }

    const table = createElement("table", "world-data-table");
    const thead = createElement("thead");
    const headerRow = createElement("tr");

    headings.forEach(heading => {
      headerRow.append(createElement("th", "", heading));
    });

    thead.append(headerRow);

    const tbody = createElement("tbody");

    rows.forEach(row => {
      const tr = createElement("tr");

      row.forEach(value => {
        tr.append(createElement("td", "", value));
      });

      tbody.append(tr);
    });

    table.append(thead, tbody);
    wrapper.append(table);
    parent.append(wrapper);
  }

  function deviceName(device) {
    return device && device.deviceLabel
      ? device.deviceLabel
      : "Unlabelled browser";
  }

  function deviceIdentitySummary(device) {
    if (!device || typeof device !== "object") {
      return "Device details unavailable";
    }

    const parts = [
      [device.manufacturer, device.deviceModel].filter(Boolean).join(" "),
      [device.platform, device.osVersion].filter(Boolean).join(" "),
      [device.browser, device.browserVersion].filter(Boolean).join(" "),
      device.deviceType
    ].filter(value => value && value !== "Unknown");

    return parts.length ? parts.join(" | ") : "Identity details not reported";
  }

  function userName(user) {
    if (!user || typeof user !== "object") return "Unknown account";

    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return fullName || user.username || user.email || "Unknown account";
  }

  function formatUSD(value) {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD"
        }).format(amount)
      : "Unavailable";
  }

  async function loadUsers(target, requestedPage = 1) {
    userDirectoryState.page = Math.max(1, requestedPage);

    target.replaceChildren();

    const toolbar = createElement("form", "world-filter-bar");
    const search = createElement("input", "world-filter-input");
    search.type = "search";
    search.placeholder = "Search name, username, email or phone";
    search.value = userDirectoryState.query;
    search.setAttribute("aria-label", "Search user accounts");

    const statusFilter = createElement("select", "world-filter-select");
    statusFilter.setAttribute("aria-label", "Filter account status");

    [
      ["", "All account statuses"],
      ["active", "Active"],
      ["suspended", "Suspended"]
    ].forEach(([value, label]) => {
      const option = createElement("option", "", label);
      option.value = value;
      statusFilter.append(option);
    });

    statusFilter.value = userDirectoryState.status;

    const searchButton = createElement("button", "world-filter-button", "Search");
    searchButton.type = "submit";

    toolbar.append(search, statusFilter, searchButton);

    toolbar.addEventListener("submit", event => {
      event.preventDefault();
      userDirectoryState.query = search.value.trim();
      userDirectoryState.status = statusFilter.value;
      loadUsers(target, 1);
    });

    target.append(toolbar);
    addNotice(target, "Loading user accounts…");

    try {
      const params = new URLSearchParams({
        page: String(userDirectoryState.page),
        limit: "25"
      });

      if (userDirectoryState.query) {
        params.set("q", userDirectoryState.query);
      }

      if (userDirectoryState.status) {
        params.set("status", userDirectoryState.status);
      }

      const payload = await apiRequest(
        `/admin/users?${params.toString()}`,
        false,
        true
      );

      const users = Array.isArray(payload.data) ? payload.data : [];
      const pagination = payload.pagination || {};
      const total = Number(pagination.total || 0);
      const page = Number(pagination.page || userDirectoryState.page);
      const pages = Number(pagination.pages || 0);

      target.replaceChildren(toolbar);

      addMetrics(target, [
        ["Matching accounts", total],
        ["Accounts displayed", users.length],
        ["Current page", pages ? `${page} / ${pages}` : "0 / 0"]
      ]);

      addTable(
        target,
        [
          "Account",
          "Username",
          "Email",
          "Phone",
          "Role",
          "Status",
          "Verified",
          "Available USD",
          "Membership",
          "Last login"
        ],
        users.map(user => [
          user.fullName || user.username || "Unknown",
          user.username || "Not available",
          user.email || "Not available",
          user.phone || "Not available",
          user.role || "Unknown",
          user.status || "Unknown",
          user.emailVerified ? "Yes" : "No",
          formatUSD(user.wallet?.availableBalance),
          user.membership
            ? `${user.membership.plan || "Plan"} (${user.membership.status})`
            : "No membership",
          displayDate(user.lastLoginAt)
        ]),
        "No user accounts matched this search."
      );

      const paginationBar = createElement("div", "world-pagination");
      const previous = createElement(
        "button",
        "world-filter-button",
        "Previous"
      );
      const next = createElement(
        "button",
        "world-filter-button",
        "Next"
      );
      const pageLabel = createElement(
        "span",
        "world-page-label",
        `Page ${page} of ${pages}`
      );

      previous.type = "button";
      next.type = "button";
      previous.disabled = page <= 1;
      next.disabled = page >= pages || pages === 0;

      previous.addEventListener("click", () => {
        loadUsers(target, page - 1);
      });

      next.addEventListener("click", () => {
        loadUsers(target, page + 1);
      });

      paginationBar.append(previous, pageLabel, next);
      target.append(paginationBar);

      if (!total) {
        addNotice(target, "The backend returned no matching accounts.");
      }
    } catch (error) {
      target.replaceChildren(toolbar);
      addNotice(target, error.message, "error");
    }
  }

  async function loadDevices(target) {
    addNotice(target, "Loading registered devices…");

    const data = await apiRequest("/admin/security/devices?limit=100");
    const devices = Array.isArray(data.devices) ? data.devices : [];

    target.replaceChildren();

    const active = devices.filter(item => item.status === "active").length;
    const banned = devices.filter(item => item.status === "banned").length;

    addMetrics(target, [
      ["Devices returned", devices.length],
      ["Active devices", active],
      ["Banned devices", banned]
    ]);

    addTable(
      target,
      ["Device", "Manufacturer / model", "Platform / OS", "Browser", "Type", "Status", "Last seen", "Last known IP"],
      devices.map(device => [
        deviceName(device),
        [device.manufacturer, device.deviceModel].filter(Boolean).join(" ") || "Not reported",
        [device.platform, device.osVersion].filter(Boolean).join(" ") || "Not reported",
        [device.browser, device.browserVersion].filter(Boolean).join(" ") || "Not reported",
        device.deviceType || "Unknown",
        device.status || "Unknown",
        displayDate(device.lastSeenAt),
        device.lastKnownIp || "Not available"
      ]),
      "No registered devices were returned by the backend."
    );
  }

  async function loadSecurity(target) {
    addNotice(target, "Checking security chain and pending device transfers…");

    const results = await Promise.allSettled([
      apiRequest("/admin/security/chain/verify", true),
      apiRequest("/admin/security/devices/transfers?limit=100")
    ]);

    target.replaceChildren();

    const chainResult = results[0];
    const transfersResult = results[1];

    if (chainResult.status === "fulfilled") {
      const chain = chainResult.value;
      const valid = chain.valid === true;

      addMetrics(target, [
        ["Security chain", valid ? "Valid" : "Integrity issue"],
        ["Events checked", Number(chain.checkedEvents || 0)],
        ["Chain status", chain.status || "Not reported"]
      ]);

      if (!valid) {
        addNotice(
          target,
          chain.reason || "The security chain did not report a valid result.",
          "error"
        );
      } else {
        addNotice(target, "Security event chain verification passed.", "success");
      }
    } else {
      addNotice(
        target,
        `Security-chain check failed: ${chainResult.reason.message}`,
        "error"
      );
    }

    if (transfersResult.status === "fulfilled") {
      const requests = Array.isArray(transfersResult.value.requests)
        ? transfersResult.value.requests
        : [];

      addNotice(
        target,
        `Pending device transfers returned: ${requests.length}`,
        "info"
      );

      addTable(
        target,
        ["Account", "Old device", "Old identity details", "Proposed device", "Proposed identity details", "Requested"],
        requests.map(item => [
          userName(item.userId),
          deviceName(item.oldDeviceId),
          deviceIdentitySummary(item.oldDeviceId),
          deviceName(item.proposedDeviceId),
          deviceIdentitySummary(item.proposedDeviceId),
          displayDate(item.createdAt)
        ]),
        "There are no pending device-transfer requests."
      );
    } else {
      addNotice(
        target,
        `Device-transfer lookup failed: ${transfersResult.reason.message}`,
        "error"
      );
    }
  }

  async function loadOverview(target) {
    target.replaceChildren();
    addNotice(target, "Retrieving live platform overview…");

    try {
      const payload = await apiRequest("/admin/overview", false, true);
      const stats = payload.stats || {};
      const queues = payload.queues || {};

      target.replaceChildren();

      const metric = (key) =>
        Number.isFinite(Number(stats[key]))
          ? Number(stats[key]).toLocaleString()
          : "Unavailable";

      addMetrics(target, [
        ["Total users", metric("totalUsers")],
        ["Active users", metric("activeUsers")],
        ["Inactive users", metric("inactiveUsers")],
        ["Suspended users", metric("suspendedUsers")],
        ["Admin accounts", metric("adminUsers")],
        ["Active memberships", metric("activeMemberships")],
        ["Live member accounts", metric("liveMemberAccounts")],
        ["Membership plans", metric("totalMembershipPlans")],
        ["Active plans", metric("activeMembershipPlans")],
        ["Pending deposits", metric("pendingDeposits")],
        ["Pending purchases", metric("pendingPurchases")],
        ["Awaiting fulfilment", metric("verifiedPurchasesAwaitingFulfilment")],
        ["Withdrawals awaiting review", metric("withdrawalsAwaitingReview")]
      ]);

      const amountUSD = (cents) => {
        const value = Number(cents);
        return Number.isFinite(value)
          ? formatUSD(value / 100)
          : "Unavailable";
      };

      const list = (value) => Array.isArray(value) ? value : [];

      const deposits = list(queues.deposits);
      const purchases = list(queues.membershipPurchases);
      const fulfilment = list(queues.membershipPurchasesAwaitingFulfilment);
      const withdrawals = list(queues.withdrawals);

      addNotice(target, "Pending deposit requests", "info");
      addTable(
        target,
        ["Account", "Amount (USD)", "Status", "Date"],
        deposits.map(item => [
          userName(item.userId),
          amountUSD(item.amountCents),
          item.status || "Unavailable",
          displayDate(item.createdAt)
        ]),
        "No pending deposit requests."
      );

      addNotice(target, "Membership purchases requiring verification", "info");
      addTable(
        target,
        ["Account", "Plan", "Amount (USD)", "Payment status", "Date"],
        purchases.map(item => [
          userName(item.purchaserUserId),
          item.planKey || "Unavailable",
          amountUSD(item.priceCents),
          item.paymentStatus || "Unavailable",
          displayDate(item.createdAt)
        ]),
        "No membership purchases awaiting verification."
      );

      addNotice(target, "Verified purchases awaiting fulfilment", "info");
      addTable(
        target,
        ["Account", "Plan", "Amount (USD)", "Payment status", "Date"],
        fulfilment.map(item => [
          userName(item.purchaserUserId),
          item.planKey || "Unavailable",
          amountUSD(item.priceCents),
          item.paymentStatus || "Unavailable",
          displayDate(item.createdAt)
        ]),
        "No verified purchases awaiting fulfilment."
      );

      addNotice(target, "Withdrawals awaiting review", "info");
      addTable(
        target,
        ["Account", "Amount (USD)", "Status", "Date"],
        withdrawals.map(item => [
          userName(item.userId),
          amountUSD(item.amountCents),
          item.status || "Unavailable",
          displayDate(item.createdAt)
        ]),
        "No withdrawals awaiting review."
      );

      addNotice(
        target,
        `Live platform overview generated ${displayDate(payload.generatedAt)}.`,
        "success"
      );
    } catch (error) {
      target.replaceChildren();
      addNotice(target, error.message, "error");
    }
  }

  async function loadApiExplorer(target) {
    const data = await apiRequest("/admin/api-requests/overview");

    target.replaceChildren();

    addMetrics(target, [
      ["Total API requests", data.totalRequests ?? 0],
      ["Unique endpoints", data.uniqueEndpoints ?? 0],
      ["Users recorded", data.uniqueUsers ?? 0],
      ["IP addresses", data.uniqueIps ?? 0],
      ["Failed requests (4xx+)", data.failedRequests ?? 0],
      ["Server errors (5xx)", data.serverErrors ?? 0],
      ["Average response", `${Number(data.averageResponseTimeMs || 0).toFixed(2)} ms`],
      ["Slowest response", `${Number(data.slowestResponseMs || 0).toFixed(2)} ms`]
    ]);

    addNotice(target, "Most requested endpoints", "info");
    addTable(
      target,
      ["Method", "Endpoint", "Requests", "Failures", "Average response"],
      (data.topEndpoints || []).map(item => [
        item._id?.method || "Unavailable",
        item._id?.path || "Unavailable",
        item.requests ?? 0,
        item.failures ?? 0,
        `${Number(item.averageResponseTimeMs || 0).toFixed(2)} ms`
      ]),
      "No API requests have been recorded yet."
    );

    addNotice(target, "Most active authenticated users", "info");
    addTable(
      target,
      ["Username", "Role", "User ID", "Requests"],
      (data.topUsers || []).map(item => [
        item.username || "Unavailable",
        item.role || "Unavailable",
        item._id || "Unavailable",
        item.requests ?? 0
      ]),
      "No authenticated user requests have been recorded yet."
    );

    addNotice(target, "Most active IP addresses", "info");
    addTable(
      target,
      ["IP address", "Requests"],
      (data.topIps || []).map(item => [
        item._id || "Unavailable",
        item.requests ?? 0
      ]),
      "No IP addresses have been recorded yet."
    );

    addNotice(target, "Recent API request history", "info");
    addTable(
      target,
      ["Date", "User", "Role", "IP address", "Method", "Endpoint", "Status", "Response"],
      (data.recentRequests || []).map(item => [
        displayDate(item.createdAt),
        item.username || item.userId || "Anonymous",
        item.role || "anonymous",
        item.ipAddress || "Unavailable",
        item.method || "Unavailable",
        item.path || "Unavailable",
        item.statusCode ?? "Unavailable",
        `${Number(item.responseTimeMs || 0).toFixed(2)} ms`
      ]),
      "No recent API requests have been recorded yet."
    );

    addNotice(
      target,
      "Request history is collected by the backend monitor. IP addresses are shown as received by the server; they are not geographic location results.",
      "info"
    );
  }

  async function loadIpOrigin(target, query = "") {
    target.replaceChildren();

    const [overview, history] = await Promise.all([
      apiRequest("/admin/api-requests/overview"),
      apiRequest(
        `/admin/api-requests/logs?limit=100&q=${encodeURIComponent(query)}`
      )
    ]);

    addMetrics(target, [
      ["Recorded IP addresses", overview.uniqueIps ?? 0],
      ["Total requests", overview.totalRequests ?? 0],
      ["Authenticated users", overview.uniqueUsers ?? 0],
      ["Failed requests", overview.failedRequests ?? 0]
    ]);

    const toolbar = createElement("form", "world-filter-bar");
    const search = createElement("input", "world-filter-input");
    search.type = "search";
    search.placeholder = "Search IP, username or endpoint";
    search.value = query;
    search.setAttribute("aria-label", "Search IP intelligence records");

    const submit = createElement("button", "world-filter-button", "Search");
    submit.type = "submit";

    toolbar.append(search, submit);
    toolbar.addEventListener("submit", event => {
      event.preventDefault();
      loadIpOrigin(target, search.value.trim()).catch(error => {
        target.replaceChildren();
        addNotice(target, error.message, "error");
      });
    });
    target.append(toolbar);

    addNotice(target, "Most active IP addresses", "info");
    addTable(
      target,
      ["IP address", "Requests"],
      (overview.topIps || []).map(item => [
        item._id || "Unavailable",
        item.requests ?? 0
      ]),
      "No IP addresses have been recorded yet."
    );

    const logs = history.logs || [];

    addNotice(target, "Observed request origins", "info");
    addTable(
      target,
      ["Date", "IP address", "Username", "User ID", "Role", "Method", "Endpoint", "Status"],
      logs.map(item => [
        displayDate(item.createdAt),
        item.ipAddress || "Unavailable",
        item.username || "Anonymous",
        item.userId || "Unavailable",
        item.role || "anonymous",
        item.method || "Unavailable",
        item.path || "Unavailable",
        item.statusCode ?? "Unavailable"
      ]),
      "No matching request records found."
    );

    addNotice(target, "Browser and device signatures", "info");
    addTable(
      target,
      ["Date", "IP address", "Username", "User agent"],
      logs.map(item => [
        displayDate(item.createdAt),
        item.ipAddress || "Unavailable",
        item.username || "Anonymous",
        item.userAgent || "Unavailable"
      ]),
      "No browser signatures have been recorded yet."
    );

    addNotice(
      target,
      "IP addresses are recorded as received by the server. Geographic location, referrer and browser Origin headers are not currently collected by this monitor.",
      "info"
    );
  }

  async function loadAuthenticationMonitor(target) {
    const result = await apiRequest(
      "/admin/security/authentication-events?page=1&limit=50"
    );

    const summary = result.summary || {};
    const events = Array.isArray(result.events) ? result.events : [];

    addMetrics(target, [
      ["Authentication events", summary.total ?? 0],
      ["Successful events", summary.successful ?? 0],
      ["Denied logins", summary.denied ?? 0],
      ["Failed events", summary.failed ?? 0],
      ["Recorded IP addresses", summary.uniqueIPs ?? 0],
      ["Linked accounts", summary.uniqueAccounts ?? 0]
    ]);

    addTable(
      target,
      [
        "Date",
        "Event",
        "Outcome",
        "Account",
        "IP address",
        "Request",
        "Browser"
      ],
      events.map(event => {
        const account = event.userId && typeof event.userId === "object"
          ? (
              event.userId.username ||
              event.userId.email ||
              event.userId._id ||
              "Linked account"
            )
          : "Unknown account";

        const request = [
          event.method || "",
          event.path || ""
        ].filter(Boolean).join(" ");

        return [
          displayDate(event.createdAt),
          String(event.eventType || "Unknown").replaceAll("_", " "),
          event.outcome || "Unknown",
          account,
          event.ipAddress || "Unavailable",
          request || "Unavailable",
          event.userAgent || "Unavailable"
        ];
      }),
      "No authentication events have been recorded yet."
    );

    addNotice(
      target,
      "This monitor shows recorded login successes, denied login attempts, logouts, session revocations and password-reset events. Failed attempts using an unknown username or email appear as Unknown account.",
      "info"
    );

    if (result.pagination) {
      addNotice(
        target,
        `Showing page ${result.pagination.page} of ${result.pagination.pages} (${result.pagination.total} matching events).`,
        "info"
      );
    }
  }

  async function loadFailedRequests(target) {
    const [overview, result] = await Promise.all([
      apiRequest("/admin/api-requests/overview"),
      apiRequest("/admin/api-requests/logs?statusClass=errors&page=1&limit=100")
    ]);

    const logs = Array.isArray(result.logs) ? result.logs : [];
    const serverErrors = Number(overview.serverErrors || 0);
    const failedRequests = Number(overview.failedRequests || 0);
    const clientErrors = Math.max(0, failedRequests - serverErrors);

    addMetrics(target, [
      ["All failed requests", failedRequests],
      ["Client errors (4xx)", clientErrors],
      ["Server errors (5xx)", serverErrors],
      ["Successful requests", overview.successfulRequests ?? 0],
      ["Total API requests", overview.totalRequests ?? 0],
      ["Average response", `${overview.averageResponseTimeMs ?? 0} ms`],
      ["Slowest response", `${overview.slowestResponseMs ?? 0} ms`]
    ]);

    addTable(
      target,
      [
        "Date",
        "Status",
        "Method",
        "Endpoint",
        "User",
        "Role",
        "IP address",
        "Response time",
        "Browser"
      ],
      logs.map(log => [
        displayDate(log.createdAt),
        String(log.statusCode ?? "Unknown"),
        log.method || "Unknown",
        log.path || "Unavailable",
        log.username || "Anonymous",
        log.role || "Guest",
        log.ipAddress || "Unavailable",
        `${Number(log.responseTimeMs || 0)} ms`,
        log.userAgent || "Unavailable"
      ]),
      "No failed API requests have been recorded."
    );

    if (result.pagination) {
      addNotice(
        target,
        `Showing ${logs.length} error records from ${result.pagination.total} matching requests. Maximum 100 records displayed.`,
        "info"
      );
    }

    addNotice(
      target,
      "HTTP 4xx responses represent client/request errors. HTTP 5xx responses represent server errors. These totals depend on API request telemetry being active and the database retaining its records.",
      "info"
    );
  }

  async function loadRateLimitMonitor(target) {
    const result = await apiRequest(
      "/admin/security/rate-limit-events?page=1&limit=100"
    );

    const summary = result.summary || {};
    const events = Array.isArray(result.events) ? result.events : [];

    addMetrics(target, [
      ["Rate-limit triggers", summary.total ?? 0],
      ["Unique IP addresses", summary.uniqueIPs ?? 0],
      ["Events displayed", events.length]
    ]);

    addTable(
      target,
      ["Date", "Account", "IP address", "Outcome", "Severity", "Endpoint", "Message", "Browser"],
      events.map(event => {
        const account = event.userId && typeof event.userId === "object"
          ? event.userId.username || event.userId.email || "Linked account"
          : "Unknown account";

        return [
          displayDate(event.createdAt),
          account,
          event.ipAddress || "Unavailable",
          event.outcome || "Unknown",
          event.severity || "Unknown",
          [event.method, event.path].filter(Boolean).join(" ") || "Unavailable",
          event.message || "Rate limit triggered",
          event.userAgent || "Unavailable"
        ];
      }),
      "No rate-limit events have been recorded."
    );

    addNotice(
      target,
      "This monitor currently records blocked password-reset requests and password-reset attempts. Other API rate limiters are not included unless they are explicitly instrumented.",
      "info"
    );
  }


  async function loadAuditRecords(target, detailed = false) {
    let page = 1;
    let search = "";
    let action = "";
    const limit = 25;

    const filters = createElement("div", "world-filter-bar");
    const searchInput = createElement("input", "world-filter-input");
    searchInput.type = "search";
    searchInput.placeholder = "Search administrator or affected user";
    searchInput.setAttribute("aria-label", "Search audit records");

    const actionInput = createElement("input", "world-filter-input");
    actionInput.type = "search";
    actionInput.placeholder = "Filter exact action name";
    actionInput.setAttribute("aria-label", "Filter by action");

    const applyButton = createElement("button", "world-filter-button", "Apply filters");
    applyButton.type = "button";

    filters.append(searchInput, actionInput, applyButton);
    target.append(filters);

    const results = createElement("div", "world-audit-results");
    target.append(results);

    const paginationBar = createElement("div", "world-pagination");
    const previousButton = createElement("button", "world-filter-button", "Previous");
    previousButton.type = "button";
    const pageLabel = createElement("span", "world-page-label", "Page 1");
    const nextButton = createElement("button", "world-filter-button", "Next");
    nextButton.type = "button";
    paginationBar.append(previousButton, pageLabel, nextButton);
    target.append(paginationBar);

    async function fetchPage() {
      results.replaceChildren();
      addNotice(results, "Loading recorded administrator audit entries...");

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });

      if (search) params.set("search", search);
      if (action) params.set("action", action);

      const payload = await apiRequest(
        `/admin/reports/audit-logs?${params.toString()}`,
        false,
        true
      );

      const rows = Array.isArray(payload.data) ? payload.data : [];
      const paging = payload.pagination || {};
      const total = Number(paging.total || 0);
      const pages = Math.max(1, Number(paging.pages || 1));

      results.replaceChildren();

      addMetrics(results, [
        ["Recorded actions", total],
        ["Current page", `${page} / ${pages}`],
        ["Entries displayed", rows.length]
      ]);

      const shortValue = value => {
        if (value === null || value === undefined) return "Not recorded";
        let result;

        try {
          result = typeof value === "string"
            ? value
            : JSON.stringify(value);
        } catch {
          result = String(value);
        }

        return result.length > 700
          ? result.slice(0, 700) + "…"
          : result;
      };

      const tableRows = rows.map(row => {
        const admin = userName(row.admin);
        const affected = userName(row.targetUser);

        const basic = [
          displayDate(row.createdAt),
          admin,
          row.admin?.role || "Administrator",
          row.action || "Unknown action",
          affected,
          row.reason || "No reason recorded",
          row.ipAddress || "Unavailable"
        ];

        if (!detailed) return basic;

        return [
          ...basic,
          shortValue(row.before),
          shortValue(row.after),
          String(row.id || "Unavailable")
        ];
      });

      addTable(
        results,
        detailed
          ? ["Date", "Administrator", "Role", "Action", "Affected user", "Reason", "IP address", "Before", "After", "Record ID"]
          : ["Date", "Administrator", "Role", "Action", "Affected user", "Reason", "IP address"],
        tableRows,
        "No matching administrator audit records were found."
      );

      pageLabel.textContent = `Page ${page} of ${pages} · ${total} total records`;
      previousButton.disabled = page <= 1;
      nextButton.disabled = page >= pages;

      addNotice(
        results,
        "Source: AdminAuditLog. This page shows recorded administrative changes only. It does not claim to capture every administrator action on the platform.",
        "info"
      );
    }

    applyButton.addEventListener("click", () => {
      search = searchInput.value.trim();
      action = actionInput.value.trim();
      page = 1;
      fetchPage().catch(error => {
        results.replaceChildren();
        addNotice(results, error.message, "error");
      });
    });

    [searchInput, actionInput].forEach(input => {
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") applyButton.click();
      });
    });

    previousButton.addEventListener("click", () => {
      if (page > 1) {
        page -= 1;
        fetchPage().catch(error => {
          results.replaceChildren();
          addNotice(results, error.message, "error");
        });
      }
    });

    nextButton.addEventListener("click", () => {
      page += 1;
      fetchPage().catch(error => {
        results.replaceChildren();
        addNotice(results, error.message, "error");
      });
    });

    await fetchPage();
  }


  async function loadHealth(target) {
    target.replaceChildren();
    addNotice(target, "Checking API availability and database connectivity…");

    const [apiResult, databaseResult] = await Promise.allSettled([
      apiRequest("/health", false, true),
      apiRequest("/admin/settings")
    ]);

    target.replaceChildren();

    const apiOnline = apiResult.status === "fulfilled"
      && apiResult.value.success === true
      && apiResult.value.status === "running";

    const databaseVerified = databaseResult.status === "fulfilled";

    addMetrics(target, [
      ["API service", apiOnline ? "Online" : "Unavailable"],
      ["Database connectivity", databaseVerified ? "Verified" : "Not verified"],
      ["Health check timestamp", apiOnline
        ? displayDate(apiResult.value.timestamp)
        : "Unavailable"],
      ["API service name", apiOnline
        ? apiResult.value.service || "Unavailable"
        : "Unavailable"]
    ]);

    if (!apiOnline) {
      addNotice(
        target,
        apiResult.status === "rejected"
          ? `API health check failed: ${apiResult.reason.message}`
          : "The health endpoint did not confirm that the API is running.",
        "error"
      );
    }

    if (!databaseVerified) {
      addNotice(
        target,
        `Database connectivity could not be verified through the protected settings query: ${databaseResult.reason.message}`,
        "error"
      );
    } else {
      addNotice(
        target,
        "The protected platform-settings query succeeded. This confirms the application can read its MongoDB-backed settings.",
        "success"
      );
    }

    addNotice(
      target,
      "This check does not measure CPU, memory, disk capacity, network latency or external infrastructure.",
      "info"
    );
  }

  async function loadConfiguration(target) {
    target.replaceChildren();
    addNotice(target, "Loading authorized platform configuration…");

    const settings = await apiRequest("/admin/settings");

    target.replaceChildren();

    const booleanLabel = value => {
      if (value === true) return "Enabled";
      if (value === false) return "Disabled";
      return "Unavailable";
    };

    const rate = Number(settings.exchangeRateKesPerUsd);

    addMetrics(target, [
      ["User registration", booleanLabel(settings.registrationEnabled)],
      ["Maintenance mode", booleanLabel(settings.maintenanceMode)],
      ["Configured payout rate", Number.isFinite(rate) && rate > 0
        ? `KES ${rate.toLocaleString()} per USD`
        : "Not configured"],
      ["Last updated", displayDate(settings.updatedAt)]
    ]);

    addNotice(
      target,
      "These are the public settings returned by the protected administration API. Sensitive configuration and credentials are not displayed.",
      "info"
    );

    addNotice(
      target,
      "Read-only view. No platform settings have been changed.",
      "success"
    );
  }

  async function loadLiveSection(section, target, statusNode) {
    try {
      if (section.id === "users") {
        await loadUsers(target, userDirectoryState.page);
      } else if (section.id === "devices") {
        await loadDevices(target);
      } else if (section.id === "security") {
        await loadSecurity(target);
      } else if (section.id === "authentication") {
        await loadAuthenticationMonitor(target);
      } else if (section.id === "errors") {
        await loadFailedRequests(target);
      } else if (section.id === "rate-limits") {
        await loadRateLimitMonitor(target);
      } else if (section.id === "overview") {
        await loadOverview(target);
      } else if (section.id === "api") {
        await loadApiExplorer(target);
      } else if (section.id === "ip-origin") {
        await loadIpOrigin(target);
      } else if (section.id === "admin-history") {
        await loadAuditRecords(target, false);
      } else if (section.id === "audit") {
        await loadAuditRecords(target, true);
      } else if (section.id === "health") {
        await loadHealth(target);
      } else if (section.id === "configuration") {
        await loadConfiguration(target);
      } else {
        return;
      }

      if (activeSection === section.id) {
        statusNode.textContent = "Live backend data";
      }
    } catch (error) {
      target.replaceChildren();
      addNotice(target, error.message, "error");

      if (activeSection === section.id) {
        statusNode.textContent = "Connection failed";
      }
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function setMenuOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.innerHTML = open
      ? "<span>×</span> Close World Menu"
      : "<span>☰</span> World Menu";
  }

  function renderSection(sectionId) {
    const section = sections.find(item => item.id === sectionId);

    if (!section) return;

    activeSection = section.id;

    navigation.querySelectorAll(".world-nav-link").forEach(link => {
      if (link.dataset.section === section.id) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    const panel = createElement("section", "module-panel");
    panel.setAttribute("aria-labelledby", "module-title");

    const top = createElement("div", "module-topline");
    const label = createElement("span", "eyebrow", "ADMIN WORLD / MODULE");
    const status = createElement(
      "span",
      "module-status",
      moduleStatus[section.id] || "Integration pending"
    );

    top.append(label, status);

    const heading = createElement("div", "module-heading");
    const icon = createElement("div", "module-large-icon", section.icon);
    const headingCopy = createElement("div", "module-heading-copy");
    const title = createElement("h3", "", section.name);
    title.id = "module-title";

    const description = createElement(
      "p",
      "module-description",
      section.description
    );

    headingCopy.append(title, description);
    heading.append(icon, headingCopy);

    const divider = createElement("div", "module-divider");
    const information = createElement("p", "module-information", section.detail);
    const dataArea = createElement("div", "world-data-area");

    panel.append(top, heading, divider, information, dataArea);
    content.replaceChildren(panel);

    loadLiveSection(section, dataArea, status);
  }

  function buildNavigation() {
    sections.forEach(section => {
      const button = createElement("button", "world-nav-link");
      button.type = "button";
      button.dataset.section = section.id;
      button.setAttribute("aria-label", section.name);

      const icon = createElement(
        "span",
        "world-nav-icon",
        section.icon
      );

      const text = createElement("span", "world-nav-text");
      const name = createElement("strong", "", section.name);
      const description = createElement(
        "small",
        "",
        section.description
      );

      text.append(name, description);
      button.append(icon, text);

      button.addEventListener("click", () => {
        renderSection(section.id);
        setMenuOpen(false);
      });

      navigation.append(button);
    });
  }

  function updateClock() {
    const now = new Date();

    if (clock) {
      clock.textContent = new Intl.DateTimeFormat("en-KE", {
        timeZone: "Africa/Nairobi",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(now);
    }

    if (date) {
      date.textContent = new Intl.DateTimeFormat("en-KE", {
        timeZone: "Africa/Nairobi",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(now);
    }
  }

  toggle.addEventListener("click", () => {
    setMenuOpen(menu.hidden);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  buildNavigation();
  updateClock();
  setInterval(updateClock, 1000);

  renderSection(activeSection);
  setMenuOpen(false);

  console.info("Admin World initialized with", sections.length, "sections.");
})();
