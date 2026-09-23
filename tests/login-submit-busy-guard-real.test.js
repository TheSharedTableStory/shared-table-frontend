// REAL coverage for the sign-in / sign-up submit busy guard in js/login.js.
//
// The page's other actions already guard themselves: the Google flow disables both
// buttons and sets their text through window.tstsSetText, and the forgot-password
// button disables itself and sets aria-busy. The email/password sign-in and sign-up
// submit handlers did not, so a second press during the request sent a second
// sign-in / a second registration.
//
// Every case below runs the REAL js/login.js against the REAL login.html markup, so
// the words the buttons are restored to ("Log In" / "Create Account") are the words
// that actually ship on the page, never a string invented by the test.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = resolve(__dirname, "..");
const SRC = readFileSync(resolve(ROOT, "js", "login.js"), "utf-8");
const PAGE = readFileSync(resolve(ROOT, "login.html"), "utf-8");
// runScripts "outside-only": the page's own <script> tags are never executed here,
// only its markup is lifted, and js/login.js is then run explicitly below.
const PAGE_BODY = new JSDOM(PAGE, { runScripts: "outside-only" }).window.document.body.innerHTML;

const ELLIPSIS = "…";
const SIGNING_IN = "Signing in" + ELLIPSIS;
const CREATING_ACCOUNT = "Creating your account" + ELLIPSIS;

function deferred() {
  let settleOk, settleFail;
  const promise = new Promise((res, rej) => { settleOk = res; settleFail = rej; });
  return { promise, resolve: settleOk, reject: settleFail };
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

function loadLoginPage(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  document.body.innerHTML = PAGE_BODY;

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

  window.authFetch = opts.authFetch || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }));
  window.tstsNotify = opts.notify || vi.fn();
  window.setAuth = vi.fn();
  window.clearAuth = vi.fn();
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsMarkLoginOk = vi.fn();
  window.tstsSetText = (el, txt) => { if (el) el.textContent = (txt == null) ? "" : String(txt); };
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

async function flush(times) {
  for (let i = 0; i < (times || 25); i++) await Promise.resolve();
}

function loginButton() { return document.querySelector('#form-login button[type="submit"]'); }
function signupButton() { return document.querySelector('#form-signup button[type="submit"]'); }

function pressLogin() {
  document.getElementById("form-login").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}
function pressSignup() {
  document.getElementById("form-signup").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

function fillLogin() {
  document.getElementById("login-email").value = "user@example.com";
  document.getElementById("login-password").value = "Password1";
}
function fillSignup() {
  document.getElementById("signup-name").value = "Test Person";
  document.getElementById("signup-email").value = "new@example.com";
  document.getElementById("signup-password").value = "Password1";
  document.getElementById("signup-confirm-password").value = "Password1";
  document.getElementById("signup-terms").checked = true;
}

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ ok: true, data: { user: { role: "user" }, csrfToken: "c" } }) };
}
function refusedResponse() {
  return { ok: false, status: 401, json: async () => ({ message: "Please check your email and password." }) };
}

describe("login submit busy guard — the real page's own button words", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the sign-in submit button on login.html reads 'Log In'", async () => {
    loadLoginPage({});
    await fireDOMReady();
    expect(loginButton().textContent).toBe("Log In");
  });

  test("the sign-up submit button on login.html reads 'Create Account'", async () => {
    loadLoginPage({});
    await fireDOMReady();
    expect(signupButton().textContent).toBe("Create Account");
  });
});

describe("login submit busy guard — sign-in", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("a second press while the request is pending sends only one sign-in", async () => {
    const d = deferred();
    let calls = 0;
    loadLoginPage({ authFetch: async () => { calls++; return d.promise; } });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    pressLogin();
    pressLogin();
    await flush();
    expect(calls).toBe(1);
    d.resolve(okResponse());
    await flush();
  });

  test("while the request is pending the button reads 'Signing in…'", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    expect(loginButton().textContent).toBe(SIGNING_IN);
    d.resolve(okResponse());
    await flush();
  });

  test("while the request is pending the button is disabled and aria-busy", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    expect(loginButton().disabled).toBe(true);
    expect(loginButton().getAttribute("aria-busy")).toBe("true");
    d.resolve(okResponse());
    await flush();
  });

  test("after success the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    d.resolve(okResponse());
    await flush();
    expect(loginButton().disabled).toBe(false);
    expect(loginButton().getAttribute("aria-busy")).toBe(null);
    expect(loginButton().textContent).toBe("Log In");
  });

  test("after a refusal the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    d.resolve(refusedResponse());
    await flush();
    expect(__navigatedTo).toBe("");
    expect(loginButton().disabled).toBe(false);
    expect(loginButton().getAttribute("aria-busy")).toBe(null);
    expect(loginButton().textContent).toBe("Log In");
  });

  test("after a thrown network error the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    d.reject(new Error("network down"));
    await flush();
    expect(loginButton().disabled).toBe(false);
    expect(loginButton().getAttribute("aria-busy")).toBe(null);
    expect(loginButton().textContent).toBe("Log In");
  });

  test("the restored words are read from the button itself, not a hard-coded string", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    loginButton().textContent = "Sign in to your table";
    fillLogin();
    pressLogin();
    await flush();
    expect(loginButton().textContent).toBe(SIGNING_IN);
    d.resolve(okResponse());
    await flush();
    expect(loginButton().textContent).toBe("Sign in to your table");
  });

  test("once the request settles a fresh press is sent again", async () => {
    let calls = 0;
    let d = deferred();
    loadLoginPage({ authFetch: async () => { calls++; return d.promise; } });
    await fireDOMReady();
    fillLogin();
    pressLogin();
    await flush();
    d.resolve(okResponse());
    await flush();
    expect(calls).toBe(1);
    d = deferred();
    pressLogin();
    await flush();
    expect(calls).toBe(2);
    d.resolve(okResponse());
    await flush();
  });

  test("the button the browser names as the presser is the one guarded", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillLogin();
    const btn = loginButton();
    const ev = new Event("submit", { cancelable: true, bubbles: true });
    Object.defineProperty(ev, "submitter", { value: btn, configurable: true });
    document.getElementById("form-login").dispatchEvent(ev);
    await flush();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe(SIGNING_IN);
    d.resolve(okResponse());
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Log In");
  });
});

