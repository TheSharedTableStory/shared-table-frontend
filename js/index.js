// js/index.js

function hasSessionHint() {
  // Cross-origin deployments cannot read backend cookies from the frontend origin.
  // Use the stored UI user as a hint; real authority remains /api/auth/me on protected pages.
  try { return !!(localStorage.getItem("tsts_user") || ""); } catch (_) { return false; }
}

function renderWaysToConnectCarousel() {
  const wrap = document.getElementById("ways-to-connect-carousel");
  if (!wrap || !window.tstsEl || !Array.isArray(window.TSTS_CATEGORIES)) return;

  const El = window.tstsEl;
  const safeImg = window.tstsSafeImg;
  const cats = window.TSTS_CATEGORIES.slice(0).filter(function (c) {
    return c && String(c.slug || "").trim();
  });
  if (!cats.length) return;

  wrap.textContent = "";

  const cards = [];

  // Build one fully-wired category card (its own listeners, so every loop copy works).
  function buildCard(c) {
    const slug = String(c.slug || "").trim();

    const details = El("details", {
      className: "tsts-cat-card group relative flex-shrink-0 h-96 rounded-2xl overflow-hidden shadow-lg bg-gray-900",
      dataset: { category: slug }
    });

    const img = document.createElement("img");
    img.className = "absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-700";
    img.alt = String(c.label || "Category");
    safeImg(img, String(c.image || ""), "/assets/hero-banner.jpg");

    const overlay = El("div", { className: "tsts-cat-overlay absolute inset-0 z-10" });

    const header = El("div", { className: "tsts-cat-header absolute bottom-0 left-0 p-6 z-20 text-white" }, [
      El("h3", { className: "text-2xl font-bold serif mb-2 flex items-center gap-2" }, [
        El("span", { className: "inline-flex items-center justify-center w-9 h-9 rounded-full tsts-glass-circle", }, [
          El("i", { className: "fas " + String(c.icon || "fa-compass"), "aria-hidden": "true" })
        ]),
        El("span", { textContent: String(c.label || "") })
      ]),
      El("p", { className: "tsts-cat-sub text-sm opacity-90 font-light", textContent: String(c.teaser || "") }),
      El("div", { className: "tsts-cat-readmore mt-4 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full tsts-glass-pill", }, [
        El("i", { className: "fas fa-info-circle", "aria-hidden": "true" }),
        El("span", { textContent: "Read more" })
      ])
    ]);

    const summary = El("summary", { className: "relative h-96 block cursor-pointer select-none" }, [
      overlay,
      img,
      header
    ]);

    const more = El("div", { className: "tsts-cat-more absolute inset-x-0 bottom-0 z-50 p-6 text-white" }, [
      El("div", { className: "rounded-2xl tsts-glass-backdrop px-5 py-4 shadow-xl" }, [
        El("p", { className: "text-sm text-white leading-relaxed", textContent: String(c.blurb || "") }),
        El("div", { className: "mt-4 flex items-center gap-3" }, [
          El("a", {
            href: "explore.html?category=" + encodeURIComponent(slug),
            className: "inline-flex items-center gap-2 tsts-btn-primary px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm"
          }, [
            El("span", { textContent: "Explore" }),
            El("i", { className: "fas fa-arrow-right" })
          ]),
          El("button", {
            type: "button",
            className: "inline-flex items-center gap-2 tsts-btn-glass px-4 py-2.5 rounded-xl font-bold text-sm transition",
            onclick: function () { details.open = false; }
          }, [
            El("span", { textContent: "Close" })
          ])
        ])
      ])
    ]);

    // sir 2026-08-09: on open the heading STAYS and rises — the sub header and the
    // Read more pill give way, and the detail block takes their place directly under
    // it, so the card reads heading -> details -> buttons. Before this, the panel was
    // an overlay pinned to the same bottom edge at z-50 and simply covered the header
    // (heading included), which is why the heading appeared to vanish. Both blocks are
    // still anchored to the bottom, so the header is lifted by the panel's own height.
    function applyOpenState() {
      const sub = header.querySelector(".tsts-cat-sub");
      const pill = header.querySelector(".tsts-cat-readmore");
      const h = header.querySelector("h3");
      if (details.open) {
        if (sub) sub.style.display = "none";
        if (pill) pill.style.display = "none";
        // sir's words: the heading sits JUST ABOVE the expanded details, the two
        // reading as one block. The panel's outer inset tightens to 16px so the pair
        // sits lower in the card and the heading is not driven up into the arrow;
        // that same 16px is the breathing space between the heading and the box.
        // 16px top/bottom pulls the pair lower and clear of the arrow; 24px left/right
        // keeps the box on the same left edge as the heading above it.
        more.style.padding = "16px 24px";
        header.style.paddingBottom = "0px";
        if (h) h.style.marginBottom = "0px";
        header.style.bottom = more.offsetHeight + "px";
      } else {
        if (sub) sub.style.display = "";
        if (pill) pill.style.display = "";
        more.style.padding = "";
        header.style.paddingBottom = "";
        header.style.bottom = "";
        if (h) h.style.marginBottom = "";
      }
    }
    // Exposed so one shared resize handler can re-measure every open card: the panel's
    // height changes when its text rewraps, and a stale lift would re-overlap the heading.
    details.__tstsApplyOpenState = applyOpenState;

    // Only one card expanded at a time across all copies.
    details.addEventListener("toggle", function () {
      applyOpenState();
      if (!details.open) return;
      for (const d of cards) {
        if (d !== details) d.open = false;
      }
    });

    details.appendChild(summary);
    details.appendChild(more);
    return details;
  }

  // Infinite loop: render 3 consecutive copies of the category set and keep the
  // viewport parked on the middle copy. Scrolling past either edge lands on an
  // identical clone, then we silently re-center across the seam, so the carousel
  // has no visible start or end (every card carries equal weight). One category
  // has nothing to loop, so it renders once.
  const N = cats.length;
  const loop = N > 1;
  const copies = loop ? 3 : 1;
  for (let r = 0; r < copies; r++) {
    cats.forEach(function (c) {
      const card = buildCard(c);
      cards.push(card);
      wrap.appendChild(card);
    });
  }

  // Distance from one card to the next (card width + gap), measured live.
  function step() {
    if (cards.length < 2) return Math.max(1, Math.round(wrap.clientWidth * 0.8));
    const p = cards[1].offsetLeft - cards[0].offsetLeft;
    return p > 0 ? p : Math.max(1, Math.round(wrap.clientWidth * 0.8));
  }

  // Re-center onto the middle copy (no animation; invisible because copies match),
  // keeping a full set of cards available on both sides for a seamless wrap.
  function recenter() {
    if (!loop) return;
    const setW = N * step();
    if (setW <= 0) return;
    const sl = wrap.scrollLeft;
    if (sl < setW) {
      wrap.scrollLeft = sl + setW;
    } else if (sl >= setW * 2) {
      wrap.scrollLeft = sl - setW;
    }
  }

  // Park on the middle copy once layout (and thus the pitch) is known.
  function center() {
    if (!loop) { try { wrap.scrollLeft = 0; } catch (_) {} return; }
    try { wrap.scrollLeft = N * step(); } catch (_) {}
  }
  if (window.requestAnimationFrame) {
    requestAnimationFrame(function () { requestAnimationFrame(center); });
  } else {
    setTimeout(center, 60);
  }

  // Re-center after any scroll settles (arrow click, swipe, or auto-advance).
  if (loop) {
    let settleTimer = 0;
    function settle() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(recenter, 140);
    }
    if ("onscrollend" in wrap) {
      try { wrap.addEventListener("scrollend", recenter); } catch (_) {}
    }
    try { wrap.addEventListener("scroll", settle, { passive: true }); } catch (_) {}
  }

  // One handler for all copies: the open card's panel rewraps when the window changes,
  // so its lift is re-measured rather than left stale (sir's window is never fixed).
  window.addEventListener("resize", function () {
    for (const d of cards) {
      if (d && d.open === true && typeof d.__tstsApplyOpenState === "function") {
        d.__tstsApplyOpenState();
      }
    }
  });

  initCarouselAutoAdvance(wrap, cards, step);
  initCarouselManualNav(wrap, cards, step);
}

