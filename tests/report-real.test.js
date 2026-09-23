// REAL coverage for js/report.js — exercises the 3-step reporting wizard:
// auth gate, URL prefill, category selection, contact toggle, message counter,
// validation, submit POST, success transition, error handling.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "report.js"), "utf-8");

function buildDom() {
  document.body.innerHTML = `
    <div id="report-alert" class="hidden"></div>
    <div id="report-progress-bar" style="width: 0"></div>
    <input id="reportTargetType" value="" />
    <input id="reportTargetId" value="" />
    <input id="reportPageUrl" value="" />
    <a id="report-return-link" href="#"></a>
    <textarea id="reportMessage"></textarea>
    <span id="report-msg-counter">0</span>
    <input id="reportPhone" class="hidden" />
    <button id="report-submit-btn" data-report-nav="submit">Submit report</button>
    <button id="report-next-1" disabled data-report-nav="next">Next</button>
    <button id="report-back-2" data-report-nav="prev">Back</button>

    <div id="report-step-1">
      <!-- The "what is this about?" step, shown only when no target arrived on the URL. -->
      <div id="report-about" class="hidden">
        <button data-report-about="specific">A particular experience or person</button>
        <button data-report-about="platform">The platform itself</button>
        <div id="report-about-specific-help" class="hidden">
          <button data-report-about="platform">It isn't about one listing</button>
        </div>
      </div>
      <div id="report-categories-block">
      <div data-report-category="safety">Safety</div>
      <div data-report-category="spam">Spam</div>
      <div data-report-category="harassment">Harassment</div>
      <div data-report-category="fraud">Fraud</div>
      <div data-report-category="inaccurate">Inaccurate</div>
      <div data-report-category="other">Other</div>
      </div>
      <span data-report-step-label="1">1</span>
    </div>
    <div id="report-step-2" class="hidden">
      <label><input type="radio" name="reportContact" value="email" checked /></label>
      <label><input type="radio" name="reportContact" value="phone" /></label>
      <label><input type="radio" name="reportContact" value="none" /></label>
      <span data-report-step-label="2">2</span>
    </div>
    <div id="report-step-3" class="hidden">
      <span data-report-step-label="3">3</span>
    </div>
  `;
}

let __capturedDOMHandler = null;
const __registeredHandlers = []; // [{event, handler}] — removed before each load

function cleanupDocHandlers() {
  while (__registeredHandlers.length) {
    const reg = __registeredHandlers.pop();
    try {
      document.removeEventListener(reg.event, reg.handler);
    } catch (err) {
      // ignore: handler may already be detached if document was reset
    }
  }
}

function loadReport(opts) {
  opts = opts || {};
  // Strip click/etc. listeners any prior IIFE registered so this test's new
  // closure is the only one driving event delegation.
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  Object.defineProperty(window, "location", {
    value: {
      search: opts.search || "",
      pathname: opts.pathname || "/report.html",
      href: "https://example.com" + (opts.pathname || "/report.html") + (opts.search || ""),
    },
    writable: true,
    configurable: true,
  });

  // session stub
  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "u1" } }));

  // capture DOMContentLoaded handler so we can invoke once per test
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

  // authFetch stub
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));

  // scroll stub
  window.scrollTo = () => {};

  // Suppress redirect side-effect by making location.href setter a no-op
  // (already a plain object; href assignment becomes a no-op string)

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") {
    await __capturedDOMHandler();
  }
  // microtask flush
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const VALID_TARGET_ID = "507f1f77bcf86cd799439011";

describe("report — auth gate", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("redirects to login when no session", async () => {
    let redirected = "";
    loadReport({
      session: async () => ({ ok: false }),
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
    });
    // intercept location.href setter
    Object.defineProperty(window.location, "href", {
      set(v) { redirected = String(v); },
      get() { return ""; },
      configurable: true,
    });
    await fireDOMReady();
    expect(redirected).toMatch(/login\.html\?returnTo=/);
  });

  test("missing tstsGetSession also redirects", async () => {
    let redirected = "";
    buildDom();
    (0, eval)(COMMON_SRC);
    delete window.tstsGetSession;
    Object.defineProperty(window, "location", {
      value: { search: "", pathname: "/report.html" },
      writable: true, configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set(v) { redirected = String(v); }, get() { return ""; }, configurable: true,
    });
    const origAdd = document.addEventListener.bind(document);
    __capturedDOMHandler = null;
    vi.spyOn(document, "addEventListener").mockImplementation((event, handler) => {
      if (event === "DOMContentLoaded") __capturedDOMHandler = handler;
      else return origAdd(event, handler);
    });
    window.authFetch = async () => ({ ok: true, json: async () => ({}) });
    window.scrollTo = () => {};
    new Function(SRC)();
    await fireDOMReady();
    expect(redirected).toMatch(/login\.html/);
  });
});

