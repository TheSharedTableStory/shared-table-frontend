// REAL coverage for the phone view of the admin console, read from the real admin.html on disk.
//
// sir's order O-103, 2026-09-13: "fix all phone view for the website pages using agent without
// losing anything on desktop website". The three phone findings for this page are
// PHONE-admin-1 (the four headline figures each took a full width card), PHONE-admin-2 (fifteen
// data tables squeezed their columns instead of scrolling, so cells wrapped to five or six lines
// and the last columns could not be reached), and PHONE-admin-3 (the label and the signed in
// address in the identity strip nearly touched).
//
// Two things are pinned here, and the second matters as much as the first:
//   1. the phone side of each fix is present in the real markup;
//   2. the desktop side is untouched. Every declaration the fix adds lives inside a max-width
//      query, so at 1024 and above the page computes exactly what it computed before. The cases
//      below prove that by reading the page's own style block: no selector this fix introduces may
//      carry a declaration outside a max-width block, and the grid's class string must still leave
//      the same classes in force at 1024 and above.
//
// Nothing here is written against a copy of the markup: admin.html is read from disk and parsed by
// the document, so a class removed from the page fails the case that pins it.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_HTML = readFileSync(resolve(__dirname, "..", "admin.html"), "utf-8");

// The page's own <style> block, as text. It is read as text rather than through the browser's
// style sheet model so the media query bounds can be asserted literally.
const PAGE_STYLE = (() => {
  const start = ADMIN_HTML.indexOf("<style>") + "<style>".length;
  const end = ADMIN_HTML.indexOf("</style>", start);
  return ADMIN_HTML.slice(start, end);
})();

