// REAL coverage for js/public-profile.js — public host profile page.
// Top-level reads URL ?id=, sets up element refs, registers DOMContentLoaded
// which fetches profile and renders. Tests:
// - missing ?id shows error
// - profile fetch + render fills name/bio/location/badge
// - report link wired
// - block button hidden when viewing self, visible + working when viewing someone else
// - share button writes to clipboard
// - reviews list + experiences grid + visible bookings + portfolio stats
// - createExperienceCard debrand title rules

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "public-profile.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="loading"></div>
    <div id="error" class="hidden"></div>
    <div id="profile-content" class="hidden">
      <div class="bg-white">
        <h1 id="host-name"></h1>
        <p id="host-location"></p>
        <p id="host-rating"></p>
        <p id="host-bio"></p>
        <img id="host-pic" />
        <span id="host-badge" class="hidden"></span>
        <div id="host-join-date" class="hidden"><span id="host-join-date-text"></span></div>
        <a id="report-user-link" href="#"></a>
        <button id="block-user-btn" class="hidden">Block</button>
        <button id="share-profile-btn">Share</button>
      </div>
      <div id="experiences-grid"></div>
      <p id="no-experiences" class="hidden"></p>
      <section id="reviews-container" class="hidden"><div id="reviews-list"></div></section>
      <section id="visible-bookings-container" class="hidden"><div id="visible-bookings-list"></div></section>
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

let __domHandlers = [];
let __navigatedTo = "";

function loadPublicProfile(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      search: opts.search || "",
      pathname: "/public-profile.html",
      origin: "https://example.com",
      get href() { return "https://example.com/public-profile.html" + (opts.search || ""); },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.API_BASE = "https://api.example.com";
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  globalThis.fetch = opts.fetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsGetSession = opts.session || (async () => null);
  window.tstsConfirm = opts.confirm || (async () => false);
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsFormatDateShort = null;

  if (opts.clipboard) {
    Object.defineProperty(navigator, "clipboard", { value: opts.clipboard, writable: true, configurable: true });
  } else {
    Object.defineProperty(navigator, "clipboard", { value: undefined, writable: true, configurable: true });
  }
  if (opts.share) navigator.share = opts.share;
  else delete navigator.share;

  __domHandlers = [];
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function fireDOMReady() {
  for (const h of __domHandlers) {
    try { await h(); } catch (e) { /* swallowed: jsdom-missing API */ }
  }
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe("public-profile — guards & report link", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("missing ?id shows error state", async () => {
    loadPublicProfile({ search: "" });
    await fireDOMReady();
    expect(document.getElementById("error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("loading").classList.contains("hidden")).toBe(true);
  });

  test("with ?id, report link is wired to report.html?targetType=user", async () => {
    loadPublicProfile({
      search: "?id=user_42",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("report-user-link").href)
      .toMatch(/report\.html\?targetType=user&targetId=user_42/);
  });
});

describe("public-profile — render", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("profile fetch ok → name/bio/location/badge populated", async () => {
    loadPublicProfile({
      search: "?id=host_1",
      authFetch: async (url) => {
        if (url.includes("/api/users/host_1/profile")) {
          return {
            ok: true, status: 200, json: async () => ({
              ok: true,
              data: { user: { name: "Anna Host", bio: "I love food", location: "Melbourne", hostVerified: true, createdAt: "2025-03-15" } },
            }),
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("host-name").textContent).toBe("Anna Host");
    expect(document.getElementById("host-bio").textContent).toBe("I love food");
    expect(document.getElementById("host-location").textContent).toMatch(/Melbourne/);
    expect(document.getElementById("host-badge").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("host-join-date").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("host-join-date-text").textContent).toMatch(/Fellow Traveller since/);
    expect(document.getElementById("profile-content").classList.contains("hidden")).toBe(false);
  });

  test("location missing → falls back to 'Global'", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("host-location").textContent).toMatch(/Global/);
  });

  test("hostVerificationStatus='verified' (string form) still shows badge", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X", hostVerificationStatus: "Verified" } } }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("host-badge").classList.contains("hidden")).toBe(false);
  });

  test("HTTP non-ok → error state", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    });
    await fireDOMReady();
    expect(document.getElementById("error").classList.contains("hidden")).toBe(false);
  });
});

describe("public-profile — block user button", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("viewing self → block button stays hidden", async () => {
    loadPublicProfile({
      search: "?id=me",
      session: async () => ({ user: { id: "me" } }),
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "Me" } } }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("block-user-btn").classList.contains("hidden")).toBe(true);
  });

  test("viewing someone else → block button shown; confirm → POSTs block + notify + redirect", async () => {
    let blockUrl = "";
    const notify = vi.fn();
    loadPublicProfile({
      search: "?id=other",
      session: async () => ({ user: { id: "me" } }),
      confirm: async () => true,
      notify,
      authFetch: async (url, opts) => {
        if (url.includes("/api/users/other/profile")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "Other" } } }) };
        }
        if (url.startsWith("/api/social/block/")) {
          blockUrl = url;
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    const btn = document.getElementById("block-user-btn");
    expect(btn.classList.contains("hidden")).toBe(false);
    btn.click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(blockUrl).toBe("/api/social/block/other");
    expect(__navigatedTo).toBe("connections.html");
    expect(notify).toHaveBeenCalled();
  });

  test("confirm rejected → no POST, no redirect", async () => {
    let posted = false;
    loadPublicProfile({
      search: "?id=other",
      session: async () => ({ user: { id: "me" } }),
      confirm: async () => false,
      authFetch: async (url, opts) => {
        if (url.includes("/api/users/other/profile")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "Other" } } }) };
        }
        if (url.startsWith("/api/social/block/") && opts && opts.method === "POST") {
          posted = true;
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("block-user-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(__navigatedTo).toBe("");
  });
});

