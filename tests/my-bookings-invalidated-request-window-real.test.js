// REAL coverage for GAP 9 — the 48-hour counter window on an invalidated private request.
//
// WHAT WENT WRONG, AT THE LINE:
//   When someone else books an individual seat on the date a guest asked for as a WHOLE TABLE, the
//   server marks the request "invalidated" but deliberately KEEPS the guest's card hold for 48 hours
//   (server.js:27006-27011 — holdState stays "authorized", counterEligibleUntil = now + 48h) so the
//   host can offer other dates and the guest can accept without a new charge.
//   The page told that guest the exact opposite: "The hold was released; no charge was made." —
//   because __isTerminalPrivateRequest treated EVERY invalidated request as finished without ever
//   looking at the window. Three things followed from that one predicate: the outcome sentence, the
//   dropped "On hold" amount word, and the card being filed into Past Trips.
//
// sir's decision, 2026-09-13: "fix with an opus agent".
//
// WHY THIS FILE EXISTS:
//   Rule 15 — money and state machines are the silent-blast-radius category. Nothing on a screen tells
//   a guest their money is safe except this sentence, and being wrong about it is invisible until the
//   guest calls. Reading the code cannot prove which of the three states a row lands in; only running
//   the real page script against a real row can.
//
// THE THREE STATES THIS PINS, and the failure mode each one guards:
//   WINDOW RUNNING     — the hold IS still on the card. Saying "released" tells a guest their money is
//                        back when it is not, and burying the card in Past Trips hides the only place
//                        the host's offer will arrive.
//   WINDOW PASSED      — the hold IS gone (the sweep releases it, server.js:39782). Saying it is still
//                        held would leave a guest expecting an offer that can no longer come.
//   HOLD RELEASED EARLY— the server's holdState is the ONLY authority on whether money is held. If it
//                        says "released", the clock does not get to argue.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The card builds every node through window.tstsEl, which lives in common.js — loaded REAL, not
// stubbed, so a markup mistake fails here rather than on sir's screen.
const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  document.body.innerHTML = `<div id="content-area"></div>`;
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = () => {};
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(COMMON_SRC);
  } catch (_c) {
    void _c; // common.js also bootstraps navbar/footer for a real page; only its helpers matter here
  }
  // NOT wrapped: if the edit broke the page script, this must fail loudly rather than quietly leaving
  // hoisted functions behind a swallowed throw.
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
});

// A guest's private request that an individual seat pre-empted — the exact row the server writes at
// server.js:27006-27011, with the fields /api/my/private-requests hands to the page.
function preemptedRow(over) {
  return Object.assign({
    _id: "req-gap9",
    status: "invalidated",
    holdState: "authorized",
    counterEligibleUntil: new Date(Date.now() + 47 * HOUR).toISOString(),
    adminNote: "occurrence_filled_by_individual_booking",
    experienceId: "exp-1",
    experienceTitle: "Dumplings in Fitzroy",
    hostName: "Mei",
    hostId: "host-1",
    preferredDate: "2026-10-02",
    preferredTime: "18:00 - 21:00",
    guests: 6,
    amountCents: 50000,
    currency: "aud"
  }, over || {});
}

const OPEN_SENTENCE_47H =
  "The date filled up before the host answered. The host has 47 hours to offer other dates; "
  + "your card's hold stays until then, and nothing is charged unless you accept.";
const RELEASED_SENTENCE =
  "A seat was booked on that date, so the whole table was no longer available. "
  + "The hold was released; no charge was made.";

function cardText(row) {
  return String(globalThis.__renderPrivateRequestCard(row).textContent || "");
}

describe("GAP 9 — the defect itself", () => {
  test("the page no longer tells a guest the hold was released while it is still held", () => {
    expect(cardText(preemptedRow())).not.toContain("The hold was released");
  });
});

