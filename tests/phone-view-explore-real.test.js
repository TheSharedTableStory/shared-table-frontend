// REAL coverage for the Explore PHONE view, sir's order O-103: "fix all phone view for the
// website pages using agent without losing anything on desktop website".
//
// THE TWO GAPS THIS PINS (audit 2026-09-13, captures phone-before-2026-09-13/):
//
//   PHONE-explore-1  The four search fields stacked into a 232 pixel tower, so on a 375 wide
//                    phone the first experience card started 472 pixels down and the page
//                    opened on search chrome instead of on what is being sold. The field group
//                    is now a two column grid below 768 with the search box spanning both
//                    columns, and it goes back to a single flex row at 768 and above.
//
//   PHONE-explore-2  Sort and Filters huddled at the left of their own row with 147 pixels of
//                    dead space beside them. Below 768 the pair now shares the row evenly: two
//                    halves of the same width, each filled by its own control.
//
// WHY THE ASSERTIONS LOOK THE WAY THEY DO:
//
//   1. Everything is read out of the REAL files, never a hand written copy: explore.html for the
//      markup and the page style block, js/explore.js for the ids the script binds, and
//      css/tailwind.css to prove every utility class in the changed strings actually compiles.
//      A Tailwind class that is not in the compiled sheet renders NOTHING while looking correct
//      in source, which is a failure this project has already paid for once (see the safelist
//      comment in tailwind.config.js).
//
//   2. Desktop is the thing that must not move. Every changed string in the row carries no lg:,
//      xl: or 2xl: variant, and the one hand written rule is inside a max-width query that stops at
//      767.98px. The Sort menu is the single exception, and it is pinned rather than waived: its
//      only desktop variants are xl:left-auto and xl:right-0, the pair that gives it back today's
//      box from 1280 up, and the tests below read that box out of the compiled sheet.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPLORE_HTML = readFileSync(resolve(__dirname, "..", "explore.html"), "utf-8");
const EXPLORE_JS = readFileSync(resolve(__dirname, "..", "js", "explore.js"), "utf-8");
const TAILWIND_CSS = readFileSync(resolve(__dirname, "..", "css", "tailwind.css"), "utf-8");

// --- lift the real markup, anchored on structure rather than on line numbers -----------------

// The field group and the search wrapper are the two <div>s that open immediately above the
// search input's label, so this match breaks loudly if either is moved or re-nested.
const FIELD_BLOCK_RE =
  /<div class="([^"]*)">\s*\n\s*<div class="([^"]*)">\s*\n\s*<label for="search-input"/;
const fieldBlock = EXPLORE_HTML.match(FIELD_BLOCK_RE);
if (!fieldBlock) throw new Error("explore.html no longer opens the field group and the search wrapper above the search input label");
const FIELD_GROUP_CLASSES = fieldBlock[1].split(/\s+/).filter(Boolean);
const SEARCH_WRAP_CLASSES = fieldBlock[2].split(/\s+/).filter(Boolean);

// The Sort and Filters row is the <div> that opens directly above the "Near me" comment.
const CONTROL_ROW_RE = /<div class="([^"]*)">\s*\n\s*<!-- Near me lives inside the filter panel/;
const controlRow = EXPLORE_HTML.match(CONTROL_ROW_RE);
if (!controlRow) throw new Error("explore.html no longer opens the Sort and Filters row above the Near me comment");
const CONTROL_ROW_CLASSES = controlRow[1].split(/\s+/).filter(Boolean);

function classesOfId(html, id) {
  const re = new RegExp(`<(?:div|button|input)\\b[^>]*\\bid="${id}"[^>]*>`, "i");
  const openTag = html.match(re);
  if (!openTag) throw new Error(`explore.html no longer contains an element with id="${id}"`);
  const cls = openTag[0].match(/\bclass="([^"]*)"/);
  return cls ? cls[1].split(/\s+/).filter(Boolean) : [];
}

const SORT_WRAP_CLASSES = classesOfId(EXPLORE_HTML, "sort-wrap");
const SORT_BTN_CLASSES = classesOfId(EXPLORE_HTML, "sort-btn");
const SORT_MENU_CLASSES = classesOfId(EXPLORE_HTML, "sort-menu");
const FILTER_BTN_CLASSES = classesOfId(EXPLORE_HTML, "filter-btn");

