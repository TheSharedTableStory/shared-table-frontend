// REAL coverage for js/my-bookings.js — bookings dashboard.
// my-bookings.js is 4,883 LOC and not wrapped in an IIFE. Top-level `function`
// declarations become globals when evaluated. We evaluate the script in the
// test scope (via global eval) and call its pure helpers directly.
//
// Targeted surface area (pure helpers):
//   - safeStr, safeDate
//   - toMoney, centsToMoney
//   - percentLikeToPct, clampPct
//   - normalizeState, stateLabel
//   - _occurrenceKey, _groupByKey
//   - unwrapApiPayload, extractApiError
//   - mapGuestScopeError, mapHostScopeError, mapStripeConnectStartError
//   - userHasHostAccess
//   - resolveDashboardTab, canonicalTabParam, resolveHostingSection

import { describe, test, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

beforeAll(() => {
  document.body.innerHTML = `
    <div id="content-area"></div>
    <button id="tab-trips"></button>
    <button id="tab-hosting"></button>
    <button id="tab-wishlist"></button>

    <div id="guest-modal" class="hidden"></div>
    <div id="review-modal" class="hidden">
      <h3 id="review-modal-title"></h3>
      <p id="review-modal-subtitle"></p>
      <button id="review-cancel-btn"></button>
      <form id="review-form"></form>
    </div>
    <div id="complaint-modal" class="hidden"></div>
    <div id="cancel-review-modal" class="hidden"></div>
    <div id="checkin-modal" class="hidden"></div>
    <div id="entry-pass-overlay" class="hidden"></div>
    <button id="close-modal-btn"></button>
  `;

  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = vi.fn();
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (Array.isArray(kids)) kids.forEach((k) => { if (k) el.append(typeof k === "string" ? document.createTextNode(k) : k); });
    return el;
  };
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsFormatDateShort = (d) => String(d || "");
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);
  globalThis.WebSocket = class { constructor() {} send() {} close() {} };

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(SRC);
  } catch (eEval) {
    // tolerated: deep init can hit missing DOM; the top-level pure helpers are
    // already hoisted before any throwing init code runs.
    void eEval;
  }
});

describe("my-bookings — safeStr / safeDate", () => {
  test("safeStr returns string for strings", () => {
    expect(globalThis.safeStr("hello")).toBe("hello");
  });
  test("safeStr empty for null/undefined", () => {
    expect(globalThis.safeStr(null)).toBe("");
    expect(globalThis.safeStr(undefined)).toBe("");
  });
  test("safeStr coerces numbers + booleans", () => {
    expect(globalThis.safeStr(42)).toBe("42");
    expect(globalThis.safeStr(true)).toBe("true");
  });
  test("safeDate parses ISO string", () => {
    const d = globalThis.safeDate("2026-05-01");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
  });
  test("safeDate returns null for bad input strings", () => {
    expect(globalThis.safeDate("not-a-date")).toBeNull();
    // Note: safeDate(null) returns new Date(0) (1970-01-01) — JS native quirk
    // since `new Date(null)` coerces to `new Date(0)`. We exercise the string
    // branch which is the real bad-input case in the wild.
  });
});

describe("my-bookings — money formatters", () => {
  test("toMoney: A$ currency, whole numbers trim decimals, fractions keep 2", () => {
    // UPDATED 2026-08-05 (owner-ordered dissection): sir's money language is the A$-prefixed
    // Intl AUD format ("money A$", sir 2026-06-12), whole amounts unpadded, fractional 2dp.
    // The old bare-$ toFixed contract predates that work.
    expect(globalThis.toMoney(45)).toBe("A$45");
    expect(globalThis.toMoney(45.6789)).toBe("A$45.68");
    expect(globalThis.toMoney(0)).toBe("A$0");
  });
  test("toMoney non-finite reads as a word a person understands, never a bare dash", () => {
    // Behaviour change 2026-09-15 (gap 31, sir's order O-128): this returned a lone em dash,
    // which is a mark and not a sentence, and it reaches the screen in the host's Booking
    // Details rows and the guest's money rows. sir's standing order keeps an em dash off every
    // surface a person reads, so an amount that cannot be worked out now says so in words.
    expect(globalThis.toMoney("not a number")).toBe("Not available");
    expect(globalThis.toMoney(undefined)).toBe("Not available");
    expect(globalThis.toMoney(undefined)).not.toContain("—");
  });
  test("centsToMoney converts cents → dollars (A$ language)", () => {
    // UPDATED 2026-08-05: same A$ contract as toMoney above.
    expect(globalThis.centsToMoney(12345)).toBe("A$123.45");
    expect(globalThis.centsToMoney(0)).toBe("A$0");
  });
  test("centsToMoney non-finite reads as a word a person understands, never a bare dash", () => {
    // Behaviour change 2026-09-15 (gap 31): same repair as toMoney above, same reason.
    expect(globalThis.centsToMoney("oops")).toBe("Not available");
    expect(globalThis.centsToMoney("oops")).not.toContain("—");
  });
});

