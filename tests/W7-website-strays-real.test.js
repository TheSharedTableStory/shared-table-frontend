// W7 - the two website strays of this pack, read off the shipped scripts.
//
//   STRAY-46  the website sent its own copy of three funnel steps the platform already records
//             for itself, so every search, every listing view and every booking start was
//             counted twice and the administrator's funnel read about double what happened.
//   STRAY-59  the host's own dispute panel printed the card provider's raw word for why a
//             chargeback was raised, instead of the sentence the platform already writes for it.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name) => readFileSync(resolve(__dirname, "..", "js", name), "utf-8");

describe("W7 STRAY-46: one count per step, the platform's own", () => {
  test("neither page sends its own copy of a step the server already records", () => {
    for (const file of ["explore.js", "experience.js"]) {
      const src = read(file);
      expect({ file, sendsItsOwnCount: src.includes("__trackAnalytics(") }).toEqual({ file, sendsItsOwnCount: false });
    }
  });

  test("the sender itself is untouched, because other pages still use it", () => {
    const common = read("common.js");
    expect(common).toContain("window.__trackAnalytics = function");
  });
});

describe("W7 STRAY-59: a host reads a sentence about a dispute, never a stored code", () => {
  const src = read("my-bookings.js");

  test("the panel reads the sentence the server sends", () => {
    expect(src).toContain("b.dispute && b.dispute.reasonLabel");
  });

  test("the raw stored word is never what is put on the screen", () => {
    // The line that fills the panel now reads the label, and the raw value can only ever decide
    // WHETHER something is said, never what.
    const line = src.split("\n").find((l) => l.includes("var __dReason = "));
    expect(line).toBeTruthy();
    expect(line).toContain("__dReasonLabel ||");
    expect(line).toContain("The guest's bank has raised a dispute on this payment.");
  });

  test("what the panel renders is the value that was read, and nothing else", () => {
    expect(src).toContain('if (__dReason) dWrap.appendChild(El("p", { className: "text-sm text-red-800", textContent: __dReason }));');
  });
});
