// tsts-scroll-top-guard (global)
// Purpose: prevent Safari/Back-Forward Cache scroll restoration landing mid-page.
(function(){
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    function reset(e){
      if (location.hash) return;
      if (e && e.persisted) { window.scrollTo(0, 0); return; }
      window.scrollTo(0, 0);
    }

    window.addEventListener("DOMContentLoaded", reset);
    window.addEventListener("pageshow", reset);
  } catch (_) {}
})();

/* ================================
   TSTS COMMON (single truth)
   - API base
   - auth helpers
   - navbar/footer injection
   - DOM XSS-safe helpers
   ================================ */

// WS-FE-05: Helper version marker for reliable validation
window.__TSTS_HELPERS_VERSION__ = "2026.01.19";

// XSS-safe DOM helpers
window.tstsSetText = function(el, value) {
  if (!el) return;
  el.textContent = (value == null) ? "" : String(value);
};

window.tstsEl = function(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(key) {
      const v = attrs[key];
      const isDev = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
      function blocked(k) {
        if (isDev) throw new Error("Blocked unsafe attribute: " + k);
        return;
      }

      if (key === "innerHTML" || key === "outerHTML" || key === "srcdoc") {
        blocked(key);
        return;
      }

      if (key === "className") {
        el.className = v;
      } else if (key === "textContent") {
        el.textContent = v;
      } else if (key === "dataset") {
        if (v == null) return;
        if (typeof v !== "object" || Array.isArray(v)) {
          blocked("dataset");
          return;
        }
        Object.keys(v).forEach(function(dk) {
          try {
            if (v[dk] == null) return;
            el.dataset[dk] = String(v[dk]);
          } catch (_) {}
        });
      } else if (key === "style") {
        if (v == null) return;
        if (typeof v !== "object" || Array.isArray(v)) {
          blocked("style");
          return;
        }
        Object.keys(v).forEach(function(sk) {
          try {
            if (v[sk] == null) return;
            el.style[sk] = String(v[sk]);
          } catch (_) {}
        });
      } else if (key.startsWith("on")) {
        if (typeof v === "function") {
          el.addEventListener(key.slice(2).toLowerCase(), v);
        } else if (typeof v === "string") {
          blocked(key);
        }
      } else if (key.startsWith("data-") || key.startsWith("aria-")) {
        // aria-* must be set as real attributes — el[key]=v creates a dead JS
        // property that never reflects to the DOM, so states like aria-pressed vanish.
        el.setAttribute(key, v);
      } else {
        if (typeof v === "function") return;
        try { el[key] = v; } catch (_) {}
      }
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(function(child) {
      if (child == null) return;
      if (typeof child === "string" || typeof child === "number") {
        el.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
  }
  return el;
};

// ── PLUS / MINUS EXPAND-COLLAPSE MARK ────────────────────────────────────────
// ONE shared control for every expand/collapse toggle on the site.
//
// sir 2026-08-08: "why do i see plus and minu sign bottom aligned instead of proper center
// aligned with right margin" — then, when I fixed only the one he was looking at:
// "this is applicable to entire site whereever there is plus minus expand collpas".
//
// WHY IT KEPT DRIFTING BACK: "+" and "−" were TEXT. A glyph sits on a baseline inside a line box
// that reserves ascender and descender space the mark itself never occupies — so centring the BOX
// leaves the MARK off-centre, by a DIFFERENT amount for each character, each font size and each
// font. That is why the dash sat low while the cross looked fine, and why a per-glyph translateY
// nudge held at one size and broke at the next. A nudge cannot fix this; only losing the baseline
// can.
//
// An SVG's box IS its ink. Two bars centred in the viewBox are centred on screen — every size,
// every font, with no per-call correction. The design does not change: the mark is 1em so the
// existing text-base / text-lg / text-xl class still governs its scale, and the stroke is
// currentColor so text-slate-500 / text-gray-600 / text-orange-700 still governs its colour.
// Only the drawing method changes.
window.tstsPlusMinus = function (expanded, opts) {
  var o = opts || {};
  var NS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.width = "1em";
  svg.style.height = "1em";
  svg.style.display = "block";      // kills the inline baseline gap beneath the box
  svg.style.flex = "0 0 auto";      // never squashed by a flex parent
  function bar(d) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", String(o.stroke == null ? 2 : o.stroke));
    p.setAttribute("stroke-linecap", "round");
    return p;
  }
  var stem = bar("M8 4 V12");
  stem.setAttribute("data-pm-stem", "1");
  svg.appendChild(bar("M4 8 H12"));  // crossbar — always drawn, never moves
  svg.appendChild(stem);             // upright — hidden when expanded, leaving a minus
  window.tstsSetPlusMinus(svg, expanded);
  return svg;
};

// Flip an existing mark between plus (collapsed) and minus (expanded).
// Only the upright is hidden — the crossbar is the SAME path in both states, so the mark cannot
// shift by a pixel when the state changes. That was the other half of what sir was seeing: two
// different characters were being swapped in, so the sign moved as it opened and closed.
window.tstsSetPlusMinus = function (svg, expanded) {
  if (!svg || !svg.querySelector) return;
  var stem = svg.querySelector("[data-pm-stem]");
  if (stem) stem.style.display = expanded ? "none" : "";
};

// Owner 2026-05-30 (date-picker consolidation, R3 pilot): single Flatpickr wrapper
// used SITE-WIDE so every date input — experience.html booking date, explore search
// + filter, host create (start/end), check-in, admin legal-effective — uses one
// look, one a11y behaviour, one mobile fallback, one keyboard story. Callers pass
// only the per-input bits (enable / minDate / maxDate / mode / enableTime); brand
// defaults below stay locked. Self-hosted Flatpickr 4.6.13 at /vendor/flatpickr/
// (CSP is script-src 'self', so no CDN). Returns the flatpickr instance for
// programmatic .setDate()/.destroy(), or null if Flatpickr isn't loaded yet.
window.tstsDatePicker = function (input, opts) {
  if (!input) return null;
  if (typeof window.flatpickr !== "function") return null;
  var defaults = {
    altInput: true,                     // hides the ISO input, shows a human-readable one
    altFormat: "D j M Y",               // "Sat 6 Jun 2026"
    dateFormat: "Y-m-d",                // ISO under the hood for the JS pipeline
    minDate: "today",
    monthSelectorType: "static",
    // Owner 2026-05-30: keep Flatpickr's default SVG prev/next arrows. Don't substitute
    // Font Awesome <i> chevrons — FA may not be loaded at picker init time, and the
    // FA glyphs don't inherit the brand colour mapping (the CSS overrides target
    // svg children, not <i>). The defaults render reliably and are styled in
    // experience.html's brand override block.
    locale: { firstDayOfWeek: 1 },      // Monday-start (Australian convention)
    disableMobile: false                // use native iOS/Android picker on phones (better UX)
  };
  // Owner-locked brand defaults must always win over caller; per-input opts merge on top.
  var merged = Object.assign({}, defaults, (opts && typeof opts === "object") ? opts : {});
  try { return window.flatpickr(input, merged); } catch (_e) { void _e; return null; }
};

// ── window.tstsCopyText — sir's decision O-94 (gap 12) ────────────────────────────────────────
// ONE copy routine for every Copy button on the platform, honest at each step:
//   1. the browser's clipboard is asked first;
//   2. when it refuses, or the browser has none, the older selection copy runs (a temporary
//      off-screen field, selected, and the document asked to copy the selection);
//   3. when both refuse, the person is told in plain words and the text is left SELECTED so
//      they can take it themselves.
// opts.selectEl names the field on screen that already holds the text. When nothing on screen
// holds it, the text is selected in an off-screen field as a last resort and the sentence says
// so, carrying the text itself so it can still be copied by hand.
// Resolves TRUE only when the text really reached the clipboard, so no caller can say "Copied"
// over a refusal.
window.tstsCopyText = function (text, opts) {
  var o = (opts && typeof opts === "object") ? opts : {};
  var value = String(text == null ? "" : text);
  if (!value) return Promise.resolve(false);

  function announce(message) {
    if (typeof window.tstsToast === "function") window.tstsToast({ type: "error", message: message });
    else if (typeof window.tstsNotify === "function") window.tstsNotify(message, "error");
  }

  // On screen means the person can actually see it and select from it.
  function isOnScreen(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!el.ownerDocument || !el.ownerDocument.body || !el.ownerDocument.body.contains(el)) return false;
    if (el.hidden === true) return false;
    if (String(el.type || "").toLowerCase() === "hidden") return false;
    if (typeof el.closest === "function" && el.closest("[hidden], .hidden")) return false;
    try {
      var view = el.ownerDocument.defaultView;
      var st = (view && view.getComputedStyle) ? view.getComputedStyle(el) : null;
      if (st && (st.display === "none" || st.visibility === "hidden")) return false;
    } catch (_styleErr) { void _styleErr; }
    return true;
  }

  // Leave the text highlighted, whether it sits in a field or in plain page text.
  function selectIn(el) {
    try {
      if (el && typeof el.select === "function" && typeof el.value === "string") {
        el.focus();
        el.select();
        if (typeof el.setSelectionRange === "function") el.setSelectionRange(0, el.value.length);
        return true;
      }
      var doc = (el && el.ownerDocument) || document;
      var view = doc.defaultView || window;
      if (el && doc.createRange && view.getSelection) {
        var range = doc.createRange();
        range.selectNodeContents(el);
        var sel = view.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
      }
    } catch (_selErr) { void _selErr; }
    return false;
  }

  function offScreenField(id) {
    var field = id ? document.getElementById(id) : null;
    if (!field) {
      field = document.createElement("textarea");
      if (id) field.id = id;
      field.setAttribute("readonly", "readonly");
      field.setAttribute("aria-hidden", "true");
      field.style.position = "fixed";
      field.style.top = "0";
      field.style.left = "-9999px";
      field.style.width = "1px";
      field.style.height = "1px";
      document.body.appendChild(field);
    }
    field.value = value;
    return field;
  }

  // The older selection copy. Returns true only when the document says it copied.
  function copyBySelection() {
    var field = null;
    try {
      if (typeof document.execCommand !== "function") return false;
      field = offScreenField("");
      field.focus();
      field.select();
      return document.execCommand("copy") === true;
    } catch (_execErr) {
      void _execErr;
      return false;
    } finally {
      if (field && field.parentNode) field.parentNode.removeChild(field);
    }
  }

  // Both refused. Say so, hand the text over, and never report a copy.
  function refused() {
    var onScreen = isOnScreen(o.selectEl) ? o.selectEl : null;
    if (onScreen && selectIn(onScreen)) {
      announce("Couldn't copy. Select the code and copy it yourself.");
      return false;
    }
    selectIn(offScreenField("tsts-copy-offscreen-field"));
    announce("Couldn't copy, and there's no field on screen to select from. Here it is to copy by hand: " + value);
    return false;
  }

  var viaClipboard = null;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      viaClipboard = navigator.clipboard.writeText(value);
    }
  } catch (_clipErr) { void _clipErr; viaClipboard = null; }

  if (!viaClipboard || typeof viaClipboard.then !== "function") {
    return Promise.resolve(copyBySelection() ? true : refused());
  }
  return viaClipboard.then(function () {
    return true;
  }, function (_writeErr) {
    void _writeErr;
    return copyBySelection() ? true : refused();
  });
};

// Owner-approved 2026-05-02: native Web Share API helper. Single button per
// surface, opens OS share sheet on mobile (WhatsApp/Messages/etc), falls back
// to clipboard copy on desktop with a toast confirmation.
window.tstsShareExperience = async function(opts) {
  var title = String((opts && opts.title) || "The Shared Table Story");
  var text  = String((opts && opts.text)  || "Found a great experience on The Shared Table Story:");
  var url   = String((opts && opts.url)   || window.location.href);
  var expId = String((opts && opts.experienceId) || "").trim();
  // Share-as-preference (owner-approved 2026-05-26): a successful share is a soft
  // taste signal. Fire-and-forget for logged-in users only; the share UX never
  // blocks or fails on this. De-duped + weighted server-side (below a bookmark).
  function __recordSharePreference() {
    if (!expId || !/^[a-fA-F0-9]{24}$/.test(expId)) return;
    var au = (window.getAuthUser && window.getAuthUser()) || null;
    if (!au || !(au._id || au.id)) return;
    try {
      if (window.authFetch) {
        window.authFetch("/api/share-events/" + encodeURIComponent(expId), { method: "POST" }).catch(function(_e) { void _e; });
      }
    } catch (_e) { void _e; }
  }
  if (navigator.share && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: title, text: text, url: url });
      __recordSharePreference();
      return { ok: true, method: "native" };
    } catch (shareErr) {
      if (shareErr && shareErr.name === "AbortError") return { ok: false, method: "cancelled" };
    }
  }
  // Gap 12 (sir's decision O-94): the share URL goes through the one honest copy routine, which
  // says so itself when the copy is refused. The confirmation below is shown only on a real copy.
  var copied = await window.tstsCopyText(url);
  if (!copied) return { ok: false, method: "refused", error: "The copy was refused." };
  if (window.tstsToast) {
    window.tstsToast({ type: "success", message: "Link copied to clipboard." });
  } else if (window.tstsNotify) {
    window.tstsNotify("Link copied to clipboard.", "success");
  }
  __recordSharePreference();
  return { ok: true, method: "clipboard" };
};

// Bookmark toggle (Like), owner-approved 2026-05-02. Implements the heart button
// on Explore cards. Logged-out users are redirected to login. Logged-in users
// hit POST/DELETE /api/bookmarks/:experienceId. UI state (orange-filled vs
// outlined heart) updates immediately based on the API result.
//
// Like sparkle — radiate a few small orange dots from a heart's centre to give
// satisfying feedback when a user saves an experience. Fixed-position dots so
// nothing clips them; they self-remove after the animation.
// Self-contrasting save-heart styles — owner-approved 2026-05-26. Defined here in
// JS because the equivalent rules belong in icon-font.css (a design-gated file);
// this injection keeps the approved visual in one place and applies on every page
// that loads common.js. Visible on ANY photo: a translucent dark fill (reads on
// light/white) + a white edge stroke (reads on dark) + a soft shadow. Used on a
// solid `fas fa-heart` glyph for both the default and liked states.
(function injectHeartPhotoStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tsts-heart-photo-styles")) return;
  var st = document.createElement("style");
  st.id = "tsts-heart-photo-styles";
  st.textContent =
    ".tsts-heart-photo{color:rgba(17,24,39,0.42);-webkit-text-stroke:2px #ffffff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55));}" +
    // Share/share-style icons are thin glyphs, so they read lighter than the solid heart at the same fill — a touch more opaque so they stay strong on white.
    ".tsts-icon-photo{color:rgba(17,24,39,0.62);-webkit-text-stroke:2px #ffffff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55));}" +
    ".tsts-heart-photo-liked{color:#ea580c;-webkit-text-stroke:2px #ffffff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55));}";
  (document.head || document.documentElement).appendChild(st);
})();

window.tstsHeartSparkle = function (hostEl) {
  if (!hostEl || !hostEl.getBoundingClientRect) return;
  try {
    var r = hostEl.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    // Expanding ring pulse behind the dots.
    var ring = document.createElement("span");
    ring.className = "tsts-sparkle-ring";
    ring.style.left = cx + "px";
    ring.style.top = cy + "px";
    document.body.appendChild(ring);
    ring.addEventListener("animationend", function () { try { ring.remove(); } catch (_) {} }, { once: true });
    var N = 6;
    for (var k = 0; k < N; k++) {
      var s = document.createElement("span");
      s.className = "tsts-sparkle";
      var ang = (Math.PI * 2 * k) / N + (Math.random() * 0.6 - 0.3);
      var dist = 14 + Math.random() * 10;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(1) + "px");
      s.style.setProperty("--dy", (Math.sin(ang) * dist).toFixed(1) + "px");
      document.body.appendChild(s);
      (function (node) {
        node.addEventListener("animationend", function () { try { node.remove(); } catch (_) {} }, { once: true });
      })(s);
    }
  } catch (_e) { void _e; }
};

// Usage: window.tstsToggleBookmark(experienceId, buttonElement?)
//   - experienceId: string MongoDB id
//   - buttonElement (optional): the heart <button> DOM node so the icon flips
//     instantly. If omitted, the function still toggles backend state but the
//     caller is responsible for re-rendering the card.
window.tstsToggleBookmark = async function(experienceId, buttonElement) {
  var expId = String(experienceId || "").trim();
  if (!expId) return { ok: false, error: "MISSING_ID" };

  // Auth gate, if no live session, route to login with return URL.
  // tstsGetSession() returns a PROMISE resolving to {user:{...}} (no top-level
  // .userId), so it cannot be read synchronously here. Use the synchronous cached
  // auth user (the same source the nav avatar uses) to decide if we're signed in.
  var authUser = (window.getAuthUser && window.getAuthUser()) || null;
  if (!authUser || !(authUser._id || authUser.id)) {
    var here = window.location.pathname + window.location.search + window.location.hash;
    try { sessionStorage.setItem("tsts:returnUrl", here); } catch (_storeErr) { void _storeErr; }
    if (window.tstsToast) window.tstsToast({ type: "info", message: "Sign in to save experiences." });
    window.location.href = "login.html?returnTo=" + encodeURIComponent(here);
    return { ok: false, error: "AUTH_REQUIRED" };
  }

  // Determine current state from button visual or aria.
  var iconEl = buttonElement ? buttonElement.querySelector("i") : null;
  var isCurrentlyLiked = false;
  if (buttonElement) {
    isCurrentlyLiked = buttonElement.getAttribute("aria-pressed") === "true";
  }
  var willLike = !isCurrentlyLiked;

  // Optimistic UI flip, owner-approved 2026-05-02 (instant feedback, server
  // confirms in background; on API failure we revert). Self-contrasting save
  // heart (owner-approved 2026-05-26): a solid `fas fa-heart` glyph with the
  // tsts-heart-photo class (translucent dark fill + white edge + soft shadow),
  // swapping to tsts-heart-photo-liked (orange) when saved. No circle backing;
  // visible on any photo. The existing size class is preserved.
  function applyVisual(liked, animate) {
    if (!buttonElement) return;
    buttonElement.setAttribute("aria-pressed", liked ? "true" : "false");
    buttonElement.setAttribute("aria-label", liked ? "Liked" : "Like");
    buttonElement.setAttribute("title", liked ? "Liked" : "Like");
    buttonElement.setAttribute("data-tooltip", liked ? "Liked" : "Like");
    // Defensive: strip any stale white-circle classes from the old design.
    buttonElement.classList.remove("tsts-heart-cutout-btn", "tsts-heart-liked-btn");
    var i = buttonElement.querySelector("i");
    if (!i) { i = document.createElement("i"); buttonElement.appendChild(i); }
    var heartSize = ((i.className || "").match(/text-\d?xl/) || ["text-xl"])[0];
    i.className = (liked ? "fas fa-heart tsts-heart-photo-liked " : "fas fa-heart tsts-heart-photo ") + heartSize;
    if (animate && liked) {
      try { window.tstsHeartSparkle && window.tstsHeartSparkle(buttonElement); } catch (_sparkErr) { void _sparkErr; }
    }
  }
  applyVisual(willLike, true);

  try {
    var endpoint = "/api/bookmarks/" + encodeURIComponent(expId);
    var method = willLike ? "POST" : "DELETE";
    var res = await window.authFetch(endpoint, { method: method });
    if (!res || !res.ok) {
      var status = res ? res.status : 0;
      // 409 on POST when bookmark already exists → treat as success (already liked).
      // 404 on DELETE when bookmark not present → treat as success (already unliked).
      if (!(method === "POST" && status === 409) && !(method === "DELETE" && status === 404)) {
        applyVisual(isCurrentlyLiked);
        if (window.tstsToast) window.tstsToast({ type: "error", message: "Couldn't update Like. Try again." });
        return { ok: false, error: "API_ERROR", status: status };
      }
    }
    if (window.tstsToast) {
      window.tstsToast({ type: "success", message: willLike ? "Added to your liked experiences." : "Removed from liked." });
    }
    return { ok: true, liked: willLike };
  } catch (apiErr) {
    applyVisual(isCurrentlyLiked);
    if (window.tstsToast) window.tstsToast({ type: "error", message: "Network error. Try again." });
    return { ok: false, error: String((apiErr && apiErr.message) || apiErr) };
  }
};

