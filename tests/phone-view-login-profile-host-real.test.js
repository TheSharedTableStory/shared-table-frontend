// REAL phone-view coverage for the three rows changed under sir's order O-103:
// "fix all phone view for the website pages using agent without losing anything
// on desktop website".
//
// Findings: PHONE-login-1 (login.html:67), PHONE-profile-1 (profile.html:109),
// PHONE-host-1 (host.html:122) in DOCS/Audits/Evidence/phone-audit-2026-09-13.json.
//
// Extended under sir's order O-118 for gap 35: login.html:167, the same offer of
// the other form sitting under the sign-up button, which read at 12 pixels on a
// phone while its twin on line 67 read at 14. Same treatment, same proof.
//
// Nothing here is mocked. Every assertion is read off the real files on disk:
// login.html, profile.html, host.html, js/login.js, js/profile.js, js/host.js and
// the compiled stylesheet css/tailwind.css. The stylesheet is parsed into its real
// rules so the test can answer the only question that matters for this change:
// what a browser applies below 640 pixels, and whether what it applies at 640,
// 768, 1024 and 1440 is still exactly what it applied before the change.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = resolve(__dirname, "..");
const read = (f) => readFileSync(resolve(ROOT, f), "utf-8");
const lines = (f) => read(f).split("\n");
const parse = (f) => new JSDOM(read(f)).window.document;

const CSS = read("css/tailwind.css");

// ---------------------------------------------------------------------------
// The three class strings as they stood before O-103 (the audit's quoted lines),
// the strings expected after it, and the strings actually on the pages right now.
// Every breakpoint assertion below runs against the live strings, so a class
// dropped from the markup fails these tests and not only the pinning ones.
// ---------------------------------------------------------------------------
const LOGIN_ROW_BEFORE = "flex items-center justify-center gap-4 text-xs text-slate-500";
const LOGIN_ROW_EXPECTED =
  "flex flex-col items-center justify-center gap-2 text-sm text-slate-500 sm:flex-row sm:gap-4 sm:text-xs";

// Gap 35 (sir's order O-118): the twin sentence under the Create Account button.
const SIGNUP_SWITCH_BEFORE = "text-center text-xs text-slate-500";
const SIGNUP_SWITCH_EXPECTED = "text-center text-sm text-slate-500 sm:text-xs";
const SIGNUP_SWITCH_BUTTON = "font-bold text-orange-600 hover:underline";

const MOBILE_INPUT_BEFORE =
  "flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none";
const MOBILE_INPUT_EXPECTED =
  "flex-1 min-w-0 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none";

const WIZARD_ROW_BEFORE = "flex items-center justify-between text-xs mb-3 gap-1";
const WIZARD_ROW_EXPECTED =
  "grid grid-cols-3 gap-x-3 gap-y-1 text-xs mb-3 sm:flex sm:items-center sm:justify-between sm:gap-1";

// Read off the pages as they are on disk.
const LOGIN_ROW_NOW = parse("login.html")
  .getElementById("btn-forgot-password").parentElement.getAttribute("class");
const SIGNUP_SWITCH_NOW = parse("login.html")
  .getElementById("switch-to-login").parentElement.getAttribute("class");
const MOBILE_INPUT_NOW = parse("profile.html").getElementById("mobile").getAttribute("class");
const WIZARD_ROW_NOW = parse("host.html")
  .querySelector("#wizard-progress > div").getAttribute("class");

const DESKTOP_WIDTHS = [640, 768, 1024, 1440];

