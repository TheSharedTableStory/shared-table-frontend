// REAL coverage for js/connections.js — social tab page:
// requireAuth + redirect, loadRequests/Connections/Outgoing/Blocked/Feed,
// renderConnectionRows + client-side search filter, connect handle flow,
// accept/reject/block on requests, remove on connections, cancel outgoing,
// unblock blocked.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "connections.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <input id="handle" />
    <button id="connect-btn">Connect</button>
    <span id="connect-status"></span>

    <section>
      <div id="requests-loading"></div>
      <div id="requests-empty" class="hidden"></div>
      <div id="requests-list" class="hidden"></div>
      <button id="refresh-requests">Refresh</button>
    </section>

    <section>
      <input id="connections-search" />
      <div id="connections-loading"></div>
      <div id="connections-empty" class="hidden"></div>
      <div id="connections-list" class="hidden"></div>
      <div id="connections-search-empty" class="hidden"></div>
      <button id="refresh-connections">Refresh</button>
    </section>

    <section>
      <div id="outgoing-loading"></div>
      <div id="outgoing-empty" class="hidden"></div>
      <div id="outgoing-list" class="hidden"></div>
      <button id="refresh-outgoing">Refresh</button>
    </section>

    <section>
      <div id="blocked-loading"></div>
      <div id="blocked-empty" class="hidden"></div>
      <div id="blocked-list" class="hidden"></div>
      <button id="refresh-blocked">Refresh</button>
    </section>

    <section>
      <div id="feed-loading"></div>
      <div id="feed-empty" class="hidden"></div>
      <div id="feed-error" class="hidden"><button id="feed-retry-btn">Retry</button></div>
      <div id="feed-list" class="hidden"></div>
      <button id="refresh-feed">Refresh</button>
    </section>
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

function loadConnections(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      search: "", pathname: "/connections.html",
      get href() { return ""; },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "me" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsConfirm = opts.confirm || (async () => true);
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsSafeUrl = (u, fb) => String(u || fb || "");
  window.tstsFormatDateShort = null;

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

describe("connections — auth gate", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("unauthenticated → redirect to login.html?returnTo=connections.html", async () => {
    loadConnections({ session: async () => ({ ok: false }) });
    await fireDOMReady();
    expect(__navigatedTo).toMatch(/login\.html\?returnTo=connections\.html/);
  });
});

describe("connections — initial loads", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("empty lists show empty state messages", async () => {
    loadConnections({
      authFetch: async (url) => ({ ok: true, status: 200, json: async () => ({ ok: true, data: [] }) }),
    });
    await fireDOMReady();
    expect(document.getElementById("requests-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("requests-empty").textContent).toMatch(/no pending requests/i);
    expect(document.getElementById("connections-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("outgoing-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("blocked-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("feed-empty").classList.contains("hidden")).toBe(false);
  });

  test("requests list renders accept/reject/block buttons per row", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/requests") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { _id: "r1", from: { _id: "u1", name: "Alice", handle: "alice", profilePic: "" } },
          { _id: "r2", from: { _id: "u2", name: "Bob", handle: "bob" } },
        ] }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("requests-list").classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#requests-list button[data-action='accept']").length).toBe(2);
    expect(document.querySelectorAll("#requests-list button[data-action='reject']").length).toBe(2);
    expect(document.querySelectorAll("#requests-list button[data-action='block']").length).toBe(2);
  });

  test("connections list renders View profile + Remove per row", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/connections") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { user: { _id: "u3", name: "Cara", handle: "cara" } },
        ] }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("connections-list").classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#connections-list a[href*='public-profile.html?id=u3']")).toBeTruthy();
    expect(document.querySelector("#connections-list button[data-action='remove']")).toBeTruthy();
  });
});

