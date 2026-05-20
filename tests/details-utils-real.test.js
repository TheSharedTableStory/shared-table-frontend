// REAL coverage for js/details-utils.js — exercises expand/collapse, hash
// auto-expand for #cookies, and policy TOC generation.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "details-utils.js"), "utf-8");

function loadWith(html, opts) {
  opts = opts || {};
  document.body.innerHTML = html;
  // jsdom does not implement scrollIntoView; stub on every element so the
  // privacy-page auto-expand path doesn't crash.
  for (const el of document.querySelectorAll("*")) {
    if (typeof el.scrollIntoView !== "function") el.scrollIntoView = () => undefined;
  }
  if (opts.hash !== undefined) {
    Object.defineProperty(window, "location", {
      value: { hash: opts.hash, pathname: "/x.html", href: "https://x.com/x.html" + opts.hash },
      writable: true,
      configurable: true,
    });
  }
  new Function(SRC)();
}

describe("details-utils — expand/collapse buttons", () => {
  test("terms-expand-all opens every <details>", () => {
    loadWith(`
      <button id="terms-expand-all">Expand all</button>
      <details><summary>One</summary>A</details>
      <details><summary>Two</summary>B</details>
      <details><summary>Three</summary>C</details>
    `, {});
    document.getElementById("terms-expand-all").click();
    const all = Array.from(document.querySelectorAll("details"));
    for (const d of all) expect(d.open).toBe(true);
  });

  test("terms-collapse-all closes every <details>", () => {
    loadWith(`
      <button id="terms-collapse-all">Collapse all</button>
      <details open><summary>One</summary>A</details>
      <details open><summary>Two</summary>B</details>
    `, {});
    document.getElementById("terms-collapse-all").click();
    const all = Array.from(document.querySelectorAll("details"));
    for (const d of all) expect(d.open).toBe(false);
  });

  test("ht-expand-all also wired (host-terms.html)", () => {
    loadWith(`
      <button id="ht-expand-all">Expand</button>
      <details><summary>X</summary></details>
    `, {});
    document.getElementById("ht-expand-all").click();
    expect(document.querySelector("details").open).toBe(true);
  });

  test("ht-collapse-all also wired", () => {
    loadWith(`
      <button id="ht-collapse-all">Collapse</button>
      <details open><summary>X</summary></details>
    `, {});
    document.getElementById("ht-collapse-all").click();
    expect(document.querySelector("details").open).toBe(false);
  });

  test("missing buttons: no crash", () => {
    expect(() => loadWith(`<details><summary>x</summary></details>`, {})).not.toThrow();
  });
});

describe("details-utils — #cookies auto-expand on privacy page", () => {
  test("#cookies hash opens that DETAILS element", () => {
    loadWith(`<details id="cookies"><summary>Cookies</summary>Content</details>`, { hash: "#cookies" });
    expect(document.getElementById("cookies").open).toBe(true);
  });

  test("non-cookies hash leaves #cookies closed", () => {
    loadWith(`<details id="cookies"><summary>Cookies</summary>Content</details>`, { hash: "#about" });
    expect(document.getElementById("cookies").open).toBe(false);
  });

  test("no hash → no auto-expand", () => {
    loadWith(`<details id="cookies"><summary>Cookies</summary>Content</details>`, { hash: "" });
    expect(document.getElementById("cookies").open).toBe(false);
  });

  test("non-DETAILS element with id=cookies is ignored", () => {
    expect(() => loadWith(`<div id="cookies">not details</div>`, { hash: "#cookies" })).not.toThrow();
  });
});

describe("details-utils — policy TOC generation", () => {
  test("generates a TOC link per <details>", () => {
    loadWith(`
      <ul id="policy-toc-list"></ul>
      <div id="policy-sections">
        <details><summary>Section 1</summary>...</details>
        <details><summary>Section 2</summary>...</details>
        <details><summary>Section 3</summary>...</details>
      </div>
    `, {});
    const toc = document.getElementById("policy-toc-list");
    expect(toc.children.length).toBe(3);
    expect(toc.querySelectorAll("a").length).toBe(3);
  });

  test("each <details> gets an id like policy-s0, policy-s1, ...", () => {
    loadWith(`
      <ul id="policy-toc-list"></ul>
      <div id="policy-sections">
        <details><summary>A</summary></details>
        <details><summary>B</summary></details>
      </div>
    `, {});
    const sections = document.querySelectorAll("#policy-sections details");
    expect(sections[0].id).toBe("policy-s0");
    expect(sections[1].id).toBe("policy-s1");
  });

  test("TOC link href matches the assigned details id", () => {
    loadWith(`
      <ul id="policy-toc-list"></ul>
      <div id="policy-sections">
        <details><summary>First</summary></details>
      </div>
    `, {});
    const link = document.querySelector("#policy-toc-list a");
    expect(link.getAttribute("href")).toBe("#policy-s0");
    expect(link.textContent).toBe("First");
  });

  test("policy TOC skipped when container is missing", () => {
    expect(() => loadWith(`<ul id="policy-toc-list"></ul>`, {})).not.toThrow();
    expect(document.querySelectorAll("#policy-toc-list a")).toHaveLength(0);
  });

  test("policy TOC skipped when toc list is missing", () => {
    expect(() => loadWith(`<div id="policy-sections"><details><summary>x</summary></details></div>`, {})).not.toThrow();
  });

  test("details without summary skipped (defensive)", () => {
    loadWith(`
      <ul id="policy-toc-list"></ul>
      <div id="policy-sections">
        <details><summary>Has summary</summary></details>
        <details></details>
      </div>
    `, {});
    expect(document.querySelectorAll("#policy-toc-list a")).toHaveLength(1);
  });
});
