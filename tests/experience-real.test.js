// REAL coverage for js/experience.js — experience detail page.
// Tests load entry points: missing id, 401 redirect, 403/non-ok messages,
// 200 happy path rendering of title/city/description (including >500 char
// "Read more" truncation), share button uses tstsShareExperience.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "experience.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="experience-content">
      <h1 id="exp-title"></h1>
      <a id="exp-city" href="#"></a>
      <p id="exp-description"></p>
      <img id="exp-image" />
      <img id="exp-host-pic" />
      <span id="exp-host-name"></span>
      <span id="exp-price"></span>
      <span id="exp-price-suffix"></span>
      <span id="exp-verified-badge" class="hidden"></span>
      <span id="exp-verified-pending-badge" class="hidden"></span>

      <a id="report-experience-btn" href="#"></a>
      <button id="share-experience-btn"></button>
      <button id="bookmark-btn"></button>
      <i id="bookmark-icon"></i>

      <form id="booking-form">
        <input id="booking-date" type="date" />
        <select id="guest-count">
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
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

let __navigatedTo = "";

function loadExperience(opts) {
  opts = opts || {};
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      pathname: "/experience.html",
      search: opts.search || "",
      hostname: "thesharedtablestory.com",
      get href() { return "https://example.com/experience.html" + (opts.search || ""); },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "viewer" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsShareExperience = opts.share || vi.fn();
  window.clearAuth = opts.clearAuth || vi.fn();
  window.tstsFormatDateShort = (d) => String(d || "");
  window.__trackAnalytics = vi.fn();

  globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
}

async function runScript() {
  new Function(SRC)();
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe("experience — guards", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("no ?id → showNotFound, experience-content hidden", async () => {
    loadExperience({ search: "" });
    await runScript();
    expect(document.getElementById("experience-content").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("experience-not-found").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("experience-not-found-text").textContent).toMatch(/invalid/i);
  });

  test("401 → clearAuth + redirect to login.html?returnTo=", async () => {
    const clearAuth = vi.fn();
    loadExperience({
      search: "?id=exp_1",
      clearAuth,
      authFetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    });
    await runScript();
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(__navigatedTo).toMatch(/login\.html\?returnTo=/);
  });

  test("403 → 'currently unavailable'", async () => {
    loadExperience({
      search: "?id=exp_2",
      authFetch: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });
    await runScript();
    expect(document.getElementById("experience-not-found-text").textContent).toMatch(/currently unavailable/i);
  });

  test("500 → 'unavailable or no longer exists'", async () => {
    loadExperience({
      search: "?id=exp_3",
      authFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    await runScript();
    expect(document.getElementById("experience-not-found-text").textContent).toMatch(/unavailable or no longer exists/i);
  });
});

describe("experience — render", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("ok response populates title + city (suburb · city · STATE · postcode)", async () => {
    loadExperience({
      search: "?id=exp_render",
      authFetch: async (url) => {
        if (url === "/api/experiences/exp_render") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: {
            _id: "exp_render",
            title: "Lentil Sunday",
            description: "Short cosy dinner.",
            suburb: "Carlton",
            city: "Melbourne",
            state: "vic",
            postcode: "3053",
            price: 45,
            imageUrl: "https://img/x.jpg",
            host: { name: "Anna" },
          } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await runScript();
    expect(document.getElementById("exp-title").textContent).toBe("Lentil Sunday");
    expect(document.getElementById("exp-city").textContent).toBe("Carlton · Melbourne · VIC · 3053");
    expect(document.getElementById("exp-city").href).toMatch(/google\.com\/maps/);
    expect(document.getElementById("exp-description").textContent).toBe("Short cosy dinner.");
  });

  test("report-experience-btn href wired with experience id", async () => {
    loadExperience({
      search: "?id=exp_rep",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {
        _id: "exp_rep", title: "X", description: "y", city: "Melbourne", host: { name: "Anna" },
      } }) }),
    });
    await runScript();
    expect(document.getElementById("report-experience-btn").href)
      .toMatch(/report\.html\?targetType=experience&targetId=exp_rep/);
  });

  test("description > 500 chars renders teaser + 'Read more' that reveals rest", async () => {
    const long = "lorem ".repeat(120);
    loadExperience({
      search: "?id=exp_long",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {
        _id: "exp_long", title: "X", description: long, city: "Y", host: { name: "Anna" },
      } }) }),
    });
    await runScript();
    const more = document.getElementById("exp-desc-readmore");
    expect(more).toBeTruthy();
    expect(more.textContent).toBe("Read more");
    const rest = document.getElementById("exp-desc-rest");
    expect(rest.classList.contains("hidden")).toBe(true);
    more.click();
    expect(rest.classList.contains("hidden")).toBe(false);
  });

  test("share button invokes window.tstsShareExperience with title + url", async () => {
    const share = vi.fn();
    loadExperience({
      search: "?id=exp_share",
      share,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {
        _id: "exp_share", title: "Pasta Night", description: "x", city: "Melbourne", host: { name: "Anna" },
      } }) }),
    });
    await runScript();
    document.getElementById("share-experience-btn").click();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].title).toBe("Pasta Night");
    expect(String(share.mock.calls[0][0].text)).toMatch(/Pasta Night/);
  });
});

describe("experience — host name normalisation (email-as-name guard)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("raw email in hostName is NOT exposed in rendered output (normalize prefers non-email)", async () => {
    loadExperience({
      search: "?id=exp_hostnorm",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {
        _id: "exp_hostnorm",
        title: "Title",
        description: "x",
        city: "Y",
        hostName: "ann@example.com",
        host: { name: "Anna Cook" },
      } }) }),
    });
    await runScript();
    expect(document.body.textContent).not.toMatch(/ann@example\.com/);
  });
});
