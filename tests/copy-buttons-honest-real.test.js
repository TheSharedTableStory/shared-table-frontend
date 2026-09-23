// Gap 12 (sir's decision O-94, "fix it using Opus agent") — REAL coverage for every Copy button
// on the platform. The five buttons used to say "Copied" whether or not anything was copied.
// They now all go through window.tstsCopyText in js/common.js, which asks the browser's
// clipboard, then the older selection copy, and when both refuse says so and leaves the text
// selected. It resolves true only on a real copy.
//
// The five sites, each driven here through the real script that owns it:
//   1. js/success.js      — the invite link copy (#copy-invite-btn)
//   2. js/success.js      — the entry code copy (#success-otp-copy)
//   3. js/common.js       — the share URL copy inside window.tstsShareExperience
//   4. js/common.js       — the invite modal's link copy inside window.tstsInviteFriendModal
//   5. js/my-bookings.js  — the entry code copy (#entry-pass-copy-btn)
//
// Gap 34 (sir's decision O-117) brings the sixth Copy button to the same routine, and it is covered
// here beside the other five:
//   6. js/my-bookings.js, the share dialog's link copy, the button carrying
//      data-action "invite-copy-link". It asked the browser's clipboard itself, so with no clipboard
//      the whole branch was skipped and the click did nothing at all, and on a refusal it said
//      "Could not copy link." with no way left to take the link by hand. The same button is rendered
//      a second time on an invite card, with no link field beside it, and that second place is
//      served by this one handler too.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SUCCESS_SRC = readFileSync(resolve(__dirname, "..", "js", "success.js"), "utf-8");
const MY_BOOKINGS_SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

// The two sentences the routine says when both ways are refused.
const REFUSED_ON_SCREEN = "Couldn't copy. Select the code and copy it yourself.";
const REFUSED_NO_FIELD = "Couldn't copy, and there's no field on screen to select from. Here it is to copy by hand: ";

// ── harness ───────────────────────────────────────────────────────────────────────────────────

let notify;

async function settle(n) {
  for (let i = 0; i < (n || 25); i++) await Promise.resolve();
}

// "ok"      → the browser's clipboard accepts
// "reject"  → the browser's clipboard refuses
// "none"    → the browser has no clipboard at all
function setClipboard(mode) {
  let writeText = null;
  if (mode === "ok") writeText = vi.fn(async () => {});
  if (mode === "reject") writeText = vi.fn(async () => { throw new Error("refused"); });
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    writable: true,
    configurable: true,
  });
  return writeText;
}

// true  → the older selection copy works
// false → it reports failure
// null  → the browser has no execCommand at all
function setExecCommand(result) {
  if (result === null) {
    delete document.execCommand;
    return null;
  }
  const fn = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", { value: fn, writable: true, configurable: true });
  return fn;
}

function loadCommon() {
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  // Watch what the person is actually told. tstsToast resolves tstsNotify at call time, so this
  // one spy catches every message the routine and the five sites raise.
  notify = vi.fn();
  window.tstsNotify = notify;
  window.tstsToast = function (opts) {
    const o = (opts && typeof opts === "object") ? opts : {};
    const msg = (typeof opts === "string") ? opts : String(o.message == null ? "" : o.message);
    if (msg) window.tstsNotify(msg, String(o.type || "info"));
  };
}

function said(fragment) {
  return notify.mock.calls.some((c) => String(c[0] || "").indexOf(fragment) !== -1);
}

function saidExactly(sentence) {
  return notify.mock.calls.some((c) => String(c[0] || "") === sentence);
}

function buttonByText(txt) {
  return Array.prototype.slice.call(document.querySelectorAll("button"))
    .find((b) => String(b.textContent || "").trim() === txt);
}

function selectedPageText() {
  const sel = window.getSelection();
  return sel ? String(sel.toString()) : "";
}

function offScreenField() {
  return document.getElementById("tsts-copy-offscreen-field");
}

// ── sites 1 + 2: js/success.js ────────────────────────────────────────────────────────────────
// The success panel as the page really is once it is shown: the entry code sits in a visible
// span, and the invite link sits in a hidden input (success.html keeps the raw URL out of sight).

