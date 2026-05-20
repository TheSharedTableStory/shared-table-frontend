// REAL coverage for js/faq-contextual.js — loads the IIFE into jsdom and
// exercises mountContextualFaq via the internal-exposure key.

import { describe, test, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "faq-contextual.js"), "utf-8");

function loadModule(opts) {
  opts = opts || {};
  document.body.innerHTML = "";
  delete window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__;
  delete window.__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__;
  delete window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__;
  // common.js exposes window.tstsEl + tstsSetText — load it first.
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  window.__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__ = {
    catalog: opts.catalog || [],
    trustConfig: opts.trustConfig || null,
  };

  new Function(SRC)();
  return window.__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__;
}

const SAMPLE_CATALOG = [
  { id: "T01", hub: "trust", section: "payments", question: "Q1?", answer: "A1.", status: "active" },
  { id: "T02", hub: "trust", section: "refunds", question: "Q2?", answer: "A2.", status: "active" },
  { id: "T03", hub: "trust", section: "privacy", question: "Q3?", answer: "A3.", status: "inactive" },
  { id: "G01", hub: "guest", section: "booking", question: "QG1?", answer: "AG1.", status: "active" },
];

describe("faq-contextual — mount target resolution", () => {
  test("missing mount returns FAQ_CONTEXT_MOUNT_NOT_FOUND", () => {
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    const r = api.mountContextualFaq("checkout", "#absent");
    expect(r).toEqual({ ok: false, error: "FAQ_CONTEXT_MOUNT_NOT_FOUND" });
  });

  test("element selector resolves and mounts", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    const r = api.mountContextualFaq("checkout", "#root");
    expect(r.ok).toBe(true);
  });
});

describe("faq-contextual — item filtering", () => {
  test("only active items appear", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({
      catalog: SAMPLE_CATALOG,
      trustConfig: { trustFaqIds: ["T01", "T03"] }, // T03 is inactive
    });
    document.body.innerHTML = '<div id="root"></div>';
    const r = api.mountContextualFaq("checkout", "#root");
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1); // T03 filtered out
  });

  test("context-specific placement overrides default trustFaqIds", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({
      catalog: SAMPLE_CATALOG,
      trustConfig: {
        trustFaqIds: ["T01"],
        contextPlacement: { checkout: ["T02"] }, // override for checkout
      },
    });
    document.body.innerHTML = '<div id="root"></div>';
    const r = api.mountContextualFaq("checkout", "#root");
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    // Verify the rendered question text matches T02 (Q2), not T01.
    expect(document.body.textContent).toContain("Q2?");
    expect(document.body.textContent).not.toContain("Q1?");
  });

  test("no matching items: mount is hidden + count 0", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: [] } });
    document.body.innerHTML = '<div id="root"></div>';
    const r = api.mountContextualFaq("checkout", "#root");
    expect(r).toEqual({ ok: true, count: 0 });
    expect(document.getElementById("root").classList.contains("hidden")).toBe(true);
  });
});

describe("faq-contextual — heading by context", () => {
  test("default context heading: Trust & Safety Questions", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("experience", "#root");
    expect(document.body.textContent).toContain("Trust & Safety Questions");
  });

  test("dashboard_guest → Booking FAQs", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("dashboard_guest", "#root");
    expect(document.body.textContent).toContain("Booking FAQs");
  });

  test("dashboard_host → Host FAQs", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("dashboard_host", "#root");
    expect(document.body.textContent).toContain("Host FAQs");
  });

  test("about_platform → How The Platform Works", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("about_platform", "#root");
    expect(document.body.textContent).toContain("How The Platform Works");
  });
});

describe("faq-contextual — accordion interactions", () => {
  test("clicking outer header toggles panel visibility (aria-expanded)", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("checkout", "#root");
    const root = document.getElementById("root");
    const header = root.querySelector("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    header.click();
    expect(header.getAttribute("aria-expanded")).toBe("true");
    header.click();
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  test("clicking an item toggle expands its answer panel", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01", "T02"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("checkout", "#root");
    const root = document.getElementById("root");
    // First open the outer panel.
    root.querySelector("button").click();
    // Now find an item-level toggle (inside an article).
    const itemToggle = root.querySelector("article button");
    expect(itemToggle.getAttribute("aria-expanded")).toBe("false");
    itemToggle.click();
    expect(itemToggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("faq-contextual — escalation block", () => {
  test("renders 3 escalation links by default", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("checkout", "#root");
    const root = document.getElementById("root");
    // Escalation includes Manage bookings, Report an issue, Contact support.
    expect(root.textContent).toContain("Manage bookings");
    expect(root.textContent).toContain("Report an issue");
    expect(root.textContent).toContain("Contact support");
  });

  test("contact-support uses mailto: link", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("checkout", "#root");
    const root = document.getElementById("root");
    const mail = Array.from(root.querySelectorAll("a")).find((a) =>
      String(a.getAttribute("href") || "").startsWith("mailto:")
    );
    expect(mail).toBeTruthy();
  });
});

describe("faq-contextual — empty state isolation", () => {
  test("does not leak rendered content from previous mount call", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const api = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: ["T01"] } });
    document.body.innerHTML = '<div id="root"></div>';
    api.mountContextualFaq("checkout", "#root");
    expect(document.getElementById("root").textContent).toContain("Q1?");
    // Re-mount with empty list — must clear prior content.
    const api2 = loadModule({ catalog: SAMPLE_CATALOG, trustConfig: { trustFaqIds: [] } });
    document.body.innerHTML = '<div id="root"></div>';
    api2.mountContextualFaq("checkout", "#root");
    expect(document.getElementById("root").textContent).not.toContain("Q1?");
  });
});
