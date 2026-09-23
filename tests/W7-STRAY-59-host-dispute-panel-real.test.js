// W7 STRAY-59, AUDIT (2026-09-23): the screen proof this fix shipped without.
//
// The host's Booking Details panel used to print the card provider's own stored word for why a
// chargeback was raised ("fraudulent", "product_not_received") exactly as stored. It now prints
// the sentence the platform writes for that word and sends with the booking. The fix landed on a
// FROZEN script held by a reading of the source, which cannot say what a host sees; this renders
// the real panel through the shipped script and reads it, the way the page's own suites do.

import { describe, test, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

function disputed(over) {
  return Object.assign({
    _id: "6aaa9b5c33b180bf4455a99b",
    bookingRef: "DS11-QQAG",
    guestId: { name: "Ava Chen" },
    guestName: "Ava Chen",
    guests: 2,
    bookingDate: "2026-09-18",
    timeSlot: "18:00-20:00",
    status: "confirmed",
    paymentStatus: "paid",
    experience: { title: "Tuscan Bread Night" },
    dispute: { active: true, reason: "fraudulent", reasonLabel: "the cardholder says they did not authorise this charge" },
  }, over || {});
}

beforeAll(() => {
  document.body.innerHTML = `
    <div id="content-area"></div>
    <button id="tab-trips"></button>
    <button id="tab-hosting"></button>
    <button id="tab-wishlist"></button>
    <div id="guest-modal" class="hidden">
      <h3 id="modal-experience-title"></h3>
      <div id="modal-guest-list"></div>
    </div>
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
  window.tstsPrompt = vi.fn(async () => "");
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        if (k.indexOf("data-") === 0 || k.indexOf("aria-") === 0) el.setAttribute(k, String(props[k]));
        else el[k] = props[k];
      });
    }
    if (Array.isArray(kids)) kids.forEach((k) => { if (k) el.append(typeof k === "string" ? document.createTextNode(k) : k); });
    return el;
  };
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeMailto = (e) => "mailto:" + String(e || "");
  window.tstsFormatDateShort = (d) => String(d || "");
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsBuildImageCarousel = () => document.createElement("div");
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);
  globalThis.WebSocket = class { constructor() {} send() {} close() {} };

  try {
    // The seeder is declared in the SAME eval as the page, which is the only way to reach a cache
    // the page declared with `let`. This is the harness the page's own messaging suite uses.
    // eslint-disable-next-line no-eval
    (0, eval)(SRC + "\n;globalThis.__seedHostBookings = function (rows) { hostBookingsCache = rows; return hostBookingsCache.length; };\n");
  } catch (eEval) {
    void eEval;
  }
});

function renderPanel(booking) {
  const seeded = globalThis.__seedHostBookings([booking]);
  if (seeded !== 1) throw new Error("the roster cache was not seeded, so this case would prove nothing");
  document.getElementById("modal-guest-list").textContent = "";
  globalThis.openGuestModalById(String(booking._id));
  const panel = document.getElementById("modal-guest-list");
  if (!panel.textContent.trim() && !panel.children.length) throw new Error("the Booking Details panel rendered nothing, so this case would prove nothing");
  return panel;
}

describe("W7 STRAY-59: what a host reads on a disputed booking", () => {
  test("the panel shows the sentence, and the stored word is nowhere on the screen", () => {
    const panel = renderPanel(disputed());
    expect(panel.textContent).toContain("the cardholder says they did not authorise this charge");
    expect(panel.textContent).not.toContain("fraudulent");
  });

  test("a booking whose record arrived with no sentence still reads as words", () => {
    const panel = renderPanel(disputed({ _id: "6aaa9b5c33b180bf4455a99c", dispute: { active: true, reason: "product_not_received" } }));
    expect(panel.textContent).toContain("The guest's bank has raised a dispute on this payment.");
    expect(panel.textContent).not.toContain("product_not_received");
  });

  test("a disputed booking with no reason at all says nothing extra rather than an empty line", () => {
    const panel = renderPanel(disputed({ _id: "6aaa9b5c33b180bf4455a99d", dispute: { active: true } }));
    expect(panel.textContent).toContain("Dispute");
    expect(panel.textContent).not.toContain("The guest's bank has raised a dispute on this payment.");
  });
});
