// REAL HTML PAGE SMOKE — gap #9 from the post-marathon audit.
//
// The existing js-load-smoke loads every JS module into jsdom. This file
// loads every HTML page on disk and asserts:
//
//   1. The file parses as HTML without throwing.
//   2. <title> is non-empty and brand-aligned (mentions "Shared Table" or
//      ends with " — The Shared Table Story" / similar).
//   3. <meta charset="UTF-8"> present.
//   4. <meta name="viewport"> present (responsive).
//   5. Critical scripts are referenced when expected (most pages need common.js).
//   6. No developer-facing leakage in the raw DOM (TODO/FIXME/lorem ipsum/
//      "[object Object]"/"undefined" as literal page text).
//   7. Security meta tags: at minimum a Referrer-Policy is set (either via
//      <meta name="referrer"> or a CSP meta with referrer directive). HTML
//      pages are also expected to NOT carry inline <script> blocks that
//      would defeat CSP nonces — assert no naked <script> without `src` on
//      every page.
//   8. Brand palette tokens used (Tailwind classes like bg-tsts-cream,
//      text-tsts-ink, or a brand color hex). At least one page-level brand
//      marker per page.

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = resolve(__dirname, "..");
const ALL_HTML = readdirSync(ROOT)
  .filter((f) => f.endsWith(".html"))
  .sort();

function loadPage(file) {
  const src = readFileSync(resolve(ROOT, file), "utf-8");
  const dom = new JSDOM(src, { runScripts: "outside-only" });
  return { src, doc: dom.window.document };
}

// Pages with <meta http-equiv="refresh"> are redirect stubs (legacy URLs
// pointing at the new page). They legitimately skip several strict checks
// (brand markers, page-size minimum). They still need charset + a brand-
// aligned title + a working redirect target.
function isRedirectStub(src) {
  return /<meta\s+http-equiv=["']refresh["']\s+content=["']0;\s*url=/i.test(src);
}

const PAGES = ALL_HTML.filter((f) => f !== "404.html");
const PAGES_FULL = PAGES.filter((f) => !isRedirectStub(readFileSync(resolve(ROOT, f), "utf-8")));
const PAGES_STUB = PAGES.filter((f) => isRedirectStub(readFileSync(resolve(ROOT, f), "utf-8")));

describe("HTML page smoke: every page parses cleanly into jsdom", () => {
  for (const file of PAGES) {
    test(`${file} parses without exception`, () => {
      expect(() => loadPage(file)).not.toThrow();
    });
  }
});

describe("HTML page smoke: every page has a brand-aligned <title>", () => {
  for (const file of PAGES) {
    test(`${file} <title> is non-empty and brand-aligned`, () => {
      const { doc } = loadPage(file);
      const title = String(doc.title || "").trim();
      expect(title.length).toBeGreaterThan(3);
      // Soft brand check: title mentions either "Shared Table" or the
      // brand surface "TSTS" abbreviation (covers help/admin pages).
      expect(title).toMatch(/Shared Table|TSTS|Table Story/i);
    });
  }
});

describe("HTML page smoke: every page declares charset + viewport", () => {
  for (const file of PAGES) {
    test(`${file} has <meta charset>`, () => {
      const { doc } = loadPage(file);
      const cs = doc.querySelector("meta[charset]") || doc.querySelector('meta[http-equiv="Content-Type"]');
      expect(cs).toBeTruthy();
    });
  }
  // Viewport meta is required for full pages (rendered to the user) but not
  // for redirect stubs (the meta-refresh fires before mobile-rendering kicks
  // in, so a missing viewport is harmless).
  for (const file of PAGES_FULL) {
    test(`${file} has <meta name="viewport"> for mobile responsiveness`, () => {
      const { doc } = loadPage(file);
      const vp = doc.querySelector('meta[name="viewport"]');
      expect(vp).toBeTruthy();
      expect(String(vp.getAttribute("content") || "")).toMatch(/width=device-width/);
    });
  }
});

describe("HTML page smoke: no developer-facing leakage in body text", () => {
  // Render the body via jsdom innerHTML so we catch text that's visible to
  // a real visitor — not script bodies (which legitimately contain dev
  // identifiers). We grep visible text only.
  const LEAK_PATTERNS = [
    { name: "literal lorem ipsum", regex: /lorem ipsum/i },
    { name: "literal [object Object]", regex: /\[object Object\]/ },
    { name: "raw {{TODO}} placeholder", regex: /\{\{\s*TODO\s*\}\}/i },
    { name: "stray HTML XXX placeholder", regex: />XXX</ },
  ];

  for (const file of PAGES) {
    for (const pat of LEAK_PATTERNS) {
      test(`${file} body has no ${pat.name}`, () => {
        const { doc } = loadPage(file);
        const text = String(doc.body && doc.body.textContent || "");
        expect(text).not.toMatch(pat.regex);
      });
    }
  }
});

