// REAL coverage for js/login.js — exercises:
// - safeRedirectTarget allow-list and protocol filter (pure function exposed at module scope)
// - tstsPasswordRulesEval policy mirror
// - handleLogin admin vs user routing
// - handleSignup mismatched password / weak rules / terms gate / register POST flow
// - handleForgotPassword POST + redirect
// - showModal fallback wrapping tstsNotify

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "login.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="login-card" style="opacity:0"></div>
    <button id="tab-login"></button>
    <button id="tab-signup"></button>

    <form id="form-login">
      <input id="login-email" />
      <input id="login-password" type="password" />
      <button id="btn-google-login"><img/></button>
      <button id="btn-apple-login"></button>
      <button id="btn-forgot-password" type="button">Forgot</button>
      <a id="switch-to-signup"></a>
      <button type="submit">Sign in</button>
    </form>

    <form id="form-signup" class="hidden">
      <input id="signup-name" />
      <input id="signup-email" />
      <input id="signup-password" type="password" />
      <input id="signup-confirm-password" type="password" />
      <input type="checkbox" id="signup-terms" />
      <ul id="signup-password-rules">
        <li data-rule="length"><span class="rule-dot"></span> 8-24 chars</li>
        <li data-rule="lower"><span class="rule-dot"></span> lowercase</li>
        <li data-rule="upper"><span class="rule-dot"></span> uppercase</li>
        <li data-rule="number"><span class="rule-dot"></span> number</li>
      </ul>
      <button id="btn-google-signup"><img/></button>
      <button id="btn-apple-signup"></button>
      <a id="switch-to-login"></a>
      <button type="submit">Create account</button>
    </form>
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

let __domHandlers = []; // login.js registers MULTIPLE DOMContentLoaded handlers
let __navigatedTo = "";

function loadLogin(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      search: opts.search || "",
      pathname: "/login.html",
      origin: "https://example.com",
      get href() { return "https://example.com/login.html" + (opts.search || ""); },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsNotify = opts.notify || vi.fn();
  window.setAuth = opts.setAuth || vi.fn();
  window.clearAuth = opts.clearAuth || vi.fn();
  window.tstsGetSession = opts.session || (async () => ({ ok: false }));
  window.tstsMarkLoginOk = opts.markLoginOk || vi.fn();
  window.tstsSetText = (el, txt) => { if (el) el.textContent = String(txt); };
  window.tstsUnwrap = (data) => (data && data.data !== undefined ? data.data : data);

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
    try { await h(); } catch (e) { /* swallowed: handler may rely on missing browser API */ }
  }
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