// W1 (web parity, owner-approved 2026-04-30): same relative+casual format
// helper as mobile. Tonight · 6 pm | Tomorrow · 7:30 pm | Fri · 6 pm | Sat 24 May
window.tstsFormatNextOccurrence = function(isoDateTime) {
  if (!isoDateTime) return "";
  try {
    const d = new Date(isoDateTime);
    const tMs = d.getTime();
    if (!isFinite(tMs) || tMs - Date.now() < 0) return "";
    const TZ = "Australia/Melbourne";
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d);
    const todayParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const today = todayParts.find(p => p.type === "year").value + "-" +
                  todayParts.find(p => p.type === "month").value + "-" +
                  todayParts.find(p => p.type === "day").value;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const hourFmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true
    }).format(d);
    const compactTime = hourFmt
      .replace(":00", "")
      .replace(" AM", " am")
      .replace(" PM", " pm");

    if (dateStr === today) return "Tonight · " + compactTime;
    const tp = today.split("-").map(Number);
    const sp = dateStr.split("-").map(Number);
    const todayUtc = Date.UTC(tp[0], tp[1] - 1, tp[2]);
    const targetUtc = Date.UTC(sp[0], sp[1] - 1, sp[2]);
    const dayDiff = Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
    if (dayDiff === 1) return "Tomorrow · " + compactTime;
    if (dayDiff > 1 && tMs - Date.now() <= oneWeekMs) {
      const weekday = new Intl.DateTimeFormat("en-AU", {
        timeZone: TZ, weekday: "short"
      }).format(d);
      return weekday + " · " + compactTime;
    }
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ, weekday: "short", day: "numeric", month: "short"
    }).format(d);
  } catch (_) { return ""; }
};

// ── Shared Experience Card renderer (owner 2026-05-26) ───────────────────────
// SINGLE source of truth for the rich experience card used on the detail page's
// "You Might Also Like" section. Ported byte-faithfully from the frozen Explore
// (P3) card in explore.js so the two render IDENTICALLY. Owner-approved approach:
// the frozen Explore page is LEFT UNTOUCHED and migrates to this shared renderer
// later when P3 is unfrozen; for now this powers the similar section only.
// Returns a DOM node (the card) or null. Caller appends it into the grid cell.
(function () {
  function cloudinaryCardImg(url, w, h) {
    if (!url || url.indexOf("res.cloudinary.com") === -1) return url;
    return url.replace("/upload/", "/upload/c_fill,w_" + w + ",h_" + h + ",f_auto,q_auto/");
  }
  function looksLikeEmailName(v) {
    var s = String(v || "").trim();
    if (!s) return false;
    if (s.length > 254) return false;
    if (/\s/.test(s)) return false;
    var at = s.indexOf("@");
    if (at <= 0 || at !== s.lastIndexOf("@")) return false;
    var local = s.slice(0, at);
    var domain = s.slice(at + 1);
    if (!local || !domain) return false;
    if (local.length > 64 || domain.length < 3 || domain.length > 253) return false;
    if (domain.indexOf(".") < 1) return false;
    if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") || domain.endsWith("-")) return false;
    var tld = domain.split(".").pop() || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) return false;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
    if (!/^[a-z0-9.-]+$/i.test(domain)) return false;
    return true;
  }
  function isStarterTitle(raw) {
    var t = String(raw || "").trim();
    if (!t) return false;
    return /^WORLDCLASS_STARTER_/i.test(t) || /^starter[_\-\s]/i.test(t);
  }
  function stripWorldClassPrefix(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    return t.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
  }
  function publicExperienceTitle(exp) {
    var title = String((exp && exp.title) || "").trim();
    var debranded = stripWorldClassPrefix(title);
    if (debranded) return debranded;
    if (title && !isStarterTitle(title)) return title;
    return "Shared experience";
  }
  function normalizeHostId(expLike) {
    var expObj = expLike || {};
    var fromTop = String(expObj.hostId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromTop)) return fromTop;
    var hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    var fromNested = String(hostObj._id || hostObj.id || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromNested)) return fromNested;
    return "";
  }
  function cardTeaser(exp) {
    var city = String((exp && exp.city) || "your city");
    if (isStarterTitle(exp && exp.title)) return "Hosted in " + city;
    var raw = String((exp && exp.description) || "").trim().replace(/\s+/g, " ");
    if (!raw) return "Hosted in " + city;
    if (/starter experience|worldclass_starter/i.test(raw)) return "Hosted in " + city;
    if (raw.length <= 110) return raw;
    return raw.slice(0, 107).trimEnd() + "...";
  }
  function normalizedVerifiedStatus(exp) {
    var s = String((exp && exp.verifiedStatus) || "").trim().toLowerCase();
    if (s === "verified") return "verified";
    if (s === "pending") return "pending";
    if (s === "rejected") return "rejected";
    return "none";
  }

  window.tstsRenderExperienceCard = function (exp, opts) {
    opts = opts || {};
    var El = window.tstsEl;
    var safeUrl = window.tstsSafeUrl;
    if (!El || !exp) return null;
    var fallbackImg = "/assets/experience-default.jpg";
    var fallbackHostPic = "/assets/avatar-default.svg";
    var idx = (typeof opts.idx === "number") ? opts.idx : 1;

    var preventCardNav = function (node) {
      if (!node || typeof node.setAttribute !== "function") return node;
      node.setAttribute("data-no-card-nav", "true");
      node.addEventListener("click", function (ev) {
        if (!ev) return;
        ev.preventDefault();
        ev.stopPropagation();
      });
      return node;
    };

    var imgUrl = cloudinaryCardImg(safeUrl(exp.imageUrl || (exp.images && exp.images[0]), fallbackImg), 400, 192);
    var rawPrice = exp.price || 0;
    var price = typeof rawPrice === "string" ? Number(String(rawPrice).replace(/[^0-9.]/g, "")) || 0 : Number(rawPrice) || 0;
    var hostPicUrl = cloudinaryCardImg(safeUrl(exp.hostPic, fallbackHostPic), 24, 24);
    var verifiedState = normalizedVerifiedStatus(exp);
    var title = publicExperienceTitle(exp);
    var teaser = cardTeaser(exp);
    var hostId = normalizeHostId(exp);
    var expHref = "experience.html?id=" + encodeURIComponent(exp._id || exp.id || "");

    var imgAttrs = { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500", width: 400, height: 192 };
    if (idx === 0) { imgAttrs.fetchPriority = "high"; } else { imgAttrs.loading = "lazy"; }
    var imgEl = El("img", imgAttrs);
    window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

    // Host avatar — photo when present, else 2-letter initials, else user glyph.
    var hostInitials = (function () {
      var trimmed = String(exp.hostName || "").trim();
      if (!trimmed) return "";
      var parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length === 0) return "";
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    })();
    var hasHostPic = exp.hostPic && String(exp.hostPic).trim() !== "" && !looksLikeEmailName(String(exp.hostPic));
    var hostImgEl;
    if (hasHostPic) {
      hostImgEl = El("img", { className: "w-6 h-6 rounded-full border border-orange-50", loading: "lazy", width: 24, height: 24 });
      window.tstsSafeImg(hostImgEl, hostPicUrl, fallbackHostPic);
    } else if (hostInitials) {
      hostImgEl = El("div", { className: "w-6 h-6 rounded-full bg-orange-600 border border-orange-50 flex items-center justify-center text-white text-[11px] font-semibold leading-none", "aria-hidden": "true" }, [El("span", { textContent: hostInitials })]);
    } else {
      hostImgEl = El("div", { className: "w-6 h-6 rounded-full bg-orange-300 border border-orange-50 flex items-center justify-center text-white text-[11px] leading-none", "aria-hidden": "true" }, [El("i", { className: "fas fa-user text-[10px]" })]);
    }

    // Heart (top-left) — self-contrasting glyph on a faint glass circle.
    var heartIcon = El("i", { className: exp.isBookmarked ? "fas fa-heart tsts-heart-photo-liked text-xl" : "fas fa-heart tsts-heart-photo text-xl" });
    var heartBtn = preventCardNav(El("button", {
      type: "button",
      className: "absolute top-3 left-3 w-9 h-9 flex items-center justify-center transition hover:scale-110 rounded-full tsts-glass-circle tsts-glass-faint p-0",
      "aria-label": exp.isBookmarked ? "Liked" : "Like",
      "aria-pressed": exp.isBookmarked ? "true" : "false",
      title: exp.isBookmarked ? "Liked" : "Like",
      "data-tooltip": exp.isBookmarked ? "Liked" : "Like",
      "data-tooltip-pos": "below"
    }, [heartIcon]));
    heartBtn.addEventListener("click", function () {
      heartBtn.classList.remove("tsts-heart-pop");
      void heartBtn.offsetWidth;
      heartBtn.classList.add("tsts-heart-pop");
      heartBtn.addEventListener("animationend", function clearPop() {
        heartBtn.classList.remove("tsts-heart-pop");
        heartBtn.removeEventListener("animationend", clearPop);
      }, { once: true });
      if (window.tstsToggleBookmark) window.tstsToggleBookmark(exp._id || exp.id, heartBtn);
    });

    // Price pill (top-right) — country-prefixed currency, "From A$X / person".
    var __priceText = (function () {
      var code = String(exp.currency || "AUD").toUpperCase();
      // Owner-approved 2026-06-03: a PRIVATE-only listing shows the whole-table TOTAL
      // ("A$500 · whole table"), NOT a per-person price — a single seat can't be booked.
      // Shared / both keep "From A$X / person". Same rule as the Explore card (explore.js).
      var __isPrivateOnly = String(exp.bookingMode || "shared").trim().toLowerCase() === "private";
      var __amt = __isPrivateOnly ? (Number(exp.privatePrice) || 0) : price;
      var __fmt = function (n) {
        try {
          return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: (n % 1 === 0 ? 0 : 2), maximumFractionDigits: (n % 1 === 0 ? 0 : 2), currencyDisplay: "symbol" }).format(n);
        } catch (_) { return "$" + Number(n).toFixed(2); }
      };
      if (__isPrivateOnly) return __fmt(__amt) + " · whole table";
      return "From " + __fmt(__amt) + " / person";
    })();
    var __priceTag = El("div", { className: "absolute top-3 right-3 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm text-right" }, [El("div", { className: "leading-tight", textContent: __priceText })]);

    var imageContainer = El("div", { className: "relative h-48 w-full overflow-hidden bg-gray-100" }, [imgEl, heartBtn, __priceTag]);
    if (exp.isPaused) {
      imageContainer.appendChild(El("div", { className: "absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold", textContent: "Paused" }));
    }

    // Share (bottom-right) — same faint glass circle.
    var shareBtn = preventCardNav(El("button", {
      type: "button",
      className: "absolute bottom-3 right-3 w-9 h-9 flex items-center justify-center transition hover:scale-110 rounded-full tsts-glass-circle tsts-glass-faint p-0",
      "aria-label": "Share this experience",
      title: "Share",
      "data-tooltip": "Share"
    }, [El("i", { className: "fas fa-share-nodes tsts-icon-photo text-xl" })]));
    shareBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (window.tstsShareExperience) {
        window.tstsShareExperience({ title: exp.title || "", text: exp.description || "", experienceId: String(exp._id || exp.id || "") });
      }
    });
    imageContainer.appendChild(shareBtn);

    // Verified trust badge (bottom-left) — verified experiences only.
    if (verifiedState === "verified") {
      var trustBadge = preventCardNav(El("div", { className: "absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm bg-blue-600/95 text-white" }, [
        El("i", { className: "fas fa-shield-halved text-[10px]" }),
        El("span", { textContent: " Verified" })
      ]));
      imageContainer.appendChild(trustBadge);
    }

    var makeMarkerIcon = function () { return El("i", { className: "fas fa-map-marker-alt text-orange-500" }); };
    var hostDisplayName = String(exp.hostName || "").trim();
    if (!hostDisplayName || looksLikeEmailName(hostDisplayName)) {
      hostDisplayName = (verifiedState === "verified") ? "Verified Host" : "Host";
    }

    var hostMetaChildren = [hostImgEl, El("span", { className: "text-xs text-gray-500 truncate", textContent: hostDisplayName })];
    if (exp.hostVerified) {
      hostMetaChildren.push(El("i", { className: "fas fa-shield-halved text-blue-600 text-[11px] ml-1", title: "Verified host", "aria-label": "Verified host" }));
    }
    var hostMeta = El("div", { className: "inline-flex items-center gap-2 mb-1 flex-wrap" }, hostMetaChildren);
    if (hostId) {
      hostMeta = El("a", {
        href: "public-profile.html?id=" + encodeURIComponent(hostId),
        className: "inline-flex items-center gap-2 mb-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 flex-wrap",
        "data-no-card-nav": "true"
      }, [
        hostImgEl,
        El("span", { className: "text-xs text-gray-500 truncate hover:text-orange-600 transition", textContent: hostDisplayName })
      ].concat(exp.hostVerified ? [El("i", { className: "fas fa-shield-halved text-blue-600 text-[11px] ml-1", title: "Verified host", "aria-label": "Verified host" })] : []));
      hostMeta.addEventListener("click", function (ev) { if (ev) ev.stopPropagation(); });
    }

    var card = El("div", {
      className: "group block bg-white rounded-3xl shadow-soft-card hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col cursor-pointer",
      role: "link",
      tabindex: "0",
      "aria-label": "Open " + title
    }, [
      imageContainer,
      El("div", { className: "p-4 flex flex-col gap-1 flex-grow" }, [
        // Recommended reason chip (styled per reason type; matches Explore).
        (function () {
          var raw = String(exp.recommendedReason || "").trim();
          if (!raw) return null;
          var icon, chipCls, iconCls, label, chipStyle = null;
          if (/★/.test(raw)) {
            icon = "fa-heart"; chipCls = "bg-red-50 text-red-700"; iconCls = "text-red-500"; label = "Loved by travellers";
          } else if (/^(because you love|for you|for your)/i.test(raw)) {
            // Owner 2026-05-27: the affinity ✨ chip. `fa-sparkles` isn't in the bundled icon
            // font, AND dark Tailwind bg classes (bg-slate-900) aren't in the PURGED build —
            // so the pill painted transparent and the white text vanished. Fix: a real ✨ emoji
            // + an INLINE-STYLE dark pill (immune to CSS purging) so the gold ✨ + white text
            // always pop on a true contrasting background. Reads as the "picked for you" chip.
            icon = "✨"; chipCls = ""; chipStyle = { backgroundColor: "#0f172a", color: "#ffffff" }; iconCls = ""; label = raw;
          } else if (/^popular/i.test(raw)) {
            icon = "fa-fire"; chipCls = "bg-orange-100 text-orange-800"; iconCls = "text-orange-600"; label = "A favourite table";
          } else if (/^just listed/i.test(raw)) {
            icon = "fa-seedling"; chipCls = "bg-emerald-50 text-emerald-800"; iconCls = "text-emerald-600"; label = "Newly set table";
          } else if (/^open this week/i.test(raw)) {
            icon = "fa-calendar-check"; chipCls = "bg-amber-50 text-amber-900"; iconCls = "text-amber-700"; label = "A seat this week";
          } else {
            icon = "fa-compass"; chipCls = "bg-amber-50 text-amber-900"; iconCls = "text-amber-700"; label = "Worth discovering";
          }
          // A Font Awesome class (fa-*) renders via <i>; a literal emoji renders via <span>
          // so it always shows even for glyphs missing from the bundled icon-font subset.
          var __recoIconNode = /^fa-/.test(icon)
            ? El("i", { className: "fas " + icon + " " + iconCls + " text-[9px]" })
            : El("span", { className: "text-sm leading-none", textContent: icon });
          var __chipAttrs = { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1.5 self-start " + chipCls };
          if (chipStyle) __chipAttrs.style = chipStyle;
          return El("div", __chipAttrs, [
            __recoIconNode,
            El("span", { textContent: " " + label })
          ]);
        })(),
        // Title
        El("h3", { className: "font-bold text-gray-900 mb-1.5 line-clamp-2", textContent: title, title: title }),
        // Trust row: host + rating
        El("div", { className: "flex items-center justify-between gap-2 mb-1.5 flex-wrap" }, [
          hostMeta,
          (Number(exp.reviewCount || 0) > 0 ? El("span", { className: "inline-flex items-center gap-1 text-xs" }, [
            El("i", { className: "fas fa-star text-amber-500 text-[11px]" }),
            El("span", { className: "font-bold text-gray-800", textContent: " " + (Number(exp.averageRating) || 0).toFixed(1) }),
            El("span", { className: "text-gray-500", textContent: " (" + (Number(exp.reviewCount) || 0) + ")" })
          ]) : null)
        ]),
        // Description preview + inline Read more
        (function () {
          var fullDesc = String(exp.description || teaser || "").trim();
          var MAX_CHARS = 110;
          var display = fullDesc;
          var truncated = false;
          if (fullDesc.length > MAX_CHARS) {
            display = fullDesc.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").replace(/[\s,.;:!?\u00b7-]+$/, "") + "… ";
            truncated = true;
          }
          var children = [El("span", { textContent: display })];
          if (truncated) {
            var more = El("a", { className: "text-orange-600 font-semibold hover:underline whitespace-nowrap", "data-no-card-nav": "true" });
            more.href = expHref;
            more.textContent = "Read more";
            more.addEventListener("click", function (ev) { if (ev) ev.stopPropagation(); });
            children.push(more);
          }
          return El("p", { className: "text-xs text-gray-700" }, children);
        })(),
        // Location row: Suburb · City · STATE
        El("p", { className: "text-xs text-gray-700 flex items-center gap-1" }, [
          El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [makeMarkerIcon()]),
          El("span", { textContent: (function () {
            var suburb = String(exp.suburb || "").trim();
            var city = String(exp.city || "").trim();
            var state = String(exp.state || "").trim().toUpperCase();
            var parts = [];
            if (suburb) parts.push(suburb);
            if (city && city !== suburb) parts.push(city);
            if (state) parts.push(state);
            return parts.join(" · ");
          })() })
        ]),
        // Duration + capacity (+ private/shared chip)
        (function () {
          var segs = [];
          var minutes = Number(exp.eventDurationMinutes || 0);
          if (isFinite(minutes) && minutes > 0) {
            var dur;
            if (minutes === 60) dur = "1 hour";
            else if (minutes % 60 === 0) dur = (minutes / 60) + " hours";
            else if (minutes < 60) dur = minutes + " min";
            else dur = (minutes / 60).toFixed(1).replace(/\.0$/, "") + " hours";
            segs.push(El("span", { className: "inline-flex items-center gap-1" }, [
              El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [El("i", { className: "far fa-clock text-gray-500" })]),
              El("span", { textContent: dur })
            ]));
          }
          var __capMode = String(exp.bookingMode || "shared").trim().toLowerCase();
          var __cap = Number(exp.maxGuests || exp.capacity || 0);
          var __seatIcon = function () { return El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [El("i", { className: "fas fa-user-friends text-gray-500" })]); };
          var __numEl = function (n) { return El("span", { className: "font-bold underline text-gray-900", textContent: String(n) }); };
          if (__capMode === "private") {
            var pg = Number(exp.privateCapacity || exp.privateIncludedGuests || __cap || 0);
            if (pg > 0) {
              segs.push(El("span", { className: "inline-flex items-center gap-1" }, [__seatIcon(), El("span", { className: "text-gray-700" }, ["up to ", __numEl(pg), " " + (pg === 1 ? "guest" : "guests")])]));
            }
          } else if (__cap > 0) {
            // sir's ruling 2026-08-22 ("Fix all four"). This is the SAME defect as explore.js — this
            // is the shared card renderer, so leaving it would keep the lie live on every OTHER page
            // and make two pages disagree about the same listing. Two faults fixed together:
            // (1) the fallback rounded availability UP to full capacity, so a table with 2 seats left
            //     could read "only 700 seats" — a figure about availability must never overstate it;
            // (2) "only" was applied to every count with no threshold, so a 700-seat hall read "only
            //     700 seats", which is nonsense and destroyed the signal for a table genuinely down to
            //     its last seats. Wording derived from the platform's own mobile BookingScreen
            //     ("Sold out" / "1 seat left" / "N seats left"), and "up to N" from the private branch
            //     directly above — nothing invented, and the two platforms now speak with one voice.
            var __availKnown = (typeof exp.availableSeats === "number" && isFinite(exp.availableSeats));
            if (__availKnown) {
              var avail = Math.max(0, Number(exp.availableSeats));
              var availText = (avail === 0)
                ? El("span", { className: "text-gray-700" }, ["Sold out"])
                : El("span", { className: "text-gray-700" }, [__numEl(avail), " " + (avail === 1 ? "seat" : "seats") + " left"]);
              segs.push(El("span", { className: "inline-flex items-center gap-1" }, [__seatIcon(), availText]));
            } else {
              segs.push(El("span", { className: "inline-flex items-center gap-1" }, [__seatIcon(), El("span", { className: "text-gray-700" }, ["up to ", __numEl(__cap), " " + (__cap === 1 ? "seat" : "seats")])]));
            }
          }
          if (__capMode === "private") {
            segs.push(El("span", { className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 shrink-0", title: "Private-only. You book the whole table for your group.", textContent: "Private table" }));
          } else if (__capMode === "both") {
            var __availP = (typeof exp.availableSeats === "number" && isFinite(exp.availableSeats)) ? exp.availableSeats : __cap;
            if (__cap > 0 && __availP >= __cap) {
              segs.push(El("span", { className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 shrink-0", title: "No seats booked yet. You can make this whole table private for your group.", textContent: "Can be private" }));
            }
          }
          if (segs.length === 0) return null;
          return El("p", { className: "text-xs text-gray-700 flex items-center gap-3 flex-wrap" }, segs);
        })(),
        // Next available slot + frequency (orange pill)
        (function () {
          var next = window.tstsFormatNextOccurrence ? window.tstsFormatNextOccurrence(exp.nextOccurrenceAt) : "";
          if (!next) return null;
          var days = Array.isArray(exp.availableDays) ? exp.availableDays.filter(Boolean) : [];
          var freq = "";
          var set = new Set(days);
          var isWeekend = set.size === 2 && set.has("Sat") && set.has("Sun");
          var isWeekday = set.size === 5 && set.has("Mon") && set.has("Tue") && set.has("Wed") && set.has("Thu") && set.has("Fri");
          if (days.length === 1) {
            var dayFull = { Sun: "Sundays", Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays" };
            freq = dayFull[days[0]] || "";
          } else if (days.length === 7) { freq = "Every day"; }
          else if (isWeekend) { freq = "Weekends"; }
          else if (isWeekday) { freq = "Weekdays"; }
          else if (days.length === 2) { freq = days[0] + " & " + days[1]; }
          else if (days.length === 3) { freq = days[0] + ", " + days[1] + " & " + days[2]; }
          else { freq = days.length + " days a week"; }
          var text = freq ? (next + " · " + freq) : next;
          return El("div", { className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 mb-1.5 self-start" }, [
            El("i", { className: "fas fa-calendar text-orange-700 text-[10px]" }),
            El("span", { textContent: " " + text })
          ]);
        })()
      ])
    ]);
    card.addEventListener("click", function (ev) {
      var t = ev && ev.target;
      if (t && typeof t.closest === "function" && t.closest('[data-no-card-nav="true"]')) return;
      window.location.href = expHref;
    });
    card.addEventListener("keydown", function (ev) {
      if (!ev) return;
      var key = String(ev.key || "");
      if (key !== "Enter" && key !== " ") return;
      ev.preventDefault();
      window.location.href = expHref;
    });
    return card;
  };
})();

window.tstsSafeUrl = function(url, fallback) {
  if (!url || typeof url !== "string") return fallback || "";
  const raw = url.trim();
  const trimmed = raw.toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return fallback || "";
  }
  if (trimmed.startsWith("//")) {
    return fallback || "";
  }

  const hasColon = trimmed.indexOf(":") !== -1;
  if (hasColon && !(trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
    return fallback || "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return raw;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return raw;
  if (trimmed.startsWith("#")) return raw;
  return raw;
};

window.tstsSafeImg = function(imgEl, url, fallback) {
  if (!imgEl) return;
  const fb = fallback || "/assets/experience-default.jpg";
  const safeUrl = window.tstsSafeUrl(url, fb);
  imgEl.src = safeUrl || fb;
  imgEl.addEventListener("error", function() { imgEl.src = fb; }, { once: true });
};

// Owner 2026-06-05: reusable multi-image carousel. Every surface that shows an
// experience (trip card, success page, pending-hold page) must display ALL host
// photos, not just the cover. Mirrors the LOCKED experience.html hero chrome:
// 36px glass arrows (U+276E / U+276F) + dot indicators. One image -> just the
// photo, no chrome. Self-contained per instance (own closure state) so many can
// live on one page. XSS-safe: createElement + tstsSafeImg only, no innerHTML.
// opts: { aspectRatio: "4 / 3" (CSS aspect-ratio, avoids Tailwind purge),
//         rounded: "rounded-xl", fallback, alt }
window.tstsBuildImageCarousel = function (urls, opts) {
  opts = opts || {};
  var list = (Array.isArray(urls) ? urls : []).filter(function (u) { return u && typeof u === "string"; });
  if (list.length === 0) list = [opts.fallback || "/assets/experience-default.jpg"];
  var rounded = opts.rounded || "rounded-xl";

  var frame = document.createElement("div");
  frame.className = "relative overflow-hidden bg-slate-200 w-full " + rounded + (opts.fillHeight ? " h-full" : "");
  if (opts.fillHeight) { frame.style.minHeight = opts.minHeight || "240px"; }
  else { frame.style.aspectRatio = opts.aspectRatio || "4 / 3"; }
  frame.setAttribute("tabindex", "0");

  var img = document.createElement("img");
  img.className = "w-full h-full object-cover";
  img.setAttribute("alt", opts.alt || "Experience photo");
  window.tstsSafeImg(img, list[0], opts.fallback);
  frame.appendChild(img);

  if (list.length <= 1) return frame;

  var idx = 0;
  function mkArrow(side, glyph, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "absolute " + side + " top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center transition hover:scale-110 rounded-full tsts-glass-circle tsts-glass-faint p-0 z-20";
    b.setAttribute("aria-label", label);
    b.setAttribute("title", label);
    var s = document.createElement("span");
    s.className = "text-sm leading-none text-white";
    s.textContent = glyph;
    b.appendChild(s);
    return b;
  }
  var prev = mkArrow("left-3", "❮", "Previous photo");
  var next = mkArrow("right-3", "❯", "Next photo");

  var dotsWrap = document.createElement("div");
  dotsWrap.className = "absolute bottom-3 flex items-center gap-2 z-20";
  dotsWrap.style.left = "50%";
  dotsWrap.style.transform = "translateX(-50%)";
  for (var i = 0; i < list.length; i += 1) {
    var dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("data-dot-idx", String(i));
    dot.setAttribute("aria-label", "Go to photo " + (i + 1));
    dot.style.height = "8px";
    dot.style.borderRadius = "9999px";
    dot.style.transition = "all 0.2s";
    dot.style.border = "0";
    dot.style.cursor = "pointer";
    dot.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
    dotsWrap.appendChild(dot);
  }

  function paint(n) {
    idx = ((n % list.length) + list.length) % list.length;
    window.tstsSafeImg(img, list[idx], opts.fallback);
    var dots = dotsWrap.querySelectorAll("[data-dot-idx]");
    for (var j = 0; j < dots.length; j += 1) {
      var active = (Number(dots[j].getAttribute("data-dot-idx")) === idx);
      dots[j].style.backgroundColor = active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
      dots[j].style.width = active ? "20px" : "8px";
      dots[j].setAttribute("aria-current", active ? "true" : "false");
    }
  }
  prev.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); paint(idx - 1); });
  next.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); paint(idx + 1); });
  dotsWrap.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== dotsWrap && !(t.getAttribute && t.getAttribute("data-dot-idx"))) t = t.parentNode;
    if (!t || t === dotsWrap) return;
    e.preventDefault(); e.stopPropagation();
    paint(Number(t.getAttribute("data-dot-idx")));
  });
  frame.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { paint(idx - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { paint(idx + 1); e.preventDefault(); }
  });
  var startX = null;
  frame.addEventListener("touchstart", function (e) { if (e.touches && e.touches.length === 1) startX = e.touches[0].clientX; }, { passive: true });
  frame.addEventListener("touchend", function (e) {
    if (startX == null) return;
    var endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : startX;
    var delta = endX - startX; startX = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) paint(idx + 1); else paint(idx - 1);
  }, { passive: true });

  frame.appendChild(prev);
  frame.appendChild(next);
  frame.appendChild(dotsWrap);
  paint(0);
  return frame;
};