// explore.html carries more than one <style> block (the Flatpickr brand overrides sit in the
// first one), so every block is read, not just the first.
const STYLE_BLOCK = [...EXPLORE_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1])
  .join("\n");

// The phone only block, sliced out by brace matching rather than by a line number, so every
// assertion below is about the rule that actually ships and never about a string that merely
// happens to sit somewhere in the file.
function phoneBlock() {
  const start = STYLE_BLOCK.indexOf("@media (max-width: 767.98px)");
  if (start === -1) throw new Error("explore.html no longer carries the phone only media query");
  let depth = 0;
  for (let i = STYLE_BLOCK.indexOf("{", start); i < STYLE_BLOCK.length; i++) {
    if (STYLE_BLOCK[i] === "{") depth += 1;
    else if (STYLE_BLOCK[i] === "}") {
      depth -= 1;
      if (depth === 0) return STYLE_BLOCK.slice(start, i + 1);
    }
  }
  throw new Error("the phone only media query is never closed");
}
const PHONE_BLOCK = phoneBlock();

// --- does this utility class actually exist in the compiled sheet? ---------------------------

function compiles(cls) {
  const selector = "." + cls.replace(/[:./[\]]/g, (ch) => "\\" + ch);
  // Minified Tailwind writes `.sel{...}`, `.sel,.other{...}`, or, for a state variant,
  // `.sel:hover{...}`, so all three endings count as compiled.
  return (
    TAILWIND_CSS.includes(selector + "{") ||
    TAILWIND_CSS.includes(selector + ",") ||
    TAILWIND_CSS.includes(selector + ":")
  );
}

// --- what does the compiled sheet actually SAY for this class? --------------------------------
//
// compiles() answers "is the selector in the sheet at all". ruleFor() and enclosingMedia() answer
// the next question, which is the one gap 36 turns on: does the rule say what the class string
// claims, is the xl: copy of it inside a 1280 block, and is it written after the base rule, which
// is the only reason it wins there. Two single class selectors carry the same weight, so source
// order is the whole cascade and it is read here rather than assumed.
//
// These are file reads, not measurements. vitest runs in jsdom, which has no layout engine, so
// this suite never claims a pixel: the widths quoted in the comments were measured in headless
// Chrome and the assertions below prove the rules those measurements came from.

function ruleFor(cls) {
  const selector = "." + cls.replace(/[:./[\]]/g, (ch) => "\\" + ch);
  // The ending matters: `.left-0` is a prefix of `.left-0\.5`, so a bare indexOf could land on a
  // different class's rule and quietly pass.
  const at = ["{", ",", ":"]
    .map((end) => TAILWIND_CSS.indexOf(selector + end))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b)[0];
  if (at === undefined) return null;
  const open = TAILWIND_CSS.indexOf("{", at);
  const close = TAILWIND_CSS.indexOf("}", open);
  if (open === -1 || close === -1) return null;
  return { at, body: TAILWIND_CSS.slice(open + 1, close) };
}

// Which @media block, if any, actually encloses this index. Looking backwards for the nearest
// "@media" is not enough: the components layer carries the .container rules inside their own
// breakpoint blocks, and those blocks are CLOSED long before the utilities layer begins, so the
// nearest @media behind a base utility is a block that utility is not in. This walks the braces
// and answers with the block still open at that index, and with "" at the top level.
function enclosingMedia(index) {
  const stack = [];
  let pending = null;
  let i = 0;
  while (i < index) {
    if (TAILWIND_CSS.startsWith("@media", i)) {
      const brace = TAILWIND_CSS.indexOf("{", i);
      if (brace === -1) break;
      pending = TAILWIND_CSS.slice(i, brace).trim();
      i = brace;
      continue;
    }
    const ch = TAILWIND_CSS[i];
    if (ch === "{") {
      stack.push(pending);
      pending = null;
    } else if (ch === "}") {
      stack.pop();
    }
    i += 1;
  }
  for (let k = stack.length - 1; k >= 0; k -= 1) if (stack[k]) return stack[k];
  return "";
}