// ---------------------------------------------------------------------------
// A small, honest CSS reader. It collects every rule whose selector is a single
// plain class (".flex", ".sm\:gap-1", ".gap-x-3"), together with the min-width
// of the media query it sits in. Rules with a pseudo-class (":focus", ":hover")
// are skipped on purpose: they are not part of the resting state of the page.
// The "gap" shorthand is expanded to row-gap and column-gap so a later shorthand
// is seen to overwrite an earlier long-hand, exactly as a browser sees it.
// ---------------------------------------------------------------------------
function simpleClass(selector) {
  if (!selector.startsWith(".")) return null;
  let name = "";
  for (let i = 1; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") { i++; name += selector[i]; continue; }
    if (/[A-Za-z0-9_-]/.test(ch)) { name += ch; continue; }
    return null;
  }
  return name || null;
}

function parseDeclarations(body) {
  const out = {};
  let depth = 0;
  let current = "";
  const push = (chunk) => {
    const text = chunk.trim();
    if (!text) return;
    const split = text.indexOf(":");
    if (split === -1) return;
    const property = text.slice(0, split).trim();
    const value = text.slice(split + 1).trim();
    if (property === "gap") { out["row-gap"] = value; out["column-gap"] = value; return; }
    out[property] = value;
  };
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) { push(current); current = ""; continue; }
    current += ch;
  }
  push(current);
  return out;
}

function collectRules(css, minWidth, out) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@media")) {
      const found = /\(min-width:\s*(\d+)px\)/.exec(prelude);
      const unsupported = /max-width|prefers|print|orientation/i.test(prelude);
      if (found && !unsupported) collectRules(body, parseInt(found[1], 10), out);
    } else if (prelude.startsWith("@")) {
      if (prelude.startsWith("@supports")) collectRules(body, minWidth, out);
    } else {
      for (const selector of prelude.split(",")) {
        const cls = simpleClass(selector.trim());
        if (cls) out.push({ cls, minWidth, decls: parseDeclarations(body) });
      }
    }
    i = j;
  }
}

const RULES = [];
collectRules(CSS, 0, RULES);
const RULE_CLASSES = new Set(RULES.map((r) => r.cls));

function appliedAt(classString, width) {
  const wanted = new Set(classString.split(/\s+/).filter(Boolean));
  const out = {};
  for (const rule of RULES) {
    if (rule.minWidth <= width && wanted.has(rule.cls)) Object.assign(out, rule.decls);
  }
  return out;
}

function differences(beforeString, nowString, width) {
  const before = appliedAt(beforeString, width);
  const now = appliedAt(nowString, width);
  const out = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
    if (before[key] !== now[key]) out[key] = { today: before[key] ?? null, now: now[key] ?? null };
  }
  return out;
}

// A class carries weight only if the compiled stylesheet actually has a rule for
// it. Variant classes such as "focus:ring-2" live behind a pseudo-class selector,
// so they are looked up by their escaped selector text instead.
function stylesheetHasRule(cls) {
  if (RULE_CLASSES.has(cls)) return true;
  const escaped = "." + cls.replace(/[:/.[\]%]/g, (ch) => "\\" + ch);
  return CSS.includes(escaped + "{") || CSS.includes(escaped + ":") || CSS.includes(escaped + ",");
}

// ---------------------------------------------------------------------------
// The ids each page must keep for its script to find its elements. Each list is
// the set of ids the page declares that js/<page>.js or js/common.js looks up by
// getElementById, captured at the time of this change.
// ---------------------------------------------------------------------------
const LOGIN_IDS = [
  "btn-apple-login", "btn-apple-signup", "btn-forgot-password", "btn-google-login",
  "btn-google-signup", "footer-placeholder", "form-login", "form-signup", "login-card",
  "login-email", "login-password", "navbar-placeholder", "pw-strength-label",
  "signup-confirm-password", "signup-confirm-tick", "signup-email", "signup-name",
  "signup-password", "signup-password-rules", "signup-terms", "switch-to-login",
  "switch-to-signup", "tab-login", "tab-signup",
];