describe("connections — accept/reject/block actions", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("accept POSTs to /accept and re-loads requests", async () => {
    const posts = [];
    loadConnections({
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST") posts.push(url);
        if (url === "/api/social/requests") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { _id: "r1", from: { _id: "u1", name: "Alice" } },
        ] }) };
        if (url.includes("/accept")) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.querySelector("#requests-list button[data-action='accept']").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(posts).toContain("/api/social/requests/r1/accept");
  });

  test("block confirmed → POST to /block; cancelled → no POST", async () => {
    let confirmReply = true;
    const posts = [];
    loadConnections({
      confirm: async () => confirmReply,
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST") posts.push(url);
        if (url === "/api/social/requests") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { _id: "r1", from: { _id: "u1", name: "Alice" } },
        ] }) };
        if (url.includes("/block")) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    // Cancel branch
    confirmReply = false;
    document.querySelector("#requests-list button[data-action='block']").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(posts.some((u) => u.includes("/block"))).toBe(false);
    // Confirm branch
    confirmReply = true;
    document.querySelector("#requests-list button[data-action='block']").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(posts.some((u) => u === "/api/social/requests/r1/block")).toBe(true);
  });

  test("remove (on connection row) confirmed → POST to /remove", async () => {
    const posts = [];
    loadConnections({
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST") posts.push(url);
        if (url === "/api/social/connections") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { user: { _id: "uX", name: "X" } },
        ] }) };
        if (url.includes("/remove")) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.querySelector("#connections-list button[data-action='remove']").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(posts).toContain("/api/social/connections/uX/remove");
  });
});

describe("connections — connect handle flow", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("empty handle shows inline status, no POST", async () => {
    let posted = false;
    loadConnections({
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST" && url === "/api/social/connect") posted = true;
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.getElementById("connect-btn").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(document.getElementById("connect-status").textContent).toMatch(/Enter a handle/);
  });

  test("non-empty handle → POST /api/social/connect with handle, no leading @", async () => {
    let captured = null;
    loadConnections({
      authFetch: async (url, opts) => {
        if (url === "/api/social/connect" && opts && opts.method === "POST") {
          captured = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "pending" } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.getElementById("handle").value = "@alice";
    document.getElementById("connect-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(captured).toEqual({ handle: "alice" });
    expect(document.getElementById("connect-status").textContent).toMatch(/Connection request sent/);
  });

  test("connect server error surfaces message", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/connect") return { ok: false, status: 400, json: async () => ({ message: "HANDLE_NOT_FOUND" }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.getElementById("handle").value = "ghost";
    document.getElementById("connect-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("connect-status").textContent).toMatch(/HANDLE_NOT_FOUND/);
  });
});

describe("connections — client-side search", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("typing in search box filters connections; empty match shows search-empty hint", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/connections") return { ok: true, status: 200, json: async () => ({ ok: true, data: [
          { user: { _id: "u1", name: "Alice Anderson", handle: "alicea" } },
          { user: { _id: "u2", name: "Bob Brown", handle: "bobb" } },
        ] }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.querySelectorAll("#connections-list > div").length).toBe(2);
    const search = document.getElementById("connections-search");
    search.value = "alic";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll("#connections-list > div").length).toBe(1);
    search.value = "nobody-match";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("connections-search-empty").classList.contains("hidden")).toBe(false);
  });
});

describe("connections — outgoing + blocked + feed", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("outgoing list renders Cancel Request button per row", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/outgoing-requests") return { ok: true, status: 200, json: async () => ({ ok: true, data: { requests: [
          { _id: "o1", to: { _id: "u9", name: "Pending User" } },
        ] } }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.querySelectorAll("#outgoing-list button[data-action='cancel-outgoing']").length).toBe(1);
  });

  test("blocked unblock fires DELETE", async () => {
    let deletedUrl = "";
    loadConnections({
      authFetch: async (url, opts) => {
        if (url === "/api/social/blocked") return { ok: true, status: 200, json: async () => ({ ok: true, data: { users: [
          { user: { _id: "bX", name: "Blocked X" } },
        ] } }) };
        if (opts && opts.method === "DELETE" && url.startsWith("/api/social/block/")) {
          deletedUrl = url;
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    document.querySelector("#blocked-list button[data-action='unblock']").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(deletedUrl).toBe("/api/social/block/bX");
  });

  test("feed populated when /api/social/feed returns items", async () => {
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/feed") return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [
          { guest: { name: "Friend" }, experience: { title: "Lentil Sunday" }, when: "2026-06-01" },
        ] } }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("feed-list").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("feed-list").children.length).toBe(1);
  });

  test("feed error → feed-error visible, retry button re-fires loadFeed", async () => {
    let calls = 0;
    loadConnections({
      authFetch: async (url) => {
        if (url === "/api/social/feed") {
          calls += 1;
          if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [] } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("feed-error").classList.contains("hidden")).toBe(false);
    document.getElementById("feed-retry-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(calls).toBe(2);
    expect(document.getElementById("feed-empty").classList.contains("hidden")).toBe(false);
  });
});
