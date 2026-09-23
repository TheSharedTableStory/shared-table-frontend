// REAL coverage for js/common.js — loads the actual production script
// into jsdom and exercises the window.tsts* helpers. No inline mocks.

import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load common.js once into the jsdom global. common.js is written for the
// browser (attaches functions to `window`), so we just `eval` it with the
// window/document already provided by jsdom.
beforeAll(() => {
  const src = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
  // Execute in global scope so `window` refs resolve to jsdom's window.
  // eslint-disable-next-line no-eval
  (0, eval)(src);
});

describe("module load", () => {
  test("tstsEl is attached to window", () => {
    expect(typeof window.tstsEl).toBe("function");
  });
  test("tstsFormatDate is attached", () => {
    expect(typeof window.tstsFormatDate).toBe("function");
  });
  test("tstsSafeUrl is attached", () => {
    expect(typeof window.tstsSafeUrl).toBe("function");
  });
  test("tstsSafeMailto is attached", () => {
    expect(typeof window.tstsSafeMailto).toBe("function");
  });
  test("tstsUnwrap is attached", () => {
    expect(typeof window.tstsUnwrap).toBe("function");
  });
});

describe("tstsEl", () => {
  test("creates element with tag", () => {
    const el = window.tstsEl("div");
    expect(el.tagName).toBe("DIV");
  });

  test("applies className via attrs.className", () => {
    const el = window.tstsEl("span", { className: "foo bar" });
    expect(el.className).toBe("foo bar");
  });

  test("appends text child as text node", () => {
    const el = window.tstsEl("p", {}, ["Hello"]);
    expect(el.textContent).toBe("Hello");
  });

  test("appends element child", () => {
    const inner = window.tstsEl("span", {}, ["x"]);
    const outer = window.tstsEl("div", {}, [inner]);
    expect(outer.querySelector("span").textContent).toBe("x");
  });

  test("text content is escaped (no innerHTML)", () => {
    const el = window.tstsEl("p", {}, ['<script>alert(1)</script>']);
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toBe("<script>alert(1)</script>");
  });
});

describe("tstsSetText", () => {
  test("sets textContent on element", () => {
    const el = document.createElement("p");
    window.tstsSetText(el, "Hi Sofia");
    expect(el.textContent).toBe("Hi Sofia");
  });
  test("null value clears text", () => {
    const el = document.createElement("p");
    el.textContent = "x";
    window.tstsSetText(el, null);
    expect(el.textContent).toBe("");
  });
});

describe("tstsSafeUrl", () => {
  test("https url passes through", () => {
    expect(window.tstsSafeUrl("https://thesharedtablestory.com")).toBe("https://thesharedtablestory.com");
  });
  test("http url passes through", () => {
    expect(window.tstsSafeUrl("http://example.com")).toBe("http://example.com");
  });
  test("javascript: URL replaced with fallback", () => {
    expect(window.tstsSafeUrl("javascript:alert(1)", "#")).toBe("#");
  });
  test("data: URL replaced with fallback", () => {
    const r = window.tstsSafeUrl("data:text/html,<script>alert(1)</script>", "#");
    expect(r).toBe("#");
  });
  test("empty input → fallback", () => {
    expect(window.tstsSafeUrl("", "#")).toBe("#");
  });
});

describe("tstsSafeMailto", () => {
  test("valid email → mailto link", () => {
    expect(window.tstsSafeMailto("sofia@example.com")).toBe("mailto:sofia@example.com");
  });
  test("invalid email → empty / placeholder", () => {
    const r = window.tstsSafeMailto("not an email");
    expect(r).not.toContain("not an email");
  });
});

describe("tstsFormatDate (Australia/Melbourne, en-AU)", () => {
  test("ISO date renders day-of-week + day month year", () => {
    const out = window.tstsFormatDate("2026-05-11T12:00:00Z");
    // Expect something like "Monday, 11 May 2026" or similar
    expect(out).toMatch(/\b\d{1,2}\b/);
    expect(out).toMatch(/\b2026\b/);
  });
  test("empty input returns empty string", () => {
    expect(window.tstsFormatDate("")).toBe("");
    expect(window.tstsFormatDate(null)).toBe("");
  });
  test("invalid date string returns the string itself", () => {
    expect(window.tstsFormatDate("not a date")).toBe("not a date");
  });
});

describe("tstsFormatDateShort", () => {
  test("renders without weekday", () => {
    const out = window.tstsFormatDateShort("2026-05-11T12:00:00Z");
    expect(out).toMatch(/2026/);
    // Day-of-week names should NOT appear in short format
    expect(out).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
  });
});

describe("tstsFormatDateTime", () => {
  test("includes a bullet separator and time", () => {
    const out = window.tstsFormatDateTime("2026-05-11T08:30:00Z");
    expect(out).toContain("•"); // bullet
  });
});

describe("tstsUnwrap (api response envelope)", () => {
  test("returns .data when ok:true with data", () => {
    expect(window.tstsUnwrap({ ok: true, data: { x: 1 } })).toEqual({ x: 1 });
  });
  test("returns object as-is when no envelope shape", () => {
    const obj = { x: 1, y: 2 };
    expect(window.tstsUnwrap(obj)).toEqual(obj);
  });
  test("null passthrough", () => {
    expect(window.tstsUnwrap(null)).toBe(null);
  });
});

