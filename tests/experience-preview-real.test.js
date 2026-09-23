// REAL coverage of the experience page in preview mode (sir's order O-146, 2026-09-16).
//
// sir, verbatim: "anything draft is just put a preview and nroever for booking to se the interest of
// people".
//
// The page under test is the SHIPPING js/experience.js, run against the elements experience.html
// actually carries for this, pulled out of the page rather than retyped, so a page that does not ship
// the band or the interest box cannot pass this suite.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "experience.js"), "utf-8");
const PAGE = readFileSync(resolve(__dirname, "..", "experience.html"), "utf-8");

const BAND_EL = (PAGE.match(/<div id="preview-band"[\s\S]*?\n      <\/div>/) || [""])[0];
const BOX_EL = (PAGE.match(/<div id="preview-interest-box"[\s\S]*?\n              <\/div>/) || [""])[0];

function buildDom() {
  document.body.innerHTML = `
    ${BAND_EL}
    <div id="experience-content">
      <h1 id="exp-title"></h1>
      <a id="exp-city" href="#"></a>
      <p id="exp-description"></p>
      <img id="exp-image" />
      <img id="exp-host-pic" />
      <span id="exp-host-name"></span>
      <a id="exp-host-link" href="#"></a>
      <span id="exp-host-cta"></span>
      <div id="exp-price-row">
        <span id="exp-price"></span>
        <span id="exp-price-suffix"></span>
      </div>
      <span id="exp-verified-badge" class="hidden"></span>
      <span id="exp-verified-pending-badge" class="hidden"></span>
      <a id="report-experience-btn" href="#"></a>
      <button id="share-experience-btn"></button>
      <button id="bookmark-btn"></button>
      <i id="bookmark-icon"></i>
      ${BOX_EL}
      <div id="host-self-view-box" class="hidden"></div>
      <form id="booking-form">
        <input id="booking-date" type="date" />
        <select id="guest-count"><option value="1">1</option><option value="2">2</option></select>
        <input id="time-slot" />
        <label><input type="checkbox" id="booking-terms" /></label>
        <input id="promo-code" />
        <button id="book-btn" type="submit">Book</button>
      </form>
      <div id="booking-rules"></div>
      <p id="cutoff-info"></p>
      <p id="seats-info"></p>
      <div id="waitlist-cta" class="hidden"><button id="join-waitlist-btn">Join</button></div>
      <p id="waitlist-status"></p>
      <p id="booking-type-label"></p>
      <p id="booking-type-subline"></p>
      <p id="verified-fee-note"></p>
      <button id="booking-mode-shared"></button>
      <button id="booking-mode-private"></button>
      <p id="private-booking-note"></p>
      <span id="guest-count-label"></span>
      <section id="similar-section" class="hidden"><div id="similar-grid"></div></section>
      <div id="featured-review-container"></div>
      <section id="reviews-section" class="hidden"><div id="reviews-list"></div></section>
      <section id="comments-section" class="hidden">
        <div id="comments-list"></div>
        <form id="comment-form"><textarea id="comment-text"></textarea><button id="comment-submit"></button><p id="comment-hint"></p></form>
      </section>
      <div id="mobile-booking-bar"><span id="mobile-bar-price"></span><button id="mobile-bar-cta"></button></div>
    </div>
    <div id="experience-not-found" class="hidden"><p id="experience-not-found-text"></p></div>
  `;
}

function listing(over) {
  return Object.assign({
    _id: "cccccccccccccccccccccccc",
    title: "Six Seats, One Sunday",
    description: "A long Sunday table in Brunswick with three courses and no rush at all.",
    city: "Melbourne",
    suburb: "Brunswick",
    hostId: "aaaaaaaaaaaaaaaaaaaaaa11",
    hostName: "Marisa",
    price: 65,
    currency: "aud",
    maxGuests: 6,
    images: [],
    imageUrl: "",
    availableDays: ["Sun"],
    timeSlots: ["18:00-20:00"],
    isPreview: true,
    previewEnabled: true,
    datesToCome: false,
    verifiedStatus: "none",
  }, over || {});
}

