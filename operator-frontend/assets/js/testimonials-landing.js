"use strict";

(() => {
  const section = document.getElementById("ptwTestimonials");
  const track = document.getElementById("testimonialTrack");
  const dots = document.getElementById("testimonialDots");
  const previous = document.getElementById("testimonialPrevious");
  const next = document.getElementById("testimonialNext");

  if (!section || !track || !dots) return;

  let testimonials = [];
  let activeIndex = 0;

  function apiRoot() {
    if (!window.PTW_API_BASE) throw new Error("API URL is not configured.");
    return window.PTW_API_BASE.replace(/\/+$/, "");
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    track.replaceChildren();
    dots.replaceChildren();

    testimonials.forEach((item, index) => {
      const card = element("article", "testimonial-card");
      card.setAttribute("aria-hidden", String(index !== activeIndex));

      const quoteMark = element("div", "testimonial-quote-mark", "“");
      quoteMark.setAttribute("aria-hidden", "true");

      const quote = element("blockquote", "testimonial-message", item.message || "");
      const footer = element("div", "testimonial-member");

      const avatar = element("div", "testimonial-avatar-fallback",
        (item.member?.fullName || "P").trim().charAt(0).toUpperCase());

      if (item.member?.profilePictureUrl) {
        const image = document.createElement("img");
        image.className = "testimonial-avatar";
        image.alt = "";
        image.loading = "lazy";
        image.src = item.member.profilePictureUrl;
        image.onerror = () => image.replaceWith(avatar);
        footer.appendChild(image);
      } else {
        footer.appendChild(avatar);
      }

      const identity = element("div", "testimonial-identity");
      identity.append(
        element("strong", "", item.member?.fullName || "PrimeTask Member"),
        element("span", "", item.member?.membershipName || "Community Member")
      );
      footer.appendChild(identity);

      const content = element("div", "testimonial-card-content");
      content.append(quoteMark, quote, footer);
      card.appendChild(content);
      track.appendChild(card);

      const dot = element("button", "testimonial-dot");
      dot.type = "button";
      dot.setAttribute("aria-label", "Show testimonial " + (index + 1));
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
      dot.addEventListener("click", () => {
        activeIndex = index;
        update();
      });
      dots.appendChild(dot);
    });

    update();
    section.hidden = testimonials.length === 0;
  }

  function update() {
    [...track.children].forEach((card, index) => {
      card.hidden = index !== activeIndex;
      card.setAttribute("aria-hidden", String(index !== activeIndex));
    });
    [...dots.children].forEach((dot, index) => {
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });

    const multiple = testimonials.length > 1;
    if (previous) previous.disabled = !multiple;
    if (next) next.disabled = !multiple;
  }

  previous?.addEventListener("click", () => {
    if (!testimonials.length) return;
    activeIndex = (activeIndex - 1 + testimonials.length) % testimonials.length;
    update();
  });

  next?.addEventListener("click", () => {
    if (!testimonials.length) return;
    activeIndex = (activeIndex + 1) % testimonials.length;
    update();
  });

  fetch(apiRoot() + "/testimonials", {
    method: "GET",
    headers: {Accept:"application/json"},
    cache: "no-store"
  })
  .then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Could not load testimonials.");
    }
    return data.testimonials || data.data?.testimonials || data.data || [];
  })
  .then(records => {
    testimonials = Array.isArray(records) ? records : [];
    if (!testimonials.length) {
      section.hidden = true;
      return;
    }
    activeIndex = 0;
    render();
  })
  .catch(() => {
    section.hidden = true;
  });
})();
