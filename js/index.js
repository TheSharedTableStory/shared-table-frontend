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
  const cats = window.TSTS_CATEGORIES.slice(0);

  wrap.textContent = "";

  const cards = [];

  cats.forEach((c) => {
    const slug = String(c.slug || "").trim();
    if (!slug) return;

    const details = El("details", {
      className: "tsts-cat-card group relative flex-shrink-0 h-96 rounded-2xl overflow-hidden shadow-lg bg-gray-900",
      dataset: { category: slug }
    });

    const img = document.createElement("img");
    img.className = "absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-700";
    img.alt = String(c.label || "Category");
    safeImg(img, String(c.image || ""), "/assets/hero-banner.jpg");

    const overlay = El("div", { className: "tsts-cat-overlay absolute inset-0 bg-black/35 group-hover:bg-black/45 transition z-10" });

    const header = El("div", { className: "tsts-cat-header absolute bottom-0 left-0 p-6 z-20 text-white" }, [
      El("div", { className: "flex items-center gap-2 mb-2" }, [
        El("span", { className: "inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/20 backdrop-blur", }, [
          El("i", { className: "fas " + String(c.icon || "fa-compass") })
        ]),
        El("span", { className: "text-xs font-bold tracking-wide uppercase text-white/90", textContent: "Category" })
      ]),
      El("h3", { className: "text-2xl font-bold serif mb-2", textContent: String(c.label || "") }),
      El("p", { className: "text-sm opacity-90 font-light", textContent: String(c.teaser || "") }),
      El("div", { className: "mt-4 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur", }, [
        El("i", { className: "fas fa-info-circle" }),
        El("span", { textContent: "Read more" })
      ])
    ]);

    const summary = El("summary", { className: "relative h-96 block cursor-pointer select-none" }, [
      overlay,
      img,
      header
    ]);

    // z-30 does not exist in our compiled Tailwind; use z-50 so expanded CTA sits above the summary header.
    const more = El("div", { className: "tsts-cat-more absolute inset-x-0 bottom-0 z-50 p-6 text-white" }, [
      El("div", { className: "rounded-2xl bg-black/55 border border-white/15 backdrop-blur px-5 py-4 shadow-xl" }, [
        El("p", { className: "text-sm text-white/90 leading-relaxed", textContent: String(c.blurb || "") }),
        El("div", { className: "mt-4 flex items-center gap-3" }, [
          El("a", {
            href: "explore.html?category=" + encodeURIComponent(slug),
            className: "inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition shadow-sm"
          }, [
            El("span", { textContent: "Explore" }),
            El("i", { className: "fas fa-arrow-right" })
          ]),
          El("button", {
            type: "button",
            className: "inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition border border-white/15",
            onclick: function() { details.open = false; }
          }, [
            El("span", { textContent: "Close" })
          ])
        ])
      ])
    ]);

    // Ensure only one expanded card at a time (keeps the carousel tidy).
    details.addEventListener("toggle", function () {
      if (!details.open) return;
      for (const d of cards) {
        if (d !== details) d.open = false;
      }
    });

    details.appendChild(summary);
    details.appendChild(more);
    cards.push(details);
    wrap.appendChild(details);
  });

  // Reset scroll so the first render never lands in blank trailing space
  // after a resize or restored scroll position.
  try { wrap.scrollLeft = 0; } catch (_) {}

  initCarouselAutoAdvance(wrap, cards);
  initCarouselManualNav(wrap, cards);
}

