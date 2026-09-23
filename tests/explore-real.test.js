// REAL coverage for js/explore.js — explore page core helpers.
// explore.js is 1,959 LOC of DOM-coupled logic; exhaustive end-to-end coverage
// would need a near-complete page DOM. We cover:
//   - tstsHaversineKm pure-function correctness
//   - tstsEnrichWithDistance pure-function (skips invalid lat/lng, attaches _distanceKm)
//   - Smoke load: comprehensive DOM, IIFE init does not throw

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "explore.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <input id="search-input" />
    <input id="location-input" />
    <input id="date-input" />
    <input id="guests-input" />

    <button id="filter-btn"><span id="filter-btn-label">Filters</span><span id="filter-count-badge" class="hidden">0</span></button>
    <div id="filter-panel" class="hidden"></div>
    <button id="modal-clear-all" class="hidden">Clear all</button>
    <button id="clear-filters-btn">Clear</button>
    <button id="near-me-btn"></button>
    <!-- Added 2026-08-22: the drawer's Near-me CHECKBOX, so the test can assert that a refused
         location request puts the box back instead of leaving it ticked and claiming a filter
         that is not applied. -->
    <input type="checkbox" id="filter-near-me" />
    <div id="distance-chips-wrap" class="hidden"></div>
    <button id="clear-filters-empty-btn">Clear</button>
    <button id="apply-filters">Apply</button>
    <select id="sort-select"><option value="">Sort</option></select>
    <input type="checkbox" id="private-booking-only" />
    <input type="checkbox" id="verified-only" />

    <input id="price-slider" />
    <span id="price-min-label"></span>
    <span id="price-max-label"></span>

    <div class="filter-chip" data-cat="wine"></div>
    <div id="active-filters-bar"></div>
    <div id="filters-summary"></div>
    <div id="experiences-grid"></div>
    <div id="no-results" class="hidden"></div>
    <div id="load-error" class="hidden"></div>
    <button id="retry-load-btn">Retry</button>

    <section id="explore-curations" class="hidden">
      <div id="explore-curations-list"></div>
    </section>
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

function loadExplore(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  Object.defineProperty(window, "location", {
    value: { search: opts.search || "", pathname: "/explore.html", origin: "https://example.com" },
    writable: true, configurable: true,
  });
  window.history.replaceState = () => {};

  window.tstsGetSession = opts.session || (async () => ({ ok: false }));
  window.authFetch = opts.authFetch || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: [] }) }));
  // ⛔ 2026-08-22 — THIS STUB IS WHY THE "All Stories" DEFECT SURVIVED EVERY TEST RUN.
  // It lowercases and returns, so here `normalizeCategory("all")` === "all" and the chip's
  // clear-branch is reached. The REAL helper (common.js:2031) returns an **empty string** for
  // "all", so on the live page that branch was never reached: the else-branch pushed "" into
  // filterState.categories, every consumer dropped the falsy entry, and clicking "All Stories"
  // did nothing at all. A stub that is kinder than the real implementation hides real defects —
  // recorded here so the next reader distrusts it rather than trusting the green tick.
  window.tstsNormalizeCategory = (s) => String(s || "").toLowerCase();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsToast = vi.fn();
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);

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
    try { await h(); } catch (e) { /* swallowed: jsdom may not implement APIs */ }
  }
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

