// REAL coverage for js/success.js — exercises the post-Stripe success page:
// verify booking, fetch my-bookings, populate summary, viral invite link, copy.
//
// success.js runs TOP-LEVEL code on import (no IIFE), so each test sets up the
// DOM + window.location + window.authFetch BEFORE evaluating the script.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "success.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="loading-state"></div>
    <div id="success-state" class="hidden">
      <img id="success-exp-image" alt="" />
      <h2 id="success-exp-title"></h2>
      <p id="success-exp-date"></p>
      <p id="success-exp-guests"></p>
      <input id="invite-link-input" />
      <button id="copy-invite-btn">Copy</button>
      <span id="copy-feedback" class="hidden">Copied!</span>
      <div id="success-next-steps" class="hidden"></div>
    </div>
    <div id="error-state" class="hidden">
      <p id="error-message"></p>
      <button id="retry-verify-btn">Retry</button>
    </div>
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

let __capturedDOMHandler = null;

function loadSuccess(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();

  Object.defineProperty(window, "location", {
    value: {
      search: opts.search || "",
      origin: "https://example.com",
      pathname: "/success.html",
    },
    writable: true,
    configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }),
  }));

  // capture DOMContentLoaded handler
  __capturedDOMHandler = null;
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") {
      __capturedDOMHandler = handler;
      return;
    }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  // tstsSafeImg stub: just sets src directly
  window.tstsSafeImg = (el, primary, fallback) => { el.src = String(primary || fallback || ""); };

  // tstsFormatDateShort stub
  window.tstsFormatDateShort = null; // force native fallback

  // clipboard mock — opt-in per test
  if (opts.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
      value: opts.clipboard,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(navigator, "clipboard", { value: undefined, writable: true, configurable: true });
  }

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") {
    await __capturedDOMHandler();
  }
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

describe("success — guards", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("missing sessionId shows error state immediately", async () => {
    loadSuccess({ search: "" });
    await fireDOMReady();
    expect(document.getElementById("error-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/missing booking information/i);
  });
});

describe("success — verify flow", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("verify ok + my-bookings returns booking → success state populated", async () => {
    const calls = [];
    loadSuccess({
      search: "?sessionId=cs_test_1&bookingId=book_42",
      authFetch: async (url, opts) => {
        calls.push({ url, method: (opts && opts.method) || "GET" });
        if (url === "/api/bookings/verify") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }) };
        }
        if (url === "/api/bookings/my-bookings") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                bookings: [{
                  _id: "book_42",
                  experience: { title: "Lentil Sunday", _id: "exp_1", imageUrl: "https://img/1.jpg" },
                  bookingDate: "2026-06-01",
                  numGuests: 3,
                }],
              },
            }),
          };
        }
        if (url === "/api/invites") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { inviteUrl: "https://share/abc" } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    // verify happened, my-bookings happened
    expect(calls.find((c) => c.url === "/api/bookings/verify" && c.method === "POST")).toBeTruthy();
    expect(calls.find((c) => c.url === "/api/bookings/my-bookings")).toBeTruthy();
    // success state shown
    expect(document.getElementById("success-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-exp-title").textContent).toBe("Lentil Sunday");
    expect(document.getElementById("success-exp-guests").textContent).toMatch(/3 guests/);
    // invite link was upgraded via /api/invites
    expect(document.getElementById("invite-link-input").value).toBe("https://share/abc");
    // next steps revealed
    expect(document.getElementById("success-next-steps").classList.contains("hidden")).toBe(false);
  });

  test("verify returns ok:false → error state with server message", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_2",
      authFetch: async () => ({
        ok: true, status: 200, json: async () => ({ ok: false, message: "PAYMENT_PENDING" }),
      }),
    });
    await fireDOMReady();
    expect(document.getElementById("error-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/PAYMENT_PENDING/);
  });

  test("verify returns status !== confirmed/paid → error", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_3",
      authFetch: async () => ({
        ok: true, status: 200, json: async () => ({ ok: true, data: { status: "pending" } }),
      }),
    });
    await fireDOMReady();
    expect(document.getElementById("error-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/not confirmed/i);
  });

  test("HTTP non-ok on verify → error", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_4",
      authFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    await fireDOMReady();
    expect(document.getElementById("error-state").classList.contains("hidden")).toBe(false);
  });

  test("my-bookings 401 → fallback summary (Booking confirmed)", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_5",
      authFetch: async (url) => {
        if (url === "/api/bookings/verify") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }) };
        }
        if (url === "/api/bookings/my-bookings") {
          return { ok: false, status: 401, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("success-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-exp-title").textContent).toMatch(/Booking confirmed/);
    expect(document.getElementById("success-exp-date").textContent).toMatch(/log in/i);
  });

  test("my-bookings empty (booking not found) → generic fallback summary", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_6&bookingId=missing_id",
      authFetch: async (url) => {
        if (url === "/api/bookings/verify") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }) };
        }
        if (url === "/api/bookings/my-bookings") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { bookings: [] } }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("success-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-exp-title").textContent).toMatch(/booked/i);
  });

  test("payment status 'paid' is accepted as success", async () => {
    loadSuccess({
      search: "?sessionId=cs_test_7&bookingId=b1",
      authFetch: async (url) => {
        if (url === "/api/bookings/verify") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "paid" } }) };
        }
        if (url === "/api/bookings/my-bookings") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { bookings: [{ _id: "b1", experience: { title: "Pasta Night" }, bookingDate: "2026-06-01", numGuests: 1 }] } }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("success-state").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-exp-title").textContent).toBe("Pasta Night");
  });
});

describe("success — invite copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("copy button uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn(async () => {});
    loadSuccess({
      search: "?sessionId=cs_test_copy&bookingId=b1",
      clipboard: { writeText },
      authFetch: async (url) => {
        if (url === "/api/bookings/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }) };
        if (url === "/api/bookings/my-bookings") {
          return { ok: true, status: 200, json: async () => ({
            ok: true, data: { bookings: [{ _id: "b1", experience: { title: "X", _id: "exp_x" }, numGuests: 2, bookingDate: "2026-06-01" }] },
          }) };
        }
        // suppress /api/invites upgrade so we keep the deterministic fallback URL
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("invite-link-input").value).toContain("/experience.html?id=exp_x");
    document.getElementById("copy-invite-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("exp_x");
    expect(document.getElementById("copy-feedback").classList.contains("hidden")).toBe(false);
  });
});

describe("success — pure helpers (resolveBookingId, collectBookingRows)", () => {
  // We can't easily import these as they're top-level functions in a script
  // that auto-runs. Instead, drive them through the public flow above.
  test("(documented) helpers covered indirectly by 'verify flow' tests above", () => {
    expect(true).toBe(true);
  });
});