describe("report — URL prefill", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("targetType and valid targetId populate hidden inputs", async () => {
    loadReport({ search: "?targetType=experience&targetId=" + VALID_TARGET_ID });
    await fireDOMReady();
    expect(document.getElementById("reportTargetType").value).toBe("experience");
    expect(document.getElementById("reportTargetId").value).toBe(VALID_TARGET_ID);
  });

  test("invalid targetId (non-ObjectId) is rejected", async () => {
    loadReport({ search: "?targetType=experience&targetId=not-an-id" });
    await fireDOMReady();
    expect(document.getElementById("reportTargetId").value).toBe("");
  });

  test("pageUrl param sets return link", async () => {
    loadReport({ search: "?pageUrl=https%3A%2F%2Fexample.com%2Fexp%2F1" });
    await fireDOMReady();
    expect(document.getElementById("report-return-link").href).toContain("example.com/exp/1");
  });
});

describe("report — step 1 category selection", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clicking a category enables Next button", async () => {
    loadReport({});
    await fireDOMReady();
    const nextBtn = document.getElementById("report-next-1");
    expect(nextBtn.disabled).toBe(true);
    const safetyCard = document.querySelector('[data-report-category="safety"]');
    safetyCard.click();
    expect(nextBtn.disabled).toBe(false);
    expect(safetyCard.classList.contains("border-tsts-clay")).toBe(true);
  });

  test("clicking a different category clears the previous selection", async () => {
    loadReport({});
    await fireDOMReady();
    const safety = document.querySelector('[data-report-category="safety"]');
    const fraud = document.querySelector('[data-report-category="fraud"]');
    safety.click();
    expect(safety.classList.contains("border-tsts-clay")).toBe(true);
    fraud.click();
    expect(safety.classList.contains("border-tsts-clay")).toBe(false);
    expect(fraud.classList.contains("border-tsts-clay")).toBe(true);
  });

  test("Next without category selection shows alert and stays on step 1", async () => {
    loadReport({});
    await fireDOMReady();
    // simulate a click on a [data-report-nav=next] element WITHOUT a selected category
    // by manually firing the document delegate
    const nextBtn = document.getElementById("report-next-1");
    nextBtn.disabled = false; // force enable to test the inner guard
    nextBtn.click();
    const alert = document.getElementById("report-alert");
    expect(alert.classList.contains("hidden")).toBe(false);
    expect(alert.textContent).toMatch(/select a category/i);
    expect(document.getElementById("report-step-1").classList.contains("hidden")).toBe(false);
  });

  test("Next with selection advances to step 2", async () => {
    loadReport({});
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    expect(document.getElementById("report-step-2").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("report-step-1").classList.contains("hidden")).toBe(true);
  });

  test("Back from step 2 returns to step 1", async () => {
    loadReport({});
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("report-back-2").click();
    expect(document.getElementById("report-step-1").classList.contains("hidden")).toBe(false);
  });
});

describe("report — step 2 contact toggle + counter", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("selecting 'phone' un-hides the phone input", async () => {
    loadReport({});
    await fireDOMReady();
    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("reportPhone").classList.contains("hidden")).toBe(false);
  });

  test("switching back to 'email' hides the phone input", async () => {
    loadReport({});
    await fireDOMReady();
    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("reportPhone").classList.contains("hidden")).toBe(false);
    const emailRadio = document.querySelector('input[name="reportContact"][value="email"]');
    emailRadio.checked = true;
    emailRadio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("reportPhone").classList.contains("hidden")).toBe(true);
  });

  test("typing in message updates counter", async () => {
    loadReport({});
    await fireDOMReady();
    const msg = document.getElementById("reportMessage");
    msg.value = "hello";
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("report-msg-counter").textContent).toBe("5");
  });
});

