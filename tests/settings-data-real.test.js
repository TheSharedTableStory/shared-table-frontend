// REAL coverage for js/settings-data.js — GDPR/privacy settings page:
// auth gate, export download, policy meta, notification preferences (load + toggle).
// Account deletion is covered at the OTP-gate boundary (mocked tstsConfirm/tstsOtpVerify).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "settings-data.js"), "utf-8");

const NOTIF_KEYS = [
  "bookingConfirmations","bookingReminders","newReviews",
  "communityActivity","hostDigest","promotional",
];

function buildDom() {
  document.body.innerHTML = `
    <div id="state-loading"></div>
    <div id="state-unauthorized" class="hidden"><a id="login-link" href="#"></a></div>
    <div id="state-error" class="hidden"><p id="error-message"></p><button id="retry-btn">Retry</button></div>
    <div id="state-ready" class="hidden">
      <span id="profile-fields-count">0</span>
      <span id="bookings-count">0</span>
      <span id="experiences-count">0</span>
      <ul id="data-categories"></ul>
      <p id="exported-at"></p>
      <p id="retention-meta"></p>
      <button id="export-btn">Download My Data</button>
      <button id="delete-btn">Delete My Account</button>
      <p id="action-status"></p>

      <div id="notif-prefs-loading" class="hidden"></div>
      <div id="notif-prefs-error" class="hidden"></div>
      <div id="notif-prefs-list" class="hidden">
        ${NOTIF_KEYS.map((k) => `<input type="checkbox" id="notif-${k}" />`).join("")}
      </div>
      <p id="notif-prefs-status"></p>
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

function loadSettings(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  Object.defineProperty(window, "location", {
    value: {
      pathname: "/settings-data.html",
      search: "",
      replace: vi.fn(),
    },
    writable: true, configurable: true,
  });

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "u1" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsConfirm = opts.confirm || (async () => false);
  window.tstsOtpVerify = opts.otpVerify || (async () => "");
  window.tstsFormatDateShort = null;
  window.tstsIdempotencyKey = opts.idemKey || (() => "idem-key-1");
  window.clearAuth = opts.clearAuth || (() => {});

  // URL.createObjectURL / revokeObjectURL stubs
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
  globalThis.URL.revokeObjectURL = vi.fn();

  __capturedDOMHandler = null;
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __capturedDOMHandler = handler; return; }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") {
    await __capturedDOMHandler();
  }
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

describe("settings-data — auth gate", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("unauthenticated → unauthorized state with returnTo login link", async () => {
    loadSettings({ session: async () => ({ ok: false }) });
    await fireDOMReady();
    expect(document.getElementById("state-unauthorized").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("login-link").href).toMatch(/login\.html\?returnTo=/);
  });
});

describe("settings-data — load + render", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("ok export populates counts + categories", async () => {
    loadSettings({
      authFetch: async (url) => {
        if (url === "/api/me/export") {
          return { ok: true, status: 200, json: async () => ({
            ok: true,
            data: {
              profile: { name: "X", handle: "x" },
              bookings: [{ a: 1 }, { a: 2 }],
              experiences: [{ b: 1 }],
              exportedAt: "2026-06-01",
            },
          }) };
        }
        if (url === "/api/policy/active") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: { version: "v2", effectiveFrom: "2026-01-01" } } }) };
        }
        if (url === "/api/user/notification-preferences") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { bookingConfirmations: true, promotional: false } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("state-ready").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("profile-fields-count").textContent).toBe("2");
    expect(document.getElementById("bookings-count").textContent).toBe("2");
    expect(document.getElementById("experiences-count").textContent).toBe("1");
    expect(document.getElementById("data-categories").children.length).toBe(3);
    expect(document.getElementById("retention-meta").textContent).toMatch(/v2/);
    // notification prefs loaded + booking toggle is checked, promo unchecked
    expect(document.getElementById("notif-bookingConfirmations").checked).toBe(true);
    expect(document.getElementById("notif-promotional").checked).toBe(false);
  });

  test("401 on /api/me/export → unauthorized state", async () => {
    loadSettings({
      authFetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    });
    await fireDOMReady();
    expect(document.getElementById("state-unauthorized").classList.contains("hidden")).toBe(false);
  });

  test("non-ok export → error state with payload message", async () => {
    loadSettings({
      authFetch: async (url) => {
        if (url === "/api/me/export") {
          return { ok: false, status: 500, json: async () => ({ ok: false, message: "EXPORT_DOWN" }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toBe("EXPORT_DOWN");
  });
});

describe("settings-data — export button", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clicking Download triggers JSON blob download", async () => {
    let exportCalls = 0;
    loadSettings({
      authFetch: async (url) => {
        if (url === "/api/me/export") {
          exportCalls += 1;
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        }
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences") return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    // sanity: initial load called export once
    expect(exportCalls).toBe(1);
    document.getElementById("export-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(exportCalls).toBe(2);
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(document.getElementById("action-status").textContent).toMatch(/Export downloaded/i);
  });
});

describe("settings-data — notification toggle", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("flipping promotional toggle PATCHes and server response syncs all toggles", async () => {
    let patched = null;
    loadSettings({
      authFetch: async (url, opts) => {
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences" && (!opts || !opts.method || opts.method === "GET")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { promotional: false, bookingConfirmations: false } }) };
        }
        if (url === "/api/user/notification-preferences" && opts.method === "PATCH") {
          patched = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { promotional: true, bookingConfirmations: false } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    const promo = document.getElementById("notif-promotional");
    promo.checked = true;
    promo.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(patched).toEqual({ promotional: true });
    expect(document.getElementById("notif-prefs-status").textContent).toMatch(/Saved/);
  });

  test("PATCH failure reverts toggle and shows error", async () => {
    loadSettings({
      authFetch: async (url, opts) => {
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences" && (!opts || !opts.method || opts.method === "GET")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { promotional: false } }) };
        }
        if (url === "/api/user/notification-preferences" && opts.method === "PATCH") {
          return { ok: false, status: 400, json: async () => ({ ok: false, message: "SAVE_FAIL" }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    const promo = document.getElementById("notif-promotional");
    promo.checked = true;
    promo.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(promo.checked).toBe(false); // reverted
    expect(document.getElementById("notif-prefs-status").textContent).toMatch(/SAVE_FAIL/);
  });
});

describe("settings-data — delete account", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("cancelled confirm → no API call, no status change", async () => {
    let posted = false;
    loadSettings({
      confirm: async () => false,
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST") posted = true;
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences") return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("delete-btn").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(posted).toBe(false);
  });

  test("confirm + OTP token → POST /api/auth/delete-account, success status", async () => {
    let captured = null;
    let clearAuthCalls = 0;
    loadSettings({
      confirm: async () => true,
      otpVerify: async () => "otp_token_xyz",
      clearAuth: () => { clearAuthCalls += 1; },
      authFetch: async (url, opts) => {
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences") return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
        if (url === "/api/auth/delete-account") {
          captured = { url, body: JSON.parse(opts.body), idem: opts.idempotencyKey };
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("delete-btn").click();
    for (let i = 0; i < 25; i++) await Promise.resolve();
    expect(captured.url).toBe("/api/auth/delete-account");
    expect(captured.body).toEqual({ otpToken: "otp_token_xyz" });
    expect(captured.idem).toBe("idem-key-1");
    expect(document.getElementById("action-status").textContent).toMatch(/Account deleted/);
    expect(clearAuthCalls).toBe(1);
  });

  test("confirm + OTP cancel (empty token) → no API call", async () => {
    let posted = false;
    loadSettings({
      confirm: async () => true,
      otpVerify: async () => "",
      authFetch: async (url, opts) => {
        if (opts && opts.method === "POST" && url === "/api/auth/delete-account") posted = true;
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        if (url === "/api/policy/active") return { ok: true, status: 200, json: async () => ({ ok: true, data: { policy: {} } }) };
        if (url === "/api/user/notification-preferences") return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("delete-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(posted).toBe(false);
  });
});