// WS-FE-06: Safe mailto helper - prevents href injection
window.tstsSafeMailto = function(email) {
  if (!email || typeof email !== "string") return "";
  var trimmed = email.trim();
  if (!trimmed) return "";
  // Reject if contains dangerous characters: spaces, newlines, control chars, colons, angle brackets
  if (/[\s\n\r\x00-\x1f:<>]/.test(trimmed)) return "";
  // Reject if looks like a protocol
  if (/^[a-z]+:/i.test(trimmed)) return "";
  // Basic email pattern: must have @ and at least one dot after @
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "";
  return "mailto:" + trimmed;
};

// WS-FE-07: Branded toast notification (replaces alert())
(function() {
  var toastContainer = null;

  function ensureContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = window.tstsEl("div", {
      id: "tsts-toast-container",
      className: "fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    });
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  window.tstsNotify = function(msg, type) {
    var t = String(type || "info").toLowerCase();
    var colors = {
      success: "bg-green-600 text-white",
      error: "bg-red-600 text-white",
      warning: "bg-amber-500 text-white",
      info: "bg-gray-800 text-white"
    };
    var icons = {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle"
    };
    var colorClass = colors[t] || colors.info;
    var iconClass = icons[t] || icons.info;

    var container = ensureContainer();

    var icon = window.tstsEl("i", { className: "fas " + iconClass + " text-lg flex-shrink-0" });
    var text = window.tstsEl("span", { className: "text-sm font-medium" }, String(msg || ""));
    var closeBtn = window.tstsEl("button", {
      className: "ml-2 text-white/80 hover:text-white transition flex-shrink-0",
      type: "button"
    }, [window.tstsEl("i", { className: "fas fa-times" })]);
    closeBtn.setAttribute("aria-label", "Close");

    var toast = window.tstsEl("div", {
      className: colorClass + " px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto transform translate-x-full opacity-0 transition-all duration-300 max-w-sm"
    }, [icon, text, closeBtn]);

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        toast.classList.remove("translate-x-full", "opacity-0");
        toast.classList.add("translate-x-0", "opacity-100");
      });
    });

    var dismiss = function() {
      toast.classList.remove("translate-x-0", "opacity-100");
      toast.classList.add("translate-x-full", "opacity-0");
      setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener("click", dismiss);
    setTimeout(dismiss, 5000);
  };

  // ── window.tstsToast — ADDED 2026-08-22 ON sir's WRITTEN APPROVAL ─────────────────────────────
  // sir, verbatim, answering a one-item permission question: **"Yes — add the alias in common.js"**.
  // This is the ONLY change made to this P1 file; nothing else here is touched.
  //
  // THE DEFECT: eight call sites across common.js, host.js and profile.js call
  // `window.tstsToast({ type, message })` — and that helper was **defined in none of them**. Every
  // call is written `if (window.tstsToast) window.tstsToast(...)`, so the guard was permanently
  // false and the message was dropped in silence.
  //
  // SIX WERE GENUINELY SILENT. (The other two — the share helper at :237-249 — already fall through
  // to `else if (window.tstsNotify)`, so "Link copied to clipboard." was never affected. I had
  // reported those as silent too and corrected it before writing this.)
  //   common.js:329   "Sign in to save experiences."
  //   common.js:376   "Couldn't update Like. Try again."
  //   common.js:381   "Added to your liked experiences." / "Removed from liked."
  //   common.js:386   "Network error. Try again."
  //   host.js:1530    "Verification request sent."
  //   profile.js:886  "Sent for review."
  //
  // PROVEN BY A REAL CLICK BEFORE THIS WAS WRITTEN: clicking the Like heart on Explore flipped it to
  // "Liked" and `#tsts-toast-container` was **never even created** — no message of any kind. sir's
  // standing rule is that no button may be silent.
  //
  // WHY AN ALIAS RATHER THAN EIGHT EDITS: one small function here lights every call site at once and
  // keeps the footprint on this frozen file to a single addition. Editing eight sites across three
  // frozen files would be a far larger touch for the same result.
  //
  // It maps the object shape every caller uses — {type, message} — onto tstsNotify's positional
  // (message, type) contract, tolerates a bare string, ignores an empty message, and resolves
  // tstsNotify at CALL time so definition order can never matter.
  window.tstsToast = function (opts) {
    try {
      var o = (opts && typeof opts === "object") ? opts : {};
      var msg = (typeof opts === "string") ? opts : String(o.message == null ? "" : o.message);
      if (!msg) return;
      var type = String(o.type || "info").toLowerCase();
      if (typeof window.tstsNotify === "function") window.tstsNotify(msg, type);
    } catch (_toastErr) { void _toastErr; }
  };
})();

// ── Analytics event tracking (fire-and-forget, never blocks UI) ──
// Gated on real cookie consent (2026-08-23, cookie banner rebuild): this fired unconditionally
// before, regardless of what the banner said. Now checks the same consent record the banner
// writes; no Analytics consent means no call, silently — matches the fire-and-forget contract
// every existing caller already relies on (none of them check the return value).
window.__trackAnalytics = function(event, category, properties) {
  if (!event) return;
  try {
    var consent = window.tstsGetCookieConsent ? window.tstsGetCookieConsent() : null;
    if (!consent || consent.analytics !== true) return;
    var base = String(window.API_BASE || "").replace(/\/$/, "");
    if (!base) return;
    fetch(base + "/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: String(event),
        category: String(category || ""),
        properties: (properties && typeof properties === "object") ? properties : {},
        platform: "web"
      }),
      credentials: "include"
    }).catch(function() {});
  } catch (_) {}
};

// ── Shared form validation helpers ──
window.tstsShowFieldError = function(input, msg) {
  if (!input) return;
  input.style.borderColor = "#ef4444";
  input.setAttribute("aria-invalid", "true");
  var errId = input.id ? input.id + "-error" : "";
  var existing = errId ? document.getElementById(errId) : null;
  if (existing) {
    existing.textContent = "";
    var ic2 = document.createElement("span"); ic2.textContent = "\u26A0"; existing.appendChild(ic2);
    var tx2 = document.createElement("span"); tx2.textContent = String(msg || ""); existing.appendChild(tx2);
    return;
  }
  var errEl = document.createElement("p");
  errEl.className = "text-red-600 text-xs mt-1 flex items-center gap-1";
  if (errId) errEl.id = errId;
  var icon = document.createElement("span");
  icon.textContent = "\u26A0";
  errEl.appendChild(icon);
  var txt = document.createElement("span");
  txt.textContent = String(msg || "");
  errEl.appendChild(txt);
  if (input.parentNode) input.parentNode.appendChild(errEl);
  if (errId) input.setAttribute("aria-describedby", errId);
};

window.tstsClearFieldError = function(input) {
  if (!input) return;
  input.style.borderColor = "";
  input.removeAttribute("aria-invalid");
  var errId = input.id ? input.id + "-error" : "";
  var existing = errId ? document.getElementById(errId) : null;
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  input.removeAttribute("aria-describedby");
};

window.tstsValidateField = function(input) {
  if (!input) return true;
  var val = String(input.value || "").trim();
  var type = (input.type || "").toLowerCase();
  var minLen = parseInt(input.getAttribute("minlength") || "0", 10);
  var required = input.hasAttribute("required");

  window.tstsClearFieldError(input);

  if (required && !val) {
    window.tstsShowFieldError(input, "This field is required.");
    return false;
  }
  if (type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    window.tstsShowFieldError(input, "Please enter a valid email address.");
    return false;
  }
  if (minLen > 0 && val.length > 0 && val.length < minLen) {
    window.tstsShowFieldError(input, "Must be at least " + minLen + " characters.");
    return false;
  }
  return true;
};

// ── Standardized date formatting helpers ──
window.tstsFormatDate = function(dateStr) {
  if (!dateStr) return "";
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });
  } catch (_) { return String(dateStr); }
};

window.tstsFormatDateTime = function(dateStr) {
  if (!dateStr) return "";
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    var datePart = d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });
    var timePart = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne", timeZoneName: "short" });
    return datePart + " \u2022 " + timePart;
  } catch (_) { return String(dateStr); }
};

// NOTE (2026-08-13): this earlier definition is SUPERSEDED by the one further down
// (search tstsFormatDateShort) — the later assignment wins at runtime. Kept in step
// with it so the two can never disagree: fixed three-letter months, because en-AU's
// "short" month spells June/July/September out and abbreviates the rest.
window.tstsFormatDateShort = function(dateStr) {
  if (!dateStr) return "";
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    var M3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var parts = new Intl.DateTimeFormat("en-AU", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Australia/Melbourne" }).formatToParts(d);
    var get = function (t) { var p = parts.find(function (q) { return q.type === t; }); return p ? p.value : ""; };
    var mon = M3[Number(get("month")) - 1] || "";
    if (!mon || !get("year")) return d.toDateString();
    return String(Number(get("day"))) + " " + mon + " " + get("year");
  } catch (_) { return String(dateStr); }
};

// Owner 2026-06-11 (sir): "Invite a friend to a seat" modal — the CREATION entry point used by the
// New Trips card + the booking success page. Lets the booker pick how the friend gets their seat —
// FRIEND PAYS (PAY_SELF: friend pays their own seat on the experience page) or GIFT (PAID_SEAT: the
// booker pre-pays, friend just confirms) — mints ONE multi-use link per mode, and shows copy/share.
// opts: { experienceId, bookingDate, timeSlot, sourceBookingId, experienceTitle, price, currency }
window.tstsInviteFriendModal = function (opts) {
  var El = window.tstsEl;
  var o = opts || {};
  var expId = String(o.experienceId || "");
  if (!expId) { if (window.tstsNotify) window.tstsNotify("Missing experience.", "error"); return; }
  var priceN = Number(o.price || 0);
  var cur = String(o.currency || "aud").toUpperCase();
  var priceTxt = priceN > 0 ? (cur === "AUD" ? ("A$" + priceN) : (cur + " " + priceN)) : "";
  var mode = "PAY_SELF";

  var overlay = El("div", { className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200" });
  function close() { overlay.classList.add("opacity-0"); setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200); }

  var titleEl = El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Invite a friend to a seat" });
  var subEl = El("p", { className: "text-sm text-gray-500 mt-1", textContent: o.experienceTitle ? String(o.experienceTitle) : "Share a seat at your table." });

  // Two mode choices.
  function choiceCard(value, icon, label, sub) {
    var card = El("button", { type: "button", className: "w-full text-left border-2 rounded-xl p-3 flex items-start gap-3 transition", "data-mode": value }, [
      El("div", { className: "w-9 h-9 rounded-full bg-tsts-cream flex items-center justify-center flex-shrink-0" }, [/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u.test(icon) ? El("span", { className: "text-lg leading-none", "aria-hidden": "true" }, icon) : El("i", { className: icon + " text-tsts-clay" })]),
      El("div", { className: "min-w-0" }, [
        El("p", { className: "font-bold text-tsts-ink text-sm", textContent: label }),
        El("p", { className: "text-xs text-gray-500 mt-0.5", textContent: sub })
      ])
    ]);
    return card;
  }
  var cPay = choiceCard("PAY_SELF", "fas fa-user-friends", "Friend pays their own seat", "They open the link and pay for their seat.");
  var cGift = choiceCard("PAID_SEAT", "🎁", "I'll cover it (gift)" + (priceTxt ? (" · " + priceTxt) : ""), "You pay now; your friend just confirms, free.");
  function paint() {
    [cPay, cGift].forEach(function (c) {
      var on = c.getAttribute("data-mode") === mode;
      c.className = "w-full text-left border-2 rounded-xl p-3 flex items-start gap-3 transition " + (on ? "border-tsts-clay bg-tsts-clay/5" : "border-gray-200 hover:border-gray-300");
    });
  }
  cPay.addEventListener("click", function () { mode = "PAY_SELF"; paint(); });
  cGift.addEventListener("click", function () { mode = "PAID_SEAT"; paint(); });
  paint();

  var resultWrap = El("div", { className: "hidden mt-1 space-y-2" });
  var linkInput = El("input", { type: "text", readonly: "readonly", className: "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50" });
  var copyBtn = El("button", { type: "button", className: "px-4 py-2 text-sm font-bold tsts-btn-primary rounded-lg inline-flex items-center gap-2", textContent: "Copy link" });
  // Gap 12 (sir's decision O-94): one honest copy routine. The link input is on screen, so a
  // refusal leaves the link selected there; "Link copied!" is said only on a real copy.
  copyBtn.addEventListener("click", function () {
    if (!linkInput.value) return;
    window.tstsCopyText(linkInput.value, { selectEl: linkInput }).then(function (copied) {
      if (copied && window.tstsNotify) window.tstsNotify("Link copied!", "success");
    });
  });
  resultWrap.appendChild(El("p", { className: "text-xs font-bold text-tsts-ink", textContent: "Your invite link" }));
  resultWrap.appendChild(linkInput);
  resultWrap.appendChild(copyBtn);

  var createBtn = El("button", { type: "button", className: "px-5 py-2.5 text-sm font-bold tsts-btn-primary rounded-lg w-full", textContent: "Create invite link" });
  var hint = El("p", { className: "text-[11px] text-gray-400 mt-2 text-center", textContent: "One link per dinner. Share it with as many friends as you have seats." });
  createBtn.addEventListener("click", function () {
    createBtn.disabled = true; createBtn.textContent = "Creating…";
    var body = { experienceId: expId, mode: mode };
    if (o.bookingDate) body.bookingDate = String(o.bookingDate);
    if (o.timeSlot) body.timeSlot = String(o.timeSlot);
    if (o.sourceBookingId) body.sourceBookingId = String(o.sourceBookingId);
    window.authFetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (raw) { return { ok: res.ok, raw: raw }; }); })
      .then(function (r) {
        if (!r.ok) { if (window.tstsNotify) window.tstsNotify((r.raw && r.raw.message) || "Couldn't create the link.", "error"); createBtn.disabled = false; createBtn.textContent = "Create invite link"; return; }
        var d = (r.raw && r.raw.data) ? r.raw.data : r.raw;
        linkInput.value = String((d && d.inviteUrl) || (window.location.origin + "/experience.html?id=" + encodeURIComponent(expId)));
        resultWrap.classList.remove("hidden");
        createBtn.classList.add("hidden");
        cPay.disabled = true; cGift.disabled = true;
        if (window.tstsNotify) window.tstsNotify(mode === "PAID_SEAT" ? "Gifted seat link ready!" : "Invite link ready!", "success");
      })
      .catch(function () { if (window.tstsNotify) window.tstsNotify("Network error.", "error"); createBtn.disabled = false; createBtn.textContent = "Create invite link"; });
  });

  var closeBtn = El("button", { type: "button", "aria-label": "Close", className: "absolute top-4 right-4 text-gray-400 hover:text-gray-600" }, [El("i", { className: "fas fa-times text-lg" })]);
  closeBtn.addEventListener("click", close);

  var modal = El("div", { className: "relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 transform scale-95 opacity-0 transition-all duration-200 space-y-4" }, [
    closeBtn,
    El("div", {}, [titleEl, subEl]),
    El("p", { className: "text-xs font-bold text-tsts-ink", textContent: "How should your friend get their seat?" }),
    El("div", { className: "space-y-2" }, [cPay, cGift]),
    createBtn,
    resultWrap,
    hint
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.remove("opacity-0"); modal.classList.remove("scale-95", "opacity-0"); });
};

