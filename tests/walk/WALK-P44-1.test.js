// WALK-P44-1: a reporter's requested phone callback number could be silently dropped from what an
// administrator reads. js/report.js used to append the contact note, and separately prepend the
// category tag, AFTER the box had already let the person type up to the platform's whole
// 2,000-character budget, so the combined text went over and the server's own safety-net trim cut
// the tail: exactly the phone number, with no warning.
//
// RESERVING ROOM IS ONLY HALF THE FIX. Fitting the description into what is left moves the silent
// loss onto the reporter's own words, which is worse, and the screen still promised 2,000 either
// way. Nothing is cut now and nothing is promised that is not true: the tag and the note are
// measured first, whatever is left is the real budget, the counter and the box both show THAT
// number, and a description that will not fit is refused with a sentence saying by how much,
// rather than trimmed behind the person's back.
//
// This suite reuses the same real-source, real-DOM harness as tests/report-real.test.js (loads
// the actual js/report.js via new Function(SRC), a real jsdom DOM built the same way, authFetch
// captured) rather than a copy of the logic written inside the test.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "..", "js", "report.js"), "utf-8");

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
    <span id="report-msg-total">2000</span>
    <input id="reportPhone" class="hidden" />
    <button id="report-submit-btn" data-report-nav="submit">Submit report</button>
    <button id="report-next-1" disabled data-report-nav="next">Next</button>
    <button id="report-back-2" data-report-nav="prev">Back</button>

    <div id="report-step-1">
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
const __registeredHandlers = [];

function cleanupDocHandlers() {
  while (__registeredHandlers.length) {
    const reg = __registeredHandlers.pop();
    try { document.removeEventListener(reg.event, reg.handler); } catch (err) { /* already detached */ }
  }
}

function loadReport(opts) {
  opts = opts || {};
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

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "u1" } }));

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

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.scrollTo = () => {};

  new Function(SRC)();
}

async function fireDOMReady() {
  if (typeof __capturedDOMHandler === "function") await __capturedDOMHandler();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const VALID_TARGET_ID = "507f1f77bcf86cd799439011";
const MESSAGE_CAP = 2000;

describe("WALK-P44-1: report submit never lets the contact suffix be the part that is cut", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("choosing a phone callback shrinks the stated budget and the box's own limit, on screen, before anything is typed", async () => {
    loadReport({ search: "?targetType=experience&targetId=" + VALID_TARGET_ID });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();

    // nothing reserved yet: the whole budget is the person's own
    expect(Number(document.getElementById("report-msg-total").textContent)).toBe(MESSAGE_CAP);
    expect(document.getElementById("reportMessage").maxLength).toBe(MESSAGE_CAP);

    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    const phone = document.getElementById("reportPhone");
    phone.value = "0400111222";
    phone.dispatchEvent(new Event("input", { bubbles: true }));

    const suffixLen = ("\n\n[Contact preference: phone, 0400111222]").length;
    const expected = MESSAGE_CAP - suffixLen;
    expect(Number(document.getElementById("report-msg-total").textContent)).toBe(expected);
    expect(document.getElementById("reportMessage").maxLength).toBe(expected);
  });

  test("a description that fills the real budget is sent whole, phone number and all", async () => {
    let captured = null;
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();

    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("reportPhone").value = "0400111222";

    document.getElementById("reportPhone").dispatchEvent(new Event("input", { bubbles: true }));
    const room = Number(document.getElementById("report-msg-total").textContent);
    const body = "x".repeat(room);
    document.getElementById("reportMessage").value = body;
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(captured).not.toBeNull();
    expect(captured.body.message.length).toBe(MESSAGE_CAP);
    expect(captured.body.message).toMatch(/Contact preference: phone, 0400111222/);
    // and not one character of what the person wrote is missing
    expect(captured.body.message.indexOf(body)).toBe(0);
  });

  test("a description one character over the real budget is refused with a sentence, and nothing is sent", async () => {
    let captured = null;
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    const phone = document.getElementById("reportPhone");
    phone.value = "0400111222";
    phone.dispatchEvent(new Event("input", { bubbles: true }));

    const room = Number(document.getElementById("report-msg-total").textContent);
    document.getElementById("reportMessage").value = "z".repeat(room + 1);
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // nothing was sent, and nothing was trimmed behind the person's back
    expect(captured).toBeNull();
    const alertEl = document.getElementById("report-alert");
    expect(alertEl.className).not.toMatch(/hidden/);
    expect(alertEl.textContent).toMatch(/room for /);
    expect(alertEl.textContent).toMatch(/shorten it by 1 characters/);
  });

  test("a description that fills the real budget with BOTH the category tag and a phone note keeps all three", async () => {
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

    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("reportPhone").value = "0400111222";

    document.getElementById("reportPhone").dispatchEvent(new Event("input", { bubbles: true }));
    const room2 = Number(document.getElementById("report-msg-total").textContent);
    document.getElementById("reportMessage").value = "y".repeat(room2);
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(captured).not.toBeNull();
    expect(captured.body.message.length).toBe(MESSAGE_CAP);
    expect(captured.body.message).toMatch(/^\[Category: Inaccurate/);
    expect(captured.body.message).toMatch(/Contact preference: phone, 0400111222/);
  });

  test("a person who chose the category and gave no number is told about the tag, and never about a phone", async () => {
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

    const room = Number(document.getElementById("report-msg-total").textContent);
    expect(room).toBeLessThan(MESSAGE_CAP);
    document.getElementById("reportMessage").value = "z".repeat(room + 1);
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(captured).toBeNull();
    const alertEl = document.getElementById("report-alert");
    expect(alertEl.textContent).toMatch(/The category tag is sent with this report/);
    expect(alertEl.textContent.toLowerCase()).not.toMatch(/phone/);
  });

  test("a person who gave only a number is told about the number, and never about a tag", async () => {
    let captured = null;
    loadReport({
      search: "?targetType=experience&targetId=" + VALID_TARGET_ID,
      authFetch: async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    await fireDOMReady();
    document.querySelector('[data-report-category="safety"]').click();
    document.getElementById("report-next-1").click();
    const phoneRadio = document.querySelector('input[name="reportContact"][value="phone"]');
    phoneRadio.checked = true;
    phoneRadio.dispatchEvent(new Event("change", { bubbles: true }));
    const phone = document.getElementById("reportPhone");
    phone.value = "0400111222";
    phone.dispatchEvent(new Event("input", { bubbles: true }));

    const room = Number(document.getElementById("report-msg-total").textContent);
    document.getElementById("reportMessage").value = "z".repeat(room + 1);
    document.getElementById("report-submit-btn").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(captured).toBeNull();
    const alertEl = document.getElementById("report-alert");
    expect(alertEl.textContent).toMatch(/Your phone number is sent with this report/);
    expect(alertEl.textContent.toLowerCase()).not.toMatch(/category tag/);
  });

  test("no regression: a short message with a phone preference still carries the number (existing behavior)", async () => {
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
});
