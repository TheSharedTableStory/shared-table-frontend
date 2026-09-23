// REAL coverage for the Explore category chip row — the SELECTED LOOK.
//
// THE GAP THIS PINS: js/explore.js declared `syncCategoryChips()` TWICE in the same function
// scope. The later declaration won, and it only toggled a class named `active` — a name no
// stylesheet styles. The real rule, which paints the selected chip with `tsts-indicator-ink` +
// `border-transparent` and strips `bg-tsts-cream` / `border-slate-200` / `text-slate-600` from it,
// never ran. On screen that meant: after the first click no chip looked selected, except the
// "All Stories" chip, whose markup (explore.html:489) ships with the selected look already on it.
//
// This file loads the REAL chip row out of explore.html (not a hand-written stub whose
// attributes could drift from the page) and the REAL category normaliser out of common.js, then
// drives the row with REAL clicks on the real buttons.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "explore.js"), "utf-8");
const EXPLORE_HTML = readFileSync(resolve(__dirname, "..", "explore.html"), "utf-8");

// Lift the live #category-chips markup straight out of explore.html by matching <div> depth, so
// the test can never drift from the page it claims to cover.
function extractCategoryChipRow(html) {
  const at = html.indexOf('id="category-chips"');
  if (at < 0) throw new Error('explore.html no longer contains the category chip row (id="category-chips")');
  const start = html.lastIndexOf("<div", at);
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = start;
  let depth = 0;
  let end = -1;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].toLowerCase() === "</div>") {
      depth -= 1;
      if (depth === 0) { end = m.index + m[0].length; break; }
    } else {
      depth += 1;
    }
  }
  if (end < 0) throw new Error("could not find the closing tag of the category chip row in explore.html");
  return html.slice(start, end);
}

const CHIP_ROW_HTML = extractCategoryChipRow(EXPLORE_HTML);

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

    <div id="active-filters-bar" aria-live="polite" aria-label="Active filters"></div>
    ${CHIP_ROW_HTML}
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
  window.authFetch = opts.authFetch || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) }));
  // The REAL window.tstsNormalizeCategory from common.js is deliberately left in place. A stub
  // that is kinder than the real normaliser is how the "All Stories" defect survived a green
  // suite once before (see the warning in tests/explore-real.test.js).
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
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

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function chip(key) {
  const el = document.querySelector(`#category-chips .filter-chip[data-category="${key}"]`);
  if (!el) throw new Error(`the real chip row has no chip for "${key}"`);
  return el;
}

function look(el) {
  return {
    active: el.classList.contains("active"),
    ink: el.classList.contains("tsts-indicator-ink"),
    borderless: el.classList.contains("border-transparent"),
    cream: el.classList.contains("bg-tsts-cream"),
  };
}

// The invariant the shadowed declaration broke: `active` is the state flag, and the two visual
// classes are what a guest actually SEES. One without the other is an invisible selection.
function expectNoInvisibleSelection() {
  document.querySelectorAll("#category-chips .filter-chip").forEach((el) => {
    if (el.classList.contains("active")) {
      expect(
        el.classList.contains("tsts-indicator-ink"),
        `chip "${el.getAttribute("data-category")}" is marked active but carries no tsts-indicator-ink`
      ).toBe(true);
      expect(
        el.classList.contains("border-transparent"),
        `chip "${el.getAttribute("data-category")}" is marked active but carries no border-transparent`
      ).toBe(true);
    }
  });
}

describe("explore — category chips carry the selected look", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("syncCategoryChips is declared exactly once, so nothing can shadow the painting rule", () => {
    const declarations = SRC.match(/function\s+syncCategoryChips\s*\(/g) || [];
    expect(declarations.length).toBe(1);
  });

  test("clicking a category chip paints that chip and unpaints All Stories", async () => {
    loadExplore({});
    await fireDOMReady();

    expect(look(chip("all")).ink).toBe(true);

    chip("food-gatherings").click();
    await settle();

    expect(look(chip("food-gatherings"))).toMatchObject({ active: true, ink: true, borderless: true, cream: false });
    expect(look(chip("all"))).toMatchObject({ active: false, ink: false, borderless: false });
    expect(look(chip("culture-stories"))).toMatchObject({ active: false, ink: false });
    expectNoInvisibleSelection();
  });

  test("a second category chip paints too, and both stay painted together", async () => {
    loadExplore({});
    await fireDOMReady();

    chip("food-gatherings").click();
    await settle();
    chip("move-wellness").click();
    await settle();

    expect(look(chip("food-gatherings"))).toMatchObject({ active: true, ink: true, borderless: true });
    expect(look(chip("move-wellness"))).toMatchObject({ active: true, ink: true, borderless: true });
    expect(look(chip("all"))).toMatchObject({ active: false, ink: false });
    expectNoInvisibleSelection();
  });

  test("clicking All Stories restores the All chip and strips the category chip", async () => {
    loadExplore({});
    await fireDOMReady();

    chip("culture-stories").click();
    await settle();
    expect(look(chip("culture-stories")).ink).toBe(true);

    chip("all").click();
    await settle();

    expect(look(chip("all"))).toMatchObject({ active: true, ink: true, borderless: true, cream: false });
    expect(look(chip("culture-stories"))).toMatchObject({ active: false, ink: false, borderless: false, cream: true });
    expectNoInvisibleSelection();
  });

  test("clicking a painted chip a second time unpaints it and All Stories comes back", async () => {
    loadExplore({});
    await fireDOMReady();

    chip("games-play").click();
    await settle();
    expect(look(chip("games-play")).ink).toBe(true);

    chip("games-play").click();
    await settle();

    expect(look(chip("games-play"))).toMatchObject({ active: false, ink: false, borderless: false, cream: true });
    expect(look(chip("all"))).toMatchObject({ active: true, ink: true, borderless: true });
    expectNoInvisibleSelection();
  });

  test("removing a category through the active-filter pill's × repaints the row", async () => {
    loadExplore({});
    await fireDOMReady();

    chip("explore-outdoors").click();
    await settle();
    expect(look(chip("explore-outdoors")).ink).toBe(true);

    const pills = document.querySelectorAll("#active-filters-bar button");
    expect(pills.length).toBeGreaterThan(0);
    const pill = Array.from(pills).find((b) => /explore\s*&?\s*outdoors/i.test(b.textContent || ""));
    expect(pill, "the chosen category has no removable pill in the active-filters bar").toBeTruthy();

    pill.click();
    await settle();

    expect(look(chip("explore-outdoors"))).toMatchObject({ active: false, ink: false, borderless: false, cream: true });
    expect(look(chip("all"))).toMatchObject({ active: true, ink: true, borderless: true });
    expectNoInvisibleSelection();
  });

  test("across a run of real clicks, no chip is ever marked active without the visual classes", async () => {
    loadExplore({});
    await fireDOMReady();

    const sequence = ["food-gatherings", "social-nights", "all", "learn-passion", "learn-passion", "create-express"];
    for (const key of sequence) {
      chip(key).click();
      await settle();
      expectNoInvisibleSelection();
    }
  });
});
