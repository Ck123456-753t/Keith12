"use strict";

(() => {
  const API = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  const page = document.body.dataset.page;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const usd = (cents) => Number.isSafeInteger(Number(cents))
    ? "$" + (Number(cents) / 100).toFixed(2) : "—";
  const date = (v) => v ? new Date(v).toLocaleString() : "—";
  const status = (v) => `<span class="status ${esc(v)}">${esc(String(v || "unknown").replaceAll("_"," "))}</span>`;

  async function api(path, options = {}) {
    if (!API) throw new Error("API configuration did not load. Check the config.js path.");
    const response = await fetch(API + path, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? {"Content-Type":"application/json"} : {}),
        ...(options.headers || {})
      }
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("The server returned an unreadable response."); }
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `Request failed (${response.status}).`);
    }
    return data;
  }

  function message(text, error = false) {
    const el = $("message");
    if (!el) return;
    el.textContent = text || "";
    el.className = "message" + (error ? " error" : "");
  }

  async function loadTasks() {
    const data = await api("/admin/notes/tasks");
    const tasks = data.tasks || [];
    if ($("taskCount")) $("taskCount").textContent = tasks.length;
    if (!$("taskRows")) return tasks;
    $("taskRows").innerHTML = tasks.length ? tasks.map(t => `
      <tr>
        <td><strong>${esc(t.title)}</strong><div class="muted">${esc(t.category || "General")}</div></td>
        <td>${esc(t.durationMinutes)} min</td>
        <td>${usd(t.rewardCents)}</td>
        <td>${status(t.status)}</td>
        <td><div class="actions">
          ${t.status === "draft" ? `<button data-publish="${esc(t.id)}">Publish</button>` : ""}
        </div></td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">No Notes tasks found.</td></tr>`;
    return tasks;
  }

  async function loadSubmissions(selected = "submitted") {
    const data = await api("/admin/notes/submissions?status=" + encodeURIComponent(selected) + "&limit=50");
    const items = data.submissions || [];
    if ($("submissionCount")) $("submissionCount").textContent = items.length;
    $("submissionRows").innerHTML = items.length ? items.map(s => `
      <tr>
        <td><strong>${esc(s.taskTitle)}</strong><div class="muted">${esc(s.id)}</div></td>
        <td>${esc([s.member?.firstName,s.member?.lastName].filter(Boolean).join(" ") || s.member?.username || "Member")}<div class="muted">${esc(s.member?.email || "")}</div></td>
        <td>${date(s.submittedAt)}</td>
        <td>${usd(s.rewardCents)}</td>
        <td>${status(s.status)}</td>
        <td><div class="actions">
          <button class="secondary" data-read="${esc(s.id)}">Read notes</button>
          ${s.status === "submitted" ? `<button class="success" data-review="approve" data-id="${esc(s.id)}">Approve</button><button class="danger" data-review="reject" data-id="${esc(s.id)}">Reject</button>` : ""}
        </div></td>
      </tr>
      <tr id="notes-${esc(s.id)}" hidden><td colspan="6"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s.notesText)}</div></td></tr>
    `).join("") : `<tr><td colspan="6" class="empty">No submissions in this status.</td></tr>`;
  }

  async function loadWithdrawals() {
    const data = await api("/notes/withdrawals/admin");
    const items = data.withdrawals || [];
    if ($("withdrawalCount")) $("withdrawalCount").textContent = items.filter(w => w.status === "pending_review").length;
    $("withdrawalRows").innerHTML = items.length ? items.map(w => `
      <tr>
        <td><strong>${esc(w.requestId)}</strong><div class="muted">${date(w.createdAt)}</div></td>
        <td>${usd(Math.round(Number(w.amount || 0) * 100))}</td>
        <td>${esc(w.phoneNumber || "—")}<div class="muted">KES ${esc(w.payoutAmountKes ?? "—")}</div></td>
        <td>${status(w.status)}<div class="muted">${esc(w.b2cInitiationState || "")}</div></td>
        <td>${esc(w.mpesaReceipt || "—")}</td>
        <td><div class="actions">
          ${w.status === "pending_review" ? `<button class="success" data-withdraw="approve" data-id="${esc(w.requestId)}">Approve</button>` : ""}
          ${["pending_review","approved"].includes(w.status) ? `<button class="danger" data-withdraw="reject" data-id="${esc(w.requestId)}">Reject</button>` : ""}
          ${w.status === "approved" && w.b2cInitiationState === "not_started" ? `<button data-withdraw="initiate-b2c" data-id="${esc(w.requestId)}">Send M-Pesa</button>` : ""}
        </div></td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">No withdrawal requests found.</td></tr>`;
  }

  async function loadOverview() {
    const [tasks, submissions, withdrawals] = await Promise.all([
      api("/admin/notes/tasks"),
      api("/admin/notes/submissions?status=submitted&limit=50"),
      api("/notes/withdrawals/admin")
    ]);
    const all = tasks.tasks || [];
    $("statTasks").textContent = all.length;
    $("statAvailable").textContent = all.filter(t => t.status === "available").length;
    $("statSubmissions").textContent = (submissions.submissions || []).length;
    $("statWithdrawals").textContent = (withdrawals.withdrawals || []).filter(w => w.status === "pending_review").length;
    $("recentTasks").innerHTML = all.slice(0,8).map(t => `
      <tr><td>${esc(t.title)}</td><td>${esc(t.durationMinutes)} min</td><td>${usd(t.rewardCents)}</td><td>${status(t.status)}</td></tr>
    `).join("") || `<tr><td colspan="4" class="empty">No tasks yet.</td></tr>`;
  }

  async function run(action) {
    message("");
    try {
      if (action === "refresh") {
        if (page === "overview") await loadOverview();
        if (page === "tasks") await loadTasks();
        if (page === "submissions") await loadSubmissions($("filterStatus").value);
        if (page === "withdrawals") await loadWithdrawals();
        message("Data refreshed.");
      }
    } catch (e) { message(e.message, true); }
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    try {
      if (target.dataset.publish) {
        if (!confirm("Publish this draft task?")) return;
        await api("/admin/notes/tasks/" + encodeURIComponent(target.dataset.publish) + "/publish", {method:"PATCH", body:"{}"});
        message("Task published.");
        await loadTasks();
      }
      if (target.dataset.read) {
        const row = $("notes-" + target.dataset.read);
        if (row) row.hidden = !row.hidden;
      }
      if (target.dataset.review) {
        const action = target.dataset.review;
        let reviewNotes = "";
        if (action === "reject") {
          reviewNotes = prompt("Required reason for rejecting this submission:") || "";
          if (!reviewNotes.trim()) return message("Rejection cancelled. A reason is required.", true);
        } else if (!confirm("Approve these notes and credit the member's Notes earnings wallet?")) return;
        await api("/admin/notes/submissions/" + encodeURIComponent(target.dataset.id) + "/review", {
          method:"PATCH", body:JSON.stringify({action, reviewNotes})
        });
        message(action === "approve" ? "Submission approved." : "Submission rejected.");
        await loadSubmissions($("filterStatus").value);
      }
      if (target.dataset.withdraw) {
        const action = target.dataset.withdraw;
        const id = encodeURIComponent(target.dataset.id);
        let note = "";
        if (action === "reject") {
          note = prompt("Reason for rejecting this withdrawal:") || "";
          if (!note.trim()) return message("Rejection cancelled.", true);
        } else if (!confirm(action === "approve" ? "Approve this Notes withdrawal?" : "Initiate M-Pesa payout now? Check the request before continuing.")) return;
        const result = await api("/notes/withdrawals/" + id + "/" + action, {
          method:"POST", body:JSON.stringify({note})
        });
        message(result.message || "Withdrawal action completed.");
        await loadWithdrawals();
      }
    } catch (e) { message(e.message, true); }
  });

  $("refreshBtn")?.addEventListener("click", () => run("refresh"));
  $("filterStatus")?.addEventListener("change", () => loadSubmissions($("filterStatus").value).catch(e => message(e.message, true)));


  const audioTaskForm = $("audioTaskForm");

  audioTaskForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    message("");

    const file = $("audioFile")?.files?.[0];
    const title = $("taskTitle")?.value.trim();

    if (!file) {
      message("Choose an audio file first.", true);
      return;
    }

    if (!title) {
      message("Enter a task title.", true);
      return;
    }

    const allowedExtensions = new Set([
      "mp3", "wav", "m4a", "ogg", "flac", "webm"
    ]);
    const extension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : "";

    if (!allowedExtensions.has(extension)) {
      message("Use MP3, WAV, M4A, OGG, FLAC, or WebM audio.", true);
      return;
    }

    if (!Number.isSafeInteger(file.size) || file.size < 1 ||
        file.size > 100 * 1024 * 1024) {
      message("Audio must be between 1 byte and 100 MB.", true);
      return;
    }

    const button = $("saveAudioTaskBtn");
    const durationField = $("taskDuration");
    let uploadedPublicId = "";
    if (button) {
      button.disabled = true;
      button.textContent = "Uploading and verifying...";
    }
    if (durationField) durationField.value = "Verifying audio...";

    try {
      // Step 1: Ask the authenticated backend to sign a private upload.
      const signed = await api("/admin/notes/assets/audio/signature", {
        method: "POST",
        body: JSON.stringify({
          originalName: file.name,
          size: file.size
        })
      });

      if (!signed.cloudName || !signed.apiKey ||
          !signed.signature || !signed.params) {
        throw new Error("The server returned incomplete upload authorization.");
      }

      // Step 2: Upload directly to Cloudinary. The API secret stays server-side.
      const formData = new FormData();
      for (const [key, value] of Object.entries(signed.params)) {
        formData.append(key, String(value));
      }
      formData.append("api_key", signed.apiKey);
      formData.append("signature", signed.signature);
      formData.append("file", file);

      const uploadResponse = await fetch(
        "https://api.cloudinary.com/v1_1/" +
          encodeURIComponent(signed.cloudName) + "/video/upload",
        {
          method: "POST",
          credentials: "omit",
          body: formData
        }
      );

      let uploadResult;
      try {
        uploadResult = await uploadResponse.json();
      } catch {
        throw new Error("Cloudinary returned an unreadable upload response.");
      }

      if (!uploadResponse.ok || !uploadResult.public_id) {
        throw new Error(
          uploadResult.error?.message || "Cloudinary audio upload failed."
        );
      }

      uploadedPublicId = uploadResult.public_id;

      // Step 3: Verify the uploaded authenticated asset on our backend.
      const verified = await api("/admin/notes/assets/audio/verify", {
        method: "POST",
        body: JSON.stringify({
          publicId: uploadedPublicId,
          originalName: file.name
        })
      });

      const asset = verified.asset;
      if (!asset || asset.publicId !== uploadedPublicId ||
          !Number.isSafeInteger(asset.durationMinutes) ||
          asset.durationMinutes < 1) {
        throw new Error("The server could not confirm the audio duration.");
      }

      if (durationField) {
        durationField.value =
          asset.durationMinutes + " min (verified)";
      }

      // Step 4: Save a draft. The backend independently verifies the asset again.
      if (button) button.textContent = "Saving draft...";
      const created = await api("/admin/notes/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          category: $("taskCategory")?.value.trim() || "General",
          description: $("taskDescription")?.value || "",
          brief: $("taskBrief")?.value || "",
          expectedNotes: $("taskExpected")?.value || "",
          audioPublicId: asset.publicId,
          audioOriginalName: asset.originalName
        })
      });

      const savedTask = created.task || created;
      message(
        "Draft saved successfully. Verified duration: " +
        asset.durationMinutes + " min. Reward: " +
        usd(savedTask.rewardCents ?? Math.ceil(asset.durationMinutes / 5) * 100) +
        ". The task has not been published."
      );

      audioTaskForm.reset();
      if (durationField) durationField.value = "Upload audio to verify duration";
      await loadTasks();
    } catch (error) {
      const orphanNote = uploadedPublicId
        ? " The audio was uploaded privately, but the draft was not confirmed as saved. Do not upload it repeatedly without checking the task list."
        : "";
      message(error.message + orphanNote, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Upload audio & save draft";
      }
    }
  });

  async function start() {
    try {
      await api("/auth/me");
      if (page === "overview") await loadOverview();
      if (page === "tasks") await loadTasks();
      if (page === "submissions") await loadSubmissions("submitted");
      if (page === "withdrawals") await loadWithdrawals();
    } catch (e) { message(e.message, true); }
  }
  start();
})();
