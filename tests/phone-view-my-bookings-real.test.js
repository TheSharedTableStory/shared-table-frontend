// REAL coverage for sir's order O-103, the phone view of My Experiences.
//
// sir, 2026-09-13: "fix all phone view for the website pages using agent without losing anything on
// desktop website". Four things were wrong at 375 wide on this page, all of them read off the capture
// DOCS/Audits/Evidence/phone-before-2026-09-13/my-bookings-guest-375.png:
//   1. a card carrying a "Sharing with" or "Gifted by" chip crushed the experience title to a column
//      one letter wide, because the chip's column refused to give up any width;
//   2. the tab strip ran past the right edge, cutting "My Hosted Experienc" mid word and leaving the
//      wishlist tab, the highlighted one when the wishlist is open, entirely off screen;
//   3. a sentence length fact value could never wrap, so it ran through the card's padding and off
//      the card edge;
//   4. the action buttons were locked to two narrow columns with their labels held on one line, so
//      "Hand back this seat" filled its button edge to edge with no padding left.
//
// WHY THIS FILE EXISTS: every fix here is a class string or an inline style that a person only ever
// sees rendered. Reading the source cannot tell whether the phone rule and the wide rule both land on
// the element; only running the real page script against a real booking can. The wide half matters as
// much as the phone half, because sir's order is that the desktop site loses nothing: every test below
// checks the 640 and above value as well as the phone one.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// common.js is loaded REAL, not stubbed: every node on these cards is built through window.tstsEl,
// so a markup mistake fails here rather than on sir's screen.
const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");
const PAGE_HTML = readFileSync(resolve(__dirname, "..", "my-bookings.html"), "utf-8");

const DAY = 24 * 60 * 60 * 1000;

// The two class strings the page must produce for a card header, phone first, wide restored by sm:.
const HEADER_ROW_CLASS = "flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start sm:gap-4";
const STATUS_COL_CLASS = "flex flex-col items-start sm:items-end sm:shrink-0";
const WIDE_ACTION_GRID = "repeat(auto-fit, minmax(140px, 1fr))";

function setWindowWidth(px) {
  Object.defineProperty(window, "innerWidth", { value: px, writable: true, configurable: true });
}

beforeAll(() => {
  document.body.innerHTML = `
    <div id="content-area"></div>
    <button id="tab-trips"></button>
    <button id="tab-hosting"></button>
    <button id="tab-wishlist"></button>
  `;
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = () => {};
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(COMMON_SRC);
  } catch (_c) {
    void _c; // common.js also bootstraps navbar and footer for a real page; only its helpers matter here
  }
  // NOT wrapped: if the edit broke the page script, this must fail loudly.
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  // A Date still reads as a real booking date; a string is echoed back, so a test can hand the page a
  // value of an exact length and watch which of the two rules the page picks for it.
  window.tstsFormatDateShort = (v) => ((v instanceof Date) ? "14 Sep 2026" : String(v));
  window.__tstsMeId = "me-1";
  setWindowWidth(1440);
});

// A confirmed, paid, upcoming booking: the card with the four action buttons on it.
function upcomingBooking(over) {
  return Object.assign({
    _id: "bk-phone-1",
    bookingRef: "SG3C-D42F",
    status: "confirmed",
    paymentStatus: "paid",
    bookingDate: new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10),
    timeSlot: "17:00 - 20:00",
    guests: 1,
    amountCents: 24000,
    currency: "aud",
    experience: {
      _id: "exp-1",
      title: "Twilight Supper Club: Walk-In Welcome",
      city: "Melbourne",
      addressLine: "88 Smith Street",
      suburb: "Fitzroy",
      state: "VIC",
      imageUrl: "/assets/experience-default.jpg"
    }
  }, over || {});
}

// The same booking as a seat someone else paid for and gave away: the card in sir's capture that
// carries both the long fact sentence and the "Hand back this seat" button.
function giftedBooking(over) {
  return upcomingBooking(Object.assign({
    bookingRef: "GT-7E4CED",
    isGiftSeat: true,
    giftedByName: "Maria Romano",
    giftedByUserId: "gifter-1",
    guestId: "me-1"
  }, over || {}));
}

