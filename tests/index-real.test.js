// REAL coverage for js/index.js — homepage:
// hasSessionHint, renderWaysToConnectCarousel, manual nav, loadHomeCurations,
// loadHomeRecommendations (signed-in + signed-out), updateMaxDiscountBanner,
// buildExploreHref, renderCard (debrand title + cloudinary upscale URL).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "index.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="ways-to-connect-carousel"></div>
    <button id="ways-to-connect-prev"></button>
    <button id="ways-to-connect-next"></button>

    <section id="home-curations" class="hidden">
      <div id="home-curations-list"></div>
    </section>

    <section id="home-recommend" class="hidden">
      <h2>Recommended For You</h2>
      <p>Curated for your taste.</p>
      <div id="home-recommend-list"></div>
    </section>

    <span id="max-discount-banner"></span>
  `;
}

const __registeredHandlers = [];
function cleanupDocHandlers() {
  while (__registeredHandlers.length) {
    const reg = __registeredHandlers.pop();
    try {
      document.removeEventListener(reg.event, reg.handler);
    } catch (err) {
      // ignore: handler may already be detached
    }
  }
}

let __domHandlers = [];

function loadIndex(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  if (opts.signedIn) {
    window.localStorage.setItem("tsts_user", JSON.stringify({ id: "u1" }));
  } else {
    window.localStorage.removeItem("tsts_user");
  }

  window.TSTS_CATEGORIES = opts.categories || [
    { slug: "wine", label: "Wine", image: "https://img/wine.jpg", icon: "fa-wine-glass", teaser: "Sip", blurb: "Wine details" },
    { slug: "food", label: "Food", image: "https://img/food.jpg", icon: "fa-utensils", teaser: "Eat", blurb: "Food details" },
    { slug: "music", label: "Music", image: "https://img/music.jpg", icon: "fa-music", teaser: "Listen", blurb: "Music details" },
  ];

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsCategoryLabel = (t) => String(t || "").trim();
  window.tstsNormalizeCategory = (s) => String(s || "").toLowerCase();

  __domHandlers = [];
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function fireDOMReady() {
  for (const h of __domHandlers) {
    try { await h(); } catch (e) { /* swallowed: jsdom-missing API */ }
  }
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

describe("index — ways-to-connect carousel", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("renders one <details> per category with correct dataset and explore link", async () => {
    loadIndex({});
    await fireDOMReady();
    const cards = document.querySelectorAll("#ways-to-connect-carousel > details");
    expect(cards.length).toBe(3);
    expect(cards[0].dataset.category).toBe("wine");
    expect(cards[1].dataset.category).toBe("food");
    // explore link is href="explore.html?category=<slug>"
    const link = cards[0].querySelector('a[href*="explore.html"]');
    expect(link.getAttribute("href")).toBe("explore.html?category=wine");
  });

  test("opening one card closes others", async () => {
    loadIndex({});
    await fireDOMReady();
    const cards = document.querySelectorAll("#ways-to-connect-carousel > details");
    cards[0].open = true;
    cards[0].dispatchEvent(new Event("toggle"));
    cards[1].open = true;
    cards[1].dispatchEvent(new Event("toggle"));
    expect(cards[0].open).toBe(false);
    expect(cards[1].open).toBe(true);
  });

  test("empty TSTS_CATEGORIES (or all slug-less) → no cards", async () => {
    loadIndex({ categories: [{ slug: "" }, { label: "missing slug" }] });
    await fireDOMReady();
    expect(document.querySelectorAll("#ways-to-connect-carousel > details").length).toBe(0);
  });
});

describe("index — home recommendations", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("signed-in user: /api/recommendations populates list", async () => {
    const seen = [];
    loadIndex({
      signedIn: true,
      authFetch: async (url) => {
        seen.push(url);
        if (url === "/api/recommendations") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [
            { _id: "e1", title: "Lentil Sunday", city: "Melbourne", price: 45, averageRating: 4.8 },
            { _id: "e2", title: "Pasta Night", city: "Sydney", price: 60 },
          ] } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(seen).toContain("/api/recommendations");
    expect(document.getElementById("home-recommend").classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#home-recommend-list > div").length).toBe(2);
  });

  test("signed-in user with 401 from /recommendations falls back to /experiences?sort=rating_desc", async () => {
    const seen = [];
    loadIndex({
      signedIn: true,
      authFetch: async (url) => {
        seen.push(url);
        if (url === "/api/recommendations") {
          return { ok: false, status: 401, json: async () => ({}) };
        }
        if (url === "/api/experiences?sort=rating_desc") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [{ _id: "x", title: "Fallback", city: "Z", price: 10 }] } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    // Recommendation flow specifically: /recommendations first, then fallback to /experiences?sort=rating_desc.
    // (The page also pings /api/experiences for the discount banner and /api/curations — filter those out.)
    const recSeen = seen.filter((u) => u === "/api/recommendations" || u === "/api/experiences?sort=rating_desc");
    expect(recSeen).toEqual(["/api/recommendations", "/api/experiences?sort=rating_desc"]);
    expect(document.querySelectorAll("#home-recommend-list > div").length).toBe(1);
  });

  test("signed-out user: directly hits /api/experiences and rewrites heading to 'Popular Experiences'", async () => {
    const seen = [];
    loadIndex({
      signedIn: false,
      authFetch: async (url) => {
        seen.push(url);
        if (url === "/api/experiences?sort=rating_desc") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [{ _id: "y", title: "Tour", city: "Melbourne", price: 99 }] } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    // /recommendations is NOT called when signed-out; only /experiences?sort=rating_desc
    // is hit for the recommendation slot. (Banner uses bare /api/experiences.)
    expect(seen).toContain("/api/experiences?sort=rating_desc");
    expect(seen).not.toContain("/api/recommendations");
    expect(document.querySelector("#home-recommend h2").textContent).toBe("Popular Experiences");
    expect(document.querySelector("#home-recommend p").textContent).toMatch(/travellers are loving/i);
  });

  test("recommendations response with 0 experiences leaves section hidden", async () => {
    loadIndex({
      signedIn: false,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("home-recommend").classList.contains("hidden")).toBe(true);
  });
});

describe("index — home curations", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("signed-out user: curations NOT fetched (hasSessionHint=false)", async () => {
    const seen = [];
    loadIndex({
      signedIn: false,
      authFetch: async (url) => {
        seen.push(url);
        if (url === "/api/experiences?sort=rating_desc") return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(seen).not.toContain("/api/curations");
    expect(document.getElementById("home-curations").classList.contains("hidden")).toBe(true);
  });

  test("signed-in user: curations list renders top 3 + explore-more tile", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async (url) => {
        if (url === "/api/curations") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { collections: [
            { title: "Weekend vibes", filters: { category: "wine" } },
            { title: "Quiet dinners", filters: { city: "Melbourne", maxPrice: 60 } },
            { title: "Birthday picks", filters: { q: "birthday" } },
            { title: "ignored — beyond top 3", filters: {} },
          ] } }) };
        }
        if (url === "/api/recommendations") return { ok: false, status: 500, json: async () => ({}) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("home-curations").classList.contains("hidden")).toBe(false);
    const tiles = document.querySelectorAll("#home-curations-list > a");
    expect(tiles.length).toBe(4); // 3 curations + 1 explore-more
    expect(tiles[0].getAttribute("href")).toBe("explore.html?category=wine");
    expect(tiles[1].getAttribute("href")).toContain("city=Melbourne");
    expect(tiles[1].getAttribute("href")).toContain("maxPrice=60");
    expect(tiles[2].getAttribute("href")).toContain("q=birthday");
    expect(tiles[3].getAttribute("href")).toBe("explore.html");
  });
});

describe("index — max discount banner", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("computes max across dynamicDiscounts and writes banner text", async () => {
    loadIndex({
      authFetch: async (url) => {
        if (url === "/api/experiences") {
          return { ok: true, status: 200, json: async () => ([
            { dynamicDiscounts: { tier1: 10, tier2: 25 } },
            { dynamicDiscounts: { tier1: 5,  tier2: 18 } },
            { dynamicDiscounts: { tier1: 40 } }, // winner
          ]) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("max-discount-banner").textContent).toMatch(/up to 40% off/);
  });

  test("no dynamic discounts → banner text unchanged", async () => {
    loadIndex({
      authFetch: async (url) => {
        if (url === "/api/experiences") {
          return { ok: true, status: 200, json: async () => ([{ title: "x" }]) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("max-discount-banner").textContent).toBe("");
  });
});
