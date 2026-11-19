"use strict";

(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(
    window.location.hostname
  );

  const configPaths = isLocal
    ? ["/frontend/assets/js/config.js", "/assets/js/config.js"]
    : ["/assets/js/config.js", "/frontend/assets/js/config.js"];

  function loadConfig(index) {
    if (index >= configPaths.length) {
      const message = document.createElement("p");
      message.textContent =
        "Could not load the PrimeTask API configuration. Check the frontend path.";
      message.setAttribute("role", "alert");
      message.style.cssText = "padding:12px;color:#a11";
      document.body.prepend(message);
      return;
    }

    const config = document.createElement("script");
    config.src = configPaths[index];

    config.onload = () => {
      const app = document.createElement("script");
      app.src = "assets/member.js";
      document.body.appendChild(app);
    };

    config.onerror = () => {
      config.remove();
      loadConfig(index + 1);
    };

    document.head.appendChild(config);
  }

  loadConfig(0);
})();
