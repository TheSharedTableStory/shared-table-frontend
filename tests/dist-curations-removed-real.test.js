// WALK-P983-1, recorded where the fix can actually live.
//
// The finding was that dist/js/explore.js and dist/js/index.js still call the dead /api/curations
// route sir's 2026-05-24 order removed from the real source. The call really is in those two
// files on disk, and they really are stale: `dist/` is not tracked, and render-build.sh (the
// production build) runs `rm -rf dist` and copies `js/` into `dist/js` fresh on every deploy, so
// what production serves from dist/js IS js/, and the checked-in copies are a leftover from an
// old local run. Editing them by hand fixes nothing that ships and is deleted by the next deploy,
// and a suite that reads them throws on any checkout that has no stale dist/ of its own.
//
// So the assertions live where the truth lives: the source. They already hold, which is the
// finding's real answer - there is nothing to fix in the source, the dead call was only ever in
// a stale artifact. Nothing on the site references dist/ either, and that is checked live below
// rather than assumed, so if a page is ever wired to dist/js this suite says so.

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXPLORE_SRC = readFileSync(resolve(__dirname, "..", "js", "explore.js"), "utf-8");
const INDEX_SRC = readFileSync(resolve(__dirname, "..", "js", "index.js"), "utf-8");
const ALL_HTML_FILES = readdirSync(resolve(__dirname, "..")).filter((f) => f.endsWith(".html"));
const BUILD_SCRIPT = readFileSync(resolve(__dirname, "..", "render-build.sh"), "utf-8");

// The real call-site shape on both live pages before the route was removed:
// authFetch("/api/curations", ...). Matched narrowly (the call, not the route name) so this test
// does not trip over explanatory prose that names the removed route.
const CURATIONS_CALL = /authFetch\(\s*["']\/api\/curations["']/;

describe("WALK-P983-1: the source pages carry no call to the dead /api/curations route", () => {
  test("js/explore.js carries no /api/curations call and defines no curations-only function", () => {
    expect(EXPLORE_SRC).not.toMatch(CURATIONS_CALL);
    expect(EXPLORE_SRC).not.toMatch(/function loadExploreCurations/);
    expect(EXPLORE_SRC).not.toMatch(/loadExploreCurations\(\);/);
  });

  test("js/index.js carries no /api/curations call and defines no curations-only function", () => {
    expect(INDEX_SRC).not.toMatch(CURATIONS_CALL);
    expect(INDEX_SRC).not.toMatch(/function loadHomeCurations/);
    expect(INDEX_SRC).not.toMatch(/loadHomeCurations\(\);/);
  });

  test("the production build rebuilds dist from js on every deploy, so the source is what ships", () => {
    expect(BUILD_SCRIPT).toMatch(/rm -rf "?\$DIST"?/);
    expect(BUILD_SCRIPT).toMatch(/\bjs\b/);
  });

  test("no page on the site loads anything out of dist/js, checked live rather than assumed", () => {
    for (const htmlFile of ALL_HTML_FILES) {
      const html = readFileSync(resolve(__dirname, "..", htmlFile), "utf-8");
      expect(html).not.toMatch(/dist\/js\//);
    }
  });
});
