// REAL coverage for js/legal-page.js — privacy/terms renderer:
// markdownToHtml inline + block rules (escape, **bold**, *em*, `code`,
// [link](url), # h1..h6, lists, hr), loadAndRender fetch happy path,
// fetch failure shows error, body[data-legal-type] gating.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "legal-page.js"), "utf-8");

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

function loadLegal(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  document.body.innerHTML = `
    <div id="legal-content-host"></div>
    <p id="legal-meta"></p>
  `;
  document.body.setAttribute("data-legal-type", opts.type || "privacy");

  // Force readyState to "loading" so the script registers a DOMContentLoaded
  // listener (and we can fire it manually).
  Object.defineProperty(document, "readyState", { value: "loading", configurable: true });

  Object.defineProperty(window, "location", {
    value: { hostname: opts.hostname || "thesharedtablestory.com" },
    writable: true, configurable: true,
  });
  window.__TSTS_RUNTIME__ = opts.runtime || null;

  globalThis.fetch = opts.fetch || (async () => ({ json: async () => ({}) }));

  __domHandlers = [];
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { __domHandlers.push(handler); return; }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  // delete previously-set marker so the IIFE binds fresh
  delete window.__tstsLegalRender;
  new Function(SRC)();
}

async function fireDOMReady() {
  for (const h of __domHandlers) {
    try { await h(); } catch (e) { /* ignore */ }
  }
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

describe("legal-page — markdownToHtml", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("escapes <, >, & in plain paragraphs (XSS guard)", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("Beware <script>alert(1)</script> & co.");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
  });

  test("bold **x**, italic *y*, code `z` render to <strong>/<em>/<code>", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("**bold** and *em* and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<code>code</code>");
  });

  test("[text](https://x.com) renders link with rel=noopener noreferrer target=_blank", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("See [our site](https://thesharedtablestory.com) here.");
    expect(html).toContain('href="https://thesharedtablestory.com"');
    expect(html).toContain('rel="noopener noreferrer"'); // BUG-174 (runtime-verified 2026-05-20): legal links emit noopener+noreferrer
    expect(html).toContain('target="_blank"');
  });

  test("[text](javascript:alert(1)) is sanitised to href=#", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("evil [click](javascript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });

  test("# / ## / ### produce <h1>/<h2>/<h3>", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("# Title\n\n## Section\n\n### Sub");
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>Section<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Sub<\/h3>/);
  });

  test("- list items become <ul><li>; 1. items become <ol><li>", async () => {
    loadLegal({});
    await fireDOMReady();
    const ul = window.__tstsLegalRender("- a\n- b");
    const ol = window.__tstsLegalRender("1. one\n2. two");
    expect(ul).toMatch(/<ul[^>]*>/);
    expect(ul).toContain("<li>a</li>");
    expect(ul).toContain("<li>b</li>");
    expect(ol).toMatch(/<ol[^>]*>/);
    expect(ol).toContain("<li>one</li>");
    expect(ol).toContain("<li>two</li>");
  });

  test("--- becomes <hr>", async () => {
    loadLegal({});
    await fireDOMReady();
    const html = window.__tstsLegalRender("para\n\n---\n\nmore");
    expect(html).toMatch(/<hr[^>]*>/);
  });

  test("empty input returns empty string", async () => {
    loadLegal({});
    await fireDOMReady();
    expect(window.__tstsLegalRender("")).toBe("");
    expect(window.__tstsLegalRender(null)).toBe("");
    expect(window.__tstsLegalRender(undefined)).toBe("");
  });
});

describe("legal-page — loadAndRender", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("data-legal-type=privacy → fetch /api/legal/privacy and render content", async () => {
    let fetchedUrl = "";
    loadLegal({
      type: "privacy",
      fetch: async (url) => {
        fetchedUrl = url;
        return { json: async () => ({ ok: true, data: { content: "# Privacy Policy\n\nHi", version: "2026.05.01-1", publishedAt: "2026-05-01" } }) };
      },
    });
    await fireDOMReady();
    expect(fetchedUrl).toContain("/api/legal/privacy");
    const host = document.getElementById("legal-content-host");
    expect(host.innerHTML).toContain("<h1");
    expect(host.innerHTML).toContain("Privacy Policy");
    expect(document.getElementById("legal-meta").textContent).toMatch(/v2026\.05\.01-1 · Effective \d/); // POLICY-006 format: v{version} · Effective {date}
  });

  test("data-legal-type=terms → fetch /api/legal/terms", async () => {
    let fetchedUrl = "";
    loadLegal({
      type: "terms",
      fetch: async (url) => {
        fetchedUrl = url;
        return { json: async () => ({ ok: true, data: { content: "Terms" } }) };
      },
    });
    await fireDOMReady();
    expect(fetchedUrl).toContain("/api/legal/terms");
  });

  test("invalid data-legal-type → host left untouched", async () => {
    let fetched = false;
    loadLegal({
      type: "garbage",
      fetch: async () => { fetched = true; return { json: async () => ({}) }; },
    });
    await fireDOMReady();
    expect(fetched).toBe(false);
  });

  test("empty content from backend → falls into error path", async () => {
    loadLegal({
      type: "privacy",
      fetch: async () => ({ json: async () => ({ ok: true, data: { content: "" } }) }),
    });
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    expect(host.querySelector("p.text-rose-600")).toBeTruthy();
    expect(host.textContent).toMatch(/Could not load/);
  });

  test("fetch reject → error message rendered, meta cleared", async () => {
    loadLegal({
      type: "privacy",
      fetch: async () => { throw new Error("network"); },
    });
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    expect(host.querySelector("p.text-rose-600")).toBeTruthy();
    expect(document.getElementById("legal-meta").textContent).toBe("");
  });

  test("__TSTS_RUNTIME__.apiBase override is used", async () => {
    let fetchedUrl = "";
    loadLegal({
      type: "privacy",
      runtime: { apiBase: "https://staging.api.example.com/" },
      fetch: async (url) => {
        fetchedUrl = url;
        return { json: async () => ({ ok: true, data: { content: "x" } }) };
      },
    });
    await fireDOMReady();
    expect(fetchedUrl).toBe("https://staging.api.example.com/api/legal/privacy");
  });

  test("hostname=localhost uses http://localhost:4000 default", async () => {
    let fetchedUrl = "";
    loadLegal({
      type: "privacy",
      hostname: "localhost",
      fetch: async (url) => {
        fetchedUrl = url;
        return { json: async () => ({ ok: true, data: { content: "x" } }) };
      },
    });
    await fireDOMReady();
    expect(fetchedUrl).toBe("http://localhost:4000/api/legal/privacy");
  });
});
