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
  test("toMoney basic rounding to 2 decimals", () => {
    expect(globalThis.toMoney(45)).toBe("$45.00");
    expect(globalThis.toMoney(45.6789)).toBe("$45.68");
    expect(globalThis.toMoney(0)).toBe("$0.00");
  });
  test("toMoney non-finite → '$0.00' or ', ' (documented behaviour)", () => {
    // Backend returns ", " literal as the fallback (a known UX placeholder).
    expect(globalThis.toMoney("not a number")).toBe(", ");
    expect(globalThis.toMoney(undefined)).toBe(", ");
  });
  test("centsToMoney converts cents → dollars", () => {
    expect(globalThis.centsToMoney(12345)).toBe("$123.45");
    expect(globalThis.centsToMoney(0)).toBe("$0.00");
  });
  test("centsToMoney non-finite → ', '", () => {
    expect(globalThis.centsToMoney("oops")).toBe(", ");
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
  test("stateLabel: 'none' → 'None'; underscores → spaces + uppercase", () => {
    expect(globalThis.stateLabel("")).toBe("None");
    expect(globalThis.stateLabel("under_review")).toBe("UNDER REVIEW");
    expect(globalThis.stateLabel("confirmed")).toBe("CONFIRMED");
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
  test("mapHostScopeError translates HOST_ROLE_REQUIRED → host-onboarding copy", () => {
    expect(globalThis.mapHostScopeError({ error: "HOST_ROLE_REQUIRED" }))
      .toMatch(/host onboarding/i);
  });
  test("mapHostScopeError 403 surfaces extracted message", () => {
    expect(globalThis.mapHostScopeError({ message: "Denied" }, 403)).toBe("Denied");
  });
  test("mapStripeConnectStartError handles STRIPE_CONNECT_NOT_CONFIGURED", () => {
    expect(globalThis.mapStripeConnectStartError({ error: "STRIPE_CONNECT_NOT_CONFIGURED" }))
      .toMatch(/not configured/i);
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
  test("canonicalTabParam: hosting → 'hosting'; everything else → 'experiences'", () => {
    expect(globalThis.canonicalTabParam("hosting")).toBe("hosting");
    expect(globalThis.canonicalTabParam("trips")).toBe("experiences");
    expect(globalThis.canonicalTabParam("wishlist")).toBe("experiences");
  });
  test("resolveHostingSection: maps legacy section names + falls back to 'overview'", () => {
    expect(globalThis.resolveHostingSection("private-requests")).toBe("bookings");
    expect(globalThis.resolveHostingSection("verification-payout")).toBe("verification");
    expect(globalThis.resolveHostingSection("earnings-payouts")).toBe("earnings-fees");
    expect(globalThis.resolveHostingSection("fees-charges")).toBe("earnings-fees");
    expect(globalThis.resolveHostingSection("listings")).toBe("listings");
    expect(globalThis.resolveHostingSection("garbage")).toBe("overview");
  });
  test("resolveHostingSection: panel hint 'private-request-actions' → 'bookings'", () => {
    expect(globalThis.resolveHostingSection("", "private-request-actions")).toBe("bookings");
  });
});