const PROFILE_IDS = [
  "action-status", "allow-handle-search", "bio", "change-email-btn", "change-email-cancel",
  "change-email-form", "change-email-password", "change-email-status", "change-email-submit",
  "change-password-btn", "change-password-status", "current-password", "data-categories",
  "delete-btn", "email", "export-btn", "exported-at", "file-upload", "footer-placeholder",
  "handle", "host-ownership-warning", "host-verification-card", "host-verification-section",
  "host-verification-status-line", "kyc-addr-file", "kyc-error", "kyc-id-file", "kyc-id-type",
  "kyc-progress", "kyc-submit-btn", "location", "mobile", "mobileCountryCode", "name",
  "navbar-placeholder", "new-email", "new-password", "notif-prefs-error", "notif-prefs-list",
  "notif-prefs-loading", "notif-prefs-status", "photo-nudge", "profile-form",
  "profile-pic-preview", "public-profile-toggle", "recommendation-email-toggle",
  "repeat-password", "retention-meta", "share-to-friends", "upload-btn", "upload-status",
];

const HOST_IDS = [
  "add-discount-tier", "address-search", "addressLine", "addressNotes", "bookingCutoffEnabled",
  "bookingCutoffHours", "city", "city-suggestions", "country", "create-experience-form",
  "currency", "cutoff-hours-row", "cutoff-locked-banner", "cutoff-preview", "desc-counter",
  "description", "discount-tiers-container", "discount-tiers-list", "discountEnabled",
  "duration-summary", "editing-experience-id", "endDate", "endTime", "ev-cancel", "ev-capacity",
  "ev-error", "ev-food-cert", "ev-insurance", "ev-plan", "ev-promise", "ev-safety", "ev-submit",
  "event-verification-modal", "event-verification-modal-backdrop", "event-verification-modal-close",
  "eventDurationHours", "eventDurationMins", "eventDurationMinutes", "evidence-already-submitted",
  "evidence-cancel", "evidence-deadline", "evidence-error", "evidence-files",
  "evidence-files-status", "evidence-form", "evidence-report-id", "evidence-reviewer-note",
  "evidence-section", "evidence-submit", "evidence-success", "evidence-text",
  "evidence-text-counter", "experienceTimezone", "footer-placeholder", "host-instant-book",
  "imageInput", "maxGuests", "navbar-placeholder", "photos-grid", "postcode", "postcode-warning",
  "price", "pricing-host-charge-note", "pricing-host-payout-estimate",
  "pricing-platform-fee-per-guest", "pricing-policy-reference", "pricing-private-summary",
  "pricing-public-per-guest", "pricing-transparency-panel", "pricing-verified-impact",
  "private-config-fields", "privateCapacity", "privateEnabled", "privateExtraGuestPrice",
  "privateIncludedGuests", "privatePrice", "publish-success-another", "publish-success-card",
  "publish-success-edit", "publish-success-heading", "publish-success-icon",
  "publish-success-image", "publish-success-price", "publish-success-share",
  "publish-success-subheading", "publish-success-title", "publish-success-view",
  "publish-success-when", "requirements", "startDate", "startTime", "state", "submit-btn",
  "suburb", "tag-limit-hint", "title", "upload-placeholder", "upload-preview",
  "upload-progress-bar", "upload-progress-text", "upload-progress-wrap", "verified-request-btn",
  "verified-request-meta", "verified-status-hint", "wizard-dupe-notice", "wizard-progress",
  "wizard-progress-bar", "wizard-review-summary", "wizard-save-draft-btn",
];

function missingIds(file, ids) {
  const doc = parse(file);
  return ids.filter((id) => doc.getElementById(id) === null);
}

// ---------------------------------------------------------------------------

