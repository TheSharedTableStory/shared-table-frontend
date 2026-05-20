// REAL coverage for js/faq-init.js — loads the IIFE into jsdom + asserts
// hydration + public-API exposure + path-based hub inference behaviour.

import { describe, test, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "faq-init.js"), "utf-8");

function loadInit(opts) {
  opts = opts || {};
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  // Reset all known globals the IIFE touches.
  delete window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__;
  delete window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__;
  delete window.__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__;
  delete window.renderTheSharedTableStoryFaqHub;
  delete window.mountTheSharedTableStoryContextualFaq;
  delete window.FAQ_CATALOG;
  delete window.FAQ_TRUST_CONFIG;

  if (opts.catalog) window.FAQ_CATALOG = opts.catalog;
  if (opts.trustConfig) window.FAQ_TRUST_CONFIG = opts.trustConfig;
  if (opts.renderer) window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__ = opts.renderer;
  if (opts.contextual) window.__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__ = opts.contextual;

  if (opts.pathname) {
    Object.defineProperty(window, "location", {
      value: { pathname: opts.pathname, hostname: "localhost" },
      writable: true,
      configurable: true,
    });
  }

  if (opts.dom) document.body.innerHTML = opts.dom;

  // The IIFE uses const inside its outer wrapper. Direct eval reuses the same
  // scope, which can cause "X has already been declared" the second time
  // around. Wrap each load in its own block-scope by using indirect eval
  // OR re-instantiate via `new Function`.
  new Function(SRC)();
}

describe("faq-init — hydration", () => {
  test("FAQ_CATALOG hydrated into internal data key", () => {
    const catalog = [{ id: "T01", hub: "trust", section: "x", question: "q?", answer: "a." }];
    loadInit({ catalog });
    const data = window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__;
    expect(data).toBeDefined();
    expect(data.catalog).toEqual(catalog);
  });

  test("FAQ_TRUST_CONFIG hydrated", () => {
    const trustConfig = { trustFaqIds: ["T01"], contextPlacement: {}, escalation: {} };
    loadInit({ catalog: [], trustConfig });
    expect(window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__.trustConfig).toEqual(trustConfig);
  });

  test("missing FAQ_CATALOG defaults to []", () => {
    loadInit({});
    expect(window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__.catalog).toEqual([]);
  });

  test("missing FAQ_TRUST_CONFIG defaults to empty-shape object", () => {
    loadInit({});
    const tc = window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__.trustConfig;
    expect(tc).toEqual({ trustFaqIds: [], contextPlacement: {}, escalation: {} });
  });

  test("non-array FAQ_CATALOG falls back to []", () => {
    loadInit({ catalog: "not-an-array" });
    expect(window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__.catalog).toEqual([]);
  });
});

describe("faq-init — public API exposure", () => {
  test("window.renderTheSharedTableStoryFaqHub is defined", () => {
    loadInit({});
    expect(typeof window.renderTheSharedTableStoryFaqHub).toBe("function");
  });

  test("window.mountTheSharedTableStoryContextualFaq is defined", () => {
    loadInit({});
    expect(typeof window.mountTheSharedTableStoryContextualFaq).toBe("function");
  });

  test("renderFaqHub returns error when renderer not ready", () => {
    loadInit({});
    const r = window.renderTheSharedTableStoryFaqHub("guest", "#root");
    expect(r).toEqual({ ok: false, error: "FAQ_RENDERER_NOT_READY" });
  });

  test("mountContextualFaq returns error when contextual not ready", () => {
    loadInit({});
    const r = window.mountTheSharedTableStoryContextualFaq("checkout", "#root");
    expect(r).toEqual({ ok: false, error: "FAQ_CONTEXTUAL_NOT_READY" });
  });

  test("renderFaqHub delegates to renderer when ready", () => {
    let called = null;
    loadInit({
      renderer: { renderFaqHub: (id, sel, opts) => { called = { id, sel, opts }; return { ok: true }; } },
    });
    const r = window.renderTheSharedTableStoryFaqHub("guest", "#x", { foo: 1 });
    expect(r).toEqual({ ok: true });
    expect(called).toEqual({ id: "guest", sel: "#x", opts: { foo: 1 } });
  });

  test("mountContextualFaq delegates to contextual when ready", () => {
    let called = null;
    loadInit({
      contextual: { mountContextualFaq: (id, sel, opts) => { called = { id, sel, opts }; return { ok: true }; } },
    });
    window.mountTheSharedTableStoryContextualFaq("checkout", "#y", {});
    expect(called.id).toBe("checkout");
    expect(called.sel).toBe("#y");
  });
});

describe("faq-init — path-based hub inference", () => {
  test("help-guest.html → guest hub", () => {
    let rendered = null;
    loadInit({
      pathname: "/help-guest.html",
      renderer: { renderFaqHub: (id, sel) => { rendered = { id, sel }; return { ok: true }; } },
      dom: '<div id="faq-hub-root"></div>',
    });
    expect(rendered).toEqual({ id: "guest", sel: expect.anything() });
  });

  test("help-host.html → host hub", () => {
    let rendered = null;
    loadInit({
      pathname: "/help-host.html",
      renderer: { renderFaqHub: (id) => { rendered = id; return { ok: true }; } },
      dom: '<div id="faq-hub-root"></div>',
    });
    expect(rendered).toBe("host");
  });

  test("help-platform.html → platform hub", () => {
    let rendered = null;
    loadInit({
      pathname: "/help-platform.html",
      renderer: { renderFaqHub: (id) => { rendered = id; return { ok: true }; } },
      dom: '<div id="faq-hub-root"></div>',
    });
    expect(rendered).toBe("platform");
  });

  test("unknown path with no data-faq-hub: nothing rendered", () => {
    let rendered = null;
    loadInit({
      pathname: "/about.html",
      renderer: { renderFaqHub: (id) => { rendered = id; return { ok: true }; } },
      dom: '<div id="faq-hub-root"></div>',
    });
    expect(rendered).toBeNull();
  });

  test("data-faq-hub attribute on root takes precedence over path inference", () => {
    let rendered = null;
    loadInit({
      pathname: "/help-host.html",
      renderer: { renderFaqHub: (id) => { rendered = id; return { ok: true }; } },
      dom: '<div id="faq-hub-root" data-faq-hub="trust"></div>',
    });
    expect(rendered).toBe("trust");
  });
});

describe("faq-init — contextual mounting", () => {
  test("mounts each known context if a root element is present", () => {
    const mounts = [];
    loadInit({
      contextual: {
        mountContextualFaq: (context, root) => { mounts.push({ context, hasRoot: !!root }); return { ok: true }; },
      },
      dom: `
        <div id="faq-context-experience"></div>
        <div id="faq-context-checkout"></div>
      `,
    });
    expect(mounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ context: "experience" }),
      expect.objectContaining({ context: "checkout" }),
    ]));
  });

  test("skips contexts whose root is absent", () => {
    const mounts = [];
    loadInit({
      contextual: {
        mountContextualFaq: (context) => { mounts.push(context); return { ok: true }; },
      },
      dom: '<div id="faq-context-experience"></div>',
    });
    expect(mounts).toEqual(["experience"]);
  });
});