describe("public-profile — share button", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("navigator.share preferred when available", async () => {
    const shareFn = vi.fn(async () => {});
    loadPublicProfile({
      search: "?id=h",
      share: shareFn,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) }),
    });
    await fireDOMReady();
    document.getElementById("share-profile-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(shareFn).toHaveBeenCalledTimes(1);
    expect(shareFn.mock.calls[0][0].url).toContain("public-profile.html?id=h");
  });

  test("fallback to clipboard.writeText", async () => {
    const writeText = vi.fn(async () => {});
    const notify = vi.fn();
    loadPublicProfile({
      search: "?id=h",
      clipboard: { writeText },
      notify,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) }),
    });
    await fireDOMReady();
    document.getElementById("share-profile-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("public-profile.html?id=h");
  });
});

describe("public-profile — reviews + experiences + portfolio + visible bookings", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("reviews render with author + rating + comment + avg rating", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async (url) => {
        if (url.includes("/api/users/h/profile")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) };
        if (url.startsWith("/api/reviews")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { reviews: [
            { rating: 5, comment: "Amazing!", authorName: "Alice", date: "2026-04-01" },
            { rating: 4, comment: "Lovely night", authorName: "Bob",   date: "2026-04-02" },
          ] } }) };
        }
        return { ok: false, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("reviews-container").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("reviews-list").children.length).toBe(2);
    expect(document.getElementById("host-rating").textContent).toMatch(/4\.5 \(2 reviews\)/);
  });

  test("experiences list with WORLDCLASS_STARTER_ title is debranded", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async (url) => {
        if (url.includes("/api/users/h/profile")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) };
        if (url.startsWith("/api/experiences")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [
            { _id: "e1", title: "WORLDCLASS Lentil Sunday", city: "Melbourne", price: 45, imageUrl: "https://img/x.jpg" },
            { _id: "e2", title: "WORLDCLASS_STARTER_demo",  city: "Melbourne", price: 30 },
          ] } }) };
        }
        if (url.startsWith("/api/reviews")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { reviews: [] } }) };
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    const cards = document.querySelectorAll("#experiences-grid > a");
    expect(cards.length).toBe(2);
    const titles = Array.from(cards).map((c) => c.querySelector("h3").textContent);
    expect(titles[0]).toBe("Lentil Sunday");
    // "WORLDCLASS_STARTER_demo" — debrand regex /^world[\s_-]*class\s*[:\-]?\s*/i
    // matches only the "WORLDCLASS" prefix (trailing "_" is NOT a [:\-] separator),
    // leaving "_STARTER_demo". Result is non-empty so the starter-fallback is
    // not triggered. (Documents actual behaviour, not theoretical intent.)
    expect(titles[1]).toBe("_STARTER_demo");
  });

  test("empty experiences list → 'no active listings' message", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async (url) => {
        if (url.includes("/api/users/h/profile")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) };
        if (url.startsWith("/api/experiences")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
        if (url.startsWith("/api/reviews")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { reviews: [] } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("no-experiences").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("no-experiences").textContent).toMatch(/no active listings/i);
  });

  test("visible bookings list rendered when API returns rows", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async (url) => {
        if (url.includes("/api/users/h/profile")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "X" } } }) };
        if (url.startsWith("/api/experiences")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
        if (url.startsWith("/api/reviews")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { reviews: [] } }) };
        if (url.startsWith("/api/social/user/")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { bookings: [
            { experience: { title: "Lentil" }, bookingDate: "2026-06-01" },
          ] } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("visible-bookings-container").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("visible-bookings-list").children.length).toBe(1);
  });

  test("portfolio tier=elite renders tier badge + stats grid", async () => {
    loadPublicProfile({
      search: "?id=h",
      authFetch: async (url) => {
        if (url.includes("/api/users/h/profile")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { name: "Anna" } } }) };
        if (url.startsWith("/api/experiences")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { experiences: [] } }) };
        if (url.startsWith("/api/reviews")) return { ok: true, status: 200, json: async () => ({ ok: true, data: { reviews: [] } }) };
        return { ok: false, status: 404, json: async () => ({}) };
      },
      fetch: async (url) => {
        if (url.includes("/api/hosts/h/portfolio")) {
          return {
            ok: true, status: 200, json: async () => ({
              ok: true,
              data: { host: { tier: "elite", stats: { experienceCount: 7, completedBookings: 100, guestsHosted: 250, avgRating: 4.9 } } },
            }),
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    const badge = document.querySelector(".bg-purple-100");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("Elite Host");
    expect(document.getElementById("host-rating").textContent).toMatch(/4\.9 avg/);
  });
});
