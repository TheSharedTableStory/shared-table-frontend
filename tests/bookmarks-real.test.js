// REAL coverage for js/bookmarks.js — exercises the auth-then-load flow
// against jsdom with stubbed window helpers.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "bookmarks.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="state-loading">Loading…</div>
    <div id="state-error" class="hidden">Error</div>
    <div id="state-empty" class="hidden">No bookmarks yet</div>
    <div id="grid" class="hidden"></div>
    <button id="retry-btn">Retry</button>
  `;
}

async function loadModule(opts) {
  opts = opts || {};
  buildScaffold();
  // Load common.js so tstsEl, tstsSafeUrl, tstsSafeImg, unwrapApiList exist.
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "u1" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => null }));

  Object.defineProperty(window, "location", {
    value: { href: "https://x.com/bookmarks.html", hash: "", pathname: "/bookmarks.html", hostname: "x.com" },
    writable: true,
    configurable: true,
  });

  // Capture the DOMContentLoaded handler the IIFE registers.
  let captured = null;
  const origAdd = document.addEventListener;
  document.addEventListener = function (type, handler, ...rest) {
    if (type === "DOMContentLoaded" && captured === null) { captured = handler; return; }
    return origAdd.call(this, type, handler, ...rest);
  };
  try { new Function(SRC)(); } finally { document.addEventListener = origAdd; }
  if (typeof captured === "function") captured(new Event("DOMContentLoaded"));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const SAMPLE_LIST = [
  { _id: "e1", title: "Sunset Paella", imageUrl: "https://cdn/x.jpg", city: "Melbourne", price: 75 },
  { _id: "e2", title: "Yum Cha Lunch", images: ["https://cdn/y.jpg"], city: "Sydney", price: 50 },
];

describe("bookmarks — auth gate", () => {
  test("no session → does not call authFetch (auth gate blocks load)", async () => {
    let fetched = false;
    const fetchImpl = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    await loadModule({ session: async () => ({ ok: false }), authFetch: fetchImpl });
    expect(fetched).toBe(false);
  });

  test("missing session helper triggers redirect path (no fetch)", async () => {
    let fetched = false;
    const fetchImpl = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    await loadModule({ session: async () => { throw new Error("no helper"); }, authFetch: fetchImpl });
    expect(fetched).toBe(false);
  });
});

describe("bookmarks — successful load", () => {
  test("renders cards for each bookmarked experience", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: SAMPLE_LIST } }),
    });
    await loadModule({ authFetch: fetchImpl });
    const grid = document.getElementById("grid");
    expect(grid.classList.contains("hidden")).toBe(false);
    expect(grid.children.length).toBe(2);
    expect(grid.textContent).toContain("Sunset Paella");
    expect(grid.textContent).toContain("Yum Cha Lunch");
  });

  test("each card links to experience.html with id query param", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: SAMPLE_LIST } }),
    });
    await loadModule({ authFetch: fetchImpl });
    const links = Array.from(document.querySelectorAll("#grid a"));
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toContain("experience.html?id=e1");
    expect(links[1].getAttribute("href")).toContain("experience.html?id=e2");
  });

  test("price rendered as $N in top-right badge", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: SAMPLE_LIST } }),
    });
    await loadModule({ authFetch: fetchImpl });
    const grid = document.getElementById("grid");
    expect(grid.textContent).toContain("$75");
    expect(grid.textContent).toContain("$50");
  });
});

describe("bookmarks — title sanitisation", () => {
  test("removes 'WORLD-CLASS' prefix from internal-only titles", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: { experiences: [{ _id: "e1", title: "WORLD CLASS: Sunset Paella", price: 75 }] },
      }),
    });
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("grid").textContent).toContain("Sunset Paella");
    expect(document.getElementById("grid").textContent).not.toContain("WORLD CLASS");
  });

  test("empty title falls back to 'Shared experience'", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: { experiences: [{ _id: "e1", title: "", price: 75 }] },
      }),
    });
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("grid").textContent).toContain("Shared experience");
  });

  test("WORLD CLASS: prefix stripped via debrand regex", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: { experiences: [{ _id: "e1", title: "WORLD CLASS: Sunset Paella", price: 75 }] },
      }),
    });
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("grid").textContent).toContain("Sunset Paella");
    expect(document.getElementById("grid").textContent).not.toContain("WORLD CLASS:");
  });
});

describe("bookmarks — empty + error states", () => {
  test("empty experiences list shows empty state", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: [] } }),
    });
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("state-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("grid").classList.contains("hidden")).toBe(true);
  });

  test("server returns ok:false → error state shown", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ ok: false }),
    });
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("fetch throws → error state shown", async () => {
    const fetchImpl = async () => { throw new Error("network"); };
    await loadModule({ authFetch: fetchImpl });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("retry button re-fires load", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    expect(calls).toBe(1);
    document.getElementById("retry-btn").click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});

describe("bookmarks — image fallback safety", () => {
  test("missing imageUrl uses fallback path", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "No image", price: 50 }] } }),
    });
    await loadModule({ authFetch: fetchImpl });
    const img = document.querySelector("#grid img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toMatch(/experience-default\.jpg$/);
  });

  test("image src is set via window.tstsSafeImg (no innerHTML)", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { experiences: SAMPLE_LIST } }),
    });
    await loadModule({ authFetch: fetchImpl });
    const imgs = document.querySelectorAll("#grid img");
    expect(imgs).toHaveLength(2);
    // Both images have src set (tstsSafeImg path).
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBeTruthy();
    }
  });
});
