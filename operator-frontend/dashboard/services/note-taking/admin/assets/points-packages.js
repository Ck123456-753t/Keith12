"use strict";

(() => {
  const API = String(window.PTW_API_BASE || "").replace(/\/+$/, "");
  const ENDPOINT = "/admin/notes/points-packages";
  const $ = (id) => document.getElementById(id);
  const form = $("packageForm");
  const rows = $("packageRows");
  let packages = [];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);

  function message(text, error = false) {
    const el = $("message");
    el.textContent = text || "";
    el.className = "message" + (error ? " error" : "");
  }

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

  function resetForm() {
    form.reset();
    $("packageId").value = "";
    $("formTitle").textContent = "Create a package";
    $("savePackageBtn").textContent = "Create package";
    $("cancelEditBtn").hidden = true;
  }

  function editPackage(id) {
    const item = packages.find(p => p.id === id);
    if (!item) return;

    $("packageId").value = item.id;
    $("packageName").value = item.name;
    $("packagePoints").value = item.points;
    $("packagePrice").value = item.priceKes;
    $("formTitle").textContent = "Edit package";
    $("savePackageBtn").textContent = "Save changes";
    $("cancelEditBtn").hidden = false;
    $("packageName").focus();
    window.scrollTo({top: 0, behavior: "smooth"});
  }

  function renderPackages() {
    $("packageCount").textContent = `${packages.length} package${packages.length === 1 ? "" : "s"}`;

    rows.innerHTML = packages.length ? packages.map(item => `
      <tr>
        <td>
          <strong>${esc(item.name)}</strong>
          <span class="package-id">${esc(item.id)}</span>
        </td>
        <td>${Number(item.points).toLocaleString()}</td>
        <td>KSh ${Number(item.priceKes).toLocaleString()}</td>
        <td><span class="package-status ${item.isActive ? "active" : "inactive"}">${item.isActive ? "Active" : "Inactive"}</span></td>
        <td>
          <div class="package-actions">
            <button class="secondary" type="button" data-edit="${esc(item.id)}">Edit</button>
            <button class="${item.isActive ? "danger" : "success"}" type="button"
              data-toggle="${esc(item.id)}" data-active="${item.isActive ? "true" : "false"}">
              ${item.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        </td>
      </tr>
    `).join("") : `<tr><td colspan="5" class="empty">No Notes Points packages have been created yet.</td></tr>`;
  }

  async function loadPackages() {
    rows.innerHTML = `<tr><td colspan="5" class="empty">Loading packages...</td></tr>`;
    const data = await api(ENDPOINT);
    packages = Array.isArray(data.packages) ? data.packages : [];
    renderPackages();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message("");

    const id = $("packageId").value;
    const name = $("packageName").value.trim();
    const points = Number($("packagePoints").value);
    const priceKes = Number($("packagePrice").value);

    if (!name || !Number.isSafeInteger(points) || points < 1 ||
        !Number.isSafeInteger(priceKes) || priceKes < 1) {
      message("Enter a package name, a positive whole-number Points quantity, and a positive whole-number KSh price.", true);
      return;
    }

    const button = $("savePackageBtn");
    button.disabled = true;

    try {
      const payload = {name, points, priceKes};
      const result = await api(
        id ? ENDPOINT + "/" + encodeURIComponent(id) : ENDPOINT,
        {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );

      message(result.message || (id ? "Package updated successfully." : "Package created successfully."));
      resetForm();
      await loadPackages();
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  $("cancelEditBtn").addEventListener("click", resetForm);

  rows.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.edit) {
      editPackage(button.dataset.edit);
      return;
    }

    if (button.dataset.toggle) {
      const id = button.dataset.toggle;
      const item = packages.find(p => p.id === id);
      if (!item) return;

      const activating = !item.isActive;
      const confirmation = activating
        ? `Activate "${item.name}" so members can purchase it?`
        : `Deactivate "${item.name}" so members can no longer purchase it?`;

      if (!window.confirm(confirmation)) return;

      button.disabled = true;
      message("");

      try {
        await api(ENDPOINT + "/" + encodeURIComponent(id), {
          method: "PATCH",
          body: JSON.stringify({isActive: activating})
        });
        message(activating ? "Package activated." : "Package deactivated.");
        await loadPackages();
      } catch (error) {
        message(error.message, true);
        button.disabled = false;
      }
    }
  });

  $("refreshBtn").addEventListener("click", async () => {
    message("");
    try {
      await loadPackages();
      message("Packages refreshed.");
    } catch (error) {
      message(error.message, true);
    }
  });

  async function start() {
    try {
      await api("/auth/me");
      await loadPackages();
    } catch (error) {
      message(error.message, true);
      rows.innerHTML = `<tr><td colspan="5" class="empty">Unable to load packages.</td></tr>`;
    }
  }

  start();
})();