function load(opts) {
  opts = opts || {};
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  Object.defineProperty(window, "location", {
    value: {
      pathname: "/experience.html",
      search: "?id=cccccccccccccccccccccccc",
      hostname: "thesharedtablestory.com",
      get href() { return "https://example.com/experience.html?id=cccccccccccccccccccccccc"; },
      set href(v) { void v; },
    },
    writable: true, configurable: true,
  });

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "viewer_1" } }));
  window.authFetch = opts.authFetch || (async (url) => {
    if (String(url).indexOf("/interest") >= 0) {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { interested: false } }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, data: opts.listing || listing() }) };
  });
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsShareExperience = vi.fn();
  window.clearAuth = vi.fn();
  window.tstsFormatDateShort = (d) => String(d || "");
  window.__trackAnalytics = vi.fn();
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
}

async function run() {
  new Function(SRC)();
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

const $ = (id) => document.getElementById(id);
const hidden = (id) => $(id).classList.contains("hidden");

describe("experience.html carries what a preview needs", () => {
  test("the page ships a Coming soon band, hidden by default", () => {
    expect(BAND_EL).toBeTruthy();
    expect(BAND_EL).toMatch(/class="[^"]*\bhidden\b/);
    expect(BAND_EL).toContain("Coming soon");
    expect(BAND_EL).toContain("This table isn't open yet");
    expect(BAND_EL).not.toContain("—");
  });

  test("the page ships an interest box in the place the booking control stands, hidden by default", () => {
    expect(BOX_EL).toBeTruthy();
    expect(BOX_EL).toMatch(/class="hidden"/);
    expect(BOX_EL).toContain("I'm interested");
    expect(BOX_EL).toContain("Sign in to tell the host");
    expect(BOX_EL).toContain("Nothing is booked and nothing is charged");
    expect(BOX_EL).not.toContain("—");
  });

  test("the price row carries an id, so a preview can hide the whole row rather than show two dashes", () => {
    expect(PAGE).toContain('id="exp-price-row"');
  });
});

describe("a signed-in person looking at a preview", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the band is up, the price is gone, and there is no booking control at all", async () => {
    load({});
    await run();

    expect(hidden("preview-band")).toBe(false);
    expect(hidden("exp-price-row")).toBe(true);
    expect(hidden("booking-form")).toBe(true);
    expect(hidden("preview-interest-box")).toBe(false);
    expect(String($("preview-band-body").textContent)).toContain("Marisa is still putting this table together.");
    expect(String($("preview-band-body").textContent)).toContain("nothing to book yet");
  });

  test("the sticky bar on a phone does not offer a seat on a table nobody can book", async () => {
    load({});
    await run();
    // The bar reads the booking form's visibility to decide whether somebody has scrolled past it.
    // With the form hidden it would conclude exactly that, and put "Reserve your seat" on the phone.
    expect(document.getElementById("mobile-booking-bar").style.display).toBe("none");
  });

  test("a live listing still gets its sticky bar, so nothing was taken away", async () => {
    load({ listing: listing({ isPreview: false, previewEnabled: false }) });
    await run();
    // Not forced down: the observer governs it, exactly as before this build.
    expect(document.getElementById("mobile-booking-bar").style.display).not.toBe("none");
  });

  test("a host who has not chosen the evenings yet says so on the band", async () => {
    load({ listing: listing({ datesToCome: true }) });
    await run();
    expect(String($("preview-band-body").textContent)).toContain("The evenings are still to come.");
  });

  test("the button is offered, and once pressed it says they are on the list", async () => {
    const calls = [];
    load({
      authFetch: async (url, opts) => {
        calls.push({ url: String(url), method: String((opts && opts.method) || "GET") });
        if (String(url).indexOf("/interest") >= 0 && (opts && opts.method) === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { interested: true, alreadyInterested: false, message: "Thank you. We'll email you the moment this one is live." } }) };
        }
        if (String(url).indexOf("/interest") >= 0) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { interested: false } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: listing() }) };
      },
    });
    await run();

    const btn = $("preview-interest-btn");
    expect(hidden("preview-interest-btn")).toBe(false);
    expect(String(btn.textContent).trim()).toBe("I'm interested");

    btn.click();
    for (let i = 0; i < 30; i++) await Promise.resolve();

    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("You're on the list");
    expect(String($("preview-interest-body").textContent)).toContain("one email the moment it's live");
    expect(calls.some((c) => c.method === "POST" && c.url.indexOf("/interest") >= 0)).toBe(true);
  });

  test("a person who already said it is not asked again", async () => {
    load({
      authFetch: async (url) => {
        if (String(url).indexOf("/interest") >= 0) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { interested: true } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: listing() }) };
      },
    });
    await run();

    const btn = $("preview-interest-btn");
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("You're on the list");
  });

  test("a refusal is read in the server's own words, and the button comes back", async () => {
    const notify = vi.fn();
    load({
      notify,
      authFetch: async (url, opts) => {
        if (String(url).indexOf("/interest") >= 0 && (opts && opts.method) === "POST") {
          return { ok: false, status: 409, json: async () => ({ ok: false, message: "This experience is not a preview, so there is nothing to wait for." }) };
        }
        if (String(url).indexOf("/interest") >= 0) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { interested: false } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: listing() }) };
      },
    });
    await run();

    const btn = $("preview-interest-btn");
    btn.click();
    for (let i = 0; i < 30; i++) await Promise.resolve();

    expect(notify).toHaveBeenCalledWith("This experience is not a preview, so there is nothing to wait for.", "error");
    expect(btn.disabled).toBe(false);
    expect(String(btn.textContent).trim()).toBe("I'm interested");
  });
});