describe("WINDOW RUNNING — the host still has time, and the hold is still on the card", () => {
  test("the request is NOT terminal, so it is not filed away as history", () => {
    expect(globalThis.__isTerminalPrivateRequest(preemptedRow())).toBe(false);
  });

  test("it counts as ACTIVE — this is the filter the Requests panel and the tab count both use", () => {
    // js/my-bookings.js — renderPrivateRequestsPanel() and the Requests sub-tab count.
    expect(globalThis.__isActivePrivateRequest(preemptedRow())).toBe(true);
  });

  test("it stays OUT of Past Trips — this is the filter the Past Trips section uses", () => {
    // js/my-bookings.js — terminalPRs, the Past Trips "Cancelled" group.
    const cache = [preemptedRow()];
    expect(cache.filter(globalThis.__isTerminalPrivateRequest)).toHaveLength(0);
    expect(cache.filter(globalThis.__isActivePrivateRequest)).toHaveLength(1);
  });

  test("the card reads sir's exact sentence, with the hours the guest actually has", () => {
    expect(cardText(preemptedRow())).toContain(OPEN_SENTENCE_47H);
  });

  test("the card KEEPS the 'On hold' amount word — the money really is still held", () => {
    const text = cardText(preemptedRow());
    expect(text).toContain("On hold");
    expect(text).toContain("A$500");
  });

  test("no Chat button — the server shuts the thread on this status (server.js:28713)", () => {
    // Showing one would render a button whose only possible answer is "This request is closed."
    expect(cardText(preemptedRow())).not.toContain("Chat with Host");
  });

  test("pill: while the window runs the pill reads 'Date taken · offer pending' in the orange pill class", () => {
    const pill = globalThis.__privateRequestStatusPill(preemptedRow());
    expect(pill.label).toBe("Date taken · offer pending");
    expect(pill.pillClass).toBe("bg-orange-100 text-orange-700");
  });

  test("pill: once the window has passed or the hold is released the pill reads 'No longer available' in grey", () => {
    const lapsed = globalThis.__privateRequestStatusPill(preemptedRow({
      counterEligibleUntil: new Date(Date.now() - 1 * HOUR).toISOString(),
      holdState: "released"
    }));
    expect(lapsed.label).toBe("No longer available");
    expect(lapsed.pillClass).toBe("bg-gray-100 text-gray-500");

    const releasedEarly = globalThis.__privateRequestStatusPill(preemptedRow({ holdState: "released" }));
    expect(releasedEarly.label).toBe("No longer available");
    expect(releasedEarly.pillClass).toBe("bg-gray-100 text-gray-500");
  });
});

describe("WINDOW PASSED — the sweep has released the hold, so today's sentence stands", () => {
  const lapsed = () => preemptedRow({
    counterEligibleUntil: new Date(Date.now() - 1 * HOUR).toISOString(),
    holdState: "released"
  });

  test("the request is terminal again", () => {
    expect(globalThis.__isTerminalPrivateRequest(lapsed())).toBe(true);
    expect(globalThis.__isActivePrivateRequest(lapsed())).toBe(false);
  });

  test("it moves to Past Trips", () => {
    expect([lapsed()].filter(globalThis.__isTerminalPrivateRequest)).toHaveLength(1);
  });

  test("the card reads the released sentence, unchanged", () => {
    expect(cardText(lapsed())).toContain(RELEASED_SENTENCE);
  });

  test("the 'On hold' amount word is dropped — nothing is held any more", () => {
    expect(cardText(lapsed())).not.toContain("On hold");
  });

  test("a lapsed window the sweep has not reached yet is still closed, by the clock alone", () => {
    // The 60s cron may not have stamped holdState yet; the window itself has already decided.
    const notSweptYet = preemptedRow({ counterEligibleUntil: new Date(Date.now() - 1 * HOUR).toISOString() });
    expect(globalThis.__isTerminalPrivateRequest(notSweptYet)).toBe(true);
    expect(cardText(notSweptYet)).toContain(RELEASED_SENTENCE);
  });
});

describe("HOLD RELEASED EARLY — the server's own signal outranks the clock", () => {
  // holdState is what the server sets when it cancels the hold PI (server.js:26839). If it says
  // "released", the card must never promise a hold that is gone, however much time the stamp claims.
  const releasedEarly = () => preemptedRow({ holdState: "released" });

  test("terminal, even though counterEligibleUntil is still 47 hours away", () => {
    expect(globalThis.__isTerminalPrivateRequest(releasedEarly())).toBe(true);
  });

  test("the card reads the released sentence, not the window one", () => {
    const text = cardText(releasedEarly());
    expect(text).toContain(RELEASED_SENTENCE);
    expect(text).not.toContain("your card's hold stays until then");
  });

  test("no 'On hold' amount word", () => {
    expect(cardText(releasedEarly())).not.toContain("On hold");
  });
});

