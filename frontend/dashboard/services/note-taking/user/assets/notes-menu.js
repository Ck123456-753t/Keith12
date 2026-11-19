/* PrimeTask Notes shared navigation and membership access */
(() => {
  "use strict";

  const pointsPage = location.pathname.endsWith("/points");

  function showAccessNotice(message) {
    const main = document.querySelector("main") ||
      document.querySelector(".shell") ||
      document.body;

    main.innerHTML = `
      <section role="alert" style="
        max-width:680px;margin:50px auto;padding:28px;
        border-radius:16px;background:#f4f7fb;color:#17243a;
        font-family:Arial,sans-serif;text-align:center">
        <h2 style="margin-top:0">Notes Points access restricted</h2>
        <p>${message}</p>
        <a href="tasks" style="
          display:inline-block;margin-top:12px;padding:12px 20px;
          border-radius:8px;background:#174ea6;color:white;
          text-decoration:none">Browse available tasks</a>
      </section>`;
  }

  function hideRestrictedFeatures() {
    document.querySelectorAll('a[href="points"], a[href$="/points"]')
      .forEach(link => {
        link.hidden = true;
        link.style.display = "none";
        link.setAttribute("aria-hidden", "true");
      });

    document.querySelectorAll("[data-notes-membership-only]")
      .forEach(element => {
        element.hidden = true;
        element.style.display = "none";
      });
  }

  function loadConfig() {
    if (window.PTW_API_BASE) return Promise.resolve();

    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const paths = local
      ? ["/frontend/assets/js/config.js", "/assets/js/config.js"]
      : ["/assets/js/config.js", "/frontend/assets/js/config.js"];

    return new Promise((resolve, reject) => {
      function attempt(index) {
        if (index >= paths.length) {
          reject(new Error("API configuration could not be loaded."));
          return;
        }

        const script = document.createElement("script");
        script.src = paths[index];

        script.onload = () => {
          if (window.PTW_API_BASE) resolve();
          else {
            script.remove();
            attempt(index + 1);
          }
        };

        script.onerror = () => {
          script.remove();
          attempt(index + 1);
        };

        document.head.appendChild(script);
      }

      attempt(0);
    });
  }

  async function checkMembership() {
    await loadConfig();

    const response = await fetch(
      String(window.PTW_API_BASE).replace(/\/+$/, "") + "/notes/dashboard",
      { credentials: "include" }
    );

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The membership response could not be read.");
    }

    if (!response.ok) {
      throw new Error(data.message || "Membership verification failed.");
    }

    return data.dashboard?.hasNotesMembership === true;
  }

  hideRestrictedFeatures();

  checkMembership()
    .then(hasMembership => {
      if (hasMembership) {
        document.querySelectorAll("[data-notes-membership-only]")
          .forEach(element => {
            element.hidden = false;
            element.style.display = "";
          });

        document.querySelectorAll('a[href="points"], a[href$="/points"]')
          .forEach(link => {
            link.hidden = false;
            link.style.display = "";
            link.removeAttribute("aria-hidden");
          });

        return;
      }

      hideRestrictedFeatures();

      if (pointsPage) {
        showAccessNotice(
          "An active PrimeTask Notes membership is required to access Notes Points and purchase Points."
        );
      }
    })
    .catch(error => {
      console.error("Notes membership verification failed:", error);

      hideRestrictedFeatures();

      if (pointsPage) {
        showAccessNotice(
          "We could not verify your Notes membership. Points access is blocked until verification succeeds."
        );
      }
    });

  document.querySelectorAll(".pt-notes-menu-wrap").forEach(wrap => {
    const trigger = wrap.querySelector(".pt-notes-menu-trigger");
    const menu = wrap.querySelector(".pt-notes-menu-dropdown");

    if (!trigger || !menu) return;

    function closeMenu() {
      menu.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", event => {
      event.stopPropagation();
      const isOpen = menu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", event => {
      if (!wrap.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && menu.classList.contains("open")) {
        closeMenu();
        trigger.focus();
      }
    });
  });
})();
