// REAL coverage for js/admin.js — admin dashboard.
// admin.js is 4,183 LOC and is NOT wrapped in an IIFE: top-level `function` and
// `var` declarations become globals when evaluated. We evaluate the script
// directly in the test scope (via global eval) so we can call its functions.
//
// Targeted surface area:
//   - mustBeAdmin: missing session → redirect; non-admin user → access-denied DOM
//     replaces body; admin via isAdmin and admin via role → returns true
//   - adminFetch: thin pass-through to window.authFetch
//   - loadDashboardSummary: HTTP non-ok throws; ok returns unwrapped data

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "admin.js"), "utf-8");

let __navigatedTo = "";

function bootAdmin(opts) {
  opts = opts || {};
  document.body.innerHTML = `<div id="admin-shell"></div>`;

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      pathname: "/admin.html",
      search: opts.search || "",
      get href() { return ""; },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsGetSession = opts.session || (async () => ({ ok: false }));
  window.tstsHydrateNavAuth = opts.hydrate || vi.fn();
  window.tstsNotify = vi.fn();
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (Array.isArray(kids)) kids.forEach((k) => { if (k) el.append(typeof k === "string" ? document.createTextNode(k) : k); });
    else if (kids && typeof kids === "string") el.textContent = kids;
    return el;
  };
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);

  // Evaluate at the global scope so admin.js's top-level functions become
  // globalThis members. Some deep init paths may throw with the minimal DOM —
  // catch and continue; the function we want to test is hoisted/bound before
  // any throwing code runs.
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(SRC);
  } catch (eEval) {
    // tolerated: deep init paths can hit missing DOM in jsdom; the top-level
    // functions we exercise are already hoisted before that point.
    void eEval;
  }
}

describe("admin — mustBeAdmin", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("missing window.tstsGetSession → redirects to login.html?returnTo=", async () => {
    bootAdmin({});
    delete window.tstsGetSession;
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(false);
    expect(__navigatedTo).toMatch(/login\.html\?returnTo=/);
  });

  test("session ok:false → redirect", async () => {
    bootAdmin({ session: async () => ({ ok: false }) });
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(false);
    expect(__navigatedTo).toMatch(/login\.html/);
  });

  test("non-admin (no isAdmin, role=user) → replaces body with 'Access denied'", async () => {
    bootAdmin({ session: async () => ({ ok: true, user: { isAdmin: false, role: "user" } }) });
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(false);
    expect(document.body.textContent).toBe("Access denied");
    expect(__navigatedTo).toBe("");
  });

  test("isAdmin:true → returns true + calls hydrateNavAuth", async () => {
    const hydrate = vi.fn();
    bootAdmin({
      session: async () => ({ ok: true, user: { isAdmin: true } }),
      hydrate,
    });
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  test("role:'Admin' (case-insensitive) → returns true", async () => {
    bootAdmin({ session: async () => ({ ok: true, user: { role: "Admin" } }) });
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(true);
  });

  test("session throws → redirect (failsafe)", async () => {
    bootAdmin({ session: async () => { throw new Error("net"); } });
    const ok = await globalThis.mustBeAdmin();
    expect(ok).toBe(false);
    expect(__navigatedTo).toMatch(/login\.html/);
  });
});

describe("admin — adminFetch", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("delegates to window.authFetch with the same path + opts", async () => {
    const seen = [];
    bootAdmin({
      authFetch: async (path, opts) => {
        seen.push({ path, opts });
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    await globalThis.adminFetch("/api/admin/foo", { method: "DELETE" });
    expect(seen).toEqual([{ path: "/api/admin/foo", opts: { method: "DELETE" } }]);
  });

  test("omitting opts second arg defaults to {}", async () => {
    let captured = null;
    bootAdmin({
      authFetch: async (path, opts) => { captured = { path, opts }; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await globalThis.adminFetch("/api/admin/foo");
    expect(captured.opts).toEqual({});
  });
});

describe("admin — loadDashboardSummary", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("non-ok response throws 'dashboard-summary'", async () => {
    bootAdmin({ authFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await expect(globalThis.loadDashboardSummary()).rejects.toThrow("dashboard-summary");
  });

  test("ok response returns unwrapped data from payload.data", async () => {
    bootAdmin({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { expByStatus: { ACTIVE: 5 } } }) }),
    });
    const out = await globalThis.loadDashboardSummary();
    expect(out).toEqual({ expByStatus: { ACTIVE: 5 } });
  });

  test("ok response without .data returns the raw payload", async () => {
    bootAdmin({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ expByStatus: { ACTIVE: 5 } }) }),
    });
    const out = await globalThis.loadDashboardSummary();
    expect(out).toEqual({ expByStatus: { ACTIVE: 5 } });
  });
});
