// REAL coverage for js/verify-email-change.js — exercises the post-load
// token-confirmation flow with a stubbed fetch + jsdom location.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "verify-email-change.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="state-loading">Loading…</div>
    <div id="state-success" class="hidden">
      <p id="success-message"></p>
    </div>
    <div id="state-error" class="hidden">
      <p id="error-message"></p>
    </div>
  `;
}

async function loadModule(opts) {
  opts = opts || {};
  buildScaffold();
  delete window.__TSTS_VERIFY_EMAIL_CHANGE_RAN__;
  window.API_BASE = opts.apiBase || "";

  if (opts.hash !== undefined) {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://thesharedtablestory.com/verify-email-change.html" + (opts.hash || ""),
        hash: opts.hash || "",
        toString() { return this.href; },
      },
      writable: true,
      configurable: true,
    });
  }

  // Stub fetch.
  globalThis.fetch = opts.fetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));

  new Function(SRC)();
  // The script's confirm() returns a chained promise; allow microtasks to flush.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("verify-email-change — token parsing", () => {
  test("missing token shows error", async () => {
    await loadModule({ hash: "" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/Missing confirmation token/);
  });

  test("hash with non-token query also shows error", async () => {
    await loadModule({ hash: "#foo=bar" });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });
});

describe("verify-email-change — happy path", () => {
  test("server ok envelope shows success state with new email", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { email: "new@example.com" } }),
    });
    await loadModule({ hash: "#token=abc123", fetch: fetchImpl });
    expect(document.getElementById("state-success").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-message").textContent).toContain("new@example.com");
  });

  test("alternate envelope shape (data.ok=true) also recognised", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { ok: true, email: "alt@example.com" } }),
    });
    await loadModule({ hash: "#token=xyz", fetch: fetchImpl });
    expect(document.getElementById("state-success").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("success-message").textContent).toContain("alt@example.com");
  });
});

describe("verify-email-change — failure paths", () => {
  test("server error envelope: shows error message from payload", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, message: "Token expired or invalid." }),
    });
    await loadModule({ hash: "#token=expired", fetch: fetchImpl });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toBe("Token expired or invalid.");
  });

  test("server error without message: falls back to default text", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => null });
    await loadModule({ hash: "#token=bad", fetch: fetchImpl });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/Confirmation failed/);
  });

  test("network error: shows network-flavoured message", async () => {
    const fetchImpl = async () => { throw new Error("network down"); };
    await loadModule({ hash: "#token=x", fetch: fetchImpl });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("error-message").textContent).toMatch(/network error/i);
  });
});

describe("verify-email-change — request shape", () => {
  test("calls POST /api/auth/confirm-email-change with token body", async () => {
    let capturedUrl = "";
    let capturedOpts = null;
    const fetchImpl = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return { ok: true, json: async () => ({ ok: true, data: { email: "x@x.com" } }) };
    };
    await loadModule({ apiBase: "https://api.example.com", hash: "#token=tok_42", fetch: fetchImpl });

    expect(capturedUrl).toBe("https://api.example.com/api/auth/confirm-email-change");
    expect(capturedOpts.method).toBe("POST");
    expect(capturedOpts.credentials).toBe("include");
    expect(capturedOpts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(capturedOpts.body)).toEqual({ token: "tok_42" });
  });

  test("token preserved verbatim through encoded characters", async () => {
    let capturedBody = "";
    const fetchImpl = async (_url, opts) => {
      capturedBody = opts.body;
      return { ok: true, json: async () => ({ ok: true, data: { email: "x@x.com" } }) };
    };
    await loadModule({ hash: "#token=abc-def_ghi", fetch: fetchImpl });
    expect(JSON.parse(capturedBody).token).toBe("abc-def_ghi");
  });
});

describe("verify-email-change — idempotency", () => {
  test("running the script twice in the same window does not double-fire", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ ok: true, data: { email: "x@x.com" } }) };
    };
    await loadModule({ hash: "#token=abc", fetch: fetchImpl });
    // Re-run without resetting the guard.
    new Function(SRC)();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
  });
});