describe("the hours a guest reads — built on the page's own hours helper", () => {
  test("47 hours left reads as hours, plural", () => {
    expect(globalThis.__prCounterWindowHoursPhrase(preemptedRow())).toBe("47 hours");
  });

  test("two hours left reads as hours, plural", () => {
    const row = preemptedRow({ counterEligibleUntil: new Date(Date.now() + 2 * HOUR).toISOString() });
    expect(globalThis.__prCounterWindowHoursPhrase(row)).toBe("2 hours");
  });

  test("just over an hour reads as ONE hour, singular — the page never says '1 hours'", () => {
    const row = preemptedRow({ counterEligibleUntil: new Date(Date.now() + 70 * 60 * 1000).toISOString() });
    expect(globalThis.__prCounterWindowHoursPhrase(row)).toBe("1 hour");
  });

  test("UNDER an hour says so plainly — never '0 hours', and never a rounded-up '1 hour'", () => {
    // __privateRequestHoursLeft floors at 1, so a guest with 20 minutes would have read "1 hour".
    // "less than an hour" is this page's own phrase for that (the refund note, ~line 618).
    const row = preemptedRow({ counterEligibleUntil: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    expect(globalThis.__prCounterWindowHoursPhrase(row)).toBe("less than an hour");
  });

  test("the under-an-hour card reads the whole sentence with that phrase in it", () => {
    const row = preemptedRow({ counterEligibleUntil: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
    expect(cardText(row)).toContain(
      "The date filled up before the host answered. The host has less than an hour to offer other dates; "
      + "your card's hold stays until then, and nothing is charged unless you accept."
    );
  });

  test("a row with no window stamp yields no phrase rather than a guess", () => {
    expect(globalThis.__prCounterWindowHoursPhrase(preemptedRow({ counterEligibleUntil: "" }))).toBe("");
  });

  test("an invalidated row with no window stamp is closed, as it always was", () => {
    // server.js:27322 writes exactly this row — invalidated, hold released, no window at all.
    const noWindow = preemptedRow({ counterEligibleUntil: "", holdState: "released", adminNote: "hold_setup_failed" });
    expect(globalThis.__isTerminalPrivateRequest(noWindow)).toBe(true);
  });
});

describe("every other state is untouched — the blast radius of the change", () => {
  test("declined is still terminal, with its own sentence", () => {
    const row = preemptedRow({ status: "declined", holdState: "released", counterEligibleUntil: "", adminNote: "" });
    expect(globalThis.__isTerminalPrivateRequest(row)).toBe(true);
    expect(cardText(row)).toContain("The host couldn't take this one. The hold was released; no charge was made.");
  });

  test("expired is still terminal", () => {
    const row = preemptedRow({ status: "expired", holdState: "released", counterEligibleUntil: "", adminNote: "" });
    expect(globalThis.__isTerminalPrivateRequest(row)).toBe(true);
  });

  test("awaiting_host is still open, and still offers the chat the server allows", () => {
    const row = preemptedRow({ status: "awaiting_host", counterEligibleUntil: "", adminNote: "", expiresAt: new Date(Date.now() + 20 * HOUR).toISOString() });
    expect(globalThis.__isTerminalPrivateRequest(row)).toBe(false);
    expect(cardText(row)).toContain("Chat with Host");
  });

  test("a confirmed request whose booking was cancelled is still history", () => {
    const row = preemptedRow({ status: "confirmed", bookingStatus: "cancelled", counterEligibleUntil: "", adminNote: "" });
    expect(globalThis.__isTerminalPrivateRequest(row)).toBe(true);
  });

  test("a counter window only ever opens on an invalidated request", () => {
    ["awaiting_host", "awaiting_payment", "confirmed", "declined", "expired", "alternative_offered", "counter_accept_pending"].forEach((s) => {
      expect(globalThis.__prCounterWindowOpen(preemptedRow({ status: s }))).toBe(false);
    });
    expect(globalThis.__prCounterWindowOpen(preemptedRow())).toBe(true);
  });
});