describe("login submit busy guard — sign-up", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("a second press while the request is pending sends only one registration", async () => {
    const d = deferred();
    let calls = 0;
    loadLoginPage({ authFetch: async () => { calls++; return d.promise; } });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    pressSignup();
    pressSignup();
    await flush();
    expect(calls).toBe(1);
    d.resolve(okResponse());
    await flush();
  });

  test("while the request is pending the button reads 'Creating your account…'", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    expect(signupButton().textContent).toBe(CREATING_ACCOUNT);
    d.resolve(okResponse());
    await flush();
  });

  test("while the request is pending the button is disabled and aria-busy", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    expect(signupButton().disabled).toBe(true);
    expect(signupButton().getAttribute("aria-busy")).toBe("true");
    d.resolve(okResponse());
    await flush();
  });

  test("after success the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    d.resolve(okResponse());
    await flush();
    expect(signupButton().disabled).toBe(false);
    expect(signupButton().getAttribute("aria-busy")).toBe(null);
    expect(signupButton().textContent).toBe("Create Account");
  });

  test("after a refusal the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    d.resolve({ ok: false, status: 409, json: async () => ({ message: "That email already has an account." }) });
    await flush();
    expect(signupButton().disabled).toBe(false);
    expect(signupButton().getAttribute("aria-busy")).toBe(null);
    expect(signupButton().textContent).toBe("Create Account");
  });

  test("after a thrown network error the button is enabled, aria-busy is gone and its own words are back", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    d.reject(new Error("network down"));
    await flush();
    expect(signupButton().disabled).toBe(false);
    expect(signupButton().getAttribute("aria-busy")).toBe(null);
    expect(signupButton().textContent).toBe("Create Account");
  });

  test("the restored words are read from the button itself, not a hard-coded string", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    signupButton().textContent = "Join the table";
    fillSignup();
    pressSignup();
    await flush();
    expect(signupButton().textContent).toBe(CREATING_ACCOUNT);
    d.resolve(okResponse());
    await flush();
    expect(signupButton().textContent).toBe("Join the table");
  });

  test("once the request settles a fresh press is sent again", async () => {
    let calls = 0;
    let d = deferred();
    loadLoginPage({ authFetch: async () => { calls++; return d.promise; } });
    await fireDOMReady();
    fillSignup();
    pressSignup();
    await flush();
    d.resolve(okResponse());
    await flush();
    expect(calls).toBe(1);
    d = deferred();
    pressSignup();
    await flush();
    expect(calls).toBe(2);
    d.resolve(okResponse());
    await flush();
  });

  test("a press that fails the page's own checks never marks the button busy", async () => {
    let calls = 0;
    loadLoginPage({ authFetch: async () => { calls++; return okResponse(); } });
    await fireDOMReady();
    fillSignup();
    document.getElementById("signup-terms").checked = false;
    pressSignup();
    await flush();
    expect(calls).toBe(0);
    expect(signupButton().disabled).toBe(false);
    expect(signupButton().getAttribute("aria-busy")).toBe(null);
    expect(signupButton().textContent).toBe("Create Account");
  });

  test("the button the browser names as the presser is the one guarded", async () => {
    const d = deferred();
    loadLoginPage({ authFetch: async () => d.promise });
    await fireDOMReady();
    fillSignup();
    const btn = signupButton();
    const ev = new Event("submit", { cancelable: true, bubbles: true });
    Object.defineProperty(ev, "submitter", { value: btn, configurable: true });
    document.getElementById("form-signup").dispatchEvent(ev);
    await flush();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe(CREATING_ACCOUNT);
    d.resolve(okResponse());
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Create Account");
  });
});
