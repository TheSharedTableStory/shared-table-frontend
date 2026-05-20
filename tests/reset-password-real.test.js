// REAL coverage for js/reset-password.js — 4-step OTP password reset:
// 1) email → request-reset, 2) OTP → /auth/otp/verify, 3) new password → reset-password,
// 4) Continue → auto-login. Plus URL prefill deep-link to step 2.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "reset-password.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <h1 id="page-subtitle"></h1>
    <div id="alert" class="hidden"></div>
    <div id="email-summary" class="hidden"><span id="email-summary-value"></span></div>

    <section id="step-1">
      <input id="emailField" type="email" />
      <button id="send-code-btn">Send Code</button>
    </section>
    <section id="step-2" class="hidden">
      <p id="sent-banner-email"></p>
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
      <input id="newPassword" type="password" />
      <button id="toggle-newPassword">Show</button>
      <input id="confirmPassword" type="password" />
      <button id="toggle-confirmPassword">Show</button>
      <p id="pw-hint" class="hidden"></p>
      <p id="confirm-hint" class="hidden"></p>
      <button id="reset-password-btn" disabled>Reset Password</button>
    </section>
    <section id="step-4" class="hidden">
      <button id="continue-btn">Continue</button>
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

let __capturedDOMHandler = null;
let __navigatedTo = "";

function loadResetPassword(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();

  __navigatedTo = "";
  const locValue = {
    search: opts.search || "",
    hash: opts.hash || "",
    pathname: "/reset-password.html",
    get href() { return "https://example.com/reset-password.html" + (opts.search || "") + (opts.hash || ""); },
    set href(v) { __navigatedTo = String(v); },
  };
  Object.defineProperty(window, "location", { value: locValue, writable: true, configurable: true });

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.history.replaceState = () => {};
  window.clearAuth = opts.clearAuth || (() => {});

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
  if (typeof __capturedDOMHandler === "function") await __capturedDOMHandler();
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("reset-password — step 1 (send code)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("invalid email blocks send", async () => {
    loadResetPassword({});
    await fireDOMReady();
    document.getElementById("emailField").value = "not-email";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/valid email/i);
    expect(document.getElementById("step-1").classList.contains("hidden")).toBe(false);
  });

  test("valid email → advances to step 2 and captures otpSessionId", async () => {
    let captured = null;
    loadResetPassword({
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_reset_1" } }) };
      },
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "  USER@Example.COM  ";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(captured.url).toBe("/api/auth/otp/request-reset");
    expect(captured.body.email).toBe("user@example.com");
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("sent-banner-email").textContent).toBe("user@example.com");
  });

  test("server ok:false stays on step 1 with message", async () => {
    loadResetPassword({
      authFetch: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, message: "BANNED" }) }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/BANNED/);
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(true);
  });

  test("ok response missing otpSessionId shows alert", async () => {
    loadResetPassword({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/Could not start/i);
  });
});

describe("reset-password — deep-link to step 2", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("?otpSessionId&email opens directly on step 2", async () => {
    loadResetPassword({ search: "?otpSessionId=sid_deep&email=deep%40example.com" });
    await fireDOMReady();
    expect(document.getElementById("step-2").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("step-1").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("sent-banner-email").textContent).toBe("deep@example.com");
  });
});

