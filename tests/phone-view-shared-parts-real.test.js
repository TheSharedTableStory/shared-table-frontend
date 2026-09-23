// REAL coverage for the phone view of the shared parts of the site, per sir's order O-103:
// "fix all phone view for the website pages using agent without losing anything on desktop website".
//
// It loads the real js/common.js into jsdom, renders the real header and the real footer, loads the
// real js/legal-page.js and renders a real policy page, then reads css/fonts.css as text. Every
// assertion checks two halves at once: the phone class that fixes the defect, and the lg: or sm:
// class that hands the desktop back exactly what it has today. A phone class written without its
// desktop restore is the failure these tests exist to catch.

import { describe, test, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const LEGAL_SRC = readFileSync(resolve(__dirname, "..", "js", "legal-page.js"), "utf-8");
const FONTS_CSS = readFileSync(resolve(__dirname, "..", "css", "fonts.css"), "utf-8");
const TAILWIND_CSS = readFileSync(resolve(__dirname, "..", "css", "tailwind.css"), "utf-8");

// common.js is written for the browser and attaches to window, so it is evaluated in global scope
// exactly the way tests/common-real.test.js does it.
beforeAll(() => {
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
});

// ---------------------------------------------------------------------------
// Real renders
// ---------------------------------------------------------------------------

function renderHeader() {
  document.body.innerHTML = '<div id="navbar-placeholder"></div>';
  globalThis.injectNavbar();
  return document.getElementById("navbar-placeholder");
}

function renderFooter() {
  document.body.innerHTML = '<div id="footer-placeholder"></div>';
  globalThis.injectFooter();
  return document.getElementById("footer-placeholder");
}

function classesOf(el) {
  return String(el.className || "").split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The Tailwind values the shared header and footer are built from, in pixels.
// Every entry is the published value of that utility, so the derivation below is
// a reading of the class strings rather than a remembered number.
//
// This is a hand table, and the header tests, the footer tests and the footer
// reservation test still read their lengths from it. The legal button geometry no
// longer does: compiledPx below reads those lengths out of css/tailwind.css, and
// the geometry test asserts that this table agrees with the compiled file, so a
// drift between the two shows up as a failure rather than passing quietly.
// ---------------------------------------------------------------------------
const SPACING_PX = { 0: 0, 1: 4, "1.5": 6, 2: 8, "2.5": 10, 3: 12, 4: 16, 8: 32, 12: 48 };
const LINE_HEIGHT_PX = { base: 24, sm: 20, xs: 16, "2xl": 32 }; // Tailwind text-xs 1rem, text-sm 1.25rem, text-2xl 2rem, body 1.5
const BADGE_PX = 36; // h-9 on the round logo mark

function spacingFromClass(classList, prefix) {
  const hit = classList.find((c) => c.startsWith(prefix));
  if (!hit) throw new Error("no " + prefix + " class on " + classList.join(" "));
  const step = hit.slice(prefix.length);
  if (!(step in SPACING_PX)) throw new Error("unmapped spacing step: " + hit);
  return SPACING_PX[step];
}

// ---------------------------------------------------------------------------
// Does a class actually exist in the compiled stylesheet? A class that is only
// in the source renders NOTHING while looking correct, so every class the two
// legal buttons carry is looked up as a real selector in css/tailwind.css.
// Tailwind escapes the characters below with a backslash when it writes the
// selector, so the lookup has to escape them the same way.
// ---------------------------------------------------------------------------
function compiledSelectorFor(cls) {
  let out = "";
  for (const ch of cls) out += ":.[]/%".includes(ch) ? "\\" + ch : ch;
  return "." + out;
}

function isCompiled(cls) {
  const sel = compiledSelectorFor(cls);
  let i = TAILWIND_CSS.indexOf(sel);
  while (i !== -1) {
    const next = TAILWIND_CSS[i + sel.length];
    // a real rule head ends at the brace, the next selector, a pseudo class, a
    // combinator or a space. Anything else is a longer class that merely starts
    // with the same letters.
    if (next === "{" || next === "," || next === ":" || next === " " || next === ">") return true;
    i = TAILWIND_CSS.indexOf(sel, i + 1);
  }
  return false;
}

// ---------------------------------------------------------------------------
// The declaration block Tailwind compiled for a class. This is how a measurement
// is read out of the stylesheet the pages actually load, instead of out of the
// hand table above. Only an exact rule head is accepted, so a longer class that
// merely starts with the same letters is never mistaken for it.
// ---------------------------------------------------------------------------
function compiledBody(cls) {
  const sel = compiledSelectorFor(cls);
  let i = TAILWIND_CSS.indexOf(sel);
  while (i !== -1) {
    if (TAILWIND_CSS[i + sel.length] === "{") {
      return TAILWIND_CSS.slice(i + sel.length + 1, TAILWIND_CSS.indexOf("}", i));
    }
    i = TAILWIND_CSS.indexOf(sel, i + 1);
  }
  throw new Error("no compiled rule for " + cls);
}

// Tailwind writes these lengths in rem. Nothing in css/tailwind.css sets a root font
// size, so the browser default of 16 pixels is the conversion, and it is the one value
// in the legal button geometry below that is still taken on trust rather than read.
const ROOT_FONT_PX = 16;

function compiledPx(cls, prop) {
  const body = compiledBody(cls);
  const hit = body.match(new RegExp("(?:^|;)" + prop + ":([^;]+)"));
  if (!hit) throw new Error(prop + " is not declared on " + cls);
  const value = hit[1].trim();
  if (value.endsWith("rem")) return parseFloat(value) * ROOT_FONT_PX;
  if (value.endsWith("px")) return parseFloat(value);
  throw new Error("unconvertible length on " + cls + ": " + value);
}

function arbitraryFontPx(classList, prefix) {
  const hit = classList.find((c) => c.startsWith(prefix + "text-["));
  if (!hit) throw new Error("no " + prefix + "text-[..] class on " + classList.join(" "));
  return Number(hit.replace(prefix + "text-[", "").replace("px]", ""));
}

// Derives the rendered height of the phone footer from the class strings the footer actually
// carries. On a phone the three footer columns stack in one grid column, so the height is the
// footer padding, the brand block, two grid row gaps, two link columns and the copyright block.
function derivePhoneFooterHeightPx(footerRoot) {
  const footer = footerRoot.querySelector("footer");
  const footerPad = spacingFromClass(classesOf(footer), "py-");

  const grid = footer.querySelector("div.grid");
  const gridGap = spacingFromClass(classesOf(grid), "gap-");

  // Column one: the round mark beside a two line brand stack, then the bottom margin.
  const brandRow = grid.children[0].querySelector("div.flex");
  const brandStackTitle = LINE_HEIGHT_PX["2xl"]; // h3 text-2xl
  const tagline = brandRow.querySelector("span.flex-col > span:last-child");
  const taglineClasses = classesOf(tagline);
  const taglinePx = arbitraryFontPx(taglineClasses, ""); // leading-none on the stack, so the line box is the font size
  const taglineTop = spacingFromClass(taglineClasses, "mt-");
  const brandBlock =
    Math.max(BADGE_PX, brandStackTitle + taglineTop + taglinePx) +
    spacingFromClass(classesOf(brandRow), "mb-");

  // Columns two and three: a heading, then a list of link rows.
  let linkColumns = 0;
  for (const col of [grid.children[1], grid.children[2]]) {
    const h4 = col.querySelector("h4");
    const heading = LINE_HEIGHT_PX.base + spacingFromClass(classesOf(h4), "mb-");
    const list = col.querySelector("ul");
    const listGap = spacingFromClass(classesOf(list), "space-y-");
    const links = Array.from(list.querySelectorAll("a"));
    const rowPad = spacingFromClass(classesOf(links[0]), "py-");
    const rowHeight = LINE_HEIGHT_PX.sm + rowPad * 2;
    linkColumns += heading + links.length * rowHeight + (links.length - 1) * listGap;
  }

  // The copyright strip: top margin, hairline rule, top padding, two small lines with a gap.
  const copy = footer.children[1];
  const copyClasses = classesOf(copy);
  const copyLines = Array.from(copy.querySelectorAll("p"));
  const copyright =
    spacingFromClass(copyClasses, "mt-") +
    1 + // border-t
    spacingFromClass(copyClasses, "pt-") +
    copyLines.length * LINE_HEIGHT_PX.sm +
    (copyLines.length - 1) * spacingFromClass(copyClasses, "space-y-");

  return footerPad * 2 + brandBlock + gridGap * 2 + linkColumns + copyright;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("phone view, shared header", () => {
  test("the menu button carries a real thumb sized tap area and is still absent from 1024 up", () => {
    const root = renderHeader();
    const btn = root.querySelector("#mobile-menu-btn");
    const cls = classesOf(btn);

    // The tap area: 12px of padding on every side of a 24px mark, so the button box is 45 by 56.
    expect(cls).toContain("p-3");
    expect(cls).toContain("inline-flex");
    expect(cls).toContain("items-center");
    expect(cls).toContain("justify-center");
    expect(SPACING_PX[3] * 2 + LINE_HEIGHT_PX["2xl"]).toBeGreaterThanOrEqual(44);

    // The desktop half: the button still does not exist at 1024 and above.
    expect(cls).toContain("lg:hidden");
  });

  test("the menu button's padding is cancelled by an equal negative margin, so the mark does not move", () => {
    const root = renderHeader();
    const cls = classesOf(root.querySelector("#mobile-menu-btn"));
    // p-3 is 12px; -mr-3 and -my-3 are -12px, so the footprint and the right edge are what they were.
    expect(cls).toContain("p-3");
    expect(cls).toContain("-mr-3");
    expect(cls).toContain("-my-3");
    const pad = spacingFromClass(cls, "p-");
    expect(spacingFromClass(cls, "-mr-")).toBe(pad);
    expect(spacingFromClass(cls, "-my-")).toBe(pad);
  });

  test("the header brand line reads at 11 pixels on a phone and returns to 10 pixels from 1024 up", () => {
    const root = renderHeader();
    const tagline = Array.from(root.querySelectorAll("span")).find(
      (s) => s.textContent === "Bring people together. One story at a time."
    );
    const cls = classesOf(tagline);
    expect(cls).toContain("text-[11px]");
    expect(cls).toContain("lg:text-[10px]");
    expect(arbitraryFontPx(cls, "")).toBe(11);
    expect(arbitraryFontPx(cls, "lg:")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe("phone view, shared footer", () => {
  test("every footer link is a 44 pixel block row on a phone and an inline row again from 1024 up", () => {
    const root = renderFooter();
    const links = Array.from(root.querySelectorAll("footer ul a"));
    expect(links.length).toBe(8);

    for (const a of links) {
      const cls = classesOf(a);
      expect(cls).toContain("block");
      expect(cls).toContain("py-3");
      expect(cls).toContain("lg:inline");
      expect(cls).toContain("lg:py-0");
      // 12px above, 20px of text, 12px below.
      expect(spacingFromClass(cls, "py-") * 2 + LINE_HEIGHT_PX.sm).toBe(44);
    }
  });

  test("both footer lists drop their 8 pixel gap on a phone and take it back from 1024 up", () => {
    const root = renderFooter();
    const lists = Array.from(root.querySelectorAll("footer ul"));
    expect(lists.length).toBe(2);
    for (const ul of lists) {
      const cls = classesOf(ul);
      expect(cls).toContain("space-y-0");
      expect(cls).toContain("lg:space-y-2");
      expect(cls).toContain("text-sm");
    }
  });

  test("the footer brand line reads at 11 pixels on a phone and returns to 10 pixels from 1024 up", () => {
    const root = renderFooter();
    const tagline = Array.from(root.querySelectorAll("span")).find(
      (s) => s.textContent === "Bring people together. One story at a time."
    );
    const cls = classesOf(tagline);
    expect(cls).toContain("text-[11px]");
    expect(cls).toContain("lg:text-[10px]");
    expect(cls).toContain("whitespace-nowrap");
  });
});

// ---------------------------------------------------------------------------
// The footer reservation, which has to match the footer the classes above build
// ---------------------------------------------------------------------------

describe("phone view, footer reservation in css/fonts.css", () => {
  test("the phone reservation equals the footer height derived from the footer's own classes", () => {
    const root = renderFooter();
    const derived = derivePhoneFooterHeightPx(root);
    expect(derived).toBe(784);

    const phoneBlock = FONTS_CSS.match(
      /@media \(max-width: 767px\) \{\s*#footer-placeholder \{[\s\S]*?min-height:\s*(\d+)px;/
    );
    expect(phoneBlock).toBeTruthy();
    expect(Number(phoneBlock[1])).toBe(derived);
  });

  test("the reservation from 768 up is untouched at 320 pixels", () => {
    const desktop = FONTS_CSS.match(/#footer-placeholder \{\s*min-height:\s*(\d+)px;\s*\}/);
    expect(desktop).toBeTruthy();
    expect(Number(desktop[1])).toBe(320);
  });
});

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

const __domHandlers = [];

function loadLegalPage(markdown, page) {
  const type = (page && page.type) || "community_guidelines";
  const label = (page && page.label) || "Community Guidelines";
  document.body.innerHTML = '<div id="legal-content-host"></div><p id="legal-meta"></p>';
  document.body.setAttribute("data-legal-type", type);
  Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
  Object.defineProperty(window, "location", {
    value: { hostname: "thesharedtablestory.com" },
    writable: true,
    configurable: true,
  });
  window.__TSTS_RUNTIME__ = null;
  globalThis.fetch = async () => ({
    json: async () => ({ ok: true, data: { content: markdown, label } }),
  });

  __domHandlers.length = 0;
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler) => {
    if (event === "DOMContentLoaded") __domHandlers.push(handler);
  });

  delete window.__tstsLegalRender;
  new Function(LEGAL_SRC)();
}

async function fireDOMReady() {
  for (const h of __domHandlers) {
    try {
      await h();
    } catch (err) {
      // the render path resolves through promises; failures surface in the assertions below
    }
  }
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------
// The Expand All and Collapse All buttons on the policy pages.
// ---------------------------------------------------------------------------

// Every policy page this one builder feeds, taken from VALID_TYPES in js/legal-page.js.
const POLICY_PAGES = [
  { type: "privacy", label: "Privacy Policy" },
  { type: "terms", label: "Terms of Service" },
  { type: "host_terms", label: "Host Terms" },
  { type: "cookies", label: "Cookie Policy" },
  { type: "refund", label: "Refund Policy" },
  { type: "community_guidelines", label: "Community Guidelines" },
  { type: "acceptable_use", label: "Acceptable Use" },
];

// What the two buttons carried before the phone fix. This is the desktop truth the
// change is measured against, read at js/legal-page.js:128-129 in the real project,
// the two lines this change replaces.
const LEGAL_BUTTON_CLASSES_IN_FORCE_TODAY =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold " +
  "text-slate-600 hover:bg-slate-50 transition whitespace-nowrap";

// What they carry now: a phone sized target below 640 built out of padding alone, which is
// how the platform's other 44 pixel targets are built, and every one of the classes above
// handed back from 640 up.
const LEGAL_BUTTON_CLASSES =
  "rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold " +
  "text-slate-600 hover:bg-slate-50 transition whitespace-nowrap " +
  "sm:px-3 sm:py-1.5 sm:text-xs";

// Each phone class beside the sm: class that restores the desktop, and what that
// restored value is on the page today.
const LEGAL_BUTTON_RESTORES = [
  ["px-4", "sm:px-3", "px-3"],
  ["py-3", "sm:py-1.5", "py-1.5"],
  ["text-sm", "sm:text-xs", "text-xs"],
];

function legalButtons(host) {
  return [host.querySelector("[data-legal-expand]"), host.querySelector("[data-legal-collapse]")];
}

describe("phone view, legal page heading row", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("the heading and the two buttons stack on a phone and return to one row from 640 up", async () => {
    loadLegalPage("Intro line\n\n## Be Kind\n\nBody text\n\n## Be Safe\n\nMore body text");
    await fireDOMReady();

    const host = document.getElementById("legal-content-host");
    const heading = host.querySelector("h2");
    expect(heading.textContent).toBe("Full Community Guidelines");

    const row = heading.parentElement;
    const cls = classesOf(row);
    // The phone half: the heading takes the full width and the buttons sit on their own row under it.
    expect(cls).toContain("flex");
    expect(cls).toContain("flex-col");
    expect(cls).toContain("items-start");
    expect(cls).toContain("gap-3");
    expect(cls).toContain("mb-4");
    // The desktop half: one row, centred, spread apart, no gap, exactly as it renders today.
    expect(cls).toContain("sm:flex-row");
    expect(cls).toContain("sm:items-center");
    expect(cls).toContain("sm:justify-between");
    expect(cls).toContain("sm:gap-0");
  });

  test("Expand All and Collapse All can never break their labels across two lines", async () => {
    loadLegalPage("## Be Kind\n\nBody text");
    await fireDOMReady();

    const host = document.getElementById("legal-content-host");
    const expand = host.querySelector("[data-legal-expand]");
    const collapse = host.querySelector("[data-legal-collapse]");
    expect(expand.textContent).toBe("Expand All");
    expect(collapse.textContent).toBe("Collapse All");
    expect(classesOf(expand)).toContain("whitespace-nowrap");
    expect(classesOf(collapse)).toContain("whitespace-nowrap");
  });

  test("both buttons carry the one agreed class string on every policy page this builder feeds", async () => {
    for (const page of POLICY_PAGES) {
      loadLegalPage("## A Section\n\nBody text", page);
      await fireDOMReady();
      const host = document.getElementById("legal-content-host");
      expect(host.querySelector("h2").textContent).toBe("Full " + page.label);
      const [expand, collapse] = legalButtons(host);
      expect(expand.getAttribute("class")).toBe(LEGAL_BUTTON_CLASSES);
      expect(collapse.getAttribute("class")).toBe(LEGAL_BUTTON_CLASSES);
      expect(expand.textContent).toBe("Expand All");
      expect(collapse.textContent).toBe("Collapse All");
    }
  });

  test("every class on the two buttons is a real rule in the compiled stylesheet", async () => {
    // the guard first: a class that was never written must not be reported as compiled,
    // so a pass below cannot be a pass of a lookup that says yes to everything.
    expect(isCompiled("px-999")).toBe(false);
    expect(isCompiled("sm:py-999")).toBe(false);

    loadLegalPage("## A Section\n\nBody text");
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    for (const btn of legalButtons(host)) {
      for (const c of classesOf(btn)) {
        expect(isCompiled(c), c + " is not compiled into css/tailwind.css").toBe(true);
      }
    }
  });

  test("the phone half of the buttons carries no lg: or xl: variant, and the only variants used are sm: and hover:", async () => {
    loadLegalPage("## A Section\n\nBody text");
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    for (const btn of legalButtons(host)) {
      const cls = classesOf(btn);
      for (const c of cls) {
        expect(c.startsWith("lg:"), c + " must not reach for the 1024 breakpoint").toBe(false);
        expect(c.startsWith("xl:"), c + " must not reach for the 1280 breakpoint").toBe(false);
        const variant = c.includes(":") ? c.slice(0, c.indexOf(":") + 1) : "";
        expect(["", "sm:", "hover:"]).toContain(variant);
      }
    }
  });

  test("the classes in force from 640 up are exactly the ones the buttons carry today", async () => {
    loadLegalPage("## A Section\n\nBody text");
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    const cls = classesOf(legalButtons(host)[0]);
    const today = LEGAL_BUTTON_CLASSES_IN_FORCE_TODAY.split(/\s+/).filter(Boolean);

    // Nothing today's desktop has is lost: it is either still unprefixed or restored at sm.
    for (const c of today) {
      expect(cls.includes(c) || cls.includes("sm:" + c), c + " is not in force from 640 up").toBe(true);
    }

    // Nothing new reaches the desktop: every class that is not one of today's is a phone
    // class with its own sm: restore, and every sm: class is one of those restores.
    const phoneOnly = LEGAL_BUTTON_RESTORES.map((r) => r[0]);
    const restores = LEGAL_BUTTON_RESTORES.map((r) => r[1]);
    for (const c of cls) {
      if (c.startsWith("sm:")) {
        expect(restores, c + " is an unexpected desktop class").toContain(c);
        continue;
      }
      expect(today.includes(c) || phoneOnly.includes(c), c + " reaches the desktop unrestored").toBe(true);
    }
    for (const [phone, restore] of LEGAL_BUTTON_RESTORES) {
      expect(cls, phone + " was added without its restore").toContain(phone);
      expect(cls, restore + " is missing").toContain(restore);
    }
    expect(cls.filter((c) => c.startsWith("sm:")).sort()).toEqual(restores.slice().sort());
  });

  test("the target is 46 pixels on a phone and the same 30 pixels it is today from 640 up", async () => {
    loadLegalPage("## A Section\n\nBody text");
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    const cls = classesOf(legalButtons(host)[0]);

    // Every length below is read out of css/tailwind.css, the stylesheet these seven pages load,
    // so the box is the one the browser computes rather than a number remembered here. The single
    // value still taken on trust is the 16 pixel root font size inside compiledPx, because nothing
    // in the stylesheet sets html { font-size } and the browser default therefore applies.
    const borders = compiledPx("border", "border-width") * 2;
    expect(borders).toBe(2);

    // Phone: 12 above, 20 of text, 12 below, plus the border. Padding alone clears the minimum,
    // which is how the platform's other 44 pixel targets are built.
    const phonePad = compiledPx("py-3", "padding-top");
    expect(compiledPx("py-3", "padding-bottom")).toBe(phonePad);
    const phoneText = compiledPx("text-sm", "line-height");
    const phone = borders + phonePad * 2 + phoneText;
    expect(phone).toBe(46);
    expect(phone).toBeGreaterThanOrEqual(44);
    expect(cls).toContain("py-3");
    expect(cls).toContain("text-sm");

    // No minimum height is in play: the height is the padding box and nothing else, so there is
    // no floor to cancel from 640 up.
    expect(cls.some((c) => c.startsWith("min-h-"))).toBe(false);

    // The hand table matches the compiled file, so the header and footer tests above, which still
    // derive their heights from that table, are reading the values the stylesheet really holds.
    expect(SPACING_PX[3]).toBe(phonePad);
    expect(LINE_HEIGHT_PX.sm).toBe(phoneText);

    // From 640 up: 6 above, 16 of text, 6 below, plus the border, which is the same 30 pixels the
    // page renders today.
    expect(cls).toContain("sm:py-1.5");
    expect(cls).toContain("sm:text-xs");
    const desktopPad = compiledPx("sm:py-1.5", "padding-top");
    const desktopText = compiledPx("sm:text-xs", "line-height");
    const desktop = borders + desktopPad * 2 + desktopText;
    expect(desktop).toBe(30);
    expect(SPACING_PX["1.5"]).toBe(desktopPad);
    expect(LINE_HEIGHT_PX.xs).toBe(desktopText);

    // Adjacent targets need 8 pixels between them, which the row they sit in already gives.
    const row = legalButtons(host)[0].parentElement;
    expect(spacingFromClass(classesOf(row), "gap-")).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// The single rule that protects the desktop: no phone class without its restore
// ---------------------------------------------------------------------------

describe("phone view, desktop guard", () => {
  test("every phone only class added to the shared header and footer carries its desktop restore", () => {
    const header = renderHeader();
    const menuCls = classesOf(header.querySelector("#mobile-menu-btn"));
    expect(menuCls).toContain("lg:hidden"); // the button is not rendered at all from 1024 up

    const footer = renderFooter();
    for (const a of footer.querySelectorAll("footer ul a")) {
      const cls = classesOf(a);
      if (cls.includes("block")) expect(cls).toContain("lg:inline");
      if (cls.some((c) => /^py-\d/.test(c))) expect(cls).toContain("lg:py-0");
    }
    for (const ul of footer.querySelectorAll("footer ul")) {
      expect(classesOf(ul)).toContain("lg:space-y-2");
    }
    const tagline = Array.from(footer.querySelectorAll("span")).find(
      (s) => s.textContent === "Bring people together. One story at a time."
    );
    expect(classesOf(tagline)).toContain("lg:text-[10px]");
  });

  test("every phone only class added to the legal page buttons carries its desktop restore", async () => {
    loadLegalPage("## A Section\n\nBody text");
    await fireDOMReady();
    const host = document.getElementById("legal-content-host");
    for (const btn of legalButtons(host)) {
      const cls = classesOf(btn);
      for (const [phone, restore] of LEGAL_BUTTON_RESTORES) {
        expect(cls, phone + " was added without its restore").toContain(phone);
        expect(cls, restore + " is missing").toContain(restore);
      }
      expect(cls.some((c) => c.startsWith("lg:") || c.startsWith("xl:"))).toBe(false);
    }
  });
});