describe("my-bookings — percent helpers", () => {
  test("percentLikeToPct: values in [0,1] are scaled to percent", () => {
    expect(globalThis.percentLikeToPct(0.25, 50)).toBe(25);
    expect(globalThis.percentLikeToPct(0, 50)).toBe(0);
    expect(globalThis.percentLikeToPct(1, 50)).toBe(100);
  });
  test("percentLikeToPct: values > 1 are taken as already-percent", () => {
    expect(globalThis.percentLikeToPct(45, 50)).toBe(45);
  });
  test("percentLikeToPct: non-finite falls back to fallbackPct", () => {
    expect(globalThis.percentLikeToPct("oops", 25)).toBe(25);
  });
  test("clampPct: clamps to [0, max]", () => {
    expect(globalThis.clampPct(50, 100)).toBe(50);
    expect(globalThis.clampPct(200, 100)).toBe(100);
    expect(globalThis.clampPct(-5, 100)).toBe(0);
    expect(globalThis.clampPct("oops", 100)).toBe(0);
  });
});

describe("my-bookings — state normalisation", () => {
  test("normalizeState lowercases + trims, empty → 'none'", () => {
    expect(globalThis.normalizeState("  CONFIRMED  ")).toBe("confirmed");
    expect(globalThis.normalizeState("")).toBe("none");
    expect(globalThis.normalizeState(null)).toBe("none");
  });
  test("stateLabel: 'none' → 'None'; underscores → spaces + capitalize-first (sir's C3 pill case)", () => {
    // UPDATED 2026-08-05: sir killed ALL-CAPS pills on 2026-06-05 (C3, "Title Case everywhere")
    // — labels read "Under review"/"Confirmed", matching the locked pages.
    expect(globalThis.stateLabel("")).toBe("None");
    expect(globalThis.stateLabel("under_review")).toBe("Under review");
    expect(globalThis.stateLabel("confirmed")).toBe("Confirmed");
  });
});

describe("my-bookings — _occurrenceKey + _groupByKey", () => {
  test("_occurrenceKey produces stable id for {experienceId, bookingDate, timeSlot}", () => {
    const b = { experienceId: "exp1", bookingDate: "2026-06-01", timeSlot: "19:00" };
    const k1 = globalThis._occurrenceKey(b);
    const k2 = globalThis._occurrenceKey({ ...b });
    expect(k1).toBe(k2);
    expect(typeof k1).toBe("string");
    expect(k1.length).toBeGreaterThan(0);
  });
  test("_occurrenceKey distinguishes different occurrences", () => {
    const a = globalThis._occurrenceKey({ experienceId: "x", bookingDate: "2026-06-01", timeSlot: "19:00" });
    const b = globalThis._occurrenceKey({ experienceId: "x", bookingDate: "2026-06-02", timeSlot: "19:00" });
    expect(a).not.toBe(b);
  });
  test("_groupByKey groups rows by keyFn output, returns { groups, order }", () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 1 }, { x: 3 }];
    const out = globalThis._groupByKey(rows, (r) => String(r.x));
    expect(Object.keys(out).sort()).toEqual(["groups", "order"]);
    expect(out.order).toEqual(["1", "2", "3"]); // insertion order, not value order
    expect(out.groups["1"]).toHaveLength(2);
    expect(out.groups["2"]).toHaveLength(1);
    expect(out.groups["3"]).toHaveLength(1);
  });
});

describe("my-bookings — unwrapApiPayload + extractApiError", () => {
  test("unwrapApiPayload returns inner data when present", () => {
    expect(globalThis.unwrapApiPayload({ data: { items: [1] } })).toEqual({ items: [1] });
  });
  test("unwrapApiPayload returns payload itself when no data", () => {
    expect(globalThis.unwrapApiPayload({ items: [1] })).toEqual({ items: [1] });
  });
  test("unwrapApiPayload returns {} for non-objects", () => {
    expect(globalThis.unwrapApiPayload(null)).toEqual({});
    expect(globalThis.unwrapApiPayload("oops")).toEqual({});
  });
  test("extractApiError surfaces unwrapped code+message", () => {
    expect(globalThis.extractApiError({ data: { error: "FOO", message: "Foo failed" } }))
      .toEqual({ code: "FOO", message: "Foo failed" });
  });
  test("extractApiError fallback message when nothing present", () => {
    expect(globalThis.extractApiError({}, "Default")).toEqual({ code: "", message: "Default" });
  });
});