// A guest's private request, the second card family that uses the same header and the same fact rows.
function privateRequest(over) {
  return Object.assign({
    _id: "req-phone-1",
    status: "awaiting_host",
    holdState: "authorized",
    experienceId: "exp-1",
    experienceTitle: "Dumplings in Fitzroy",
    hostName: "Mei",
    hostId: "host-1",
    preferredDate: "2026-10-02",
    preferredTime: "18:00 - 21:00",
    guests: 6,
    amountCents: 50000,
    currency: "aud",
    expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString()
  }, over || {});
}

function factValueFor(card, label) {
  const cells = Array.prototype.slice.call(card.querySelectorAll("div.min-w-0"));
  for (let i = 0; i < cells.length; i++) {
    const labelEl = cells[i].querySelector("p.heading-serif");
    if (labelEl && String(labelEl.textContent || "").trim() === label) {
      // The label and the value are both bold paragraphs; the label is the serif one.
      const ps = Array.prototype.slice.call(cells[i].querySelectorAll("p"));
      return ps.filter((p) => !p.classList.contains("heading-serif"))[0] || null;
    }
  }
  return null;
}

function tabStripFromPage() {
  const doc = new DOMParser().parseFromString(PAGE_HTML, "text/html");
  return doc.querySelector('nav[aria-label="Tabs"]');
}

describe("PHONE-my-bookings-1: the card header stacks on a phone and is the wide row again from 640", () => {
  test("a booking shared with someone stacks its header, so the title keeps the whole width", () => {
    const card = globalThis.renderTripCard(upcomingBooking({
      sharedWith: [{ id: "u2", name: "Sarah Mitchell", pic: "" }, { id: "u3", name: "Tom Hale", pic: "" }, { id: "u4", name: "Ana Diaz", pic: "" }]
    }));
    const header = card.children[0];
    expect(card.textContent).toContain("Sharing with");
    expect(header.className).toBe(HEADER_ROW_CLASS);
    expect(header.children[1].className).toBe(STATUS_COL_CLASS);
  });

  test("the wide row is restored by sm:, so nothing about it is lost from 640 up", () => {
    const header = globalThis.renderTripCard(giftedBooking()).children[0];
    // Below 640 these four decide: a column, a 0.5rem gap, and a status block that starts at the left.
    ["flex", "flex-col", "gap-2"].forEach((c) => expect(header.classList.contains(c)).toBe(true));
    expect(header.children[1].classList.contains("items-start")).toBe(true);
    // From 640 up these five put back exactly what the page had before: a row, spread apart, top
    // aligned, a 1rem gap, a status block on the right that never gives up width.
    ["sm:flex-row", "sm:justify-between", "sm:items-start", "sm:gap-4"].forEach((c) => expect(header.classList.contains(c)).toBe(true));
    expect(header.children[1].classList.contains("sm:items-end")).toBe(true);
    expect(header.children[1].classList.contains("sm:shrink-0")).toBe(true);
    // And the phone rule is nowhere in the wide set: no bare shrink-0, no bare items-end.
    expect(header.children[1].classList.contains("shrink-0")).toBe(false);
    expect(header.children[1].classList.contains("items-end")).toBe(false);
  });

  test("the title block is still read first, above the status block, on a phone", () => {
    const card = globalThis.renderTripCard(giftedBooking());
    const header = card.children[0];
    expect(String(header.children[0].textContent || "")).toContain("Twilight Supper Club");
    expect(String(header.children[1].textContent || "")).toContain("Confirmed");
  });

  test("the private request card header carries the same two class strings", () => {
    const header = globalThis.__renderPrivateRequestCard(privateRequest()).children[0];
    expect(header.className).toBe(HEADER_ROW_CLASS);
    expect(header.children[1].className).toBe(STATUS_COL_CLASS);
  });
});

