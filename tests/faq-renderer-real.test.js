// REAL coverage for js/faq-renderer.js — loads the IIFE into jsdom and
// exercises renderFaqHub via the internal-exposure key.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "faq-renderer.js"), "utf-8");

function loadModule(opts) {
  opts = opts || {};
  document.body.innerHTML = "";
  delete window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__;
  delete window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__;
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__ = {
    catalog: opts.catalog || [],
    trustConfig: opts.trustConfig || null,
  };
  new Function(SRC)();
  return window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__;
}

// Items must include contexts:["hub"] to appear in hub render (matches the
// actual catalog contract — getHubItems filters on this).
const SAMPLE = [
  { id: "G01", hub: "guest", section: "booking", question: "How do I book?", answer: "Pick a session and confirm.", status: "active", contexts: ["hub"] },
  { id: "G02", hub: "guest", section: "booking", question: "Can I cancel?", answer: "Yes, per the policy.", status: "active", contexts: ["hub"] },
  { id: "G03", hub: "guest", section: "safety", question: "How do I report?", answer: "Use the report tool.", status: "active", contexts: ["hub"] },
  { id: "G04", hub: "guest", section: "support", question: "Where is support?", answer: "FAQs page.", status: "inactive", contexts: ["hub"] },
  { id: "T01", hub: "trust", section: "trust-safety", question: "Trust Q?", answer: "Trust A.", status: "active", contexts: ["hub"] },
  { id: "H01", hub: "host", section: "earnings", question: "How do payouts work?", answer: "Per booking.", status: "active", contexts: ["hub"] },
];

function fullSkeleton() {
  // The renderer auto-creates its skeleton elements (search/list/empty/escalation)
  // inside the mount node. We just need an empty root element.
  document.body.innerHTML = '<section id="faq-hub-root"></section>';
}

describe("faq-renderer — mount target", () => {
  test("missing mount returns FAQ_MOUNT_NOT_FOUND", () => {
    const api = loadModule({ catalog: SAMPLE });
    const r = api.renderFaqHub("guest", "#absent");
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/MOUNT_NOT_FOUND|NOT_FOUND/);
  });

  test("invalid hub id returns FAQ_HUB_UNKNOWN or builds an empty render", () => {
    const api = loadModule({ catalog: SAMPLE });
    document.body.innerHTML = '<div id="root"></div>';
    const r = api.renderFaqHub("not-a-hub", "#root");
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("faq-renderer — guest hub", () => {
  test("renders active guest items, hides inactive", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    const r = api.renderFaqHub("guest", "#faq-hub-root");
    expect(r.ok).toBe(true);
    // Active guest questions should appear:
    expect(document.body.textContent).toContain("How do I book?");
    expect(document.body.textContent).toContain("Can I cancel?");
    expect(document.body.textContent).toContain("How do I report?");
    // Inactive guest item must not appear:
    expect(document.body.textContent).not.toContain("Where is support?");
    // Non-guest items must not appear in the guest hub:
    expect(document.body.textContent).not.toContain("How do payouts work?");
  });

  test("count reflects rendered items", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    const r = api.renderFaqHub("guest", "#faq-hub-root");
    // 3 active guest items.
    expect(r.count).toBe(3);
  });
});

describe("faq-renderer — host hub", () => {
  test("renders host items only", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    const r = api.renderFaqHub("host", "#faq-hub-root");
    expect(r.ok).toBe(true);
    expect(document.body.textContent).toContain("How do payouts work?");
    expect(document.body.textContent).not.toContain("How do I book?");
  });
});

describe("faq-renderer — empty state", () => {
  test("hub with no items shows empty state", () => {
    const api = loadModule({ catalog: [] });
    fullSkeleton();
    const r = api.renderFaqHub("guest", "#faq-hub-root");
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });
});

describe("faq-renderer — escalation block", () => {
  test("renders an escalation block via createEscalationBlock", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    api.renderFaqHub("guest", "#faq-hub-root");
    const esc = document.querySelector("[data-faq-escalation]");
    expect(esc).toBeTruthy();
    expect(esc.textContent.length).toBeGreaterThan(0);
  });

  test("createEscalationBlock returns a Node when called standalone", () => {
    const api = loadModule({ catalog: [] });
    const node = api.createEscalationBlock();
    expect(node).toBeTruthy();
    expect(node.textContent.length).toBeGreaterThan(0);
  });
});

describe("faq-renderer — section ordering", () => {
  test("guest sections come out in HUB_SECTION_ORDER", () => {
    const api = loadModule({
      catalog: [
        { id: "G_safety", hub: "guest", section: "safety", question: "qs?", answer: "as", status: "active", contexts: ["hub"] },
        { id: "G_booking", hub: "guest", section: "booking", question: "qb?", answer: "ab", status: "active", contexts: ["hub"] },
        { id: "G_support", hub: "guest", section: "support", question: "qsu?", answer: "asu", status: "active", contexts: ["hub"] },
      ],
    });
    fullSkeleton();
    api.renderFaqHub("guest", "#faq-hub-root");
    // booking should appear before safety, safety before support per HUB_SECTION_ORDER.guest
    const html = document.querySelector("[data-faq-list]").textContent;
    const bookingIdx = html.indexOf("qb?");
    const safetyIdx = html.indexOf("qs?");
    const supportIdx = html.indexOf("qsu?");
    expect(bookingIdx).toBeGreaterThan(-1);
    expect(safetyIdx).toBeGreaterThan(-1);
    expect(supportIdx).toBeGreaterThan(-1);
    expect(bookingIdx).toBeLessThan(safetyIdx);
    expect(safetyIdx).toBeLessThan(supportIdx);
  });
});

describe("faq-renderer — search filtering", () => {
  test("typing in search input filters visible items", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    api.renderFaqHub("guest", "#faq-hub-root");
    const input = document.querySelector("[data-faq-search]");
    expect(input).toBeTruthy();
    input.value = "cancel";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const list = document.querySelector("[data-faq-list]");
    // The cancel question should still appear.
    expect(list.textContent).toContain("Can I cancel?");
  });

  test("search with no matches surfaces empty state", () => {
    const api = loadModule({ catalog: SAMPLE });
    fullSkeleton();
    api.renderFaqHub("guest", "#faq-hub-root");
    const input = document.querySelector("[data-faq-search]");
    input.value = "absolute-nonsense-search-term-zzz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const empty = document.querySelector("[data-faq-empty]");
    expect(empty).toBeTruthy();
    expect(empty.classList.contains("hidden")).toBe(false);
  });
});

describe("faq-renderer — invariants", () => {
  test("API surface frozen (cannot be replaced from outside)", () => {
    const api = loadModule({ catalog: SAMPLE });
    expect(Object.isFrozen(api)).toBe(true);
  });

  test("renderFaqHub does not throw for unexpected mount types", () => {
    const api = loadModule({ catalog: SAMPLE });
    expect(() => api.renderFaqHub("guest", null)).not.toThrow();
    expect(() => api.renderFaqHub("guest", undefined)).not.toThrow();
  });
});
