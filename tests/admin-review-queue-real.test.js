// REAL coverage of the administrator's review queue (sir's order O-146, 2026-09-16).
//
// sir, verbatim: "the Admin needs to have proper panel to see all listing pending for his revuew".
//
// Every case here evaluates the SHIPPING js/admin.js in the test scope and renders into the markup
// admin.html actually carries, pulled out of the page rather than retyped, so the suite cannot pass
// against a page that does not carry the section.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "admin.js"), "utf-8");
const ADMIN_HTML = readFileSync(resolve(__dirname, "..", "admin.html"), "utf-8");

// The whole section as the page ships it.
const VIEW_EL = (ADMIN_HTML.match(/<div id="view-review-queue"[\s\S]*?\n      <\/div>/) || [""])[0];
const MENU_EL = (ADMIN_HTML.match(/<button id="tab-review-queue"[\s\S]*?<\/button>/) || [""])[0];

function boot(opts) {
  opts = opts || {};
  document.body.innerHTML = MENU_EL + VIEW_EL;

  Object.defineProperty(window, "location", {
    value: { pathname: "/admin.html", search: "", get href() { return ""; }, set href(v) { void v; } },
    writable: true, configurable: true,
  });

  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsHydrateNavAuth = vi.fn();
  window.tstsNotify = vi.fn();
  window.tstsConfirm = opts.confirm || (async () => true);
  window.tstsPrompt = opts.prompt || (async () => "");
  window.tstsSafeImg = (el, url, fallback) => { el.setAttribute("src", String(url || fallback || "")); };
  window.tstsEl = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        if (k.indexOf("-") >= 0 || k === "tabindex") el.setAttribute(k, props[k]);
        else el[k] = props[k];
      });
    }
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

function row(over) {
  return Object.assign({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Sunday Soup For Neighbours",
    description: "A long Sunday table in Brunswick with six seats and three courses.",
    hostName: "Marisa Delgado",
    price: 0,
    currency: "aud",
    priceLabel: "Free",
    isFree: true,
    queuedBecause: "This table is free, and every free table is read by a person before it goes live.",
    submittedAt: "2026-09-01T00:00:00.000Z",
    images: ["https://res.cloudinary.com/demo/image/upload/a.jpg"],
    imageUrl: "https://res.cloudinary.com/demo/image/upload/a.jpg",
    suburb: "Brunswick",
    city: "Melbourne",
    state: "VIC",
    country: "Australia",
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    availableDays: ["Sun"],
    timeSlots: ["18:00-20:00"],
    maxGuests: 6,
    cuisine: ["italian"],
    tags: [],
    requirements: "",
    decisions: [],
    returnedByUs: false,
    returnedByUsAt: null,
  }, over || {});
}

function listText() {
  return String(document.getElementById("review-queue-list").textContent || "");
}

describe("admin.html carries the review queue the order asked for", () => {
  test("the side menu carries a Review queue button with a count badge, hidden at zero", () => {
    expect(MENU_EL).toBeTruthy();
    expect(MENU_EL).toContain("Review queue");
    expect(MENU_EL).toMatch(/id="review-queue-badge"[^>]*class="[^"]*\bhidden\b/);
  });

  test("the section carries a heading, a list, a designed empty state and an error state", () => {
    expect(VIEW_EL).toBeTruthy();
    expect(VIEW_EL).toContain("Review queue");
    expect(VIEW_EL).toContain('id="review-queue-list"');
    expect(VIEW_EL).toContain('id="review-queue-empty"');
    expect(VIEW_EL).toContain('id="review-queue-error"');
    // The empty state is a real one: an icon, a headline, a body and one action.
    expect(VIEW_EL).toContain("fa-regular fa-circle-check");
    expect(VIEW_EL).toContain("Nothing is waiting");
    expect(VIEW_EL).toContain("appears here the moment a host sends it");
    expect(VIEW_EL).toContain('id="review-queue-empty-cta"');
  });

  test("this section carries no browser-default control and no developer word", () => {
    // Every button the section ships is dressed in the panel's own anatomy, never a bare default.
    const buttons = VIEW_EL.match(/<button[^>]*>/g) || [];
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => {
      expect(b).toContain('class="');
      expect(b).toContain('type="button"');
    });
    ["PENDING_REVIEW", "statusReason", "undefined", "payload", "endpoint"].forEach((w) => {
      expect(VIEW_EL).not.toContain(w);
    });
    expect(VIEW_EL).not.toContain("—");
  });
});

