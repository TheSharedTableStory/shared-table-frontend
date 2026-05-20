// REAL coverage for js/feed.js — exercises the social feed load + render flow.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "feed.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="state-loading">Loading…</div>
    <div id="state-empty" class="hidden">No activity yet</div>
    <div id="state-error" class="hidden">Error</div>
    <div id="list" class="hidden"></div>
    <button id="retry-btn">Retry</button>
  `;
}

async function loadModule(opts) {
  opts = opts || {};
  buildScaffold();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: { id: "u1" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [] } }) }));

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

const SAMPLE_ITEM = {
  experienceId: "e1",
  when: "2026-05-15",
  experience: { _id: "e1", title: "Sunset Paella", imageUrl: "https://cdn/x.jpg", city: "Melbourne" },
  guest: { _id: "u2", name: "Sofia M", handle: "sofia_m", profilePic: "https://cdn/avatar.jpg" },
};

describe("feed — auth gate", () => {
  test("no session: does not call authFetch", async () => {
    let fetched = false;
    const fetchImpl = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    await loadModule({ session: async () => ({ ok: false }), authFetch: fetchImpl });
    expect(fetched).toBe(false);
  });
});

describe("feed — successful load", () => {
  test("renders one card per item", async () => {
    await loadModule({
      authFetch: async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM, { ...SAMPLE_ITEM, experience: { ...SAMPLE_ITEM.experience, _id: "e2", title: "Yum Cha" } }] } }),
      }),
    });
    const list = document.getElementById("list");
    expect(list.classList.contains("hidden")).toBe(false);
    expect(list.children.length).toBe(2);
    expect(list.textContent).toContain("Sunset Paella");
    expect(list.textContent).toContain("Yum Cha");
  });

  test("includes guest name + handle", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM] } }) }),
    });
    expect(document.getElementById("list").textContent).toContain("Sofia M");
    expect(document.getElementById("list").textContent).toContain("@sofia_m");
  });

  test("visibility chip shows 'Visible to: Connections'", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM] } }) }),
    });
    expect(document.getElementById("list").textContent).toContain("Visible to: Connections");
  });

  test("'Booked: <date>' prefix shown for valid date", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM] } }) }),
    });
    expect(document.getElementById("list").textContent).toContain("Booked:");
  });
});

describe("feed — empty + error", () => {
  test("empty list → empty state visible", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [] } }) }),
    });
    expect(document.getElementById("state-empty").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("list").classList.contains("hidden")).toBe(true);
  });

  test("server ok=false → error state", async () => {
    await loadModule({
      authFetch: async () => ({ ok: false, json: async () => ({ ok: false }) }),
    });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("fetch throws → error state", async () => {
    await loadModule({ authFetch: async () => { throw new Error("net"); } });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("retry button re-loads", async () => {
    let calls = 0;
    await loadModule({
      authFetch: async () => { calls += 1; return { ok: true, json: async () => ({ ok: true, data: { items: [] } }) }; },
    });
    expect(calls).toBe(1);
    document.getElementById("retry-btn").click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(calls).toBe(2);
  });
});

describe("feed — link routing", () => {
  test("experience title + image link to experience.html?id=", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM] } }) }),
    });
    const links = Array.from(document.querySelectorAll("#list a"));
    const expLinks = links.filter((a) => String(a.getAttribute("href") || "").includes("experience.html?id="));
    expect(expLinks.length).toBeGreaterThanOrEqual(2); // image + title both link to experience
  });

  test("guest name + 'View profile' link to public-profile.html?id=", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { items: [SAMPLE_ITEM] } }) }),
    });
    const links = Array.from(document.querySelectorAll("#list a"));
    const profileLinks = links.filter((a) => String(a.getAttribute("href") || "").includes("public-profile.html?id="));
    expect(profileLinks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("feed — missing-data fallbacks", () => {
  test("missing experience title falls back to 'Experience'", async () => {
    await loadModule({
      authFetch: async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { items: [{ ...SAMPLE_ITEM, experience: { _id: "e1" } }] } }),
      }),
    });
    expect(document.getElementById("list").textContent).toContain("Experience");
  });

  test("missing guest name falls back to 'Friend'", async () => {
    await loadModule({
      authFetch: async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { items: [{ ...SAMPLE_ITEM, guest: {} }] } }),
      }),
    });
    expect(document.getElementById("list").textContent).toContain("Friend");
  });

  test("image fallback used when experience.imageUrl missing", async () => {
    await loadModule({
      authFetch: async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { items: [{ ...SAMPLE_ITEM, experience: { _id: "e1", title: "X" } }] } }),
      }),
    });
    const imgs = document.querySelectorAll("#list img");
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0].getAttribute("src")).toMatch(/experience-default\.jpg$/);
  });
});
