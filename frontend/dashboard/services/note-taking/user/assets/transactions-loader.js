"use strict";

(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(
    window.location.hostname
  );

  const paths = isLocal
    ? ["/frontend/assets/js/config.js", "/assets/js/config.js"]
    : ["/assets/js/config.js", "/frontend/assets/js/config.js"];

  function showError(message) {
    const heading = document.querySelector(".panel-head p");
    if (heading) heading.textContent = message;
  }

  function loadConfig(index) {
    if (index >= paths.length) {
      showError("Could not load the PrimeTask API configuration.");
      return;
    }

    const config = document.createElement("script");
    config.src = paths[index];

    config.onload = () => {
      const app = document.createElement("script");
      app.src = "assets/transactions.js";
      app.onerror = () => {
        showError("Could not load the Notes transactions script.");
      };
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