// Owner 2026-06-11 (sir): CONNECTION-AWARE gift-a-seat picker — the complete seat-sharing flow used
// everywhere (success page, New Trips, Invitations). You GIFT a paid seat (you pre-pay; the recipient
// claims it free) to: (1) one of your connections; (2) someone on the platform you're not connected to
// yet (sends a connection request + the gift); (3) someone not on the platform (collects their email,
// emails them to JOIN, then connects + gifts). opts: { experienceId, bookingDate, timeSlot, sourceBookingId, experienceTitle }
window.tstsGiftSeatPicker = function (opts) {
  var El = window.tstsEl;
  var o = opts || {};
  var expId = String(o.experienceId || "");
  if (!expId) { if (window.tstsNotify) window.tstsNotify("Missing experience.", "error"); return; }

  var overlay = El("div", { className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200" });
  function close() { overlay.classList.add("opacity-0"); setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200); }

  function giftBody(extra) {
    var b = { experienceId: expId, mode: "PAID_SEAT", seatsOffered: 1 };
    if (o.bookingDate) b.bookingDate = String(o.bookingDate);
    if (o.timeSlot) b.timeSlot = String(o.timeSlot);
    if (o.sourceBookingId) b.sourceBookingId = String(o.sourceBookingId);
    return Object.assign(b, extra || {});
  }
  // sir's law 2 (pay-first): a gift exists only after the gifter pays. The picker starts the
  // STANDARD one-seat booking with giftFor and walks the gifter into the checkout; the receiver
  // hears nothing until the money lands.
  function giftViaCheckout(target) {
    if (!o.bookingDate || !o.timeSlot) {
      if (window.tstsNotify) window.tstsNotify("Pick the date you're gifting from your booking first.", "warning");
      return Promise.resolve({ ok: false, raw: null });
    }
    return window.authFetch("/api/policy/active", { method: "GET" })
      .then(function (pres) { return pres.json().catch(function () { return null; }); })
      .then(function (pjson) {
        var polVersion = String((pjson && pjson.data && pjson.data.policy && pjson.data.policy.version) || "");
        var body = {
          numGuests: 1, isPrivate: false,
          bookingDate: String(o.bookingDate), timeSlot: String(o.timeSlot),
          policyVersionAccepted: polVersion, termsVersionAccepted: "tsts_terms_v1",
          giftFor: {}
        };
        if (target && target.targetUserId) body.giftFor.targetUserId = String(target.targetUserId);
        if (target && target.targetEmail) body.giftFor.targetEmail = String(target.targetEmail);
        if (o.sourceBookingId) body.giftFor.sourceBookingId = String(o.sourceBookingId);
        return postJSON("/api/experiences/" + encodeURIComponent(expId) + "/book", body);
      })
      .then(function (r) {
        var url = r && r.raw && r.raw.data && (r.raw.data.checkoutUrl || r.raw.data.url);
        if (r && r.ok && url) { window.location.href = url; }
        return r;
      });
  }
  function postJSON(url, body) {
    return window.authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (raw) { return { ok: res.ok, raw: raw }; }); });
  }
  // sir's law 4 (take-back ≠ refund): a paid seat whose invite died re-gifts on the SAME booking —
  // no checkout, no new charge. Callers pass regiftBookingId to put the picker in this mode.
  var __regiftId = String(o.regiftBookingId || "");
  function giftSend(target) {
    if (!__regiftId) return giftViaCheckout(target);
    var body = { bookingId: __regiftId };
    if (target && target.targetUserId) body.targetUserId = String(target.targetUserId);
    if (target && target.targetEmail) body.targetEmail = String(target.targetEmail);
    return postJSON("/api/invites/re-gift", body);
  }

  // ── Your connections ──
  var connList = El("div", { className: "flex flex-col gap-1 max-h-48 overflow-y-auto" });
  connList.appendChild(El("p", { className: "text-xs text-gray-400 py-2", textContent: "Loading your connections…" }));
  function connRow(c) {
    var u = (c && c.user) ? c.user : c; // /api/social/connections wraps the person under .user
    var name = String(u.name || u.fullName || "Someone");
    var uid = String(u._id || u.id || u.userId || "");
    c = u;
    var av;
    if (c.profilePic) { av = El("img", { className: "w-8 h-8 rounded-full object-cover flex-shrink-0", alt: name }); try { if (window.tstsSafeImg) window.tstsSafeImg(av, c.profilePic, "/assets/avatar-default.png"); else av.src = c.profilePic; } catch (_e) { av.src = "/assets/avatar-default.png"; } }
    else av = El("div", { className: "w-8 h-8 rounded-full bg-tsts-cream flex items-center justify-center text-xs font-bold text-tsts-ink flex-shrink-0", textContent: name.slice(0, 1).toUpperCase() });
    var btn = El("button", { type: "button", className: "px-3 py-1.5 text-xs font-bold tsts-btn-primary rounded-lg flex-shrink-0", textContent: "Gift seat" });
    var row = El("div", { className: "flex items-center gap-2 py-1.5" }, [av, El("span", { className: "text-sm text-tsts-ink flex-1 min-w-0 truncate", textContent: name }), btn]);
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Gifting…";
      giftSend({ targetUserId: uid }).then(function (r) {
        if (!r.ok) { if (window.tstsNotify) window.tstsNotify((r.raw && r.raw.message) || "Couldn't gift the seat.", "error"); btn.disabled = false; btn.textContent = "Gift seat"; return; }
        btn.className = "px-3 py-1.5 text-xs font-bold text-green-700 flex-shrink-0"; btn.textContent = "Gifted ✓";
        if (window.tstsNotify) window.tstsNotify(__regiftId ? ("Gifted the seat to " + name + ". No new charge, the seat was already paid.") : ("Gifted a seat to " + name + ". They'll find it in Invitations."), "success");
      });
    });
    return row;
  }
  window.authFetch("/api/social/connections", { method: "GET" }).then(function (res) { return res.json().catch(function () { return null; }); }).then(function (raw) {
    var list = (raw && raw.data && Array.isArray(raw.data)) ? raw.data : ((raw && raw.data && Array.isArray(raw.data.connections)) ? raw.data.connections : []);
    connList.textContent = "";
    if (!list.length) connList.appendChild(El("p", { className: "text-xs text-gray-400 py-2", textContent: "No connections yet. Invite someone new below." }));
    else list.forEach(function (c) { connList.appendChild(connRow(c)); });
  }).catch(function () { connList.textContent = ""; connList.appendChild(El("p", { className: "text-xs text-gray-400 py-2", textContent: "Couldn't load connections." })); });

  // ── Invite someone new (name → connect+gift, or email → join+gift) ──
  var newInput = El("input", { type: "text", placeholder: "Name or email", className: "flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-tsts-clay/50 focus:border-transparent" });
  var newBtn = El("button", { type: "button", className: "px-4 py-2 text-sm font-bold tsts-btn-primary rounded-lg flex-shrink-0", textContent: "Invite" });
  var newMsg = El("p", { className: "text-xs text-gray-500 mt-1" });
  // GF-11: search matches render here for the payer to CONFIRM before any money moves.
  var newResults = El("div", { className: "flex flex-col gap-1" });
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim()); }
  newBtn.addEventListener("click", function () {
    var val = String(newInput.value || "").trim();
    if (!val) { newMsg.textContent = "Enter a name or email."; return; }
    newBtn.disabled = true; newBtn.textContent = "…";
    function done(msg, good) { newMsg.className = "text-xs mt-1 " + (good ? "text-green-700 font-semibold" : "text-red-600"); newMsg.textContent = msg; newBtn.disabled = false; newBtn.textContent = "Invite"; if (good) newInput.value = ""; }
    if (isEmail(val)) {
      // Not-on-platform path: email them to join + gift.
      giftSend({ targetEmail: val }).then(function (r) {
        if (!r.ok) return done((r.raw && r.raw.message) || "Couldn't send the email invite.", false);
        done("Invitation emailed to " + val + ". They'll join and claim the gifted seat.", true);
      });
    } else {
      // On-platform-but-not-connected path: find them, then CONFIRM before any money moves.
      // GF-11 (sir's fix-all order 2026-08-20): the old code paid for users[0] straight from the
      // search — "Sarah" charged a seat to the wrong Sarah. Now every match renders as a row
      // (name + @handle, same idiom as the connections list) and the seat is gifted only when
      // the payer clicks the person they actually mean.
      window.authFetch("/api/users/search?q=" + encodeURIComponent(val), { method: "GET" }).then(function (res) { return res.json().catch(function (_jsonErr) { void _jsonErr; return null; }); }).then(function (raw) {
        var users = (raw && raw.data && Array.isArray(raw.data.users)) ? raw.data.users : [];
        newResults.textContent = "";
        if (!users.length) return done("No one found by that name. Try their email to invite them to join.", false);
        users.slice(0, 3).forEach(function (u) {
          var uid = String(u._id || u.id || u.userId || "");
          var uname = String(u.name || "Someone");
          var label = u.handle ? (uname + " (@" + String(u.handle) + ")") : uname;
          var av2;
          if (u.profilePic) { av2 = El("img", { className: "w-8 h-8 rounded-full object-cover flex-shrink-0", alt: uname }); try { if (window.tstsSafeImg) window.tstsSafeImg(av2, u.profilePic, "/assets/avatar-default.png"); else av2.src = u.profilePic; } catch (_avErr) { void _avErr; av2.src = "/assets/avatar-default.png"; } }
          else av2 = El("div", { className: "w-8 h-8 rounded-full bg-tsts-cream flex items-center justify-center text-xs font-bold text-tsts-ink flex-shrink-0", textContent: uname.slice(0, 1).toUpperCase() });
          var pickBtn = El("button", { type: "button", className: "px-3 py-1.5 text-xs font-bold tsts-btn-primary rounded-lg flex-shrink-0", textContent: "Gift seat" });
          var row2 = El("div", { className: "flex items-center gap-2 py-1.5" }, [av2, El("span", { className: "text-sm text-tsts-ink flex-1 min-w-0 truncate", textContent: label }), pickBtn]);
          pickBtn.addEventListener("click", function () {
            pickBtn.disabled = true; pickBtn.textContent = "Gifting…";
            postJSON("/api/social/connect", { targetUserId: uid }).then(function () {
              return giftSend({ targetUserId: uid });
            }).then(function (r2) {
              if (!r2.ok) { if (window.tstsNotify) window.tstsNotify((r2.raw && r2.raw.message) || "Couldn't send the gift.", "error"); pickBtn.disabled = false; pickBtn.textContent = "Gift seat"; return; }
              pickBtn.className = "px-3 py-1.5 text-xs font-bold text-green-700 flex-shrink-0"; pickBtn.textContent = "Gifted ✓";
              done("Connection request + gifted seat sent to " + uname + ".", true);
            }).catch(function (_giftErr) { void _giftErr; if (window.tstsNotify) window.tstsNotify("We couldn't send that gift. Please try again.", "error"); pickBtn.disabled = false; pickBtn.textContent = "Gift seat"; });
          });
          newResults.appendChild(row2);
        });
        done(users.length === 1 ? "Is this them? The seat is gifted only when you choose." : ("Found " + users.length + " people. The seat is gifted only when you pick the right one."), true);
        newInput.value = val;
      }).catch(function (_searchErr) { void _searchErr; done("We couldn't run that search. Please try again.", false); });
    }
  });

  var closeBtn = El("button", { type: "button", "aria-label": "Close", className: "absolute top-4 right-4 text-gray-400 hover:text-gray-600" }, [El("i", { className: "fas fa-times text-lg" })]);
  closeBtn.addEventListener("click", close);

  var modal = El("div", { className: "relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 transform scale-95 opacity-0 transition-all duration-200 space-y-4" }, [
    closeBtn,
    El("div", {}, [
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Gift this experience" }),
      El("p", { className: "text-sm text-gray-500 mt-1", textContent: __regiftId
        ? ((o.experienceTitle ? String(o.experienceTitle) + ". " : "") + "This seat is already paid. Gift it to someone; they claim it free.")
        : ((o.experienceTitle ? String(o.experienceTitle) + ". You" : "You") + " cover the seat; they claim it free.") })
    ]),
    El("div", {}, [El("p", { className: "text-xs font-bold text-tsts-ink mb-1", textContent: "Your connections" }), connList]),
    El("div", { className: "border-t border-gray-100 pt-3" }, [
      El("p", { className: "text-xs font-bold text-tsts-ink mb-1", textContent: "Invite someone new" }),
      El("div", { className: "flex gap-2" }, [newInput, newBtn]),
      newMsg,
      newResults
    ])
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.remove("opacity-0"); modal.classList.remove("scale-95", "opacity-0"); });
};

// WS-FE-08: Branded confirmation modal (replaces confirm())
window.tstsConfirm = function(msg, opts) {
  // Owner 2026-07-24 (sir): MULTI-CHOICE mode. When `opts` is an ARRAY of {label, value}, render one
  // button per choice (stacked) + a Cancel, and resolve with the chosen option object (or null on cancel).
  // The admin waiver-decision flow relies on this — it passed an array to the yes/no confirm, so the
  // choices never rendered and the decision silently aborted. The object/undefined form below is unchanged.
  if (Array.isArray(opts)) {
    var choices = opts.filter(function (o) { return o && typeof o === "object"; });
    return new Promise(function (resolve) {
      var overlay = window.tstsEl("div", { className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200" });
      // Owner 2026-08-02 (sir): no icon — the question-circle sat left-aligned against the centered text.
      var message = window.tstsEl("p", { className: "text-gray-800 font-semibold text-center mb-5" }, String(msg || "Choose an option"));
      var list = window.tstsEl("div", { className: "space-y-2" });
      var modal = window.tstsEl("div", { className: "bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 transform scale-95 opacity-0 transition-all duration-200" }, [message, list]);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      var closing = false;
      var cleanup = function (result) {
        if (closing) return; closing = true;
        overlay.classList.remove("opacity-100"); overlay.classList.add("opacity-0");
        modal.classList.remove("scale-100", "opacity-100"); modal.classList.add("scale-95", "opacity-0");
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(result); }, 200);
      };
      choices.forEach(function (opt) {
        // sir 2026-08-07: a choice that is no longer available must GREY OUT and say why, rather than
        // vanish or fail when pressed — "the option will grey out with cealr msg that the ycan [not]
        // modify this anymore". `disabled` and `note` are OPTIONAL: every existing caller passes
        // neither, so their dialogs render exactly as before.
        var off = !!(opt && opt.disabled);
        var btn = window.tstsEl("button", {
          type: "button",
          disabled: off,
          className: off
            ? "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 font-semibold text-center cursor-not-allowed"
            : "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-800 font-semibold hover:bg-gray-50 transition text-center"
        }, String(opt.label || opt.value || ""));
        if (!off) btn.addEventListener("click", function () { cleanup(opt); });
        list.appendChild(btn);
        if (opt && opt.note) {
          list.appendChild(window.tstsEl("p", { className: "text-xs text-gray-500 text-center px-2 -mt-1" }, String(opt.note)));
        }
      });
      var cancelBtn = window.tstsEl("button", { type: "button", className: "w-full mt-1 px-4 py-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition text-center" }, "Cancel");
      cancelBtn.addEventListener("click", function () { cleanup(null); });
      list.appendChild(cancelBtn);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        overlay.classList.remove("opacity-0"); overlay.classList.add("opacity-100");
        modal.classList.remove("scale-95", "opacity-0"); modal.classList.add("scale-100", "opacity-100");
      }); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) cleanup(null); });
      document.addEventListener("keydown", function handler(e) { if (e.key === "Escape") { document.removeEventListener("keydown", handler); cleanup(null); } });
    });
  }
  return new Promise(function(resolve) {
    var options = opts || {};
    var confirmText = options.confirmText || "Confirm";
    var cancelText = options.cancelText || "Cancel";
    var isDestructive = options.destructive === true;

    var overlay = window.tstsEl("div", {
      className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200"
    });

    // Owner 2026-08-02 (sir): no icon — the question-circle sat left-aligned against the centered text.
    var message = window.tstsEl("p", { className: "text-gray-700 text-center mb-6" }, String(msg || "Are you sure?"));

    // sir 2026-08-07: "why o saw ugly popup for privat request acctance ad not proper pop up with card
    // layout as i approved for bookings tab with key inform on date nad time". A money decision must
    // show WHAT is being decided, in the approved Bookings-tab card language — orange date badge,
    // title, then the facts — not a bare line of text. Pass opts.card to get it.
    var cardEl = null;
    if (opts && opts.card && typeof opts.card === "object") {
      var c = opts.card;
      var mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var ymd = String(c.date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      var mon = ymd ? (mNames[parseInt(ymd[2], 10) - 1] || "--") : "--";
      var day = ymd ? String(parseInt(ymd[3], 10)) : "--";
      var lines = [];
      if (c.title) lines.push(window.tstsEl("p", { className: "font-bold text-tsts-ink truncate" }, String(c.title)));
      if (c.when) lines.push(window.tstsEl("p", { className: "text-sm text-gray-600 mt-0.5" }, String(c.when)));
      if (c.who) lines.push(window.tstsEl("p", { className: "text-sm text-gray-500 mt-0.5" }, String(c.who)));
      if (c.money) lines.push(window.tstsEl("p", { className: "text-sm font-bold text-tsts-ink mt-1" }, String(c.money)));
      cardEl = window.tstsEl("div", {
        className: "bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 mb-5 text-left"
      }, [
        window.tstsEl("div", { className: "bg-orange-50 text-orange-600 w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-orange-100 flex-shrink-0" }, [
          window.tstsEl("span", { className: "text-xs font-bold uppercase" }, mon),
          window.tstsEl("span", { className: "text-xl font-bold" }, day)
        ]),
        window.tstsEl("div", { className: "min-w-0" }, lines)
      ]);
    }

    var cancelBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition",
      type: "button"
    }, cancelText);

    var confirmBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl font-medium transition " + (isDestructive ? "bg-red-600 text-white hover:bg-red-700" : "tsts-btn-primary"),
      type: "button"
    }, confirmText);

    // A caller passing cancelText:"" is showing something to READ, not a choice to make — a "Cancel"
    // button beside "Close" offers a second way out of a dialog that decides nothing. Gated on the
    // explicit empty string, so all 45 other callers (every one names its cancel label) are untouched.
    var __hideCancel = (options.cancelText === "");
    var buttons = window.tstsEl("div", { className: "flex gap-3" }, __hideCancel ? [confirmBtn] : [cancelBtn, confirmBtn]);

    var modal = window.tstsEl("div", {
      className: "bg-white rounded-2xl shadow-xl w-full p-6 transform scale-95 opacity-0 transition-all duration-200 " + (cardEl ? "max-w-md" : "max-w-sm")
    }, cardEl ? [cardEl, message, buttons] : [message, buttons]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.classList.remove("opacity-0");
        overlay.classList.add("opacity-100");
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
      });
    });

    var cleanup = function(result) {
      overlay.classList.remove("opacity-100");
      overlay.classList.add("opacity-0");
      modal.classList.remove("scale-100", "opacity-100");
      modal.classList.add("scale-95", "opacity-0");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }, 200);
    };

    cancelBtn.addEventListener("click", function() { cleanup(false); });
    confirmBtn.addEventListener("click", function() { cleanup(true); });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handler);
        cleanup(false);
      }
    });

    // Focus trap
    confirmBtn.focus();
  });
};