const INVITE_LINK = "https://example.com/i/abc123";
const ENTRY_CODE = "481902";

function loadSuccessPage() {
  document.body.innerHTML = `
    <div id="loading-state"><p></p></div>
    <div id="success-state">
      <img id="success-exp-image" alt="" />
      <h2 id="success-exp-title"></h2>
      <p id="success-exp-date"></p>
      <p id="success-exp-guests"></p>
      <span id="success-exp-otp">${ENTRY_CODE}</span>
      <button id="success-otp-copy" type="button">Copy</button>
      <span id="success-otp-copy-feedback" class="hidden">Copied</span>
      <button id="copy-invite-btn" type="button">Copy link</button>
      <input id="invite-link-input" type="hidden" value="${INVITE_LINK}" />
      <p id="copy-feedback" class="hidden">Link copied to clipboard. See you at the table.</p>
      <div id="success-next-steps" class="hidden"></div>
    </div>
    <div id="error-state" class="hidden">
      <p id="error-message"></p>
      <button id="retry-verify-btn">Retry</button>
    </div>
  `;
  loadCommon();
  Object.defineProperty(window, "location", {
    value: { search: "", origin: "https://example.com", pathname: "/success.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  // Keep success.js's own start-up out of this walk; the copy buttons are wired at top level.
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") return;
    return Document.prototype.addEventListener.call(document, event, handler, options);
  });
  new Function(SUCCESS_SRC)();
}

const inviteFeedbackShown = () => !document.getElementById("copy-feedback").classList.contains("hidden");
const codeFeedbackShown = () => !document.getElementById("success-otp-copy-feedback").classList.contains("hidden");

describe("site 1 — success page, invite link copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → the page shows its copied line", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    loadSuccessPage();
    document.getElementById("copy-invite-btn").click();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(INVITE_LINK);
    expect(inviteFeedbackShown()).toBe(true);
  });

  test("clipboard refuses but the older selection copy works → still shows its copied line", async () => {
    const writeText = setClipboard("reject");
    const exec = setExecCommand(true);
    loadSuccessPage();
    document.getElementById("copy-invite-btn").click();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(inviteFeedbackShown()).toBe(true);
    expect(said("Couldn't copy")).toBe(false);
  });

  test("both refuse → says so, hands the link over, and never shows the copied line", async () => {
    setClipboard("reject");
    setExecCommand(false);
    loadSuccessPage();
    document.getElementById("copy-invite-btn").click();
    await settle();
    expect(inviteFeedbackShown()).toBe(false);
    // The link lives in a hidden input on this page, so there is nothing on screen to select.
    expect(saidExactly(REFUSED_NO_FIELD + INVITE_LINK)).toBe(true);
    const parked = offScreenField();
    expect(parked).toBeTruthy();
    expect(parked.value).toBe(INVITE_LINK);
    expect(parked.selectionStart).toBe(0);
    expect(parked.selectionEnd).toBe(INVITE_LINK.length);
  });

  test("no clipboard and no older copy → same honest outcome, no copied line", async () => {
    setClipboard("none");
    setExecCommand(null);
    loadSuccessPage();
    document.getElementById("copy-invite-btn").click();
    await settle();
    expect(inviteFeedbackShown()).toBe(false);
    expect(saidExactly(REFUSED_NO_FIELD + INVITE_LINK)).toBe(true);
  });
});

describe("site 2 — success page, entry code copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → the page shows Copied", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    loadSuccessPage();
    document.getElementById("success-otp-copy").click();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(ENTRY_CODE);
    expect(codeFeedbackShown()).toBe(true);
  });

  test("clipboard refuses but the older selection copy works → still shows Copied", async () => {
    setClipboard("reject");
    const exec = setExecCommand(true);
    loadSuccessPage();
    document.getElementById("success-otp-copy").click();
    await settle();
    expect(exec).toHaveBeenCalledWith("copy");
    expect(codeFeedbackShown()).toBe(true);
    expect(said("Couldn't copy")).toBe(false);
  });

  test("both refuse → exact sentence, code left selected, never Copied", async () => {
    setClipboard("reject");
    setExecCommand(false);
    loadSuccessPage();
    document.getElementById("success-otp-copy").click();
    await settle();
    expect(codeFeedbackShown()).toBe(false);
    expect(saidExactly(REFUSED_ON_SCREEN)).toBe(true);
    expect(selectedPageText()).toBe(ENTRY_CODE);
  });
});

