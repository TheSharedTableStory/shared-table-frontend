// REAL coverage for the "Total paid" line on js/success.js — sir 2026-09-13.
//
// A seat the host funded, or one an administrator waived, is a KNOWN total of
// zero, and the confirmation page says so in sir's words: "The Seat is free
// for all". The unknown-value dash is reserved for a booking whose total the
// page genuinely does not have.
//
// success.js runs TOP-LEVEL code on import (no IIFE) and captures its element
// references at that moment, so each test builds the DOM and the window stubs
// BEFORE evaluating the script — the same load path as tests/success-real.test.js.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "success.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="loading-state"><p></p></div>
    <div id="success-state" class="hidden">
      <img id="success-exp-image" alt="" />
      <h2 id="success-exp-title"></h2>
      <dl>
        <dt>Date</dt><dd id="success-exp-date"></dd>
        <dt>Guests</dt><dd id="success-exp-guests"></dd>
        <dt>Time</dt><dd id="success-exp-time"></dd>
        <dt>Total paid</dt><dd id="success-exp-total"></dd>
        <dt>Host</dt><dd id="success-exp-host"></dd>
      </dl>
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

  window.tstsSafeImg = (el, primary, fallback) => { el.src = String(primary || fallback || ""); };
  window.tstsFormatDateShort = null;
  Object.defineProperty(navigator, "clipboard", { value: undefined, writable: true, configurable: true });

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") {
    await __capturedDOMHandler();
  }
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

// Drives the real page: verify -> my-bookings -> populate the summary card with
// the given booking row. Returns the rendered "Total paid" text.
async function renderTotalFor(booking) {
  loadSuccess({
    search: "?sessionId=cs_free_seat&bookingId=" + String(booking._id),
    authFetch: async (url) => {
      if (url === "/api/bookings/verify") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "confirmed" } }) };
      }
      if (url === "/api/bookings/my-bookings") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { bookings: [booking] } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  await fireDOMReady();
  return document.getElementById("success-exp-total").textContent;
}

function baseBooking(extra) {
  return Object.assign({
    _id: "bk_free_1",
    experience: { _id: "exp_free_1", title: "Lentil Sunday" },
    bookingDate: "2026-06-01",
    numGuests: 2,
    currency: "AUD",
  }, extra || {});
}

describe("success — Total paid: a known zero reads as free, an unknown total keeps the dash", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("a paid total prints the formatted price", async () => {
    const text = await renderTotalFor(baseBooking({ amountCents: 12000 }));
    expect(text).toBe("A$120");
  });

  test("an explicit zero total (amountCents 0) prints The Seat is free for all", async () => {
    const text = await renderTotalFor(baseBooking({ amountCents: 0 }));
    expect(text).toBe("The Seat is free for all");
  });

  test("a zero pricing-snapshot total prints The Seat is free for all", async () => {
    const text = await renderTotalFor(baseBooking({ pricingSnapshot: { totalCents: 0 } }));
    expect(text).toBe("The Seat is free for all");
  });

  test("a booking with no total at all prints the unknown-value dash", async () => {
    const text = await renderTotalFor(baseBooking());
    expect(text).toBe("—");
  });

  test("the free-seat sentence carries no dash character of any kind", async () => {
    const text = await renderTotalFor(baseBooking({ amountCents: 0 }));
    expect(text).toBe("The Seat is free for all");
    expect(/[-‐‑‒–—―−]/.test(text)).toBe(false);
  });

  // The walk on the local harness: a guest redeemed a full-discount code, the
  // server confirmed the seat through its free branch with no card step, and the
  // booking stored a total of nothing while the seat price and the listing price
  // stayed at 95. The page must read the stored total, never the seat price.
  test("a full-discount booking with a 95 seat price still prints The Seat is free for all", async () => {
    const text = await renderTotalFor(baseBooking({
      amountCents: 0,
      pricePerSeat: 95,
      numGuests: 1,
      experience: { _id: "exp_free_1", title: "Lentil Sunday", price: 95 },
    }));
    expect(text).toBe("The Seat is free for all");
    expect(text).not.toBe("A$95");
  });

  test("a booking whose only stored figure is a zero pricing-snapshot total prints The Seat is free for all", async () => {
    const text = await renderTotalFor(baseBooking({
      pricingSnapshot: { totalCents: 0 },
      numGuests: 2,
      experience: { _id: "exp_free_1", title: "Lentil Sunday", price: 60 },
    }));
    expect(text).toBe("The Seat is free for all");
    expect(text).not.toBe("A$120");
  });

  test("a legacy record with no stored total still prints the seat price times guests", async () => {
    const text = await renderTotalFor(baseBooking({
      numGuests: 2,
      experience: { _id: "exp_free_1", title: "Lentil Sunday", price: 95 },
    }));
    expect(text).toBe("A$190");
  });
});
