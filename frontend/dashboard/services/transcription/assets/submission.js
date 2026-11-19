"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    jobs: [],
    job: null,
    format: "text",
    busy: false,
    timer: null
  };

  const ui = {
    message: $("#portalMessage"),
    pickerPanel: $("#jobPickerPanel"),
    picker: $("#jobPicker"),
    studio: $("#studio"),
    title: $("#jobTitle"),
    description: $("#jobDescription"),
    status: $("#jobStatus"),
    duration: $("#jobDuration"),
    reward: $("#jobReward"),
    audio: $("#audio"),
    audioStatus: $("#audioStatus"),
    audioFileName: $("#audioFileName"),
    waveform: $("#waveform"),
    bars: $("#waveBars"),
    progress: $("#waveProgress"),
    play: $("#playAudio"),
    current: $("#currentTime"),
    total: $("#durationTime"),
    fileName: $("#fileName"),
    file: $("#docxFile"),
    editor: $("#transcriptEditor"),
    wordCount: $("#wordCount"),
    characterCount: $("#characterCount"),
    link: $("#submissionLink"),
    submit: $("#submitWork"),
    submitMessage: $("#submitMessage"),
    validation: $("#validationStatus"),
    deadlinePanel: $("#deadlinePanel"),
    countdown: $("#countdown"),
    deadlineHint: $("#deadlineHint")
  };

  function showMessage(message, kind = "") {
    ui.message.textContent = message;
    ui.message.className = "portal-message" + (kind ? " " + kind : "");
    ui.message.classList.remove("hidden");
  }

  function showSubmitMessage(message, kind = "") {
    ui.submitMessage.textContent = message;
    ui.submitMessage.className = "submit-message" + (kind ? " " + kind : "");
  }

  function setSubmitBusy(busy) {
    state.busy = busy;
    ui.submit.disabled = busy;
    ui.submit.innerHTML = busy
      ? "Submitting…"
      : 'Submit Work <span>→</span>';
  }

  async function api(path, options = {}) {
    const base = window.PTW_API_BASE;

    if (typeof base !== "string" || !base.trim()) {
      throw new Error("API configuration is missing.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(
      base.replace(/\/+$/, "") + path,
      { ...options, headers, credentials: "include" }
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
      throw error;
    }

    return data;
  }

  function jobId(job) {
    return String(job?.id || job?._id || "");
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function makeWaveform() {
    ui.bars.replaceChildren();
    const count = window.innerWidth < 500 ? 58 : 92;

    for (let i = 0; i < count; i += 1) {
      const bar = document.createElement("span");
      const wave = Math.abs(Math.sin(i * 0.38) * Math.cos(i * 0.12));
      const detail = ((i * 37 + 17) % 29) / 29;
      bar.className = "wave-bar";
      bar.style.height = `${14 + Math.round(wave * 66 + detail * 35)}%`;
      ui.bars.append(bar);
    }
  }

  function updateAudioProgress() {
    const duration = ui.audio.duration;
    const current = ui.audio.currentTime || 0;
    const percent = Number.isFinite(duration) && duration > 0
      ? Math.min(100, current / duration * 100)
      : 0;

    ui.progress.style.width = `${percent}%`;
    ui.current.textContent = formatTime(current);
    ui.total.textContent = formatTime(duration);
    ui.waveform.setAttribute("aria-valuenow", String(Math.round(percent)));

    $$(".wave-bar", ui.bars).forEach((bar, index, bars) => {
      const played = index / Math.max(1, bars.length - 1) * 100 <= percent;
      bar.style.background = played ? "#ff7a18" : "#287cc0";
    });
  }

  function setupAudio() {
    const base = typeof window.PTW_API_BASE === "string"
      ? window.PTW_API_BASE.trim().replace(/\/+$/, "")
      : "";
    const id = state.job ? jobId(state.job) : "";
    const audioUrl = base && id
      ? `${base}/transcription/jobs/${encodeURIComponent(id)}/audio`
      : "";

    ui.audio.pause();
    ui.audio.removeAttribute("src");
    ui.audio.load();
    ui.play.disabled = !audioUrl;
    ui.audioStatus.textContent = audioUrl ? "Loading protected audio…" : "Audio unavailable";
    ui.play.textContent = "▶";
    ui.current.textContent = "00:00";
    ui.total.textContent = "00:00";
    ui.progress.style.width = "0%";

    if (!audioUrl) {
      ui.audioFileName.textContent = "Audio endpoint unavailable";
      return;
    }

    let parsed;
    try {
      parsed = new URL(audioUrl, window.location.href);
    } catch {
      ui.play.disabled = true;
      ui.audioStatus.textContent = "Invalid audio endpoint";
      ui.audioFileName.textContent = "Audio unavailable";
      return;
    }

    if (!["https:", "http:"].includes(parsed.protocol)) {
      ui.play.disabled = true;
      ui.audioStatus.textContent = "Unsupported audio endpoint";
      ui.audioFileName.textContent = "Audio unavailable";
      return;
    }

    ui.audio.crossOrigin = "use-credentials";
    ui.audio.src = parsed.href;
    ui.audioFileName.textContent = "Protected assignment recording";
    ui.audio.load();
  }

  function updateEditorCounts() {
    const text = ui.editor.innerText || "";
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    ui.wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
    ui.characterCount.textContent = `${text.length} characters`;
  }

  function setFormat() {
    state.format = "text";

    $$(".format-tab").forEach(button => {
      const isText = button.dataset.format === "text";

      button.classList.toggle("active", isText);
      button.setAttribute("aria-pressed", String(isText));
      button.disabled = !isText;
    });

    $("#textWorkspace").classList.remove("hidden");
    $("#docxWorkspace").classList.add("hidden");

    if (ui.file) ui.file.disabled = true;

    showSubmitMessage("");
  }

  function updateDeadline() {
    if (!state.job?.claimedAt || !state.job?.assignmentExpiresAt) {
      ui.deadlinePanel.classList.add("hidden");
      return;
    }

    ui.deadlinePanel.classList.remove("hidden");

    const expiry = new Date(state.job.assignmentExpiresAt).getTime();
    if (!Number.isFinite(expiry)) {
      ui.countdown.textContent = "Deadline unavailable";
      ui.deadlineHint.textContent = "Refresh the assignment to check its server deadline.";
      return;
    }

    const remaining = expiry - Date.now();

    if (remaining <= 0) {
      ui.countdown.textContent = "00:00:00";
      ui.deadlineHint.textContent =
        "The displayed deadline has passed. The server decides whether a submission can still be accepted.";
      ui.submit.disabled = true;
      return;
    }

    const seconds = Math.floor(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    ui.countdown.textContent =
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    ui.deadlineHint.textContent =
      "Time remaining, calculated from the assignment expiry returned by the server.";
    ui.submit.disabled = state.busy || state.job?.canSubmit !== true;
  }

  function renderJob(job) {
    state.job = job;
    ui.submit.disabled = job.canSubmit !== true;
    ui.file.disabled = true;
    ui.link.disabled = job.canSubmit !== true;
    ui.editor.contentEditable = job.canSubmit === true ? "true" : "false";

    ui.title.textContent = "Audio";
    ui.description.textContent =
      job.requiredTranscript || "Required transcript not specified for this older assignment.";
    ui.status.textContent = job.status || "awarded";
    ui.duration.textContent = `${Number(job.durationMinutes) || 0} minutes`;
    ui.reward.textContent = formatMoney(
      Number.isFinite(Number(job.reward))
        ? Number(job.reward)
        : Number(job.rewardCents) / 100
    );

    ui.editor.replaceChildren();
    ui.file.value = "";
    ui.fileName.textContent = "No document selected";
    ui.link.value = "";
    updateEditorCounts();
    showSubmitMessage("");

    const expiresAt = job.assignmentExpiresAt
      ? new Date(job.assignmentExpiresAt).getTime()
      : NaN;

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      ui.validation.textContent = "Deadline passed";
      ui.validation.style.color = "#ff9c8e";
    } else {
      ui.validation.textContent = "Ready for work";
      ui.validation.style.color = "";
    }

    setupAudio();
    updateDeadline();
    ui.studio.classList.remove("hidden");
  }

  function populatePicker(jobs, selectedId) {
    ui.picker.replaceChildren();

    jobs.forEach(job => {
      const option = document.createElement("option");
      option.value = jobId(job);
      option.textContent = "Audio";
      option.selected = jobId(job) === selectedId;
      ui.picker.append(option);
    });

    ui.pickerPanel.classList.toggle("hidden", jobs.length < 2);
  }

  async function loadJobs() {
    showMessage("Loading your assigned jobs…");

    const result = await api("/transcription/my-jobs?history=1");
    const jobs = Array.isArray(result.jobs) ? result.jobs : [];

    state.jobs = jobs;

    if (!jobs.length) {
      ui.studio.classList.add("hidden");
      ui.pickerPanel.classList.add("hidden");
      showMessage(
        "You do not have an assigned job available here. Claim an assignment from Available jobs first.",
        "error"
      );
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("job");
    const selected = jobs.find(job => jobId(job) === requestedId) ||
      jobs.find(job => job.status === "awarded") ||
      jobs[0];

    populatePicker(jobs, jobId(selected));
    renderJob(selected);
    ui.message.classList.add("hidden");
  }

  function validateSubmission() {
    const link = ui.link.value.trim();

    if (!link) {
      throw new Error("A documentation link is required.");
    }

    let parsed;

    try {
      parsed = new URL(link);
    } catch {
      throw new Error("Enter a valid documentation link.");
    }

    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      link.length > 2048
    ) {
      throw new Error(
        "Use a valid HTTPS documentation link without embedded credentials."
      );
    }

    const text = (ui.editor.innerText || "").trim();

    if (!text) {
      throw new Error("Enter your transcript before submitting.");
    }

    if (text.length > 200000) {
      throw new Error("Transcript exceeds the 200,000-character limit.");
    }

    return { text, link };
  }

  async function submitWork() {
    if (state.job?.canSubmit !== true) {
      showSubmitMessage(
        "This assignment is no longer available for submission. Refresh My Jobs.",
        "error"
      );
      return;
    }

    if (state.busy || !state.job) return;

    let submission;

    try {
      submission = validateSubmission();
    } catch (error) {
      showSubmitMessage(error.message, "error");
      return;
    }

    const id = jobId(state.job);

    if (!id) {
      showSubmitMessage("Invalid assignment ID. Refresh My Jobs.", "error");
      return;
    }

    setSubmitBusy(true);
    showSubmitMessage("Submitting transcript and documentation link…");

    try {
      const result = await api(
        `/transcription/jobs/${encodeURIComponent(id)}/submissions`,
        {
          method: "POST",
          body: JSON.stringify({
            transcriptText: submission.text,
            submissionLink: submission.link
          })
        }
      );

      showSubmitMessage(
        result.message || "Your submission was received.",
        "success"
      );

      ui.validation.textContent = "Submitted for review";
      ui.submit.disabled = true;
      ui.submit.innerHTML = "Submission received ✓";
      ui.editor.contentEditable = "false";
      ui.link.disabled = true;

    } catch (error) {
      showSubmitMessage(error.message, "error");

      if (error.status === 409) {
        showMessage(
          "The assignment status or deadline changed. Refresh My Jobs.",
          "error"
        );
      }

      setSubmitBusy(false);
      updateDeadline();
    }
  }

  ui.play.addEventListener("click", async () => {
    if (!ui.audio.src) return;

    try {
      if (ui.audio.paused) {
        await ui.audio.play();
      } else {
        ui.audio.pause();
      }
    } catch {
      ui.audioStatus.textContent = "Playback failed. Check the audio URL.";
    }
  });

  ui.audio.addEventListener("play", () => {
    ui.play.textContent = "Ⅱ";
    ui.play.setAttribute("aria-label", "Pause audio");
    ui.audioStatus.textContent = "Playing";
  });

  ui.audio.addEventListener("pause", () => {
    ui.play.textContent = "▶";
    ui.play.setAttribute("aria-label", "Play audio");
    if (ui.audio.currentTime < ui.audio.duration) {
      ui.audioStatus.textContent = "Paused";
    }
  });

  ui.audio.addEventListener("ended", () => {
    ui.audioStatus.textContent = "Playback complete";
  });

  ui.audio.addEventListener("loadedmetadata", updateAudioProgress);
  ui.audio.addEventListener("timeupdate", updateAudioProgress);
  ui.audio.addEventListener("error", () => {
    ui.audioStatus.textContent = "Audio could not be loaded";
  });

  $("#backAudio").addEventListener("click", () => {
    if (Number.isFinite(ui.audio.duration)) {
      ui.audio.currentTime = Math.max(0, ui.audio.currentTime - 10);
    }
  });

  $("#forwardAudio").addEventListener("click", () => {
    if (Number.isFinite(ui.audio.duration)) {
      ui.audio.currentTime = Math.min(
        ui.audio.duration,
        ui.audio.currentTime + 10
      );
    }
  });

  function seekAudio(event) {
    if (!Number.isFinite(ui.audio.duration) || ui.audio.duration <= 0) return;
    const rect = ui.waveform.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    ui.audio.currentTime = percent * ui.audio.duration;
  }

  ui.waveform.addEventListener("click", seekAudio);
  ui.waveform.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    if (!Number.isFinite(ui.audio.duration)) return;
    if (event.key === "ArrowLeft") ui.audio.currentTime = Math.max(0, ui.audio.currentTime - 5);
    if (event.key === "ArrowRight") ui.audio.currentTime = Math.min(ui.audio.duration, ui.audio.currentTime + 5);
    if (event.key === "Home") ui.audio.currentTime = 0;
    if (event.key === "End") ui.audio.currentTime = ui.audio.duration;
  });

  $$(".format-tab").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.format === "text") setFormat("text");
    });
  });

  $$(".editor-toolbar button").forEach(button => {
    button.addEventListener("click", () => {
      ui.editor.focus();
      document.execCommand(button.dataset.command, false, null);
      updateEditorCounts();
    });
  });

  ui.editor.addEventListener("input", updateEditorCounts);

  ui.file.addEventListener("change", () => {
    const file = ui.file.files[0];
    ui.fileName.textContent = file
      ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`
      : "No document selected";
  });

  $("#openLink").addEventListener("click", () => {
    const value = ui.link.value.trim();

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || !parsed.hostname ||
          parsed.username || parsed.password) {
        throw new Error("Use a valid HTTPS link.");
      }
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    } catch {
      showSubmitMessage("Enter a valid HTTPS link before opening it.", "error");
    }
  });

  ui.picker.addEventListener("change", () => {
    const selected = state.jobs.find(job => jobId(job) === ui.picker.value);
    if (selected) renderJob(selected);
  });

  ui.submit.addEventListener("click", submitWork);

  makeWaveform();
  setFormat("text");

  state.timer = window.setInterval(updateDeadline, 1000);

  loadJobs().catch(error => {
    showMessage(error.message || "Could not load your assignments.", "error");
  });
})();
