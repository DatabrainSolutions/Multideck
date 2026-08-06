/* Multideck site behaviour.

   Six jobs only: header and hero scroll states, the Features menu, the mobile
   menu, scroll reveals, the pricing calculator, and the enquiry form.
   Everything else is HTML and CSS, so this file stays small enough to run
   before it can be noticed. Nothing here is required to read the site or reach
   the enquiry form. */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------- header */

  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () {
      header.dataset.scrolled = window.scrollY > 8 ? "true" : "false";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ------------------------------------------------------- hero parallax
     The oversized photographic layer follows the viewport more slowly than
     the page. A single animation-frame update keeps scrolling responsive. */

  var parallaxHero = document.querySelector("[data-hero-parallax]");
  if (parallaxHero && !reduced) {
    var parallaxFrame = 0;

    var updateHeroParallax = function () {
      parallaxFrame = 0;
      var box = parallaxHero.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= window.innerHeight) return;

      var travelled = Math.max(0, -box.top);
      var offset = Math.min(travelled * 0.12, window.innerHeight * 0.12);
      parallaxHero.style.setProperty("--hero-parallax-y", offset.toFixed(2) + "px");
    };

    var requestHeroParallax = function () {
      if (parallaxFrame) return;
      parallaxFrame = window.requestAnimationFrame(updateHeroParallax);
    };

    updateHeroParallax();
    window.addEventListener("scroll", requestHeroParallax, { passive: true });
    window.addEventListener("resize", requestHeroParallax, { passive: true });
  }

  /* ------------------------------------------------------- features menu */

  var trigger = document.querySelector("[data-menu-trigger]");
  var menu = document.querySelector("[data-menu]");

  if (trigger && menu) {
    var header = trigger.closest("[data-header]");

    var setMenu = function (open) {
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      menu.dataset.open = open ? "true" : "false";
      if (header) header.dataset.menuOpen = open ? "true" : "false";
      menu.setAttribute("aria-hidden", open ? "false" : "true");
      if (open) menu.removeAttribute("inert");
      else menu.setAttribute("inert", "");
    };

    var closeNow = function () {
      setMenu(false);
    };

    trigger.addEventListener("click", function () {
      setMenu(trigger.getAttribute("aria-expanded") !== "true");
    });

    var wrap = trigger.closest("[data-menu-wrap]") || menu.parentNode;
    wrap.addEventListener("focusout", function (event) {
      if (!wrap.contains(event.relatedTarget)) closeNow();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (trigger.getAttribute("aria-expanded") !== "true") return;
      closeNow();
      trigger.focus();
    });

    document.addEventListener("pointerdown", function (event) {
      if (!wrap.contains(event.target)) closeNow();
    });

    var desktopMenuQuery = window.matchMedia("(min-width: 1001px)");
    if (desktopMenuQuery.addEventListener) {
      desktopMenuQuery.addEventListener("change", closeNow);
    }
  }

  /* --------------------------------------------------------- mobile menu */

  var navToggle = document.querySelector("[data-nav-toggle]");
  var mobileNav = document.querySelector("[data-mobile-nav]");

  if (navToggle && mobileNav) {
    var setMobileNav = function (open) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      mobileNav.dataset.open = open ? "true" : "false";
      mobileNav.setAttribute("aria-hidden", open ? "false" : "true");
      if (open) mobileNav.removeAttribute("inert");
      else mobileNav.setAttribute("inert", "");
    };

    navToggle.addEventListener("click", function () {
      var open = navToggle.getAttribute("aria-expanded") !== "true";
      setMobileNav(open);
    });

    /* Following a link inside the panel should leave it closed behind you. */
    mobileNav.addEventListener("click", function (event) {
      if (!event.target.closest("a")) return;
      setMobileNav(false);
    });

    var mobileMenuQuery = window.matchMedia("(max-width: 1000px)");
    if (mobileMenuQuery.addEventListener) {
      mobileMenuQuery.addEventListener("change", function () {
        setMobileNav(false);
      });
    }
  }

  /* --------------------------------------------------------------- reveal
     One observer for every reveal variant: block rises (.rv), line-by-line
     headings (.lines), drawn rules (.rule), media clip wipes (.frame-wipe) and
     the deck marker stagger (.deck-rise). Each element is unobserved once shown,
     so nothing keeps running after the first pass. */

  var revealed = document.querySelectorAll(".rv, .lines, .rule, .frame-wipe, .deck-rise");

  var show = function (node) {
    node.dataset.shown = "true";
  };

  if (reduced || !("IntersectionObserver" in window)) {
    revealed.forEach(show);
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );

    revealed.forEach(function (node) {
      /* Anything already in view on load is shown immediately, so the first
         screen never waits on a scroll event that may not come. */
      var box = node.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.92 && box.bottom > 0) show(node);
      else observer.observe(node);
    });
  }

  /* ------------------------------------------------ pricing calculator */

  document.querySelectorAll("[data-pricing-calculator]").forEach(function (calculator) {
    var slider = calculator.querySelector("#team-size");
    var teamCount = calculator.querySelector("[data-team-count]");
    var teamTier = calculator.querySelector("[data-team-tier]");
    var monthlyPrice = calculator.querySelector("[data-monthly-price]");
    var monthlyPeriod = calculator.querySelector("[data-monthly-period]");
    var contractPrice = calculator.querySelector("[data-contract-price]");

    if (!slider || !teamCount || !teamTier || !monthlyPrice || !monthlyPeriod || !contractPrice) return;

    var currency = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    });

    var tierFor = function (employees) {
      if (employees <= 25) return { range: "Multideck 25", monthly: 5000 };
      if (employees <= 50) return { range: "Multideck 50", monthly: 8000 };
      if (employees <= 75) return { range: "Multideck 75", monthly: 10000 };
      return { range: "More than 75 users", monthly: null };
    };

    var positionTier = function (ratio) {
      var sliderWidth = slider.clientWidth;
      var tierWidth = teamTier.offsetWidth;
      if (!sliderWidth || !tierWidth) return;

      /* Native range thumbs travel inside the control by half their diameter.
         Place the label from that real thumb position, then move its pointer
         back to the thumb when the label is clamped at either edge. */
      var thumbSize = 27;
      /* The calculator padding gives the label four safe pixels beyond the
         track. That keeps the tail away from the rounded corner without
         disconnecting it from the thumb at the endpoints. */
      var edgeGap = -4;
      var thumbPosition = thumbSize / 2 + ratio * Math.max(sliderWidth - thumbSize, 0);
      var tierCenter = Math.min(
        Math.max(thumbPosition, tierWidth / 2 + edgeGap),
        sliderWidth - tierWidth / 2 - edgeGap,
      );
      var pointerPosition = Math.min(
        Math.max(thumbPosition - tierCenter + tierWidth / 2, 18),
        tierWidth - 18,
      );

      calculator.style.setProperty("--slider-tier-position", tierCenter + "px");
      calculator.style.setProperty("--slider-tier-pointer", pointerPosition + "px");
    };

    var updatePricing = function () {
      var employees = Number(slider.value);
      var min = Number(slider.min);
      var max = Number(slider.max);
      var ratio = (employees - min) / (max - min);
      var position = ratio * 100;
      var tier = tierFor(employees);

      calculator.style.setProperty("--slider-position", position + "%");
      teamCount.innerHTML = employees + " <span>" + (employees === 1 ? "user" : "users") + "</span>";
      teamTier.textContent = tier.range;
      slider.setAttribute("aria-valuetext", employees + " users, " + tier.range);
      positionTier(ratio);

      if (tier.monthly == null) {
        calculator.dataset.custom = "true";
        monthlyPrice.textContent = "Speak with us";
        monthlyPeriod.textContent = "";
        contractPrice.textContent = "A plan shaped around your operation";
      } else {
        delete calculator.dataset.custom;
        monthlyPrice.textContent = currency.format(tier.monthly);
        monthlyPeriod.textContent = " / month";
        contractPrice.textContent = currency.format(tier.monthly * 12) + " over 12 months";
      }
    };

    slider.addEventListener("input", updatePricing);
    if ("ResizeObserver" in window) new ResizeObserver(updatePricing).observe(slider);
    else window.addEventListener("resize", updatePricing);
    updatePricing();
  });

  /* ---------------------------------------------------------------- forms */

  /* With no endpoint configured the enquiry is handed to the visitor's own mail
     client, pre-filled, rather than posted into nowhere. The visitor still sends
     it themselves either way. */
  document.querySelectorAll("[data-enquiry-form]").forEach(function (form) {
    var status = form.querySelector("[data-form-status]");
    var mailto = form.dataset.mailto;

    form.addEventListener("submit", function (event) {
      if (form.getAttribute("action")) return; // a real endpoint handles it
      event.preventDefault();

      if (!form.reportValidity()) return;

      var data = new FormData(form);
      var lines = [];
      form.querySelectorAll("[name]").forEach(function (control) {
        var label = control.dataset.label || control.name;
        var value = data.get(control.name);
        if (value) lines.push(label + ": " + value);
      });

      var subject = "Multideck enquiry: " + (data.get("company") || "new enquiry");
      window.location.href =
        "mailto:" +
        mailto +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(lines.join("\n\n"));

      if (status) {
        status.hidden = false;
        status.textContent =
          "Your enquiry is ready in your email app, addressed to " + mailto + ". Send it and we will reply shortly.";
        status.focus();
      }
    });
  });
})();