describe("tstsSafeImg", () => {
  test("sets src to url when provided", () => {
    const img = document.createElement("img");
    window.tstsSafeImg(img, "https://example.com/x.jpg", "https://fallback.com/x.jpg");
    expect(img.src).toBe("https://example.com/x.jpg");
  });
  test("falls back when url empty", () => {
    const img = document.createElement("img");
    window.tstsSafeImg(img, "", "https://fallback.com/x.jpg");
    expect(img.src).toBe("https://fallback.com/x.jpg");
  });
});

// Cookie banner rebuild, 2026-08-23 (sir's go-ahead, approval-log entry same date): real
// per-category consent replacing the old single accepted/not-accepted flag.
describe("tstsGetCookieConsent", () => {
  beforeEach(() => { localStorage.clear(); });

  test("returns null when nothing stored", () => {
    expect(window.tstsGetCookieConsent()).toBeNull();
  });

  test("returns null for a legacy bare-string value (not a real category choice)", () => {
    localStorage.setItem("tsts_cookie_consent", "all");
    expect(window.tstsGetCookieConsent()).toBeNull();
  });

  test("returns the parsed object for a valid consent record", () => {
    localStorage.setItem("tsts_cookie_consent", JSON.stringify({ necessary: true, functional: false, analytics: true, ts: "2026-08-23T00:00:00.000Z" }));
    const consent = window.tstsGetCookieConsent();
    expect(consent).toEqual({ necessary: true, functional: false, analytics: true, ts: "2026-08-23T00:00:00.000Z" });
  });

  test("returns null for an object missing necessary:true (malformed record)", () => {
    localStorage.setItem("tsts_cookie_consent", JSON.stringify({ functional: true, analytics: true }));
    expect(window.tstsGetCookieConsent()).toBeNull();
  });
});

describe("injectCookieBanner — real DOM interaction, every branch", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.body.style.paddingBottom = "";
  });

  function getBannerButtons() {
    // The banner is the only fixed-position bar this function appends directly to <body>.
    return Array.from(document.querySelectorAll("body > div button"));
  }

  test("renders all four real choices when no consent is stored", () => {
    globalThis.injectCookieBanner();
    const labels = getBannerButtons().map((b) => b.textContent);
    expect(labels).toEqual(["Adjust", "Decline All", "Accept All", "×"]);
  });

  test("does not render again when a valid consent record already exists", () => {
    localStorage.setItem("tsts_cookie_consent", JSON.stringify({ necessary: true, functional: true, analytics: true }));
    globalThis.injectCookieBanner();
    expect(document.querySelectorAll("body > div").length).toBe(0);
  });

  test("Accept All sets every category true", () => {
    globalThis.injectCookieBanner();
    const btn = getBannerButtons().find((b) => b.textContent === "Accept All");
    btn.click();
    expect(window.tstsGetCookieConsent()).toMatchObject({ necessary: true, functional: true, analytics: true });
  });

  test("Decline All keeps Necessary on, turns everything else off", () => {
    globalThis.injectCookieBanner();
    const btn = getBannerButtons().find((b) => b.textContent === "Decline All");
    btn.click();
    expect(window.tstsGetCookieConsent()).toMatchObject({ necessary: true, functional: false, analytics: false });
  });

  test("× (dismiss) still means accepted — sir's 2026-08-09 ruling, unchanged by this rebuild", () => {
    globalThis.injectCookieBanner();
    const btn = getBannerButtons().find((b) => b.textContent === "×");
    btn.click();
    expect(window.tstsGetCookieConsent()).toMatchObject({ necessary: true, functional: true, analytics: true });
  });

  test("Adjust reveals per-category toggles with Necessary locked, Save records exactly what was toggled", () => {
    globalThis.injectCookieBanner();
    getBannerButtons().find((b) => b.textContent === "Adjust").click();

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2); // Functional, Analytics — Necessary has no toggle, it's locked on
    checkboxes[1].click(); // turn Analytics on, leave Functional off

    const saveBtn = document.querySelector('[data-action="save"]');
    expect(saveBtn.textContent).toBe("Save Preferences");
    saveBtn.click();

    expect(window.tstsGetCookieConsent()).toMatchObject({ necessary: true, functional: false, analytics: true });
  });

  test("Adjust → Back returns to the three-choice view without recording anything", () => {
    globalThis.injectCookieBanner();
    getBannerButtons().find((b) => b.textContent === "Adjust").click();
    document.querySelector('[data-action="back"]').click();
    const labels = getBannerButtons().map((b) => b.textContent);
    expect(labels).toEqual(["Adjust", "Decline All", "Accept All", "×"]);
    expect(window.tstsGetCookieConsent()).toBeNull();
  });
});

describe("__trackAnalytics — gated on real Analytics consent (2026-08-23)", () => {
  const realFetch = window.fetch;

  beforeEach(() => {
    localStorage.clear();
    window.API_BASE = "https://api.example.com";
    window.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });

  afterEach(() => {
    window.fetch = realFetch;
  });

  test("does not call fetch when no consent is stored", () => {
    window.__trackAnalytics("explore:view", "engagement", {});
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test("does not call fetch when consent exists but analytics is false", () => {
    localStorage.setItem("tsts_cookie_consent", JSON.stringify({ necessary: true, functional: true, analytics: false }));
    window.__trackAnalytics("explore:view", "engagement", {});
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test("calls fetch when analytics consent is true", () => {
    localStorage.setItem("tsts_cookie_consent", JSON.stringify({ necessary: true, functional: false, analytics: true }));
    window.__trackAnalytics("explore:view", "engagement", { resultCount: 3 });
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(window.fetch.mock.calls[0][0]).toBe("https://api.example.com/api/analytics/track");
  });
});