describe("my-bookings — error mappers", () => {
  test("mapGuestScopeError translates AUTH_REQUIRED → session-expired copy", () => {
    expect(globalThis.mapGuestScopeError({ error: "AUTH_REQUIRED" }, 401))
      .toMatch(/session has expired/i);
  });
  // Behaviour change 2026-08-21: the copy said "Complete host onboarding to access hosting tools",
  // but sir's locked role matrix has no onboarding step — a person becomes a host by publishing.
  // The sentence now names the real door.
  test("mapHostScopeError translates HOST_ROLE_REQUIRED → publish-your-first-experience copy", () => {
    const msg = globalThis.mapHostScopeError({ error: "HOST_ROLE_REQUIRED" });
    expect(msg).toMatch(/publish your first experience/i);
    expect(msg).not.toMatch(/onboarding/i);
  });
  test("mapHostScopeError 403 surfaces extracted message", () => {
    expect(globalThis.mapHostScopeError({ message: "Denied" }, 403)).toBe("Denied");
  });
  // Behaviour change 2026-08-22: "not configured" was machine shorthand (Rule 16). The copy now
  // names the real state in plain words and points to the real next step (contact support).
  test("mapStripeConnectStartError handles STRIPE_CONNECT_NOT_CONFIGURED", () => {
    expect(globalThis.mapStripeConnectStartError({ error: "STRIPE_CONNECT_NOT_CONFIGURED" }))
      .toMatch(/aren't switched on/i);
  });
});

describe("my-bookings — userHasHostAccess", () => {
  test("any authenticated user has host access per role-matrix §21.5", () => {
    expect(globalThis.userHasHostAccess({ _id: "u" })).toBe(true);
    expect(globalThis.userHasHostAccess({ id: "u" })).toBe(true);
    expect(globalThis.userHasHostAccess({ email: "u@example.com" })).toBe(true);
  });
  test("null/empty user denied", () => {
    expect(globalThis.userHasHostAccess(null)).toBe(false);
    expect(globalThis.userHasHostAccess({})).toBe(false);
  });
});

describe("my-bookings — tab + section resolution", () => {
  test("resolveDashboardTab: hosting/wishlist/trips canonical; everything else → trips", () => {
    expect(globalThis.resolveDashboardTab("hosting")).toBe("hosting");
    expect(globalThis.resolveDashboardTab("wishlist")).toBe("wishlist");
    expect(globalThis.resolveDashboardTab("trips")).toBe("trips");
    expect(globalThis.resolveDashboardTab("experiences")).toBe("trips");
    expect(globalThis.resolveDashboardTab("")).toBe("trips");
    expect(globalThis.resolveDashboardTab("garbage")).toBe("trips");
  });
  test("canonicalTabParam: hosting + wishlist keep their own params; the rest → 'experiences'", () => {
    // UPDATED 2026-08-05: sir's 2026-06-05 deep-link fix — rewriting wishlist to
    // 'experiences' silently broke ?tab=wishlist links; the writer now matches the reader.
    expect(globalThis.canonicalTabParam("hosting")).toBe("hosting");
    expect(globalThis.canonicalTabParam("trips")).toBe("experiences");
    expect(globalThis.canonicalTabParam("wishlist")).toBe("wishlist");
  });
  test("resolveHostingSection: maps legacy section names + falls back to 'overview'", () => {
    // UPDATED 2026-08-07: sir approved splitting the Bookings tab so guest requests have their own tab
    // (sir: "Accepted — seal it"). An old ?section=private-requests link therefore lands on
    // 'guest-requests', not 'bookings'. The behaviour changed by sir's decision; this assertion was
    // left on the pre-split answer and had been failing on every run since.
    expect(globalThis.resolveHostingSection("private-requests")).toBe("guest-requests");
    expect(globalThis.resolveHostingSection("verification-payout")).toBe("verification");
    expect(globalThis.resolveHostingSection("earnings-payouts")).toBe("earnings-fees");
    expect(globalThis.resolveHostingSection("fees-charges")).toBe("earnings-fees");
    expect(globalThis.resolveHostingSection("listings")).toBe("listings");
    expect(globalThis.resolveHostingSection("garbage")).toBe("overview");
  });
  test("resolveHostingSection: panel hint 'private-request-actions' → 'guest-requests'", () => {
    // UPDATED 2026-08-07, same reason: the requests panel's deep-link hint now resolves to the tab
    // those requests actually live on.
    expect(globalThis.resolveHostingSection("", "private-request-actions")).toBe("guest-requests");
  });
});

describe("my-bookings — guest recognition (__grOrdinal + __hostGuestHistoryBlock)", () => {
  // ADDED 2026-08-07. sir ordered the history block built ("Build it") after requiring its purpose
  // be stated first. The block prints "their Nth booking with you" and the row prints "Nth booking".
  // Both ordinals were hand-rolled as "2nd / 3rd / else th", which is correct for exactly two numbers
  // and printed "21th", "22th" and "101th" for the guests who return most — the very guests the block
  // exists to recognise. Nothing on screen looks broken when an ordinal is wrong, and no manual walk
  // catches it unless a fixture happens to sit past twenty, so it is tested rather than eyeballed.
  const ORD = () => globalThis.__grOrdinal;
  const TITLE = "Sunset Pasta Making on the Rooftop";
  const line = (row) => {
    const node = globalThis.__hostGuestHistoryBlock(row, window.tstsEl);
    return Array.from(node.querySelectorAll("p")).slice(1).map((p) => p.textContent.trim()).join("");
  };

  test("__grOrdinal: the ordinary endings", () => {
    expect(ORD()(1)).toBe("1st");
    expect(ORD()(2)).toBe("2nd");
    expect(ORD()(3)).toBe("3rd");
    expect(ORD()(4)).toBe("4th");
  });
  test("__grOrdinal: 11/12/13 take 'th', not st/nd/rd", () => {
    expect(ORD()(11)).toBe("11th");
    expect(ORD()(12)).toBe("12th");
    expect(ORD()(13)).toBe("13th");
  });
  test("__grOrdinal: past twenty — the case that was wrong", () => {
    expect(ORD()(21)).toBe("21st");
    expect(ORD()(22)).toBe("22nd");
    expect(ORD()(23)).toBe("23rd");
    expect(ORD()(24)).toBe("24th");
    expect(ORD()(31)).toBe("31st");
  });
  test("__grOrdinal: past a hundred, including the 111/112/113 trap", () => {
    expect(ORD()(100)).toBe("100th");
    expect(ORD()(101)).toBe("101st");
    expect(ORD()(102)).toBe("102nd");
    expect(ORD()(103)).toBe("103rd");
    expect(ORD()(111)).toBe("111th");
    expect(ORD()(112)).toBe("112th");
    expect(ORD()(113)).toBe("113th");
    expect(ORD()(121)).toBe("121st");
  });

  test("first-timer reads as a first-timer", () => {
    expect(line({ requesterBookingCount: 0, requesterLastVisit: null }))
      .toBe("This is their first booking with you.");
  });
  test("missing fields are treated as a first-timer, never as a crash", () => {
    expect(line({})).toBe("This is their first booking with you.");
  });
  test("a returning guest reads count first, then the last visit", () => {
    expect(line({ requesterBookingCount: 11, requesterLastVisit: { date: "2026-05-12", experienceTitle: TITLE } }))
      .toBe("Their 12th booking with you · last sat at your table on 2026-05-12, for " + TITLE);
  });
  test("a count with no recorded visit prints the count alone", () => {
    expect(line({ requesterBookingCount: 3, requesterLastVisit: null }))
      .toBe("Their 4th booking with you");
  });
  test("a visit with no title keeps the date and drops the trailing clause", () => {
    expect(line({ requesterBookingCount: 3, requesterLastVisit: { date: "2026-07-31", experienceTitle: "" } }))
      .toBe("Their 4th booking with you · last sat at your table on 2026-07-31");
  });
  test("a visit with no date is not printed at all", () => {
    expect(line({ requesterBookingCount: 3, requesterLastVisit: { date: "", experienceTitle: TITLE } }))
      .toBe("Their 4th booking with you");
  });
  test("a nonsense or negative count never prints 'their -3th booking'", () => {
    expect(line({ requesterBookingCount: -4, requesterLastVisit: null }))
      .toBe("This is their first booking with you.");
    expect(line({ requesterBookingCount: "abc", requesterLastVisit: null }))
      .toBe("This is their first booking with you.");
  });
  test("a guest who demonstrably sat here before is never called a first-timer", () => {
    // The API cannot currently send this pair, but the screen must not contradict itself if it ever does.
    expect(line({ requesterBookingCount: 0, requesterLastVisit: { date: "2026-07-31", experienceTitle: TITLE } }))
      .toBe("Their 2nd booking with you · last sat at your table on 2026-07-31, for " + TITLE);
  });
  test("an experience title is printed as text, never as markup", () => {
    const node = globalThis.__hostGuestHistoryBlock(
      { requesterBookingCount: 2, requesterLastVisit: { date: "2026-07-31", experienceTitle: "<img src=x onerror=alert(1)>" } },
      window.tstsEl
    );
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
