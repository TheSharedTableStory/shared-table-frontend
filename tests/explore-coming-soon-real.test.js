// REAL coverage of the Coming soon card on Explore (sir's order O-146, 2026-09-16).
//
// sir's orders O-146 and O-147, recorded in DOCS/OWNER_ORDERS_MASTER.md. O-146, in sir's own words:
// "anything draft is just put a preview and nroever for booking to se the interest of people".
// O-147 is sir's answer on the preview gate, and its record is the authority for a preview being
// seen on Explore and never bookable. The sentence that stood on this line inside quotation marks
// was not sir's and is not in the orders master; words sir did not type are never attributed to sir.
//
// This suite runs the SHIPPING js/explore.js against a real page shell, hands it a real answer from the
// listings route, and reads the card that is actually painted into the grid.

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
    <section id="explore-curations" class="hidden"><div id="explore-curations-list"></div></section>
  `;
}

function card(over) {
  return Object.assign({
    _id: "dddddddddddddddddddddddd",
    title: "Six Seats, One Sunday",
    description: "A long Sunday table in Brunswick.",
    city: "Melbourne",
    suburb: "Brunswick",
    hostId: "aaaaaaaaaaaaaaaaaaaaaa11",
    hostName: "Marisa",
    hostVerified: false,
    price: 65,
    currency: "aud",
    maxGuests: 6,
    images: [],
    imageUrl: "",
    availableDays: ["Sun"],
    timeSlots: ["18:00-20:00"],
    verifiedStatus: "none",
    averageRating: 0,
    reviewCount: 0,
    bookingMode: "shared",
    previewEnabled: false,
    datesToCome: false,
  }, over || {});
}

const __registered = [];
let __domHandlers = [];

function loadExplore(rows) {
  while (__registered.length) {
    const reg = __registered.pop();
    try { document.removeEventListener(reg.event, reg.handler); } catch (_e) { void _e; }
  }
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  Object.defineProperty(window, "location", {
    value: { search: "", pathname: "/explore.html", origin: "https://example.com" },
    writable: true, configurable: true,
  });
  window.history.replaceState = () => {};

  window.tstsGetSession = async () => ({ ok: false });
  window.authFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: rows }) });
  window.tstsNormalizeCategory = (s) => String(s || "").toLowerCase();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsToast = vi.fn();
  window.tstsNotify = vi.fn();
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);

  __domHandlers = [];
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
    __registered.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function fireReady() {
  for (const h of __domHandlers) {
    try { await h(); } catch (_e) { void _e; }
  }
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

function gridText() {
  return String(document.getElementById("experiences-grid").textContent || "");
}

describe("a preview on Explore", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("wears the Coming soon label where a live table wears its price", async () => {
    loadExplore([card({ previewEnabled: true })]);
    await fireReady();

    const text = gridText();
    expect(text).toContain("Six Seats, One Sunday");
    expect(text).toContain("Coming soon");
    // No price at all: a preview has none to promise.
    expect(text).not.toContain("From A$65");
    expect(text).not.toContain("/ person");
  });

  test("the label is readable by someone who cannot see the card", async () => {
    loadExplore([card({ previewEnabled: true })]);
    await fireReady();
    const labelled = document.querySelector('[aria-label="Coming soon, not open for bookings yet"]');
    expect(labelled).toBeTruthy();
  });

  test("a live table beside it is untouched and still shows its price", async () => {
    loadExplore([
      card({ previewEnabled: true, _id: "dddddddddddddddddddddddd", title: "Not Open Yet" }),
      card({ previewEnabled: false, _id: "eeeeeeeeeeeeeeeeeeeeeeee", title: "Open Now", price: 80 }),
    ]);
    await fireReady();

    const text = gridText();
    expect(text).toContain("Not Open Yet");
    expect(text).toContain("Open Now");
    expect(text).toContain("Coming soon");
    expect(text).toContain("From A$80 / person");
  });

  test("a whole-table preview does not show its whole-table price either", async () => {
    loadExplore([card({ previewEnabled: true, bookingMode: "private", privatePrice: 400 })]);
    await fireReady();
    const text = gridText();
    expect(text).toContain("Coming soon");
    expect(text).not.toContain("A$400");
    expect(text).not.toContain("whole table");
  });

  test("nothing a person reads on the card is machine text", async () => {
    loadExplore([card({ previewEnabled: true })]);
    await fireReady();
    const text = gridText();
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("—");
    expect(text).not.toContain("previewEnabled");
    expect(text).not.toContain("DRAFT");
  });
});