function initCarouselManualNav(container, cards, getStep) {
  if (!container || !Array.isArray(cards) || cards.length < 1) return;

  const prevBtn = document.getElementById("ways-to-connect-prev");
  const nextBtn = document.getElementById("ways-to-connect-next");
  if (!prevBtn && !nextBtn) return;

  function closeAll() {
    for (const d of cards) {
      try { if (d && d.open === true) d.open = false; } catch (_) {}
    }
  }

  function go(delta) {
    if (cards.length < 2) return;
    // Two cards per click; the loop re-center makes the wrap seamless, so a left
    // click on the first card slides the last card in from the left (round motion).
    const px = (typeof getStep === "function" ? getStep() : 0) || Math.round(container.clientWidth * 0.8);
    container.scrollBy({ left: delta * 2 * px, behavior: "smooth" });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      closeAll();
      go(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      closeAll();
      go(1);
    });
  }

  // Keyboard navigation when the carousel is focused.
  container.addEventListener("keydown", function (e) {
    const k = String((e && e.key) || "");
    if (k === "ArrowLeft") {
      e.preventDefault();
      closeAll();
      go(-1);
    } else if (k === "ArrowRight") {
      e.preventDefault();
      closeAll();
      go(1);
    }
  });
}

function initCarouselAutoAdvance(container, cards, getStep) {
  if (!container || !Array.isArray(cards) || cards.length < 2) return;

  const AUTO_MS = 30000; // owner-set 2026-05-23: auto-advance every 30s
  let pauseUntil = 0;

  function pause(ms) {
    pauseUntil = Math.max(pauseUntil, Date.now() + ms);
  }

  const pauseEvents = ["wheel", "touchstart", "pointerdown", "keydown", "focusin"];
  pauseEvents.forEach((evt) => {
    try { container.addEventListener(evt, () => pause(120000), { passive: true }); } catch (_) {}
  });
  try { container.addEventListener("mouseenter", () => pause(120000)); } catch (_) {}
  try { container.addEventListener("scroll", () => pause(20000), { passive: true }); } catch (_) {}

  setInterval(function () {
    try {
      if (document.hidden) return;
      if (Date.now() < pauseUntil) return;
      if (cards.some((d) => d && d.open === true)) return;

      // Advance one card; the loop re-center keeps it endless.
      const px = (typeof getStep === "function" ? getStep() : 0) || Math.round(container.clientWidth * 0.8);
      container.scrollBy({ left: px, behavior: "smooth" });
    } catch (_) {
      return;
    }
  }, AUTO_MS);
}

