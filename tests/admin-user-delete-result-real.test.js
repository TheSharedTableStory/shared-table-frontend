// REAL coverage for the administrator's account-closure report on admin.html.
//
// sir's question 3 on gap 32's audit, 2026-09-15: bookingsCascadeFailed can now come back
// non-zero, where the code that produced it could only ever produce zero. This screen said
// NOTHING at all about any of it: the answer carried the counts and js/admin.js threw them
// away, so an administrator closed a host's account with no idea whether three guests had
// just been cancelled and refunded or none had, and a booking the sweep could not cancel was
// invisible.
//
// These cases evaluate the REAL js/admin.js against the REAL element from admin.html and read
// back the sentences a person sees.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "admin.js"), "utf-8");
const ADMIN_HTML = readFileSync(resolve(__dirname, "..", "admin.html"), "utf-8");

// The element as admin.html actually ships it, pulled out of the page rather than retyped,
// so this suite cannot pass against a page that does not carry it.
const RESULT_EL = (ADMIN_HTML.match(/<div id="user-delete-result"[^>]*><\/div>/) || [""])[0];

function bootAdmin(opts) {
  opts = opts || {};
  document.body.innerHTML = `<div id="admin-shell"></div>` + RESULT_EL;

  Object.defineProperty(window, "location", {
    value: { pathname: "/admin.html", search: "", get href() { return ""; }, set href(v) { void v; } },
    writable: true, configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsGetSession = opts.session || (async () => ({ ok: false }));
  window.tstsHydrateNavAuth = vi.fn();
  window.tstsNotify = vi.fn();
  window.tstsConfirm = opts.confirm || (async () => true);
  window.tstsOtpVerify = opts.otp || (async () => "otp_token_for_test");
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (Array.isArray(kids)) kids.forEach((k) => { if (k) el.append(typeof k === "string" ? document.createTextNode(k) : k); });
    else if (kids && typeof kids === "string") el.textContent = kids;
    return el;
  };
  window.tstsUnwrap = (d) => (d && d.data !== undefined ? d.data : d);

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(SRC);
  } catch (eEval) {
    void eEval;
  }
}

function resultEl() { return document.getElementById("user-delete-result"); }
function resultText() { return String(resultEl().textContent || ""); }

describe("admin.html carries the place the report is written", () => {
  test("the page ships a hidden, polite result area inside the user list", () => {
    expect(RESULT_EL).toBeTruthy();
    expect(RESULT_EL).toMatch(/class="[^"]*\bhidden\b/);
    expect(RESULT_EL).toMatch(/role="status"/);
    expect(RESULT_EL).toMatch(/aria-live="polite"/);
  });
});