describe("login — safeRedirectTarget", () => {
  // We assert behavior indirectly via handleLogin's window.location.href setting.
  beforeEach(() => { vi.restoreAllMocks(); });

  test("redirect=http://evil.example.com is sanitised to index.html", async () => {
    loadLogin({
      search: "?redirect=http%3A%2F%2Fevil.example.com",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { id: "u" }, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("index.html");
  });

  test("redirect=//attacker.com is sanitised", async () => {
    loadLogin({
      search: "?redirect=%2F%2Fattacker.com",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: {}, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("index.html");
  });

  test("redirect=javascript:alert(1) is sanitised", async () => {
    loadLogin({
      search: "?redirect=javascript%3Aalert(1)",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: {}, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("index.html");
  });

  test("redirect=profile.html (allow-listed) is preserved", async () => {
    loadLogin({
      search: "?redirect=profile.html",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: {}, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("profile.html");
  });

  test("redirect=secret-admin-panel.html (not allow-listed) falls back to profile.html", async () => {
    loadLogin({
      search: "?redirect=secret-admin-panel.html",
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: {}, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("profile.html");
  });
});

describe("login — handleLogin admin routing", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("isAdmin:true → admin.html", async () => {
    loadLogin({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { isAdmin: true }, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "admin@thesharedtablestory.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("admin.html");
  });

  test("role:'admin' (case-insensitive) → admin.html", async () => {
    loadLogin({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { role: "Admin" }, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "a@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("admin.html");
  });

  test("non-admin → safeRedirectTarget default index.html", async () => {
    loadLogin({
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { user: { role: "user" }, csrfToken: "c" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("index.html");
  });

  test("HTTP non-ok shows error modal, does not redirect", async () => {
    const notify = vi.fn();
    loadLogin({
      notify,
      authFetch: async () => ({ ok: false, status: 401, json: async () => ({ message: "INVALID_PASSWORD" }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "u@example.com";
    document.getElementById("login-password").value = "pw";
    document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(__navigatedTo).toBe("");
    expect(notify).toHaveBeenCalled();
    expect(String(notify.mock.calls[0][0])).toMatch(/INVALID_PASSWORD/);
  });
});

describe("login — handleSignup validation", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  function fillSignup({ pw = "Password1", confirm = pw, terms = true } = {}) {
    document.getElementById("signup-name").value = "Test";
    document.getElementById("signup-email").value = "new@example.com";
    document.getElementById("signup-password").value = pw;
    document.getElementById("signup-confirm-password").value = confirm;
    document.getElementById("signup-terms").checked = !!terms;
  }

  test("mismatched passwords → error notification, no POST", async () => {
    const notify = vi.fn();
    let posted = false;
    loadLogin({
      notify,
      authFetch: async () => { posted = true; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await fireDOMReady();
    fillSignup({ pw: "Password1", confirm: "Different1" });
    document.getElementById("form-signup").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(String(notify.mock.calls[0][0])).toMatch(/Password Mismatch/i);
  });

  test("password missing uppercase → notification, no POST", async () => {
    const notify = vi.fn();
    let posted = false;
    loadLogin({
      notify,
      authFetch: async () => { posted = true; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await fireDOMReady();
    fillSignup({ pw: "password1" });
    document.getElementById("form-signup").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(String(notify.mock.calls[0][0])).toMatch(/uppercase/i);
  });

  test("terms not accepted → notification, no POST", async () => {
    const notify = vi.fn();
    let posted = false;
    loadLogin({
      notify,
      authFetch: async () => { posted = true; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await fireDOMReady();
    fillSignup({ pw: "Password1", terms: false });
    document.getElementById("form-signup").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(String(notify.mock.calls[0][0])).toMatch(/Terms Required/i);
  });

  test("happy path: POST /api/auth/register with termsAgreed=true, success modal, redirect to login", async () => {
    const notify = vi.fn();
    let captured = null;
    loadLogin({
      notify,
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
      },
    });
    await fireDOMReady();
    fillSignup({ pw: "Password1" });
    document.getElementById("form-signup").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(captured.url).toBe("/api/auth/register");
    expect(captured.body.termsAgreed).toBe(true);
    expect(captured.body.email).toBe("new@example.com");
    expect(String(notify.mock.calls[0][0])).toMatch(/Account Created/i);
  });

  test("live password rules paint flips classes as the user types", async () => {
    loadLogin({});
    await fireDOMReady();
    const input = document.getElementById("signup-password");
    input.value = "Aa1bbbbb";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const lengthLi = document.querySelector('li[data-rule="length"]');
    const upperLi  = document.querySelector('li[data-rule="upper"]');
    expect(lengthLi.classList.contains("text-emerald-600")).toBe(true);
    expect(upperLi.classList.contains("text-emerald-600")).toBe(true);
  });
});

describe("login — handleForgotPassword", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("empty email → notification, no POST", async () => {
    const notify = vi.fn();
    let posted = false;
    loadLogin({
      notify,
      authFetch: async () => { posted = true; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "";
    document.getElementById("btn-forgot-password").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(posted).toBe(false);
    expect(String(notify.mock.calls[0][0])).toMatch(/Forgot Password/i);
  });

  test("ok response with otpSessionId → notify success + redirect to reset-password", async () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    loadLogin({
      notify,
      authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { otpSessionId: "sid_fp" } }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "user@example.com";
    document.getElementById("btn-forgot-password").click();
    await vi.advanceTimersByTimeAsync(1300);
    expect(notify).toHaveBeenCalled();
    expect(__navigatedTo).toMatch(/reset-password\.html\?otpSessionId=sid_fp&email=user%40example\.com/);
    vi.useRealTimers();
  });

  test("server error → error notify", async () => {
    const notify = vi.fn();
    loadLogin({
      notify,
      authFetch: async () => ({ ok: false, status: 500, json: async () => ({ message: "DOWN" }) }),
    });
    await fireDOMReady();
    document.getElementById("login-email").value = "user@example.com";
    document.getElementById("btn-forgot-password").click();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(String(notify.mock.calls[notify.mock.calls.length - 1][0])).toMatch(/DOWN/);
  });
});

describe("login — already-authed redirect", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("authed admin → admin.html on page load", async () => {
    loadLogin({
      session: async () => ({ ok: true, user: { isAdmin: true } }),
    });
    await fireDOMReady();
    expect(__navigatedTo).toBe("admin.html");
  });

  test("authed user with ?redirect=explore.html → explore.html", async () => {
    loadLogin({
      search: "?redirect=explore.html",
      session: async () => ({ ok: true, user: { role: "user" } }),
    });
    await fireDOMReady();
    expect(__navigatedTo).toBe("explore.html");
  });
});

describe("login — tab toggle", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clicking signup tab hides login form, shows signup form", async () => {
    loadLogin({});
    await fireDOMReady();
    document.getElementById("tab-signup").click();
    expect(document.getElementById("form-signup").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("form-login").classList.contains("hidden")).toBe(true);
    document.getElementById("tab-login").click();
    expect(document.getElementById("form-login").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("form-signup").classList.contains("hidden")).toBe(true);
  });
});

describe("login — session_expired notice", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("?reason=session_expired triggers info notify on init", async () => {
    const notify = vi.fn();
    loadLogin({ search: "?reason=session_expired", notify });
    await fireDOMReady();
    expect(notify).toHaveBeenCalled();
    // The first call should mention session expiry
    const allMessages = notify.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(allMessages).toMatch(/session has expired/i);
  });
});