// ── site 3: js/common.js, the share URL copy ──────────────────────────────────────────────────

const SHARE_URL = "https://example.com/experience.html?id=exp_9";

function loadCommonPage() {
  document.body.innerHTML = "<main></main>";
  loadCommon();
  delete navigator.share;
  window.API_BASE = "https://api.example.com";
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
}

describe("site 3 — share helper, link copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → says the link is copied", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    loadCommonPage();
    const r = await window.tstsShareExperience({ url: SHARE_URL });
    expect(writeText.mock.calls[0][0]).toBe(SHARE_URL);
    expect(r.ok).toBe(true);
    expect(saidExactly("Link copied to clipboard.")).toBe(true);
  });

  test("clipboard refuses but the older selection copy works → still says the link is copied", async () => {
    setClipboard("reject");
    const exec = setExecCommand(true);
    loadCommonPage();
    const r = await window.tstsShareExperience({ url: SHARE_URL });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(r.ok).toBe(true);
    expect(saidExactly("Link copied to clipboard.")).toBe(true);
  });

  test("both refuse → says so with the link, and never says it is copied", async () => {
    setClipboard("reject");
    setExecCommand(false);
    loadCommonPage();
    const r = await window.tstsShareExperience({ url: SHARE_URL });
    expect(r.ok).toBe(false);
    expect(saidExactly(REFUSED_NO_FIELD + SHARE_URL)).toBe(true);
    expect(said("Link copied to clipboard.")).toBe(false);
    const parked = offScreenField();
    expect(parked.value).toBe(SHARE_URL);
    expect(parked.selectionEnd).toBe(SHARE_URL.length);
  });
});

// ── site 4: js/common.js, the invite modal's link copy ────────────────────────────────────────

const MODAL_LINK = "https://example.com/i/modal-99";

async function openInviteModalWithLink() {
  window.authFetch = async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, data: { inviteUrl: MODAL_LINK } }),
  });
  window.tstsInviteFriendModal({ experienceId: "a1b2c3d4e5f60718293a4b5c" });
  buttonByText("Create invite link").click();
  await settle();
  return document.querySelector('input[type="text"]');
}

describe("site 4 — invite modal, link copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → says Link copied!", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    loadCommonPage();
    const linkInput = await openInviteModalWithLink();
    expect(linkInput.value).toBe(MODAL_LINK);
    buttonByText("Copy link").click();
    await settle();
    expect(writeText.mock.calls[0][0]).toBe(MODAL_LINK);
    expect(saidExactly("Link copied!")).toBe(true);
  });

  test("clipboard refuses but the older selection copy works → still says Link copied!", async () => {
    setClipboard("reject");
    const exec = setExecCommand(true);
    loadCommonPage();
    await openInviteModalWithLink();
    buttonByText("Copy link").click();
    await settle();
    expect(exec).toHaveBeenCalledWith("copy");
    expect(saidExactly("Link copied!")).toBe(true);
  });

  test("both refuse → exact sentence, link left selected in its field, never Link copied!", async () => {
    setClipboard("reject");
    setExecCommand(false);
    loadCommonPage();
    const linkInput = await openInviteModalWithLink();
    buttonByText("Copy link").click();
    await settle();
    expect(saidExactly(REFUSED_ON_SCREEN)).toBe(true);
    expect(said("Link copied!")).toBe(false);
    expect(linkInput.selectionStart).toBe(0);
    expect(linkInput.selectionEnd).toBe(MODAL_LINK.length);
    expect(document.activeElement).toBe(linkInput);
  });
});

// ── site 5: js/my-bookings.js, the entry code copy ────────────────────────────────────────────

const PASS_CODE = "730514";