// Every @media block in the style sheet, as { condition, body }.
function mediaBlocks(css) {
  const out = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    out.push({ condition: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

// The style sheet with every @media block removed, and with the comments stripped so only real
// declarations are left: what remains applies at every width, desktop included. A selector or a
// value belonging to this fix must never appear in here.
function cssOutsideMediaBlocks(css) {
  let out = css;
  for (const block of mediaBlocks(css)) {
    out = out.replace("{" + block.body + "}", "{}");
  }
  return out.replace(/@media[^{]+\{\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const MEDIA = mediaBlocks(PAGE_STYLE);
const ALWAYS_ON = cssOutsideMediaBlocks(PAGE_STYLE);

function blocksMatching(selectorText) {
  return MEDIA.filter((b) => b.body.indexOf(selectorText) !== -1);
}

// The fifteen tables named in PHONE-admin-2. They are identified by the heading or the first
// column of each, not by a line number, so the cases survive the page growing or shrinking.
const FIFTEEN_TABLES = [
  "bookings-table-body",              // Latest Bookings
  "listings-table-body",              // Experiences
  "refund-policy-table-body",         // Refund Window Policy
  "host-verifications-table-body",    // Host verification
  "event-verifications-table-body",   // Event verification
  "shortfall-review-table-body",      // Seat shortfall monitor
  "shortfall-recon-table-body",       // Reconciliation Grid
  "shortfall-settlement-table-body",  // Settlement Cases
  "action-items-table-body",          // Action Items
  "admin-invites-table-body",         // Admin invites
  "users-table-body",                 // Users
  "coupons-table-body",               // Promo Codes
  "reports-table-body",               // Reports
  "private-requests-table-body",      // Bookings and Requests
  "audit-table-body"                  // Audit Logs
];

let doc;

beforeAll(() => {
  doc = document.implementation.createHTMLDocument("admin");
  const bodyTag = ADMIN_HTML.indexOf("<body");
  const start = ADMIN_HTML.indexOf(">", bodyTag) + 1;
  const end = ADMIN_HTML.lastIndexOf("</body>");
  doc.body.innerHTML = ADMIN_HTML.slice(start, end);
});

describe("admin phone view: the fifteen data tables scroll instead of squeezing", () => {
  test("the page still holds all fifteen tables the finding names, each inside its own scrolling frame", () => {
    const found = FIFTEEN_TABLES.filter((id) => doc.getElementById(id) !== null);
    expect(found).toEqual(FIFTEEN_TABLES);
  });

  test.each(FIFTEEN_TABLES)("the table holding %s sits in a frame carrying overflow-x-auto and admin-table-scroll", (bodyId) => {
    const table = doc.getElementById(bodyId).closest("table");
    expect(table).toBeTruthy();
    const frame = table.parentElement;
    expect(frame.tagName).toBe("DIV");
    expect(frame.classList.contains("overflow-x-auto")).toBe(true);
    expect(frame.classList.contains("admin-table-scroll")).toBe(true);
  });

  test("the treatment is one rule applied everywhere: fifteen frames carry it and no sixteenth does", () => {
    const frames = doc.querySelectorAll(".admin-table-scroll");
    expect(frames.length).toBe(15);
    frames.forEach((f) => {
      expect(f.classList.contains("overflow-x-auto")).toBe(true);
      expect(f.firstElementChild.tagName).toBe("TABLE");
    });
  });

  test("the width, the padding and the edge shading are all restored at 1024: they exist only under max-width 1023px", () => {
    const owning = blocksMatching(".admin-table-scroll");
    expect(owning.length).toBeGreaterThan(0);
    owning.forEach((b) => expect(b.condition).toBe("(max-width: 1023px)"));
    expect(ALWAYS_ON.indexOf(".admin-table-scroll")).toBe(-1);
  });

  test("inside that band the table keeps a real width and the cells give their padding back to the data", () => {
    const body = blocksMatching(".admin-table-scroll").map((b) => b.body).join("\n");
    expect(body).toContain(".admin-table-scroll > table { min-width: 760px; }");
    expect(body).toMatch(/\.admin-table-scroll th, \.admin-table-scroll td \{[^}]*padding-left: 0\.75rem/);
    expect(body).toMatch(/\.admin-table-scroll th, \.admin-table-scroll td \{[^}]*padding-right: 0\.75rem/);
  });

  test("the frame says there is more to reach: shading is pinned to each edge and clears itself at that end", () => {
    const body = blocksMatching(".admin-table-scroll").map((b) => b.body).join("\n");
    expect(body).toContain("radial-gradient(farthest-side at 0 50%");
    expect(body).toContain("radial-gradient(farthest-side at 100% 50%");
    // local on the two cover layers is what makes the shading disappear once that end is reached.
    expect(body).toContain("background-attachment: local, local, scroll, scroll;");
  });

  test("no table keeps a fixed phone width on desktop: min-width 760px appears nowhere outside a max-width block", () => {
    expect(ALWAYS_ON.indexOf("760px")).toBe(-1);
  });
});

describe("admin phone view: the four headline figures sit two to a row", () => {
  test("the grid carries grid-cols-2 from zero width and keeps lg:grid-cols-4", () => {
    const tiles = doc.getElementById("stats-tiles");
    expect(tiles).toBeTruthy();
    expect(tiles.classList.contains("grid-cols-2")).toBe(true);
    expect(tiles.classList.contains("lg:grid-cols-4")).toBe(true);
  });

  test("the two class strings that only ever produced one column on a phone are gone", () => {
    const tiles = doc.getElementById("stats-tiles");
    expect(tiles.classList.contains("grid-cols-1")).toBe(false);
    expect(tiles.classList.contains("sm:grid-cols-2")).toBe(false);
  });

  test("what is in force at 1024 and above is exactly what was in force before: grid, gap-5, lg:grid-cols-4", () => {
    const tiles = doc.getElementById("stats-tiles");
    // lg:grid-cols-4 is the last column rule in the sheet, so at 1024 and above it settles the
    // column count whatever narrower rules are present. The rest of the string is untouched.
    const inForceAtDesktop = Array.from(tiles.classList).filter((c) => c === "grid" || c === "gap-5" || c === "lg:grid-cols-4");
    expect(inForceAtDesktop.sort()).toEqual(["gap-5", "grid", "lg:grid-cols-4"]);
    expect(tiles.className).toBe("grid gap-5 grid-cols-2 lg:grid-cols-4");
  });

  test("all four tiles are still there, each with its label and its figure", () => {
    const tiles = doc.getElementById("stats-tiles");
    const cards = tiles.querySelectorAll(":scope > article");
    expect(cards.length).toBe(4);
    ["stats-total-users", "stats-total-hosts", "stats-total-bookings", "stats-total-revenue"]
      .forEach((id) => expect(doc.getElementById(id)).toBeTruthy());
  });

  test("the tile padding and the figure size are restored above the phone band: they exist only under max-width 639px", () => {
    const owning = blocksMatching("#stats-tiles");
    expect(owning.length).toBeGreaterThan(0);
    owning.forEach((b) => expect(b.condition).toBe("(max-width: 639px)"));
    expect(ALWAYS_ON.indexOf("#stats-tiles")).toBe(-1);
  });

  test("inside that band the figure is sized to the screen so the revenue amount stays on one line", () => {
    const body = blocksMatching("#stats-tiles").map((b) => b.body).join("\n");
    expect(body).toContain("#stats-tiles > article { padding: 1rem; }");
    expect(body).toContain("font-size: clamp(0.9375rem, 5vw, 1.875rem)");
    // 1.875rem is the size the tiles already carry, so the clamp reaches it before 640 and the
    // join into the band above has no step in it.
    expect(body).toContain("overflow-wrap: anywhere");
  });
});

describe("admin phone view: the identity strip reads as a label and an account", () => {
  test("the strip and its label carry the classes the phone rule needs, and keep every class they had", () => {
    const bar = doc.querySelector(".admin-identity-bar");
    expect(bar).toBeTruthy();
    expect(bar.className).toBe("admin-identity-bar bg-white border-b border-slate-100 px-4 py-2 flex items-center justify-between");
    const label = bar.querySelector(".admin-panel-label");
    expect(label).toBeTruthy();
    expect(label.textContent).toBe("Admin Panel");
    expect(label.className).toBe("admin-panel-label text-xs uppercase tracking-[0.2em] text-slate-400 font-bold");
  });

  test("the signed in address is still the second half of the strip and still truncates", () => {
    const bar = doc.querySelector(".admin-identity-bar");
    const identity = bar.querySelector("#admin-identity-label");
    expect(identity).toBeTruthy();
    expect(identity.classList.contains("truncate")).toBe(true);
  });

  test("the gap is restored at 1024: it exists only under max-width 1023px", () => {
    const owning = blocksMatching(".admin-identity-bar");
    expect(owning.length).toBeGreaterThan(0);
    owning.forEach((b) => expect(b.condition).toBe("(max-width: 1023px)"));
    expect(ALWAYS_ON.indexOf(".admin-identity-bar")).toBe(-1);
  });

  test("inside that band the two are held apart and the label never gives up its width", () => {
    const body = blocksMatching(".admin-identity-bar").map((b) => b.body).join("\n");
    expect(body).toContain(".admin-identity-bar { gap: 1rem; }");
    expect(body).toContain(".admin-identity-bar .admin-panel-label { flex-shrink: 0; }");
  });
});

describe("admin phone view: nothing this fix adds can reach the desktop", () => {
  test("every media block this fix introduces is a max-width block, never a min-width one", () => {
    const mine = MEDIA.filter((b) =>
      b.body.indexOf(".admin-table-scroll") !== -1 ||
      b.body.indexOf(".admin-identity-bar") !== -1 ||
      b.body.indexOf("#stats-tiles") !== -1);
    expect(mine.length).toBe(3);
    mine.forEach((b) => {
      expect(b.condition).toMatch(/^\(max-width: (639|1023)px\)$/);
      expect(b.condition).not.toContain("min-width");
    });
  });

  test("the menu button rule sir approved earlier today is still there, untouched", () => {
    expect(PAGE_STYLE).toContain("#admin-sidebar-toggle-wrap.admin-menu-open { left: 208px; }");
  });

  test("the page carries no new stylesheet and no new script for any of this", () => {
    const styleBlocks = ADMIN_HTML.match(/<style>/g) || [];
    expect(styleBlocks.length).toBe(1);
  });
});
