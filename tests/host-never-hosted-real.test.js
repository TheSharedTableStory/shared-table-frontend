// REAL coverage for sir's definition of a host — __hostNeverHosted() in js/my-bookings.js.
//
// WHY THIS FILE EXISTS:
//   sir caught me presenting this build with two conditions proven by code reading alone, and with no
//   test at all: "---- where is test you ---- found gap and pushed it under carpeet thinking that
//   is not imporant to atake my go ahead?". Correct. A gate that decides whether a real host sees their
//   own dashboard is exactly the silent-blast-radius category that Rule 15 makes test-mandatory in the
//   SAME turn as the code.
//
// sir's definition, verbatim (2026-08-08):
//   "once the user acutally list an event of get verified as host by platofmed admin he gets access to
//    complete host dashboard and tabs even if there is no active listing"
//   and, when I was about to widen it: "did i say draft lisitng?" — no.
//
// The two failure modes this pins:
//   FALSE NEGATIVE — a real host shown the beginner's message. Catastrophic: their listings, bookings
//   and earnings appear to have vanished. Every ambiguity must resolve AWAY from this.
//   FALSE POSITIVE — a brand-new person shown nine empty tabs. The defect sir reported in the first place.

import { describe, test, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");
// my-bookings.js builds every node through window.tstsEl, which lives in common.js. The first run of this
// file failed 21/21 with "El is not a function" because only my-bookings.js was loaded. Loading the REAL
// common.js rather than stubbing a fake tstsEl matters: a stub would let a markup mistake pass here and
// still break on sir's screen.
const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");

beforeAll(() => {
  document.body.innerHTML = `<div id="content-area"></div>`;
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = vi.fn();
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(COMMON_SRC);
  } catch (_c) {
    void _c; // common.js also bootstraps navbar/footer for a real page; only its helpers matter here
  }
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
});

// Build a dashboard state. Defaults are the brand-new person: everything loaded, everything empty.
// Returned, not assigned to a global — hostDashboardState is module-scoped inside my-bookings.js and a
// test cannot reach it, which is why __hostNeverHosted takes the state as an argument.
function state(over) {
  const o = over || {};
  return {
    listings: { status: "ready", items: [], summary: null, warnings: [], message: "", ...(o.listings || {}) },
    bookings: { status: "ready", rows: [], message: "", ...(o.bookings || {}) },
    privateRequests: { status: "ready", rows: [], message: "", ...(o.privateRequests || {}) },
    verification: { status: "ready", data: { hostVerification: { status: "not_requested" } }, message: "", ...(o.verification || {}) }
  };
}

describe("the brand-new person — the defect sir reported", () => {
  test("no listings, no bookings, no requests, not verified => never hosted", () => {
    expect(__hostNeverHosted(state())).toBe(true);
  });
});

describe("verification is NOT a door — removed 2026-08-08", () => {
  // I raised verification as a way in without checking it was reachable. server.js:18786 refuses a
  // verification request unless a listing already exists, so verified-with-no-listings could never
  // happen. sir ordered it out. These pin that it stays out: verification status must change NOTHING.
  ["verified", "requested", "under_review", "rejected", "not_requested"].forEach((st) => {
    test(`verification "${st}" with no listing is still never hosted`, () => {
      expect(__hostNeverHosted(state({ verification: { data: { hostVerification: { status: st } } } }))).toBe(true);
    });
  });
});

describe("the only door — has hosted an event at any time", () => {
  test("one listing => full dashboard", () => {
    expect(__hostNeverHosted(state({ listings: { items: [{ id: "e1", status: "ACTIVE" }] } }))).toBe(false);
  });

  test("sir's 'active or past doesnt mattter' — a PAUSED listing counts the same as a live one", () => {
    expect(__hostNeverHosted(state({ listings: { items: [{ id: "e1", status: "PAUSED" }] } }))).toBe(false);
  });
});

describe("history proves hosting even when the listing list is empty", () => {
  test("a past booking keeps the dashboard", () => {
    expect(__hostNeverHosted(state({ bookings: { rows: [{ id: "b1" }] } }))).toBe(false);
  });

  test("a guest request keeps the dashboard", () => {
    expect(__hostNeverHosted(state({ privateRequests: { rows: [{ id: "r1" }] } }))).toBe(false);
  });
});

describe("loading must never flash the beginner's message at a real host", () => {
  // verification is NOT in these lists on purpose: it is no longer read by the gate, so its load state
  // cannot hold the decision open. Pinned separately below.
  ["listings", "bookings", "privateRequests"].forEach((src) => {
    test(`${src} still loading => full dashboard, not the message`, () => {
      expect(__hostNeverHosted(state({ [src]: { status: "loading" } }))).toBe(false);
    });
  });

  ["listings", "bookings", "privateRequests"].forEach((src) => {
    test(`${src} errored => full dashboard, not the message`, () => {
      expect(__hostNeverHosted(state({ [src]: { status: "error" } }))).toBe(false);
    });
  });

  ["loading", "error"].forEach((st) => {
    test(`verification ${st} does NOT hold the gate — it is not read at all`, () => {
      expect(__hostNeverHosted(state({ verification: { status: st } }))).toBe(true);
    });
  });

  test("a completely empty state object resolves to the full dashboard", () => {
    expect(__hostNeverHosted({})).toBe(false);
  });
});

describe("the message itself carries what sir ordered", () => {
  test("it names hosting and fellow travellers, and offers a start-hosting button", () => {
    const card = renderHostNeverHostedInvite();
    const text = card.textContent;
    expect(text).toContain("fellow travellers");
    const hostLink = [...card.querySelectorAll("a")].find((a) => a.getAttribute("href") === "host.html");
    expect(hostLink).toBeTruthy();
    expect(hostLink.textContent).toBe("Host an experience");
  });

  test("no verification affordance — it was a dead end and was removed", () => {
    // Shown only to people with no listing; server.js:18786 refuses verification without one. Offering
    // it to that group was a trap. Nothing on this card may lead there.
    const card = renderHostNeverHostedInvite();
    expect(card.textContent).not.toMatch(/verif/i);
    expect(card.textContent).not.toMatch(/payout/i);
    expect(card.querySelectorAll("button").length).toBe(0);
  });

  test("no plus sign and no expand control anywhere on it", () => {
    // sir: "i dont want pls sign or expan -- just explore more for verification".
    const card = renderHostNeverHostedInvite();
    expect(card.textContent).not.toContain("+");
    expect(card.textContent).not.toContain("−");
    expect(card.querySelector("[data-pm-stem]")).toBeNull();
  });
});
