// THE FINAL COMBINE'S CORRECTION, from the combine audit's section 4.3.
//
// The catalogue page now carries a refusal's own sentence onto its error box. The heading moved
// with the sentence and not with the reason, so "That filter isn't one of ours" was shown for a
// rate limit and for the platform's OWN failure, where it blames the reader for something they did
// not do, and on a frozen page. The heading is now gated on the refusal's own code: only the two
// refusals this page can cause earn it.
//
// The load-error block below is lifted from the REAL explore.html, heading and paragraph as the
// page ships them, so what this suite reads is what a person reads.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "..", "js", "explore.js"), "utf-8");
const PAGE = readFileSync(resolve(__dirname, "..", "..", "explore.html"), "utf-8");

// the page's own block, taken from the page rather than written here
function realLoadErrorBlock() {
  const start = PAGE.indexOf('<div id="load-error"');
  if (start < 0) throw new Error("explore.html no longer carries a load-error block");
  const end = PAGE.indexOf("</div>", PAGE.indexOf("retry-search-btn"));
  return PAGE.slice(start, end + "</div>".length) + "</div>";
}

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
    ${realLoadErrorBlock()}
    <section id="explore-curations" class="hidden"><div id="explore-curations-list"></div></section>
  `;
}

const __domHandlers = [];
function loadExplore(authFetch) {
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  Object.defineProperty(window, "location", {
    value: { search: "", pathname: "/explore.html", origin: "https://example.com" },
    writable: true, configurable: true,
  });
  window.history.replaceState = () => {};
  window.tstsGetSession = async () => ({ ok: false });
  window.authFetch = authFetch;
  window.tstsNormalizeCategory = (s) => String(s || "").toLowerCase();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsToast = vi.fn();
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);
  __domHandlers.length = 0;
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
    return origAdd(event, handler, options);
  });
  new Function(SRC)();
}

async function fireDOMReady() {
  for (const h of __domHandlers) {
    try { await h(); } catch (e) { /* jsdom gaps are not this suite's subject */ }
  }
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

// one refusal, exactly as the platform answers it
function refusal(status, body) {
  return async (url) => {
    if (String(url).startsWith("/api/experiences")) {
      if (body === null) throw new Error("network down");
      return { ok: false, status: status, json: async () => body };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
  };
}

async function whatAReaderSees(authFetch) {
  loadExplore(authFetch);
  await fireDOMReady();
  const box = document.getElementById("load-error");
  return {
    shown: !box.classList.contains("hidden"),
    heading: String(box.querySelector("h3").textContent || "").trim(),
    paragraph: String(box.querySelector("p").textContent || "").trim(),
  };
}

describe("the catalogue's error box names the right party for every refusal the platform can send", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("a sort value the reader typed: the heading names the filter, and the platform's own sentence stands", async () => {
    const seen = await whatAReaderSees(refusal(400, {
      ok: false, error: "INVALID_SORT",
      message: "Choose a valid sort order: price low to high, price high to low, top rated, newest first, soonest available, or most popular.",
    }));
    expect(seen.shown).toBe(true);
    expect(seen.heading).toBe("That filter isn't one of ours");
    expect(seen.paragraph).toContain("Choose a valid sort order");
  });

  test("a date the reader typed: the heading names the filter, and the sentence is one a stranger understands", async () => {
    const seen = await whatAReaderSees(refusal(400, {
      ok: false, error: "INVALID_DATE",
      message: "That date isn't one we can read. Pick a date from the calendar and try again.",
    }));
    expect(seen.heading).toBe("That filter isn't one of ours");
    expect(seen.paragraph).toBe("That date isn't one we can read. Pick a date from the calendar and try again.");
    // and no machine shorthand survives onto the page
    expect(seen.paragraph).not.toMatch(/YYYY|MM-DD|[A-Z]{2,}_[A-Z]/);
  });

  test("too many searches in a short time: the reader is not told they chose a filter that does not exist", async () => {
    const seen = await whatAReaderSees(refusal(429, {
      ok: false, error: "RATE_LIMITED",
      message: "That was a lot of tries in a short time. Give it a minute and try again.",
    }));
    expect(seen.heading).toBe("A little quiet on our end");
    expect(seen.paragraph).toContain("a lot of tries in a short time");
  });

  test("the platform's own failure: the heading agrees with the sentence beneath it", async () => {
    const seen = await whatAReaderSees(refusal(500, {
      ok: false, error: "SERVER_ERROR",
      message: "Something on our side didn't work just now. Nothing was lost.",
    }));
    expect(seen.heading).toBe("A little quiet on our end");
    expect(seen.paragraph).toBe("Something on our side didn't work just now. Nothing was lost.");
  });

  test("the network is down and no answer comes back at all: the page's own words stand, both of them", async () => {
    const seen = await whatAReaderSees(refusal(0, null));
    expect(seen.shown).toBe(true);
    expect(seen.heading).toBe("A little quiet on our end");
    expect(seen.paragraph).toBe("Check your connection, then try again.");
  });
});