describe("what the administrator reads in the queue", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("one waiting listing renders a card with its title, host, price and why it is here", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });

    const text = listText();
    expect(text).toContain("Sunday Soup For Neighbours");
    expect(text).toContain("Hosted by Marisa Delgado");
    expect(text).toContain("Free");
    expect(text).toContain("every free table is read by a person before it goes live");
    expect(text).toContain("Sent for review on");
    expect(document.getElementById("review-queue-empty").classList.contains("hidden")).toBe(true);
    expect(String(document.getElementById("review-queue-count").textContent)).toBe("1 listing waiting");
  });

  test("the heading line names the threshold in money, so the rule is on the screen", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });
    expect(String(document.getElementById("review-queue-intro").textContent)).toContain("A$5");
  });

  test("an under-threshold listing shows its price, not the word Free", () => {
    boot({});
    globalThis.renderReviewQueue({
      items: [row({ isFree: false, priceLabel: "A$3", queuedBecause: "The seat is A$3, under the A$5 mark where we read a listing before it goes live." })],
      thresholdLabel: "A$5",
    });
    const text = listText();
    expect(text).toContain("A$3");
    expect(text).toContain("under the A$5 mark");
  });

  test("the whole listing opens in place, and closes again", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });

    const open = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Read the whole listing");
    expect(open).toBeTruthy();
    expect(open.getAttribute("aria-expanded")).toBe("false");

    open.click();
    expect(open.textContent).toBe("Close the listing");
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const text = listText();
    expect(text).toContain("A long Sunday table in Brunswick");
    expect(text).toContain("Brunswick");
    expect(text).toContain("6 at the table");
    expect(text).toContain("18:00-20:00");

    open.click();
    expect(open.textContent).toBe("Read the whole listing");
  });

  test("a listing with no photos says so rather than showing a broken frame", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row({ images: [], imageUrl: "" })], thresholdLabel: "A$5" });
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Read the whole listing").click();
    expect(listText()).toContain("This listing has no photos.");
  });

  test("the letters this host has already had are on the card, newest first", () => {
    boot({});
    globalThis.renderReviewQueue({
      items: [row({
        decisions: [
          { at: "2026-03-01T00:00:00.000Z", action: "returned_to_host", actionLabel: "Returned to the host", reason: "The description still says forty seats.", letter: "A small change needed on your experience" },
        ],
      })],
      thresholdLabel: "A$5",
    });
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Read the whole listing").click();
    const text = listText();
    expect(text).toContain("What this host has already been told");
    expect(text).toContain("Returned to the host");
    expect(text).toContain("A small change needed on your experience");
    expect(text).toContain("forty seats");
  });

  test("a first-time listing says so instead of showing an empty list", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Read the whole listing").click();
    expect(listText()).toContain("This is the first decision on this listing.");
  });

  test("a listing the platform put back says so on its card", () => {
    boot({});
    globalThis.renderReviewQueue({
      items: [row({ returnedByUs: true, returnedByUsAt: "2026-09-16T00:00:00.000Z" })],
      thresholdLabel: "A$5",
    });
    expect(listText()).toContain("We put this one back ourselves");
    expect(listText()).toContain("the host has been told");
  });

  test("an empty queue shows the designed empty state, not an empty list", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [], thresholdLabel: "A$5" });
    expect(document.getElementById("review-queue-empty").classList.contains("hidden")).toBe(false);
    expect(String(document.getElementById("review-queue-list").textContent)).toBe("");
    expect(String(document.getElementById("review-queue-count").textContent)).toBe("");
  });

  test("a queue that could not load says what happened and offers one thing to do", () => {
    boot({});
    globalThis.renderReviewQueueError("We couldn't load the review queue just now. Please try again.");
    const err = document.getElementById("review-queue-error");
    expect(err.classList.contains("hidden")).toBe(false);
    expect(String(document.getElementById("review-queue-error-msg").textContent)).toContain("Please try again");
    expect(document.getElementById("review-queue-empty").classList.contains("hidden")).toBe(true);
  });

  test("both decisions are offered on every card, in the panel's own buttons", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });
    const approve = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Approve and publish");
    const reject = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Send back with a note");
    expect(approve).toBeTruthy();
    expect(reject).toBeTruthy();
    // Not a browser default: both carry the panel's own classes.
    expect(approve.className).toContain("rounded-xl");
    expect(reject.className).toContain("rounded-xl");
  });

  test("sending a listing back asks for a reason the host will read, and refuses a bare one", async () => {
    let asked = "";
    let posted = false;
    boot({
      prompt: async (q) => { asked = String(q); return "no"; },
      authFetch: async () => { posted = true; return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }; },
    });
    globalThis.renderReviewQueue({ items: [row()], thresholdLabel: "A$5" });

    await globalThis.handleReviewQueueReject("aaaaaaaaaaaaaaaaaaaaaaaa", "Sunday Soup For Neighbours");
    expect(asked).toContain("they'll see this exact message");
    expect(posted).toBe(false);
    expect(window.tstsNotify).toHaveBeenCalledWith("Please give the host at least a sentence about what to fix.", "error");
  });

  test("the badge shows a number when there is work and nothing at all when there is none", async () => {
    boot({ authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { count: 4 } }) }) });
    await globalThis.refreshReviewQueueBadge();
    const badge = document.getElementById("review-queue-badge");
    expect(badge.classList.contains("hidden")).toBe(false);
    expect(String(badge.textContent)).toBe("4");
    expect(badge.getAttribute("aria-label")).toBe("4 listings waiting for review");

    boot({ authFetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { count: 0 } }) }) });
    await globalThis.refreshReviewQueueBadge();
    const zero = document.getElementById("review-queue-badge");
    expect(zero.classList.contains("hidden")).toBe(true);
    expect(String(zero.textContent)).toBe("");
  });

  test("switching tabs does not strip the badge out of its place on the button", () => {
    boot({});
    // switchTab assigns className wholesale, which would drop the row layout this one button needs.
    globalThis.switchTab("review-queue");
    const tab = document.getElementById("tab-review-queue");
    expect(tab.className).toContain("flex");
    expect(tab.className).toContain("justify-between");
    // And it is still the active tab's own treatment, not a second copy of the inactive one.
    expect(tab.className).toContain("bg-orange-50");

    globalThis.switchTab("listings");
    const after = document.getElementById("tab-review-queue");
    expect(after.className).toContain("flex");
    expect(after.className).toContain("justify-between");
    expect(after.className).toContain("border-transparent");
  });

  test("a badge that cannot be counted says nothing rather than a wrong number", async () => {
    boot({ authFetch: async () => { throw new Error("no network"); } });
    await globalThis.refreshReviewQueueBadge();
    const badge = document.getElementById("review-queue-badge");
    expect(badge.classList.contains("hidden")).toBe(true);
    expect(String(badge.textContent)).toBe("");
  });

  test("nothing a person reads on a rendered card is machine text", () => {
    boot({});
    globalThis.renderReviewQueue({ items: [row({ decisions: [{ at: "2026-03-01T00:00:00.000Z", action: "returned_to_host", actionLabel: "Returned to the host", reason: "Please change the photo.", letter: "A small change needed on your experience" }] })], thresholdLabel: "A$5" });
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Read the whole listing").click();
    const text = listText();
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
});
