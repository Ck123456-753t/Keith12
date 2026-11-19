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

  let hasNotesMembership = false;

  async function loadNotesMembership() {
    const data = await api("/notes/dashboard");
    hasNotesMembership = data.dashboard?.hasNotesMembership === true;
    return hasNotesMembership;
  }

  async function loadAvailableTasks() {
    const rows = $("taskRows");
    const empty = $("emptyState");
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="5">Loading tasks…</td></tr>';

    try {
      const data = await api("/notes/tasks/available");
      const tasks = data.tasks || [];

      try {
        await loadNotesMembership();
      } catch (membershipError) {
        hasNotesMembership = false;
        console.error("Notes membership verification failed:", membershipError);
      }

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
          <td>${hasNotesMembership ? `${esc(task.pointsCost)} Points` : "Membership required"}</td>
          <td>${usd(task.rewardCents)}</td>
          <td>
            ${hasNotesMembership
              ? `<button type="button" data-claim="${esc(task.id)}">Claim task</button>`
              : '<span class="membership-required">Membership required to claim</span>'}
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


  function renderFormatFields(format, id) {
    const field = (name, label, placeholder, required = true) => `
      <label>${label}
        <textarea name="${name}" rows="4" ${required ? "required" : ""}
          maxlength="20000" style="display:block;width:100%;box-sizing:border-box;margin:6px 0 14px"
          placeholder="${placeholder}"></textarea>
      </label>`;

    const formats = {
      plain: field("notesText", "Your notes", "Write your notes here…"),
      cornell:
        field("cues", "Cues and questions", "Key terms and questions") +
        field("notes", "Detailed notes", "Main lecture notes") +
        field("summary", "Summary", "Summarize the main ideas"),
      charting:
        field("column1Heading", "Column 1 heading", "Topic or category") +
        field("column1Content", "Column 1 notes", "Relevant details") +
        field("column2Heading", "Column 2 heading", "Topic or category") +
        field("column2Content", "Column 2 notes", "Relevant details"),
      outline:
        field("heading", "Main topic", "Main topic or heading") +
        field("details", "Supporting details", "Explain the main topic", false) +
        field("subtopicHeading", "Subtopic", "Subtopic heading", false) +
        field("subtopicDetails", "Subtopic details", "Supporting explanation", false),
      qa:
        field("question", "Question", "Write a question") +
        field("answer", "Answer", "Write the answer") +
        field("explanation", "Explanation", "Add further explanation", false),
      comparison:
        field("leftLabel", "First subject", "First item") +
        field("leftContent", "First subject details", "Describe the first item") +
        field("rightLabel", "Second subject", "Second item") +
        field("rightContent", "Second subject details", "Describe the second item") +
        field("similarities", "Similarities", "What do they share?") +
        field("differences", "Differences", "How do they differ?")
    };

    return formats[format] || formats.plain;
  }

  function updateFormatFields(form) {
    const selector = form.elements.namedItem("format");
    const container = form.querySelector("[data-format-fields]");
    if (!selector || !container) return;

    container.innerHTML = renderFormatFields(selector.value, form.dataset.submitNotes);
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
                <label>Note-taking format
                  <select name="format" required
                    style="display:block;width:100%;box-sizing:border-box;margin:8px 0 14px">
                    <option value="plain">Plain notes</option>
                    <option value="cornell">Cornell method</option>
                    <option value="charting">Charting method</option>
                    <option value="outline">Outline method</option>
                    <option value="qa">Question and answer</option>
                    <option value="comparison">Comparison method</option>
                  </select>
                </label>

                <div data-format-fields>
                  ${renderFormatFields("plain", task.id)}
                </div>

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
      const form = row?.querySelector("form[data-submit-notes]");

      if (form) {
        form.reset();
        form.dataset.pasteBlocked = "false";
        updateFormatFields(form);
      }

      if (row) row.hidden = false;
      return;
    }

    if (cancel) {
      const row = $(`notes-form-row-${cancel.dataset.cancelWrite}`);
      if (row) row.hidden = true;
    }

  });

  document.addEventListener("change", (event) => {
    const formatSelect = event.target.closest(
      'form[data-submit-notes] select[name="format"]'
    );

    if (formatSelect) {
      updateFormatFields(formatSelect.form);
    }
  });

  document.addEventListener("paste", (event) => {
    const form = event.target.closest?.("form[data-submit-notes]");
    if (!form) return;

    const pastedText = event.clipboardData?.getData("text/plain") || "";

    if (pastedText.length < 9) return;

    event.preventDefault();
    form.dataset.pasteBlocked = "true";

    const row = form.closest("tr");
    if (row) row.hidden = true;

    showMessage(
      "Submission blocked: pasting 9 or more characters is not allowed. Reopen the editor to start a fresh attempt.",
      true
    );
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-submit-notes]");
    if (!form) return;

    event.preventDefault();

    if (form.dataset.pasteBlocked === "true") {
      showMessage("This submission attempt was blocked after a paste. Reopen the editor to start again.", true);
      return;
    }

    const id = form.dataset.submitNotes;
    const format = String(form.elements.namedItem("format")?.value || "plain");
    const value = (name) =>
      String(form.elements.namedItem(name)?.value || "").trim();

    let payload;

    if (format === "plain") {
      payload = { format, notesText: value("notesText") };
    } else if (format === "cornell") {
      payload = {
        format,
        sections: {
          cues: value("cues"),
          notes: value("notes"),
          summary: value("summary")
        }
      };
    } else if (format === "charting") {
      payload = {
        format,
        sections: {
          columns: [
            { heading: value("column1Heading"), content: value("column1Content") },
            { heading: value("column2Heading"), content: value("column2Content") }
          ]
        }
      };
    } else if (format === "outline") {
      const subtopicHeading = value("subtopicHeading");
      const subtopicDetails = value("subtopicDetails");

      payload = {
        format,
        sections: {
          items: [{
            heading: value("heading"),
            details: value("details"),
            subtopics: subtopicHeading
              ? [{ heading: subtopicHeading, details: subtopicDetails }]
              : []
          }]
        }
      };
    } else if (format === "qa") {
      payload = {
        format,
        sections: {
          items: [{
            question: value("question"),
            answer: value("answer"),
            explanation: value("explanation")
          }]
        }
      };
    } else if (format === "comparison") {
      payload = {
        format,
        sections: {
          leftLabel: value("leftLabel"),
          leftContent: value("leftContent"),
          rightLabel: value("rightLabel"),
          rightContent: value("rightContent"),
          similarities: value("similarities"),
          differences: value("differences")
        }
      };
    } else {
      showMessage("Choose a valid note-taking format.", true);
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await api(`/notes/tasks/${encodeURIComponent(id)}/submissions`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage("Notes submitted successfully.");
      await loadMyWork();
    } catch (error) {
      showMessage(error.message, true);
      if (submitButton) submitButton.disabled = false;
    }
  });

  function initializeMemberPage() {
    if ($("taskRows")) loadAvailableTasks();
    if ($("myWorkRows")) loadMyWork();
    if ($("submissionRows")) loadSubmissions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMemberPage, {
      once: true
    });
  } else {
    initializeMemberPage();
  }
})();
