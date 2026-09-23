// REAL coverage for the home page's "Recommended For You" row — the EMPTY state and
// the FILLED state, against the real index.html markup and the real js/index.js.
//
// sir's added condition, 2026-09-13, verbatim: "at start there might not be any
// recomendations to present so be care fule to make sure that you dont present a fake
// placeholder or empty white space".
//
// So the row has exactly two honest shapes:
//   NOTHING REAL → the whole section steps out of the page. No filler card, no invented
//                  pick, no heading left standing over a hole.
//   SOMETHING REAL → the section appears with the same rich shared card Explore uses,
//                  and the approved heading and subtitle are untouched for a signed-in
//                  person (a signed-out visitor still gets the "Popular Experiences"
//                  wording the page has always given them).
//
// Real page markup + real page script; nothing about the row is mocked except the
// network answer the page is reacting to.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "index.js"), "utf-8");
const INDEX_HTML = readFileSync(resolve(__dirname, "..", "index.html"), "utf-8");

// The REAL section from the REAL page — its own classes, heading and subtitle, so the
// test can never pass against markup that only a test believes in.
function buildRealDom() {
  const parsed = new DOMParser().parseFromString(INDEX_HTML, "text/html");
  document.body.textContent = "";
  const section = parsed.getElementById("home-recommend");
  document.body.appendChild(document.importNode(section, true));
  const carousel = parsed.getElementById("ways-to-connect-carousel");
  if (carousel) document.body.appendChild(document.importNode(carousel, true));
}

let __domHandlers = [];

function loadIndex(opts) {
  opts = opts || {};
  buildRealDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  if (opts.signedIn) {
    window.localStorage.setItem("tsts_user", JSON.stringify({ id: "u1" }));
  } else {
    window.localStorage.removeItem("tsts_user");
  }

  // The carousel is not this file's subject: no categories, so it returns early.
  window.TSTS_CATEGORIES = [];
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsCategoryLabel = (t) => String(t || "").trim();
  window.tstsNormalizeCategory = (s) => String(s || "").toLowerCase();
  // Only used by the "the card cannot be built" case below.
  if (opts.cardRenderer) window.tstsRenderExperienceCard = opts.cardRenderer;

  __domHandlers = [];
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
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

function section() { return document.getElementById("home-recommend"); }
function list() { return document.getElementById("home-recommend-list"); }

const REAL_ROWS = [
  { _id: "e1", title: "Lentil Sunday", city: "Melbourne", price: 45, currency: "aud", averageRating: 4.8, hostName: "Kenji Tanaka" },
  { _id: "e2", title: "Laneway Stories Walk", city: "Melbourne", price: 30, currency: "aud", averageRating: 4.6, hostName: "Kenji Tanaka" },
  { _id: "e3", title: "Board-Game Tournament Night", city: "Melbourne", price: 20, currency: "aud", averageRating: 4.5, hostName: "Amara Diallo" },
  { _id: "e4", title: "Morning Coffee Cupping", city: "Melbourne", price: 35, currency: "aud", averageRating: 4.9, hostName: "Amara Diallo" },
];

describe("home recommendations — the empty state is honest", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the row answers with nothing: the section stays out of the page, with no filler and no empty band", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: [] }) }),
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(true);
    expect(list().children.length).toBe(0);
    // Nothing was written into the row either — no "coming soon", no placeholder card.
    expect(list().textContent.trim()).toBe("");
  });

  test("rows arrive but no card can be built from them: still hidden, never a heading over a hole", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: REAL_ROWS }) }),
      cardRenderer: () => null,
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(true);
    expect(list().children.length).toBe(0);
    expect(list().textContent.trim()).toBe("");
  });

  test("the row could not load at all: the section leaves the page rather than show an empty band", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async () => { throw new Error("network down"); },
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(true);
    expect(list().children.length).toBe(0);
  });
});

describe("home recommendations — the filled state is unchanged", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("four real listings fill four slots, and the approved heading and subtitle are untouched", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async (url) => {
        if (url === "/api/recommendations") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: REAL_ROWS }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(false);
    expect(list().children.length).toBe(4);
    // Every card is one of the four REAL listings — nothing invented to pad the row.
    const text = list().textContent;
    for (const row of REAL_ROWS) expect(text).toContain(row.title);
    expect(section().querySelector("h2").textContent).toBe("Recommended For You");
    expect(section().querySelector("p").textContent).toBe("Based on your interests and past experiences.");
  });

  test("fewer real listings than slots: only the real ones render, and nothing fills the gap", async () => {
    loadIndex({
      signedIn: true,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: REAL_ROWS.slice(0, 2) }) }),
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(false);
    expect(list().children.length).toBe(2);
    expect(list().textContent).not.toContain(REAL_ROWS[2].title);
  });

  test("a signed-out visitor still gets the page's own 'Popular Experiences' wording", async () => {
    loadIndex({
      signedIn: false,
      authFetch: async (url) => {
        if (url === "/api/experiences?sort=rating_desc") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: REAL_ROWS.slice(0, 3) }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(section().classList.contains("hidden")).toBe(false);
    expect(list().children.length).toBe(3);
    expect(section().querySelector("h2").textContent).toBe("Popular Experiences");
    expect(section().querySelector("p").textContent).toBe("Discover what travellers are loving right now.");
  });
});
