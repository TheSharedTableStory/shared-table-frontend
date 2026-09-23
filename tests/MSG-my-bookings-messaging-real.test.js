// MSG (O-141 / O-142, sir 2026-09-16) — the website's two surfaces.
//
// The roster's View Details drops the guest's address and carries one primary "Message guest"
// button; the guest's booking card carries "Message host" the same way. These cases evaluate the
// REAL js/my-bookings.js the way the page's own suite does (the file is not wrapped in an IIFE, so
// its top-level functions become globals) and then RENDER the two surfaces and read what they say.

import { describe, test, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

const HOST_BOOKING = {
  _id: "6aaa9b5c33b180bf4455a88a",
  bookingRef: "VD57-BCAG",
  guestId: { name: "Ava Chen" },
  guestName: "Ava Chen",
  guestEmail: "ava.private@example.com",
  guests: 2,
  bookingDate: "2026-09-18",
  timeSlot: "18:00-20:00",
  status: "confirmed",
  paymentStatus: "paid",
  experience: { title: "Tuscan Bread Night" },
  messaging: { available: true, messageCount: 2 }
};

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
    // The seeder is defined INSIDE this eval, beside the page's own code. A global eval puts `let`
    // and `const` in a new declarative environment of its own, so a later eval cannot reach the
    // page's caches; a function declared in the same eval as the page can, and assigns the real
    // binding the page reads.
    // eslint-disable-next-line no-eval
    (0, eval)(SRC + "\n;globalThis.__seedHostBookings = function (rows) { hostBookingsCache = rows; return hostBookingsCache.length; };\n");
  } catch (eEval) {
    void eEval;
  }
});

// my-bookings.js declares its caches with `let` at the top level, which makes them GLOBAL LEXICAL
// bindings rather than properties of the window, so a test cannot seed them by assignment from
// outside, and not from a second eval either: that one gets a declarative environment of its own.
// The hook above is declared in the same eval as the page, so it holds the page's own binding.
function renderRoster(booking) {
  const seeded = globalThis.__seedHostBookings([booking]);
  if (seeded !== 1) throw new Error("the roster cache was not seeded, so this case would prove nothing");
  document.getElementById("modal-guest-list").textContent = "";
  globalThis.openGuestModalById(String(booking._id));
  const panel = document.getElementById("modal-guest-list");
  if (!panel.textContent.trim() && !panel.children.length) throw new Error("the View Details panel rendered nothing, so this case would prove nothing");
  return panel;
}

describe("O-141: the roster's View Details never shows the guest's address", () => {
  test("the guest's email address is nowhere on the panel, and no mail link is offered", () => {
    const panel = renderRoster(HOST_BOOKING);
    expect(panel.textContent).toContain("Ava Chen");
    expect(panel.textContent).not.toContain("ava.private@example.com");
    expect(panel.textContent).not.toContain("No email on file");
    expect(panel.querySelectorAll('a[href^="mailto:"]').length).toBe(0);
  });

  test("in its place there is ONE primary button, in the platform's own primary style", () => {
    const panel = renderRoster(HOST_BOOKING);
    const btns = panel.querySelectorAll('[data-action="booking-message"]');
    expect(btns.length).toBe(1);
    const btn = btns[0];
    expect(btn.textContent.trim()).toBe("Message guest (2)");
    expect(btn.getAttribute("data-role")).toBe("host");
    expect(btn.getAttribute("data-booking-id")).toBe(String(HOST_BOOKING._id));
    expect(btn.getAttribute("aria-label")).toBe("Message guest");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("tsts-btn-primary");
    // Never a browser default: the platform's own shape carries its radius, weight and icon.
    expect(btn.className).toContain("rounded-xl");
    expect(btn.className).toContain("font-bold");
    expect(btn.querySelector("i.fa-comments")).toBeTruthy();
  });

  test("the booking's own facts are untouched by the change", () => {
    const panel = renderRoster(HOST_BOOKING);
    expect(panel.textContent).toContain("Tuscan Bread Night");
    expect(panel.textContent).toContain("2 guests");
    expect(panel.textContent).toContain("VD57-BCAG");
  });

  test("a booking the server says has no conversation carries no button and still no address", () => {
    const closed = Object.assign({}, HOST_BOOKING, { messaging: { available: false, messageCount: 0 } });
    const panel = renderRoster(closed);
    expect(panel.querySelectorAll('[data-action="booking-message"]').length).toBe(0);
    expect(panel.textContent).not.toContain("ava.private@example.com");
  });

  test("a booking from a server that has not been updated yet degrades to no button, never to an address", () => {
    const old = Object.assign({}, HOST_BOOKING);
    delete old.messaging;
    const panel = renderRoster(old);
    expect(panel.querySelectorAll('[data-action="booking-message"]').length).toBe(0);
    expect(panel.textContent).not.toContain("ava.private@example.com");
  });
});