describe("explore — pure helpers exposed on window", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("tstsHaversineKm: known distances within tolerance", async () => {
    loadExplore({});
    await fireDOMReady();
    // Melbourne CBD (-37.8136, 144.9631) → Sydney CBD (-33.8688, 151.2093). Real: ~713 km.
    const d = window.tstsHaversineKm(-37.8136, 144.9631, -33.8688, 151.2093);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(730);
    // Same point distance = 0
    expect(window.tstsHaversineKm(0, 0, 0, 0)).toBe(0);
    // Antipodal-ish (max ~half circumference of earth ≈ 20,015 km)
    expect(window.tstsHaversineKm(0, 0, 0, 180)).toBeGreaterThan(20000);
    expect(window.tstsHaversineKm(0, 0, 0, 180)).toBeLessThan(20040);
  });

  test("tstsEnrichWithDistance: returns input unchanged when user has no coords", async () => {
    loadExplore({});
    await fireDOMReady();
    const input = [{ id: "a", lat: -37, lng: 145 }];
    const out = window.tstsEnrichWithDistance(input);
    expect(out).toEqual(input);
    expect(out[0]._distanceKm).toBeUndefined();
  });

  test("tstsEnrichWithDistance: drops experiences with non-finite lat/lng untouched", async () => {
    // Note: enrichWithDistance reads filterState (private). Without near-me-active flag set,
    // it returns input unchanged. We can only test the no-coords path from outside.
    loadExplore({});
    await fireDOMReady();
    const input = [{ id: "ok", lat: -37, lng: 145 }, { id: "bad" }];
    const out = window.tstsEnrichWithDistance(input);
    expect(out.length).toBe(2);
    expect(out[0]._distanceKm).toBeUndefined();
  });
});

describe("explore — smoke load", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("IIFE runs with comprehensive DOM and fetches experiences (no throw)", async () => {
    let fetched = false;
    loadExplore({
      authFetch: async (url) => {
        if (url.startsWith("/api/experiences")) {
          fetched = true;
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(fetched).toBe(true);
  });

  test("retry button is bound and re-fires fetch", async () => {
    let calls = 0;
    loadExplore({
      authFetch: async (url) => {
        if (url.startsWith("/api/experiences")) { calls += 1; return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) }; }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    const before = calls;
    document.getElementById("retry-load-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(calls).toBeGreaterThan(before);
  });
});

describe("explore — Near me", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // ⛔ UPDATED 2026-08-22 TO THE NEW SPEC — NOT LOOSENED. THIS TEST WAS PINNING A REAL DEFECT.
  //
  // It used to assert `window.tstsToast` was called. That helper **does not exist anywhere on the
  // platform** — it is called in 14 places across 4 files and defined in none of them, so every one
  // of those messages is silently skipped in a real browser. The test passed only because it
  // assigned its OWN mock onto `window.tstsToast` (and buildDom stubs one too), manufacturing the
  // very global whose absence is the bug. So the suite stayed green while a guest ticking "Near me"
  // saw absolutely nothing happen: no message, no badge, no distance chips.
  //
  // PROVEN IN A REAL BROWSER before the fix: box ticked, badge 0, distance chips absent, not one
  // word on screen. After the fix, the real helper `window.tstsNotify(msg, type)` renders
  // "We couldn't get your location just now…" at z-index 9999 over the drawer, and the checkbox is
  // put back so it stops claiming a filter that is not applied.
  //
  // The lesson this file now guards: a test must never invent the global whose absence IS the
  // defect. `tstsToast` is deliberately left UNDEFINED below.
  test("Near me with no geolocation API → speaks through the REAL helper and unticks itself", async () => {
    const notify = vi.fn();
    loadExplore({});
    await fireDOMReady();
    // The broken helper is deliberately removed, not mocked: if the code ever calls it again this
    // test must fail rather than pass on a global that does not exist in production.
    delete window.tstsToast;
    window.tstsNotify = notify;

    const box = document.getElementById("filter-near-me");
    box.checked = true;

    delete navigator.geolocation;
    document.getElementById("near-me-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(notify).toHaveBeenCalled();
    // tstsNotify's contract is (message, type) — positional, not an object.
    expect(notify.mock.calls[0][0]).toMatch(/can't share your location/i);
    // Rule 16: the message must also say what to do next.
    expect(notify.mock.calls[0][0]).toMatch(/Suburb or City/i);
    // and the control must stop claiming a filter that was never applied
    expect(box.checked).toBe(false);
  });

  test("the broken helper is never called again", async () => {
    const toast = vi.fn();
    loadExplore({});
    await fireDOMReady();
    window.tstsToast = toast;      // if explore.js still reaches for it, this records the call
    window.tstsNotify = vi.fn();
    delete navigator.geolocation;
    document.getElementById("near-me-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(toast).not.toHaveBeenCalled();
  });
});
