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

  function renderSubmissionNotes(submission) {
    const format = submission.format || "plain";
    const sections = submission.sections && typeof submission.sections === "object"
      ? submission.sections
      : {};

    const block = (heading, content) => `
      <section class="notes-review-section">
        <h3>${esc(heading)}</h3>
        <div class="notes-review-content">${esc(content || "—")}</div>
      </section>`;

    if (format === "cornell" && sections.cues && sections.notes && sections.summary) {
      return `
        <div class="notes-review">
          <div class="notes-format-label">Cornell notes</div>
          <div class="notes-cornell-grid">
            ${block("Cues / Questions", sections.cues)}
            ${block("Detailed Notes", sections.notes)}
          </div>
          ${block("Summary", sections.summary)}
        </div>`;
    }

    if (format === "charting" && Array.isArray(sections.columns)) {
      return `
        <div class="notes-review">
          <div class="notes-format-label">Charting method</div>
          <div class="notes-chart-grid">
            ${sections.columns.map(column => block(column.heading, column.content)).join("")}
          </div>
        </div>`;
    }

    if (format === "outline" && Array.isArray(sections.items)) {
      return `
        <div class="notes-review">
          <div class="notes-format-label">Outline method</div>
          ${sections.items.map(item => `
            <section class="notes-outline-item">
              <h3>${esc(item.heading)}</h3>
              ${item.details ? `<div class="notes-review-content">${esc(item.details)}</div>` : ""}
              ${(item.subtopics || []).map(sub => `
                <div class="notes-outline-subitem">
                  <strong>${esc(sub.heading)}</strong>
                  ${sub.details ? `<div class="notes-review-content">${esc(sub.details)}</div>` : ""}
                </div>`).join("")}
            </section>`).join("")}
        </div>`;
    }

    if (format === "qa" && Array.isArray(sections.items)) {
      return `
        <div class="notes-review">
          <div class="notes-format-label">Question and Answer</div>
          ${sections.items.map((item, index) => `
            <section class="notes-review-section">
              <h3>Question ${index + 1}</h3>
              <div class="notes-review-content">${esc(item.question)}</div>
              <h3>Answer</h3>
              <div class="notes-review-content">${esc(item.answer)}</div>
              ${item.explanation ? `<h3>Explanation</h3><div class="notes-review-content">${esc(item.explanation)}</div>` : ""}
            </section>`).join("")}
        </div>`;
    }

    if (format === "comparison" && sections.leftLabel && sections.rightLabel) {
      return `
        <div class="notes-review">
          <div class="notes-format-label">Comparison method</div>
          <div class="notes-chart-grid">
            ${block(sections.leftLabel, sections.leftContent)}
            ${block(sections.rightLabel, sections.rightContent)}
          </div>
          ${block("Similarities", sections.similarities)}
          ${block("Differences", sections.differences)}
        </div>`;
    }

    return `
      <div class="notes-review">
        <div class="notes-format-label">${format === "plain" ? "Plain notes" : "Legacy / incomplete structured submission"}</div>
        <div class="notes-review-content">${esc(submission.notesText || "")}</div>
      </div>`;
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
      <tr id="notes-${esc(s.id)}" hidden><td colspan="6">${renderSubmissionNotes(s)}</td></tr>
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
  const audioFileInput = $("audioFile");
  const batchFileList = $("batchFileList");
  const batchFiles = [];
  let nextBatchId = 1;
  let batchBusy = false;

  const allowedExtensions = new Set(["mp3", "wav", "m4a", "ogg", "flac", "webm"]);

  function batchEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function renderBatch() {
    if (!batchFileList) return;

    if (!batchFiles.length) {
      batchFileList.innerHTML = '<p class="muted">No audio files selected yet.</p>';
    } else {
      batchFileList.innerHTML = batchFiles.map(item => `
        <div style="border:1px solid #ccc;border-radius:8px;padding:12px;margin:10px 0">
          <label for="batch-title-${item.id}">Task title</label>
          <input id="batch-title-${item.id}" data-title-id="${item.id}"
            maxlength="180" value="${batchEscape(item.title)}"
            ${batchBusy || item.status === "saved" ? "disabled" : ""}
            style="width:100%;box-sizing:border-box">
          <p class="muted">${batchEscape(item.file.name)} · ${(item.file.size / 1048576).toFixed(1)} MB</p>
          <p><strong>${batchEscape(item.status.toUpperCase())}</strong>: ${batchEscape(item.detail)}</p>
          <button type="button" data-remove-id="${item.id}"
            ${batchBusy || item.status === "saved" ? "disabled" : ""}>Remove</button>
        </div>
      `).join("");
    }

    const pending = batchFiles.some(x => x.status === "queued" || x.status === "failed");
    $("saveAudioTaskBtn").disabled = batchBusy || !pending;
    $("clearBatchBtn").disabled = batchBusy || !batchFiles.length;
    audioFileInput.disabled = batchBusy || batchFiles.length >= 10;
  }

  audioFileInput.addEventListener("change", () => {
    const selected = Array.from(audioFileInput.files || []);

    if (batchFiles.length + selected.length > 10) {
      message("A batch can contain a maximum of 10 audio files.", true);
      audioFileInput.value = "";
      return;
    }

    for (const file of selected) {
      const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
      if (!allowedExtensions.has(ext) || !Number.isSafeInteger(file.size) ||
          file.size < 1 || file.size > 100 * 1024 * 1024) {
        message("Invalid file: " + file.name + ". Use supported audio formats up to 100 MB each.", true);
        audioFileInput.value = "";
        return;
      }
    }

    for (const file of selected) {
      const dot = file.name.lastIndexOf(".");
      const title = dot > 0 ? file.name.slice(0, dot) : file.name;
      batchFiles.push({
        id: nextBatchId++,
        file,
        title: title.slice(0, 180),
        status: "queued",
        detail: "Waiting to upload"
      });
    }

    audioFileInput.value = "";
    renderBatch();
    if (selected.length) message(selected.length + " audio file(s) added. Check each task title.");
  });

  batchFileList.addEventListener("input", event => {
    const field = event.target.closest("[data-title-id]");
    if (!field) return;
    const item = batchFiles.find(x => x.id === Number(field.dataset.titleId));
    if (item && item.status !== "saved") item.title = field.value;
  });

  batchFileList.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-id]");
    if (!button || batchBusy) return;
    const index = batchFiles.findIndex(x => x.id === Number(button.dataset.removeId));
    if (index >= 0 && batchFiles[index].status !== "saved") {
      batchFiles.splice(index, 1);
      renderBatch();
    }
  });

  $("clearBatchBtn").addEventListener("click", () => {
    if (batchBusy) return;
    batchFiles.splice(0, batchFiles.length);
    renderBatch();
    message("Batch list cleared.");
  });

  async function uploadNotesTask(item, shared) {
    let uploadedPublicId = "";

    try {
      const title = item.title.trim();
      if (!title) throw new Error("Enter a title for " + item.file.name);

      item.status = "uploading";
      item.detail = "Requesting secure upload...";
      renderBatch();

      const signed = await api("/admin/notes/assets/audio/signature", {
        method: "POST",
        body: JSON.stringify({
          originalName: item.file.name,
          size: item.file.size
        })
      });

      if (!signed.cloudName || !signed.apiKey || !signed.signature || !signed.params) {
        throw new Error("Incomplete upload authorization from server.");
      }

      item.detail = "Uploading privately...";
      renderBatch();

      const formData = new FormData();
      for (const [key, value] of Object.entries(signed.params)) {
        formData.append(key, String(value));
      }
      formData.append("api_key", signed.apiKey);
      formData.append("signature", signed.signature);
      formData.append("file", item.file);

      const response = await fetch(
        "https://api.cloudinary.com/v1_1/" +
          encodeURIComponent(signed.cloudName) + "/video/upload",
        {
          method: "POST",
          credentials: "omit",
          body: formData
        }
      );

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("Cloudinary returned an unreadable response.");
      }

      if (!response.ok || !result.public_id) {
        throw new Error(result.error?.message || "Audio upload failed.");
      }

      uploadedPublicId = result.public_id;
      item.detail = "Verifying duration...";
      renderBatch();

      const verified = await api("/admin/notes/assets/audio/verify", {
        method: "POST",
        body: JSON.stringify({
          publicId: uploadedPublicId,
          originalName: item.file.name
        })
      });

      const asset = verified.asset;
      if (!asset || asset.publicId !== uploadedPublicId ||
          !Number.isSafeInteger(asset.durationMinutes) || asset.durationMinutes < 1) {
        throw new Error("Server could not verify the audio duration.");
      }

      item.detail = "Creating separate draft...";
      renderBatch();

      const created = await api("/admin/notes/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          category: shared.category,
          description: shared.description,
          brief: shared.brief,
          expectedNotes: shared.expectedNotes,
          audioPublicId: asset.publicId,
          audioOriginalName: asset.originalName
        })
      });

      const task = created.task || created;
      item.status = "saved";
      item.detail = "Draft saved · " + asset.durationMinutes +
        " min · Reward " +
        usd(task.rewardCents ?? Math.ceil(asset.durationMinutes / 5) * 100);

      return true;
    } catch (error) {
      item.status = "failed";
      item.detail = error.message + (uploadedPublicId
        ? " Audio uploaded privately, but draft creation was not confirmed. Check Existing Notes tasks before retrying."
        : "");
      return false;
    } finally {
      renderBatch();
    }
  }

  audioTaskForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (batchBusy) return;

    const pending = batchFiles.filter(x => x.status === "queued" || x.status === "failed");
    if (!pending.length) {
      message("Select audio files first.", true);
      return;
    }

    if (pending.some(x => !x.title.trim())) {
      message("Every audio file needs its own task title.", true);
      return;
    }

    const shared = {
      category: $("taskCategory").value.trim() || "General",
      description: $("taskDescription").value,
      brief: $("taskBrief").value,
      expectedNotes: $("taskExpected").value
    };

    batchBusy = true;
    const button = $("saveAudioTaskBtn");
    button.textContent = "Uploading batch...";
    renderBatch();

    let saved = 0;
    let failed = 0;

    try {
      for (const item of pending) {
        if (await uploadNotesTask(item, shared)) saved++;
        else failed++;
      }

      message(
        saved + " separate draft(s) saved. " + failed +
        " file(s) failed. No task was published automatically.",
        failed > 0
      );

      try {
        await loadTasks();
      } catch (error) {
        message("Drafts were processed, but the task list could not refresh: " + error.message, true);
      }
    } finally {
      batchBusy = false;
      button.textContent = "Upload selected audios & save drafts";
      renderBatch();
    }
  });

  renderBatch();
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
