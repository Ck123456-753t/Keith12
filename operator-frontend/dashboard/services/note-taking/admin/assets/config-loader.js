"use strict";
(() => {
  const script = document.createElement("script");
  script.src = "/assets/js/config.js";
  script.onload = () => {
    const app = document.createElement("script");
    app.src = document.body.dataset.page === "points-packages"
      ? "assets/points-packages.js"
      : "assets/admin.js";
    document.body.appendChild(app);
  };
  script.onerror = () => {
    const el = document.getElementById("message");
    if (el) {
      el.textContent = "Could not load /assets/js/config.js. Check the deployed frontend path.";
      el.className = "message error";
    }
  };
  document.head.appendChild(script);
})();