function initCarouselManualNav(container, cards) {
  if (!container || !Array.isArray(cards) || cards.length < 1) return;

  const prevBtn = document.getElementById("ways-to-connect-prev");
  const nextBtn = document.getElementById("ways-to-connect-next");
  if (!prevBtn && !nextBtn) return;

  function currentIndex() {
    const left = Number(container.scrollLeft || 0);
    let idx = 0;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && typeof cards[i].offsetLeft === "number" && cards[i].offsetLeft <= (left + 10)) idx = i;
    }
    return idx;
  }

  function closeAll() {
    for (const d of cards) {
      try { if (d && d.open === true) d.open = false; } catch (_) {}
    }
  }

  function go(delta) {
    if (cards.length < 2) return;
    const idx = currentIndex();
    const next = (idx + delta + cards.length) % cards.length;
    const target = cards[next];
    if (!target) return;
    container.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
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

function initCarouselAutoAdvance(container, cards) {
  if (!container || !Array.isArray(cards) || cards.length < 2) return;

  const AUTO_MS = 90000; // 1.5 min (within the 1–2 minute requirement)
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

  function currentIndex() {
    const left = Number(container.scrollLeft || 0);
    let idx = 0;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] && typeof cards[i].offsetLeft === "number" && cards[i].offsetLeft <= (left + 10)) idx = i;
    }
    return idx;
  }

  setInterval(function () {
    try {
      if (document.hidden) return;
      if (Date.now() < pauseUntil) return;
      if (cards.some((d) => d && d.open === true)) return;

      const idx = currentIndex();
      const next = (idx + 1) % cards.length;
      const target = cards[next];
      if (!target) return;
      container.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    } catch (_) {
      return;
    }
  }, AUTO_MS);
}

async function loadHomeCurations() {
  const section = document.getElementById("home-curations");
  const list = document.getElementById("home-curations-list");
  if (!section || !list) return;

  if (!hasSessionHint()) return;

  try {
    const res = await window.authFetch("/api/curations", { method: "GET" });
    if (!res || !res.ok) return;

    const payload = await res.json();
    const collections = payload && Array.isArray(payload.collections) ? payload.collections : [];
    if (collections.length <= 0) return;

    section.classList.remove("hidden");

    const top3 = collections.slice(0, 3);
    list.textContent = "";

    top3.forEach((c) => list.appendChild(renderCurationTile(c)));

    list.appendChild(renderExploreMoreTile());
  } catch (_) {
    return;
  }
}

function renderCurationTile(c) {
  const El = window.tstsEl;
  const filters = (c && c.filters && typeof c.filters === "object") ? c.filters : {};
  const href = buildExploreHref(filters);

  const title = String((c && c.title) || "").trim();
  const subtitle = String((c && c.subtitle) || "").trim();

  return El("a", {
    href,
    className: "bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between h-full"
  }, [
    El("div", {}, [
      El("h3", { className: "text-xl font-bold font-serif text-gray-900", textContent: title || "Explore" }),
      subtitle ? El("p", { className: "text-gray-600 text-sm mt-2", textContent: subtitle }) : El("div", {})
    ]),
    El("div", { className: "mt-6 flex items-center text-sm font-bold text-orange-600", textContent: "Browse →" })
  ]);
}

function renderExploreMoreTile() {
  const El = window.tstsEl;
  return El("a", {
    href: "explore.html",
    className: "bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between h-full"
  }, [
    El("div", {}, [
      El("h3", { className: "text-xl font-bold font-serif text-gray-900", textContent: "Explore more experiences →" }),
      El("p", { className: "text-gray-600 text-sm mt-2", textContent: "See everything available right now." })
    ]),
    El("div", { className: "mt-6 flex items-center text-sm font-bold text-orange-600", textContent: "Explore →" })
  ]);
}

function buildExploreHref(filters) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", String(filters.q));
  if (filters.city) p.set("city", String(filters.city));
  if (filters.category) {
    const raw = String(filters.category);
    const norm = (window.tstsNormalizeCategory && typeof window.tstsNormalizeCategory === "function")
      ? window.tstsNormalizeCategory(raw)
      : raw;
    if (norm) p.set("category", String(norm));
  }
  if (filters.minPrice != null) p.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) p.set("maxPrice", String(filters.maxPrice));
  if (filters.date) p.set("date", String(filters.date));
  return "explore.html?" + p.toString();
}

