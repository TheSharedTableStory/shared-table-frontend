// REAL coverage for js/help-center.js — exercises hub toggle, auto-open
// from URL, and error fallback against jsdom.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "help-center.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="help-root">
      <button data-hub-toggle="guest" type="button">Guest</button>
      <div id="faq-hub-panel-guest" class="hidden"><div id="faq-hub-guest-root"></div></div>

      <button data-hub-toggle="host" type="button">Host</button>
      <div id="faq-hub-panel-host" class="hidden"><div id="faq-hub-host-root"></div></div>

      <button data-hub-toggle="platform" type="button">Platform</button>
      <div id="faq-hub-panel-platform" class="hidden"><div id="faq-hub-platform-root"></div></div>

      <section id="faq-active-shell" class="hidden">
        <h2 id="faq-active-title"></h2>
        <p id="faq-active-subtitle"></p>
      </section>
    </div>
  `;
}

function loadModule(opts) {
  opts = opts || {};
  buildScaffold();
  delete window.renderTheSharedTableStoryFaqHub;
  if (opts.renderer) {
    window.renderTheSharedTableStoryFaqHub = opts.renderer;
  }
  if (opts.searchQuery) {
    Object.defineProperty(window, "location", {
      value: { search: opts.searchQuery, pathname: "/help-center.html" },
      writable: true,
      configurable: true,
    });
  }
  new Function(SRC)();
}

describe("help-center — initial state", () => {
  test("all tile buttons render aria-expanded=false initially", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    for (const hub of ["guest", "host", "platform"]) {
      const btn = document.querySelector(`[data-hub-toggle="${hub}"]`);
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(btn.getAttribute("data-expanded")).toBe("false");
    }
  });

  test("active-shell is hidden initially", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    expect(document.getElementById("faq-active-shell").classList.contains("hidden")).toBe(true);
  });

  test("no init when #help-root is absent (no crash)", () => {
    document.body.innerHTML = "";
    expect(() => new Function(SRC)()).not.toThrow();
  });
});

describe("help-center — toggleHub", () => {
  test("clicking guest tile opens the panel + reveals shell + renders title", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    document.querySelector('[data-hub-toggle="guest"]').click();
    expect(document.getElementById("faq-hub-panel-guest").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("faq-active-shell").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("faq-active-title").textContent).toBe("Guest FAQ");
  });

  test("clicking the same tile twice collapses it", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    const btn = document.querySelector('[data-hub-toggle="guest"]');
    btn.click();
    btn.click();
    expect(document.getElementById("faq-hub-panel-guest").classList.contains("hidden")).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  test("opening a second hub collapses the first (one-at-a-time)", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    document.querySelector('[data-hub-toggle="guest"]').click();
    document.querySelector('[data-hub-toggle="host"]').click();
    expect(document.getElementById("faq-hub-panel-guest").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("faq-hub-panel-host").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("faq-active-title").textContent).toBe("Host FAQ");
  });

  test("aria-expanded reflects current state after toggle", () => {
    loadModule({ renderer: () => ({ ok: true }) });
    const btn = document.querySelector('[data-hub-toggle="platform"]');
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("data-expanded")).toBe("true");
  });
});

describe("help-center — render delegation", () => {
  test("ensureHubRendered calls renderTheSharedTableStoryFaqHub with the correct hub + includeTrust", () => {
    let captured = null;
    loadModule({ renderer: (hub, mount, opts) => { captured = { hub, mount, opts }; return { ok: true }; } });
    document.querySelector('[data-hub-toggle="guest"]').click();
    expect(captured).toEqual({ hub: "guest", mount: "#faq-hub-guest-root", opts: { includeTrust: true } });
  });

  test("render result.ok=false shows red error message in mount", () => {
    loadModule({ renderer: () => ({ ok: false, error: "BLEW_UP" }) });
    document.querySelector('[data-hub-toggle="host"]').click();
    const mount = document.getElementById("faq-hub-host-root");
    expect(mount.textContent).toContain("Unable to load host questions");
  });

  test("missing renderer global shows error message", () => {
    loadModule({});
    document.querySelector('[data-hub-toggle="guest"]').click();
    const mount = document.getElementById("faq-hub-guest-root");
    expect(mount.textContent).toContain("Unable to load guest questions");
  });

  test("subsequent toggles do NOT re-render (cached after first success)", () => {
    let calls = 0;
    loadModule({ renderer: () => { calls += 1; return { ok: true }; } });
    document.querySelector('[data-hub-toggle="guest"]').click();
    document.querySelector('[data-hub-toggle="guest"]').click(); // collapse
    document.querySelector('[data-hub-toggle="guest"]').click(); // re-open
    expect(calls).toBe(1);
  });
});

describe("help-center — auto-open from URL", () => {
  test("?hub=host auto-opens host on init", () => {
    loadModule({ renderer: () => ({ ok: true }), searchQuery: "?hub=host" });
    expect(document.getElementById("faq-hub-panel-host").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("faq-active-title").textContent).toBe("Host FAQ");
  });

  test("?hub=unknown does not auto-open anything", () => {
    loadModule({ renderer: () => ({ ok: true }), searchQuery: "?hub=invalid" });
    expect(document.getElementById("faq-active-shell").classList.contains("hidden")).toBe(true);
  });

  test("?hub=guest auto-opens guest", () => {
    loadModule({ renderer: () => ({ ok: true }), searchQuery: "?hub=guest" });
    expect(document.getElementById("faq-active-title").textContent).toBe("Guest FAQ");
  });

  test("?hub=platform auto-opens platform", () => {
    loadModule({ renderer: () => ({ ok: true }), searchQuery: "?hub=platform" });
    expect(document.getElementById("faq-active-title").textContent).toBe("How The Platform Works");
  });

  test("malformed query string handled gracefully (no crash)", () => {
    expect(() => loadModule({ renderer: () => ({ ok: true }), searchQuery: "%not-valid" })).not.toThrow();
  });
});
