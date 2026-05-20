// REAL coverage for js/verify-email.js — 3-step OTP verify flow:
// 1) email entry → POST /api/auth/otp/request-email-verify
// 2) 6-cell OTP entry → POST /api/auth/verify-email-otp
// 3) success → redirect to home

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "verify-email.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="state-loading" class="hidden"></div>
    <div id="card-main">
      <h1 id="page-subtitle"></h1>
      <div id="alert" class="hidden"></div>

      <section id="step-1">
        <input id="emailField" type="email" />
        <button id="send-code-btn">Send Code</button>
      </section>

      <section id="step-2" class="hidden">
        <p id="sent-banner-email"></p>
        <div id="email-summary" class="hidden">
          <span id="email-summary-value"></span>
        </div>
        <input class="tsts-otp-cell" />
        <input class="tsts-otp-cell" />
        <input class="tsts-otp-cell" />
        <input class="tsts-otp-cell" />
        <input class="tsts-otp-cell" />
        <input class="tsts-otp-cell" />
        <p id="otp-error" class="hidden"></p>
        <button id="verify-code-btn" disabled>Verify Code</button>
        <button id="resend-code-btn">Resend</button>
      </section>

      <section id="step-3" class="hidden">
        <button id="continue-btn">Continue</button>
      </section>
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

function loadVerifyEmail(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  delete window.__TSTS_VERIFY_EMAIL_RAN__; // re-run the IIFE
  buildDom();

  Object.defineProperty(window, "location", {
    value: {
      search: opts.search || "",
      hash: opts.hash || "",
      pathname: "/verify-email.html",
      href: "https://example.com/verify-email.html" + (opts.search || "") + (opts.hash || ""),
      assign(v) { this.__assigned = v; },
      set href(v) { this.__assigned = v; },
    },
    writable: true,
    configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({
    ok: false, status: 500, json: async () => ({}),
  }));

  // history.replaceState stub (jsdom has it but safer to no-op)
  window.history.replaceState = () => {};

  // capture DOMContentLoaded
  __capturedDOMHandler = null;
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") {
      __capturedDOMHandler = handler;
      return;
    }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") {
    await __capturedDOMHandler();
  }
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("verify-email — step 1 (send code)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("invalid email shows alert and stays on step 1", async () => {
    loadVerifyEmail({});
    await fireDOMReady();
    document.getElementById("emailField").value = "not-an-email";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(document.getElementById("alert").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("alert").textContent).toMatch(/valid email/i);
    expect(document.getElementById("step-1").classList.contains("hidden")).toBe(false);
  });

  test("valid email + ok response advances to step 2 with otpSessionId captured", async () => {
    let captured = null;
    loadVerifyEmail({
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_abc" } }) };
      },
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "Foo@Bar.COM";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(captured.url).toBe("/api/auth/otp/request-email-verify");
    expect(captured.body.email).toBe("foo@bar.com"); // lowercased
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("step-1").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("sent-banner-email").textContent).toBe("foo@bar.com");
    expect(document.getElementById("email-summary-value").textContent).toBe("foo@bar.com");
  });

  test("server error keeps user on step 1 with message", async () => {
    loadVerifyEmail({
      authFetch: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, message: "RATE_LIMITED" }) }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/RATE_LIMITED/);
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(true);
  });

  test("network exception → 'Network error' alert", async () => {
    loadVerifyEmail({ authFetch: async () => { throw new Error("net"); } });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/network error/i);
  });

  test("Enter key in email field triggers send", async () => {
    let called = false;
    loadVerifyEmail({
      authFetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) }; },
    });
    await fireDOMReady();
    const field = document.getElementById("emailField");
    field.value = "user@example.com";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(called).toBe(true);
  });

  test("URL ?email=... prefills the field", async () => {
    loadVerifyEmail({ search: "?email=prefilled%40example.com" });
    await fireDOMReady();
    expect(document.getElementById("emailField").value).toBe("prefilled@example.com");
  });
});

describe("verify-email — step 2 OTP input behaviour", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  async function advanceToStep2(authFetch) {
    loadVerifyEmail({
      authFetch: authFetch || (async (url) => {
        if (url === "/api/auth/otp/request-email-verify") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_step2" } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  test("typing single digit moves focus to next cell", async () => {
    await advanceToStep2();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "1";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    expect(cells[0].classList.contains("is-filled")).toBe(true);
    expect(document.activeElement).toBe(cells[1]);
  });

  test("typing 6 digits into cell 0 spreads across all cells and auto-submits", async () => {
    const calls = [];
    await advanceToStep2(async (url, opts) => {
      calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url === "/api/auth/otp/request-email-verify") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_full" } }) };
      }
      if (url === "/api/auth/verify-email-otp") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { id: "u1" } } }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "123456";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(Array.from(cells).map((c) => c.value).join("")).toBe("123456");
    const verifyCall = calls.find((c) => c.url === "/api/auth/verify-email-otp");
    expect(verifyCall).toBeTruthy();
    expect(verifyCall.body.code).toBe("123456");
    expect(verifyCall.body.otpSessionId).toBe("sid_full");
    expect(verifyCall.body.email).toBe("user@example.com");
    expect(document.getElementById("step-3").classList.contains("hidden")).toBe(false);
  });

  test("Backspace on empty cell jumps to previous cell and clears it", async () => {
    await advanceToStep2();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "1";
    cells[0].classList.add("is-filled");
    cells[1].focus();
    cells[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(cells[0].value).toBe("");
    expect(cells[0].classList.contains("is-filled")).toBe(false);
    expect(document.activeElement).toBe(cells[0]);
  });

  test("ArrowLeft moves focus back, ArrowRight moves forward", async () => {
    await advanceToStep2();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[2].focus();
    cells[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    cells[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(cells[2]);
  });

  test("paste of '654321' fills cells, focuses last, auto-submits", async () => {
    const calls = [];
    await advanceToStep2(async (url, opts) => {
      calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url === "/api/auth/otp/request-email-verify") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      }
      if (url === "/api/auth/verify-email-otp") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { id: "u1" } } }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = { getData: () => "abc654321xyz" };
    cells[0].dispatchEvent(pasteEvent);
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(Array.from(cells).map((c) => c.value).join("")).toBe("654321");
    expect(calls.find((c) => c.url === "/api/auth/verify-email-otp")).toBeTruthy();
  });

  test("verify-email-otp returns ok:false → error displayed, stays on step 2", async () => {
    await advanceToStep2(async (url) => {
      if (url === "/api/auth/otp/request-email-verify") {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      }
      if (url === "/api/auth/verify-email-otp") {
        return { ok: false, status: 400, json: async () => ({ ok: false, message: "INVALID_CODE" }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "999999";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("otp-error").textContent).toMatch(/INVALID_CODE/);
    expect(document.getElementById("step-3").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(false);
  });
});

describe("verify-email — resend cooldown", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("after send, Resend button is disabled with countdown label", async () => {
    loadVerifyEmail({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "u@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const resend = document.getElementById("resend-code-btn");
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toMatch(/Resend \(\d+s\)/);
  });
});