describe("report — submit", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("submit with message < 10 chars shows alert", async () => {
    loadReport({ search: "?targetType=experience&targetId=" + VALID_TARGET_ID });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("reportMessage").value = "tiny";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(document.getElementById("report-alert").textContent).toMatch(/at least 10/i);
  });

  // Behaviour change 2026-08-21: opening this page with nothing to report about now says so at the
  // TOP, before a word is typed, instead of letting the reporter choose a category, write out what
  // happened, press Submit, and only then be told to go and find a different button. The footer
  // link that lands here sits on every page.
  // UPDATED 2026-08-22 TO THE NEW SPEC (sir: "i will not tolerate any feature gap"). This test used
  // to assert the DEAD END — that arriving with no target greeted the reporter with a red error
  // sending them somewhere else. That behaviour was the defect: a person with a concern about the
  // platform itself had nowhere to file it. The page now ASKS what the report is about, and both
  // answers lead somewhere. The assertion moves from "shows the refusal" to "asks the question".
  test("arriving with no target asks what it is about, instead of refusing", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    expect(document.getElementById("report-about").classList.contains("hidden")).toBe(false);
    // No red error before a single word has been typed.
    expect(document.getElementById("report-alert").classList.contains("hidden")).toBe(true);
  });

  // UPDATED 2026-08-22 TO THE NEW SPEC. Submitting with neither a target NOR a platform choice is
  // still refused — the gap is closed without letting a report through that is about nothing at
  // all — but the wording no longer sends the reporter away, because they can now continue here.
  test("submit with no target and no choice made is still refused, and sends nothing", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    let sent = 0;
    window.authFetch = async () => { sent += 1; return { ok: true, json: async () => ({ ok: true }) }; };
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("reportMessage").value = "this is a long enough message";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(sent).toBe(0);
    expect(document.getElementById("report-alert").textContent).toMatch(/what this report is about/i);
  });

  test("successful submit POSTs /api/moderation/report with normalised payload + advances to step 3", async () => {
    let captured = null;
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="inaccurate"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("reportMessage").value = "this is a long enough message";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(captured.url).toBe("/api/moderation/report");
    expect(captured.body.targetType).toBe("experience");
    expect(captured.body.targetId).toBe(VALID_TARGET_ID);
    expect(captured.body.category).toBe("other"); // inaccurate → other
    expect(captured.body.message).toMatch(/^\[Category: Inaccurate/);
    expect(document.getElementById("report-step-3").classList.contains("hidden")).toBe(false);
  });

  test("phone contact pref is appended to message", async () => {
    let captured = null;
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async (url, opts) => {
        captured = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("reportPhone").value = "0400000000";
    document.getElementById("reportMessage").value = "please contact me by phone";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(captured.message).toMatch(/Contact preference: phone, 0400000000/);
  });

  test("server error shows alert with server message", async () => {
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async () => ({ ok: false, status: 400, json: async () => ({ message: "BANNED_USER" }) }),
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("reportMessage").value = "this is a long enough message";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("report-alert").textContent).toMatch(/BANNED_USER/);
    // submit btn re-enabled in finally{}
    expect(document.getElementById("report-submit-btn").disabled).toBe(false);
  });

  test("network error shows generic alert", async () => {
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async () => { throw new Error("network down"); },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    document.getElementById("reportMessage").value = "this is a long enough message";
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("report-alert").textContent).toMatch(/network down/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM REPORTS — the feature gap sir refused to tolerate, 2026-08-22.
//
// The Report link sits in the footer of EVERY page. Arriving that way, nothing about a listing or
// a person comes in on the URL — and the page used to greet the reporter with an error telling
// them to go and find a different button. There was no way to report the platform itself, our
// policies, or anything not tied to one listing. Now the first question is what the report is
// about, and NEITHER answer is a dead end.
// ─────────────────────────────────────────────────────────────────────────────
describe("Report — arriving with nothing attached", () => {
  // Same contract every other block in this file uses: the addEventListener spy must be restored
  // before each load, or the next loadReport() binds origAdd to the previous MOCK and recurses.
  beforeEach(() => { vi.restoreAllMocks(); });

  test("asks what the report is about instead of showing an error", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    const about = document.getElementById("report-about");
    const cats = document.getElementById("report-categories-block");
    const alert = document.getElementById("report-alert");
    expect(about.classList.contains("hidden")).toBe(false);
    expect(cats.classList.contains("hidden")).toBe(true);
    // The old behaviour put a red error on screen before a word was typed.
    expect(alert.classList.contains("hidden")).toBe(true);
  });

  test("choosing 'the platform itself' opens the form as a platform report", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    document.querySelector("#report-about > [data-report-about='platform']").click();
    expect(document.getElementById("reportTargetType").value).toBe("platform");
    expect(document.getElementById("reportTargetId").value).toBe("");
    expect(document.getElementById("report-about").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("report-categories-block").classList.contains("hidden")).toBe(false);
  });

  test("choosing 'a particular experience or person' points there, and still offers a way through", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    document.querySelector("[data-report-about='specific']").click();
    const help = document.getElementById("report-about-specific-help");
    expect(help.classList.contains("hidden")).toBe(false);
    // Never a dead end: the reporter can still continue from inside that guidance.
    expect(help.querySelector("[data-report-about='platform']")).toBeTruthy();
  });

  test("a platform report submits — the journey that used to be impossible", async () => {
    loadReport({ search: "" });
    await fireDOMReady();
    document.querySelector("#report-about > [data-report-about='platform']").click();
    document.querySelector("[data-report-category='other']").click();

    const calls = [];
    window.authFetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ ok: true, data: { id: "r1" } }) };
    };
    document.getElementById("reportMessage").value = "The policy page does not explain host cancellations.";
    document.getElementById("report-submit-btn").click();
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toHaveLength(1);
    expect(calls[0].body.targetType).toBe("platform");
    expect(calls[0].body.targetId).toBe("");
    // It reached step 3 rather than being refused.
    expect(document.getElementById("report-step-3").classList.contains("hidden")).toBe(false);
  });

  test("arriving FROM a listing skips the question entirely", async () => {
    loadReport({ search: "?targetType=experience&targetId=" + VALID_TARGET_ID });
    await fireDOMReady();
    // The target is already known, so there is nothing to ask.
    expect(document.getElementById("report-about").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("report-categories-block").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("reportTargetId").value).toBe(VALID_TARGET_ID);
  });
});
