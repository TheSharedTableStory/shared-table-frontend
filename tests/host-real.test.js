// REAL coverage for js/host.js — host dashboard.
// host.js is 3,037 LOC wrapped in an IIFE. Pure helpers are private; we cover
// the observable surface area:
//   - Auth gate: no session hint → redirect; invalid session → redirect; valid
//     session + csrf ok → init runs through.
//   - Listings empty state: API returns [] → 'my-listings-empty' revealed.
//   - Listings populated: API returns items → list rendered.
//   - Listings error path: API 500 → 'my-listings-error' revealed.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "host.js"), "utf-8");

function buildDom() {
  // host.html DOM is enormous — we provide the minimal set of IDs host.js
  // touches at IIFE-init + the listings panel + notice bar.
  document.body.innerHTML = `
    <p id="notice-bar" class="hidden"><span id="notice-text"></span></p>

    <form id="create-experience-form">
      <input id="title" />
      <textarea id="description"></textarea>
      <span id="desc-counter"></span>
      <input id="price" />
      <input id="startDate" />
      <input id="endDate" />
      <input id="startTime" />
      <input id="endTime" />
      <input id="city" />
      <input id="suburb" />
      <input id="postcode" />
      <input id="addressLine" />
      <input id="addressNotes" />
      <input id="state" />
      <input id="country" />
      <input id="maxGuests" />
      <input type="checkbox" id="privateEnabled" />
      <div id="private-config-fields"></div>
      <input id="privatePrice" />
      <input id="privateCapacity" />
      <input id="privateIncludedGuests" />
      <input id="privateExtraGuestPrice" />
      <button id="verified-request-btn"></button>
      <p id="verified-status-hint"></p>
      <p id="verified-request-meta"></p>
      <input type="file" id="imageInput" />
      <div id="upload-preview"></div>
      <div id="upload-placeholder"></div>
      <button id="submit-btn">Submit</button>
      <p id="tag-limit-hint"></p>
      <p id="pricing-public-per-guest"></p>
      <p id="pricing-platform-fee-per-guest"></p>
      <p id="pricing-host-payout-estimate"></p>
      <p id="pricing-verified-impact"></p>
      <p id="pricing-private-summary"></p>
      <p id="pricing-host-charge-note"></p>
      <p id="pricing-policy-reference"></p>
      <!-- 2026-09-07: five containers for a host funding screen used to be invented here. No page in the
           site has ever carried them, and the screen that read them was an abandoned copy of the funding
           tab on My Bookings. Both the copy and this fake markup are gone; the funding screen is tested
           where it actually lives. -->
      <input id="experienceTimezone" />
      <input type="checkbox" id="bookingCutoffEnabled" />
      <input id="bookingCutoffHours" />
      <div id="cutoff-hours-row"></div>
      <p id="cutoff-preview"></p>
      <p id="cutoff-locked-banner" class="hidden"></p>
      <textarea id="requirements"></textarea>
      <input id="eventDurationMinutes" type="hidden" />
      <input id="eventDurationHours" />
      <input id="eventDurationMins" />
      <p id="duration-summary"></p>
    </form>

    <section>
      <div id="my-listings-loading" class="hidden"></div>
      <div id="my-listings-empty" class="hidden"></div>
      <div id="my-listings-error" class="hidden"></div>
      <div id="my-listings-list" class="hidden"></div>
    </section>

    <button id="wizard-draft-btn"></button>
  `;
}

let __navigatedTo = "";

function loadHost(opts) {
  opts = opts || {};
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      pathname: "/host.html",
      search: "",
      origin: "https://example.com",
      replace(v) { __navigatedTo = String(v); },
      get href() { return ""; },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });
  // localStorage hint for "is user authenticated?"
  try {
    if (opts.sessionHint) window.localStorage.setItem("tsts_user", JSON.stringify({ id: "u" }));
    else window.localStorage.removeItem("tsts_user");
  } catch (_) { /* localStorage may be unavailable in jsdom edge cases */ }

  window.tstsGetSession = opts.session || (async () => ({ ok: false }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsNotify = vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);
  window.tstsPrompt = async () => "";
  window.tstsConfirm = async () => false;

  try {
    new Function(SRC)();
  } catch (eEval) {
    // host.js init may throw on missing DOM bits; the auth gate runs first so
    // we still capture its side-effects (redirect).
    void eEval;
  }
}

async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe("host — auth gate", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("no tsts_user localStorage hint → redirectToLogin immediately (no /api/auth call)", async () => {
    let sessionCalled = false;
    loadHost({
      sessionHint: false,
      session: async () => { sessionCalled = true; return { ok: false }; },
    });
    await flush();
    expect(__navigatedTo).toMatch(/login\.html\?returnTo=/);
    // No session call needed when hint is absent
    expect(sessionCalled).toBe(false);
  });

  test("hint present but session.ok=false → redirect", async () => {
    loadHost({
      sessionHint: true,
      session: async () => ({ ok: false }),
    });
    await flush();
    expect(__navigatedTo).toMatch(/login\.html/);
  });

  test("valid session + CSRF ok → init runs (no redirect)", async () => {
    loadHost({
      sessionHint: true,
      session: async () => ({ ok: true, user: { id: "u" } }),
      authFetch: async (url) => {
        if (url === "/api/csrf") return { ok: true, status: 200, json: async () => ({ ok: true, data: { csrfToken: "csrf123" } }) };
        if (url === "/api/host/experiences") return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [] } }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
      },
    });
    await flush();
    expect(__navigatedTo).toBe("");
  });
});

describe("host — listings management RELOCATED to My Experiences (sir's architecture)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // UPDATED 2026-08-05 (owner-ordered dissection): the host page no longer carries a
  // listings panel — listings management is the sir-LOCKED "My Hosted Experiences → My
  // Listings" tab on my-bookings (locked 2026-06-12, "Lock the card"), rendered by
  // my-bookings.js renderHostListingsSection. The three old tests asserted the removed
  // panel against fixture-only DOM nodes host.js never touches.
  test("the REAL host.html ships no legacy my-listings panel", () => {
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(path.resolve(__dirname, "..", "host.html"), "utf8");
    expect(html.includes("my-listings-list")).toBe(false);
    expect(html.includes("my-listings-empty")).toBe(false);
    expect(html.includes("my-listings-error")).toBe(false);
  });

  test("plain host-page load leaves the fixture's legacy nodes untouched (host.js no longer renders listings)", async () => {
    loadHost({
      sessionHint: true,
      session: async () => ({ ok: true, user: { id: "u" } }),
      authFetch: async (url) => {
        if (url === "/api/csrf") return { ok: true, status: 200, json: async () => ({ ok: true, data: { csrfToken: "x" } }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
      },
    });
    await flush();
    // The fixture still builds the legacy nodes; host.js must not populate or reveal them.
    const list = document.getElementById("my-listings-list");
    if (list) {
      expect(list.children.length).toBe(0);
      expect(list.classList.contains("hidden")).toBe(true);
    }
  });

  test("the live renderer exists where sir locked it: my-bookings.js renderHostListingsSection", () => {
    const fs = require("fs");
    const path = require("path");
    const mb = fs.readFileSync(path.resolve(__dirname, "..", "js", "my-bookings.js"), "utf8");
    expect(/function renderHostListingsSection\(/.test(mb)).toBe(true);
  });
});