// --- 3. RECOMMENDATIONS ---
// sir's ruling 2026-08-10: updateMaxDiscountBanner was removed with its section. It read
// a discount shape the platform had abandoned (Math.max over tier OBJECTS → NaN), so the
// strip had never rendered once — sir froze P1 without ever seeing it, which under sir's
// own standard means it was never approved. Deals speak on the 🔥Deals page, where the
// locked tier logic actually works.

async function loadHomeRecommendations() {
  const section = document.getElementById("home-recommend");
  const list = document.getElementById("home-recommend-list");
  if (!section || !list) return;
  try {
    // Prefer personalized recommendations when authenticated; fall back to public experiences when not.
    let res;
    if (hasSessionHint()) {
      res = await window.authFetch("/api/recommendations", { method: "GET" });
      if (res && (res.status === 401 || res.status === 403)) {
        res = await window.authFetch("/api/experiences?sort=rating_desc", { method: "GET" });
      }
    } else {
      res = await window.authFetch("/api/experiences?sort=rating_desc", { method: "GET" });
    }

    const payload = await res.json();
    const unwrapped = (payload && payload.data !== undefined) ? payload.data : payload;
    const items = Array.isArray(unwrapped) ? unwrapped : (unwrapped && unwrapped.experiences) ? unwrapped.experiences : (unwrapped && unwrapped.items) ? unwrapped.items : [];
    const recs = items.slice(0, 4);
    // sir's decision 2026-09-13: having nothing to recommend is a real state, not a
    // failure to dress up. The cards are built FIRST and the section is revealed only if
    // a real one exists — so the row can never be a heading standing over a hole, and it
    // never invents a filler card to stand in for a recommendation the platform does not
    // have. With nothing real to show the section stays out of the page entirely, which
    // is how this page has always treated this row.
    // sir's order 2026-08-09: these cards are the SAME full rich card as Explore, and
    // the price follows the currency the listing was posted in. Both come from the one
    // shared renderer in common.js — P1 previously drew its own slim card with a
    // hardcoded "$", which is how an AUD listing came to read "$85.00" instead of A$.
    const cards = [];
    recs.forEach(function (exp, i) {
      var card = window.tstsRenderExperienceCard(exp, { idx: i + 1 });
      if (card) cards.push(card);
    });
    list.textContent = "";
    if (cards.length === 0) {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    // Update heading based on auth state
    if (!hasSessionHint()) {
      var h2 = section.querySelector("h2");
      var subtitle = section.querySelector("p");
      if (h2) h2.textContent = "Popular Experiences";
      if (subtitle) subtitle.textContent = "Discover what travellers are loving right now.";
    }
    cards.forEach(function (card) { list.appendChild(card); });
  } catch(e) {
    // A row that could not load is not a recommendation either: leave the section out of
    // the page rather than leave an empty band under its heading.
    try { section.classList.add("hidden"); list.textContent = ""; } catch (_) {}
    console.warn("[TSTS] Recommendations load failed:", e);
  }
}

// sir's ruling 2026-08-15 ("delete it"): the old slim card renderer (renderCard) that the
// 2026-08-09 rich-card order replaced was still sitting here with zero callers — dead code
// on the frozen page. Removed permanently under sir's word; the row renders only through
// window.tstsRenderExperienceCard (common.js).

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  renderWaysToConnectCarousel();
  loadHomeRecommendations();
});