const RESPONSIVE = /^(sm|md|lg|xl|2xl):/;
const DESKTOP_VARIANTS = /^(lg|xl|2xl):/;

describe("Explore phone view, the search block (PHONE-explore-1)", () => {
  test("the field group is a two column grid on a phone", () => {
    expect(FIELD_GROUP_CLASSES).toEqual(
      expect.arrayContaining(["grid", "grid-cols-2", "gap-2"])
    );
    // The old stacking class is gone. While it was there every field was its own full width
    // row, which is the 232 pixel tower the audit measured.
    expect(FIELD_GROUP_CLASSES).not.toContain("flex-col");
  });

  test("the search box spans both columns, so it stays full width on a phone", () => {
    expect(SEARCH_WRAP_CLASSES).toEqual(expect.arrayContaining(["relative", "col-span-2"]));
  });

  test("the single desktop row is restored at 768 and above", () => {
    // md:flex beats the base .grid because Tailwind emits its media blocks after the base
    // utilities, so from 768 up this div is display:flex, flex-direction:row, exactly as before.
    expect(FIELD_GROUP_CLASSES).toEqual(expect.arrayContaining(["md:flex", "md:flex-row"]));
    // flex-grow is unprefixed and keeps the group growing inside the outer row at every width,
    // as it did before. It is inert while the div is a grid container's child layout.
    expect(FIELD_GROUP_CLASSES).toContain("flex-grow");
    // The search wrapper keeps its unprefixed flex-grow too, so at 768 and above it grows
    // exactly as it always has. col-span-2 has no meaning on a flex item, so it costs nothing.
    expect(SEARCH_WRAP_CLASSES).toContain("flex-grow");
  });

  test("City, Pick a date and Guests are untouched, so each still owns its desktop width", () => {
    expect(EXPLORE_HTML).toContain('<div class="relative w-full md:w-48">');
    expect(EXPLORE_HTML).toContain('<div class="relative w-full md:w-40">');
    expect(EXPLORE_HTML).toContain('<div class="relative w-full md:w-32">');
  });

  test("every class on the changed search block compiles into css/tailwind.css", () => {
    const missing = [...FIELD_GROUP_CLASSES, ...SEARCH_WRAP_CLASSES].filter((c) => !compiles(c));
    expect(missing).toEqual([]);
  });
});

