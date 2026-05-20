// REAL coverage for js/unsubscribe.js — exercises the email-unsubscribe
// page flow: param validation, confirm-button POST, success + error states.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "unsubscribe.js"), "utf-8");

function loadModule(opts) {
  opts = opts || {};
  document.body.innerHTML = `
    <div id="state-confirm" class="hidden">
      <p id="confirm-text"></p>
      <button id="confirm-btn">Confirm</button>
      <p id="confirm-status" class="hidden"></p>
    </div>
    <div id="state-success" class="hidden"><p id="success-text"></p></div>
    <div id="state-error" class="hidden"><p id="error-text"></p></div>
  `;
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  Object.defineProperty(window, "location", {
    value: { search: opts.search || "", pathname: "/unsubscribe.html" },
    writable: true,
    configurable: true,
  });
  globalThis.fetch = opts.fetch || (async () => ({ status: 500, json: async () => ({}) }));
  window.__tstsApiBase = opts.apiBase || "";
  new Function(SRC)();
}

const VALID_PARAMS = "?userId=u1&category=recommendations&ts=1700000000&token=abc";

describe("unsubscribe — param validation", () => {
  test("missing userId shows error state", () => {
    loadModule({ search: "?category=recommendations&ts=1&token=x" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-text").textContent).toMatch(/invalid/i);
  });

  test("missing category shows error state", () => {
    loadModule({ search: "?userId=u1&ts=1&token=x" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("missing ts shows error state", () => {
    loadModule({ search: "?userId=u1&category=x&token=x" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("missing token shows error state", () => {
    loadModule({ search: "?userId=u1&category=x&ts=1" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("all params valid: confirm-text gets the human-readable category label", () => {
    loadModule({ search: VALID_PARAMS });
    expect(document.getElementById("confirm-text").textContent).toMatch(/experience recommendation/);
  });

  test("unknown category falls back to raw value", () => {
    loadModule({ search: "?userId=u1&category=foo&ts=1&token=t" });
    expect(document.getElementById("confirm-text").textContent).toMatch(/foo/);
  });
});

describe("unsubscribe — confirm click", () => {
  test("POSTs /api/email/unsubscribe with body fields", async () => {
    let captured = null;
    const fetchImpl = async (url, opts) => {
      captured = { url, body: JSON.parse(opts.body) };
      return { status: 200, json: async () => ({ ok: true }) };
    };
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl, apiBase: "https://api.example.com" });
    document.getElementById("confirm-btn").click();
    await Promise.resolve(); await Promise.resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(captured.url).toBe("https://api.example.com/api/email/unsubscribe");
    expect(captured.body).toEqual({
      userId: "u1",
      category: "recommendations",
      ts: "1700000000",
      token: "abc",
    });
  });

  test("server ok:true switches to success state with category label", async () => {
    const fetchImpl = async () => ({ status: 200, json: async () => ({ ok: true }) });
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl });
    document.getElementById("confirm-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("state-success").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-text").textContent).toMatch(/experience recommendation/);
  });

  test("server returns TOKEN_EXPIRED → expired-token message", async () => {
    const fetchImpl = async () => ({ status: 400, json: async () => ({ ok: false, error: "TOKEN_EXPIRED" }) });
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl });
    document.getElementById("confirm-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-text").textContent).toMatch(/expired/);
  });

  test("server returns other error → generic invalid-link message", async () => {
    const fetchImpl = async () => ({ status: 400, json: async () => ({ ok: false, error: "SOMETHING_ELSE" }) });
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl });
    document.getElementById("confirm-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("error-text").textContent).toMatch(/invalid or has expired/);
  });

  test("network error → 'Something went wrong' message", async () => {
    const fetchImpl = async () => { throw new Error("net"); };
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl });
    document.getElementById("confirm-btn").click();
    await Promise.resolve(); await Promise.resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById("error-text").textContent).toMatch(/Something went wrong/);
  });

  test("confirm button is disabled mid-flight + shows Processing…", async () => {
    let resolveOuter;
    const fetchImpl = () => new Promise((res) => { resolveOuter = () => res({ status: 200, json: async () => ({ ok: true }) }); });
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl });
    const btn = document.getElementById("confirm-btn");
    btn.click();
    await Promise.resolve();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Processing/);
    resolveOuter();
    await Promise.resolve(); await Promise.resolve();
  });
});

describe("unsubscribe — security", () => {
  test("apiBase comes from window.__tstsApiBase (no implicit same-origin)", async () => {
    let captured = "";
    const fetchImpl = async (url) => { captured = url; return { status: 200, json: async () => ({ ok: true }) }; };
    loadModule({ search: VALID_PARAMS, fetch: fetchImpl, apiBase: "https://specific.api" });
    document.getElementById("confirm-btn").click();
    await Promise.resolve(); await Promise.resolve();
    expect(captured.startsWith("https://specific.api")).toBe(true);
  });
});
