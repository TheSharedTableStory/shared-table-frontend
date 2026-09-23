// REAL coverage for the phone-width admin menu button: the markup in admin.html and the
// handler in js/admin.js, both loaded from disk, driven by real click and key events.
//
// The gap this pins down (sir's decision 2026-09-13, "fix it using agent"): the round button
// sat at the bottom-left corner and never changed, so once the menu panel opened the button
// stayed on top of the open panel still showing the open-menu icon. The button now says and
// shows what it does, and steps past the panel's right edge while the panel is open.
//
// admin.js is not wrapped in an IIFE, so evaluating it at the global scope makes its
// top-level functions global, exactly as tests/admin-real.test.js does. The real
// admin.html body markup is put into the document and the page's own <style> block is
// injected, so the offset rule under test is the page's rule, not one written here.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_JS = readFileSync(resolve(__dirname, "..", "js", "admin.js"), "utf-8");
const ADMIN_HTML = readFileSync(resolve(__dirname, "..", "admin.html"), "utf-8");

function adminBodyMarkup() {
  const bodyTag = ADMIN_HTML.indexOf("<body");
  const start = ADMIN_HTML.indexOf(">", bodyTag) + 1;
  const end = ADMIN_HTML.lastIndexOf("</body>");
  return ADMIN_HTML.slice(start, end);
}

function adminPageStyle() {
  const start = ADMIN_HTML.indexOf("<style>") + "<style>".length;
  const end = ADMIN_HTML.indexOf("</style>", start);
  return ADMIN_HTML.slice(start, end);
}

let pageStyleEl = null;

function bootAdminPage() {
  document.head.innerHTML = "";
  document.body.innerHTML = adminBodyMarkup();
  pageStyleEl = document.createElement("style");
  pageStyleEl.textContent = adminPageStyle();
  document.head.appendChild(pageStyleEl);

  Object.defineProperty(window, "location", {
    value: {
      pathname: "/admin.html",
      search: "",
      get href() { return ""; },
      set href(v) { void v; },
    },
    writable: true, configurable: true,
  });

  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsHydrateNavAuth = vi.fn();
  window.tstsNotify = vi.fn();
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (Array.isArray(kids)) kids.forEach((k) => { if (k) el.append(typeof k === "string" ? document.createTextNode(k) : k); });
    else if (kids && typeof kids === "string") el.textContent = kids;
    return el;
  };
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(ADMIN_JS);
  } catch (eEval) {
    // tolerated exactly as in tests/admin-real.test.js: deep init paths can hit missing
    // state in jsdom; the wiring function under test is hoisted before any of that runs.
    void eEval;
  }
  globalThis.wireAdminEvents();
}

const button = () => document.getElementById("admin-sidebar-toggle");
const buttonWrap = () => document.getElementById("admin-sidebar-toggle-wrap");
const panel = () => document.getElementById("admin-sidebar");
const buttonIcon = () => button().querySelector("i");

function tap(el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}
function pressEscape() {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function expectClosed() {
  expect(panel().classList.contains("hidden")).toBe(true);
  expect(panel().classList.contains("fixed")).toBe(false);
  expect(button().getAttribute("aria-label")).toBe("Open menu");
  expect(buttonIcon().classList.contains("fa-bars")).toBe(true);
  expect(buttonIcon().classList.contains("fa-times")).toBe(false);
  expect(buttonWrap().classList.contains("admin-menu-open")).toBe(false);
  expect(buttonWrap().classList.contains("left-4")).toBe(true);
}

function expectOpen() {
  expect(panel().classList.contains("hidden")).toBe(false);
  ["fixed", "inset-0", "z-40", "flex"].forEach((c) => expect(panel().classList.contains(c)).toBe(true));
  expect(button().getAttribute("aria-label")).toBe("Close menu");
  expect(buttonIcon().classList.contains("fa-times")).toBe(true);
  expect(buttonIcon().classList.contains("fa-bars")).toBe(false);
  expect(buttonWrap().classList.contains("admin-menu-open")).toBe(true);
}

describe("admin phone-width menu button: opening", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the page starts closed: the button says Open menu and carries the open-menu icon", () => {
    bootAdminPage();
    expectClosed();
  });

  test("tapping the button opens the panel, and the button reads Close menu with the close icon and the offset class", () => {
    bootAdminPage();
    tap(button());
    expectOpen();
  });
});

describe("admin phone-width menu button: closing", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("tapping the button again closes the panel and restores the button", () => {
    bootAdminPage();
    tap(button());
    expectOpen();
    tap(button());
    expectClosed();
  });

  test("tapping outside the panel closes it and restores the button", () => {
    bootAdminPage();
    tap(button());
    expectOpen();
    tap(document.getElementById("view-dashboard"));
    expectClosed();
  });

  test("pressing Escape closes the panel and restores the button", () => {
    bootAdminPage();
    tap(button());
    expectOpen();
    pressEscape();
    expectClosed();
  });

  test("tapping a menu item inside the panel leaves the panel open", () => {
    bootAdminPage();
    tap(button());
    expectOpen();
    tap(document.getElementById("tab-users"));
    expectOpen();
  });

  test("Escape with the panel already closed changes nothing", () => {
    bootAdminPage();
    expectClosed();
    pressEscape();
    expectClosed();
  });
});

describe("admin phone-width menu button: where it sits, and desktop", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the open-state offset is the page's own rule: 208px, the 192px panel plus the same 16px margin", () => {
    bootAdminPage();
    const rules = Array.from(pageStyleEl.sheet.cssRules);
    const offsetRule = rules.find((r) => r.selectorText === "#admin-sidebar-toggle-wrap.admin-menu-open");
    expect(offsetRule).toBeTruthy();
    expect(offsetRule.style.left).toBe("208px");
    expect(panel().classList.contains("w-48")).toBe(true);   // the panel is 192px wide
    expect(buttonWrap().classList.contains("left-4")).toBe(true); // the 16px margin it returns to
  });

  test("at desktop width none of this applies: the button keeps the class that hides it, and the panel keeps its desktop classes through open and close", () => {
    bootAdminPage();
    const desktopIntact = () => {
      expect(buttonWrap().classList.contains("lg:hidden")).toBe(true);
      expect(panel().classList.contains("lg:flex")).toBe(true);
      expect(panel().classList.contains("w-48")).toBe(true);
    };
    desktopIntact();
    tap(button());
    desktopIntact();
    tap(button());
    desktopIntact();
  });
});