describe("what the administrator reads after closing an account", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("nothing was left behind: the work is stated in plain words and the box reads as done", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 3, holdsReleased: 1, bookingsCascadeFailed: 0 });

    const el = resultEl();
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.classList.contains("bg-emerald-50")).toBe(true);
    expect(el.classList.contains("bg-amber-50")).toBe(false);
    expect(resultText()).toContain("The account is closed.");
    expect(resultText()).toContain("3 bookings were cancelled and those guests were told");
    expect(resultText()).toContain("1 hold on a guest's card was released");
    expect(resultText()).not.toMatch(/could not be cancelled/);
  });

  test("one of each, singular: the numbers are counted apart and read as English, not as a total", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 1, holdsReleased: 1, bookingsCascadeFailed: 0 });
    expect(resultText()).toContain("1 booking was cancelled and that guest was told");
    expect(resultText()).toContain("1 hold on a guest's card was released");
    expect(resultText()).not.toContain("2 bookings");
  });

  test("nothing to do: the screen says so rather than leaving the administrator guessing", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 0, bookingsCascadeFailed: 0 });
    expect(resultText()).toContain("There were no bookings left to cancel.");
  });

  test("something was left behind: the box warns, names what is unfinished, and says exactly what to do about it", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 2, holdsReleased: 0, bookingsCascadeFailed: 1 });

    const el = resultEl();
    expect(el.classList.contains("bg-amber-50")).toBe(true);
    expect(el.classList.contains("bg-emerald-50")).toBe(false);
    const text = resultText();
    expect(text).toContain("2 bookings were cancelled and those guests were told");
    expect(text).toContain("1 booking could not be cancelled, so that guest has not been told and no money has gone back to them yet.");
    // GAP-46b (gap 32's final audit, sir 2026-09-15): this panel has no tab called "Bookings".
    // Its sidebar reads "Bookings & Requests", and the one sentence whose whole job is to send
    // an administrator somewhere has to name what is on the screen.
    expect(text).toContain("What to do: open the Bookings and Requests tab, find the bookings on this host's experiences, and cancel and refund each one yourself.");
    // Plain words only: no field names, no codes, no developer shorthand.
    expect(text).not.toMatch(/bookingsCascade|cascade|null|undefined|NaN|\[object Object\]/i);
  });

  test("more than one left behind reads as plural, and still says what to do", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 0, bookingsCascadeFailed: 2 });
    const text = resultText();
    expect(text).toContain("2 bookings could not be cancelled, so those guests have not been told and no money has gone back to them yet.");
    expect(text).toContain("What to do:");
  });

  test("a second closure replaces the first report rather than stacking a second one under it", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 0, bookingsCascadeFailed: 2 });
    globalThis.renderUserDeleteResult({ bookingsCascaded: 1, holdsReleased: 0, bookingsCascadeFailed: 0 });
    const text = resultText();
    expect(text).toContain("1 booking was cancelled and that guest was told");
    expect(text).not.toMatch(/could not be cancelled/);
    expect(resultEl().classList.contains("bg-emerald-50")).toBe(true);
    expect(resultEl().classList.contains("bg-amber-50")).toBe(false);
  });

  test("a hold that came off the card on a booking that would not close reads as its own piece of work, not as a guest left in the dark", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 0, bookingsCascadeFailed: 0, holdsStuck: 1, holdsNotReleased: 0 });

    const el = resultEl();
    expect(el.classList.contains("bg-amber-50")).toBe(true);
    const text = resultText();
    expect(text).toContain("1 card hold was released and that guest was told, but its booking could not be closed. No money is held on that guest's card.");
    expect(text).toContain("What to do: open the Bookings and Requests tab and close that booking by hand.");
    // The sentence that used to appear here, and was false on both halves.
    expect(text).not.toContain("that guest has not been told and no money has gone back to them yet");
    expect(text).not.toMatch(/holdsStuck|cascade|null|undefined|NaN|\[object Object\]/i);
  });

  test("more than one stuck hold reads as plural", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 0, bookingsCascadeFailed: 0, holdsStuck: 2, holdsNotReleased: 0 });
    const text = resultText();
    expect(text).toContain("2 card holds were released and those guests were told, but their bookings could not be closed. No money is held on those guests' cards.");
    expect(text).toContain("What to do: open the Bookings and Requests tab and close those bookings by hand.");
  });

  test("a hold the card provider would not release says the money is still there and who has to finish it", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 1, bookingsCascadeFailed: 0, holdsStuck: 0, holdsNotReleased: 1 });

    const el = resultEl();
    expect(el.classList.contains("bg-amber-50")).toBe(true);
    const text = resultText();
    expect(text).toContain("1 hold on a guest's card could not be released, and that guest has been told we are still clearing it.");
    expect(text).toContain("What to do: release that hold with the card provider, then reply to the guest to say it is done.");
    expect(text).not.toMatch(/holdsNotReleased|stripe|payment intent|null|undefined|NaN/i);
  });

  test("more than one hold left on a card reads as plural", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 0, holdsReleased: 2, bookingsCascadeFailed: 0, holdsStuck: 0, holdsNotReleased: 2 });
    const text = resultText();
    expect(text).toContain("2 holds on guests' cards could not be released, and those guests have been told we are still clearing them.");
    expect(text).toContain("What to do: release those holds with the card provider, then reply to those guests to say it is done.");
  });

  test("all three kinds at once: each is named once, in its own words, with its own instruction", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 2, holdsReleased: 3, bookingsCascadeFailed: 1, holdsStuck: 1, holdsNotReleased: 1 });
    const text = resultText();
    expect(text).toContain("2 bookings were cancelled and those guests were told");
    expect(text).toContain("3 holds on guests' cards were released");
    expect(text).toContain("1 booking could not be cancelled");
    expect(text).toContain("1 card hold was released and that guest was told, but its booking could not be closed");
    expect(text).toContain("1 hold on a guest's card could not be released");
    expect(text.match(/What to do:/g).length).toBe(3);
  });

  test("an answer that carries none of the new numbers still reads exactly as it did", () => {
    bootAdmin({});
    globalThis.renderUserDeleteResult({ bookingsCascaded: 1, holdsReleased: 0, bookingsCascadeFailed: 0 });
    const text = resultText();
    expect(text).toBe("The account is closed. 1 booking was cancelled and that guest was told.");
    expect(resultEl().classList.contains("bg-emerald-50")).toBe(true);
  });
});