// WS-FE-09: Branded prompt modal (replaces prompt())
window.tstsPrompt = function(msg, defaultValue, opts) {
  return new Promise(function(resolve) {
    var options = opts || {};
    var confirmText = options.confirmText || "Submit";
    var cancelText = options.cancelText || "Cancel";
    var placeholder = options.placeholder || "";
    var minLength = options.minLength || 0;

    var overlay = window.tstsEl("div", {
      className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200"
    });

    // Owner 2026-08-02 (sir): NO icon on prompt dialogs — same ruling as tstsConfirm
    // ("get rid of it… you never learn"). The message speaks for itself.
    var message = window.tstsEl("p", { className: "text-gray-700 text-center mb-4 font-semibold" }, String(msg || "Enter value:"));

    // Owner 2026-08-02 (sir): explanations need real writing room ("provide proper
    // space to write a 250 words explanation") — multiline renders a tall textarea.
    var isMultiline = options.multiline === true;
    var inputType = options.inputType || "text";
    var input;
    if (isMultiline) {
      input = window.tstsEl("textarea", {
        rows: "7",
        className: "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition mb-2 text-sm leading-relaxed"
      });
      // resize-y is not in the compiled sheet, so the constraint is set directly.
      input.style.resize = "vertical";
      input.placeholder = placeholder;
      input.value = String(defaultValue || "");
    } else {
      input = window.tstsEl("input", {
        type: inputType,
        className: "w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition mb-2",
        placeholder: placeholder,
        value: String(defaultValue || "")
      });
    }

    var errorEl = window.tstsEl("p", { className: "text-red-500 text-xs mb-4 h-4" });

    var cancelBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition",
      type: "button"
    }, cancelText);

    var submitBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl tsts-btn-primary font-medium transition",
      type: "button"
    }, confirmText);

    var buttons = window.tstsEl("div", { className: "flex gap-3" }, [cancelBtn, submitBtn]);

    var modal = window.tstsEl("div", {
      className: "bg-white rounded-2xl shadow-xl " + (isMultiline ? "max-w-md" : "max-w-sm") + " w-full p-6 transform scale-95 opacity-0 transition-all duration-200"
    }, [message, input, errorEl, buttons]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.classList.remove("opacity-0");
        overlay.classList.add("opacity-100");
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
      });
    });

    var cleanup = function(result) {
      overlay.classList.remove("opacity-100");
      overlay.classList.add("opacity-0");
      modal.classList.remove("scale-100", "opacity-100");
      modal.classList.add("scale-95", "opacity-0");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }, 200);
    };

    var validate = function() {
      var val = String(input.value || "").trim();
      if (minLength > 0 && val.length < minLength) {
        errorEl.textContent = "Must be at least " + minLength + " characters";
        return null;
      }
      errorEl.textContent = "";
      return val;
    };

    cancelBtn.addEventListener("click", function() { cleanup(null); });
    submitBtn.addEventListener("click", function() {
      var val = validate();
      if (val !== null) cleanup(val);
    });
    input.addEventListener("keydown", function(e) {
      // In a textarea, Enter makes a new line — submit stays on the button.
      if (e.key === "Enter" && !isMultiline) {
        var val = validate();
        if (val !== null) cleanup(val);
      }
    });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) cleanup(null);
    });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handler);
        cleanup(null);
      }
    });

    // Focus input
    input.focus();
    input.select();
  });
};

// === OTP_DUAL_AUTH_V1: Universal OTP verification flow ===
window.tstsOtpVerify = function(purpose, opts) {
  var options = opts || {};
  var meta = options.meta || {};
  var message = options.message || "For your security, we need to verify this action.";
  var actionLabel = options.actionLabel || "Verify";

  return (async function() {
    // Step 1: Request OTP
    try {
      var reqBody = { purpose: purpose };
      if (meta && typeof meta === "object" && Object.keys(meta).length > 0) reqBody.meta = meta;
      var reqRes = await window.authFetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
      var reqData = await reqRes.json().catch(function() { return {}; });
      if (!reqRes.ok || !reqData || reqData.ok !== true) {
        var errMsg = (reqData && reqData.message) ? reqData.message : "Could not send verification code.";
        if (window.tstsNotify) window.tstsNotify(errMsg, "error");
        return null;
      }
      var otpSessionId = (reqData.data && reqData.data.otpSessionId) ? reqData.data.otpSessionId : null;
      if (!otpSessionId) {
        if (window.tstsNotify) window.tstsNotify("Could not initiate verification.", "error");
        return null;
      }
      if (window.tstsNotify) window.tstsNotify("A verification code has been sent to your email.", "success");
    } catch (e) {
      if (window.tstsNotify) window.tstsNotify("Could not send verification code. Please try again.", "error");
      return null;
    }

    // Step 2 + 3: the site's STANDARD code dialog (owner-ordered 2026-08-04, sir:
    // "OTP box must be standard and how i approved it earlier"). Same six-digit
    // boxes as the approved check-in modal: auto-advance, backspace steps back,
    // arrows move, paste fills all six. Wrong codes show an inline sentence and
    // clear the boxes; the dialog never closes and reopens between attempts.
    return await new Promise(function (resolveDialog) {
      var El = window.tstsEl;
      var openedAt = Date.now();
      var busy = false;

      function close(result) {
        document.removeEventListener("keydown", onKey, true);
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        resolveDialog(result);
      }
      function onKey(ev) { if (ev && ev.key === "Escape" && !busy) { ev.stopPropagation(); close(null); } }

      var boxes = [];
      function codeValue() { return boxes.map(function (b) { return (b.value || "").replace(/\D/g, ""); }).join(""); }
      function clearBoxes() { boxes.forEach(function (b) { b.value = ""; }); boxes[0].focus(); }
      var boxRow = El("div", { className: "flex items-center justify-between gap-2", role: "group", "aria-label": "Verification code" });
      for (var bi = 0; bi < 6; bi++) {
        (function (idx) {
          var box = El("input", {
            type: "text", inputmode: "numeric", maxLength: 1,
            className: "w-12 h-14 border border-slate-200 rounded-xl focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none text-center text-2xl font-mono",
            "aria-label": "Digit " + (idx + 1)
          });
          if (idx === 0) box.autocomplete = "one-time-code";
          box.addEventListener("input", function () {
            box.value = box.value.replace(/\D/g, "").slice(0, 1);
            if (box.value && idx < 5) boxes[idx + 1].focus();
          });
          box.addEventListener("keydown", function (e) {
            if (e.key === "Backspace" && !box.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ""; e.preventDefault(); }
            if (e.key === "ArrowLeft" && idx > 0) boxes[idx - 1].focus();
            if (e.key === "ArrowRight" && idx < 5) boxes[idx + 1].focus();
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          });
          box.addEventListener("paste", function (e) {
            var text = String((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6);
            if (!text) return;
            e.preventDefault();
            for (var i = 0; i < 6; i++) boxes[i].value = text[i] || "";
            boxes[Math.min(text.length, 5)].focus();
          });
          boxes.push(box);
          boxRow.appendChild(box);
        })(bi);
      }

      var errEl = El("p", { className: "text-red-500 text-xs h-4 mt-2" });
      var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Cancel" });
      var okBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: String(actionLabel) });
      cancelBtn.addEventListener("click", function () { if (!busy) close(null); });
      okBtn.addEventListener("click", function () { submit(); });

      async function submit() {
        if (busy || Date.now() - openedAt < 350) return;
        var code = codeValue();
        if (!/^\d{6}$/.test(code)) { errEl.textContent = "Enter all six digits of the code."; return; }
        busy = true;
        okBtn.disabled = true;
        okBtn.textContent = "Checking…";
        try {
          var verRes = await window.authFetch("/api/auth/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ otpSessionId: otpSessionId, code: code })
          });
          var verData = await verRes.json().catch(function (parseErr) { void parseErr; return null; });
          if (verRes.ok && verData && verData.ok === true && verData.data && verData.data.otpToken) {
            close(verData.data.otpToken);
            return;
          }
          // BUG-040 semantics kept: a locked session can never succeed, so the
          // dialog closes and asks for a fresh start.
          if (verData && verData.data && verData.data.requestNewCode === true) {
            if (window.tstsNotify) window.tstsNotify("That code has expired. Start the action again and we'll email you a fresh one.", "error");
            close(null);
            return;
          }
          var remaining = (verData && verData.data && typeof verData.data.attemptsRemaining === "number") ? verData.data.attemptsRemaining : null;
          if (remaining !== null && remaining <= 0) {
            if (window.tstsNotify) window.tstsNotify("Too many wrong codes. Start the action again and we'll email you a fresh one.", "error");
            close(null);
            return;
          }
          errEl.textContent = remaining !== null
            ? ("That code doesn't match. " + (remaining === 1 ? "One try left." : (remaining + " tries left.")))
            : "That code doesn't match. Check the email and try again.";
          clearBoxes();
        } catch (verErr) {
          void verErr;
          errEl.textContent = "We couldn't check the code. Please try again.";
        }
        busy = false;
        okBtn.disabled = false;
        okBtn.textContent = String(actionLabel);
      }

      var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-md p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": "Confirm it's you" }, [
        El("div", {}, [
          El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Confirm it's you" }),
          El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(message) })
        ]),
        El("p", { className: "text-xs font-bold text-gray-500", textContent: "Enter the 6-digit code we've emailed you" }),
        El("div", {}, [boxRow, errEl]),
        El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, okBtn])
      ]);
      panel.style.maxHeight = "85vh";
      panel.style.overflowY = "auto";
      var overlay = El("div", { className: "fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" }, [panel]);
      overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay && !busy) close(null); });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(overlay);
      boxes[0].focus();
    });
  })();
};
// === END OTP_DUAL_AUTH_V1 ===

// WS-FE-04: Dev guard - throws if helpers are missing (catches load order issues)
(function() {
  var isDev = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  if (isDev) {
    window.__TSTS_ASSERT_HELPERS__ = function() {
      if (!window.tstsEl) throw new Error("TSTS: common.js not loaded - tstsEl missing");
      if (!window.tstsSafeUrl) throw new Error("TSTS: common.js not loaded - tstsSafeUrl missing");
      if (!window.tstsSafeImg) throw new Error("TSTS: common.js not loaded - tstsSafeImg missing");
    };
  }
})();

