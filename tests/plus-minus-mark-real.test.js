// REAL coverage for window.tstsPlusMinus — the shared expand/collapse mark (js/common.js).
//
// WHY THIS FILE EXISTS:
//   sir kept seeing the same defect come back: "why do i see plus and minu sign bottom aligned
//   instead of proper center aligned with right margin", then — after I fixed only the one control
//   in front of him — "this is applicable to entire site whereever there is plus minus expand
//   collpas".
//
//   The cause was that "+" and "−" were TEXT. A glyph sits on a baseline inside a line box that
//   reserves space the mark never occupies, so centring the box left the mark off-centre by a
//   different amount per character, per size, per font. Each time I "fixed" it with a translateY
//   nudge, the nudge was tied to one font at one size and the defect returned somewhere else.
//
//   The mark is now geometry, not type. These tests pin the two properties that make that true —
//   if anyone swaps a text glyph back in, or moves the crossbar between states, they fail here
//   instead of on sir's screen.
//
// Global CLAUDE.md Rule 15: a shared primitive whose breakage is SILENT is exactly the category
// that must carry a test in the same turn as the code.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");

beforeAll(() => {
  document.body.innerHTML = "";
  // common.js is a big file of page helpers; only the two functions under test are needed, and
  // evaluating the whole thing is what proves they are actually EXPORTED from the real source
  // rather than re-declared here.
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(SRC);
  } catch (_e) {
    void _e; // page-bootstrap side effects are irrelevant; the exports land before they run
  }
});