function loadMyBookingsPage() {
  document.body.innerHTML = `
    <div id="content-area"></div>
    <button id="tab-trips"></button>
    <button id="tab-hosting"></button>
    <button id="tab-wishlist"></button>
    <div id="guest-modal" class="hidden"></div>
    <div id="review-modal" class="hidden">
      <h3 id="review-modal-title"></h3>
      <p id="review-modal-subtitle"></p>
      <button id="review-cancel-btn"></button>
      <form id="review-form"></form>
    </div>
    <div id="complaint-modal" class="hidden"></div>
    <div id="cancel-review-modal" class="hidden"></div>
    <div id="checkin-modal" class="hidden"></div>
    <div id="entry-pass-overlay">
      <p id="entry-pass-code">${PASS_CODE}</p>
      <button type="button" id="entry-pass-copy-btn">Copy code</button>
      <button type="button" id="entry-pass-close-btn">Close</button>
    </div>
    <button id="close-modal-btn"></button>
  `;
  loadCommon();
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsFormatDateShort = (d) => String(d || "");
  globalThis.WebSocket = class { constructor() {} send() {} close() {} };
  // eslint-disable-next-line no-eval
  (0, eval)(MY_BOOKINGS_SRC);
}

const passButtonLabel = () => String(document.getElementById("entry-pass-copy-btn").textContent || "").trim();

describe("site 5 — entry pass, code copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → the button says Copied", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    loadMyBookingsPage();
    document.getElementById("entry-pass-copy-btn").click();
    await settle();
    expect(writeText.mock.calls[0][0]).toBe(PASS_CODE);
    expect(passButtonLabel()).toBe("Copied");
  });

  test("clipboard refuses but the older selection copy works → the button still says Copied", async () => {
    setClipboard("reject");
    const exec = setExecCommand(true);
    loadMyBookingsPage();
    document.getElementById("entry-pass-copy-btn").click();
    await settle();
    expect(exec).toHaveBeenCalledWith("copy");
    expect(passButtonLabel()).toBe("Copied");
  });

  test("both refuse → exact sentence, code left selected, the button never says Copied", async () => {
    setClipboard("reject");
    setExecCommand(false);
    loadMyBookingsPage();
    document.getElementById("entry-pass-copy-btn").click();
    await settle();
    expect(passButtonLabel()).toBe("Copy code");
    expect(saidExactly(REFUSED_ON_SCREEN)).toBe(true);
    expect(selectedPageText()).toBe(PASS_CODE);
  });
});

// ── site 6: js/my-bookings.js, the share dialog's link copy ───────────────────────────────────
// Walked the way a guest reaches it: the page starts up as the browser starts it, a real booking
// card is on screen, the card's Invite / Share menu is opened and "Share link / social media" is
// chosen, the link comes back from the server into the field in the dialog, and the Copy button
// beside that field is clicked.

const SHARE_DIALOG_LINK = "https://example.com/i/share-dialog-77";
// The words the success page says on a real link copy, which this button now says too.
const COPIED_LINE = "Link copied to clipboard. See you at the table. ✨";
// What the button used to say when the browser's clipboard refused, with no way left to copy by hand.
const OLD_REFUSAL_WORDS = "Could not copy link.";
const DAY_MS = 24 * 60 * 60 * 1000;

// Everything this page's start-up hangs on the document, kept so the next walk starts with one page
// wired to the document and never two.
let mbDocListeners = [];

function dropPreviousMyBookingsPage() {
  mbDocListeners.forEach((pair) => document.removeEventListener(pair[0], pair[1]));
  mbDocListeners = [];
}

// The server's answers this walk needs: a share link for the dialog, an empty connections list for
// the part of the dialog that offers friends, nothing for anything else.
async function shareDialogAuthFetch(url) {
  const u = String(url || "");
  if (u.indexOf("/api/invites") === 0) {
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { inviteUrl: SHARE_DIALOG_LINK } }) };
  }
  if (u.indexOf("/api/social/connections") === 0) {
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { connections: [] } }) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
}