(function () {
  (function ensureLocalIconCss() {
    try {
      const id = "tsts-icon-font";
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "/css/icon-font.css?v=20260209";
      link.referrerPolicy = "no-referrer";
      document.head.appendChild(link);
    } catch (_) {}
  })();

  const isLocal = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  const runtimeCfg = (window.__TSTS_RUNTIME__ && typeof window.__TSTS_RUNTIME__ === "object")
    ? window.__TSTS_RUNTIME__
    : {};
  const runtimeApiBase = String(runtimeCfg.apiBase || runtimeCfg.API_BASE || "").trim().replace(/\/$/, "");
  const runtimeCloudinaryUrl = String(runtimeCfg.cloudinaryUrl || runtimeCfg.CLOUDINARY_URL || "").trim();

  // Optional override for QA:
  // localStorage.setItem("API_BASE", "http://localhost:4000");
  const storedBase = (() => {
    try { return localStorage.getItem("API_BASE") || ""; } catch (_) { return ""; }
  })();
  const storedCloudinary = (() => {
    try { return localStorage.getItem("CLOUDINARY_URL") || ""; } catch (_) { return ""; }
  })();

  // Runtime config priority: localStorage override > runtime config > local default > same-origin relative
  // Local default must match the current hostname to avoid cookie domain mismatch (localhost vs 127.0.0.1).
  const localDefaultApi = isLocal
    ? ((location.hostname === "127.0.0.1") ? "http://127.0.0.1:4000" : "http://localhost:4000")
    : "";
  let apiOrigin = String(storedBase || runtimeApiBase || localDefaultApi).trim().replace(/\/$/, "");
  if (apiOrigin && /\/api$/i.test(apiOrigin)) apiOrigin = apiOrigin.replace(/\/api$/i, "");
  if (apiOrigin && apiOrigin.charAt(0) === "/") apiOrigin = "";
  window.API_BASE = apiOrigin;
  // Cloudinary config (single-truth; used by profile.js / host.js)
  window.CLOUDINARY_URL = String(window.CLOUDINARY_URL || runtimeCloudinaryUrl || storedCloudinary || "").trim();

  // === CAT-001: Locked Category Pillars (slugs + labels; single source of truth) ===
  // Rules:
  // - Stable internal keys are slugs.
  // - Display labels are separate from keys.
  // - Legacy 3-pillar values (Culture/Food/Nature) are normalized for backward compatibility.
  (function initCategoryPillars() {
    const CATS = [
      {
        slug: "food-gatherings",
        label: "Food & Gatherings",
        teaser: "Shared tables. Real conversations.",
        icon: "fa-utensils",
        image: "/assets/categories/food-gatherings.jpg",
        blurb: "Shared meals as social glue: supper clubs, beach BBQs, community brunches, coffee circles, and cultural food rituals."
      },
      {
        slug: "explore-outdoors",
        label: "Explore & Outdoors",
        teaser: "Walk the land. Share the moment.",
        icon: "fa-mountain",
        image: "/assets/categories/explore-outdoors.jpg",
        blurb: "Coastal walks, scenic trails, picnics, foraging, and light adventures designed for connection, not tourism."
      },
      {
        slug: "culture-stories",
        label: "Culture & Stories",
        teaser: "Where tradition meets the present.",
        icon: "fa-book-open",
        image: "/assets/categories/culture-stories.jpg",
        blurb: "Heritage nights, cultural rituals, seasonal traditions, and storytelling circles built with respect and belonging."
      },
      {
        slug: "social-nights",
        label: "Social & Nights",
        teaser: "Meet new faces after sunset.",
        icon: "fa-moon",
        image: "/assets/categories/social-nights.jpg",
        blurb: "Rooftop gatherings, trivia nights, open mic socials, and relaxed after-hours meetups with curated energy."
      },
      {
        slug: "move-wellness",
        label: "Move & Wellness",
        teaser: "Move your body. Reset your mind.",
        icon: "fa-spa",
        image: "/assets/categories/move-wellness.jpg",
        blurb: "Beach yoga, group runs, breathwork, outdoor fitness, and calm reset circles that feel safe and inclusive."
      },
      {
        slug: "create-express",
        label: "Create & Express",
        teaser: "Make something. Share something.",
        icon: "fa-paint-brush",
        image: "/assets/categories/create-express.jpg",
        blurb: "Art sessions, music jams, pottery, photography walks, and writing circles designed to unlock creative flow."
      },
      {
        slug: "learn-passion",
        label: "Learn & Passion",
        teaser: "Curiosity brings people together.",
        icon: "fa-lightbulb",
        image: "/assets/categories/learn-passion.jpg",
        blurb: "Books and coffee circles, skill-sharing, hobby clubs, and micro-talks that turn interests into community."
      },
      {
        slug: "games-play",
        label: "Games & Play",
        teaser: "Fun brings strangers closer.",
        icon: "fa-dice",
        image: "/assets/categories/games-play.jpg",
        blurb: "Board games, casual sports, lawn games, and playful socials where laughter does the connecting."
      }
    ];

    const LEGACY_TO_SLUG = Object.freeze({
      Culture: "culture-stories",
      Food: "food-gatherings",
      Nature: "explore-outdoors"
    });

    const bySlug = Object.create(null);
    for (const c of CATS) bySlug[c.slug] = c;

    function normalize(raw) {
      const s0 = String(raw || "").trim();
      if (!s0) return "";
      // Case-insensitive legacy mapping
      const low = s0.toLowerCase();
      let mapped = "";
      for (const k of Object.keys(LEGACY_TO_SLUG)) {
        if (k.toLowerCase() === low) { mapped = LEGACY_TO_SLUG[k]; break; }
      }
      const s = (mapped || s0).trim();
      return bySlug[s] ? s : "";
    }

    window.TSTS_CATEGORIES = Object.freeze(CATS.map((c) => Object.freeze({ ...c })));

    window.tstsNormalizeCategory = function(v) {
      return normalize(v);
    };
    window.tstsCategoryMeta = function(v) {
      const slug = normalize(v);
      return slug ? bySlug[slug] : null;
    };
    window.tstsCategoryLabel = function(v) {
      const m = window.tstsCategoryMeta(v);
      return m ? m.label : String(v || "").trim();
    };
  })();


  // === SEC-002: Cookie-based auth (no localStorage tokens) ===
  // CSRF token is in cookie (non-HttpOnly) - read directly for double-submit pattern
  // This ensures CSRF works across tabs (cookies are shared, sessionStorage is not)
  
  const CSRF_COOKIE_NAME = window.__TSTS_CSRF_COOKIE__ || "tsts_csrf";
  const FRONT_AUTH_HINT_COOKIE = "tsts_fe_auth_hint";
  const FRONT_AUTH_HINT_MAX_AGE_SEC = 60 * 60 * 24 * 7;
  const CSRF_STORAGE_KEY = "tsts_csrf_token";
  
  // SEC-002: Response unwrapper helper for normalized { ok, data } responses
  window.tstsUnwrap = function(payload) {
    if (payload && payload.data !== undefined) return payload.data;
    return payload;
  };

  // BUG-084 (2026-05-15): surface malformed-payload regressions instead of silently
  // returning empty objects/arrays. Prior behavior masked backend contract drift —
  // e.g., handler 5xx body, expired-session 401 body, or an ok:false envelope —
  // showed up as a blank screen instead of a clear "something's wrong" signal.
  //
  // Implementation: always warn to console; rate-limit user-facing toast to 1 per 5s
  // (per origin tab) so we never flood the user with the same error.
  var __TSTS_UNWRAP_TOAST_COOLDOWN_MS = 5 * 1000;
  var __tstsUnwrapLastToastTs = 0;
  function __tstsToastMalformedPayload(reason) {
    var now = Date.now();
    if (now - __tstsUnwrapLastToastTs < __TSTS_UNWRAP_TOAST_COOLDOWN_MS) return;
    __tstsUnwrapLastToastTs = now;
    try {
      if (typeof window.tstsNotify === "function") {
        window.tstsNotify("Something didn't load correctly. Please refresh if you see missing content.", "error");
      }
    } catch (_toastErr) { /* notify itself broken — already-warned via console */ }
    try {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[tsts] malformed API payload — " + reason);
      }
    } catch (_logErr) { /* ignore */ }
  }

  window.unwrapApiPayload = function(d) {
    if (!d || typeof d !== "object") {
      __tstsToastMalformedPayload("expected object envelope, got " + (typeof d));
      return {};
    }
    if (d.ok === false) {
      // Caller treated an error envelope as success. Surface the contract miss.
      var errCode = (d && typeof d.error === "string") ? d.error : "UNKNOWN_ERROR";
      __tstsToastMalformedPayload("ok:false envelope unwrapped — error=" + errCode);
    }
    if (d.data && typeof d.data === "object") return d.data;
    return d;
  };
  window.unwrapApiList = function(d, key) {
    var root = window.unwrapApiPayload(d);
    if (key && Array.isArray(root[key])) return root[key];
    if (Array.isArray(root)) return root;
    if (Array.isArray(d)) return d;
    // No array found anywhere — likely a contract miss the caller asked for an array on.
    if (d && typeof d === "object") {
      __tstsToastMalformedPayload("expected list under key=" + (key || "<root>") + " but got " + typeof root);
    }
    return [];
  };

  function __getStoredCsrfToken() {
    try { return String(localStorage.getItem(CSRF_STORAGE_KEY) || ""); } catch (_) { return ""; }
  }

  function __setStoredCsrfToken(v) {
    try {
      const s = String(v || "").trim();
      if (s) localStorage.setItem(CSRF_STORAGE_KEY, s);
      else localStorage.removeItem(CSRF_STORAGE_KEY);
    } catch (_) {}
  }

  function __setFrontendAuthHintCookie() {
    try {
      document.cookie = FRONT_AUTH_HINT_COOKIE + "=1; Path=/; Max-Age=" + String(FRONT_AUTH_HINT_MAX_AGE_SEC) + "; SameSite=Lax";
    } catch (_) {}
  }

  function __clearFrontendAuthHintCookie() {
    try {
      document.cookie = FRONT_AUTH_HINT_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (_) {}
  }

  // CSRF token strategy:
  // Cookie is the ONLY authoritative source (server-set, HttpOnly:false, has maxAge).
  // If cookie is absent (expired or cleared), return "" to trigger GET /api/csrf recovery
  // in authFetch. Do NOT fall back to localStorage, stale localStorage values cause
  // CSRF_MISSING rejections because the server validates header vs cookie (double-submit
  // pattern requires both to be present and matching).
  function __getCsrfToken() {
    try {
      const cookies = String(document.cookie || "");
      const parts = cookies.split(";");
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part.startsWith(CSRF_COOKIE_NAME + "=")) {
          const v = decodeURIComponent(part.slice(CSRF_COOKIE_NAME.length + 1));
          if (v) return v;
        }
      }
    } catch (_) {}
    return "";
  }

  async function __refreshCsrfToken(base) {
    try {
      const b = String(base || "").replace(/\/$/, "");
      const url = b + "/api/csrf";
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, { method: "GET", credentials: "include", signal: controller.signal });
        if (!res || !res.ok) return "";
        const payload = await res.json().catch(() => ({}));
        const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
        const token = (unwrapped && unwrapped.csrfToken) ? unwrapped.csrfToken : (payload && payload.csrfToken);
        const s = String(token || "").trim();
        if (s) __setStoredCsrfToken(s);
        return s;
      } finally {
        clearTimeout(t);
      }
    } catch (_) {
      return "";
    }
  }

  // setAuth stores non-sensitive UI user data + CSRF token (public) for cross-origin CSRF header use.
  window.setAuth = function (csrfToken, user) {
    try {
      if (user != null) {
        localStorage.setItem("tsts_user", JSON.stringify(user));
        __setFrontendAuthHintCookie();
      } else {
        localStorage.removeItem("tsts_user");
        __clearFrontendAuthHintCookie();
      }

      __setStoredCsrfToken(csrfToken);

      // Clean up legacy keys
      try { localStorage.removeItem("token"); } catch (_) {}
      try { localStorage.removeItem("user"); } catch (_) {}
    } catch (_) {}
  };

  // Deprecated: auth token is now in HttpOnly cookie, not accessible to JS
  window.getAuthToken = function () {
    return ""; // Token is in HttpOnly cookie, not accessible
  };

  // FE-019: Clear all auth state on logout
  // Note: CSRF cookie is cleared by backend on logout, not by frontend
  //
  // BUG-082 (2026-05-15): cross-tab logout propagation.
  // When a user signs out in one tab, all other open tabs of the same origin must clear
  // their auth state too. Without this, tab B keeps a stale `tsts_user` + CSRF token and
  // shows the user as still-logged-in until the next 401 (which routes to login but loses
  // any in-progress work). Industry standard: Google / GitHub / Linear broadcast logout.
  //
  // Transport: BroadcastChannel preferred (modern browsers). Storage-event fallback covers
  // Safari ≤15 + private windows where BroadcastChannel is restricted. Both are same-origin
  // by spec — no XSS surface.
  var TSTS_AUTH_CHANNEL_NAME = "tsts-auth";
  var TSTS_LOGOUT_STORAGE_KEY = "tsts_logout_broadcast_ts";
  var __tstsAuthBroadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      __tstsAuthBroadcastChannel = new BroadcastChannel(TSTS_AUTH_CHANNEL_NAME);
    }
  } catch (_bcErr) {
    __tstsAuthBroadcastChannel = null;
  }

  function __doLocalClearAuth() {
    try {
      localStorage.removeItem("tsts_user");
      localStorage.removeItem(CSRF_STORAGE_KEY);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      __clearFrontendAuthHintCookie();
    } catch (_clearErr) {
      // Storage may be disabled (Safari private mode); auth is still cleared via cookie expiry on next request.
    }
  }

  function __broadcastLogout() {
    var payload = { type: "tsts:logout", ts: Date.now() };
    try {
      if (__tstsAuthBroadcastChannel) {
        __tstsAuthBroadcastChannel.postMessage(payload);
      }
    } catch (_postErr) {
      // BroadcastChannel may close mid-flight; storage fallback still fires below.
    }
    try {
      // Storage-event fallback: setting a value triggers 'storage' event in OTHER tabs only
      // (not the writing tab — perfect for cross-tab signaling).
      localStorage.setItem(TSTS_LOGOUT_STORAGE_KEY, String(payload.ts));
    } catch (_storageSetErr) {
      // No-op; if storage is blocked the user only has one tab anyway.
    }
  }

  window.clearAuth = function (options) {
    var suppressBroadcast = !!(options && options._suppressBroadcast);
    __doLocalClearAuth();
    if (!suppressBroadcast) __broadcastLogout();
  };

  // Receivers — wired once at module-load.
  function __onCrossTabLogout() {
    try {
      // Suppress broadcast on the receive path to avoid storms.
      window.clearAuth({ _suppressBroadcast: true });
      // Dispatch a custom event pages can opt into (e.g., my-bookings.html shows a
      // "you've been signed out elsewhere" toast, redirect to /login, etc.).
      try {
        if (typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("tsts:auth-logout", { detail: { reason: "cross-tab" } }));
        }
      } catch (_evtErr) {
        // IE / very old Safari without CustomEvent constructor — acceptable to skip.
      }
    } catch (_handlerErr) {
      // Defense in depth — receiver must not throw, or other listeners on the same event break.
    }
  }
  try {
    if (__tstsAuthBroadcastChannel) {
      __tstsAuthBroadcastChannel.addEventListener("message", function (event) {
        var data = event && event.data;
        if (data && data.type === "tsts:logout") __onCrossTabLogout();
      });
    }
  } catch (_bcListenErr) { /* ignore */ }
  try {
    window.addEventListener("storage", function (event) {
      if (event && event.key === TSTS_LOGOUT_STORAGE_KEY && event.newValue) __onCrossTabLogout();
    });
  } catch (_storageListenErr) { /* ignore */ }

  window.getAuthUser = function () {
    try {
      const newUser = localStorage.getItem("tsts_user");
      if (newUser) return JSON.parse(newUser);
      return {};
    } catch (_) { return {}; }
  };

  function normalizePath(path) {
    if (!path) return "/";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return "/" + path;
    return path;
  }
  
  // Idempotency key helper: generates a unique key per element (reusable on retry).
  // Usage: window.tstsIdempotencyKey(buttonElement), returns the same key if called again on the same element.
  //
  // BUG-078 (2026-05-15): cached key now opt-out via `{ forceFresh: true }` second arg.
  // The cache exists so a network-timeout retry sends the SAME key (server-side dedup).
  // But if the user EDITS the form between attempts (e.g., changes guest count, removes
  // a failing promo), the cached key replays the ORIGINAL payload's response on the
  // server side — wrong booking total committed OR stale 4xx error returned forever.
  // Callers should:
  //   (a) call window.clearTstsIdempotencyKey(element) when payload-affecting inputs change
  //   (b) call window.clearTstsIdempotencyKey(element) after a 4xx body-error response
  //   (c) OR pass { forceFresh: true } to mint a brand-new key explicitly
  window.tstsIdempotencyKey = function (element, options) {
    var forceFresh = !!(options && options.forceFresh);
    if (!forceFresh && element && element.dataset && element.dataset.idempotencyKey) return element.dataset.idempotencyKey;
    var key = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
    if (element && element.dataset) element.dataset.idempotencyKey = key;
    return key;
  };

  // BUG-078 (2026-05-15): companion helper to invalidate a cached idempotency key.
  // Call after form-payload changes or after a 4xx body-error so the next submit
  // generates a fresh key. Safe to call when no key is cached (no-op).
  window.clearTstsIdempotencyKey = function (element) {
    if (element && element.dataset && element.dataset.idempotencyKey) {
      try { delete element.dataset.idempotencyKey; } catch (delErr) {
        // Some older browsers don't allow delete on dataset; assigning empty achieves the same effect.
        element.dataset.idempotencyKey = "";
      }
    }
  };

  // SEC-002: authFetch uses credentials: "include" for cookie auth
  // SEC-035: Add CSRF header on state-changing requests
  // GUARD: 401 Interceptor with redirect loop guard
  window.authFetch = async function (path, opts) {
    const headers = Object.assign({}, (opts && opts.headers) || {});
    const method = (opts && opts.method) ? String(opts.method).toUpperCase() : "GET";

    const needsCsrf = (method !== "GET" && method !== "HEAD" && method !== "OPTIONS");
    if (needsCsrf) {
      const csrfToken = __getCsrfToken();
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    }

    // Idempotency-Key header support
    if (opts && opts.idempotencyKey) headers["Idempotency-Key"] = String(opts.idempotencyKey);
    
    // RF-05: Do NOT set Content-Type when body is FormData (breaks multipart boundary)
    const body = opts && opts.body;
    const isFormData = (typeof FormData !== "undefined" && body instanceof FormData);
    if (!headers["Content-Type"] && method !== "GET" && !isFormData) headers["Content-Type"] = "application/json";

    const raw = String(path || "");

    // If caller passes a full URL, do not rewrite it.
    if (/^https?:\/\//i.test(raw)) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch(raw, Object.assign({}, opts || {}, { headers, credentials: "include", signal: controller.signal }));
      } finally {
        clearTimeout(t);
      }
    }

    const normalized = raw.startsWith("/") ? raw : ("/" + raw);
    const apiPath = normalized.startsWith("/api/") ? normalized : ("/api" + normalized);

    const base = String(window.API_BASE || "").replace(/\/$/, "");
    const url = base + apiPath;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    try {
      // If CSRF token isn't readable (cross-origin), refresh it via /api/csrf once before state-changing calls.
      if (needsCsrf && !headers["X-CSRF-Token"]) {
        const refreshed = await __refreshCsrfToken(base);
        if (refreshed) headers["X-CSRF-Token"] = refreshed;
      }
      const response = await fetch(url, Object.assign({}, opts || {}, { headers, credentials: "include", signal: controller.signal }));

      // BUG-081 (2026-05-15): single-flight 401 auto-refresh + retry for ALL callers
      // (was: only tstsGetSession's /api/auth/me path retried on 401, host.js/my-bookings.js/profile.js hit hard "session expired").
      // Guards:
      //   (a) opts._skipAutoRefresh prevents infinite recursion on retry
      //   (b) apiPath check prevents recursion when the refresh endpoint itself 401s
      //   (c) __tstsRefreshAccessToken is gated by hasAuthEvidence + cooldown (anonymous visitors don't trigger refresh)
      const optsSafe = opts || {};
      const isRefreshEndpoint = (apiPath === "/api/auth/refresh" || apiPath === "/api/auth/mobile/refresh");
      if (
        response.status === 401 &&
        !optsSafe._skipAutoRefresh &&
        !isRefreshEndpoint &&
        typeof window.__tstsRefreshAccessToken === "function"
      ) {
        try {
          const didRefresh = await window.__tstsRefreshAccessToken();
          if (didRefresh) {
            // Retry once with the freshly-rotated access token + CSRF.
            // _skipAutoRefresh prevents the retry from itself triggering another refresh attempt.
            return await window.authFetch(path, Object.assign({}, optsSafe, { _skipAutoRefresh: true }));
          }
        } catch (refreshErr) {
          // refresh helper threw; fall through and return the original 401 — caller decides.
          try { if (window.console && window.console.warn) window.console.warn("[authFetch] auto-refresh failed:", refreshErr && refreshErr.message); } catch (_logErr) { /* ignore */ }
        }
      }

      // ── STALE AUTH CACHE ON 401 — ADDED 2026-08-22 ON sir's WRITTEN APPROVAL ──────────────────
      // sir, verbatim: **"Yes — fix the stale cache on 401"**.
      //
      // THE DEFECT, measured live with all three read at the same instant: the navbar rendered
      // "Login" (it had re-checked and knew the session was dead), `/api/auth/me` returned **401**,
      // and **`getAuthUser()` still returned a user object** — the cached `tsts_user` was never
      // cleared. `tstsToggleBookmark` auth-gates on that cache (:326), so on an expired session the
      // honest "Sign in to save experiences." branch was SKIPPED, the call went out, came back 401,
      // and the guest was told **"Couldn't update Like. Try again."** — the wrong reason, and a dead
      // end, because every retry 401s until they log in, which that message never suggests.
      //
      // THIS FILE ALREADY KNEW: the BUG-082 note at :2248 describes the same trap for cross-tab
      // logout — *"tab B keeps a stale tsts_user + CSRF token and shows the user as still-logged-in
      // until the next 401"*. That was solved for the cross-tab case; the single-tab expired-session
      // case still had it. So this reuses the SAME cleanup rather than inventing a second one.
      //
      // WHY __doLocalClearAuth() AND NOT JUST removeItem("tsts_user"): a bare removeItem would leave
      // the CSRF token, the legacy keys and the auth-hint cookie behind — a half-clear, which is
      // exactly the kind of inconsistency this session has been fixing elsewhere. The broadcast is
      // deliberately NOT fired: this is a locally-detected dead session, not a user-initiated
      // logout, and every other tab will discover it the same way on its own next call.
      //
      // WHY HERE: the single-flight refresh above has already been tried, and a successful refresh
      // returns early on the retry — so reaching this line with a 401 means the identity itself is
      // rejected.
      //
      // WHY 401 ONLY, AND WHY THAT IS SAFE: the backend splits the two cleanly — **401 is
      // AUTHENTICATION** failure (`AUTH_MISSING` / `INVALID_TOKEN` / `SESSION_REVOKED`,
      // authMiddleware :12685-12707) and **403 is AUTHORISATION** failure (`ACCESS_DENIED`,
      // adminMiddleware :12773) for someone who IS signed in but lacks permission. Checked before
      // writing: 88 × 401 and 95 × 403 across the routes, split along exactly that line. **A valid
      // session hitting a permission wall gets 403 and is never cleared by this.** The refresh
      // endpoint is excluded so a failing refresh cannot wipe state mid-flight.
      if (response.status === 401 && !isRefreshEndpoint) {
        try { __doLocalClearAuth(); } catch (_staleAuthErr) { void _staleAuthErr; }
      }

      // RF-03: Remove redirect logic from authFetch - tstsRequireAuth is the ONLY redirect authority
      // This prevents double-redirects and ensures returnTo is always preserved

      return response;
    } finally {
      clearTimeout(t);
    }
  };

  // Single-truth session probe (cookie-auth); returns { ok, status, user, csrfToken }.
  // Cache: prevents every page calling /api/auth/me multiple times during bootstrap.
  window.tstsGetSession = (function () {
    let inFlight = null;
    let refreshInFlight = null;
    let cache = { ts: 0, ok: false, status: 0, user: null, csrfToken: "" };
    const TTL_MS = 8000;
    const AUTH_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;
    const ME_PROBE_COOLDOWN_MS = 10 * 1000;
    const REFRESH_FAIL_STREAK_MAX = 12;
    const REFRESH_COOLDOWN_STEP_MS = 5 * 1000;
    let refreshCooldownUntil = 0;
    let refreshFailureStreak = 0;
    const REFRESH_COOLDOWN_MAX_MS = 60000;
    const SESSION_KEY_LAST_ME_OK_TS = "tsts_last_me_ok_ts";
    const SESSION_KEY_LOGIN_OK_TS = "tsts_login_ok_ts";
    const SESSION_KEY_REFRESH_COOLDOWN_UNTIL = "tsts_refresh_cooldown_until";
    const SESSION_KEY_REFRESH_FAIL_STREAK = "tsts_refresh_fail_streak";
    const SESSION_KEY_REFRESH_LAST_ATTEMPT_TS = "tsts_refresh_last_attempt_ts";
    const SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL = "tsts_me_probe_cooldown_until";

    function readSessionNumber(key) {
      try {
        const raw = String(window.sessionStorage.getItem(String(key || "")) || "").trim();
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
      } catch (_) {
        return 0;
      }
    }

    function readLocalNumber(key) {
      try {
        const raw = String(window.localStorage.getItem(String(key || "")) || "").trim();
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
      } catch (_) {
        return 0;
      }
    }

    function writeSessionNumber(key, value) {
      try {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) {
          window.sessionStorage.removeItem(String(key || ""));
          return;
        }
        window.sessionStorage.setItem(String(key || ""), String(Math.floor(n)));
      } catch (_) {}
    }

    function writeLocalNumber(key, value) {
      try {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) {
          window.localStorage.removeItem(String(key || ""));
          return;
        }
        window.localStorage.setItem(String(key || ""), String(Math.floor(n)));
      } catch (_) {}
    }

    function readEvidenceNumber(key) {
      return Math.max(readSessionNumber(key), readLocalNumber(key));
    }

    function syncRefreshStateFromStorage() {
      const storedCooldown = readSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL);
      const storedStreak = readSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK);
      if (storedCooldown > refreshCooldownUntil) refreshCooldownUntil = storedCooldown;
      if (storedStreak > refreshFailureStreak) refreshFailureStreak = Math.min(storedStreak, REFRESH_FAIL_STREAK_MAX);
    }

    function parseMe(payload) {
      const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
      const user = (unwrapped && unwrapped.user) ? unwrapped.user : ((payload && payload.user) ? payload.user : (unwrapped || null));
      const csrfToken = (unwrapped && unwrapped.csrfToken) ? unwrapped.csrfToken : ((payload && payload.csrfToken) ? payload.csrfToken : "");
      return { user, csrfToken };
    }

    function hasAuthHint() {
      try {
        const cookie = String(document.cookie || "");
        if (/(^|;\s*)tsts_auth_hint=1(?:;|$)/.test(cookie)) return true;
        if (/(^|;\s*)tsts_fe_auth_hint=1(?:;|$)/.test(cookie)) return true;
      } catch (_) {}
      return false;
    }

    function hasFreshEvidence(key, nowMs) {
      const now = Number(nowMs || Date.now());
      const ts = readEvidenceNumber(key);
      if (!ts) return false;
      return (now - ts) >= 0 && (now - ts) <= AUTH_EVIDENCE_TTL_MS;
    }

    function markAuthEvidence(key, nowMs) {
      const ts = Number(nowMs || Date.now());
      writeSessionNumber(key, ts);
      writeLocalNumber(key, ts);
      __setFrontendAuthHintCookie();
    }

    function hasAuthEvidence(nowMs) {
      const now = Number(nowMs || Date.now());
      if (hasAuthHint()) return true;
      if (hasFreshEvidence(SESSION_KEY_LAST_ME_OK_TS, now)) return true;
      if (hasFreshEvidence(SESSION_KEY_LOGIN_OK_TS, now)) return true;
      return false;
    }

    function isForcedMeProbeCooling(nowMs) {
      const now = Number(nowMs || Date.now());
      return readSessionNumber(SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL) > now;
    }

    function markForcedMeProbe(nowMs) {
      const now = Number(nowMs || Date.now());
      writeSessionNumber(SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL, now + ME_PROBE_COOLDOWN_MS);
    }

    function isRefreshCooldownActive(nowMs) {
      syncRefreshStateFromStorage();
      return refreshCooldownUntil > Number(nowMs || 0);
    }

    function markRefreshFailure(statusCode) {
      const status = Number(statusCode || 0);
      if (!(status === 0 || status === 401 || status === 429)) return;
      syncRefreshStateFromStorage();
      refreshFailureStreak = Math.min(refreshFailureStreak + 1, REFRESH_FAIL_STREAK_MAX);
      const waitMs = Math.min(REFRESH_COOLDOWN_MAX_MS, REFRESH_COOLDOWN_STEP_MS * refreshFailureStreak);
      const now = Date.now();
      refreshCooldownUntil = now + waitMs;
      writeSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK, refreshFailureStreak);
      writeSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL, refreshCooldownUntil);
      writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, now);
    }

    function markRefreshSuccess() {
      refreshFailureStreak = 0;
      refreshCooldownUntil = 0;
      writeSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK, 0);
      writeSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL, 0);
      writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, Date.now());
    }

    async function refreshAccessTokenOnce() {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = (async function () {
        try {
          const now = Date.now();
          if (isRefreshCooldownActive(now)) return false;
          writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, now);
          if (!window.authFetch) return false;
          const res = await window.authFetch("/api/auth/refresh", { method: "POST" });
          if (!res || !res.ok) {
            markRefreshFailure(res ? res.status : 0);
            return false;
          }
          const payload = await res.json().catch(() => ({}));
          const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
          const csrfToken = String((unwrapped && unwrapped.csrfToken) || "");
          if (csrfToken && window.setAuth) {
            const existingUser = (window.getAuthUser && window.getAuthUser()) || null;
            window.setAuth(csrfToken, existingUser && Object.keys(existingUser).length ? existingUser : null);
          }
          markRefreshSuccess();
          return true;
        } catch (_) {
          markRefreshFailure(0);
          return false;
        } finally {
          refreshInFlight = null;
        }
      })();
      return refreshInFlight;
    }

    // BUG-081 (2026-05-15): expose single-flight refresh to authFetch's 401 auto-retry path.
    // Gated by hasAuthEvidence + cooldown so anonymous visitors don't trigger refresh on a stale 401.
    // Returns true if refresh succeeded (caller should retry the original request), false otherwise.
    window.__tstsRefreshAccessToken = async function () {
      try {
        const now = Date.now();
        if (!hasAuthEvidence(now)) return false;
        if (isRefreshCooldownActive(now)) return false;
        return await refreshAccessTokenOnce();
      } catch (_helperErr) {
        return false;
      }
    };

    return async function (opts) {
      const o = opts || {};
      const force = o.force === true;
      const now = Date.now();

      if (!force && cache.ts && (now - cache.ts) < TTL_MS) return cache;
      if (!force && inFlight) return inFlight;

      inFlight = (async function () {
        const out = { ts: Date.now(), ok: false, status: 0, user: null, csrfToken: "" };
        try {
          if (!window.authFetch) return out;
          const hasEvidence = hasAuthEvidence(now);
          if (force && !hasEvidence && isForcedMeProbeCooling(now)) {
            if (cache && cache.ok && cache.user) return cache;
            return out;
          }
          if (force && !hasEvidence) markForcedMeProbe(now);

          let res = await window.authFetch("/api/auth/me", { method: "GET" });
          out.status = res ? res.status : 0;

          if (res && res.ok) {
            const payload = await res.json().catch(() => ({}));
            const parsed = parseMe(payload);
            out.ok = true;
            out.user = parsed.user || null;
            out.csrfToken = String(parsed.csrfToken || "");
            markAuthEvidence(SESSION_KEY_LAST_ME_OK_TS, Date.now());
            try { if (window.setAuth) window.setAuth(out.csrfToken, out.user); } catch (_) {}
            cache = out;
            return cache;
          }

          if (res && (res.status === 401 || res.status === 403)) {
            const shouldTryRefresh = hasAuthEvidence(Date.now()) && !isRefreshCooldownActive(Date.now());
            const refreshed = shouldTryRefresh ? await refreshAccessTokenOnce() : false;
            if (refreshed) {
              res = await window.authFetch("/api/auth/me", { method: "GET" });
              out.status = res ? res.status : 0;
              if (res && res.ok) {
                const retryPayload = await res.json().catch(() => ({}));
                const retryParsed = parseMe(retryPayload);
                out.ok = true;
                out.user = retryParsed.user || null;
                out.csrfToken = String(retryParsed.csrfToken || "");
                markAuthEvidence(SESSION_KEY_LAST_ME_OK_TS, Date.now());
                try { if (window.setAuth) window.setAuth(out.csrfToken, out.user); } catch (_) {}
                cache = out;
                return cache;
              }
            }
            try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
            cache = out;
            return cache;
          }

          // Avoid forced logout on transient rate-limit/network failures.
          if (res && res.status === 429 && cache && cache.ok && cache.user) {
            return cache;
          }

          cache = out;
          return cache;
        } catch (_) {
          if (cache && cache.ok && cache.user) return cache;
          cache = out;
          return cache;
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    };
  })();

  window.tstsMarkLoginOk = function () {
    try {
      const ts = String(Date.now());
      window.sessionStorage.setItem("tsts_login_ok_ts", ts);
      window.localStorage.setItem("tsts_login_ok_ts", ts);
      __setFrontendAuthHintCookie();
    } catch (_) {}
  };

  function tstsParseDateLike(x) {
    try {
      if (!x) return null;
      if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
      const s = String(x).trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    } catch (_) {
      return null;
    }
  }

  // sir's ruling 2026-08-13 ("Fix it — one consistent format"). Asking Intl for a
  // "short" month in en-AU abbreviates August but spells June, July and September
  // out, so one reviews list read "8 Aug 2026" beside "11 July 2026". Every month is
  // now three letters, everywhere. Melbourne timezone unchanged — the parts are read
  // from the same Intl call, so the DAY is still the Melbourne day, never the
  // browser's. This is the single date helper the platform uses (the earlier
  // duplicate at ~line 1145 is superseded by this one and now matches it).
  const TSTS_MONTHS_3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  window.tstsFormatDateShort = function (x) {
    const d = tstsParseDateLike(x);
    if (!d) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-AU", {
        year: "numeric", month: "numeric", day: "numeric", timeZone: "Australia/Melbourne"
      }).formatToParts(d);
      const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
      const day = String(Number(get("day")));
      const mon = TSTS_MONTHS_3[Number(get("month")) - 1] || "";
      const yr = get("year");
      if (!mon || !yr) return d.toDateString();
      return day + " " + mon + " " + yr;
    } catch (_) {
      return d.toDateString();
    }
  };

  window.tstsFormatDateWeekday = function (x) {
    const d = tstsParseDateLike(x);
    if (!d) return "";
    try {
      return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });
    } catch (_) {
      return d.toDateString();
    }
  };
})();

