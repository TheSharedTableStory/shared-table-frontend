// REAL coverage of the Preview switch on a host's draft (sir's orders O-146 / O-147, 2026-09-16).
//
// sir, verbatim: "anything draft is just put a preview and nroever for booking to se the interest of
// people -- and aashole that preview should be after a bare minimu detailes of experience is put".
//
// Every case evaluates the SHIPPING js/common.js and js/my-bookings.js and calls the real
// renderHostListingsSection, so the card under test is the card a host sees.

import { describe, test, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

beforeAll(() => {
  document.body.innerHTML = `<div id="content-area"></div>`;
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html", reload: () => {} },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = vi.fn();
  window.tstsConfirm = async () => true;
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(COMMON_SRC);
  } catch (_c) { void _c; }
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
});

function draft(over) {
  return Object.assign({
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    title: "Six Seats, One Sunday",
    status: "DRAFT",
    currency: "aud",
    price: 65,
    suburb: "Brunswick",
    city: "Melbourne",
    availableDays: ["Sun"],
    timeSlots: ["18:00-20:00"],
    maxGuests: 6,
    previewEnabled: false,
    previewMissing: [],
    interestCount: 0,
    datesToCome: false,
  }, over || {});
}

// The Draft section of the host's own listings, rendered by the real function.
function render(drafts) {
  return globalThis.renderHostListingsSection([], [], [], drafts);
}

function textOf(node) { return String(node.textContent || ""); }

function buttonNamed(node, label) {
  return Array.from(node.querySelectorAll("button")).find((b) => b.textContent === label) || null;
}

describe("a draft that is ready to be shown", () => {
  test("the card offers the switch and says what turning it on does", () => {
    const node = render([draft()]);
    const text = textOf(node);
    expect(text).toContain("Ready to show.");
    expect(text).toContain("Coming soon");
    expect(text).toContain("without being able to book it");

    const btn = buttonNamed(node, "Turn preview on");
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    // The panel's own button, never a browser default.
    expect(btn.className).toContain("rounded-lg");
  });

  test("the draft's other two actions are still there and still first-class", () => {
    const node = render([draft()]);
    expect(buttonNamed(node, "Activate")).toBeTruthy();
    expect(buttonNamed(node, "Discard")).toBeTruthy();
  });
});

describe("a draft that is not ready yet", () => {
  test("the switch is offered but cannot be used, and the card names what is missing", () => {
    const node = render([draft({ previewMissing: ["a description", "a cuisine", "at least one photo"] })]);
    const text = textOf(node);
    expect(text).toContain("Before guests can see this one it still needs a description, a cuisine and at least one photo.");
    expect(text).toContain("Open the listing to add them");

    const btn = buttonNamed(node, "Turn preview on");
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain("still needs a few details");
  });

  test("one thing missing reads as one thing, not as a list of one", () => {
    const node = render([draft({ previewMissing: ["at least one photo"] })]);
    expect(textOf(node)).toContain("it still needs at least one photo.");
    expect(textOf(node)).not.toContain(" and at least one photo");
  });
});

describe("a draft that is being shown", () => {
  test("the card says so, and says nobody can book it", () => {
    const node = render([draft({ previewEnabled: true })]);
    const text = textOf(node);
    expect(text).toContain("Preview on");
    expect(text).toContain("Guests can see this one under Coming soon.");
    expect(text).toContain("Nobody can book it.");
    expect(buttonNamed(node, "Turn preview off")).toBeTruthy();
  });

  test("with nobody interested yet, the card says that rather than showing a zero", () => {
    const node = render([draft({ previewEnabled: true, interestCount: 0 })]);
    expect(textOf(node)).toContain("Nobody has said they are interested yet.");
    expect(textOf(node)).not.toContain("0 people");
  });

  test("one interested person reads as one person", () => {
    const node = render([draft({ previewEnabled: true, interestCount: 1 })]);
    expect(textOf(node)).toContain("1 person has said they are interested.");
  });

  test("several interested people read as several", () => {
    const node = render([draft({ previewEnabled: true, interestCount: 7 })]);
    expect(textOf(node)).toContain("7 people have said they are interested.");
  });

  test("the host is told that everyone waiting hears when they publish", () => {
    const node = render([draft({ previewEnabled: true, interestCount: 3 })]);
    expect(textOf(node)).toContain("Everyone on the list hears from us the moment you publish.");
  });
});

describe("what the host reads is never machine text", () => {
  test("no field name, no code, no em dash, on any of the three states", () => {
    [draft(), draft({ previewEnabled: true, interestCount: 2 }), draft({ previewMissing: ["a suburb"] })].forEach((d) => {
      const text = textOf(render([d]));
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("[object Object]");
      expect(text).not.toContain("NaN");
      expect(text).not.toContain("—");
      expect(text).not.toContain("previewEnabled");
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    });
  });
});

describe("turning the preview off asks first", () => {
  test("the host is warned that people already waiting lose sight of the page, and keeps their place", async () => {
    let asked = "";
    window.tstsConfirm = async (q) => { asked = String(q); return false; };
    let posted = false;
    window.authFetch = async () => { posted = true; return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }; };

    await globalThis.setHostDraftPreview("bbbbbbbbbbbbbbbbbbbbbbbb", "Six Seats, One Sunday", false);

    expect(asked).toContain("Turn the preview off");
    expect(asked).toContain("stays on the list");
    expect(posted).toBe(false);
  });

  test("turning it ON asks nothing and simply does it", async () => {
    let asked = false;
    window.tstsConfirm = async () => { asked = true; return true; };
    // Only the preview call is watched. A successful switch is followed by the dashboard reloading
    // itself, and those calls carry no body at all: watching every call would overwrite what this
    // case is actually about.
    let body = null;
    let calledUrl = "";
    window.authFetch = async (url, opts) => {
      if (String(url).indexOf("/preview") >= 0 && body === null) {
        calledUrl = String(url);
        body = JSON.parse(String((opts && opts.body) || "{}"));
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { previewEnabled: true, message: "Your preview is up." } }) };
    };

    await globalThis.setHostDraftPreview("bbbbbbbbbbbbbbbbbbbbbbbb", "Six Seats, One Sunday", true);

    expect(asked).toBe(false);
    expect(calledUrl).toBe("/api/host/experiences/bbbbbbbbbbbbbbbbbbbbbbbb/preview");
    expect(body).toEqual({ enabled: true });
  });

  test("a refusal from the server is what the host reads, word for word", async () => {
    window.tstsConfirm = async () => true;
    window.tstsNotify = vi.fn();
    window.authFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: "PREVIEW_INCOMPLETE", message: "Before people can see this preview it still needs a description and a cuisine." }),
    });

    await globalThis.setHostDraftPreview("bbbbbbbbbbbbbbbbbbbbbbbb", "Six Seats, One Sunday", true);

    expect(window.tstsNotify).toHaveBeenCalledWith(
      "Before people can see this preview it still needs a description and a cuisine.",
      "error"
    );
  });
});