// A confirmed, paid, upcoming booking: the card that carries the Invite / Share menu.
function shareableBooking() {
  return {
    _id: "bk-share-1",
    bookingRef: "SH4R-E001",
    status: "confirmed",
    paymentStatus: "paid",
    bookingDate: new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10),
    timeSlot: "17:00 - 20:00",
    guests: 2,
    amountCents: 24000,
    currency: "aud",
    experience: {
      _id: "exp-share-1",
      title: "Twilight Supper Club",
      city: "Melbourne",
      addressLine: "88 Smith Street",
      suburb: "Fitzroy",
      state: "VIC",
      imageUrl: "/assets/experience-default.jpg"
    }
  };
}

// The page as a signed-in guest gets it: the script runs, then the page's own ready handler runs
// once, which is what wires the button this site is about.
async function loadMyBookingsPageReady() {
  dropPreviousMyBookingsPage();
  loadMyBookingsPage();
  window.authFetch = shareDialogAuthFetch;
  window.tstsGetSession = async () => ({ ok: true, status: 200, user: { _id: "me-1" } });
  window.tstsFormatDateShort = (v) => ((v instanceof Date) ? "14 Sep 2026" : String(v));
  window.__tstsMeId = "me-1";

  // loadMyBookingsPage has already run the script, which parks the page's start-up on
  // DOMContentLoaded. Run the script again with that handler held, so it can be run exactly once
  // here and everything it hangs on the document can be taken back off before the next walk.
  let pageReady = null;
  const hold = vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") { pageReady = handler; return; }
    return Document.prototype.addEventListener.call(document, event, handler, options);
  });
  // eslint-disable-next-line no-eval
  (0, eval)(MY_BOOKINGS_SRC);
  hold.mockRestore();

  const keep = vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    mbDocListeners.push([event, handler]);
    return Document.prototype.addEventListener.call(document, event, handler, options);
  });
  await pageReady();
  keep.mockRestore();
  await settle(60);
}

// Open the dialog the way a guest opens it: on a real card, open the Invite / Share menu and choose
// the link item. Both are real clicks on the real buttons the card renders.
async function openShareDialogFromCard() {
  const card = globalThis.renderTripCard(shareableBooking());
  document.getElementById("content-area").appendChild(card);
  buttonByText("🤝 Invite / Share").click();
  buttonByText("Share link / social media").click();
  await settle();
  return document.getElementById("tsts-share-modal");
}

const shareDialogCopyBtn = () => document.querySelector('#tsts-share-modal button[data-action="invite-copy-link"]');

// Found by the link it holds, never by the selector the page itself uses: the dialog carries a
// second text field (Find Someone), so this is what proves the LINK field is the one handed over.
function shareDialogLinkField() {
  return Array.prototype.slice.call(document.querySelectorAll('#tsts-share-modal input[type="text"]'))
    .find((el) => el.value === SHARE_DIALOG_LINK);
}

// The real routine, watched: the call the button makes is recorded, then it runs untouched.
function watchCopyRoutine() {
  const real = window.tstsCopyText;
  const spy = vi.fn(function (text, opts) { return real.call(window, text, opts); });
  window.tstsCopyText = spy;
  return spy;
}

