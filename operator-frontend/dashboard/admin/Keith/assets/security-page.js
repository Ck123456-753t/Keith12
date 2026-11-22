"use strict";

(() => {
  if (document.body.dataset.adminPage !== "security") return;

  const statusNode = document.getElementById("security-status");
  const root = document.getElementById("security-sections");

  const API_BASE = String(
    window.PTW_API_BASE ||
    document.body.dataset.apiBase ||
    "http://127.0.0.1:5001/api"
  ).replace(/\/+$/, "");

  const SECURITY_API = "/admin/security";

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  }

  function setStatus(message, kind = "info") {
    statusNode.textContent = message;
    statusNode.dataset.kind = kind;
  }

  function date(value) {
    if (!value) return "Not available";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Not available"
      : parsed.toLocaleString();
  }

  function value(valueToShow) {
    if (valueToShow === null || valueToShow === undefined || valueToShow === "") {
      return "Not available";
    }
    return String(valueToShow);
  }

  function statusPill(label, state) {
    const pill = node("span", label, "ptw-security-status");
    pill.dataset.state = state;
    return pill;
  }

  function detail(label, content, extraClass = "") {
    const wrapper = node("div", null, "ptw-security-detail");
    wrapper.append(
      node("span", label),
      node("strong", value(content), extraClass)
    );
    return wrapper;
  }

  function metric(label, content) {
    const wrapper = node("div", null, "ptw-security-metric");
    wrapper.append(
      node("span", label),
      node("strong", value(content))
    );
    return wrapper;
  }

  async function request(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });

    const payload = await response.json().catch(() => ({}));

    if (
      !response.ok &&
      !(options.allowConflict && response.status === 409)
    ) {
      if (response.status === 401) {
        throw new Error("Your admin session is missing or expired. Sign in again.");
      }
      if (response.status === 403) {
        throw new Error("Administrator access is required for this page.");
      }
      throw new Error(payload.message || `Request failed (${response.status}).`);
    }

    if (
      payload.success === false &&
      !(options.allowConflict && response.status === 409)
    ) {
      throw new Error(payload.message || "The security API rejected the request.");
    }

    return payload;
  }

  function makeReasonField(labelText, maxLength, placeholder) {
    const wrapper = node("div", null, "ptw-security-field");
    const id = `security-reason-${Math.random().toString(36).slice(2)}`;
    const label = node("label", labelText);
    label.htmlFor = id;

    const textarea = node("textarea");
    textarea.id = id;
    textarea.maxLength = String(maxLength);
    textarea.minLength = "5";
    textarea.required = true;
    textarea.placeholder = placeholder;
    textarea.autocomplete = "off";

    wrapper.append(label, textarea);
    return { wrapper, textarea };
  }

  function makeIpReferenceField(initialValue) {
    const wrapper = node("div", null, "ptw-security-field");
    const id = `security-ip-reference-${Math.random().toString(36).slice(2)}`;
    const label = node("label", "Administrator IP reference");
    label.htmlFor = id;

    const input = node("input");
    input.id = id;
    input.type = "text";
    input.maxLength = 100;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Enter IPv4 or IPv6 address";
    input.value = initialValue || "";

    const note = node(
      "p",
      "Review metadata only. This address is not verified and cannot authorize a transfer.",
      "ptw-security-muted"
    );

    wrapper.append(label, input, note);
    return { wrapper, input };
  }

  function makeButton(label, className, action) {
    const button = node(
      "button",
      label,
      `ptw-security-button ${className || ""}`.trim()
    );
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  function validateReason(field, maxLength) {
    const reason = field.value.trim();
    if (reason.length < 5 || reason.length > maxLength) {
      throw new Error(`Enter a reason between 5 and ${maxLength} characters.`);
    }
    return reason;
  }

  function userLabel(user) {
    if (!user || typeof user !== "object") return "Unknown account";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return fullName || user.username || user.email || "Unknown account";
  }

  function deviceLabel(device) {
    if (!device || typeof device !== "object") return "Device unavailable";
    return device.deviceLabel || "Unlabelled browser";
  }

  function renderChain(result) {
    const data = result && result.data ? result.data : {};
    const valid = data.valid === true;
    const card = node("section", null, "ptw-security-card");

    const top = node("div", null, "ptw-security-topline");
    const heading = node("div");
    heading.append(
      node("h2", "Security event chain"),
      node(
        "p",
        "Verify that recorded security events remain in their expected cryptographic sequence.",
        "ptw-security-muted"
      )
    );

    top.append(
      heading,
      statusPill(
        valid ? "Integrity verified" : "Integrity check failed",
        valid ? "valid" : "invalid"
      )
    );

    const metrics = node("div", null, "ptw-security-grid");
    metrics.append(
      metric("Events checked", data.checkedEvents ?? 0),
      metric("Latest sequence", data.sequence ?? "Not supplied"),
      metric("Verification status", data.status || "Unknown")
    );

    card.append(top, metrics);

    if (!valid && data.reason) {
      card.append(
        node("div", `Verification detail: ${data.reason}`, "ptw-security-warning")
      );
    }

    const actions = node("div", null, "ptw-security-actions");
    const verify = makeButton("Verify chain again", "ptw-security-button-primary", async () => {
      verify.disabled = true;
      try {
        const refreshed = await request(`${SECURITY_API}/chain/verify`, {
          allowConflict: true
        });
        renderChain(refreshed);
        setStatus(
          refreshed.data?.valid
            ? "Security event chain verified."
            : "Warning: security event chain verification failed.",
          refreshed.data?.valid ? "success" : "error"
        );
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        verify.disabled = false;
      }
    });

    actions.append(verify);
    card.append(actions);
    return card;
  }

  function renderTransfers(requests) {
    const card = node("section", null, "ptw-security-card");
    const heading = node("div");
    heading.append(
      node("h2", "Pending browser transfers"),
      node(
        "p",
        "Approving a request revokes the account's previous active registration and registers the proposed browser.",
        "ptw-security-muted"
      )
    );
    card.append(heading);

    const list = node("div", null, "ptw-security-list");
    const safeRequests = Array.isArray(requests) ? requests : [];

    if (!safeRequests.length) {
      list.append(node("p", "There are no pending browser transfer requests.", "ptw-security-empty"));
    }

    safeRequests.forEach(transfer => {
      const item = node("article", null, "ptw-security-item");
      const user = transfer.userId || {};
      const oldDevice = transfer.oldDeviceId || {};
      const proposed = transfer.proposedDeviceId || {};

      const top = node("div", null, "ptw-security-item-head");
      const title = node("div");
      title.append(
        node("h3", userLabel(user)),
        node("p", user.email || user.username || "Account details unavailable", "ptw-security-muted")
      );
      top.append(title, statusPill("Pending review", "pending"));

      const details = node("div", null, "ptw-security-details");
      details.append(
        detail("Account role", user.role),
        detail("Account status", user.status),
        detail("Request count", transfer.requestCount),
        detail("Failed attempts", transfer.failedAttempts),
        detail("First requested", date(transfer.firstRequestedAt || transfer.createdAt)),
        detail("Last requested", date(transfer.lastRequestedAt)),
        detail("Request IP (server observed)", transfer.requestIp),
        detail("Administrator IP reference", transfer.adminIpReference),
        detail("IP reference last updated", date(transfer.ipReferenceUpdatedAt)),
        detail("IP reference reason", transfer.ipReferenceReason),
        detail("Request browser", transfer.requestUserAgent),
        detail("Previous browser", deviceLabel(oldDevice)),
        detail("Previous browser status", oldDevice.status),
        detail("Previous browser last seen", date(oldDevice.lastSeenAt)),
        detail("Previous browser IP", oldDevice.lastKnownIp),
        detail("Proposed browser", deviceLabel(proposed)),
        detail("Proposed browser status", proposed.status),
        detail("Proposed browser registered", date(proposed.registeredAt)),
        detail("Proposed browser last seen", date(proposed.lastSeenAt)),
        detail("Proposed browser IP", proposed.lastKnownIp),
        detail("Proposed browser user agent", proposed.lastUserAgent)
      );

      const reason = makeReasonField(
        "Administrative review reason",
        1000,
        "Record why this transfer is being approved or rejected. Minimum 5 characters."
      );

      const ipReference = makeIpReferenceField(transfer.adminIpReference);
      const ipReferenceReason = makeReasonField(
        "IP reference update reason",
        500,
        "Explain why this reference is being added, changed, or cleared. Minimum 5 characters."
      );

      const actions = node("div", null, "ptw-security-actions");

      async function saveIpReference(button) {
        try {
          const reference = ipReference.input.value.trim();
          const updateReason = validateReason(ipReferenceReason.textarea, 500);

          if (reference && !/^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(reference) &&
              !/^[0-9a-fA-F:]+$/.test(reference)) {
            throw new Error("Enter a valid IPv4 or IPv6 address.");
          }

          if (!window.confirm(
            "Save this IP reference? It will not authorize or approve the transfer."
          )) return;

          button.disabled = true;

          const result = await request(
            `${SECURITY_API}/devices/transfers/${encodeURIComponent(transfer._id)}/ip-reference`,
            {
              method: "PATCH",
              body: {
                ipReference: reference,
                reason: updateReason
              }
            }
          );

          setStatus(result.message || "IP reference saved.", "success");
          await loadAll();
        } catch (error) {
          setStatus(error.message, "error");
          button.disabled = false;
        }
      }

      async function review(decision, button) {
        try {
          const reviewReason = validateReason(reason.textarea, 1000);
          const actionLabel = decision === "approve" ? "approve this browser transfer" : "reject this browser transfer";

          if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;

          button.disabled = true;
          const result = await request(
            `${SECURITY_API}/devices/transfers/${encodeURIComponent(transfer._id)}/${decision}`,
            {
              method: "POST",
              body: { reason: reviewReason }
            }
          );

          setStatus(result.message || `Transfer ${decision}d.`, "success");
          await loadAll();
        } catch (error) {
          setStatus(error.message, "error");
          button.disabled = false;
        }
      }

      const saveReference = makeButton(
        "Save IP reference",
        "ptw-security-button-primary",
        () => saveIpReference(saveReference)
      );

      const approve = makeButton("Approve transfer", "ptw-security-button-primary", () => review("approve", approve));
      const reject = makeButton("Reject transfer", "ptw-security-button-danger", () => review("reject", reject));

      actions.append(saveReference, approve, reject);
      item.append(
        top,
        details,
        ipReference.wrapper,
        ipReferenceReason.wrapper,
        reason.wrapper,
        actions
      );
      list.append(item);
    });

    card.append(list);
    return card;
  }

  function renderDevices(devices) {
    const card = node("section", null, "ptw-security-card");
    const safeDevices = Array.isArray(devices) ? devices : [];
    const activeCount = safeDevices.filter(device => device.status === "active").length;
    const bannedCount = safeDevices.filter(device => device.status === "banned").length;

    const heading = node("div");
    heading.append(
      node("h2", "Global device inventory"),
      node(
        "p",
        "These records represent browser identities, not verified physical phone identities. IP addresses and user-agent strings are supporting context, not proof of ownership.",
        "ptw-security-muted"
      )
    );

    const metrics = node("div", null, "ptw-security-grid");
    metrics.append(
      metric("Devices returned", safeDevices.length),
      metric("Active identities", activeCount),
      metric("Banned identities", bannedCount)
    );

    const list = node("div", null, "ptw-security-list");

    if (!safeDevices.length) {
      list.append(node("p", "No registered device identities were returned.", "ptw-security-empty"));
    }

    safeDevices.forEach(device => {
      const item = node("article", null, "ptw-security-item");
      const banned = device.status === "banned";

      const top = node("div", null, "ptw-security-item-head");
      const title = node("div");
      title.append(
        node("h3", deviceLabel(device)),
        node("p", `Device ID: ${value(device._id)}`, "ptw-security-muted ptw-security-id")
      );
      top.append(
        title,
        statusPill(banned ? "Globally banned" : "Active identity", banned ? "banned" : "active")
      );

      const details = node("div", null, "ptw-security-details");
      details.append(
        detail("Registered", date(device.registeredAt)),
        detail("Last seen", date(device.lastSeenAt)),
        detail("Last known IP", device.lastKnownIp),
        detail("Browser / user agent", device.lastUserAgent),
        detail("Ban date", date(device.bannedAt)),
        detail("Ban reason", device.banReason),
        detail(
          "Last reviewed by",
          device.reviewedByAdminId
            ? userLabel(device.reviewedByAdminId)
            : "Not recorded"
        )
      );

      const reason = makeReasonField(
        banned ? "Reason for unbanning" : "Reason for global ban",
        500,
        "Enter a reason between 5 and 500 characters."
      );

      const actions = node("div", null, "ptw-security-actions");

      const actionButton = makeButton(
        banned ? "Unban device identity" : "Globally ban device",
        banned ? "ptw-security-button-primary" : "ptw-security-button-danger",
        async () => {
          try {
            const actionReason = validateReason(reason.textarea, 500);

            const warning = banned
              ? "Unbanning only makes this device identity active again. Previous account registrations remain revoked and are NOT restored."
              : "This globally bans the browser identity, revokes all active account registrations linked to it, and cancels pending transfers targeting it.";

            if (!window.confirm(`${warning}\n\nContinue?`)) return;

            actionButton.disabled = true;
            const action = banned ? "unban" : "ban";
            const result = await request(
              `${SECURITY_API}/devices/${encodeURIComponent(device._id)}/${action}`,
              {
                method: "POST",
                body: { reason: actionReason }
              }
            );

            setStatus(result.message || `Device ${action} completed.`, "success");
            await loadAll();
          } catch (error) {
            setStatus(error.message, "error");
            actionButton.disabled = false;
          }
        }
      );

      actions.append(actionButton);
      item.append(top, details);

      if (banned) {
        item.append(
          node(
            "div",
            "Unbanning does not restore old registrations. The account owner must complete a new approved registration or transfer process.",
            "ptw-security-warning"
          )
        );
      }

      item.append(reason.wrapper, actions);
      list.append(item);
    });

    card.append(heading, metrics, list);
    return card;
  }

  async function loadAll() {
    setStatus("Loading security records…");
    root.replaceChildren(
      node("section", "Loading security information…", "ptw-security-card")
    );

    const results = await Promise.allSettled([
      request(`${SECURITY_API}/chain/verify`, { allowConflict: true }),
      request(`${SECURITY_API}/devices/transfers?limit=100`),
      request(`${SECURITY_API}/devices?limit=100`)
    ]);

    root.replaceChildren();

    const labels = [
      "Security event chain",
      "Pending device transfers",
      "Device inventory"
    ];

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const failed = node("section", null, "ptw-security-card");
        failed.append(
          node("h2", labels[index]),
          node("p", result.reason?.message || "This section could not be loaded.", "ptw-security-muted")
        );
        root.append(failed);
        return;
      }

      const payload = result.value;

      if (index === 0) {
        root.append(renderChain(payload));
      } else if (index === 1) {
        root.append(renderTransfers(payload.data?.requests));
      } else {
        root.append(renderDevices(payload.data?.devices));
      }
    });

    const failures = results.filter(result => result.status === "rejected").length;
    const chainResult = results[0];

    if (failures) {
      setStatus(
        `${failures} security section(s) could not be loaded. Review the error shown in each section.`,
        "error"
      );
    } else if (
      chainResult.status === "fulfilled" &&
      chainResult.value.data?.valid === true
    ) {
      setStatus("Security records loaded. Event chain integrity is verified.", "success");
    } else {
      setStatus("Security records loaded, but the event chain verification requires attention.", "error");
    }
  }

  loadAll().catch(error => {
    root.replaceChildren(
      node("section", error.message || "Security Center could not be loaded.", "ptw-security-card")
    );
    setStatus(error.message || "Security Center could not be loaded.", "error");
  });
})();
