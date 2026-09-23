// __EXPERIENCE_HARDENED__
// Single-source, defensive experience page logic (no backend dependency reopen)

(function () {
  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (_) { return null; }
  }

  // Owner-approved 2026-08-03 (sir, human-language sweep Item 1): guests never see a
  // backend code. Every invite-accept failure renders through this map — the code stays
  // machine-side, the person reads a sentence.
  function __inviteErrorCopy(code) {
    var map = {
      INVITE_EXPIRED: "This invite has expired. Ask your friend to send a fresh one.",
      INVITE_ALREADY_CLAIMED: "This invite was already used.",
      CANNOT_ACCEPT_OWN_INVITE: "You can't accept your own invite.",
      BLOCKED: "This invite isn't available to you.",
      INVALID_TOKEN: "This invite link isn't valid. Ask your friend to send it again.",
      INVITE_REVOKED: "This invite was withdrawn by the person who sent it."
    };
    return map[String(code || "").trim()] || "Could not accept the invite. Please try again.";
  }

  async function isAuthed(opts) {
    const strict = !!(opts && opts.strict === true);
    try {
      if (!window.tstsGetSession) return false;
      let sess = await window.tstsGetSession({ force: false });
      if (!strict && sess && sess.ok && sess.user) return true;
      // Reserve flow must re-probe auth to avoid stale cache/local-hint drift.
      sess = await window.tstsGetSession({ force: true });
      return !!(sess && sess.ok && sess.user);
    } catch (_) {
      return false;
    }
  }

  function redirectToLogin() {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.href = "login.html?returnTo=" + returnTo;
  }

  async function af(path, opts) {
    // STRICT: single truth must come from common.js
    if (window.authFetch == null) {
      window.tstsNotify("App bootstrap error: common.js not loaded.", "error");
      throw new Error("authFetch missing");
    }
    return window.authFetch(path, opts);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val ?? "");
  }

  function setImg(id, url, fallbackOverride) {
    const el = document.getElementById(id);
    if (!el) return;
    const fallback = String(fallbackOverride || "/assets/experience-default.jpg");
    window.tstsSafeImg(el, url, fallback);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hero carousel — owner 2026-05-30 (P4 multi-image). Single-image listings
  // render as before (the carousel chrome stays hidden). Multi-image listings
  // get prev/next arrows + dot indicators + keyboard arrows + touch swipe.
  // No external library — touch + click + keyboard are ~80 LOC done by hand.
  // ─────────────────────────────────────────────────────────────────────────
  var __heroIdx = 0;
  var __heroUrls = [];
  function __heroSetIndex(nextIdx) {
    if (!__heroUrls.length) return;
    var len = __heroUrls.length;
    // Wrap around in both directions for a friendly UX.
    var n = ((nextIdx % len) + len) % len;
    __heroIdx = n;
    setImg("main-image", __heroUrls[n]);
    var dotsWrap = document.getElementById("hero-carousel-dots");
    if (dotsWrap) {
      var dots = dotsWrap.querySelectorAll("[data-dot-idx]");
      for (var i = 0; i < dots.length; i += 1) {
        var active = (Number(dots[i].dataset.dotIdx) === n);
        dots[i].style.backgroundColor = active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
        dots[i].style.width = active ? "20px" : "8px";
        dots[i].style.height = "8px";
        dots[i].style.borderRadius = active ? "9999px" : "9999px";
        dots[i].setAttribute("aria-current", active ? "true" : "false");
      }
    }
  }
  function initHeroCarousel(urls) {
    var carousel = document.getElementById("hero-carousel");
    var prevBtn = document.getElementById("hero-carousel-prev");
    var nextBtn = document.getElementById("hero-carousel-next");
    var dotsWrap = document.getElementById("hero-carousel-dots");
    if (!carousel) return;
    __heroUrls = Array.isArray(urls) ? urls.slice(0) : [];
    __heroIdx = 0;
    // Single image (or zero) → set the cover, hide all carousel chrome.
    if (__heroUrls.length <= 1) {
      setImg("main-image", __heroUrls[0] || null);
      if (prevBtn) prevBtn.classList.add("hidden");
      if (nextBtn) nextBtn.classList.add("hidden");
      // sir-approved 2026-08-05 ("Swap the 2 lines"): same clear, security-rule-compliant command.
      if (dotsWrap) { dotsWrap.classList.add("hidden"); dotsWrap.replaceChildren(); }
      return;
    }
    // Build dots.
    if (dotsWrap) {
      // sir-approved 2026-08-05 ("Swap the 2 lines"): same clear, security-rule-compliant command.
      dotsWrap.replaceChildren();
      for (var i = 0; i < __heroUrls.length; i += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.dataset.dotIdx = String(i);
        dot.setAttribute("aria-label", "Go to photo " + (i + 1));
        dot.style.height = "8px";
        dot.style.borderRadius = "9999px";
        dot.style.transition = "all 0.2s";
        dot.style.border = "0";
        dot.style.cursor = "pointer";
        dot.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
        dotsWrap.appendChild(dot);
      }
      dotsWrap.classList.remove("hidden");
    }
    // Show arrows.
    if (prevBtn) prevBtn.classList.remove("hidden");
    if (nextBtn) nextBtn.classList.remove("hidden");
    __heroSetIndex(0);
    // Wire handlers (once — guard via dataset flag).
    if (carousel.dataset.heroCarouselWired !== "1") {
      carousel.dataset.heroCarouselWired = "1";
      if (prevBtn) prevBtn.addEventListener("click", function () { __heroSetIndex(__heroIdx - 1); });
      if (nextBtn) nextBtn.addEventListener("click", function () { __heroSetIndex(__heroIdx + 1); });
      if (dotsWrap) dotsWrap.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== dotsWrap && !(t.dataset && t.dataset.dotIdx)) t = t.parentNode;
        if (!t || t === dotsWrap) return;
        __heroSetIndex(Number(t.dataset.dotIdx));
      });
      // Keyboard left/right when the carousel has focus.
      carousel.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { __heroSetIndex(__heroIdx - 1); e.preventDefault(); }
        else if (e.key === "ArrowRight") { __heroSetIndex(__heroIdx + 1); e.preventDefault(); }
      });
      // Touch swipe — track first touchstart x and call prev/next based on
      // direction when delta exceeds 40px (loose enough not to fight with
      // vertical scroll).
      var touchStartX = null;
      carousel.addEventListener("touchstart", function (e) {
        if (e.touches && e.touches.length === 1) touchStartX = e.touches[0].clientX;
      }, { passive: true });
      carousel.addEventListener("touchend", function (e) {
        if (touchStartX == null) return;
        var endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : touchStartX;
        var delta = endX - touchStartX;
        touchStartX = null;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) __heroSetIndex(__heroIdx + 1);
        else __heroSetIndex(__heroIdx - 1);
      }, { passive: true });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Share-preview meta — owner 2026-06-01 (B). Update OG / Twitter meta tag
  // values to the loaded listing so a shared link renders a rich preview on
  // Twitter, Slack, Discord, WhatsApp Cloud, etc. FB doesn't run JS so its
  // crawler keeps the static defaults from experience.html <head>.
  // ─────────────────────────────────────────────────────────────────────────
  function __setMetaContent(propOrName, value) {
    if (!value) return;
    // og:* uses 'property=' attribute; twitter:* uses 'name=' attribute.
    var selector = propOrName.indexOf("og:") === 0
      ? 'meta[property="' + propOrName + '"]'
      : 'meta[name="' + propOrName + '"]';
    var el = document.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      if (propOrName.indexOf("og:") === 0) el.setAttribute("property", propOrName);
      else el.setAttribute("name", propOrName);
      document.head.appendChild(el);
    }
    el.setAttribute("content", String(value));
  }

  function __updateSharePreviewMeta(exp, heroImages) {
    if (!exp) return;
    var title = String(exp.title || "").trim();
    var rawDesc = String(exp.description || "").trim();
    // Truncate to ~160 chars at a word boundary so FB/Twitter don't tail-cut.
    var desc = rawDesc;
    if (desc.length > 160) {
      desc = desc.slice(0, 160).replace(/\s+\S*$/, "") + "…";
    }
    var coverImage = "";
    if (Array.isArray(heroImages) && heroImages.length > 0) coverImage = String(heroImages[0]);
    else if (exp.imageUrl) coverImage = String(exp.imageUrl);
    else if (Array.isArray(exp.images) && exp.images.length > 0) coverImage = String(exp.images[0]);
    // Use the canonical experience URL on the current origin.
    var expIdForUrl = String(exp._id || exp.id || "").trim();
    var pageUrl = window.location.origin + "/experience.html" + (expIdForUrl ? ("?id=" + encodeURIComponent(expIdForUrl)) : "");
    var ogTitle = title || "An experience on The Shared Table Story";
    var ogDesc = desc || "Find your table. Locals sharing food, stories, movement, and more.";
    __setMetaContent("og:title", ogTitle);
    __setMetaContent("og:description", ogDesc);
    if (coverImage) __setMetaContent("og:image", coverImage);
    __setMetaContent("og:url", pageUrl);
    __setMetaContent("og:type", "website");
    __setMetaContent("twitter:title", ogTitle);
    __setMetaContent("twitter:description", ogDesc);
    if (coverImage) __setMetaContent("twitter:image", coverImage);
    __setMetaContent("twitter:card", "summary_large_image");
    // Also update the <title> + meta[name=description] so the browser tab and
    // any non-OG-aware preview (e.g. search-result snippets) reflect the listing.
    try { document.title = ogTitle + " - The Shared Table Story"; } catch (_titleErr) { void _titleErr; }
    var descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute("content", ogDesc);
  }

  function looksLikeEmail(v) {
    const s = String(v || "").trim();
    if (!s) return false;
    if (s.length > 254) return false;
    if (/\s/.test(s)) return false;
    const at = s.indexOf("@");
    if (at <= 0 || at !== s.lastIndexOf("@")) return false;
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    if (!local || !domain) return false;
    if (local.length > 64 || domain.length < 3 || domain.length > 253) return false;
    if (domain.indexOf(".") < 1) return false;
    if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") || domain.endsWith("-")) return false;
    const tld = domain.split(".").pop() || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) return false;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
    if (!/^[a-z0-9.-]+$/i.test(domain)) return false;
    return true;
  }

  function normalizeHostName(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostName || "").trim();
    if (fromTop && !looksLikeEmail(fromTop)) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj.name || "").trim();
    if (fromNested && !looksLikeEmail(fromNested)) return fromNested;
    return "";
  }

  function normalizeHostPic(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostPic || "").trim();
    if (fromTop) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj.avatar || hostObj.profilePic || "").trim();
    if (fromNested) return fromNested;
    return "";
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  }

  // Found in the first audit pass and left unfixed until 2026-08-21: this printed a bare "$", so
  // the extra-guest line read "+$50.00 each extra" directly beneath a headline reading
  // "A$580 private total" — two currencies named on one screen for the same money. It now takes
  // the listing's own currency, through the same formatter the rest of the page already uses.
  // tstsFormatPriceSymbol is defined further down in THIS file (not on window — I checked on the
  // live page before wiring it), and function declarations hoist, so calling it here is safe.
  function money(n) {
    const num = Number(n || 0);
    const value = Number.isFinite(num) ? num : 0;
    return tstsFormatPriceSymbol(value, String((exp && exp.currency) || "aud"));
  }

  // Owner 2026-05-30 (R5): format a slot string like "10:00-13:00" (the
  // backend's 24h storage format) as the AU 12-hour display "10:00 AM – 1:00 PM".
  // Keep the source string anywhere we WRITE it back to the server — only the
  // visible text changes. Returns the original string unchanged if the input
  // doesn't match HH:MM-HH:MM (defensive — we'd rather show the raw value than
  // a blank field on a malformed slot).
  function formatSlotForDisplay(slot) {
    var raw = String(slot || "").trim();
    var m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) return raw;
    function part(hStr, mStr) {
      var h = parseInt(hStr, 10);
      var mm = mStr;
      var period = h >= 12 ? "PM" : "AM";
      var h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return String(h12) + ":" + mm + " " + period;
    }
    return part(m[1], m[2]) + " – " + part(m[3], m[4]);
  }

  // The platform supports ten currencies and every listing carries its own, so the fallback below
  // may not assume a dollar. Mirrors the map host.js already ships; an unmapped code falls back to
  // a "CODE " prefix, which is unambiguous rather than a misleading "$". Declared BEFORE the
  // formatter that reads it — a `var` declared after would hoist as `undefined` and throw.
  var EXP_CCY_SYMBOL = {
    aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
    eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF "
  };

  // sir's order 2026-08-22 (refund snapshot table): the table shows REAL dollar figures for THIS
  // booking, so it needs the same total the guest is looking at — after guest count, group discount
  // and any coupon. Captured in cents at every site that paints the Total, never recomputed, so the
  // table can never disagree with the figure above it.
  // Declared HERE, above its first use at ~line 810, not beside the other policy state further down:
  // a `let` used before its declaration sits in the temporal dead zone, which is the exact fragility
  // that shipped a live ReferenceError earlier today.
  var __lastBookingTotalCents = null;

  // Owner-spec 2026-05-04 (D-27): currency formatter that matches the explore
  // card. Uses en-US locale so AUD renders with the disambiguating "A$" prefix
  // (en-AU strips it). Drops trailing .00 when whole-dollar amount.
  function tstsFormatPriceSymbol(amount, currencyCode) {
    var n = Number(amount || 0);
    if (!Number.isFinite(n)) n = 0;
    var code = String(currencyCode || "AUD").toUpperCase();
    try {
      var fmt = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        minimumFractionDigits: (n % 1 === 0 ? 0 : 2),
        maximumFractionDigits: (n % 1 === 0 ? 0 : 2),
        currencyDisplay: "symbol"
      });
      return fmt.format(n);
    } catch (_fmtErr) {
      void _fmtErr;
      // A bare "$" here named the WRONG currency for nine of the ten the platform supports — a
      // ¥ or € listing would have read "$2800". Mirrors host.js's map; an unmapped code falls back
      // to a "CODE " prefix, which is unambiguous rather than misleading.
      var sym = EXP_CCY_SYMBOL[code.toLowerCase()] || (code + " ");
      return sym + n.toFixed(n % 1 === 0 ? 0 : 2);
    }
  }

  function toFiniteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isStarterTitle(raw) {
    const t = String(raw || "").trim();
    if (!t) return false;
    return /^WORLDCLASS_STARTER_/i.test(t) || /^starter[_\-\s]/i.test(t);
  }

  function stripWorldClassPrefix(raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    return t.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
  }

  function normalizeHostId(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromTop)) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj._id || hostObj.id || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromNested)) return fromNested;
    return "";
  }

  function publicTitle(raw) {
    const t = String(raw || "").trim();
    const debranded = stripWorldClassPrefix(t);
    if (debranded) return debranded;
    if (t && !isStarterTitle(t)) return t;
    return "Shared experience";
  }

  function publicDescription(expLike) {
    const expObj = expLike || {};
    const raw = String(expObj.description || "").trim();
    if (!raw) return "";
    return raw;
  }

  function normalizedVerifiedStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "verified") return "verified";
    if (s === "pending") return "pending";
    if (s === "rejected") return "rejected";
    return "none";
  }

  function applyBookingModeButtonState(btn, active, disabled) {
    if (!btn) return;
    btn.classList.remove("tsts-indicator-ink", "shadow-sm", "bg-white", "text-slate-600", "hover:bg-slate-50", "opacity-50", "cursor-not-allowed");
    if (active) {
      btn.classList.add("tsts-indicator-ink", "shadow-sm");
    } else {
      btn.classList.add("bg-white", "text-slate-600", "hover:bg-slate-50");
    }
    if (disabled) {
      btn.classList.add("opacity-50", "cursor-not-allowed");
      btn.setAttribute("aria-disabled", "true");
    } else {
      btn.removeAttribute("aria-disabled");
    }
  }

  function restoreSharedGuestOptions() {
    if (!guestInput) return;
    var cap = (exp && Number(exp.maxGuests)) || 2;
    cap = Math.max(1, Math.min(cap, 50));

    // Per-checkout cap is 6; per-user-per-occurrence cap is 10
    var checkoutCap = 6;
    var effectiveCap = Math.min(cap, checkoutCap);

    // If my-seats data is loaded, further cap by per-user remaining
    if (_mySeatsLoaded) {
      var userRemaining = Math.max(0, _perUserCap - _userExistingSeats);
      var occRemaining = Math.max(0, (_occurrenceMaxGuests || cap) - _occurrenceReserved);
      effectiveCap = Math.min(effectiveCap, userRemaining, occRemaining);
    }
    cap = Math.max(0, effectiveCap);

    var dd = (exp && exp.dynamicDiscounts && exp.dynamicDiscounts.group && exp.dynamicDiscounts.group.host) || {};
    var hostEnabled = Boolean(dd.enabled);
    var tiers = (hostEnabled && Array.isArray(dd.tiers)) ? dd.tiers : [];

    guestInput.textContent = "";

    if (cap <= 0 && _mySeatsLoaded) {
      // User has reached their seat limit for this occurrence
      guestInput.disabled = true;
      var noOpt = document.createElement("option");
      noOpt.value = "0";
      noOpt.textContent = "No spots available";
      guestInput.appendChild(noOpt);
      if (submitBtn) submitBtn.disabled = true;
      // R4 (2026-05-30): cap-reached message lives inline on the Guests row now
      // (updateGuestsInlineHelper → "Your N-seat limit reached"). #seats-info
      // stays reserved for time-slot context to avoid duplicate copy.
      if (seatsInfoEl) seatsInfoEl.textContent = "";
      updateGuestsInlineHelper();
      return;
    }

    guestInput.disabled = false;
    for (var i = 1; i <= cap; i++) {
      var opt = document.createElement("option");
      opt.value = String(i);
      var label = i + (i === 1 ? " guest" : " guests");

      var bestPct = 0;
      for (var t = 0; t < tiers.length; t++) {
        var tier = tiers[t] || {};
        if (Number(tier.minGuests) <= i && Number(tier.percent) > bestPct) bestPct = Number(tier.percent);
      }
      if (bestPct > 0) label += " (" + bestPct + "% OFF)";

      opt.textContent = label;
      guestInput.appendChild(opt);
    }

    // R4 (2026-05-30): existing-seats info ("you already have N booked") now
    // surfaces as the inline-helper suffix on the Guests row; #seats-info no
    // longer carries seat copy, only time-slot context further down.
    if (seatsInfoEl && _mySeatsLoaded) seatsInfoEl.textContent = "";

    var target = String(lastSharedGuestCount || "1");
    var hasTarget = Array.from(guestInput.options).some(function (o) { return String(o.value) === target; });
    if (hasTarget) guestInput.value = target;
    else if (guestInput.options.length > 0) guestInput.value = guestInput.options[0].value;
    // R4 (2026-05-30): refresh the inline helper after dropdown rebuilds so
    // seats-left / sold-out / your-bookings reflects the latest occurrence data.
    updateGuestsInlineHelper();
  }

  function setPrivateGuestOptions(capacity) {
    if (!guestInput) return;
    const cap = Math.max(1, Number(capacity) || 1);
    guestInput.disabled = false;
    guestInput.textContent = "";
    for (let i = 1; i <= cap; i += 1) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = i + (i === 1 ? " guest" : " guests");
      guestInput.appendChild(opt);
    }
    const target = String(lastPrivateGuestCount || "1");
    const hasTarget = Array.from(guestInput.options).some((opt) => String(opt.value || "") === target);
    guestInput.value = hasTarget ? target : "1";
  }

  // Owner 2026-05-30 (R4): inline helper text on the SAME row as the "Guests"
  // label. Single function, three branches — one per bookingMode value
  // (shared / private / both). The "both" listing's behaviour is driven by
  // whichever toggle is currently active (the user-facing bookingMode var),
  // so the same branch logic applies; this function just reads bookingMode.
  function updateGuestsInlineHelper() {
    const el = document.getElementById("guests-inline-helper");
    if (!el) return;
    const isPrivate = (bookingMode === "private") && (privateBookingEnabled || privateRequestMode);
    if (isPrivate) {
      const cap = Math.max(1, Number(privateCapacity) || 1);
      const inc = Math.max(1, Math.min(cap, Number(privateIncludedGuests) || cap));
      const extra = Number(privateExtraGuestPrice) || 0;
      let text;
      if (extra > 0 && inc < cap) {
        // Per-table base covers `inc` guests; each guest above `inc` costs `extra`.
        text = "Up to " + String(cap) + " · base covers " + String(inc) + ", +" + money(extra) + " each extra";
      } else {
        // Flat private price covers all seats up to capacity.
        text = "Up to " + String(cap) + (cap === 1 ? " guest" : " guests") + " · whole table";
      }
      el.textContent = text;
      return;
    }
    // SHARED branch — show seats-left or sold-out, optionally with "you have N booked"
    // suffix when the viewer already has bookings on this occurrence.
    if (guestInput && guestInput.disabled) {
      // Greyed-out dropdown means either the per-user cap was hit, no slot is
      // picked yet, or the session is full. Each case gets a distinct line.
      if (_mySeatsLoaded && _userExistingSeats >= _perUserCap) {
        el.textContent = "Your " + String(_perUserCap) + "-seat limit reached";
      } else if (!_currentOccurrenceId) {
        el.textContent = ""; // No slot picked → no seats context yet.
      } else {
        el.textContent = "Sold out";
      }
      return;
    }
    // Compute seats-left = total session cap − reserved (by everyone).
    const occCap = Number(_occurrenceMaxGuests || (exp && exp.maxGuests)) || 0;
    const reserved = Number(_occurrenceReserved) || 0;
    const seatsLeft = Math.max(0, occCap - reserved);
    let text;
    if (seatsLeft <= 0) text = "Sold out";
    else if (seatsLeft === 1) text = "1 seat left";
    else text = String(seatsLeft) + " seats left";
    if (_mySeatsLoaded && _userExistingSeats > 0) {
      text += " · you have " + String(_userExistingSeats) + " booked";
    }
    el.textContent = text;
  }

  // Owner 2026-05-30 (R6): Apply-button handler. Calls the new server endpoint
  // POST /api/promo-codes/:code/validate (defined in server.js right above the
  // admin promo-codes create endpoint). On success: store the discount preview
  // in __appliedPromo, show ✓ "Code applied — A$X off" + flip Apply → Remove,
  // make input readonly + refresh the displayed price. On failure: show the
  // server's friendly message in red, keep the input editable.
  async function applyPromoCode() {
    const codeRaw = String((promoCodeInput && promoCodeInput.value) || "").trim().toUpperCase();
    if (!codeRaw) {
      showPromoStatus("Enter a coupon code first.", "err");
      return;
    }
    if (!experienceId) {
      showPromoStatus("Open an experience first.", "err");
      return;
    }
    setPromoBusy(true);
    try {
      const res = await af("/api/promo-codes/" + encodeURIComponent(codeRaw) + "/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experienceId,
          numGuests: Number((guestInput && guestInput.value) || 1),
          isPrivate: bookingMode === "private"
        })
      });
      const json = await res.json().catch(function () { return null; });
      if (res.ok && json && json.ok) {
        __appliedPromo = json.data || {};
        // Owner 2026-06-04 (F1): build the chip with the page's A$ symbol formatter
        // (tstsFormatPriceSymbol) + a period — NOT the server's "— AUD X" string
        // (em-dash banned + the symbol must match the rest of the page).
        var _pcDCents = Number(json.data && json.data.discountCents) || 0;
        var _pcCcy = String((json.data && json.data.currency) || (exp && exp.currency) || "aud");
        var _pcMsg = _pcDCents > 0 ? ("Code applied. " + tstsFormatPriceSymbol(_pcDCents / 100, _pcCcy) + " off") : "Code applied";
        showPromoStatus(_pcMsg, "ok");
        promoCodeInput.value = String(json.data && json.data.code || codeRaw);
        promoCodeInput.setAttribute("readonly", "readonly");
        promoCodeInput.classList.add("bg-emerald-50", "border-emerald-200", "text-emerald-900");
        promoCodeInput.classList.remove("bg-slate-50/70");
        if (promoApplyBtn) {
          promoApplyBtn.textContent = "Remove";
          promoApplyBtn.classList.remove("border-tsts-clay/60", "text-tsts-ink", "hover:bg-tsts-cream");
          promoApplyBtn.classList.add("border-emerald-300", "text-emerald-800", "hover:bg-emerald-50");
        }
        try { updateDisplayedPrice(); } catch (_uiErr) { void _uiErr; }
      } else {
        __appliedPromo = null;
        showPromoStatus(String((json && json.message) || "Code not valid for this booking."), "err");
        try { updateDisplayedPrice(); } catch (_uiErr) { void _uiErr; }
      }
    } catch (_netErr) {
      __appliedPromo = null;
      showPromoStatus("Network error. Please try again.", "err");
    } finally {
      setPromoBusy(false);
    }
  }

  function removeAppliedPromoCode() {
    __appliedPromo = null;
    if (promoCodeInput) {
      promoCodeInput.removeAttribute("readonly");
      promoCodeInput.value = "";
      promoCodeInput.classList.remove("bg-emerald-50", "border-emerald-200", "text-emerald-900");
      promoCodeInput.classList.add("bg-slate-50/70");
    }
    if (promoApplyBtn) {
      promoApplyBtn.textContent = "Apply";
      promoApplyBtn.classList.add("border-tsts-clay/60", "text-tsts-ink", "hover:bg-tsts-cream");
      promoApplyBtn.classList.remove("border-emerald-300", "text-emerald-800", "hover:bg-emerald-50");
    }
    if (promoStatusEl) {
      promoStatusEl.classList.add("hidden");
      promoStatusEl.textContent = "";
    }
    try { updateDisplayedPrice(); } catch (_uiErr) { void _uiErr; }
  }

  function showPromoStatus(msg, kind) {
    if (!promoStatusEl) return;
    promoStatusEl.classList.remove("hidden", "text-emerald-700", "text-rose-600");
    promoStatusEl.classList.add(kind === "ok" ? "text-emerald-700" : "text-rose-600");
    promoStatusEl.textContent = String(msg || "");
  }

  function setPromoBusy(busy) {
    if (!promoApplyBtn) return;
    promoApplyBtn.disabled = !!busy;
    promoApplyBtn.textContent = busy ? "Checking…" : (__appliedPromo ? "Remove" : "Apply");
  }

  function refreshBookingModeUI() {
    const isPrivate = bookingMode === "private";
    // Owner 2026-06-03: "private active" = instant private (both/private listings)
    // OR request mode (a shared listing whose host enabled private requests).
    const privateActive = privateBookingEnabled || privateRequestMode;
    // isReq = the guest is on the Private side of a REQUEST listing → 24h auth-hold,
    // not an instant book. Drives the CTA label + the note/hold fields + the endpoint.
    const isReq = isPrivate && privateRequestMode;
    applyBookingModeButtonState(bookingModeSharedBtn, !isPrivate, false);
    applyBookingModeButtonState(bookingModePrivateBtn, isPrivate, !privateActive);

    if (guestCountLabelEl) {
      guestCountLabelEl.textContent = "Guests";
    }

    if (isPrivate && privateActive) {
      setPrivateGuestOptions(privateCapacity);
    } else {
      restoreSharedGuestOptions();
    }

    if (bookingTypeLabelEl) {
      bookingTypeLabelEl.textContent = isPrivate ? "Private booking" : "Shared experience";
    }
    if (bookingTypeSublineEl) {
      if (isReq) bookingTypeSublineEl.textContent = "Request the whole table. The host approves within 24 hours.";
      else if (isPrivate) bookingTypeSublineEl.textContent = "Exclusive slot for your group.";
      else if (privateActive) bookingTypeSublineEl.textContent = "Private option available for this experience.";
      // sir's ruling 2026-08-13 ("Delete that lne"): a shared-only listing said "shared"
      // three times — the label above already reads "Shared experience", and the seat
      // explainer under Date says it again. This third telling carried nothing.
      else bookingTypeSublineEl.textContent = "";
    }

    if (privateBookingNoteEl) {
      if (isReq) {
        // Request mode: the hold-line inside #pr-request-fields carries the explainer,
        // so this note stays empty to avoid duplication.
        privateBookingNoteEl.textContent = "";
      } else if (!privateActive) {
        privateBookingNoteEl.textContent = "Private booking is currently not available for this experience.";
      } else if (isPrivate) {
        // Owner 2026-05-30 (R4): the inline Guests-row helper now carries the
        // "Up to N guests · whole table" line, so the verbose two-sentence
        // paragraph is redundant. Show ONLY the per-extra-guest math when it
        // actually applies; otherwise leave this note empty.
        if (privateExtraGuestPrice > 0 && privateIncludedGuests < privateCapacity) {
          privateBookingNoteEl.textContent = "Each guest above " + String(privateIncludedGuests) + " is " + money(privateExtraGuestPrice) + " extra.";
        } else {
          privateBookingNoteEl.textContent = "";
        }
      } else {
        privateBookingNoteEl.textContent = "Need the entire slot? Switch to Private booking for an exclusive group experience.";
      }
    }

    // Owner 2026-06-03: request-only fields (note + hold line) show ONLY on the
    // Private side of a request listing. CTA mirrors the active flow.
    if (prRequestFields) prRequestFields.classList.toggle("hidden", !isReq);
    if (submitBtn) {
      submitBtn.textContent = isReq ? "Request to book privately"
        : (isPrivate ? "Book private experience" : "Reserve your seat");
    }
    updateDisplayedPrice();
    // R4 (2026-05-30): refresh the inline helper whenever the mode/toggle switches.
    updateGuestsInlineHelper();
    // Owner 2026-06-03: re-evaluate the empty-occurrence gate (request mode needs a
    // date with zero seats booked).
    renderPrivateRequestGate();
    // Owner 2026-07-23 (sir): a shortfall listing with no bookable date is "Coming
    // soon" — override the CTA to a disabled "Not yet open for booking" so no dead
    // Book path is shown. Runs last so it wins over the mode label above; the
    // persistent notice is rendered once in loadExperience.
    if (__bookingComingSoon && submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-disabled", "true");
      submitBtn.textContent = __bookingComingSoonReason || "Not yet open for booking";
      hideComingSoonPurchaseBlocks();
      // sir's go-ahead 2026-08-19: the 2026-07-23 ruling KEPT the waitlist on coming-soon
      // ("The waitlist stays, a useful notify me") but its visibility only ever fired on the
      // slot-cutoff branch, so it could never appear here. Coming-soon now shows it.
      var __csWaitlist = document.getElementById("waitlist-cta");
      if (__csWaitlist) __csWaitlist.classList.remove("hidden");
    }
  }

  function currentPrivateGuests() {
    if (!guestInput) return 1;
    const selected = Number.parseInt(String(guestInput.value || "1"), 10);
    const fallback = Number.isFinite(selected) ? selected : 1;
    const cap = Math.max(1, Number(privateCapacity || 1));
    return Math.max(1, Math.min(cap, fallback));
  }

  function getSharedDiscountPercent(guestCount) {
    var dd = (exp && exp.dynamicDiscounts && exp.dynamicDiscounts.group && exp.dynamicDiscounts.group.host) || {};
    if (!dd.enabled || !Array.isArray(dd.tiers)) return 0;
    var bestPct = 0;
    for (var t = 0; t < dd.tiers.length; t++) {
      var tier = dd.tiers[t] || {};
      if (Number(tier.minGuests) <= guestCount && Number(tier.percent) > bestPct) bestPct = Number(tier.percent);
    }
    return bestPct;
  }

  function updateDiscountDisplay(guestCount) {
    // Owner-approved 2026-07-23 (sir): no purchase math on a "Coming soon" listing.
    if (__bookingComingSoon) { hideComingSoonPurchaseBlocks(); return; }
    var discountBadge = document.getElementById("discount-badge");
    var discountBadgeText = document.getElementById("discount-badge-text");
    var priceBreakdown = document.getElementById("price-breakdown");
    var mathBase = document.getElementById("math-base");
    var mathSubtotal = document.getElementById("math-subtotal");
    var mathDiscountRow = document.getElementById("math-discount-row");
    var mathDiscount = document.getElementById("math-discount");
    var mathTotal = document.getElementById("math-total");

    var pct = getSharedDiscountPercent(guestCount);
    if (pct <= 0 || bookingMode === "private") {
      if (discountBadge) discountBadge.classList.add("hidden");
      if (priceBreakdown) priceBreakdown.classList.add("hidden");
      return;
    }

    var basePerGuest = Number(sharedUnitPrice) || 0;
    // SR-1 + SR-2 (sir's fix-all order 2026-08-20): compute in CENTS exactly as the server
    // does (pricing.js rounds the discount at the minor unit), and speak the site's money
    // voice (A$300, A$38.25) — the old rows rounded in whole dollars and printed "$300.00".
    var listingCcyDisc = (exp && exp.currency) ? String(exp.currency).toUpperCase() : "AUD";
    var subtotalCentsD = Math.round(basePerGuest * 100) * guestCount;
    var discountCentsD = Math.round(subtotalCentsD * pct / 100);
    var totalCentsD = subtotalCentsD - discountCentsD;

    if (discountBadge) discountBadge.classList.remove("hidden");
    if (discountBadgeText) discountBadgeText.textContent = pct + "% Group Discount Applied!";
    if (priceBreakdown) priceBreakdown.classList.remove("hidden");
    if (mathBase) mathBase.textContent = guestCount + " × " + tstsFormatPriceSymbol(basePerGuest, listingCcyDisc);
    if (mathSubtotal) mathSubtotal.textContent = tstsFormatPriceSymbol(subtotalCentsD / 100, listingCcyDisc);
    if (mathDiscountRow) mathDiscountRow.classList.remove("hidden");
    if (mathDiscount) mathDiscount.textContent = "-" + tstsFormatPriceSymbol(discountCentsD / 100, listingCcyDisc);
    if (mathTotal) mathTotal.textContent = tstsFormatPriceSymbol(totalCentsD / 100, listingCcyDisc);
  }

  function updateDisplayedPrice() {
    if (!expPriceValueEl) return;
    const isPrivate = bookingMode === "private" && (privateBookingEnabled || privateRequestMode);
    // Owner-spec 2026-05-04 (D-27): match explore card format.
    //   shared  -> 'A$75 / person'   (suffix ' / person')
    //   private -> 'A$580 private total' (suffix ' private total')
    // Currency code from listing (defaults to 'AUD'). Symbol prefix via en-US.
    var listingCurrency = (exp && exp.currency) ? String(exp.currency).toUpperCase() : "AUD";
    if (!isPrivate) {
      expPriceValueEl.textContent = tstsFormatPriceSymbol(sharedUnitPrice, listingCurrency);
      if (expPriceSuffixEl) expPriceSuffixEl.textContent = " / person";
      var gc = guestInput ? parseInt(guestInput.value, 10) || 1 : 1;
      updateDiscountDisplay(gc);
      // Owner 2026-05-30: show a live-updating Total just above Reserve so guests see what
      // they'll actually pay (per-person × guest count). Currency uses the listing's code.
      if (bookingTotalLineEl && bookingTotalAmountEl && bookingTotalBreakdownEl) {
        var perGuestFmt = tstsFormatPriceSymbol(sharedUnitPrice, listingCurrency);
        // SR-2 (sir's fix-all order 2026-08-20): the Total line and the discount breakdown
        // above it must always agree. The group discount is subtracted HERE too (cents math,
        // same rounding as the server), so the page never shows two different totals at once.
        var unitCentsT = Math.round((Number(sharedUnitPrice) || 0) * 100);
        var subtotalCentsT = unitCentsT * gc;
        var groupPctT = getSharedDiscountPercent(gc);
        var groupDiscCentsT = groupPctT > 0 ? Math.round(subtotalCentsT * groupPctT / 100) : 0;
        var afterGroupCentsT = subtotalCentsT - groupDiscCentsT;
        var groupNote = groupDiscCentsT > 0 ? (" − " + tstsFormatPriceSymbol(groupDiscCentsT / 100, listingCurrency) + " group discount") : "";
        // R6 (2026-05-30): if a validated promo is currently applied, subtract
        // the preview discount from the Total line + show the breakdown. Server
        // re-validates at booking-time so this is purely a display preview.
        if (__appliedPromo && Number(__appliedPromo.discountCents) > 0) {
          var dCentsShared = Math.max(0, Math.min(Number(__appliedPromo.discountCents) || 0, afterGroupCentsT));
          var afterShared = Math.max(0, afterGroupCentsT - dCentsShared);
          bookingTotalAmountEl.textContent = tstsFormatPriceSymbol(afterShared / 100, listingCurrency);
          __lastBookingTotalCents = afterShared;
          bookingTotalBreakdownEl.textContent = perGuestFmt + " × " + gc + " guest" + (gc === 1 ? "" : "s") + groupNote + " − " + tstsFormatPriceSymbol(dCentsShared / 100, listingCurrency) + " coupon";
          // R11 (2026-05-30): mobile sticky bar mirrors the desktop Total + breakdown.
          syncMobileBookingBar({
            totalAmount: afterShared / 100,
            currency: listingCurrency,
            breakdown: gc + (gc === 1 ? " guest" : " guests") + (groupDiscCentsT > 0 ? (" · " + groupPctT + "% off") : "") + " · coupon applied"
          });
        } else {
          bookingTotalAmountEl.textContent = tstsFormatPriceSymbol(afterGroupCentsT / 100, listingCurrency);
          __lastBookingTotalCents = afterGroupCentsT;
          bookingTotalBreakdownEl.textContent = perGuestFmt + " × " + gc + " guest" + (gc === 1 ? "" : "s") + groupNote;
          syncMobileBookingBar({
            totalAmount: afterGroupCentsT / 100,
            currency: listingCurrency,
            breakdown: gc + (gc === 1 ? " guest" : " guests") + (groupDiscCentsT > 0 ? (" · " + groupPctT + "% off") : "")
          });
        }
        if (!__bookingComingSoon) bookingTotalLineEl.classList.remove("hidden");
      }
      return;
    }

    const guests = currentPrivateGuests();
    const included = Math.max(1, Number(privateIncludedGuests || 1));
    const base = Number(privatePrice || 0);
    const extra = Math.max(0, Number(privateExtraGuestPrice || 0));
    const extras = Math.max(0, guests - included);
    const total = base + (extras * extra);

    expPriceValueEl.textContent = tstsFormatPriceSymbol(total, listingCurrency);
    if (expPriceSuffixEl) expPriceSuffixEl.textContent = " private total";
    updateDiscountDisplay(0);
    // Owner 2026-06-04 (F2): when a coupon is applied in private mode, surface the NET
    // total the guest will be held — mirror the shared-mode Total line so the discount is
    // explicit BEFORE submit. The headline above stays the gross "A$X private total".
    // No coupon → keep the headline-only display (sir 2026-05-30) and hide the line.
    if (bookingTotalLineEl && bookingTotalAmountEl && bookingTotalBreakdownEl && __appliedPromo && Number(__appliedPromo.discountCents) > 0) {
      var dCentsPriv = Math.max(0, Math.min(Number(__appliedPromo.discountCents) || 0, Math.round(total * 100)));
      var afterPriv = Math.max(0, Math.round(total * 100) - dCentsPriv);
      bookingTotalAmountEl.textContent = tstsFormatPriceSymbol(afterPriv / 100, listingCurrency);
      __lastBookingTotalCents = afterPriv;
      bookingTotalBreakdownEl.textContent = tstsFormatPriceSymbol(total, listingCurrency) + " private total · " + tstsFormatPriceSymbol(dCentsPriv / 100, listingCurrency) + " coupon applied";
      if (!__bookingComingSoon) bookingTotalLineEl.classList.remove("hidden");
      syncMobileBookingBar({
        totalAmount: afterPriv / 100,
        currency: listingCurrency,
        breakdown: String(guests) + (guests === 1 ? " guest" : " guests") + " · coupon applied"
      });
    } else {
      // R11 (2026-05-30): private mode mobile-bar — show the private total + a
      // breakdown line so the sticky bar matches the headline.
      // Private with NO coupon: the Total LINE is hidden by sir's 2026-05-30 decision (the headline
      // above carries the gross private total instead), but the figure is still what the guest pays,
      // so the refund snapshot must use it.
      __lastBookingTotalCents = Math.round(total * 100);
      if (bookingTotalLineEl) bookingTotalLineEl.classList.add("hidden");
      syncMobileBookingBar({
        totalAmount: total,
        currency: listingCurrency,
        breakdown: String(guests) + (guests === 1 ? " guest" : " guests")
      });
    }
  }

  // R11 (2026-05-30): keep the mobile sticky booking bar's price + sub-line
  // in sync with the desktop Total line. Called from BOTH branches of
  // updateDisplayedPrice so guest count / mode / promo changes all reflect.
  function syncMobileBookingBar(args) {
    const priceEl = document.getElementById("mobile-bar-price");
    const breakdownEl = document.getElementById("mobile-bar-breakdown");
    if (!priceEl) return;
    const amt = Number(args && args.totalAmount) || 0;
    const ccy = String((args && args.currency) || "AUD");
    priceEl.textContent = tstsFormatPriceSymbol(amt, ccy);
    if (breakdownEl) breakdownEl.textContent = String((args && args.breakdown) || "");
  }

  function setBookingMode(nextMode) {
    const wanted = String(nextMode || "shared").toLowerCase() === "private" ? "private" : "shared";
    if (wanted === "private" && !(privateBookingEnabled || privateRequestMode)) {
      bookingMode = "shared";
    } else {
      bookingMode = wanted;
    }
    refreshBookingModeUI();
  }

  function hydrateBookingMode(e) {
    const capRaw = (e && e.privateCapacity != null) ? e.privateCapacity : 0;
    const cap = toFiniteNumber(capRaw);
    privateCapacity = (cap != null && cap > 0) ? Math.floor(cap) : 0;

    const privatePriceRaw = (e && e.privatePrice != null) ? e.privatePrice : null;
    const pp = toFiniteNumber(privatePriceRaw);
    privatePrice = (pp != null && pp > 0) ? pp : null;

    const includedRaw = (e && e.privateIncludedGuests != null) ? e.privateIncludedGuests : privateCapacity;
    const includedNum = toFiniteNumber(includedRaw);
    privateIncludedGuests = (includedNum != null && includedNum > 0)
      ? Math.min(privateCapacity || Number.MAX_SAFE_INTEGER, Math.floor(includedNum))
      : privateCapacity;

    const extraRaw = (e && e.privateExtraGuestPrice != null) ? e.privateExtraGuestPrice : 0;
    const extraNum = toFiniteNumber(extraRaw);
    privateExtraGuestPrice = (extraNum != null && extraNum >= 0) ? extraNum : 0;

    // Owner 2026-05-30 (R13): tie privateBookingEnabled to the LISTING mode, not
    // just the presence of private fields. A shared-only listing that happens
    // to carry stray privatePrice/privateCapacity values in the DB shouldn't
    // surface "Private option available for this experience" subtext when
    // there's no toggle for the guest to act on. Only `both` and `private`
    // listings advertise the private option.
    const __pbeListingMode = String((e && e.bookingMode) || "shared").trim().toLowerCase();
    const __pbeListingAllowsPrivate = (__pbeListingMode === "both" || __pbeListingMode === "private");
    privateBookingEnabled = __pbeListingAllowsPrivate && privateCapacity > 0 && privatePrice != null;
    if (!privateBookingEnabled) bookingMode = "shared";
    // Owner 2026-06-03: request mode = a SHARED listing whose host enabled private
    // requests (privateRequestEnabled is set in loadExperience BEFORE this runs) AND
    // instant private is NOT available → the toggle's Private side becomes a 24h
    // authorization-HOLD REQUEST rather than an instant book.
    privateRequestMode = (privateRequestEnabled === true) && !privateBookingEnabled && privateCapacity > 0 && privatePrice != null;

    // Owner-spec 2026-05-03 (D-9): when listing has explicit bookingMode set
    // by the host, force the booking-mode UI to that mode and hide the toggle
    // (toggle is only meaningful for "both" listings). Single-mode listings
    // surface a static label so guest understands what they're booking.
    // Owner-spec 2026-05-03 (D-9 revised): copy reflects the actual logic.
    // Private-only listings DO NOT need approval (host already declared exclusive).
    // Approval gate exists only on "both" listings, and only when slot has shared.
    // Owner-spec 2026-05-03 (D-9 amend): hero pill removed. Booking-mode signal
    // now lives only in the sidebar (toggle for "both", fixed label for single
    // modes). Hero stays clean: title, location, heart, report, share.
    var __listingMode = String((e && e.bookingMode) || "shared").trim().toLowerCase();
    var __toggle = document.getElementById("booking-type-toggle");
    var __fixedLabel = document.getElementById("booking-mode-fixed-label");
    if (__listingMode === "private") {
      bookingMode = "private";
      if (__toggle) __toggle.classList.add("hidden");
      if (__fixedLabel) {
        __fixedLabel.classList.remove("hidden");
        __fixedLabel.textContent = "Private experience. Book the whole table for your group.";
      }
    } else if (__listingMode === "shared") {
      bookingMode = "shared";
      // Owner 2026-06-03: a SHARED listing whose host enabled private requests gets
      // the Shared/Private toggle too — Private side = "request the whole table" (24h
      // auth-hold). Single-option shared (no requests) keeps the fixed label, no toggle.
      if (privateRequestMode) {
        if (__toggle) __toggle.classList.remove("hidden");
        if (__fixedLabel) __fixedLabel.classList.add("hidden");
      } else {
        if (__toggle) __toggle.classList.add("hidden");
        if (__fixedLabel) {
          __fixedLabel.classList.remove("hidden");
          __fixedLabel.textContent = "Shared seat. Book your spot, the table fills with other guests.";
        }
      }
    } else {
      // "both" mode. Toggle visible; fixed label hidden. When guest tries
      // private and slot has shared bookings, the booking endpoint returns
      // SLOT_HAS_SHARED and frontend surfaces the message.
      if (__toggle) __toggle.classList.remove("hidden");
      if (__fixedLabel) __fixedLabel.classList.add("hidden");
    }

    refreshBookingModeUI();
  }

  function showNotFound(msg) {
    const content = document.getElementById("experience-content");
    const empty = document.getElementById("experience-not-found");
    const text = document.getElementById("experience-not-found-text");
    const mobileBar = document.getElementById("mobile-booking-bar");
    if (content) content.classList.add("hidden");
    if (mobileBar) mobileBar.style.display = "none";
    if (text) text.textContent = String(msg || "This experience is unavailable or may have been removed.");
    if (empty) empty.classList.remove("hidden");
  }

  const experienceId = qs("id");
  const inviteToken = qs("invite");
  const bookingForm = document.getElementById("booking-form");
  const dateInput = document.getElementById("booking-date");
  const guestInput = document.getElementById("guest-count");
  const timeSlotInput = document.getElementById("time-slot");
  const submitBtn = document.getElementById("book-btn");
  // Owner 2026-07-23 (sir): "Coming soon" state for an approved shortfall listing that
  // the host has not yet confirmed + Stage-A-funded. bookingOpen comes from the detail
  // API; when false the whole experience has no bookable date, so we disable Book and
  // show a persistent notice. The booking POST enforces the real gate regardless.
  let __bookingComingSoon = false;
  let __bookingComingSoonReason = "";
  // Owner-approved 2026-07-23 (sir): when a listing is "Coming soon", mute the purchase
  // mechanics so the panel reads as ONE clean not-yet-open state — no active coupon,
  // terms, live Total, or discount breakdown implying a purchase. Price-per-person +
  // schedule stay (anticipation). Idempotent + safe to call repeatedly.
  function hideComingSoonPurchaseBlocks() {
    if (!__bookingComingSoon) return;
    // Owner-approved 2026-07-23 (sir, 2nd pass): also mute the Stripe reassurance +
    // cancellation-refund hint — both are purchase-adjacent and incongruent on a
    // not-yet-open listing. The waitlist stays (a useful "notify me").
    ["booking-coupon-block", "booking-terms-block", "booking-total-line", "price-breakdown", "booking-stripe-reassurance", "booking-policy-hint"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  }
  const expPriceValueEl = document.getElementById("exp-price");
  const expPriceSuffixEl = document.getElementById("exp-price-suffix");
  // Owner 2026-05-30: live-updating Total just above Reserve (per-person price × guest
  // count). Shown only in shared mode; hidden in private mode where the headline already
  // shows the private total.
  const bookingTotalLineEl = document.getElementById("booking-total-line");
  const bookingTotalAmountEl = document.getElementById("booking-total-amount");
  const bookingTotalBreakdownEl = document.getElementById("booking-total-breakdown");
  const termsBox = document.getElementById("booking-terms");
  const bookingRulesEl = document.getElementById("booking-rules");
  const cutoffInfoEl = document.getElementById("cutoff-info");
  const seatsInfoEl = document.getElementById("seats-info");
  const waitlistCtaEl = document.getElementById("waitlist-cta");
  const joinWaitlistBtn = document.getElementById("join-waitlist-btn");
  const waitlistStatusEl = document.getElementById("waitlist-status");
  const bookingTypeLabelEl = document.getElementById("booking-type-label");
  const bookingTypeSublineEl = document.getElementById("booking-type-subline");
  const verifiedFeeNoteEl = document.getElementById("verified-fee-note");
  const bookingModeSharedBtn = document.getElementById("booking-mode-shared");
  const bookingModePrivateBtn = document.getElementById("booking-mode-private");
  const privateBookingNoteEl = document.getElementById("private-booking-note");
  const guestCountLabelEl = document.getElementById("guest-count-label");
  const verifiedBadgeEl = document.getElementById("hero-verified-badge"); // verified badge now overlays the hero image (matches Explore card), owner-approved 2026-05-26
  const verifiedPendingBadgeEl = document.getElementById("exp-verified-pending-badge");
  const promoCodeInput = document.getElementById("promo-code");
  // Owner 2026-05-30 (R6): Apply-button + status pill + applied-state.
  const promoApplyBtn = document.getElementById("promo-apply-btn");
  const promoStatusEl = document.getElementById("promo-status");
  // __appliedPromo carries the validated discount preview so updateDisplayedPrice
  // can show it in the price breakdown + the running Total line. Cleared whenever
  // the input value changes OR Guests/mode flip (subtotal may no longer match).
  var __appliedPromo = null;

  // ── PRIVATE BOOKING REQUEST (Owner 2026-06-03) — refs + state ─────────────
  // A SEPARATE flow from instant Reserve: on a SHARED listing whose host enabled
  // private requests, when the chosen occurrence is EMPTY the guest can request the
  // whole table. POST /api/private-booking-requests → Stripe AUTHORIZATION HOLD
  // (no charge) → 24h host decision. The request fields live in the booking widget (see refreshBookingModeUI).
  const prNoteInput = document.getElementById("pr-note");
  const prHoldExplainerEl = document.getElementById("pr-hold-explainer");
  // Owner 2026-06-03 (toggle integration): the request fields now live INSIDE the
  // booking widget. #pr-request-fields (note + hold line) is shown by
  // refreshBookingModeUI on the Private side of a request listing; #pr-occupancy-msg
  // explains when the chosen date can't take a private request (seats already booked).
  const prRequestFields = document.getElementById("pr-request-fields");
  const prOccupancyMsg = document.getElementById("pr-occupancy-msg");
  // True only when this experience is a SHARED listing with the host's private-
  // request toggle ON and a valid private price/capacity. Set in loadExperience().
  let privateRequestEnabled = false;

  const bookmarkBtn = document.getElementById("bookmark-btn");
  const bookmarkIcon = document.getElementById("bookmark-icon");
  // Owner-spec 2026-05-03 (D-7): bookmark-label / like-btn / like-icon / like-count
  // removed, single heart that mirrors explore card. References dropped.
  const reportExperienceBtn = document.getElementById("report-experience-btn");
  // Owner-approved 2026-05-02: Web Share button (single, native sheet on mobile, copy-link fallback desktop).
  const shareExperienceBtn = document.getElementById("share-experience-btn");
  if (shareExperienceBtn) {
    shareExperienceBtn.addEventListener("click", function(ev) {
      ev.preventDefault();
      try {
        var titleEl = document.getElementById("exp-title");
        var titleStr = titleEl ? String(titleEl.textContent || "").trim() : "The Shared Table Story";
        var shareText = "Check out this experience on The Shared Table Story: " + titleStr;
        if (typeof window.tstsShareExperience === "function") {
          window.tstsShareExperience({ title: titleStr, text: shareText, url: window.location.href, experienceId: experienceId });
        }
      } catch (_shareErr) { /* helper unavailable; share skipped */ }
    });
  }

  const similarSection = document.getElementById("similar-section");
  const similarGrid = document.getElementById("similar-grid");

  const reviewsSection = document.getElementById("reviews-section");
  const reviewsList = document.getElementById("reviews-list");

  let exp = null;
  let viewerUserId = "";
  let viewerIsHostForExperience = false;
  // sir's order O-146: is this page showing a preview? Held here because the sticky bar at the foot of
  // the phone screen is built AFTER the listing loads and has to know. Without it that bar reads the
  // booking form's visibility, finds a hidden form, concludes the person has scrolled past it, and puts
  // "Reserve your seat" on screen over a table that is not open.
  let pageIsPreview = false;
  let activePolicyVersion = "";
  let activePolicyCancelCap = null;
  // Owner 2026-05-30 (R7): full per-tier refund schedule (sorted desc by hours-
  // before-event). Used by renderPolicyCancelHint() to compute concrete deadline
  // dates for the chosen booking date + slot. Falls back to the vague hint if
  // tiers couldn't load.
  let activePolicyCancelTiers = [];
  const TERMS_VERSION = "tsts_terms_v1";
  const defaultGuestOptions = guestInput
    ? Array.from(guestInput.options).map(function (o) { return { value: o.value, text: o.textContent }; })
    : [];
  let bookingMode = "shared";
  let privateBookingEnabled = false;
  // Owner 2026-06-03: TRUE only on a SHARED listing whose host enabled private
  // requests (and instant private is NOT available) — makes the toggle's Private
  // side a 24h authorization-HOLD REQUEST instead of an instant book.
  let privateRequestMode = false;
  let privateCapacity = 0;
  let privatePrice = null;
  let privateIncludedGuests = 0;
  let privateExtraGuestPrice = 0;
  let sharedUnitPrice = 0;
  let sharedUnitCurrency = "AUD"; // set from the loaded experience; used by the sticky bar's card-style price.
  let lastSharedGuestCount = (guestInput && guestInput.value) ? String(guestInput.value) : "1";
  let lastPrivateGuestCount = "1";
  let bookingDateRules = {
    minDate: "",
    maxDate: "",
    allowedDays: new Set(),
    blockedDates: new Set()
  };
  let baseTimeSlots = [];
  let bookableDates = [];
  let bookableDateSet = new Set();
  let bookingDateSelect = null;
  // Owner 2026-05-30 (R3 Date pilot): Flatpickr instance backing the visible input.
  // Created once by ensureBookingDateSelect(); updated by renderBookableDateOptions()
  // and kept in sync by writeSelectedBookingDate() when chips drive the date.
  let bookingDatePicker = null;

  // Per-user-per-occurrence seat tracking
  var _userExistingSeats = 0;
  var _occurrenceMaxGuests = 0;
  var _occurrenceReserved = 0;
  var _perUserCap = 10;
  var _mySeatsLoaded = false;

  async function _fetchMySeats(date, slot) {
    _userExistingSeats = 0;
    _occurrenceMaxGuests = 0;
    _occurrenceReserved = 0;
    _mySeatsLoaded = false;
    if (!date || !slot || !experienceId) return;
    try {
      var session = window.tstsGetSession ? await window.tstsGetSession() : null;
      if (!session || !session.token) return;
      var msRes = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/my-seats?date=" + encodeURIComponent(date) + "&slot=" + encodeURIComponent(slot));
      if (msRes.ok) {
        var msData = await msRes.json().catch(function () { return null; });
        if (msData && msData.ok && msData.data) {
          _userExistingSeats = Math.max(0, Number(msData.data.existingSeats) || 0);
          _occurrenceMaxGuests = Math.max(0, Number(msData.data.maxGuests) || 0);
          _occurrenceReserved = Math.max(0, Number(msData.data.reservedGuests) || 0);
          _perUserCap = Math.max(1, Number(msData.data.perUserCap) || 10);
          _mySeatsLoaded = true;
        }
      }
    } catch (_) {}
    // Re-cap guest dropdown with new seat data
    if (bookingMode === "shared") restoreSharedGuestOptions();
    // R4 (2026-05-30): refresh the inline helper after seat data lands so
    // "N seats left · you have M booked" reflects the live numbers.
    updateGuestsInlineHelper();
    // Owner 2026-06-03: after seat data lands, refresh the private-request gate. It
    // re-probes occupancy via cookie auth then enables or blocks the Request CTA
    // (request mode needs a date with zero seats booked).
    try { prRefreshOccupancyAndRender(); } catch (_prErr) { void _prErr; }
  }

  // ── PRIVATE BOOKING REQUEST (Owner 2026-06-03) — logic ───────────────────
  // One-time setup once the listing is known: host name into the hold explainer,
  // private-capacity guest options, the submit handler. Safe to call repeatedly.
  function setupPrivateRequestCard() {
    // Name the host in the hold explainer (falls back to "the host").
    if (prHoldExplainerEl) {
      var hostName = String((exp && exp.hostName) || "").trim();
      var hostRef = hostName ? hostName : "the host";
      // Owner 2026-06-04: match the success-page hold copy verbatim (one consistent
      // voice across pre-submit + confirmation), keeping the host-name interpolation.
      // XSS-safe DOM (textContent + a <span> node, never innerHTML); "not a charge" is
      // bolded exactly like success.html:61.
      prHoldExplainerEl.textContent = "";
      prHoldExplainerEl.appendChild(document.createTextNode("A hold is placed on your card, "));
      var _hcEmph = document.createElement("span");
      _hcEmph.className = "font-semibold text-tsts-ink";
      _hcEmph.textContent = "not a charge";
      prHoldExplainerEl.appendChild(_hcEmph);
      prHoldExplainerEl.appendChild(document.createTextNode(". " + hostRef + " has 24 hours to accept, and we'll email you the moment they do. You're only charged if they say yes."));
    }
    // Re-check occurrence occupancy whenever the date/slot changes — request mode
    // needs a date with ZERO seats booked (backend GUARD A). Wired once on the
    // booking form; the existing booking-widget date/slot handlers are NOT modified.
    if (bookingForm && !bookingForm.dataset.prOccWired) {
      bookingForm.dataset.prOccWired = "1";
      var _prOnSel = function () { prRefreshOccupancyAndRender(); };
      if (dateInput) dateInput.addEventListener("change", _prOnSel);
      if (bookingDateSelect) bookingDateSelect.addEventListener("change", _prOnSel);
      if (timeSlotInput) timeSlotInput.addEventListener("change", _prOnSel);
    }
    prRefreshOccupancyAndRender();
  }

  // Owner 2026-06-03 FIX (found by driving the real flow): the reveal must NOT
  // depend on the booking widget's _fetchMySeats — that helper bails at its
  // `if (!session.token) return` guard, but the app's session is COOKIE-based
  // (no `.token` field is exposed to JS), so _mySeatsLoaded was NEVER set and the
  // form NEVER appeared for any real guest. This loader fetches occurrence
  // occupancy for the private-request gate via cookie-authed authFetch (`af`),
  // independent of _fetchMySeats (which is left untouched), then re-renders.
  var _prSeatsLoaded = false;
  var _prReserved = 0;
  async function prRefreshOccupancyAndRender() {
    try {
      if (!privateRequestMode || viewerIsHostForExperience) { renderPrivateRequestGate(); return; }
      var d = readSelectedBookingDate();
      var s = String((timeSlotInput && timeSlotInput.value) || "").trim();
      if (!d || !s || !experienceId) { _prSeatsLoaded = false; _prReserved = 0; renderPrivateRequestGate(); return; }
      var r = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/my-seats?date=" + encodeURIComponent(d) + "&slot=" + encodeURIComponent(s));
      if (r && r.ok) {
        var j = await r.json().catch(function () { return null; });
        if (j && j.ok && j.data) { _prReserved = Math.max(0, Number(j.data.reservedGuests) || 0); _prSeatsLoaded = true; }
      }
    } catch (_prOccErr) { void _prOccErr; }
    renderPrivateRequestGate();
  }

  // Owner 2026-06-03: the empty-occurrence GATE for request mode. When the guest is on
  // the Private side of a request listing AND the chosen date already has seats booked,
  // a private request can't be made (backend GUARD A) — disable the CTA + explain why.
  // No-op outside request mode (shared/instant flows manage submitBtn themselves).
  function renderPrivateRequestGate() {
    var onRequestSide = (bookingMode === "private") && privateRequestMode;
    if (!onRequestSide) {
      if (prOccupancyMsg) { prOccupancyMsg.classList.add("hidden"); prOccupancyMsg.textContent = ""; }
      return;
    }
    var occupied = (_prSeatsLoaded && Number(_prReserved) > 0);
    if (occupied) {
      if (prOccupancyMsg) {
        prOccupancyMsg.textContent = "This date already has guests booked. A private request needs a date no one has booked yet. Pick another date, or book a shared seat.";
        prOccupancyMsg.classList.remove("hidden");
      }
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (prOccupancyMsg) { prOccupancyMsg.classList.add("hidden"); prOccupancyMsg.textContent = ""; }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // Owner 2026-06-03: POST the private booking request → Stripe authorization-hold
  // Checkout. Called by the booking-form handler when on the Private side of a request
  // listing. Reads the note (#pr-note) + guests (#guest-count) + selected date/slot.
  async function postPrivateRequest() {
    var dateVal = readSelectedBookingDate();
    var timeVal = String((timeSlotInput && timeSlotInput.value) || "").trim();
    if (!dateVal || !timeVal) {
      window.tstsNotify("Please pick a date and time first.", "warning");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    var guests = Math.max(1, Number((guestInput && guestInput.value) || 1));
    var note = String((prNoteInput && prNoteInput.value) || "").trim().slice(0, 1500);
    try {
      // Coupon (owner 2026-06-04): send the raw code in the box exactly like /book — the
      // backend re-validates and discounts the authorization hold. Empty string = no coupon.
      var prPromoCode = promoCodeInput ? String(promoCodeInput.value || "").trim().toUpperCase() : "";
      var res = await af("/api/private-booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId: experienceId, preferredDate: dateVal, preferredTime: timeVal, guests: guests, note: note, promoCode: prPromoCode })
      });
      if (res.status === 401) {
        try { if (window.clearAuth) window.clearAuth(); } catch (_clearErr) { void _clearErr; }
        redirectToLogin();
        return;
      }
      var raw = await res.json().catch(function () { return null; });
      var data = (raw && raw.data) ? raw.data : (raw || {});
      if (!res.ok) {
        var emsg = (data && data.message) ? String(data.message) : ((raw && raw.message) ? String(raw.message) : "We couldn't send your request.");
        var erid = String((raw && raw.rid) || (data && data.rid) || "").trim();
        showBookingErrorBlock(emsg, erid);
        window.tstsNotify(emsg, "error");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      var url = String((data && data.url) || "").trim();
      if (url) {
        var safe = url;
        try {
          var u = new URL(url, window.location.origin);
          var sameOrigin = u.origin === window.location.origin;
          var isStripe = u.hostname === "checkout.stripe.com";
          var isSim = u.pathname.indexOf("/__sim/stripe/") === 0 || (u.hostname === "localhost" && (u.port === "4000" || u.port === "3000"));
          if (!sameOrigin && !isStripe && !isSim) safe = "success.html?holdPlaced=1";
        } catch (_urlErr) { void _urlErr; if (/^https?:\/\//i.test(url) || /^\/\//.test(url)) safe = "success.html?holdPlaced=1"; }
        window.location.href = safe;
        return;
      }
      var reqId = String((data && data.request && data.request.id) || "");
      window.location.href = "success.html?holdPlaced=1" + (reqId ? ("&requestId=" + encodeURIComponent(reqId)) : "");
    } catch (_netErr) {
      void _netErr;
      showBookingErrorBlock("Couldn't connect. Please check your network and try again.", "");
      window.tstsNotify("Request failed", "error");
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function normalizeExperience(payload) {
    if (!payload) return null;
    if (payload.experience) return payload.experience;
    if (payload.data && payload.data.experience) return payload.data.experience;
    return payload;
  }

  function isIsoDateString(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
  }

  function todayIsoDate() {
    // sir 2026-08-13, caught on the walk: this was the DEVICE's day, not Melbourne's. A guest
    // whose phone sat in another timezone saw a chip called "Today" pointing at a Melbourne day
    // already over (clicking it dead-ended in "No available slots"), while "Tomorrow" was actually
    // TODAY in Melbourne — they believed they had a day in hand when the sitting was that night.
    // The experiences happen in Melbourne, so the calendar reads Melbourne's clock, full stop —
    // the same Intl pattern the platform already uses for every rendered date (common.js).
    // en-CA prints YYYY-MM-DD directly, which is exactly the ISO shape this pipeline carries.
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (_tzErr) {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
  }

  function addDaysIsoUtc(isoDate, days) {
    if (!isIsoDateString(isoDate)) return "";
    const dt = new Date(isoDate + "T00:00:00Z");
    if (Number.isNaN(dt.getTime())) return "";
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return dt.toISOString().slice(0, 10);
  }

  function formatBookingDateLabel(isoDate) {
    const d = String(isoDate || "").trim();
    if (!isIsoDateString(d)) return d;
    try {
      if (window.tstsFormatDateShort) {
        const pretty = String(window.tstsFormatDateShort(d) || "").trim();
        if (pretty) return pretty;
      }
    } catch (_) {}
    return d;
  }

  function dayLabelFromIso(isoDate) {
    if (!isIsoDateString(isoDate)) return "";
    const dt = new Date(isoDate + "T00:00:00Z");
    if (Number.isNaN(dt.getTime())) return "";
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return labels[dt.getUTCDay()] || "";
  }

  function ensureBookingDateSelect() {
    if (!dateInput) return null;
    if (bookingDateSelect) return bookingDateSelect;

    // Owner 2026-05-30 (R3 Date pilot): replace the old 60-option dropdown with a brand-
    // styled Flatpickr month-grid calendar via the shared window.tstsDatePicker wrapper
    // (common.js). The source input below carries the ISO value the booking pipeline
    // reads; Flatpickr's altInput shows the human-readable label to the guest. enable[]
    // starts empty and is populated by renderBookableDateOptions() once bookableDates
    // resolves.
    const input = document.createElement("input");
    input.type = "text";
    input.id = "booking-date-select";
    input.className = dateInput.className;
    input.setAttribute("aria-label", "Select available booking date");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("readonly", "readonly");

    dateInput.insertAdjacentElement("afterend", input);
    dateInput.classList.add("hidden");
    dateInput.disabled = true;
    dateInput.required = false;

    const dateLabel = document.querySelector("label[for=\"booking-date\"]");
    if (dateLabel) dateLabel.setAttribute("for", "booking-date-select");

    bookingDateSelect = input;

    if (window.tstsDatePicker) {
      bookingDatePicker = window.tstsDatePicker(input, {
        altInputClass: input.className + " cursor-pointer",
        // sir 2026-08-13: the wrapper's default minDate "today" is the DEVICE's today. A device
        // ahead of Melbourne (e.g. NZ) would grey out Melbourne's own today even when it is
        // bookable. Pass Melbourne's day explicitly so the calendar floor matches the city
        // the experiences actually happen in.
        minDate: todayIsoDate(),
        enable: [],
        onChange: function (selectedDates, dateStr) {
          // Flatpickr already wrote dateStr into the source input; mirror it through the
          // canonical write path + fire change so the slot/booking pipeline picks it up
          // (same hook the left-side date chips and the old select used).
          writeSelectedBookingDate(dateStr);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }

    return bookingDateSelect;
  }

  function readSelectedBookingDate() {
    if (bookingDateSelect) return String(bookingDateSelect.value || "").trim();
    return String((dateInput && dateInput.value) || "").trim();
  }

  function writeSelectedBookingDate(nextDate) {
    const v = String(nextDate || "").trim();
    if (dateInput) dateInput.value = v;
    if (bookingDateSelect) bookingDateSelect.value = v;
    // Owner 2026-05-30: keep the Flatpickr's visible alt input in sync when the date is
    // written programmatically (e.g. by the left-side date chips). Suppress the picker's
    // own change event — the chip/caller already emits one.
    if (bookingDatePicker && v) {
      try { bookingDatePicker.setDate(v, false); } catch (_e) { void _e; }
    }
    // R9 (2026-05-30): date just got written → refresh "!" markers so the date
    // marker hides when a value is actually present.
    try { if (typeof refreshPendingFieldsUI === "function") refreshPendingFieldsUI(); } catch (_e2) { void _e2; }
  }

  function resolveBookingDateRulesForExperience(e) {
    const expObj = e || {};
    const today = todayIsoDate();
    const start = isIsoDateString(expObj.startDate) ? String(expObj.startDate) : "";
    const end = isIsoDateString(expObj.endDate) ? String(expObj.endDate) : "";
    const minDate = start && start > today ? start : today;
    const maxDate = end || "";
    const allowedDays = new Set(
      (Array.isArray(expObj.availableDays) ? expObj.availableDays : [])
        .map((d) => String(d || "").trim())
        .filter(Boolean)
    );
    const blockedDates = new Set(
      (Array.isArray(expObj.blockedDates) ? expObj.blockedDates : [])
        .map((d) => String(d || "").trim())
        .filter((d) => isIsoDateString(d))
    );
    return { minDate, maxDate, allowedDays, blockedDates };
  }

  function isSelectableBookingDate(isoDate) {
    const d = String(isoDate || "").trim();
    if (!isIsoDateString(d)) return false;
    if (bookingDateRules.minDate && d < bookingDateRules.minDate) return false;
    if (bookingDateRules.maxDate && d > bookingDateRules.maxDate) return false;
    if (bookingDateRules.blockedDates && bookingDateRules.blockedDates.has(d)) return false;
    if (bookingDateRules.allowedDays && bookingDateRules.allowedDays.size > 0) {
      const label = dayLabelFromIso(d);
      if (!bookingDateRules.allowedDays.has(label)) return false;
    }
    return true;
  }

  function findFirstSelectableBookingDate() {
    const hasMaxDate = !!bookingDateRules.maxDate;
    if (bookingDateRules.minDate && hasMaxDate && bookingDateRules.minDate > bookingDateRules.maxDate) return "";

    let probe = bookingDateRules.minDate || todayIsoDate();
    let guard = 0;
    while (guard < 400) {
      if (hasMaxDate && probe > bookingDateRules.maxDate) break;
      if (isSelectableBookingDate(probe)) return probe;
      probe = addDaysIsoUtc(probe, 1);
      if (!probe) break;
      guard += 1;
    }
    return "";
  }

  function slotStartFromDateAndSlot(dateStr, slotStr) {
    const d = String(dateStr || "").trim();
    if (!isIsoDateString(d)) return null;
    const slot = String(slotStr || "").trim();
    const startToken = slot.split("-")[0] || "";
    const hm = startToken.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!hm) return null;
    const year = Number(d.slice(0, 4));
    const month = Number(d.slice(5, 7));
    const day = Number(d.slice(8, 10));
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    const local = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(local.getTime()) ? null : local;
  }

  function availableTimeSlotsForDate(dateStr) {
    if (!isSelectableBookingDate(dateStr)) return [];
    return Array.isArray(baseTimeSlots) ? baseTimeSlots : [];
  }

  function resolveBookableDatesWithSlots() {
    const out = [];
    const hasMaxDate = !!bookingDateRules.maxDate;
    if (bookingDateRules.minDate && hasMaxDate && bookingDateRules.minDate > bookingDateRules.maxDate) return out;

    // sir 2026-08-09, second half of "Fix it — drop the invented slot": this loop asked the LISTING-WIDE
    // slot list whether a date runs, which only ever worked because that list was never allowed to be
    // empty. A listing that keeps its sittings per-date (dateOverrides — a carved date-series) has no
    // flat list, so every one of its dates failed this test and the page said "No upcoming event dates".
    // Its dates are its selectable range; its times come from /slot-times per date. A listing that DOES
    // carry a flat list is tested exactly as before — this changes nothing for it.
    const hasFlatSlots = Array.isArray(baseTimeSlots) && baseTimeSlots.length > 0;
    let probe = bookingDateRules.minDate || todayIsoDate();
    let guard = 0;
    while (guard < 400) {
      if (hasMaxDate && probe > bookingDateRules.maxDate) break;
      if (isSelectableBookingDate(probe) && (!hasFlatSlots || availableTimeSlotsForDate(probe).length > 0)) out.push(probe);
      probe = addDaysIsoUtc(probe, 1);
      if (!probe) break;
      guard += 1;
    }
    return out;
  }

  function renderBookableDateOptions(selectedDate) {
    const input = ensureBookingDateSelect();
    if (!input) return "";

    const wanted = String(selectedDate || "").trim();

    // Owner 2026-05-30 (R3 Date pilot): the field is no longer a <select>; it's a
    // Flatpickr-backed input. So we push the allowed dates into Flatpickr's `enable`
    // option instead of populating <option> tags. If no dates resolved, disable the
    // visible alt input and clear the value.
    if (!Array.isArray(bookableDates) || bookableDates.length === 0) {
      if (bookingDatePicker) {
        try { bookingDatePicker.set("enable", []); } catch (_e) { void _e; }
        try { bookingDatePicker.clear(); } catch (_e2) { void _e2; }
      }
      if (bookingDatePicker && bookingDatePicker.altInput) bookingDatePicker.altInput.disabled = true;
      input.disabled = true;
      writeSelectedBookingDate("");
      return "";
    }

    if (bookingDatePicker) {
      try { bookingDatePicker.set("enable", bookableDates); } catch (_e3) { void _e3; }
    }

    const resolved = bookableDateSet.has(wanted) ? wanted : String(bookableDates[0]);
    input.disabled = false;
    if (bookingDatePicker && bookingDatePicker.altInput) bookingDatePicker.altInput.disabled = false;
    writeSelectedBookingDate(resolved);
    return resolved;
  }

  function renderAvailableTimeSlotsForDate(dateStr) {
    if (!timeSlotInput) return;
    const prior = String(timeSlotInput.value || "").trim();
    const slots = availableTimeSlotsForDate(dateStr);
    timeSlotInput.textContent = "";
    // R5 (2026-05-30): a sibling static-label element is shown in place of the
    // dropdown when there is exactly one slot for the chosen date — a 1-option
    // select is a wasted chevron. The static element shares the input chrome
    // so the row visually stays a "field" not a paragraph.
    const staticEl = document.getElementById("time-slot-static");
    if (slots.length === 0) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No available slots for this date";
      timeSlotInput.appendChild(empty);
      timeSlotInput.disabled = true;
      timeSlotInput.classList.remove("hidden");
      if (staticEl) staticEl.classList.add("hidden");
      // R5 (2026-05-30): "Available time windows shown..." filler dropped per
      // sir's order. #seats-info stays empty here; the empty-state is already
      // communicated by the disabled select + "No available slots" option.
      if (seatsInfoEl) seatsInfoEl.textContent = "";
      return;
    }
    slots.forEach(function (slot) {
      const opt = document.createElement("option");
      opt.value = String(slot);
      // R5 (2026-05-30): display slots in AU 12h "10:00 AM – 1:00 PM"; the
      // option's .value keeps the raw 24h "HH:MM-HH:MM" string so server-bound
      // reads anywhere in the file continue to work without change.
      opt.textContent = formatSlotForDisplay(slot);
      timeSlotInput.appendChild(opt);
    });
    const hasPrior = slots.some(function (slot) { return String(slot) === prior; });
    timeSlotInput.value = hasPrior ? prior : String(slots[0]);
    timeSlotInput.disabled = false;
    if (slots.length === 1 && staticEl) {
      // Hide the chevron'd select, show a styled static label with the same
      // background / border. The select stays in the DOM (kept value, kept
      // hidden) so existing reads of timeSlotInput.value still resolve.
      staticEl.textContent = formatSlotForDisplay(slots[0]);
      staticEl.classList.remove("hidden");
      timeSlotInput.classList.add("hidden");
    } else if (staticEl) {
      staticEl.classList.add("hidden");
      timeSlotInput.classList.remove("hidden");
    }
    // R5 (2026-05-30): "Available time windows shown..." filler dropped per sir.
    if (seatsInfoEl) seatsInfoEl.textContent = "";
    // R9 (2026-05-30): slot just got hydrated → refresh "!" markers so they
    // reflect the actual state instead of the empty-on-DOM-ready state.
    try { if (typeof refreshPendingFieldsUI === "function") refreshPendingFieldsUI(); } catch (_e) { void _e; }
  }

  function configureBookingDateInput(e) {
    if (!dateInput) return;
    bookingDateRules = resolveBookingDateRulesForExperience(e);
    if (bookingDateRules.minDate) dateInput.min = bookingDateRules.minDate;
    else dateInput.removeAttribute("min");
    if (bookingDateRules.maxDate) dateInput.max = bookingDateRules.maxDate;
    else dateInput.removeAttribute("max");

    bookableDates = resolveBookableDatesWithSlots();
    bookableDateSet = new Set(bookableDates);

    let selectedDate = readSelectedBookingDate();
    if (!bookableDateSet.has(selectedDate)) {
      selectedDate = (bookableDates.length > 0) ? String(bookableDates[0]) : "";
    }
    selectedDate = renderBookableDateOptions(selectedDate);

    if (!selectedDate) {
      if (bookingDateSelect) bookingDateSelect.disabled = true;
      if (timeSlotInput) {
        timeSlotInput.textContent = "";
        timeSlotInput.disabled = true;
      }
      if (submitBtn) submitBtn.disabled = true;
      if (seatsInfoEl) seatsInfoEl.textContent = "No upcoming event dates are currently available for booking.";
      // R5 (2026-05-30): surface the no-dates empty-state by un-hiding the
      // #booking-rules wrapper — without this the message was written into a
      // hidden parent (latent bug, pre-R5).
      if (bookingRulesEl) bookingRulesEl.classList.remove("hidden");
      return;
    }

    if (bookingDateSelect) bookingDateSelect.disabled = false;
    // R5 (2026-05-30): "Only dates with active availability are shown." filler
    // dropped per sir's order. The dropdown itself communicates this.
    if (seatsInfoEl) seatsInfoEl.textContent = "";
    renderAvailableTimeSlotsForDate(selectedDate);
  }

  async function loadExperience() {
    if (!experienceId) {
      showNotFound("This experience link is invalid. Please open a valid experience from Explore.");
      return;
    }

    const res = await af(`/api/experiences/${experienceId}`, { method: "GET" });

    if (res.status === 401) {
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      return redirectToLogin();
    }
    if (res.status === 403) {
      showNotFound("This experience is currently unavailable.");
      return;
    }
    if (!res.ok) {
      showNotFound("This experience is unavailable or no longer exists.");
      return;
    }

    const raw = await res.json();
    const unwrappedExp = (raw && raw.data !== undefined) ? raw.data : raw;
    exp = normalizeExperience(unwrappedExp);
    if (!exp) {
      showNotFound("This experience could not be loaded.");
      return;
    }

    // Owner 2026-07-23 (sir): capture the "Coming soon" state BEFORE any booking UI is
    // hydrated, so the disabled CTA + notice apply on first render. When an approved
    // shortfall listing has no host-confirmed + Stage-A-funded date, the API returns
    // bookingOpen:false — the listing stays visible but shows "Not yet open for booking"
    // instead of a Book button that would fail at checkout.
    __bookingComingSoon = (exp.bookingOpen === false);
    __bookingComingSoonReason = String(exp.bookingClosedReason || "Not yet open for booking");
    if (__bookingComingSoon && bookingForm && !document.getElementById("booking-coming-soon-notice")) {
      var __csNotice = window.tstsEl("div", {
        id: "booking-coming-soon-notice",
        className: "flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-4"
      }, [
        window.tstsEl("i", { className: "fas fa-clock text-gray-500 mt-1" }),
        window.tstsEl("div", {}, [
          window.tstsEl("div", { className: "text-sm font-semibold text-tsts-ink", textContent: "Not yet open for booking" }),
          window.tstsEl("div", { className: "text-sm text-gray-600 mt-1", textContent: "The host is still finalising this experience. You'll be able to book once it's ready. Check back soon." })
        ])
      ]);
      bookingForm.insertBefore(__csNotice, bookingForm.firstChild);
    }
    if (__bookingComingSoon) hideComingSoonPurchaseBlocks();

    // sir's ruling 2026-08-15 ("remove this dead code"): the 2026-05-03 layout-review
    // test scaffold lived here, forcing 4 fixed seed ids into every render branch.
    // Those ids exist nowhere anymore, so the block could never fire again. Removed
    // permanently under sir's word, with sir's standing rule recorded: dead code is
    // removed IN THE SAME CHANGE that replaces it, never left behind.

    if (reportExperienceBtn) {
      const reportId = String((exp && (exp._id || exp.id)) || experienceId || "").trim();
      reportExperienceBtn.href = "report.html?targetType=experience&targetId=" + encodeURIComponent(reportId);
    }

    setText("exp-title", publicTitle(exp.title || ""));
    // W7 STRAY-46: the route that served this listing records this step itself (grep __trackEvent
    // "experience:view"), so the page's own copy counted every view twice. Removed, as on the app.

    // Owner 2026-06-08: REAL series average rating under the title (stars + number + count link).
    // Wired to exp.averageRating / exp.reviewCount; stays hidden when there are 0 reviews (no fake).
    (function () {
      var ratingEl = document.getElementById("exp-rating");
      if (!ratingEl) return;
      var avg = Number(exp.averageRating);
      var cnt = Number(exp.reviewCount);
      if (!isFinite(avg) || avg <= 0 || !isFinite(cnt) || cnt <= 0) {
        ratingEl.className = "hidden";
        ratingEl.textContent = "";
        return;
      }
      var pct = Math.max(0, Math.min(100, (avg / 5) * 100));
      function fiveStars(colorCls) {
        var row = document.createElement("span");
        row.className = "inline-flex " + colorCls;
        for (var i = 0; i < 5; i++) {
          var ic = document.createElement("i");
          ic.className = "fas fa-star text-base";
          row.appendChild(ic);
        }
        return row;
      }
      ratingEl.textContent = "";
      var bar = document.createElement("span");
      bar.className = "relative inline-flex leading-none";
      bar.setAttribute("aria-hidden", "true");
      var base = fiveStars("text-gray-300");
      var fill = fiveStars("text-amber-400");
      fill.className += " absolute top-0 left-0 overflow-hidden whitespace-nowrap";
      fill.style.width = pct + "%";
      bar.appendChild(base);
      bar.appendChild(fill);
      var num = document.createElement("span");
      num.className = "text-sm font-bold text-tsts-ink";
      num.textContent = (Math.round(avg * 100) / 100).toString();
      var dot = document.createElement("span");
      dot.className = "text-slate-400 text-sm";
      dot.textContent = "·";
      var cntLink = document.createElement("a");
      cntLink.href = "#reviews-section";
      cntLink.className = "text-sm text-slate-600 underline hover:text-tsts-ink";
      cntLink.textContent = cnt + (cnt === 1 ? " review" : " reviews");
      cntLink.setAttribute("aria-label", "Average rating " + num.textContent + " out of 5 from " + cnt + (cnt === 1 ? " review" : " reviews"));
      // Owner 2026-08-02 (sir): the stars + score are clickable like the count link —
      // one behaviour for the whole rating row, landing on this page's review section.
      var scoreLink = document.createElement("a");
      scoreLink.href = "#reviews-section";
      scoreLink.className = "inline-flex items-center gap-2 hover:opacity-80 transition";
      scoreLink.setAttribute("aria-label", "Jump to the reviews for this experience");
      scoreLink.appendChild(bar);
      scoreLink.appendChild(num);
      ratingEl.appendChild(scoreLink);
      ratingEl.appendChild(dot);
      ratingEl.appendChild(cntLink);
      ratingEl.className = "flex items-center gap-2";
    })();
    // Owner-spec 2026-05-03 (D-6): location format = `Suburb · City · STATE · Postcode`,
    // suburb-first, dot-separated, matches explore-card formatter. Falls back gracefully
    // when state/postcode/etc. are missing on legacy listings.
    var __suburb = String(exp.suburb || "").trim();
    var __city = String(exp.city || "").trim();
    var __state = String(exp.state || "").trim().toUpperCase();
    var __postcode = String(exp.postcode || "").trim();
    var __locParts = [];
    if (__suburb) __locParts.push(__suburb);
    if (__city && __city !== __suburb) __locParts.push(__city);
    if (__state) __locParts.push(__state);
    if (__postcode) __locParts.push(__postcode);
    var cityText = __locParts.join(" · ");
    // Maps query keeps comma-separated full address, better geocoding hits.
    var __mapsQuery = [__suburb, __city, __state, __postcode, "Australia"].filter(function (v) { return !!v; }).join(", ");
    var cityEl = document.getElementById("exp-city");
    if (cityEl) {
      cityEl.textContent = cityText;
      if (cityText) {
        cityEl.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(__mapsQuery);
      } else {
        cityEl.removeAttribute("href");
      }
    }
    // Owner-spec 2026-05-04 (D-13): truncate description at 500 chars with
    // an inline 'Read more' that expands the full text in place. Descriptions
    // 500 chars or fewer show full text without any truncation control.
    (function renderDescriptionWithReadMore() {
      var fullDesc = String(publicDescription(exp) || "");
      var descEl = document.getElementById("exp-description");
      if (!descEl) return;
      // Reset any prior content (in case of re-render).
      while (descEl.firstChild) descEl.removeChild(descEl.firstChild);
      var TRUNCATE_AT = 500;
      if (fullDesc.length <= TRUNCATE_AT) {
        descEl.textContent = fullDesc;
        return;
      }
      // Find a soft break (space) at or before TRUNCATE_AT to avoid mid-word cut.
      var cut = fullDesc.lastIndexOf(" ", TRUNCATE_AT);
      if (cut < TRUNCATE_AT - 80) cut = TRUNCATE_AT;
      var teaser = fullDesc.slice(0, cut).trim();
      var rest = fullDesc.slice(cut).trim();
      var teaserSpan = document.createElement("span");
      teaserSpan.textContent = teaser + " ";
      teaserSpan.id = "exp-desc-teaser";
      var more = document.createElement("a");
      more.href = "#";
      more.id = "exp-desc-readmore";
      more.className = "text-orange-600 font-semibold hover:underline whitespace-nowrap";
      more.textContent = "Read more";
      var restSpan = document.createElement("span");
      restSpan.id = "exp-desc-rest";
      restSpan.className = "hidden";
      restSpan.textContent = " " + rest;
      more.addEventListener("click", function (ev) {
        ev.preventDefault();
        restSpan.classList.remove("hidden");
        more.classList.add("hidden");
      });
      descEl.appendChild(teaserSpan);
      descEl.appendChild(more);
      descEl.appendChild(restSpan);
    })();
    const priceNum = Number(exp.price);
    sharedUnitPrice = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0;
    sharedUnitCurrency = String((exp && exp.currency) || "AUD");
    updateDisplayedPrice();

    // ── PRIVATE BOOKING REQUEST eligibility (Owner 2026-06-03) ──────────────
    // Backend GUARD A: a SHARED (or "both") listing with privateRequestEnabled=true
    // AND a configured private price + capacity may receive requests. We mirror that
    // here so the card only appears where the request will actually be accepted.
    var __prMode = String((exp && exp.bookingMode) || "shared").trim().toLowerCase();
    var __prModeOk = (__prMode === "shared" || __prMode === "both");
    var __prCapOk = Number(exp && exp.privateCapacity) > 0;
    var __prPriceOk = Number(exp && exp.privatePrice) > 0;
    privateRequestEnabled = (exp && exp.privateRequestEnabled === true) && __prModeOk && __prCapOk && __prPriceOk;
    // Seed the hold-explainer + guest options once the listing is known.
    setupPrivateRequestCard();

    // Owner 2026-05-30 (P4 multi-image): support image carousel. When the
    // experience has more than one photo, paint dot indicators, show prev/next
    // arrows, wire keyboard + swipe + click handlers, and swap #main-image on
    // navigation. When there's only one photo, hide all carousel chrome — the
    // page renders identically to the legacy single-image hero.
    var __heroImages = (Array.isArray(exp.images) && exp.images.length > 0)
      ? exp.images.slice(0)
      : (exp.imageUrl ? [exp.imageUrl] : []);
    // De-dup: some legacy listings stored imageUrl AND images=[imageUrl] so
    // the array contains a duplicate of the cover.
    var __seenHeroUrls = {};
    __heroImages = __heroImages.filter(function (u) {
      var k = String(u || "").trim();
      if (!k) return false;
      if (__seenHeroUrls[k]) return false;
      __seenHeroUrls[k] = true;
      return true;
    });
    initHeroCarousel(__heroImages);

    // Owner 2026-06-01 (B): override the static OG / Twitter Card meta tags
    // with the loaded listing's data so JS-running crawlers (Twitter, Slack,
    // Discord, WhatsApp Cloud) get a real rich preview when the link is
    // shared. FB doesn't run JS so it falls back to the static defaults in
    // <head>. Trade-off accepted by sir 2026-06-01.
    try {
      __updateSharePreviewMeta(exp, __heroImages);
    } catch (_metaErr) { void _metaErr; /* meta update is best-effort, never block render */ }

    if (exp.menu) {
      setText("exp-menu", exp.menu);
      show("menu-section");
    }
    if (exp.requirements) {
      setText("exp-requirements", exp.requirements);
      show("requirements-section");
    }
    var durationMinutes = Number(exp.eventDurationMinutes);
    if (durationMinutes > 0) {
      var hrs = Math.floor(durationMinutes / 60);
      var mins = durationMinutes % 60;
      var durationText = hrs > 0
        ? (hrs + (hrs === 1 ? " hour" : " hours") + (mins > 0 ? " " + mins + " min" : ""))
        : (mins + " minutes");
      setText("exp-duration", durationText);
      show("duration-section");
    } else if (exp.duration) {
      setText("exp-duration", exp.duration);
      show("duration-section");
    }

    // Owner-flagged 2026-05-02: render When this happens, days, time slots, and
    // the next 6 upcoming bookable dates so guests can pick freely.
    try { renderFrequencySection(exp); } catch (_freqErr) { /* render guarded by hidden section */ }

    let hostName = normalizeHostName(exp);
    let hostPic = normalizeHostPic(exp);

    // Backfill host display for legacy experiences that were saved without hostName/hostPic.
    var hostBio = String(exp.hostBio || "").trim();
    if (/^[a-f0-9]{24}$/i.test(String(exp.hostId || "").trim())) {
      try {
        const profileRes = await af("/api/users/" + encodeURIComponent(String(exp.hostId || "")) + "/profile", { method: "GET" });
        if (profileRes && profileRes.ok) {
          const profileRaw = await profileRes.json().catch(() => ({}));
          const profile = (profileRaw && profileRaw.data) ? profileRaw.data : profileRaw;
          if (!hostName) {
            const profileName = String((profile && (profile.name || profile.displayName || profile.fullName)) || "").trim();
            if (profileName && !looksLikeEmail(profileName)) hostName = profileName;
          }
          if (!hostPic) hostPic = String((profile && profile.profilePic) || "").trim();
          hostBio = String((profile && profile.bio) || "").trim();
        }
      } catch (_) {
        // Keep safe fallbacks below.
      }
    }

    const verifiedState = normalizedVerifiedStatus(exp.verifiedStatus);
    const hostFallbackName = (verifiedState === "verified") ? "Verified Host" : "Host";
    setText("host-name", hostName || hostFallbackName);
    // Owner 2026-05-26: the DETAIL page gets the full "Verified host" blue pill
    // (shield + text), same blue treatment as the Explore card. (The Explore CARD
    // itself uses a shield-only icon because of its tight host-name row; the detail
    // has room for the full tag.)
    if (exp.hostVerified) {
      var hostNameElForPill = document.getElementById("host-name");
      if (hostNameElForPill && !document.getElementById("host-verified-pill")) {
        var hvPill = document.createElement("span");
        hvPill.id = "host-verified-pill";
        hvPill.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 ml-2 align-middle";
        var hvIcon = document.createElement("i");
        hvIcon.className = "fas fa-shield-halved text-blue-700 text-[11px]";
        var hvText = document.createElement("span");
        hvText.textContent = "Verified host";
        hvPill.appendChild(hvIcon);
        hvPill.appendChild(hvText);
        hostNameElForPill.appendChild(hvPill);
      }
    }
    if (hostBio) setText("host-bio", hostBio);
    setImg("host-pic", hostPic || "", "/assets/avatar-default.svg");
    const hostLinkEl = document.getElementById("host-profile-link");
    const hostCtaEl = document.getElementById("host-profile-cta");
    const hostId = normalizeHostId(exp);
    if (hostLinkEl) {
      if (hostId) {
        hostLinkEl.href = "public-profile.html?id=" + encodeURIComponent(hostId);
        hostLinkEl.classList.remove("cursor-default", "pointer-events-none");
        hostLinkEl.removeAttribute("aria-disabled");
        if (hostCtaEl) hostCtaEl.textContent = "View profile";
      } else {
        hostLinkEl.removeAttribute("href");
        hostLinkEl.classList.add("cursor-default");
        if (hostCtaEl) hostCtaEl.textContent = "";
      }
    }

    try {
      const sess = await window.tstsGetSession({ force: false });
      viewerUserId = String((sess && sess.user && (sess.user._id || sess.user.id)) || "").trim();
    } catch (_) {
      viewerUserId = "";
    }
    viewerIsHostForExperience = !!hostId && !!viewerUserId && viewerUserId === hostId;

    // FIX-04: Hide booking form for host, show info box
    var hostSelfViewBox = document.getElementById("host-self-view-box");
    var bookingFormEl = document.getElementById("booking-form");
    if (viewerIsHostForExperience) {
      if (bookingFormEl) bookingFormEl.classList.add("hidden");
      if (hostSelfViewBox) hostSelfViewBox.classList.remove("hidden");
    }

    // ── PREVIEW (sir's order O-146, 2026-09-16) ──
    // sir, verbatim: "anything draft is just put a preview and nroever for booking to se the interest
    // of people". The server decides whether this is a preview and says so in `isPreview`; the page
    // never works it out from the status itself, so the band, the hidden price and the missing booking
    // control can never disagree with the booking door that refuses it.
    var __isPreview = !!(exp && exp.isPreview === true);
    pageIsPreview = __isPreview;
    if (__isPreview) {
      var bandEl = document.getElementById("preview-band");
      var bandBodyEl = document.getElementById("preview-band-body");
      var priceRowEl = document.getElementById("exp-price-row");
      var interestBoxEl = document.getElementById("preview-interest-box");
      var interestBtn = document.getElementById("preview-interest-btn");
      var interestSignIn = document.getElementById("preview-interest-signin");
      var interestBodyEl = document.getElementById("preview-interest-body");

      // No booking control at all, and no price. Both are removed rather than disabled: a disabled
      // Reserve button invites a person to try, and a price with nothing behind it is a promise.
      if (bookingFormEl) bookingFormEl.classList.add("hidden");
      if (priceRowEl) priceRowEl.classList.add("hidden");
      if (hostSelfViewBox && !viewerIsHostForExperience) hostSelfViewBox.classList.add("hidden");

      var __hostWord = String((exp && exp.hostName) || "").trim();
      var __whoseTable = __hostWord ? (__hostWord + " is still putting this table together.") : "The host is still putting this table together.";
      var __datesLine = (exp && exp.datesToCome === true)
        ? " The evenings are still to come."
        : "";
      if (bandBodyEl) {
        bandBodyEl.textContent = __whoseTable + __datesLine + " You can read everything about it here, and there is nothing to book yet.";
      }
      if (bandEl) bandEl.classList.remove("hidden");

      if (viewerIsHostForExperience) {
        // The host looking at their own preview is told what it is, and is not offered a button that
        // would ask them to be interested in their own table.
        if (interestBoxEl) {
          if (interestBodyEl) interestBodyEl.textContent = "This is your preview. Guests can read it and tell you they are interested, and nobody can book it until you publish.";
          if (interestBtn) interestBtn.classList.add("hidden");
          if (interestSignIn) interestSignIn.classList.add("hidden");
          interestBoxEl.classList.remove("hidden");
        }
      } else if (!viewerUserId) {
        // Signed out: invited to sign in, and brought back to this page afterwards.
        if (interestBtn) interestBtn.classList.add("hidden");
        if (interestSignIn) {
          try {
            interestSignIn.href = "login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
          } catch (_hrefErr) {
            interestSignIn.href = "login.html";
          }
          interestSignIn.classList.remove("hidden");
        }
        if (interestBodyEl) interestBodyEl.textContent = "Sign in and we'll email you the moment this one is live. Nothing is booked and nothing is charged.";
        if (interestBoxEl) interestBoxEl.classList.remove("hidden");
      } else {
        if (interestSignIn) interestSignIn.classList.add("hidden");
        if (interestBoxEl) interestBoxEl.classList.remove("hidden");

        var __markAlreadyInterested = function () {
          if (!interestBtn) return;
          interestBtn.disabled = true;
          interestBtn.textContent = "You're on the list";
          if (interestBodyEl) interestBodyEl.textContent = "We have you down for this one. You'll get one email the moment it's live.";
        };

        // A second visit must not invite the same person again.
        try {
          var __seenRes = await window.authFetch("/api/experiences/" + encodeURIComponent(String(exp._id || exp.id || "")) + "/interest");
          var __seen = await __seenRes.json();
          if (__seen && __seen.ok === true && __seen.data && __seen.data.interested === true) __markAlreadyInterested();
        } catch (_seenErr) {
          // Unreadable means unknown, and unknown leaves the button as it is: pressing it a second
          // time is answered truthfully by the server anyway.
        }

        if (interestBtn) {
          interestBtn.addEventListener("click", async function () {
            if (interestBtn.disabled) return;
            interestBtn.disabled = true;
            var __was = interestBtn.textContent;
            interestBtn.textContent = "One moment";
            try {
              var res = await window.authFetch("/api/experiences/" + encodeURIComponent(String(exp._id || exp.id || "")) + "/interest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
              });
              var payload = await res.json();
              if (!res.ok || !payload || payload.ok !== true) {
                var msg = (payload && payload.message) ? String(payload.message) : "We couldn't record that just now. Please try again.";
                if (window.tstsNotify) window.tstsNotify(msg, "error");
                interestBtn.disabled = false;
                interestBtn.textContent = __was;
                return;
              }
              __markAlreadyInterested();
              if (window.tstsNotify) window.tstsNotify(String((payload.data && payload.data.message) || "Thank you. We'll email you the moment this one is live."), "success");
            } catch (_postErr) {
              if (window.tstsNotify) window.tstsNotify("We couldn't record that just now. Please try again.", "error");
              interestBtn.disabled = false;
              interestBtn.textContent = __was;
            }
          });
        }
      }
    }

    if (verifiedBadgeEl) verifiedBadgeEl.classList.toggle("hidden", verifiedState !== "verified");
    if (verifiedPendingBadgeEl) verifiedPendingBadgeEl.classList.toggle("hidden", verifiedState !== "pending");
    if (verifiedFeeNoteEl) verifiedFeeNoteEl.classList.toggle("hidden", verifiedState !== "verified");

    hydrateBookingMode(exp);
    hydrateTimeSlots(exp);
    configureBookingDateInput(exp);

    // === CUTOFF CHECK ===
    function checkCutoff() {
      if (!exp || !bookingRulesEl) return;
      var cutoffEnabled = (exp.bookingCutoffEnabled !== false);
      var cutoffMins = exp.bookingCutoffMinutes || 1440;
      var cutoffHrs = Math.round(cutoffMins / 60);
      var dateVal = readSelectedBookingDate();
      var slotVal = timeSlotInput ? timeSlotInput.value : "";

      if (!dateVal || !slotVal) {
        if (submitBtn) submitBtn.disabled = true;
        if (waitlistCtaEl) waitlistCtaEl.classList.add("hidden");
      }

      if (!cutoffEnabled) {
        bookingRulesEl.classList.add("hidden");
        if (waitlistCtaEl) waitlistCtaEl.classList.add("hidden");
        if (submitBtn) submitBtn.disabled = !(dateVal && slotVal);
        return;
      }

      bookingRulesEl.classList.remove("hidden");
      // R5 (2026-05-30): cutoff info now lives INLINE next to the Time-slot
      // label (#time-slot-inline-helper) instead of as a paragraph below the
      // dropdown — matches the R4 Guests-row pattern. #cutoff-info is kept
      // empty + hidden so existing references (and any DOM tests) don't error.
      var __cutoffInline = document.getElementById("time-slot-inline-helper");
      if (__cutoffInline) __cutoffInline.textContent = "Bookings close " + cutoffHrs + "h before start.";
      if (cutoffInfoEl) cutoffInfoEl.textContent = "";
      if (!dateVal || !slotVal) return;

      // Client-side cutoff hint (informational, server enforces)
      try {
        var tz = exp.timezone || "Australia/Melbourne";
        var timePart = String(slotVal).split("-")[0].trim();
        var parts = timePart.split(":");
        var hh = parseInt(parts[0], 10);
        var mm = parseInt(parts[1], 10);
        var dateParts = dateVal.split("-");
        var y = parseInt(dateParts[0], 10);
        var mo = parseInt(dateParts[1], 10);
        var da = parseInt(dateParts[2], 10);
        // Compute slot time in experience timezone (not browser timezone)
        var slotMs = (function(sy,smo,sda,shh,smm,stz){
          try {
            var utcGuess = Date.UTC(sy, smo - 1, sda, shh, smm, 0);
            var p = new Intl.DateTimeFormat("en-US", {
              timeZone: stz, year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit", hour12: false
            }).formatToParts(new Date(utcGuess));
            var gv = function(t){ var f=p.find(function(x){return x.type===t}); return f?+f.value:0; };
            var tHh = gv("hour"); if (tHh===24) tHh=0;
            var tzShown = Date.UTC(gv("year"), gv("month")-1, gv("day"), tHh, gv("minute"), 0);
            return utcGuess - (tzShown - utcGuess);
          } catch(_){ return new Date(sy, smo-1, sda, shh, smm, 0).getTime(); }
        })(y, mo, da, hh, mm, tz);
        var cutoffTime = new Date(slotMs - cutoffMins * 60000);
        if (Date.now() >= cutoffTime.getTime()) {
          // R5 (2026-05-30): cutoff-hit message also routes to the inline
          // helper, not the orphaned paragraph below.
          var __cutoffInline2 = document.getElementById("time-slot-inline-helper");
          if (__cutoffInline2) __cutoffInline2.textContent = "Bookings closed for this slot";
          if (cutoffInfoEl) cutoffInfoEl.textContent = "";
          if (submitBtn) submitBtn.disabled = true;
          if (waitlistCtaEl) waitlistCtaEl.classList.remove("hidden");
          return;
        }
      } catch (_) {}
      if (submitBtn) submitBtn.disabled = false;
      // Coming-soon keeps its waitlist (sir's 2026-07-23 ruling + 2026-08-19 go-ahead) — only
      // the normal bookable state hides it here.
      if (waitlistCtaEl && !__bookingComingSoon) waitlistCtaEl.classList.add("hidden");
    }

    // Ask the server which sittings a given date really has left, after its own clock and cutoff.
    // Returns [] for a date with nothing bookable — which is a fact about that date, not an error.
    const fetchBookableSlotsFor = async function (dateStr) {
      try {
        const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/slot-times?date=" + encodeURIComponent(dateStr));
        if (!res.ok) return [];
        const data = await res.json().catch(function () { return null; });
        if (!data || !data.ok || !data.data) return [];
        const serverNow = Number(data.data.serverNowMs) || Date.now();
        const cutoffEnabled = data.data.cutoffEnabled !== false;
        const slots = Array.isArray(data.data.slots) ? data.data.slots : [];
        return slots.filter(function (s) {
          if (!s.slotStartEpochMs) return false;
          if (s.slotStartEpochMs <= serverNow) return false;
          if (cutoffEnabled && s.cutoffEpochMs !== null) return serverNow < s.cutoffEpochMs;
          return true;
        }).map(function (s) { return s.slot; });
      } catch (_slotErr) { void _slotErr; return []; }
    };

    const onBookingDateChanged = async function (opts) {
      let selected = readSelectedBookingDate();
      if (!bookableDateSet.has(selected)) {
        selected = (bookableDates.length > 0) ? String(bookableDates[0]) : "";
        writeSelectedBookingDate(selected);
      }
      if (!selected) {
        renderAvailableTimeSlotsForDate(selected);
        checkCutoff();
        return;
      }
      baseTimeSlots = await fetchBookableSlotsFor(selected);
      // The default date is picked before anyone knows which sittings are still open, so it can land on
      // a day whose only sitting has already passed its cutoff — the guest then arrives at a listing that
      // runs every weekend and reads "No available slots for this date" with the button dead. On arrival
      // only, walk forward to the first date that genuinely has something left. A date the guest CHOSE is
      // never overridden: if they pick a full day, they are told so plainly.
      if (baseTimeSlots.length === 0 && opts && opts.advanceToFirstOpenDate === true) {
        const startAt = bookableDates.indexOf(selected);
        for (let i = startAt + 1; i < bookableDates.length && i <= startAt + 10; i++) {
          const candidate = String(bookableDates[i]);
          const candidateSlots = await fetchBookableSlotsFor(candidate);
          if (candidateSlots.length > 0) {
            selected = candidate;
            writeSelectedBookingDate(selected);
            baseTimeSlots = candidateSlots;
            break;
          }
        }
      }
      renderAvailableTimeSlotsForDate(selected);
      checkCutoff();
      // Fetch per-user seat data for the selected date + first slot
      var _slotForSeats = (timeSlotInput && timeSlotInput.value) ? String(timeSlotInput.value) : "";
      if (selected && _slotForSeats) {
        _fetchMySeats(selected, _slotForSeats).catch(function (_msErr2) { void _msErr2; });
      }
      // R7 (2026-05-30): refresh the concrete cancellation schedule when the
      // date changes — every tier's deadline depends on the slot start moment.
      try { renderPolicyCancelHint(); } catch (_rphErr2) { void _rphErr2; }
    };
    if (dateInput) dateInput.addEventListener("change", onBookingDateChanged);
    if (bookingDateSelect) bookingDateSelect.addEventListener("change", onBookingDateChanged);
    // sir 2026-08-09, same fix as above: this was bound to "change" ONLY, so the real per-date slots
    // were fetched only if the guest touched the date control. On arrival the page showed whatever
    // hydrateTimeSlots had put there. Now that the invented fallback is gone, an untouched page would
    // read "No available slots" — so ask the server for the pre-selected date's slots straight away.
    onBookingDateChanged({ advanceToFirstOpenDate: true }).catch(function (_initSlotErr) { void _initSlotErr; /* best-effort, same as every other panel here */ });
    if (timeSlotInput) timeSlotInput.addEventListener("change", function () {
      checkCutoff();
      var _d = readSelectedBookingDate();
      var _s = (timeSlotInput && timeSlotInput.value) ? String(timeSlotInput.value) : "";
      if (_d && _s) {
        // _fetchMySeats already handles network failure internally — wrap the
        // promise rejection so an uncaught one doesn't surface in dev console.
        _fetchMySeats(_d, _s).catch(function (_msErr) { void _msErr; });
      }
      // R7 (2026-05-30): refresh the concrete cancellation schedule when the
      // slot changes — deadlines are anchored to the slot start time.
      try { renderPolicyCancelHint(); } catch (_rphErr) { void _rphErr; }
    });
    checkCutoff();

    // === WAITLIST ===
    var _isOnWaitlist = false;
    if (joinWaitlistBtn) {
      joinWaitlistBtn.addEventListener("click", async function () {
        var __wlShowError = function (msg) {
          // R14 pattern (sir's ruling): failures speak inline with the server's own words.
          if (waitlistStatusEl) {
            waitlistStatusEl.textContent = String(msg || "We couldn't update the waitlist just now. Please try again.");
            waitlistStatusEl.classList.remove("hidden");
          }
        };
        try {
          if (waitlistStatusEl) waitlistStatusEl.classList.add("hidden");
          if (_isOnWaitlist) {
            var delRes = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/waitlist", { method: "DELETE" });
            var delData = await delRes.json().catch(function () { return null; });
            if (!delRes.ok) { __wlShowError(delData && delData.message); return; }
            _isOnWaitlist = false;
            joinWaitlistBtn.textContent = "Get on the Waitlist";
            if (window.tstsNotify) window.tstsNotify("Removed from waitlist.", "info");
          } else {
            var wlBody = {};
            const selectedBookingDate = readSelectedBookingDate();
            if (selectedBookingDate) wlBody.bookingDate = selectedBookingDate;
            if (timeSlotInput && timeSlotInput.value) wlBody.timeSlot = timeSlotInput.value;
            var joinRes = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/waitlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(wlBody),
            });
            var joinData = await joinRes.json().catch(function () { return null; });
            if (!joinRes.ok) { __wlShowError(joinData && joinData.message); return; }
            _isOnWaitlist = true;
            joinWaitlistBtn.textContent = "Leave Waitlist";
            if (window.tstsNotify) window.tstsNotify("Added to waitlist!", "success");
          }
        } catch (e) {
          __wlShowError("");
        }
      });
    }
    // Check initial waitlist status
    try {
      var session = window.tstsGetSession ? await window.tstsGetSession() : null;
      // Dead-gate fix (same class as md:hidden/discoverable): the session has no .token field;
      // the real signed-in shape is ok + user.
      if (session && session.ok && session.user) {
        var wlRes = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/waitlist/status", { method: "GET" });
        if (wlRes.ok) {
          var wlData = await wlRes.json();
          if (wlData && wlData.ok && wlData.data && wlData.data.isOnWaitlist) {
            _isOnWaitlist = true;
            if (joinWaitlistBtn) joinWaitlistBtn.textContent = "Leave Waitlist";
            if (waitlistStatusEl) waitlistStatusEl.classList.add("hidden");
          }
        }
      }
    } catch (_) {}

    show("experience-content");
    // Ensure not-found is hidden when content loads successfully
    const notFoundEl = document.getElementById("experience-not-found");
    if (notFoundEl) notFoundEl.classList.add("hidden");

    // sir 2026-08-16 ("Fix it"): the "Write a review" link lands on #reviews-section, but the
    // browser's native hash jump fires before this content reveals — the guest was dropped at
    // the top. Same approved pattern as public-profile.js:235 — scroll once the section is real.
    if (String(location.hash || "") === "#reviews-section") {
      const __revSec = document.getElementById("reviews-section");
      // Guarded like the other scroll sites: a throw inside a timer callback is uncatchable.
      if (__revSec) setTimeout(function () { try { __revSec.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_scrollErr) { void _scrollErr; } }, 60);
    }

    // D2: Show host-only status banner if viewer is the host and listing is not ACTIVE
    if (exp.status && exp.status !== "ACTIVE" && viewerIsHostForExperience) {
      const statusMessages = {
        DRAFT: "Your experience is still a draft. Guests won't see it until you publish.",
        PENDING_REVIEW: "Your experience is under review. We'll let you know once it's live.",
        PAUSED: "You've paused this experience. Only you can see it right now."
      };
      const msg = statusMessages[exp.status] || "This experience isn't visible to guests at the moment.";
      const bannerEl = document.getElementById("host-listing-status-banner");
      const bannerText = document.getElementById("host-listing-status-text");
      if (bannerEl && bannerText) {
        bannerText.textContent = msg;
        bannerEl.classList.remove("hidden");
      }
    }

    // fire-and-forget secondary panels
    loadPolicyVersion().catch(function(_polErr) { void _polErr; /* policy fetch is best-effort */ });
    initBookmarkState().catch(function(_bmErr) { void _bmErr; /* bookmark hydrate is best-effort */ });
    // initLikeState removed, single heart matches explore card (D-7).
    loadReviews().catch(function(_revErr) { void _revErr; /* reviews are best-effort */ })
      .then(function () { return mountReviewWriteBox(); })
      .catch(function(_wbErr) { void _wbErr; /* write box is best-effort */ });
    loadSimilar().catch(function(_simErr) { void _simErr; /* similar list is best-effort */ });
  }

  function hydrateTimeSlots(e) {
    if (!timeSlotInput) return;

    // sir 2026-08-09, on the evidence, verbatim: "Fix it — drop the invented slot".
    // This used to fall back to a literal ["18:00-20:00"] whenever a listing carried no flat
    // timeSlots — so a listing whose sittings live in dateOverrides (a carved date-series) showed
    // guests a 6:00 PM – 8:00 PM sitting that NOBODY offers, and the server then refused the
    // booking with "This time slot is not offered for this experience." An invented time is never
    // better than no time: the real slots for the chosen date arrive from /slot-times.
    baseTimeSlots = (e && Array.isArray(e.timeSlots) && e.timeSlots.length > 0)
      ? e.timeSlots
      : [];
  }

  async function loadPolicyVersion() {
    try {
      const res = await af("/api/policy/active", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true) return "";
      const payload = (data && typeof data === "object") ? data : {};
      const p = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
      const v = String((p && p.version) || "");
      activePolicyVersion = v;
      const capRaw = p && p.rules && Number.isFinite(Number(p.rules.userCancelRefundCapPercent))
        ? Number(p.rules.userCancelRefundCapPercent) : null;
      activePolicyCancelCap = (capRaw !== null) ? Math.round(capRaw) : null;
      // R7 (2026-05-30): cache the per-tier schedule for concrete-date rendering.
      // Sort high → low hours-before so the user reads the most generous tier first.
      const tiersRaw = (p && p.rules && Array.isArray(p.rules.userCancelTiers)) ? p.rules.userCancelTiers : [];
      activePolicyCancelTiers = tiersRaw
        .map(function (t) { return { hours: Number(t.hoursBeforeStartMin) || 0, pct: Math.round((Number(t.refundPercent) || 0) * 100) }; })
        .sort(function (a, b) { return b.hours - a.hours; });
      renderPolicyCancelHint();
      return v;
    } catch (_) {
      return "";
    }
  }

  // Owner-flagged 2026-05-02: render the "When this happens" frequency section
  //, days of week, time slots, date window, and the next ~6 bookable dates.
  // Helps guests see this is recurring and pick a date they prefer.
  // Owner-spec 2026-05-04 (D-15 revised):
  //   1. Cadence line uses 12-hour time format ("at 2:00 pm to 4:30 pm").
  //   2. Show only 2-3 nearest date buttons with relative labels (Today /
  //      Tonight / Tomorrow / "Sat 10 May").
  //   3. The static window line ("Available DATE - DATE") is dropped.
  //   4. Clicking a date pre-fills the sidebar date dropdown AND auto-selects
  //      the time slot if the listing has exactly ONE time slot.
  function __format12Hour(slot) {
    // Input "14:00-16:30" -> "2:00 pm to 4:30 pm". Falls through unchanged
    // when the format doesn't match (e.g. host typed free-form text).
    var m = String(slot || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return String(slot || "");
    var fmt = function (h, mn) {
      h = parseInt(h, 10); mn = parseInt(mn, 10);
      var period = h >= 12 ? "pm" : "am";
      var h12 = ((h + 11) % 12) + 1;
      return h12 + ":" + (mn < 10 ? "0" + mn : mn) + " " + period;
    };
    return fmt(m[1], m[2]) + " to " + fmt(m[3], m[4]);
  }
  function __relativeDateLabel(iso) {
    if (!iso) return "";
    var todayStr = todayIsoDate();
    var d = new Date(iso + "T00:00:00");
    var t = new Date(todayStr + "T00:00:00");
    var diffDays = Math.round((d.getTime() - t.getTime()) / (24 * 3600 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    // Otherwise: short day-of-week + day-of-month e.g. "Sat 10 May".
    var dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return dayNames[d.getDay()] + " " + d.getDate() + " " + monthNames[d.getMonth()];
  }

  function renderFrequencySection(exp) {
    if (!exp) return;
    var section = document.getElementById("frequency-section");
    var line = document.getElementById("exp-frequency-line");
    var datesEl = document.getElementById("exp-upcoming-dates");
    var windowEl = document.getElementById("exp-frequency-window");
    if (!section || !line || !datesEl) return;

    var days = Array.isArray(exp.availableDays) ? exp.availableDays.map(function(d){return String(d||"").trim().toLowerCase();}).filter(Boolean) : [];
    var slots = Array.isArray(exp.timeSlots) ? exp.timeSlots.map(function(s){return String(s||"").trim();}).filter(Boolean) : [];
    if (days.length === 0 && slots.length === 0 && !exp.startDate && !exp.endDate) {
      return; // nothing meaningful to show
    }

    // Day labels + 12-hour formatted time-slot list.
    var dayMap = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
    var dayWords = days.map(function(d){ return dayMap[d.slice(0,3)] || d; });
    var dayPart = dayWords.length === 7 ? "every day"
      : dayWords.length === 0 ? ""
      : dayWords.length === 1 ? ("every " + dayWords[0])
      : ("every " + dayWords.slice(0, -1).join(", ") + " and " + dayWords[dayWords.length - 1]);
    var formattedSlots = slots.map(__format12Hour);
    var timePart = formattedSlots.length > 0 ? (" at " + formattedSlots.join(", ")) : "";
    line.textContent = (dayPart + timePart).trim() || "Recurring availability. Pick any date below.";

    // Owner-spec 2026-05-04: drop the "Available DATE - DATE" line.
    if (windowEl) windowEl.textContent = "";

    // Compute next 3 bookable dates by walking forward from today.
    datesEl.textContent = "";
    var DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];
    var today = new Date();
    today.setHours(0,0,0,0);
    var dayAllowed = function(d) {
      if (!days.length) return true;
      return days.indexOf(DAY_KEYS[d.getDay()]) >= 0;
    };
    var startStr = exp.startDate ? String(exp.startDate).slice(0,10) : "";
    var endStr   = exp.endDate   ? String(exp.endDate).slice(0,10)   : "";
    var maxIso = endStr || "";
    var minIso = startStr && startStr > todayIsoDate() ? startStr : todayIsoDate();
    var minDate = new Date(minIso + "T00:00:00");
    minDate.setHours(0,0,0,0);
    var d = new Date(minDate);
    var collected = [];
    var safety = 0;
    // Owner-spec 2026-05-04 (D-15 fix): use LOCAL date string, not toISOString,
    // because toISOString converts to UTC and shifts the date back a day in
    // negative-UTC timezones (was breaking day-of-week display in IST).
    var __localIso = function (dt) {
      var y = dt.getFullYear();
      var m = dt.getMonth() + 1;
      var dd = dt.getDate();
      return y + "-" + (m < 10 ? "0" + m : m) + "-" + (dd < 10 ? "0" + dd : dd);
    };
    while (collected.length < 3 && safety < 120) {
      safety += 1;
      var iso = __localIso(d);
      if (maxIso && iso > maxIso) break;
      if (dayAllowed(d)) {
        collected.push(iso);
      }
      d.setDate(d.getDate() + 1);
    }
    if (collected.length === 0) {
      var noneEl = document.createElement("p");
      noneEl.className = "text-xs text-slate-500 italic";
      noneEl.textContent = "No upcoming dates in the next few weeks. Pick a date in the booking panel to check availability.";
      datesEl.appendChild(noneEl);
    } else {
      // Owner-fixed 2026-05-26: shared class strings so the SELECTED highlight can
      // MOVE to the clicked chip (it was permanently stuck on the first chip).
      var __chipPrimaryCls = "px-4 py-2 rounded-full text-sm font-bold bg-orange-600 text-white border-2 border-orange-600 hover:bg-orange-700 hover:border-orange-700 transition shadow-sm";
      var __chipSecondaryCls = "px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-900 border border-orange-200 hover:bg-orange-100 transition";
      // First button gets brand-accent treatment to highlight nearest date.
      collected.forEach(function(iso, idx) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = (idx === 0) ? __chipPrimaryCls : __chipSecondaryCls;
        pill.textContent = __relativeDateLabel(iso);
        pill.setAttribute("data-frequency-date", iso);
        pill.addEventListener("click", function() {
          // Owner-fixed 2026-05-26: drive the ACTIVE date control (#booking-date-select),
          // NOT the hidden+disabled #booking-date input. The old code wrote iso to the hidden
          // input and fired change, but the slot pipeline reads #booking-date-select via
          // readSelectedBookingDate() — so a chip click silently kept the STALE date (proven:
          // clicking "Sun 31" fetched /slot-times?date=2026-05-30). writeSelectedBookingDate()
          // sets the live <select> (iso is already a valid option), then dispatching change on
          // it runs onBookingDateChanged with the correct date. The old manual time-slot set is
          // removed — it raced the async slot fetch and is redundant (onBookingDateChanged
          // repopulates the slots itself).
          writeSelectedBookingDate(iso);
          var ctl = bookingDateSelect || dateInput;
          if (ctl) ctl.dispatchEvent(new Event("change", { bubbles: true }));
          // Move the selected highlight onto the clicked chip.
          Array.prototype.forEach.call(datesEl.querySelectorAll("[data-frequency-date]"), function(b) {
            b.className = (b === pill) ? __chipPrimaryCls : __chipSecondaryCls;
          });
          // Scroll the booking sidebar into view (right column on desktop, full
          // width on mobile so the panel becomes the focus).
          var sidebar = document.getElementById("booking-form") || document.getElementById("booking-date");
          if (sidebar) sidebar.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        datesEl.appendChild(pill);
      });
    }

    section.classList.remove("hidden");
  }

  // Owner 2026-05-30 (R7 revised): sir reverted the 4-tier schedule — keep the
  // ORIGINAL one-liner "refunds up to N% based on how far ahead you cancel"
  // (just better formatted via the heading + flex chrome added in the HTML).
  // The schedule ul is hidden; nothing computed from slot start.
  function renderPolicyCancelHint() {
    const hint = document.getElementById("booking-policy-hint");
    const hintText = document.getElementById("booking-policy-hint-text");
    const scheduleEl = document.getElementById("booking-policy-schedule");
    if (!hint || !hintText) return;
    // Owner-approved 2026-07-23 (sir): no cancellation-refund hint on a "Coming soon"
    // listing — you can't cancel what you can't book yet.
    if (__bookingComingSoon) { hint.classList.add("hidden"); return; }
    if (activePolicyCancelCap == null) {
      hint.classList.add("hidden");
      return;
    }
    // Owner 2026-05-30 (R7 — world-best rewrite per sir): empathy opener,
    // concrete percent, honest hedge, clear hand-off to full terms. Replaces
    // the prior insurance-y "Cancellation: refunds up to N% based on how far
    // ahead you cancel" phrasing.
    hintText.textContent = "Plans change. Get up to " + String(activePolicyCancelCap) + "% back depending on how early you cancel. See the ";
    if (scheduleEl) { scheduleEl.classList.add("hidden"); scheduleEl.textContent = ""; }
    hint.classList.remove("hidden");
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // REFUND SNAPSHOT POP-UP — sir's order 2026-08-22, go-ahead given.
  //
  // sir, verbatim: "we can have a snap shot table pop up when someone clikcon ccancellation policy
  // on how much they will get can as % and dollar calu calculated based on what they are paying just
  // above cancellation policy text start" and "just additional table on top of it -- i repeat and
  // record this ---- that you will not mess with original policy and put table there ... but a
  // table based on actual % and dollar value based on the experince being booked with total prices".
  //
  // WHY IT EXISTS: walked as a guest, the ONLY cancellation figure anywhere before payment was
  // "up to 95% back depending on how early you cancel". No 24/48/72 hours, no 75%, no 50%, no
  // "nothing under 24 hours" — not on the listing, not on the panel, and not in the policy the link
  // opens (that policy deliberately does not print tiers, saying they are shown before payment).
  // So the two documents pointed at each other and the numbers lived in neither, while the guest
  // ticked a box accepting them.
  //
  // WHAT IT DOES NOT DO: it does not touch the policy record. The policy text is fetched and shown
  // BELOW the table, exactly as stored. Nothing is written into it.
  //
  // The R7 amber card stays exactly as sir locked it on 2026-05-30 — sir reversed a per-tier
  // schedule ON that card ("old line was better, just not formatted"), so the schedule appears only
  // here, in the pop-up, on click. #booking-policy-schedule stays hidden and untouched.
  let __refundSnapshotPolicyText = null;

  function __refundSnapshotCurrency() {
    // listingCurrency is function-local to updateDisplayedPrice, so it is derived the same way here
    // rather than assumed to be in scope.
    return (exp && exp.currency) ? String(exp.currency).toUpperCase() : "AUD";
  }

  // Minimal, XSS-safe markdown rendering: real DOM nodes only, never innerHTML. Headings, bullets
  // and bold are the only markers the stored policy uses.
  function __refundSnapshotRenderPolicy(container, text) {
    const lines = String(text || "").split("\n");
    lines.forEach(function (raw) {
      const line = String(raw || "").trim();
      if (!line) return;
      if (/^#{1,6}\s/.test(line)) {
        const level = (line.match(/^#+/) || ["#"])[0].length;
        container.appendChild(window.tstsEl(level <= 2 ? "h4" : "h5", {
          className: "font-bold text-tsts-ink mt-4 mb-1 " + (level <= 2 ? "text-sm" : "text-xs")
        }, line.replace(/^#{1,6}\s*/, "")));
        return;
      }
      const isBullet = /^[-*]\s/.test(line);
      const body = isBullet ? line.replace(/^[-*]\s*/, "") : line;
      const p = window.tstsEl(isBullet ? "li" : "p", {
        className: isBullet ? "text-xs text-slate-600 leading-relaxed ml-4 list-disc" : "text-xs text-slate-600 leading-relaxed mt-2"
      });
      // Split on **bold** and append text nodes / <strong> — no HTML parsing anywhere.
      String(body).split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
        if (!part) return;
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          p.appendChild(window.tstsEl("strong", { className: "font-semibold text-tsts-ink" }, part.slice(2, -2)));
        } else {
          p.appendChild(document.createTextNode(part));
        }
      });
      container.appendChild(p);
    });
  }

  function __refundSnapshotBuildTable() {
    const ccy = __refundSnapshotCurrency();
    const totalCents = Number(__lastBookingTotalCents);
    const haveTotal = Number.isFinite(totalCents) && totalCents > 0;
    const tiers = Array.isArray(activePolicyCancelTiers) ? activePolicyCancelTiers.slice() : [];

    const wrap = window.tstsEl("div", { className: "rounded-xl border border-slate-200 overflow-hidden" });

    if (tiers.length === 0) {
      wrap.appendChild(window.tstsEl("p", { className: "text-xs text-slate-600 p-3" },
        "We could not load the cancellation windows just now. The full terms are below."));
      return wrap;
    }

    const head = window.tstsEl("div", { className: "grid grid-cols-3 gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200" }, [
      window.tstsEl("span", { className: "text-[11px] font-bold uppercase tracking-wide text-slate-500" }, "If you cancel"),
      window.tstsEl("span", { className: "text-[11px] font-bold uppercase tracking-wide text-slate-500 text-right" }, "You get back"),
      window.tstsEl("span", { className: "text-[11px] font-bold uppercase tracking-wide text-slate-500 text-right" }, haveTotal ? "On this booking" : "")
    ]);
    wrap.appendChild(head);

    // Sorted high → low hours by loadPolicyVersion, so the most generous window reads first.
    tiers.forEach(function (t, idx) {
      const hours = Number(t.hours) || 0;
      const pct = Number(t.pct) || 0;
      const next = tiers[idx + 1];
      let when;
      if (idx === 0) when = hours + " hours or more before";
      else if (hours === 0) when = "Less than " + (Number(tiers[idx - 1].hours) || 0) + " hours before";
      else when = hours + " to " + (Number(tiers[idx - 1].hours) || 0) + " hours before";
      void next;

      const cents = haveTotal ? Math.round(totalCents * pct / 100) : null;
      const moneyText = (cents === null) ? "" : (cents === 0 ? "Nothing" : tstsFormatPriceSymbol(cents / 100, ccy));

      wrap.appendChild(window.tstsEl("div", {
        className: "grid grid-cols-3 gap-2 px-3 py-2 text-xs " + (idx % 2 ? "bg-white" : "bg-slate-50/40")
      }, [
        window.tstsEl("span", { className: "text-slate-700" }, when),
        window.tstsEl("span", { className: "text-right font-semibold " + (pct === 0 ? "text-rose-600" : "text-tsts-ink") }, pct === 0 ? "Nothing" : (pct + "%")),
        window.tstsEl("span", { className: "text-right font-bold " + (pct === 0 ? "text-rose-600" : "text-tsts-ink") }, moneyText)
      ]));
    });

    return wrap;
  }

  async function __openRefundSnapshot() {
    const overlay = window.tstsEl("div", {
      className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200"
    });
    const body = window.tstsEl("div", { className: "space-y-4" });
    const panel = window.tstsEl("div", {
      className: "bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 transform scale-95 opacity-0 transition-all duration-200 max-h-[85vh] overflow-y-auto",
      role: "dialog", "aria-modal": "true", "aria-label": "Cancellation and refund policy"
    }, [body]);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let closing = false;
    function close() {
      if (closing) return; closing = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.classList.remove("opacity-100"); overlay.classList.add("opacity-0");
      panel.classList.remove("scale-100", "opacity-100"); panel.classList.add("scale-95", "opacity-0");
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }
    function onKey(ev) { if (ev && ev.key === "Escape") { ev.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("click", function (ev) { if (ev.target === overlay) close(); });

    body.appendChild(window.tstsEl("h3", { className: "heading-serif text-lg font-bold text-tsts-ink" }, "Cancellation & Refund Policy"));

    // THE TABLE, ON TOP — sir's order.
    body.appendChild(window.tstsEl("p", { className: "text-xs text-slate-500" },
      Number(__lastBookingTotalCents) > 0
        ? "What you would get back on this booking, based on the total you are paying now."
        : "What you would get back, based on when you cancel."));
    body.appendChild(__refundSnapshotBuildTable());
    body.appendChild(window.tstsEl("p", { className: "text-[11px] text-slate-400" },
      "Times are counted from when the experience starts."));

    // THE FULL POLICY, BELOW IT, EXACTLY AS STORED.
    const policyWrap = window.tstsEl("div", { className: "border-t border-slate-200 pt-3" });
    policyWrap.appendChild(window.tstsEl("p", { className: "text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1" }, "Full terms"));
    const policyBody = window.tstsEl("div", {});
    policyWrap.appendChild(policyBody);
    body.appendChild(policyWrap);

    const closeBtn = window.tstsEl("button", {
      type: "button",
      className: "w-full mt-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-800 font-semibold hover:bg-gray-50 transition"
    }, "Close");
    closeBtn.addEventListener("click", close);
    body.appendChild(closeBtn);

    requestAnimationFrame(function () {
      overlay.classList.remove("opacity-0"); overlay.classList.add("opacity-100");
      panel.classList.remove("scale-95", "opacity-0"); panel.classList.add("scale-100", "opacity-100");
    });

    policyBody.appendChild(window.tstsEl("p", { className: "text-xs text-slate-400" }, "Loading the full terms…"));
    try {
      if (__refundSnapshotPolicyText === null) {
        // NOT af(): that sends credentials, and /api/legal/:type is a PUBLIC route answering with a
        // wildcard Access-Control-Allow-Origin, which a browser refuses to combine with
        // credentials:"include". Proven live — the first build failed CORS and showed the fallback.
        // Plain fetch, same as js/legal-page.js uses for this exact route.
        const __base = (window.__TSTS_RUNTIME__ && window.__TSTS_RUNTIME__.apiBase) ? window.__TSTS_RUNTIME__.apiBase : "";
        // The policy TYPE is "refund", not "refund-policy". I first used the page's filename and got
        // a 404 — the server's accepted list is __POLICY_TYPES_PUBLIC:
        // privacy | terms | host_terms | cookies | refund | community_guidelines | acceptable_use.
        const res = await fetch(__base + "/api/legal/refund");
        const data = await res.json().catch(function () { return null; });
        __refundSnapshotPolicyText = (data && data.data && data.data.content) ? String(data.data.content) : "";
      }
      policyBody.textContent = "";
      if (__refundSnapshotPolicyText) {
        __refundSnapshotRenderPolicy(policyBody, __refundSnapshotPolicyText);
      } else {
        policyBody.appendChild(window.tstsEl("p", { className: "text-xs text-slate-600" },
          "We could not load the full terms just now."));
        const link = window.tstsEl("a", { href: "refund-policy.html", target: "_blank", rel: "noopener noreferrer", className: "text-xs underline text-orange-600" }, "Open the Cancellation & Refund Policy");
        policyBody.appendChild(link);
      }
    } catch (_e) {
      void _e;
      policyBody.textContent = "";
      policyBody.appendChild(window.tstsEl("p", { className: "text-xs text-slate-600" },
        "We could not load the full terms just now."));
      const link2 = window.tstsEl("a", { href: "refund-policy.html", target: "_blank", rel: "noopener noreferrer", className: "text-xs underline text-orange-600" }, "Open the Cancellation & Refund Policy");
      policyBody.appendChild(link2);
    }
  }

  // R7 helper — compute slot start as a UTC millis in the experience timezone
  // (mirrors the cutoff math at the bottom of updateBookingNoteAndPrice). Falls
  // back to local-time interpretation if Intl.DateTimeFormat is unavailable.
  function computeSlotStartMs(dateStr, slotStr) {
    if (!dateStr || !slotStr) return 0;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(slotStr));
    if (!m) return 0;
    const dateParts = String(dateStr).split("-");
    if (dateParts.length !== 3) return 0;
    const y = parseInt(dateParts[0], 10);
    const mo = parseInt(dateParts[1], 10);
    const da = parseInt(dateParts[2], 10);
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const tz = (exp && exp.timezone) || "Australia/Melbourne";
    try {
      const utcGuess = Date.UTC(y, mo - 1, da, hh, mm, 0);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      }).formatToParts(new Date(utcGuess));
      const gv = function (t) { const f = parts.find(function (x) { return x.type === t; }); return f ? +f.value : 0; };
      let tHh = gv("hour"); if (tHh === 24) tHh = 0;
      const tzShown = Date.UTC(gv("year"), gv("month") - 1, gv("day"), tHh, gv("minute"), 0);
      return utcGuess - (tzShown - utcGuess);
    } catch (_e) {
      void _e;
      return new Date(y, mo - 1, da, hh, mm, 0).getTime();
    }
  }

  // R7 helper — "Wed 3 Jun 10:00 AM" style, AU local. We use the EXPERIENCE
  // timezone so the deadline reads correctly for the host's clock.
  function formatDeadlineForCard(ms) {
    if (!ms || !Number.isFinite(ms)) return "—";
    const tz = (exp && exp.timezone) || "Australia/Melbourne";
    try {
      return new Intl.DateTimeFormat("en-AU", {
        timeZone: tz, weekday: "short", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit", hour12: true
      }).format(new Date(ms));
    } catch (_e) {
      void _e;
      const d = new Date(ms);
      return d.toString();
    }
  }

  function fmtDate(x) {
    try {
      if (window.tstsFormatDateShort) return window.tstsFormatDateShort(x);
    } catch (_) {}
    try {
      const d = new Date(String(x || ""));
      if (isNaN(d.getTime())) return String(x || "");
      return d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "Australia/Melbourne" });
    } catch (_) {
      return String(x || "");
    }
  }

  // Owner-spec 2026-05-03 (D-7) + owner 2026-05-26: single heart matching the
  // FROZEN explore card. setBookmarkUI mirrors the outlined ♡ (white on a frosted
  // glass circle) → filled ♥ (orange-600) transition the P3 cards use, plus the
  // same tooltip + aria, so visual identity is genuinely identical to the card.
  function setBookmarkUI(on) {
    if (!bookmarkBtn) return;
    bookmarkBtn.setAttribute("aria-pressed", on ? "true" : "false");
    bookmarkBtn.setAttribute("aria-label", on ? "Liked" : "Like");
    bookmarkBtn.setAttribute("title", on ? "Liked" : "Like");
    bookmarkBtn.setAttribute("data-tooltip", on ? "Liked" : "Like");
    if (bookmarkIcon) {
      bookmarkIcon.className = on
        ? "fas fa-heart tsts-heart-photo-liked text-4xl"
        : "fas fa-heart tsts-heart-photo text-4xl";
    }
  }

  async function initBookmarkState() {
    if (!bookmarkBtn) return;

    // Hydrate initial state from exp payload OR my-bookmarks list.
    if (exp && typeof exp.isBookmarked === "boolean") {
      setBookmarkUI(exp.isBookmarked);
    } else if (await isAuthed()) {
      try {
        const res = await af("/api/my/bookmarks/details", { method: "GET" });
        if (res.status !== 401 && res.status !== 403) {
          const data = await res.json().catch(function(_jsonErr) { void _jsonErr; return null; });
          if (res.ok) {
            const list = (data && Array.isArray(data.data)) ? data.data : (Array.isArray(data) ? data : []);
            const isOn = list.some((x) => String((x && (x._id || x.id)) || "") === String(experienceId));
            setBookmarkUI(isOn);
          }
        }
      } catch (_hydrateErr) { void _hydrateErr; /* hydrate is best-effort; click handler still works */ }
    }

    // Click handler, uses the SAME flow as explore card. Pop animation +
    // shared tstsToggleBookmark backend (auth-gates to login if signed out).
    bookmarkBtn.addEventListener("click", function() {
      bookmarkBtn.classList.remove("tsts-heart-pop");
      void bookmarkBtn.offsetWidth;
      bookmarkBtn.classList.add("tsts-heart-pop");
      bookmarkBtn.addEventListener("animationend", function clearPop() {
        bookmarkBtn.classList.remove("tsts-heart-pop");
        bookmarkBtn.removeEventListener("animationend", clearPop);
      }, { once: true });
      if (window.tstsToggleBookmark) {
        window.tstsToggleBookmark(experienceId, bookmarkBtn).then(function(r) {
          if (r && typeof r.bookmarked === "boolean") setBookmarkUI(r.bookmarked);
        });
      }
    });
  }

  // initLikeState removed, single heart on detail page is the bookmark, no
  // separate "like" affordance (per explore-card parity, owner D-7).

  function buildReviewCard(r) {
    const El = window.tstsEl;
    const rating = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
    const when = r.date ? fmtDate(r.date) : "";
    const name = r.authorName || "Guest";
    const comment = (r.comment == null) ? "" : String(r.comment);

    var children = [
      El("div", { className: "flex justify-between items-start gap-4" }, [
        El("div", {}, [
          El("div", { className: "font-bold text-slate-900", textContent: name }),
          El("div", { className: "text-xs text-slate-500", textContent: when })
        ]),
        El("div", { className: "text-xs text-yellow-500", textContent: "★".repeat(rating) + "☆".repeat(5 - rating) })
      ]),
      El("p", { className: "text-sm text-slate-700 mt-3 italic break-words", textContent: '"' + comment + '"' })
    ];

    // Show host reply if present
    var hostReply = String(r.hostReply || "").trim();
    if (hostReply) {
      children.push(
        El("div", { className: "mt-3 pl-4 border-l-2 border-orange-200 bg-orange-50/50 rounded-r-lg p-3" }, [
          El("div", { className: "flex items-center gap-2 mb-1" }, [
            El("span", { className: "text-xs font-bold text-orange-700 uppercase tracking-wide", textContent: "Host Reply" })
          ]),
          El("p", { className: "text-sm text-slate-700 break-words", textContent: hostReply })
        ])
      );
    }

    return El("div", { className: "bg-slate-50/70 border border-slate-200 rounded-2xl p-4" }, children);
  }

  // W30 (fix-all order 2026-08-21, completing the owner's recorded 2026-06-08 decision): the
  // "Write a review" button on a past trip lands here for the WRITTEN comment, but this section
  // could only LIST reviews — and hid itself when there were none, so the first reviewer of a
  // listing arrived at a blank page top. This box is the missing write path: the my-bookings
  // link carries the booking (?reviewBooking=), the server owns every eligibility check, and
  // every word is the approved review-modal vocabulary.
  const REVIEW_STAR_LABELS = { 1: "Terrible", 2: "Poor", 3: "Average", 4: "Good", 5: "Excellent" };

  async function mountReviewWriteBox() {
    if (!reviewsSection || !reviewsList) return;
    const bookingId = String(qs("reviewBooking") || "").trim();
    if (!bookingId || !/^[a-fA-F0-9]{24}$/.test(bookingId)) return;
    const El = window.tstsEl;

    let mine = null;
    try {
      const res = await af("/api/reviews/booking/" + encodeURIComponent(bookingId) + "/mine", { method: "GET" });
      if (res.status === 401 || res.status === 403) return;
      const payload = await res.json().catch(function () { return null; });
      if (!res.ok) return;
      mine = payload && payload.data ? payload.data : null;
    } catch (_mineErr) { void _mineErr; return; }

    const editing = !!(mine && String(mine.id || "").trim());
    const locked = editing && !mine.canEdit;
    let currentRating = editing ? Math.max(1, Math.min(5, parseInt(mine.rating, 10) || 5)) : 5;

    const heading = El("h3", { className: "heading-serif text-lg font-semibold text-tsts-ink", textContent: locked ? "Review submitted" : (editing ? "Edit your review" : "How was it?") });
    const sub = El("p", { className: "text-sm text-slate-600 mt-0.5", textContent: locked ? "The 24-hour edit window has closed." : (editing ? "You can edit this review within 24 hours of submission." : "Share your experience with the community.") });

    const starLabelLine = El("p", { className: "text-xs text-slate-500 mt-1", textContent: REVIEW_STAR_LABELS[currentRating] || "" });
    const starBtns = [];
    const starRow = El("div", { className: "flex gap-1 py-1", role: "radiogroup", "aria-label": "Rating" });
    function paintStars() {
      starBtns.forEach(function (b) {
        const bv = parseInt(b.getAttribute("data-star"), 10);
        b.classList.remove("text-amber-400", "text-gray-300");
        b.classList.add(bv <= currentRating ? "text-amber-400" : "text-gray-300");
      });
      starLabelLine.textContent = REVIEW_STAR_LABELS[currentRating] || "";
    }
    for (let sv = 1; sv <= 5; sv++) {
      const starBtn = El("button", { type: "button", className: "text-2xl p-1 transition-transform hover:scale-110 text-amber-400", "aria-label": sv + (sv === 1 ? " star" : " stars"), textContent: "★" });
      starBtn.setAttribute("data-star", String(sv));
      starBtn.addEventListener("click", function () { if (locked) return; currentRating = sv; paintStars(); });
      starBtns.push(starBtn);
      starRow.appendChild(starBtn);
    }
    // Paint on build too: an existing 4-star review must open showing four lit stars,
    // not five gold ones sitting above the word "Good".
    paintStars();

    const commentBox = El("textarea", { className: "w-full border-slate-200 rounded-xl focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent p-3 border text-sm", placeholder: "What was the highlight? How was the food?" });
    commentBox.rows = 4;
    commentBox.value = editing ? String(mine.comment || "") : "";
    const windowHint = El("p", { className: "text-xs text-slate-500 mt-2", textContent: (editing && mine.canEdit && mine.editableUntil) ? ("Edit window closes on " + fmtDate(mine.editableUntil) + ".") : "" });
    const errLine = El("p", { className: "text-xs text-red-600 mt-2 hidden" });
    const submitBtn = El("button", { type: "button", className: "px-6 py-2 tsts-btn-primary font-bold rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed text-sm", textContent: locked ? "Edit Window Closed" : (editing ? "Update Review" : "Post Review") });
    if (locked) {
      submitBtn.disabled = true;
      commentBox.disabled = true;
      starRow.classList.add("pointer-events-none", "opacity-60");
    }

    submitBtn.addEventListener("click", async function () {
      errLine.classList.add("hidden");
      const comment = String(commentBox.value || "").trim();
      if (!comment) {
        errLine.textContent = "Please write a few words about how it went.";
        errLine.classList.remove("hidden");
        return;
      }
      submitBtn.disabled = true;
      try {
        let res;
        if (editing) {
          res = await af("/api/reviews/" + encodeURIComponent(String(mine.id)), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: currentRating, comment: comment }) });
        } else {
          res = await af("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "guest_to_host", bookingId: bookingId, experienceId: experienceId, rating: currentRating, comment: comment }) });
        }
        const payload = await res.json().catch(function () { return null; });
        if (!res.ok) {
          errLine.textContent = String((payload && payload.message) || "We couldn't save your review. Please try again.");
          errLine.classList.remove("hidden");
          submitBtn.disabled = false;
          return;
        }
        window.tstsNotify(editing ? "Your review has been updated." : "Thanks, your review is live.", "success");
        try { await loadReviews(); } catch (_reListErr) { void _reListErr; }
        await mountReviewWriteBox();
      } catch (_subErr) {
        void _subErr;
        errLine.textContent = "We couldn't save your review. Please try again.";
        errLine.classList.remove("hidden");
        submitBtn.disabled = false;
      }
    });

    const box = El("div", { className: "bg-slate-50/70 border border-slate-200 rounded-2xl p-4 mb-4" }, [
      heading,
      sub,
      El("p", { className: "text-sm font-medium text-slate-700 mt-3 mb-1", textContent: "Rating" }),
      starRow,
      starLabelLine,
      El("p", { className: "text-sm font-medium text-slate-700 mt-3 mb-1", textContent: "Your Review" }),
      commentBox,
      windowHint,
      errLine,
      El("div", { className: "flex justify-end pt-2" }, [submitBtn])
    ]);
    box.id = "review-write-box";
    if (editing && String(mine.hostReply || "").trim()) {
      box.appendChild(El("div", { className: "mt-3 pl-4 border-l-2 border-orange-200 bg-orange-50/50 rounded-r-lg p-3" }, [
        El("span", { className: "text-xs font-bold text-orange-700 uppercase tracking-wide", textContent: "Host Reply" }),
        El("p", { className: "text-sm text-slate-700 break-words mt-1", textContent: String(mine.hostReply || "") })
      ]));
    }

    const prev = document.getElementById("review-write-box");
    if (prev) prev.remove();
    reviewsList.parentNode.insertBefore(box, reviewsList);
    if (reviewsList.children.length === 0) {
      reviewsList.appendChild(El("p", { className: "text-sm text-slate-500", textContent: "No reviews yet." }));
    }
    reviewsSection.classList.remove("hidden");
    if (String(location.hash || "") === "#reviews-section") {
      setTimeout(function () { try { reviewsSection.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_scrollErr) { void _scrollErr; } }, 60);
    }
  }

  async function loadReviews() {
    if (!reviewsSection || !reviewsList) return;
    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/reviews", { method: "GET" });
      const data = await res.json().catch(() => null);
      const list = (data && Array.isArray(data.data)) ? data.data : (Array.isArray(data) ? data : []);
      if (!res.ok || list.length === 0) return;

      // Owner 2026-05-27: show the TOP 5 reviews, default HIGHEST-rated first, with a
      // sort control to flip to LOWEST-rated first so critical reviews stay reachable.
      // Ties broken by most-recent. Featured review (below) = the single highest-rated.
      const REVIEW_LIMIT = 5;
      const sortControl = document.getElementById("reviews-sort");
      const moreNote = document.getElementById("reviews-more-note");
      function ratingOf(r) { return Math.max(0, Math.min(5, parseInt(r && r.rating, 10) || 0)); }
      function dateMsOf(r) { var t = (r && r.date) ? new Date(r.date).getTime() : 0; return isFinite(t) ? t : 0; }
      function sortedReviews(direction) {
        var dir = (direction === "lowest") ? 1 : -1; // highest-first by default
        return list.slice().sort(function (a, b) {
          var byRating = (ratingOf(a) - ratingOf(b)) * dir;
          return byRating !== 0 ? byRating : (dateMsOf(b) - dateMsOf(a));
        });
      }
      function renderReviews() {
        var direction = sortControl ? String(sortControl.value || "highest") : "highest";
        reviewsList.textContent = "";
        sortedReviews(direction).slice(0, REVIEW_LIMIT).forEach(function (r) {
          reviewsList.appendChild(buildReviewCard(r));
        });
        if (moreNote) {
          if (list.length > REVIEW_LIMIT) {
            moreNote.textContent = "Showing " + REVIEW_LIMIT + " of " + list.length + " reviews.";
            moreNote.classList.remove("hidden");
          } else {
            moreNote.classList.add("hidden");
          }
        }
      }
      renderReviews();
      if (sortControl && !sortControl.__tstsWired) {
        sortControl.__tstsWired = true;
        sortControl.addEventListener("change", renderReviews);
      }

      reviewsSection.classList.remove("hidden");
    } catch (_revErr) { void _revErr; /* reviews are best-effort */ }
  }

  async function loadSimilar() {
    if (!similarGrid || !similarSection) return;
    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/similar", { method: "GET" });
      const data = await res.json().catch(() => null);
      const list = (data && Array.isArray(data.data)) ? data.data : (Array.isArray(data) ? data : []);
      if (!res.ok || list.length === 0) return;

      // Full Explore-card parity (owner 2026-05-26): render each similar experience
      // through the SHARED window.tstsRenderExperienceCard (common.js) — the exact
      // same rich card the Explore grid uses. The /similar endpoint now returns the
      // matching rich shape (host + verified, rating, next occurrence, recommended
      // reason, available seats, isBookmarked), so every row populates like Explore.
      similarGrid.textContent = "";
      list.slice(0, 3).forEach(function (e, i) {
        var node = window.tstsRenderExperienceCard ? window.tstsRenderExperienceCard(e, { idx: i }) : null;
        if (node) similarGrid.appendChild(node);
      });

      similarSection.classList.remove("hidden");
    } catch (_simErr) { void _simErr; /* similar list is best-effort */ }
  }

  if (guestInput) {
    guestInput.addEventListener("change", () => {
      if (bookingMode === "private") {
        lastPrivateGuestCount = String(guestInput.value || "1");
        updateDisplayedPrice();
        // R6 (2026-05-30): the applied promo's discount preview was computed
        // against the OLD guest count; clear it so the user must re-apply (the
        // server reuses the same code, just recomputes against the new total).
        if (__appliedPromo) removeAppliedPromoCode();
        refreshPendingFieldsUI();
        return;
      }
      lastSharedGuestCount = String(guestInput.value || "1");
      updateDisplayedPrice();
      if (__appliedPromo) removeAppliedPromoCode();
      refreshPendingFieldsUI();
    });
  }
  // R9 (2026-05-30): T&S checkbox + date/slot change → live-refresh "!" markers.
  if (termsBox) termsBox.addEventListener("change", refreshPendingFieldsUI);
  if (dateInput) dateInput.addEventListener("change", refreshPendingFieldsUI);
  if (timeSlotInput) timeSlotInput.addEventListener("change", refreshPendingFieldsUI);
  // Initial paint on page load (covers the default-empty state).
  try { refreshPendingFieldsUI(); } catch (_e) { void _e; }

  // Owner 2026-05-30 (R6): Apply / Remove button + Enter key + typing-clears-applied.
  if (promoApplyBtn) {
    promoApplyBtn.addEventListener("click", function () {
      if (__appliedPromo) removeAppliedPromoCode();
      else void applyPromoCode();
    });
  }
  if (promoCodeInput) {
    promoCodeInput.addEventListener("keydown", function (ev) {
      if (ev && ev.key === "Enter") {
        ev.preventDefault();
        if (__appliedPromo) removeAppliedPromoCode();
        else void applyPromoCode();
      }
    });
    promoCodeInput.addEventListener("input", function () {
      // User edited the code — if an applied state still exists from a prior
      // value, drop it so they have to re-apply with the new text.
      if (__appliedPromo) removeAppliedPromoCode();
    });
  }

  if (bookingModeSharedBtn) {
    bookingModeSharedBtn.addEventListener("click", () => setBookingMode("shared"));
  }

  if (bookingModePrivateBtn) {
    bookingModePrivateBtn.addEventListener("click", () => {
      // Owner 2026-06-03: allow Private when instant private OR request mode is available.
      if (!(privateBookingEnabled || privateRequestMode)) {
        window.tstsNotify("This experience is available for shared bookings only.", "warning");
        return;
      }
      setBookingMode("private");
    });
  }

  refreshBookingModeUI();

  // Owner 2026-05-30 (R9): per-field "!" pending markers + scroll-to-first-pending
  // on Reserve click. Reserve button stays enabled; clicking it while any required
  // field is missing scrolls the first pending field into view + focuses it.
  function refreshPendingFieldsUI() {
    const pending = collectPendingFields();
    const ids = ["date", "guests", "time", "terms"];
    ids.forEach(function (key) {
      const markers = document.querySelectorAll('[data-pending-marker="' + key + '"]');
      const isPending = pending.indexOf(key) !== -1;
      markers.forEach(function (el) {
        if (isPending) el.classList.remove("hidden");
        else el.classList.add("hidden");
      });
    });
  }
  function collectPendingFields() {
    const out = [];
    const dateVal = readSelectedBookingDate();
    if (!dateVal) out.push("date");
    const slotVal = String((timeSlotInput && timeSlotInput.value) || "").trim();
    if (!slotVal) out.push("time");
    const guestVal = String((guestInput && guestInput.value) || "").trim();
    if (!guestVal || guestVal === "0") out.push("guests");
    if (termsBox && !termsBox.checked) out.push("terms");
    return out;
  }
  function scrollToFirstPendingField() {
    const pending = collectPendingFields();
    if (pending.length === 0) return false;
    const focusMap = {
      date: function () { return document.getElementById("booking-date") || document.querySelector('input[id*="booking-date"]'); },
      time: function () { return document.getElementById("time-slot"); },
      guests: function () { return document.getElementById("guest-count"); },
      terms: function () { return document.getElementById("booking-terms"); }
    };
    const getEl = focusMap[pending[0]];
    const el = getEl ? getEl() : null;
    if (!el) return true;
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_e) { void _e; }
    setTimeout(function () { try { el.focus(); } catch (_e2) { void _e2; } }, 220);
    return true;
  }

  if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      // W7 STRAY-46: the booking route records this step itself (grep __trackEvent
      // "booking:start"), so the page's own copy counted every start twice. Removed, as on the app.

      // R9 (2026-05-30): show "!" markers + scroll/focus the first pending
      // field. Reserve stays enabled; the page tells sir exactly what's missing
      // by surfacing the marker AND moving focus to the unfilled control.
      refreshPendingFieldsUI();
      if (scrollToFirstPendingField()) {
        const pending = collectPendingFields();
        const labelMap = { date: "date", time: "time slot", guests: "guests", terms: "the policy checkbox" };
        const first = pending[0];
        window.tstsNotify("Please pick " + (labelMap[first] || first) + " to continue.", "warning");
        return;
      }

      if (termsBox && !termsBox.checked) {
        window.tstsNotify("Please accept the cancellation policy.", "warning");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        const policyVer = activePolicyVersion || (await loadPolicyVersion());
        if (!policyVer) {
          window.tstsNotify("Unable to load policy. Please try again.", "error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const isPrivateBooking = bookingMode === "private";
        // Owner 2026-06-03: on the Private side of a REQUEST listing, this is a 24h
        // authorization-HOLD request → dispatch to /api/private-booking-requests, NOT
        // the instant /book endpoint. postPrivateRequest handles the redirect.
        if (isPrivateBooking && privateRequestMode) {
          await postPrivateRequest();
          return;
        }
        if (isPrivateBooking && !privateBookingEnabled) {
          window.tstsNotify("This experience is available for shared bookings only.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const numGuests = isPrivateBooking
          ? Math.max(1, Number((guestInput && guestInput.value) || 1))
          : Number((guestInput && guestInput.value) || 1);
        const timeSlot = String((timeSlotInput && timeSlotInput.value) || "").trim();
        const bookingDate = readSelectedBookingDate();
        const promoCode = promoCodeInput ? String(promoCodeInput.value || "").trim().toUpperCase() : "";
        if (promoCodeInput) promoCodeInput.value = promoCode;

        if (!bookingDate) {
          window.tstsNotify("Please select a date.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (!timeSlot) {
          window.tstsNotify("Please select a time slot.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // Repeat booking confirmation, if user already has seats for this occurrence
        if (_mySeatsLoaded && _userExistingSeats > 0 && !isPrivateBooking) {
          var _confirmMsg = "You already have " + String(_userExistingSeats) + " spot" + (_userExistingSeats === 1 ? "" : "s") + " booked for this session. Book " + String(numGuests) + " more?";
          var _confirmed = window.tstsConfirm ? await window.tstsConfirm(_confirmMsg) : confirm(_confirmMsg);
          if (!_confirmed) {
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }

        const bookingPayload = {
          bookingDate: bookingDate,
          timeSlot: timeSlot,
          numGuests: numGuests,
          isPrivate: isPrivateBooking,
          promoCode: promoCode,
          policyVersionAccepted: policyVer,
          termsVersionAccepted: TERMS_VERSION
        };
        if (inviteToken && inviteToken.length === 48) bookingPayload.inviteToken = inviteToken;

        var __bookIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey(submitBtn) : "";
        async function submitBookingOnce() {
          return af(`/api/experiences/${experienceId}/book`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookingPayload),
            idempotencyKey: __bookIdemKey
          });
        }

        let res = await submitBookingOnce();
        if (res.status === 401) {
          const sessionStillValid = await isAuthed({ strict: true });
          if (sessionStillValid) {
            res = await submitBookingOnce();
          }
        }

        if (res.status === 401) {
          try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
          return redirectToLogin();
        }
        if (res.status === 403) {
          const denied = await res.json().catch(() => ({}));
          const deniedMsg = (denied && denied.message)
            ? String(denied.message)
            : "You cannot book this experience.";
          window.tstsNotify(deniedMsg, "error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const bookRaw = await res.json().catch(() => ({}));
        const data = (bookRaw && bookRaw.data) ? bookRaw.data : bookRaw;

        if (!res.ok) {
          let msg = (data && data.message) ? String(data.message) : ((bookRaw && bookRaw.message) ? String(bookRaw.message) : "Booking failed");
          // Owner 2026-07-23 (sir): shortfall listings not yet host-confirmed + funded
          // are "Not yet open for booking". Never surface the internal funding-stage
          // wording to a guest — map every SHORTFALL_* gate code to one clean line.
          var __bookErrCode = String((data && data.error) || (bookRaw && bookRaw.error) || "");
          if (__bookErrCode.indexOf("SHORTFALL_") === 0) {
            msg = "This experience isn't open for booking yet. The host is still finalising it. Please check back soon.";
          }
          if (isPrivateBooking && data && data.nextPrivateAvailable && data.nextPrivateAvailable.bookingDate && data.nextPrivateAvailable.timeSlot) {
            msg += " Next available private slot: " + fmtDate(data.nextPrivateAvailable.bookingDate) + " (" + String(data.nextPrivateAvailable.timeSlot) + ").";
          }
          // R14 (2026-05-30): persistent inline error block, NOT just the 5-sec
          // corner toast. User sees what went wrong in the same place they
          // clicked Reserve + can copy the rid (request ID) for support.
          const rid = String((bookRaw && bookRaw.rid) || (data && data.rid) || "").trim();
          showBookingErrorBlock(msg, rid);
          // Keep the toast too — accessibility + immediate signal, but the
          // inline block is the source of truth that persists.
          window.tstsNotify(msg, "error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        if (data && data.url) {
          // Validate redirect URL, only allow same-origin or Stripe checkout
          var _rUrl = String(data.url || "").trim();
          try {
            var _rParsed = new URL(_rUrl);
            var _isSameOrigin = _rParsed.origin === window.location.origin;
            var _isStripe = _rParsed.hostname === "checkout.stripe.com";
            // Owner 2026-06-11: allow the LOCAL Stripe-sim checkout URL (localhost:4000/__sim/stripe/…)
            // — same allowance the hold flow already has (line ~1210). Without this, a normal booking's
            // sim checkout URL fails the origin/Stripe check and falls back to a PARAMLESS success.html
            // (the "Missing booking information" error). Production is unaffected (prod url = checkout.stripe.com).
            var _isSim = _rParsed.pathname.indexOf("/__sim/stripe/") === 0 || (_rParsed.hostname === "localhost" && (_rParsed.port === "4000" || _rParsed.port === "3000"));
            if (!_isSameOrigin && !_isStripe && !_isSim) {
              _rUrl = "success.html";
            }
          } catch (_) {
            // relative URL or parse failure, allow relative, block absolute
            if (/^https?:\/\//i.test(_rUrl) || /^\/\//i.test(_rUrl)) {
              _rUrl = "success.html";
            }
          }
          location.href = _rUrl;
        } else {
          location.href = "success.html";
        }
      } catch (_netOrParseErr) {
        // R14 (2026-05-30): network failure, JSON parse error, or any other
        // unexpected throw inside the booking flow. Surface inline so user
        // sees something concrete; void underscore explicitly so the empty-
        // catch lint doesn't fire.
        void _netOrParseErr;
        showBookingErrorBlock("Couldn't connect. Please check your network and try again.", "");
        window.tstsNotify("Booking failed", "error");
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // R14 (2026-05-30): unhide + populate the persistent error block below
  // the Reserve button. The corner toast is still fired separately — the
  // block is the source-of-truth the user can come back to.
  function showBookingErrorBlock(msg, rid) {
    const block = document.getElementById("booking-error-block");
    const msgEl = document.getElementById("booking-error-msg");
    const ridWrap = document.getElementById("booking-error-rid");
    if (msgEl) msgEl.textContent = String(msg || "Booking failed");
    if (ridWrap) {
      const ridSpan = ridWrap.querySelector("span");
      if (rid && ridSpan) {
        ridSpan.textContent = rid;
        ridWrap.classList.remove("hidden");
      } else {
        if (ridSpan) ridSpan.textContent = "";
        ridWrap.classList.add("hidden");
      }
    }
    if (block) block.classList.remove("hidden");
  }
  function hideBookingErrorBlock() {
    const block = document.getElementById("booking-error-block");
    if (block) block.classList.add("hidden");
  }
  // Wire the dismiss button + auto-hide on any field change so the block
  // clears when the user starts adjusting the booking instead of lingering.
  (function wireBookingErrorBlockBehavior() {
    const dismissBtn = document.getElementById("booking-error-dismiss");
    if (dismissBtn) dismissBtn.addEventListener("click", hideBookingErrorBlock);
    [dateInput, bookingDateSelect, timeSlotInput, guestInput, termsBox, promoCodeInput].forEach(function (el) {
      if (!el) return;
      el.addEventListener("change", hideBookingErrorBlock);
    });
  })();


  // --- Invite banner handling ---
  async function handleInviteBanner() {
    if (!inviteToken || inviteToken.length !== 48 || !/^[0-9a-f]+$/i.test(inviteToken)) return;
    try {
      const res = await af("/api/invites/" + encodeURIComponent(inviteToken), { method: "GET" });
      if (!res.ok) return;
      const raw = await res.json().catch(function () { return {}; });
      const d = (raw && raw.data) ? raw.data : raw;
      const viewer = (d && d.viewer) ? d.viewer : {};
      const inviter = (d && d.inviter) ? d.inviter : {};
      const inviterName = String(inviter.name || "Someone");
      // GF-10/GF-8 (sir's fix-all order 2026-08-20): a PAID_SEAT invite is a pre-paid GIFT.
      // The banner must say so and lead to the free claim — never to the pay panel.
      const isPaidGift = String((d && d.invite && d.invite.mode) || "") === "PAID_SEAT";

      // Remove any existing invite banner
      var existingBanner = document.getElementById("tsts-invite-banner");
      if (existingBanner) existingBanner.remove();

      // Don't show banner if already claimed or viewer is inviter
      if (viewer.alreadyClaimed || viewer.isInviter) return;

      var banner = document.createElement("div");
      banner.id = "tsts-invite-banner";
      banner.className = "bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3";

      if (viewer.isBlocked) {
        // Blocked variant
        var msgEl = window.tstsEl("span", { className: "text-tsts-ink text-sm flex-1" }, "You have received an invitation from " + inviterName + ", do you wish to proceed?");
        banner.appendChild(msgEl);

        var btnWrap = document.createElement("div");
        btnWrap.className = "flex gap-2 flex-shrink-0";

        var unblockBtn = document.createElement("button");
        unblockBtn.className = "bg-tsts-ink text-white text-sm px-4 py-2 rounded-full hover:opacity-90 transition";
        unblockBtn.textContent = "Unblock & Accept";
        unblockBtn.addEventListener("click", async function () {
          unblockBtn.disabled = true;
          try {
            // Unblock first
            await af("/api/social/block/" + encodeURIComponent(String(inviter.userId)), { method: "DELETE" });
            // Then accept
            var accRes = await af("/api/invites/" + encodeURIComponent(inviteToken) + "/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            if (accRes.ok) {
              window.tstsNotify("Invite accepted! You and " + inviterName + " are now connected.", "success");
              banner.remove();
            } else {
              var errData = await accRes.json().catch(function () { return {}; });
              window.tstsNotify(__inviteErrorCopy(errData && errData.error), "error");
              unblockBtn.disabled = false;
            }
          } catch (_) {
            window.tstsNotify("We couldn't reach the server just now. Please check your connection and try again.", "error");
            unblockBtn.disabled = false;
          }
        });

        var dismissBtn = document.createElement("button");
        dismissBtn.className = "text-tsts-ink text-sm px-4 py-2 rounded-full border border-tsts-ink hover:bg-tsts-ink hover:text-white transition";
        dismissBtn.textContent = "Dismiss";
        dismissBtn.addEventListener("click", function () { banner.remove(); });

        btnWrap.appendChild(unblockBtn);
        btnWrap.appendChild(dismissBtn);
        banner.appendChild(btnWrap);
      } else if (viewer.canAccept && isPaidGift) {
        // GF-10: gifted-seat variant — the seat is already paid; the only right action is the
        // free claim (POST /claim-gift). The old Accept & Book path left the receiver on the
        // pay panel, one click from paying for a seat that was already covered.
        var msgGift = window.tstsEl("span", { className: "text-tsts-ink text-sm flex-1" }, inviterName + " has gifted you a seat here. It's already paid, so there's nothing for you to pay.");
        banner.appendChild(msgGift);

        var claimBtn = document.createElement("button");
        claimBtn.className = "bg-tsts-ink text-white text-sm px-5 py-2 rounded-full hover:opacity-90 transition flex-shrink-0";
        claimBtn.textContent = "Claim your free seat";
        claimBtn.addEventListener("click", async function () {
          claimBtn.disabled = true;
          claimBtn.textContent = "Claiming…";
          try {
            var claimRes = await af("/api/invites/" + encodeURIComponent(inviteToken) + "/claim-gift", { method: "POST" });
            if (claimRes.ok) {
              if (window.tstsNotify) window.tstsNotify("Seat confirmed. Find it in Upcoming Experiences!", "success");
              claimBtn.textContent = "Seat claimed ✓";
              setTimeout(function () { window.location.href = "my-bookings.html?tab=experiences&sub=upcoming"; }, 1200);
            } else {
              var claimErr = await claimRes.json().catch(function (_jsonErr) { void _jsonErr; return null; });
              if (window.tstsNotify) window.tstsNotify((claimErr && claimErr.message) || "We couldn't claim this seat. Please try again.", "error");
              claimBtn.disabled = false;
              claimBtn.textContent = "Claim your free seat";
            }
          } catch (_claimNetErr) {
            void _claimNetErr;
            if (window.tstsNotify) window.tstsNotify("We couldn't reach the server just now. Please check your connection and try again.", "error");
            claimBtn.disabled = false;
            claimBtn.textContent = "Claim your free seat";
          }
        });
        banner.appendChild(claimBtn);
      } else if (viewer.canAccept) {
        // Normal accept variant
        var msgEl2 = window.tstsEl("span", { className: "text-tsts-ink text-sm flex-1" }, inviterName + " would love for you to join this experience.");
        banner.appendChild(msgEl2);

        var acceptBtn = document.createElement("button");
        acceptBtn.className = "bg-tsts-ink text-white text-sm px-5 py-2 rounded-full hover:opacity-90 transition flex-shrink-0";
        acceptBtn.textContent = "Accept & Book";
        acceptBtn.addEventListener("click", async function () {
          acceptBtn.disabled = true;
          try {
            var accRes2 = await af("/api/invites/" + encodeURIComponent(inviteToken) + "/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            if (accRes2.ok) {
              window.tstsNotify("Invite accepted! You and " + inviterName + " are now connected.", "success");
              banner.remove();
              // Pre-fill date/time from invite if available
              var invData = (d && d.invite) ? d.invite : {};
              if (invData.bookingDate && dateInput) dateInput.value = invData.bookingDate;
              if (invData.timeSlot && timeSlotInput) timeSlotInput.value = invData.timeSlot;
            } else {
              var errData2 = await accRes2.json().catch(function () { return {}; });
              window.tstsNotify(__inviteErrorCopy(errData2 && errData2.error), "error");
              acceptBtn.disabled = false;
            }
          } catch (_) {
            window.tstsNotify("We couldn't reach the server just now. Please check your connection and try again.", "error");
            acceptBtn.disabled = false;
          }
        });
        banner.appendChild(acceptBtn);
      } else if (!viewer.isAuthenticated) {
        // Not logged in, prompt login. GF-8: a paid gift says so — the reader may be brand
        // new, so the line covers signing up too (the login page carries both tabs).
        var anonText = isPaidGift
          ? (inviterName + " has gifted you a seat here. It's already paid, so there's nothing for you to pay. Log in, or create your free account, to claim it.")
          : "You have been invited to this experience. Log in to accept.";
        var msgEl3 = window.tstsEl("span", { className: "text-tsts-ink text-sm flex-1" }, anonText);
        banner.appendChild(msgEl3);

        var loginBtn = document.createElement("button");
        loginBtn.className = "bg-tsts-ink text-white text-sm px-5 py-2 rounded-full hover:opacity-90 transition flex-shrink-0";
        loginBtn.textContent = "Log In";
        loginBtn.addEventListener("click", function () { redirectToLogin(); });
        banner.appendChild(loginBtn);
      } else {
        return; // No actionable state
      }

      // Insert banner at top of main content
      var mainContent = document.getElementById("experience-detail") || document.querySelector("main") || document.body;
      if (mainContent.firstChild) {
        mainContent.insertBefore(banner, mainContent.firstChild);
      } else {
        mainContent.appendChild(banner);
      }
    } catch (_) {
      // Silent fail, invite banner is enhancement, not critical
    }
  }

  // Mobile sticky booking bar
  function initMobileBookingBar() {
    var bar = document.getElementById("mobile-booking-bar");
    var barPrice = document.getElementById("mobile-bar-price");
    var barCta = document.getElementById("mobile-bar-cta");
    var bookingForm = document.getElementById("booking-form");
    if (!bar || !bookingForm) return;

    // sir's order O-146, "nroever for booking". A preview has no booking form on screen, and this bar's
    // whole job is to offer the booking form to somebody who has scrolled past it. Offering it here
    // would put "Reserve your seat" over a table nobody can book, on the phone, which is exactly the
    // thing the order forbids. The bar stays down and the observer is never started.
    if (pageIsPreview) {
      bar.style.display = "none";
      return;
    }

    // R11 (2026-05-30): price text is now driven by updateDisplayedPrice() →
    // syncMobileBookingBar() so it stays in lockstep with the desktop Total
    // line (per-guest × N, or private total, with coupon when applied). The
    // old one-shot "<unit> per guest" write was removed — it never updated.
    if (barPrice && sharedUnitPrice) {
      try {
        syncMobileBookingBar({
          totalAmount: Number(sharedUnitPrice) || 0,
          currency: sharedUnitCurrency,
          breakdown: "1 guest"
        });
      } catch (_e) { void _e; }
    }

    // Scroll to booking form on CTA click
    if (barCta) barCta.addEventListener("click", function() {
      bookingForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Show/hide bar based on booking form visibility
    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var notFound = document.getElementById("experience-not-found");
          var isNotFoundVisible = notFound && !notFound.classList.contains("hidden");
          // sir's go-ahead 2026-08-18 (audit gap): writing "flex" inline defeated md:hidden and
          // floated the mobile bar over the DESKTOP footer. Empty string lets the classes govern:
          // .flex shows it on mobile, md:hidden keeps desktop clean. Mobile behaviour unchanged.
          bar.style.display = (entry.isIntersecting || isNotFoundVisible) ? "none" : "";
        });
      }, { threshold: 0.1 });
      observer.observe(bookingForm);
    } else {
      // Fallback for old browsers: let the classes decide (mobile shows, desktop stays hidden)
      bar.style.display = "";
    }
  }

  // sir's order 2026-08-22: clicking the cancellation policy opens the snapshot pop-up instead of
  // navigating away mid-booking. Delegated so it catches BOTH links that say it — the R7 amber
  // card's "Cancellation & Refund Policy" and the consent row's "Cancellation Policy" — without
  // editing either one's markup or a word of sir's locked R7 copy.
  // Ctrl/Cmd/middle-click still opens the page in a new tab, so nothing is taken away from anyone
  // who wants the standalone page.
  document.addEventListener("click", function (ev) {
    if (!ev || ev.defaultPrevented) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button === 1) return;
    const link = ev.target && ev.target.closest ? ev.target.closest("a[href*='refund-policy.html']") : null;
    if (!link) return;
    // Only inside the booking panel — the footer's policy links keep taking people to the page.
    if (!link.closest("#booking-policy-hint, #booking-terms-block")) return;
    ev.preventDefault();
    __openRefundSnapshot();
  });

  loadExperience().then(function () {
    handleInviteBanner();
    initMobileBookingBar();
  }).catch(() => {
    showNotFound("We could not load this experience right now. Please try again.");
  });
})();