describe("site 6: share dialog, link copy", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("clipboard accepts → says the copied line, and hands the routine the link and the link field", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    const linkField = shareDialogLinkField();
    expect(linkField).toBeTruthy();
    const copy = watchCopyRoutine();
    notify.mockClear();

    shareDialogCopyBtn().click();
    await settle();

    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0][0]).toBe(SHARE_DIALOG_LINK);
    expect(copy.mock.calls[0][1].selectEl).toBe(linkField);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(SHARE_DIALOG_LINK);
    expect(saidExactly(COPIED_LINE)).toBe(true);
  });

  test("clipboard refuses but the older selection copy works → still says the copied line", async () => {
    setClipboard("reject");
    const exec = setExecCommand(true);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    notify.mockClear();

    shareDialogCopyBtn().click();
    await settle();

    expect(exec).toHaveBeenCalledWith("copy");
    expect(saidExactly(COPIED_LINE)).toBe(true);
    expect(said("Couldn't copy")).toBe(false);
  });

  test("both refuse → the routine says so, the link is left selected in its field, the button adds nothing", async () => {
    setClipboard("reject");
    setExecCommand(false);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    const linkField = shareDialogLinkField();
    notify.mockClear();

    shareDialogCopyBtn().click();
    await settle();

    expect(saidExactly(REFUSED_ON_SCREEN)).toBe(true);
    expect(said(COPIED_LINE)).toBe(false);
    expect(said(OLD_REFUSAL_WORDS)).toBe(false);
    expect(linkField.selectionStart).toBe(0);
    expect(linkField.selectionEnd).toBe(SHARE_DIALOG_LINK.length);
    expect(document.activeElement).toBe(linkField);
  });

  test("no clipboard at all → no longer a dead click: the person is told and the link is left selected", async () => {
    setClipboard("none");
    setExecCommand(null);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    const linkField = shareDialogLinkField();
    notify.mockClear();

    shareDialogCopyBtn().click();
    await settle();

    expect(saidExactly(REFUSED_ON_SCREEN)).toBe(true);
    expect(said(COPIED_LINE)).toBe(false);
    expect(linkField.selectionEnd).toBe(SHARE_DIALOG_LINK.length);
  });

  test("the button never asks the browser's clipboard itself, whatever the routine answers", async () => {
    const writeText = setClipboard("ok");
    setExecCommand(null);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    const linkField = shareDialogLinkField();

    // The routine answers yes without touching anything. If the button still copied by itself, the
    // browser's clipboard would carry the call.
    const yes = vi.fn(async () => true);
    window.tstsCopyText = yes;
    notify.mockClear();
    shareDialogCopyBtn().click();
    await settle();
    expect(yes).toHaveBeenCalledTimes(1);
    expect(yes.mock.calls[0][0]).toBe(SHARE_DIALOG_LINK);
    expect(yes.mock.calls[0][1].selectEl).toBe(linkField);
    expect(writeText).not.toHaveBeenCalled();
    expect(saidExactly(COPIED_LINE)).toBe(true);

    // The routine answers no. It has already told the person itself, so the button says nothing.
    const no = vi.fn(async () => false);
    window.tstsCopyText = no;
    notify.mockClear();
    shareDialogCopyBtn().click();
    await settle();
    expect(no).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

// ── the whole point: nothing anywhere says Copied over a refusal ───────────────────────────────

describe("no copy button says Copied when nothing was copied", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("all six sites, both ways refused", async () => {
    // 1 + 2 — the success page.
    setClipboard("reject");
    setExecCommand(false);
    loadSuccessPage();
    document.getElementById("copy-invite-btn").click();
    document.getElementById("success-otp-copy").click();
    await settle();
    expect(inviteFeedbackShown()).toBe(false);
    expect(codeFeedbackShown()).toBe(false);
    expect(said("Copied")).toBe(false);
    expect(said("copied")).toBe(false);

    // 3 — the share helper.
    setClipboard("reject");
    setExecCommand(false);
    loadCommonPage();
    const shared = await window.tstsShareExperience({ url: SHARE_URL });
    expect(shared.ok).toBe(false);
    expect(said("copied")).toBe(false);

    // 4 — the invite modal.
    setClipboard("reject");
    setExecCommand(false);
    loadCommonPage();
    await openInviteModalWithLink();
    buttonByText("Copy link").click();
    await settle();
    expect(said("Link copied!")).toBe(false);

    // 5 — the entry pass.
    setClipboard("reject");
    setExecCommand(false);
    loadMyBookingsPage();
    document.getElementById("entry-pass-copy-btn").click();
    await settle();
    expect(passButtonLabel()).toBe("Copy code");
    expect(said("Copied")).toBe(false);

    // 6: the share dialog's link.
    setClipboard("reject");
    setExecCommand(false);
    await loadMyBookingsPageReady();
    await openShareDialogFromCard();
    notify.mockClear();
    shareDialogCopyBtn().click();
    await settle();
    expect(said("copied")).toBe(false);
    expect(said(OLD_REFUSAL_WORDS)).toBe(false);
  });
});