// --- 3. RECOMMENDATIONS & DEALS ---
async function updateMaxDiscountBanner() {
  const bannerEl = document.getElementById("max-discount-banner");
  if (!bannerEl) return;

  try {
      const res = await window.authFetch("/api/experiences");
      const experiences = await res.json();
      
      let maxDiscount = 0;
      experiences.forEach(exp => {
          if (exp.dynamicDiscounts) {
              const vals = Object.values(exp.dynamicDiscounts);
              if (vals.length > 0) maxDiscount = Math.max(maxDiscount, ...vals);
          }
      });

      if (maxDiscount > 0) {
        bannerEl.textContent = `Discover hosts offering up to ${maxDiscount}% off for groups this week.`;
      }
  } catch(e) { /* Banner load failed silently */ }
}

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
    const items = Array.isArray(payload) ? payload : (payload && payload.experiences) ? payload.experiences : (payload && payload.items) ? payload.items : [];
    const recs = items.slice(0, 4);
    if (recs.length > 0) {
      section.classList.remove("hidden");
      list.textContent = "";
      recs.forEach(function(exp) {
        list.appendChild(renderCard(exp));
      });
    }
  } catch(e) {
    /* Recommendations load failed silently */
  }
}

function renderCard(exp) {
    const El = window.tstsEl;
    const fallbackImg = "/assets/experience-default.jpg";
    let imgSrc = fallbackImg;
    if (exp.imageUrl && exp.imageUrl.includes("cloudinary.com")) {
        imgSrc = exp.imageUrl.replace('/upload/', '/upload/w_400,h_300,c_fill,q_auto/');
    } else if (exp.imageUrl) {
        imgSrc = window.tstsSafeUrl(exp.imageUrl, fallbackImg);
    }

    const avg = (exp && typeof exp.averageRating === 'number') ? exp.averageRating : 0;
    const rating = avg > 0 ? "★ " + avg.toFixed(1) : "New";
    const expId = (exp && (exp._id || exp.id)) || "";
    const isStarterTitle = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return false;
      return /^WORLDCLASS_STARTER_/i.test(t) || /^starter[_\-\s]/i.test(t);
    };
    const stripWorldClassPrefix = (raw) => String(raw || "").trim().replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
    const title = (function() {
      const raw = String(exp.title || "").trim();
      const debranded = stripWorldClassPrefix(raw);
      if (debranded) return debranded;
      if (raw && !isStarterTitle(raw)) return raw;
      return "Shared experience";
    })();
    const city = exp.city || "";
    const tagsRaw = (exp && Array.isArray(exp.tags)) ? exp.tags : [];
    const labels = tagsRaw
      .map((t) => (window.tstsCategoryLabel ? window.tstsCategoryLabel(t) : String(t || "").trim()))
      .map((t) => String(t || "").trim())
      .filter((t) => t);
    const tag = labels.length ? labels.slice(0, 2).join(" · ") : "Experience";
    const price = (exp && (typeof exp.price === 'number' || typeof exp.price === 'string')) ? String(exp.price) : "";

    var imgEl = El("img", { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500", loading: "lazy" });
    window.tstsSafeImg(imgEl, imgSrc, fallbackImg);

    var card = El("div", {
        className: "bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition cursor-pointer group",
        onclick: function() { window.location.href = "experience.html?id=" + encodeURIComponent(expId); }
    }, [
        El("div", { className: "h-48 bg-gray-200 relative overflow-hidden" }, [
            imgEl,
            El("div", { className: "absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full px-2 py-1 text-xs font-bold shadow-sm", textContent: rating })
        ]),
        El("div", { className: "p-4" }, [
            El("h3", { className: "font-bold text-gray-900 mb-1 truncate", textContent: title }),
            El("p", { className: "text-xs text-gray-500 mb-3", textContent: city + " • " + tag }),
            El("div", { className: "flex justify-between items-center border-t border-gray-50 pt-3" }, [
                El("span", { className: "font-bold text-gray-900", textContent: price }),
                El("span", { className: "text-xs text-orange-600 font-bold uppercase tracking-wide group-hover:underline", textContent: "View" })
            ])
        ])
    ]);
    return card;
}

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  renderWaysToConnectCarousel();
  updateMaxDiscountBanner();
  loadHomeRecommendations();
  loadHomeCurations();
});
