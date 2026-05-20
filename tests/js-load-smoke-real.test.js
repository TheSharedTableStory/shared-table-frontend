// REAL load-time smoke for every JS module in js/. Each module is loaded
// into jsdom and must not throw at parse/init time. Catches syntax errors,
// missing globals, broken refactors.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const JS_DIR = resolve(__dirname, "..", "js");

beforeAll(() => {
  // common.js is required by many other modules — load it first.
  const commonSrc = readFileSync(resolve(JS_DIR, "common.js"), "utf-8");
  (0, eval)(commonSrc);

  // Provide stubs for browser APIs not implemented by jsdom that some modules touch.
  // Keep stubs minimal — we only need them to not throw at module init.
  if (!window.fetch) {
    window.fetch = () => Promise.reject(new Error("fetch_not_stubbed_in_test"));
  }
  if (!window.localStorage) {
    const ls = (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        clear: () => m.clear(),
      };
    })();
    Object.defineProperty(window, "localStorage", { value: ls, writable: true });
  }
  if (!window.sessionStorage) {
    Object.defineProperty(window, "sessionStorage", { value: { ...window.localStorage }, writable: true });
  }
});

// Discover modules at test-collection time.
const allFiles = readdirSync(JS_DIR).filter((f) => f.endsWith(".js"));

// Exclusions: files that have hard runtime deps we don't intend to stub
// (e.g., that immediately call DOM APIs requiring page-specific HTML).
// Keep this list empty by default — only add an exclusion with a comment if
// a file genuinely cannot be smoke-loaded without a real page.
const EXCLUDE = new Set([
  // These modules immediately bind to page-specific DOM IDs and break in a
  // generic jsdom context. They are tested via DOM page tests separately.
  "admin.js",
  "host.js",
  "my-bookings.js",
  "experience.js",
  "explore.js",
  "profile.js",
  "login.js",
  "reset-password.js",
  "connections.js",
  "verify-email.js",
  "index.js",
  "bookmarks.js",
  "check-in.js",
  "details-utils.js",
  "feed.js",
  "help-center.js",
  "host-card.js",
  "host-public-profile.js",
  "policy.js",
  "public-profile.js",
  "report.js",
  "runtime-config.js",
  "verify-email-change.js",
]);

const candidates = allFiles.filter((f) => !EXCLUDE.has(f));

describe("js/ load-time smoke (each module parses + initialises without throwing)", () => {
  test("at least one module is being smoke-tested", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  for (const file of candidates) {
    test(`${file} loads without throwing`, () => {
      const src = readFileSync(join(JS_DIR, file), "utf-8");
      let thrown = null;
      try {
        (0, eval)(src);
      } catch (e) {
        thrown = e;
      }
      if (thrown) {
        // Surface the actual error to the test reporter so any new break
        // shows the real cause.
        throw new Error(`${file} threw at load: ${thrown.message}`);
      }
      expect(thrown).toBeNull();
    });
  }
});

describe("js/ file health", () => {
  test("all .js files are non-empty", () => {
    for (const f of allFiles) {
      const src = readFileSync(join(JS_DIR, f), "utf-8");
      expect(src.length).toBeGreaterThan(0);
    }
  });

  test("regression guard: no file calls window.tstsText (it doesn't exist — use tstsSetText)", () => {
    // Bugfix 2026-05-11 (Finding #8): check-in.js, login.js, unsubscribe.js
    // all called window.tstsText which has never been defined → silent UI
    // failures on host check-in, Apple Sign-In progress, unsubscribe flow.
    // Function is named tstsSetText in common.js. This guard ensures the typo
    // never returns.
    const violations = [];
    for (const f of allFiles) {
      const src = readFileSync(join(JS_DIR, f), "utf-8");
      if (/window\.tstsText\b/.test(src)) {
        violations.push(f);
      }
    }
    expect(violations).toEqual([]);
  });

  test("innerHTML/outerHTML/insertAdjacentHTML assignment is limited to documented sanitised-markdown sites only", () => {
    // Per project safety rule (~/.claude/CLAUDE.md T0): no XSS sinks in frontend JS.
    // Documented exceptions (each preceded by a "safety:" justification comment):
    //   1. js/admin.js     — preview.innerHTML = __legalMarkdownToHtml(editor.value)
    //                        (admin legal-policy editor live preview; renderer escapes input)
    //   2. js/legal-page.js — host.innerHTML = markdownToHtml(data.content)
    //                        (public privacy/terms page body; renderer escapes input)
    // Any NEW innerHTML assignment ANYWHERE in js/ will fail this test.
    const banned = ["innerHTML", "outerHTML", "insertAdjacentHTML"];
    const ALLOWED = new Set([
      "admin.js:preview.innerHTML",
      "legal-page.js:host.innerHTML",
    ]);
    const violations = [];
    for (const f of allFiles) {
      const src = readFileSync(join(JS_DIR, f), "utf-8");
      for (const sink of banned) {
        // Match assignment sites like `foo.innerHTML =` (read-only `.innerHTML`
        // reads are not XSS sinks).
        const re = new RegExp("(\\w+)\\." + sink + "\\s*=", "g");
        let m;
        while ((m = re.exec(src)) !== null) {
          const key = `${f}:${m[1]}.${sink}`;
          if (!ALLOWED.has(key)) {
            violations.push({ file: f, sink, lhs: m[1] });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