describe("a signed-out person looking at a preview", () => {
  test("is invited to sign in, and brought back to this page", async () => {
    load({ session: async () => ({ ok: false }) });
    await run();

    expect(hidden("preview-band")).toBe(false);
    expect(hidden("preview-interest-box")).toBe(false);
    expect(hidden("preview-interest-btn")).toBe(true);
    expect(hidden("preview-interest-signin")).toBe(false);
    expect($("preview-interest-signin").getAttribute("href")).toContain("login.html?next=");
    expect($("preview-interest-signin").getAttribute("href")).toContain("experience.html");
    expect(String($("preview-interest-body").textContent)).toContain("Nothing is booked and nothing is charged");
  });
});

describe("the host looking at their own preview", () => {
  test("is told what it is, and is not asked to be interested in their own table", async () => {
    load({
      session: async () => ({ ok: true, user: { id: "aaaaaaaaaaaaaaaaaaaaaa11" } }),
      listing: listing(),
    });
    await run();

    expect(hidden("preview-band")).toBe(false);
    expect(hidden("preview-interest-box")).toBe(false);
    expect(hidden("preview-interest-btn")).toBe(true);
    expect(hidden("preview-interest-signin")).toBe(true);
    expect(String($("preview-interest-body").textContent)).toContain("This is your preview.");
    expect(String($("preview-interest-body").textContent)).toContain("nobody can book it until you publish");
  });
});

describe("a live listing is untouched by any of this", () => {
  test("no band, the price is shown, and the booking control is there", async () => {
    load({ listing: listing({ isPreview: false, previewEnabled: false }) });
    await run();

    expect(hidden("preview-band")).toBe(true);
    expect(hidden("exp-price-row")).toBe(false);
    expect(hidden("preview-interest-box")).toBe(true);
    expect(hidden("booking-form")).toBe(false);
  });
});

describe("nothing a person reads on a preview is machine text", () => {
  test("no code, no field name, no em dash", async () => {
    load({});
    await run();
    const text = String(document.body.textContent || "");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("—");
    expect(text).not.toContain("previewEnabled");
    expect(text).not.toContain("DRAFT");
  });
});