describe("reset-password — step 2 OTP verify", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  async function toStep2(authFetch) {
    loadResetPassword({
      authFetch: authFetch || (async (url) => {
        if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_step2" } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  test("typing 6 digits in cell 0 auto-submits OTP and advances to step 3", async () => {
    const calls = [];
    await toStep2(async (url, opts) => {
      calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_v" } }) };
      if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok_xyz" } }) };
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "123456";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const verifyCall = calls.find((c) => c.url === "/api/auth/otp/verify");
    expect(verifyCall.body.code).toBe("123456");
    expect(verifyCall.body.otpSessionId).toBe("sid_v");
    expect(document.getElementById("step-3").classList.contains("hidden")).toBe(false);
  });

  test("verify ok:false → otp error shown, stays on step 2", async () => {
    await toStep2(async (url) => {
      if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      if (url === "/api/auth/otp/verify") return { ok: false, status: 400, json: async () => ({ ok: false, message: "BAD_CODE" }) };
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "999999";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(document.getElementById("otp-error").textContent).toMatch(/BAD_CODE/);
    expect(document.getElementById("step-3").classList.contains("hidden")).toBe(true);
  });

  test("paste of 6 digits triggers auto-submit", async () => {
    const calls = [];
    await toStep2(async (url, opts) => {
      calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "t" } }) };
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const cells = document.querySelectorAll(".tsts-otp-cell");
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    ev.clipboardData = { getData: () => "111222" };
    cells[0].dispatchEvent(ev);
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(calls.find((c) => c.url === "/api/auth/otp/verify").body.code).toBe("111222");
  });
});

describe("reset-password — step 3 password policy & submit", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  async function toStep3(authFetch) {
    loadResetPassword({
      authFetch: authFetch || (async (url) => {
        if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
        if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok_step3" } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "123456";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  test("weak password keeps submit disabled and shows hint", async () => {
    await toStep3();
    const pw = document.getElementById("newPassword");
    pw.value = "short";
    pw.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("pw-hint").textContent).toMatch(/At least 8 characters/);
    expect(document.getElementById("reset-password-btn").disabled).toBe(true);
  });

  test("strong password + mismatched confirm keeps submit disabled, shows mismatch", async () => {
    await toStep3();
    const pw = document.getElementById("newPassword");
    pw.value = "StrongP@ss123";
    pw.dispatchEvent(new Event("input", { bubbles: true }));
    const cpw = document.getElementById("confirmPassword");
    cpw.value = "wrong";
    cpw.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("confirm-hint").textContent).toMatch(/don/);
    expect(document.getElementById("reset-password-btn").disabled).toBe(true);
  });

  test("strong + matching → submit enabled; POST /reset-password advances to step 4", async () => {
    let resetCall = null;
    let clearAuthCalls = 0;
    await toStep3(async (url, opts) => {
      if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok_step3" } }) };
      if (url === "/api/auth/otp/reset-password") {
        resetCall = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    window.clearAuth = () => { clearAuthCalls += 1; };
    const pw = document.getElementById("newPassword");
    pw.value = "StrongP@ss123";
    pw.dispatchEvent(new Event("input", { bubbles: true }));
    const cpw = document.getElementById("confirmPassword");
    cpw.value = "StrongP@ss123";
    cpw.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("reset-password-btn").disabled).toBe(false);
    document.getElementById("reset-password-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(resetCall.otpToken).toBe("tok_step3");
    expect(resetCall.newPassword).toBe("StrongP@ss123");
    expect(document.getElementById("step-4").classList.contains("hidden")).toBe(false);
    expect(clearAuthCalls).toBe(1);
  });

  test("reset failure stays on step 3 with alert", async () => {
    await toStep3(async (url) => {
      if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
      if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok_step3" } }) };
      if (url === "/api/auth/otp/reset-password") return { ok: false, status: 400, json: async () => ({ ok: false, message: "TOKEN_EXPIRED" }) };
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const pw = document.getElementById("newPassword");
    pw.value = "StrongP@ss123";
    pw.dispatchEvent(new Event("input", { bubbles: true }));
    const cpw = document.getElementById("confirmPassword");
    cpw.value = "StrongP@ss123";
    cpw.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("reset-password-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("alert").textContent).toMatch(/TOKEN_EXPIRED/);
    expect(document.getElementById("step-4").classList.contains("hidden")).toBe(true);
  });

  test("password visibility toggle flips input type", async () => {
    await toStep3();
    const pw = document.getElementById("newPassword");
    expect(pw.getAttribute("type")).toBe("password");
    document.getElementById("toggle-newPassword").click();
    expect(pw.getAttribute("type")).toBe("text");
    document.getElementById("toggle-newPassword").click();
    expect(pw.getAttribute("type")).toBe("password");
  });
});

describe("reset-password — step 4 auto-login", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("Continue success → navigates to index.html", async () => {
    loadResetPassword({
      authFetch: async (url) => {
        if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
        if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok" } }) };
        if (url === "/api/auth/otp/reset-password") return { ok: true, status: 200, json: async () => ({ ok: true }) };
        if (url === "/api/auth/login") return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { id: "u" } } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "123456";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    document.getElementById("newPassword").value = "StrongP@ss123";
    document.getElementById("newPassword").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("confirmPassword").value = "StrongP@ss123";
    document.getElementById("confirmPassword").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("reset-password-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("step-4").classList.contains("hidden")).toBe(false);
    document.getElementById("continue-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(__navigatedTo).toMatch(/index\.html/);
  });

  test("Continue auto-login failure → falls back to login.html?email=", async () => {
    loadResetPassword({
      authFetch: async (url) => {
        if (url === "/api/auth/otp/request-reset") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid" } }) };
        if (url === "/api/auth/otp/verify") return { ok: true, status: 200, json: async () => ({ ok: true, data: { otpToken: "tok" } }) };
        if (url === "/api/auth/otp/reset-password") return { ok: true, status: 200, json: async () => ({ ok: true }) };
        if (url === "/api/auth/login") return { ok: false, status: 400, json: async () => ({ ok: false }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await fireDOMReady();
    document.getElementById("emailField").value = "user@example.com";
    document.getElementById("send-code-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const cells = document.querySelectorAll(".tsts-otp-cell");
    cells[0].value = "123456";
    cells[0].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    document.getElementById("newPassword").value = "StrongP@ss123";
    document.getElementById("newPassword").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("confirmPassword").value = "StrongP@ss123";
    document.getElementById("confirmPassword").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("reset-password-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    document.getElementById("continue-btn").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(__navigatedTo).toMatch(/login\.html\?email=user%40example\.com/);
  });
});