describe("PHONE-login-1: the two escape routes under the Log In button", () => {
  test("login.html line 67 carries the phone stack and the desktop restore", () => {
    const line = lines("login.html")[66];
    expect(line).toContain(`class="${LOGIN_ROW_EXPECTED}"`);
    const doc = parse("login.html");
    const row = doc.getElementById("btn-forgot-password").parentElement;
    expect(row.getAttribute("class")).toBe(LOGIN_ROW_EXPECTED);
    expect(LOGIN_ROW_NOW).toBe(LOGIN_ROW_EXPECTED);
    expect(row.querySelector("#switch-to-signup")).not.toBeNull();
  });

  test("below 640 the row stacks in one column, at 14 pixels, with an 8 pixel gap", () => {
    for (const width of [320, 375, 414, 639]) {
      const applied = appliedAt(LOGIN_ROW_NOW, width);
      expect(applied.display).toBe("flex");
      expect(applied["flex-direction"]).toBe("column");
      expect(applied["align-items"]).toBe("center");
      expect(applied["row-gap"]).toBe(".5rem");
      expect(applied["font-size"]).toBe(".875rem");
      expect(applied["line-height"]).toBe("1.25rem");
    }
  });

  test("at 640, 768, 1024 and 1440 the row renders as it did before", () => {
    for (const width of DESKTOP_WIDTHS) {
      const diff = differences(LOGIN_ROW_BEFORE, LOGIN_ROW_NOW, width);
      // flex-direction: row is the initial value of a flex container, so the row
      // it names is the row the browser already laid out. Nothing else differs.
      expect(Object.keys(diff)).toEqual(["flex-direction"]);
      expect(diff["flex-direction"]).toEqual({ today: null, now: "row" });
      const applied = appliedAt(LOGIN_ROW_NOW, width);
      expect(applied.display).toBe("flex");
      expect(applied["justify-content"]).toBe("center");
      expect(applied["align-items"]).toBe("center");
      expect(applied["row-gap"]).toBe("1rem");
      expect(applied["column-gap"]).toBe("1rem");
      expect(applied["font-size"]).toBe(".75rem");
    }
  });

  test("login.html still declares every id js/login.js and js/common.js look up", () => {
    expect(missingIds("login.html", LOGIN_IDS)).toEqual([]);
  });
});

describe("GAP-35: the Log in sentence under the Create Account button", () => {
  test("login.html line 167 carries the phone size and the desktop restore", () => {
    const line = lines("login.html")[166];
    expect(line).toContain(`<p class="${SIGNUP_SWITCH_EXPECTED}">`);
    const doc = parse("login.html");
    const button = doc.getElementById("switch-to-login");
    const row = button.parentElement;
    expect(row.tagName).toBe("P");
    expect(row.getAttribute("class")).toBe(SIGNUP_SWITCH_EXPECTED);
    expect(SIGNUP_SWITCH_NOW).toBe(SIGNUP_SWITCH_EXPECTED);
    // The button is untouched. It carries no size of its own, so the sentence and
    // the target inside it read at one size together.
    expect(button.getAttribute("class")).toBe(SIGNUP_SWITCH_BUTTON);
    expect(button.textContent).toBe("Log in");
    expect(row.parentElement.getAttribute("id")).toBe("form-signup");
  });

  test("below 640 the sentence and the Log in target both read at 14 pixels", () => {
    for (const width of [320, 375, 414, 639]) {
      const applied = appliedAt(SIGNUP_SWITCH_NOW, width);
      expect(applied["font-size"]).toBe(".875rem");
      expect(applied["line-height"]).toBe("1.25rem");
      expect(applied["text-align"]).toBe("center");
      // The button declares no font-size at any width, so it inherits the 14 above
      // instead of setting a second size of its own.
      expect(appliedAt(SIGNUP_SWITCH_BUTTON, width)["font-size"]).toBeUndefined();
    }
  });

  test("at 640, 768, 1024 and 1440 the sentence renders exactly as it does today", () => {
    for (const width of DESKTOP_WIDTHS) {
      // Not one declaration differs from the line as it stands before this change.
      expect(differences(SIGNUP_SWITCH_BEFORE, SIGNUP_SWITCH_NOW, width)).toEqual({});
      const applied = appliedAt(SIGNUP_SWITCH_NOW, width);
      expect(applied["font-size"]).toBe(".75rem");
      expect(applied["line-height"]).toBe("1rem");
      expect(applied["text-align"]).toBe("center");
    }
  });

  test("the phone classes reach for no breakpoint above sm", () => {
    const classes = SIGNUP_SWITCH_NOW.split(/\s+/).filter(Boolean);
    expect(classes.filter((cls) => /^(lg|xl|2xl):/.test(cls))).toEqual([]);
    expect(classes.filter((cls) => /^(sm|md|lg|xl|2xl):/.test(cls))).toEqual(["sm:text-xs"]);
    expect(classes.filter((cls) => cls.includes(":"))).toEqual(["sm:text-xs"]);
    for (const cls of classes) expect(stylesheetHasRule(cls)).toBe(true);
  });

  test("the two sentences under the two forms read at one size at every width", () => {
    for (const width of [320, 375, 414, 639, ...DESKTOP_WIDTHS]) {
      const twin = appliedAt(LOGIN_ROW_NOW, width);
      const mine = appliedAt(SIGNUP_SWITCH_NOW, width);
      expect(mine["font-size"]).toBe(twin["font-size"]);
      expect(mine["line-height"]).toBe(twin["line-height"]);
      expect(mine.color).toBe(twin.color);
    }
    expect(appliedAt(SIGNUP_SWITCH_NOW, 375)["font-size"]).toBe(".875rem");
    expect(appliedAt(SIGNUP_SWITCH_NOW, 640)["font-size"]).toBe(".75rem");
  });
});

