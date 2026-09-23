// REAL coverage for the review WRITE box on the experience page (W30, 2026-08-21).
//
// Why this file exists: the "Write a review" button on a past trip linked to
// #reviews-section, but that section could only LIST reviews — there was no way for a
// guest to ever write the written comment, and the section hid itself entirely when the
// listing had no reviews yet, so the first reviewer landed on a blank page top.
//
// The three states are asserted here because live data can only ever hit two of them:
// a review older than 24 hours (the locked state) cannot be produced by a click.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "experience.js"), "utf-8");

const EXP_ID = "6a86154a60542b998029ef17";
const BOOKING_ID = "6a86154b60542b99802a02f6";

function buildDom() {
  document.body.innerHTML = [
    '<div id="experience-content">',
    '<h1 id="exp-title"></h1>',
    '<a id="exp-city" href="#"></a>',
    '<p id="exp-description"></p>',
    '<img id="exp-image" />',
    '<span id="exp-price"></span>',
    '<span id="exp-price-suffix"></span>',
    '<form id="booking-form">',
    '<input id="booking-date" type="date" />',
    '<select id="guest-count"><option value="1">1</option></select>',
    '<input id="time-slot" />',
    '<label><input type="checkbox" id="booking-terms" /></label>',
    '<button id="book-btn" type="submit">Book</button>',
    "</form>",
    '<section id="similar-section" class="hidden"><div id="similar-grid"></div></section>',
    '<section id="reviews-section" class="hidden">',
    '<select id="reviews-sort"><option value="highest">Highest rated first</option></select>',
    '<div id="reviews-list"></div>',
    '<p id="reviews-more-note" class="hidden"></p>',
    "</section>",
    "</div>",
    '<div id="experience-not-found" class="hidden"><p id="experience-not-found-text"></p></div>',
  ].join("");
}

const EXPERIENCE_PAYLOAD = {
  _id: EXP_ID,
  title: "Sunset Pasta Making on the Rooftop",
  description: "An evening on the rooftop.",
  city: "Melbourne",
  price: 95,
  host: { name: "Maria Romano" },
};