describe("the whole closure, driven as the administrator drives it", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("the real handler reads the real answer and fills the screen from it, and the toast points at the note", async () => {
    let sentTo = "";
    bootAdmin({
      authFetch: async (url, opts) => {
        sentTo = String(url) + " " + String((opts && opts.method) || "");
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { message: "User banned/deleted.", bookingsCascaded: 2, holdsReleased: 1, bookingsCascadeFailed: 1 }, rid: "r1" }),
        };
      },
    });

    await globalThis.handleDeleteUser("665f1f77bcf86cd799439011");

    expect(sentTo).toMatch(/\/api\/admin\/users\/665f1f77bcf86cd799439011 DELETE/);
    const text = resultText();
    expect(text).toContain("2 bookings were cancelled and those guests were told");
    expect(text).toContain("1 hold on a guest's card was released");
    expect(text).toContain("1 booking could not be cancelled");
    expect(text).toContain("What to do:");
    expect(window.tstsNotify).toHaveBeenCalledWith(
      "Account closed, but 1 thing was left behind. The note above the user list says what to do.",
      "warning"
    );
  });

  test("a clean closure says so, and the note carries the counts", async () => {
    bootAdmin({
      authFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { message: "User banned/deleted.", bookingsCascaded: 1, holdsReleased: 0, bookingsCascadeFailed: 0 }, rid: "r2" }),
      }),
    });

    await globalThis.handleDeleteUser("665f1f77bcf86cd799439012");

    expect(resultText()).toContain("1 booking was cancelled and that guest was told");
    expect(window.tstsNotify).toHaveBeenCalledWith("Account closed.", "success");
  });

  test("the administrator backs out of the confirmation: nothing is sent and nothing is reported", async () => {
    let called = false;
    bootAdmin({
      confirm: async () => false,
      authFetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }; },
    });

    await globalThis.handleDeleteUser("665f1f77bcf86cd799439013");

    expect(called).toBe(false);
    expect(resultEl().classList.contains("hidden")).toBe(true);
    expect(resultText()).toBe("");
  });

  test("a closure that fails leaves no report from the account before it: the band is cleared before anything is attempted, and only the error is said", async () => {
    let attempts = 0;
    bootAdmin({
      authFetch: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, data: { message: "User banned/deleted.", bookingsCascaded: 3, holdsReleased: 0, bookingsCascadeFailed: 0 }, rid: "r3" }),
          };
        }
        throw new Error("We could not reach the server. Check your connection and try again.");
      },
    });

    await globalThis.handleDeleteUser("665f1f77bcf86cd799439014");
    expect(resultText()).toContain("3 bookings were cancelled and those guests were told");

    await globalThis.handleDeleteUser("665f1f77bcf86cd799439015");

    // The report from the previous account does not stand over this one, describing work that
    // was never done on it.
    expect(resultEl().classList.contains("hidden")).toBe(true);
    expect(resultText()).toBe("");
    expect(window.tstsNotify).toHaveBeenLastCalledWith("We could not reach the server. Check your connection and try again.", "error");
  });
});
