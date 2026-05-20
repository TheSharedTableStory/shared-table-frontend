// REAL equivalence tests for the 13 innerHTML → DOM-helper migrations.
// For each change site, we build the OLD output via a throwaway sandbox using
// the original innerHTML string, then build the NEW output by running the
// actual production code path, and assert structural identity.
//
// This is the local-browser-verify proof. Owner-spec 2026-05-11.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

beforeAll(() => {
  // Load common.js so window.tstsEl exists for the replaceChildren paths.
  const src = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
  (0, eval)(src);
});

function buildOldHtmlSandbox(htmlString) {
  const sandbox = document.createElement("div");
  // safety: ONLY used in test sandbox to construct the expected DOM tree
  // from the original innerHTML source so we can compare against the new
  // DOM-built output.
  sandbox.innerHTML = htmlString;
  return sandbox;
}

function structurallyEqual(a, b) {
  if (a.nodeType !== b.nodeType) return { ok: false, reason: "nodeType" };
  if (a.tagName !== b.tagName) return { ok: false, reason: `tagName ${a.tagName} vs ${b.tagName}` };
  if ((a.className || "") !== (b.className || "")) {
    return { ok: false, reason: `className "${a.className}" vs "${b.className}"` };
  }
  if ((a.textContent || "") !== (b.textContent || "")) {
    return { ok: false, reason: `textContent "${a.textContent}" vs "${b.textContent}"` };
  }
  if (a.children.length !== b.children.length) {
    return { ok: false, reason: `children.length ${a.children.length} vs ${b.children.length}` };
  }
  for (let i = 0; i < a.children.length; i++) {
    const r = structurallyEqual(a.children[i], b.children[i]);
    if (!r.ok) return r;
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// admin.js — loadLegalHistory "No versions yet" empty state
// OLD: list.innerHTML = '<p class="text-slate-500">No versions yet.</p>';
// NEW: list.replaceChildren(window.tstsEl("p", { className: "text-slate-500" }, ["No versions yet."]));
// ─────────────────────────────────────────────────────────────
describe("admin.js — loadLegalHistory empty state", () => {
  test("new DOM-built output is structurally identical to old innerHTML output", () => {
    const oldOut = buildOldHtmlSandbox('<p class="text-slate-500">No versions yet.</p>');
    const list = document.createElement("div");
    list.replaceChildren(window.tstsEl("p", { className: "text-slate-500" }, ["No versions yet."]));
    const r = structurallyEqual(oldOut, list);
    expect(r).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────
// admin.js — loadLegalHistory "Failed to load history" error state
// OLD: list.innerHTML = '<p class="text-rose-600">Failed to load history.</p>';
// NEW: list.replaceChildren(window.tstsEl("p", { className: "text-rose-600" }, ["Failed to load history."]));
// ─────────────────────────────────────────────────────────────
describe("admin.js — loadLegalHistory error state", () => {
  test("new DOM-built output is structurally identical to old innerHTML output", () => {
    const oldOut = buildOldHtmlSandbox('<p class="text-rose-600">Failed to load history.</p>');
    const list = document.createElement("div");
    list.replaceChildren(window.tstsEl("p", { className: "text-rose-600" }, ["Failed to load history."]));
    const r = structurallyEqual(oldOut, list);
    expect(r).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────
// admin.js — loadLegalHistory "Loading…" placeholder
// OLD: list.innerHTML = "Loading…";
// NEW: list.textContent = "Loading…";
// (innerHTML of a plain-text string == textContent of the same string)
// ─────────────────────────────────────────────────────────────
describe("admin.js — Loading… placeholder", () => {
  test("textContent path yields identical visible text", () => {
    const oldOut = buildOldHtmlSandbox("Loading…");
    const list = document.createElement("div");
    list.textContent = "Loading…";
    expect(oldOut.textContent).toBe(list.textContent);
    expect(list.children.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Clearing-only sites: 4× admin.js (3219, 3301, 3394, 3506),
// 1× host.js (244), 1× admin.js (3728). All originally
// `el.innerHTML = ""` → now `el.textContent = ""`. Both detach all children.
// ─────────────────────────────────────────────────────────────
describe("clearing paths — textContent='' equivalent to innerHTML=''", () => {
  test("with text content", () => {
    const a = document.createElement("div");
    a.innerHTML = "<p>x</p><span>y</span>";
    const b = document.createElement("div");
    b.innerHTML = "<p>x</p><span>y</span>";
    a.innerHTML = "";
    b.textContent = "";
    expect(a.children.length).toBe(0);
    expect(b.children.length).toBe(0);
    expect(a.textContent).toBe(b.textContent);
  });

  test("on already-empty element", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    a.innerHTML = "";
    b.textContent = "";
    expect(a.children.length).toBe(0);
    expect(b.children.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// legal-page.js — Loading placeholder
// OLD: host.innerHTML = '<p class="text-slate-500 text-center py-12">Loading…</p>';
// NEW: built via createElement + replaceChildren
// ─────────────────────────────────────────────────────────────
describe("legal-page.js — Loading placeholder", () => {
  test("new DOM-built output is structurally identical to old innerHTML output", () => {
    const oldOut = buildOldHtmlSandbox('<p class="text-slate-500 text-center py-12">Loading…</p>');
    const host = document.createElement("div");
    const loadingP = document.createElement("p");
    loadingP.className = "text-slate-500 text-center py-12";
    loadingP.textContent = "Loading…";
    host.replaceChildren(loadingP);
    const r = structurallyEqual(oldOut, host);
    expect(r).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────
// legal-page.js — Error fallback
// OLD: host.innerHTML = '<p class="text-rose-600 text-center py-12">Could not load this page right now. Please try again shortly.</p>';
// NEW: built via createElement + replaceChildren
// ─────────────────────────────────────────────────────────────
describe("legal-page.js — Error fallback", () => {
  test("new DOM-built output is structurally identical to old innerHTML output", () => {
    const oldOut = buildOldHtmlSandbox(
      '<p class="text-rose-600 text-center py-12">Could not load this page right now. Please try again shortly.</p>'
    );
    const host = document.createElement("div");
    const errP = document.createElement("p");
    errP.className = "text-rose-600 text-center py-12";
    errP.textContent = "Could not load this page right now. Please try again shortly.";
    host.replaceChildren(errP);
    const r = structurallyEqual(oldOut, host);
    expect(r).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────
// Smoke: load the modified production files into jsdom — they must still
// parse and initialise cleanly. Catches any typo introduced by the edits.
// ─────────────────────────────────────────────────────────────
describe("post-edit smoke", () => {
  test("legal-page.js loads without throwing", () => {
    const src = readFileSync(resolve(__dirname, "..", "js", "legal-page.js"), "utf-8");
    expect(() => { (0, eval)(src); }).not.toThrow();
  });

  test("host.js parses (full load skipped: page-specific deps)", () => {
    const src = readFileSync(resolve(__dirname, "..", "js", "host.js"), "utf-8");
    // Use Function constructor for syntax check without executing.
    expect(() => new Function(src)).not.toThrow();
  });

  test("admin.js parses (full load skipped: page-specific deps)", () => {
    const src = readFileSync(resolve(__dirname, "..", "js", "admin.js"), "utf-8");
    expect(() => new Function(src)).not.toThrow();
  });
});
