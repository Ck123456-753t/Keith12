"use strict";

(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const paths = isLocal
    ? ["/frontend/assets/js/config.js", "/assets/js/config.js"]
    : ["/assets/js/config.js", "/frontend/assets/js/config.js"];

  function loadConfig(index) {
    if (index >= paths.length) {
      showError("Could not load the PrimeTask API configuration.");
      return;
    }

    const script = document.createElement("script");
    script.src = paths[index];

    script.onload = () => {
      const app = document.createElement("script");
      app.src = "assets/wallet.js";
      app.onerror = () => showError("Could not load the Notes wallet script.");
      document.body.appendChild(app);
    };

    script.onerror = () => {
      script.remove();
      loadConfig(index + 1);
    };

    document.head.appendChild(script);
  }

  function showError(message) {
    const caption = document.getElementById("balanceCaption");
    if (caption) caption.textContent = message;
  }

  loadConfig(0);
})();