// DOM bootstrap
document.addEventListener("DOMContentLoaded", () => {
  injectNavbar();
  injectFooter();
  injectInlineHelp();
  injectCookieBanner();
  // Only present on cookie-policy.html — a no-op everywhere else, including frozen pages.
  var reopenCookieBtn = document.getElementById("reopen-cookie-preferences-btn");
  if (reopenCookieBtn) {
    reopenCookieBtn.addEventListener("click", function () {
      if (window.tstsReopenCookieBanner) window.tstsReopenCookieBanner();
    });
  }
  if (window.tstsHydrateNavAuth) {
    window.tstsHydrateNavAuth({ force: false }).catch(() => {});
  }
  initMobileMenu();
  setTimeout(function () {
    initGlobalStatusBanner().catch(() => {});
  }, 900);
  hydrateFooterPolicyMeta().catch(() => {});
});

// 1) NAVBAR (single truth) - DOM-safe construction
function injectNavbar() {
  const root = document.getElementById("navbar-placeholder");
  if (!root) return;

  // A11Y: Skip-to-main link (first focusable element on every page)
  if (!document.getElementById("skip-to-main")) {
    var mainEl = document.querySelector("main");
    if (mainEl && !mainEl.id) mainEl.id = "main";
    var skipTarget = (mainEl && mainEl.id) ? mainEl.id : "main";
    var skipLink = tstsEl("a", {
      id: "skip-to-main",
      href: "#" + skipTarget,
      className: "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-orange-600 focus:font-bold"
    }, "Skip to main content");
    // sir 2026-08-22, verbatim: "harden it test it with nothing must change on functionality or
    // look or design". The link was TESTED FIRST and is NOT broken — Tab, Enter, Tab already lands
    // inside <main> on every page, because the browser moves the focus starting point to the
    // fragment by itself. This makes that move EXPLICIT rather than leaning on browser behaviour,
    // which is what screen readers and non-Chrome browsers need.
    //   tabindex="-1" makes <main> focusable ONLY programmatically — it is never added to the Tab
    //   order, so the tab sequence stays exactly what it was.
    //   outline:none is set because <main> computes outline-style:none today; without it a focus
    //   ring could paint around the whole page area, breaching sir's condition on look.
    //   preventScroll keeps scrolling exactly as it is — the hash navigation already scrolls, and a
    //   second scroll from focus() must not change what the reader sees.
    if (mainEl && !mainEl.hasAttribute("tabindex")) {
      mainEl.setAttribute("tabindex", "-1");
      mainEl.style.outline = "none";
    }
    skipLink.addEventListener("click", function () {
      var t = document.getElementById(skipTarget);
      if (!t || typeof t.focus !== "function") return;
      try { t.focus({ preventScroll: true }); } catch (_focusErr) { try { t.focus(); } catch (_e2) { void _e2; } }
    });
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  const logoBadge = tstsEl("span", { className: "inline-flex items-center justify-center h-9 w-9 rounded-full bg-orange-50 border border-orange-100" }, [
    tstsEl("img", { src: "/assets/logo-mark.png", alt: "The Shared Table Story", className: "h-7 w-7 object-contain" })
  ]);
  const logoText = tstsEl("span", { className: "leading-none flex flex-col" }, [
    tstsEl("span", {}, "The Shared Table Story"),
    tstsEl("span", { className: "text-[11px] lg:text-[10px] font-normal text-slate-500 tracking-wide" }, "Bring people together. One story at a time.")
  ]);
  const logo = tstsEl("a", { href: "index.html", className: "text-2xl font-bold text-orange-600 flex items-center gap-2 font-serif" }, [logoBadge, logoText]);
  logo.setAttribute("aria-label", "The Shared Table Story");

  const navHome = tstsEl("a", { href: "index.html", className: "text-gray-600 hover:text-orange-600 font-medium transition whitespace-nowrap" }, "Home");
  const navExplore = tstsEl("a", { href: "explore.html", className: "text-gray-600 hover:text-orange-600 font-medium transition whitespace-nowrap" }, "Explore");
  const dealsIcon = tstsEl("i", { className: "fas fa-fire" });
  const navDeals = tstsEl("a", { href: "explore.html?filter=deals", className: "text-red-600 hover:text-red-700 font-bold transition flex items-center gap-1 whitespace-nowrap" }, [dealsIcon, " Deals"]);
  // sir-approved 2026-08-07 ("Approved — label swap only"): same slot, same destination (the
  // creation wizard) for everyone; applyAuthStateToNav relabels it "Host an Experience" for
  // accounts that already own a listing (user.isHost from /api/auth/me). ids exist for that swap.
  const navHost = tstsEl("a", { id: "nav-host-link", href: "host.html", className: "text-gray-600 hover:text-orange-600 font-medium transition whitespace-nowrap" }, "Become a Host");
  // Post-login return-to-origin (owner-directed 2026-05-23): the Login button carries the
  // current page as returnTo, so after login the user lands back where they were rather than Home.
  const __loginHref = (function () {
    try {
      var page = String((location.pathname || "").split("/").pop() || "").toLowerCase();
      if (page === "login.html" || page === "admin.html" || page === "404.html" || page === "") return "login.html";
      return "login.html?returnTo=" + encodeURIComponent(location.pathname + location.search + location.hash);
    } catch (_) { return "login.html"; }
  })();
  const authDesktop = tstsEl("div", { id: "auth-section-desktop" }, [
    tstsEl("a", { href: __loginHref, className: "tsts-btn-primary px-5 py-2 rounded-full font-medium transition" }, "Login")
  ]);
  const nav = tstsEl("nav", { className: "hidden lg:flex items-center space-x-8" }, [navHome, navExplore, navDeals, navHost, authDesktop]);

  const menuBtn = tstsEl("button", { id: "mobile-menu-btn", className: "lg:hidden text-gray-700 focus:outline-none inline-flex items-center justify-center p-3 -mr-3 -my-3" }, [
    tstsEl("i", { className: "fas fa-bars text-2xl" })
  ]);
  menuBtn.setAttribute("aria-label", "Open menu");

  const container = tstsEl("div", { className: "container mx-auto px-4 py-4 flex justify-between items-center" }, [logo, nav, menuBtn]);

  const mobileHome = tstsEl("a", { href: "index.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Home");
  const mobileExplore = tstsEl("a", { href: "explore.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Explore");
  const mobileDealsIcon = tstsEl("i", { className: "fas fa-fire" });
  const mobileDeals = tstsEl("a", { href: "explore.html?filter=deals", className: "text-red-600 font-bold flex items-center gap-2" }, [mobileDealsIcon, " Deals"]);
  const mobileHost = tstsEl("a", { id: "nav-host-link-mobile", href: "host.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Become a Host");
  const authMobile = tstsEl("div", { id: "auth-section-mobile", className: "pt-4 border-t border-gray-100" }, [
    tstsEl("a", { href: __loginHref, className: "block w-full text-center tsts-btn-primary px-5 py-3 rounded-xl font-medium transition" }, "Login / Sign Up")
  ]);
  const mobileMenuInner = tstsEl("div", { className: "flex flex-col p-4 space-y-4" }, [mobileHome, mobileExplore, mobileDeals, mobileHost, authMobile]);
  const mobileMenu = tstsEl("div", { id: "mobile-menu", className: "hidden lg:hidden bg-white border-t border-gray-100 absolute w-full left-0 shadow-lg" }, [mobileMenuInner]);

  const header = tstsEl("header", { className: "bg-white shadow-sm sticky top-0 z-50" }, [container, mobileMenu]);
  root.appendChild(header);
}

// 2) FOOTER - DOM-safe construction
function injectFooter() {
  const root = document.getElementById("footer-placeholder");
  if (!root) return;

  const col1 = tstsEl("div", {}, [
    tstsEl("div", { className: "flex items-center gap-2 mb-4" }, [
      tstsEl("span", { className: "inline-flex items-center justify-center h-9 w-9 rounded-full bg-orange-50 border border-orange-100" }, [
        tstsEl("img", { src: "/assets/logo-mark.png", alt: "", className: "h-7 w-7 object-contain" })
      ]),
      tstsEl("span", { className: "leading-none flex flex-col" }, [
        tstsEl("h3", { className: "text-2xl font-bold text-orange-500 font-serif" }, "The Shared Table Story"),
        tstsEl("span", { className: "text-[11px] lg:text-[10px] font-normal text-gray-400 tracking-wide mt-1 whitespace-nowrap" }, "Bring people together. One story at a time.")
      ])
    ])
  ]);

  const col2 = tstsEl("div", {}, [
    tstsEl("h4", { className: "font-bold mb-4" }, "Our Story"),
    tstsEl("ul", { className: "space-y-0 lg:space-y-2 text-gray-400 text-sm" }, [
      tstsEl("li", {}, [tstsEl("a", { href: "about.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "About Us")]),
      tstsEl("li", {}, [tstsEl("a", { href: "host.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Become a Host")]),
      tstsEl("li", {}, [tstsEl("a", { href: "help-center.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Help Centre")]),
      tstsEl("li", {}, [tstsEl("a", { href: "mailto:contact@thesharedtablestory.com", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Contact Us")])
    ])
  ]);

  const col3 = tstsEl("div", {}, [
    tstsEl("h4", { className: "font-bold mb-4" }, "Policies & Support"),
    tstsEl("ul", { className: "space-y-0 lg:space-y-2 text-gray-400 text-sm" }, [
      tstsEl("li", {}, [tstsEl("a", { href: "terms.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Terms of Service")]),
      tstsEl("li", {}, [tstsEl("a", { href: "host-terms.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Host Terms")]),
      tstsEl("li", {}, [tstsEl("a", { href: "privacy.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Privacy Policy")]),
      tstsEl("li", {}, [tstsEl("a", { href: "report.html", className: "block py-3 lg:inline lg:py-0 hover:text-white transition" }, "Report an Issue")])
    ])
  ]);

  const grid = tstsEl("div", { className: "container mx-auto px-4 grid md:grid-cols-3 gap-8" }, [col1, col2, col3]);
  const companyInfo = tstsEl("p", { className: "text-gray-500 text-sm" }, "The Shared Table Story PTY LTD | Sunshine Coast");
  const copyrightText = "© " + new Date().getFullYear() + " The Shared Table Story. All rights reserved.";
  const copyright = tstsEl("div", { className: "border-t border-gray-800 mt-12 pt-8 text-center text-gray-500 text-sm space-y-2" }, [tstsEl("p", {}, copyrightText), companyInfo]);
  const footer = tstsEl("footer", { className: "bg-gray-900 text-white py-12 mt-auto" }, [grid, copyright]);
  root.appendChild(footer);
}

// Cookie consent banner, shows once, remembers via localStorage
// sir 2026-08-23, verbatim: "the banner will need updat eto have those three option of accept
// all decline all but minimum whihc still recorde minimum cooking or adjust and x to dimiss
// contrued as cookies being accepted" — real per-category consent, not the old single accepted/
// not-accepted flag. STORAGE_KEY now holds a JSON object, not a bare string, so a real reader
// (this file, and anything gated by consent) can ask "did they actually agree to Analytics" and
// get a real answer instead of an implied one.
//
// Legacy values (the old banner only ever wrote the string "all") are treated as NOT a real
// category choice and re-prompted once — a blanket "accepted" recorded before real per-category
// choice existed is not informed consent to the categories this banner now asks about.
window.tstsGetCookieConsent = function () {
  try {
    var raw = localStorage.getItem("tsts_cookie_consent");
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.necessary === true) return parsed;
    return null;
  } catch (_) {
    return null;
  }
};

function injectCookieBanner() {
  var STORAGE_KEY = "tsts_cookie_consent";
  if (window.tstsGetCookieConsent()) return;

  var setConsent = function (categories) {
    var value = { necessary: true, functional: !!categories.functional, analytics: !!categories.analytics, ts: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (_) {}
    return value;
  };

  var dismissBanner = function () {
    banner.style.transition = "opacity 0.3s ease";
    banner.style.opacity = "0";
    document.body.style.paddingBottom = "";
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 300);
  };

  var acceptAll = function () { setConsent({ functional: true, analytics: true }); dismissBanner(); };
  // sir 2026-08-09, still true, restated 2026-08-23: "x to dimiss contrued as cookies being
  // accepted" — the close control is not a third choice, it is the same outcome as Accept All.
  var dismissAsAccepted = function () { setConsent({ functional: true, analytics: true }); dismissBanner(); };
  var declineAll = function () { setConsent({ functional: false, analytics: false }); dismissBanner(); };

  var inner = tstsEl("div", { className: "max-w-4xl mx-auto px-6 py-4" });

  function renderChoice() {
    inner.textContent = "";
    inner.appendChild(tstsEl("div", { className: "flex flex-col sm:flex-row items-start sm:items-center gap-3" }, [
      tstsEl("p", { className: "text-sm text-slate-700 flex-grow" }, [
        tstsEl("span", {}, "We use cookies to help you get the most out of our platform. By continuing to use this site, you agree to our use of cookies. "),
        tstsEl("a", { href: "cookie-policy.html", className: "underline text-orange-600 hover:text-orange-700" }, "Learn more")
      ]),
      tstsEl("div", { className: "flex items-center gap-2 shrink-0" }, [
        tstsEl("button", { className: "rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 hover:bg-slate-50 transition whitespace-nowrap", "data-action": "adjust" }, "Adjust"),
        tstsEl("button", { className: "rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 hover:bg-slate-50 transition whitespace-nowrap", "data-action": "decline" }, "Decline All"),
        tstsEl("button", { className: "rounded-xl bg-tsts-ink text-white text-sm font-semibold px-5 py-2 hover:opacity-90 transition whitespace-nowrap", "data-action": "accept" }, "Accept All"),
        tstsEl("button", { className: "text-slate-400 hover:text-slate-600 text-lg leading-none px-2 py-1 transition", "aria-label": "Dismiss cookie banner", "data-action": "dismiss" }, "×")
      ])
    ]));
    var b = inner.querySelectorAll("button");
    b[0].addEventListener("click", renderAdjust);
    b[1].addEventListener("click", declineAll);
    b[2].addEventListener("click", acceptAll);
    b[3].addEventListener("click", dismissAsAccepted);
  }

  function renderAdjust() {
    inner.textContent = "";
    var functionalToggle = tstsEl("input", { type: "checkbox", className: "h-4 w-4 rounded" });
    var analyticsToggle = tstsEl("input", { type: "checkbox", className: "h-4 w-4 rounded" });

    function categoryRow(label, desc, toggleEl, locked) {
      return tstsEl("div", { className: "flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0" }, [
        tstsEl("div", {}, [
          tstsEl("p", { className: "text-sm font-semibold text-tsts-ink" }, label),
          tstsEl("p", { className: "text-xs text-slate-500" }, desc)
        ]),
        locked
          ? tstsEl("span", { className: "text-xs font-semibold text-slate-400 shrink-0 pt-1" }, "Always on")
          : tstsEl("span", { className: "shrink-0 pt-1" }, [toggleEl])
      ]);
    }

    inner.appendChild(tstsEl("div", {}, [
      tstsEl("p", { className: "text-sm font-semibold text-tsts-ink mb-2" }, "Manage cookie preferences"),
      categoryRow("Strictly Necessary", "Required for login, security, and booking to work. Can't be turned off.", null, true),
      categoryRow("Functional", "Remembers preferences like saved filters, so we don't ask you twice.", functionalToggle, false),
      categoryRow("Analytics", "Helps us see which experiences and pages are useful, so we can improve them.", analyticsToggle, false),
      tstsEl("div", { className: "flex items-center gap-2 mt-3" }, [
        tstsEl("button", { className: "rounded-xl bg-tsts-ink text-white text-sm font-semibold px-5 py-2 hover:opacity-90 transition", "data-action": "save" }, "Save Preferences"),
        tstsEl("button", { className: "text-sm text-slate-500 hover:text-slate-700 px-2", "data-action": "back" }, "Back")
      ])
    ]));

    inner.querySelector('[data-action="save"]').addEventListener("click", function () {
      setConsent({ functional: functionalToggle.checked, analytics: analyticsToggle.checked });
      dismissBanner();
    });
    inner.querySelector('[data-action="back"]').addEventListener("click", renderChoice);
  }

  renderChoice();

  var banner = tstsEl("div", { className: "bg-white border-t border-slate-200 shadow-soft-card" }, [inner]);
  banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:50;max-height:80vh;overflow-y:auto;";

  document.body.appendChild(banner);
  document.body.style.paddingBottom = "60px";
}

// Real "change your mind later" path, sir's order: NOT the footer (absolute freeze), lives on the
// Cookie Policy page itself instead — the one place a user reconsidering cookies would look.
window.tstsReopenCookieBanner = function () {
  try { localStorage.removeItem("tsts_cookie_consent"); } catch (_) {}
  injectCookieBanner();
};

// Inline help section, collapsible FAQ bar between main and footer on every page
function injectInlineHelp() {
  var footer = document.getElementById("footer-placeholder");
  if (!footer) return;

  // Skip on admin, auth, and utility pages
  var page = (location.pathname || "").split("/").pop() || "";
  var skipPages = {
    "admin.html": 1, "login.html": 1, "404.html": 1,
    "verify-email.html": 1, "verify-email-change.html": 1,
    "reset-password.html": 1, "unsubscribe.html": 1,
    "help-center.html": 1,
    "my-bookings.html": 1, "host.html": 1, "experience.html": 1
  };
  if (skipPages[page]) return;

  // Map page to relevant FAQ IDs for context-aware pre-loading
  var pageContextMap = {
    "experience.html": ["T01","T02","T03","T04","T05"],
    "my-bookings.html": ["G01","G03","G08","G09","G11","G13"],
    "host.html": ["H01","H03","H05","H07","H08"],
    "about.html": ["P01","P02","P04"],
    "explore.html": ["G01","G02","G04","G05","G06"],
    "success.html": ["T01","T02","T03","T06"],
    "connections.html": ["G13","G14"],
    "profile.html": ["G13","P01"],
    "report.html": ["T04","G11","H14"],
    "policy.html": ["T02","T06","G08","G09"],
    "terms.html": ["P01","P04"],
    "privacy.html": ["P08","T05"],
    "host-terms.html": ["H01","H12"],
    "public-profile.html": ["G01","H03"],
    "index.html": ["P01","G01","H01"]
  };
  var contextIds = pageContextMap[page] || ["P01","G01","G13"];

  // Build shell
  var shell = tstsEl("div", { id: "tsts-inline-help", className: "border-t border-slate-200 bg-tsts-cream" });

  // Collapsed bar
  // sir's ruling 2026-08-13: *"no one can figue out that it is link or can be expanded
  // like a plus sign that we have laready"*. A faint \u25BE stranded 1250px away at the far
  // right of a full-width button read as decoration, not as a control. It now uses the
  // platform's OWN expand mark \u2014 window.tstsPlusMinus, the SVG plus/minus sir ordered
  // site-wide on 2026-08-08 \u2014 sitting directly beside the sentence, so the row reads as
  // one openable thing. Flipping the state reuses tstsSetPlusMinus, so the mark cannot
  // shift as it opens.
  var barLabel = tstsEl("span", { className: "text-sm font-semibold text-tsts-ink" }, "Have a question? We\u2019re here to help.");
  var barIcon = window.tstsPlusMinus
    ? window.tstsPlusMinus(false)
    : tstsEl("span", { className: "text-slate-500 text-sm", "aria-hidden": "true" }, "\u25BE");
  if (barIcon.classList) barIcon.classList.add("text-orange-600");
  var toggleBar = tstsEl("button", {
    type: "button",
    className: "w-full px-4 py-3 sm:px-6 flex items-center gap-2 text-left hover:bg-white/40 transition"
  }, [barLabel, barIcon]);
  toggleBar.setAttribute("aria-expanded", "false");
  toggleBar.setAttribute("aria-controls", "tsts-inline-help-panel");

  // Expanded panel (hidden)
  var panel = tstsEl("div", { id: "tsts-inline-help-panel", className: "hidden px-4 sm:px-6 pb-4 space-y-3" });

  // Search input
  var searchInput = tstsEl("input", {
    type: "search",
    placeholder: "Search our FAQs\u2026",
    className: "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition",
    "aria-label": "Search frequently asked questions"
  });

  var resultsList = tstsEl("div", { className: "space-y-2 max-h-80 overflow-y-auto" });

  // Escalation links
  var escalation = tstsEl("div", { className: "flex flex-wrap gap-2 pt-2 border-t border-slate-200 mt-2" }, [
    tstsEl("a", { href: "help-center.html", className: "text-xs font-semibold text-orange-600 hover:text-orange-700" }, "Browse all FAQs"),
    tstsEl("span", { className: "text-xs text-slate-300" }, "\u00B7"),
    tstsEl("a", { href: "report.html", className: "text-xs font-semibold text-slate-600 hover:text-slate-800" }, "Report an issue"),
    tstsEl("span", { className: "text-xs text-slate-300" }, "\u00B7"),
    tstsEl("a", { href: "mailto:contact@thesharedtablestory.com", className: "text-xs font-semibold text-slate-600 hover:text-slate-800" }, "Contact us")
  ]);

  panel.appendChild(searchInput);
  panel.appendChild(resultsList);
  panel.appendChild(escalation);
  var narrowContentPages = {
    "terms.html": 1, "privacy.html": 1, "host-terms.html": 1, "policy.html": 1,
    "cookie-policy.html": 1, "community-guidelines.html": 1, "acceptable-use.html": 1,
    "refund-policy.html": 1
  };
  var innerWrap = tstsEl("div", { className: narrowContentPages[page] ? "max-w-3xl mx-auto" : "max-w-7xl mx-auto" });
  innerWrap.appendChild(toggleBar);
  innerWrap.appendChild(panel);
  shell.appendChild(innerWrap);

  // Insert before footer
  footer.parentNode.insertBefore(shell, footer);

  var faqLoaded = false;

  function loadFaqScripts(cb) {
    if (typeof FAQ_CATALOG !== "undefined") { faqLoaded = true; cb(); return; }
    var scripts = ["data/faq-catalog.js?v=20260304f", "data/faq-trust.js?v=20260304f"];
    var loaded = 0;
    scripts.forEach(function (src) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = s.onerror = function () { loaded++; if (loaded === scripts.length) { faqLoaded = true; cb(); } };
      document.head.appendChild(s);
    });
  }

  function makeAccordion(item) {
    // Shared geometric mark — see window.tstsPlusMinus. Stroke 1.7 because this row's label is
    // regular weight, not bold; the default 2 would read heavier than the text beside it.
    var qIcon = window.tstsPlusMinus(false, { stroke: 1.7 });
    var qIconWrap = tstsEl("span", { className: "text-slate-500 text-base leading-none shrink-0" }, [qIcon]);
    var q = tstsEl("button", {
      type: "button",
      className: "w-full text-left flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-tsts-ink hover:bg-slate-50 transition"
    }, [
      tstsEl("span", { className: "pr-3" }, String(item.question || "")),
      qIconWrap
    ]);
    q.setAttribute("aria-expanded", "false");

    var a = tstsEl("div", {
      className: "hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700"
    }, String(item.answer || ""));

    q.addEventListener("click", function () {
      var hidden = a.classList.contains("hidden");
      if (hidden) { a.classList.remove("hidden"); window.tstsSetPlusMinus(qIcon, true); q.setAttribute("aria-expanded", "true"); }
      else { a.classList.add("hidden"); window.tstsSetPlusMinus(qIcon, false); q.setAttribute("aria-expanded", "false"); }
    });

    return tstsEl("article", { className: "space-y-1" }, [q, a]);
  }

  function renderFaqs(query) {
    if (typeof FAQ_CATALOG === "undefined") return;
    resultsList.textContent = "";
    var q = String(query || "").trim().toLowerCase();

    var items;
    if (q) {
      items = FAQ_CATALOG.filter(function (item) {
        if (!item || item.status !== "active") return false;
        var hay = (String(item.question || "") + " " + String(item.answer || "")).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    } else {
      items = FAQ_CATALOG.filter(function (item) {
        if (!item || item.status !== "active") return false;
        return contextIds.indexOf(String(item.id || "")) >= 0;
      });
    }

    if (items.length === 0) {
      if (q) resultsList.appendChild(tstsEl("p", { className: "text-sm text-slate-500 py-2" }, "No matching questions found."));
      return;
    }

    items.slice(0, 8).forEach(function (item) { resultsList.appendChild(makeAccordion(item)); });
    if (items.length > 8) {
      resultsList.appendChild(tstsEl("p", { className: "text-xs text-slate-500 pt-1" }, (items.length - 8) + " more results \u2014 refine your search or browse all FAQs."));
    }
  }

  // Toggle handler
  toggleBar.addEventListener("click", function () {
    var hidden = panel.classList.contains("hidden");
    // The mark is the platform's SVG plus/minus (sir 2026-08-08) \u2014 flip it through the
    // shared helper so the crossbar never moves; fall back to the caret glyph only if
    // the helper is somehow absent.
    var setMark = function (expanded) {
      if (window.tstsSetPlusMinus && barIcon.querySelector) window.tstsSetPlusMinus(barIcon, expanded);
      else barIcon.textContent = expanded ? "\u25B4" : "\u25BE";
    };
    if (hidden) {
      panel.classList.remove("hidden");
      setMark(true);
      toggleBar.setAttribute("aria-expanded", "true");
      if (!faqLoaded) { loadFaqScripts(function () { renderFaqs(""); }); }
      else { renderFaqs(""); }
    } else {
      panel.classList.add("hidden");
      setMark(false);
      toggleBar.setAttribute("aria-expanded", "false");
    }
  });

  // Search debounce
  var debounceTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { renderFaqs(searchInput.value); }, 200);
  });
}

function formatPolicyDate(v) {
  if (!v) return "";
  try {
    if (window.tstsFormatDateShort) return window.tstsFormatDateShort(v);
  } catch (_) {}
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

function shouldSkipGlobalMetaFetch() {
  var path = "";
  try { path = String(location.pathname || "").toLowerCase(); } catch (_) {}
  var file = path.split("/").pop() || "";
  var protectedPages = {
    "admin.html": true,
    "bookmarks.html": true,
    "connections.html": true,
    "feed.html": true,
    "host.html": true,
    "my-bookings.html": true,
    "profile.html": true,
    "report.html": true,
    "settings-data.html": true
  };
  if (!protectedPages[file]) return false;

  var hasUserHint = false;
  try { hasUserHint = !!localStorage.getItem("tsts_user"); } catch (_) { hasUserHint = false; }
  return !hasUserHint;
}

async function resolveSystemStatus() {
  // Probe a CORS-safe API route through authFetch. Do not call /health directly
  // because /health is defined before CORS middleware in backend server.js.
  try {
    if (shouldSkipGlobalMetaFetch()) return { level: "normal", label: "Normal", message: "" };

    if (!window.authFetch) {
      return {
        level: "outage",
        label: "Outage",
        message: "We cannot reach platform services right now. Please retry shortly."
      };
    }

    const res = await window.authFetch("/api/policy/active", { method: "GET" });
    if (!res) {
      return {
        level: "outage",
        label: "Outage",
        message: "We cannot reach platform services right now. Please retry shortly."
      };
    }

    // Any reachable non-5xx response means platform is reachable.
    if (res.status < 500) return { level: "normal", label: "Normal", message: "" };

    return {
      level: "degraded",
      label: "Degraded",
      message: "Things are a little slow right now. Your actions may take a moment longer than usual."
    };
  } catch (_) {
    return {
      level: "outage",
      label: "Outage",
      message: "We cannot reach platform services right now. Please retry shortly."
    };
  }
}

async function initGlobalStatusBanner() {
  const root = document.getElementById("navbar-placeholder");
  if (!root) return;

  const existing = document.getElementById("tsts-system-status-banner");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const status = await resolveSystemStatus();
  if (!status || status.level === "normal") return;

  const isDegraded = status.level === "degraded";
  const badgeClass = isDegraded
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-red-100 text-red-800 border-red-200";
  const rowClass = isDegraded
    ? "bg-amber-50 border-b border-amber-200 text-amber-900"
    : "bg-red-50 border-b border-red-200 text-red-900";

  const banner = tstsEl("div", { id: "tsts-system-status-banner", className: rowClass }, [
    tstsEl("div", { className: "container mx-auto px-4 py-2.5 text-xs sm:text-sm flex flex-wrap items-center gap-2" }, [
      tstsEl("span", { className: "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold border " + badgeClass, textContent: status.label }),
      tstsEl("span", { className: "font-medium", textContent: String(status.message || "") })
    ])
  ]);

  root.appendChild(banner);
}

async function hydrateFooterPolicyMeta() {
  const line = document.getElementById("footer-policy-version");
  if (!line || !window.authFetch) return;
  if (shouldSkipGlobalMetaFetch()) {
    line.style.display = "none";
    return;
  }

  try {
    const res = await window.authFetch("/api/policy/active", { method: "GET" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      line.style.display = "none";
      return;
    }
    const policy = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
    const version = String((policy && policy.version) || "").trim();
    const effective = formatPolicyDate(policy && policy.effectiveFrom);
    if (!version) {
      line.style.display = "none";
      return;
    }
    line.textContent = effective
      ? ("Policy: " + version + " • Effective: " + effective)
      : ("Policy: " + version);
  } catch (_) {
    line.style.display = "none";
  }
}

// 3) AUTH STATE IN NAV - DOM-safe construction
// Auth must work when frontend and backend are on different hosts (cookies not readable from JS).
async function applyAuthStateToNav(opts) {
  if (!window.tstsGetSession) return;
  const o = (opts && typeof opts === "object") ? opts : {};
  const force = o.force === true;
  const sess = (o.session && typeof o.session === "object")
    ? o.session
    : await window.tstsGetSession({ force: force });
  if (!sess || !sess.ok || !sess.user) return;
  const user = sess.user || {};
  const isAdminUser = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));

  // sir-approved 2026-08-07 ("Approved — label swap only"): an account that already owns a
  // listing shouldn't be SOLD hosting — the wizard link keeps its slot and destination, only
  // its words change to the page's own heading. Guests and logged-out visitors are untouched;
  // the label self-corrects on the first page load after a guest publishes their first listing.
  if (user.isHost === true) {
    const hostLink = document.getElementById("nav-host-link");
    const hostLinkMobile = document.getElementById("nav-host-link-mobile");
    if (hostLink) hostLink.textContent = "Host an Experience";
    if (hostLinkMobile) hostLinkMobile.textContent = "Host an Experience";
  }

  // Desktop auth menu - click-toggle dropdown
  const desktopAuth = document.getElementById("auth-section-desktop");
  if (desktopAuth) {
    desktopAuth.textContent = "";
    const userPic = tstsEl("img", { id: "nav-user-pic", src: "/assets/avatar-default.svg", className: "w-10 h-10 rounded-full border border-gray-200" });
    const menuBtn = tstsEl("button", { id: "nav-dropdown-btn", className: "flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded-full" }, [userPic]);
    menuBtn.setAttribute("aria-label", "Account menu");
    menuBtn.setAttribute("aria-expanded", "false");

    const menuLinks = [
      { href: "my-bookings.html", text: "My Experiences" },
      { href: "profile.html", text: "My Account" },
      { href: "connections.html", text: "Fellow Travellers" }
    ];
    if (isAdminUser) menuLinks.push({ href: "admin.html", text: "Admin Dashboard" });
    const dropdownItems = menuLinks.map(function(lnk) {
      return tstsEl("a", { href: lnk.href, className: "block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition" }, lnk.text);
    });
    const logoutBtn = tstsEl("button", { id: "logout-btn", className: "block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition" }, "Logout");
    dropdownItems.push(logoutBtn);
    const dropdown = tstsEl("div", { id: "nav-dropdown", className: "hidden absolute right-0 w-48 bg-white shadow-xl rounded-lg border border-gray-100 py-2 mt-2 opacity-0 -translate-y-2 transition-all duration-200" }, dropdownItems);
    dropdown.style.pointerEvents = "none";
    const wrapper = tstsEl("div", { className: "relative" }, [menuBtn, dropdown]);
    desktopAuth.appendChild(wrapper);

    try {
      if (user && user.profilePic) window.tstsSafeImg(userPic, user.profilePic, "/assets/avatar-default.svg");
    } catch (_) {}
  }

  // Mobile auth menu
  const mobileAuth = document.getElementById("auth-section-mobile");
  if (mobileAuth) {
    mobileAuth.textContent = "";
    const mobileLinks = [
      { href: "my-bookings.html", text: "My Experiences" },
      { href: "profile.html", text: "My Account" },
      { href: "connections.html", text: "Fellow Travellers" }
    ];
    if (isAdminUser) mobileLinks.push({ href: "admin.html", text: "Admin Dashboard" });
    mobileLinks.forEach(function(lnk) {
      mobileAuth.appendChild(tstsEl("a", { href: lnk.href, className: "block text-gray-700 hover:text-orange-600 font-medium py-2" }, lnk.text));
    });
    mobileAuth.appendChild(tstsEl("button", { id: "logout-btn-mobile", className: "block w-full text-left text-red-600 font-medium py-2" }, "Logout"));
  }

  attachLogoutListeners();
  initDropdownToggle();
  loadNavProfilePic();
}

window.tstsHydrateNavAuth = async function (opts) {
  try {
    return await applyAuthStateToNav(opts || {});
  } catch (_) {
    return false;
  }
};

// 4) MOBILE MENU
function initMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => menu.classList.toggle("hidden"));
}

// 5) DROPDOWN TOGGLE (click-based, polished)
function initDropdownToggle() {
  const btn = document.getElementById("nav-dropdown-btn");
  const dropdown = document.getElementById("nav-dropdown");
  if (!btn || !dropdown) return;

  let isOpen = false;

  const openDropdown = () => {
    isOpen = true;
    dropdown.classList.remove("hidden");
    dropdown.style.pointerEvents = "auto";
    setTimeout(() => {
      dropdown.classList.remove("opacity-0", "-translate-y-2");
      dropdown.classList.add("opacity-100", "translate-y-0");
    }, 10);
    btn.setAttribute("aria-expanded", "true");
  };

  const closeDropdown = () => {
    if (!isOpen) return;
    isOpen = false;
    dropdown.classList.remove("opacity-100", "translate-y-0");
    dropdown.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => {
      dropdown.classList.add("hidden");
      dropdown.style.pointerEvents = "none";
    }, 200);
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  document.addEventListener("click", (e) => {
    if (isOpen && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      closeDropdown();
      btn.focus();
    }
  });

  dropdown.addEventListener("click", (e) => {
    if (e.target.tagName === "A" || e.target.tagName === "BUTTON") {
      closeDropdown();
    }
  });
}

// 6) LOGOUT
function attachLogoutListeners() {
  const handleLogout = async () => {
    try {
      const res = await window.authFetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        try { console.warn("Logout revoke failed", res.status); } catch (_) {}
      }
    } catch (_) {
      try { console.warn("Logout revoke failed", "network"); } catch (_) {}
    }
    try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
    location.replace("index.html");
  };

  const desktopBtn = document.getElementById("logout-btn");
  const mobileBtn = document.getElementById("logout-btn-mobile");
  if (desktopBtn) desktopBtn.addEventListener("click", handleLogout);
  if (mobileBtn) mobileBtn.addEventListener("click", handleLogout);
}

// 7) NAV PROFILE PIC
async function loadNavProfilePic() {
  try {
    if (String(location.pathname || "").endsWith("/profile.html") || String(location.pathname || "").endsWith("profile.html")) return;
  } catch (_) {}

  const img = document.getElementById("nav-user-pic");
  if (!img) return;

  try {
    const cached = (window.getAuthUser && window.getAuthUser()) || {};
    if (cached && cached.profilePic) { window.tstsSafeImg(img, cached.profilePic, "/assets/avatar-default.svg"); return; }
    if (!window.tstsGetSession) return;
    const sess = await window.tstsGetSession({ force: false });
    if (!sess || !sess.ok || !sess.user) return;
    if (sess.user && sess.user.profilePic) window.tstsSafeImg(img, sess.user.profilePic, "/assets/avatar-default.svg");
  } catch (_) {}
}

// === SEC-AUTH-GUARD: Single auth guard for protected pages (cookie auth) ===
// Use this at top of protected page JS to verify auth via /api/auth/me
window.tstsRequireAuth = function (opts) {
  const o = opts || {};
  const returnTo = String(o.returnTo || (location.pathname + location.search) || "");
  const loginUrl = String(o.loginUrl || "login.html");
  function hasAuthHintCookie() {
    try {
      return /(^|;\s*)tsts_auth_hint=1(?:;|$)/.test(String(document.cookie || ""));
    } catch (_) {
      return false;
    }
  }
  const q = "returnTo=" + encodeURIComponent(returnTo) + (hasAuthHintCookie() ? "&reason=session_expired" : "");

  function go() { location.replace(loginUrl + (loginUrl.indexOf("?") >= 0 ? "&" : "?") + q); }

  try {
    if (!window.tstsGetSession) { go(); return Promise.resolve(false); }
    return window.tstsGetSession({ force: true })
      .then(function (sess) {
        if (sess && sess.ok && sess.user) {
          try {
            if (window.tstsHydrateNavAuth) window.tstsHydrateNavAuth({ force: true, session: sess });
          } catch (_) {}
          return true;
        }
        if (sess && Number(sess.status) === 429) {
          try { if (window.tstsNotify) window.tstsNotify("Please wait a moment and try again.", "warning"); } catch (_) {}
          return false;
        }
        go();
        return false;
      })
      .catch(function () {
        go();
        return false;
      });
  } catch (_) {
    go();
    return Promise.resolve(false);
  }
};