describe("O-141: the guest's booking card carries Message host", () => {
  function guestCard(overrides) {
    const booking = Object.assign({
      _id: "6aaa9b5c33b180bf4455a88b",
      bookingRef: "KPGD-WSK8",
      bookingDate: "2026-09-18",
      timeSlot: "18:00-20:00",
      guests: 2,
      status: "confirmed",
      paymentStatus: "paid",
      experience: { _id: "exp1", title: "Tuscan Bread Night", city: "Melbourne", images: [] },
      messaging: { available: true, messageCount: 0 }
    }, overrides || {});
    return globalThis.renderTripCard(booking);
  }

  test("a confirmed seat's card offers the button, labelled for the guest's side", () => {
    const card = guestCard();
    const btns = card.querySelectorAll('[data-action="booking-message"]');
    expect(btns.length).toBe(1);
    expect(btns[0].textContent.trim()).toBe("Message host");
    expect(btns[0].getAttribute("data-role")).toBe("guest");
    expect(btns[0].className).toContain("tsts-btn-primary");
  });

  test("a count appears once there is something to come back to", () => {
    const card = guestCard({ messaging: { available: true, messageCount: 3 } });
    expect(card.querySelector('[data-action="booking-message"]').textContent.trim()).toBe("Message host (3)");
  });

  test("a cancelled seat, where a guest most needs their host, keeps the button beside the sentence", () => {
    const card = guestCard({ status: "cancelled" });
    expect(card.textContent).toContain("This booking was cancelled.");
    expect(card.querySelectorAll('[data-action="booking-message"]').length).toBe(1);
  });

  test("a completed seat keeps it alongside the review action", () => {
    const card = guestCard({ status: "completed" });
    expect(card.querySelectorAll('[data-action="booking-message"]').length).toBe(1);
    expect(card.textContent).toContain("Write a review");
  });

  test("an unpaid seat the server refuses carries no button", () => {
    const card = guestCard({ status: "pending_payment", paymentStatus: "unpaid", messaging: { available: false, messageCount: 0 } });
    expect(card.querySelectorAll('[data-action="booking-message"]').length).toBe(0);
  });

  test("no card anywhere renders a host's address", () => {
    const card = guestCard();
    expect(card.querySelectorAll('a[href^="mailto:"]').length).toBe(0);
  });
});

describe("O-142: the letter's link opens the conversation", () => {
  test("the dashboard reads a bookingId from the address bar", () => {
    expect(typeof globalThis.openBookingMessageThread).toBe("function");
    expect(typeof globalThis.__bookingMessageButton).toBe("function");
  });

  test("the button maker labels each side correctly and never leaks a role token into the words", () => {
    const hostBtn = globalThis.__bookingMessageButton("abc", "host", 0);
    const guestBtn = globalThis.__bookingMessageButton("abc", "guest", 0);
    expect(hostBtn.textContent.trim()).toBe("Message guest");
    expect(guestBtn.textContent.trim()).toBe("Message host");
    expect(hostBtn.textContent).not.toMatch(/[A-Z_]{4,}/);
    expect(guestBtn.textContent).not.toMatch(/[A-Z_]{4,}/);
  });
});