describe("the mark is drawn, never typed", () => {
  test("common.js exports both helpers", () => {
    expect(typeof window.tstsPlusMinus).toBe("function");
    expect(typeof window.tstsSetPlusMinus).toBe("function");
  });

  test("it returns an SVG, not a text node — a glyph on a baseline is the defect", () => {
    const mark = window.tstsPlusMinus(false);
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(mark.textContent.trim()).toBe("");
  });

  test("it scales with the surrounding font size instead of pinning a pixel size", () => {
    const mark = window.tstsPlusMinus(false);
    expect(mark.style.width).toBe("1em");
    expect(mark.style.height).toBe("1em");
  });

  test("it is display:block so no inline baseline gap sits under the box", () => {
    expect(window.tstsPlusMinus(false).style.display).toBe("block");
  });

  test("it is hidden from screen readers — the button's own label carries the meaning", () => {
    expect(window.tstsPlusMinus(false).getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the mark is centred by geometry", () => {
  const crossbarOf = (m) => m.querySelector("path:not([data-pm-stem])").getAttribute("d");
  const stemOf = (m) => m.querySelector("[data-pm-stem]").getAttribute("d");

  test("the crossbar's y sits on the viewBox centre", () => {
    const mark = window.tstsPlusMinus(false);
    const [, , w, h] = mark.getAttribute("viewBox").split(/\s+/).map(Number);
    // "M4 8 H12" reads x0, y, x1 — IN THAT ORDER. Reading the leading 4 as the y is what made
    // this test fail on its first run against code that was already correct.
    const [, x0, y, x1] = crossbarOf(mark).match(/M([\d.]+) ([\d.]+) H([\d.]+)/).map(Number);
    expect(y).toBe(h / 2);
    expect((x0 + x1) / 2).toBe(w / 2);
  });

  test("the upright's x sits on the viewBox centre", () => {
    const mark = window.tstsPlusMinus(false);
    const [, , w, h] = mark.getAttribute("viewBox").split(/\s+/).map(Number);
    const [, x, y0, y1] = stemOf(mark).match(/M([\d.]+) ([\d.]+) V([\d.]+)/).map(Number);
    expect(x).toBe(w / 2);
    expect((Number(y0) + Number(y1)) / 2).toBe(h / 2);
  });

  test("the two bars are the same length, so the plus is square", () => {
    const mark = window.tstsPlusMinus(false);
    const [, x0, , x1] = crossbarOf(mark).match(/M([\d.]+) ([\d.]+) H([\d.]+)/).map(Number);
    const [, , y0, y1] = stemOf(mark).match(/M([\d.]+) ([\d.]+) V([\d.]+)/).map(Number);
    expect(x1 - x0).toBe(y1 - y0);
  });
});

describe("flipping state cannot move the mark", () => {
  test("collapsed shows both bars", () => {
    const mark = window.tstsPlusMinus(false);
    expect(mark.querySelector("[data-pm-stem]").style.display).not.toBe("none");
  });

  test("expanded hides only the upright, leaving a minus", () => {
    const mark = window.tstsPlusMinus(true);
    expect(mark.querySelector("[data-pm-stem]").style.display).toBe("none");
    expect(mark.querySelector("path:not([data-pm-stem])")).toBeTruthy();
  });

  test("the crossbar is the SAME path in both states — this is why the sign stops jumping", () => {
    const plus = window.tstsPlusMinus(false);
    const minus = window.tstsPlusMinus(true);
    const d = (m) => m.querySelector("path:not([data-pm-stem])").getAttribute("d");
    expect(d(plus)).toBe(d(minus));
  });

  test("setPlusMinus flips in place without replacing the node", () => {
    const mark = window.tstsPlusMinus(false);
    const stem = mark.querySelector("[data-pm-stem]");
    window.tstsSetPlusMinus(mark, true);
    expect(stem.style.display).toBe("none");
    window.tstsSetPlusMinus(mark, false);
    expect(stem.style.display).not.toBe("none");
    expect(mark.querySelector("[data-pm-stem]")).toBe(stem);
  });

  test("setPlusMinus survives being handed nothing", () => {
    expect(() => window.tstsSetPlusMinus(null, true)).not.toThrow();
    expect(() => window.tstsSetPlusMinus(undefined, false)).not.toThrow();
    expect(() => window.tstsSetPlusMinus({}, true)).not.toThrow();
  });
});

describe("weight and colour stay with the caller", () => {
  test("stroke defaults to 2 and is overridable for lighter rows", () => {
    const bold = window.tstsPlusMinus(false);
    const light = window.tstsPlusMinus(false, { stroke: 1.7 });
    expect(bold.querySelector("path").getAttribute("stroke-width")).toBe("2");
    expect(light.querySelector("path").getAttribute("stroke-width")).toBe("1.7");
  });

  test("colour is currentColor so the existing text-* class still governs it", () => {
    const mark = window.tstsPlusMinus(false);
    mark.querySelectorAll("path").forEach((p) => {
      expect(p.getAttribute("stroke")).toBe("currentColor");
    });
  });
});

describe("every expand/collapse toggle on the site uses it", () => {
  // sir's scope, verbatim: "this is applicable to entire site whereever there is plus minus expand
  // collpas". A grep guard is the only thing that keeps a future toggle from being typed by hand.
  const files = ["common.js", "faq-contextual.js", "my-bookings.js"];

  // A +/− assigned as element text is the pattern that caused this defect. The sign must be the
  // WHOLE value — `"+" + (n - 1)` is the "+3 more guests" badge and `"+" + delta` is a rating
  // change; both are legitimate labels, not toggles, and both were wrongly caught when this guard
  // first ran.
  const TYPED_GLYPH = /(?:textContent\s*[:=]|setText\s*\([^,]+,)\s*(?:[^\n]*?\?\s*)?["'](?:\+|−)["']\s*(?:[,;)}]|:|$)/;

  test("the guard itself catches the regression it exists to catch", () => {
    // Every line here is a real one this codebase carried before the fix. A guard that has never
    // been shown to fire is not a guard.
    [
      'toggleGlyph.textContent = nowHidden ? "+" : "−";',
      '__chatGlyph.textContent = nowHidden ? "+" : "−";',
      'glyph.textContent = nowHidden ? "+" : "−";',
      'pastGlyph.textContent = h ? "+" : "−";',
      'qIcon.textContent = "+";',
      'setText(icon, "−");',
      'setText(toggleIconSpan, "+");',
      'var g = El("span", { className: "text-xl", textContent: expanded ? "−" : "+" });',
    ].forEach((bad) => expect(TYPED_GLYPH.test(bad)).toBe(true));
  });

  test("the guard leaves legitimate +N labels alone", () => {
    [
      'var moreBtn = El("button", { textContent: "+" + (ppl.length - 1) });',
      'El("span", { textContent: "+" + Number(delta || 0).toFixed(1) })',
      'el.textContent = "A$" + amount;',
      'countEl.textContent = n + " messages";',
    ].forEach((good) => expect(TYPED_GLYPH.test(good)).toBe(false));
  });

  test("no toggle writes a plus or minus CHARACTER into the DOM any more", () => {
    const offenders = [];
    files.forEach((f) => {
      const src = readFileSync(resolve(__dirname, "..", "js", f), "utf-8");
      src.split("\n").forEach((line, i) => {
        if (TYPED_GLYPH.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    });
    expect(offenders).toEqual([]);
  });
});