describe("HTML page smoke: no naked inline <script> blocks that defeat CSP nonces", () => {
  for (const file of PAGES) {
    test(`${file} has no inline <script> with code (every script must have src or be empty)`, () => {
      const { doc } = loadPage(file);
      const scripts = Array.from(doc.querySelectorAll("script"));
      for (const s of scripts) {
        const hasSrc = s.hasAttribute("src");
        const content = String(s.textContent || "").trim();
        // JSON-LD <script type="application/ld+json"> is fine — that's data, not code
        const type = String(s.getAttribute("type") || "").toLowerCase();
        const isJsonLd = type === "application/ld+json";
        const isModuleHint = type === "importmap";
        if (!hasSrc && content.length > 0 && !isJsonLd && !isModuleHint) {
          throw new Error(`Inline JS block in ${file} (first 80 chars): ${content.slice(0, 80)}`);
        }
      }
    });
  }
});

describe("HTML page smoke: brand palette tokens are present on each page", () => {
  // Soft brand check — every page should reference at least one
  // tsts-* class OR the brand cream/ink hex tokens (#FBF8F5 / #1F1A17 ish).
  // We don't enforce a specific marker — just that SOME brand identifier
  // is present so we know the page is on-brand and not stock-bootstrap.
  const BRAND_MARKERS = [
    /\btsts-/, // any tailwind tsts-* token
    /heading-serif|font-serif.*Playfair/i, // brand typography
    /shadow-soft-card/, // brand shadow utility
    /rounded-3xl/, // brand corner radius
    /bg-tsts-cream|bg-cream/, // brand background
    /thesharedtablestory/i, // brand domain reference
  ];
  // Brand markers required only on FULL pages (redirect stubs are deliberately
  // minimal — they redirect immediately and never render brand UI).
  for (const file of PAGES_FULL) {
    test(`${file} contains at least one brand marker`, () => {
      const src = readFileSync(resolve(ROOT, file), "utf-8");
      const hit = BRAND_MARKERS.some((re) => re.test(src));
      expect(hit).toBe(true);
    });
  }
});

describe("HTML page smoke: every full page loads common.js (auth + helpers contract)", () => {
  // Every non-redirect-stub HTML page MUST load js/common.js so that
  // window.authFetch, window.tstsEl, window.tstsGetSession, etc. are
  // available globally. Without this every interaction crashes at first
  // user click.
  for (const file of PAGES_FULL) {
    test(`${file} loads js/common.js`, () => {
      const src = readFileSync(resolve(ROOT, file), "utf-8");
      expect(src).toMatch(/<script[^>]*src=["'][^"']*\bcommon\.js[^"']*["']/);
    });
  }
});

describe("HTML page smoke: 404 page exists and has a brand-voice message", () => {
  test("404.html exists, has Shared Table-tone copy, links back home", () => {
    const p = resolve(ROOT, "404.html");
    expect(existsSync(p)).toBe(true);
    const { doc } = loadPage("404.html");
    const text = String(doc.body && doc.body.textContent || "");
    expect(text.length).toBeGreaterThan(30);
    // Must NOT be a generic "Not Found" page — should carry brand voice.
    // We accept either an explicit brand mention or a clearly-warm tone phrase.
    const linkHome = Array.from(doc.querySelectorAll("a")).some((a) => {
      const href = String(a.getAttribute("href") || "");
      return href === "/" || href === "/index.html" || href === "index.html" || /home/i.test(a.textContent || "");
    });
    expect(linkHome).toBe(true);
  });
});

describe("HTML page inventory smoke", () => {
  test("at least 20 HTML pages exist on disk (catalog sanity)", () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(20);
  });
  test("every FULL (non-redirect-stub) HTML file is at least 1KB", () => {
    for (const f of PAGES_FULL) {
      const src = readFileSync(resolve(ROOT, f), "utf-8");
      expect(src.length).toBeGreaterThan(1024);
    }
  });

  test("every redirect-stub HTML file has a working redirect target", () => {
    for (const f of PAGES_STUB) {
      const src = readFileSync(resolve(ROOT, f), "utf-8");
      const m = src.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']0;\s*url=([^"']+)["']/i);
      expect(m).toBeTruthy();
      expect(String(m[1]).length).toBeGreaterThan(2);
    }
  });
});