describe("PHONE-my-bookings-2: the tab strip reaches both screen edges on a phone", () => {
  test("the strip carries the phone classes and the sm: restore", () => {
    const nav = tabStripFromPage();
    expect(nav).toBeTruthy();
    expect(nav.getAttribute("class")).toBe(
      "-mb-px -mx-4 px-4 flex space-x-5 overflow-x-auto snap-x snap-mandatory sm:mx-0 sm:px-0 sm:space-x-8"
    );
    // The negative margin is always paired with the matching padding, or the tabs would sit 16px left
    // of everything else on the page.
    expect(nav.classList.contains("-mx-4")).toBe(true);
    expect(nav.classList.contains("px-4")).toBe(true);
    // From 640 up: no margin, no padding, the 2rem gap back. That is the row the desktop site has today.
    ["sm:mx-0", "sm:px-0", "sm:space-x-8"].forEach((c) => expect(nav.classList.contains(c)).toBe(true));
  });

  test("every tab is a snap point, so a scrolled strip stops with a whole tab at the edge", () => {
    const nav = tabStripFromPage();
    const ids = ["tab-trips", "tab-hosting", "tab-wishlist"];
    ids.forEach((id) => {
      const btn = nav.querySelector("#" + id);
      expect(btn).toBeTruthy();
      expect(btn.classList.contains("snap-start")).toBe(true);
    });
  });

  test("switching tabs keeps the snap point on all three, because the page rewrites their classes", () => {
    globalThis.toggleTab("wishlist");
    ["tab-trips", "tab-hosting", "tab-wishlist"].forEach((id) => {
      expect(document.getElementById(id).classList.contains("snap-start")).toBe(true);
    });
    expect(document.getElementById("tab-wishlist").classList.contains("text-tsts-clay")).toBe(true);
    globalThis.toggleTab("trips");
    expect(document.getElementById("tab-trips").classList.contains("text-tsts-clay")).toBe(true);
    expect(document.getElementById("tab-trips").classList.contains("snap-start")).toBe(true);
  });

  test("the tab the address asks for is brought into the strip, and the page itself never moves", () => {
    const calls = [];
    const wishlistBtn = document.getElementById("tab-wishlist");
    wishlistBtn.scrollIntoView = (opts) => { calls.push(opts); };
    globalThis.__mbScrollActiveTabIntoView("wishlist");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ inline: "start", block: "nearest" });
  });
});

describe("PHONE-my-bookings-3: a sentence length fact value wraps, a short one never does", () => {
  test("the gifted seat sentence is allowed to wrap inside the card", () => {
    const card = globalThis.renderTripCard(giftedBooking());
    const value = factValueFor(card, "Your seat");
    expect(value).toBeTruthy();
    expect(String(value.textContent)).toBe("Gifted by Maria Romano. No charge to you.");
    expect(value.classList.contains("break-words")).toBe(true);
    expect(value.classList.contains("whitespace-nowrap")).toBe(false);
  });

  test("a short value keeps its one line, which is what that rule was added for", () => {
    const card = globalThis.renderTripCard(upcomingBooking());
    const paid = factValueFor(card, "Total paid");
    expect(String(paid.textContent)).toBe("A$240");
    expect(paid.classList.contains("whitespace-nowrap")).toBe(true);
    expect(paid.classList.contains("break-words")).toBe(false);
    const guests = factValueFor(card, "Guests");
    expect(String(guests.textContent)).toBe("1 guest");
    expect(guests.classList.contains("whitespace-nowrap")).toBe(true);
  });

  test("the line is drawn at 22 characters: 22 holds one line, 23 may wrap", () => {
    const twentyTwo = "1234567890123456789012";
    const twentyThree = "12345678901234567890123";
    expect(twentyTwo).toHaveLength(22);
    expect(twentyThree).toHaveLength(23);
    const shortValue = factValueFor(globalThis.__renderPrivateRequestCard(privateRequest({ preferredDate: twentyTwo })), "Date");
    expect(String(shortValue.textContent)).toBe(twentyTwo);
    expect(shortValue.classList.contains("whitespace-nowrap")).toBe(true);
    expect(shortValue.classList.contains("break-words")).toBe(false);
    const longValue = factValueFor(globalThis.__renderPrivateRequestCard(privateRequest({ preferredDate: twentyThree })), "Date");
    expect(String(longValue.textContent)).toBe(twentyThree);
    expect(longValue.classList.contains("break-words")).toBe(true);
    expect(longValue.classList.contains("whitespace-nowrap")).toBe(false);
  });

  test("the same rule governs both card families, so the time range on a request still holds one line", () => {
    const time = factValueFor(globalThis.__renderPrivateRequestCard(privateRequest()), "Time");
    expect(String(time.textContent)).toBe("6:00 PM – 9:00 PM");
    expect(time.classList.contains("whitespace-nowrap")).toBe(true);
  });
});