describe("PHONE-profile-1: the mobile number field on My Account", () => {
  test("profile.html line 109 lets the mobile field shrink", () => {
    const line = lines("profile.html")[108];
    expect(line).toContain(`class="${MOBILE_INPUT_EXPECTED}"`);
    const doc = parse("profile.html");
    const input = doc.getElementById("mobile");
    expect(input.getAttribute("class")).toBe(MOBILE_INPUT_EXPECTED);
    expect(MOBILE_INPUT_NOW).toBe(MOBILE_INPUT_EXPECTED);
    expect(input.getAttribute("type")).toBe("tel");
    expect(input.getAttribute("maxlength")).toBe("15");
    expect(input.getAttribute("autocomplete")).toBe("tel-national");
  });

  test("a zero minimum width is the only declaration added, and it is added at every width", () => {
    for (const width of [320, 375, 639, ...DESKTOP_WIDTHS]) {
      const diff = differences(MOBILE_INPUT_BEFORE, MOBILE_INPUT_NOW, width);
      expect(Object.keys(diff)).toEqual(["min-width"]);
      expect(diff["min-width"].today).toBeNull();
      expect(diff["min-width"].now).toMatch(/^0(px)?$/);
      expect(appliedAt(MOBILE_INPUT_NOW, width).flex).toBe("1 1 0%");
    }
  });

  test("the country code select and the row around it are untouched", () => {
    const doc = parse("profile.html");
    const select = doc.getElementById("mobileCountryCode");
    expect(select.getAttribute("class")).toContain("w-28");
    expect(select.getAttribute("class")).toContain("shrink-0");
    expect(select.parentElement.getAttribute("class")).toBe("flex gap-2");
    expect(select.parentElement).toBe(doc.getElementById("mobile").parentElement);
  });

  test("profile.html still declares every id js/profile.js and js/common.js look up", () => {
    expect(missingIds("profile.html", PROFILE_IDS)).toEqual([]);
  });
});