// Records every call so a test can assert the METHOD and BODY the box sent.
function makeFetch(opts) {
  const calls = [];
  const mine = opts.mine === undefined ? null : opts.mine;
  const reviews = Array.isArray(opts.reviews) ? opts.reviews : [];
  const writeResult = opts.writeResult || { ok: true, status: 200, payload: { ok: true, data: {} } };

  const fn = async (url, init) => {
    const method = String((init && init.method) || "GET").toUpperCase();
    calls.push({ url: String(url), method, body: init && init.body ? JSON.parse(String(init.body)) : null });

    if (String(url) === "/api/experiences/" + EXP_ID) {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: EXPERIENCE_PAYLOAD }) };
    }
    if (String(url) === "/api/experiences/" + EXP_ID + "/reviews") {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: reviews }) };
    }
    if (String(url).indexOf("/api/reviews/booking/") === 0) {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: mine }) };
    }
    if (String(url) === "/api/reviews" || String(url).indexOf("/api/reviews/") === 0) {
      return { ok: writeResult.ok, status: writeResult.status, json: async () => writeResult.payload };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

function loadPage(opts) {
  opts = opts || {};
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  const search = opts.search === undefined
    ? "?id=" + EXP_ID + "&reviewBooking=" + BOOKING_ID
    : opts.search;

  Object.defineProperty(window, "location", {
    value: {
      pathname: "/experience.html",
      search: search,
      hash: opts.hash === undefined ? "#reviews-section" : opts.hash,
      hostname: "thesharedtablestory.com",
      get href() { return "https://example.com/experience.html" + search; },
      set href(_v) { /* navigation is not the subject of these tests */ },
    },
    writable: true, configurable: true,
  });

  window.tstsGetSession = async () => ({ ok: true, user: { id: "viewer" } });
  window.authFetch = opts.authFetch;
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsShareExperience = vi.fn();
  window.clearAuth = vi.fn();
  window.tstsFormatDateShort = (d) => String(d || "");
  window.__trackAnalytics = vi.fn();
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
}

async function runScript() {
  new Function(SRC)();
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

function box() { return document.getElementById("review-write-box"); }
function boxText() { const b = box(); return b ? b.textContent.replace(/\s+/g, " ") : ""; }
function starStates() {
  const b = box();
  if (!b) return [];
  return Array.from(b.querySelectorAll("[data-star]")).map((s) => (s.classList.contains("text-amber-400") ? "lit" : "grey"));
}
function submitButton() {
  const b = box();
  if (!b) return null;
  return Array.from(b.querySelectorAll("button")).filter((x) => !x.hasAttribute("data-star"))[0] || null;
}
function commentField() {
  const b = box();
  return b ? b.querySelector("textarea") : null;
}

describe("review write box — when it appears", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("no ?reviewBooking → no write box, and the section stays as the read-only list", async () => {
    loadPage({ search: "?id=" + EXP_ID, authFetch: makeFetch({ reviews: [] }) });
    await runScript();
    expect(box()).toBeNull();
  });

  test("a past booking opens the write box and REVEALS the section even with zero reviews", async () => {
    loadPage({ authFetch: makeFetch({ mine: null, reviews: [] }) });
    await runScript();
    expect(box()).not.toBeNull();
    expect(document.getElementById("reviews-section").classList.contains("hidden")).toBe(false);
    // The first reviewer of a listing must not face a blank panel.
    expect(document.getElementById("reviews-list").textContent).toMatch(/No reviews yet/i);
  });

  test("a booking id that is not a real id is ignored", async () => {
    loadPage({ search: "?id=" + EXP_ID + "&reviewBooking=not-an-id", authFetch: makeFetch({ reviews: [] }) });
    await runScript();
    expect(box()).toBeNull();
  });
});

describe("review write box — create state", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("speaks the approved review vocabulary", async () => {
    loadPage({ authFetch: makeFetch({ mine: null, reviews: [] }) });
    await runScript();
    const t = boxText();
    expect(t).toMatch(/How was it\?/);
    expect(t).toMatch(/Share your experience with the community\./);
    expect(t).toMatch(/Rating/);
    expect(t).toMatch(/Your Review/);
    expect(submitButton().textContent).toBe("Post Review");
  });

  test("opens at five stars reading Excellent, and a lower pick repaints both", async () => {
    loadPage({ authFetch: makeFetch({ mine: null, reviews: [] }) });
    await runScript();
    expect(starStates()).toEqual(["lit", "lit", "lit", "lit", "lit"]);
    expect(boxText()).toMatch(/Excellent/);

    box().querySelector('[data-star="2"]').click();
    expect(starStates()).toEqual(["lit", "lit", "grey", "grey", "grey"]);
    expect(boxText()).toMatch(/Poor/);
  });

  test("an empty comment is refused in plain words and nothing is sent", async () => {
    const authFetch = makeFetch({ mine: null, reviews: [] });
    loadPage({ authFetch });
    await runScript();

    submitButton().click();
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(boxText()).toMatch(/Please write a few words about how it went\./);
    expect(authFetch.calls.filter((c) => c.method === "POST").length).toBe(0);
  });

  test("a written review POSTs the booking, experience, rating and comment", async () => {
    const authFetch = makeFetch({
      mine: null,
      reviews: [],
      writeResult: { ok: true, status: 201, payload: { ok: true, data: { id: "rev_1" } } },
    });
    const notify = vi.fn();
    loadPage({ authFetch, notify });
    await runScript();

    box().querySelector('[data-star="4"]').click();
    commentField().value = "The rooftop at sunset was the highlight.";
    submitButton().click();
    for (let i = 0; i < 40; i++) await Promise.resolve();

    const posted = authFetch.calls.filter((c) => c.method === "POST" && c.url === "/api/reviews");
    expect(posted.length).toBe(1);
    expect(posted[0].body).toEqual({
      type: "guest_to_host",
      bookingId: BOOKING_ID,
      experienceId: EXP_ID,
      rating: 4,
      comment: "The rooftop at sunset was the highlight.",
    });
    expect(notify).toHaveBeenCalledWith("Thanks, your review is live.", "success");
  });

  test("a refused write shows the server's own sentence and lets the guest try again", async () => {
    const authFetch = makeFetch({
      mine: null,
      reviews: [],
      writeResult: {
        ok: false,
        status: 409,
        payload: { ok: false, error: "REVIEW_ALREADY_EXISTS", message: "A review already exists for this booking." },
      },
    });
    loadPage({ authFetch });
    await runScript();

    commentField().value = "Lovely evening.";
    submitButton().click();
    for (let i = 0; i < 40; i++) await Promise.resolve();

    expect(boxText()).toMatch(/A review already exists for this booking\./);
    expect(submitButton().disabled).toBe(false);
  });
});

