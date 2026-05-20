// REAL coverage for js/common.js — loads the actual production script
// into jsdom and exercises the window.tsts* helpers. No inline mocks.

import { describe, test, expect, beforeAll } from "vitest";
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