describe("PHONE-host-1: the five wizard step labels", () => {
  test("host.html line 122 lays the step labels out in three columns on a phone", () => {
    const line = lines("host.html")[121];
    expect(line).toContain(`class="${WIZARD_ROW_EXPECTED}"`);
    const doc = parse("host.html");
    const row = doc.querySelector("#wizard-progress > div");
    expect(row.getAttribute("class")).toBe(WIZARD_ROW_EXPECTED);
    expect(WIZARD_ROW_NOW).toBe(WIZARD_ROW_EXPECTED);
  });

  test("below 640 the row is a three column grid and all five labels stay on the page", () => {
    const doc = parse("host.html");
    const labels = doc.querySelectorAll("#wizard-progress [data-step-label]");
    expect(labels.length).toBe(5);
    expect([...labels].map((el) => el.textContent.trim())).toEqual([
      "1. Your experience",
      "2. Where & when",
      "3. Pricing & capacity",
      "4. Photo & settings",
      "5. Review & publish",
    ]);
    for (const width of [320, 375, 414, 639]) {
      const applied = appliedAt(WIZARD_ROW_NOW, width);
      expect(applied.display).toBe("grid");
      expect(applied["grid-template-columns"]).toBe("repeat(3,minmax(0,1fr))");
      expect(applied["column-gap"]).toBe(".75rem");
      expect(applied["row-gap"]).toBe(".25rem");
      expect(applied["font-size"]).toBe(".75rem");
      expect(applied["margin-bottom"]).toBe(".75rem");
    }
  });

  test("at 640, 768, 1024 and 1440 the row renders as it did before", () => {
    for (const width of DESKTOP_WIDTHS) {
      const diff = differences(WIZARD_ROW_BEFORE, WIZARD_ROW_NOW, width);
      // Two entries, neither of which a browser can act on: a grid track list on
      // an element the next rule turns back into a flex container, and Firefox's
      // own alias of column-gap, which the later gap shorthand overwrites.
      expect(Object.keys(diff).sort()).toEqual(["-moz-column-gap", "grid-template-columns"]);
      const applied = appliedAt(WIZARD_ROW_NOW, width);
      expect(applied.display).toBe("flex");
      expect(applied["align-items"]).toBe("center");
      expect(applied["justify-content"]).toBe("space-between");
      expect(applied["row-gap"]).toBe(".25rem");
      expect(applied["column-gap"]).toBe(".25rem");
      expect(applied["font-size"]).toBe(".75rem");
      expect(applied["margin-bottom"]).toBe(".75rem");
    }
  });

  test("the progress bar under the labels is untouched", () => {
    const doc = parse("host.html");
    const bar = doc.getElementById("wizard-progress-bar");
    expect(bar.parentElement.getAttribute("class")).toBe("h-2 bg-slate-200 rounded-full overflow-hidden");
    expect(bar.getAttribute("style")).toBe("width:20%");
  });

  test("js/host.js still reaches the labels by their data attribute, not by a layout class", () => {
    const src = read("js/host.js");
    expect(src).toContain('document.querySelectorAll("[data-step-label]")');
    expect(src).not.toContain("justify-between text-xs");
  });

  test("host.html still declares every id js/host.js and js/common.js look up", () => {
    expect(missingIds("host.html", HOST_IDS)).toEqual([]);
  });
});

describe("the compiled stylesheet backs every class on the changed rows", () => {
  test("each class resolves to a real rule in css/tailwind.css", () => {
    const all = [
      ...LOGIN_ROW_NOW.split(/\s+/),
      ...SIGNUP_SWITCH_NOW.split(/\s+/),
      ...SIGNUP_SWITCH_BUTTON.split(/\s+/),
      ...MOBILE_INPUT_NOW.split(/\s+/),
      ...WIZARD_ROW_NOW.split(/\s+/),
    ].filter(Boolean);
    expect(all.filter((cls) => !stylesheetHasRule(cls))).toEqual([]);
  });

  test("the four rows still sit on lines 67, 109, 122 and 167", () => {
    expect(lines("login.html")[66]).toContain("<div class=\"flex flex-col items-center");
    expect(lines("profile.html")[108]).toContain('<input type="tel" id="mobile"');
    expect(lines("host.html")[121]).toContain('<div class="grid grid-cols-3');
    expect(lines("login.html")[166]).toContain('<p class="text-center text-sm');
  });
});