describe("Explore phone view, the Sort and Filters row (PHONE-explore-2)", () => {
  test("the row itself is unchanged, so it is the children that fill it", () => {
    expect(CONTROL_ROW_CLASSES).toEqual(["flex", "gap-2", "items-center"]);
  });

  test("a phone only rule makes Sort and Filters share the row evenly", () => {
    const rule = STYLE_BLOCK.match(
      /@media \(max-width: 767\.98px\) \{\s*#sort-wrap,\s*#filter-btn \{ flex: 1 1 calc\(50% - 4px\); \}\s*#sort-btn \{ width: 100%; \}\s*\}/
    );
    expect(rule).not.toBeNull();
  });

  test("the phone rule widens the Sort button itself, not only its wrapper", () => {
    // A button is sized by its own content even at display:flex, so widening #sort-wrap on its
    // own left the control behind: measured in headless Chrome at 375, the wrapper came out
    // 146.5 wide and the button stayed 82.77 inside it, with the word Sort marooned in the left
    // half of an empty box. width:100% is what makes the control fill the half it is given, and
    // it measures 167.5 with the rule below in place.
    expect(PHONE_BLOCK).toMatch(/#sort-btn \{ width: 100%; \}/);
  });

  test("the halves are shared as border boxes, so the Filters padding cannot swell one of them", () => {
    // A flex basis of 0 is shared out as content boxes. #filter-btn carries its own px-5 (20 a
    // side) and a 1px border, #sort-wrap is a bare positioning div that carries neither, so the
    // 42 pixels of padding and border landed on top of the Filters half: measured at 375, the
    // two halves came out 146.5 and 188.5. calc(50% - 4px) is half the row less half the 8 pixel
    // gap, a length each control's own padding and border sit inside, and both halves measure
    // 167.5. The old basis must be gone, not merely outranked.
    expect(PHONE_BLOCK).toMatch(/#sort-wrap,\s*#filter-btn \{ flex: 1 1 calc\(50% - 4px\); \}/);
    expect(PHONE_BLOCK).not.toMatch(/flex: 1 1 0%/);
  });

  test("the Sort label centres itself once the button is widened", () => {
    // The button now spans its half, so without justify-center the word Sort would hug the left
    // edge of a 167 pixel control while Filters stayed centred. At 768 and above the wrapper is
    // content sized again, so the free space is zero and centring moves nothing.
    expect(SORT_BTN_CLASSES).toContain("justify-center");
    expect(FILTER_BTN_CLASSES).toContain("justify-center");
  });

  test("nothing in the row carries a width or flex class that could fire on desktop", () => {
    for (const cls of [...SORT_WRAP_CLASSES, ...SORT_BTN_CLASSES, ...FILTER_BTN_CLASSES]) {
      expect(cls).not.toMatch(/^(flex-1|w-full)$/);
    }
  });

  test("every class on the changed Sort button compiles into css/tailwind.css", () => {
    const missing = SORT_BTN_CLASSES.filter((c) => !compiles(c));
    expect(missing).toEqual([]);
  });
});

describe("Explore phone view, the Sort menu opens inside the screen (gap 36)", () => {
  // THE MENU: 224 pixels wide at every width, which is the width sir approved on 2026-05-02.
  //
  // THE GAP: the menu was hung off the RIGHT edge of #sort-wrap at every width. The outer row is
  // flex-col until xl, so below 1280 the Sort and Filters line is its own full width line and the
  // wrapper sits at the LEFT of it, starting at the container's left padding: 167.5 wide at 375
  // (16 to 183.5), 83 wide at 768 (16 to 99), 83 wide at 1279 (143.5 to 226.5). A 224 pixel menu
  // hung off the right edge of a wrapper that narrow starts 40.5 pixels off the left of a 375
  // phone and 125 pixels off the left at 768, so the left edge of every option sat off the screen.
  //
  // THE FIX: below 1280 the menu hangs off the wrapper's LEFT edge, so it starts where the wrapper
  // starts and ends 224 later, inside the screen at 320, 375, 768 and 1279 alike. The width is a
  // fixed 224 and never the wrapper's own, so a filter being active, which puts the Clear pill in
  // the row and shrinks the wrapper, cannot narrow the menu and wrap the seven options.
  //
  // FROM 1280 the outer row is one line, the wrapper is content sized at the RIGHT of it, and
  // xl:left-auto with xl:right-0 over the unprefixed w-56 give left:auto, right:0, width:14rem,
  // which is the box that ships today.

  test("the whole class string is pinned, so nothing drifts into it unseen", () => {
    expect(SORT_MENU_CLASSES).toEqual([
      "hidden",
      "absolute",
      "left-0",
      "w-56",
      "xl:left-auto",
      "xl:right-0",
      "mt-2",
      "bg-white",
      "border",
      "border-gray-200",
      "rounded-xl",
      "shadow-lg",
      "z-50",
      "py-1",
    ]);
  });

  test("below 1280 the menu is anchored to the left edge of its wrapper", () => {
    expect(SORT_MENU_CLASSES).toEqual(expect.arrayContaining(["absolute", "left-0"]));
    // The old anchoring must be GONE from the base layer, not merely outranked higher up: an
    // unprefixed right-0 still fires on a phone, and that is the gap itself.
    expect(SORT_MENU_CLASSES).not.toContain("right-0");
    // #sort-wrap is the positioned ancestor, so left-0 is read against the wrapper and never
    // against the page.
    expect(SORT_WRAP_CLASSES).toContain("relative");
  });

  test("the menu is 224 pixels wide whatever its wrapper measures", () => {
    // w-56 is unprefixed, so the width is the same 224 at 320, 375, 768, 1279 and 1440. The
    // wrapper's own width is none of those numbers and changes again when the Clear pill joins the
    // row, so a wrapper relative width is what wrapped five of the seven options at 375.
    expect(SORT_MENU_CLASSES).toContain("w-56");
    expect(SORT_MENU_CLASSES).not.toContain("w-full");
    expect(SORT_MENU_CLASSES.filter((c) => /^(sm|md|lg|xl|2xl):w-/.test(c))).toEqual([]);
  });

  test("no md: variant is left on the menu, so nothing about it changes at 768", () => {
    expect(SORT_MENU_CLASSES.filter((c) => c.startsWith("md:"))).toEqual([]);
  });

  test("from 1280 up the menu is exactly the menu that is there today", () => {
    expect(SORT_MENU_CLASSES).toEqual(expect.arrayContaining(["xl:left-auto", "xl:right-0"]));
    // Everything that is not geometry is byte identical to today's string, in today's order, so
    // the white ground, the border, the rounded corner, the shadow, the stacking and the padding
    // cannot have moved with the anchoring.
    const geometry = new Set(["left-0", "w-56", "xl:left-auto", "xl:right-0"]);
    expect(SORT_MENU_CLASSES.filter((c) => !geometry.has(c))).toEqual([
      "hidden",
      "absolute",
      "mt-2",
      "bg-white",
      "border",
      "border-gray-200",
      "rounded-xl",
      "shadow-lg",
      "z-50",
      "py-1",
    ]);
  });

  test("every class on the Sort menu compiles into css/tailwind.css", () => {
    const missing = SORT_MENU_CLASSES.filter((c) => !compiles(c));
    expect(missing).toEqual([]);
  });

  test("the compiled rules say what the class string claims", () => {
    expect(ruleFor("left-0").body).toMatch(/left:\s*0(px)?\b/);
    // w-56 is 14rem, which is the 224 pixels the approved menu measures.
    expect(ruleFor("w-56").body).toMatch(/width:\s*14rem/);
    expect(ruleFor("xl:left-auto").body).toMatch(/left:\s*auto/);
    expect(ruleFor("xl:right-0").body).toMatch(/right:\s*0(px)?\b/);
  });

  test("the xl: rules sit in a 1280 block and are written after the base one, which is why they win", () => {
    const base = ruleFor("left-0");
    expect(base).not.toBeNull();
    for (const cls of ["xl:left-auto", "xl:right-0"]) {
      const rule = ruleFor(cls);
      expect(rule).not.toBeNull();
      expect(enclosingMedia(rule.at)).toMatch(/min-width:\s*1280px/);
      expect(rule.at).toBeGreaterThan(base.at);
    }
  });

  test("the 224 pixel width is in no media block, so it holds on both sides of 1280", () => {
    const w = ruleFor("w-56");
    expect(w).not.toBeNull();
    expect(enclosingMedia(w.at)).toBe("");
  });

  test("no hand written rule reaches the menu, so the class string is the whole truth", () => {
    // The page style block is the only hand written stylesheet on this page. If it never names the
    // menu, the assertions above are the complete account of where the menu sits at any width.
    expect(STYLE_BLOCK).not.toMatch(/#sort-menu/);
  });

  test("the script still only shows and hides the menu, and never positions it", () => {
    // If the script ever set left, right, width or a transform on the menu, the class string would
    // stop being the truth and this fix would be fighting an inline style. It toggles .hidden and
    // aria-expanded, nothing else, so the classes decide the geometry alone.
    expect(EXPLORE_JS).toContain('sortMenu.classList.remove("hidden")');
    expect(EXPLORE_JS).toContain('sortMenu.classList.add("hidden")');
    expect(EXPLORE_JS).not.toMatch(/sortMenu\.style\b/);
    expect(EXPLORE_JS).not.toMatch(/sortMenu\.setAttribute\(\s*"style"/);
  });
});

describe("Desktop is untouched: the row at every width, the menu from 1280", () => {
  test("no changed class string outside the Sort menu carries an lg:, xl: or 2xl: variant", () => {
    const all = [
      ...FIELD_GROUP_CLASSES,
      ...SEARCH_WRAP_CLASSES,
      ...CONTROL_ROW_CLASSES,
      ...SORT_WRAP_CLASSES,
      ...SORT_BTN_CLASSES,
    ];
    expect(all.filter((c) => DESKTOP_VARIANTS.test(c))).toEqual([]);
  });

  test("the Sort menu's only desktop variants are the pair that gives back today's box", () => {
    // The menu is the one string allowed a desktop variant, because 1280 is where the outer row
    // becomes one line and the wrapper moves to the right of it. Pinned exactly, so a third
    // variant cannot be added without this going red.
    expect(SORT_MENU_CLASSES.filter((c) => DESKTOP_VARIANTS.test(c))).toEqual([
      "xl:left-auto",
      "xl:right-0",
    ]);
  });

  test("the only responsive variants added are md:, which is 768", () => {
    const variants = [...FIELD_GROUP_CLASSES, ...SEARCH_WRAP_CLASSES]
      .filter((c) => RESPONSIVE.test(c))
      .map((c) => c.split(":")[0]);
    expect([...new Set(variants)]).toEqual(["md"]);
  });

  test("the hand written rule is a max-width query and never a min-width one", () => {
    const phoneRuleAt = STYLE_BLOCK.indexOf("#sort-wrap,");
    expect(phoneRuleAt).toBeGreaterThan(-1);
    const queryBefore = STYLE_BLOCK.lastIndexOf("@media", phoneRuleAt);
    expect(STYLE_BLOCK.slice(queryBefore, phoneRuleAt)).toContain("max-width: 767.98px");
    expect(STYLE_BLOCK).not.toMatch(/@media[^{]*min-width[^{]*\{[^}]*#(sort-wrap|filter-btn)/);
  });

  test("Sort and Filters are sized nowhere outside the phone query", () => {
    // The page style block is the only hand written stylesheet on this page, so if none of the
    // three ids appears outside the max-width block, no hand written rule can reach a tablet or
    // a desktop. Measured either side of the edge with the fix in place: at 767 the halves are
    // 300 and 300, at 768 they are back to 82.77 and 106.13, the widths they have today.
    const outside = STYLE_BLOCK.split(PHONE_BLOCK).join("");
    expect(outside).not.toMatch(/#sort-wrap/);
    expect(outside).not.toMatch(/#sort-btn/);
    expect(outside).not.toMatch(/#filter-btn/);
  });

  test("the outer row still switches to one line at xl, which is where it always did", () => {
    expect(EXPLORE_HTML).toContain('<div class="flex flex-col xl:flex-row gap-4">');
  });
});

describe("The script's own hooks survive the change", () => {
  // The fix is class and stylesheet work only. If it had moved, renamed or dropped an id, every
  // control on this row would go dead in silence, so the ids are read back out of js/explore.js.
  const SEARCH_SHELL_IDS = [
    "search-input",
    "location-input",
    "date-input",
    "guests-input",
    "explore-city-suggestions",
    "sort-select",
    "sort-wrap",
    "sort-btn",
    "sort-menu",
    "near-me-btn",
    "clear-filters-btn",
    "filter-btn",
    "filter-btn-label",
    "filter-count-badge",
    "filter-panel",
  ];

  test("every control id in the search shell is still in the page", () => {
    const missing = SEARCH_SHELL_IDS.filter((id) => !EXPLORE_HTML.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });

  test("every id the page script looks up by name is one the page still offers", () => {
    // Ids the script reads for elements that live in other files (the shared navbar and footer
    // are injected by common.js) are not expected in explore.html, so the check is scoped to the
    // search shell ids above, read back out of the real script source.
    const bound = new Set(
      [...EXPLORE_JS.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1])
    );
    const boundHere = SEARCH_SHELL_IDS.filter((id) => bound.has(id));
    // Sanity: the script really does bind most of this row, so a silent regex miss cannot make
    // this test pass by checking nothing.
    expect(boundHere.length).toBeGreaterThanOrEqual(12);
    for (const id of boundHere) {
      expect(EXPLORE_HTML).toContain(`id="${id}"`);
    }
  });

  test("the sort menu still has all three elements its binding needs", () => {
    // bindSortMenu() returns early unless sort-btn, sort-menu and sort-wrap are all present.
    expect(EXPLORE_JS).toContain('document.getElementById("sort-wrap")');
    for (const id of ["sort-btn", "sort-menu", "sort-wrap"]) {
      expect(EXPLORE_HTML).toContain(`id="${id}"`);
    }
    expect(EXPLORE_HTML).toContain('data-sort-value=""');
  });
});