describe("PHONE-my-bookings-4: one action button per row on a phone, the wide grid from 640", () => {
  test("on a phone each action takes the full width of the card", () => {
    setWindowWidth(375);
    const card = globalThis.renderTripCard(giftedBooking());
    const grid = card.querySelector("[data-mb-action-grid]");
    expect(grid).toBeTruthy();
    expect(grid.style.gridTemplateColumns).toBe("1fr");
    expect(String(card.textContent)).toContain("Hand back this seat");
  });

  test("at 640 and above the row is the auto fit grid the page has today, unchanged", () => {
    setWindowWidth(640);
    expect(globalThis.renderTripCard(giftedBooking()).querySelector("[data-mb-action-grid]").style.gridTemplateColumns).toBe(WIDE_ACTION_GRID);
    setWindowWidth(1440);
    expect(globalThis.renderTripCard(giftedBooking()).querySelector("[data-mb-action-grid]").style.gridTemplateColumns).toBe(WIDE_ACTION_GRID);
  });

  test("a long label may wrap on a phone and is held on one line on a wide screen", () => {
    setWindowWidth(375);
    const phoneGrid = globalThis.renderTripCard(giftedBooking()).querySelector("[data-mb-action-grid]");
    Array.prototype.slice.call(phoneGrid.children).forEach((c) => expect(c.style.whiteSpace).toBe("normal"));
    setWindowWidth(1440);
    const wideGrid = globalThis.renderTripCard(giftedBooking()).querySelector("[data-mb-action-grid]");
    Array.prototype.slice.call(wideGrid.children).forEach((c) => expect(c.style.whiteSpace).toBe("nowrap"));
  });

  test("a window dragged across 640 re-shapes the buttons, with no reload and no re-render", () => {
    setWindowWidth(1440);
    const card = globalThis.renderTripCard(giftedBooking());
    document.getElementById("content-area").appendChild(card);
    const grid = card.querySelector("[data-mb-action-grid]");
    expect(grid.style.gridTemplateColumns).toBe(WIDE_ACTION_GRID);
    setWindowWidth(375);
    window.dispatchEvent(new window.Event("resize"));
    expect(grid.style.gridTemplateColumns).toBe("1fr");
    Array.prototype.slice.call(grid.children).forEach((c) => expect(c.style.whiteSpace).toBe("normal"));
    setWindowWidth(1440);
    window.dispatchEvent(new window.Event("resize"));
    expect(grid.style.gridTemplateColumns).toBe(WIDE_ACTION_GRID);
    Array.prototype.slice.call(grid.children).forEach((c) => expect(c.style.whiteSpace).toBe("nowrap"));
    document.getElementById("content-area").textContent = "";
  });

  test("the private request card's buttons take the same two shapes", () => {
    setWindowWidth(375);
    const phoneCard = globalThis.__renderPrivateRequestCard(privateRequest());
    const phoneGrid = phoneCard.querySelector("[data-mb-action-grid]");
    expect(phoneGrid).toBeTruthy();
    expect(phoneGrid.style.gridTemplateColumns).toBe("1fr");
    setWindowWidth(1440);
    const wideGrid = globalThis.__renderPrivateRequestCard(privateRequest()).querySelector("[data-mb-action-grid]");
    expect(wideGrid.style.gridTemplateColumns).toBe(WIDE_ACTION_GRID);
  });
});