describe("review write box — edit state", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const MINE_EDITABLE = {
    id: "rev_9",
    bookingId: BOOKING_ID,
    experienceId: EXP_ID,
    rating: 4,
    comment: "Good pace, great sauce.",
    canEdit: true,
    editableUntil: "2026-08-22T11:42:00.000Z",
    hostReply: "",
  };

  test("opens on the guest's own words with FOUR stars lit, not five", async () => {
    loadPage({ authFetch: makeFetch({ mine: MINE_EDITABLE, reviews: [] }) });
    await runScript();
    // The defect this pins: every star rendered gold while the label read "Good".
    expect(starStates()).toEqual(["lit", "lit", "lit", "lit", "grey"]);
    expect(boxText()).toMatch(/Good/);
    expect(commentField().value).toBe("Good pace, great sauce.");
    expect(boxText()).toMatch(/Edit your review/);
    expect(boxText()).toMatch(/You can edit this review within 24 hours of submission\./);
    expect(submitButton().textContent).toBe("Update Review");
  });

  test("an edit PATCHes that review by id", async () => {
    const authFetch = makeFetch({ mine: MINE_EDITABLE, reviews: [] });
    const notify = vi.fn();
    loadPage({ authFetch, notify });
    await runScript();

    box().querySelector('[data-star="5"]').click();
    commentField().value = "Coming back with friends in spring.";
    submitButton().click();
    for (let i = 0; i < 40; i++) await Promise.resolve();

    const patched = authFetch.calls.filter((c) => c.method === "PATCH");
    expect(patched.length).toBe(1);
    expect(patched[0].url).toBe("/api/reviews/rev_9");
    expect(patched[0].body).toEqual({ rating: 5, comment: "Coming back with friends in spring." });
    expect(notify).toHaveBeenCalledWith("Your review has been updated.", "success");
  });

  test("a host's reply is shown to the guest inside the box", async () => {
    const withReply = Object.assign({}, MINE_EDITABLE, { hostReply: "Thank you, it was a joy to cook for you." });
    loadPage({ authFetch: makeFetch({ mine: withReply, reviews: [] }) });
    await runScript();
    expect(boxText()).toMatch(/Host Reply/);
    expect(boxText()).toMatch(/Thank you, it was a joy to cook for you\./);
  });
});

describe("review write box — closed-window state", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // Live data cannot reach this state — it needs a review older than 24 hours.
  const MINE_LOCKED = {
    id: "rev_old",
    bookingId: BOOKING_ID,
    experienceId: EXP_ID,
    rating: 3,
    comment: "It was fine.",
    canEdit: false,
    editableUntil: "2026-08-01T00:00:00.000Z",
    hostReply: "",
  };

  test("says the window has closed and refuses every way in", async () => {
    const authFetch = makeFetch({ mine: MINE_LOCKED, reviews: [] });
    loadPage({ authFetch });
    await runScript();

    expect(boxText()).toMatch(/Review submitted/);
    expect(boxText()).toMatch(/The 24-hour edit window has closed\./);
    expect(submitButton().textContent).toBe("Edit Window Closed");
    expect(submitButton().disabled).toBe(true);
    expect(commentField().disabled).toBe(true);
    expect(starStates()).toEqual(["lit", "lit", "lit", "grey", "grey"]);

    // A star click must not change the stored rating behind a closed window.
    box().querySelector('[data-star="5"]').click();
    expect(starStates()).toEqual(["lit", "lit", "lit", "grey", "grey"]);
    expect(authFetch.calls.filter((c) => c.method === "PATCH" || c.method === "POST").length).toBe(0);
  });
});
