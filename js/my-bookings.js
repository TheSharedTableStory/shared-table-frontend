// js/my-bookings.js (CLOSED: dashboard + hosting)
// Uses common.js single-truth: window.authFetch, window.getAuthToken

const contentEl = document.getElementById("content-area");
const tabTrips = document.getElementById("tab-trips");
const tabHost = document.getElementById("tab-hosting");
const tabWishlist = document.getElementById("tab-wishlist");

const guestModal = document.getElementById("guest-modal");
const reviewModal = document.getElementById("review-modal");
const complaintModal = document.getElementById("complaint-modal");
const cancelReviewModal = document.getElementById("cancel-review-modal");
const checkinModal = document.getElementById("checkin-modal");
const entryPassOverlay = document.getElementById("entry-pass-overlay");

const closeGuestBtn = document.getElementById("close-modal-btn");
const reviewCancelBtn = document.getElementById("review-cancel-btn");
const reviewForm = document.getElementById("review-form");
const reviewModalTitleEl = document.getElementById("review-modal-title");
const reviewModalSubtitleEl = document.getElementById("review-modal-subtitle");
const reviewSubmitBtn = document.getElementById("review-submit-btn");
const reviewWindowHintEl = document.getElementById("review-window-hint");
const reviewIdInput = document.getElementById("review-id");
const complaintCancelBtn = document.getElementById("complaint-cancel-btn");
const complaintForm = document.getElementById("complaint-form");
const complaintMessageInput = document.getElementById("complaint-message");
const complaintWordCount = document.getElementById("complaint-word-count");
const complaintStatus = document.getElementById("complaint-status");
const complaintSubmitBtn = document.getElementById("complaint-submit-btn");
const cancelReviewBookingIdInput = document.getElementById("cancel-review-booking-id");
// Owner 2026-06-06: cancel modal shows the real money breakdown (paid / charge / refund / basis),
// no policy-version cruft.
const cancelReviewPaidEl = document.getElementById("cancel-review-paid");
const cancelReviewChargeEl = document.getElementById("cancel-review-charge");
const cancelReviewChargePctEl = document.getElementById("cancel-review-charge-pct");
const cancelReviewRefundPercentEl = document.getElementById("cancel-review-refund-percent");
const cancelReviewRefundEstimateEl = document.getElementById("cancel-review-refund-estimate");
const cancelReviewBasisEl = document.getElementById("cancel-review-basis");
const cancelReviewNoteEl = document.getElementById("cancel-review-note");
const cancelReviewCloseBtn = document.getElementById("cancel-review-close-btn");
const cancelReviewConfirmBtn = document.getElementById("cancel-review-confirm-btn");

// === Star rating widget ===
const STAR_LABELS = { 1: "Terrible", 2: "Poor", 3: "Average", 4: "Good", 5: "Excellent" };
const starContainer = document.getElementById("star-rating-container");
const starRatingLabel = document.getElementById("star-rating-label");
function syncStars(val) {
  const v = parseInt(val, 10) || 5;
  if (starContainer) {
    starContainer.querySelectorAll(".star-btn").forEach(function (btn) {
      const bv = parseInt(btn.getAttribute("data-value"), 10);
      btn.className = btn.className.replace(/text-amber-400|text-gray-300/g, "").trim() + (bv <= v ? " text-amber-400" : " text-gray-300");
    });
  }
  if (starRatingLabel) starRatingLabel.textContent = STAR_LABELS[v] || "";
}
if (starContainer) {
  starContainer.addEventListener("click", function (e) {
    var btn = e.target.closest(".star-btn");
    if (!btn || starContainer.classList.contains("pointer-events-none")) return;
    var v = btn.getAttribute("data-value");
    var inp = document.getElementById("review-rating");
    if (inp) inp.value = v;
    syncStars(v);
  });
}

let hostBookingsCache = []; // for modal lookup by booking id
let guestBookingsCache = []; // for complaint modal lookup by booking id

// F7: Tab count badge helper, updates tab label with count in parentheses
function __updateTabBadge(tabEl, baseLabel, count) {
  if (!tabEl) return;
  tabEl.textContent = count > 0 ? baseLabel + " (" + count + ")" : baseLabel;
}

// Owner 2026-08-05 (sir: "Remove it now", then "Delete it"): __hostNeedsAttentionCount() lived here and
// fed the hosting tab's "(N)" badge. Both are gone. The badge said "N of something across eight sections"
// and named nothing — the same fault that retired the section-pill counts. Overview's ACTION ITEMS already
// names every obligation in plain English with its own button, and NOTIFICATIONS (sir's priority build
// after the P6 walk) will name each item and link straight to it. This also restores sir's own ruling of
// 2026-06-06, recorded at the tabTrips badge below: no count on the top tab.

// Phase 6: occurrence-key helper for grouping bookings by occurrence
function _occurrenceKey(b) {
  return String((b && b.experienceId) || (b && b.experience && (b.experience._id || b.experience.id)) || "") +
    "|" + String((b && b.bookingDate) || "") +
    "|" + String((b && b.timeSlot) || "");
}
function _groupByKey(arr, keyFn) {
  var groups = {};
  var order = [];
  for (var i = 0; i < arr.length; i++) {
    var k = keyFn(arr[i]);
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(arr[i]);
  }
  return { groups: groups, order: order };
}
let activePolicySnapshot = null;
const reviewModalState = { mode: "create", reviewId: "", canEdit: true, editableUntil: null };
const dashboardQueryParams = new URLSearchParams(window.location.search || "");
const dashboardDeepLink = {
  tab: String(dashboardQueryParams.get("tab") || "").trim().toLowerCase(),
  section: String(dashboardQueryParams.get("section") || "").trim().toLowerCase(),
  panel: String(dashboardQueryParams.get("panel") || "").trim().toLowerCase(),
  sub: String(dashboardQueryParams.get("sub") || "").trim().toLowerCase(),
  requestId: String(dashboardQueryParams.get("requestId") || "").trim(),
  // O-142 (sir, 2026-09-16): every message letter carries "Read and reply on The Shared Table
  // Story", and that link has to land on the conversation itself. Never a dead end on a list.
  bookingId: String(dashboardQueryParams.get("bookingId") || "").trim()
};
// sir's split, elements 1+2 [2026-08-07]: "Guest Requests" (sir's name, round three — names the
// ASKER: Verification is a request the host sends, this queue is requests guests send) sits
// between My Listings and Bookings, so the row reads "what I offer → who's asking → who's booked".
const HOSTING_SECTION_KEYS = Object.freeze(["overview", "listings", "guest-requests", "bookings", "funding", "earnings-fees", "reviews", "verification", "analytics"]);
// Owner 2026-06-05: Tab 1 (My Experience Bookings) split into sub-tabs that mirror the
// hosting tab's section chrome, killing the doom-scroll. Upcoming is the default.
// sir's order 2026-08-18: "The tab name and sequence must be Upcoming Trips instead of new trips,
// followed by Private reuqests, Invitation and then last one as Past trips" + "Make it experiences
// instead of trips in the tab name" — so: Upcoming Experiences · Private Requests · Invitations ·
// Past Experiences, in that order.
const TRIPS_SUBTAB_KEYS = Object.freeze(["upcoming", "requests", "invitations", "past"]);
const TRIPS_SUBTAB_LABELS = Object.freeze({
  upcoming: "Upcoming Experiences",
  past: "Past Experiences",
  requests: "Private Requests",
  invitations: "Invitations"
});
const tripsDashboardState = {
  sub: "upcoming",
  counts: { requests: 0, invitations: 0 },
  pendingConnections: []
};
function resolveTripsSub(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return TRIPS_SUBTAB_KEYS.indexOf(s) >= 0 ? s : "upcoming";
}
const HOSTING_SECTION_LABELS = Object.freeze({
  overview: "Overview",
  listings: "My Listings",
  "guest-requests": "Guest Requests",
  bookings: "Bookings",
  funding: "Funding",
  "earnings-fees": "Earnings & Fees",
  reviews: "Reviews",
  verification: "Verification",
  analytics: "Analytics"
});
const hostDashboardState = {
  section: "overview",
  listings: { status: "idle", items: [], summary: null, warnings: [], message: "" },
  bookings: { status: "idle", rows: [], message: "" },
  privateRequests: { status: "idle", rows: [], message: "" },
  verification: { status: "idle", data: null, message: "" },
  reviews: { status: "idle", data: null, message: "" },
  earnings: { status: "idle", data: null, message: "" },
  feesCharges: { status: "idle", rows: [], message: "" },
  funding: { status: "idle", slots: [], message: "" },
  analytics: { status: "idle", data: null, message: "" }
};
const dashboardRequestState = {
  activeTab: resolveDashboardTab(dashboardDeepLink.tab),
  loadToken: 0
};

// ── WebSocket live updates for host dashboard ──
var _ws = null;
var _wsReconnectTimer = null;
var _wsReconnectAttempts = 0;

function connectHostWebSocket() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  var session = (window.tstsGetSession) ? window.tstsGetSession({ force: false }) : null;
  if (!session || !session.ok) return;
  var token = String((session.csrfToken) || "").trim();
  // Use access token from cookie, we pass CSRF as a hint, backend verifies JWT from cookie
  var base = String(window.API_BASE || "").replace(/^http/, "ws");
  if (!base) return;
  try { _ws = new WebSocket(base + "/ws?token=" + encodeURIComponent(token)); } catch (_) { return; }
  _ws.onopen = function() { _wsReconnectAttempts = 0; };
  _ws.onmessage = function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg && msg.event === "booking:confirmed" && msg.data) {
        var gn = String(msg.data.guestName || "A guest");
        var et = String(msg.data.experienceTitle || "your experience");
        if (window.tstsNotify) window.tstsNotify("New booking from " + gn + " for " + et, "success");
        if (dashboardRequestState.activeTab === "hosting") {
          hostDashboardState.bookings = { status: "idle", rows: [], message: "" };
          renderHostingDashboard();
        }
      }
    } catch (_) {}
  };
  _ws.onclose = function() {
    _ws = null;
    if (_wsReconnectAttempts < 5) {
      _wsReconnectAttempts++;
      clearTimeout(_wsReconnectTimer);
      _wsReconnectTimer = setTimeout(connectHostWebSocket, 3000 * _wsReconnectAttempts);
    }
  };
  _ws.onerror = function() {};
}

function disconnectHostWebSocket() {
  clearTimeout(_wsReconnectTimer);
  if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
}

window.addEventListener("beforeunload", disconnectHostWebSocket);

function nextDashboardLoadToken(tabKey) {
  dashboardRequestState.activeTab = (tabKey === "hosting") ? "hosting" : (tabKey === "wishlist") ? "wishlist" : "trips";
  dashboardRequestState.loadToken += 1;
  return dashboardRequestState.loadToken;
}

function isDashboardLoadActive(tabKey, loadToken) {
  const key = (tabKey === "hosting") ? "hosting" : "trips";
  return dashboardRequestState.activeTab === key && dashboardRequestState.loadToken === loadToken;
}

function unwrapApiPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

function extractApiError(payload, fallbackMessage) {
  const root = (payload && typeof payload === "object") ? payload : {};
  const unwrapped = unwrapApiPayload(root);
  const code = String(unwrapped.error || unwrapped.code || root.error || root.code || "").trim().toUpperCase();
  const message = String(unwrapped.message || root.message || fallbackMessage || "Request failed.").trim();
  return { code: code, message: message };
}

function mapGuestScopeError(payload, statusCode, fallbackMessage) {
  const err = extractApiError(payload, fallbackMessage || "Failed to load bookings.");
  if (err.code === "AUTH_REQUIRED" || statusCode === 401) {
    return "Your session has expired. Please log in again.";
  }
  return err.message || fallbackMessage || "Failed to load bookings.";
}

function mapHostScopeError(payload, statusCode, fallbackMessage) {
  const err = extractApiError(payload, fallbackMessage || "We couldn't load your hosting details just now.");
  if (err.code === "HOST_ROLE_REQUIRED") {
    // sir's locked role matrix: hosting is earned by publishing, never by an "onboarding" step.
    return "Publish your first experience and your hosting tools open up here.";
  }
  if (err.code === "AUTH_REQUIRED" || statusCode === 401) {
    // The same sentence the guest side says a few lines above — one voice for one situation.
    return "Your session has expired. Please log in again.";
  }
  if (statusCode === 403) {
    return err.message || "This part of hosting isn't available on your account.";
  }
  return err.message || fallbackMessage || "We couldn't load your hosting details just now.";
}

function mapStripeConnectStartError(payload, statusCode) {
  const err = extractApiError(payload, "We couldn't start your Stripe payout setup just now. Please try again.");
  if (err.code === "AUTH_REQUIRED" || statusCode === 401) {
    return "Your session has expired. Please log in again.";
  }
  if (err.code === "HOST_ROLE_REQUIRED") {
    return "Publish your first experience and your payout setup opens up here.";
  }
  if (err.code === "STRIPE_CONNECT_NOT_CONFIGURED") {
    return "Stripe payouts aren't switched on for the site yet. Please contact support and we'll get it sorted.";
  }
  return err.message || "We couldn't start your Stripe payout setup just now. Please try again.";
}

// ROLE-MATRIX: Host UI is always visible for every logged-in user.
// Any authenticated user can access host surfaces. Non-hosts see empty state.
function userHasHostAccess(user) {
  // Any authenticated user object = host access granted (per role matrix §21.5)
  return !!(user && typeof user === "object" && (user._id || user.id || user.email));
}

async function getSessionSnapshot() {
  if (!window.tstsGetSession) return { ok: false, reason: "AUTH_REQUIRED" };
  try {
    const sess = await window.tstsGetSession({ force: true });
    if (!sess || !sess.ok || !sess.user) return { ok: false, reason: "AUTH_REQUIRED" };
    if (sess.status && sess.status !== 200) return { ok: false, reason: "SESSION_UNAVAILABLE" };
    try { window.__tstsMeId = String(sess.user._id || sess.user.id || ""); } catch (_mid) { void _mid; }
    return { ok: true, session: sess };
  } catch (_) {
    return { ok: false, reason: "SESSION_UNAVAILABLE" };
  }
}

function resolveDashboardTab(rawTab) {
  const tab = String(rawTab || "").trim().toLowerCase();
  if (tab === "hosting") return "hosting";
  if (tab === "wishlist") return "wishlist";
  if (tab === "experiences" || tab === "trips" || tab === "") return "trips";
  return "trips";
}

function resolveHostingSection(rawSection, panelHint) {
  const section = String(rawSection || "").trim().toLowerCase();
  if (HOSTING_SECTION_KEYS.includes(section)) return section;
  // Backward-compat mapping for old section names — request-flavored links now land on the
  // Guest Requests tab (sir's split, element 3: one destination for the object everywhere).
  if (section === "private-requests") return "guest-requests";
  if (section === "requests") return "guest-requests";
  if (section === "verification-payout") return "verification";
  if (section === "earnings-payouts") return "earnings-fees";
  if (section === "fees-charges") return "earnings-fees";
  const panel = String(panelHint || "").trim().toLowerCase();
  if (panel === "private-request-actions") return "guest-requests";
  return "overview";
}

function canonicalTabParam(internalTab) {
  // Owner 2026-06-05: was hosting→hosting, EVERYTHING ELSE→experiences — which silently
  // rewrote the URL to ?tab=experiences whenever the Wishlist tab activated, so a
  // ?tab=wishlist deep-link never stuck (and a refresh dropped back to bookings). The
  // reader resolveDashboardTab already handles "wishlist"; make the writer match it.
  if (internalTab === "hosting") return "hosting";
  if (internalTab === "wishlist") return "wishlist";
  return "experiences";
}

function syncDashboardTabQuery(internalTab, hostingSection) {
  try {
    const url = new URL(window.location.href);
    const prevPath = url.pathname + (url.search || "") + (url.hash || "");
    const nextTab = canonicalTabParam(internalTab);
    url.searchParams.set("tab", nextTab);
    if (internalTab === "hosting") {
      url.searchParams.set("section", resolveHostingSection(hostingSection, dashboardDeepLink.panel));
      url.searchParams.delete("sub");
    } else if (internalTab === "trips") {
      url.searchParams.set("sub", resolveTripsSub(tripsDashboardState.sub));
      url.searchParams.delete("section");
    } else {
      url.searchParams.delete("section");
      url.searchParams.delete("sub");
    }
    const query = url.searchParams.toString();
    const nextPath = url.pathname + (query ? ("?" + query) : "") + (url.hash || "");
    if (nextPath === prevPath) return;
    window.history.replaceState({}, "", nextPath);
  } catch (_) {}
}

function redirectToLogin() {
  const returnTo = encodeURIComponent(location.pathname + location.search);
  location.href = "login.html?returnTo=" + returnTo;
}

async function requireAuthOrRedirect() {
  const snapshot = await getSessionSnapshot();
  if (snapshot.ok) return true;
  if (snapshot.reason === "AUTH_REQUIRED") {
    redirectToLogin();
    return false;
  }
  try {
    window.tstsNotify("Unable to verify your session. Please refresh and try again.", "error");
  } catch (_) {}
  return false;
}

function setLoading() {
  if (!contentEl) return;
  contentEl.textContent = "";
  var spinnerWrap = window.tstsEl("div", { className: "text-center py-12" }, [
    window.tstsEl("i", { className: "fas fa-spinner fa-spin text-3xl text-gray-300" })
  ]);
  contentEl.appendChild(spinnerWrap);
}

function setError(msg) {
  if (!contentEl) return;
  const El = window.tstsEl;
  contentEl.textContent = "";
  contentEl.appendChild(El("p", { className: "text-red-500 text-center", textContent: msg || "We couldn't load this section. Please refresh the page." }));
}

function safeStr(x) {
  return (typeof x === "string") ? x : (x == null ? "" : String(x));
}

function safeDate(d) {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

// The platform is not AUD-only — it supports ten currencies and every booking carries its own — so
// the symbol may not be assumed when Intl is unavailable. Mirrors the map in host.js; an unmapped
// code falls back to a "CODE " prefix, which is unambiguous rather than a misleading "$".
// Declared BEFORE the formatter that reads it: a `const` declared after would sit in the temporal
// dead zone and throw a ReferenceError instead of falling back.
const __CCY_SYMBOL = {
  aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
  eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF "
};

// Owner 2026-06-05: currency-aware money formatter. WAS `"$" + toFixed(2)` — it emitted a
// literal "$" and ignored currency, so AUD rendered "$500.00" (not the site's "A$500") and a
// non-AUD booking would show the wrong symbol. Mirrors experience.js tstsFormatPriceSymbol
// (Intl currency symbol, 0 dp on whole amounts). `currency` defaults to AUD — the platform's
// default currency — when a caller has no per-row currency in scope.
// GAP 31 (sir's order O-128, 2026-09-15): an amount that cannot be worked out reads as a word a
// person understands. It used to render a bare em dash, which is a mark and not a sentence, and
// which sir's standing order keeps off every surface a person reads. It reaches the screen through
// the host's Booking Details rows and the guest's money rows, so it is the platform speaking.
function toMoney(raw, currency) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Not available";
  const code = String(currency || "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: (n % 1 === 0 ? 0 : 2),
      maximumFractionDigits: (n % 1 === 0 ? 0 : 2),
      currencyDisplay: "symbol"
    }).format(n);
  } catch (_fmtErr) {
    void _fmtErr;
    const sym = __CCY_SYMBOL[code.toLowerCase()] || (code + " ");
    return sym + (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 0 : 2);
  }
}

// Minor units → major units. Dividing by a fixed 100 is only right for a two-decimal currency:
// a ¥2,800 booking came out as ¥28.00. The backend was fixed for this and the frontend was left
// behind, so the same booking could read one figure in an email and another on the screen.
// Mirrors CURRENCY_DECIMALS in the backend's pricing.js, which is the source of truth for scale —
// a hand-written "jpy ? 0 : 2" silently mis-scales the moment a second zero-decimal currency exists.
const __CCY_DECIMALS = { aud: 2, nzd: 2, usd: 2, gbp: 2, eur: 2, cad: 2, inr: 2, jpy: 0, chf: 2, sgd: 2 };
function __currencyDecimals(currency) {
  const c = String(currency || "aud").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(__CCY_DECIMALS, c) ? __CCY_DECIMALS[c] : 2;
}

// GAP 31 (sir's order O-128, 2026-09-15): same repair as toMoney above, and the same reason.
function centsToMoney(cents, currency) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "Not available";
  return toMoney(n / Math.pow(10, __currencyDecimals(currency)), currency);
}

function percentLikeToPct(raw, fallbackPct) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallbackPct;
  if (n >= 0 && n <= 1) return n * 100;
  return n;
}

function clampPct(raw, maxPct) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxPct, n));
}

// BUG-076: type-to-confirm gates are intentionally CASE-SENSITIVE (GitHub /
// Stripe / Linear / Vercel) — the friction of typing the uppercase token IS
// the security signal. Single source of truth for the defence-in-depth pair
// (input-listener + click-handler); byte-identical to the inline
// `String(x||"").trim() === "DELETE"` checks (no case folding).
function isDeleteConfirmInputValid(value) {
  return String(value || "").trim() === "DELETE";
}

function normalizeState(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "none";
  return s;
}

function stateLabel(raw) {
  const s = normalizeState(raw);
  if (s === "none") return "None";
  // Owner 2026-06-05 (C3, sir "Title Case everywhere"): pills were ALL-CAPS ("CONFIRMED");
  // now capitalize-first-letter ("Confirmed", "Cancelled", "Cancelled by host") to match the
  // private-request pills + the locked success/experience pages. Was: .toUpperCase().
  return s.replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
}

function bookingPolicyVersion(booking) {
  return (
    safeStr(booking && booking.policyVersion) ||
    safeStr(booking && booking.policySnapshot && booking.policySnapshot.version) ||
    safeStr(booking && booking.refundDecision && booking.refundDecision.policyVersionUsed) ||
    safeStr(activePolicySnapshot && activePolicySnapshot.version)
  );
}

function bookingPolicyEffectiveRaw(booking) {
  return (
    (booking && booking.policyEffectiveFrom) ||
    (booking && booking.policySnapshot && booking.policySnapshot.effectiveFrom) ||
    (activePolicySnapshot && activePolicySnapshot.effectiveFrom) ||
    ""
  );
}

function formatPolicyEffective(booking) {
  const raw = bookingPolicyEffectiveRaw(booking);
  if (!raw) return "";
  try {
    if (window.tstsFormatDateShort) return window.tstsFormatDateShort(raw);
  } catch (_) {}
  const dt = safeDate(raw);
  if (!dt) return "";
  try {
    return dt.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "Australia/Melbourne" });
  } catch (_) {
    return dt.toDateString();
  }
}

function bookingVisibilityState(booking) {
  const direct = normalizeState(booking && (booking.visibilityState || booking.visibility));
  if (direct === "public") return "public";
  if (direct === "connections" || direct === "friends" || direct === "connections_only") return "connections";
  if (direct === "private") return "private";
  return (booking && booking.visibilityToFriends === true) ? "connections" : "private";
}

function bookingVisibilityLabel(visibilityState) {
  const s = normalizeState(visibilityState);
  if (s === "public") return "Public";
  if (s === "connections") return "Connections";
  return "Private";
}

function bookingVisibilityChipClass(visibilityState) {
  const s = normalizeState(visibilityState);
  if (s === "public") return "bg-blue-100 text-blue-700";
  if (s === "connections") return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-700";
}

function resolveBookingStartAt(booking) {
  const b = booking || {};
  const direct = safeDate(b.startAt || b.experienceStartAt || b.experienceDateTime);
  if (direct) return direct;

  const dateOnlyRaw = b.bookingDate || b.experienceDate || b.date;
  const dateOnly = safeDate(dateOnlyRaw);
  if (!dateOnly) return null;

  const slot = safeStr(b.timeSlot || b.startTime || (Array.isArray(b.timeSlots) ? b.timeSlots[0] : ""));
  const part = slot.split("-")[0] || "";
  const m = part.match(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/);
  if (!m) return dateOnly;
  const merged = new Date(dateOnly);
  merged.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return merged;
}

function resolveRefundBaseCents(booking) {
  const b = booking || {};
  const candidates = [
    // `bookingValueCents` FIRST: it is the field the server actually refunds on, and its absence
    // from this list is what let the browser show a base the server would not have used.
    b.bookingValueCents,
    b.paidAmountCents,
    b.amountCents,
    b.pricingSnapshot && b.pricingSnapshot.totalCents,
    b.feeBreakdown && b.feeBreakdown.totalCents,
    b.pricing && b.pricing.totalCents
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 0;
}

function pickUserCancelTier(rules, hoursBeforeStart) {
  const rows = Array.isArray(rules && rules.userCancelTiers) ? rules.userCancelTiers : [];
  if (!(Number.isFinite(hoursBeforeStart))) return null;
  // sir 2026-08-13: an experience that has already started is not "no band" — it is the LAST band.
  // Negative hours matched NOTHING here (even the hoursBeforeStartMin: 0 tier was skipped), the caller
  // then fell back to rules.guestMaxRefundPercent — the platform MAXIMUM — so a guest cancelling AFTER
  // the sitting was quoted 95% while a guest cancelling an hour BEFORE it correctly got the 0% band.
  // The later you were, the more you were promised. You cannot be fewer than zero hours before
  // something that has already begun, so the lookup floors at zero and lands on that same last band.
  const hrs = Math.max(0, hoursBeforeStart);
  let chosen = null;
  for (const row of rows) {
    const min = Number(row && row.hoursBeforeStartMin);
    if (!Number.isFinite(min)) continue;
    if (hrs < min) continue;
    if (!chosen || min > Number(chosen.hoursBeforeStartMin || 0)) chosen = row;
  }
  return chosen;
}

function buildCancelPreview(booking) {
  const b = booking || {};
  const status = normalizeState(b.status);
  const blockedStates = new Set(["cancelled", "cancelled_by_host", "completed", "refunded", "expired"]);
  const canCancel = !blockedStates.has(status);

  const paymentStatus = normalizeState(b.paymentStatus);
  const baseCents = (paymentStatus === "paid") ? resolveRefundBaseCents(b) : 0;
  const policy = (b.policySnapshot && typeof b.policySnapshot === "object") ? b.policySnapshot : activePolicySnapshot;
  const rules = (policy && policy.rules && typeof policy.rules === "object") ? policy.rules : null;

  let refundPct = 0;
  let refundCents = 0;
  let note = "";
  let state = "not_computed";
  // Owner 2026-06-06: plain-English reason for the refund amount (replaces policy-version cruft).
  let basis = "";
  // sir 2026-08-13: this used to answer "right before the experience" for hrs <= 0, and the caller
  // then appended " before the experience." again — so a guest cancelling after a finished sitting
  // read "You're cancelling right before the experience before the experience." The past case now
  // has its own sentence at the call site and never comes through here.
  function __whenBeforeText(hrs) {
    if (!Number.isFinite(hrs)) return "";
    if (hrs >= 48) return "about " + Math.round(hrs / 24) + " days";
    if (hrs >= 1) return "about " + Math.round(hrs) + " hours";
    return "less than an hour";
  }

  if (!canCancel) {
    note = "This booking has already finished or been cancelled, so there is nothing left to cancel.";
    state = status;
    basis = "This booking can no longer be cancelled.";
  } else if (baseCents <= 0) {
    state = "no_paid_amount";
    note = "Nothing has been charged for this booking, so there is nothing to refund.";
    basis = "Nothing has been charged for this booking yet, so there is nothing to refund.";
  } else if (!rules) {
    const existingAmount = Number(b && b.refundDecision && b.refundDecision.amountCents);
    if (Number.isFinite(existingAmount) && existingAmount >= 0) {
      basis = "Based on the refund already calculated for this booking.";
      refundCents = Math.floor(existingAmount);
      // BUG-072 (2026-05-15): clamp ceiling raised 95 → 100 (math max for percent).
      // The 95 was a literal UI under-estimate that masked the server's actual
      // configured cap, so guests in the free-cancel window saw "95% refund" while
      // the server actually refunded 100%. Use 100 as the math ceiling; the server's
      // configured policy (userCancelRefundCapPercent / absoluteMaxGuestRefundPercent)
      // already caps below 100 if the platform wants to.
      refundPct = clampPct(percentLikeToPct((b && b.refundDecision && b.refundDecision.percent), 0), 100);
      state = normalizeState((b && b.refundDecision && b.refundDecision.status) || "from_existing_decision");
      note = "This is the refund already worked out for this booking.";
    } else {
      state = "manual";
      note = "We will confirm the exact refund the moment you cancel.";
      basis = "The exact refund is finalised by the server when you cancel.";
    }
  } else {
    const configuredCap = percentLikeToPct(
      (rules.userCancelRefundCapPercent != null) ? rules.userCancelRefundCapPercent : rules.absoluteMaxGuestRefundPercent,
      95
    );
    // BUG-072 (2026-05-15): clamp ceiling raised 95 → 100. The configured admin policy
    // is the source of truth for the cap; clamping THAT at 95 in the UI was wrong.
    const capPct = clampPct(Math.round(configuredCap), 100);

    const startAt = resolveBookingStartAt(b);
    const hoursBeforeStart = startAt ? ((startAt.getTime() - Date.now()) / (60 * 60 * 1000)) : null;
    const tier = pickUserCancelTier(rules, hoursBeforeStart);
    let tierPct = percentLikeToPct(
      (tier && tier.refundPercent != null) ? tier.refundPercent : rules.guestMaxRefundPercent,
      0
    );

    const freeCancelHours = Math.max(0, Math.floor(Number(rules.guestFreeCancelHours) || 0));
    let inFreeWindow = false;
    if (Number.isFinite(hoursBeforeStart) && freeCancelHours > 0 && hoursBeforeStart >= freeCancelHours) {
      tierPct = Math.max(tierPct, 100);
      inFreeWindow = true;
    }

    // BUG-072 (2026-05-15): ceiling 95 → 100. Free-cancel window forces tierPct=100;
    // the prior `, 95)` ceiling re-clamped it to 95, so UI under-reported by 5%
    // while the server refunded the full 100%. Math.min(capPct, tierPct) already
    // honors the admin-configured cap, so 100 is the right math ceiling here.
    refundPct = clampPct(Math.min(capPct, tierPct), 100);
    refundCents = Math.max(0, Math.round(baseCents * (refundPct / 100)));
    state = "estimated";
    note = "This is an estimate. Your final refund is confirmed the moment you cancel.";
    const whenText = __whenBeforeText(hoursBeforeStart);
    // sir 2026-08-13: an experience that has already begun gets its own sentence. It is not
    // "before" anything, so it must never be described that way.
    const hasStarted = Number.isFinite(hoursBeforeStart) && hoursBeforeStart <= 0;
    if (hasStarted) {
      basis = (refundPct > 0)
        ? "This experience has already started. Under the cancellation schedule, cancelling now refunds " + refundPct + "% of what you paid."
        : "This experience has already started, and the cancellation schedule refunds nothing once an experience has begun.";
    } else if (inFreeWindow) {
      basis = "You're cancelling " + whenText + " before the experience, which is inside the free-cancellation window, so you're refunded in full.";
    } else {
      basis = "You're cancelling " + whenText + " before the experience. Under the cancellation schedule, that band refunds " + refundPct + "% of what you paid.";
    }
  }

  const chargeCents = Math.max(0, baseCents - refundCents);

  return {
    canCancel,
    state: state,
    baseCents: baseCents,
    chargeCents: chargeCents,
    refundPct: refundPct,
    refundCents: refundCents,
    basis: basis,
    note: note || "Refund will be computed by server at cancellation time."
  };
}

function fmtTripDate(dt) {
  try {
    if (window.tstsFormatDateShort) return window.tstsFormatDateShort(dt);
  } catch (_) {}
  try {
    return dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Melbourne" });
  } catch (_) {
    return dt.toDateString();
  }
}

function isEmailLite(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function sanitizeExperienceTitle(raw) {
  const title = String(raw || "").trim();
  const debranded = title.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
  if (debranded) return debranded;
  if (title && !/^WORLDCLASS_STARTER_/i.test(title) && !/^starter[_\-\s]/i.test(title)) return title;
  return "Shared experience";
}

function countWords(v) {
  const s = String(v || "").trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function setComplaintStatus(msg, kind) {
  if (!complaintStatus) return;
  complaintStatus.textContent = String(msg || "");
  complaintStatus.classList.remove("text-gray-500", "text-red-600", "text-green-600");
  if (kind === "error") complaintStatus.classList.add("text-red-600");
  else if (kind === "success") complaintStatus.classList.add("text-green-600");
  else complaintStatus.classList.add("text-gray-500");
}

function toggleTab(which) {
  if (!tabTrips || !tabHost) return;
  var active = "border-tsts-clay text-tsts-clay whitespace-nowrap snap-start py-4 px-1 border-b-2 font-medium text-sm";
  var inactive = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap snap-start py-4 px-1 border-b-2 font-medium text-sm";

  tabTrips.className = (which === "trips") ? active : inactive;
  tabHost.className = (which === "hosting") ? active : inactive;
  if (tabWishlist) tabWishlist.className = (which === "wishlist") ? active : inactive;

  var loadToken = nextDashboardLoadToken(which);
  syncDashboardTabQuery(which, hostDashboardState.section);
  return loadToken;
}

/* ====================== GUEST TRIPS ====================== */

// ── Tab-1 sub-tabs (Owner 2026-06-05) ──────────────────────────────────────
// Tab 1 used to doom-scroll Invitations -> Private requests -> Bookings in one
// column. It now mirrors the hosting tab's section chrome with four sub-tabs:
// Upcoming Trips, Past Trips, Private Requests, Invitations.
// "Past" = the occurrence already happened OR the booking sits in a closed/terminal
// state; everything else is "Upcoming".
function __tripOccurrenceDate(b) {
  return String((b && (b.bookingDate || (b.occurrence && b.occurrence.date) || b.date)) || "");
}
function __isPastTrip(b) {
  var s = String((b && b.status) || "").toLowerCase();
  if (["cancelled", "canceled", "completed", "refunded", "payment_failed", "payment_expired", "expired", "no_show", "declined"].indexOf(s) >= 0) return true;
  var d = __tripOccurrenceDate(b);
  if (d) return d < __todayIsoLocal();
  return false;
}

// Owner 2026-06-07: Past Trips order — completed (and other non-cancelled) trips sort ABOVE
// cancelled/aborted ones. rank 0 = keep on top, rank 1 = sink to the bottom.
function __pastTripRank(b) {
  var s = String((b && b.status) || "").toLowerCase();
  if (["cancelled", "canceled", "cancelled_by_host", "declined", "refunded", "expired", "payment_failed", "payment_expired", "no_show"].indexOf(s) >= 0) return 1;
  return 0;
}

// Owner 2026-08-02 (sir, alignment order): the sub-tab pill strips scroll horizontally on narrow
// windows, but the cut edge gave NO cue that more tabs exist (Verification/Analytics silently
// unreachable-looking below ~920px). Edge fades appear only when there IS hidden content on that
// side and vanish at the scroll ends. Inline gradients — bg-gradient-* classes are purged.
function __wrapScrollableTabs(nav) {
  var El = window.tstsEl;
  var wrap = El("div", { className: "relative" });
  var fadeR = El("div", { className: "absolute inset-y-0 right-0 w-10 pointer-events-none hidden" });
  fadeR.style.background = "linear-gradient(to left, #ffffff 25%, rgba(255,255,255,0))";
  fadeR.style.borderRadius = "0 1rem 1rem 0";
  var fadeL = El("div", { className: "absolute inset-y-0 left-0 w-10 pointer-events-none hidden" });
  fadeL.style.background = "linear-gradient(to right, #ffffff 25%, rgba(255,255,255,0))";
  fadeL.style.borderRadius = "1rem 0 0 1rem";
  function updateFades() {
    var hiddenSpan = nav.scrollWidth - nav.clientWidth;
    if (hiddenSpan <= 1) { fadeR.classList.add("hidden"); fadeL.classList.add("hidden"); return; }
    fadeL.classList.toggle("hidden", nav.scrollLeft <= 1);
    fadeR.classList.toggle("hidden", nav.scrollLeft >= hiddenSpan - 1);
  }
  nav.addEventListener("scroll", updateFades, { passive: true });
  window.addEventListener("resize", updateFades, { passive: true });
  wrap.appendChild(nav);
  wrap.appendChild(fadeR);
  wrap.appendChild(fadeL);
  requestAnimationFrame(updateFades);
  return wrap;
}

function renderTripsSubTabs(activeSub, counts) {
  var El = window.tstsEl;
  var nav = El("nav", { className: "bg-white rounded-2xl border border-gray-100 p-2 shadow-sm overflow-x-auto" });
  var row = El("div", { className: "flex items-center gap-2 min-w-max" });
  TRIPS_SUBTAB_KEYS.forEach(function (key) {
    var isActive = key === activeSub;
    var n = (counts && counts[key]) ? counts[key] : 0;
    var label = TRIPS_SUBTAB_LABELS[key] + (n > 0 ? " (" + n + ")" : "");
    row.appendChild(El("button", {
      type: "button",
      className: (isActive
        ? "tsts-indicator-ink border-tsts-ink"
        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50") + " px-4 py-2 rounded-xl border text-sm font-bold transition",
      "data-action": "trips-switch-sub",
      "data-trips-sub": key,
      textContent: label
    }));
  });
  nav.appendChild(row);
  return __wrapScrollableTabs(nav);
}

function __tripsEmptyState(title, body, cta) {
  var El = window.tstsEl;
  var kids = [
    El("div", { className: "text-5xl mb-4", textContent: "🌏" }),
    El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: title }),
    El("p", { className: "text-gray-500 mb-6", textContent: body })
  ];
  if (cta) kids.push(El("a", { href: cta.href, className: "inline-block tsts-btn-primary px-8 py-3 rounded-full font-bold shadow transition", textContent: cta.label }));
  return El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, kids);
}

function renderTripList(container, list, kind) {
  if (!Array.isArray(list) || list.length === 0) {
    container.appendChild(__tripsEmptyState(
      kind === "past" ? "No past trips" : "No new trips",
      kind === "past"
        ? "Experiences you've completed or cancelled will show up here."
        : "Experiences you book will show up here, ready for the day.",
      kind === "past" ? null : { href: "explore.html", label: "Find an Adventure" }
    ));
    return;
  }
  // Owner 2026-06-06: NO grouped card. Every booking is its own card — each has its own
  // reference ID, entry code, and cancellation, so they are never merged.
  list.forEach(function (b) {
    container.appendChild(renderTripCard(b));
  });
}

async function __countInvites() {
  try {
    var sRes = await window.authFetch("/api/invites/my-sent?limit=50", { method: "GET" });
    var sJson = await sRes.json().catch(function () { return null; });
    var rRes = await window.authFetch("/api/invites/my-received?limit=50", { method: "GET" });
    var rJson = await rRes.json().catch(function () { return null; });
    var sn = (sJson && sJson.data && Array.isArray(sJson.data.invites)) ? sJson.data.invites.length : 0;
    // sir's walk 2026-08-18 (F19): the badge counted RAW received rows while the board (by sir's
    // approved 2026-06-12 design) drops invites you've already booked — the pill said 12 over 9
    // cards. Count exactly what the board renders: every sent row + received rows not yet booked.
    var rList = (rJson && rJson.data && Array.isArray(rJson.data.invites)) ? rJson.data.invites : [];
    var rn = rList.filter(function (inv) { return !(inv && inv.bookedByMe); }).length;
    return sn + rn;
  } catch (_) { return 0; }
}

// Paint the sub-tab nav + the active sub-panel. Re-entrant: loadTrips calls it
// once data is loaded; setTripsSub calls it on every sub switch (no re-fetch of
// bookings — the cache + counts are reused; requests/invitations panels render lazily).
async function renderTripsView() {
  if (!contentEl) return;
  if (dashboardRequestState.activeTab !== "trips") return;
  // Owner 2026-06-12 (sir): the guest "Booking FAQs" block belongs on the bookings tabs, not the host tab —
  // re-show it here (only if faq-init actually mounted content into it).
  try { var __gf = document.getElementById("faq-context-dashboard-guest"); if (__gf && (__gf.textContent || "").trim()) __gf.classList.remove("hidden"); } catch (_ge) { void _ge; }
  var El = window.tstsEl;
  // Owner 2026-06-09: private-request HOLD bookings are NOT standalone trips. An AUTHORIZED hold is a
  // pending request (it lives on the Requests tab); a CANCELLED hold is a terminal request (it renders
  // as a rich card in Past, below). Only CONFIRMED / COMPLETED private bookings are real trips. Excluding
  // the holds removes the double-listing (request on the Requests tab AND as a trip card).
  var bookings = (Array.isArray(guestBookingsCache) ? guestBookingsCache : []).filter(function (b) {
    // Owner 2026-06-09: EVERY private-request booking lives on the Requests tab (active + confirmed,
    // with the message thread) or Past Trips (terminal, as outcome rich cards) — never as a New/Past
    // trip card. So exclude all isPrivate bookings from the trip lists (no double-listing).
    return !(b && b.isPrivate);
  });
  var upcoming = bookings.filter(function (b) { return !__isPastTrip(b); });
  var past = bookings.filter(__isPastTrip);
  // Owner 2026-06-06: soonest upcoming experience at the TOP.
  upcoming.sort(function (a, b) { return String(__tripOccurrenceDate(a)).localeCompare(String(__tripOccurrenceDate(b))); });
  // Owner 2026-06-07: Past order — completed (and other non-cancelled) trips first, cancelled
  // trips last; most-recent first within each group.
  past.sort(function (a, b) {
    var ra = __pastTripRank(a), rb = __pastTripRank(b);
    if (ra !== rb) return ra - rb;
    return String(__tripOccurrenceDate(b)).localeCompare(String(__tripOccurrenceDate(a)));
  });
  // Owner 2026-06-09: terminal private requests (declined / expired / invalidated) live in Past Trips.
  // sir 2026-09-13: an invalidated one whose 48h counter window is still running is NOT terminal — its
  // hold is still held, so it stays under Requests and only lands here once the window passes.
  var terminalPRs = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).filter(__isTerminalPrivateRequest);
  var counts = {
    upcoming: upcoming.length,
    past: past.length + terminalPRs.length,
    requests: tripsDashboardState.counts.requests,
    invitations: tripsDashboardState.counts.invitations
  };
  var sub = resolveTripsSub(tripsDashboardState.sub);

  contentEl.textContent = "";
  var conn = renderConnectionActionPanel(tripsDashboardState.pendingConnections);
  if (conn) contentEl.appendChild(conn);
  contentEl.appendChild(renderTripsSubTabs(sub, counts));

  var panel = El("div", { className: "mt-4 space-y-4" });
  contentEl.appendChild(panel);

  if (sub === "upcoming") {
    renderTripList(panel, upcoming, "upcoming");
  } else if (sub === "past") {
    // Owner 2026-06-09: past = past bookings (trip cards) + terminal private requests (rich cards
    // with the outcome). Empty state only when BOTH are empty.
    if ((!past || past.length === 0) && terminalPRs.length === 0) {
      renderTripList(panel, past, "past");
    } else {
      // Owner 2026-06-12 (sir: "separate section for cancelled in past trips"): completed/active past
      // trips first, then cancelled/aborted ones (+ terminal private requests) under a "Cancelled" header.
      var __pastDone = past.filter(function (b) { return __pastTripRank(b) === 0; });
      var __pastCancelled = past.filter(function (b) { return __pastTripRank(b) === 1; });
      __pastDone.forEach(function (b) { panel.appendChild(renderTripCard(b)); });
      if (__pastCancelled.length || terminalPRs.length) {
        panel.appendChild(El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink mt-8 mb-1", textContent: "Cancelled" }));
        panel.appendChild(El("p", { className: "text-sm text-gray-500 mt-0.5 mb-3", textContent: "Trips that were cancelled or didn't go ahead." }));
        __pastCancelled.forEach(function (b) { panel.appendChild(renderTripCard(b)); });
        terminalPRs.forEach(function (row) { panel.appendChild(__renderPrivateRequestCard(row)); });
      }
    }
  } else if (sub === "requests") {
    var pr = await renderPrivateRequestsPanel();
    panel.appendChild(pr || __tripsEmptyState("No private requests", "When you request a whole experience privately, it'll appear here.", null));
  } else if (sub === "invitations") {
    var __invLoadingRow = renderHostSourceLoading("Loading your invitations…");
    panel.appendChild(__invLoadingRow);
    var iv = await renderInvitationsPanel();
    if (__invLoadingRow.parentNode) __invLoadingRow.parentNode.removeChild(__invLoadingRow);
    panel.appendChild(iv || __tripsEmptyState("No invitations yet", "Seat invites you share, and invites others send you, appear here.", null));
  }
  focusDashboardDeepLinkPanel();
}

function setTripsSub(nextSub) {
  tripsDashboardState.sub = resolveTripsSub(nextSub);
  syncDashboardTabQuery("trips", null);
  renderTripsView();
}

// Owner 2026-06-07: experience IDs the user has liked/wishlisted — populated in loadTrips so
// each trip card's "Like" heart shows the correct initial state (site-wide bookmark heart).
var guestBookmarkedExpIds = new Set();

// Owner 2026-06-09: every private request the guest has (all statuses), fetched ONCE in loadTrips.
// The Requests tab renders the ACTIVE ones; Past Trips renders the TERMINAL ones; the sub-tab count
// uses the active count. Shared cache = one fetch, three consumers.
var privateRequestsCache = [];

async function loadTrips(loadToken) {
  const token = Number.isFinite(Number(loadToken)) ? Number(loadToken) : nextDashboardLoadToken("trips");
  if (!isDashboardLoadActive("trips", token)) return;
  if (!(await requireAuthOrRedirect())) return;
  if (!isDashboardLoadActive("trips", token)) return;
  tripsDashboardState.sub = resolveTripsSub(tripsDashboardState.sub);
  setLoading();

  try {
    const res = await window.authFetch("/api/bookings/my-bookings");
    const data = await res.json().catch(() => null);
    if (!isDashboardLoadActive("trips", token)) return;

    if (!res.ok) {
      setError(mapGuestScopeError(data, res.status, "Failed to load bookings."));
      return;
    }

    // Tolerant unwrap: accept raw array OR { ok, data: { bookings: [...] } }
    var bookings = Array.isArray(data) ? data
      : (data && data.data && Array.isArray(data.data.bookings)) ? data.data.bookings
      : (data && data.data && Array.isArray(data.data.items)) ? data.data.items
      : (data && Array.isArray(data.bookings)) ? data.bookings
      : (data && Array.isArray(data.items)) ? data.items
      : [];

    guestBookingsCache = bookings;
    // Owner 2026-06-06: no count on the top tab — it read "8" (trips only) next to the
    // sub-tab counts (4 upcoming + 4 past + 5 requests + 6 invitations), which didn't
    // reconcile. The sub-tabs now carry the authoritative per-section counts.
    __updateTabBadge(tabTrips, "My Experience Bookings", 0);

    tripsDashboardState.pendingConnections = await loadPendingConnectionRequests().catch(function () { return []; });
    if (!isDashboardLoadActive("trips", token)) return;

    // Owner 2026-06-09: fetch all private requests ONCE into the shared cache (Requests tab,
    // Past-Trips terminal cards, and the sub-tab count all read it). Non-fatal if it fails.
    try {
      var prRes = await window.authFetch("/api/my/private-requests?status=all", { method: "GET" });
      var prJson = await prRes.json().catch(function () { return null; });
      privateRequestsCache = (prJson && prJson.data && Array.isArray(prJson.data.requests)) ? prJson.data.requests : [];
    } catch (_prErr) { privateRequestsCache = []; }
    if (!isDashboardLoadActive("trips", token)) return;

    // Counts for the sub-tab labels (fetched once per load; sub switches reuse them). The Requests
    // tab count is ACTIVE-only (terminal requests are counted under Past Trips instead).
    tripsDashboardState.counts = {
      requests: privateRequestsCache.filter(__isActivePrivateRequest).length,
      invitations: await __countInvites()
    };
    if (!isDashboardLoadActive("trips", token)) return;

    // Owner 2026-06-07: load liked experiences so each trip card's heart starts in the right
    // state (same bookmark source as the Wishlist tab). Non-fatal if it fails.
    try {
      var bmRes = await window.authFetch("/api/my/bookmarks/details", { method: "GET" });
      var bmData = await bmRes.json().catch(function () { return null; });
      var bmList = (bmRes && bmRes.ok && window.unwrapApiList) ? window.unwrapApiList(bmData, "experiences") : [];
      guestBookmarkedExpIds = new Set((bmList || []).map(function (e) { return String((e && (e._id || e.id)) || ""); }).filter(Boolean));
    } catch (_bmErr) { void _bmErr; }
    if (!isDashboardLoadActive("trips", token)) return;

    await renderTripsView();
  } catch (_tripErr) {
    if (!isDashboardLoadActive("trips", token)) return;
    // Surface the real error to the console — a render-time throw (e.g. a bad field
    // reference) was previously swallowed silently behind the generic message, which
    // made the "Failed to load bookings" regression hard to diagnose.
    try { console.error("loadTrips failed:", _tripErr); } catch (eLog) { void eLog; }
    setError("Failed to load bookings.");
  }
}

// --- My Invitations Panel ---
// Owner 2026-06-05 (P6 ↔ locked-pages consistency): friendly "7 August 2026 · 5:00 PM – 8:00 PM"
// for invitation cards (was raw ISO "2026-08-07 · 17:00-20:00"), matching the success page +
// private-request panels. Reuses the same two helpers used everywhere else on this page.
function __friendlyDateTime(dateStr, timeSlot) {
  var d = dateStr ? (window.tstsFormatDateShort ? String(window.tstsFormatDateShort(dateStr) || dateStr) : String(dateStr)) : "";
  var t = timeSlot ? __formatPrivateRequestTimeRange12h(String(timeSlot)) : "";
  return d + (t ? " · " + t : "");
}

// Owner 2026-06-11 (sir invite-flow rebuild): confirm a GIFTED seat (no payment — friend pre-paid)
// → real confirmed booking, then refresh.
async function handleInviteConfirmGift(token, btn) {
  var t = String(token || "").trim(); if (!t) return;
  var ok = window.tstsConfirm ? await window.tstsConfirm("Confirm your gifted seat? Your friend already paid, so there's no charge. You'll get a confirmed booking in Upcoming Experiences.") : true;
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Confirming…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t) + "/claim-gift", { method: "POST" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) || "Couldn't confirm the seat.", "error"); if (btn) { btn.disabled = false; btn.textContent = "Confirm your gifted seat"; } return; }
    window.tstsNotify("Seat confirmed. Find it in Upcoming Experiences!", "success");
    await loadTrips();
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Confirm your gifted seat"; } }
}
// GIFT SEAT S10 (sir's 100% gift-workflow order, 2026-08-19, spec §8.1): the receiver hands a
// claimed gift back. The seat returns to the payer, stays paid; they're notified. No money moves.
async function handleRenounceGift(bookingId, gifterName, btn) {
  var id = String(bookingId || "").trim(); if (!id) return;
  var who = String(gifterName || "").trim() || "The person who gifted it";
  var ok = window.tstsConfirm ? await window.tstsConfirm("Hand back this gifted seat? " + who + " keeps the booking and what they paid; the seat returns to them to use or gift again. They'll be told.") : true;
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Handing back…"; }
  try {
    var res = await window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/renounce-gift", { method: "POST" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) || "Couldn't hand the seat back.", "error"); if (btn) { btn.disabled = false; btn.textContent = "Hand back this seat"; } return; }
    window.tstsNotify("Seat handed back. " + who + " has been told.", "success");
    await loadTrips();
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Hand back this seat"; } }
}
// GIFT SEAT S4 (sir's 100% gift-workflow order, 2026-08-19): reopen the checkout for an unpaid gift.
async function handleInviteGiftResumePayment(token, btn) {
  var t = String(token || "").trim(); if (!t) return;
  if (btn) { btn.disabled = true; btn.textContent = "Opening payment…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t) + "/resume-payment", { method: "POST" });
    var raw = await res.json().catch(function () { return null; });
    var url = (raw && raw.data && raw.data.url) ? String(raw.data.url) : "";
    if (!res.ok || !url) {
      window.tstsNotify((raw && raw.message) || "Couldn't reopen the payment. Please try again.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "Complete payment"; }
      return;
    }
    window.location.href = url;
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Complete payment"; } }
}
// GIFT SEAT S4: discard an unpaid gift — no charge ever existed, the receiver never heard a thing.
async function handleInviteGiftDiscard(token, btn) {
  var t = String(token || "").trim(); if (!t) return;
  var ok = window.tstsConfirm ? await window.tstsConfirm("Discard this gift? Nothing has been charged, and your friend was never told. The held seat goes back to the table.") : true;
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Discarding…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t), { method: "DELETE" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) || "Couldn't discard the gift.", "error"); if (btn) { btn.disabled = false; btn.textContent = "Discard"; } return; }
    window.tstsNotify("Gift discarded. Nothing was charged.", "success");
    await loadTrips();
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Discard"; } }
}
// GIFT SEAT spec S7 (sir, 2026-08-19): decline a gifted seat you received. Money never moves —
// the seat stays with the person who paid it, free to re-gift or cancel; they are notified.
async function handleInviteDeclineGift(token, inviterName, btn) {
  var t = String(token || "").trim(); if (!t) return;
  var who = String(inviterName || "").trim() || "Your friend";
  var ok = window.tstsConfirm ? await window.tstsConfirm("Decline this gifted seat? " + who + " paid for it, so the seat stays with them to gift again or cancel. They'll be told you declined.") : true;
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Declining…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t) + "/decline", { method: "POST" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) || "Couldn't decline the seat.", "error"); if (btn) { btn.disabled = false; btn.textContent = "Decline"; } return; }
    window.tstsNotify("Seat declined. " + who + " has been told.", "success");
    await loadTrips();
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Decline"; } }
}
// Stop sharing (revoke) an invite link you sent.
async function handleInviteRevoke(token, btn) {
  var t = String(token || "").trim(); if (!t) return;
  // sir 2026-08-18: a gift take-back tells the gifter the money truth; a plain share talks links.
  var __isGift = !!(btn && btn.getAttribute && btn.getAttribute("data-invite-gift"));
  var __msg = __isGift
    ? "Take back this gifted seat? No one has claimed it. The seat stays yours and stays paid: gift it to someone else, or cancel it from your bookings under the standard cancellation policy."
    : "Stop sharing this seat? The link stops working, and anyone who hasn't claimed yet can no longer take a seat.";
  var ok = window.tstsConfirm ? await window.tstsConfirm(__msg) : true;
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Stopping…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t), { method: "DELETE" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) || "Couldn't stop sharing.", "error"); if (btn) { btn.disabled = false; btn.textContent = "Stop sharing"; } return; }
    window.tstsNotify("Stopped sharing this seat.", "success");
    await loadTrips();
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = "Stop sharing"; } }
}

// Owner 2026-06-11 (sir: "option to nudge a person if the seat is shared but not accepted"): re-ping
// the pending recipient. Backend rate-limits to once per 6h (NUDGE_TOO_SOON → friendly message).
async function handleInviteNudge(token, name, btn) {
  var t = String(token || "").trim(); if (!t) return;
  var who = String(name || "them").trim() || "them";
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    var res = await window.authFetch("/api/invites/" + encodeURIComponent(t) + "/nudge", { method: "POST" });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      window.tstsNotify((raw && raw.message) || "Couldn't send the reminder.", res.status === 429 ? "info" : "error");
      if (btn) { btn.disabled = false; btn.textContent = label || ("🔔 Nudge " + who); }
      return;
    }
    window.tstsNotify("Reminder sent to " + who + ".", "success");
    if (btn) { btn.textContent = "Reminder sent ✓"; }
  } catch (e) { window.tstsNotify(String((e && e.message) || "Network error."), "error"); if (btn) { btn.disabled = false; btn.textContent = label || ("🔔 Nudge " + who); } }
}

// Owner 2026-06-12 (sir: "all the tabs are one single platform" — ONE relationship-tag style everywhere):
// the SHARED connection chip — identical to the locked New Trips chip — reused on the Invitations tab so the
// "who shared / with whom" treatment matches across tabs. GIFTED → "<label> <name>" (one person, avatar +
// clickable name). SHARING → "<label> <name>" for <3 (all avatars + names inline) or "<label> <first> +N"
// with the SAME interactive "+N" popover (everyone listed: avatar + profile link + Invited/Coming status).
function __tstsRelChip(opts) {
  opts = opts || {};
  var El = window.tstsEl; // module-level helper: alias the DOM builder (El is a per-function local elsewhere)
  var __avatar = function (pic, name) {
    if (safeStr(pic)) { var img = El("img", { className: "w-6 h-6 rounded-full object-cover flex-shrink-0 ring-2 ring-white", alt: safeStr(name) }); try { if (window.tstsSafeImg) window.tstsSafeImg(img, safeStr(pic)); else img.src = safeStr(pic); } catch (_av) { img.src = safeStr(pic); } return img; }
    return El("div", { className: "w-6 h-6 rounded-full bg-tsts-cream flex items-center justify-center text-[10px] font-bold text-tsts-ink flex-shrink-0 ring-2 ring-white", textContent: (safeStr(name) || "?").slice(0, 1).toUpperCase() });
  };
  var __link = function (id, name) {
    var nm = safeStr(name) || "a friend";
    return safeStr(id)
      ? El("a", { href: "public-profile.html?id=" + encodeURIComponent(safeStr(id)), className: "font-semibold text-tsts-ink hover:text-tsts-clay transition", textContent: nm })
      : El("span", { className: "font-semibold text-tsts-ink", textContent: nm });
  };
  if (opts.gifted) {
    var g = opts.gifted;
    return El("span", { className: "inline-flex items-center gap-1.5 max-w-full" }, [
      __avatar(safeStr(g.pic), safeStr(g.name)),
      El("span", { className: "text-xs text-gray-600 whitespace-nowrap" }, [document.createTextNode((opts.label || "Gifted by") + " "), __link(safeStr(g.id), safeStr(g.name))])
    ]);
  }
  var ppl = Array.isArray(opts.people) ? opts.people : [];
  if (!ppl.length) return null;
  var label = opts.label || "Sharing with";
  var avWrap = El("span", { className: "inline-flex items-center flex-shrink-0" });
  var shown = (ppl.length < 3) ? ppl : ppl.slice(0, 1);
  shown.forEach(function (p, i) { var a = __avatar(safeStr(p && p.pic), safeStr(p && p.name)); if (i > 0) { a.style.marginLeft = "-0.4rem"; } a.style.position = "relative"; a.style.zIndex = String(10 - i); avWrap.appendChild(a); });
  var txt = [document.createTextNode(label + " ")];
  if (ppl.length < 3) {
    ppl.forEach(function (p, i) { if (i > 0) txt.push(document.createTextNode(", ")); txt.push(__link(safeStr(p && p.id), safeStr(p && p.name))); });
  } else {
    txt.push(__link(safeStr(ppl[0] && ppl[0].id), safeStr(ppl[0] && ppl[0].name)));
    var moreWrap = El("span", { className: "relative inline-block align-middle" });
    var moreBtn = El("button", { type: "button", className: "ml-1 text-xs font-semibold text-tsts-clay hover:underline cursor-pointer", textContent: "+" + (ppl.length - 1) });
    moreBtn.setAttribute("aria-haspopup", "true"); moreBtn.setAttribute("aria-expanded", "false");
    var pop = El("div", { className: "absolute right-0 top-full mt-2 z-50 hidden bg-white rounded-xl shadow-soft-card border border-gray-100 p-2 text-left" });
    pop.style.minWidth = "210px";
    pop.appendChild(El("p", { className: "text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 pt-1 pb-1.5", textContent: opts.popoverTitle || "Sharing this table with" }));
    ppl.forEach(function (p) {
      var nm = safeStr(p && p.name) || "a friend";
      var pid = safeStr(p && p.id);
      var rowKids = [__avatar(safeStr(p && p.pic), nm), El("span", { className: "text-sm text-tsts-ink font-medium flex-1 whitespace-nowrap", textContent: nm })];
      if (safeStr(p && p.status)) rowKids.push(El("span", { className: "text-[10px] font-semibold whitespace-nowrap " + (safeStr(p.status) === "pending" ? "text-amber-600" : "text-green-600"), textContent: (safeStr(p.status) === "pending" ? "Invited" : "Coming") }));
      var row = pid ? El("a", { href: "public-profile.html?id=" + encodeURIComponent(pid), className: "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-tsts-cream transition" }, rowKids) : El("div", { className: "flex items-center gap-2 px-2 py-1.5" }, rowKids);
      pop.appendChild(row);
    });
    moreBtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var hidden = pop.classList.toggle("hidden"); moreBtn.setAttribute("aria-expanded", hidden ? "false" : "true"); });
    document.addEventListener("click", function (ev) { if (!moreWrap.contains(ev.target)) { pop.classList.add("hidden"); moreBtn.setAttribute("aria-expanded", "false"); } });
    moreWrap.appendChild(moreBtn); moreWrap.appendChild(pop);
    txt.push(moreWrap);
  }
  return El("span", { className: "inline-flex items-center gap-1.5 max-w-full" }, [avWrap, El("span", { className: "text-xs text-gray-600 whitespace-nowrap" }, txt)]);
}

async function renderInvitationsPanel() {
  var El = window.tstsEl;
  try {
    var sentRes = await window.authFetch("/api/invites/my-sent?limit=50", { method: "GET" });
    var sentRaw = await sentRes.json().catch(function () { return {}; });
    var sentInvites = (sentRaw && sentRaw.data && Array.isArray(sentRaw.data.invites)) ? sentRaw.data.invites : [];
    var recvRes = await window.authFetch("/api/invites/my-received?limit=50", { method: "GET" });
    var recvRaw = await recvRes.json().catch(function () { return {}; });
    var recvInvites = (recvRaw && recvRaw.data && Array.isArray(recvRaw.data.invites)) ? recvRaw.data.invites : [];

    // Owner 2026-06-12 (sir restructure): "Shared with Me" (you act) renders FIRST, then "Shared by Me",
    // then a combined "Rejected" section at the BOTTOM. Action-needed cards lead each section. An invite
    // you've ALREADY booked drops off entirely (it lives in New Trips as the real booking, no duplication).
    var __invDead = function (inv) { var s = String((inv && inv.status) || "").toUpperCase(); return s === "EXPIRED" || s === "REVOKED" || s === "DECLINED"; };
    var __sentActive = [], __sentRejected = [], __recvActive = [], __recvRejected = [];
    sentInvites.forEach(function (inv) { (__invDead(inv) ? __sentRejected : __sentActive).push(inv); });
    recvInvites.forEach(function (inv) { if (inv.bookedByMe) return; (__invDead(inv) ? __recvRejected : __recvActive).push(inv); });
    // Action-needed first: a sent share still needs action while it has open seats or a pending target.
    __sentActive.sort(function (a, b) {
      var sa = ((a.targetPending ? 1 : 0) + Math.max(0, Number(a.openSeats || 0))) > 0 ? 0 : 1;
      var sb = ((b.targetPending ? 1 : 0) + Math.max(0, Number(b.openSeats || 0))) > 0 ? 0 : 1;
      return sa - sb;
    });
    if ((__recvActive.length + __sentActive.length + __recvRejected.length + __sentRejected.length) === 0) return null;

    // Owner 2026-06-11 (sir): the "My Invitations" h2 was redundant — the "Invitations" SUB-TAB
    // already labels this panel (same reasoning that removed the duplicate Private Requests heading).
    var section = El("section", { className: "space-y-4 mb-8", id: "tsts-invitations-panel" });
    var fallbackImg = "/assets/experience-default.jpg";

    // Owner 2026-06-11 (sir redesign): ONE RICH card per invite. The per-seat "multiple links" are
    // gone — each invite is a single MULTI-USE link, so a card shows the experience (photo + host +
    // date) and either (sent) a Copy-link + the list of who claimed, or (received) a "View seat &
    // complete payment" CTA to the experience page.
    function __invPill(txt, cls) { return El("span", { className: "px-2.5 py-1 text-xs font-bold rounded-full " + cls, textContent: txt }); }
    function __inviteStatusPill(inv, sent) {
      var st = String(inv.status || "").toUpperCase();
      if (!sent) {
        // Owner 2026-06-11 (sir): TRUTHFUL received status — no more "Accepted but payment pending".
        if (inv.bookedByMe) return __invPill("Booked", "bg-green-100 text-green-700");
        // sir 2026-08-18 (F14): "Gifted to you" here doubled the card's own "Per seat: Gifted (free)"
        // fact — two markers, one meaning. The pill now carries the STATE (the guest still has to
        // act) for gifts and pay-your-own alike; the gift-ness lives in the fact and the 🎁 button.
        // sir 2026-08-18 ("an expire invitation must sit in differnt section ... with proper tag"):
        // a ran-out received invite wears the plain Expired tag inside its own section below.
        if (String(inv.status || "").toUpperCase() === "EXPIRED") return __invPill("Expired", "bg-gray-100 text-gray-500");
        return __invPill("Action needed", "bg-amber-100 text-amber-700");
      }
      if (st === "REVOKED") return __invPill("Cancelled", "bg-red-100 text-red-600");
      if (st === "EXPIRED") return __invPill("Expired", "bg-gray-100 text-gray-500");
      // GIFT SEAT spec S4: a gift whose checkout hasn't completed is visible ONLY to the owner,
      // stated as what it is — the seat isn't paid yet, so nobody can claim it.
      if (st === "PENDING_PAYMENT") return __invPill("Payment pending", "bg-yellow-100 text-yellow-700");
      // Owner 2026-08-03 (sir, seat-model fix): "taken" counts FINALIZED seats from the
      // server's openSeats — mere accepts never show as taken any more.
      var seats = Math.max(1, Number(inv.seatsOffered || 1));
      var n = Math.max(0, seats - Math.max(0, Number(inv.openSeats != null ? inv.openSeats : seats)));
      // GIFT SEAT spec §7: a claimed one-seat GIFT says who claimed it — "All seats taken" is
      // seat math, not the answer the gifter is waiting for.
      if (n >= seats && String(inv.mode) === "PAID_SEAT" && Array.isArray(inv.claims) && inv.claims.length) {
        return __invPill("Claimed by " + String((inv.claims[0] && inv.claims[0].name) || "your friend"), "bg-green-100 text-green-700");
      }
      if (n >= seats) return __invPill("All seats taken", "bg-green-100 text-green-700");
      if (n > 0) return __invPill(n + " of " + seats + " taken", "bg-green-100 text-green-700");
      return __invPill("Not claimed yet", "bg-amber-100 text-amber-700");
    }
    // Small chip: who pays for the seat (sir: pay-vs-gift must be visible).
    function __inviteModeLabel(inv) {
      if (String(inv.mode) === "PAID_SEAT") return El("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-tsts-cream text-tsts-ink border border-tsts-clay/40" }, [El("span", { "aria-hidden": "true", className: "text-[10px] leading-none" }, "🎁"), " Gifted seat"]);
      return El("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 text-gray-600" }, [El("i", { className: "fas fa-user-friends text-[10px]" }), " Friend pays"]);
    }
    // Prose block with inline Show more — mirrors the trip card's __proseBlock.
    function __invProse(label, text, collapsible) {
      var t = String(text || "").trim(); if (!t) return null;
      var labelEl = El("p", { className: "heading-serif text-sm font-bold text-tsts-ink mb-0.5", textContent: label });
      var LIMIT = 150;
      if (!collapsible || t.length <= LIMIT) return El("div", { className: "min-w-0" }, [labelEl, El("p", { className: "text-sm text-gray-700 leading-relaxed", textContent: t })]);
      var trunc = t.slice(0, LIMIT).replace(/\s+\S*$/, "").replace(/[\s,.;:!?\u00b7-]+$/, "");
      var p = El("p", { className: "text-sm text-gray-700 leading-relaxed" });
      var node = document.createTextNode(trunc + "… ");
      var tog = El("button", { type: "button", className: "text-xs font-bold text-tsts-clay hover:underline", textContent: "Show more" });
      var open = false;
      tog.addEventListener("click", function (ev) { ev.preventDefault(); open = !open; node.textContent = open ? (t + " ") : (trunc + "… "); tog.textContent = open ? "Show less" : "Show more"; });
      p.appendChild(node); p.appendChild(tog);
      return El("div", { className: "min-w-0" }, [labelEl, p]);
    }
    function __invFact(label, valueText) {
      return El("div", { className: "min-w-0" }, [
        El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-0.5", textContent: label }),
        El("p", { className: "font-semibold text-tsts-ink whitespace-nowrap", textContent: String(valueText) })
      ]);
    }
    function __invRatingRow(inv) {
      var r = Number(inv.averageRating || 0);
      if (!(r > 0)) return null;
      var rc = Number(inv.reviewCount || 0);
      return El("div", { className: "flex items-center gap-1 text-sm" }, [
        El("i", { className: "fas fa-star text-amber-400 text-xs" }),
        El("span", { className: "font-bold text-tsts-ink", textContent: r.toFixed(1) }),
        El("span", { className: "text-gray-400", textContent: rc ? (" · " + rc + (rc === 1 ? " review" : " reviews")) : "" })
      ]);
    }

    // Owner 2026-06-11 (sir): FULL experience sell-card for invitations — same rich card as New Trips
    // (header title + status pill, photo carousel + host + rating left, About / What to bring / Joining
    // prose right, Date · Time · Per-seat price · Where facts) PLUS the invite bits (From inviter,
    // claimed-by list, Copy-link or View-seat-&-pay). This is where a NEW guest decides to claim + pay.
    function __inviteCard(inv, sent) {
      var title = String(inv.experienceTitle || "Experience");
      var st = String(inv.status || "").toUpperCase();
      var expHref = "experience.html?id=" + encodeURIComponent(String(inv.experienceId || ""));
      var claimHref = "experience.html?id=" + encodeURIComponent(String(inv.experienceId || "")) + "&invite=" + encodeURIComponent(String(inv.token || ""));

      // Owner 2026-06-11 (sir issue #6): a dead invite (Expired / Cancelled you sent) has nothing to
      // sell — render a COMPACT row, not the full card.
      if (sent && (st === "EXPIRED" || st === "REVOKED")) {
        return El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 mb-3" }, [
          El("div", { className: "min-w-0" }, [
            El("a", { href: expHref, className: "font-bold text-tsts-ink hover:text-tsts-clay", textContent: title, title: title }),
            El("p", { className: "text-xs text-gray-500 mt-0.5", textContent: __friendlyDateTime(inv.bookingDate, inv.timeSlot) })
          ]),
          __inviteStatusPill(inv, sent)
        ]);
      }

      var imgs = (Array.isArray(inv.experienceImages) ? inv.experienceImages.filter(Boolean) : []);
      var carousel = window.tstsBuildImageCarousel(imgs.length ? imgs : [fallbackImg], { aspectRatio: "4 / 3", rounded: "rounded-xl", alt: title, fallback: fallbackImg });
      // Owner 2026-06-11 (sir: "make it similar to other tabs"): the same wishlist heart the trip/PR
      // cards put top-left of the photo, so the invite card's photo block is identical chrome.
      var carouselWrap = carousel;
      var __invExpId = String(inv.experienceId || "");
      if (__invExpId) {
        carouselWrap = El("div", { className: "relative" }, [carousel]);
        var __invLiked = !!(guestBookmarkedExpIds && guestBookmarkedExpIds.has(__invExpId));
        var __invHeartIcon = El("i", { className: __invLiked ? "fas fa-heart tsts-heart-photo-liked text-xl" : "fas fa-heart tsts-heart-photo text-xl" });
        var __invHeartBtn = El("button", { type: "button", className: "absolute top-2 left-2 z-10 leading-none", "aria-pressed": __invLiked ? "true" : "false", "aria-label": __invLiked ? "Liked" : "Like", title: __invLiked ? "Liked" : "Like" }, [__invHeartIcon]);
        __invHeartBtn.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); __invHeartBtn.classList.remove("tsts-heart-pop"); void __invHeartBtn.offsetWidth; __invHeartBtn.classList.add("tsts-heart-pop"); if (window.tstsToggleBookmark) window.tstsToggleBookmark(__invExpId, __invHeartBtn); });
        carouselWrap.appendChild(__invHeartBtn);
      }

      // Header: title + ★ rating (in the title block — sir: rating belongs with the heading, it's the
      // EXPERIENCE rating) | status pill + mode chip.
      var ratingInline = __invRatingRow(inv);
      // Owner 2026-06-12 (sir: "the stars must be same row"): the ★ rating sits on the SAME row as the
      // title (like New Trips), not stacked on a second line. flex-wrap so it drops below only if cramped.
      var __invTitleH3 = El("h3", { className: "min-w-0", title: title }, [El("a", { href: expHref, className: "font-bold text-xl text-gray-900 leading-tight line-clamp-2 hover:text-tsts-clay transition", textContent: title, title: title })]);
      var titleBlock = El("div", { className: "min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5" }, ratingInline ? [__invTitleH3, ratingInline] : [__invTitleH3]);
      // Owner 2026-06-12 (sir: "all the tabs are one single platform" — same relationship chip as New Trips,
      // in the header BESIDE the status pill, NOT a different inline-text/accordion style in the body).
      var __relChip = null;
      if (!sent) {
        if (inv.inviterName) __relChip = __tstsRelChip({ gifted: { name: inv.inviterName, id: inv.inviterId, pic: inv.inviterPic }, label: (String(inv.mode) === "PAID_SEAT" ? "Gifted by" : "Shared by") });
      } else {
        var __relPeople = [];
        if (inv.targetPending && inv.targetName) __relPeople.push({ id: inv.targetUserId, name: inv.targetName, pic: inv.targetPic, status: "pending" });
        (Array.isArray(inv.claims) ? inv.claims : []).forEach(function (c) { __relPeople.push({ id: c.id, name: c.name, pic: c.pic, status: "accepted" }); });
        if (__relPeople.length) __relChip = __tstsRelChip({ people: __relPeople, label: "Sharing with", popoverTitle: "Shared this seat with" });
      }
      var __invStatusTop = __relChip
        ? El("div", { className: "flex items-center gap-2 flex-wrap justify-end" }, [__relChip, __inviteStatusPill(inv, sent)])
        : __inviteStatusPill(inv, sent);
      var headerRow = El("div", { className: "flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start sm:gap-4" }, [
        titleBlock,
        El("div", { className: "flex flex-col items-start sm:items-end sm:shrink-0 gap-1.5" }, [__invStatusTop, __inviteModeLabel(inv)])
      ]);

      // Left column: carousel (with wishlist heart) + host (rating moved to the title block).
      var leftKids = [carouselWrap];
      if (inv.hostName) {
        var __hostHref = inv.hostId ? ("public-profile.html?id=" + encodeURIComponent(String(inv.hostId))) : "";
        var avatar;
        if (inv.hostPic) { avatar = El("img", { className: "w-10 h-10 rounded-full object-cover flex-shrink-0", alt: String(inv.hostName) }); try { if (window.tstsSafeImg) window.tstsSafeImg(avatar, inv.hostPic, "/assets/avatar-default.png"); else avatar.src = inv.hostPic; } catch (_a) { avatar.src = "/assets/avatar-default.png"; } }
        else { avatar = El("div", { className: "w-10 h-10 rounded-full bg-tsts-cream flex items-center justify-center text-sm font-bold text-tsts-ink flex-shrink-0", textContent: String(inv.hostName).slice(0, 1).toUpperCase() }); }
        var hostInner = El("div", { className: "flex items-center gap-2" }, [avatar, El("p", { className: "text-sm text-gray-700 leading-snug" }, [document.createTextNode("Hosted by "), El("span", { className: "font-semibold text-tsts-ink", textContent: String(inv.hostName) })])]);
        leftKids.push(__hostHref ? El("a", { href: __hostHref, className: "block min-w-0", title: "View " + String(inv.hostName) + "'s profile" }, [hostInner]) : El("div", { className: "min-w-0" }, [hostInner]));
      }

      // Right column prose: About / What to bring / Joining. (The inviter / claimed-by relationship now
      // lives in the header chip beside the status pill — the SAME component as New Trips — not as a
      // separate inline-text/accordion style in the body.)
      var proseItems = [];
      var ab = __invProse("About this experience", inv.about, true); if (ab) proseItems.push(ab);
      var wb = __invProse("What to bring", inv.requirements, false); if (wb) proseItems.push(wb);
      var jn = __invProse("Joining instructions", inv.addressNotes, false); if (jn) proseItems.push(jn);

      var contentRow = El("div", { className: "flex flex-col md:flex-row md:items-start gap-5 md:gap-6" }, [
        El("div", { className: "w-full md:w-1/3 flex-shrink-0 flex flex-col gap-3" }, leftKids),
        El("div", { className: "flex-1 flex flex-col min-w-0 gap-3" }, proseItems)
      ]);

      // Facts: Date · Time · Per seat (price) · Where.
      var datePretty = String(inv.bookingDate || "");
      try { if (inv.bookingDate && window.tstsFormatDateShort) datePretty = String(window.tstsFormatDateShort(inv.bookingDate) || inv.bookingDate); } catch (_d) { void _d; }
      var timePretty = inv.timeSlot ? __formatPrivateRequestTimeRange12h(String(inv.timeSlot)) : "";
      var addrBits = [String(inv.addressLine || "").trim(), String(inv.suburb || "").trim(), [inv.city, inv.state, inv.postcode].map(function (s) { return String(s || "").trim(); }).filter(Boolean).join(" ")].filter(Boolean);
      var facts = [__invFact("Date", datePretty || "Date TBA")];
      if (timePretty) facts.push(__invFact("Time", timePretty));
      // Per-seat fact: free for a gifted seat the recipient is claiming.
      if (!sent && String(inv.mode) === "PAID_SEAT") facts.push(__invFact("Per seat", "Gifted (free)"));
      else if (Number(inv.price || 0) > 0) facts.push(__invFact("Per seat", centsToMoney(Math.round(Number(inv.price || 0) * 100), inv.currency)));
      // Owner 2026-06-11 (sir: the "X of Y seats still open" line was HANGING above the buttons): make
      // capacity a proper "Seats" fact in the grid (like the trip card's "Guests" fact) — no orphan line.
      if (sent) {
        // Owner 2026-08-03 (sir, seat-model fix): the server's openSeats counts FINALIZED
        // seats only — the card no longer subtracts mere accepts.
        var __invSeatsN = Math.max(1, Number(inv.seatsOffered || 1));
        var __invOpenN = Math.max(0, Number(inv.openSeats != null ? inv.openSeats : __invSeatsN));
        facts.push(__invFact("Seats", __invOpenN + " of " + __invSeatsN + " open"));
      }
      var factsBar = El("div", {}, facts);
      // Owner 2026-06-12 (sir: "time is getting in ass of per seat"): the equal-column grid (minmax 135px)
      // crowded the Time value into the next fact — SAME fix as the trip card: flex + space-between so each
      // value sizes to its own content, with right padding so the last fact doesn't jam the Where column.
      factsBar.style.display = "flex"; factsBar.style.flexWrap = "wrap"; factsBar.style.justifyContent = "space-between"; factsBar.style.gap = "0.75rem 1.5rem"; factsBar.style.paddingRight = "3rem";
      // Owner 2026-06-11 (sir): Where lives in a PARALLEL right column (label + address + Open in maps),
      // exactly like the trip/PR cards — NOT as a 4th fact in the grid.
      var __invWhereDetail = null;
      if (addrBits.length) {
        var __invAddrStr = addrBits.join(", ");
        var __invWhereWrap = El("div", { className: "min-w-0" }, [El("p", { className: "font-medium text-tsts-ink", textContent: __invAddrStr })]);
        __invWhereWrap.appendChild(El("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(__invAddrStr), target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-xs font-bold text-tsts-clay hover:underline mt-1", textContent: "Open in maps" }));
        __invWhereDetail = El("div", { className: "min-w-0" }, [El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-0.5", textContent: "Where" }), __invWhereWrap]);
      }

      // Invite actions (sir issue #9: actions do NOT stretch full-width — flex row, content-sized buttons).
      var actionRow = El("div", { className: "flex flex-wrap items-center gap-3" });
      if (sent) {
        // Owner 2026-06-12 (sir: "all the tabs are one single platform"): the "who you shared with"
        // relationship is shown as the header chip (the SAME component as New Trips), so the body keeps
        // only the share-management actions below.
        if (st === "PENDING") {
          // Nudge — only when a targeted recipient hasn't accepted yet (sir's "nudge a person" ask).
          if (inv.targetPending) actionRow.appendChild(El("button", { type: "button", className: "px-5 py-2 text-sm font-bold text-tsts-clay border border-tsts-clay/40 rounded-lg hover:bg-tsts-clay/5 transition inline-flex items-center gap-2", "data-action": "invite-nudge", "data-invite-token": String(inv.token || ""), "data-nudge-name": String(inv.targetName || "") }, [El("span", { "aria-hidden": "true", className: "leading-none" }, "🔔"), " Nudge " + String(inv.targetName || "them")]));
          actionRow.appendChild(El("button", { type: "button", className: "px-5 py-2 text-sm font-bold text-tsts-ink border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-2", "data-action": "invite-copy-link", "data-invite-url": String(inv.inviteUrl || (location.origin + "/" + claimHref)) }, [El("i", { className: "fas fa-link" }), " Copy invite link"]));
          // sir 2026-08-18: "a guest must be able to take back gift if this is not claimed" — the
          // control existed but spoke link-language on a PAID gift. A gift's take-back names the
          // gift and the money; a plain share keeps the link wording.
          var __isGiftInvite = String(inv.mode) === "PAID_SEAT" && !!inv.giftPaid;
          actionRow.appendChild(El("button", { type: "button", className: "px-5 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition inline-flex items-center gap-2", "data-action": "invite-revoke", "data-invite-token": String(inv.token || ""), "data-invite-gift": __isGiftInvite ? "1" : "" }, [El("i", { className: "fas fa-ban" }), __isGiftInvite ? " Take back the gift" : " Stop sharing"]));
        }
        // GIFT SEAT S4 (sir's 100% gift-workflow order, 2026-08-19): an unpaid gift is the OWNER's
        // to finish or discard — the E2.13 draft pattern. Nobody was charged; the receiver has
        // heard nothing yet.
        if (st === "PENDING_PAYMENT") {
          actionRow.appendChild(El("button", { type: "button", className: "px-6 py-2.5 text-sm font-bold rounded-lg transition inline-flex items-center gap-2 tsts-btn-primary shadow", "data-action": "invite-gift-resume-payment", "data-invite-token": String(inv.token || ""), textContent: "Complete payment" }));
          actionRow.appendChild(El("button", { type: "button", className: "px-5 py-2.5 text-sm font-bold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition", "data-action": "invite-gift-discard", "data-invite-token": String(inv.token || ""), textContent: "Discard" }));
          actionRow.appendChild(El("span", { className: "text-xs text-gray-500", textContent: "Nothing has been charged. Your friend won't hear about the gift until it's paid." }));
        }
      } else {
        if (inv.bookedByMe) {
          actionRow.appendChild(El("a", { href: "my-bookings.html?tab=experiences&sub=upcoming", className: "px-6 py-2.5 text-sm font-bold text-tsts-ink border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-2", textContent: "View your booking" }));
        } else if (String(inv.mode) === "PAID_SEAT") {
        actionRow.appendChild(El("button", { type: "button", className: "px-6 py-2.5 text-sm font-bold rounded-lg transition inline-flex items-center gap-2 tsts-btn-primary shadow", "data-action": "invite-confirm-gift", "data-invite-token": String(inv.token || "") }, [El("span", { "aria-hidden": "true", className: "leading-none" }, "🎁"), " Confirm your gifted seat"]));
          // GIFT SEAT spec S7 (sir, 2026-08-19): the receiver may decline — the DECLINED state and its
          // Rejected filing were already designed, the backend route already existed; only this
          // button was missing. Money never moves: the seat stays with the person who paid.
          actionRow.appendChild(El("button", { type: "button", className: "px-5 py-2.5 text-sm font-bold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition", "data-action": "invite-decline-gift", "data-invite-token": String(inv.token || ""), "data-inviter-name": String(inv.inviterName || ""), textContent: "Decline" }));
          actionRow.appendChild(El("span", { className: "text-xs text-gray-500", textContent: "No payment needed. Your friend covered it." }));
        } else {
          actionRow.appendChild(El("a", { href: claimHref, className: "px-6 py-2.5 text-sm font-bold rounded-lg transition inline-flex items-center gap-2 tsts-btn-primary shadow", textContent: "Reserve your seat" + (Number(inv.price || 0) > 0 ? (" · " + centsToMoney(Math.round(Number(inv.price || 0) * 100), inv.currency)) : "") }));
        }
      }

      // Bottom zone: facts + actions LEFT (flex 2), Where PARALLEL right (flex 1) — same as trip/PR cards.
      var __invLeftBottom = El("div", { className: "flex flex-col gap-4 min-w-0" }, [factsBar, actionRow]);
      __invLeftBottom.style.flex = "2 1 0";
      var __invBottomKids = [__invLeftBottom];
      if (__invWhereDetail) {
        var __invWhereCol = El("div", { className: "min-w-0" }, [__invWhereDetail]);
        __invWhereCol.style.flex = "1 1 0";
        try { if (window.matchMedia && window.matchMedia("(min-width: 768px)").matches) __invWhereCol.style.paddingLeft = "1.75rem"; } catch (_e) { void _e; }
        __invBottomKids.push(__invWhereCol);
      }
      var bottomZone = El("div", { className: "border-t border-gray-100 pt-4 flex flex-col md:flex-row gap-5 md:gap-8" }, __invBottomKids);

      return El("div", { className: "bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 mb-4 hover:shadow-md transition" }, [headerRow, contentRow, bottomZone]);
    }

    // Owner 2026-06-12 (sir): a REJECTED invite (cancelled / declined / expired, either direction) renders
    // as a compact row in the combined "Rejected" section — clearly labelled by direction + with whom.
    function __rejectedInviteRow(inv, sent) {
      var title = String(inv.experienceTitle || "Experience");
      var expHref = "experience.html?id=" + encodeURIComponent(String(inv.experienceId || ""));
      var personId = sent ? inv.targetUserId : inv.inviterId;
      var personName = sent ? String(inv.targetName || "") : String(inv.inviterName || "a friend");
      var personNode = (personName && personId)
        ? El("a", { href: "public-profile.html?id=" + encodeURIComponent(String(personId)), className: "font-semibold text-tsts-clay hover:underline", textContent: personName })
        : (personName ? El("span", { className: "font-semibold text-tsts-ink", textContent: personName }) : null);
      var dirLine = sent
        ? El("p", { className: "text-xs text-gray-500 mt-0.5" }, personNode ? [document.createTextNode("Shared by you with "), personNode] : [document.createTextNode("Shared by you · open link")])
        : El("p", { className: "text-xs text-gray-500 mt-0.5" }, [document.createTextNode("Shared with you by "), personNode || document.createTextNode("a friend")]);
      var st = String(inv.status || "").toUpperCase();
      var statusTxt = st === "EXPIRED" ? "Expired" : (st === "REVOKED" ? "Cancelled" : (st === "DECLINED" ? "Declined" : "Closed"));
      var statusCls = (st === "REVOKED" || st === "DECLINED") ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500";
      return El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 mb-3" }, [
        El("div", { className: "min-w-0" }, [
          El("a", { href: expHref, className: "font-bold text-tsts-ink hover:text-tsts-clay", textContent: title, title: title }),
          El("p", { className: "text-xs text-gray-500 mt-0.5", textContent: __friendlyDateTime(inv.bookingDate, inv.timeSlot) }),
          dirLine
        ]),
        El("span", { className: "px-2.5 py-1 text-xs font-bold rounded-full shrink-0 " + statusCls, textContent: statusTxt })
      ]);
    }

    // Shared with Me — TOP (seats others invited you to; YOU claim / pay / confirm).
    if (__recvActive.length > 0) {
      section.appendChild(El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink mt-2 mb-1", textContent: "Shared with Me" }));
      section.appendChild(El("p", { className: "text-sm text-gray-500 mt-0.5 mb-3", textContent: "Seats friends have invited you to. Open one to claim or complete your booking." }));
      __recvActive.forEach(function (inv) { section.appendChild(__inviteCard(inv, false)); });
    }

    // Shared by Me — your outgoing shares (action-needed first).
    if (__sentActive.length > 0) {
      section.appendChild(El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink mt-6 mb-1", textContent: "Shared by Me" }));
      section.appendChild(El("p", { className: "text-sm text-gray-500 mt-0.5 mb-3", textContent: "Seat invites you've shared. Everyone who opens the link can claim a seat; you'll see who's claimed below." }));
      __sentActive.forEach(function (inv) { section.appendChild(__inviteCard(inv, true)); });
    }

    // Rejected — BOTTOM, combined both directions, each labelled by direction + with whom.
    if (__sentRejected.length > 0 || __recvRejected.length > 0) {
      section.appendChild(El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink mt-8 mb-1", textContent: "Rejected" }));
      section.appendChild(El("p", { className: "text-sm text-gray-500 mt-0.5 mb-3", textContent: "Invites that were cancelled, declined, or expired. Free shares cost nothing; a paid gifted seat stays with the person who paid for it." }));
      __recvRejected.forEach(function (inv) { section.appendChild(__rejectedInviteRow(inv, false)); });
      __sentRejected.forEach(function (inv) { section.appendChild(__rejectedInviteRow(inv, true)); });
    }

    return section;
  } catch (_) {
    return null;
  }
}

// ── PRIVATE BOOKING REQUESTS panel (Owner 2026-06-03) ────────────────────────
// The guest's "Requests" section in the trips tab. Lists every private booking
// request they've sent (GET /api/my/private-requests) with the experience, the
// occurrence they asked for, their special note, a status pill, and — while still
// pending host approval — a "Withdraw" action. XSS-safe via window.tstsEl. Returns
// null when the guest has no requests (so the section is hidden entirely).
function __privateRequestHoursLeft(expiresAtRaw) {
  const dt = safeDate(expiresAtRaw);
  if (!dt) return null;
  const ms = dt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / (60 * 60 * 1000)));
}

// Status → { label, pillClass }. Pending shows the live hours-left countdown.
function __privateRequestStatusPill(row) {
  const status = String((row && row.status) || "").toLowerCase();
  // Owner 2026-06-10: derived booking lifecycle wins for confirmed requests — a cancelled or
  // completed private table must never keep wearing the green "Confirmed" pill.
  const __derived = __prDerivedBookingState(row);
  if (__derived === "cancelled") {
    const __bs = String((row && row.bookingStatus) || "").toLowerCase();
    return (__bs === "cancelled_by_host")
      ? { label: "Cancelled by host", pillClass: "bg-rose-100 text-rose-700" }
      : { label: "Cancelled", pillClass: "bg-rose-100 text-rose-700" };
  }
  if (__derived === "completed") return { label: "Completed", pillClass: "bg-gray-100 text-gray-700" };
  if (status === "awaiting_host") {
    const hrs = __privateRequestHoursLeft(row && row.expiresAt);
    const label = (hrs === null) ? "Pending"
      : (hrs <= 0 ? "Awaiting host" : ("Pending · " + hrs + "h left"));
    return { label: label, pillClass: "bg-amber-100 text-amber-700" };
  }
  if (status === "awaiting_payment") return { label: "Payment pending", pillClass: "bg-amber-100 text-amber-700" };
  if (status === "confirmed") return { label: "Confirmed", pillClass: "bg-green-100 text-green-700" };
  if (status === "declined") return { label: "Declined", pillClass: "bg-rose-100 text-rose-700" };
  if (status === "expired") return { label: "Expired", pillClass: "bg-gray-100 text-gray-500" };
  // sir 2026-09-13: while the 48h counter window runs the request is open — the pill says so, in the card's own orange.
  if (status === "invalidated" && __prCounterWindowOpen(row)) return { label: "Date taken · offer pending", pillClass: "bg-orange-100 text-orange-700" };
  if (status === "invalidated") return { label: "No longer available", pillClass: "bg-gray-100 text-gray-500" };
  if (status === "alternative_offered") return { label: "New dates offered", pillClass: "bg-orange-100 text-orange-700" };
  // Owner 2026-06-10: counter_accept_pending (guest started checkout but hasn't paid) is shown to the
  // guest as the SAME open offer as alternative_offered — no "payment pending" limbo. Until payment
  // captures the card is "New dates offered"; the moment it captures it flips to Confirmed.
  if (status === "counter_accept_pending") return { label: "New dates offered", pillClass: "bg-orange-100 text-orange-700" };
  return { label: status ? status.replace(/_/g, " ") : "Pending", pillClass: "bg-gray-100 text-gray-600" };
}

// Owner 2026-06-09: a private request "lives on the Requests tab" = every state EXCEPT the terminal
// outcomes (declined / expired / invalidated, which move to Past Trips — an invalidated one still
// inside its 48h counter window is not one of them; sir 2026-09-13). This INCLUDES confirmed —
// per sir, a confirmed private booking stays on the Requests tab (Booked + message thread), NOT in
// New Trips. (Name kept as __isActivePrivateRequest; both call sites use it for tab membership.)
function __isActivePrivateRequest(row) {
  return !__isTerminalPrivateRequest(row);
}
// Owner 2026-06-10: a CONFIRMED request's lifecycle continues on its Booking (cancel/complete never
// write back to the request row), so the card derives its TRUE state from bookingStatus at read time.
// Returns "cancelled" | "completed" | null (null = the booking is still live).
function __prDerivedBookingState(row) {
  if (String((row && row.status) || "").toLowerCase() !== "confirmed") return null;
  var bs = String((row && row.bookingStatus) || "").toLowerCase();
  if (bs.indexOf("cancel") >= 0 || bs === "refunded") return "cancelled";
  if (bs === "completed") return "completed";
  return null;
}
// The request's own status (or its booking's) says it is finished. This is ALSO the exact set the
// server refuses a guest message on (server.js:28713 → "This request is closed."), which is why the
// chat surfaces read THIS and not the open/closed state below.
function __prClosedByStatus(row) {
  var s = String((row && row.status) || "").toLowerCase();
  if (s === "declined" || s === "expired" || s === "invalidated") return true;
  // A confirmed request whose booking has since been cancelled or completed is history too.
  return !!__prDerivedBookingState(row);
}
// sir's decision 2026-09-13 ("fix with an opus agent") — when an individual seat takes the date a guest
// asked for as a whole table, the server marks the request "invalidated" but deliberately KEEPS the card
// hold for 48 hours (server.js:27006-27011 — holdState stays "authorized", counterEligibleUntil = now +
// 48h) so the host can offer other dates and the guest can accept without a new charge. That window IS
// the request still being open, so the page must not file it away as finished. ONE rule, read by the
// terminal test, the amount word and the card's note; the host's own panel already reads it this way.
// The hold half matters: the server is the only authority on whether money is still held, and it says so
// with holdState — flipped to "released" the moment the window lapses (server.js:26839).
function __prCounterWindowOpen(row) {
  if (String((row && row.status) || "").toLowerCase() !== "invalidated") return false;
  if (String((row && row.holdState) || "").toLowerCase() === "released") return false;
  var until = safeDate(row && row.counterEligibleUntil);
  return !!until && until.getTime() > Date.now();
}
// The words for the time the host has left, built on the page's own hours helper. Under an hour that
// helper floors at 1, so a guest with six minutes left would read "1 hour" — "less than an hour" is the
// phrase this page already uses for that (the refund note, ~line 618).
function __prCounterWindowHoursPhrase(row) {
  var hrs = __privateRequestHoursLeft(row && row.counterEligibleUntil);
  if (hrs === null || hrs <= 0) return "";
  var until = safeDate(row && row.counterEligibleUntil);
  var msLeft = until ? (until.getTime() - Date.now()) : 0;
  if (msLeft < 60 * 60 * 1000) return "less than an hour";
  return hrs + (hrs === 1 ? " hour" : " hours");
}
function __isTerminalPrivateRequest(row) {
  // sir 2026-09-13: an invalidated request inside its 48h counter window is OPEN, not history — the
  // hold is still on the guest's card. It stays under Requests until that window passes.
  if (__prCounterWindowOpen(row)) return false;
  return __prClosedByStatus(row);
}
// Owner 2026-06-09: the outcome note must say WHO closed the request. "declined" covers three
// different paths, distinguished by the adminNote the closing route stamps:
//   "alternative_declined_by_guest" → the GUEST turned down the host's proposed dates
//   "withdrawn_by_guest"            → the GUEST withdrew their own pending request
//   anything else                   → the HOST declined the request
function __prTerminalNote(row) {
  var s = String((row && row.status) || "").toLowerCase();
  var why = String((row && row.adminNote) || "").toLowerCase();
  // Derived booking lifecycle (confirmed request whose booking has since closed).
  var derived = __prDerivedBookingState(row);
  if (derived === "cancelled") {
    var bs = String((row && row.bookingStatus) || "").toLowerCase();
    return (bs === "cancelled_by_host")
      ? "Your host had to cancel this booking. Your payment is refunded in full."
      : "This booking was cancelled. Your refund follows the cancellation schedule.";
  }
  if (derived === "completed") return "This experience is complete. We hope it was a wonderful evening.";
  if (s === "declined") {
    if (why === "alternative_declined_by_guest") return "You declined the host's proposed dates. No charge was made.";
    if (why === "withdrawn_by_guest") return "You withdrew this request. The hold was released; no charge was made.";
    return "The host couldn't take this one. The hold was released; no charge was made.";
  }
  if (s === "expired") return "This request expired before the host responded. The hold was released; no charge was made.";
  if (s === "invalidated") return "A seat was booked on that date, so the whole table was no longer available. The hold was released; no charge was made.";
  return "";
}
// Owner 2026-06-10 — Add-to-calendar (.ics) for a CONFIRMED private booking. The keep-the-hold accept
// confirms in place (the guest never lands on the success page that hosts the calendar action), so the
// confirmed card carries its own. Uses a TZID-anchored local time so calendar apps interpret it in
// Melbourne time without UTC-conversion guesswork. Mirrors success.js's .ics shape.
function __prBuildIcsHref(row) {
  var date = String((row && row.preferredDate) || "").trim();
  var slot = String((row && row.preferredTime) || "").trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  var t = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(slot);
  if (!m || !t) return "";
  var pad2 = function (n) { return String(n).padStart(2, "0"); };
  var startLocal = m[1] + m[2] + m[3] + "T" + pad2(t[1]) + t[2] + "00";
  var endLocal = m[1] + m[2] + m[3] + "T" + pad2(t[3]) + t[4] + "00";
  var title = String((row && row.experienceTitle) || "Your private table");
  var locRest = [row && row.suburb, row && row.city, row && row.state, row && row.postcode].map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" ");
  var location = [String((row && row.addressLine) || "").trim(), locRest].filter(Boolean).join(", ");
  var esc = function (x) { return String(x || "").replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
  // sir 2026-08-16 ("Fix it"): the trip-card shim reuses this builder for SHARED bookings — the
  // fixed "private table" wording lied on those. The shared caller passes isSharedBooking.
  var desc = ((row && row.isSharedBooking) ? "Your booking." : "Your private table booking.") + " Entry code and details in My Experiences: " + window.location.origin + "/my-bookings.html";
  var lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Shared Table Story//Booking//EN",
    "BEGIN:VEVENT",
    "UID:pr-" + String((row && (row._id || row.id)) || startLocal) + "@thesharedtablestory.com",
    "SUMMARY:" + esc(title),
    "DTSTART;TZID=Australia/Melbourne:" + startLocal,
    "DTEND;TZID=Australia/Melbourne:" + endLocal,
    location ? ("LOCATION:" + esc(location)) : "",
    "DESCRIPTION:" + esc(desc),
    "END:VEVENT", "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines);
}
// Owner 2026-06-09 — counter-offer block (host proposed alternative dates), extracted so the rich
// card can embed it. Radios + 48h countdown + Request this date / Decline. One date held only on pick.
function __prCounterOfferBlock(row) {
  var El = window.tstsEl;
  var reqIdA = String((row && (row._id || row.id)) || "");
  var slotsA = Array.isArray(row && row.proposedSlots) ? row.proposedSlots : [];
  var hostNameA = String((row && row.hostName) || "The host");
  var groupName = "pr-offer-" + reqIdA;
  var offerWrap = El("div", { className: "rounded-xl bg-orange-50 border border-orange-100 p-3.5 space-y-3" });
  offerWrap.appendChild(El("p", { className: "text-sm font-semibold text-tsts-ink", textContent: hostNameA + " proposed new dates for your private table" }));
  var hoursA = __privateRequestHoursLeft(row && row.offerExpiresAt);
  if (hoursA !== null && hoursA > 0) {
    offerWrap.appendChild(El("p", { className: "text-[11px] font-medium text-orange-700", textContent: "Respond within " + hoursA + (hoursA === 1 ? " hour" : " hours") }));
  }
  // sir 2026-08-07 ("how much time for guest to pay the price? 1 hours max"): a guest part-way through
  // paying now has ONE HOUR, not the offer's remaining window. They are told that here, before the
  // deadline passes — not left to discover it when the table is gone.
  if (String((row && row.status) || "").toLowerCase() === "counter_accept_pending") {
    offerWrap.appendChild(El("p", { className: "text-[11px] font-medium text-orange-700", textContent:
      "You have started paying for this date. Finish within the hour or the table is released and your card is untouched." }));
  }
  var optWrap = El("div", { className: "space-y-2" });
  slotsA.forEach(function (s, idx) {
    var sd = String((s && s.date) || "");
    var st = String((s && s.time) || "");
    if (!sd || !st) return;
    var sdP = sd;
    try { if (window.tstsFormatDateShort) sdP = String(window.tstsFormatDateShort(sd) || sd); } catch (_e) { void _e; }
    var stP = __formatPrivateRequestTimeRange12h(st);
    var optId = groupName + "-" + idx;
    var radio = El("input", { type: "radio", name: groupName, id: optId, className: "accent-orange-600 w-4 h-4", value: sd + "|" + st });
    if (idx === 0) radio.checked = true;
    optWrap.appendChild(El("label", { className: "flex items-center gap-2.5 rounded-xl bg-white border border-orange-100 px-3 py-2.5 cursor-pointer hover:border-orange-300 transition", htmlFor: optId }, [
      radio,
      El("span", { className: "text-sm font-medium text-tsts-ink", textContent: sdP + (stP ? ("  ·  " + stP) : "") })
    ]));
  });
  offerWrap.appendChild(optWrap);
  offerWrap.appendChild(El("p", { className: "text-[11px] text-gray-500 leading-relaxed", textContent: "Picking a date confirms your private table right away. We use the payment you already have on hold, so there's no extra charge, and the host has already committed to these times." }));
  // Owner 2026-06-09: Accept this date / Decline / Chat with Host share ONE row at EQUAL width
  // (auto-fit grid — no button hogs the row).
  // Owner 2026-06-10: Decline + Chat sit on the ORANGE panel, so a transparent background let the
  // tint bleed through and read as washed-out ghost buttons. Give both a SOLID WHITE fill + crisp
  // border + subtle shadow so they look like real buttons; Accept stays the solid clay primary.
  var __offerBtns = El("div", {}, [
    El("button", { type: "button", className: "px-3.5 py-2.5 rounded-xl tsts-btn-primary text-sm font-semibold shadow-sm transition", textContent: "Accept this date", "data-action": "guest-accept-alternative", "data-request-id": reqIdA, "data-group": groupName }),
    El("button", { type: "button", className: "px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold shadow-sm hover:bg-gray-50 transition", textContent: "Decline", "data-action": "guest-decline-alternative", "data-request-id": reqIdA }),
    El("button", { type: "button", className: "px-3.5 py-2.5 rounded-xl bg-white border border-tsts-clay text-tsts-ink text-sm font-semibold shadow-sm hover:bg-tsts-cream/70 transition flex items-center justify-center gap-1.5", "data-action": "guest-private-request-message", "data-request-id": reqIdA }, [El("i", { className: "fas fa-comments" }), " Chat with Host"])
  ]);
  __offerBtns.style.display = "grid"; __offerBtns.style.gridTemplateColumns = "repeat(auto-fit, minmax(130px, 1fr))"; __offerBtns.style.gap = "0.5rem";
  offerWrap.appendChild(__offerBtns);
  return offerWrap;
}

// Owner 2026-06-09 — request card. Sir's order: the SAME layout as the New/Past trip card for every
// common element, only the request-specific elements swapped in by logic. This mirrors the frozen
// renderTripCard 1:1 (same card classes, header title text-xl + line-clamp + pill + Ref, carousel +
// wishlist heart + host block in the left 1/3, About/What-to-bring/Joining prose right, Date·Time·
// Guests fact grid + Where parallel column) using its exact helpers/classes — renderTripCard is NOT
// touched (these __detailRow/__proseBlock are local copies). Request-only: the status pill, the
// on-hold amount fact, the "Your note to the host" prose, and Edit request / Withdraw / counter-offer.
function __renderPrivateRequestCard(row) {
  var El = window.tstsEl;
  var status = String((row && row.status) || "").toLowerCase();
  var terminal = __isTerminalPrivateRequest(row);
  var pill = __privateRequestStatusPill(row);
  var expId = String((row && row.experienceId) || "");
  var title = (typeof sanitizeExperienceTitle === "function") ? sanitizeExperienceTitle(String((row && row.experienceTitle) || "Experience")) : String((row && row.experienceTitle) || "Experience");
  var img = String((row && row.experienceImage) || "");
  var hostName = String((row && row.hostName) || "");
  var hostPic = String((row && row.hostPic) || "");
  var hostId = String((row && (row.experienceHostId || row.hostId)) || "");
  var about = String((row && row.experienceAbout) || "").trim();
  var bring = String((row && row.requirements) || "").trim();
  var joining = String((row && row.addressNotes) || "").trim();
  var note = String((row && row.note) || "").trim();
  var reqId = String((row && (row._id || row.id)) || "");
  var bookingRef = String((row && row.bookingRef) || "");
  var cents = Number(row && row.amountCents) || 0;
  var fallbackImg = "/assets/experience-default.jpg";

  // Local copies of the trip card's helpers so the request card renders pixel-identically
  // (renderTripCard is frozen and its helpers are private, so they can't be shared directly).
  function __detailRow(label, valueNodeOrText) {
    var valueEl = (typeof valueNodeOrText === "string")
      // Owner-fixed: nowrap so the Time value ("5:00 PM – 8:00 PM") and the request-only amount
      // ("A$500") never wrap inside the tighter 4-fact grid this card needs (sir's "PM on 2nd row" fix).
      ? El("p", { className: "font-semibold text-tsts-ink " + (String(valueNodeOrText).length <= 22 ? "whitespace-nowrap" : "break-words"), textContent: valueNodeOrText })
      : valueNodeOrText;
    return El("div", { className: "min-w-0" }, [
      El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-0.5", textContent: label }),
      valueEl
    ]);
  }
  function __proseBlock(label, text, collapsible) {
    var labelEl = El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-1", textContent: label });
    var LIMIT = 110;
    if (!collapsible || text.length <= LIMIT) {
      return El("div", { className: "min-w-0" }, [labelEl, El("p", { className: "text-sm text-gray-700 leading-relaxed", textContent: text })]);
    }
    var truncated = text.slice(0, LIMIT).replace(/\s+\S*$/, "").replace(/[\s,.;:!?\u00b7-]+$/, "");
    var p = El("p", { className: "text-sm text-gray-700 leading-relaxed" });
    var textNode = document.createTextNode(truncated + "… ");
    var toggle = El("button", { type: "button", className: "text-xs font-bold text-tsts-clay hover:underline", textContent: "Show more" });
    var __expanded = false;
    toggle.addEventListener("click", function (e) { e.preventDefault(); __expanded = !__expanded; textNode.textContent = __expanded ? (text + " ") : (truncated + "… "); toggle.textContent = __expanded ? "Show less" : "Show more"; });
    p.appendChild(textNode); p.appendChild(toggle);
    return El("div", { className: "min-w-0" }, [labelEl, p]);
  }

  // Photo block — BYTE-IDENTICAL to renderTripCard's left column (Owner 2026-06-10: sir's order is
  // "copy paste new trips / past trips, only place NEW elements differently" — so this carousel +
  // heart is the trip card's exact code, fed by the full images array the API now sends).
  var __allImgs = [];
  (function () {
    var seen = {};
    var push = function (u) { if (u && typeof u === "string" && !seen[u]) { seen[u] = 1; __allImgs.push(u); } };
    if (Array.isArray(row && row.experienceImages)) row.experienceImages.forEach(push);
    push(img);
  })();
  var carousel = window.tstsBuildImageCarousel(__allImgs, { aspectRatio: "4 / 3", rounded: "rounded-xl", alt: title, fallback: fallbackImg });
  var carouselWrap = carousel;
  if (expId) {
    carouselWrap = El("div", { className: "relative" }, [carousel]);
    var __liked = !!(guestBookmarkedExpIds && guestBookmarkedExpIds.has(String(expId)));
    var __heartIcon = El("i", { className: __liked ? "fas fa-heart tsts-heart-photo-liked text-xl" : "fas fa-heart tsts-heart-photo text-xl" });
    var __heartBtn = El("button", {
      type: "button",
      className: "absolute top-2 left-2 z-10 leading-none",
      "aria-pressed": __liked ? "true" : "false",
      "aria-label": __liked ? "Liked" : "Like",
      title: __liked ? "Liked" : "Like"
    }, [__heartIcon]);
    __heartBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      __heartBtn.classList.remove("tsts-heart-pop");
      void __heartBtn.offsetWidth;
      __heartBtn.classList.add("tsts-heart-pop");
      if (window.tstsToggleBookmark) window.tstsToggleBookmark(String(expId), __heartBtn);
    });
    carouselWrap.appendChild(__heartBtn);
  }

  // Host block (under the photo) — same markup as the trip card.
  var __hostBlock = null;
  if (hostName) {
    var __hostHref = hostId ? ("public-profile.html?id=" + encodeURIComponent(hostId)) : "";
    var __avatar;
    if (hostPic) { __avatar = El("img", { className: "w-10 h-10 rounded-full object-cover flex-shrink-0", alt: hostName }); if (window.tstsSafeImg) window.tstsSafeImg(__avatar, hostPic); else __avatar.src = hostPic; }
    else { __avatar = El("div", { className: "w-10 h-10 rounded-full bg-tsts-cream flex items-center justify-center text-sm font-bold text-tsts-ink flex-shrink-0", textContent: hostName.slice(0, 1).toUpperCase() }); }
    var __hostInner = El("div", { className: "flex items-center gap-2" }, [
      __avatar,
      El("p", { className: "text-sm text-gray-700 leading-snug" }, ["Hosted by ", El("span", { className: "font-semibold text-tsts-ink group-hover:text-tsts-clay transition", textContent: hostName })])
    ]);
    __hostBlock = __hostHref
      ? El("a", { href: __hostHref, className: "block min-w-0 group", title: "View " + hostName + "'s profile" }, [__hostInner])
      : El("div", { className: "min-w-0" }, [__hostInner]);
  }

  // Right column prose: About / What to bring / Joining + the guest's note (request-specific).
  var proseItems = [];
  if (about) proseItems.push(__proseBlock("About this experience", about, true));
  if (bring) proseItems.push(__proseBlock("What to bring", bring, false));
  if (joining) proseItems.push(__proseBlock("Joining instructions", joining, false));
  if (note) proseItems.push(__proseBlock("Your note to the host", note, true));

  // Header row: title (link, text-xl, line-clamp-2) + status pill + Ref (same as the trip card).
  var titleLink = El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "font-bold text-xl text-gray-900 leading-tight line-clamp-2 hover:text-tsts-clay transition", textContent: title, title: title });
  var statusCol = [El("span", { className: "px-2 py-1 text-xs font-bold rounded-full " + pill.pillClass, textContent: pill.label })];
  if (bookingRef) statusCol.push(El("p", { className: "text-xs text-gray-400 mt-1", textContent: "Ref " + bookingRef }));
  var headerRow = El("div", { className: "flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start sm:gap-4" }, [
    El("div", { className: "min-w-0 flex flex-wrap items-center" }, [El("h3", { className: "min-w-0", title: title }, [titleLink])]),
    El("div", { className: "flex flex-col items-start sm:items-end sm:shrink-0" }, statusCol)
  ]);

  // Content row: [carousel + host] left 1/3 | prose right (same as the trip card).
  var __leftChildren = [carouselWrap];
  if (__hostBlock) __leftChildren.push(__hostBlock);
  var contentRow = El("div", { className: "flex flex-col md:flex-row md:items-start gap-5 md:gap-6" }, [
    El("div", { className: "w-full md:w-1/3 flex-shrink-0 flex flex-col gap-3" }, __leftChildren),
    El("div", { className: "flex-1 flex flex-col min-w-0 gap-3" }, proseItems)
  ]);

  // Facts grid: Date · Time · Guests + the on-hold/whole-table amount (request-specific fact).
  var dateRaw = String((row && row.preferredDate) || "");
  var datePretty = dateRaw;
  try { if (dateRaw && window.tstsFormatDateShort) datePretty = String(window.tstsFormatDateShort(dateRaw) || dateRaw); } catch (_dErr) { void _dErr; }
  var timePretty = (row && row.preferredTime) ? __formatPrivateRequestTimeRange12h(String(row.preferredTime)) : "";
  var guestsN = Math.max(1, Number(row && row.guests) || 1);
  // Owner 2026-06-10 (sir): "Add to calendar" small link sits on the "Date" LABEL line, right next to
  // the word "Date" — value "11 July 2026" sits below as usual. Only on a CONFIRMED booking (the
  // keep-the-hold accept confirms in place, so the guest never sees the success page that hosts it).
  var __icsHref = (status === "confirmed" && !__prDerivedBookingState(row)) ? __prBuildIcsHref(row) : "";
  var __dateCell;
  if (__icsHref) {
    __dateCell = El("div", { className: "min-w-0" }, [
      El("div", { className: "flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mb-0.5" }, [
        El("p", { className: "heading-serif text-base font-semibold text-tsts-ink", textContent: "Date" }),
        El("a", { href: __icsHref, download: "private-table.ics", className: "inline-flex items-center gap-1 text-[11px] font-semibold text-tsts-clay underline underline-offset-2 hover:opacity-80 whitespace-nowrap" }, [El("i", { className: "far fa-calendar-plus text-[10px]" }), " Add to calendar"])
      ]),
      El("p", { className: "font-semibold text-tsts-ink whitespace-nowrap", textContent: datePretty || "Date TBA" })
    ]);
  } else {
    __dateCell = __detailRow("Date", datePretty || "Date TBA");
  }
  var detailRows = [__dateCell];
  if (timePretty) detailRows.push(__detailRow("Time", timePretty));
  detailRows.push(__detailRow("Guests", guestsN + (guestsN === 1 ? " guest" : " guests")));
  // Owner 2026-06-10 — TRUTHFUL amount label. KEEP-THE-HOLD: the original hold is RETAINED from
  // awaiting_host through invalidated → alternative_offered → counter_accept_pending, so all of those
  // show "On hold" (the money is reserved, not charged). Only awaiting_payment is pre-checkout (no hold
  // yet) → "Whole table". confirmed/completed → "Total paid".
  var amtWord = "";
  if (cents > 0) {
    if (status === "confirmed" || status === "completed") amtWord = "Total paid";
    else if (status === "awaiting_payment") amtWord = "Whole table";
    else amtWord = "On hold";
  }
  // Owner 2026-06-10: a cancelled booking's money went back per the schedule — "Total paid" would lie.
  if (__prDerivedBookingState(row) === "cancelled") amtWord = "";
  // Owner 2026-06-12 (sir: "why does it say on hold when the hold is already released?"): a TERMINAL request
  // (declined / expired / invalidated, in Past Trips) had its hold RELEASED — nothing is held now, so drop
  // the misleading money fact entirely (the outcome note already says no charge was made / hold released).
  // sir 2026-09-13: an invalidated request inside its 48h counter window is NOT terminal — the hold really
  // is still there — so it keeps "On hold", which is the fact the guest most needs on that card.
  if (typeof __isTerminalPrivateRequest === "function" && __isTerminalPrivateRequest(row)) amtWord = "";
  if (amtWord) detailRows.push(__detailRow(amtWord, centsToMoney(cents, row && row.currency)));
  var factsBar = El("div", {}, detailRows);
  // Owner 2026-06-10 (sir): DISTRIBUTE the 4 facts (Date · Time · Guests · amount) so each value sizes
  // to its own content and the leftover width becomes EVEN gaps between them — the Time value
  // "5:00 PM – 8:00 PM" no longer fills its column edge-to-edge and crowds Guests. Address column is
  // NOT touched (stays parallel). flex-wrap so it drops to a 2nd line only on narrow mobile.
  factsBar.style.display = "flex"; factsBar.style.flexWrap = "wrap"; factsBar.style.justifyContent = "space-between"; factsBar.style.gap = "0.75rem 1.5rem";

  // Where (parallel column, same as the trip card).
  var whereDetail = null;
  var __localityRest = [row && row.city, row && row.state, row && row.postcode].map(function (s) { return String(s || "").trim(); }).filter(Boolean).join(" ");
  var addrBits = [String((row && row.addressLine) || "").trim(), String((row && row.suburb) || "").trim(), __localityRest].filter(Boolean);
  if (addrBits.length) {
    var addrStr = addrBits.join(", ");
    var whereWrap = El("div", { className: "min-w-0" }, [El("p", { className: "font-medium text-tsts-ink", textContent: addrStr })]);
    whereWrap.appendChild(El("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addrStr), target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-xs font-bold text-tsts-clay hover:underline mt-1", textContent: "Open in maps" }));
    whereDetail = __detailRow("Where", whereWrap);
  }

  // Actions (request-specific): Edit request / Withdraw (active) OR an italic outcome note.
  var actionArea = null, actionNote = null;
  var __actBtns = [];
  if (status === "awaiting_payment") {
    // Owner 2026-06-10: DRAFT. The hold Checkout was never finished, so NO table is held and the
    // host has NOT been notified. The guest can finish payment (re-opens a fresh checkout) or
    // discard the draft. No Chat (the host isn't involved until paid), no Edit (a fresh request is
    // cleaner if they want changes). Reminders nudge them at 1h / 24h; the draft auto-closes at 48h.
    __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow transition", textContent: "Complete payment", "data-action": "guest-private-request-resume", "data-request-id": reqId }));
    __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 border border-gray-200 text-gray-500 text-sm font-bold rounded-lg hover:bg-gray-50 transition", textContent: "Discard", "data-action": "guest-private-request-withdraw", "data-request-id": reqId }));
    actionNote = El("p", { className: "text-xs text-gray-500", textContent: "Your table isn't held until payment is complete, and nothing has been charged yet." });
  } else if (status === "awaiting_host") {
    // Owner 2026-06-09: "Edit request" is allowed only while the requested date is MORE than 24h
    // away (no last-minute edits); "Withdraw request" (cancel the pending request + release the
    // card hold, no charge — NOT a confirmed-booking cancellation) is always available while pending.
    var __occMs = (function () { var d = safeDate(row && row.preferredDate); return d ? d.getTime() : 0; })();
    var __canEdit = __occMs > (Date.now() + 24 * 60 * 60 * 1000);
    if (__canEdit) __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow transition", textContent: "Edit request", "data-action": "guest-private-request-edit", "data-request-id": reqId }));
    __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition", textContent: "Withdraw request", "data-action": "guest-private-request-withdraw", "data-request-id": reqId }));
    if (!__canEdit) actionNote = El("p", { className: "text-xs text-gray-500", textContent: "Editing closes 24 hours before the requested date." });
  } else if (status === "confirmed" && !__prDerivedBookingState(row)) {
    // Owner 2026-08-02 (sir): chat is just chat — no platform-confirmed-requests state.
    actionNote = El("p", { className: "text-sm font-semibold text-green-700", textContent: "Booked ✓ · chat with your host about any special requests." });
    // Owner 2026-06-09: a confirmed private booking is a REAL booking. Since it lives ONLY on the
    // Requests tab now (off the trip list), it MUST expose its Entry Code (for check-in) + standard
    // cancellation (refund per policy) — the SAME view-otp + cancel-review flows a trip card uses.
    var __cbId = String((row && row.bookingId) || "");
    if (__cbId) {
      __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-bold rounded-lg hover:bg-orange-100 transition", textContent: "Entry code", "data-action": "view-otp", "data-booking-id": __cbId }));
      __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition", textContent: "Cancel booking", "data-action": "cancel", "data-booking-id": __cbId }));
      // Owner 2026-06-11 (sir): a confirmed private booking is YOUR whole table — let the booker invite
      // friends to it, in this same action row. Opens the SAME connection-aware gift picker as New Trips
      // + success ("you've covered the table; they claim a seat free").
      var __prInviteBtn = El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 border border-tsts-clay/40 text-tsts-clay text-sm font-bold rounded-lg hover:bg-tsts-clay/5 transition flex items-center justify-center gap-2" }, [El("span", { "aria-hidden": "true", className: "leading-none" }, "🤝"), " Invite / Share"]);
      __prInviteBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.tstsGiftSeatPicker) window.tstsGiftSeatPicker({ experienceId: expId, bookingDate: String((row && row.preferredDate) || ""), timeSlot: String((row && row.preferredTime) || ""), sourceBookingId: __cbId, experienceTitle: title });
      });
      __actBtns.push(__prInviteBtn);
    }
  } else if (__prCounterWindowOpen(row)) {
    // sir's decision 2026-09-13 ("fix with an opus agent"): this guest's date was taken by an individual
    // seat, but their hold is STILL on their card for the rest of the 48h window — the page used to tell
    // them the opposite ("The hold was released; no charge was made"). Live, time-sensitive and about
    // money, so it wears the same orange the counter-offer block on this card uses, not the grey italic
    // that means "this is over".
    actionNote = El("p", { className: "text-sm font-medium text-orange-700", textContent:
      "The date filled up before the host answered. The host has " + __prCounterWindowHoursPhrase(row)
      + " to offer other dates; your card's hold stays until then, and nothing is charged unless you accept." });
  } else if (terminal) {
    actionNote = El("p", { className: "text-sm text-gray-400 italic", textContent: __prTerminalNote(row) });
  }
  // Owner 2026-06-09: "Message host" thread on every NON-terminal request (incl. confirmed) — the
  // guest sends special requests / messages and sees the host's replies + confirmation. For
  // alternative_offered it lives in the counter-offer button row (with Accept this date / Decline).
  // counter_accept_pending renders the SAME counter-offer block as alternative_offered (Chat lives in
  // that block's button row), so exclude both here to avoid a duplicate Chat button.
  // sir 2026-09-13: read by the SERVER's rule, not by `terminal` — an invalidated request inside its
  // counter window is open on this page but its thread is shut at server.js:28713, so a Chat button
  // there could only ever answer "This request is closed." Every other state is unchanged.
  if (!__prClosedByStatus(row) && status !== "alternative_offered" && status !== "counter_accept_pending" && status !== "awaiting_payment") {
    var __msgCount = (Array.isArray(row && row.messages) ? row.messages.length : 0);
    __actBtns.push(El("button", { type: "button", className: "w-full md:w-auto px-5 py-2 bg-tsts-cream border border-tsts-clay text-tsts-ink text-sm font-bold rounded-lg hover:bg-tsts-cream/70 transition flex items-center justify-center gap-2", "data-action": "guest-private-request-message", "data-request-id": reqId }, [El("i", { className: "fas fa-comments" }), " Chat with Host" + (__msgCount ? (" (" + __msgCount + ")") : "")]));
  }
  if (__actBtns.length) {
    actionArea = El("div", {}, __actBtns);
    actionArea.style.display = "grid"; __mbShapeActionGrid(actionArea, __actBtns.length >= 4); actionArea.style.gap = "0.5rem";
    // Owner 2026-06-11 (sir: "match New Trips — why 2 rows here"): the private card's button block is a
    // touch narrower, so with 4 buttons the longer labels (Cancel booking / Chat with Host) wrap to 2
    // lines. Compact each button's horizontal padding + nowrap so all FOUR fit ONE line, like New Trips.
    if (__actBtns.length >= 4) {
      Array.prototype.slice.call(actionArea.children).forEach(function (b) { if (b && b.style) { b.style.paddingLeft = "0.6rem"; b.style.paddingRight = "0.6rem"; } });
    }
  }

  // Counter-offer block — request-specific, full-width before the bottom zone. Shown for both
  // alternative_offered AND counter_accept_pending (the latter = guest started checkout but hasn't
  // paid; we show the open offer again so they can finish, with NO "payment pending" limbo card).
  var counterBlock = (status === "alternative_offered" || status === "counter_accept_pending") ? __prCounterOfferBlock(row) : null;

  // Bottom zone: facts + actions left, Where parallel right (same as the trip card). The facts block
  // (flex 2 : 1, column gap) is UNCHANGED — locked. Owner 2026-06-10 (sir): move ONLY the Where block
  // a little right via its own left padding so the amount has space before it; the address may wrap to
  // 3 rows, which is fine. This indents Where's content only — the facts layout is untouched.
  var __leftBottom = El("div", { className: "flex flex-col gap-4 min-w-0" }, [
    factsBar,
    actionArea || El("span", { className: "hidden" }),
    actionNote || El("span", { className: "hidden" })
  ]);
  __leftBottom.style.flex = "2 1 0";
  var __bottomKids = [__leftBottom];
  if (whereDetail) {
    var __whereCol = El("div", { className: "min-w-0" }, [whereDetail]);
    __whereCol.style.flex = "1 1 0";
    // Owner 2026-06-10 (sir): move ONLY the Where block a little right. Inline padding (Tailwind purge
    // drops md:pl-* here) indents the Where content without changing the flex layout — the facts block
    // is untouched. Desktop only; on mobile the column stacks full-width below, so no indent.
    try { if (window.matchMedia && window.matchMedia("(min-width: 768px)").matches) __whereCol.style.paddingLeft = "1.75rem"; } catch (_mqErr) { void _mqErr; }
    __bottomKids.push(__whereCol);
  }
  var bottomZone = El("div", { className: "border-t border-gray-100 pt-4 flex flex-col md:flex-row gap-5 md:gap-8" }, __bottomKids);

  var cardKids = [headerRow, contentRow];
  if (counterBlock) cardKids.push(counterBlock);
  cardKids.push(bottomZone);
  return El("div", { className: "bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 mb-4 hover:shadow-md transition" }, cardKids);
}

async function renderPrivateRequestsPanel() {
  const El = window.tstsEl;
  try {
    // Owner 2026-06-09: ACTIVE requests only (awaiting_host / awaiting_payment / counter_accept_pending /
    // alternative_offered). Terminal ones (declined / expired / invalidated) live in Past Trips. Reads the
    // cache loadTrips populated (one fetch shared with the count + the Past-Trips terminal cards).
    // sir 2026-09-13: an invalidated request whose 48h counter window is still running counts as active
    // here — the host may still offer other dates against the hold the guest is still carrying.
    var rows = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).filter(__isActivePrivateRequest);
    if (rows.length === 0) return null;
    const section = El("section", { className: "space-y-4 mb-8", id: "tsts-private-requests-panel" });
    rows.forEach(function (row) { section.appendChild(__renderPrivateRequestCard(row)); });
    return section;
  } catch (_prPanelErr) {
    try { console.error("renderPrivateRequestsPanel failed:", _prPanelErr); } catch (e) { void e; }
    return null;
  }
}

// Owner 2026-06-08: one-click inline star rating for completed trips — hover previews, a single
// click submits (no modal). Rating-only POST/PATCH to /api/reviews (comment stays empty; the
// written comment is added separately via the experience page's reviews section).
async function __submitInlineRating(bookingId, expId, reviewId, rating) {
  if (!(await requireAuthOrRedirect())) return { ok: false };
  var endpoint = reviewId ? ("/api/reviews/" + encodeURIComponent(String(reviewId))) : "/api/reviews";
  var method = reviewId ? "PATCH" : "POST";
  try {
    var res = await window.authFetch(endpoint, {
      method: method,
      body: JSON.stringify({ bookingId: String(bookingId || ""), experienceId: String(expId || ""), rating: rating, comment: "" })
    });
    var data = await res.json().catch(function () { return null; });
    if (res && res.ok) {
      if (window.tstsNotify) window.tstsNotify("Thanks! You rated this " + rating + (rating === 1 ? " star." : " stars."), "success");
      var newId = (data && data.data && (data.data.id || data.data._id)) || reviewId || "";
      return { ok: true, reviewId: String(newId) };
    }
    // sir 2026-08-16 ("Fix all three"): prefer the server's own sentence — "try again" is a lie
    // when the refusal is one retrying can't fix.
    if (window.tstsNotify) window.tstsNotify((data && data.message) || "Couldn't save your rating. Please try again.", "error");
    return { ok: false };
  } catch (_e) {
    if (window.tstsNotify) window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
    return { ok: false };
  }
}

function __inlineRatingStars(bookingId, expId, reviewInfo) {
  var El = window.tstsEl;
  var currentRating = Math.max(0, Math.min(5, parseInt((reviewInfo && reviewInfo.rating) || 0, 10) || 0));
  var reviewId = String((reviewInfo && reviewInfo.id) || "");
  var locked = !!(reviewInfo && reviewInfo.canEdit === false);
  var stars = [];
  var wrap = El("div", { className: "flex items-center gap-0.5", role: "radiogroup", "aria-label": "Rate this experience" });
  function paint(n) {
    for (var i = 0; i < stars.length; i++) {
      var ic = stars[i].querySelector("i");
      if (ic) ic.className = "fas fa-star text-lg " + ((i < n) ? "text-amber-400" : "text-gray-300");
    }
  }
  for (var v = 1; v <= 5; v++) {
    (function (val) {
      var star = El("button", {
        type: "button",
        className: "leading-none p-0.5 " + (locked ? "cursor-default" : "cursor-pointer"),
        "aria-label": val + (val === 1 ? " star" : " stars"),
        title: locked ? "Your rating" : ("Rate " + val)
      }, [El("i", { className: "fas fa-star text-lg text-gray-300" })]);
      if (!locked) {
        star.addEventListener("mouseenter", function () { paint(val); });
        star.addEventListener("mouseleave", function () { paint(currentRating); });
        star.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          paint(val);
          __submitInlineRating(bookingId, expId, reviewId, val).then(function (r) {
            if (r && r.ok) { currentRating = val; if (r.reviewId) reviewId = r.reviewId; }
            else { paint(currentRating); }
          });
        });
      }
      stars.push(star);
      wrap.appendChild(star);
    })(v);
  }
  paint(currentRating);
  return wrap;
}

function renderTripCard(booking) {
  const El = window.tstsEl;
  const exp = booking && (booking.experience || booking.experienceDetails) || {};
  const fallbackImg = "/assets/experience-default.jpg";
  const imgUrl = window.tstsSafeUrl(exp.imageUrl || (Array.isArray(exp.images) && exp.images[0]) || booking.imageUrl, fallbackImg);

  const dt = safeDate(booking.bookingDate || booking.experienceDate || booking.date || booking.createdAt);
  const dateStr = dt ? fmtTripDate(dt) : "Date TBA";

  const today = new Date();
  today.setHours(0,0,0,0);

  const isPast = dt ? (dt < today) : false;
  const status = safeStr(booking.status).toLowerCase();
  const isCompleted = status === "completed";
  const isCancelled = status.includes("cancel");
  const complaintId = safeStr(booking.complaintReportId);
  const canFileComplaint = !!booking.canFileComplaint;
  const complaintWindowEndsAt = safeDate(booking.complaintWindowEndsAt);

  const expId = exp._id || exp.id || booking.experienceId || booking.expId || "";
  const bookingId = booking._id || "";
  // Owner 2026-06-02: human-facing booking reference (e.g. "VD57-BCAG") on the card.
  // Falls back to a short uppercased tail of the id for legacy bookings (never the
  // full 24-char ObjectId).
  var bookingRefDisplay = safeStr(booking.bookingRef);
  if (!bookingRefDisplay) {
    var __idStrForRef = safeStr(bookingId);
    if (__idStrForRef.length >= 8) { var __refTail = __idStrForRef.slice(-8).toUpperCase(); bookingRefDisplay = __refTail.slice(0, 4) + "-" + __refTail.slice(4); }
    else bookingRefDisplay = __idStrForRef;
  }
  const title = sanitizeExperienceTitle(exp.title || booking.title || "Untitled experience");
  const guests = booking.guests || booking.numGuests || booking.guestCount || 1;
  const city = exp.city || booking.city || "Location TBA";
  const policyVersion = bookingPolicyVersion(booking) || "Unavailable";
  const policyEffective = formatPolicyEffective(booking) || "Unavailable";
  const refundDecision = booking && booking.refundDecision ? booking.refundDecision : {};
  const refundState = stateLabel(refundDecision.status || "none");
  const refundCents = Number(refundDecision.amountCents);
  const refundAmountText = Number.isFinite(refundCents) && refundCents > 0 ? (" • " + centsToMoney(refundCents)) : "";
  const payoutState = stateLabel((booking && booking.payoutStatus) || "none");
  const visibilityState = bookingVisibilityState(booking);
  const visibilityLabel = bookingVisibilityLabel(visibilityState);
  const visibilityClass = bookingVisibilityChipClass(visibilityState);
  const canToggleVisibility = !isCancelled;
  const nextVisibilityToFriends = visibilityState !== "connections";
  const visibilityToggleBtn = canToggleVisibility ? El("button", {
    className: "w-full md:w-auto px-5 py-2 border border-violet-200 text-violet-700 text-sm font-bold rounded-lg hover:bg-violet-50 transition",
    "data-action": "toggle-visibility",
    "data-booking-id": bookingId,
    "data-to-friends": nextVisibilityToFriends ? "true" : "false",
    textContent: nextVisibilityToFriends ? "Share to Connections" : "Set Private"
  }) : null;

  var statusBadge, actionArea, actionNote = null;

  if (isCancelled) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700", textContent: "Cancelled" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking was cancelled." });
  } else if (isCompleted) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700", textContent: "Completed" });
    const reviewInfo = (booking && booking.review && typeof booking.review === "object") ? booking.review : null;
    const hasReview = !!String((reviewInfo && reviewInfo.id) || "").trim();
    const canEditReview = !!(reviewInfo && reviewInfo.canEdit);
    // GIFT SEAT spec §8.2: reviews belong to the person who ATTENDED. On a gift seat the payer's
    // card (receiver claimed, event done) offers no review prompt — the receiver's card does.
    var __cmpMeId = safeStr(window.__tstsMeId || "");
    var __cmpGiftClaimedAway = !!(booking.isGiftSeat && __cmpMeId && safeStr(booking.giftedByUserId) === __cmpMeId && safeStr(booking.guestId) && safeStr(booking.guestId) !== __cmpMeId);
    // Owner 2026-06-08: the STAR rating is now the one-click inline widget in the heading row.
    // This button is for the WRITTEN comment → it takes the guest to the experience page's
    // reviews/comments section (no star icon here, no modal).
    let reviewLabel = hasReview ? "View / edit your review" : "Write a review";
    const reviewBtn = El("a", {
      // reviewBooking carries the booking so the experience page can open the write box
      // for THIS trip (the server still owns every eligibility check).
      href: "experience.html?id=" + encodeURIComponent(expId) + "&reviewBooking=" + encodeURIComponent(bookingId) + "#reviews-section",
      className: "w-full md:w-auto px-5 py-2 tsts-btn-primary text-sm font-bold rounded-xl shadow transition flex items-center justify-center gap-2"
    }, [El("i", { className: "fas fa-comment" }), " " + reviewLabel]);

    let actionNoteText = "";
    const nodes = __cmpGiftClaimedAway ? [] : [reviewBtn];
    if (hasReview && reviewInfo && reviewInfo.editableUntil && canEditReview) {
      actionNoteText += " Review editable until " + fmtTripDate(reviewInfo.editableUntil) + ".";
    } else if (hasReview && !canEditReview) {
      actionNoteText += " Review submitted. Edit window closed.";
    }
    if (canFileComplaint) {
      nodes.push(
        El("button", {
          className: "w-full md:w-auto px-5 py-2 border border-amber-200 text-amber-700 text-sm font-bold rounded-lg hover:bg-amber-50 transition",
          "data-action": "complaint",
          "data-booking-id": bookingId
        }, [El("i", { className: "fas fa-flag" }), " Report an Issue"])
      );
      if (complaintWindowEndsAt) {
        const complaintNote = "You can report an issue about this booking until " + fmtTripDate(complaintWindowEndsAt) + ".";
        actionNoteText += " " + complaintNote;
      }
    } else if (complaintId) {
      const issueNote = "You have reported an issue for this booking. Our team is looking at it.";
      actionNoteText += " " + issueNote;
    }
    actionNote = actionNoteText.trim() ? El("p", { className: "text-xs text-slate-600 md:text-right", textContent: actionNoteText.trim() }) : null;
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full flex flex-row flex-wrap gap-2 mt-1" }, nodes);
  } else if (status === "expired") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-500", textContent: "Payment expired" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking has expired." });
  } else if (status === "pending_payment") {
    var payStatus = safeStr(booking.paymentStatus).toLowerCase();
    if (payStatus === "failed" || payStatus === "abandoned") {
      statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-600", textContent: "Payment failed" });
      actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "Payment could not be completed." });
    } else {
      statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700", textContent: "Payment pending" });
      actionArea = El("span", { className: "text-sm text-gray-500 italic", textContent: "Payment has not been completed." });
    }
  } else if (status === "refunded") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600", textContent: "Refunded" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking has been refunded." });
  } else if (status === "confirmed" && isPast) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-700", textContent: "Awaiting completion" });
    const nodes = [El("span", { className: "text-sm text-gray-500 italic", textContent: "Completion is being finalized." })];
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full flex flex-row flex-wrap gap-2 mt-1" }, nodes);
  } else if (status === "confirmed") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700", textContent: "Confirmed" });
    // Owner 2026-06-12 (sir: "Yes, remove it"): a GIFTED seat is owned by the PAYER, so the recipient
    // gets NO Cancel button (backend also 403s it) — and NO explanatory line. The absence of the button
    // needs no sentence next to it.
    var __isGiftedSeat = !!safeStr(booking.giftedByName);
    // GIFT SEAT law 5 (sir's spec §7): cancellation rights live with the PAYER. The old gate hid
    // Cancel from everyone whenever giftedByName was set — under the pay-first model the payer's
    // own card carries their own name there, so the payer lost their standard cancel route.
    var __actMeId = safeStr(window.__tstsMeId || "");
    var __giftPayerIsMe = !!(__actMeId && safeStr(booking.giftedByUserId) === __actMeId);
    var __giftClaimedAway = !!(booking.isGiftSeat && __giftPayerIsMe && safeStr(booking.guestId) && safeStr(booking.guestId) !== __actMeId);
    const nodes = [];
    if (!__isGiftedSeat || __giftPayerIsMe) {
      nodes.push(El("button", { className: "w-full md:w-auto px-5 py-2 border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition", "data-action": "cancel", "data-booking-id": bookingId, textContent: "Cancel Booking" }));
    } else if (booking.isGiftSeat && !isPast) {
      // GIFT SEAT S10 (sir's 100% gift-workflow order, 2026-08-19, spec §8.1): the receiver can hand
      // a claimed gift back — the seat returns to the payer, stays paid, and they're told. Quiet
      // secondary action; it is not a cancel and promises no money.
      nodes.push(El("button", { className: "w-full md:w-auto px-5 py-2 border border-gray-200 text-gray-500 text-sm font-bold rounded-lg hover:bg-gray-50 transition", "data-action": "renounce-gift", "data-booking-id": bookingId, "data-gifter-name": safeStr(booking.giftedByName), textContent: "Hand back this seat" }));
    }
    // Entry code button for confirmed+paid upcoming bookings. A gift seat CLAIMED by the receiver
    // holds THEIR entry code and THEIR share surface (spec §7) — the payer's card carries neither.
    var bookingPayStatus = safeStr(booking.paymentStatus).toLowerCase();
    if (bookingPayStatus === "paid" && !isPast && !__giftClaimedAway) {
      nodes.push(El("button", {
        className: "w-full md:w-auto px-5 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-bold rounded-lg hover:bg-orange-100 transition",
        "data-action": "view-otp", "data-booking-id": bookingId, textContent: "Entry Code"
      }));
      // Share This Experience button
      nodes.push(El("button", {
        className: "w-full md:w-auto px-5 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-bold rounded-lg hover:bg-amber-100 transition flex items-center justify-center gap-2",
        "data-action": "share-experience",
        "data-exp-id": expId,
        "data-booking-date": safeStr(booking.bookingDate),
        "data-time-slot": safeStr(booking.timeSlot),
        "data-exp-title": safeStr(title)
      }, [El("i", { className: "fas fa-share-nodes" }), " Share This Experience"]));
    }
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full flex flex-row flex-wrap gap-2 mt-1" }, nodes);
  } else {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600", textContent: "Needs review" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking requires attention." });
  }

  // O-141 (sir, 2026-09-16): "Message host", the mirror of the host's own button. Added AFTER the
  // branches above rather than inside them, so no locked branch is touched and no state is missed:
  // wherever the server says the conversation is open, the card carries the button, including a
  // cancelled or refunded seat, where a guest most often needs to reach their host. When a branch
  // left only a sentence behind, the sentence and the button share one row.
  if (booking && booking.messaging && booking.messaging.available === true) {
    var __msgBtn = __bookingMessageButton(bookingId, "guest", Number((booking.messaging && booking.messaging.messageCount) || 0));
    if (actionArea && actionArea.tagName === "DIV") {
      actionArea.appendChild(__msgBtn);
    } else {
      actionArea = El("div", { className: "w-full flex flex-row flex-wrap items-center gap-2 mt-1" }, [actionArea, __msgBtn].filter(Boolean));
    }
  }

  // Owner 2026-06-05: horizontal rich card. ALL host photos (cover first, deduped)
  // in a carousel that fills the LEFT half; the right half mirrors the success
  // page's detail set (Host · When · Guests · Where + Open in maps · What to bring ·
  // Joining · Ref) with clean monochrome labels (no cheap emoji), and a horizontal
  // actions row instead of the old tall vertical stack.
  var __allImgs = [];
  (function () {
    var seen = {};
    var push = function (u) { if (u && typeof u === "string" && !seen[u]) { seen[u] = 1; __allImgs.push(u); } };
    push(exp.imageUrl || booking.imageUrl);
    if (Array.isArray(exp.images)) exp.images.forEach(push);
  })();
  // Owner 2026-06-05: FIXED aspect (not stretched to the prose height). Real host pics of
  // any dimension crop consistently via object-cover, so every card's image is identical.
  var carousel = window.tstsBuildImageCarousel(__allImgs, { aspectRatio: "4 / 3", rounded: "rounded-xl", alt: title, fallback: fallbackImg });

  // Owner 2026-06-07: site-wide "Like"/wishlist heart on the photo (same glyph, animation and
  // toggle as explore cards). Floats top-left; reflects whether this experience is already liked.
  var carouselWrap = carousel;
  if (expId) {
    carouselWrap = El("div", { className: "relative" }, [carousel]);
    var __liked = !!(guestBookmarkedExpIds && guestBookmarkedExpIds.has(String(expId)));
    var __heartIcon = El("i", { className: __liked ? "fas fa-heart tsts-heart-photo-liked text-xl" : "fas fa-heart tsts-heart-photo text-xl" });
    var __heartBtn = El("button", {
      type: "button",
      className: "absolute top-2 left-2 z-10 leading-none",
      "aria-pressed": __liked ? "true" : "false",
      "aria-label": __liked ? "Liked" : "Like",
      title: __liked ? "Liked" : "Like"
    }, [__heartIcon]);
    __heartBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      __heartBtn.classList.remove("tsts-heart-pop");
      void __heartBtn.offsetWidth;
      __heartBtn.classList.add("tsts-heart-pop");
      if (window.tstsToggleBookmark) window.tstsToggleBookmark(String(expId), __heartBtn);
    });
    carouselWrap.appendChild(__heartBtn);
  }

  // Full address (mirrors the locked success page §S2#6): "88 Smith Street, Fitzroy, Melbourne VIC 3065"
  var __localityRest = [exp.city || city, exp.state, exp.postcode].filter(Boolean).join(" ");
  var __addressStr = [exp.addressLine, exp.suburb, __localityRest].filter(Boolean).join(", ");
  var __mapsHref = "";
  if (exp.lat != null && exp.lng != null && String(exp.lat).trim() && String(exp.lng).trim()) {
    __mapsHref = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(exp.lat + "," + exp.lng);
  } else if (__addressStr) {
    __mapsHref = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(__addressStr);
  }
  var __timeStr = booking.timeSlot ? __formatPrivateRequestTimeRange12h(String(booking.timeSlot)) : "";

  // Fact: APPROVED style (serif sentence-case label + sans value, both ink) — matches
  // the locked success-page summary card. No all-caps. (Owner 2026-06-05.)
  function __detailRow(label, valueNodeOrText) {
    var valueEl = (typeof valueNodeOrText === "string")
      ? El("p", { className: "font-semibold text-tsts-ink " + (String(valueNodeOrText).length <= 22 ? "whitespace-nowrap" : "break-words"), textContent: valueNodeOrText })
      : valueNodeOrText;
    return El("div", { className: "min-w-0" }, [
      El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-0.5", textContent: label }),
      valueEl
    ]);
  }

  // Owner 2026-06-05: Date and Time are SEPARATE facts; "Hosted by" is the label so the
  // value is just the host's name (no "Host / Hosted by" double); Ref moves up to the
  // status row (not in this bar).
  // Owner 2026-06-06: the compact facts bar = Date · Time · Guests only. "Where" is a
  // SEPARATE full-width block (its address is wide → fits in ~1 line, not 4), so the
  // action buttons can sit higher instead of being pushed down by a tall Where cell.
  var detailRows = [];
  // Owner 2026-06-11 (sir: "same website" — confirmed booking must have Add to calendar like the
  // private request). On a CONFIRMED upcoming booking, the "Date" label line carries the SAME clay
  // underlined "Add to calendar" .ics link as the private-request card (reuses __prBuildIcsHref).
  var __tripIcsHref = (status === "confirmed" && !isPast)
    ? __prBuildIcsHref({ preferredDate: safeStr(booking.bookingDate), preferredTime: safeStr(booking.timeSlot), experienceTitle: title, addressLine: (exp && exp.addressLine) || "", suburb: (exp && exp.suburb) || "", city: (exp && exp.city) || "", state: (exp && exp.state) || "", postcode: (exp && exp.postcode) || "", _id: bookingId, isSharedBooking: true })
    : "";
  if (__tripIcsHref) {
    detailRows.push(El("div", { className: "min-w-0" }, [
      El("div", { className: "flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mb-0.5" }, [
        El("p", { className: "heading-serif text-base font-semibold text-tsts-ink", textContent: "Date" }),
        El("a", { href: __tripIcsHref, download: "booking.ics", className: "inline-flex items-center gap-1 text-[11px] font-semibold text-tsts-clay underline underline-offset-2 hover:opacity-80 whitespace-nowrap" }, [El("i", { className: "far fa-calendar-plus text-[10px]" }), " Add to calendar"])
      ]),
      El("p", { className: "font-semibold text-tsts-ink whitespace-nowrap", textContent: dateStr })
    ]));
  } else {
    detailRows.push(__detailRow("Date", dateStr));
  }
  if (__timeStr) detailRows.push(__detailRow("Time", __timeStr));
  detailRows.push(__detailRow("Guests", guests + (Number(guests) === 1 ? " guest" : " guests")));
  // Owner 2026-06-11 (sir: "why is total paid missing?"): show the amount the guest paid on a
  // CONFIRMED/COMPLETED booking — the SAME "Total paid" fact the private-request card + success page
  // carry. Cancelled/refunded bookings show the Refund fact instead ("Total paid" would lie).
  var __tripPaidCents = Number(booking.amountCents) || 0;
  var __tripIsReceivedGift = !!(booking.giftedByUserId && String(booking.giftedByUserId) !== String((window.__tstsMeId || "")) && booking.giftedByName);
  // GIFT SEAT law 5 (sir's spec §7): the PAYER's card after the receiver claims — the money fact
  // stays (they paid), and a plain sentence states whose seat it now is and whose booking it stays.
  var __tripGiftClaimedAway = !!(booking.isGiftSeat && String(booking.giftedByUserId || "") === String((window.__tstsMeId || "")) && String(booking.guestId || "") && String(booking.guestId) !== String((window.__tstsMeId || "")));
  if (__tripPaidCents > 0 && (status === "confirmed" || isCompleted)) {
    if (__tripIsReceivedGift) {
      // sir's law 5: the receiver enjoys the seat; the money was never theirs to show.
      detailRows.push(__detailRow("Your seat", "Gifted by " + String(booking.giftedByName) + ". No charge to you."));
    } else {
      detailRows.push(__detailRow("Total paid", centsToMoney(__tripPaidCents, booking.currency)));
      if (__tripGiftClaimedAway) {
        detailRows.push(__detailRow("Your gift", "Claimed by " + safeStr(booking.guestName) + ". The seat is theirs to enjoy; the booking stays yours."));
      }
    }
  }
  // Owner 2026-06-12 (sir: "do we need to say 'Refunded' again when the heading is Refund?"): the label is
  // already "Refund" — show just the AMOUNT for a completed refund; prefix the state word only when it is
  // NOT a plain refund (e.g. Pending / Failed) so those still read clearly.
  if (refundDecision.status && refundDecision.status !== "none") {
    // sir 2026-08-13: with no amount to show this printed the raw status word — a guest who had just
    // been quoted A$228 was left looking at "Manual", which tells them nothing about their money.
    // Every state now says what is happening and what to expect next, in words, never a status token.
    var __rfStatus = String(refundDecision.status || "").toLowerCase();
    var __refundVal;
    if (refundCents > 0) {
      __refundVal = (__rfStatus === "refunded")
        ? centsToMoney(refundCents)
        : (refundState + " • " + centsToMoney(refundCents));
    } else if (__rfStatus === "manual") {
      __refundVal = "Our team is working out this refund by hand. We'll email you the amount and when it will reach you.";
    } else if (__rfStatus === "pending" || __rfStatus === "processing") {
      __refundVal = "On its way back to the card you paid with. We'll email you the moment it lands.";
    } else if (__rfStatus === "failed") {
      __refundVal = "This refund didn't go through. Write to us and we'll put it right.";
    } else {
      __refundVal = refundState;
    }
    detailRows.push(__detailRow("Refund", __refundVal));
  }

  var whereDetail = null;
  if (__addressStr) {
    var whereWrap = El("div", { className: "min-w-0" }, [
      El("p", { className: "font-medium text-tsts-ink", textContent: __addressStr })
    ]);
    if (__mapsHref) {
      whereWrap.appendChild(El("a", {
        href: __mapsHref, target: "_blank", rel: "noopener noreferrer",
        className: "inline-flex items-center gap-1 text-xs font-bold text-tsts-clay hover:underline mt-1",
        textContent: "Open in maps"
      }));
    }
    whereDetail = __detailRow("Where", whereWrap);
  }

  // Owner 2026-06-05: the prose-heavy details (What to bring / Joining / About) live
  // in a full-width zone BELOW the compact image+facts row, so the image stays small
  // (~1/3) and the key facts get room on the right. Positions are reviewable.
  var __bring = String(exp.requirements || "").trim();
  var __joining = String(exp.addressNotes || "").trim();
  var __about = String(exp.description || "").trim();
  // Owner 2026-06-05: About shows ~2 lines with "Show more" INLINE at the end (no third
  // row). Labels use the APPROVED serif sentence-case style.
  function __proseBlock(label, text, collapsible) {
    var labelEl = El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-1", textContent: label });
    var LIMIT = 110;
    if (!collapsible || text.length <= LIMIT) {
      return El("div", { className: "min-w-0" }, [labelEl, El("p", { className: "text-sm text-gray-700 leading-relaxed", textContent: text })]);
    }
    var truncated = text.slice(0, LIMIT).replace(/\s+\S*$/, "").replace(/[\s,.;:!?\u00b7-]+$/, "");
    var p = El("p", { className: "text-sm text-gray-700 leading-relaxed" });
    var textNode = document.createTextNode(truncated + "… ");
    var toggle = El("button", { type: "button", className: "text-xs font-bold text-tsts-clay hover:underline", textContent: "Show more" });
    var __expanded = false;
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      __expanded = !__expanded;
      textNode.textContent = __expanded ? (text + " ") : (truncated + "… ");
      toggle.textContent = __expanded ? "Show less" : "Show more";
    });
    p.appendChild(textNode);
    p.appendChild(toggle);
    return El("div", { className: "min-w-0" }, [labelEl, p]);
  }

  // Host (owner 2026-06-05): avatar + "Hosted by <Name>"; the WHOLE row links to the host
  // profile. No "About this host" heading, no separate "View profile" link, no double label.
  var __hostBlock = null;
  if (exp.hostName) {
    var __hostHref = exp.hostId ? ("public-profile.html?id=" + encodeURIComponent(exp.hostId)) : "";
    var __hostPic = String(exp.hostPic || exp.hostAvatar || "").trim();
    var __avatar;
    if (__hostPic) {
      __avatar = El("img", { className: "w-10 h-10 rounded-full object-cover flex-shrink-0", alt: exp.hostName });
      window.tstsSafeImg(__avatar, __hostPic);
    } else {
      __avatar = El("div", { className: "w-10 h-10 rounded-full bg-tsts-cream flex items-center justify-center text-sm font-bold text-tsts-ink flex-shrink-0", textContent: String(exp.hostName).slice(0, 1).toUpperCase() });
    }
    var __hostInner = El("div", { className: "flex items-center gap-2" }, [
      __avatar,
      El("p", { className: "text-sm text-gray-700 leading-snug" }, ["Hosted by ", El("span", { className: "font-semibold text-tsts-ink group-hover:text-tsts-clay transition", textContent: exp.hostName })])
    ]);
    __hostBlock = __hostHref
      ? El("a", { href: __hostHref, className: "block min-w-0 group", title: "View " + exp.hostName + "'s profile" }, [__hostInner])
      : El("div", { className: "min-w-0" }, [__hostInner]);
  }

  // Owner 2026-06-06: host moves to the LEFT column UNDER the photo; the right column is
  // just the experience prose, top-aligned with the photo for better space positioning.
  var proseItems = [];
  if (__about) proseItems.push(__proseBlock("About this experience", __about, true));
  if (__bring) proseItems.push(__proseBlock("What to bring", __bring, false));
  if (__joining) proseItems.push(__proseBlock("Joining instructions", __joining, false));

  // Header row (owner 2026-06-05): experience title (link) on the LEFT, ABOVE the photo;
  // status pill + Ref on the right. Full width.
  var titleLink = El("a", {
    href: "experience.html?id=" + encodeURIComponent(expId),
    className: "font-bold text-xl text-gray-900 leading-tight line-clamp-2 hover:text-tsts-clay transition",
    textContent: title, title: title
  });
  // Owner 2026-06-12 (sir: "name of connection in same row as Confirmed" — under "Hosted by" CONFUSED the
  // host with the connection): the seat-relationship tag lives in the SAME ROW as the status pill. Compact:
  // a small avatar + clickable name. GIFTED to me → "Gifted by <gifter>"; SHARED by me → "Sharing with
  // <names>" (each person's avatar when fewer than 3, else "<first> +N"). Built here so it sits with the pill.
  function __personLinkTrip(id, name) {
    var nm = safeStr(name) || "a friend";
    return safeStr(id)
      ? El("a", { href: "public-profile.html?id=" + encodeURIComponent(safeStr(id)), className: "font-semibold text-tsts-ink hover:text-tsts-clay transition", textContent: nm })
      : El("span", { className: "font-semibold text-tsts-ink", textContent: nm });
  }
  function __personAvatarTrip(pic, name) {
    if (safeStr(pic)) {
      var img = El("img", { className: "w-6 h-6 rounded-full object-cover flex-shrink-0 ring-2 ring-white", alt: safeStr(name) });
      try { window.tstsSafeImg(img, safeStr(pic)); } catch (_av) { img.src = safeStr(pic); }
      return img;
    }
    return El("div", { className: "w-6 h-6 rounded-full bg-tsts-cream flex items-center justify-center text-[10px] font-bold text-tsts-ink flex-shrink-0 ring-2 ring-white", textContent: (safeStr(name) || "?").slice(0, 1).toUpperCase() });
  }
  var __relChip = null;
  var __giftedName = safeStr(booking.giftedByName);
  // GIFT SEAT law 5 (sir's spec §7): on the PAYER's own card the chip must never read
  // "Gifted by <myself>" — it names the RECEIVER once claimed, or states the seat is
  // still unclaimed. The receiver's card keeps the approved "Gifted by <gifter>" chip.
  var __chipMeId = safeStr(window.__tstsMeId || "");
  var __chipPayerIsMe = !!(booking.isGiftSeat && __chipMeId && safeStr(booking.giftedByUserId) === __chipMeId);
  if (__chipPayerIsMe) {
    var __chipHolderId = (safeStr(booking.guestId) && safeStr(booking.guestId) !== __chipMeId) ? safeStr(booking.guestId) : "";
    var __chipKids = __chipHolderId
      ? [document.createTextNode("Gifted to "), __personLinkTrip(__chipHolderId, safeStr(booking.guestName))]
      : [document.createTextNode("Gift seat · not claimed yet")];
    __relChip = El("span", { className: "inline-flex items-center gap-1.5 max-w-full" }, [
      El("span", { className: "text-xs text-gray-600 whitespace-nowrap" }, __chipKids)
    ]);
  } else if (__giftedName) {
    __relChip = El("span", { className: "inline-flex items-center gap-1.5 max-w-full" }, [
      __personAvatarTrip(safeStr(booking.giftedByPic), __giftedName),
      El("span", { className: "text-xs text-gray-600 whitespace-nowrap" }, [document.createTextNode("Gifted by "), __personLinkTrip(safeStr(booking.giftedByUserId), __giftedName)])
    ]);
  } else if (Array.isArray(booking.sharedWith) && booking.sharedWith.length) {
    var __ppl = booking.sharedWith;
    var __avWrap = El("span", { className: "inline-flex items-center flex-shrink-0" });
    var __shown = (__ppl.length < 3) ? __ppl : __ppl.slice(0, 1);
    __shown.forEach(function (p, i) {
      var a = __personAvatarTrip(safeStr(p && p.pic), safeStr(p && p.name));
      if (i > 0) { a.style.marginLeft = "-0.4rem"; }
      a.style.position = "relative"; a.style.zIndex = String(10 - i);
      __avWrap.appendChild(a);
    });
    var __txt = [document.createTextNode("Sharing with ")];
    if (__ppl.length < 3) {
      __ppl.forEach(function (p, i) { if (i > 0) __txt.push(document.createTextNode(", ")); __txt.push(__personLinkTrip(safeStr(p && p.id), safeStr(p && p.name))); });
    } else {
      __txt.push(__personLinkTrip(safeStr(__ppl[0] && __ppl[0].id), safeStr(__ppl[0] && __ppl[0].name)));
      // Owner 2026-06-12 (sir: "what happens when i click on +2? nothing"): the "+N" is INTERACTIVE —
      // clicking it opens a small popover listing EVERYONE on this seat-share (avatar + clickable profile
      // + Invited/here status), so the hidden people are reachable, not dead text.
      var __moreWrap = El("span", { className: "relative inline-block align-middle" });
      var __moreBtn = El("button", { type: "button", className: "ml-1 text-xs font-semibold text-tsts-clay hover:underline cursor-pointer", textContent: "+" + (__ppl.length - 1) });
      __moreBtn.setAttribute("aria-haspopup", "true"); __moreBtn.setAttribute("aria-expanded", "false");
      var __pop = El("div", { className: "absolute right-0 top-full mt-2 z-50 hidden bg-white rounded-xl shadow-soft-card border border-gray-100 p-2 text-left" });
      __pop.style.minWidth = "210px";
      __pop.appendChild(El("p", { className: "text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 pt-1 pb-1.5", textContent: "Sharing this table with" }));
      __ppl.forEach(function (p) {
        var nm = safeStr(p && p.name) || "a friend";
        var pid = safeStr(p && p.id);
        var rowKids = [
          __personAvatarTrip(safeStr(p && p.pic), nm),
          El("span", { className: "text-sm text-tsts-ink font-medium flex-1 whitespace-nowrap", textContent: nm })
        ];
        rowKids.push(El("span", { className: "text-[10px] font-semibold whitespace-nowrap " + (safeStr(p && p.status) === "pending" ? "text-amber-600" : "text-green-600"), textContent: (safeStr(p && p.status) === "pending" ? "Invited" : "Coming") }));
        var row = pid
          ? El("a", { href: "public-profile.html?id=" + encodeURIComponent(pid), className: "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-tsts-cream transition" }, rowKids)
          : El("div", { className: "flex items-center gap-2 px-2 py-1.5" }, rowKids);
        __pop.appendChild(row);
      });
      __moreBtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var hidden = __pop.classList.toggle("hidden"); __moreBtn.setAttribute("aria-expanded", hidden ? "false" : "true"); });
      document.addEventListener("click", function (ev) { if (!__moreWrap.contains(ev.target)) { __pop.classList.add("hidden"); __moreBtn.setAttribute("aria-expanded", "false"); } });
      __moreWrap.appendChild(__moreBtn); __moreWrap.appendChild(__pop);
      __txt.push(__moreWrap);
    }
    __relChip = El("span", { className: "inline-flex items-center gap-1.5 max-w-full" }, [__avWrap, El("span", { className: "text-xs text-gray-600 whitespace-nowrap" }, __txt)]);
  }
  // Top status line: relationship chip (if any) on the SAME ROW as the status pill; Ref below.
  var __statusTop = __relChip
    ? El("div", { className: "flex items-center gap-2 flex-wrap justify-end" }, [__relChip, statusBadge])
    : statusBadge;
  var statusCol = [__statusTop];
  if (bookingRefDisplay) statusCol.push(El("p", { className: "text-xs text-gray-400 mt-1", textContent: "Ref " + bookingRefDisplay }));
  // Owner 2026-06-08: for completed trips, 5 one-click rating stars sit in the SAME row as the
  // experience heading (hover previews, a single click submits — no modal, no extra buttons).
  var __titleSide = [El("h3", { className: "min-w-0", title: title }, [titleLink])];
  // GIFT SEAT spec §8.2: no rating stars on the PAYER's card for a seat the receiver attended.
  if (isCompleted && !__tripGiftClaimedAway) {
    __titleSide.push(__inlineRatingStars(bookingId, expId, ((booking && booking.review && typeof booking.review === "object") ? booking.review : null)));
  }
  var __titleSideEl = El("div", { className: "min-w-0 flex flex-wrap items-center" }, __titleSide);
  // Owner 2026-06-08: inline gap (purge-proof) so the rating stars aren't glued to the heading.
  __titleSideEl.style.columnGap = "0.85rem";
  __titleSideEl.style.rowGap = "0.25rem";
  var headerRow = El("div", { className: "flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start sm:gap-4" }, [
    __titleSideEl,
    El("div", { className: "flex flex-col items-start sm:items-end sm:shrink-0" }, statusCol)
  ]);

  // Content row: photo (left ~1/3) + right column starting with the HOST (top-aligned with
  // the photo), then About / What to bring / Joining. (Title is in the header row above.)
  var rightCol = [];
  proseItems.forEach(function (p) { rightCol.push(p); });
  // Left column = photo, with "Hosted by" directly below it (width capped at the photo
  // width since it lives in the 1/3 column; the name wraps to a 2nd line if long). The seat-relationship
  // tag does NOT live here — it sits in the status row beside the "Confirmed" pill (built above).
  var __leftChildren = [carouselWrap];
  if (__hostBlock) __leftChildren.push(__hostBlock);
  var contentRow = El("div", { className: "flex flex-col md:flex-row md:items-start gap-5 md:gap-6" }, [
    El("div", { className: "w-full md:w-1/3 flex-shrink-0 flex flex-col gap-3" }, __leftChildren),
    El("div", { className: "flex-1 flex flex-col min-w-0 gap-3" }, rightCol)
  ]);

  // BOTTOM: facts row + ALL actions visible.
  // Owner 2026-06-12 (sir: "the time is getting into guest"): MATCH the private-request card's ACTUAL
  // distribution (line ~1620) — flex + justify-content:space-between so each value sizes to its OWN
  // content and the leftover width becomes EVEN gaps. The prior equal-column grid (minmax 135px) made
  // the Time value "6:00 PM – 7:15 PM" (138px) fill its 141px track edge-to-edge and crowd Guests;
  // flex gives Time exactly its width and spreads the slack as gaps. (The 2026-06-11 comment claimed
  // the grid matched the PR card — it didn't; the PR card has used flex space-between since 2026-06-10.)
  var factsBar = El("div", {}, detailRows);
  factsBar.style.display = "flex";
  factsBar.style.flexWrap = "wrap";
  factsBar.style.justifyContent = "space-between";
  factsBar.style.gap = "0.75rem 1.5rem";
  // Owner 2026-06-12 (sir): space-between spreads the 4 facts evenly across the block (no left-bunching),
  // but on its own it pushes "Total paid" flush to the block edge where it jammed the parallel "Where"
  // column. The right padding holds the last fact ~48px short of the edge so there is a clear, deliberate
  // gap before the address — facts spread AND Where breathes. Where's column is untouched (locked).
  factsBar.style.paddingRight = "3rem";

  // Actions (owner 2026-06-05): clearly-visible polished buttons. The separate "Share
  // This Experience" + "Share to Connections" buttons are merged into ONE "Share" button
  // whose menu offers link/social-media sharing OR sharing with your connections.
  (function () {
    var kids = (actionArea && actionArea.children) ? Array.prototype.slice.call(actionArea.children) : [];
    var hadShare = false;
    kids.forEach(function (b) {
      var a = b.getAttribute && b.getAttribute("data-action");
      if (a === "share-experience" || a === "toggle-visibility") { b.remove(); hadShare = true; }
    });
    if (hadShare && actionArea && actionArea.appendChild) {
      // 2026-08-25: the gift/invite item below is offered ONLY on a confirmed, upcoming booking that
      // has not already been claimed away. On any other booking the menu holds share actions only, so
      // the BUTTON must not keep promising "Invite". One condition, used for both the label and the
      // item, so the two can never drift apart again.
      var __canInvite = (status === "confirmed" && !isPast && !__giftClaimedAway);
      var wrap = El("div", { className: "relative w-full md:w-auto" });
      var shareBtn = El("button", {
        type: "button",
        className: "w-full md:w-auto px-5 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-bold rounded-lg hover:bg-amber-100 transition flex items-center justify-center gap-2",
        "aria-haspopup": "true", "aria-expanded": "false"
      }, [El("span", { "aria-hidden": "true", className: "leading-none" }, "🤝"), (__canInvite ? " Invite / Share" : " Share")]);
      var menu = El("div", { className: "hidden absolute bg-white border border-gray-200 rounded-xl shadow-lg p-1 flex flex-col gap-1" });
      menu.style.bottom = "100%"; menu.style.left = "0"; menu.style.marginBottom = "4px"; menu.style.zIndex = "30"; menu.style.minWidth = "240px";
      var itemCls = "w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 rounded-lg transition hover:bg-gray-50 flex items-center gap-2";
      // Owner 2026-06-11 (sir: "merge into one"): the seat-INVITE action is the TOP item of this menu
      // (the separate "Invite a friend" button is removed). Only on a confirmed, upcoming booking.
      if (__canInvite) {
        // GIFT SEAT law 4 (sir's spec S14): a gift-seat booking the payer still holds re-gifts on the
        // SAME paid seat — the picker opens in re-gift mode (no checkout, no new charge). Any other
        // booking gifts the normal pay-first way. A gift seat the receiver already claimed offers no
        // gift action at all — that seat is given.
        var __menuMeId = safeStr(window.__tstsMeId || "");
        var __menuRegiftId = (booking.isGiftSeat && __menuMeId && safeStr(booking.giftedByUserId) === __menuMeId && safeStr(booking.guestId) === __menuMeId) ? bookingId : "";
        var inviteItem = El("button", { type: "button", className: itemCls }, [El("span", { "aria-hidden": "true", className: "leading-none" }, "🎁"), " " + (__menuRegiftId ? "Gift this seat again" : "Gift this experience")]);
        inviteItem.addEventListener("click", function (e) {
          e.preventDefault(); menu.classList.add("hidden");
          // Owner 2026-06-11 (sir: "roll the gift picker everywhere"): open the SAME connection-aware
          // gift picker locked on the success page (gift to a connection / connect+gift / email-to-join),
          // not the old raw-link mode-picker. Friend-pays raw share stays on "Share link / social media".
          if (window.tstsGiftSeatPicker) window.tstsGiftSeatPicker({ experienceId: expId, bookingDate: safeStr(booking.bookingDate), timeSlot: safeStr(booking.timeSlot), sourceBookingId: bookingId, experienceTitle: safeStr(title), regiftBookingId: __menuRegiftId });
          else if (window.tstsInviteFriendModal) window.tstsInviteFriendModal({ experienceId: expId, bookingDate: safeStr(booking.bookingDate), timeSlot: safeStr(booking.timeSlot), sourceBookingId: bookingId, experienceTitle: safeStr(title) });
        });
        menu.appendChild(inviteItem);
      }
      var social = El("button", { type: "button", className: itemCls }, [El("i", { className: "fas fa-share-nodes" }), " Share link / social media"]);
      social.addEventListener("click", function (e) { e.preventDefault(); menu.classList.add("hidden"); openShareModal(expId, safeStr(booking.bookingDate), safeStr(booking.timeSlot), safeStr(title)); });
      var conn = El("button", { type: "button", className: itemCls }, [El("i", { className: "fas fa-user-friends" }), " " + (nextVisibilityToFriends ? "Share with your connections" : "Make private again")]);
      conn.addEventListener("click", function (e) { e.preventDefault(); menu.classList.add("hidden"); updateBookingVisibility(bookingId, nextVisibilityToFriends); });
      menu.appendChild(social); menu.appendChild(conn);
      shareBtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var h = menu.classList.toggle("hidden"); shareBtn.setAttribute("aria-expanded", h ? "false" : "true"); });
      document.addEventListener("click", function (ev) { if (!wrap.contains(ev.target)) { menu.classList.add("hidden"); shareBtn.setAttribute("aria-expanded", "false"); } });
      wrap.appendChild(shareBtn); wrap.appendChild(menu);
      actionArea.appendChild(wrap);
    }
  })();
  // Owner 2026-06-11 (sir: "merge into one"): the standalone "Invite a friend" button was removed —
  // the seat-invite action now lives at the TOP of the "Invite / Share" menu above, so the action row
  // stays at FOUR buttons (Cancel · Entry Code · Invite / Share · Report) on ONE row.
  // Owner 2026-06-08: Report action appended LAST (after Cancel/Entry Code/Share) on New Trips
  // + Past cards → report.html, carrying the experience + the page to return to.
  if (actionArea && actionArea.appendChild && expId && ((status === "confirmed" && !isPast) || (isCompleted && !canFileComplaint))) {
    actionArea.appendChild(El("a", {
      href: "report.html?targetType=experience&targetId=" + encodeURIComponent(expId) + "&from=" + encodeURIComponent(location.pathname + location.search),
      className: "w-full md:w-auto px-5 py-2 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-2"
    }, [El("i", { className: "fas fa-flag" }), " Report"]));
  }
  // Owner 2026-06-08: actions are an auto-fit grid INSIDE the left block (under Date/Time/
  // Guests) so all four (Cancel · Entry Code · Share · Report) sit on ONE row at reduced,
  // equal width — no 2-line text wrap. auto-fit drops to fewer columns on narrow screens.
  if (actionArea && actionArea.children && actionArea.children.length) {
    actionArea.style.display = "grid";
    __mbShapeActionGrid(actionArea, true);
    actionArea.style.gap = "0.5rem";
    Array.prototype.slice.call(actionArea.children).forEach(function (c) {
      if (c.style) { c.style.flex = ""; c.style.width = "100%"; c.style.minWidth = "0"; c.style.textAlign = "center"; }
      var inner = (c.querySelector) ? c.querySelector("button") : null;
      if (inner && inner.style) { inner.style.width = "100%"; }
    });
  }
  var actionsRow = actionArea;

  // Owner 2026-06-08: Date/Time/Guests + the action buttons fill the LEFT block (buttons sit
  // directly UNDER the facts — NOT full-width below the address); "Where" is a PARALLEL column.
  var __leftBottom = El("div", { className: "flex flex-col gap-4 min-w-0" }, [
    factsBar,
    actionsRow,
    actionNote || El("span", { className: "hidden", textContent: "" })
  ]);
  __leftBottom.style.flex = "2 1 0";
  var __bottomKids = [__leftBottom];
  if (whereDetail) {
    var __whereCol = El("div", { className: "min-w-0" }, [whereDetail]);
    __whereCol.style.flex = "1 1 0";
    __bottomKids.push(__whereCol);
  }
  var bottomZone = El("div", { className: "border-t border-gray-100 pt-4 flex flex-col md:flex-row gap-5 md:gap-8" }, __bottomKids);

  // sir's order O-146: when the platform takes a table off the public page, the person holding a
  // paid seat on it reads what happened HERE, on their own booking. Before this line the card
  // linked to a page that answered that same person "We couldn't find that. It may have been
  // removed, or the link may be out of date.", which is true about the page and false about the
  // seat. The server decides the sentence (__seatHeldNotice) so the letter and the screen say the
  // same thing; the card shows nothing at all for every other booking.
  var __seatHeldText = String((booking && booking.seatHeldNotice) || "").trim();
  var __cardKids = [headerRow];
  if (__seatHeldText) {
    __cardKids.push(El("div", { className: "rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-start gap-3" }, [
      El("i", { className: "fa-solid fa-circle-info text-amber-600 mt-0.5", "aria-hidden": "true" }),
      El("p", { className: "text-sm text-amber-900 leading-relaxed", textContent: __seatHeldText })
    ]));
  }
  __cardKids.push(contentRow);
  __cardKids.push(bottomZone);

  var card = El("div", { className: "bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 mb-4 hover:shadow-md transition" }, __cardKids);

  return card;
}

/* ====================== REVIEW ====================== */

function openReviewModal(bookingId, expId) {
  return (async () => {
    if (!(await requireAuthOrRedirect())) return;
    const bid = document.getElementById("review-booking-id");
    const eid = document.getElementById("review-exp-id");
    const ratingEl = document.getElementById("review-rating");
    const commentEl = document.getElementById("review-comment");
    if (bid) bid.value = bookingId || "";
    if (eid) eid.value = expId || "";
    if (reviewIdInput) reviewIdInput.value = "";
    if (ratingEl) ratingEl.value = "5";
    syncStars(5);
    if (commentEl) commentEl.value = "";
    reviewModalState.mode = "create";
    reviewModalState.reviewId = "";
    reviewModalState.canEdit = true;
    reviewModalState.editableUntil = null;
    if (reviewModalTitleEl) reviewModalTitleEl.textContent = "How was it?";
    if (reviewModalSubtitleEl) reviewModalSubtitleEl.textContent = "Share your experience with the community.";
    if (reviewSubmitBtn) {
      reviewSubmitBtn.textContent = "Post Review";
      reviewSubmitBtn.disabled = false;
      reviewSubmitBtn.classList.remove("opacity-60", "cursor-not-allowed");
    }
    if (starContainer) starContainer.classList.remove("pointer-events-none", "opacity-60");
    if (commentEl) commentEl.disabled = false;
    if (reviewWindowHintEl) {
      reviewWindowHintEl.textContent = "";
      reviewWindowHintEl.classList.add("hidden");
    }
    _openModal(reviewModal);

    try {
      const cached = getGuestBookingById(bookingId);
      const cachedReview = cached && cached.review ? cached.review : null;
      if (cachedReview && String(cachedReview.id || "").trim()) {
        applyReviewModalMode(cachedReview);
      }

      const res = await window.authFetch("/api/reviews/booking/" + encodeURIComponent(String(bookingId || "")) + "/mine", { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const reviewData = payload && payload.data ? payload.data : null;
      if (reviewData && String(reviewData.id || "").trim()) applyReviewModalMode(reviewData);
    } catch (_) {
    }
  })();
}

function applyReviewModalMode(reviewData) {
  const ratingEl = document.getElementById("review-rating");
  const commentEl = document.getElementById("review-comment");
  const reviewId = String((reviewData && reviewData.id) || "").trim();
  const canEdit = !!(reviewData && reviewData.canEdit);
  const editableUntilRaw = (reviewData && reviewData.editableUntil) ? reviewData.editableUntil : null;
  reviewModalState.reviewId = reviewId;
  reviewModalState.canEdit = canEdit;
  reviewModalState.editableUntil = editableUntilRaw;
  reviewModalState.mode = canEdit ? "edit" : "locked";
  if (reviewIdInput) reviewIdInput.value = reviewId;
  if (ratingEl) ratingEl.value = String((reviewData && reviewData.rating) || 5);
  syncStars((reviewData && reviewData.rating) || 5);
  if (commentEl) commentEl.value = String((reviewData && reviewData.comment) || "");

  if (canEdit) {
    if (reviewModalTitleEl) reviewModalTitleEl.textContent = "Edit your review";
    if (reviewModalSubtitleEl) reviewModalSubtitleEl.textContent = "You can edit this review within 24 hours of submission.";
    if (reviewSubmitBtn) {
      reviewSubmitBtn.textContent = "Update Review";
      reviewSubmitBtn.disabled = false;
      reviewSubmitBtn.classList.remove("opacity-60", "cursor-not-allowed");
    }
    if (starContainer) starContainer.classList.remove("pointer-events-none", "opacity-60");
    if (commentEl) commentEl.disabled = false;
    if (reviewWindowHintEl) {
      const untilText = editableUntilRaw ? fmtTripDate(editableUntilRaw) : "the 24-hour limit";
      reviewWindowHintEl.textContent = "Edit window closes on " + untilText + ".";
      reviewWindowHintEl.classList.remove("hidden");
    }
    renderGuestReviewHostReply(reviewData);
    return;
  }

  if (reviewModalTitleEl) reviewModalTitleEl.textContent = "Review submitted";
  if (reviewModalSubtitleEl) reviewModalSubtitleEl.textContent = "The 24-hour edit window has closed.";
  if (reviewSubmitBtn) {
    reviewSubmitBtn.textContent = "Edit Window Closed";
    reviewSubmitBtn.disabled = true;
    reviewSubmitBtn.classList.add("opacity-60", "cursor-not-allowed");
  }
  if (starContainer) starContainer.classList.add("pointer-events-none", "opacity-60");
  if (commentEl) commentEl.disabled = true;
  if (reviewWindowHintEl) {
    reviewWindowHintEl.textContent = "Reviews become immutable after 24 hours from submission.";
    reviewWindowHintEl.classList.remove("hidden");
  }

  // Show host reply if present (both edit and locked modes)
  renderGuestReviewHostReply(reviewData);
}

function renderGuestReviewHostReply(reviewData) {
  var container = document.getElementById("review-host-reply-container");
  if (!container) return;
  container.textContent = "";
  container.classList.add("hidden");

  var hostReply = String((reviewData && reviewData.hostReply) || "").trim();
  if (!hostReply) return;

  var El = window.tstsEl;
  container.classList.remove("hidden");
  container.appendChild(
    El("div", { className: "pl-4 border-l-2 border-orange-200 bg-orange-50/50 rounded-r-lg p-3" }, [
      El("div", { className: "flex items-center gap-2 mb-1" }, [
        El("span", { className: "text-xs font-bold text-orange-700 uppercase tracking-wide", textContent: "Host Reply" })
      ]),
      El("p", { className: "text-sm text-slate-700 break-words", textContent: hostReply })
    ])
  );
}

async function submitReview(e) {
  e.preventDefault();
  if (!(await requireAuthOrRedirect())) return;

  if (reviewModalState.mode === "locked") {
    window.tstsNotify("Review edit window has closed.", "warning");
    return;
  }

  const submitBtn = reviewSubmitBtn || e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : "";

  if (submitBtn) { submitBtn.textContent = reviewModalState.reviewId ? "Updating..." : "Posting..."; submitBtn.disabled = true; }

  const bookingId = (document.getElementById("review-booking-id") || {}).value || "";
  const expId = (document.getElementById("review-exp-id") || {}).value || "";
  const reviewId = (reviewIdInput || {}).value || "";
  const ratingRaw = (document.getElementById("review-rating") || {}).value || "5";
  const comment = (document.getElementById("review-comment") || {}).value || "";

  try {
    const payload = {
      bookingId,
      experienceId: expId,
      rating: parseInt(ratingRaw, 10) || 5,
      comment
    };

    const endpoint = reviewId
      ? ("/api/reviews/" + encodeURIComponent(String(reviewId)))
      : "/api/reviews";
    const method = reviewId ? "PATCH" : "POST";
    const res = await window.authFetch(endpoint, {
      method: method,
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      window.tstsNotify(reviewId ? "Review updated successfully." : "Review posted successfully! Thank you.", "success");
      closeReviewModal();
      e.target.reset();
      loadTrips(nextDashboardLoadToken("trips")).catch(() => {});
    } else {
      if (String((data && data.error) || "") === "REVIEW_EDIT_WINDOW_CLOSED") {
        applyReviewModalMode({ id: reviewId, rating: payload.rating, comment: payload.comment, canEdit: false });
      }
      window.tstsNotify(data.message || "Failed to post review.", "error");
    }
  } catch (_) {
    window.tstsNotify("Network error.", "error");
  } finally {
    if (submitBtn) { submitBtn.textContent = originalText; submitBtn.disabled = false; }
  }
}

/* ====================== COMPLAINT ====================== */

function getGuestBookingById(bookingId) {
  const id = String(bookingId || "");
  return (guestBookingsCache || []).find((b) => String((b && b._id) || "") === id) || null;
}

async function loadActivePolicySnapshot() {
  try {
    const res = await window.authFetch("/api/policy/active", { method: "GET" });
    if (!res || !res.ok) {
      activePolicySnapshot = null;
      return;
    }
    const payload = await res.json().catch(() => ({}));
    const policy = (payload && payload.data && payload.data.policy)
      ? payload.data.policy
      : ((payload && payload.policy) ? payload.policy : null);
    activePolicySnapshot = (policy && typeof policy === "object") ? policy : null;
  } catch (_) {
    activePolicySnapshot = null;
  }
}

function closeCancelReviewModal() {
  _closeModal(cancelReviewModal);
}

async function openCancelReviewModalById(bookingId) {
  const b = getGuestBookingById(bookingId);
  if (!b) {
    window.tstsNotify("Booking details are unavailable. Please refresh and try again.", "error");
    return;
  }

  // Legacy bookings (pre-Feb-17) may have no locked policySnapshot, fetch fresh policy for those only.
  if (!b.policySnapshot || typeof b.policySnapshot !== "object" || !b.policySnapshot.version) {
    await loadActivePolicySnapshot();
  }

  // The SERVER decides the refund. This modal used to work it out in the browser from a candidate
  // list that never included `bookingValueCents` — the very field the server refunds on — so the
  // guest could be shown a figure the server would not honour. GET /cancel-preview exists to close
  // exactly that drift (its own header comment says so) and success.js has always used it. The
  // local build stays as the fallback for when the call cannot be made, never as the first answer.
  const preview = buildCancelPreview(b);
  try {
    const __pvRes = await window.authFetch("/api/bookings/" + encodeURIComponent(String(bookingId || "")) + "/cancel-preview", { method: "GET" });
    const __pvRaw = await __pvRes.json().catch(function () { return null; });
    if (__pvRes.ok && __pvRaw && __pvRaw.ok === true) {
      const __pv = (__pvRaw.data && typeof __pvRaw.data === "object") ? __pvRaw.data : {};
      const __base = Number(__pv.refundBaseCents);
      const __refund = Number(__pv.refundCents);
      if (Number.isFinite(__base) && Number.isFinite(__refund)) {
        preview.baseCents = Math.max(0, __base);
        preview.refundCents = Math.max(0, __refund);
        preview.chargeCents = Math.max(0, preview.baseCents - preview.refundCents);
        // The route sends refundPercentBps (9500) and refundPercent as a FRACTION (0.95) — not 95.
        // Reading refundPercent as if it were already a percentage rendered "Refund (1%)" beside a
        // correct A$28.50 on a A$30 booking. Basis points are unambiguous, so read those first.
        const __bps = Number(__pv.refundPercentBps);
        const __frac = Number(__pv.refundPercent);
        if (Number.isFinite(__bps)) preview.refundPct = __bps / 100;
        else if (Number.isFinite(__frac)) preview.refundPct = __frac * 100;
        else preview.refundPct = preview.baseCents > 0 ? (preview.refundCents / preview.baseCents) * 100 : 0;
      }
    }
  } catch (__pvErr) { void __pvErr; /* the local estimate above still stands */ }

  if (cancelReviewBookingIdInput) cancelReviewBookingIdInput.value = String(bookingId || "");
  const refundPctNum = Math.round(Number(preview.refundPct) || 0);
  const chargePctNum = Math.max(0, 100 - refundPctNum);
  if (cancelReviewPaidEl) cancelReviewPaidEl.textContent = centsToMoney(preview.baseCents);
  if (cancelReviewChargeEl) {
    cancelReviewChargeEl.textContent = (preview.chargeCents > 0 ? "− " : "") + centsToMoney(preview.chargeCents);
  }
  if (cancelReviewChargePctEl) cancelReviewChargePctEl.textContent = "(" + chargePctNum + "%)";
  if (cancelReviewRefundPercentEl) cancelReviewRefundPercentEl.textContent = "(" + refundPctNum + "%)";
  if (cancelReviewRefundEstimateEl) cancelReviewRefundEstimateEl.textContent = centsToMoney(preview.refundCents);
  if (cancelReviewBasisEl) cancelReviewBasisEl.textContent = preview.basis || preview.note || "";
  if (cancelReviewNoteEl) cancelReviewNoteEl.textContent = preview.note;

  if (cancelReviewConfirmBtn) {
    cancelReviewConfirmBtn.disabled = !preview.canCancel;
    cancelReviewConfirmBtn.classList.toggle("opacity-60", !preview.canCancel);
    cancelReviewConfirmBtn.classList.toggle("cursor-not-allowed", !preview.canCancel);
    cancelReviewConfirmBtn.textContent = preview.canCancel ? "Cancel Booking" : "Cancellation Unavailable";
  }

  _openModal(cancelReviewModal);
}

async function handleCancelReviewConfirm() {
  const bid = String((cancelReviewBookingIdInput && cancelReviewBookingIdInput.value) || "").trim();
  if (!bid) {
    window.tstsNotify("Booking not selected.", "error");
    return;
  }
  const ok = await cancelBooking(bid, true);
  if (ok) closeCancelReviewModal();
}

function openComplaintModalById(bookingId) {
  const b = getGuestBookingById(bookingId);
  if (!b) {
    window.tstsNotify("Booking details are unavailable. Please refresh and try again.", "error");
    return;
  }

  const status = String(b.status || "").toLowerCase();
  if (status !== "completed") {
    window.tstsNotify("You can report an issue once this experience has finished.", "warning");
    return;
  }
  if (String(b.complaintReportId || "").trim().length > 0) {
    window.tstsNotify("You have already reported an issue for this booking. Our team is looking at it.", "info");
    return;
  }
  if (!b.canFileComplaint) {
    // The reporting period runs from the end of the experience; after it closes, the
    // Report link on the card still opens a general report about the experience.
    window.tstsNotify("The time to report an issue for this booking has passed. You can still use Report on the card.", "warning");
    return;
  }

  const bid = document.getElementById("complaint-booking-id");
  if (bid) bid.value = String(bookingId || "");
  if (complaintForm) complaintForm.reset();
  if (complaintWordCount) complaintWordCount.textContent = "0 / 200 words";
  setComplaintStatus("", "info");

  const endAt = safeDate(b.complaintWindowEndsAt);
  if (endAt) {
    setComplaintStatus("Window closes on " + fmtTripDate(endAt) + ".", "info");
  }

  _openModal(complaintModal);
}

function closeComplaintModal() {
  _closeModal(complaintModal);
}

async function uploadComplaintEvidence(file) {
  const fd = new FormData();
  fd.append("photos", file);
  const up = await window.authFetch("/api/upload", {
    method: "POST",
    body: fd
  });
  const outRaw = await up.json().catch(() => ({}));
  const out = (outRaw && outRaw.data) ? outRaw.data : outRaw;
  if (!up.ok) {
    const msg = String((out && out.message) || (outRaw && outRaw.message) || "Evidence upload failed.");
    throw new Error(msg);
  }
  const images = (out && Array.isArray(out.images)) ? out.images : [];
  return images.slice(0, 1);
}

async function submitComplaint(e) {
  e.preventDefault();
  if (!(await requireAuthOrRedirect())) return;

  const bid = String((document.getElementById("complaint-booking-id") || {}).value || "").trim();
  const category = String((document.getElementById("complaint-category") || {}).value || "").trim();
  const message = String((document.getElementById("complaint-message") || {}).value || "").trim();
  const contactEmail = String((document.getElementById("complaint-contact-email") || {}).value || "").trim();
  const contactPhone = String((document.getElementById("complaint-contact-phone") || {}).value || "").trim();
  const evidenceInput = document.getElementById("complaint-evidence");
  const evidenceFile = (evidenceInput && evidenceInput.files && evidenceInput.files[0]) ? evidenceInput.files[0] : null;

  if (evidenceFile && evidenceFile.size > 5 * 1024 * 1024) {
    setComplaintStatus("Evidence file must be under 5 MB.", "error");
    return;
  }

  if (!bid) {
    setComplaintStatus("Booking selection is invalid. Please reopen the form.", "error");
    return;
  }
  if (!category) {
    setComplaintStatus("Select complaint type.", "error");
    return;
  }

  const wc = countWords(message);
  if (wc < 1 || wc > 200) {
    setComplaintStatus("Complaint description must be 1-200 words.", "error");
    return;
  }
  if (!contactEmail && !contactPhone) {
    setComplaintStatus("Provide an email or phone for follow-up.", "error");
    return;
  }
  if (contactEmail && !isEmailLite(contactEmail)) {
    setComplaintStatus("Contact email format is invalid.", "error");
    return;
  }

  const submitText = complaintSubmitBtn ? complaintSubmitBtn.textContent : "Submit Complaint";
  if (complaintSubmitBtn) {
    complaintSubmitBtn.disabled = true;
    complaintSubmitBtn.textContent = "Submitting...";
  }

  try {
    let evidenceUrls = [];
    if (evidenceFile) {
      setComplaintStatus("Uploading evidence...", "info");
      evidenceUrls = await uploadComplaintEvidence(evidenceFile);
    }

    const payload = {
      category,
      message,
      contactEmail,
      contactPhone,
      evidenceUrls
    };

    const res = await window.authFetch(`/api/bookings/${encodeURIComponent(bid)}/complaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String((out && out.message) || "Complaint submission failed.");
      setComplaintStatus(msg, "error");
      return;
    }

    window.tstsNotify("Issue submitted. Our team will review it shortly.", "success");
    closeComplaintModal();
    await loadTrips();
  } catch (err) {
    setComplaintStatus(String((err && err.message) || "Complaint submission failed."), "error");
  } finally {
    if (complaintSubmitBtn) {
      complaintSubmitBtn.disabled = false;
      complaintSubmitBtn.textContent = submitText;
    }
  }
}

/* ====================== CANCEL ====================== */

async function cancelBooking(id, skipInlineConfirm) {
  if (!id) return false;
  if (!skipInlineConfirm) {
    var confirmed = await window.tstsConfirm("Are you sure? Refund policies apply.", { destructive: true, confirmText: "Cancel Booking" });
    if (!confirmed) return false;
  }

  // OTP dual-auth verification for booking cancellation
  var otpToken = await window.tstsOtpVerify("booking_cancel", {
    message: "To confirm booking cancellation, verify your identity.",
    actionLabel: "Verify & Cancel",
    meta: { bookingId: id }
  });
  if (!otpToken) return false;

  try {
    var __cancelIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey({ dataset: {} }) : "";
    const res = await window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpToken: otpToken }),
      idempotencyKey: __cancelIdemKey
    });
    const envelope = await res.json().catch(() => ({}));
    const data = (envelope && envelope.data) ? envelope.data : envelope;

    if (res.ok) {
      const refundCents = Number(data && data.refund && data.refund.amountCents);
      const refundText = Number.isFinite(refundCents) ? centsToMoney(refundCents) : "";
      window.tstsNotify(refundText ? ("Cancelled. Refund: " + refundText) : "Cancelled.", "success");
      await loadTrips();
      return true;
    } else {
      window.tstsNotify("Error: " + ((data && data.message) || "Unable to cancel."), "error");
      return false;
    }
  } catch (_) {
    window.tstsNotify("Network error.", "error");
    return false;
  }
}

async function updateBookingVisibility(id, toFriends) {
  const bookingId = String(id || "").trim();
  if (!bookingId) return;
  if (!(await requireAuthOrRedirect())) return;

  try {
    const res = await window.authFetch("/api/bookings/" + encodeURIComponent(bookingId) + "/visibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toFriends: !!toFriends })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.tstsNotify((data && data.message) ? data.message : "Could not update visibility.", "error");
      return;
    }
    window.tstsNotify(toFriends ? "Booking shared with your connections." : "Booking visibility set to private.", "success");
    await loadTrips();
  } catch (_) {
    window.tstsNotify("Could not update visibility.", "error");
  }
}

async function loadPendingConnectionRequests() {
  const res = await window.authFetch("/api/social/requests", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  const data = (payload && payload.data) ? payload.data : payload;
  return Array.isArray(data) ? data : [];
}

async function respondToConnectionRequest(requestId, action) {
  const id = String(requestId || "").trim();
  const step = String(action || "").trim().toLowerCase();
  if (!id || (step !== "accept" && step !== "reject")) throw new Error("Invalid connection request action.");
  const res = await window.authFetch("/api/social/requests/" + encodeURIComponent(id) + "/" + step, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "Could not update connection request."));
  }
}

function renderConnectionActionPanel(connectionRequests) {
  const El = window.tstsEl;
  const rows = Array.isArray(connectionRequests) ? connectionRequests : [];
  if (rows.length === 0) return null;
  const section = El("section", { className: "space-y-4 mb-8", id: "user-connection-actions-panel" }, [
    El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Pending Connection Requests" })
  ]);

  rows.forEach(function (row) {
    const requestId = String((row && row._id) || "").trim();
    const from = (row && row.from && typeof row.from === "object") ? row.from : {};
    const name = String(from.name || "Member");
    const handle = String(from.handle || "");
    const profileUrl = String((from && from._id) || "").trim()
      ? ("public-profile.html?userId=" + encodeURIComponent(String(from._id || "")))
      : "connections.html";

    section.appendChild(
      El("div", { className: "bg-white p-4 rounded-xl border border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3" }, [
        El("div", { className: "space-y-1" }, [
          El("div", { className: "font-bold text-gray-900", textContent: name }),
          El("div", { className: "text-xs text-gray-500", textContent: handle ? ("@" + handle) : "Connection request pending your response" })
        ]),
        El("div", { className: "flex flex-wrap items-center gap-2" }, [
          El("button", {
            type: "button",
            className: "px-3 py-2 rounded-xl tsts-btn-primary text-xs font-bold transition",
            "data-action": "connection-request-action",
            "data-request-id": requestId,
            "data-request-status": "accept",
            textContent: "Accept"
          }),
          El("button", {
            type: "button",
            className: "px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 transition",
            "data-action": "connection-request-action",
            "data-request-id": requestId,
            "data-request-status": "reject",
            textContent: "Reject"
          }),
          El("a", {
            href: profileUrl,
            className: "px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition",
            textContent: "View Profile"
          })
        ])
      ])
    );
  });

  section.appendChild(
    El("div", { className: "text-xs text-gray-500" }, [
      El("a", { href: "connections.html", className: "text-orange-600 hover:underline", textContent: "Open full Connections page" })
    ])
  );
  return section;
}

// Owner 2026-08-02 (sir, chat governance): either party reports the conversation → admin review queue.
// Shared by the host thread and the guest chat modal.
function __prReportConversation(requestId) {
  window.tstsPrompt("What happened? Our team reads every report and will review this conversation.", "", { confirmText: "Send report", placeholder: "e.g. I was asked to pay outside the platform", minLength: 5 }).then(function (reason) {
    if (!reason) return;
    window.authFetch("/api/private-booking-requests/" + encodeURIComponent(requestId) + "/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: String(reason) })
    }).then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); }).then(function (r) {
      if (r.ok && r.d && r.d.ok) { if (window.tstsNotify) window.tstsNotify("Thanks for telling us. Our team will review this conversation.", "success"); }
      else { if (window.tstsNotify) window.tstsNotify((r.d && r.d.message) || "Couldn't send the report. Please try again.", "error"); }
    }).catch(function () { if (window.tstsNotify) window.tstsNotify("Couldn't send the report. Please try again.", "error"); });
  });
}

async function updateHostPrivateBookingRequestStatus(requestId, status) {
  const id = String(requestId || "").trim();
  const next = String(status || "").trim().toLowerCase();
  if (!id) throw new Error("Request id missing.");
  // Auth-hold flow: approve | decline only (matches the backend allow-list; legacy contacted/closed retired).
  const allowed = { approved: true, declined: true };
  if (!allowed[next]) throw new Error("Invalid status.");
  const res = await window.authFetch("/api/host/private-booking-requests/" + encodeURIComponent(id) + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "Could not update private request."));
  }
}

// "HH:MM-HH:MM" → "5:00 PM – 8:00 PM" (matches the success page; falls back to the raw
// string if it isn't a recognisable range). 12-hour, brand-consistent time for the host row.
function __formatPrivateRequestTimeRange12h(raw) {
  const s = String(raw || "").trim();
  const m = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  function to12(h, mm) {
    // A sitting that ends at 24:00 ends at midnight. Without this it printed "12:00 PM", noon,
    // which is twelve hours wrong on the host's screen.
    const raw = Number(h);
    const hh = raw >= 24 ? (raw - 24) : raw;
    const period = hh >= 12 ? "PM" : "AM";
    let h12 = hh % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + mm + " " + period;
  }
  return to12(m[1], m[2]) + " – " + to12(m[3], m[4]);
}

// Local "today" as YYYY-MM-DD (for native <input type="date" min>). Uses the browser's
// local date so the host can't propose a past day in their own timezone.
function __todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// sir 2026-08-07: an offered time was compared as text, so 4:00 PM - 7:00 PM looked brand new on
// a day already holding 5:00 PM - 8:00 PM. Times are compared as minutes here, so the host sees
// the clash on screen instead of meeting it after the guest has accepted.
function __slotMins(raw) {
  const m = /(\d{1,2}):(\d{2})\s*[-\u2013]\s*(\d{1,2}):(\d{2})/.exec(String(raw || ""));
  if (!m) return null;
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return (b > a) ? { start: a, end: b } : null;
}
function __slotsClash(rawA, rawB) {
  const a = __slotMins(rawA), b = __slotMins(rawB);
  if (!a || !b) return String(rawA || "") === String(rawB || "");
  return a.start < b.end && b.start < a.end;
}

var __offerCalCache = {};
async function __offerCalendarFor(experienceId, fromIso, toIso) {
  const key = String(experienceId) + "|" + fromIso + "|" + toIso;
  if (Object.prototype.hasOwnProperty.call(__offerCalCache, key)) return __offerCalCache[key];
  let data = null;
  try {
    const res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(String(experienceId)) +
      "/offer-calendar?from=" + encodeURIComponent(fromIso) + "&to=" + encodeURIComponent(toIso));
    const raw = await res.json().catch(function () { return null; });
    if (res.ok && raw && raw.data) data = raw.data;
  } catch (_calErr) { data = null; }
  __offerCalCache[key] = data;
  return data;
}

function __isoPlusDays(iso, n) {
  const d = new Date(String(iso) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

// sir 2026-08-07, after rejecting my full-width month: "why do you ant to put whole mohter on
// full screens like an ---- when nobody in while universe use it?" He was right twice over.
// No product puts a month inside a form, and this site already had the control: window.tstsDatePicker,
// the Flatpickr wrapper sir approved 2026-05-30 and ordered onto every date input (explore,
// experience, host, check-in, admin). I hand-built a bespoke month instead of using it.
//
// And on the hours: I had generated every half hour from 06:00 to 23:00 and called them free.
// sir: "you want host to set time in middle of night?" The offerable hours now stay inside the
// part of day this experience actually runs, a band around its own sitting, same length, so the
// price the guest is holding stays exact and a dinner never becomes a 6 AM breakfast.
// sir 2026-08-07, verbatim: "drop whol create a new slot all togheter where there is no slot --
// just only where slot are availbe to pick for available listing".
//
function __buildHostProposeForm(requestId, originalTime, El, experienceId, askedDate) {
  const today = __todayIsoLocal();
  const lastIso = __isoPlusDays(today, 91);
  const form = El("div", {
    className: "hidden mt-1 rounded-xl border border-orange-100 bg-white p-3 space-y-3",
    id: "host-propose-form-" + requestId,
    "data-original-time": String(originalTime || ""),
    "data-experience-id": String(experienceId || "")
  });

  let calData = null;
  const byDate = {};

  form.appendChild(El("p", { className: "text-xs text-gray-600", textContent: "Offer a slot that suits you. You can add up to three." }));

  const rowsWrap = El("div", { className: "space-y-3" });
  form.appendChild(rowsWrap);

  // sir 2026-08-07, approving the structure: "one row and add another". Three rows always on
  // screen meant two were permanently empty, and every empty-state problem I kept patching —
  // blank disabled dropdowns, dead clear buttons, the instruction repeated three times — came
  // from that. The common case is a host offering one date; the rest is revealed on request.
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const dateInput = El("input", {
      type: "text",
      placeholder: "Pick a date",
      readOnly: true,
      className: "flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white cursor-pointer focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none",
      "data-propose-date": "1"
    });
    const timeSelect = El("select", {
      className: "w-full pl-10 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none",
      "data-propose-time": "1"
    });
    const clockSvg = (function () {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", "absolute left-3 top-3 z-10 text-gray-400 pointer-events-none");
      svg.style.width = "16px"; svg.style.height = "16px";
      var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12"); c.setAttribute("cy", "12"); c.setAttribute("r", "9");
      var h = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      h.setAttribute("points", "12 7 12 12 16 14");
      svg.appendChild(c); svg.appendChild(h);
      return svg;
    })();
    const timeWrap = El("div", { className: "relative flex-1 min-w-0" }, [clockSvg, timeSelect]);
    // sir 2026-08-07, in his words: on picking a date the control shows "all availble existing
    // slot of same furation as drop down to pick one slot", and a host may still want a new one
    // even when sittings exist, whose start times are "only those start time whihc will never
    // conflict with blocked period". So it is ONE dropdown with two groups: the sittings that are
    // free on that day, then every start time that could become a new one. Anything that would
    // conflict is never offered, so there is nothing to type and nothing to be corrected about.
    const note = El("p", { className: "hidden mt-1.5 text-xs rounded-lg px-2.5 py-2", "data-propose-note": "1" });
    // sir 2026-08-07: "why dont i see calender emoji or icon to pick a date and time?" There was
    // none. The field was a bare text box with a placeholder and nothing to say it opened
    // anything, while explore.html:198 — a page sir has already approved and frozen — puts a
    // greyed, click-through calendar glyph inside its own date field. Matching that, so this
    // control is not visibly cheaper than its counterpart elsewhere on the site.
    // sir 2026-08-07: "the icon for clander is gone and you never put icon for time".
    // He was right and my measurement was worthless: getBoundingClientRect proves an element has
    // a SIZE, not that it can be SEEN. elementFromPoint at the icon's own centre returned the
    // INPUT — Flatpickr's alt-input paints over it. z-10 puts the icon above the field it labels.
    const dateWrap = El("div", { className: "relative flex-1 min-w-0" }, [
      // A real vector, not the icon font. `fa-calendar` maps to the 📅 emoji in icon-font.css,
      // which renders as a colour smudge beside the crisp × on the same row — visibly cheaper than
      // the control next to it, which sir's page-review rule says to fix rather than skip. Scoped
      // here on purpose: changing icon-font.css would touch every frozen page on the site.
      (function () {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "absolute left-3 top-3 z-10 text-gray-400 pointer-events-none");
        svg.style.width = "16px";
        svg.style.height = "16px";
        [["rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }],
         ["line", { x1: "3", y1: "10", x2: "21", y2: "10" }],
         ["line", { x1: "8", y1: "3", x2: "8", y2: "7" }],
         ["line", { x1: "16", y1: "3", x2: "16", y2: "7" }]].forEach(function (pair) {
          var el = document.createElementNS("http://www.w3.org/2000/svg", pair[0]);
          Object.keys(pair[1]).forEach(function (k) { el.setAttribute(k, pair[1][k]); });
          svg.appendChild(el);
        });
        return svg;
      })(),
      dateInput
    ]);
    dateInput.className = "w-full pl-10 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white cursor-pointer focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none";
    // sir 2026-08-07: "show me how a host can cler the duplicate date or slot selection without
    // cicking cancel and doing all slot sleection again?" They could not. The date field is
    // read-only so the text cannot be deleted, the picker has no clear affordance, the time list
    // holds only real slots, and Cancel now wipes all three rows. My own warning told the host to
    // "clear this row" when no such thing existed. It exists now, per row, and only when that row
    // holds something.
    // sir 2026-08-07: "There must be a Clear button --- ---- Clear written on it in same row".
    // A bare x is an icon a host has to interpret; the word says what it does.
    const clearBtn = El("button", {
      type: "button",
      className: "shrink-0 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold transition"
    }, ["Clear"]);
    // sir: "when did i ask to place add anoter slot in next row? it must be in same row as date
    // and time." It sits at the end of the row, not stacked beneath it.
    const addBtn = El("button", {
      type: "button",
      className: "shrink-0 px-3 py-2 rounded-xl border border-orange-100 bg-orange-50 text-orange-700 text-xs font-bold transition"
    }, ["+ Add another slot"]);
    const row = El("div", {}, [
      // sir made me look at this zoomed in: the x was hanging off the right edge of the form, not
      // "lined up down the right edge" as I had claimed from its measured size. A button's
      // dimensions say nothing about whether the row has room for it. min-w-0 on the wrappers lets
      // the two fields yield so the clear control sits inside the container.
      El("div", { className: "flex items-center gap-2 w-full" }, [dateWrap, timeWrap, clearBtn]),
      note
    ]);
    if (i > 0) row.className = "hidden";
    rowsWrap.appendChild(row);
    rows.push({ dateInput: dateInput, timeSelect: timeSelect, note: note, clearBtn: clearBtn, addBtn: addBtn, row: row, iso: "" });
  }

  function show(el, on) {
    if (on) el.className = el.className.replace(/(^|\s)hidden(\s|$)/, " ").trim();
    else if (el.className.indexOf("hidden") < 0) el.className = "hidden " + el.className;
  }

  function fmtHHMM(min) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  }

  function paintRow(r) {
    const iso = String(r.iso || "");
    r.timeSelect.textContent = "";
    r.__candidate = "";
    try { refreshRowControls(); } catch (_rfErr) { void _rfErr; }
    if (!iso) { show(r.note, false); r.timeSelect.disabled = true; return; }

    const day = byDate[iso];
    const slots = (day && Array.isArray(day.slots)) ? day.slots : [];
    const dur = (function () { const m = __slotMins(String(originalTime || "")); return m ? (m.end - m.start) : 180; })();

    if (day && day.blocked) {
      r.timeSelect.appendChild(El("option", { value: "", textContent: "You have blocked this date" }));
      r.timeSelect.disabled = true;
      show(r.note, false);
      return;
    }

    // Group one: the sittings this day already has, free, and the same length as the table the
    // guest is holding, because the price they have on hold was set for a table that long.
    const open = slots.filter(function (sl) {
      if (!sl || sl.taken) return false;
      const m = __slotMins(sl.time);
      return m && (m.end - m.start) === dur;
    });

    // Group two: every start time that could become a new sitting without touching anything
    // already on that day.
    // sir has caught the middle-of-the-night problem twice. A new sitting starts within the hours
    // a table is actually served, from 6 in the morning, and never runs past midnight.
    const fresh = [];
    for (let t0 = 6 * 60; t0 + dur <= 24 * 60; t0 += 30) {
      const cand = fmtHHMM(t0) + "-" + fmtHHMM(t0 + dur);
      if (slots.some(function (sl) { return __slotsClash(sl.time, cand); })) continue;
      if (open.some(function (sl) { return sl.time === cand; })) continue;
      fresh.push(cand);
    }

    r.timeSelect.disabled = false;
    if (open.length) {
      const g1 = El("optgroup", { label: "Free on this day" });
      open.forEach(function (sl) {
        g1.appendChild(El("option", { value: sl.time, textContent: __formatPrivateRequestTimeRange12h(sl.time) }));
      });
      r.timeSelect.appendChild(g1);
    }
    if (fresh.length) {
      const g2 = El("optgroup", { label: open.length ? "Or start a new sitting at" : "Start a new sitting at" });
      fresh.forEach(function (v) {
        g2.appendChild(El("option", { value: v, textContent: __formatPrivateRequestTimeRange12h(v) }));
      });
      r.timeSelect.appendChild(g2);
    }
    if (!open.length && !fresh.length) {
      r.timeSelect.appendChild(El("option", { value: "", textContent: "This day is full" }));
      r.timeSelect.disabled = true;
      show(r.note, false);
      return;
    }

    // The control opens on the hour the guest actually asked for whenever that hour is available,
    // whether it is an existing sitting or a new one. Falling back to the earliest of the day put
    // a dinner request on 6:00 AM.
    const wanted = String(originalTime || "");
    r.timeSelect.value = open.some(function (sl) { return sl.time === wanted; }) ? wanted
      : (fresh.indexOf(wanted) >= 0 ? wanted
        : (open.length ? open[0].time : fresh[0]));
    markRow(r);
  }

  // sir 2026-08-07: the form took the same slot in two rows without a word, then dropped one at
  // send and told the host "2 dates" afterwards. A host who fills three rows believes they are
  // offering three. Refused at the moment it is picked, so they are never shown an offer the
  // platform intends to quietly alter.
  function duplicateOf(r) {
    const mine = String(r.iso || "") + "|" + String(r.timeSelect ? r.timeSelect.value : "");
    if (mine === "|") return null;
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      if (o === r) continue;
      const theirs = String(o.iso || "") + "|" + String(o.timeSelect ? o.timeSelect.value : "");
      if (theirs !== "|" && theirs === mine) return o;
    }
    return null;
  }

  // sir 2026-08-07: "i can pick same slot (combincation of date and time) as original, why?"
  // Because nothing stopped it. The guest asked for this date and time; offering it back is not
  // an alternative, it is the request restated. Refused where it is picked.
  function isTheGuestsOwnSlot(r) {
    const asked = String(askedDate || "");
    const askedTime = String(originalTime || "");
    if (!asked || !askedTime) return false;
    return String(r.iso || "") === asked && String(r.timeSelect ? r.timeSelect.value : "") === askedTime;
  }

  function markRow(r) {
    // sir 2026-08-07 asked why a host is told "This sitting does not exist yet ... never listed
    // publicly ... disappears if they say no". There was no good answer: the group label already
    // says the sitting is new, the publishing detail is the platform's internals on a host's
    // screen, and the rest is a rule the host cannot act on at that moment. The line is gone.
    r.__candidate = String(r.timeSelect.value || "");
    if (isTheGuestsOwnSlot(r)) {
      r.note.className = "mt-1.5 text-xs rounded-lg px-2.5 py-2 text-amber-800 bg-amber-50 border border-amber-200";
      r.note.textContent = "This is the slot your guest already asked for. Offer a different date or time, or accept their request instead.";
      show(r.note, true);
      r.__candidate = "";
      return;
    }
    if (duplicateOf(r)) {
      r.note.className = "mt-1.5 text-xs rounded-lg px-2.5 py-2 text-amber-800 bg-amber-50 border border-amber-200";
      r.note.textContent = "You have already chosen this slot above. Pick a different one, or clear this row.";
      show(r.note, true);
      r.__candidate = "";
      return;
    }
    show(r.note, false);
    // A row that has just stopped being a duplicate must clear its own warning.
    rows.forEach(function (o) { if (o !== r && o.iso && !duplicateOf(o) && o.note && o.note.className.indexOf("hidden") < 0) { o.__candidate = String(o.timeSelect.value || ""); show(o.note, false); } });
  }

  // sir 2026-08-07: "Send these slots" is plural over a form holding one. The label follows what
  // the host has actually filled in.
  const sendBtn = El("button", {
    type: "button",
    className: "px-3 py-2 rounded-xl tsts-btn-primary text-xs font-bold transition",
    "data-action": "host-propose-submit",
    "data-request-id": requestId
  }, ["Send this slot"]);
  // sir 2026-08-07: "Pick a date first" vanished three times, each after a different change,
  // because the empty state was written in three separate code paths and every new path forgot
  // it. One definition now; every path calls this.
  function setTimeControlEmpty(r) {
    r.timeSelect.textContent = "";
    // WORLD_CLASS_VISION.md: "Empty + Error States — Never a dead end. Always warm, always
    // pointing somewhere useful." "Pick a date first" is an instruction pointing at a field.
    // This says what happens next and why the control is waiting.
    r.timeSelect.appendChild(El("option", { value: "", textContent: "Choose a date to see your free sittings" }));
    r.timeSelect.disabled = true;
    r.__candidate = "";
  }

  function refreshSendLabel() {
    const n = rows.filter(function (r) { return r.iso && r.row && r.row.className.indexOf("hidden") < 0; }).length;
    sendBtn.textContent = n > 1 ? ("Send these " + n + " slots") : "Send this slot";
  }

  // Only the last visible row offers "add another", and only while a row is left to reveal.
  function refreshRowControls() {
    const visible = rows.filter(function (r) { return r.row.className.indexOf("hidden") < 0; });
    const lastVisible = visible[visible.length - 1];
    const anyHidden = rows.some(function (r) { return r.row.className.indexOf("hidden") >= 0; });
    rows.forEach(function (r) {
      const isLast = (r === lastVisible);
      r.addBtn.style.display = "none";
      // sir 2026-08-07: "which part of my order was not clear when i said to add clear button in
      // each row? do yo u think iit is only needed when there is date? when. idid i sait that."
      // I invented that condition. Clear is in every row, always, live.
      r.clearBtn.style.visibility = "visible";
      r.clearBtn.disabled = false;
    });
    if (form.__addSlotBtn) form.__addSlotBtn.style.display = anyHidden ? "" : "none";
    refreshSendLabel();
  }

  // sir 2026-08-07: "Put Add another slot back in same row as Send this slot on left side -- left".
  const addSlotBtn = El("button", {
    type: "button",
    className: "px-3 py-2 rounded-xl border border-orange-100 bg-orange-50 text-orange-700 text-xs font-bold transition"
  }, ["+ Add another slot"]);
  addSlotBtn.addEventListener("click", function () {
    const next = rows.find(function (o) { return o.row.className.indexOf("hidden") >= 0; });
    if (!next) return;
    next.row.className = "";
    refreshRowControls();
  });
  form.__addSlotBtn = addSlotBtn;

  form.appendChild(El("div", { className: "flex items-center gap-2" }, [
    addSlotBtn,
    sendBtn,
    El("button", { type: "button", className: "px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition",
      "data-action": "host-propose-toggle", "data-request-id": requestId, textContent: "Cancel" })
  ]));

  form.__offerRows = rows;
  form.__refreshRowControls = refreshRowControls;
  form.__setTimeEmpty = setTimeControlEmpty;

  __offerCalendarFor(String(experienceId || ""), today, lastIso).then(function (data) {
    calData = data;
    const list = (data && Array.isArray(data.days)) ? data.days : [];
    list.forEach(function (row) { byDate[String(row.date)] = row; });
    rows.forEach(function (r) {
      // The site's own date control, same one Explore and the experience page use.
      if (window.tstsDatePicker) {
        const fp = window.tstsDatePicker(r.dateInput, {
          minDate: today,
          maxDate: lastIso,
          defaultDate: null,
          // sir 2026-08-07, on seeing the picker photographed for the first time: it opened
          // UPWARD and covered the guest's own Date and Time — hiding the request the host is
          // answering while they choose its replacement. Pinning it "below" then pushed the
          // calendar off the bottom of the view, cut by the cookie bar: one problem traded for
          // another, and again only the screenshot showed it.
          //
          // `static` renders the calendar INLINE in the form's own flow, so it pushes the rows
          // down instead of floating over anything. It can never cover the request and can never
          // overflow the viewport. This is the same answer sir's approval log already records for
          // explore.html's filter drawer, where absolute positioning broke inside a transform.
          static: true,
          // The days this experience normally runs are marked, so a host can tell at a glance
          // which dates are their usual sittings and which would be a brand new one. Every date
          // stays selectable, because sir's rule allows offering a day the listing does not run.
          onDayCreate: function (sel, str, inst, dayElem) {
            try {
              const d = dayElem.dateObj;
              const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
              const row = byDate[iso];
              // sir 2026-08-07: "the calnder does not grey out date where there is no free slot or
              // grren the date where there is one or more slots are available". Now it does both.
              if (row && row.blocked) {
                dayElem.style.opacity = "0.3";
                dayElem.style.textDecoration = "line-through";
                dayElem.title = "You have blocked this date";
                return;
              }
              const slots = (row && Array.isArray(row.slots)) ? row.slots : [];
              const free = slots.filter(function (sl) { return !sl.taken; });
              if (free.length) {
                dayElem.style.backgroundColor = "rgb(220 252 231)";
                dayElem.style.color = "rgb(21 128 61)";
                dayElem.style.fontWeight = "700";
                dayElem.title = free.length === 1
                  ? ("You have one sitting free on this day")
                  : ("You have " + free.length + " sittings free on this day");
              } else if (slots.length) {
                dayElem.style.opacity = "0.4";
                dayElem.title = "Your sitting on this day is already taken";
              } else {
                dayElem.style.opacity = "0.55";
                dayElem.title = "You do not run this experience on this day";
              }
            } catch (_dcErr) { void _dcErr; }
          },
          altInputClass: r.dateInput.className + " cursor-pointer",
          onChange: function (sel, dateStr) { r.iso = String(dateStr || ""); paintRow(r); }
        });
        // The field opened showing today's date although nobody had picked it, which reads as a
        // choice the host never made. Cleared so it stays empty until they choose.
        try { if (fp && typeof fp.clear === "function") fp.clear(); } catch (_clr) { void _clr; }
        // `static: true` makes Flatpickr wrap the input in its own .flatpickr-wrapper, which is
        // display:inline-block by default. Inside a flex row that collapses the field to its
        // content width and leaves the rows beneath it with no date field at all — visible only
        // in the screenshot, not in any DOM read. The wrapper has to fill the row like the input
        // it replaced.
        try {
          const wrap = r.dateInput.closest ? r.dateInput.closest(".flatpickr-wrapper") : null;
          if (wrap) { wrap.style.display = "block"; wrap.style.width = "100%"; }
        } catch (_wErr) { void _wErr; }
      }
      
      setTimeControlEmpty(r);
      r.timeSelect.addEventListener("change", function () { markRow(r); });
      r.addBtn.addEventListener("click", function () {
        const next = rows.find(function (o) { return o.row.className.indexOf("hidden") >= 0; });
        if (!next) return;
        next.row.className = "";
        refreshRowControls();
      });
      r.clearBtn.addEventListener("click", function () {
        try {
          if (r.dateInput._flatpickr && typeof r.dateInput._flatpickr.clear === "function") r.dateInput._flatpickr.clear();
          else r.dateInput.value = "";
        } catch (_cErr) { void _cErr; }
        r.iso = "";
        r.__candidate = "";
        setTimeControlEmpty(r);
        show(r.note, false);
        refreshRowControls();
        // A row that was only warning because of THIS row must stop warning now.
        rows.forEach(function (o) { if (o !== r && o.iso) markRow(o); });
      });
    });
  });

  return form;
}

// Owner 2026-08-02 (sir: "there can be 100 such requests — group it by experience or date or something").
// The host's pending requests render as a QUEUE: one group per experience (thumb + serif title + count),
// compact decision rows inside (guest · date/time · party · amount · countdown · Accept/Decline), and
// each row expands in place to the guest's note + the proven chat thread. Groups order by
// soonest-expiring request; rows by event date. Locked design vocabulary only.
var __hostQueueExpandedIds = {};
function __renderHostRequestsQueue(rows, El, opts) {
  var __qOpts = opts || {};
  var groupsByExp = {};
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    var k = String((r && r.experienceId) || "other");
    (groupsByExp[k] = groupsByExp[k] || []).push(r);
  });
  var groups = Object.keys(groupsByExp).map(function (k) {
    var list = groupsByExp[k];
    var minExpiry = Infinity;
    list.forEach(function (r) {
      var t = (r && r.expiresAt) ? new Date(r.expiresAt).getTime() : Infinity;
      if (t < minExpiry) minExpiry = t;
    });
    return { list: list, minExpiry: minExpiry, title: String((list[0] && list[0].experienceTitle) || "Experience"), image: String((list[0] && list[0].experienceImage) || "") };
  }).sort(function (a, b) { return a.minExpiry - b.minExpiry; });

  var wrap = El("div", { className: "space-y-4" });
  groups.forEach(function (g) {
    // sir's E4 finding [2026-08-07]: date-sorted rows buried the request dying in 5 hours under
    // one with 39 hours of slack — the countdown is the money clock (expiry releases the hold),
    // so rows sort by SOONEST EXPIRY first, matching the groups' own most-urgent-first order.
    g.list.sort(function (a, b) {
      var ta = (a && a.expiresAt) ? new Date(a.expiresAt).getTime() : Infinity;
      var tb = (b && b.expiresAt) ? new Date(b.expiresAt).getTime() : Infinity;
      return ta - tb;
    });
    // Owner 2026-08-02 (self-audit): two guests can want the SAME table on the SAME date/time —
    // accepting one auto-releases the rest. The host must SEE that collision before deciding.
    var slotCounts = {};
    g.list.forEach(function (r) {
      var k = String((r && r.preferredDate) || "") + "|" + String((r && r.preferredTime) || "");
      slotCounts[k] = (slotCounts[k] || 0) + 1;
    });
    g.list.forEach(function (r) {
      var k = String((r && r.preferredDate) || "") + "|" + String((r && r.preferredTime) || "");
      r.__competingCount = slotCounts[k] - 1;
    });
    var box = El("div", { className: "bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" });
    var thumb;
    if (g.image) {
      thumb = El("img", { alt: g.title, className: "h-10 w-10 rounded-xl object-cover shrink-0" });
      try { window.tstsSafeImg(thumb, g.image, ""); } catch (_iErr) { void _iErr; }
    } else {
      thumb = El("div", { className: "h-10 w-10 rounded-xl bg-tsts-cream shrink-0" });
    }
    // Closed requests ask nothing of the host, so their tag wears neutral grey — the orange tag is
    // this platform's attention colour and must not sit above rows that need no answer.
    var __tagCls = __qOpts.closedSection
      ? "shrink-0 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500 text-xs font-bold"
      : "shrink-0 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 text-orange-700 text-xs font-bold";
    // sir's phone orders: the tag drops BELOW the heading and left-aligns with it; the heading may run
    // to two rows instead of dying at "Morning C…"; the photo stays in the FIRST row rather than
    // hanging beside a two-line block. The title and the tag therefore live in one column that the
    // shaper lays out as a row on a wide card and a stack on a phone — the photo is the header's own
    // first child either way, pinned to the top so it never floats against a taller text block.
    var __gTitle = El("h3", { className: "heading-serif text-lg font-bold text-tsts-ink min-w-0", textContent: g.title });
    // The title and the tag share ONE column beside the photo. Wrap-based tricks kept failing: a
    // full-basis tag overflowed the card, and clamping its width let it sit back beside the title and
    // squeeze the heading to one word per line. A column cannot do either — the photo owns row one on
    // its own, the title fills the column beside it, and the tag simply comes next in that column, at
    // the title's exact left edge because they are siblings in it.
    // Stale-stylesheet guard 2026-08-10: "tsts-gr-headcol" was a label I attached while
    // building this column that no stylesheet ever defined and no script ever queried —
    // a dead token dressed as styling. The layout is fully carried by min-w-0 flex-1.
    var __gTextCol = El("div", { className: "min-w-0 flex-1" }, [__gTitle,
      // sir's order 2026-08-07, verbatim: "put 1 of 2 request expiring soon in the card". The tag had
      // read "N expiring", which counted every row in the card and called them all expiring — a lie
      // whenever a guest sits alongside only because they want the same date and time, and a word that
      // says nothing anyway since every request expires eventually. The tag now separates the two
      // numbers: how many are genuinely running out, out of how many are in this card.
      El("span", { className: __tagCls, textContent: (function () {
        var n = g.list.length;
        if (__qOpts.closedSection) {
          // One word when the whole card ended the same way; the words joined when it did not — never
          // a count, and never one reason standing in for another.
          var seen = [];
          g.list.forEach(function (r) { var w = __grClosedReason(r); if (seen.indexOf(w) < 0) seen.push(w); });
          return seen.join(" · ");
        }
        if (__qOpts.waitingSection) return n + " with the guest";
        if (__qOpts.urgentSection) {
          var soon = 0;
          g.list.forEach(function (r) {
            var d = __grDeadline(r);
            var ms = d ? (new Date(d).getTime() - Date.now()) : Infinity;
            if (ms > 0 && ms <= __GR_URGENT_MS) soon += 1;
          });
          if (soon >= n) return n === 1 ? "1 request expiring soon" : n + " requests expiring soon";
          return soon + " of " + n + " requests expiring soon";
        }
        return n + " waiting";
      })() })
    ]);
    box.appendChild(El("div", { className: "flex gap-3 px-4 py-3 border-b border-gray-100 tsts-gr-cardhead" }, [thumb, __gTextCol]));
    var rowsWrap = El("div", { className: "divide-y divide-gray-100" });
    g.list.forEach(function (r) { rowsWrap.appendChild(__renderHostRequestQueueRow(r, El, __qOpts)); });
    box.appendChild(rowsWrap);
    wrap.appendChild(box);
    // The header has no width until it is in the document, so it is shaped on the next frame — the
    // same treatment the facts bar and the offer heading get.
    try {
      var __ch = box.querySelector(".tsts-gr-cardhead");
      if (__ch) requestAnimationFrame(function () { try { __grShapeCardHead(__ch); } catch (_c1) { void _c1; } });
    } catch (_c2) { void _c2; }
  });
  return wrap;
}

// sir 2026-08-07: before a host says yes to a whole table, they should know who they are saying yes
// to — has this guest sat at their table before, was it the whole table or one seat, and did they
// turn up. Reads as an aligned record (one line per booking), not prose. Backend supplies it on the
// list route; absent data simply means the block does not render.
// sir's order 2026-08-07: history IS shown, and sir required the PURPOSE stated before it was built.
// PURPOSE — RECOGNITION, NOT RISK. The host is deciding whether to give a stranger their whole table.
// This line answers "do I know this person?", so the host replies as a host rather than a gatekeeper:
//   · it tells them whether to welcome someone back or to introduce themselves and send joining details;
//   · it lowers the cost of saying yes, because a guest who has sat at their table is a known quantity;
//   · it lets them greet the guest about what they came to last time.
// DELIBERATELY ABSENT, each on sir's ruling: cancellations (the guest used a policy sir wrote — holding
// it against them punishes a right sir granted); no-shows (a permanent mark passed between hosts with no
// process behind it); amounts (the host knows their own prices); and the list of past bookings — sir:
// "why should i show list of 10 events t ofloor the window?" — ten rows the host cannot act on, which
// buried the note, the offer control and the chat below the fold.
// English ordinals, all of them. The panel and the row both print "their Nth booking", and a
// hand-rolled "2nd/3rd/else th" is right for exactly two numbers — it printed "21th", "22th" and
// "101th" for the guests who come back most, which is precisely the guest the host most wants to
// recognise. 11/12/13 are the exceptions that break the naive last-digit rule, hence the %100 check.
function __grOrdinal(n) {
  var v = Math.max(0, Math.floor(Number(n) || 0));
  var rem100 = v % 100;
  if (rem100 >= 11 && rem100 <= 13) return v + "th";
  var rem10 = v % 10;
  if (rem10 === 1) return v + "st";
  if (rem10 === 2) return v + "nd";
  if (rem10 === 3) return v + "rd";
  return v + "th";
}
try { window.__grOrdinal = __grOrdinal; } catch (_ordErr) { void _ordErr; }

function __hostGuestHistoryBlock(row, El) {
  var wrap = El("div", {});
  wrap.appendChild(El("p", {
    className: "heading-serif text-base font-semibold text-tsts-ink mb-1",
    textContent: "Their history with you"
  }));
  var count = Math.max(0, Math.floor(Number(row && row.requesterBookingCount) || 0));
  var last = (row && row.requesterLastVisit) || null;
  var hasVisit = !!(last && last.date);
  // A negative or nonsense count would otherwise print "their -3th booking"; and a guest who has
  // demonstrably sat here before is never called a first-timer, whatever the count says.
  if (!count && !hasVisit) {
    // A first-timer is the case that most needs saying: it tells the host to give the fuller welcome.
    wrap.appendChild(El("p", { className: "text-sm text-gray-700", textContent: "This is their first booking with you." }));
    return wrap;
  }
  var parts = ["Their " + __grOrdinal(Math.max(count, hasVisit ? 1 : 0) + 1) + " booking with you"];
  // The most recent visit, named the way a host would remember it — a date and what they came to.
  // The API sends exactly this and nothing else now; the panel no longer sifts a ten-record list for it.
  if (hasVisit) {
    var when = String(last.date || "");
    try { if (window.tstsFormatDateShort) when = String(window.tstsFormatDateShort(last.date) || when); } catch (_lw) { void _lw; }
    var title = String(last.experienceTitle || "").trim();
    parts.push(title ? ("last sat at your table on " + when + ", for " + title) : ("last sat at your table on " + when));
  }
  wrap.appendChild(El("p", { className: "text-sm text-gray-700", textContent: parts.join(" · ") }));
  return wrap;
}

// sir's order: in Missed & declined the card carries "only reason of what happend like Expired or
// declined or missed thats's it", where every other section carries its count pill. Four things land
// in that section and each has its own honest word:
//   declined                      → the host turned them away          → "Declined"
//   expired                       → the clock ran out on the request   → "Expired"
//   awaiting_host past its expiry → the host never answered at all     → "Missed"
//   invalidated                   → the date went to another booking   → "No longer available"
// "Missed" and "Expired" are not the same thing and must not be collapsed: one is the host's silence,
// the other is a clock the host could not have beaten. And a released rival is NEITHER (sir's ruling
// 2026-08-17): nothing expired on it — its clock had a day left when the host accepted the other
// request — so it wears the words the guest's own pill, email and notification already use for this
// exact state. One event, one vocabulary on both sides.
function __grClosedReason(r) {
  var st = String((r && r.status) || "").toLowerCase();
  if (st === "declined") return "Declined";
  if (st === "awaiting_host") return "Missed";
  if (st === "invalidated") return "No longer available";
  return "Expired";
}

function __renderHostRequestQueueRow(row, El, opts) {
  var __rOpts = opts || {};
  var requestId = String((row && row._id) || "");
  var requesterName = String((row && row.requesterName) || "Guest");
  // sir's design 2026-08-07, verbatim: "in case the name is such that only take first name in full and
  // last name Initial (only 2 words -- gues must have only first and last name every where )".
  // The collapsed row shows FIRST + LAST, and where even that will not fit, FIRST + surname initial.
  // A name is therefore never cut mid-word into nonsense — sir's own test string rendered as
  // "Claude is moth…", which tells a host nothing. Expanding the row restores the name in full.
  var __grShortName = (function () {
    var parts = requesterName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return requesterName.trim();
    var first = parts[0];
    var last = parts[parts.length - 1];
    var two = first + " " + last;
    // Counting characters was wrong: "Overnight Guest" is fifteen characters and still overran the
    // 126px column, because letter widths differ. The text is MEASURED against the track instead — the
    // column stays a constant either way, only the decision to shorten depends on the text.
    return __grTextFitsName(two) ? two : (first + " " + last.charAt(0).toUpperCase() + ".");
  })();
  var status = String((row && row.status) || "").toLowerCase();
  var isLive = status === "awaiting_host";
  var dateText = String((row && row.preferredDate) || "Date TBA");
  try { if (row && row.preferredDate && window.tstsFormatDateShort) dateText = String(window.tstsFormatDateShort(row.preferredDate) || dateText); } catch (_dErr) { void _dErr; }
  var timeText = (row && row.preferredTime) ? __formatPrivateRequestTimeRange12h(String(row.preferredTime)) : "Time TBA";
  var __gN = Number.isFinite(Number(row && row.guests)) ? Math.max(1, Number(row.guests)) : null;
  // "1 guests" read as broken English on any single-guest request.
  var guestText = (__gN === null) ? "Guests not set" : (__gN + (__gN === 1 ? " guest" : " guests"));
  var moneyText = Number(row && row.amountCents) > 0 ? centsToMoney(Number(row.amountCents), String((row && row.currency) || "aud")) : "";
  var pill = __privateRequestStatusPill(row);
  var counterUntilMs = (row && row.counterEligibleUntil) ? new Date(row.counterEligibleUntil).getTime() : 0;
  if (status === "invalidated" && counterUntilMs > Date.now()) {
    var ch = __privateRequestHoursLeft(row && row.counterEligibleUntil);
    pill = { label: (ch && ch > 0) ? ("Seat booked · offer a time · " + ch + "h left") : "Seat booked · offer a time", pillClass: "bg-orange-100 text-orange-700" };
  }

  // sir's spec [2026-08-07]: every live request carries a ticking HH:MM:SS clock, not a rounded hour.
  // The clock also carries which section it belongs to, so the ticker knows when a row must move.
  // Closed rows have no clock — nothing is running. Everything else does, including the ones waiting
  // on a guest: sir 2026-08-07, "why cant i see the time there". Their clock is offerExpiresAt — the
  // same 48-hour window that expires an offer AND an abandoned checkout (server.js ~36234).
  var __cd = (!__rOpts.closedSection) ? __grCountdown(__grDeadline(row)) : null;
  var __cdPrefix = (status === "invalidated" && counterUntilMs > Date.now()) ? "Offer a time · " : "";
  if (__cd && __cd.expired) { isLive = false; }
  // On the Waiting-for-guest tab the pill must name WHO the host is waiting on and what for — the
  // shared pill says "New dates offered" for both states, which tells a host nothing about whether
  // the guest still has to choose or is already paying.
  if (__rOpts.waitingSection) {
    if (status === "alternative_offered") {
      var __slots = Array.isArray(row && row.proposedSlots) ? row.proposedSlots.length : 0;
      var __oh = __privateRequestHoursLeft(row && row.offerExpiresAt);
      // The live clock carries the time; this label carries what the guest still has to do. Neutral
      // grey, not attention-orange — orange is this platform's "you must act" colour and nothing in
      // this section is waiting on the host.
      void __oh;
      // sir 2026-08-08: "it must be 2 slots ----". What the host offered is a SLOT — a date AND
      // a time together — and the guest picks one of them. Counting them as "dates" is wrong on
      // its face: two of these can share one date and differ only by sitting.
      __cdPrefix = (__slots ? (__slots + (__slots === 1 ? " slot · " : " slots · ")) : "Offered · ");
    } else if (status === "counter_accept_pending") {
      __cdPrefix = "Paying · ";
    }
  }
  // Closed rows say what happened and when — reviewedAt is stamped on every terminal state.
  if (__rOpts.closedSection) {
    var __when = "";
    // Same fallback as the panel: a request that ran out carries no reviewedAt until the sweep stamps
    // it, so the pill would read a bare "Ran out" with no date on precisely those rows.
    try {
      var __whenStamp = (row && row.reviewedAt) || (row && row.expiresAt) || "";
      if (__whenStamp && window.tstsFormatDateShort) __when = String(window.tstsFormatDateShort(__whenStamp) || "");
    } catch (_wErr) { void _wErr; }
    // sir's order: the reason alone. The date it happened lives in the record below, where a host who
    // wants it can open the row — it does not need to ride on the pill.
    void __when;
    pill = (status === "declined")
      ? { label: "Declined", pillClass: "bg-rose-100 text-rose-700" }
      : { label: __grClosedReason(row), pillClass: "bg-gray-100 text-gray-500" };
    isLive = false;
  }

  var rowEl = El("div", {});
  var expanded = !!__hostQueueExpandedIds[requestId];
  // Owner 2026-08-02 (sir): a BIG, unmissable +/− toggle — plus to expand, minus to collapse.
  // Owner 2026-08-08 (sir): drawn by the shared window.tstsPlusMinus, not typed as a character —
  // a glyph sits on a baseline and would not centre in this 36px box. Same size, same colour.
  var toggleGlyph = El("span", { className: "text-xl font-bold leading-none text-gray-600" }, [window.tstsPlusMinus(expanded)]);
  var expandBtn = El("button", { type: "button", className: "shrink-0 h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center", "aria-expanded": expanded ? "true" : "false", "aria-label": expanded ? "Hide request details" : "Show request details" }, [toggleGlyph]);

  // Guest avatar — real profile photo, or an initial circle when the guest has none.
  var avatar;
  var requesterPic = String((row && row.requesterPic) || "");
  if (requesterPic) {
    avatar = El("img", { alt: requesterName, className: "h-8 w-8 rounded-full object-cover shrink-0" });
    try { window.tstsSafeImg(avatar, requesterPic, ""); } catch (_aErr) { void _aErr; }
  } else {
    avatar = El("div", { className: "h-8 w-8 rounded-full bg-tsts-cream text-tsts-ink text-xs font-bold flex items-center justify-center shrink-0", textContent: (requesterName.trim().charAt(0) || "G").toUpperCase() });
  }

  // Controlled wrap: identity+facts+money lead; the action cluster (pill, Accept, Decline, chevron)
  // wraps as ONE right-aligned unit on narrow windows — never a different break point per row.
  // sir 2026-08-07, said twice: the clock sat shorter than Accept/Decline, and the money column ran
  // ragged — measured at four different x positions down one page (622, 625, 652, 697). EVERY state
  // pill on this tab now shares one height AND one width, so the buttons sit level with it and the
  // money above it lands on a straight line.
  var __isClock = !!(__cd && !__cd.expired);
  // Rows waiting on a GUEST keep their clock but wear neutral grey: amber and red are this platform's
  // "you must act" colours, and there is nothing here for the host to act on.
  var __pillTone = __isClock
    ? (__rOpts.waitingSection ? "bg-gray-100 text-gray-600"
      : (__cd.urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"))
    : pill.pillClass;
  var __pillEl = El("span", {
    className: "shrink-0 px-3 py-2 text-sm font-bold rounded-full leading-none text-center " + __pillTone,
    textContent: __isClock ? (__cdPrefix + __cd.text) : pill.label
  });
  try {
    // sir asked ONE thing here — why the clock sat shorter than Accept and Decline. Measured, the
    // buttons render 36px, so the pill is pinned to 36px. Nothing else about it is changed: no fixed
    // width, no reserved space — those were mine, unasked for, and are gone.
    __pillEl.style.height = "36px";
    __pillEl.style.display = "inline-flex";
    __pillEl.style.alignItems = "center";
    __pillEl.style.justifyContent = "center";
    __pillEl.style.whiteSpace = "nowrap";
    // Digits of equal width, so the countdown does not change size as it ticks: "01:30:38" is narrower
    // than "38:30:38" in proportional figures, and the pill would have breathed every second, dragging
    // the money in front of it sideways. Measured in place: 111.39px on every digit combination.
    // This is set here rather than through the `tabular-nums` utility class because that class is NOT
    // in the compiled stylesheet — it was carried on the element for a while doing nothing, which the
    // stale-stylesheet guard correctly caught. Rebuilding the stylesheet would touch every page on the
    // site, including frozen ones, to win one property on one pill.
    __pillEl.style.fontVariantNumeric = "tabular-nums";
    if (__isClock) {
      __pillEl.setAttribute("data-gr-deadline", String(__grDeadline(row) || ""));
      __pillEl.setAttribute("data-gr-section", __rOpts.waitingSection ? "waiting" : (__rOpts.urgentSection ? "urgent" : "rest"));
      // The row's OWN urgency as drawn — which is NOT the same thing as the section it sits in. sir's
      // approved collision rule pulls a non-expiring request into "Expiring soon" when it wants the
      // identical slot as one that IS expiring, so those companion rows sit under an urgent heading
      // with 17 or 39 hours on their clock. Recording the real answer here is what lets the ticker
      // tell "this row's urgency changed" apart from "this row is keeping another one company".
      __pillEl.setAttribute("data-gr-urgent", (__cd && __cd.ms <= __GR_URGENT_MS) ? "1" : "0");
      if (__cdPrefix) __pillEl.setAttribute("data-gr-prefix", __cdPrefix);
    }
  } catch (_aErr) { void _aErr; }
  // sir 2026-08-07: "why each element in that row is dpeended on toehr on left or right side and not
  // have its own space consdiering maximum length needed for it with proper spacing?" — the clock was
  // positioned by whatever buttons followed it, so it started 127px apart between a row with three
  // buttons and a row with one. It gets its own column now, sized to the longest text it ever carries
  // ("2 dates · 46:30:38 left" measured at 171px).
  var actionBits = [];
  if (isLive) {
    actionBits.push(El("button", { type: "button", className: "px-4 py-2 rounded-lg tsts-btn-primary text-sm font-bold shadow-sm transition", "data-action": "host-private-request-status", "data-request-id": requestId, "data-request-status": "approved", textContent: "Accept" }));
    actionBits.push(El("button", { type: "button", className: "px-4 py-2 rounded-lg border border-red-100 text-red-600 text-sm font-semibold hover:bg-red-50 transition", "data-action": "host-private-request-status", "data-request-id": requestId, "data-request-status": "declined", textContent: "Decline" }));
  }
  actionBits.push(expandBtn);
  // Owner 2026-08-02 (sir: "host is not confused on dates"): each row carries the SAME orange date
  // badge language as the Who's-coming cards (compact) — distinct dates for one experience read as
  // clearly separate at a glance; only true same-date collisions get the amber warning below.
  // Timezone-stable: parse the plain YYYY-MM-DD directly (never new Date(str) — day-rollback bug).
  var __qBadge = null;
  var __qdm = String((row && row.preferredDate) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (__qdm) {
    var __qMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    __qBadge = El("div", { className: "bg-orange-50 text-orange-600 w-11 h-11 rounded-xl flex flex-col items-center justify-center border border-orange-100 shrink-0" }, [
      El("span", { className: "text-[10px] font-bold uppercase leading-none", textContent: __qMonths[Number(__qdm[2]) - 1] || "" }),
      El("span", { className: "text-base font-bold leading-tight", textContent: String(Number(__qdm[3])) })
    ]);
  }
  // ─────────────────────────────────────────────────────────────────────────────────────────────────
  // sir's order 2026-08-07, verbatim: "why each element in that row is dpeended on toehr on left or
  // right side and not have its own space consdiering maximum length needed for it with proper
  // spacing?" — the row was a flex line, so every part began wherever the part before it ended. Fixing
  // only the last two items (the amount, the button cluster) was the same borrowed-space thinking: the
  // end of the row stopped moving and the middle kept floating. Measured across seven rows BEFORE this
  // change: facts started 25px apart because names differ in width (74px "QA Guest" vs 100px "Priya
  // Sharma"), and the clock started 127px apart because it was pushed by however many buttons followed.
  //
  // The row is now a GRID. Every part owns a column sized to the longest thing it will ever hold —
  // measured live, not guessed: name 100px, amount 80px, clock 171px ("2 dates · 46:30:38 left"),
  // buttons 220px (Accept + Decline + expand). Headroom added so a longer name or a bigger amount does
  // not start borrowing again. The facts column is the only flexible one, because it is the only part
  // that can be shortened without losing a fact the host needs to act on.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────
  var compactBits = [];
  compactBits.push(__qBadge || El("div", { className: "w-11 h-11 shrink-0" }));
  compactBits.push(avatar);
  var __nameCell = El("span", { className: "font-semibold text-tsts-ink whitespace-nowrap truncate", textContent: __grShortName, title: requesterName });
  compactBits.push(__nameCell);
  // sir 2026-08-07, E3 of the element walk: the row named the guest but never said WHO they are to
  // this host. A returning guest now reads on the row itself; a first-timer adds nothing, so most
  // rows stay quiet.
  // sir 2026-08-07: "you mixed time with 12th booking with you -- i never approved it". The returning-
  // guest marker was MY text, folded into the time column, so two unrelated facts fought for one space
  // and the time — which sir ordered must never be cropped — lost by 91px. The time column carries the
  // time and the party size, and nothing else.
  // sir's order: this line was hard left in a 182px column while its text measures 163-165px, so every
  // row carried 17-19px of dead space on its right and the line sat off-centre in its own space.
  // Centred inside its own fixed column — the column keeps its constant width, the text sits in the
  // middle of it, so the ragged edge is shared evenly instead of all falling on one side.
  var __timeCell = El("span", { className: "text-xs text-gray-500 min-w-0 truncate text-center", textContent: timeText + " · " + guestText });
  compactBits.push(__timeCell);
  // sir's design 2026-08-07: "12th time retruning or ---- also has to come after number of guests as
  // spearate column in first row ---- which get dropped" — the returning-guest fact is its OWN column,
  // sitting straight after the party size, and it is one of the two columns that come off the row when
  // the row is expanded (the panel below carries the whole record anyway).
  var __returnCell = El("span", { className: "text-xs text-gray-500 whitespace-nowrap truncate", textContent: (function () {
    var n = Math.max(0, Math.floor(Number(row && row.requesterBookingCount) || 0));
    if (n < 1) return "";
    return __grOrdinal(n + 1) + " booking";
  })() });
  if (__returnCell.textContent) __returnCell.setAttribute("title", __returnCell.textContent + " with you");
  compactBits.push(__returnCell);
  // The amount and the countdown travel together — sir: the countdown belongs with the cost.
  compactBits.push(El("span", { className: "text-sm font-bold text-tsts-ink whitespace-nowrap text-right", textContent: moneyText || "" }));
  compactBits.push(__pillEl);
  // A grid stretches its items by default, which blew the clock pill out to the full width of its
  // column. The column still RESERVES the space (that is the point — the pill's start never moves),
  // but the pill itself keeps its natural size.
  // The clock and the buttons share ONE fixed track (see __GR_ACTIONS_TRACK): no row ever needs the
  // widest clock and the widest button set at once, so reserving both separately wasted 63px a row.
  // sir's design 2026-08-07: "why expand plus os at botton not at top in line with name of guest? and
  // why countdown is not there with coss?" — the expand control leaves the button cluster and becomes
  // its own cell, so on a phone it can sit at the top beside the guest's name, and the countdown joins
  // the amount. The action cluster is then only Accept and Decline, which fit a phone card with room.
  var __btnsOnly = actionBits.filter(function (b) { return b !== expandBtn; });
  var __actionCluster = El("div", { className: "flex items-center gap-2 justify-end" }, __btnsOnly);
  compactBits.push(__actionCluster);
  compactBits.push(expandBtn);
  // The row is keyboard-focusable, and it was showing Chrome's raw blue system outline
  // (`rgb(0,95,204) auto 1px`) on a page whose stylesheet already ships a branded ring — the same one
  // the offer form's own fields use. Every keyboard user saw the browser default until now.
  var compactRow = El("div", { className: "px-4 py-3 cursor-pointer hover:bg-gray-50 transition tsts-gr-row outline-none focus:ring-2 focus:ring-orange-100" }, compactBits);
  // Cells are found by NAME, not by index: the expand control moves in and out of the button cluster
  // between the desktop row and the phone card, so positional lookups would silently read the wrong cell.
  ["badge","photo","name","time","ret","money","clock","actions","expand"].forEach(function (nm, i) {
    if (compactBits[i]) compactBits[i].setAttribute("data-gr-cell", nm);
  });
  compactRow.setAttribute("data-gr-fullname", requesterName);
  compactRow.setAttribute("data-gr-shortname", __grShortName);
  compactRow.style.display = "grid";
  compactRow.style.alignItems = "center";
  // 10px, not 12: widening the returning column to hold "138th booking" whole needed 12px, and taking
  // it from the six gaps costs nothing legible, where taking it from a column would have cut something.
  compactRow.style.columnGap = "10px";
  compactRow.style.rowGap = "8px";
  rowEl.appendChild(compactRow);
  // sir 2026-08-07 asked whether every width had been tested. It had not, and once it was, the seven
  // fixed columns proved unable to yield: below 1024 the facts column was squeezed to 0px (the time and
  // party size vanished outright) and the fixed columns kept going, pushing the buttons 416px off the
  // card and making the whole page scroll sideways at 390px. Fixed space that cannot give is not the
  // same as space of one's own.
  //
  // Two shapes now, and EVERY row switches at the same moment so the list can never go ragged:
  //   WIDE  — one line, seven columns, each sized to the longest content it will ever hold.
  //   TIGHT — two lines: who and when on top, then money, clock and buttons beneath. Nothing is
  //           dropped, nothing leaves the card, and the columns still line up down the page.
  try { __grApplyRowShape(compactRow); __grBindShapeWatcher(); } catch (_shErr) { void _shErr; }
  // clientWidth is 0 until the row is in the document, so shape it again on the next frame — and by then
  // every row exists, so the name track can be measured across all of them and re-applied to each.
  try {
    requestAnimationFrame(function () {
      try {
        __grSyncNameTrack();
        var all = document.querySelectorAll(".tsts-gr-row");
        for (var i = 0; i < all.length; i++) __grApplyRowShape(all[i]);
      } catch (_r2) { void _r2; }
    });
  } catch (_r3) { void _r3; }

  // Same-table collision warning (owner 2026-08-02 self-audit): the host sees the competition BEFORE
  // deciding — accepting one request for this date releases the others automatically.
  var competing = Number(row && row.__competingCount) || 0;
  if (competing > 0 && isLive) {
    var collisionNote = El("p", { className: "text-[11px] font-semibold text-amber-700 px-4 pb-2 -mt-1", textContent: competing + (competing === 1 ? " other guest wants" : " other guests want") + " this same date and time. Accepting one request automatically releases the other" + (competing === 1 ? "" : "s") + " with no charge." });
    // The indent was a fixed 60px, tuned for the flex row that no longer exists — measured, it left the
    // warning 27px adrift of the guest's name it belongs to, pointing at nothing. It is now derived from
    // the row's own tracks, so it cannot drift again when a column width changes: the row's 16px padding,
    // then the date badge, the photo, and the two gaps that separate them from the name.
    collisionNote.style.paddingLeft = (16 + 44 + 10 + 32 + 10) + "px";
    rowEl.appendChild(collisionNote);
  }

  // Detail layer sits in a soft inset panel so it reads as PART of its row, not the next one.
  // Owner 2026-08-02 (sir: "take a look at ---- approved tab … even twin something"): the expanded
  // layer TWINS the locked Private Requests card's facts layout — serif label over bold ink value,
  // flex bar with even gaps — then the guest's note in the locked prose treatment, then Email + chat.
  var body = El("div", { className: "px-4 pb-4" + (expanded ? "" : " hidden") });
  var panel = El("div", { className: "rounded-xl bg-gray-50 p-4 space-y-4" });
  // sir 2026-08-07 ("Everything the live rows show"): opening a request that ran out or was declined
  // used to give a 126px box repeating the row — no note, no chat, no money, no reason it ended. A
  // section whose job is "see what you missed" has to actually show what was missed, so closed rows
  // now carry the same record as a live one, read-only: no Accept, no Decline, no reply box.
  if (isLive || __rOpts.closedSection) {
    function __qFact(label, value) {
      return El("div", { className: "min-w-0" }, [
        El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-0.5", textContent: label }),
        El("p", { className: "font-semibold text-tsts-ink whitespace-nowrap", textContent: value })
      ]);
    }
    // On a closed request nothing is on hold any more — the money label must say what happened to it,
    // not imply the guest's card is still committed.
    var __moneyLabel = __rOpts.closedSection ? "Was on hold" : "On hold";
    // sir ordered the money BELOW the time — on the wide card. On a phone his earlier ruling stands:
    // "Two by two". Nesting the money inside the time column made that impossible, because a nested
    // cell cannot flow into a phone's second row; it left Guests orphaned on a line of its own with
    // the money floating above it. The four facts are SIBLINGS again, and the shaper decides:
    // desktop places the money under the time by grid position; the phone just lets them flow
    // Date | Time / Guests | On hold — sir's two by two, restored.
    var factsBar = El("div", {}, [
      __qFact("Date", dateText),
      __qFact("Time", timeText),
      __qFact("Guests", guestText),
      __qFact(__moneyLabel, moneyText || "")
    ].filter(function (f, i) { return i < 3 || moneyText; }));
    // sir's ruling 2026-08-07: "Fixed columns". As a flex bar these four facts spaced themselves by
    // their own text width — measured at x 173 · 309 · 495 · 600, gaps of 136, 186 and 105 — so "Guests"
    // and "On hold" crowded together while "Time" sat in a wide gap, and every request the host opened
    // put them somewhere different. Each fact now owns a fixed column: Date and Time take the room their
    // longest values need (a full date, a 12-hour range), Guests and the money are narrow and constant.
    factsBar.style.display = "grid";
    factsBar.style.columnGap = "24px";
    factsBar.style.rowGap = "12px";
    factsBar.style.alignItems = "start";
    factsBar.className = "tsts-gr-facts";
    // sir's ruling 2026-08-07: "Two by two" on a phone. Four fixed columns need 622px and a phone panel
    // has 292px, so Guests and the money were pushed 314px off the panel — gone from the screen on the
    // one device where a host most needs to see how many people and how much money. Date and Time share
    // the first line, Guests and the money the second, each pair still on fixed columns.
    // The bar has no width until it is in the document — and the panel starts hidden, so it has none
    // until the row is opened either. Shaped on the next frame and again whenever the row is toggled.
    try { requestAnimationFrame(function () { try { __grShapeFactsBar(factsBar); } catch (_f1) { void _f1; } }); } catch (_f2) { void _f2; }
    panel.appendChild(factsBar);
    // What actually happened, in plain words — the one thing the closed row could never tell you.
    if (__rOpts.closedSection) {
      var __outWhen = "";
      // A request that ran out is not stamped `reviewedAt` until the sweep catches up, so fall back to
      // the deadline itself — otherwise the sentence would read "This ran out before it was answered."
      // with no date at all on exactly the rows sir asked to explain.
      try {
        var __outStamp = (row && row.reviewedAt) || (row && row.expiresAt) || "";
        if (__outStamp && window.tstsFormatDateShort) __outWhen = String(window.tstsFormatDateShort(__outStamp) || "");
      } catch (_owErr) { void _owErr; }
      var __outcomeText = (status === "declined")
        ? ("You turned this down" + (__outWhen ? " on " + __outWhen : "") + ". The guest's hold was released and they were never charged.")
        : (status === "invalidated")
          ? ("The date was taken by another booking" + (__outWhen ? " on " + __outWhen : "") + ". The guest's hold was released and they were never charged.")
          : ("This ran out before it was answered" + (__outWhen ? " on " + __outWhen : "") + ". The guest's hold was released and they were never charged.");
      panel.appendChild(El("div", {}, [
        El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-1", textContent: "What happened" }),
        El("p", { className: "text-sm text-gray-700", textContent: __outcomeText })
      ]));
    }
    var __hist = __hostGuestHistoryBlock(row, El);
    if (__hist) panel.appendChild(__hist);
    var note = String((row && row.note) || "").trim();
    panel.appendChild(El("div", {}, [
      El("p", { className: "heading-serif text-base font-semibold text-tsts-ink mb-1", textContent: "Their note to you" }),
      El("p", { className: "text-sm text-gray-700", textContent: note || "No note from the guest." })
    ]));
    // sir 2026-08-07 ("A host should always be able to offer dates"): the third answer finally has a
    // control. The form already existed but was only reachable from a PRE-EMPTED request, so a host
    // facing a normal waiting request could only accept or decline. sir's rules are stated here, not
    // discovered by hitting a refusal: two rounds maximum, and the guest gets 12 hours or until
    // shortly before the experience, whichever comes first. sir 2026-08-07: "is this a restauran t"
    // -- the platform runs yoga, vinyl nights and coffee cupping. Its own copy says "experience"
    // six times; "meal" appeared twice and both were mine, written tonight.
    if (isLive && !__rOpts.closedSection && !__rOpts.waitingSection) {
      // The two-round LIMIT stays exactly as it was — sir removed the sentence that announced it,
      // not the rule. __roundsUsed used to also pick the wording; nothing reads it for copy now.
      var __roundsLeft = 2 - Math.max(0, Number(row && row.offerRounds) || 0);
      var __offerWrap = El("div", { className: "space-y-2" });
      // sir's order: "Offer another time" sits on the SAME ROW as "Can't do this date?" — the question
      // and the answer to it read as one line, instead of the button hanging loose underneath the
      // paragraph where it looked like an afterthought rather than the third answer to the request.
      var __offerHead = El("p", { className: "heading-serif text-base font-semibold text-tsts-ink", textContent: "Can't do this date?" });
      if (__roundsLeft > 0) {
        var __offerBtn = El("button", {
          type: "button",
          // sir's order: the approved light orange — the exact tokens on the count tags sir approved
          // (bg-orange-50 rgb(255,247,237) / border-orange-100 rgb(255,237,213) / text-orange-700
          // rgb(194,65,12)). It read as a grey outline before, the same dressing as a link off the site.
          className: "shrink-0 inline-flex px-4 py-2 rounded-lg border border-orange-100 bg-orange-50 text-orange-700 text-sm font-semibold hover:bg-orange-100 transition",
          "data-action": "host-propose-toggle",
          "data-request-id": requestId,
          textContent: "Offer another time"
        });
        // sir: "cant do this date in one row and offer another tine in next row -- this is for mobile
        // view only". Side by side the heading wrapped to two lines on a 390px phone and read as a
        // narrow column shoved against the button. Marked for the same shaper that sizes the facts bar.
        var __offerHeadRow = El("div", { className: "flex items-center justify-between gap-3 mb-1 tsts-gr-offerhead" }, [__offerHead, __offerBtn]);
        __offerWrap.appendChild(__offerHeadRow);
        try { requestAnimationFrame(function () { try { __grShapeOfferHead(__offerHeadRow); } catch (_o1) { void _o1; } }); } catch (_o2) { void _o2; }
        __offerWrap.appendChild(El("p", { className: "text-sm text-gray-700", textContent:
          "Offer dates that suit you instead of turning them away. Their payment stays on hold and they are never charged twice. They have 12 hours to pick, or until shortly before the experience if that comes first." }));
        __offerWrap.appendChild(__buildHostProposeForm(requestId, String((row && row.preferredTime) || ""), El, String((row && row.experienceId) || ""), String((row && row.preferredDate) || "")));
      } else {
        __offerHead.className += " mb-1";
        __offerWrap.appendChild(__offerHead);
        __offerWrap.appendChild(El("p", { className: "text-sm text-gray-700", textContent:
          "You have offered this guest dates twice. To keep it clear for them, the next step is to accept a date or decline the request." }));
      }
      panel.appendChild(__offerWrap);
    }
    // sir's order: "remove email guest button". It was a mailto link wearing the exact styling of the
    // third answer to the request, stacked under a heading that had nothing to do with emailing anyone,
    // and it took the host off the platform — away from the clock, the record and the chat's screening.
    // The chat below is where a host talks to a guest.
    panel.appendChild(__hostThreadBlock(row, requestId, requesterName, El, { readOnly: !!__rOpts.closedSection }));
  } else {
    // Counter-offer / waiting states keep their full proven card inside the expansion.
    panel.appendChild(__renderHostRequestCard(row, El));
  }
  body.appendChild(panel);
  rowEl.appendChild(body);

  function __toggleRow() {
    var nowHidden = body.classList.toggle("hidden");
    expandBtn.setAttribute("aria-expanded", nowHidden ? "false" : "true");
    expandBtn.setAttribute("aria-label", nowHidden ? "Show request details" : "Hide request details");
    // The row announces its own state too, or a screen reader would keep saying "show" after opening.
    try {
      compactRow.setAttribute("aria-expanded", nowHidden ? "false" : "true");
      compactRow.setAttribute("aria-label", (nowHidden ? "Show" : "Hide") + " request details for " + requesterName);
    } catch (_arErr) { void _arErr; }
    window.tstsSetPlusMinus(toggleGlyph.firstChild, !nowHidden);
    if (nowHidden) { delete __hostQueueExpandedIds[requestId]; } else { __hostQueueExpandedIds[requestId] = true; }
    // sir's design: opening a row drops the time and the returning-guest columns and shows the name in
    // full; closing it puts them back. Re-shape the row now that its expanded state has changed.
    try { __grApplyRowShape(compactRow); } catch (_esErr) { void _esErr; }
    // Nothing inside the panel has a width until the panel is visible, so both shapeable pieces are
    // measured on open — the facts bar AND the offer heading row, which stacks on a phone.
    try {
      var __fb = rowEl.querySelector(".tsts-gr-facts");
      var __oh = rowEl.querySelector(".tsts-gr-offerhead");
      requestAnimationFrame(function () {
        try { if (__fb) __grShapeFactsBar(__fb); } catch (_f3) { void _f3; }
        try { if (__oh) __grShapeOfferHead(__oh); } catch (_f5) { void _f5; }
      });
    } catch (_f4) { void _f4; }
  }
  expandBtn.addEventListener("click", function (e) { e.stopPropagation(); __toggleRow(); });
  // The whole row is the expand target — clicks on real controls (Accept/Decline/links) pass through.
  compactRow.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("button, a")) return;
    __toggleRow();
  });
  // Measured: 5 clickable rows on this tab, 0 reachable by keyboard. The row is a plain div with a
  // click handler, so anyone navigating by keyboard could never open a request's details — the +/−
  // button was the only way in. The row is now a real control: focusable, announced, and operable
  // with Enter or Space, matching what the mouse already does.
  try {
    compactRow.setAttribute("tabindex", "0");
    compactRow.setAttribute("role", "button");
    compactRow.setAttribute("aria-expanded", expanded ? "true" : "false");
    compactRow.setAttribute("aria-label", (expanded ? "Hide" : "Show") + " request details for " + requesterName);
  } catch (_kbErr) { void _kbErr; }
  compactRow.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    if (e.target && e.target.closest && e.target.closest("button, a, input")) return;
    e.preventDefault();
    __toggleRow();
  });
  return rowEl;
}

// Owner 2026-06-15: one host-side private-request card. Extracted from the panel so the Private-requests
// MODAL can compose cards itself (needs-reply first, then a "waiting on guest" divider) without cloning
// the panel's section id. Action buttons use document-level data-action dispatch (my-bookings.js:7119),
// so they keep working wherever the card is mounted.
function __renderHostRequestCard(row, El) {
    const requestId = String((row && row._id) || "");
    const requesterName = String((row && row.requesterName) || "Guest");

    const status = String((row && row.status) || "").toLowerCase();
    // Owner 2026-06-05: humanise the row — pretty date (13 June 2026), 12h time (5:00 PM),
    // and a friendly status PILL instead of the raw "Status: awaiting_host" enum (dev-facing,
    // hard-banned). Reuses the approved __privateRequestStatusPill + tstsFormatDateShort.
    let dateText = String((row && row.preferredDate) || "Date TBA");
    try { if (row && row.preferredDate && window.tstsFormatDateShort) dateText = String(window.tstsFormatDateShort(row.preferredDate) || dateText); } catch (_dErr) { void _dErr; }
    const rawTime = String((row && row.preferredTime) || "");
    const timeText = rawTime ? __formatPrivateRequestTimeRange12h(rawTime) : "Time TBA";
    const __cgN = Number.isFinite(Number(row && row.guests)) ? Math.max(1, Number(row.guests)) : null;
    const guestText = (__cgN === null) ? "Guests not set" : (__cgN + (__cgN === 1 ? " guest" : " guests"));

    const rowId = "host-private-request-row-" + requestId;

    // Pre-empted (an individual seat booked on this date) but still inside the 48h host window
    // → the host may propose alternative dates.
    const counterUntilMs = (row && row.counterEligibleUntil) ? new Date(row.counterEligibleUntil).getTime() : 0;
    const counterEligible = (status === "invalidated") && counterUntilMs > Date.now();

    // Host-facing pill: a few statuses read differently for the host than for the guest.
    let pill = __privateRequestStatusPill(row);
    if (counterEligible) {
      const ch = __privateRequestHoursLeft(row && row.counterEligibleUntil);
      pill = { label: (ch && ch > 0) ? ("Seat booked · offer a time · " + ch + "h left") : "Seat booked · offer a time", pillClass: "bg-orange-100 text-orange-700" };
    } else if (status === "alternative_offered") {
      const oh = __privateRequestHoursLeft(row && row.offerExpiresAt);
      pill = { label: (oh && oh > 0) ? ("Dates sent · waiting · " + oh + "h left") : "Dates sent · waiting", pillClass: "bg-orange-100 text-orange-700" };
    } else if (status === "counter_accept_pending") {
      pill = { label: "Guest completing booking", pillClass: "bg-amber-100 text-amber-700" };
    }

    const card = El("div", { className: "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3", id: rowId }, [
      El("div", { className: "flex flex-col md:flex-row md:items-start md:justify-between gap-2" }, [
        El("div", { className: "space-y-1" }, [
          El("div", { className: "font-bold text-gray-900", textContent: requesterName + " • " + String((row && row.experienceTitle) || "Private experience request") }),
          El("div", { className: "text-xs text-gray-500", textContent: dateText + " • " + timeText + " • " + guestText })
        ]),
        El("span", { className: "shrink-0 px-2.5 py-1 text-xs font-bold rounded-full " + pill.pillClass, textContent: pill.label })
      ])
    ]);

    if (status === "awaiting_host") {
      // Live request — the host accepts or declines. sir's order "remove email guest button" applies
      // here too: this card renders on the SAME Guest Requests tab (counter-offer and waiting states),
      // so the button sir told me to remove appeared twice on one screen. Leaving the second copy is
      // exactly the leftover pattern that left an unapproved popup in this file.
      card.appendChild(El("div", { className: "flex flex-wrap items-center gap-2" }, [
        El("button", {
          type: "button",
          className: "px-4 py-2 rounded-lg tsts-btn-primary text-sm font-bold shadow-sm transition",
          "data-action": "host-private-request-status",
          "data-request-id": requestId,
          "data-request-status": "approved",
          textContent: "Accept"
        }),
        El("button", {
          type: "button",
          className: "px-4 py-2 rounded-lg border border-red-100 text-red-600 text-sm font-semibold hover:bg-red-50 transition",
          "data-action": "host-private-request-status",
          "data-request-id": requestId,
          "data-request-status": "declined",
          textContent: "Decline"
        })
      ]));
    } else if (counterEligible) {
      // Pre-empted within the 48h window — explain, then let the host propose up to 3 dates.
      card.appendChild(El("div", { className: "rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-800" }, [
        El("p", { textContent: "Someone booked an individual seat on this date, so the whole table is no longer free. Offer " + requesterName + " up to three other dates and they'll pick one." })
      ]));
      card.appendChild(El("div", {}, [
        El("button", {
          type: "button",
          className: "px-4 py-2 rounded-lg tsts-btn-primary text-sm font-bold shadow-sm transition",
          "data-action": "host-propose-toggle",
          "data-request-id": requestId,
          textContent: "Propose another time"
        })
      ]));
      card.appendChild(__buildHostProposeForm(requestId, rawTime, El, String((row && row.experienceId) || ""), String((row && row.preferredDate) || "")));
    } else if (status === "alternative_offered") {
      // Read-only — show what the host already offered + the guest-accept countdown.
      const slots = Array.isArray(row && row.proposedSlots) ? row.proposedSlots : [];
      const list = El("ul", { className: "space-y-1 mt-1" });
      slots.forEach(function (sl) {
        let d = String((sl && sl.date) || "");
        try { if (d && window.tstsFormatDateShort) d = String(window.tstsFormatDateShort(d) || d); } catch (_e) { void _e; }
        const t = (sl && sl.time) ? __formatPrivateRequestTimeRange12h(String(sl.time)) : "";
        list.appendChild(El("li", { className: "text-xs text-gray-700", textContent: "• " + d + (t ? " · " + t : "") }));
      });
      card.appendChild(El("div", { className: "rounded-xl bg-orange-50 border border-orange-100 p-3 space-y-1" }, [
        El("p", { className: "text-xs font-bold text-orange-800", textContent: "You offered these dates. Waiting for " + requesterName + " to pick one:" }),
        list,
        // sir's order: a host who has offered dates can take them back while the guest has not
        // responded, and is then given sir's two answers — offer other dates, or decline the request.
        // The turn limit is silent until it is spent: nothing warns, nothing counts down, and only
        // when both rounds are gone does the offer choice grey out and say why.
        El("div", { className: "pt-2" }, [
          El("button", {
            type: "button",
            className: "inline-flex px-3 py-1.5 rounded-lg border border-orange-200 bg-white text-orange-700 text-xs font-semibold hover:bg-orange-50 transition",
            "data-action": "host-withdraw-offer",
            "data-request-id": requestId,
            textContent: "Take back these dates"
          })
        ])
      ]));
    } else if (status === "counter_accept_pending") {
      card.appendChild(El("div", { className: "rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800" }, [
        El("p", { textContent: requesterName + " picked a date and is completing payment. You'll be notified the moment it's confirmed." })
      ]));
    }

    // Owner 2026-06-09: host-side message thread (reply) on every non-terminal request.
    if (status !== "declined" && status !== "expired" && status !== "invalidated") {
      card.appendChild(__hostThreadBlock(row, requestId, requesterName, El));
    }

    return card;
}

// sir 2026-08-07, order: "if there is something i never approved then why the ---- is it there?
// remove it now". The host "Private requests" MODAL is gone — apparatus and all: the open/close/Esc
// handlers, the body renderer, its two row helpers, and the panel builder that fed it. When sir
// approved the Bookings-tab split the modal detour was DISCONNECTED but the surface was left in the
// file, so anything that called openHostRequestsModal() still rendered a full overlay sir had never
// approved — which is exactly how a popup appeared on his frozen Overview. Requests live on the
// Guest Requests tab; the tab IS the workbench. __renderHostRequestCard stays: the tab uses it.

// Owner 2026-06-09 — host-side thread block: messages (host right / guest left) + a reply input.
// Owner 2026-08-02 (sir): chat is JUST chat — the agree/confirm ceremony was stripped; the platform
// stands behind the booking record only. Safety layer (transcript, Report, screening) unchanged.
// Owner 2026-06-15: remember which request threads the host expanded, so a reply or a modal refresh
// keeps the thread open instead of snapping it shut on every re-render.
var __hostThreadExpandedIds = {};

function __hostThreadBlock(row, requestId, requesterName, El, opts) {
  var __readOnly = !!(opts && opts.readOnly);
  var msgs = Array.isArray(row && row.messages) ? row.messages : [];
  var expanded = !!__hostThreadExpandedIds[requestId];
  // sir's order: the WHOLE chat block carries the approved light orange, and its heading left-aligns
  // with "Can't do this date?" instead of sitting in from it.
  // The block's own chrome pushes its text inward by exactly its border + padding, so the band is
  // pulled out by that same amount on both sides. Its TEXT then starts and ends on the panel's content
  // edges — the same 173 and 1099 as every other line — while the tint keeps its breathing room.
  // Derived, not guessed: 1px border + 12px padding (p-3). Measured after the change: heading at 173.
  var __CHAT_BLEED = 1 + 12;
  var wrap = El("div", { className: "rounded-xl border border-orange-100 bg-orange-50 p-3 space-y-2" });
  wrap.style.marginLeft = "-" + __CHAT_BLEED + "px";
  wrap.style.marginRight = "-" + __CHAT_BLEED + "px";

  // Owner 2026-06-15: the thread is COLLAPSED by default (tap the header to expand) so the requests
  // triage list stays compact. The header shows a message count so the host knows there's a chat to open.
  // Owner 2026-08-02 (sir: "how will people know it's a button? why all caps?"): the strip header
  // speaks the locked language — serif sentence-case label — and carries the SAME big +/− control
  // as the rows and Past bookings, so it unmistakably reads as expandable.
  // sir 2026-08-07: "why do i see plus and minu sign bottom aligned instead of proper center
  // aligned with right margin". Both true. The mark was a text CHARACTER sitting on its own
  // baseline, and a dash renders low in its line box, so centring the BOX did nothing for the
  // MARK inside it. My first answer was a translateY nudge on the dash — a fudge tied to this one
  // font at this one size. sir 2026-08-08 then made the scope plain: "this is applicable to
  // entire site whereever there is plus minus expand collpas". The nudge is gone; the mark is now
  // drawn by the shared window.tstsPlusMinus, whose box IS its ink, so it is centred by geometry
  // and cannot drift again. The box keeps the right margin the rest of the block respects instead
  // of sitting flush to the border.
  var __chatGlyph = El("span", { className: "text-xl font-bold text-orange-700 leading-none" }, [window.tstsPlusMinus(expanded)]);
  var __chatToggleBtn = El("span", { className: "shrink-0 h-9 w-9 rounded-lg border border-orange-100 bg-white flex items-center justify-center transition hover:bg-orange-50" }, [__chatGlyph]);
  __chatToggleBtn.style.marginRight = "2px";
  var countHint = msgs.length ? (msgs.length + (msgs.length === 1 ? " message" : " messages")) : "No messages yet";
  // sir: "when i hover at chat wit hguest the color changes to darkk oragne in wierd way for all chat
  // section". The hover sat on the whole 926px strip, so pointing anywhere near it flooded the entire
  // block a darker orange — a hover state the size of a paragraph. I put that there tonight and never
  // hovered it. The strip no longer reacts; the +/- control does, which is the thing being clicked.
  var toggle = El("button", { type: "button", className: "w-full flex items-center justify-between gap-2 text-left rounded-lg transition py-0.5", "aria-expanded": expanded ? "true" : "false", "aria-label": (expanded ? "Hide" : "Show") + " chat with " + requesterName }, [
    El("span", { className: "heading-serif text-base font-semibold text-tsts-ink", textContent: "Chat with " + requesterName }),
    El("span", { className: "flex items-center gap-2" }, [
      El("span", { className: "text-xs font-medium text-gray-400", textContent: countHint }),
      __chatToggleBtn
    ])
  ]);
  var bodyWrap = El("div", { className: "space-y-2" + (expanded ? "" : " hidden") });
  toggle.addEventListener("click", function () {
    var nowHidden = bodyWrap.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", nowHidden ? "false" : "true");
    toggle.setAttribute("aria-label", (nowHidden ? "Show" : "Hide") + " chat with " + requesterName);
    window.tstsSetPlusMinus(__chatGlyph.firstChild, !nowHidden);
    if (nowHidden) { delete __hostThreadExpandedIds[requestId]; } else { __hostThreadExpandedIds[requestId] = true; }
  });
  wrap.appendChild(toggle);

  // Owner 2026-08-02 (sir): visible Report control in the thread header row — no policy chrome in chat.
  var __hostReportBtn = El("button", { type: "button", className: "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-orange-100 bg-white text-xs font-semibold text-orange-700 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition", "aria-label": "Report this conversation" }, [
    El("i", { className: "far fa-flag text-[11px]" }),
    El("span", { textContent: "Report" })
  ]);
  __hostReportBtn.addEventListener("click", function () { __prReportConversation(requestId); });
  // On a closed request this line used to still read "Reply to let your guest know what you can do."
  // three lines above "you can no longer reply here" — two sentences contradicting each other on the
  // same screen. A closed thread says what it IS, not what the host should do with it.
  // sir's order: "there must not be anything ---- called Ask in chat — it must be Chat and reply only."
  // My earlier ask/reply split is overturned here: the word Ask is gone from every control and every
  // line in this block. The line still tells the truth about who owes whom an answer, in sir's words.
  var __guestHasWritten = msgs.some(function (m) { return String((m && m.fromRole) || "") === "guest"; });
  var __threadPrompt = __guestHasWritten
    ? "Reply to let your guest know what you can do."
    : (msgs.length
      ? ("Waiting for " + requesterName + " to answer.")
      : ("Chat with " + requesterName + " before you decide."));
  bodyWrap.appendChild(El("div", { className: "flex items-center justify-between gap-3" }, [
    El("p", { className: "text-[11px] text-gray-400", textContent: __readOnly
      ? "Your conversation with this guest, kept for your records."
      : __threadPrompt }),
    __hostReportBtn
  ]));
  var list = El("div", { className: "space-y-2 max-h-48 overflow-y-auto" });
  // sir 2026-08-07, seen once the block was finally opened: an empty thread said "No messages yet"
  // in the header AND again here, three lines apart, with "Chat with <guest> before you decide"
  // between them. The header carries the count and the line above says what to do; this said the
  // same thing a third time and pointed nowhere, against WORLD_CLASS_VISION's "Never a dead end".
  if (!msgs.length) list.appendChild(El("p", { className: "text-xs text-gray-400 py-2", textContent: "Nothing here yet. Your first message starts the conversation." }));
  msgs.forEach(function (m) {
    var mine = String(m && m.fromRole) === "host";
    var bubble = El("div", { className: "max-w-[75%] rounded-xl px-3.5 py-2 " + (mine ? "bg-tsts-ink text-white ml-auto" : "bg-white border border-orange-100 text-tsts-ink") }, [
      El("p", { className: "text-xs leading-relaxed whitespace-pre-line break-words", textContent: String((m && m.text) || "") })
    ]);
    var when = ""; try { var d = safeDate(m && m.at); if (d && window.tstsFormatDateShort) when = String(window.tstsFormatDateShort(d) || ""); } catch (e) { void e; }
    bubble.appendChild(El("p", { className: "text-[10px] mt-1 " + (mine ? "text-white/80" : "text-gray-400"), textContent: (mine ? "You" : String((m && m.fromName) || requesterName)) + (when ? " · " + when : "") }));
    list.appendChild(El("div", { className: "flex " + (mine ? "justify-end" : "justify-start") }, [bubble]));
  });
  bodyWrap.appendChild(list);
  // A closed request cannot be replied to — the thread is history, so it is shown without a reply box
  // rather than offering a control that would fail. The messages themselves stay readable.
  if (__readOnly) {
    bodyWrap.appendChild(El("p", { className: "text-[11px] text-gray-400", textContent: "This request is closed, so you can no longer reply here." }));
  } else {
    // sir 2026-08-07: "why do i see a line called reply? reply to what?" On an empty thread there
    // is nothing to reply TO — the line above literally says "Nothing here yet". A host writing
    // first is sending a message, not replying. The word follows the state of the conversation.
    var __hasMsgs = msgs.length > 0;
    var inp = El("input", { type: "text", className: "w-full rounded-lg border border-orange-100 bg-white px-3 py-2 text-xs focus:border-orange-400 focus:outline-none", placeholder: (__hasMsgs ? ("Reply to " + requesterName + "…") : ("Message " + requesterName + "…")), id: "host-thread-input-" + requestId });
    var actions = El("div", { className: "flex items-center gap-2" }, [
      inp,
      El("button", { type: "button", className: "shrink-0 px-3 py-2 rounded-lg tsts-btn-primary text-xs font-bold transition", textContent: (__hasMsgs ? "Reply" : "Send"), "data-action": "host-private-request-reply", "data-request-id": requestId })
    ]);
    bodyWrap.appendChild(actions);
  }
  wrap.appendChild(bodyWrap);
  return wrap;
}

// sir 2026-08-07: EVERY money decision on a private request — host side and guest side — shows the
// booking as the approved Bookings-tab card (orange date badge, title, date/time, who, money) instead
// of a bare line of text. One maker so the two sides can never drift apart.
// `dateOverride`/`timeOverride` let the guest's accept popup show the date they are CHOOSING rather
// than the one they originally asked for.
function __prConfirmCard(row, dateOverride, timeOverride, intent) {
  if (!row) return null;
  var d = String(dateOverride || row.preferredDate || "");
  var t = String(timeOverride || row.preferredTime || "");
  var pax = Math.max(1, Number(row.guests) || 1);
  var timeText = t ? __formatPrivateRequestTimeRange12h(t) : "";
  var dateLong = d;
  try { if (d && window.tstsFormatDateShort) dateLong = String(window.tstsFormatDateShort(d) || d); } catch (_pcErr) { void _pcErr; }
  // sir 2026-08-07 had the line say what is about to HAPPEN to the money; since then every dialog's
  // body sentence tells that story once ("We'll capture the guest's payment hold…", "The hold on your
  // card will be released right away…"), so the line had become a second telling — and carried an
  // em-dash, which sir's ban forbids in platform copy. sir's ruling 2026-08-17: the line now carries
  // only what the booking is WORTH; the body sentence keeps the mechanics. Both sides stay identical
  // through this one maker, so they can never drift apart.
  var moneyLine = "";
  if (Number(row.amountCents) > 0) {
    var amt = centsToMoney(Number(row.amountCents), String(row.currency || "aud"));
    // sir 2026-08-16 ("fix it"): a payment DRAFT has no hold — its popup tells the draft's truth.
    moneyLine = (intent === "draft") ? (amt + " whole table price. Nothing is held yet.")
      : (amt + " · whole table");
  }
  return {
    date: d,
    title: String(row.experienceTitle || "Your experience"),
    when: dateLong + (timeText ? " · " + timeText : ""),
    who: String(row.requesterName || "Guest") + " · " + pax + (pax === 1 ? " guest" : " guests"),
    money: moneyLine
  };
}

async function handleHostSendMessage(requestId) {
  var id = String(requestId || "").trim();
  if (!id) return;
  var inp = document.getElementById("host-thread-input-" + id);
  var text = String((inp && inp.value) || "").trim();
  if (!text) { if (inp) inp.focus(); return; }
  try {
    var res = await window.authFetch("/api/host/private-booking-requests/" + encodeURIComponent(id) + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) ? String(raw.message) : "Couldn't send the reply.", "error"); return; }
    window.tstsNotify("Reply sent.", "success");
    await loadHost();
  } catch (err) { window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error"); }
}

async function handleHostPrivateRequestAction(requestId, nextStatus, btn) {
  const id = String(requestId || "").trim();
  const status = String(nextStatus || "").trim().toLowerCase();
  if (!id || !status) return;
  // A second click while the first is in flight would fire the money action twice. Guarded here as
  // well as by the button lock below, because the row can also be re-rendered mid-request.
  if (btn && btn.disabled) return;
  // Owner 2026-06-10 — money / destructive host actions confirm first (approve captures the guest's
  // hold; decline releases it and closes the request).
  // sir 2026-08-07: the popup shows WHICH booking is being decided, in the Bookings-tab card language —
  // orange date badge, title, then the facts. A money decision on a bare line of text told the host
  // nothing about the date and time they were committing to.
  var __row = null;
  try {
    var __pr = (hostDashboardState.privateRequests && hostDashboardState.privateRequests.rows) || [];
    __row = __pr.find(function (r) { return String(r._id) === id; }) || null;
  } catch (_rowErr) { __row = null; }
  var __card = __prConfirmCard(__row);
  // sir's APPROVED copy [log E2.10, 2026-06-10] — restored verbatim. I had rewritten both lines while
  // adding the card; the wording was sir's, approved, and not mine to change. The card is the only
  // addition; the destructive flag is gone too — sir's frozen button vocabulary (log line 853) is
  // red-100 + red-600 outline, never the solid red fill that flag produces.
  if (status === "approved") {
    var __apMsg = "Approve this private booking? We'll capture the guest's payment hold and confirm their whole-table booking.";
    var __apOk = window.tstsConfirm ? await window.tstsConfirm(__apMsg, { card: __prConfirmCard(__row, null, null, "capture") }) : window.confirm(__apMsg);
    if (!__apOk) return;
  } else if (status === "declined") {
    var __dcMsg = "Decline this private request? The guest's payment hold will be released and they won't be charged.";
    var __dcOk = window.tstsConfirm ? await window.tstsConfirm(__dcMsg, { card: __prConfirmCard(__row, null, null, "release") }) : window.confirm(__dcMsg);
    if (!__dcOk) return;
  }
  // The button says it is working and cannot be pressed again. Runtime-proven absent before this:
  // 13 samples across a 2.4s request, never disabled, no spinner, text unchanged.
  var __btnLabel = btn ? String(btn.textContent || "") : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = (status === "approved") ? "Accepting…" : "Declining…";
    btn.style.opacity = "0.65";
    btn.style.cursor = "not-allowed";
  }
  try {
    await updateHostPrivateBookingRequestStatus(id, status);
    // sir's ruling 2026-08-07: "Say what happened". Both actions returned the same eight words —
    // "Private request updated." — proven live on a decline that released A$300 and an accept that
    // captured A$500. A host was told nothing about who, what, or the money. The confirmation now says
    // it in the same terms the card used before the click.
    (function () {
      var __who = String((__row && __row.requesterName) || "").trim();
      var __first = __who ? __who.split(/\s+/)[0] : "";
      var __amt = "";
      try {
        // centsToMoney, not toMoney: toMoney takes DOLLARS, so passing cents printed "A$50,000" for a
        // A$500 booking — caught live on the first decline after this change. This is the same helper
        // the row itself uses, so the toast and the row can never disagree about the amount.
        var __c = Number(__row && __row.amountCents);
        if (isFinite(__c) && __c > 0) __amt = centsToMoney(__c, String((__row && __row.currency) || "aud"));
      } catch (_aErr) { void _aErr; }
      var __msg;
      if (status === "approved") {
        __msg = __first
          ? (__first + "'s table is confirmed" + (__amt ? ", and " + __amt + " has been taken from their card." : "."))
          : "The table is confirmed and the guest's payment has been taken.";
      } else {
        __msg = __first
          ? (__first + " has been turned down" + (__amt ? ", and their " + __amt + " hold is released. They were not charged." : " and was not charged."))
          : "The request was turned down and the guest was not charged.";
      }
      window.tstsNotify(__msg, "success");
    })();
    await loadHost();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Failed to update private request."), "error");
    // Only restore the button on FAILURE — on success the row is re-rendered and the old button is
    // gone, so re-enabling it would hand back a live Accept on a request already dealt with.
    if (btn) { btn.disabled = false; btn.textContent = __btnLabel; btn.style.opacity = ""; btn.style.cursor = ""; }
  }
}

// Counter-offer (host side): show/hide the inline "Propose another time" date form.
function handleHostProposeToggle(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const form = document.getElementById("host-propose-form-" + id);
  if (!form) return;

  // sir 2026-08-07, on being asked what the word means: "Cancel" means the thing does not
  // happen. This handler only toggled visibility, so Cancel collapsed the form and KEPT every
  // slot the host had entered — reopening it later showed the abandoned offer still loaded,
  // one click on Send away from reaching the guest. A button that reads as discard must discard.
  const closing = !form.classList.contains("hidden");
  form.classList.toggle("hidden");
  if (!closing) return;

  // sir 2026-08-07: "once you click back on offer anotrer slot it folds / collaps and when you
  // click it back it start w with one row only." Closing empties every row AND hides the extra
  // ones, so reopening always begins at a single slot.
  const rows = Array.isArray(form.__offerRows) ? form.__offerRows : [];
  rows.forEach(function (r, i) {
    if (r.row) r.row.className = (i > 0) ? "hidden" : "";
    try {
      // Clear through Flatpickr where it owns the field, so its own visible alt-input clears too.
      if (r.dateInput && r.dateInput._flatpickr && typeof r.dateInput._flatpickr.clear === "function") {
        r.dateInput._flatpickr.clear();
      } else if (r.dateInput) {
        r.dateInput.value = "";
      }
    } catch (_clrErr) { void _clrErr; }
    r.iso = "";
    r.__candidate = "";
    if (r.timeSelect && typeof form.__setTimeEmpty === "function") form.__setTimeEmpty(r);
    if (r.note) { r.note.textContent = ""; if (r.note.className.indexOf("hidden") < 0) r.note.className = "hidden " + r.note.className; }

  });
}

// Counter-offer (host side): collect up to 3 chosen dates from the inline form, attach the
// guest's originally-requested time to each (dates-only), and POST them as the offer. On
// success the request advances to "alternative_offered" and the guest sees the dates to pick.
// sir's order, verbatim: "if host take back date offered then the host can either offer new date or
// confime t odecline entire request with proper 2-way confirmtipon to confirm to decline the offer" and
// "when you cleick on tak back -- it pops up 2 optiosn -- offer new date or decline ... host and guest
// can do this twice but it will not flash as warning anywhere -- only when they are out of 2 turns
// each, the option will grey out with cealr msg that the ycan modify this anymore".
//
// So: one popup, two answers. Offering again is silent while a round remains and greys out with the
// reason when both are spent. Declining carries its own second confirmation, because it ends the
// request and releases the guest's money — sir's standing rule that every money-ending action is
// confirmed twice.
// One call, used by both answers in sir's take-back popup: "offer other dates" needs the offer pulled
// so the host can send new ones, and "decline" needs it pulled because the server's decline route only
// accepts a request that is awaiting the host.
async function __hostWithdrawOfferCall(requestId) {
  try {
    var res = await window.authFetch("/api/host/private-booking-requests/" + encodeURIComponent(requestId) + "/withdraw-offer", { method: "POST" });
    var payload = await res.json().catch(function () { return {}; });
    return { ok: res.ok, status: res.status, payload: payload };
  } catch (_hwErr) {
    void _hwErr;
    return { ok: false, status: 0, payload: {} };
  }
}

async function handleHostWithdrawOffer(requestId, btn) {
  // Same lookup every other host action on this page uses — the loaded rows, matched by id.
  var row = null;
  try {
    var __pr = (hostDashboardState.privateRequests && hostDashboardState.privateRequests.rows) || [];
    row = __pr.find(function (r) { return String(r._id) === String(requestId); }) || null;
  } catch (_rErr) { row = null; }
  var guestName = String((row && row.requesterName) || "your guest");
  var roundsUsed = Math.max(0, Number(row && row.offerRounds) || 0);
  var roundsLeft = 2 - roundsUsed;
  var choice = await window.tstsConfirm(
    "Take back the dates you offered " + guestName + "?",
    [
      { value: "offer", label: "Offer other dates", disabled: roundsLeft <= 0,
        note: roundsLeft <= 0 ? "You have offered dates twice on this request, so this is no longer available." : "" },
      { value: "decline", label: "Decline the whole request" }
    ]
  );
  if (!choice) return;

  if (choice.value === "decline") {
    // The second confirmation carries the money consequence, in the approved card.
    // sir's two-way confirmation is already satisfied: this popup is the first step, and
    // handleHostPrivateRequestAction raises the approved decline dialog — the booking card plus sir's
    // approved wording — as the second. I had added a THIRD, identical to the built-in one, so the host
    // was asked the same question twice; confirming mine only opened the other, and nothing declined.
    //
    // AND the decline could not have worked from here anyway: the server's decline route accepts ONLY
    // `awaiting_host` and refuses everything else with "This request can no longer be actioned". While
    // dates stand offered the request is `alternative_offered`, so every decline from this popup was
    // rejected — proven twice: status stayed alternative_offered, hold stayed authorized. The dates are
    // therefore taken back FIRST, which is what returns the request to the state the route accepts.
    var pulled = await __hostWithdrawOfferCall(requestId);
    if (!pulled.ok) {
      window.tstsNotify(mapHostScopeError(pulled.payload, pulled.status, "We couldn't take those dates back, so nothing was declined."), "error");
      return;
    }
    await loadHost();
    return handleHostPrivateRequestAction(requestId, "declined", btn);
  }

  if (btn) { btn.disabled = true; btn.textContent = "Taking them back…"; }
  try {
    var res = await __hostWithdrawOfferCall(requestId);
    if (!res.ok) {
      window.tstsNotify(mapHostScopeError(res.payload, res.status, "We couldn't take those dates back."), "error");
      if (btn) { btn.disabled = false; btn.textContent = "Take back these dates"; }
      return;
    }
    window.tstsNotify("Dates taken back. " + guestName + "'s request is waiting on you again.", "success");
    await loadHost();
    renderHostingDashboard();
  } catch (_wErr) {
    void _wErr;
    window.tstsNotify("We couldn't take those dates back just now. Nothing changed.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Take back these dates"; }
  }
}

async function handleHostProposeAlternative(requestId, btn) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const form = document.getElementById("host-propose-form-" + id);
  if (!form) return;
  const originalTime = String(form.getAttribute("data-original-time") || "").trim();
  if (!originalTime) { window.tstsNotify("This request has no time set, so dates can't be proposed.", "error"); return; }
  // sir 2026-08-07: read each row's own date and time.
  const rows = Array.isArray(form.__offerRows) ? form.__offerRows : [];

  // sir 2026-08-07: "i cliekcd on send request for two slots and it allowed me to send it".
  // I had claimed the duplicate warning stopped Send. It did not — I never clicked Send to check.
  // Clearing the offending row's candidate only made it drop out silently, which is the very
  // behaviour the warning exists to end. A row that is showing an unresolved problem now BLOCKS
  // the send outright, so the host fixes it rather than having it quietly removed.
  const blocked = rows.filter(function (r) {
    const t = (r && r.note) ? (r.note.textContent || "") : "";
    return r && r.iso && r.note && r.note.className.indexOf("hidden") < 0 && (t.indexOf("already chosen") >= 0 || t.indexOf("already asked for") >= 0);
  });
  if (blocked.length) {
    window.tstsNotify("One of your rows needs changing before you can send. Check the note under it.", "warning");
    try { blocked[0].dateInput.focus(); } catch (_fErr) { void _fErr; }
    return;
  }

  const proposedSlots = [];
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const d = String((rows[i] && rows[i].iso) || "").trim();
    const t = String((rows[i] && rows[i].__candidate) || "").trim();
    if (!d || !t) continue;
    const key = d + "|" + t;
    if (seen[key]) continue;
    seen[key] = true;
    proposedSlots.push({ date: d, time: t });
  }
  if (proposedSlots.length === 0) { window.tstsNotify("Pick at least one slot to offer.", "warning"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    const res = await window.authFetch("/api/host/private-booking-requests/" + encodeURIComponent(id) + "/propose-alternative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposedSlots: proposedSlots })
    });
    const raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      window.tstsNotify((raw && raw.message) ? String(raw.message) : "Couldn't send those slots. Please try again.", "error");
      if (btn) { btn.disabled = false; btn.textContent = proposedSlots.length > 1 ? ("Send these " + proposedSlots.length + " slots") : "Send this slot"; }
      return;
    }
    window.tstsNotify("Slots sent. We'll let you know the moment they pick one.", "success");
    await loadHost();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) { btn.disabled = false; btn.textContent = proposedSlots.length > 1 ? ("Send these " + proposedSlots.length + " slots") : "Send this slot"; }
  }
}

async function handleConnectionRequestAction(requestId, action) {
  const id = String(requestId || "").trim();
  const next = String(action || "").trim().toLowerCase();
  if (!id || !next) return;
  try {
    await respondToConnectionRequest(id, next);
    window.tstsNotify(next === "accept" ? "Connection accepted." : "Connection rejected.", "success");
    await loadTrips();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Could not update connection request."), "error");
  }
}

// Guest withdraws a still-pending private booking request → the hold is released
// (never charged). POST /api/private-booking-requests/:id/cancel (authFetch attaches
// CSRF). Confirms first, then refreshes the trips tab so the row reflects "Declined".
// Owner 2026-08-06 (sir's check-in dashboard): one tap reminds every not-yet-checked-in guest on
// this occurrence to check in before the window closes. The backend filters recipients (pending +
// paid only) and enforces a per-occurrence cooldown so a nervous host can't spam guests.
async function handleBuzzPendingCheckins(btn, expId, occDate, occSlot) {
  const id = String(expId || "").trim();
  if (!id || !occDate || !occSlot) return;
  const confirmMsg = "Send a check-in reminder to every guest who hasn't checked in yet for this event?";
  const ok = window.tstsConfirm ? await window.tstsConfirm(confirmMsg) : window.confirm(confirmMsg);
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = "Buzzing…"; }
  try {
    const res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(id) + "/buzz-pending-checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: String(occDate), slot: String(occSlot) })
    });
    const raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      const code = String((raw && raw.error) || "");
      const msg = code === "BUZZ_COOLDOWN"
        ? "You've already buzzed these guests recently. You can send another reminder in a few minutes."
        : ((raw && raw.message) ? String(raw.message) : "Couldn't send the reminders. Please try again.");
      window.tstsNotify(msg, "error");
      if (btn) { btn.disabled = false; btn.textContent = "Buzz pending guests"; }
      return;
    }
    const sent = Number(raw && raw.data && raw.data.notified);
    window.tstsNotify(isFinite(sent) && sent > 0
      ? ("Reminder sent to " + sent + (sent === 1 ? " guest" : " guests") + ".")
      : "Everyone on this event has already checked in.", "success");
    if (btn) { btn.textContent = "Buzzed ✓"; }
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) { btn.disabled = false; btn.textContent = "Buzz pending guests"; }
  }
}

async function handleGuestPrivateRequestWithdraw(requestId, btn) {
  const id = String(requestId || "").trim();
  if (!id) return;
  // Owner 2026-06-10: an awaiting_payment DRAFT has no hold to release (the Checkout never finished),
  // so the Discard confirm + toast must NOT promise a hold release — that copy is for awaiting_host.
  const __row = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).find(function (r) { return String((r && (r._id || r.id)) || "") === id; });
  const __isDraft = String((__row && __row.status) || "").toLowerCase() === "awaiting_payment";
  const confirmMsg = __isDraft
    ? "Discard this unfinished request? Nothing has been charged, and you can request again anytime."
    : "Withdraw this private booking request? The hold on your card will be released right away. You won't be charged.";
  const ok = window.tstsConfirm
    ? await window.tstsConfirm(confirmMsg, { card: __prConfirmCard(__row, null, null, __isDraft ? "draft" : "release") })
    : window.confirm(confirmMsg);
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = __isDraft ? "Discarding…" : "Withdrawing…"; }
  try {
    const res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/cancel", { method: "POST" });
    const raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      const msg = (raw && raw.message) ? String(raw.message) : (__isDraft ? "Couldn't discard this request." : "Couldn't withdraw this request.");
      window.tstsNotify(msg, "error");
      if (btn) { btn.disabled = false; btn.textContent = __isDraft ? "Discard" : "Withdraw"; }
      return;
    }
    window.tstsNotify(__isDraft ? "Request discarded. Nothing was charged." : "Request withdrawn. The hold has been released.", "success");
    await loadTrips();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) { btn.disabled = false; btn.textContent = __isDraft ? "Discard" : "Withdraw"; }
  }
}

// Owner 2026-06-10 — RESUME PAYMENT on an abandoned "awaiting_payment" draft. POST /resume-payment
// returns a FRESH Stripe Checkout URL for the same held booking; we send the guest there to finish.
// On completion the webhook advances awaiting_payment → awaiting_host (the host is notified then).
async function handleGuestResumePayment(requestId, btn) {
  const id = String(requestId || "").trim();
  if (!id) return;
  if (btn) { btn.disabled = true; btn.textContent = "Opening payment…"; }
  try {
    const res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/resume-payment", { method: "POST" });
    const raw = await res.json().catch(function () { return null; });
    const url = (raw && raw.data && raw.data.url) ? String(raw.data.url) : "";
    if (!res.ok || !url) {
      const msg = (raw && raw.message) ? String(raw.message) : "Couldn't reopen the payment. Please try again.";
      window.tstsNotify(msg, "error");
      if (btn) { btn.disabled = false; btn.textContent = "Complete payment"; }
      return;
    }
    window.location.href = url;
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) { btn.disabled = false; btn.textContent = "Complete payment"; }
  }
}

// Owner 2026-06-09 — guest "Edit request" modal: edit the note + guests + optionally propose ONE
// new date/time → POST /amend → the request goes back to the host for a fresh decision.
function openPrivateRequestEditModal(requestId) {
  var El = window.tstsEl;
  var id = String(requestId || "").trim();
  if (!id) return;
  var row = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).find(function (r) { return String((r && (r._id || r.id)) || "") === id; });
  if (!row) { window.tstsNotify("Couldn't load this request.", "error"); return; }

  var backdrop = El("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" });
  var modal = El("div", { className: "bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto" });
  modal.appendChild(El("h3", { className: "text-lg font-bold text-tsts-ink heading-serif", textContent: "Edit your request" }));
  modal.appendChild(El("p", { className: "text-sm text-gray-500", textContent: "Update the details and we'll send it back to " + String(row.hostName || "the host") + " to confirm." }));

  modal.appendChild(El("label", { className: "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide", textContent: "Your note" }));
  var noteTa = El("textarea", { className: "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none", rows: 3 });
  noteTa.value = String(row.note || "");
  modal.appendChild(noteTa);

  modal.appendChild(El("label", { className: "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide", textContent: "Guests" }));
  var guestsInput = El("input", { type: "number", min: "1", className: "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" });
  guestsInput.value = String(Math.max(1, Number(row.guests) || 1));
  modal.appendChild(guestsInput);

  modal.appendChild(El("label", { className: "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide", textContent: "Propose a different date (optional)" }));
  // Audit alignment (sir's R3 law, locked 2026-05-30: every date input uses the shared
  // Flatpickr wrapper): the native type="date" here was the last one on this page.
  // type="text" + readonly so Flatpickr's calendar is the only control; value stays ISO
  // yyyy-mm-dd so the existing amend submit read is untouched.
  var dateInput = El("input", { type: "text", readonly: "readonly", placeholder: "Pick a date", autocomplete: "off", className: "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none bg-white" });
  if (row.preferredDate) dateInput.value = String(row.preferredDate);
  modal.appendChild(dateInput);
  if (typeof window.tstsDatePicker === "function") {
    try { window.tstsDatePicker(dateInput, { minDate: "today" }); } catch (_dp) { void _dp; }
  }
  var timeInput = El("input", { type: "text", placeholder: "e.g. 18:00-20:00", className: "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" });
  if (row.preferredTime) timeInput.value = String(row.preferredTime);
  modal.appendChild(timeInput);

  var errP = El("p", { className: "text-sm text-rose-600 hidden" });
  modal.appendChild(errP);

  var cancelBtn = El("button", { type: "button", className: "px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition", textContent: "Cancel" });
  var saveBtn = El("button", { type: "button", className: "flex-1 px-4 py-2 rounded-xl tsts-btn-primary text-sm font-semibold transition", textContent: "Send to host" });
  modal.appendChild(El("div", { className: "flex items-center gap-2 pt-1" }, [cancelBtn, saveBtn]));
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  function teardown() { try { backdrop.remove(); } catch (e) { void e; } }
  cancelBtn.addEventListener("click", teardown);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) teardown(); });
  saveBtn.addEventListener("click", function () {
    handleGuestPrivateRequestAmend(id, { note: noteTa.value, guests: guestsInput.value, date: dateInput.value, time: timeInput.value }, saveBtn, errP, teardown);
  });
}

async function handleGuestPrivateRequestAmend(id, fields, btn, errP, teardown) {
  var date = String((fields && fields.date) || "").trim();
  var time = String((fields && fields.time) || "").trim();
  var payload = { note: String((fields && fields.note) || ""), guests: Number((fields && fields.guests) || 0) };
  if (date) { payload.preferredDate = date; payload.preferredTime = time; }
  if (errP) { errP.classList.add("hidden"); errP.textContent = ""; }
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    var res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/amend", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      var msg = (raw && raw.message) ? String(raw.message) : "Couldn't update the request.";
      if (errP) { errP.textContent = msg; errP.classList.remove("hidden"); } else { window.tstsNotify(msg, "error"); }
      if (btn) { btn.disabled = false; btn.textContent = "Send to host"; }
      return;
    }
    if (teardown) teardown();
    window.tstsNotify("Request updated and sent back to the host to confirm.", "success");
    await loadTrips();
  } catch (err) {
    if (errP) { errP.textContent = String((err && err.message) || "Network error. Please try again."); errP.classList.remove("hidden"); }
    if (btn) { btn.disabled = false; btn.textContent = "Send to host"; }
  }
}

// Owner 2026-06-09 — guest↔host MESSAGE THREAD modal. Lists messages (guest right / host left),
// shows the host-confirmed banner, and lets the guest send a message (POST /messages → updated thread).
function openPrivateRequestThread(requestId) {
  var El = window.tstsEl;
  var id = String(requestId || "").trim();
  if (!id) return;
  var row = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).find(function (r) { return String((r && (r._id || r.id)) || "") === id; });
  if (!row) { window.tstsNotify("Couldn't load this request.", "error"); return; }
  var msgs = Array.isArray(row.messages) ? row.messages.slice() : [];
  var hostName = String(row.hostName || "your host");

  var backdrop = El("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" });
  var modal = El("div", { className: "bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg flex flex-col" });
  modal.style.maxHeight = "85vh";
  // Owner 2026-08-02 (sir's sweep): Escape closes the chat like every other overlay.
  function __chatEscHandler(e) { if (e.key === "Escape") teardown(); }
  document.addEventListener("keydown", __chatEscHandler);
  function teardown() { try { document.removeEventListener("keydown", __chatEscHandler); } catch (eL) { void eL; } try { backdrop.remove(); } catch (e) { void e; } }

  var closeBtn = El("button", { type: "button", className: "text-gray-400 hover:text-gray-600 px-2 text-2xl leading-none", textContent: "×", "aria-label": "Close" });
  closeBtn.addEventListener("click", teardown);
  // Owner 2026-08-02 (sir): Report is a visible header control, next to close.
  var __guestReportBtn = El("button", { type: "button", className: "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition", "aria-label": "Report this conversation" }, [
    El("i", { className: "far fa-flag text-[11px]" }),
    El("span", { textContent: "Report" })
  ]);
  __guestReportBtn.addEventListener("click", function () { __prReportConversation(String(row._id || row.id || "")); });
  modal.appendChild(El("div", { className: "px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3" }, [
    El("div", { className: "min-w-0" }, [
      El("h3", { className: "text-lg font-bold text-tsts-ink heading-serif", textContent: "Chat with " + hostName }),
      El("p", { className: "text-xs text-gray-500 truncate", textContent: String(row.experienceTitle || "") })
    ]),
    El("div", { className: "flex items-center gap-2" }, [__guestReportBtn, closeBtn])
  ]));
  // Owner 2026-06-09: world-class, NON-BINDING language — special requests are not guarantees.
  modal.appendChild(El("p", { className: "px-5 pt-3 text-xs text-gray-500 leading-relaxed", textContent: "Share dietary needs, timing, or the occasion. These are friendly requests, not guarantees. Your host will do their best to make it special." }));

  var listWrap = El("div", { className: "flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-tsts-cream/30" });
  listWrap.style.minHeight = "180px";
  function renderList() {
    listWrap.textContent = "";
    if (!msgs.length) {
      listWrap.appendChild(El("p", { className: "text-center text-sm text-gray-400 py-6", textContent: "No messages yet. Send your host a note about your private table." }));
    }
    msgs.forEach(function (m) {
      var mine = String(m && m.fromRole) === "guest";
      var bubble = El("div", { className: "max-w-[75%] rounded-2xl px-4 py-2.5 " + (mine ? "bg-tsts-ink text-white" : "bg-white border border-gray-100 text-tsts-ink") }, [
        El("p", { className: "text-sm leading-relaxed whitespace-pre-line break-words", textContent: String((m && m.text) || "") })
      ]);
      var when = "";
      try { var d = safeDate(m && m.at); if (d && window.tstsFormatDateShort) when = String(window.tstsFormatDateShort(d) || ""); } catch (e) { void e; }
      bubble.appendChild(El("p", { className: "text-[10px] mt-1 " + (mine ? "text-white/80" : "text-gray-400"), textContent: (mine ? "You" : String((m && m.fromName) || hostName)) + (when ? " · " + when : "") }));
      listWrap.appendChild(El("div", { className: "flex " + (mine ? "justify-end" : "justify-start") }, [bubble]));
    });
    listWrap.scrollTop = listWrap.scrollHeight;
  }
  renderList();
  modal.appendChild(listWrap);

  // sir 2026-09-13: the composer follows the SERVER's rule (server.js:28713), not the card's open/closed
  // state — otherwise an invalidated request inside its counter window would offer a box whose only
  // possible reply is "This request is closed." Reading the thread stays available either way.
  if (!__prClosedByStatus(row)) {
    var ta = El("textarea", { className: "flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none resize-none", rows: 2, placeholder: "Write a message…" });
    var sendBtn = El("button", { type: "button", className: "shrink-0 px-4 py-2 rounded-xl tsts-btn-primary text-sm font-semibold transition self-end", textContent: "Send" });
    sendBtn.addEventListener("click", function () {
      var text = String(ta.value || "").trim();
      if (!text) { ta.focus(); return; }
      sendBtn.disabled = true; sendBtn.textContent = "Sending…";
      window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) })
        .then(function (res) { return res.json().catch(function () { return null; }).then(function (raw) { return { ok: res.ok, raw: raw }; }); })
        .then(function (r) {
          if (!r.ok) { window.tstsNotify((r.raw && r.raw.message) ? String(r.raw.message) : "Couldn't send the message.", "error"); sendBtn.disabled = false; sendBtn.textContent = "Send"; return; }
          msgs = (r.raw && r.raw.data && Array.isArray(r.raw.data.messages)) ? r.raw.data.messages : msgs;
          row.messages = msgs; // keep the cache fresh so the card's "Message host (N)" count updates
          ta.value = ""; sendBtn.disabled = false; sendBtn.textContent = "Send";
          renderList();
        })
        .catch(function (err) { window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error"); sendBtn.disabled = false; sendBtn.textContent = "Send"; });
    });
    modal.appendChild(El("div", { className: "px-5 py-3 border-t border-gray-100 flex items-stretch gap-2" }, [ta, sendBtn]));
  }

  backdrop.appendChild(modal);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) teardown(); });
  document.body.appendChild(backdrop);
}

// O-141 / O-142 (sir, 2026-09-16) — THE BOOKING MESSAGE THREAD, both sides.
//
// sir: "can we find a solution where host doesn't see the direct mail ID or contact details but a
// button and clicking it will draft a message or connect thought secure line". This is what the
// button opens. It is the private-table thread's modal, element for element — the same sheet, the
// same header with Report beside Close, the same bubbles (own side ink, other side white), the same
// empty line, the same composer — because sir locked that shape on this page (LOCK-011) and two
// conversations on one page must not look like two different products.
//
// The server owns every rule. This modal renders what GET /api/bookings/:id/messages returns and
// never decides for itself who may write.
var __bookingThreadOpenFor = "";
function openBookingMessageThread(bookingId, role) {
  var El = window.tstsEl;
  var id = String(bookingId || "").trim();
  if (!id) return;
  if (__bookingThreadOpenFor === id) return;
  __bookingThreadOpenFor = id;

  var otherLabel = (String(role) === "host") ? "guest" : "host";
  var backdrop = El("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" });
  var modal = El("div", { className: "bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg flex flex-col" });
  modal.style.maxHeight = "85vh";
  function __escHandler(e) { if (e.key === "Escape") teardown(); }
  document.addEventListener("keydown", __escHandler);
  function teardown() {
    __bookingThreadOpenFor = "";
    try { document.removeEventListener("keydown", __escHandler); } catch (eL) { void eL; }
    try { backdrop.remove(); } catch (e) { void e; }
  }

  var closeBtn = El("button", { type: "button", className: "text-gray-400 hover:text-gray-600 px-2 text-2xl leading-none", textContent: "×", "aria-label": "Close" });
  closeBtn.addEventListener("click", teardown);
  var reportBtn = El("button", { type: "button", className: "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition", "aria-label": "Report this conversation" }, [
    El("i", { className: "far fa-flag text-[11px]" }),
    El("span", { textContent: "Report" })
  ]);
  reportBtn.addEventListener("click", function () { __bookingThreadReport(id); });

  var titleEl = El("h3", { className: "text-lg font-bold text-tsts-ink heading-serif", textContent: "Chat with your " + otherLabel });
  var subEl = El("p", { className: "text-xs text-gray-500 truncate", textContent: "" });
  modal.appendChild(El("div", { className: "px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3" }, [
    El("div", { className: "min-w-0" }, [titleEl, subEl]),
    El("div", { className: "flex items-center gap-2" }, [reportBtn, closeBtn])
  ]));

  // The one sentence that says WHY this exists at all: sir's order is that neither party ever reads
  // the other's address, so the page says so rather than leaving people to wonder.
  var helperEl = El("p", { className: "px-5 pt-3 text-xs text-gray-500 leading-relaxed", textContent:
    "Messages go through The Shared Table Story. Your " + otherLabel + " sees your name, never your email address." });
  modal.appendChild(helperEl);

  var listWrap = El("div", { className: "flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-tsts-cream/30" });
  listWrap.style.minHeight = "180px";
  listWrap.appendChild(El("p", { className: "text-center text-sm text-gray-400 py-6", textContent: "Loading your conversation…" }));
  modal.appendChild(listWrap);

  var footer = El("div", { className: "px-5 py-3 border-t border-gray-100" });
  modal.appendChild(footer);

  backdrop.appendChild(modal);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) teardown(); });
  document.body.appendChild(backdrop);

  var state = { role: String(role || ""), messages: [], otherPartyName: "", canSend: false, closedNote: "" };

  function renderList() {
    listWrap.textContent = "";
    if (!state.messages.length) {
      listWrap.appendChild(El("p", { className: "text-center text-sm text-gray-400 py-6", textContent: "Nothing here yet. Your first message starts the conversation." }));
    }
    state.messages.forEach(function (m) {
      var mine = String(m && m.fromRole) === state.role;
      var bubble = El("div", { className: "max-w-[75%] rounded-2xl px-4 py-2.5 " + (mine ? "bg-tsts-ink text-white" : "bg-white border border-gray-100 text-tsts-ink") }, [
        El("p", { className: "text-sm leading-relaxed whitespace-pre-line break-words", textContent: String((m && m.text) || "") })
      ]);
      var when = "";
      try { var d = safeDate(m && m.at); if (d && window.tstsFormatDateShort) when = String(window.tstsFormatDateShort(d) || ""); } catch (e) { void e; }
      bubble.appendChild(El("p", { className: "text-[10px] mt-1 " + (mine ? "text-white/80" : "text-gray-400"), textContent: (mine ? "You" : String((m && m.fromName) || state.otherPartyName)) + (when ? " · " + when : "") }));
      listWrap.appendChild(El("div", { className: "flex " + (mine ? "justify-end" : "justify-start") }, [bubble]));
    });
    listWrap.scrollTop = listWrap.scrollHeight;
  }

  function renderFooter() {
    footer.textContent = "";
    if (!state.canSend) {
      // A shut conversation shows the reason and no control that could only fail. The words are the
      // server's, so a blocked pair and a closed account read exactly what the server decided.
      footer.appendChild(El("p", { className: "text-xs text-gray-500 leading-relaxed", textContent: String(state.closedNote || "") }));
      return;
    }
    var ta = El("textarea", { className: "flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none resize-none", rows: 2, placeholder: "Write a message…", "aria-label": "Your message" });
    var sendBtn = El("button", { type: "button", className: "shrink-0 px-4 py-2 rounded-xl tsts-btn-primary text-sm font-semibold transition self-end", textContent: "Send" });
    sendBtn.addEventListener("click", function () {
      var text = String(ta.value || "").trim();
      if (!text) { ta.focus(); return; }
      sendBtn.disabled = true; sendBtn.textContent = "Sending…";
      window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) })
        .then(function (res) { return res.json().catch(function () { return null; }).then(function (raw) { return { ok: res.ok, raw: raw }; }); })
        .then(function (r) {
          sendBtn.disabled = false; sendBtn.textContent = "Send";
          if (!r.ok) { window.tstsNotify((r.raw && r.raw.message) ? String(r.raw.message) : "Your message didn't send. Copy your text, then try again in a moment.", "error"); return; }
          apply(r.raw && r.raw.data);
          ta.value = "";
        })
        .catch(function (err) {
          sendBtn.disabled = false; sendBtn.textContent = "Send";
          window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
        });
    });
    footer.appendChild(El("div", { className: "flex items-stretch gap-2" }, [ta, sendBtn]));
  }

  function apply(data) {
    if (!data) return;
    state.role = String(data.role || state.role || "");
    state.messages = Array.isArray(data.messages) ? data.messages : [];
    state.otherPartyName = String(data.otherPartyName || "");
    state.canSend = data.canSend === true;
    state.closedNote = String(data.closedNote || "");
    otherLabel = (state.role === "host") ? "guest" : "host";
    titleEl.textContent = "Chat with " + (state.otherPartyName || ("your " + otherLabel));
    helperEl.textContent = "Messages go through The Shared Table Story. Your " + otherLabel + " sees your name, never your email address.";
    subEl.textContent = String(data.experienceTitle || "");
    renderList();
    renderFooter();
    // The card's count follows what the server just said, so the page and the thread cannot disagree.
    __bookingThreadSyncCount(id, state.messages.length);
  }

  window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/messages", { method: "GET" })
    .then(function (res) { return res.json().catch(function () { return null; }).then(function (raw) { return { ok: res.ok, raw: raw }; }); })
    .then(function (r) {
      if (!r.ok) {
        listWrap.textContent = "";
        listWrap.appendChild(El("p", { className: "text-center text-sm text-gray-500 py-6", textContent: (r.raw && r.raw.message) ? String(r.raw.message) : "We could not open this conversation just now. Close this and try again in a moment." }));
        footer.textContent = "";
        return;
      }
      apply(r.raw && r.raw.data);
    })
    .catch(function (err) {
      listWrap.textContent = "";
      listWrap.appendChild(El("p", { className: "text-center text-sm text-gray-500 py-6", textContent: String((err && err.message) || "Network error. Please try again.") }));
      footer.textContent = "";
    });
}

// sir, 2026-08-02: either party can report a conversation, and it lands in the same administrator
// queue as the automatic scan. Same control, same words, same prompt as the private-table thread.
function __bookingThreadReport(bookingId) {
  var id = String(bookingId || "").trim();
  if (!id) return;
  window.tstsPrompt("What happened? Our team reads every report and will review this conversation.", "", { confirmText: "Send report", placeholder: "e.g. I was asked to pay outside the platform", minLength: 5 }).then(function (reason) {
    if (!reason) return;
    window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/messages/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: String(reason) })
    }).then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); }).then(function (r) {
      if (r.ok && r.d && r.d.ok) { if (window.tstsNotify) window.tstsNotify("Thanks for telling us. Our team will review this conversation.", "success"); }
      else { if (window.tstsNotify) window.tstsNotify((r.d && r.d.message) || "Couldn't send the report. Please try again.", "error"); }
    }).catch(function () { if (window.tstsNotify) window.tstsNotify("Couldn't send the report. Please try again.", "error"); });
  });
}

// The card that opened the thread keeps its count honest without a whole page reload.
function __bookingThreadSyncCount(bookingId, count) {
  try {
    var rows = [];
    if (Array.isArray(hostBookingsCache)) rows = rows.concat(hostBookingsCache);
    if (Array.isArray(guestBookingsCache)) rows = rows.concat(guestBookingsCache);
    rows.forEach(function (b) {
      if (!b || String(b._id || "") !== String(bookingId)) return;
      if (!b.messaging || typeof b.messaging !== "object") b.messaging = { available: true, messageCount: 0 };
      b.messaging.messageCount = Number(count) || 0;
    });
    var btns = document.querySelectorAll('[data-action="booking-message"][data-booking-id="' + String(bookingId).replace(/"/g, "") + '"]');
    Array.prototype.forEach.call(btns, function (btn) {
      var label = btn.getAttribute("data-label") || "";
      if (!label) return;
      var span = btn.querySelector("[data-message-label]");
      if (span) span.textContent = " " + label + (Number(count) > 0 ? (" (" + Number(count) + ")") : "");
    });
  } catch (_syncErr) { void _syncErr; }
}

// The one maker for the button, so the host's modal and the guest's card can never drift apart.
// sir's brief: one primary button, in the platform's own primary style — the same `tsts-btn-primary`
// the page's other single primary action (Write a review) wears, never a browser default.
function __bookingMessageButton(bookingId, role, count, opts) {
  var El = window.tstsEl;
  var o = opts || {};
  var label = (String(role) === "host") ? "Message guest" : "Message host";
  var btn = El("button", {
    type: "button",
    className: o.className || "w-full md:w-auto px-5 py-2 tsts-btn-primary text-sm font-bold rounded-xl shadow transition flex items-center justify-center gap-2",
    "data-action": "booking-message",
    "data-booking-id": String(bookingId || ""),
    "data-role": String(role || ""),
    "data-label": label,
    "aria-label": label
  }, [
    El("i", { className: "fas fa-comments" }),
    El("span", { "data-message-label": "1", textContent: " " + label + (Number(count) > 0 ? (" (" + Number(count) + ")") : "") })
  ]);
  return btn;
}

// Owner 2026-06-05 — counter-offer (guest side): accept one of the host's proposed alternative
// dates → server places a FRESH hold on the chosen slot and returns the hold-checkout URL →
// redirect there (the guest is charged only once the booking auto-confirms). Decline → close.
async function handleGuestAcceptAlternative(requestId, groupName, btn) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const sel = groupName ? document.querySelector('input[name="' + groupName + '"]:checked') : null;
  const parts = String((sel && sel.value) || "").split("|");
  const date = String(parts[0] || "").trim();
  const time = String(parts[1] || "").trim();
  if (!date || !time) { window.tstsNotify("Pick one of the proposed dates first.", "warning"); return; }
  // Owner 2026-06-10 — money action: confirm before capturing the hold. sir 2026-08-07: the popup
  // shows the booking as the approved card, built around the date the guest is CHOOSING (not the one
  // they originally asked for), so they can see exactly what they are committing to.
  var __accRow = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).find(function (r) { return String((r && (r._id || r.id)) || "") === id; });
  var __acceptLbl = "";
  try { var __aL = (sel && sel.closest) ? sel.closest("label") : null; __acceptLbl = __aL ? String(__aL.textContent || "").replace(/\s+/g, " ").trim() : ""; } catch (_aLErr) { __acceptLbl = ""; }
  // sir's APPROVED copy [log E2.10] — restored verbatim; the card is the only addition.
  var __acceptMsg = "Confirm your private table" + (__acceptLbl ? (" for " + __acceptLbl) : "") + "? We'll capture the payment you already have on hold and lock in your booking, with no extra charge.";
  var __acceptOk = window.tstsConfirm
    ? await window.tstsConfirm(__acceptMsg, { card: __prConfirmCard(__accRow, date, time, "capture") })
    : window.confirm(__acceptMsg);
  if (!__acceptOk) return;
  if (btn) { btn.disabled = true; btn.textContent = "Confirming…"; }
  try {
    // Owner 2026-06-10 — KEEP-THE-HOLD: accepting captures the payment already on hold and confirms
    // instantly (no second checkout). Server returns { confirmed:true }; reload to show the Confirmed card.
    const res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/accept-alternative", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: date, time: time })
    });
    const raw = await res.json().catch(function () { return null; });
    if (res.ok && raw && raw.data && raw.data.confirmed) {
      window.tstsNotify("Your private table is confirmed!", "success");
      await loadTrips();
      return;
    }
    window.tstsNotify((raw && raw.message) ? String(raw.message) : "Couldn't confirm the booking. Please try again.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Accept this date"; }
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) { btn.disabled = false; btn.textContent = "Accept this date"; }
  }
}

async function handleGuestDeclineAlternative(requestId, btn) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const msg = "Decline these dates? This closes the request and releases your payment hold. No charge is made.";
  const __decRow = (Array.isArray(privateRequestsCache) ? privateRequestsCache : []).find(function (r) { return String((r && (r._id || r.id)) || "") === id; });
  const ok = window.tstsConfirm
    ? await window.tstsConfirm(msg, { card: __prConfirmCard(__decRow, null, null, "release") })
    : window.confirm(msg);
  if (!ok) return;
  if (btn) btn.disabled = true;
  try {
    const res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(id) + "/decline-alternative", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const raw = await res.json().catch(function () { return null; });
    if (!res.ok) { window.tstsNotify((raw && raw.message) ? String(raw.message) : "Couldn't decline this offer.", "error"); if (btn) btn.disabled = false; return; }
    window.tstsNotify("Offer declined.", "success");
    await loadTrips();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
    if (btn) btn.disabled = false;
  }
}

function focusDashboardDeepLinkPanel() {
  const panel = String((dashboardDeepLink && dashboardDeepLink.panel) || "").trim().toLowerCase();
  if (!panel) return;

  // O-142 (sir, 2026-09-16): the link in a message letter opens that booking's conversation, once.
  // The id is cleared afterwards so a re-render of the dashboard does not reopen it over and over.
  if (panel === "messages") {
    const __msgBookingId = String((dashboardDeepLink && dashboardDeepLink.bookingId) || "").trim();
    if (__msgBookingId) {
      dashboardDeepLink.bookingId = "";
      const __msgRole = String((dashboardDeepLink && dashboardDeepLink.tab) || "").trim().toLowerCase() === "hosting" ? "host" : "guest";
      openBookingMessageThread(__msgBookingId, __msgRole);
    }
    return;
  }

  let target = null;
  if (panel === "connection-actions") {
    target = document.getElementById("user-connection-actions-panel");
  }
  if (!target) return;

  try {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (_) {
    target.scrollIntoView();
  }
  target.classList.add("ring-2", "ring-amber-200");
  setTimeout(function () {
    try { target.classList.remove("ring-2", "ring-amber-200"); } catch (_) {}
  }, 2200);
}

/* ====================== HOSTING DASHBOARD ====================== */

function normalizeHostVerificationStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "requested") return "requested";
  if (s === "under_review") return "under_review";
  if (s === "verified") return "verified";
  if (s === "rejected") return "rejected";
  return "none";
}

function hostVerificationLabel(status) {
  const s = normalizeHostVerificationStatus(status);
  if (s === "requested") return "Requested";
  if (s === "under_review") return "Under review";
  if (s === "verified") return "Verified";
  if (s === "rejected") return "Rejected";
  return "Not requested";
}

function hostVerificationChipClass(status) {
  const s = normalizeHostVerificationStatus(status);
  if (s === "verified") return "bg-emerald-100 text-emerald-700";
  if (s === "under_review") return "bg-blue-100 text-blue-700";
  if (s === "requested") return "bg-amber-100 text-amber-700";
  if (s === "rejected") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function normalizeStripeConnectStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "connected") return "connected";
  if (s === "pending") return "pending";
  if (s === "error") return "error";
  return "disconnected";
}

// The payout state in words a host can act on. The stored token names our payment provider's
// state machine; the host only needs to know whether their money has somewhere to land.
function __payoutStatusWords(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "connected") return "Set up";
  if (s === "pending") return "Being checked";
  if (s === "error") return "Needs your attention";
  return "Not set up yet";
}

function parseHostVerificationPayload(payload) {
  const root = (payload && typeof payload === "object") ? payload : {};
  const data = (root.data && typeof root.data === "object") ? root.data : root;
  const hostVerification = (data.hostVerification && typeof data.hostVerification === "object") ? data.hostVerification : {};
  const feePolicy = (data.feePolicy && typeof data.feePolicy === "object") ? data.feePolicy : {};
  const stripeConnect = (data.stripeConnectStandard && typeof data.stripeConnectStandard === "object") ? data.stripeConnectStandard : {};
  const feePercentRaw = Number(feePolicy.feePercent);
  const feePercent = Number.isFinite(feePercentRaw) ? Math.round(Math.max(0, Math.min(20, feePercentRaw)) * 10) / 10 : 5.0;
  return {
    hostVerification: {
      status: normalizeHostVerificationStatus(hostVerification.status),
      requestedAt: hostVerification.requestedAt || null,
      reviewedAt: hostVerification.reviewedAt || null,
      verifiedAt: hostVerification.verifiedAt || null,
      rejectedAt: hostVerification.rejectedAt || null,
      note: String(hostVerification.note || "")
    },
    feePolicy: {
      feePercent: feePercent,
      policyVersion: String(feePolicy.policyVersion || "")
    },
    stripeConnectStandard: {
      status: normalizeStripeConnectStatus(stripeConnect.status),
      connected: !!stripeConnect.connected,
      accountIdMasked: String(stripeConnect.accountIdMasked || ""),
      connectedAt: stripeConnect.connectedAt || null,
      lastError: String(stripeConnect.lastError || "")
    },
    adminEmail: String(data.adminEmail || "admin@thesharedtablestory.com")
  };
}

async function requestHostVerification() {
  const res = await window.authFetch("/api/host/verification/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "Host verification request failed."));
  }
}

async function startStripeConnectStandard() {
  const res = await window.authFetch("/api/stripe/connect/standard/start", { method: "POST" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(mapStripeConnectStartError(payload, res.status));
  }
  const data = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
  const url = String((data && data.url) || "").trim();
  if (!url) throw new Error("We couldn't start your Stripe payout setup just now. Please try again.");
  // Validate redirect, only allow Stripe domains
  try {
    var _sParsed = new URL(url);
    if (!_sParsed.hostname.endsWith("stripe.com")) {
      throw new Error("We couldn't open Stripe securely just now. Please try again, and contact support if it keeps happening.");
    }
  } catch (_e) {
    if (_e && _e.message === "We couldn't open Stripe securely just now. Please try again, and contact support if it keeps happening.") throw _e;
    throw new Error("We couldn't open Stripe securely just now. Please try again, and contact support if it keeps happening.");
  }
  window.location.href = url;
}

async function disconnectStripeConnectStandard() {
  const res = await window.authFetch("/api/stripe/connect/standard/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "We couldn't disconnect your Stripe payout account just now. Please try again."));
  }
}

function renderHostVerificationSection(verificationData) {
  const El = window.tstsEl;
  const data = verificationData || parseHostVerificationPayload({});
  const hv = data.hostVerification || {};
  const feePolicy = data.feePolicy || {};
  const stripeConnect = data.stripeConnectStandard || {};
  const status = normalizeHostVerificationStatus(hv.status);
  const statusLabel = hostVerificationLabel(status);
  const statusClass = hostVerificationChipClass(status);
  const canRequest = status === "none" || status === "rejected";
  const stripeStatus = normalizeStripeConnectStatus(stripeConnect.status);
  const stripeConnected = !!stripeConnect.connected;

  const noteLine = (status === "rejected" && hv.note)
    ? ("Admin note: " + hv.note)
    : (status === "verified"
      ? "Verified hosts can request event verification from each listing edit screen."
      : "Submit a host verification request to begin review.");

  const requestBtn = El("button", {
    type: "button",
    className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition " + (canRequest ? "tsts-btn-primary" : "bg-gray-200 text-gray-500 cursor-not-allowed"),
    textContent: canRequest ? "Request host verification" : "Host verification submitted",
    disabled: !canRequest
  });
  requestBtn.addEventListener("click", async function () {
    try {
      requestBtn.disabled = true;
      await requestHostVerification();
      window.tstsNotify("Host verification request submitted.", "success");
      await loadHost();
    } catch (err) {
      requestBtn.disabled = false;
      window.tstsNotify(String((err && err.message) || "Host verification request failed."), "error");
    }
  });

  const connectBtn = El("button", {
    type: "button",
    // Owner 2026-07-24 (sir: consistent design language): was off-palette blue — TSTS uses orange/ink/slate.
    // Disconnected = primary orange CTA (getting paid is the point); connected = calm emerald confirmation.
    className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition " + (stripeConnected ? "bg-emerald-100 text-emerald-700 cursor-not-allowed" : "tsts-btn-primary shadow"),
    textContent: stripeConnected ? "Stripe connected" : "Connect Stripe payouts",
    disabled: stripeConnected
  });
  connectBtn.addEventListener("click", async function () {
    try {
      connectBtn.disabled = true;
      await startStripeConnectStandard();
    } catch (err) {
      connectBtn.disabled = false;
      // PROVEN ON SCREEN 2026-08-22 with a real API outage: a native fetch failure is a
      // TypeError whose .message is the BROWSER's own words — "Failed to fetch" — and being
      // truthy it sailed past the || fallback and printed to the host. Our own throws are
      // Error (never TypeError), so the human sentences from mapStripeConnectStartError still
      // show. Same shape as initiateStripeConnect's catch, which never had this hole.
      var __connectMsg = (err && err.message && !(err instanceof TypeError))
        ? String(err.message)
        : "We couldn't start your Stripe payout setup just now. Please try again.";
      window.tstsNotify(__connectMsg, "error");
    }
  });

  const disconnectBtn = El("button", {
    type: "button",
    className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold border border-red-200 text-red-700 hover:bg-red-50 transition" + (stripeConnected ? "" : " hidden"),
    textContent: "Disconnect Stripe"
  });
  disconnectBtn.addEventListener("click", async function () {
    var confirmed = await window.tstsConfirm("Disconnect Stripe payout account?", { destructive: true, confirmText: "Disconnect" });
    if (!confirmed) return;
    try {
      disconnectBtn.disabled = true;
      await disconnectStripeConnectStandard();
      window.tstsNotify("Stripe payout account disconnected.", "success");
      await loadHost();
    } catch (err) {
      disconnectBtn.disabled = false;
      // Same hole as the connect button above: a dead network yields TypeError("Failed to
      // fetch") and the host read the browser's words instead of ours.
      var __disconnectMsg = (err && err.message && !(err instanceof TypeError))
        ? String(err.message)
        : "We couldn't disconnect your Stripe payout account just now. Please try again.";
      window.tstsNotify(__disconnectMsg, "error");
    }
  });

  const docMailto = window.tstsSafeMailto ? window.tstsSafeMailto(data.adminEmail) : "";
  const docSubmitButton = docMailto
    ? El("a", {
      href: docMailto,
      className: "inline-flex items-center px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition",
      textContent: "Send ID proof by email"
    })
    : El("span", {
      className: "inline-flex items-center px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold",
      textContent: "Send ID proof to " + data.adminEmail
    });

  // Owner 2026-06-12: the fee-policy "version" is a raw ISO timestamp internally — never show that to a
  // host. Render it as a friendly date when it parses as one; otherwise show the label as-is, else "Current".
  var __pvRaw = String(feePolicy.policyVersion || "").trim();
  var __pvDate = __pvRaw ? safeDate(__pvRaw) : null;
  var __policyVersionLabel = __pvDate
    ? __pvDate.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : (__pvRaw || "Current");

  return El("section", { className: "space-y-4 mb-8" }, [
    // Owner 2026-07-24 (sir: tabs must be "in line with other tabs locked by me"): heading unified to the
    // locked-tab pattern (heading-serif + text-tsts-ink), matching My Listings / Bookings — was sans/gray-900.
    El("div", { className: "space-y-0.5" }, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Host Verification & Payout Setup" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "Your identity check and payout account. Everything guests need to trust you, and everything you need to get paid." })
    ]),
    El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4" }, [
      El("div", { className: "flex flex-wrap items-center gap-2" }, [
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full " + statusClass, textContent: "Host verification: " + statusLabel }),
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700", textContent: "Event verification fee policy: " + feePolicy.feePercent.toFixed(1) + "%" }),
        // Was "Stripe payout: error" / "…disconnected" — the vendor's name and the machine's word
        // for a state the host is meant to act on. The sibling chip beside it already speaks
        // in labels; this one now does too.
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700", textContent: "Getting paid: " + __payoutStatusWords(stripeStatus) })
      ]),
      El("p", { className: "text-sm text-slate-600", textContent: noteLine }),
      El("div", { className: "text-xs text-slate-500 grid grid-cols-1 md:grid-cols-2 gap-2" }, [
        El("span", { textContent: "Fee policy updated: " + __policyVersionLabel }),
        El("span", { textContent: "Connected account: " + (stripeConnect.accountIdMasked || "Not connected") })
      ]),
      El("div", { className: "flex flex-wrap items-center gap-2" }, [requestBtn, docSubmitButton, connectBtn, disconnectBtn])
    ])
  ]);
}

// Owner 2026-06-12 (sir: "the verification badge pop up is ----"): replaced the generic text confirm with
// a proper branded modal — shield mark, what-verified-hosts-have checklist, clear submit/cancel, inline
// loading + success/error. POST logic unchanged (verified-opt-in; authFetch auto-attaches CSRF).
function requestVerifiedBadge(expId) {
  if (!expId) return;
  var El = window.tstsEl;

  var backdrop = El("div", { className: "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4", role: "dialog", "aria-modal": "true" });
  var modal = El("div", { className: "bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" });
  function close() { try { document.body.removeChild(backdrop); } catch (_c) { return; } }
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });

  var list = El("ul", { className: "space-y-2" });
  [
    "Government ID submitted and identity check passed",
    "A complete listing: photos, description, and address",
    "A track record guests can trust"
  ].forEach(function (c) {
    list.appendChild(El("li", { className: "flex items-start gap-2 text-sm text-gray-700" }, [
      El("span", { className: "text-emerald-600 font-bold mt-0.5", textContent: "✓" }),
      El("span", { textContent: c })
    ]));
  });

  var submitBtn = El("button", { className: "px-5 py-2.5 tsts-btn-primary text-sm font-bold rounded-xl shadow", textContent: "Continue to verification" });
  var cancelBtn = El("button", { className: "px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition", textContent: "Not now" });
  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", function () {
    // Owner 2026-06-12 FIX: the old handler POSTed an empty body to /verified-opt-in, but that endpoint
    // REQUIRES a written dossier (event plan, safety measures, promise of fulfilment, capacity rationale),
    // so it always failed and surfaced raw field names. The real submission form lives on the listing edit
    // screen (openEventVerificationModal); route the host there with verify=1 so that form opens for them.
    window.location.href = "host.html?edit=" + encodeURIComponent(expId) + "&verify=1";
  });

  modal.appendChild(El("div", { className: "p-6 space-y-4" }, [
    El("div", { className: "flex items-center gap-3" }, [
      El("div", { className: "w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xl flex-shrink-0" }, [El("i", { className: "fa-solid fa-shield-halved" })]),
      El("div", {}, [
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Get your listing verified" }),
        El("p", { className: "text-sm text-gray-500", textContent: "The blue badge tells guests this experience is the real thing." })
      ])
    ]),
    El("div", { className: "rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-2" }, [
      El("p", { className: "text-xs font-bold uppercase tracking-wide text-gray-500", textContent: "What verified hosts have" }),
      list
    ]),
    El("p", { className: "text-sm text-gray-500", textContent: "On the next screen you'll add a few details about your event, then submit for review. It's free, optional, and reviewed within 3 to 5 business days." }),
    El("div", { className: "flex items-center justify-end gap-3 pt-1" }, [cancelBtn, submitBtn])
  ]));
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

/* ====================== DELETE LISTING (host-side) ======================
   Owner rule (2026-05-02): no OTP, explicit typed "DELETE" is the security gate.
   Modal must show: bookingCount, refund total (100% to guests at host's cost),
   5% platform recovery owed by host, total due. Backend sends summary email
   after delete via HOST_LISTING_DELETED event. */
function __fmtMoney(cents, currency) {
  // Owner 2026-06-12: currency-aware (was a bare "$"). Uses the listing's own currency.
  return centsToMoney(Number(cents) || 0, currency || "aud");
}

async function __safeJson(resp) {
  try { return await resp.json(); }
  catch (_jsonErr) { return null; }
}

// sir's draft flow (2026-08-08). Activate publishes THIS draft; Discard removes it. Neither touches the
// original it was copied from — "one entry remsin as deleted original one and new activate lisitng goes to
// active one".
// sir 2026-08-08, verbatim: "one you click on edit for live listing with booking onle capacity must be
// avaibale for edit wit plus minuse sign so that host doesnt have to type is ashsole and nothing else wiht
// capaicty lower bound locked to current booking, current booking remains active and. guest shouls be able
// to. see it -- the experience remian live with listing being paused for new booking".
//
// Capacity alone. Plus and minus, never typing. Minus stops dead at the guests already booked — the host
// cannot strand a paying guest, and the way to go lower is to cancel and refund, not to edit.
// One modal shell for every host dialog on this tab — the platform card (rounded-3xl + shadow-soft-card +
// cream edge) with the site's fade/scale entrance. Built by hand rather than passed to tstsConfirm, which
// renders its message with String(msg) — a DOM node arrives there as "[object HTMLDivElement]".
function __hostModalShell(build, ariaLabel, opts) {
  var El = window.tstsEl;
  var o = opts || {};
  return new Promise(function (resolve) {
    var overlay = El("div", { className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200" });
    var card = El("div", { className: "bg-white rounded-3xl shadow-soft-card border border-tsts-cream " + (o.wide ? "max-w-lg" : "max-w-sm") + " w-full p-6 space-y-4 transform scale-95 opacity-0 transition-all duration-200", role: "dialog", "aria-modal": "true", "aria-label": ariaLabel });
    card.style.maxHeight = "85vh";
    card.style.overflowY = "auto";
    var closing = false;
    var close = function (v) {
      if (closing) return; closing = true;
      overlay.classList.remove("opacity-100"); overlay.classList.add("opacity-0");
      card.classList.remove("scale-100", "opacity-100"); card.classList.add("scale-95", "opacity-0");
      setTimeout(function () { try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (_x) { void _x; } resolve(v); }, 200);
    };
    build(card, close);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      overlay.classList.remove("opacity-0"); overlay.classList.add("opacity-100");
      card.classList.remove("scale-95", "opacity-0"); card.classList.add("scale-100", "opacity-100");
    }); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(null); });
  });
}

// ── PER-EVENING CONTROLS (frontend) ──────────────────────────────────────────
// sir 2026-08-08: "why cant my edit button or delete button ask me if i want to makges i nwhole sries or
// just one event with option to pick all the avaibale eents and then makd e specific changes? and why cant
// a host see in all the dates and time slots for that event in all the applicable tabs?"
// The engine (dateOverrides) always existed server-side; no screen ever exposed it. This is that screen.

function __occWhen(o) {
  var d = String((o && o.date) || "");
  try { if (window.tstsFormatDateShort) d = String(window.tstsFormatDateShort(d) || d); } catch (_e) { void _e; }
  var t = __formatPrivateRequestTimeRange12h(String((o && o.slot) || ""));
  return d + (t ? ("  ·  " + t) : "");
}

async function __fetchHostOccurrences(expId) {
  var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/occurrences", { method: "GET" });
  var payload = await __safeJson(res);
  if (!res.ok || !payload || !payload.ok) throw new Error(String((payload && payload.message) || "We couldn't load this listing's dates just now."));
  return (payload.data || {}).occurrences || [];
}

// The picker — sir's approved offer-card pattern (rows of date · time on white cards, orange accents),
// with checkboxes because sir asked for "option to pick all the avaibale eents". Rows that cannot be
// picked grey out WITH the reason, per sir's 2026-08-07 rule that unavailable choices grey out and say why.
function pickOccurrences(expId, o) {
  var El = window.tstsEl;
  var opts = o || {};
  return __hostModalShell(function (card, close) {
    card.appendChild(El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink text-center", textContent: String(opts.heading || "Pick the dates") }));
    if (opts.subline) card.appendChild(El("p", { className: "text-sm text-tsts-ink text-center", textContent: String(opts.subline) }));
    var listWrap = El("div", { className: "space-y-2" });
    // The LIST scrolls, never the buttons. First walk of this dialog had 27 dates: the whole card
    // scrolled and Cancel/Continue disappeared below the fold — a click that decides refunds must never
    // need hunting for. Found by my own walk before sir saw it.
    listWrap.style.maxHeight = "48vh";
    listWrap.style.overflowY = "auto";
    card.appendChild(listWrap);
    listWrap.appendChild(El("p", { className: "text-sm text-gray-500 text-center py-4", textContent: "Loading dates…" }));

    var chosen = new Map(); // key -> occurrence
    var goBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl tsts-btn-primary text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed", textContent: String(opts.actionLabel || "Continue"), disabled: true });
    var cancelBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl border text-tsts-ink text-sm font-semibold hover:bg-tsts-cream transition", textContent: "Cancel" });
    cancelBtn.style.borderColor = "rgb(122 84 60)";
    cancelBtn.addEventListener("click", function () { close(null); });
    goBtn.addEventListener("click", function () { if (chosen.size > 0) close(Array.from(chosen.values())); });
    card.appendChild(El("div", { className: "flex justify-center gap-2 pt-2" }, [cancelBtn, goBtn]));

    __fetchHostOccurrences(expId).then(function (occ) {
      listWrap.replaceChildren();
      if (!occ.length) {
        listWrap.appendChild(El("p", { className: "text-sm text-tsts-ink text-center py-4", textContent: "This listing has no upcoming dates." }));
        return;
      }
      occ.forEach(function (row, idx) {
        var key = row.date + "|" + row.slot;
        var booked = Number(row.bookedGuests || 0);
        var blockedForPick = !!(opts.disableBooked && booked > 0);
        var cb = El("input", { type: "checkbox", className: "accent-orange-600 w-4 h-4", id: "occ-pick-" + idx, disabled: blockedForPick });
        var right;
        if (booked > 0) {
          right = El("span", { className: "text-xs font-semibold " + (blockedForPick ? "text-gray-400" : "text-orange-700"), textContent: booked + " of " + (Number(row.capacity) > 0 ? row.capacity : "—") + " guests booked" });
        } else {
          right = El("span", { className: "text-xs text-gray-500", textContent: "No guests yet" });
        }
        var lab = El("label", {
          className: blockedForPick
            ? "flex items-center justify-between gap-2.5 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5 cursor-not-allowed"
            : "flex items-center justify-between gap-2.5 rounded-xl bg-white border border-orange-100 px-3 py-2.5 cursor-pointer hover:border-orange-300 transition",
          htmlFor: "occ-pick-" + idx
        }, [
          El("span", { className: "flex items-center gap-2.5" }, [cb, El("span", { className: "text-sm font-medium " + (blockedForPick ? "text-gray-400" : "text-tsts-ink"), textContent: __occWhen(row) })]),
          right
        ]);
        cb.addEventListener("change", function () {
          // sir's no-mixing rule (2026-08-09) made structural: in single mode only ONE date can be
          // chosen at a time, so a booked and an unbooked date can never travel in one request.
          if (opts.single && cb.checked) {
            listWrap.querySelectorAll('input[type="checkbox"]').forEach(function (other) {
              if (other !== cb && other.checked) { other.checked = false; }
            });
            chosen.clear();
          }
          if (cb.checked) chosen.set(key, row); else chosen.delete(key);
          goBtn.disabled = chosen.size === 0;
        });
        listWrap.appendChild(lab);
        if (blockedForPick) {
          listWrap.appendChild(El("p", { className: "text-xs text-gray-500 px-2 -mt-1", textContent: String(opts.disabledNote || "Guests are booked on this date, so its time can't change. Cancel the date instead and they'll be refunded.") }));
        }
        // sir's ruling 2026-08-09: unoffered dates must not appear anywhere — the API refuses creating
        // them, and the server no longer emits them, so the picker carries no special row for them.
      });
    }).catch(function (e) {
      listWrap.replaceChildren();
      listWrap.appendChild(El("p", { className: "text-sm text-red-600 text-center py-4", textContent: String((e && e.message) || "We couldn't load this listing's dates just now.") }));
    });
  }, String(o && o.heading || "Pick the dates"), { wide: true });
}

// Delete → "Particular dates": cancel picked evenings. Guests on them are refunded in full through the
// same canonical path the whole-listing Delete uses. Typed CANCEL when any picked evening has guests —
// the same strength of control sir chose for Delete ("control like Delete only").
async function cancelOccurrencesFlow(expId, listingTitle, ccy) {
  var El = window.tstsEl;
  var picked = await pickOccurrences(expId, {
    heading: "Cancel particular dates",
    subline: "Only the dates you pick are cancelled. The rest of “" + String(listingTitle || "this listing") + "” keeps running.",
    actionLabel: "Continue"
  });
  if (!picked || !picked.length) return;

  var withGuests = picked.filter(function (r) { return Number(r.bookedGuests || 0) > 0; });
  var refundCents = withGuests.reduce(function (n, r) { return n + Number(r.refundDueCents || 0); }, 0);
  var confirmWord = "";
  if (withGuests.length > 0) {
    var guestTotal = withGuests.reduce(function (n, r) { return n + Number(r.bookedGuests || 0); }, 0);
    var moneyLine = refundCents > 0 ? (centsToMoney(refundCents, ccy) + " goes back to them in full.") : "Their payments are returned in full.";
    var typed = await window.tstsPrompt(
      guestTotal + " guest" + (guestTotal === 1 ? " is" : "s are") + " booked on the date" + (picked.length === 1 ? "" : "s") + " you picked. Cancelling refunds every one of them. " + moneyLine + "\n\nType CANCEL to confirm.",
      "",
      { confirmText: "Cancel these dates", cancelText: "Keep them", placeholder: "CANCEL" }
    );
    if (typed === null || typeof typed === "undefined") return;
    if (String(typed).trim().toUpperCase() !== "CANCEL") {
      window.tstsNotify("Type CANCEL to confirm cancelling these dates.", "error");
      return;
    }
    confirmWord = "CANCEL";
  } else {
    var sure = await window.tstsConfirm(
      picked.length === 1 ? "Cancel this date? Nobody is booked on it, and the rest of your listing keeps running." : ("Cancel these " + picked.length + " dates? Nobody is booked on them, and the rest of your listing keeps running."),
      { confirmText: "Cancel the date" + (picked.length === 1 ? "" : "s"), cancelText: "Keep them" }
    );
    if (!sure) return;
  }

  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/occurrences/cancel", {
      method: "POST",
      body: JSON.stringify({ occurrences: picked.map(function (r) { return { date: r.date, slot: r.slot }; }), confirm: confirmWord })
    });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || !payload.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't cancel those dates just now."), "error");
      return;
    }
    var d = payload.data || {};
    var msg = String(d.message || "Done.");
    if (Number(d.guestsRefunded || 0) > 0) msg += " " + d.guestsRefunded + " guest" + (d.guestsRefunded === 1 ? " was" : "s were") + " refunded.";
    window.tstsNotify(msg, "success");
    try { loadHost(hostDashboardState.section); } catch (_r) { window.location.reload(); }
  } catch (_e) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

// ── EDIT A LIVE LISTING — sir's ruling 2026-08-09 ─────────────────────────────
// sir, verbatim: "When a live listing is clicked for edit, why must a host go through same 5 steps host
// creaton form and not just edit the informat. thy want to edit from what is there on the host cord
// itself for that event or series depending on choice? if i want only date edit why must i have go to
// whole steps and not just edit the date?"
//
// The 5-step wizard at host.html is how a listing is CREATED — someone starting from nothing, led step by
// step. Editing is not creation: the host already knows what they want to change and should change only
// that. So Edit opens ONE panel with every field on it, directly editable, and the host saves the one
// thing they came for. No steps, no second page, nothing to walk past.
//
// sir chose the panel over an in-card form: "Go ahead — but a panel, not on the card".
//
// The booked-listing rule is enforced here as it is on the server (LISTING_HAS_BOOKINGS, server.js
// ~19747): with guests booked, ONLY the guest count may change, and every other field is shown but
// locked WITH the reason — sir's standing rule that an unavailable control greys out and says why,
// rather than vanishing or failing when pressed.
async function openListingEditPanel(expId, listing) {
  var El = window.tstsEl;
  var seated = Number((listing && listing.__seatedGuests) || 0);
  var locked = seated > 0;
  // sir 2026-08-09: dates carved out of a series land in THIS panel too, never the creation wizard —
  // "if i want only date edit why must i have go to whole steps". A child is a draft, so its primary
  // action publishes it rather than merely saving.
  // Two different questions, and conflating them desynced a published child's schedule:
  //   isChildDraft — did this arrive straight from the carve, still unpublished? (drives "Publish these dates")
  //   isChild      — does it belong to a parent series at all? (drives "its dates ARE its schedule")
  // A child the host edits WEEKS later, from My Listings, is still a child; only the stored doc knows that.
  var isChildDraft = !!(listing && listing.__isChildDraft);
  var isChild = isChildDraft;
  var childDates = (listing && Array.isArray(listing.__carvedDates)) ? listing.__carvedDates.slice() : [];
  var parentTitle = String((listing && listing.__parentTitle) || "");

  // Load the listing's own values from the server rather than trusting the card — the card carries a
  // summary, and an editor must start from what is actually stored.
  var exp = null;
  try {
    var r = await window.authFetch("/api/experiences/" + encodeURIComponent(expId), { method: "GET" });
    var p = await __safeJson(r);
    exp = (p && (p.data || p.experience)) || null;
  } catch (_e) { void _e; }
  if (!exp) {
    window.tstsNotify("We couldn't open that listing just now. Please try again.", "error");
    return;
  }
  // The stored doc is the truth about parentage — the caller's flag only knows about a fresh carve.
  if (String(exp.parentExperienceId || "").trim().length > 0) isChild = true;
  if (isChild && childDates.length === 0 && Array.isArray(exp.carvedDates)) childDates = exp.carvedDates.slice();

  var BROWN = "rgb(122 84 60)";
  var changed = {};
  var newImages = Array.isArray(exp.images) ? exp.images.slice() : [];

  function field(labelText, node, hint) {
    var kids = [El("span", { className: "block text-xs font-semibold text-tsts-ink mb-1", textContent: labelText }), node];
    if (hint) kids.push(El("span", { className: "block text-xs text-gray-500 mt-1", textContent: hint }));
    return El("label", { className: "block" }, kids);
  }
  function input(key, value, opts) {
    var o = opts || {};
    var el = El("input", {
      type: o.type || "text",
      className: "border rounded-xl px-3 py-2 text-sm text-tsts-ink w-full disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
      // sir 2026-08-16 ("Fix it"): when a refused save reopens the editor, the host's typed
      // values survive — changed[] outlives the modal.
      value: (changed[key] != null) ? String(changed[key]) : (value == null ? "" : String(value))
    });
    if (o.min != null) el.min = String(o.min);
    if (o.step != null) el.step = String(o.step);
    if (o.maxLength) el.maxLength = o.maxLength;
    el.style.borderColor = BROWN;
    // Everything but the guest count is locked once guests hold seats — the same rule the server applies.
    el.disabled = locked && key !== "capacity";
    // The stale-stylesheet guard caught `disabled:bg-gray-50` resolving to NO rule: the locked fields
    // were getting grey text but keeping a white background, so a host looking at eleven locked fields
    // saw them as ordinary editable boxes. Same purge trap as w-[72px] on this screen. Applied inline,
    // the pattern this file already uses for classes the compiled sheet does not carry.
    if (el.disabled) { el.style.backgroundColor = "rgb(249 250 251)"; el.style.cursor = "not-allowed"; }
    el.addEventListener("input", function () { changed[key] = el.value; });
    return el;
  }

  // sir 2026-08-16 ("Fix it"): a refused save no longer throws the editor away — the modal
  // reopens with the server's sentence inline and the host's typed values intact.
  var __serverRefusal = "";
  while (true) {
  var saved = await __hostModalShell(function (card, close) {
    card.appendChild(El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink text-center", textContent: isChild ? "Edit these dates" : "Edit this listing" }));
    if (isChild) {
      var whenTxt = childDates.map(function (d) {
        try { return window.tstsFormatDateShort ? String(window.tstsFormatDateShort(d) || d) : d; } catch (_e) { return d; }
      }).join(" · ");
      card.appendChild(El("p", { className: "text-sm text-tsts-ink text-center", textContent: isChildDraft
        ? ((childDates.length === 1 ? "This date has" : "These " + childDates.length + " dates have") + " moved out of “" + (parentTitle || "your listing") + "” into a listing of their own. Change anything you like, then publish it.")
        : ((childDates.length === 1 ? "This date runs" : "These " + childDates.length + " dates run") + " on their own, apart from your original listing. Changes here affect only " + (childDates.length === 1 ? "this date." : "these dates.")) }));
      card.appendChild(El("p", { className: "text-xs font-semibold text-tsts-clay text-center", textContent: whenTxt }));
    } else {
      card.appendChild(El("p", { className: "text-sm text-tsts-ink text-center", textContent: locked
        ? (seated + " guest" + (seated === 1 ? " is" : "s are") + " booked on this listing, so only the number of guests can change. Everything else is locked while they hold their seats.")
        : "Change whatever you need and save. Nothing here is a step. Edit only what you came for." }));
    }

    // ── Photos ──
    var photoStrip = El("div", { className: "flex gap-2 flex-wrap" });
    function paintPhotos() {
      photoStrip.replaceChildren();
      newImages.forEach(function (url, i) {
        var wrap = El("div", { className: "relative" });
        var img = El("img", { src: url, alt: "Listing photo " + (i + 1), className: "rounded-xl object-cover" });
        img.style.width = "72px"; img.style.height = "54px";
        wrap.appendChild(img);
        if (!locked) {
          // Position + size through style: `-top-1.5`/`-right-1.5` are NOT in the compiled tailwind.css
          // (checked, not assumed — the same purge trap that has bitten this build twice tonight), so as
          // classes they would silently do nothing and drop the control into the corner of the photo.
          var x = El("button", { type: "button", className: "absolute rounded-full bg-white border text-xs font-bold text-tsts-ink leading-none", textContent: "×", "aria-label": "Remove photo " + (i + 1) });
          x.style.borderColor = BROWN;
          x.style.top = "-6px"; x.style.right = "-6px"; x.style.width = "20px"; x.style.height = "20px";
          x.addEventListener("click", function () { newImages.splice(i, 1); changed.images = newImages.slice(); paintPhotos(); });
          wrap.appendChild(x);
        }
        photoStrip.appendChild(wrap);
      });
      if (!locked) {
        // Same reason: w-[72px] / h-[54px] are arbitrary values absent from the compiled sheet, so the
        // tile collapsed to the size of its own text and the label spilled past its border on screen.
        var addLabel = El("label", { className: "rounded-xl border flex items-center justify-center text-xs font-semibold text-tsts-ink cursor-pointer hover:bg-tsts-cream transition" }, [El("span", { textContent: "+ Add" })]);
        addLabel.style.borderColor = BROWN;
        addLabel.style.width = "72px"; addLabel.style.height = "54px"; addLabel.style.flex = "0 0 auto";
        var fileIn = El("input", { type: "file", accept: "image/*", className: "hidden" });
        fileIn.addEventListener("change", async function () {
          var f = fileIn.files && fileIn.files[0];
          if (!f) return;
          if (!window.CLOUDINARY_URL) { window.tstsNotify("Photo uploads aren't configured in this environment.", "error"); return; }
          window.tstsNotify("Uploading photo…", "info");
          try {
            var fd = new FormData();
            fd.append("file", f);
            fd.append("upload_preset", "tsts_unsigned");
            var up = await fetch(window.CLOUDINARY_URL, { method: "POST", body: fd });
            var uj = await up.json().catch(function () { return null; });
            var url = uj && (uj.secure_url || uj.url);
            if (!url) throw new Error("no_url");
            newImages.push(String(url));
            changed.images = newImages.slice();
            paintPhotos();
            window.tstsNotify("Photo added.", "success");
          } catch (_upErr) {
            window.tstsNotify("That photo couldn't be uploaded. Please try another one.", "error");
          }
        });
        addLabel.appendChild(fileIn);
        photoStrip.appendChild(addLabel);
      }
    }
    paintPhotos();
    card.appendChild(field("Photos", photoStrip, locked ? "" : "The first photo is the one guests see on the card."));

    // ── The listing itself ──
    card.appendChild(field("Title", input("title", exp.title, { maxLength: 120 })));
    var desc = El("textarea", { className: "border rounded-xl px-3 py-2 text-sm text-tsts-ink w-full disabled:bg-gray-50 disabled:text-gray-400", rows: 3 });
    desc.value = (changed.description != null) ? String(changed.description) : String(exp.description || "");
    desc.style.borderColor = BROWN;
    desc.disabled = locked;
    // Same purge trap as the inputs above — the description box kept a white background when locked.
    if (desc.disabled) { desc.style.backgroundColor = "rgb(249 250 251)"; desc.style.cursor = "not-allowed"; }
    desc.addEventListener("input", function () { changed.description = desc.value; });
    card.appendChild(field("Description", desc));

    // ── Where ──
    var whereGrid = El("div", {}, [
      field("Address", input("addressLine", exp.addressLine, { maxLength: 200 })),
      field("Suburb", input("suburb", exp.suburb, { maxLength: 120 }))
    ]);
    whereGrid.style.display = "grid"; whereGrid.style.gridTemplateColumns = "1fr 1fr"; whereGrid.style.gap = "0.5rem";
    card.appendChild(whereGrid);
    var where2 = El("div", {}, [
      field("City", input("city", exp.city, { maxLength: 120 })),
      field("Postcode", input("postcode", exp.postcode, { maxLength: 12 }))
    ]);
    where2.style.display = "grid"; where2.style.gridTemplateColumns = "1fr 1fr"; where2.style.gap = "0.5rem";
    card.appendChild(where2);

    // ── When ──
    var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var have = new Set((Array.isArray(changed.availableDays) ? changed.availableDays : (Array.isArray(exp.availableDays) ? exp.availableDays : [])).map(String));
    var dayWrap = El("div", { className: "flex gap-1.5 flex-wrap" });
    DAYS.forEach(function (d) {
      var on = have.has(d);
      var b = El("button", { type: "button", className: "px-3 py-1.5 rounded-full text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed", textContent: d });
      b.style.borderColor = BROWN;
      b.style.backgroundColor = on ? "rgb(245 237 230)" : "";
      b.disabled = locked;
      b.addEventListener("click", function () {
        on = !on;
        b.style.backgroundColor = on ? "rgb(245 237 230)" : "";
        if (on) have.add(d); else have.delete(d);
        changed.availableDays = DAYS.filter(function (x) { return have.has(x); });
      });
      dayWrap.appendChild(b);
    });
    // A carved child runs on the dates it took with it, not a weekly pattern — showing day pills here
    // would invite a host to turn "14 and 21 August" back into every Friday, which is exactly the silent
    // corruption the creation wizard would have caused.
    if (!isChild) card.appendChild(field("Runs on", dayWrap));

    // Read the CURRENT time from wherever this listing actually keeps it: a child keeps it on its carved
    // dates, everything else on timeSlots. Reading only timeSlots opened the child's From/To blank, so a
    // host editing anything else would have saved an empty time over a real sitting.
    var slot0 = "";
    if (isChild) {
      var ovSlot = (Array.isArray(exp.dateOverrides) ? exp.dateOverrides : []).filter(function (o) { return o && Array.isArray(o.slots) && o.slots.length > 0; })[0];
      slot0 = ovSlot ? String(ovSlot.slots[0]) : "";
    } else {
      slot0 = String((Array.isArray(exp.timeSlots) && exp.timeSlots[0]) || "");
    }
    var mm = slot0.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    var startIn = input("startTime", mm ? mm[1] : "", { type: "time" });
    var endIn = input("endTime", mm ? mm[2] : "", { type: "time" });
    var timeGrid = El("div", {}, [field("From", startIn), field("To", endIn)]);
    timeGrid.style.display = "grid"; timeGrid.style.gridTemplateColumns = "1fr 1fr"; timeGrid.style.gap = "0.5rem";
    card.appendChild(timeGrid);

    // ── Money and guests ──
    // The platform caps how far a table may grow beyond what it was booked at (server.js ~19978). The
    // host is told the ceiling HERE, before they type — the walk found them typing 9, pressing Save and
    // only then being refused, which is friction the screen should have absorbed.
    var __base = Number(exp.originalMaxGuests || exp.maxGuests || 1);
    var __ceiling = __base + Math.max(2, Math.ceil(__base * 0.20));
    var capIn = input("capacity", exp.maxGuests != null ? exp.maxGuests : exp.capacity, { type: "number", min: 1, step: 1 });
    capIn.max = String(__ceiling);
    var moneyGrid = El("div", {}, [
      field("Price per guest (A$)", input("price", exp.price, { type: "number", min: 1, step: 1 })),
      field("Guests per event", capIn, "Up to " + __ceiling + " for this table.")
    ]);
    moneyGrid.style.display = "grid"; moneyGrid.style.gridTemplateColumns = "1fr 1fr"; moneyGrid.style.gap = "0.5rem";
    card.appendChild(moneyGrid);

    if (Number(exp.privatePrice) > 0 || Number(exp.privateCapacity) > 0) {
      var privGrid = El("div", {}, [
        field("Whole-table price (A$)", input("privatePrice", exp.privatePrice, { type: "number", min: 1, step: 1 })),
        field("Whole-table guests", input("privateCapacity", exp.privateCapacity, { type: "number", min: 1, step: 1 }))
      ]);
      privGrid.style.display = "grid"; privGrid.style.gridTemplateColumns = "1fr 1fr"; privGrid.style.gap = "0.5rem";
      card.appendChild(privGrid);
    }

    var err = El("p", { className: "text-xs text-red-600 text-center", textContent: String(__serverRefusal || "") });
    card.appendChild(err);

    var cancelBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl border text-tsts-ink text-sm font-semibold hover:bg-tsts-cream transition", textContent: "Cancel" });
    cancelBtn.style.borderColor = BROWN;
    var saveBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl tsts-btn-primary text-sm font-bold transition", textContent: isChildDraft ? "Publish these dates" : "Save changes" });
    cancelBtn.addEventListener("click", function () { close(false); });
    saveBtn.addEventListener("click", function () {
      // Publishing a fresh carve is a real action even with nothing edited; saving a live listing is not.
      if (!isChildDraft && !Object.keys(changed).length) { err.textContent = "Nothing has changed yet."; return; }
      if (changed.price != null && !(Number(changed.price) > 0)) { err.textContent = "The price has to be more than zero."; return; }
      if (changed.capacity != null && !(parseInt(changed.capacity, 10) >= 1)) { err.textContent = "The table has to seat at least one guest."; return; }
      if (changed.capacity != null && parseInt(changed.capacity, 10) > __ceiling) { err.textContent = "This table can seat up to " + __ceiling + " guests. To seat more, create a new listing."; return; }
      if ((changed.startTime || changed.endTime)) {
        var s = String(changed.startTime != null ? changed.startTime : (mm ? mm[1] : ""));
        var e2 = String(changed.endTime != null ? changed.endTime : (mm ? mm[2] : ""));
        if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e2)) { err.textContent = "Pick both a start and an end time."; return; }
        if (s >= e2) { err.textContent = "The end time has to be after the start time."; return; }
      }
      if (changed.availableDays && !changed.availableDays.length) { err.textContent = "Pick at least one day this runs on."; return; }
      close(true);
    });
    card.appendChild(El("div", { className: "flex justify-center gap-2 pt-2" }, [cancelBtn, saveBtn]));
  }, "Edit this listing", { wide: true });

  if (!saved) return;

  // Only what actually changed is sent — an editor that resubmits every field would trip the
  // booked-listing guard on fields the host never touched.
  var body = {};
  Object.keys(changed).forEach(function (k) {
    if (k === "price" || k === "privatePrice") body[k] = Number(changed[k]);
    else if (k === "capacity" || k === "privateCapacity") body[k] = parseInt(String(changed[k]), 10);
    else body[k] = changed[k];
  });
  if (body.startTime || body.endTime) {
    // A carved child has NO weekly pattern — its sittings live only in dateOverrides, so its current
    // time must be read from there. exp.timeSlots is deliberately empty on a child, and reading it
    // built a half range like "18:00-" whenever the host changed only one end of the time.
    var curSlot = "";
    if (isChild) {
      var ovNow = (Array.isArray(exp.dateOverrides) ? exp.dateOverrides : []).filter(function (o) { return o && Array.isArray(o.slots) && o.slots.length > 0; })[0];
      curSlot = ovNow ? String(ovNow.slots[0]) : "";
    } else {
      curSlot = (Array.isArray(exp.timeSlots) && exp.timeSlots[0]) ? String(exp.timeSlots[0]) : "";
    }
    var s2 = String(body.startTime || (curSlot ? curSlot.split("-")[0] : ""));
    var e3 = String(body.endTime || (curSlot ? curSlot.split("-")[1] : ""));
    var newSlot = s2 + "-" + e3;
    if (isChild) {
      // ONE schedule authority. The gate that admits a booking reads dateOverrides; when a time change
      // rewrote only timeSlots, the page offered 6:00 PM while the gate still held the carved 5:00 PM,
      // and every guest hit "This time slot is not offered for this experience." The dates carry the time.
      body.dateOverrides = childDates.map(function (d) { return { date: d, type: "replace", slots: [newSlot] }; });
      // timeSlots MUST stay empty on a child. __getSlotsForDate's legacy branch (server.js:1580) skips its
      // day guard when availableDays is empty and then returns timeSlots for ANY date — a populated
      // timeSlots would make the child bookable on every day of the year, which is the exact defect that
      // clearing it fixed. Its dates live in dateOverrides and nowhere else.
      delete body.timeSlots;
    } else {
      body.timeSlots = [newSlot];
      var wsDays = body.availableDays || (Array.isArray(exp.availableDays) ? exp.availableDays : []);
      var ws = {};
      wsDays.forEach(function (d) { ws[d] = [newSlot]; });
      body.weeklySchedule = ws;
    }
  } else if (body.availableDays) {
    var slotNow = (Array.isArray(exp.timeSlots) && exp.timeSlots[0]) ? String(exp.timeSlots[0]) : "";
    if (slotNow) { var ws2 = {}; body.availableDays.forEach(function (d) { ws2[d] = [slotNow]; }); body.weeklySchedule = ws2; }
  }

  try {
    if (Object.keys(body).length) {
      var res = await window.authFetch("/api/experiences/" + encodeURIComponent(expId), { method: "PUT", body: JSON.stringify(body) });
      var payload = await __safeJson(res);
      if (!res.ok || !payload || !payload.ok) {
        __serverRefusal = String((payload && payload.message) || "We couldn't save those changes just now.");
        continue;
      }
    }
    // A freshly carved child is a draft: publishing it is the SAME activate-draft the listing-level flow
    // already uses, not a second mechanism. A child that is ALREADY live must never be re-published —
    // it just saves, like any other listing.
    if (isChildDraft) {
      var ares = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/activate-draft", { method: "POST" });
      var apayload = await __safeJson(ares);
      if (!ares.ok || !apayload || !apayload.ok) {
        window.tstsNotify(String((apayload && apayload.message) || "Your changes are saved, but we couldn't publish those dates just now."), "error");
        try { loadHost(hostDashboardState.section); } catch (_r0) { window.location.reload(); }
        return;
      }
      window.tstsNotify(String(((apayload.data || {}).message) || "Those dates are live as their own listing."), "success");
    } else {
      window.tstsNotify("Your listing is updated.", "success");
    }
    try { loadHost(hostDashboardState.section); } catch (_r) { window.location.reload(); }
    return;
  } catch (_e2) {
    __serverRefusal = "We couldn't reach the server. Please check your connection and try again.";
    continue;
  }
  }
}

// Edit → "Particular dates" — sir's rulings 2026-08-09, verbatim:
//   "once a specific date or groupd or date is updated with new paraameter, it must become a new series
//    of event and show accordingly every where" · "the new series is child of main series"
//   "for event where there is no booking ,why a host is able a few patermeter and not each paratmer like
//    we had where it moves to draft stage?"
//
// So there is no cut-down dialog any more. Picked dates with no guests LEAVE this listing and become a
// child listing of their own, sitting in Draft — and the host edits it in the SAME full wizard they built
// the original with, then publishes it through the draft flow that already exists. Every parameter, one
// editor, no second mechanism.
async function editOccurrenceFlow(expId, listingTitle) {
  var picked = await pickOccurrences(expId, {
    heading: "Edit particular dates",
    subline: "Pick the dates of “" + String(listingTitle || "this listing") + "” you want to change. They move into a listing of their own, and the rest of this one keeps running.",
    // "Move to draft" is the platform's OWN approved word for this action — already the confirm label on
    // the listing-level draft gate (my-bookings.js ~6023). My first attempt invented "Move to a draft I
    // can edit": first-person and clumsy, in a product where every other control speaks plainly.
    actionLabel: "Move to draft",
    disableBooked: true,
    disabledNote: "Guests are booked on this date, so it stays here and only its guest numbers can change. Use its guest count on the card, or cancel the date to refund them."
  });
  if (!picked || !picked.length) return;

  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/occurrences/carve", {
      method: "POST",
      body: JSON.stringify({ occurrences: picked.map(function (r) { return { date: r.date, slot: r.slot }; }) })
    });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || !payload.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't move those dates into their own listing just now."), "error");
      return;
    }
    var d = payload.data || {};
    window.tstsNotify(String(d.message || "Those dates are now their own listing."), "success");
    // sir 2026-08-09: the same one panel, never the 5-step creation wizard.
    if (d.id) {
      await openListingEditPanel(String(d.id), {
        __isChildDraft: true,
        __carvedDates: Array.isArray(d.carvedDates) ? d.carvedDates : picked.map(function (r) { return r.date; }),
        __parentTitle: String(listingTitle || "")
      });
      return;
    }
    try { loadHost(hostDashboardState.section); } catch (_r) { window.location.reload(); }
  } catch (_e) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

// ── PREVIEW (sir's order O-146, 2026-09-16) ──
// sir, verbatim: "anything draft is just put a preview and nroever for booking to se the interest of
// people -- and aashole that preview should be after a bare minimu detailes of experience is put".
// The host turns it on from the draft itself. The seven things a draft must carry first are sir's own
// list (O-147) and they are checked by the server, so this screen never has to keep a second copy of
// the rule that could drift away from it; when the server refuses, it says exactly what is missing and
// that sentence is what the host reads.
async function setHostDraftPreview(expId, listingTitle, wantOn) {
  var titleStr = String(listingTitle || "this draft");
  if (!wantOn) {
    var offOk = await window.tstsConfirm(
      "Turn the preview off for \u201c" + titleStr + "\u201d?\n\nIt goes back to being private. Anyone who already told you they are interested stays on the list, and they will still hear from us when you publish.",
      { confirmText: "Turn preview off" }
    );
    if (!offOk) return;
  }
  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !!wantOn })
    });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || payload.ok !== true) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't change the preview just now. Please try again."), "error");
      return;
    }
    window.tstsNotify(String(((payload.data || {}).message) || (wantOn ? "Your preview is up." : "Preview is off.")), "success");
    // The same refresh the draft's other two actions use, read off them rather than guessed at: a
    // previous session invented a loadHostListings() that does not exist in this file.
    try { loadHost(hostDashboardState.section); } catch (_refreshErr) { window.location.reload(); }
  } catch (_previewErr) {
    window.tstsNotify("We couldn't change the preview just now. Please try again.", "error");
  }
}

// A BOOKED date: guest numbers and nothing else, and the date never leaves the market (guests hold seats
// on it). sir: "for booking where there is guest, it must only allowe capacity adn nothing else".
async function editOccurrenceCapacityFlow(expId, row) {
  var El = window.tstsEl;
  var floor = Math.max(1, Number(row.bookedGuests || 0));
  var value = Math.max(floor, Number(row.capacity || 0) || floor);
  var BROWN = "rgb(122 84 60)";
  var STEP_BTN = "h-12 w-12 rounded-2xl border text-tsts-ink flex items-center justify-center hover:bg-tsts-cream transition disabled:opacity-40 disabled:cursor-not-allowed";

  var saved = await __hostModalShell(function (card, close) {
    var valueEl = El("div", { className: "text-4xl font-bold text-tsts-ink text-center", textContent: String(value) });
    valueEl.style.fontVariantNumeric = "tabular-nums"; valueEl.style.minWidth = "4ch";
    var minusBtn = El("button", { type: "button", className: STEP_BTN, "aria-label": "One guest fewer" }, [window.tstsPlusMinus(true)]);
    var plusBtn = El("button", { type: "button", className: STEP_BTN, "aria-label": "One guest more" }, [window.tstsPlusMinus(false)]);
    minusBtn.style.borderColor = BROWN; plusBtn.style.borderColor = BROWN;
    function paint() { valueEl.textContent = String(value); minusBtn.disabled = value <= floor; }
    minusBtn.addEventListener("click", function () { if (value > floor) { value -= 1; paint(); } });
    plusBtn.addEventListener("click", function () { value += 1; paint(); });
    paint();
    var cancelBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl border text-tsts-ink text-sm font-semibold hover:bg-tsts-cream transition", textContent: "Cancel" });
    cancelBtn.style.borderColor = BROWN;
    var saveBtn = El("button", { type: "button", className: "px-5 py-2 rounded-2xl tsts-btn-primary text-sm font-bold transition", textContent: "Save" });
    cancelBtn.addEventListener("click", function () { close(false); });
    saveBtn.addEventListener("click", function () { close(true); });
    [
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink text-center", textContent: "How many guests?" }),
      El("p", { className: "text-sm text-tsts-ink text-center", textContent: __occWhen(row) + ". Guests are booked on this date, so only the number of guests can change. Everyone booked keeps their spot and the date stays live." }),
      El("div", { className: "flex items-center justify-center gap-5" }, [minusBtn, valueEl, plusBtn]),
      El("p", { className: "text-xs text-tsts-ink text-center", textContent: floor + " guest" + (floor === 1 ? " is" : "s are") + " seated on this date." }),
      El("div", { className: "flex justify-center gap-2 pt-2" }, [cancelBtn, saveBtn])
    ].forEach(function (n) { card.appendChild(n); });
  }, "How many guests?");
  if (!saved) return;

  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/occurrences/capacity", {
      method: "POST", body: JSON.stringify({ date: row.date, slot: row.slot, capacity: value })
    });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || !payload.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't update that date's guest numbers just now."), "error");
      return;
    }
    window.tstsNotify(String(((payload.data || {}).message) || "Guest capacity updated for that date."), "success");
    try { loadHost(hostDashboardState.section); } catch (_r) { window.location.reload(); }
  } catch (_e) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

async function activateHostDraft(expId, listingTitle) {
  if (!expId) return;
  var ok = await window.tstsConfirm("Publish \u201c" + String(listingTitle || "this draft") + "\u201d? Guests will be able to find and book it.", { confirmText: "Publish", cancelText: "Not yet" });
  if (!ok) return;
  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/activate-draft", { method: "POST" });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || !payload.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't publish that draft just now."), "error");
      return;
    }
    window.tstsNotify(String(((payload.data || {}).message) || "Your listing is live."), "success");
    // Same refresh the delete handler uses — loadHostListings does not exist; I invented that name and
    // caught it before it shipped.
    try { loadHost(hostDashboardState.section); } catch (_refreshErr) { window.location.reload(); }
  } catch (_e) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

async function discardHostDraft(expId, listingTitle) {
  if (!expId) return;
  var ok = await window.tstsConfirm("Discard the draft of \u201c" + String(listingTitle || "this listing") + "\u201d? Your original listing stays exactly as it is.", { confirmText: "Discard draft", cancelText: "Keep it" });
  if (!ok) return;
  try {
    var res = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/discard-draft", { method: "POST" });
    var payload = await __safeJson(res);
    if (!res.ok || !payload || !payload.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't discard that draft just now."), "error");
      return;
    }
    window.tstsNotify(String(((payload.data || {}).message) || "Draft discarded."), "success");
    // Same refresh the delete handler uses — loadHostListings does not exist; I invented that name and
    // caught it before it shipped.
    try { loadHost(hostDashboardState.section); } catch (_refreshErr) { window.location.reload(); }
  } catch (_e) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

async function deleteHostListing(expId, listingTitle, listingCurrency) {
  if (!expId) return;
  var El = window.tstsEl;
  var __ccy = String(listingCurrency || "aud");

  // 1. Fetch preview from backend
  var preview;
  try {
    var presRes = await window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/delete-preview", { method: "GET" });
    var presPayload = await __safeJson(presRes);
    if (!presRes.ok || !presPayload || !presPayload.ok) {
      window.tstsNotify(String((presPayload && presPayload.message) || "Could not load delete preview."), "error");
      return;
    }
    preview = presPayload.data || {};
  } catch (_e) {
    window.tstsNotify("Could not load delete preview.", "error");
    return;
  }

  var bookingCount = Number(preview.bookingCount || 0);
  var refundDue = Number(preview.refundDueCents || 0);
  var recoveryDue = Number(preview.recoveryDueCents || 0);
  var totalDue = Number(preview.totalDueCents || 0);

  // 2. Build modal
  var backdrop = El("div", { className: "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4", role: "dialog", "aria-modal": "true" });
  var modal = El("div", { className: "bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" });
  var content = El("div", { className: "p-6 space-y-5" });

  // Header
  content.appendChild(El("div", { className: "space-y-1" }, [
    El("h3", { className: "text-2xl font-bold text-gray-900 heading-serif", textContent: "Delete listing?" }),
    El("p", { className: "text-sm text-gray-600", textContent: "\"" + String(listingTitle || "this listing") + "\" will be removed from your account and from search." })
  ]));

  // Booking-aware section
  var infoSection;
  if (bookingCount === 0) {
    infoSection = El("div", { className: "rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900" }, [
      El("p", { className: "font-semibold", textContent: "No active bookings" }),
      El("p", { className: "mt-1", textContent: "This listing has no paid bookings, so no refunds or platform recovery are owed." })
    ]);
  } else {
    var rows = El("div", { className: "space-y-2 text-sm" }, [
      El("div", { className: "flex justify-between" }, [
        El("span", { className: "text-gray-600", textContent: "Active bookings cancelled" }),
        El("span", { className: "font-semibold text-gray-900", textContent: String(bookingCount) })
      ]),
      El("div", { className: "flex justify-between" }, [
        El("span", { className: "text-gray-600", textContent: "Refund to guests (100%, paid by you)" }),
        El("span", { className: "font-semibold text-gray-900", textContent: __fmtMoney(refundDue, __ccy) })
      ]),
      El("div", { className: "flex justify-between" }, [
        El("span", { className: "text-gray-600", textContent: "Platform recovery" }),
        El("span", { className: "font-semibold text-gray-900", textContent: __fmtMoney(recoveryDue, __ccy) })
      ]),
      El("div", { className: "flex justify-between pt-3 border-t border-red-200" }, [
        El("span", { className: "font-bold text-red-900", textContent: "Total due from you" }),
        El("span", { className: "font-bold text-red-900 text-lg", textContent: __fmtMoney(totalDue, __ccy) })
      ])
    ]);
    infoSection = El("div", { className: "rounded-xl bg-red-50 border border-red-200 p-4 space-y-3" }, [
      El("p", { className: "text-sm font-semibold text-red-900", textContent: "Refund summary, recovered from your future payouts" }),
      rows
    ]);
  }
  content.appendChild(infoSection);

  // Confirm-typing input
  content.appendChild(El("div", { className: "space-y-2" }, [
    El("label", { htmlFor: "host-delete-confirm-input", className: "block text-sm font-semibold text-gray-700", textContent: "Type DELETE to confirm" }),
    El("input", {
      id: "host-delete-confirm-input",
      type: "text",
      className: "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent transition text-base font-mono tracking-widest",
      placeholder: "DELETE",
      autocapitalize: "characters",
      autocomplete: "off",
      spellcheck: "false"
    })
  ]));

  // Action buttons
  var cancelBtn = El("button", {
    type: "button",
    className: "px-5 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition",
    textContent: "Cancel"
  });
  var confirmBtn = El("button", {
    type: "button",
    className: "px-5 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed",
    textContent: "Delete listing"
  });
  confirmBtn.disabled = true;
  content.appendChild(El("div", { className: "flex justify-end gap-2 pt-2" }, [cancelBtn, confirmBtn]));

  modal.appendChild(content);
  backdrop.appendChild(modal);

  // Wire input → enable button when typed correctly
  // BUG-076 (2026-05-15): case-sensitive match. Type-to-confirm gates (GitHub, Stripe,
  // Linear, Vercel) are intentionally case-sensitive — the friction of typing the
  // uppercase token is the security signal "this is destructive". The prior
  // `.toUpperCase()` calls let "delete" / "Delete" through, defeating the design.
  var input = content.querySelector("#host-delete-confirm-input");
  input.addEventListener("input", function () {
    confirmBtn.disabled = !isDeleteConfirmInputValid(input.value);
  });

  function teardown() {
    try { document.body.removeChild(backdrop); } catch (_removeErr) { /* already removed */ }
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") teardown(); }
  document.addEventListener("keydown", onKey);
  cancelBtn.addEventListener("click", teardown);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) teardown(); });

  // Confirm action
  // BUG-076 (2026-05-15): defence-in-depth case-sensitive guard — matches the
  // input-listener gate above. Both must require literal "DELETE".
  confirmBtn.addEventListener("click", async function () {
    if (!isDeleteConfirmInputValid(input.value)) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Deleting…";
    try {
      // BUG-077 (2026-05-15): manual CSRF parse removed; authFetch handles it.
      var delRes = await window.authFetch("/api/experiences/" + encodeURIComponent(expId), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" })
      });
      var delPayload = await __safeJson(delRes);
      if (!delRes.ok || !delPayload || !delPayload.ok) {
        window.tstsNotify(String((delPayload && delPayload.message) || "Could not delete listing."), "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Delete listing";
        return;
      }
      teardown();
      var d = delPayload.data || {};
      var msg;
      if (Number(d.bookingCount || 0) > 0) {
        msg = "Listing deleted. " + d.bookingCount + " booking(s) refunded, summary sent to your email.";
      } else {
        msg = "Listing deleted.";
      }
      window.tstsNotify(msg, "success");
      // Refresh dashboard
      try { loadHost(hostDashboardState.section); }
      catch (_refreshErr) { window.location.reload(); }
    } catch (_delErr) {
      window.tstsNotify("Could not delete listing.", "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Delete listing";
    }
  });

  document.body.appendChild(backdrop);
  setTimeout(function () { try { input.focus(); } catch (_focusErr) { /* focus failed; user can click */ } }, 50);
}

// Owner 2026-06-12 (sir: "super awesome, full rich data … proper links and proper backend and every button
// must work"): rich host-listing card — cover photo + status/verified/mode pills + location/schedule + rating
// + capacity + A$ price (shared & private) + bookings/waitlist/listed-date + a clean action row. Every link
// and button reuses the REAL, already-working handler (Edit → host.html?edit, View → experience.html?id,
// Get verified → requestVerifiedBadge, Delete → deleteHostListing, Create → host.html).
function renderHostListingsSection(listings, hostBookings, deletedListings, draftListings) {
  const El = window.tstsEl;
  const arr = Array.isArray(listings) ? listings : [];
  const wrap = El("section", { className: "space-y-4 mb-8" });

  // ---- Header: title + summary + Create CTA ----
  const verifiedN = arr.filter(function (e) { return String((e && e.verifiedStatus) || "").toLowerCase() === "verified"; }).length;
  const pausedN = arr.filter(function (e) { return (e && e.isPaused) || String((e && e.status) || "").toUpperCase() === "PAUSED"; }).length;
  wrap.appendChild(
    El("div", { className: "flex items-start justify-between gap-4 flex-wrap" }, [
      El("div", {}, [
        El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "My Listings" }),
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: arr.length + " experience" + (arr.length === 1 ? "" : "s") + " · " + verifiedN + " verified · " + pausedN + " paused" })
      ]),
      El("a", { href: "host.html", className: "inline-flex items-center gap-1.5 px-4 py-2.5 tsts-btn-primary text-sm font-bold rounded-xl shadow", textContent: "+ Create experience" })
    ])
  );

  const countByExperienceId = new Map();
  (Array.isArray(hostBookings) ? hostBookings : []).forEach(function (b) {
    const expId = String((b && (b.experienceId || (b.experience && b.experience._id))) || "").trim();
    if (!expId) return;
    // sir 2026-08-08: "if 1699is correct then why hte card read 600 booking and not the number of guests,
    // you think 1 person bookd 100 tables in one go then it will count as 1 booking?" — exactly. This
    // counted booking ROWS, so one person taking 100 seats read as "1 booking" and a host underestimated
    // their own table. The seed listing showed it plainly: 600 bookings but 1699 guests. Capacity is
    // counted in guests and the edit floor is counted in guests, so the card counts guests too.
    //
    // sir 2026-08-08, second ruling — "Only live guests — match the editor". Counting every row let
    // CANCELLED guests read as booked: "Sunset Pasta Making" said 43 booked on the card while the editor
    // said 37, the 6 difference being cancelled seats. The exclusion list below is copied from the server's
    // own filter in GET /capacity-edit (server.js ~20408, status $nin cancelled/refunded) rather than
    // invented here, so the card and the floor cannot drift apart again. Lower-cased so the frontend does
    // not have to care which casing a row carries.
    var __st = String((b && (b.status || b.bookingStatus)) || "").toLowerCase();
    if (__st === "cancelled" || __st === "refunded") return;
    // SEAT LAW + upcoming-only (sir 2026-08-09): the footer blended past dinners and pending request-
    // holds into one current-sounding "booked" figure — 37 when 31 were upcoming and only some seated.
    // sir: "it should be more like Total booking for upcoming datas". Seated rows (confirmed/completed
    // or paid), today's and future dates only — the same two laws every other number now follows.
    var __paid = String((b && b.paymentStatus) || "").toLowerCase() === "paid";
    if (!(__st === "confirmed" || __st === "completed" || __paid)) return;
    var __bd = String((b && b.bookingDate) || "").slice(0, 10);
    var __todayMel = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
    if (__bd && __bd < __todayMel) return;
    countByExperienceId.set(expId, Number(countByExperienceId.get(expId) || 0) + (Number(b && b.numGuests) || 1));
  });

  if (arr.length === 0) {
    wrap.appendChild(
      El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
        El("div", { className: "text-5xl mb-4", textContent: "🍽️" }),
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No listings yet" }),
        El("p", { className: "text-slate-500 mb-5", textContent: "Create your first experience and start welcoming guests to your table." }),
        El("a", { href: "host.html", className: "inline-flex items-center gap-1.5 px-5 py-2.5 tsts-btn-primary text-sm font-bold rounded-xl shadow", textContent: "+ Create experience" })
      ])
    );
    // No early return: a host with nothing live may still have paused or deleted listings, and those must
    // remain reachable in the Inactive section below rather than disappearing with the empty state.
  }

  function pill(text, cls) {
    return El("span", { className: "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full " + cls, textContent: text });
  }

  // sir 2026-08-08: "I said Delerted listing as a section called Deletred listing and top section as
  // Active Listings". The card body is identical for both sections — sir: "fillw same rick casrd as active
  // listing" — so the loop became a renderer that takes its target, rather than being copied.
  function renderListingCardsInto(list, target) {
  (Array.isArray(list) ? list : []).forEach(function (exp) {
    const expId = String((exp && (exp._id || exp.id)) || "").trim();
    const title = sanitizeExperienceTitle(String((exp && exp.title) || "Untitled listing"));
    const ccy = String((exp && exp.currency) || "aud");
    const bookingCount = Number(countByExperienceId.get(expId) || 0);
    const verifiedStatus = String((exp && exp.verifiedStatus) || "").trim().toLowerCase();
    const statusU = String((exp && exp.status) || "").toUpperCase();
    const isPaused = (exp && exp.isPaused) || statusU === "PAUSED";
    const mode = String((exp && exp.bookingMode) || "").toLowerCase();
    const money = function (p) { return centsToMoney(Math.round(Number(p || 0) * 100), ccy); };

    // ---- cover PHOTO CAROUSEL (all images, arrows + dots when >1) ----
    var imgList = (Array.isArray(exp && exp.images) ? exp.images : []).filter(function (u) { return u && typeof u === "string"; });
    if (imgList.length === 0 && exp && exp.imageUrl) imgList = [exp.imageUrl];
    const photoWrap = El("div", { className: "flex-shrink-0" });
    photoWrap.style.width = "220px";
    photoWrap.appendChild(
      window.tstsBuildImageCarousel(imgList, { aspectRatio: "11 / 8", rounded: "rounded-2xl", alt: title, fallback: "/assets/experience-default.jpg" })
    );

    // ---- title row + pills ----
    const titleRow = El("div", { className: "flex flex-wrap items-center gap-2" }, [
      El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "heading-serif font-bold text-lg text-tsts-ink hover:text-tsts-clay hover:underline transition", textContent: title })
    ]);
    // sir 2026-08-08: "it is deleted listing and so must be the pill". DELETED is tested FIRST — a deleted
    // listing can still carry isPaused from before it was removed, and that flag was winning, so a deleted
    // listing sat in the Inactive section wearing a "Paused" pill, lying about its own state.
    if (statusU === "DELETED_SOFT") titleRow.appendChild(pill("● Deleted", "bg-rose-50 text-rose-700"));
    else if (isPaused) titleRow.appendChild(pill("● Paused", "bg-amber-50 text-amber-700"));
    else if (statusU === "ACTIVE") titleRow.appendChild(pill("● Active", "bg-emerald-50 text-emerald-700"));
    else if (statusU === "PENDING_REVIEW") titleRow.appendChild(pill("In review", "bg-blue-50 text-blue-700"));
    else if (statusU === "DRAFT") titleRow.appendChild(pill("Draft", "bg-gray-100 text-gray-600"));
    else if (statusU) titleRow.appendChild(pill(statusU.charAt(0) + statusU.slice(1).toLowerCase().replace(/_/g, " "), "bg-gray-100 text-gray-600"));
    if (verifiedStatus === "verified") titleRow.appendChild(pill("✓ Verified", "bg-blue-100 text-blue-700"));
    else if (verifiedStatus === "pending" || verifiedStatus === "requested" || verifiedStatus === "under_review") titleRow.appendChild(pill("Verification pending", "bg-amber-100 text-amber-700"));
    titleRow.appendChild(pill(mode === "private" ? "Private only" : (mode === "both" ? "Shared & Private" : "Shared"), "bg-slate-100 text-slate-700"));

    // ---- meta line (location · days · time) ----
    const days = (Array.isArray(exp && exp.availableDays) ? exp.availableDays : []).join(" / ");
    const time12 = __formatPrivateRequestTimeRange12h((Array.isArray(exp && exp.timeSlots) ? exp.timeSlots[0] : "") || "");
    const metaParts = [ (exp && exp.suburb ? exp.suburb + " · " : "") + (String((exp && exp.city) || "Melbourne")) ];
    if (days) metaParts.push(days);
    if (time12) metaParts.push(time12);
    const metaLine = El("p", { className: "text-sm text-gray-500 mt-1", textContent: metaParts.join("   ·   ") });

    // ---- stats line (rating · capacity · price) ----
    var ratingNode;
    if (Number(exp && exp.averageRating) > 0) {
      var star = El("span", { textContent: "★" }); star.style.color = "#f59e0b";
      ratingNode = El("span", { className: "inline-flex items-center gap-1 text-sm font-semibold text-gray-700" }, [
        star,
        El("span", { textContent: Number(exp.averageRating).toFixed(1) }),
        El("span", { className: "text-gray-400 font-medium", textContent: "(" + (Number(exp.reviewCount) || 0) + ")" })
      ]);
    } else {
      ratingNode = El("span", { className: "text-sm text-gray-400", textContent: "No reviews yet" });
    }
    const cap = Number((exp && exp.maxGuests) || (exp && exp.privateCapacity) || 0);
    const priceChildren = [
      El("span", { className: "font-bold text-tsts-ink", textContent: money(exp && exp.price) }),
      El("span", { className: "text-gray-500", textContent: " / guest" })
    ];
    if (Number(exp && exp.privatePrice) > 0) priceChildren.push(El("span", { className: "text-gray-500", textContent: "   ·   Private " + money(exp.privatePrice) }));
    // sir's walk 2026-08-18 (F5): the three facts ran together with nothing between them while
    // the meta line right above speaks in middots — same idiom here, one separator between facts.
    const __statsDot = function () { return El("span", { className: "text-gray-300", textContent: "\u00b7" }); };
    const statsLine = El("div", { className: "flex items-center gap-x-3 gap-y-3 flex-wrap mt-2" }, [
      ratingNode,
      __statsDot(),
      // sir 2026-08-09: "make up to 6 guest as up to 6 guest per event" — capacity is one event's
      // chairs, and the label now names its denominator instead of leaving it unspoken.
      El("span", { className: "text-sm text-gray-600", textContent: "Up to " + (cap > 0 ? cap : "—") + " guests per event" }),
      __statsDot(),
      El("span", { className: "text-sm" }, priceChildren)
    ]);

    // ---- footer: performance (left) + actions (right) ----
    var listedDate = "";
    try { var __d = new Date(exp && exp.createdAt); if (!isNaN(__d.getTime())) listedDate = __d.toLocaleString("en-AU", { month: "short", year: "numeric" }); } catch (_dt) { listedDate = ""; }
    var wlSpan = El("span", { textContent: "checking waitlist…" });
    if (expId) {
      window.authFetch("/api/host/experiences/" + encodeURIComponent(expId) + "/waitlist", { method: "GET" })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (d) {
          var total = (d && d.ok && d.data) ? Number(d.data.total || 0) : 0;
          if (total > 0) { wlSpan.textContent = total + " waiting"; } else { wlSpan.textContent = ""; wlDot.textContent = ""; }
        })
        .catch(function () { wlSpan.textContent = ""; wlDot.textContent = ""; });
    } else { wlSpan.textContent = ""; wlDot.textContent = ""; }
    var wlDot = El("span", { textContent: "\u00b7" });
    // sir 2026-08-18: robotic zero copy banned as a CLASS — the zero case speaks like a person
    // and the waitlist zero-hides (dot goes with it).
    const perfNode = El("p", { className: "text-xs text-gray-500 flex items-center gap-1.5 flex-wrap" }, [
      El("span", { textContent: bookingCount > 0 ? ("Hosting " + bookingCount + " guest" + (bookingCount === 1 ? "" : "s") + " across upcoming dates") : "No guests booked yet" }),
      wlDot,
      wlSpan
    ].concat(listedDate ? [El("span", { textContent: "\u00b7" }), El("span", { textContent: "Listed " + listedDate })] : []));

    // sir 2026-08-08: "my order was only capcity can be edited --- host can alway increase it then why di
    // you confuse me to lead me to grey this out?"
    //
    // I turned "only capacity can change" into "nothing can change" and greyed Edit on any booked listing.
    // Wrong: capacity can ALWAYS be increased, so a booked listing always has something its host may
    // legitimately do, and Edit stays live for every listing. sir's "must not be even there or clickable"
    // was about the OTHER fields — price, dates, location — which the server already refuses on a booked
    // listing; the edit FORM is what must offer capacity alone.
    //
    // Edit routes through the draft flow (sir: "edit clicking moves it to draft stge and draft lisitn g
    // section"). Taking a LIVE listing off the market is destructive, so it sits behind the typed
    // confirmation sir chose — "control like Delete only". A deleted listing has nothing live to protect,
    // so it needs no gate.
    const __editBtn = El("button", {
      type: "button",
      className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm",
      textContent: "Edit",
      onclick: async function () {
        // sir 2026-08-08: "why cant my edit button or delete button ask me if i want to makges i nwhole
        // sries or just one event". A LIVE listing's Edit asks scope first.
        if (statusU === "ACTIVE") {
          var scope = await window.tstsConfirm("What do you want to edit?", [
            { label: "The whole listing", value: "all" },
            { label: "Particular dates", value: "some" }
          ]);
          if (!scope) return;
          if (scope.value === "some") { editOccurrenceFlow(expId, title); return; }
        }
        // sir 2026-08-09: "why must a host go through same 5 steps host creaton form and not just edit
        // the informat ... if i want only date edit why must i have go to whole steps and not just edit
        // the date?" — editing is not creation. The whole listing opens in ONE panel with every field on
        // it, and the host changes only what they came for. The 5-step wizard is now only for CREATING.
        // The panel itself locks everything but the guest count when guests hold seats, the same rule the
        // server enforces, so a booked listing needs no separate editor.
        openListingEditPanel(expId, { __seatedGuests: bookingCount });
      }
    });


    // sir 2026-08-08: a draft carries "option to activate or discard" — not Edit/View/Delete, which belong
    // to listings that actually exist for guests. Activating publishes THIS draft; the original it was
    // copied from is untouched either way.
    if (statusU === "DRAFT") {
      // ── PREVIEW (sir's order O-146, 2026-09-16) ──
      // The switch lives on the draft itself, because the draft is what it acts on. What is still
      // missing comes from the server on the same listing, so the host is never told "something is
      // missing" without being told which thing.
      var __previewOn = (exp && exp.previewEnabled === true);
      var __previewMissing = (exp && Array.isArray(exp.previewMissing)) ? exp.previewMissing : [];
      var __interestCount = Number((exp && exp.interestCount) || 0);
      var __canPreview = (__previewMissing.length === 0);

      if (__previewOn) titleRow.appendChild(pill("Preview on", "bg-amber-50 text-amber-800"));

      var previewKids = [];
      if (__previewOn) {
        previewKids.push(El("p", {
          className: "text-sm text-gray-700",
          textContent: __interestCount === 0
            ? "Guests can see this one under Coming soon. Nobody has said they are interested yet."
            : (__interestCount === 1
              ? "Guests can see this one under Coming soon. 1 person has said they are interested."
              : ("Guests can see this one under Coming soon. " + __interestCount + " people have said they are interested."))
        }));
        previewKids.push(El("p", { className: "text-xs text-gray-500 mt-1", textContent: "Nobody can book it. Everyone on the list hears from us the moment you publish." }));
      } else if (__canPreview) {
        previewKids.push(El("p", { className: "text-sm text-gray-700", textContent: "Ready to show. Turn the preview on and guests can see this one under Coming soon and tell you they are interested, without being able to book it." }));
      } else {
        var __listed = (__previewMissing.length === 1)
          ? __previewMissing[0]
          : (__previewMissing.slice(0, -1).join(", ") + " and " + __previewMissing[__previewMissing.length - 1]);
        previewKids.push(El("p", { className: "text-sm text-gray-700", textContent: "Before guests can see this one it still needs " + __listed + "." }));
        previewKids.push(El("p", { className: "text-xs text-gray-500 mt-1", textContent: "Open the listing to add them, and the preview switch turns on by itself." }));
      }

      const previewBox = El("div", {
        className: __previewOn
          ? "mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3"
          : "mt-3 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3"
      }, previewKids);

      const previewBtn = El("button", {
        type: "button",
        className: __previewOn
          ? "inline-flex items-center px-4 py-2 border border-amber-300 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-50 transition"
          : ("inline-flex items-center px-4 py-2 border text-sm font-semibold rounded-lg transition " + (__canPreview ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-gray-100 text-gray-400 cursor-not-allowed")),
        textContent: __previewOn ? "Turn preview off" : "Turn preview on"
      });
      if (!__previewOn && !__canPreview) {
        previewBtn.disabled = true;
        previewBtn.title = "This draft still needs a few details before guests can see it.";
      } else {
        previewBtn.addEventListener("click", function () { setHostDraftPreview(expId, title, !__previewOn); });
      }

      // sir 2026-08-16 ("right and left side edge alignement"): actions anchor right.
      const draftActions = El("div", { className: "flex items-center gap-2 flex-wrap justify-end mt-3" }, [
        previewBtn,
        El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: "Activate", onclick: function () { activateHostDraft(expId, title); } }),
        El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Discard", onclick: function () { discardHostDraft(expId, title); } })
      ]);
      const draftBody = El("div", { className: "flex-1 min-w-0 flex flex-col" }, [titleRow, metaLine, perfNode, previewBox, draftActions]);
      target.appendChild(
        El("div", { className: "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4" }, [photoWrap, draftBody])
      );
      return;
    }

    // sir 2026-08-16 ("right and left side edge alignement"): actions anchor right.
    const actions = El("div", { className: "flex items-center gap-2 flex-wrap justify-end mt-3" }, [
      __editBtn,
      El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "View page" }),
      ((verifiedStatus === "none" || verifiedStatus === "" || verifiedStatus === "rejected") && statusU === "ACTIVE")
        ? El("button", { className: "inline-flex items-center px-4 py-2 border border-blue-200 text-blue-700 bg-blue-50 text-sm font-semibold rounded-lg hover:bg-blue-100 transition", textContent: "Get verified", onclick: function () { requestVerifiedBadge(expId); } })
        : null,
      // sir 2026-08-08: "hwy there is Deleet button at bottom?" — a deleted listing offering Delete is
      // nonsense. It is gone from the account already; there is nothing left to delete.
      statusU === "DELETED_SOFT"
        ? null
        : El("button", { className: "inline-flex items-center px-4 py-2 text-red-600 text-sm font-semibold rounded-lg border border-red-100 hover:bg-red-50 transition", textContent: "Delete", onclick: async function () {
            // sir 2026-08-08: Delete asks scope too — the whole listing, or particular evenings with the
            // series continuing. Only ACTIVE listings have future evenings to cancel one at a time.
            if (statusU === "ACTIVE") {
              var scope = await window.tstsConfirm("What do you want to delete?", [
                { label: "The whole listing", value: "all" },
                { label: "Particular dates", value: "some" }
              ]);
              if (!scope) return;
              if (scope.value === "some") { cancelOccurrencesFlow(expId, title, ccy); return; }
            }
            deleteHostListing(expId, title, ccy);
          } })
    ].filter(Boolean));

    // sir 2026-08-08: "why cant a host see in all the dates and time slots for that event in all the
    // applicable tabs?" — every non-deleted card carries its upcoming dates behind the shared +/− mark,
    // each date with ITS OWN guest count against capacity. This is the per-evening truth the card's
    // series-total line cannot tell: it is how a 12-on-6 evening stays visible instead of hiding inside
    // an all-time total. Loaded on first open, one request per listing, never on page load.
    var occBlock = null;
    if (statusU !== "DELETED_SOFT") {
      var occOpen = false, occLoaded = false;
      var occMark = window.tstsPlusMinus(false);
      var occList = El("div", { className: "space-y-1.5 mt-2 hidden" });
      var occToggle = El("button", { type: "button", className: "flex items-center gap-1.5 text-xs font-semibold text-tsts-ink hover:text-tsts-clay transition" }, [
        occMark, El("span", { textContent: "Dates & times" })
      ]);
      occToggle.addEventListener("click", function () {
        occOpen = !occOpen;
        window.tstsSetPlusMinus(occMark, occOpen);
        occList.classList.toggle("hidden", !occOpen);
        if (occOpen && !occLoaded) {
          occLoaded = true;
          occList.appendChild(El("p", { className: "text-xs text-gray-500", textContent: "Loading dates…" }));
          __fetchHostOccurrences(expId).then(function (occ) {
            occList.replaceChildren();
            if (!occ.length) { occList.appendChild(El("p", { className: "text-xs text-gray-500", textContent: "No upcoming dates." })); return; }
            // sir 2026-08-09: "why cany we linmit it to next 10 slots?" — the card shows the NEXT 10
            // evenings only. The Edit/Delete pickers still carry every evening; a control over refunds
            // cannot hide dates, a glance at the card can.
            var shown = occ.slice(0, 10);
            var __appendOccRow = function (row) {
              var booked = Number(row.bookedGuests || 0);
              var capN = Number(row.capacity || 0);
              var full = capN > 0 && booked >= capN;
              // sir 2026-08-18 (F6): "No guests yet" repeated on every empty row — zero-hide rule:
              // an empty date stays quiet; only dates with guests (or requests) carry a note.
              var countTxt = booked > 0 ? (booked + " of " + (capN > 0 ? capN : "\u2014") + " guests") : "";
              // SEAT LAW (sir 2026-08-09, "seated only, requests shown apart"): pending private requests
              // are money awaiting the host's answer, never seats — their count sits beside the seats,
              // blending with nothing.
              var reqN = Number(row.requestedGuests || 0);
              if (reqN > 0) countTxt = countTxt ? (countTxt + " \u00b7 " + reqN + " more requested") : (reqN + " more requested");
              // sir's go-ahead 2026-08-09: "build 3 columns 2 on left and one right aligned". Date and
              // time are separate columns with fixed date width, so every time starts at the same point
              // down the list; the count sits right-aligned. Grid set through style — grid-template
              // utility classes are not reliably in the compiled sheet, and a purge casualty here would
              // silently collapse the columns back into the soup sir just rejected.
              var dateTxt = String(row.date || "");
              try { if (window.tstsFormatDateShort) dateTxt = String(window.tstsFormatDateShort(dateTxt) || dateTxt); } catch (_e) { void _e; }
              // sir 2026-08-09: a DRAFT date is the host's own date, off the market while they edit it —
              // it must be visible here with the way back on, or it is lost. A BOOKED date carries its own
              // Guests control, because guest numbers are the only thing its host may change.
              var rightCell;
              if (booked > 0) {
                var capBtn = El("button", { type: "button", className: "text-xs " + (full ? "font-bold text-orange-700" : "font-semibold text-tsts-ink") + " hover:underline", textContent: full ? (countTxt + " · full") : countTxt });
                capBtn.addEventListener("click", function () { editOccurrenceCapacityFlow(expId, row); });
                rightCell = capBtn;
              } else {
                rightCell = El("span", { className: "text-gray-500 text-right", textContent: countTxt });
              }
              rightCell.classList.add("text-right");
              var rowEl = El("div", { className: "text-xs items-center" }, [
                El("span", { className: "text-tsts-ink font-medium", textContent: dateTxt }),
                El("span", { className: "text-tsts-ink", textContent: __formatPrivateRequestTimeRange12h(String(row.slot || "")) }),
                rightCell
              ]);
              rowEl.style.display = "grid";
              rowEl.style.gridTemplateColumns = "6.5rem 1fr auto";
              rowEl.style.columnGap = "0.5rem";
              occList.appendChild(rowEl);
              // sir's ruling 2026-08-09: "only those eent listed by hosts, or updated with new date must
              // appears" — a date the host never offered is an impossible state the API refuses (proven
              // 400 DAY_NOT_AVAILABLE), not a display case. The "no longer on your schedule" note I built
              // here is struck on sir's order; the server no longer emits such rows at all.
            };
            shown.forEach(__appendOccRow);
            if (occ.length > shown.length) {
              // sir 2026-08-18: dead-end lines are banned as a CLASS — information with no action.
              // The line is now the platform's Show-more expander, opening the rest in place
              // (card still leads with the next 10 per sir's 2026-08-09 ruling).
              var __restN = occ.length - shown.length;
              var __moreBtn = El("button", { type: "button", className: "text-xs font-semibold text-tsts-clay hover:underline", textContent: "Show " + __restN + " more date" + (__restN === 1 ? "" : "s") });
              __moreBtn.addEventListener("click", function () { __moreBtn.remove(); occ.slice(10).forEach(__appendOccRow); });
              occList.appendChild(__moreBtn);
            }
          }).catch(function (e) {
            occList.replaceChildren();
            occList.appendChild(El("p", { className: "text-xs text-red-600", textContent: String((e && e.message) || "We couldn't load this listing's dates just now.") }));
          });
        }
      });
      occBlock = El("div", { className: "mt-2" }, [occToggle, occList]);
    }

    const body = El("div", { className: "flex-1 min-w-0 flex flex-col" }, [
      titleRow,
      metaLine,
      statsLine,
      occBlock,
      El("div", { className: "border-t border-gray-100 my-3" }),
      perfNode,
      actions
    ].filter(Boolean));

    target.appendChild(
      El("div", { className: "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4" }, [photoWrap, body])
    );
  });
  }

  // sir 2026-08-08: "thereis already a section hheader called My Listing whihc was approved" — I had added
  // a second "Active Listings" heading on top of the approved one. Removed. The live cards sit directly
  // under the existing My Listings header.
  const activeWrap = El("div", { className: "space-y-4" });
  // Drafts and paused listings have their own sections, so they must not also appear here. The API's live
  // query only excludes DELETED_SOFT, so a draft was rendering TWICE — once in My Listings and once in
  // Draft — which is how two Activate buttons appeared for one draft.
  renderListingCardsInto(arr.filter(function (e) {
    const st = String((e && e.status) || "").toUpperCase();
    return !((e && e.isPaused === true) || st === "PAUSED" || st === "DRAFT");
  }), activeWrap);
  wrap.appendChild(activeWrap);

  // ---- MIDDLE SECTION: Draft ----
  // sir 2026-08-08: "the draft listing statys between deleted and my listings" — order top to bottom is
  // My Listings (live) -> Draft -> Inactive. Each draft carries Activate or Discard; the original it was
  // copied from is never touched by either.
  const drafts = Array.isArray(draftListings) ? draftListings : [];
  if (drafts.length > 0) {
    const drBlock = El("div", { className: "space-y-4 pt-2" });
    const drBody = El("div", { className: "space-y-4 mt-4 hidden" });
    const drGlyph = El("span", { className: "text-xl font-bold leading-none text-gray-600" }, [window.tstsPlusMinus(false)]);
    const drToggle = El("button", { type: "button", className: "shrink-0 h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center", "aria-expanded": "false", "aria-label": "Show drafts" }, [drGlyph]);
    const drHeader = El("div", { className: "flex items-center justify-between gap-3 cursor-pointer" }, [
      El("div", {}, [
        El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Draft" }),
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: drafts.length + (drafts.length === 1 ? " draft" : " drafts") + " \u00b7 not visible to guests until you publish" })
      ]),
      drToggle
    ]);
    const flipDrafts = function () {
      const nowHidden = drBody.classList.toggle("hidden");
      drToggle.setAttribute("aria-expanded", nowHidden ? "false" : "true");
      drToggle.setAttribute("aria-label", (nowHidden ? "Show" : "Hide") + " drafts");
      window.tstsSetPlusMinus(drGlyph.firstChild, !nowHidden);
    };
    drToggle.addEventListener("click", function (e) { e.stopPropagation(); flipDrafts(); });
    drHeader.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("button")) return; flipDrafts(); });
    renderListingCardsInto(drafts, drBody);
    drBlock.appendChild(drHeader);
    drBlock.appendChild(drBody);
    wrap.appendChild(drBlock);
  }

  // ---- BOTTOM SECTION: Inactive listings ----
  // sir: "add a section a bottom for Inactive listing where all deleted and inactive listing falls".
  // Deleted AND paused both land here, collapsed behind the shared +/- mark exactly like "Missed &
  // declined" on Guest Requests. A listing counted in Total must be findable somewhere.
  const deleted = (Array.isArray(deletedListings) ? deletedListings : []).concat(
    arr.filter(function (e) { return (e && e.isPaused === true) || String((e && e.status) || "").toUpperCase() === "PAUSED"; })
  );
  if (deleted.length > 0) {
    const delBlock = El("div", { className: "space-y-4 pt-2" });
    const delBody = El("div", { className: "space-y-4 mt-4 hidden" });
    const delGlyph = El("span", { className: "text-xl font-bold leading-none text-gray-600" }, [window.tstsPlusMinus(false)]);
    const delToggle = El("button", { type: "button", className: "shrink-0 h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center", "aria-expanded": "false", "aria-label": "Show inactive listings" }, [delGlyph]);
    const delHeader = El("div", { className: "flex items-center justify-between gap-3 cursor-pointer" }, [
      El("div", {}, [
        El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Inactive listings" }),
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: deleted.length + (deleted.length === 1 ? " listing" : " listings") + " · paused or deleted, not bookable right now" })
      ]),
      delToggle
    ]);
    const flipDeleted = function () {
      const nowHidden = delBody.classList.toggle("hidden");
      delToggle.setAttribute("aria-expanded", nowHidden ? "false" : "true");
      delToggle.setAttribute("aria-label", (nowHidden ? "Show" : "Hide") + " inactive listings");
      window.tstsSetPlusMinus(delGlyph.firstChild, !nowHidden);
    };
    delToggle.addEventListener("click", function (e) { e.stopPropagation(); flipDeleted(); });
    delHeader.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("button")) return; flipDeleted(); });
    renderListingCardsInto(deleted, delBody);
    delBlock.appendChild(delHeader);
    delBlock.appendChild(delBody);
    wrap.appendChild(delBlock);
  }

  return wrap;
}

// Owner 2026-08-06 (sir: "there can be 100 people coming in and you cant have a list there — it will
// have to be a proper dashboard: how many checked in, pending, and contact or buzz the ones who did
// not check in before the experience starts or check-in closes"): Who's-coming is now ONE CARD PER
// EVENT (experience + date + slot), never one card per guest. The card leads with the count that
// matters — "X of Y guests checked in" with a progress bar — plus a window chip mirroring the
// backend's exact rule (start − 2h → start + 6h), a Buzz-pending-guests action while the window is
// open, and the full guest roster collapsed inside (the existing booking cards, so every Check In /
// View Details / chat behavior is unchanged).
function __renderOccurrenceDashCard(El, group) {
  var first = group[0] || {};
  var exp = first.experience || {};
  var title = sanitizeExperienceTitle(exp.title || first.title || "Listing");
  var timeText = first.timeSlot ? __formatPrivateRequestTimeRange12h(String(first.timeSlot)) : "";
  var __ymd = String((first && first.bookingDate) || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  var __mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var month = __ymd ? (__mNames[parseInt(__ymd[2], 10) - 1] || "--") : "--";
  var day = __ymd ? parseInt(__ymd[3], 10) : "--";

  // Seat math over check-in-ELIGIBLE bookings only (paid + confirmed — the same set the backend
  // will accept a check-in for). Other roster rows still render inside with their own state chips.
  var eligible = group.filter(function (b) {
    return normalizeState(b.status) === "confirmed" && String(b.paymentStatus || "") === "paid";
  });
  var totalSeats = 0, checkedSeats = 0, pendingBookings = 0;
  eligible.forEach(function (b) {
    var seats = Math.max(1, Number(b.numGuests || b.guests || 1));
    totalSeats += seats;
    if (b.attendanceStatus === "checked_in") checkedSeats += Math.min(seats, Math.max(0, Number(b.checkedInSeats || seats)));
    else if (!b.attendanceStatus) pendingBookings += 1;
  });
  var pendingSeats = Math.max(0, totalSeats - checkedSeats);

  // Window chip — the same 2h-before → 6h-after rule the backend enforces.
  var w = __hostCheckinWindow(first);
  var nowMs = Date.now();
  var windowChip = null;
  var windowOpen = false;
  if (w) {
    if (nowMs < w.opensAt) {
      // Include the DAY when it isn't today — "opens 12:00 am" alone was useless for an event
      // next Saturday (sir's future-event state).
      var od = new Date(w.opensAt);
      var sameDay = od.toDateString() === new Date().toDateString();
      // sir's walk (F9): en-AU ICU emits lowercase "3:00 pm" while this page's approved time
      // voice (C4) is "5:00 PM" — uppercase the marker so the chip speaks like every other time here.
      var opensText = (sameDay ? "" : od.toLocaleDateString("en-AU", { weekday: "short" }) + " ") + od.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\b(am|pm)\b/i, function (s) { return s.toUpperCase(); });
      windowChip = El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-gray-100 text-gray-600 whitespace-nowrap", textContent: "Check-in opens " + opensText });
    } else if (nowMs <= w.closesAt) {
      windowOpen = true;
      var msLeft = w.closesAt - nowMs;
      var hLeft = Math.floor(msLeft / 3600000);
      var mLeft = Math.floor((msLeft % 3600000) / 60000);
      // Terse, in the approved pill grammar ("Pending · 3h left") — not a sentence.
      windowChip = El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap", textContent: "Check-in · " + (hLeft > 0 ? hLeft + "h " : "") + mLeft + "m left" });
    } else {
      windowChip = El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-gray-100 text-gray-500 whitespace-nowrap", textContent: "Check-in closed" });
    }
  }

  // Owner 2026-08-06, v4 after three rejections. sir's last ruling (verbatim): "you still put ----
  // things up there which are not needed and missed out on important things." Found on my own:
  //   NOT NEEDED (removed): the progress bar (decoration — the stat pair already says it); the
  //   in-body "Guest list + pill + button" trio (header carries the count pill and the square
  //   toggle now, exactly where the queue and Past bookings put theirs); my rewritten section
  //   subtitle (sir's 2026-07-23 copy restored).
  //   MISSING (added): the PEOPLE — "Who's coming" must name who is coming, so the pending guests'
  //   names sit on the card face; and CHECK IN as the primary action (the card's whole purpose) —
  //   emerald like every approved Check In on this tab; the reminder is the bordered secondary.
  var card = El("div", { className: "bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" });

  // Owner 2026-08-06 (sir: "what the ---- is the plus sign and what purpose it solve"): the bare
  // unlabeled square told a host nothing about what it hid. The guest list is now opened by ONE
  // labeled, quiet action in the actions row — "View guest list" — flipping to "Hide guest list"
  // while open. No mystery controls.
  var rosterBody = El("div", { className: "space-y-4 pt-1 hidden" });
  var rosterBtn = El("button", {
    type: "button",
    className: "w-full md:w-auto bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition whitespace-nowrap",
    "aria-expanded": "false", textContent: "View guest list"
  });
  rosterBtn.addEventListener("click", function () {
    var hidden = rosterBody.classList.toggle("hidden");
    rosterBtn.setAttribute("aria-expanded", hidden ? "false" : "true");
    rosterBtn.textContent = hidden ? "View guest list" : "Hide guest list";
  });

  // Image-led header band — the queue-card pattern exactly: thumb + serif title + count pill,
  // with the square toggle at the right edge (the Past-bookings position).
  var expImage = String((exp.images && exp.images[0]) || exp.imageUrl || first.experienceImage || "");
  var thumb;
  if (expImage) {
    thumb = El("img", { alt: title, className: "h-10 w-10 rounded-xl object-cover shrink-0" });
    try { window.tstsSafeImg(thumb, expImage, ""); } catch (_iErr) { void _iErr; }
  } else {
    thumb = El("div", { className: "h-10 w-10 rounded-xl bg-tsts-cream shrink-0" });
  }
  // No truncate: at phone width the pill was strangling the title to "Suns…" — the experience
  // name is the card's identity and wraps to two lines instead (the approved roster rows do the
  // same). The pill + toggle travel as one right-hand group so they wrap below together.
  var headTitleBlock = El("div", { className: "flex-1 min-w-0" }, [
    El("h3", { className: "heading-serif text-lg font-bold text-tsts-ink", textContent: title }),
    El("p", { className: "text-xs text-gray-500 mt-0.5", textContent: month + " " + day + (timeText ? " · " + timeText : "") })
  ]);
  // Owner 2026-08-06 (sir: "why you need ---- 1 booking tag"): the count pill spoke database
  // ("bookings") at a host who thinks in guests, and duplicated what "Checked in X of Y" already
  // says. Gone. The window pill takes the status position instead — where every request row puts
  // its "Pending · 3h left" — and the square toggle stays at the right edge, Past-bookings style.
  // w-full on mobile drops the pill+toggle to their own line (title keeps the full first row and
  // wraps normally); md:w-auto tucks them back to the row's right edge on desktop. shrink-0 alone
  // squeezed the title to one word per line at 390px — caught in the mobile verify pass.
  // Owner 2026-08-06 (sir: "why do I need the plus sign to expand to see the same ---- thing
  // that is there on the card"): a single-booking card's face already tells everything the roster
  // would — the toggle exists ONLY when the list holds more than the face shows.
  var __hasRoster = group.length > 1;
  var headRight = windowChip ? El("div", { className: "flex items-center gap-3 w-full justify-between md:w-auto" }, [windowChip]) : null;
  card.appendChild(El("div", { className: "flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100" },
    headRight ? [thumb, headTitleBlock, headRight] : [thumb, headTitleBlock]));

  var body = El("div", { className: "p-4 space-y-4" });

  // The dashboard row: Funding's label-over-value stat columns + the check-in window state.
  // Value spans keep closure refs so door-mode check-ins update the numbers IN PLACE — a host
  // mid-queue never loses the door to a full section re-render.
  var __statInEl = null, __statPendingEl = null;
  if (totalSeats > 0) {
    var __ciStat = function (label, value, valueClass) {
      var valEl = El("span", { className: "text-base font-bold " + (valueClass || "text-tsts-ink") + " block mt-0.5", textContent: value });
      var col = El("div", {}, [
        El("span", { className: "text-xs text-gray-500 block", textContent: label }),
        valEl
      ]);
      return { col: col, valEl: valEl };
    };
    // sir's ORIGINAL spec, verbatim (2026-08-06): "how many people checked in, pending, and
    // contact or buzz." TWO numbers — a host at a door never does subtraction.
    // sir 2026-08-16 ("right and left side edge alignement"): at the page's standard width the
    // three stats huddled left with three quarters of the card empty. They now distribute across
    // the full width (sir's approved space-between pattern from the facts bar).
    var __statRowEl = El("div", { className: "flex flex-wrap items-end justify-between gap-8" });
    if (pendingSeats > 0) {
      var __sIn = __ciStat("Checked in", String(checkedSeats));
      var __sPend = __ciStat("Still to come", String(pendingSeats), "text-amber-700");
      __statInEl = __sIn.valEl; __statPendingEl = __sPend.valEl;
      __statRowEl.appendChild(__sIn.col); __statRowEl.appendChild(__sPend.col);
      __statRowEl.appendChild(__ciStat("Seats booked", String(totalSeats)).col);
    } else {
      __statRowEl.appendChild(__ciStat("Checked in", checkedSeats + " of " + totalSeats + " · everyone's at the table ✓", "text-emerald-700").col);
    }
    body.appendChild(__statRowEl);
  }
  var pendingRows = eligible.filter(function (b) { return !b.attendanceStatus; });

  // Actions: Check In is the card's purpose — emerald, like every approved Check In on this tab.
  // One pending booking → straight into its check-in modal. Several → the check-in STATION
  // (check-in.html, the code-first door flow that already exists) — at 100 or 1000 guests the
  // host types the code a guest shows; hunting a list is not a door workflow. The reminder is
  // the bordered secondary. Single-booking cards carry View Details (their roster is gone).
  // sir 2026-08-16: action buttons anchor to the card's RIGHT edge at the standard width.
  var actions = El("div", { className: "flex items-center gap-2 flex-wrap justify-end" });
  // Keyed off pending SEATS, not pending bookings (2026-08-06 scenario map): a partially-checked-
  // in single booking (2 of 4 in — late arrivals still out) had "Still to come: 2" and NO working
  // action — the exact moment the backend's same-code top-up (server.js ~28319) exists for. The
  // check-in modal handles both first check-in and additive top-up with the same entry code.
  if (windowOpen && pendingSeats > 0) {
    var __actionRows = eligible.filter(function (b) {
      if (!b.attendanceStatus) return true;
      return b.attendanceStatus === "checked_in" && Number(b.checkedInSeats || 0) < Math.max(1, Number(b.numGuests || b.guests || 1));
    });
    if (__actionRows.length === 1) {
      actions.appendChild(El("button", {
        type: "button",
        className: "w-full md:w-auto bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap",
        "data-action": "otp-checkin", "data-booking-id": String(__actionRows[0]._id || ""),
        textContent: __actionRows[0].attendanceStatus === "checked_in" ? "Add late arrivals" : "Check In"
      }));
    } else if (__actionRows.length > 1) {
      // DOOR MODE (sir 2026-08-06, canon: "My Experiences taxonomy remains canonical" — host
      // tooling lives IN the tab): the card expands inline into the door — 6-box code entry
      // (the approved §0.7 component), announced result, labeled guest search, capped roster.
      // No navigation away; the queue never loses its place.
      var doorToggle = El("button", {
        type: "button",
        className: "w-full md:w-auto bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap",
        "aria-expanded": "false", textContent: "Open check-in"
      });
      doorToggle.addEventListener("click", function () {
        var hidden = doorBody.classList.toggle("hidden");
        doorToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
        doorToggle.textContent = hidden ? "Open check-in" : "Close check-in";
        if (!hidden && doorBoxes.length) doorBoxes[0].focus();
      });
      actions.appendChild(doorToggle);
    }
    // The reminder targets only FULLY-pending bookings (the backend skips checked-in guests —
    // a partial party's guest is already standing inside), so it renders only when one exists.
    if (pendingRows.length > 0) {
      actions.appendChild(El("button", {
        type: "button",
        className: "w-full md:w-auto px-5 py-2 rounded-lg border border-orange-200 text-orange-700 text-sm font-bold hover:bg-orange-50 transition whitespace-nowrap",
        "data-action": "buzz-checkin",
        "data-exp-id": String((first.experienceId && (first.experienceId._id || first.experienceId)) || exp._id || exp.id || ""),
        "data-occ-date": String(first.bookingDate || ""),
        "data-occ-slot": String(first.timeSlot || ""),
        textContent: "Remind pending guests"
      }));
    }
  }
  if (__hasRoster && !(windowOpen && pendingSeats > 0)) {
    // Future / fully-settled multi-party occurrences: the labeled guest-list disclosure remains
    // (no door to run yet). Live occurrences carry the list INSIDE door mode instead.
    actions.appendChild(rosterBtn);
  } else if (!__hasRoster) {
    actions.appendChild(El("button", {
      type: "button",
      className: "w-full md:w-auto bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition whitespace-nowrap",
      "data-action": "guest", "data-booking-id": String(first._id || ""), textContent: "View Details"
    }));
  }
  if (actions.childNodes.length > 0) body.appendChild(actions);

  // ===== DOOR MODE BODY (hidden until "Open check-in") =====
  var doorBody = El("div", { className: "hidden space-y-4 pt-2 border-t border-gray-100" });
  var doorBoxes = [];
  if (__hasRoster && windowOpen && pendingSeats > 0) {
    // 6-box entry — the approved §0.7 component: same classes and behaviors as the check-in
    // modal (auto-advance, backspace steps back, paste distributes, digits only).
    var boxRow = El("div", { className: "flex items-center gap-2", role: "group", "aria-label": "Entry code" });
    for (var bi = 0; bi < 6; bi++) {
      var boxEl = El("input", {
        type: "text", inputmode: "numeric", maxlength: "1",
        "aria-label": "Digit " + (bi + 1),
        className: "checkin-otp-digit w-12 h-14 border border-slate-200 rounded-xl focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none text-center text-2xl font-mono"
      });
      if (bi === 0) boxEl.setAttribute("autocomplete", "one-time-code");
      doorBoxes.push(boxEl);
      boxRow.appendChild(boxEl);
    }
    var __doorCode = function () { return doorBoxes.map(function (b) { return (b.value || "").replace(/\D/g, ""); }).join(""); };
    doorBoxes.forEach(function (box, idx) {
      box.addEventListener("input", function () {
        box.value = box.value.replace(/\D/g, "").slice(0, 1);
        if (box.value && idx < doorBoxes.length - 1) doorBoxes[idx + 1].focus();
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && idx > 0) { doorBoxes[idx - 1].focus(); doorBoxes[idx - 1].value = ""; e.preventDefault(); }
        if (e.key === "ArrowLeft" && idx > 0) doorBoxes[idx - 1].focus();
        if (e.key === "ArrowRight" && idx < doorBoxes.length - 1) doorBoxes[idx + 1].focus();
        if (e.key === "Enter") doorConfirm.click();
      });
      box.addEventListener("paste", function (e) {
        var text = String((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6);
        if (!text) return;
        e.preventDefault();
        for (var i = 0; i < doorBoxes.length; i++) doorBoxes[i].value = text[i] || "";
        doorBoxes[Math.min(text.length, doorBoxes.length - 1)].focus();
      });
    });
    var doorConfirm = El("button", {
      type: "button",
      className: "bg-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap disabled:opacity-50",
      textContent: "Check in guest"
    });
    // role="status": a screen-reader host must HEAR "Aisha is at the table" (WCAG 4.1.3 —
    // the accessibility audit's top fix, built in from the start).
    var doorStatus = El("p", { className: "text-sm font-bold hidden", role: "status" });
    var doorError = El("p", { className: "text-sm font-bold text-red-600 hidden", role: "alert" });

    var __doorOccExpId = String((first.experienceId && (first.experienceId._id || first.experienceId)) || exp._id || exp.id || "");
    var __doorParties = null, __doorSearch = null, __doorList = null, __doorShown = 20;
    var __buildDoorParties = function () {
      var g2 = _groupByKey(group, function (b) {
        var gid = String((b.guestId && typeof b.guestId === "object") ? (b.guestId._id || b.guestId.id || "") : (b.guestId || b.guestUserId || ""));
        return gid || ("solo-" + String(b._id || ""));
      });
      __doorParties = g2.order.map(function (k) {
        var rows = g2.groups[k];
        var gg = rows[0].guestId || {};
        return { rows: rows, name: String(gg.name || rows[0].guestName || "Guest").toLowerCase() };
      });
    };
    var __renderDoorRoster = function () {
      if (!__doorList) return;
      if (!__doorParties) __buildDoorParties();
      var q = String((__doorSearch && __doorSearch.value) || "").trim().toLowerCase();
      var filtered = q ? __doorParties.filter(function (p) { return p.name.indexOf(q) >= 0; }) : __doorParties;
      __doorList.replaceChildren();
      filtered.slice(0, __doorShown).forEach(function (p) {
        __doorList.appendChild(p.rows.length === 1 ? _renderHostBookingCard(El, p.rows[0], { insideEventCard: true }) : _renderGroupedHostBookingCard(El, p.rows, { insideEventCard: true }));
      });
      if (filtered.length > __doorShown) {
        var dm = El("button", { type: "button", className: "w-full px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 transition", textContent: "Show more (" + (filtered.length - __doorShown) + " remaining)" });
        dm.addEventListener("click", function () { __doorShown += 100; __renderDoorRoster(); });
        __doorList.appendChild(dm);
      }
    };
    doorConfirm.addEventListener("click", function () {
      var code = __doorCode();
      doorError.classList.add("hidden");
      if (!/^[0-9]{6}$/.test(code)) {
        window.tstsSetText(doorError, "Enter the guest's 6-digit entry code.");
        doorError.classList.remove("hidden");
        return;
      }
      doorConfirm.disabled = true;
      window.tstsSetText(doorConfirm, "Checking in…");
      window.authFetch("/api/host/experiences/" + encodeURIComponent(__doorOccExpId) + "/check-in-by-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code, date: String(first.bookingDate || "") })
      }).then(function (res) {
        return res.json().then(function (json) { return { res: res, json: json }; });
      }).then(function (r) {
        doorConfirm.disabled = false;
        window.tstsSetText(doorConfirm, "Check in guest");
        if (!r.res.ok) {
          window.tstsSetText(doorError, String((r.json && r.json.message) || "That code didn't match a booking for this event. Double-check with your guest."));
          doorError.classList.remove("hidden");
          return;
        }
        var d = window.unwrapApiPayload ? window.unwrapApiPayload(r.json) : (r.json && r.json.data) || {};
        var who = String((d && d.guestName) || "Guest");
        window.tstsSetText(doorStatus, who + " is at the table ✓");
        doorStatus.className = "text-sm font-bold text-emerald-700";
        doorBoxes.forEach(function (b) { b.value = ""; });
        doorBoxes[0].focus();
        // Refresh the room IN PLACE: counts + roster from the check-in-list source of truth.
        window.authFetch("/api/host/experiences/" + encodeURIComponent(__doorOccExpId) + "/check-in-list?date=" +
          encodeURIComponent(String(first.bookingDate || "")) + "&slot=" + encodeURIComponent(String(first.timeSlot || "")), { method: "GET" }
        ).then(function (lr) { return lr.json(); }).then(function (lj) {
          var ld = window.unwrapApiPayload ? window.unwrapApiPayload(lj) : (lj && lj.data) || {};
          var items = (ld && ld.items) || [];
          var byId = {};
          items.forEach(function (i) { byId[String(i.bookingId)] = i; });
          var tIn = 0, tTotal = 0;
          group.forEach(function (b) {
            var u = byId[String(b._id)];
            if (u) { b.attendanceStatus = u.attendanceStatus; b.checkedInSeats = u.checkedInSeats; b.checkedInAt = u.checkedInAt; }
          });
          items.forEach(function (i) {
            var seats = Math.max(1, Number(i.numGuests || 1));
            tTotal += seats;
            if (i.attendanceStatus === "checked_in") tIn += Math.min(seats, Math.max(0, Number(i.checkedInSeats || seats)));
          });
          if (__statInEl) window.tstsSetText(__statInEl, String(tIn));
          if (__statPendingEl) window.tstsSetText(__statPendingEl, String(Math.max(0, tTotal - tIn)));
          __doorParties = null;
          __renderDoorRoster();
          if (tTotal > 0 && tIn >= tTotal) {
            window.tstsSetText(doorStatus, "Everyone's at the table ✓");
            // The door's job is done — settle the whole section into its all-in state.
            setTimeout(function () { try { loadHost("bookings"); } catch (_lhErr) { void _lhErr; } }, 1500);
          }
        }).catch(function (refreshErr) { void refreshErr; });
      }).catch(function (netErr) {
        void netErr;
        doorConfirm.disabled = false;
        window.tstsSetText(doorConfirm, "Check in guest");
        window.tstsSetText(doorError, "Network error. Please try again.");
        doorError.classList.remove("hidden");
      });
    });

    __doorSearch = El("input", {
      type: "text", autocomplete: "off", placeholder: "Find a guest by name…",
      "aria-label": "Find a guest by name",
      className: "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent transition"
    });
    __doorSearch.addEventListener("input", function () { __doorShown = 20; __renderDoorRoster(); });
    __doorList = El("div", { className: "space-y-3" });

    doorBody.appendChild(El("p", { className: "text-xs font-bold uppercase tracking-wide text-gray-500", textContent: "Entry code" }));
    doorBody.appendChild(El("div", { className: "flex items-center gap-3 flex-wrap" }, [boxRow, doorConfirm]));
    doorBody.appendChild(doorStatus);
    doorBody.appendChild(doorError);
    doorBody.appendChild(__doorSearch);
    doorBody.appendChild(__doorList);
    __renderDoorRoster();
    body.appendChild(doorBody);
  }
  card.appendChild(body);

  // Roster disclosure body for NON-door cards (future / settled multi-party occurrences):
  // the EXISTING booking cards, capped — first 20 parties, then 100 at a time on demand.
  if (__hasRoster && !(windowOpen && pendingSeats > 0)) {
    var groups = _groupByKey(group, function (b) {
      var gid = String((b.guestId && typeof b.guestId === "object") ? (b.guestId._id || b.guestId.id || "") : (b.guestId || b.guestUserId || ""));
      // A booking whose guest account no longer resolves (deleted user → populate null) must NOT
      // share a group with every other such booking — 400 strangers rendered as ONE guest's pile
      // (found via the 1000-seat mock). No id → the booking stands alone.
      return gid || ("solo-" + String(b._id || ""));
    });
    var __ROSTER_FIRST = 20, __ROSTER_CHUNK = 100;
    var __renderRosterRange = function (from, to) {
      groups.order.slice(from, to).forEach(function (k) {
        var g = groups.groups[k];
        rosterBody.appendChild(g.length === 1 ? _renderHostBookingCard(El, g[0], { insideEventCard: true }) : _renderGroupedHostBookingCard(El, g, { insideEventCard: true }));
      });
    };
    __renderRosterRange(0, __ROSTER_FIRST);
    if (groups.order.length > __ROSTER_FIRST) {
      var __rosterShown = __ROSTER_FIRST;
      var moreBtn = El("button", {
        type: "button",
        className: "w-full px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 transition"
      });
      var __setMoreLabel = function () {
        moreBtn.textContent = "Show more (" + (groups.order.length - __rosterShown) + " remaining)";
      };
      __setMoreLabel();
      moreBtn.addEventListener("click", function () {
        var next = Math.min(__rosterShown + __ROSTER_CHUNK, groups.order.length);
        __renderRosterRange(__rosterShown, next);
        __rosterShown = next;
        if (__rosterShown >= groups.order.length) { moreBtn.remove(); }
        else { __setMoreLabel(); rosterBody.appendChild(moreBtn); }
      });
      rosterBody.appendChild(moreBtn);
    }
    body.appendChild(rosterBody);
  }

  return card;
}

// sir's split, element 5 [2026-08-07, name and contents sir-picked element by element]: the
// GUEST REQUESTS tab — the approved grouped queue moved whole from the Bookings body, plus the
// two changes the move demands: the section header rides along as the page header, and an empty
// state per the empty-state law (icon + headline + body + CTA), never a blank void.
function renderHostGuestRequestsSection(requestRows) {
  const El = window.tstsEl;
  const now = Date.now();
  const lc = function (v) { return String(v || "").toLowerCase(); };
  const rows = Array.isArray(requestRows) ? requestRows : [];
  // sir's ruling 2026-08-07: "Move it and say it ran out". A request whose deadline has passed is dead
  // even while the database still reads awaiting_host — the sweep that stamps it "expired" runs on a
  // schedule, so between the deadline and that sweep the row sat in "Expiring soon" among live requests
  // with no Accept, no Decline, no reason, and a pill reading "Awaiting host" that told the host THEY
  // were being waited on. Measured on sir's data: Aisha Khan, deadline 1h56m in the past, exactly that.
  // The clock, not the stored status, decides whether a request is still the host's to answer.
  // A request has RUN OUT when the clock that actually governs it has passed. sir caught the gap:
  // this only ever looked at awaiting_host, so an OFFER whose window had closed — and a guest whose
  // one-hour payment window had closed — stayed in "Waiting for guest" wearing a label that implied
  // they still had time. Measured on sir's own screen: a counter_accept_pending row 24 minutes past
  // its deadline, showing "New dates offered" and no clock at all, because the dead countdown fell
  // back to the plain status text. Each state is judged by ITS OWN deadline, the same one the server's
  // expiry sweep uses, so the screen can never claim a guest is still deciding after the sweep would
  // have closed the request.
  const __ranOut = function (r) {
    const s = lc(r && r.status);
    var stamp = 0;
    if (s === "awaiting_host") stamp = (r && r.expiresAt) ? new Date(r.expiresAt).getTime() : 0;
    else if (s === "alternative_offered" || s === "counter_accept_pending") stamp = (r && r.offerExpiresAt) ? new Date(r.offerExpiresAt).getTime() : 0;
    else return false;
    return stamp > 0 && stamp <= now;
  };
  const pending = rows.filter(function (r) {
    const s = lc(r && r.status);
    if (s === "awaiting_host") return !__ranOut(r);
    if (s === "invalidated") { const u = (r && r.counterEligibleUntil) ? new Date(r.counterEligibleUntil).getTime() : 0; return u > now; }
    return false;
  });
  // Closed requests (ran out / turned away) so the host can see what they missed — sir 2026-08-07.
  const closed = rows.filter(function (r) {
    const s = lc(r && r.status);
    if (s === "declined") return true;
    if (s === "expired") return true;
    if (__ranOut(r)) return true;   // now also catches lapsed offers and lapsed payment windows
    if (s === "invalidated") { const u = (r && r.counterEligibleUntil) ? new Date(r.counterEligibleUntil).getTime() : 0; return !(u > now); }
    return false;
  }).sort(function (a, b) {
    return new Date(b.reviewedAt || b.updatedAt || 0).getTime() - new Date(a.reviewedAt || a.updatedAt || 0).getTime();
  });

  // A live request is urgent when its own clock is inside 12 hours. A same-table/date/time set is ONE
  // decision — accepting either releases the other — so if any member is urgent the whole set rises.
  const slotKey = function (r) {
    return String((r && r.experienceId) || "") + "|" + String((r && r.preferredDate) || "") + "|" + String((r && r.preferredTime) || "");
  };
  const msLeft = function (r) {
    const d = __grDeadline(r);
    return d ? (new Date(d).getTime() - now) : Infinity;
  };
  const bySlot = {};
  pending.forEach(function (r) { (bySlot[slotKey(r)] = bySlot[slotKey(r)] || []).push(r); });
  const urgentSlots = {};
  Object.keys(bySlot).forEach(function (k) {
    if (bySlot[k].some(function (r) { const m = msLeft(r); return m > 0 && m <= __GR_URGENT_MS; })) urgentSlots[k] = true;
  });
  const urgent = pending.filter(function (r) { return urgentSlots[slotKey(r)]; });
  const rest = pending.filter(function (r) { return !urgentSlots[slotKey(r)]; });
  const genuinelyUrgent = pending.filter(function (r) { const m = msLeft(r); return m > 0 && m <= __GR_URGENT_MS; }).length;

  // sir 2026-08-07 ("second section in guest request tab itself"): requests the host has already
  // answered that now sit with the GUEST — dates offered awaiting their pick, or a guest part-way
  // through paying for a date the host offered. Functional testing proved these existed in the page's
  // own data and rendered nowhere at all. Nothing here needs a decision; it needs to be visible.
  // Computed BEFORE the empty state, or a tab holding only these would claim to be empty.
  const waiting = rows.filter(function (r) {
    const s = lc(r && r.status);
    if (s !== "alternative_offered" && s !== "counter_accept_pending") return false;
    return !__ranOut(r);   // a closed window is not "waiting on the guest" — nobody is deciding
  });

  const wrap = El("section", { className: "space-y-10" });

  if (pending.length === 0 && waiting.length === 0 && closed.length === 0) {
    wrap.appendChild(El("div", {}, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Requests to approve" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "Guests asking to book your whole table land here for your yes." })
    ]));
    wrap.appendChild(El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "text-5xl mb-4", textContent: "🍽️" }),
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No guest requests right now" }),
      El("p", { className: "text-gray-500 mb-6", textContent: "When a guest asks to book your whole table, it lands here for your yes." }),
      El("button", { type: "button", className: "inline-block tsts-btn-primary px-8 py-3 rounded-full font-bold shadow transition", "data-action": "host-switch-section", "data-host-section": "listings", textContent: "View My Listings" })
    ]));
    return wrap;
  }

  if (urgent.length) {
    const block = El("div", { className: "space-y-4" });
    block.appendChild(El("div", {}, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Expiring soon" }),
      // sir's order [2026-08-07, "Fix it"]: the line must account for EVERY row the section shows. A
      // request that is not expiring is pulled up here when it wants the identical date and time as one
      // that is, because the two are one decision — so counting only the expiring ones printed "1
      // request runs out within 12 hours" above two rows, beside a card tag reading "2 expiring".
      // Raising the number instead would have been a second lie: the guest alongside is not expiring.
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: (function () {
        const soon = genuinelyUrgent;
        const alongside = urgent.length - genuinelyUrgent;
        const head = soon === 1
          ? "1 request runs out within 12 hours"
          : soon + " requests run out within 12 hours";
        if (alongside <= 0) return head;
        return head + (alongside === 1
          ? ". The other wants the same date and time"
          : ". The others want the same date and time");
      })() })
    ]));
    block.appendChild(__renderHostRequestsQueue(urgent, El, { urgentSection: true }));
    wrap.appendChild(block);
  }

  if (rest.length) {
    const block = El("div", { className: "space-y-4" });
    block.appendChild(El("div", {}, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Requests to approve" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: urgent.length
        ? (rest.length === 1 ? "1 more, none close to running out" : rest.length + " more, none close to running out")
        : (rest.length === 1 ? "1 guest request needs your reply" : rest.length + " guest requests need your reply") })
    ]));
    block.appendChild(__renderHostRequestsQueue(rest, El));
    wrap.appendChild(block);
  }

  if (waiting.length) {
    const block = El("div", { className: "space-y-4" });
    block.appendChild(El("div", {}, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Waiting for guest" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: waiting.length === 1
        // sir: "why heading says nothing for you to do until they answer -- host can still chat --
        // remove this particual line". It was false — the host can chat with the guest here, and now
        // can take the dates back as well. The line said the opposite and told a host to sit still.
        ? "1 request is with the guest"
        : waiting.length + " requests are with the guest" })
    ]));
    block.appendChild(__renderHostRequestsQueue(waiting, El, { waitingSection: true }));
    wrap.appendChild(block);
  }

  if (closed.length) {
    const block = El("div", { className: "space-y-4" });
    const body = El("div", { className: "space-y-4 mt-4 hidden" });
    const glyph = El("span", { className: "text-xl font-bold leading-none text-gray-600" }, [window.tstsPlusMinus(false)]);
    const toggle = El("button", { type: "button", className: "shrink-0 h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center", "aria-expanded": "false", "aria-label": "Show missed and declined requests" }, [glyph]);
    const header = El("div", { className: "flex items-center justify-between gap-3 cursor-pointer" }, [
      El("div", {}, [
        El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Missed & declined" }),
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: (closed.length === 1 ? "1 request" : closed.length + " requests") + " · what ran out and who you turned away" })
      ]),
      toggle
    ]);
    const flip = function () {
      const nowHidden = body.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", nowHidden ? "false" : "true");
      toggle.setAttribute("aria-label", (nowHidden ? "Show" : "Hide") + " missed and declined requests");
      window.tstsSetPlusMinus(glyph.firstChild, !nowHidden);
      // sir's order that this section read as richly as the others exposed why it never could: it is
      // built INSIDE a hidden body, and a hidden element measures zero width, so __grApplyRowShape
      // bailed out on every closed row and none of them ever received a grid template. They rendered
      // as one 958px column — a 312px vertical stack of badge, photo, name, facts, money, one under
      // the other, against 68px for every live row. Shaped the moment the section is actually opened,
      // which is the first instant these rows have a width at all.
      if (!nowHidden) {
        try {
          var __cr = body.querySelectorAll(".tsts-gr-row");
          for (var __i = 0; __i < __cr.length; __i++) __grApplyRowShape(__cr[__i]);
          var __cb = body.querySelectorAll(".tsts-gr-facts");
          for (var __j = 0; __j < __cb.length; __j++) __grShapeFactsBar(__cb[__j]);
        } catch (_csErr) { void _csErr; }
      }
    };
    toggle.addEventListener("click", function (e) { e.stopPropagation(); flip(); });
    header.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("button")) return; flip(); });
    block.appendChild(header);
    body.appendChild(__renderHostRequestsQueue(closed, El, { closedSection: true }));
    block.appendChild(body);
    wrap.appendChild(block);
  }

  // Re-mount the whole hosting body — renderHostingSectionContent only BUILDS an element; this is the
  // function that actually puts it on the page. Guarded so a stray tick can never redraw another tab.
  __grEnsureTicker(function () {
    try {
      if (hostDashboardState.section !== "guest-requests") return;
      renderHostingDashboard();
    } catch (_rr) { void _rr; }
  });
  return wrap;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// sir's spec [2026-08-07]: "Expiring soon sits above Requests to approve, cutoff is 12 hours, they
// will not be grouped, don't break the card design, live HH:MM:SS clock instead of 'Pending · 2h',
// anything under 12 hours moves to the top section" — plus: expired and declined drop to a bottom
// section so the host can see what they missed, and the guest's history rides in the panel.
// ───────────────────────────────────────────────────────────────────────────────────────────────

// The clock: floors everywhere, so a deadline never overstates the time left. Under an hour it turns
// red. At zero the row is dead and says so.
function __grCountdown(expiresAtRaw) {
  var dt = safeDate(expiresAtRaw);
  if (!dt) return null;
  var ms = dt.getTime() - Date.now();
  if (ms <= 0) return { ms: ms, text: "Ran out", urgent: false, expired: true };
  var s = Math.floor(ms / 1000);
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  return {
    ms: ms,
    text: pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60) + " left",
    urgent: ms < 60 * 60 * 1000,
    expired: false
  };
}

var __GR_URGENT_MS = 12 * 60 * 60 * 1000;   // sir's cutoff
var __grTicker = null;

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// Request-row shape. The seven columns are sized to the longest content each will ever hold, measured
// live off the page: name 100px, amount 80px, clock 171px ("2 dates · 46:30:38 left"), buttons 220px.
// Those maxima plus gaps need ~1112px, and the card offers 990px — so a single line cannot hold them
// all at every window. The row therefore has TWO shapes and every row on the page switches at the same
// threshold, so the list never goes ragged with some rows on one line and others on two.
// ───────────────────────────────────────────────────────────────────────────────────────────────────
// A name has no maximum length. "No Photo Guest" — fourteen characters — already overran the 120px I
// had called "sized to the longest thing it will ever hold", and a real surname took 297px. So the
// parts that DO have a true maximum keep fixed columns (amount, clock, buttons), and the two carrying
// open-ended text share the remainder in FIXED PROPORTIONS: every column still starts at the same x on
// every row, but long names and long facts get the room that exists instead of a number I invented.
// The amount moves 88px → 104px: 88px fitted "A$12,345" with nothing to spare, so one more digit clipped.
var __GR_ROW_WIDE = "44px 32px minmax(0, 1fr) minmax(0, 1.6fr) 104px 176px 224px";
// TIGHT is a CARD, not a folded row. sir 2026-08-07: "in which world you are thinking that a person
// visiting site on mobile will want a horizonal line?" — my first attempt below 900 was the desktop row
// cut in half, which is the same thinking in a smaller box. On a phone the request now reads top to
// bottom the way a person reads: WHO (photo + name) · WHEN AND HOW MANY (the facts) · WHAT IT'S WORTH
// AND HOW LONG IS LEFT (amount + clock) · WHAT TO DO (buttons across the full width, so the targets are
// big enough for a thumb instead of three small controls crammed side by side).
// sir's ruling 2026-08-07: "Date sits with the time". The badge used to sit top-left, BELOW the guest's
// photo and name and away from the time — measured cell tops were photo 12 · name 16 · badge 18 ·
// facts 52 — so the date read as a stray tile and "when the meal is" was split across two lines and two
// directions. The badge now leads the very line that carries the time and the party size.
// sir's ruling 2026-08-07: "One left edge". Measured before the fix, ONE card had six left edges —
// 16 card · 17 row · 33 thumb/badge/photo/amount/buttons · 85 card title · 89 name and facts · 205 clock
// — so the eye travelled 33 → 89 → 33 → 89 down a single card, and the card's own title sat 4px adrift
// of the guest name beneath it. The cause was mine: the leading icon in each line was a different width
// (40px card thumb, 44px date badge, 32px photo), so the text after each one landed somewhere different.
// The leading track is now ONE width for every line, so every line starts at 33 and every piece of text
// after it starts at 85 — the same 85 the card title already used.
var __GR_TIGHT_LEAD = 40;
// Three FIXED tracks on a phone. `auto` sized itself to each card's own content, so the cards went
// ragged again — measured, four different line layouts and heights of 150 and 194 side by side.
// Four tracks on a phone so the name line can hold the name, the returning marker and the + without
// them sharing cells — measured, sharing made name×ret and name×expand overlap.
// sir's ruling 2026-08-07: the returning marker's slot is a FIXED width on every card, blank when the
// guest is new — sized to `auto` it shrank to its own text, so names ended at a different point and the
// + sat in a different place on every card (measured: five different layouts down one list).
// Built at call time, not at load: __GR_RETURN_TRACK is declared further down, so composing this as a
// constant here produced "undefinedpx" for the marker track.
function __grRowTight() {
  return __GR_TIGHT_LEAD + "px minmax(0, 1fr) " + __GR_RETURN_TRACK + "px 36px";
}
// Below this the wide shape starts eating the facts column, so the row goes to two lines instead.
var __GR_TIGHT_BELOW = 900;

// sir's ruling 2026-08-07: "Name gets room first". The proportional split I chose gave the guest's name
// 118px against 189px for the time-and-party line, so ORDINARY names were cut off at full desktop width:
// measured, "Konstantinos Papadopoulos-Whitfield" needed 297px, "Bartholomew Fitzgerald" 185px and
// "Mary-Jane O'Sullivan" 162px — all against 118px. A host was shown a stranger asking for their whole
// table and could not read that stranger's name. The name track is now measured from the LONGEST name
// actually on the page and applied to EVERY row, so names read in full and the column still starts at the
// same x on every row. The facts line yields instead: a shortened time still reads, half a surname does not.
// sir 2026-08-07, verbatim: "tell me ---- what happens if the name is 50 charecter -- wil this
// push time? why? what is the meaning of havig this review if you fake it ---- by keeping this
// flexible for other data point to shift coz one data point is taking too much space -- is this the
// meaning of having fixed widht for any column in table?"
//
// It did push the time, and sir is right that this made the whole review worthless: I had rebuilt the
// very interdependence sir ordered removed, dressed as "measured". A fixed column owns its width NO
// MATTER what any other column holds. So every track below is a constant. A 50-character name truncates
// inside its own 130px and moves nothing. The time column is 205px — enough for the longest time and
// party size on this tab ("5:00 PM – 8:00 PM · 6 guests" measures 202px) — and cannot be squeezed by a
// neighbour, because no neighbour can grow.
// 44 + 32 + 130 + 205 + 80 + 174 + 221 = 886, plus six 12px gaps = 958 = the row's usable width exactly.
// EIGHT columns now — sir added the returning-guest fact as its own column after the party size.
// Budget, fixed, adding to the row's usable 958px exactly:
//   44 badge + 32 photo + 130 name + 178 time + 88 returning + 80 amount + 174 clock + 148 buttons
//   = 874, plus seven 12px gaps = 958.
// The buttons track drops from 221 to 148 because it no longer has to hold Accept AND Decline AND the
// expand control side by side at their widest — measured, the three total 212px only when every label
// is at maximum; the cluster right-aligns inside its track and the expand control is what gives.
// CORRECTED BUDGET. My first eight-column build summed to 1022px against 958px available — the row
// overflowed the card by 64px and the "+" fell off the end, which is exactly what sir saw. My own
// off-card check compared against the ROW's edge, which had stretched with it, so the test hid the fault.
//   44 badge + 32 photo + 126 name + 175 time + 34 returning + 68 amount + 174 clock + 221 buttons
//   = 874, plus seven 12px gaps = 958 exactly.
// The buttons track goes BACK to its measured 221 — Accept + Decline + the expand control need every
// pixel of it, and shaving 9px off is what hid the "+".
// The returning column carries the ordinal alone ("12th"); the full sentence lives in its tooltip and
// in the expanded panel, which is where sir already has the history.
// THE SPACE WAS FOUND, NOT TAKEN FROM ANYTHING. sir refused to nominate a column to sacrifice, and was
// right to: nothing had to be sacrificed. No single row ever needs the widest clock AND the widest
// buttons at the same time — the long clock texts ("2 dates · 44:30:13 left", "Paying · 36:30:13 left",
// 172px) appear ONLY on rows waiting on the guest, and those rows carry the + alone (36px); rows with
// Accept and Decline (221px) carry a 111px clock. Reserving both maxima side by side burned 63px on
// every row for a combination that cannot occur. The clock and the buttons now share ONE fixed track,
// sized to the worst real pairing — 111 + 12 + 221 = 344 — with the pair right-aligned inside it.
// Nothing is truncated, nothing is dropped, and the track is a constant like every other.
//   44 badge + 32 photo + 130 name + 175 time + 76 returning + 80 amount + 344 clock-and-buttons
//   = 881, plus six 12px gaps = 953, inside the row's 958px.
// sir 2026-08-07: "so now dollar vlaue is getting over time?" — the amount sat 10px from the countdown
// and read as collided, while every other pair on the row had room. My overlap test only asked whether
// two boxes intersect, so two things touching passed it. The action block now carries a 20px margin of
// its own, paid for by trimming each remaining track to its true measured need rather than my padding:
//   44 badge + 32 photo + 126 name + 168 time + 86 returning + 80 amount + 20 margin + 340 actions
//   = 896, plus six 10px gaps = 956, inside the row's 958px.
var __GR_NAME_TRACK  = 126;   // holds "Bartholomew F." (125px), the widest shortened form measured
var __GR_FACTS_TRACK = 182;   // holds "11:30 PM – 2:00 AM · 24 guests"; 168 cut it — the 14px came back
                              // from the margin trick that moved nothing, not from another column
var __GR_RETURN_TRACK = 86;   // holds "138th booking" (84px)
var __GR_MONEY_TRACK = 80;    // holds "A$12,345"
// EIGHT cells now: the countdown and the expand control are their own, so a phone can put the + beside
// the guest's name and the countdown beside the amount (sir's design 2026-08-07).
//   44 badge + 32 photo + 126 name + 182 time + 86 returning + 80 amount + 176 clock + 168 buttons
//   + 36 expand = 930, plus eight 10px gaps = ... too wide for 958, so on the WIDE row the clock keeps
// its own track and the buttons keep theirs, sized to what they really need rather than a worst case.
var __GR_CLOCK_TRACK = 176;   // "2 dates · 44:30:13 left" measured 172
var __GR_BTNS_TRACK  = 172;   // Accept 78 + 8 + Decline 82
var __GR_EXPAND_TRACK = 36;   // the expand control
// sir's design: expanding a row drops the TIME and the RETURNING columns (both are in the panel below)
// and hands their space to the name, which then shows in full.
// Collapsed, the name+time+returning block spans 130 + 12 + 178 + 12 + 88 = 420px. Expanded, the two
// emptied tracks are 0px but their two 12px gaps remain, so the name track must be 420 − 24 = 396 for
// the amount, the clock and the buttons to stay on exactly the same pixel. At +24 they drifted right.
// Collapsed, name+time+returning spans 130 + 10 + 175 + 10 + 88 = 413. Expanded, the two emptied tracks
// are 0px but their two 10px gaps remain, so the name track must be 413 − 20 = 393 for the amount and
// the action block to stay on exactly the same pixel.
var __GR_EXPANDED_NAME_TRACK = __GR_NAME_TRACK + __GR_FACTS_TRACK + __GR_RETURN_TRACK;

// sir's order 2026-08-07, verbatim: "the time saty is first row and ful time view -- i will ---- you if
// you ---- crop it ---- why cant time colum n move right with proper space?" — the time stays
// on the first line, in full, never cropped. The room came from the amount, the clock and the buttons,
// which were each reserving a worst case (104 · 176 · 224 = 504px) far beyond what they ever render.

function __grRowWide(expandedRow) {
  // Eight tracks on the desktop row: the expand control rides inside the button cluster there.
  //   44 + 32 + 126 + 182 + 86 + 80 + 176 + 212 = 938, plus seven 10px gaps = 1008 — still 50 too many,
  //   so the countdown and the buttons share ONE track again on desktop, exactly as they did before:
  //   44 + 32 + 126 + 182 + 86 + 80 + 340 = 890, plus six 10px gaps = 950, inside 958.
  // Seven tracks on desktop: badge · photo · name · time · returning · amount · action block.
  //   44 + 32 + 126 + 182 + 86 + 80 + 340 = 890, plus six 10px gaps = 950, inside the row's 958px.
  // 340, not the sum of the three maxima (404): no row holds the widest countdown AND the buttons.
  // Rows with Accept and Decline carry a 111px clock (111 + 8 + 78 + 8 + 82 + 8 + 36 = 331); rows
  // waiting on the guest carry the 172px clock and the + alone (172 + 8 + 36 = 216). 340 covers both.
  // sir 2026-08-16 ("the approal is revoked ... till it is fixed"): at the page's new standard
  // width the fixed tracks left ~300px dead after the buttons. A flexible spacer track sits before
  // the money column so the amount, countdown and buttons anchor to the card's RIGHT edge, while
  // every fixed column keeps its constant width.
  var tail = "1fr " + __GR_MONEY_TRACK + "px 340px";
  if (expandedRow) {
    // Time and returning-guest columns come off; the name takes their space and shows in full.
    return "44px 32px " + __GR_EXPANDED_NAME_TRACK + "px 0px 0px " + tail;
  }
  return "44px 32px " + __GR_NAME_TRACK + "px " + __GR_FACTS_TRACK + "px " + __GR_RETURN_TRACK + "px " + tail;
}

// Every track is a CONSTANT — sir 2026-08-07: a fixed column owns its width no matter what any other
// column holds. Nothing here measures content and hands leftovers around; that was the interdependence
// sir ordered removed, and rebuilding it as "measurement" was the same fault wearing a lab coat.
// Kept as a function so the wide template is assembled in exactly one place.
function __grSyncNameTrack() { return false; }

// The two forms of the guest's name travel with the row itself, so the shape function can swap between
// them without needing the row's original data in scope.
// Measures a name against the fixed name track, in the row's own font, with one cached canvas — no DOM
// churn per row. The TRACK never changes; only whether a name is shown in full or shortened.
var __grNameCtx = null;
function __grTextFitsName(text) {
  try {
    if (!__grNameCtx) {
      var cvs = document.createElement("canvas");
      __grNameCtx = cvs.getContext("2d");
      __grNameCtx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    }
    return __grNameCtx.measureText(String(text || "")).width <= (__GR_NAME_TRACK - 4);
  } catch (_mErr) { void _mErr; return String(text || "").length <= 13; }
}

function requesterNameOf(rowGrid) { return rowGrid.getAttribute("data-gr-fullname") || ""; }
function shortNameOf(rowGrid) { return rowGrid.getAttribute("data-gr-shortname") || ""; }

function __grApplyRowShape(rowGrid) {
  if (!rowGrid || !rowGrid.style) return;
  // NO child-count guard. It used to demand nine direct children, but the countdown and the expand
  // control now move INSIDE the action block on desktop, leaving seven — so the guard returned early
  // and the row never re-shaped on expand at all. sir caught this: the time and party size stayed on
  // screen when a row was opened, and my "expand holds to the pixel" proof was from an earlier build
  // that I never re-ran after making the cells movable. The named lookup below is the real guard.
  var w = rowGrid.clientWidth || 0;
  if (!w) return;
  var tight = w < __GR_TIGHT_BELOW;
  var isOpen = rowGrid.getAttribute("aria-expanded") === "true";
  var wideTemplate = __grRowWide(isOpen);
  var stateKey = (tight ? "tight" : "wide") + (isOpen ? ":open" : ":shut");
  if (rowGrid.getAttribute("data-gr-shape") === stateKey
    && (tight || rowGrid.style.gridTemplateColumns === wideTemplate)) return;
  rowGrid.setAttribute("data-gr-shape", stateKey);
  var cell = function (nm) { return rowGrid.querySelector('[data-gr-cell="' + nm + '"]'); };
  var badge = cell("badge"), photo = cell("photo"), name = cell("name"), facts = cell("time"),
      ret = cell("ret"), money = cell("money"), clock = cell("clock"), actions = cell("actions"),
      expand = cell("expand");
  if (!badge || !photo || !name || !facts || !ret || !money || !clock || !actions || !expand) return;
  // DESKTOP cannot afford the expand control as its own column — measured, nine tracks plus their gaps
  // need 1014px in a 958px row, and the row ran past the card. It rides inside the button cluster there,
  // exactly as before, and only becomes its own cell on a phone, where sir wants it beside the name.
  if (tight) {
    // Phone: the countdown and the + become their own cells so they can sit where sir placed them.
    if (clock.parentNode !== rowGrid) rowGrid.appendChild(clock);
    if (expand.parentNode !== rowGrid) rowGrid.appendChild(expand);
  } else {
    // Desktop: both ride inside the action block. As separate columns they needed 1008px in a 958px
    // row and the row ran past the card; inside the block the row is 950px and fits.
    if (clock.parentNode !== actions) actions.insertBefore(clock, actions.firstChild);
    if (expand.parentNode !== actions) actions.appendChild(expand);
  }
  if (tight) {
    [badge, photo, name, facts, ret, money, clock, actions, expand].forEach(function (el) { el.style.gridColumn = ""; });
    rowGrid.style.gridTemplateColumns = __grRowTight();
    // The card, read top to bottom: WHO · WHEN · WHAT IT'S WORTH AND HOW LONG IS LEFT · WHAT TO DO.
    // sir 2026-08-07: "who gave you right to put accpt decline and expant in one row but leave aount and
    // clock hanging" — the amount and the clock had a half-empty line of their own above a full-width
    // button row, which reads as leftovers rather than a card. Three lines now, each one complete:
    //   1  photo · guest
    //   2  date · time and party · returning
    //   3  amount · countdown · the three buttons
    photo.style.gridArea = "1 / 1 / 2 / 2";
    name.style.gridArea  = "1 / 2 / 2 / 3";
    // sir's rule, phone, EXPANDED: "after expansion no time 9 AM 11 AM in same row as date -- Date gets
    // in line with Aisha kha and profile". The phone branch never looked at the open state at all — it
    // laid the same four lines whether the row was shut or open, so the time and party size stayed on
    // screen underneath a panel that already carries them, and the date sat on a line of its own.
    // Open: the date joins the photo and the name on line one, and the time comes off the row entirely,
    // exactly as it does on the wide row.
    // The +/- control sits top-right on line one in BOTH states — sir's design, unchanged by expansion.
    expand.style.gridArea = "1 / 4 / 2 / 5";
    expand.style.justifySelf = "end";
    if (isOpen) {
      // sir: "date is still on right side despite me telling you to keep it on left side slign extrement
      // left". The date LEADS the line — extreme left, then the photo, then the guest — which is the
      // same reading order the wide row uses. That needs its own track layout for the open state, since
      // the shut layout puts the photo first.
      rowGrid.style.gridTemplateColumns = __GR_TIGHT_LEAD + "px 32px minmax(0, 1fr) 36px";
      badge.style.gridArea = "1 / 1 / 2 / 2";
      badge.style.justifySelf = "start";
      photo.style.gridArea = "1 / 2 / 2 / 3";
      name.style.gridArea  = "1 / 3 / 2 / 4";
      facts.style.gridArea = "2 / 2 / 3 / 5";
      facts.style.visibility = "hidden";
      ret.style.gridArea = "1 / 3 / 2 / 4";
      ret.style.visibility = "hidden";
      clock.style.gridArea = "2 / 1 / 3 / 3";
      money.style.gridArea = "2 / 3 / 3 / 5";
      actions.style.gridArea = "3 / 1 / 4 / 5";
    } else {
    badge.style.gridArea = "2 / 1 / 3 / 2";   // sir's ruling: the date leads the time's own line
    facts.style.gridArea = "2 / 2 / 3 / 5";
    facts.style.visibility = "";
    badge.style.justifySelf = "";
    // The amount leads the action line rather than sitting on a half-empty line of its own, and it spans
    // the two left tracks — in the 40px lead track alone it was CUT (measured at 390px).
    // The countdown takes the WIDE track and the amount the narrow one: reversed, the clock had 132px
    // and its longest text ("2 dates · 44:30:13 left", 172px) was CUT, while the amount sat in 205px
    // holding "A$500". They stay on one line together, which is sir's ruling.
    clock.style.gridArea = "3 / 1 / 4 / 3";
    money.style.gridArea = "3 / 3 / 4 / 5";
    // sir's ruling 2026-08-07: the returning-guest fact goes BESIDE THE GUEST'S NAME, which every card
    // has — so no card gains or loses a line and every card stands the same height. On its own line it
    // made cards 222px and 206px side by side.
    ret.style.gridArea   = "1 / 3 / 2 / 4";
    ret.style.justifySelf = "end";
    actions.style.gridArea = "4 / 1 / 5 / 5"; // Accept and Decline alone: 168px in a 324px card
    ret.style.visibility = ret.textContent ? "" : "hidden";
    }
    ret.style.textAlign = "right";
    ret.style.minHeight = "";
    // sir: "9 AM and 11 AM must align vertically to Aisha khan name". The facts cell is centred for the
    // WIDE row (sir's own earlier ruling), and on a phone that cell spans 274px — centring pushed the
    // time 55px right of the name sitting directly above it. Measured: name text 83, time text 138.
    // Left on a phone so the two share one vertical line; the wide row keeps its centring untouched.
    facts.style.textAlign = "left";
    // sir: "A$300 must center align to Decline". It was right-aligned to the card edge, putting its
    // centre 57px right of Decline's. The money cell spans the same tracks the Decline button sits in,
    // so centring the text lands it over that button.
    money.style.textAlign = "center";
    actions.style.justifyContent = "stretch";
    actions.style.marginLeft = "";
    // One leading width for every line: the 44px date badge and the 32px photo both sit in a 40px
    // track, matching the card's own 40px thumbnail, so nothing after them is indented differently.
    badge.style.width = __GR_TIGHT_LEAD + "px";
    badge.style.height = __GR_TIGHT_LEAD + "px";
    photo.style.justifySelf = "start";
    // A row with Accept + Decline stands 38px; one with only the expand control stands 36px, so rows
    // came out 100px and 102px next to each other. The CELL is pinned, not the buttons — sir's approved
    // button recipe is untouched.
    actions.style.minHeight = "38px";
    // sir: "time left pill widht must match Accept". The pill sized itself to its own text (182px)
    // against Accept's 157px, so the two stacked lines had different edges. The countdown cell spans
    // the two left tracks — the same span Accept occupies in the line below — so stretching the pill
    // to fill its cell makes the two widths agree by construction rather than by a number I pick.
    // sir: "time left pill widht must match Accept" and "A$300 must center align to Decline".
    // Neither can be a constant: Accept and Decline size themselves from their own labels inside a
    // stretched row, so the only true answer is the one measured off those buttons after they lay out.
    clock.style.justifySelf = "start";
    try {
      requestAnimationFrame(function () {
        try {
          var btns = actions.querySelectorAll("button");
          var acc = btns[0], dec = btns[1];
          var pillEl = clock.firstElementChild || clock;
          if (acc && pillEl && pillEl.style) {
            var aw = Math.round(acc.getBoundingClientRect().width);
            if (aw > 0) { pillEl.style.width = aw + "px"; pillEl.style.textAlign = "center"; }
          }
          if (dec && money && money.style) {
            var mb = money.getBoundingClientRect();
            var db = dec.getBoundingClientRect();
            money.style.textAlign = "left";
            // Shift the money text so its own centre lands on Decline's centre.
            var rng = document.createRange(); rng.selectNodeContents(money);
            var tb = rng.getBoundingClientRect();
            var shift = Math.round((db.left + db.width / 2) - (tb.left + tb.width / 2));
            money.style.transform = "translateX(" + shift + "px)";
          }
        } catch (_m1) { void _m1; }
      });
    } catch (_m2) { void _m2; }
    // At 320px three buttons plus the countdown cannot sit across a 288px card — measured, they were
    // CUT. They wrap onto a second line instead, so every control stays whole and thumb-sized.
    actions.style.flexWrap = "wrap";
    actions.style.rowGap = "8px";
    for (var __bi = 0; __bi < actions.children.length; __bi++) {
      actions.children[__bi].style.flex = "1 1 auto";
      actions.children[__bi].style.minWidth = "0";
    }
  } else {
    // Clear everything the phone shape pins, so a resize back to a wide window starts clean.
    try {
      var __pw = clock.firstElementChild || clock;
      if (__pw && __pw.style) { __pw.style.width = ""; }
      if (money && money.style) { money.style.transform = ""; money.style.textAlign = "right"; }
      if (facts && facts.style) { facts.style.textAlign = ""; facts.style.visibility = ""; }
      if (badge && badge.style) { badge.style.justifySelf = ""; }
    } catch (_cw) { void _cw; }
    rowGrid.style.gridTemplateColumns = wideTemplate;
    [badge, photo, name, facts, ret, money, clock, actions, expand].forEach(function (el) { el.style.gridArea = ""; });
    // The spacer is track 6 — pin the tail cells past it so the buttons meet the card's right edge.
    badge.style.gridColumn = "1"; photo.style.gridColumn = "2"; name.style.gridColumn = "3";
    facts.style.gridColumn = "4"; ret.style.gridColumn = "5"; money.style.gridColumn = "7";
    actions.style.gridColumn = "8";
    // sir's design: on expand the time and the returning-guest columns come off and the name shows in
    // full. Their TRACKS go to 0px — but the cells stay in the grid. `display:none` removes a grid item
    // altogether, which slid every later column one track to the left: measured, the amount sat at 589
    // on rows with no returning guest and 689 on rows with one, and the buttons jumped 386px on expand.
    // Hidden by overflow instead, so the columns after them never move.
    facts.style.visibility = isOpen ? "hidden" : "";
    facts.style.overflow = "hidden";
    ret.style.visibility = (isOpen || !ret.textContent) ? "hidden" : "";
    ret.style.overflow = "hidden";
    ret.style.minHeight = "";
    ret.style.textAlign = "";
    actions.style.flexWrap = "";
    actions.style.rowGap = "";
    name.textContent = isOpen ? requesterNameOf(rowGrid) : shortNameOf(rowGrid);
    expand.style.justifySelf = "";
    ret.style.justifySelf = "";
    actions.style.justifyContent = "flex-end";
    actions.style.minHeight = "";
    actions.style.marginLeft = "";
    // The countdown cannot be pushed right: it right-aligns inside a track that ends at the row's edge,
    // so a margin on that track only shrinks the box and moves nothing (measured — the gap stayed 11px).
    // The AMOUNT is what has to move, so it aligns to the LEFT of its own fixed column. "A$500" then
    // ends 62px clear of the countdown, and even "A$12,345" clears it by 30px.
    money.style.textAlign = "left";
    badge.style.width = "";
    badge.style.height = "";
    photo.style.justifySelf = "";
    for (var __wi = 0; __wi < actions.children.length; __wi++) {
      actions.children[__wi].style.flex = "";
      actions.children[__wi].style.minWidth = "";
    }
  }
}

// The expanded panel's facts bar takes the same two-shape treatment as the row: four fixed columns
// where there is room, two-by-two on a phone (sir's ruling 2026-08-07). Measured before this: the four
// columns needed 622px and a phone panel offers 292px, so Guests and the money sat 314px off the panel.
function __grShapeFactsBar(bar) {
  if (!bar || !bar.style) return;
  var w = bar.clientWidth || (bar.parentElement ? bar.parentElement.clientWidth : 0);
  if (!w) return;
  var wide = w >= 600;
  var key = wide ? "wide" : "pairs";
  if (bar.getAttribute("data-gr-facts") === key) return;
  bar.setAttribute("data-gr-facts", key);
  // sir's order: "space out Date Time and guests and on hold ... but do not push it to extreme right of
  // card". Three fixed columns now that the money rides under the time. Each track still holds its own
  // longest value (a full date, a 12-hour range, "24 guests"), and the gap between them is widened from
  // 24px to 64px. Total 160 + 64 + 200 + 64 + 140 = 628px inside a 926px panel, so the bar breathes and
  // still stops well short of the card's right edge instead of stretching to it.
  // The pair columns on a phone are NOT an even split: "5:00 PM – 8:00 PM" is the longest value in the
  // bar and an even half clipped it — sir's standing rule that the time is never cropped.
  // sir's words, transcript line 19796: "spave out Date Time and guests and on hold in expanaded cord
  // so there there is more aspace between them but do not push it to etrement righ of card ... make on
  // hold below time pill and accordingly distribut the middle 2 columns accordingly", clarified after I
  // got it wrong: "put date and on hole at left and right with rest 2 betweeon them".
  //
  // THE TIME PILL IS THE COUNTDOWN — "02:14:27 left" — the only pill on this tab. I had read sir's word
  // "pill" as the Time FACT and stacked the money under that instead, 371px left of where sir wanted it,
  // which collapsed four spread columns into three with the fourth hidden inside one of them.
  //
  // So: FOUR columns. Date anchors the left. On hold anchors the right, its column starting exactly
  // under the countdown pill's left edge — MEASURED off the live pill each time, never a hardcoded x,
  // so it stays true at any width and for any row. Time and Guests are the "middle 2", distributed by
  // an even gap across whatever room is left between those two anchors. The bar stops at the pill, well
  // short of the card's right edge, which is sir's "do not push it to extreme right".
  bar.style.gridTemplateColumns = wide ? "" : "minmax(0, 1fr) minmax(0, 1.3fr)";
  bar.style.columnGap = wide ? "" : "24px";
  var kids = bar.children;
  for (var i = 0; i < kids.length; i++) {
    if (kids[i] && kids[i].style) { kids[i].style.gridColumn = ""; kids[i].style.gridRow = ""; }
  }
  if (!wide) { bar.style.width = ""; return; }

  var __GR_FB_DATE = 160, __GR_FB_TIME = 200, __GR_FB_GUESTS = 140, __GR_FB_MONEY = 111;
  var __anchorRight = 0;
  try {
    // The pill lives on the row ABOVE this panel. There is no [data-gr-card] attribute anywhere in this
    // page — I used that selector first and it matched nothing, so the anchor silently fell back to a
    // spacing I had invented and On hold landed 25px off sir's pill. Walk up to the nearest ancestor
    // that actually contains the row, which is what the DOM really provides.
    var __wrap = bar.parentElement, __row = null, __hops = 0;
    while (__wrap && __hops < 6) {
      __row = __wrap.querySelector(".tsts-gr-row");
      if (__row) break;
      __wrap = __wrap.parentElement; __hops += 1;
    }
    var __pill = __row ? __row.querySelector("[data-gr-deadline]") : null;
    if (__pill) {
      var __pr = __pill.getBoundingClientRect(), __br = bar.getBoundingClientRect();
      if (__pr.width > 0 && __br.width > 0) {
        __GR_FB_MONEY = Math.round(__pr.width);
        __anchorRight = Math.round(__pr.left - __br.left);   // where On hold's column must start
      }
    }
  } catch (_pErr) { void _pErr; }

  var __tracks = __GR_FB_DATE + __GR_FB_TIME + __GR_FB_GUESTS + __GR_FB_MONEY;
  // Without a pill on the row (closed requests carry a reason pill, waiting rows carry a clock), fall
  // back to the same generous spacing rather than jamming the four together.
  var __span = __anchorRight > 0 ? (__anchorRight + __GR_FB_MONEY) : (__tracks + 3 * 40);
  var __gap = Math.max(24, Math.round((__span - __tracks) / 3));
  bar.style.columnGap = __gap + "px";
  bar.style.width = (__tracks + 3 * __gap) + "px";
  bar.style.gridTemplateColumns = __GR_FB_DATE + "px " + __GR_FB_TIME + "px " + __GR_FB_GUESTS + "px " + __GR_FB_MONEY + "px";
}

// sir's phone orders for the card header, in his words: "put 1 reuest exprience soon below the heading
// and properly left aligned - experience heading can get into 2 rows but the experience picture must in
// first row and not handing like a ----".
//   WIDE  — one row: photo · title · tag, vertically centred. Unchanged from what sir already has.
//   PHONE — photo stays put at the TOP of the header; the title takes the whole remaining width and may
//           wrap to two lines; the tag drops underneath it, sharing the title's exact left edge.
// The title's truncation is lifted on the phone (it died at "Morning C…", 105px of a 356px card, 29% of
// the row, while a status label held 155px) and capped at two lines so a long name can never push the
// card open indefinitely.
function __grShapeCardHead(el) {
  if (!el || !el.style) return;
  var w = el.clientWidth || (el.parentElement ? el.parentElement.clientWidth : 0);
  if (!w) return;
  var wide = w >= 600;
  var key = wide ? "wide" : "stack";
  if (el.getAttribute("data-gr-cardhead") === key) return;
  el.setAttribute("data-gr-cardhead", key);
  var thumb = el.children[0];
  var col = el.children[1];
  if (!col) return;
  var title = col.children[0], tag = col.children[1];
  // The PHOTO always sits at the top of row one — never floating against a taller text block.
  el.style.alignItems = wide ? "center" : "flex-start";
  if (thumb && thumb.style) thumb.style.flex = "0 0 auto";
  // WIDE  — title and tag share one line, title truncating as sir already has it.
  // PHONE — the column stacks: the title wraps to at most two lines, the tag sits under it, and both
  //         start on the same left edge because they are siblings in the same column.
  col.style.display = "flex";
  col.style.flexDirection = wide ? "row" : "column";
  col.style.alignItems = wide ? "center" : "flex-start";
  col.style.gap = wide ? "12px" : "6px";
  if (title && title.style) {
    title.style.flex = wide ? "1 1 0%" : "0 1 auto";
    title.style.width = wide ? "" : "100%";
    title.style.overflow = "hidden";
    title.style.textOverflow = wide ? "ellipsis" : "";
    title.style.whiteSpace = wide ? "nowrap" : "normal";
    // Two lines maximum on a phone, then it ellipses — a name may wrap, not run away.
    title.style.display = wide ? "" : "-webkit-box";
    title.style.webkitBoxOrient = wide ? "" : "vertical";
    title.style.webkitLineClamp = wide ? "" : "2";
  }
  if (tag && tag.style) {
    tag.style.flex = "0 0 auto";
    // sir: the tag is "properly left aligned" with the heading. Its box sat flush, but a pill carries
    // its own left padding so its TEXT started 11px in from the title's. Pulled back by exactly that
    // padding + border, read off the element, so the two lines of text share one edge.
    if (wide) { tag.style.marginLeft = ""; }
    else {
      try {
        var ts = getComputedStyle(tag);
        var inset = (parseFloat(ts.paddingLeft) || 0) + (parseFloat(ts.borderLeftWidth) || 0);
        tag.style.marginLeft = "-" + Math.round(inset) + "px";
      } catch (_tgErr) { void _tgErr; }
    }
  }
}

// sir: on a phone the question and the answer stack; on a wider card they share one line. Same
// threshold as the facts bar, so the whole panel changes shape at one width rather than in pieces.
function __grShapeOfferHead(el) {
  if (!el || !el.style) return;
  var w = el.clientWidth || (el.parentElement ? el.parentElement.clientWidth : 0);
  if (!w) return;
  var wide = w >= 600;
  var key = wide ? "wide" : "stack";
  if (el.getAttribute("data-gr-offerhead") === key) return;
  el.setAttribute("data-gr-offerhead", key);
  el.style.flexDirection = wide ? "row" : "column";
  el.style.alignItems = wide ? "center" : "flex-start";
  el.style.rowGap = wide ? "" : "10px";
  // sir: "offer anoteher time has so much space on left and is not aligned to Cant do this date due to
  // spaces in pill in left". Stacked under the heading the button's BOX was flush at 49, but a pill
  // carries its own left padding, so its TEXT started at 66 — 17px in from the heading above it. The
  // box is pulled left by exactly that padding + border, read off the live element rather than guessed,
  // so the two lines of text share one edge. On a wide card the button is right-aligned and untouched.
  var btn = el.children && el.children[1];
  if (btn && btn.style) {
    if (wide) { btn.style.marginLeft = ""; return; }
    try {
      var bs = getComputedStyle(btn);
      var inset = (parseFloat(bs.paddingLeft) || 0) + (parseFloat(bs.borderLeftWidth) || 0);
      btn.style.marginLeft = "-" + Math.round(inset) + "px";
    } catch (_bErr) { void _bErr; }
  }
}

// One listener for the whole page — re-shapes every row together on any window change.
var __grShapeBound = false;
function __grBindShapeWatcher() {
  if (__grShapeBound) return;
  __grShapeBound = true;
  window.addEventListener("resize", function () {
    try {
      __grSyncNameTrack();
      var rows = document.querySelectorAll(".tsts-gr-row");
      for (var i = 0; i < rows.length; i++) __grApplyRowShape(rows[i]);
      var bars = document.querySelectorAll(".tsts-gr-facts");
      for (var b = 0; b < bars.length; b++) __grShapeFactsBar(bars[b]);
      var heads = document.querySelectorAll(".tsts-gr-offerhead");
      for (var h = 0; h < heads.length; h++) __grShapeOfferHead(heads[h]);
      var cheads = document.querySelectorAll(".tsts-gr-cardhead");
      for (var c = 0; c < cheads.length; c++) __grShapeCardHead(cheads[c]);
    } catch (_rsErr) { void _rsErr; }
  });
}

// Which clock governs a row: an awaiting request runs on its 24h deadline; a pre-empted one runs on
// the host's own window to offer another time.
function __grDeadline(r) {
  var s = String((r && r.status) || "").toLowerCase();
  if (s === "invalidated") return (r && r.counterEligibleUntil) || null;
  // An offer the guest is choosing from — and a guest who accepted but hasn't paid — both run on
  // offerExpiresAt, NOT the original 24h request clock. The sweep expires them on that timestamp,
  // so showing expiresAt here would count down to a deadline that no longer governs the row.
  if (s === "alternative_offered" || s === "counter_accept_pending") return (r && r.offerExpiresAt) || null;
  return (r && r.expiresAt) || null;
}

// One timer for the whole page, recomputed from the timestamp each tick so a backgrounded tab can
// never drift. When a row crosses 12 hours or hits zero, the section it belongs to changes — so the
// tab re-renders itself rather than leaving a row under a heading that no longer describes it.
function __grEnsureTicker(rerender) {
  if (__grTicker) { clearInterval(__grTicker); __grTicker = null; }
  __grTicker = setInterval(function () {
    var pills = document.querySelectorAll("[data-gr-deadline]");
    if (!pills.length) { clearInterval(__grTicker); __grTicker = null; return; }
    var mustRerender = false;
    for (var i = 0; i < pills.length; i++) {
      var p = pills[i];
      var cd = __grCountdown(p.getAttribute("data-gr-deadline"));
      if (!cd) continue;
      var section = p.getAttribute("data-gr-section") || "rest";
      // Rows waiting on a guest never move section and never turn red — without this they would
      // re-render the whole tab every single second once their clock dropped under 12 hours, and
      // they would repaint in the colour that means "the host must act", which they don't.
      if (section === "waiting") {
        p.textContent = (p.getAttribute("data-gr-prefix") || "") + cd.text;
        if (cd.expired) mustRerender = true;
        continue;
      }
      if (cd.expired) { mustRerender = true; continue; }
      // THE BUG THIS REPLACES (sir found it; measured 2026-08-07): this compared the row's live urgency
      // to the SECTION it was in. A companion row — pulled into "Expiring soon" by sir's collision rule
      // while its own clock read 17 or 39 hours — could never satisfy that comparison, so it demanded a
      // full re-render on EVERY tick, for ever. The tab threw away and rebuilt its entire DOM about
      // once a second, which is why a host's click could land on a node that no longer existed and
      // simply do nothing, and why an opened offer form closed itself immediately.
      // A row is now judged against ITS OWN urgency as drawn: a rebuild happens only when that actually
      // flips, which is exactly when the row's section could genuinely change.
      var wasUrgent = p.getAttribute("data-gr-urgent") === "1";
      if ((cd.ms <= __GR_URGENT_MS) !== wasUrgent) { mustRerender = true; continue; }
      p.textContent = (p.getAttribute("data-gr-prefix") || "") + cd.text;
      if (cd.urgent && p.className.indexOf("bg-red-100") === -1) {
        // Swap ONLY the tone — rebuilding the whole class string here dropped the centring and the
        // fixed geometry that keeps this pill aligned with the buttons beside it.
        p.className = p.className.replace(/bg-amber-100|text-amber-700/g, "").trim() + " bg-red-100 text-red-700";
      }
    }
    if (mustRerender && typeof rerender === "function") rerender();
  }, 1000);
}

function renderHostBookingsSection(bookings) {
  const El = window.tstsEl;
  const wrap = El("section", { className: "space-y-6" });
  const rows = Array.isArray(bookings) ? bookings : [];
  const lc = function (v) { return String(v || "").toLowerCase(); };
  const now = Date.now();

  // Owner 2026-07-23 (sir: the Bookings tab is really a "Who's coming" roster, not a flat 25-item dump of
  // every booking incl. dead/never-paid ones): drop the dead ones, split into UPCOMING (who's coming,
  // soonest first) + PAST (history, collapsed). Same card family + brand chrome as My Listings/Overview so
  // the whole Hosted section reads as ONE product.
  const isDead = function (b) {
    const s = lc(b && b.status); const p = lc(b && b.paymentStatus);
    const deadPay = (p === "abandoned" || p === "failed" || p === "unpaid" || p === "");
    if (s === "expired" || s === "declined" || s === "rejected") return true;
    if (s === "cancelled" && deadPay) return true; // cancelled AND never paid = never a real booking
    return false;
  };
  const slotMs = function (b) {
    if (b && (b.slotStartAt || b.startAt)) { const t = new Date(b.slotStartAt || b.startAt).getTime(); if (isFinite(t)) return t; }
    if (b && b.bookingDate) { const t2 = new Date(String(b.bookingDate) + "T00:00:00").getTime(); if (isFinite(t2)) return t2; }
    return NaN;
  };
  const isUpcoming = function (b) {
    const s = lc(b && b.status);
    if (s !== "confirmed" && s !== "authorized") return false;
    // Owner 2026-08-02 (sir's roster sweep): a PENDING private request's HOLD booking (authorized,
    // linked to a request row) is NOT an upcoming guest — that guest already sits in "Requests to
    // approve" above. Showing both duplicated every pending request. Same leak the guest side fixed.
    if (s === "authorized" && String((b && b.privateRequestId) || "").length > 0) return false;
    const ms = slotMs(b);
    if (!isFinite(ms)) return true; // no readable date → keep it visible rather than hide it
    return ms >= (now - 6 * 3600 * 1000); // still today/future (6h grace for in-progress events)
  };

  const live = rows.filter(function (b) { return !isDead(b); });
  const upcoming = live.filter(isUpcoming).sort(function (a, b) { return (slotMs(a) || 0) - (slotMs(b) || 0); });
  // Owner 2026-08-05 (sir: "how the ---- a booking of futuredate sit s in past booking?"): `past` was
  // "everything not upcoming", so a PENDING private-request HOLD — authorized, FUTURE-dated, and
  // deliberately kept out of the upcoming roster above to avoid duplicating the request — landed in a
  // section headed "Past bookings · completed and cancelled". It is none of those three. Those holds
  // belong only in "Requests to approve"; a booking is PAST once its slot has genuinely passed.
  const isPendingRequestHold = function (b) {
    return lc(b && b.status) === "authorized" && String((b && b.privateRequestId) || "").length > 0;
  };
  const past = live
    .filter(function (b) { return !isUpcoming(b) && !isPendingRequestHold(b); })
    .sort(function (a, b) { return (slotMs(b) || 0) - (slotMs(a) || 0); });

  const renderGroups = function (list) {
    const frag = El("div", { className: "space-y-4" });
    const groups = _groupByKey(list, function (b) {
      const gid = String((b.guestId && typeof b.guestId === "object") ? (b.guestId._id || b.guestId.id || "") : (b.guestId || b.guestUserId || ""));
      // Deleted-guest fallback (2026-08-06, found via the 1000-seat mock): an unresolvable guest
      // must not merge with every other unresolvable guest into one grouped pile.
      return (gid || ("solo-" + String(b._id || ""))) + "|" + _occurrenceKey(b);
    });
    groups.order.forEach(function (k) {
      const g = groups.groups[k];
      frag.appendChild(g.length === 1 ? _renderHostBookingCard(El, g[0]) : _renderGroupedHostBookingCard(El, g));
    });
    return frag;
  };

  // sir's split, element 6 [2026-08-07]: the "Requests to approve" section moved to its own
  // Guest Requests tab — removed here CLEAN, no stub, no "moved" note rotting forever. The
  // Bookings tab now opens directly on Who's coming.
  wrap.appendChild(El("div", {}, [
    El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Who's coming" }),
    El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "Your upcoming guests, ready for the day." })
  ]));

  if (live.length === 0) {
    wrap.appendChild(El("div", { className: "bg-white p-6 rounded-2xl border border-gray-100 text-gray-500", textContent: "No bookings yet. Your listings are live and ready for guests." }));
    return wrap;
  }

  // Owner 2026-08-06 (found digging after sir's v4 rejection): the dashboard card belongs ONLY to
  // occurrences whose check-in window is OPEN right now — that is when "how many are in, who's
  // missing, remind them" exists as a job. Every other upcoming booking keeps sir's APPROVED
  // 2026-07-23 roster rows (guest, party, notes, View Details) — that design was settled and my
  // earlier versions bulldozed it for events that needed nothing.
  if (upcoming.length > 0) {
    // Per-OCCURRENCE rule (sir's states, 2026-08-06): the aggregate card renders when it carries
    // information the flat rows can't — the window is OPEN (check-in is a live job) OR the
    // occurrence holds MULTIPLE parties (a future big table needs its count, not 400 rows;
    // check-in actions stay hidden until the window opens). A single-party future booking is
    // exactly what sir's approved roster row already says perfectly — it stays a row.
    var __occSplit = _groupByKey(upcoming, _occurrenceKey);
    var __dashGroups = [], __rosterRows = [];
    __occSplit.order.forEach(function (k) {
      var g = __occSplit.groups[k];
      var w = __hostCheckinWindow(g[0]);
      var n = Date.now();
      var open = !!(w && n >= w.opensAt && n <= w.closesAt);
      if (open || g.length > 1) __dashGroups.push(g);
      else __rosterRows = __rosterRows.concat(g);
    });
    if (__dashGroups.length > 0) {
      var __dashFrag = El("div", { className: "space-y-4" });
      __dashGroups.forEach(function (g) { __dashFrag.appendChild(__renderOccurrenceDashCard(El, g)); });
      wrap.appendChild(__dashFrag);
    }
    if (__rosterRows.length > 0) wrap.appendChild(renderGroups(__rosterRows));
  } else {
    wrap.appendChild(El("div", { className: "bg-white p-6 rounded-2xl border border-gray-100 text-center" }, [
      El("p", { className: "font-bold text-gray-900", textContent: "No upcoming bookings right now" }),
      El("p", { className: "text-sm text-gray-500 mt-1", textContent: "When a guest books one of your experiences, they'll appear here." })
    ]));
  }

  // Past bookings — collapsed history (completed + cancelled-after-paid), newest first.
  // Owner 2026-08-02 (sir): a real SECTION in the locked header language, not an afterthought
  // text link — serif header + subtitle left, a proper +/− toggle right (same control as the
  // requests queue rows).
  if (past.length > 0) {
    const pastBody = El("div", { className: "space-y-4 mt-4 hidden" });
    const pastGlyph = El("span", { className: "text-xl font-bold leading-none text-gray-600" }, [window.tstsPlusMinus(false)]);
    const pastToggle = El("button", { type: "button", className: "shrink-0 h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center", "aria-expanded": "false", "aria-label": "Show past bookings" }, [pastGlyph]);
    const pastHeader = El("div", { className: "flex items-center justify-between gap-3 cursor-pointer" }, [
      El("div", {}, [
        El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Past bookings" }),
        // Owner 2026-08-06 (sir: "past bookings include cancelled and completed but that is not true"):
        // the list also holds ended-but-never-checked-in confirmed bookings, so the old subtitle lied.
        // "events that have ended" is true for every row this section can contain.
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: past.length + (past.length === 1 ? " past booking" : " past bookings") + " · events that have ended" })
      ]),
      pastToggle
    ]);
    function __togglePast() {
      const h = pastBody.classList.toggle("hidden");
      pastToggle.setAttribute("aria-expanded", h ? "false" : "true");
      pastToggle.setAttribute("aria-label", h ? "Show past bookings" : "Hide past bookings");
      window.tstsSetPlusMinus(pastGlyph.firstChild, !h);
    }
    pastToggle.addEventListener("click", function (e) { e.stopPropagation(); __togglePast(); });
    pastHeader.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("button")) return; __togglePast(); });
    pastBody.appendChild(renderGroups(past));
    // The Overview's "Respond" opens this list when the disputed booking has already happened.
    pastBody.setAttribute("data-past-bookings-body", "1");
    pastToggle.setAttribute("data-past-bookings-toggle", "1");
    wrap.appendChild(El("div", { className: "pt-6" }, [pastHeader, pastBody]));
  }

  return wrap;
}

// A dispute is nearly always about an event that has ALREADY happened, so the flagged card sits
// inside the collapsed "Past bookings" list. Sending the host to the Bookings tab alone left them
// looking at "Who's coming" with no dispute in sight. This opens that list and lands on the card.
function focusHostDisputeCard(attempt) {
  const tries = Number(attempt) || 0;
  const card = document.querySelector("[data-dispute-card]");
  if (!card) {
    // The section renders asynchronously; give it a few frames before giving up.
    if (tries < 20) { setTimeout(function () { focusHostDisputeCard(tries + 1); }, 120); }
    return;
  }
  const pastBody = card.closest("[data-past-bookings-body]");
  if (pastBody && pastBody.classList.contains("hidden")) {
    const toggle = document.querySelector("[data-past-bookings-toggle]");
    if (toggle) toggle.click();
  }
  setTimeout(function () {
    try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_scrollErr) { void _scrollErr; }
    card.classList.add("ring-2", "ring-rose-300");
    setTimeout(function () {
      try { card.classList.remove("ring-2", "ring-rose-300"); } catch (_ringErr) { void _ringErr; }
    }, 2600);
  }, 80);
}


// Owner 2026-08-02 (sir's roster sweep): Check In was offered on LONG-PAST bookings (Jul 31, May 30)
// and yesterday's dinner — clicking only earned "Entry code has expired." The button now renders only
// while the event date is today-or-future in the experience's home timezone (Australia/Melbourne);
// the backend keeps enforcing the precise hour window with its own clear errors.
// Owner 2026-08-06 (sir: an AUG-6 booking showed a live Check In button inside "Past bookings" —
// clicking it could only earn the backend's "window closed" error): the date-only rule lied for any
// same-day booking whose hour window had already shut. The button now mirrors the backend's EXACT
// enforcement — slotStartAt − 2h to slotStartAt + 6h — so a rendered Check In always works. The
// date-only Melbourne rule survives only as the fallback for rows with no readable slot timestamp
// (the backend still has the final word there, with its own clear errors).
function __hostCheckinWindow(b) {
  try {
    var iso = (b && (b.slotStartAt || b.startAt)) ? new Date(b.slotStartAt || b.startAt).getTime() : NaN;
    if (!isFinite(iso)) return null;
    return { opensAt: iso - 2 * 3600 * 1000, closesAt: iso + 6 * 3600 * 1000, startAt: iso };
  } catch (e) { void e; return null; }
}
function __hostCheckInDateOpen(b) {
  try {
    var w = __hostCheckinWindow(b);
    if (w) { var n = Date.now(); return n >= w.opensAt && n <= w.closesAt; }
    var d = String((b && b.bookingDate) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true; // malformed date: let the backend decide
    var mel = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
    return d >= mel;
  } catch (e) { void e; return true; }
}

// Single host booking card (extracted from original forEach)
function _renderHostBookingCard(El, b, opts) {
  // sir's ruling 2026-08-18 ("rich data, proper layout ... without being overwhelmed"): inside an
  // event's own card the row leads with the GUEST (avatar + bold name), not a repeat of the event
  // title and date the card header already carries. Standalone lists (Past bookings) keep the full
  // identity row. opts.insideEventCard flips the mode.
  var __inEvent = !!(opts && opts.insideEventCard);
    // Owner 2026-07-23: a bookingDate is a plain date (YYYY-MM-DD), NOT a timestamp — parse it directly so
    // the badge shows the SAME day in every timezone. `new Date("2026-08-22").getDate()` rolled the day back
    // for any viewer behind UTC (e.g. showed "Aug 21" for a 22 Aug booking). Fall back to a local Date only
    // for real timestamps (experienceDate/createdAt).
    const __ymd = String((b && b.bookingDate) || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    let month, day;
    if (__ymd) {
      const __mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      month = __mNames[parseInt(__ymd[2], 10) - 1] || "--";
      day = parseInt(__ymd[3], 10);
    } else {
      const dt = safeDate(b.bookingDate || b.experienceDate || b.createdAt);
      month = dt ? dt.toLocaleString("default", { month: "short" }) : "--";
      day = dt ? dt.getDate() : "--";
    }

    const exp = b.experience || {};
    const title = sanitizeExperienceTitle(exp.title || b.title || "Listing");
    const guest = b.guestId || b.user || {};
    const guestName = guest.name || b.guestName || "Guest";
    const pax = Number(b.guests || b.numGuests || b.guestCount || 1);
    const timeText = b.timeSlot ? __formatPrivateRequestTimeRange12h(String(b.timeSlot)) : "";
    let noteText = String((b && b.guestNotes) || "").trim();
    // Truncate at a WORD boundary — never mid-word (sir 2026-08-02: "…with the wh…" is sloppy).
    if (noteText.length > 70) {
      var __cut = noteText.slice(0, 68);
      var __sp = __cut.lastIndexOf(" ");
      noteText = (__sp > 40 ? __cut.slice(0, __sp) : __cut).trim() + "…";
    }

    // Owner 2026-07-23 (sir: "clean the card — a smooth tab for check-in, not a messed-up thing where people
    // are lost"): the card is a WHO'S-COMING roster row — who, when, party size, a note snippet, and the
    // Check In action. The money detail (paid / your payout / fees / refund / cancellation policy) all lives
    // in "View Details" now, so it no longer clutters every row.
    var bookingStatusNorm = normalizeState(b.status);
    var bookingStatusColors = { confirmed: "bg-green-100 text-green-700", completed: "bg-blue-100 text-blue-700", cancelled: "bg-red-100 text-red-700", cancelled_by_host: "bg-red-100 text-red-700", disputed: "bg-amber-100 text-amber-700", authorized: "bg-amber-100 text-amber-700", pending_payment: "bg-gray-100 text-gray-600" };
    var bookingStatusBadge = El("span", { className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold " + (bookingStatusColors[bookingStatusNorm] || "bg-slate-100 text-slate-700"), textContent: stateLabel(bookingStatusNorm) });

    var viewBtn = El("button", {
      className: "w-full md:w-auto bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition whitespace-nowrap",
      "data-action": "guest", "data-booking-id": b._id || "", textContent: "View Details"
    });

    // Check-in / attendance controls (Check In is the primary action on this tab).
    var hostActionBtns = [];
    var attStatus = b.attendanceStatus || null;
    if (attStatus === "checked_in") {
      hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700", textContent: "Checked in ✓" }));
      // Owner 2026-08-02 (sir: partial check-in): while the event date is live, the host can add
      // late arrivals by re-entering the SAME code — additive only, capped at the party size.
      if (__hostCheckInDateOpen(b) && Number(b.checkedInSeats || 0) < Number(b.numGuests || 1)) {
        hostActionBtns.push(El("button", {
          className: "w-full md:w-auto px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition whitespace-nowrap",
          "data-action": "otp-checkin", "data-booking-id": b._id || "", textContent: "Add late arrivals"
        }));
      }
    } else if (attStatus === "no_show") {
      hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-gray-100 text-gray-500", textContent: "No show" }));
    } else if (bookingStatusNorm === "confirmed" && (b.paymentStatus === "paid") && __hostCheckInDateOpen(b)) {
      hostActionBtns.push(El("button", {
        className: "w-full md:w-auto bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap",
        "data-action": "otp-checkin", "data-booking-id": b._id || "", textContent: "Check In"
      }));
    }
    hostActionBtns.push(viewBtn);

    // Owner 2026-07-23 (sir: disputes must be flagged): a disputed booking gets a prominent red flag next
    // to the status so it's never invisible. The respond-with-evidence flow is live in the booking's
    // details panel (POST /api/host/bookings/:id/dispute-response).
    var __disputeActive = !!(b && b.dispute && b.dispute.active === true);
    var __titleRow = __inEvent
      ? [El("span", { className: "font-bold text-base text-tsts-ink", textContent: guestName }), bookingStatusBadge]
      : [El("h3", { className: "heading-serif font-bold text-lg text-tsts-ink", textContent: title }), bookingStatusBadge];
    if (__disputeActive) __titleRow.push(El("span", { className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 text-red-700", textContent: "Dispute · needs response" }));

    // Clean roster row. Inside an event card: guest-led (no repeated title, no "Guest:" prefix).
    var __detailCol = [El("div", { className: "flex items-center gap-2 mb-1 flex-wrap" }, __titleRow)];
    if (!__inEvent) __detailCol.push(El("p", { className: "text-sm text-gray-500" }, ["Guest: ", El("span", { className: "font-bold text-gray-700", textContent: guestName })]));
    __detailCol.push(El("p", { className: "text-sm text-gray-600 mt-0.5", textContent: (timeText ? timeText + " · " : "") + pax + (pax === 1 ? " guest" : " guests") }));
    if (noteText) __detailCol.push(El("p", { className: "text-xs text-gray-400 italic mt-1", textContent: "“" + noteText + "”" }));

    var __leadNode;
    if (__inEvent) {
      var __gpic = String((b.guestId && typeof b.guestId === "object" && b.guestId.profilePic) || "").trim();
      if (__gpic) {
        __leadNode = El("img", { alt: guestName, className: "w-12 h-12 rounded-full object-cover flex-shrink-0" });
        try { window.tstsSafeImg(__leadNode, __gpic, ""); } catch (_gpErr) { void _gpErr; }
      } else {
        __leadNode = El("div", { className: "w-12 h-12 rounded-full bg-tsts-cream text-tsts-ink font-bold flex items-center justify-center flex-shrink-0", textContent: String(guestName || "G").charAt(0).toUpperCase() });
      }
    } else {
      __leadNode = El("div", { className: "bg-orange-50 text-orange-600 w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-orange-100 flex-shrink-0" }, [
        El("span", { className: "text-xs font-bold uppercase", textContent: month }),
        El("span", { className: "text-xl font-bold", textContent: String(day) })
      ]);
    }
    var card = El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 mb-4" }, [
      El("div", { className: "flex items-center gap-4 w-full min-w-0" }, [
        __leadNode,
        El("div", { className: "min-w-0" }, __detailCol)
      ]),
      El("div", { className: "flex flex-col gap-2 items-end flex-shrink-0" }, hostActionBtns)
    ]);
    // Marked so the Overview's "Respond" can open the past list and land on this exact card.
    if (__disputeActive) card.setAttribute("data-dispute-card", "1");
    return card;
}

// Phase 6D: Grouped host booking card for multi-booking guest+occurrence
function _renderGroupedHostBookingCard(El, group, opts) {
  var __inEvent = !!(opts && opts.insideEventCard);
  var first = group[0];
  var dt = safeDate(first.bookingDate || first.experienceDate || first.createdAt);
  var month = dt ? dt.toLocaleString("default", { month: "short" }) : "--";
  var day = dt ? dt.getDate() : "--";
  var exp = first.experience || {};
  var title = sanitizeExperienceTitle(exp.title || first.title || "Listing");
  var guest = first.guestId || first.user || {};
  var guestName = guest.name || first.guestName || "Guest";

  var totalSeats = 0;
  var checkinBookingId = null;
  var allCheckedIn = true;
  var anyCheckedIn = false;
  var anyNoShow = false;
  for (var i = 0; i < group.length; i++) {
    totalSeats += Math.max(1, Number(group[i].numGuests || group[i].guests || group[i].guestCount) || 1);
    var st = normalizeState(group[i].status);
    var att = group[i].attendanceStatus || null;
    if (att === "checked_in") anyCheckedIn = true; else allCheckedIn = false;
    if (att === "no_show") anyNoShow = true;
    if (st === "confirmed" && group[i].paymentStatus === "paid" && !checkinBookingId) {
      checkinBookingId = group[i]._id || "";
    }
  }

  // Attendance badge + check-in button
  var hostActionBtns = [];
  if (allCheckedIn && group.length > 0) {
    hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700", textContent: "All checked in" }));
  } else if (anyCheckedIn) {
    hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700", textContent: "Partially checked in" }));
  }
  if (checkinBookingId && !allCheckedIn && __hostCheckInDateOpen(group[0] || {})) {
    hostActionBtns.push(El("button", {
      className: "w-full md:w-auto bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap",
      "data-action": "otp-checkin", "data-booking-id": checkinBookingId, textContent: "Check In"
    }));
  }

  // Expandable sub-booking rows
  var subContainer = El("div", { className: "hidden mt-4 space-y-2 border-t border-gray-100 pt-3" });
  for (var k = 0; k < group.length; k++) {
    subContainer.appendChild(_renderHostSubBookingRow(El, group[k]));
  }
  // Owner 2026-08-02 (sir): the page's affordance vocabulary is outline buttons, not underlined
  // centred text links — align this toggle to the locked button language.
  var toggleBtn = El("button", {
    type: "button",
    className: "self-start px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition mt-1"
  });
  toggleBtn.textContent = "Show " + group.length + " bookings";
  toggleBtn.addEventListener("click", function() {
    var isHidden = subContainer.classList.contains("hidden");
    if (isHidden) {
      subContainer.classList.remove("hidden");
      toggleBtn.textContent = "Hide bookings";
    } else {
      subContainer.classList.add("hidden");
      toggleBtn.textContent = "Show " + group.length + " bookings";
    }
  });

  var __leadNode;
  if (__inEvent) {
    var __gpic = String((guest && guest.profilePic) || "").trim();
    if (__gpic) {
      __leadNode = El("img", { alt: guestName, className: "w-12 h-12 rounded-full object-cover flex-shrink-0" });
      try { window.tstsSafeImg(__leadNode, __gpic, ""); } catch (_gpErr) { void _gpErr; }
    } else {
      __leadNode = El("div", { className: "w-12 h-12 rounded-full bg-tsts-cream text-tsts-ink font-bold flex items-center justify-center flex-shrink-0", textContent: String(guestName || "G").charAt(0).toUpperCase() });
    }
  } else {
    __leadNode = El("div", { className: "bg-orange-50 text-orange-600 w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-orange-100 flex-shrink-0" }, [
      El("span", { className: "text-xs font-bold uppercase", textContent: month }),
      El("span", { className: "text-xl font-bold", textContent: String(day) })
    ]);
  }
  var __groupCard = El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3 mb-4" }, [
    El("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4" }, [
      El("div", { className: "flex items-center gap-4 w-full" }, [
        __leadNode,
        El("div", {}, [
          El("div", { className: "flex items-center gap-2 mb-1 flex-wrap" }, (function () {
            // Owner 2026-07-23: flag the grouped card too if ANY booking in the group is disputed.
            // sir 2026-08-18: inside an event card the row leads with the GUEST, not the event title.
            var __r = __inEvent
              ? [El("span", { className: "font-bold text-base text-tsts-ink", textContent: guestName })]
              : [El("h3", { className: "heading-serif font-bold text-lg text-tsts-ink", textContent: title })];
            if (group.some(function (gb) { return gb && gb.dispute && gb.dispute.active === true; })) {
              __r.push(El("span", { className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 text-red-700", textContent: "Dispute · needs response" }));
            }
            return __r;
          })()),
          El("p", { className: "text-sm text-gray-500" }, __inEvent
            ? [totalSeats + " seat" + (totalSeats === 1 ? "" : "s") + " (" + group.length + " bookings)"]
            : ["Guest: ", El("span", { className: "font-bold text-gray-700", textContent: guestName }),
              ", " + totalSeats + " seat" + (totalSeats === 1 ? "" : "s") + " (" + group.length + " bookings)"])
        ])
      ]),
      El("div", { className: "flex flex-col gap-2 items-end flex-shrink-0" }, hostActionBtns)
    ]),
    toggleBtn,
    subContainer
  ]);
  // Marked so the Overview's "Respond" can open the past list and land on this exact card.
  if (group.some(function (gb) { return gb && gb.dispute && gb.dispute.active === true; })) {
    __groupCard.setAttribute("data-dispute-card", "1");
  }
  return __groupCard;
}

// Phase 6D: Individual booking row inside grouped host card
function _renderHostSubBookingRow(El, b) {
  var pax = b.guests || b.numGuests || b.guestCount || 1;
  // This read `b.amountTotal || b.pricing.totalPrice`. Neither field exists: the Booking schema
  // stores `bookingValueCents` / `paidAmountCents` / `amountCents`, and `amountTotal` is a Stripe
  // session field the API never sends here. So the amount was ALWAYS blank — a host opening a
  // grouped card saw seats, status and attendance but never what any booking was worth. It also
  // prefixed a bare "$" with an unknown unit, which would have been wrong for a non-AUD booking.
  // resolveRefundBaseCents is this file's own resolver for the real fields, in cents.
  var paidCents = resolveRefundBaseCents(b);
  var paid = paidCents > 0 ? centsToMoney(paidCents, b.currency) : "";
  var statusNorm = normalizeState(b.status);
  var statusColors = { confirmed: "bg-green-100 text-green-700", completed: "bg-blue-100 text-blue-700", cancelled: "bg-red-100 text-red-700", cancelled_by_host: "bg-red-100 text-red-700", pending_payment: "bg-gray-100 text-gray-600" };
  var badgeClass = statusColors[statusNorm] || "bg-slate-100 text-slate-700";
  var att = b.attendanceStatus || null;
  var attBadge = att === "checked_in" ? El("span", { className: "px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700", textContent: "Checked in" })
    : att === "no_show" ? El("span", { className: "px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-500", textContent: "No show" })
    : El("span", { className: "hidden" });
  var viewBtn = El("button", {
    className: "px-3 py-1 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition",
    "data-action": "guest", "data-booking-id": b._id || "", textContent: "Details"
  });
  return El("div", { className: "bg-gray-50 p-3 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-2" }, [
    El("div", { className: "flex items-center gap-3 flex-wrap" }, [
      El("span", { className: "text-sm font-bold text-gray-700", textContent: pax + " seat" + (pax === 1 ? "" : "s") }),
      El("span", { className: "px-2 py-0.5 text-[11px] font-bold rounded-full " + badgeClass, textContent: stateLabel(statusNorm) }),
      attBadge,
      El("span", { className: "text-xs text-gray-400", textContent: paid })
    ]),
    El("div", { className: "flex gap-2 flex-shrink-0" }, [viewBtn])
  ]);
}

function computeListingsSummary(rows, fallbackSummary) {
  const list = Array.isArray(rows) ? rows : [];
  const fromApi = (fallbackSummary && typeof fallbackSummary === "object") ? fallbackSummary : {};
  const totalListings = Number.isFinite(Number(fromApi.totalListings)) ? Number(fromApi.totalListings) : list.length;
  const activeListings = Number.isFinite(Number(fromApi.activeListings))
    ? Number(fromApi.activeListings)
    : list.filter(function (row) { return row && row.isPaused !== true; }).length;
  const pausedListings = Number.isFinite(Number(fromApi.pausedListings))
    ? Number(fromApi.pausedListings)
    : list.filter(function (row) { return row && row.isPaused === true; }).length;
  const fallbackMatchedCount = Number.isFinite(Number(fromApi.fallbackMatchedCount)) ? Number(fromApi.fallbackMatchedCount) : 0;
  return {
    totalListings: Math.max(0, totalListings),
    activeListings: Math.max(0, activeListings),
    pausedListings: Math.max(0, pausedListings),
    fallbackMatchedCount: Math.max(0, fallbackMatchedCount)
  };
}

function formatMetricValue(sourceStatus, rawValue) {
  if (sourceStatus !== "ready") return "Unavailable";
  if (!Number.isFinite(Number(rawValue))) return "0";
  return String(Math.max(0, Math.floor(Number(rawValue))));
}

// Owner 2026-08-05 (sir: "i dont need content count -- i need attention count"). Per-section counts of
// what NEEDS THE HOST'S ACTION, so the host sees WHERE the work is. Each section owns one kind of item —
// nothing is fused into a figure that names nothing, which is what sir rejected in my first attempt
// ("what does 1 stand for in mo listing and 6 in booking?").
// Signals are the same ones sir approved for Overview's ACTION ITEMS.
function __hostSectionAttention() {
  const lc = function (v) { return String(v || "").toLowerCase(); };
  const now = Date.now();
  const bk = (hostDashboardState.bookings && Array.isArray(hostDashboardState.bookings.rows)) ? hostDashboardState.bookings.rows : [];
  const pr = (hostDashboardState.privateRequests && Array.isArray(hostDashboardState.privateRequests.rows)) ? hostDashboardState.privateRequests.rows : [];
  const li = (hostDashboardState.listings && Array.isArray(hostDashboardState.listings.items)) ? hostDashboardState.listings.items : [];
  const fn = (hostDashboardState.funding && Array.isArray(hostDashboardState.funding.slots)) ? hostDashboardState.funding.slots : [];

  const requests = pr.filter(function (r) {
    const s = lc(r && r.status);
    // SR-3 (sir's fix-all order 2026-08-20): the tab count follows the same clock rule as the
    // panel (sir's 2026-08-07 "Move it and say it ran out") — a request past its reply window
    // is Missed, not a decision waiting, so it never counts here.
    if (s === "awaiting_host") {
      const ex = (r && r.expiresAt) ? new Date(r.expiresAt).getTime() : 0;
      return !(ex > 0 && ex <= now);
    }
    if (s === "invalidated") { const u = (r && r.counterEligibleUntil) ? new Date(r.counterEligibleUntil).getTime() : 0; return u > now; }
    return false;
  }).length;

  // sir's order 2026-08-07 ("you think pending check-in the event count?"): check-ins are counted
  // per EVENT with an open window, never per booking — 375 guests yet to arrive at ONE live event
  // is ONE situation ("your event is running"), not 375 obligations. Requests and disputes stay
  // per-item because each is an individual decision. (The per-booking rule read 383 on the
  // 1,000-seat mock; per-event it reads the truth: one attention item per live occurrence.)
  // Edge case (found deriving the element's own state space, per sir's corrected rigor order):
  // an event where every party tapped in but SEATS are short (late arrivals due) must still
  // count — pending is seat-based (null attendance OR partial check-in), same math as the card.
  const __checkInOccurrences = {};
  bk.forEach(function (b) {
    if (lc(b && b.status) !== "confirmed" || lc(b && b.paymentStatus) !== "paid") return;
    const seats = Math.max(1, Number(b.numGuests || b.guests || 1));
    const pendingSeats = !b.attendanceStatus
      ? seats
      : (b.attendanceStatus === "checked_in" ? Math.max(0, seats - Number(b.checkedInSeats || 0)) : 0);
    if (pendingSeats <= 0) return;
    const iso = (b && (b.slotStartAt || b.startAt)) ? new Date(b.slotStartAt || b.startAt).getTime() : NaN;
    if (!isFinite(iso)) return;
    if (now >= (iso - 2 * 3600 * 1000) && now <= (iso + 6 * 3600 * 1000)) {
      __checkInOccurrences[_occurrenceKey(b)] = true;
    }
  });
  const checkIn = Object.keys(__checkInOccurrences).length;

  // Same rule as the Overview action item: the badge counts what the HOST still has to do, so a
  // dispute they have already answered stops counting even though our team has not settled it yet.
  const disputes = bk.filter(function (b) {
    return b && b.dispute && b.dispute.active === true && !b.dispute.hostRespondedAt;
  }).length;

  // sir's split, element 4 [2026-08-07, sir: "Counts as stated"]: each number means ONE thing.
  // Guest Requests = decisions waiting (money on hold). Bookings = live events with guests
  // still to come + active disputes. No more mixed sums.
  return {
    "guest-requests": requests,
    bookings: checkIn + disputes,
    funding: fn.filter(function (s) {
      const fs = lc((s && s.shortfallFundingStatus) || (s && s.fundingStatus));
      return fs === "stage_a_due" || fs === "stage_b_due";
    }).length,
    // sir 2026-08-08: "why i see tab heading count as my listings (1) instead of count of live active
    // listing?". It was counting listings whose VERIFICATION was rejected — an attention badge, not an
    // inventory. The tab now says how many listings are actually live, which is what the word implies.
    listings: li.filter(function (e) {
      const st = String((e && e.status) || "").toUpperCase();
      const paused = (e && e.isPaused === true) || st === "PAUSED";
      return !paused && st !== "DELETED_SOFT" && st !== "DRAFT" && st !== "PENDING_REVIEW";
    }).length,
    verification: li.filter(function (e) { return lc(e && e.verifiedStatus) === "pending"; }).length
  };
}

function renderHostingSectionTabs(activeSection) {
  const El = window.tstsEl;
  const attention = __hostSectionAttention();
  const nav = El("nav", { className: "bg-white rounded-2xl border border-gray-100 p-2 shadow-sm overflow-x-auto" });
  const row = El("div", { className: "flex items-center gap-2 min-w-max" });
  HOSTING_SECTION_KEYS.forEach(function (key) {
    const isActive = key === activeSection;
    // sir's approved sub-tab pattern (renderTripsSubTabs): the count lives INSIDE the label text as
    // " (N)" and is omitted at zero. No separate badge, no extra colour — sir never approved either.
    const n = Number(attention[key] || 0);
    const label = (HOSTING_SECTION_LABELS[key] || key) + (n > 0 ? " (" + n + ")" : "");
    row.appendChild(
      El("button", {
        type: "button",
        className: (isActive
          ? "tsts-indicator-ink border-tsts-ink"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50") + " px-4 py-2 rounded-xl border text-sm font-bold transition",
        "data-action": "host-switch-section",
        "data-host-section": key,
        textContent: label
      })
    );
  });
  nav.appendChild(row);
  return __wrapScrollableTabs(nav);
}

function renderHostSourceLoading(text) {
  const El = window.tstsEl;
  return El("div", { className: "bg-white p-6 rounded-2xl border border-gray-100 text-sm text-gray-500 flex items-center gap-2" }, [
    El("i", { className: "fas fa-spinner fa-spin text-gray-400" }),
    El("span", { textContent: text || "Loading..." })
  ]);
}

// Owner-approved 2026-08-03 (sir, Item 4): a host standing in front of guests must never
// read a backend code. Six check-in refusals ship code-only (no message), so they are
// spelled out here; anything the backend words itself is preferred as-is.
function __checkinErrorCopy(payload) {
  var p = (payload && typeof payload === "object") ? payload : {};
  var human = String(p.message || "").trim();
  if (human) return human;
  var map = {
    BOOKING_NOT_CONFIRMED: "This booking isn't confirmed yet, so it can't be checked in.",
    OTP_REQUIRED: "Enter the guest's 6-digit entry code to check them in.",
    OTP_NOT_CONFIGURED: "This booking has no entry code set up. Ask the guest for their confirmation email, or contact support.",
    FORBIDDEN: "This booking belongs to another host's experience.",
    NOT_FOUND: "We couldn't find this booking. Please refresh and try again.",
    INVALID_ID: "We couldn't find this booking. Please refresh and try again."
  };
  return map[String(p.error || "").trim()] || "We couldn't check this guest in. Please try again.";
}

function renderHostSourceError(title, message, retryLabel) {
  const El = window.tstsEl;
  return El("div", { className: "bg-white p-6 rounded-2xl border border-red-200 shadow-sm space-y-3" }, [
    El("h3", { className: "text-lg font-bold text-red-700", textContent: title || "Section unavailable" }),
    El("p", { className: "text-sm text-red-600", textContent: message || "This section could not be loaded. Please retry." }),
    El("button", {
      type: "button",
      className: "inline-flex items-center px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition",
      "data-action": "host-retry-load",
      textContent: retryLabel || "Retry"
    })
  ]);
}

function renderHostOwnershipWarnings(warnings) {
  const El = window.tstsEl;
  const rows = Array.isArray(warnings) ? warnings : [];
  const hasAmbiguousNameWarning = rows.some(function (w) {
    return String(w && w.code || "").trim().toUpperCase() === "AMBIGUOUS_HOST_NAME";
  });
  if (!hasAmbiguousNameWarning) return El("div", { className: "hidden", textContent: "" });

  const hintUrl = "profile.html?hostOwnership=ambiguous";
  return El("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex flex-col md:flex-row md:items-center md:justify-between gap-3" }, [
    El("div", { className: "space-y-1" }, [
      El("p", { className: "font-bold", textContent: "Another host is using the same display name." }),
      El("p", { textContent: "Add a unique handle in your profile so your listings are always credited to you." })
    ]),
    El("a", {
      href: hintUrl,
      className: "inline-flex items-center px-3 py-2 rounded-xl border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 transition",
      textContent: "Open Profile Handle Settings"
    })
  ]);
}

function renderHostOverviewSection() {
  const El = window.tstsEl;
  const listingsState = hostDashboardState.listings || {};
  const bookingsState = hostDashboardState.bookings || {};
  const requestsState = hostDashboardState.privateRequests || {};
  const verificationState = hostDashboardState.verification || {};
  const summary = computeListingsSummary(listingsState.items, listingsState.summary);
  const verificationStatus = (verificationState.status === "ready")
    ? hostVerificationLabel(((verificationState.data || {}).hostVerification || {}).status)
    : "Unavailable";

  // Owner 2026-06-12 (sir: Overview was MISSING Earnings / Net payout / Funding / avg-★ Rating, and the
  // cards weren't clickable): load those sources here too, surface them as cards, and make EVERY card a
  // button that jumps to its sub-tab. Every number comes from the SAME state the sub-tabs render (one
  // source of truth, so the Overview can never disagree with the tab it links to). Money is A$ (AUD).
  const earnState = hostDashboardState.earnings || {};
  const reviewsState = hostDashboardState.reviews || {};
  const fundingState = hostDashboardState.funding || {};
  if (!earnState.status || earnState.status === "idle") { loadHostEarnings(); }
  if (!reviewsState.status || reviewsState.status === "idle") { loadHostReviewsSummary(); }
  if (!fundingState.status || fundingState.status === "idle") { loadHostFundingSection(); }
  const earnData = earnState.data || {};
  const reviewsOverall = (reviewsState.data && reviewsState.data.overall) ? reviewsState.data.overall : {};
  const ovTotalReviews = Number(reviewsOverall.totalReviews) || 0;
  const ovAvgRating = Number(reviewsOverall.averageRating) || 0;
  const ovFundingSlots = Array.isArray(fundingState.slots) ? fundingState.slots : [];
  // Owner 2026-06-12 (sir: "what happens when host is in a different region with a different currency?"):
  // do NOT assume AUD. Derive the host's currency from their own earnings bookings. If every booking is one
  // currency, show the total in THAT currency; if the host has earned across multiple currencies, a single
  // summed total is not meaningful (the backend currently adds raw cents across currencies — flagged to sir
  // for a per-currency rollup), so we show "Mixed" rather than a dishonest number.
  const ovEarnBookings = Array.isArray(earnData.bookings) ? earnData.bookings : [];
  const ovCcySet = {};
  ovEarnBookings.forEach(function (b) {
    const c = String((((b || {}).pricingSnapshot || {}).currency) || "").trim().toLowerCase();
    if (c) ovCcySet[c] = 1;
  });
  const ovCcyList = Object.keys(ovCcySet);
  const ovCurrency = ovCcyList.length <= 1 ? (ovCcyList[0] || "aud") : null; // null = multi-currency
  // Owner 2026-07-22 (sir: "fix decimals"): Overview money shows a CONSISTENT 2 decimals (Total earned
  // A$2,055.00 next to Net payout A$1,849.50), unlike the app-wide toMoney which drops .00 on whole amounts.
  // Scoped to the Overview only — the global centsToMoney/toMoney is untouched (other locked pages rely on it).
  const __ovMoney2dp = function (cents, currency) {
    const n = (Number(cents) || 0) / 100;
    const code = String(currency || "AUD").toUpperCase();
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2, currencyDisplay: "symbol" }).format(n);
    } catch (_e) { void _e; return "A$" + (Math.round(n * 100) / 100).toFixed(2); }
  };
  const ovMoney = function (st, c) {
    if (st === "error") return "—";
    if (st !== "ready") return "…";
    if (ovCurrency == null) return "Mixed";
    return __ovMoney2dp(c, ovCurrency);
  };
  const ovRatingHasStar = reviewsState.status === "ready" && ovTotalReviews > 0;
  const ovRating = (reviewsState.status === "ready") ? (ovTotalReviews > 0 ? ovAvgRating.toFixed(1) : "No reviews yet") : (reviewsState.status === "error" ? "—" : "…");
  // Owner 2026-08-05 (sir: "how will host know ehere these 10 or 12 pending actions sit"): this counted
  // EVERY funding slot, fully-funded ones included, so the tile read "Funding needed 4" while only 3 slots
  // actually owed money — and it disagreed with the tab badge, which counts stage_a_due/stage_b_due only.
  // Both now count the same thing: slots that genuinely need a payment.
  const ovFundingDue = ovFundingSlots.filter(function (s) {
    var fs = String((s && (s.shortfallFundingStatus || s.fundingStatus)) || "").toLowerCase();
    return fs === "stage_a_due" || fs === "stage_b_due";
  }).length;
  const ovFunding = (fundingState.status === "ready") ? (ovFundingDue > 0 ? String(ovFundingDue) : "None") : (fundingState.status === "error" ? "—" : "…");

  // Owner 2026-06-12 (sir: "find what all needs to be here"): the Overview must surface the host's ACTION
  // QUEUE, not only metrics. Everything below is derived from state the dashboard already loads — no new
  // network calls. Two metric counts were also inaccurate and are corrected here.
  function __ovLc(v) { return String(v == null ? "" : v).toLowerCase(); }
  const __ovBookings = Array.isArray(bookingsState.rows) ? bookingsState.rows : [];
  const __ovListings = Array.isArray(listingsState.items) ? listingsState.items : [];
  const __ovRequests = Array.isArray(requestsState.rows) ? requestsState.rows : [];
  const __ovNow = Date.now();

  // FIX: "Host bookings" must mean real bookings — exclude cancelled/expired/declined + abandoned/failed/refunded.
  const __deadBkStatus = ["cancelled", "cancelled_by_host", "expired", "declined", "rejected"];
  const __deadBkPay = ["abandoned", "failed", "refunded"];
  const ovMeaningfulBookings = __ovBookings.filter(function (b) {
    return __deadBkStatus.indexOf(__ovLc(b && b.status)) < 0 && __deadBkPay.indexOf(__ovLc(b && b.paymentStatus)) < 0;
  }).length;

  // FIX: "Pending private requests" = requests awaiting YOU (awaiting_host within 24h, or a pre-empted
  // request still inside its counter-offer window). NOT alternative_offered / counter_accept_pending —
  // those wait on the guest, so counting them under "pending" overstated the host's to-do.
  const ovRequestsAwaitingHost = __ovRequests.filter(function (r) {
    const s = __ovLc(r && r.status);
    // SR-3 (sir's fix-all order 2026-08-20): same clock rule as the Guest Requests panel
    // (sir's 2026-08-07 "Move it and say it ran out") — a request whose reply window has
    // passed is dead even while the database still reads awaiting_host, so it must not be
    // counted under "needs your reply". The panel filed these under Missed; this count said
    // 7 while only 2 could be answered.
    if (s === "awaiting_host") {
      const ex = (r && r.expiresAt) ? new Date(r.expiresAt).getTime() : 0;
      return !(ex > 0 && ex <= __ovNow);
    }
    if (s === "invalidated") { const u = (r && r.counterEligibleUntil) ? new Date(r.counterEligibleUntil).getTime() : 0; return u > __ovNow; }
    return false;
  }).length;

  // ACTION signals (each renders only when > 0):
  // Guests ready to check in NOW — confirmed + paid + not yet checked in, inside the slot−2h…+6h window.
  const ovCheckInNow = __ovBookings.filter(function (b) {
    if (__ovLc(b && b.status) !== "confirmed" || __ovLc(b && b.paymentStatus) !== "paid") return false;
    if (b && b.attendanceStatus) return false;
    const iso = (b && (b.slotStartAt || b.startAt)) ? new Date(b.slotStartAt || b.startAt).getTime() : NaN;
    if (!isFinite(iso)) return false;
    return __ovNow >= (iso - 2 * 3600 * 1000) && __ovNow <= (iso + 6 * 3600 * 1000);
  }).length;
  // Active disputes — the host is otherwise never told (the alert goes to admin only).
  // An action item is the HOST's outstanding job, so it clears the moment they answer — the dispute
  // itself stays open until our team settles it, but the host has nothing left to do.
  const ovDisputes = __ovBookings.filter(function (b) {
    return b && b.dispute && b.dispute.active === true && !b.dispute.hostRespondedAt;
  }).length;
  // Shortfall due — a private event needs the host to put money down now.
  let ovShortfallDueCents = 0, ovShortfallDueCount = 0;
  ovFundingSlots.forEach(function (s) {
    const fs = __ovLc((s && s.shortfallFundingStatus) || (s && s.fundingStatus));
    if (fs === "stage_a_due" || fs === "stage_b_due") {
      ovShortfallDueCount++;
      // Owner 2026-07-22 (BUG found on seed: card showed "A$0.00"): the /api/host/shortfall/status summary
      // returns the amount owed NESTED as stageA/stageB.remainingCents (dueCents − paidCents), not the flat
      // shortfallStageADueCents the old code read. Read the nested shape, falling back to dueCents then the
      // legacy flat fields so the card always shows the real amount still due.
      const __sa = (s && s.stageA) || null;
      const __sb = (s && s.stageB) || null;
      const __stageOwed = function (obj, flat) {
        if (obj) return Number(obj.remainingCents != null ? obj.remainingCents : (obj.dueCents || 0)) || 0;
        return Number(flat || 0) || 0;
      };
      // Owner 2026-08-05 (sir: "f shortfall due os 264 then it must be that number"): this added BOTH
      // stages for every slot, so a host at stage A saw the stage-B money as if it were payable today —
      // three stage-A slots owing A$264 rendered as "Shortfall due: A$528.00" beside a Pay button that
      // cannot take stage B yet. "Due" now means due: only the stage the slot is actually at.
      ovShortfallDueCents += (fs === "stage_b_due")
        ? __stageOwed(__sb, s && (s.shortfallStageBDueCents || s.stageBDueCents))
        : __stageOwed(__sa, s && (s.shortfallStageADueCents || s.stageADueCents));
    }
  });
  // Listings the admin is still reviewing (verifiedStatus "pending"), or sent back for the host to fix
  // and resubmit (verifiedStatus "rejected"). Owner 2026-07-23: "returned" was keyed on status "draft",
  // but a startup migration (server.js migrateExperienceStatusField) force-converts every DRAFT listing to
  // ACTIVE ("no review gate in live flow"), so a draft can never exist — the real "host must fix a listing"
  // state is a REJECTED verification. Rewired to verifiedStatus "rejected" (sir 2026-07-23).
  const ovListingsInReview = __ovListings.filter(function (e) { return __ovLc(e && e.verifiedStatus) === "pending"; }).length;
  const ovListingsReturned = __ovListings.filter(function (e) { return __ovLc(e && e.verifiedStatus) === "rejected"; }).length;

  const cards = [
    { label: "Total listings", value: formatMetricValue(listingsState.status, summary.totalListings), section: "listings", view: "listings" },
    { label: "Active listings", value: formatMetricValue(listingsState.status, summary.activeListings), section: "listings", view: "listings" },
    { label: "Paused listings", value: formatMetricValue(listingsState.status, summary.pausedListings), section: "listings", view: "listings" },
    { label: "Host bookings", value: formatMetricValue(bookingsState.status, ovMeaningfulBookings), section: "bookings", view: "bookings" },
    // sir's split, element 3: renamed to sir's chosen name and pointed at the tab itself.
    { label: "Pending guest requests", value: formatMetricValue(requestsState.status, ovRequestsAwaitingHost), section: "guest-requests", view: "guest-requests" },
    { label: "Total earned", value: ovMoney(earnState.status, earnData.totalEarned), section: "earnings-fees", view: "earnings" },
    { label: "Net payout", value: ovMoney(earnState.status, earnData.netPayout), section: "earnings-fees", view: "earnings" },
    { label: "Avg guest rating", value: ovRating, star: ovRatingHasStar, section: "reviews", view: "reviews" },
    { label: "Funding needed", value: ovFunding, section: "funding", view: "funding" },
    { label: "Verification status", value: verificationStatus, section: "verification", view: "verification" }
  ];

  // Owner 2026-06-12: removed the redundant "Hosting Overview" h2 + "Tap any row" helper (the tab pill
  // already says Overview; the clickable rows are self-evident — no hand-holding copy).
  const section = El("section", { className: "space-y-3" });


  // Owner 2026-06-12 (sir: "find what all needs to be here", "two sections — actions + metrics", "action
  // button must look like an action, not a normal card"): the Overview splits into TWO labelled sections.
  // SECTION 1 "Action items" — distinct tinted cards with a coloured accent bar + a real CTA button carrying
  // the specific verb (Review / Check in / Respond / Pay / View / Update). Each renders ONLY when its count
  // > 0, so a caught-up host sees just the metrics. Tints/accents are inline styles (purge-proof).
  const __ovActions = [];
  // The `openModal` flag that used to ride along here existed only to open the removed Private-requests
  // popup. Nothing reads it now, so it goes with the popup rather than sitting as a switch that looks live.
  function __ovAct(cond, label, sub, sec, cta, tintHex, accentHex, focusFn) {
    if (cond) __ovActions.push({ label: label, sub: sub, sec: sec, cta: cta, tint: tintHex, accent: accentHex, focus: focusFn || null });
  }
  const __ovMoneyAud = function (cents) { return __ovMoney2dp(cents, (ovCurrency != null) ? ovCurrency : "aud"); };
  // sir's split, element 3 [2026-08-07, sir: "Both retargeted + renamed"]: one name, one
  // destination — the card speaks sir's chosen name and opens the Guest Requests tab directly
  // (no modal detour: the tab IS the workbench now).
  __ovAct(ovRequestsAwaitingHost > 0,
    ovRequestsAwaitingHost + (ovRequestsAwaitingHost === 1 ? " guest request needs your reply" : " guest requests need your reply"),
    "Approve, decline, or offer a new date", "guest-requests", "Review", "#FFFBEB", "#F59E0B");
  // Owner 2026-07-23: counts BOOKINGS (check-in is per-booking — one entry code each), so label it
  // "bookings", not "guests" (a booking can hold several guests — the old "guests" wording was wrong).
  __ovAct(ovCheckInNow > 0,
    ovCheckInNow + (ovCheckInNow === 1 ? " booking ready to check in" : " bookings ready to check in"),
    "The check-in window is open now", "bookings", "Check in", "#ECFDF5", "#10B981");
  __ovAct(ovDisputes > 0,
    ovDisputes + (ovDisputes === 1 ? " dispute needs a response" : " disputes need a response"),
    "Add your evidence before the deadline", "bookings", "Respond", "#FFF1F2", "#F43F5E", focusHostDisputeCard);
  __ovAct(ovShortfallDueCount > 0,
    "Shortfall due: " + __ovMoneyAud(ovShortfallDueCents),
    "Put your share down to keep the event on", "funding", "Pay", "#FFFBEB", "#F59E0B");
  __ovAct(ovListingsInReview > 0,
    ovListingsInReview + (ovListingsInReview === 1 ? " listing in review" : " listings in review"),
    "Awaiting verification approval", "listings", "View", "#F8FAFC", "#64748B");
  __ovAct(ovListingsReturned > 0,
    ovListingsReturned + (ovListingsReturned === 1 ? " listing needs changes" : " listings need changes"),
    "Verification was declined. Update the details and resubmit.", "listings", "Update", "#FFF1F2", "#F43F5E");

  if (__ovActions.length > 0) {
    const attnWrap = El("div", { className: "space-y-2" });
    attnWrap.appendChild(El("p", { className: "text-xs font-bold uppercase tracking-wide text-gray-500", textContent: "Action items" }));
    const attnGrid = El("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3" });
    __ovActions.forEach(function (a) {
      const ctaBtn = El("span", { className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold text-white flex-shrink-0 whitespace-nowrap shadow-sm group-hover:brightness-95 transition", textContent: a.cta });
      ctaBtn.style.backgroundColor = a.accent;
      const tile = El("button", { type: "button", className: "group w-full text-left rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-tsts-clay/40", title: "Open " + a.sec }, [
        El("span", { className: "min-w-0" }, [
          El("span", { className: "block text-sm font-bold text-gray-900", textContent: a.label }),
          El("span", { className: "block text-xs text-gray-600 mt-0.5", textContent: a.sub })
        ]),
        ctaBtn
      ]);
      tile.style.backgroundColor = a.tint;
      tile.style.borderLeft = "4px solid " + a.accent;
      tile.addEventListener("click", function () {
        setHostingSection(a.sec);
        if (typeof a.focus === "function") a.focus();
      });
      attnGrid.appendChild(tile);
    });
    attnWrap.appendChild(attnGrid);
    section.appendChild(attnWrap);
  }

  // Owner 2026-06-12 (sir: "I said 5 ROWS ... numbers in same row as the tag"): 2 columns = 5 rows for the
  // 10 metrics, and each tile is a HORIZONTAL clickable row — label on the LEFT, value + arrow on the RIGHT,
  // one line. Hover shades the row + nudges the arrow so it clearly reads as a link to its section.
  const grid = El("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3" });
  cards.forEach(function (card) {
    var valueChildren = [
      El("span", { className: "text-lg font-bold text-gray-900 leading-none", textContent: String(card.value == null ? "0" : card.value) })
    ];
    if (card.star) {
      // Gold rating star (set via .style — El blocks the style attr, and an inline colour dodges the Tailwind purge).
      var starEl = El("span", { className: "text-lg leading-none", textContent: "★" });
      starEl.style.color = "#f59e0b";
      valueChildren.push(starEl);
    }
    valueChildren.push(El("span", { className: "text-tsts-clay text-base leading-none group-hover:translate-x-0.5 transition", textContent: "→" }));
    var tile = El("button", { type: "button", className: "group w-full bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md hover:border-tsts-clay/50 hover:bg-tsts-cream/40 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-tsts-clay/40 flex items-center justify-between gap-4", title: "Open " + card.view }, [
      El("span", { className: "text-base font-medium text-gray-600", textContent: card.label }),
      El("span", { className: "flex items-center gap-2 flex-shrink-0" }, valueChildren)
    ]);
    tile.addEventListener("click", function () {
      setHostingSection(card.section);
    });
    grid.appendChild(tile);
  });
  // SECTION 2 "At a glance" — the metric tiles, labelled as their own section so it reads clearly separate
  // from the Action items above (sir: "two sections — one for action items and one for metrics").
  const metricWrap = El("div", { className: "space-y-2" });
  metricWrap.appendChild(El("p", { className: "text-xs font-bold uppercase tracking-wide text-gray-500", textContent: "At a glance" }));
  metricWrap.appendChild(grid);
  section.appendChild(metricWrap);

  const sourceRows = [
    { label: "Listings", state: listingsState, retryLabel: "Retry Listings" },
    { label: "Bookings", state: bookingsState, retryLabel: "Retry Bookings" },
    { label: "Private Requests", state: requestsState, retryLabel: "Retry Private Requests" },
    { label: "Verification", state: verificationState, retryLabel: "Retry Verification" }
  ];
  sourceRows.forEach(function (row) {
    if (row.state && row.state.status === "error") {
      section.appendChild(renderHostSourceError(row.label + " unavailable", row.state.message, row.retryLabel));
    }
  });

  return section;
}

/* ====================== REVIEWS & PERFORMANCE ====================== */

async function loadHostReviewsSummary() {
  hostDashboardState.reviews = { status: "loading", data: null, message: "" };
  renderHostingDashboard();
  try {
    var res = await window.authFetch("/api/host/reviews/summary", { method: "GET" });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      hostDashboardState.reviews = { status: "error", data: null, message: mapHostScopeError(payload, res.status, "We couldn't load your reviews just now.") };
      renderHostingDashboard();
      return;
    }
    var d = (payload && payload.data) ? payload.data : {};
    hostDashboardState.reviews = { status: "ready", data: d, message: "" };
    renderHostingDashboard();
  } catch (_) {
    hostDashboardState.reviews = { status: "error", data: null, message: "We couldn't reach the server. Please check your connection and retry." };
    renderHostingDashboard();
  }
}

async function loadHostFeesCharges() {
  hostDashboardState.feesCharges = { status: "loading", rows: [], message: "" };
  try {
    var res = await window.authFetch("/api/host/cancellation-charges", { method: "GET" });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      hostDashboardState.feesCharges = { status: "error", rows: [], message: mapHostScopeError(payload, res.status, "We couldn't load your fees and charges just now.") };
      renderHostingDashboard();
      return;
    }
    var d = (payload && payload.data) ? payload.data : payload;
    var rows = Array.isArray(d && d.charges) ? d.charges : (Array.isArray(d) ? d : []);
    hostDashboardState.feesCharges = { status: "ready", rows: rows, message: "" };
    renderHostingDashboard();
  } catch (_) {
    hostDashboardState.feesCharges = { status: "error", rows: [], message: "We couldn't reach the server. Please check your connection and retry." };
    renderHostingDashboard();
  }
}

function renderHostFeesChargesSection(rows) {
  var El = window.tstsEl;
  var items = Array.isArray(rows) ? rows : [];

  if (items.length === 0) {
    return El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "text-5xl mb-4 text-emerald-500" }, [El("i", { className: "fa-solid fa-circle-check" })]),
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No cancellation charges" }),
      El("p", { className: "text-slate-500", textContent: "No cancellation charges. You're all clear." })
    ]);
  }

  var cards = items.map(function (ch) {
    var title = String(ch.experienceTitle || "Experience");
    // SR-4 (sir's fix-all order 2026-08-20): the old new Date()+toLocaleDateString pair
    // shifted "2026-09-10" to "9 Sept" (timezone drift + the en-AU "Sept" token). The
    // shared helper reads the Melbourne calendar with the fixed three-letter months.
    var date = ch.bookingDate && window.tstsFormatDateShort ? window.tstsFormatDateShort(ch.bookingDate) : "";
    var chargeCents = Number(ch.chargeCents) || 0;
    var appliedCents = Number(ch.appliedCents) || 0;
    var chargeStr = centsToMoney(chargeCents, ch.currency || "aud");
    var appliedStr = centsToMoney(appliedCents, ch.currency || "aud");
    var status = String(ch.status || "outstanding").toLowerCase();

    var badgeClass = "text-xs font-semibold px-2 py-0.5 rounded-full ";
    if (status === "recovered") badgeClass += "bg-emerald-50 text-emerald-700";
    else if (status === "partial") badgeClass += "bg-yellow-50 text-yellow-700";
    else badgeClass += "bg-orange-50 text-orange-700";

    var badgeText = status === "recovered" ? "Recovered" : (status === "partial" ? "Partial" : "Outstanding");

    return El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-2" }, [
      El("div", { className: "flex items-center justify-between gap-2" }, [
        El("h4", { className: "font-bold text-tsts-ink text-sm truncate flex-1", textContent: title }),
        El("span", { className: badgeClass, textContent: badgeText })
      ]),
      date ? El("p", { className: "text-xs text-slate-500", textContent: date }) : null,
      El("div", { className: "flex items-center gap-4 mt-1" }, [
        El("div", {}, [
          El("span", { className: "text-xs text-slate-400 block", textContent: "Charge" }),
          El("span", { className: "text-sm font-bold text-tsts-ink", textContent: chargeStr })
        ]),
        El("div", {}, [
          El("span", { className: "text-xs text-slate-400 block", textContent: "Recovered" }),
          El("span", { className: "text-sm font-bold text-tsts-ink", textContent: appliedStr })
        ])
      ])
    ].filter(Boolean));
  });

  return El("div", { className: "space-y-3" }, cards);
}

async function loadHostEarnings() {
  hostDashboardState.earnings = { status: "loading", data: null, message: "" };
  try {
    var res = await window.authFetch("/api/host/earnings", { method: "GET" });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      hostDashboardState.earnings = { status: "error", data: null, message: mapHostScopeError(payload, res.status, "We couldn't load your earnings just now.") };
      renderHostingDashboard();
      return;
    }
    var d = (payload && payload.data) ? payload.data : {};
    // Also fetch Stripe Connect status
    var connectStatus = "not_connected";
    try {
      var cRes = await window.authFetch("/api/host/stripe-connect/status", { method: "GET" });
      var cPayload = await cRes.json().catch(function () { return {}; });
      if (cRes.ok && cPayload && cPayload.data) connectStatus = String(cPayload.data.status || "not_connected");
    } catch (_) {}
    d.stripeConnectStatus = connectStatus;
    // Also fetch cancellation charges for recovery deductions summary
    var recoveryCents = 0;
    try {
      var fRes = await window.authFetch("/api/host/cancellation-charges", { method: "GET" });
      var fPayload = await fRes.json().catch(function () { return {}; });
      if (fRes.ok && fPayload && fPayload.data) {
        var charges = Array.isArray(fPayload.data.charges) ? fPayload.data.charges : [];
        charges.forEach(function (ch) { recoveryCents += (Number(ch.chargeCents) || 0) - (Number(ch.appliedCents) || 0); });
      }
    } catch (_) {}
    d.recoveryDeductionCents = Math.max(0, recoveryCents);
    hostDashboardState.earnings = { status: "ready", data: d, message: "" };
    renderHostingDashboard();
  } catch (_) {
    hostDashboardState.earnings = { status: "error", data: null, message: "We couldn't reach the server. Please check your connection and retry." };
    renderHostingDashboard();
  }
}

function renderHostEarningsSection(data) {
  var El = window.tstsEl;
  var d = data || {};
  var totalEarned = Number(d.totalEarned) || 0;
  var totalFees = Number(d.totalFees) || 0;
  var netPayout = Number(d.netPayout) || 0;
  var recoveryDeductions = Number(d.recoveryDeductionCents) || 0;
  var bookings = Array.isArray(d.bookings) ? d.bookings : [];
  var connectStatus = String(d.stripeConnectStatus || "not_connected");

  // Owner 2026-06-12 (sir: "what about a host in a different region with a different currency?"): money is
  // currency-aware — NEVER a bare "$" and NEVER a single total summed across currencies. Use the backend's
  // per-currency breakdown (fallback: group bookings by their own currency).
  var earnGroups = (Array.isArray(d.byCurrency) && d.byCurrency.length)
    ? d.byCurrency.slice()
    : (function () {
        var m = {};
        bookings.forEach(function (b) {
          var ps0 = b.pricingSnapshot || {};
          var c = String(ps0.currency || "aud").trim().toLowerCase() || "aud";
          var g = m[c] || (m[c] = { currency: c, totalEarned: 0, totalFees: 0, netPayout: 0, bookingCount: 0 });
          g.totalEarned += Number(ps0.totalCents) || 0;
          g.totalFees += Number(ps0.platformFeeCents) || 0;
          g.netPayout += Number(ps0.hostNetCents) || 0;
          g.bookingCount += 1;
        });
        return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.totalEarned - a.totalEarned; });
      })();
  var primaryCcy = (earnGroups[0] && earnGroups[0].currency) || "aud";
  var isMultiCcy = earnGroups.length > 1;
  // Owner 2026-07-24 (sir: "fix decimals" — the same directive already applied to the Overview tab): money on
  // Earnings shows a CONSISTENT 2 decimals (A$2,320.00, not A$2,320) so it never disagrees with the Overview.
  // Currency-aware. Global centsToMoney is deliberately untouched (locked pages rely on it) — scoped here only.
  function money(v, ccy) {
    var n = (Number(v) || 0) / 100;
    var code = String(ccy || primaryCcy || "AUD").toUpperCase();
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2, currencyDisplay: "symbol" }).format(n);
    } catch (_e) { void _e; return "A$" + (Math.round(n * 100) / 100).toFixed(2); }
  }

  // Empty state
  if (bookings.length === 0 && totalEarned === 0) {
    return El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "text-5xl mb-4", textContent: "\uD83D\uDCB0" }),
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No earnings yet" }),
      El("p", { className: "text-slate-500", textContent: "No earnings yet. Host your first experience to start earning." })
    ]);
  }

  var section = El("div", { className: "space-y-6" });

  // Owner 2026-07-24 (sir: "in line with other tabs locked by me"): Earnings had NO section heading — added
  // the locked-tab heading pattern (heading-serif + text-tsts-ink) + subline, matching My Listings / Bookings.
  section.appendChild(El("div", { className: "space-y-0.5" }, [
    El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Earnings & Fees" }),
    El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "What you've earned, the platform fee on each booking, and what lands in your payout." })
  ]));

  // Stripe Connect status banner
  if (connectStatus === "not_connected") {
    var connectBanner = El("div", { className: "bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3" }, [
      El("i", { className: "fa-solid fa-link text-amber-600 mt-0.5" }),
      El("div", { className: "flex-1" }, [
        El("p", { className: "text-sm text-amber-800 font-semibold", textContent: "Connect your Stripe account to receive payouts for your experiences." }),
        El("button", {
          className: "mt-2 text-xs font-bold text-amber-700 underline hover:text-amber-900",
          textContent: "Set Up Payouts",
          onclick: function () { initiateStripeConnect(); }
        })
      ])
    ]);
    section.appendChild(connectBanner);
  } else if (connectStatus === "connected") {
    var connectedBadge = El("div", { className: "bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2" }, [
      El("i", { className: "fa-solid fa-circle-check text-emerald-600" }),
      El("span", { className: "text-sm text-emerald-700 font-semibold", textContent: "Payouts active" })
    ]);
    section.appendChild(connectedBadge);
  } else if (connectStatus === "pending") {
    var pendingBadge = El("div", { className: "bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center gap-2" }, [
      El("i", { className: "fa-solid fa-clock text-blue-600" }),
      El("span", { className: "text-sm text-blue-700 font-semibold", textContent: "Stripe account setup in progress" })
    ]);
    section.appendChild(pendingBadge);
  }

  // Summary cards — bordered tile (single-currency grid + recovery) and a borderless stat column (per-currency).
  function __sumCard(label, valueStr, valueClass, extra) {
    return El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" },
      [
        El("span", { className: "text-xs text-slate-400 block", textContent: label }),
        El("span", { className: (valueClass || "text-lg font-bold text-tsts-ink") + " block mt-1", textContent: valueStr })
      ].concat(extra ? [extra] : [])
    );
  }
  function __statCol(label, valueStr, valueColor) {
    return El("div", { className: "text-center" }, [
      El("span", { className: "text-xs text-slate-400 block", textContent: label }),
      El("span", { className: "text-lg font-bold block mt-1 " + (valueColor || "text-tsts-ink"), textContent: valueStr })
    ]);
  }
  var recoveryExtra = recoveryDeductions > 0 ? El("button", {
    className: "text-xs text-orange-600 underline mt-1",
    textContent: "View details",
    onclick: function () { setHostingSection("earnings-fees"); }
  }) : null;

  if (!isMultiCcy) {
    var summaryGrid = El("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
      __sumCard("Total Earned", money(totalEarned, primaryCcy)),
      __sumCard("Platform Fees", money(totalFees, primaryCcy)),
      __sumCard("Net Payout", money(netPayout, primaryCcy), "text-lg font-bold text-emerald-700"),
      __sumCard("Recovery Deductions", money(recoveryDeductions, primaryCcy), "text-lg font-bold text-orange-600", recoveryExtra)
    ]);
    section.appendChild(summaryGrid);
  } else {
    // Host earned across multiple currencies — one block per currency, never a cross-currency sum.
    var ccyWrap = El("div", { className: "space-y-3" });
    earnGroups.forEach(function (g) {
      var gc = String(g.currency || "aud");
      ccyWrap.appendChild(El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4" }, [
        El("div", { className: "flex items-center justify-between mb-3" }, [
          El("span", { className: "text-xs font-bold uppercase tracking-wide text-tsts-ink bg-tsts-cream rounded-full px-2.5 py-1", textContent: gc.toUpperCase() }),
          El("span", { className: "text-xs text-slate-400", textContent: g.bookingCount + (Number(g.bookingCount) === 1 ? " booking" : " bookings") })
        ]),
        El("div", { className: "grid grid-cols-3 gap-4" }, [
          __statCol("Total Earned", money(g.totalEarned, gc)),
          __statCol("Platform Fees", money(g.totalFees, gc)),
          __statCol("Net Payout", money(g.netPayout, gc), "text-emerald-700")
        ])
      ]));
    });
    if (recoveryDeductions > 0) {
      ccyWrap.appendChild(El("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4" }, [
        __sumCard("Recovery Deductions", money(recoveryDeductions, primaryCcy), "text-lg font-bold text-orange-600", recoveryExtra)
      ]));
    }
    section.appendChild(ccyWrap);
  }

  // Booking-level breakdown.
  // sir's rulings 2026-08-17, in his words: "why cant this be clubed based on the experience and
  // the date or event in that series for host to easily slice and dice the numbers ... make sure
  // this is fixed with proper grouping" and "this table must be export ready in excel for Host to
  // see in a formatted way". The flat 624-row list is gone: one row per EXPERIENCE carries its
  // rolled-up numbers and opens into one row per EVENT DATE in that series; the same numbers
  // download as a formatted Excel workbook (real .xlsx, no libraries, CSP-safe).
  if (bookings.length > 0) {
    var __egOrder = [];
    var __egMap = {};
    bookings.forEach(function (b) {
      var ps = b.pricingSnapshot || {};
      var __t = String(b.experienceTitle || "Experience");
      var __d = String(b.bookingDate || "");
      var g = __egMap[__t];
      if (!g) { g = __egMap[__t] = { title: __t, ccy: String(ps.currency || "aud"), latest: "", dates: {}, dateOrder: [], guests: 0, gross: 0, fees: 0, net: 0, statuses: {} }; __egOrder.push(g); }
      var dRow = g.dates[__d];
      if (!dRow) { dRow = g.dates[__d] = { date: __d, guests: 0, gross: 0, fees: 0, net: 0, bookings: 0, statuses: {} }; g.dateOrder.push(dRow); }
      var gross = Number(ps.totalCents) || 0;
      var fee = Number(ps.platformFeeCents) || 0;
      var net = Number(ps.hostNetCents) || 0;
      var guests = Number(b.numGuests) || 0;
      // sir 2026-08-18 ("what is the meaning of status pending?"): the column printed the raw
      // payout enum. A host reads MONEY language: has this landed in my pocket or not yet.
      var statusRaw = String(b.payoutStatusDetail || b.payoutStatus || b.status || "").replace(/_/g, " ").trim().toLowerCase();
      var statusText;
      if (statusRaw === "released" || statusRaw === "paid") statusText = "Paid to you";
      else if (statusRaw === "on hold" || statusRaw.indexOf("blocked") === 0) statusText = "On hold";
      else statusText = "Awaiting payout";
      dRow.guests += guests; dRow.gross += gross; dRow.fees += fee; dRow.net += net; dRow.bookings += 1;
      dRow.statuses[statusText] = (dRow.statuses[statusText] || 0) + 1;
      g.guests += guests; g.gross += gross; g.fees += fee; g.net += net;
      g.statuses[statusText] = (g.statuses[statusText] || 0) + 1;
      if (__d > g.latest) g.latest = __d;
    });
    __egOrder.forEach(function (g) { g.dateOrder.sort(function (a, b2) { return a.date < b2.date ? 1 : -1; }); });
    __egOrder.sort(function (a, b2) { return a.latest < b2.latest ? 1 : -1; });
    var __egTotalGuests = 0;
    __egOrder.forEach(function (g) { __egTotalGuests += Math.max(0, Number(g.guests) || 0); });

    // Mixed payout states on one line stay honest: "3 Paid . 2 Pending"; a uniform set says the word once.
    function __egStatusSummary(counts) {
      var keys = Object.keys(counts);
      if (keys.length === 1) return keys[0];
      return keys.sort().map(function (k) { return counts[k] + " " + k; }).join(" \u00b7 ");
    }
    function __egFriendlyDate(d) {
      var s = String(d || "");
      try { if (s && window.tstsFormatDateShort) s = String(window.tstsFormatDateShort(s) || s); } catch (_fe) { void _fe; }
      return s;
    }
    function __egStatusPill(text) {
      var lower = text.toLowerCase();
      var cls = "text-xs font-semibold px-2 py-0.5 rounded-full ";
      if (lower.indexOf("paid to you") !== -1) cls += "bg-emerald-50 text-emerald-700";
      else if (lower.indexOf("awaiting") !== -1) cls += "bg-yellow-50 text-yellow-700";
      else cls += "bg-slate-50 text-slate-600";
      return El("span", { className: cls, textContent: text });
    }

    var tableWrap = El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto" });
    var exportBtn = El("button", { type: "button", className: "px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-tsts-ink hover:bg-slate-50 transition", textContent: "Download for Excel" });
    tableWrap.appendChild(El("div", { className: "flex flex-wrap items-center justify-between gap-2 px-4 pt-3" }, [
      // sir 2026-08-18: hosts count PEOPLE, never database rows — "why should i share how many
      // booking and not number of guests like Table shared wit hxx fellow travller across xx"
      El("p", { className: "text-xs text-gray-500", textContent: "Table shared with " + __egTotalGuests.toLocaleString("en-AU") + " fellow traveller" + (__egTotalGuests === 1 ? "" : "s") + " across " + __egOrder.length + " experience" + (__egOrder.length === 1 ? "" : "s") + ". Open an experience to see each event." }),
      exportBtn
    ]));

    var table = El("table", { className: "w-full text-sm" });
    var thead = El("thead", {}, [
      El("tr", { className: "border-b border-slate-200 text-left" }, [
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Experience" }),
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Date" }),
        // Owner 2026-07-24 (sir: visual polish pass): numeric columns right-align (the professional financial-
        // table standard - decimals line up down the column). Text columns stay left; Status pill stays left.
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide text-right", textContent: "Guests" }),
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide text-right", textContent: "Gross" }),
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide text-right", textContent: "Fees" }),
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide text-right", textContent: "Net" }),
        El("th", { className: "py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Status" })
      ])
    ]);
    table.appendChild(thead);
    var tbody = El("tbody", {});
    __egOrder.forEach(function (g, gi) {
      var eventsCount = g.dateOrder.length;
      var groupRow = El("tr", {
        className: "border-b border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none",
        role: "button", tabindex: "0", "aria-expanded": "false",
        "aria-label": "Show each event for " + g.title
      }, [
        El("td", { className: "py-2.5 px-4 text-tsts-ink font-bold" }, [
          (function () {
            // The platform's OWN expand mark (window.tstsPlusMinus, the SVG plus/minus sir
            // ordered) — never a typed +/− character. Wrapped so it sits inline before the title.
            var mark = El("span", { className: "inline-flex items-center w-4 text-slate-400 align-middle" });
            mark.appendChild(window.tstsPlusMinus(false));
            return mark;
          })(),
          El("span", { className: "align-middle", textContent: " " + g.title })
        ]),
        El("td", { className: "py-2.5 px-4 text-slate-600 whitespace-nowrap", textContent: eventsCount + " event" + (eventsCount === 1 ? "" : "s") }),
        El("td", { className: "py-2.5 px-4 text-tsts-ink font-bold text-right", textContent: String(g.guests) }),
        El("td", { className: "py-2.5 px-4 text-tsts-ink font-bold text-right", textContent: money(g.gross, g.ccy) }),
        El("td", { className: "py-2.5 px-4 text-slate-500 text-right", textContent: money(g.fees, g.ccy) }),
        El("td", { className: "py-2.5 px-4 text-tsts-ink font-bold text-right", textContent: money(g.net, g.ccy) }),
        El("td", { className: "py-2.5 px-4" }, [__egStatusPill(__egStatusSummary(g.statuses))])
      ]);
      tbody.appendChild(groupRow);
      var dateRows = g.dateOrder.map(function (dRow) {
        var tr = El("tr", { className: "border-b border-slate-100 hover:bg-slate-50 hidden", "data-eg-parent": String(gi) }, [
          El("td", { className: "py-2 px-4" }),
          El("td", { className: "py-2 px-4 text-slate-600 whitespace-nowrap", textContent: __egFriendlyDate(dRow.date) }),
          El("td", { className: "py-2 px-4 text-slate-600 text-right", textContent: String(dRow.guests) }),
          El("td", { className: "py-2 px-4 text-tsts-ink text-right", textContent: money(dRow.gross, g.ccy) }),
          El("td", { className: "py-2 px-4 text-slate-500 text-right", textContent: money(dRow.fees, g.ccy) }),
          El("td", { className: "py-2 px-4 text-tsts-ink font-bold text-right", textContent: money(dRow.net, g.ccy) }),
          El("td", { className: "py-2 px-4" }, [__egStatusPill(__egStatusSummary(dRow.statuses))])
        ]);
        tbody.appendChild(tr);
        return tr;
      });
      function __egToggle() {
        var open = groupRow.getAttribute("aria-expanded") === "true";
        groupRow.setAttribute("aria-expanded", open ? "false" : "true");
        groupRow.setAttribute("aria-label", (open ? "Show" : "Hide") + " each event for " + g.title);
        window.tstsSetPlusMinus(groupRow.querySelector("svg"), !open);
        dateRows.forEach(function (tr) { tr.classList.toggle("hidden", open); });
      }
      groupRow.addEventListener("click", __egToggle);
      groupRow.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); __egToggle(); } });
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);

    // ---- "Download for Excel" (sir 2026-08-17): a real formatted .xlsx, built here with no
    // vendor library (strict CSP). Numbers land as numbers with a currency format so the host
    // can keep slicing in Excel; experience rows are bold with roll-ups, event rows sit under them.
    exportBtn.addEventListener("click", function () {
      try {
        var ccySymbol = String(money(0, (__egOrder[0] && __egOrder[0].ccy) || "aud")).replace(/[0-9.,\s]/g, "");
        var rows = [];
        rows.push({ cells: [{ s: 2, t: "Earnings & Fees" }] });
        rows.push({ cells: [{ s: 0, t: "The Shared Table Story \u00b7 exported " + __egFriendlyDate(new Date().toISOString().slice(0, 10)) }] });
        rows.push({ cells: [] });
        rows.push({ cells: [{ s: 1, t: "Total Earned" }, { s: 5, n: totalEarned / 100 }] });
        rows.push({ cells: [{ s: 1, t: "Platform Fees" }, { s: 5, n: totalFees / 100 }] });
        rows.push({ cells: [{ s: 1, t: "Net Payout" }, { s: 5, n: netPayout / 100 }] });
        if (recoveryDeductions > 0) rows.push({ cells: [{ s: 1, t: "Recovery Deductions" }, { s: 5, n: recoveryDeductions / 100 }] });
        rows.push({ cells: [] });
        rows.push({ cells: [{ s: 3, t: "Experience" }, { s: 3, t: "Date" }, { s: 3, t: "Guests" }, { s: 3, t: "Gross" }, { s: 3, t: "Fees" }, { s: 3, t: "Net" }, { s: 3, t: "Status" }] });
        __egOrder.forEach(function (g) {
          rows.push({ cells: [
            { s: 1, t: g.title },
            { s: 1, t: g.dateOrder.length + " event" + (g.dateOrder.length === 1 ? "" : "s") },
            { s: 1, n: g.guests },
            { s: 5, n: g.gross / 100 }, { s: 5, n: g.fees / 100 }, { s: 5, n: g.net / 100 },
            { s: 1, t: __egStatusSummary(g.statuses) }
          ] });
          g.dateOrder.forEach(function (dRow) {
            rows.push({ cells: [
              { s: 0, t: "" },
              { s: 0, t: __egFriendlyDate(dRow.date) },
              { s: 0, n: dRow.guests },
              { s: 4, n: dRow.gross / 100 }, { s: 4, n: dRow.fees / 100 }, { s: 4, n: dRow.net / 100 },
              { s: 0, t: __egStatusSummary(dRow.statuses) }
            ] });
          });
        });
        var fileName = "Earnings " + __egFriendlyDate(new Date().toISOString().slice(0, 10)) + ".xlsx";
        __tstsDownloadXlsx(fileName, "Earnings", rows, ccySymbol, [42, 24, 9, 13, 13, 13, 20]);
        window.tstsNotify("Your Excel file is on its way to your downloads.", "success");
      } catch (xe) {
        window.tstsNotify("Couldn't build the Excel file. Please try again.", "error");
      }
    });
  }

  return section;
}

// ---- Formatted Excel download (sir 2026-08-17: "this table must be export ready in excel for
// Host to see in a formatted way"). A real .xlsx is a zip of XML parts; the strict CSP forbids
// vendor scripts, so this builds the workbook by hand: stored (uncompressed) zip entries + the
// minimum OOXML parts, with bold group rows, a shaded header, column widths, and money as real
// numbers carrying a currency format so Excel can keep calculating.
function __tstsDownloadXlsx(fileName, sheetName, rows, ccySymbol, colWidths) {
  function xmlEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function colLetter(i) { var s = ""; i += 1; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  var sheetRows = rows.map(function (row, ri) {
    var cells = (row.cells || []).map(function (c, ci) {
      var ref = colLetter(ci) + (ri + 1);
      if (typeof c.n === "number" && isFinite(c.n)) {
        return '<c r="' + ref + '" s="' + (c.s || 0) + '"><v>' + c.n + "</v></c>";
      }
      var txt = String(c.t == null ? "" : c.t);
      if (!txt) return '<c r="' + ref + '" s="' + (c.s || 0) + '"/>';
      return '<c r="' + ref + '" s="' + (c.s || 0) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(txt) + "</t></is></c>";
    }).join("");
    return '<row r="' + (ri + 1) + '">' + cells + "</row>";
  }).join("");

  var colsXml = "";
  if (Array.isArray(colWidths) && colWidths.length) {
    colsXml = "<cols>" + colWidths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join("") + "</cols>";
  }

  var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    colsXml + "<sheetData>" + sheetRows + "</sheetData></worksheet>";

  var fmtCode = "&quot;" + xmlEsc(ccySymbol || "$") + "&quot;#,##0.00";
  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="' + fmtCode + '"/></numFmts>' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>' +
    "</fills>" +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  var workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="' + xmlEsc(sheetName || "Sheet1") + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";
  var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";

  var enc = new TextEncoder();
  var files = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) }
  ];

  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var localParts = [];
  var centralParts = [];
  var offset = 0;
  files.forEach(function (f) {
    var nameBytes = enc.encode(f.name);
    var crc = crc32(f.data);
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
    localParts.push(new Uint8Array(lh.buffer), nameBytes, f.data);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(ch.buffer), nameBytes);
    offset += 30 + nameBytes.length + f.data.length;
  });
  var centralSize = centralParts.reduce(function (n, p) { return n + p.length; }, 0);
  var eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true);
  var blobParts = localParts.concat(centralParts, [new Uint8Array(eocd.buffer)]);
  var blob = new Blob(blobParts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = String(fileName || "export.xlsx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

async function initiateStripeConnect() {
  try {
    // BUG-077 (2026-05-15): manual CSRF parse removed; authFetch handles it.
    var res = await window.authFetch("/api/host/stripe-connect/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      window.tstsNotify(String((payload && payload.message) || "We couldn't start your Stripe payout setup just now. Please try again."), "error");
      return;
    }
    var url = (payload && payload.data && payload.data.url) ? payload.data.url : "";
    if (url) window.location.href = url;
    else window.tstsNotify("We couldn't start your Stripe payout setup just now. Please try again.", "error");
  } catch (_) {
    window.tstsNotify("We couldn't start your Stripe payout setup just now. Please try again.", "error");
  }
}

async function handleDigestOptOutToggle(currentOptOut) {
  var next = !currentOptOut;
  try {
    var res = await window.authFetch("/api/host/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digestOptOut: next })
    });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      // Owner-approved 2026-08-03 (sir, Item 6): this route's failure ships NO human
      // sentence, so passing payload.error through put the literal code on a host's
      // screen. Prefer the backend's wording only when it actually sends one.
      window.tstsNotify(String((payload && payload.message) || "We couldn't save your email preference. Please try again."), "error");
      return;
    }
    var d = hostDashboardState.reviews.data || {};
    d.hostDigestOptOut = next;
    hostDashboardState.reviews.data = d;
    renderHostingDashboard();
    window.tstsNotify(next ? "Daily digest email turned off." : "Daily digest email turned on.", "success");
  } catch (_) {
    window.tstsNotify("We couldn't reach the server. Please check your connection and try again.", "error");
  }
}

function openHostReplyModal(reviewId, existingReply, replyAt) {
  var modal = document.getElementById("host-reply-modal");
  var reviewIdInput = document.getElementById("host-reply-review-id");
  var textInput = document.getElementById("host-reply-text");
  var charCount = document.getElementById("host-reply-char-count");
  var titleEl = document.getElementById("host-reply-modal-title");
  var windowHint = document.getElementById("host-reply-window-hint");
  var errorEl = document.getElementById("host-reply-error");
  var submitBtn = document.getElementById("host-reply-submit-btn");
  if (!modal) return;

  if (reviewIdInput) reviewIdInput.value = reviewId || "";
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }

  var reply = String(existingReply || "").trim();
  var isEdit = reply.length > 0;

  if (textInput) {
    textInput.value = reply;
    textInput.disabled = false;
  }
  if (charCount) charCount.textContent = String(reply.length) + " / 800 characters";

  if (isEdit) {
    if (titleEl) titleEl.textContent = "Edit Your Reply";
    if (submitBtn) submitBtn.textContent = "Update Reply";
    if (windowHint && replyAt) {
      var editableUntil = new Date(new Date(replyAt).getTime() + 24 * 60 * 60 * 1000);
      var now = new Date();
      if (now >= editableUntil) {
        if (textInput) textInput.disabled = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add("opacity-60", "cursor-not-allowed"); }
        windowHint.textContent = "Edit window has closed (24 hours from first reply).";
        windowHint.classList.remove("hidden");
      } else {
        var hoursLeft = Math.ceil((editableUntil.getTime() - now.getTime()) / (60 * 60 * 1000));
        windowHint.textContent = "Edit window closes in " + hoursLeft + " hour" + (hoursLeft === 1 ? "" : "s") + ".";
        windowHint.classList.remove("hidden");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
      }
    }
  } else {
    if (titleEl) titleEl.textContent = "Reply to Review";
    if (submitBtn) { submitBtn.textContent = "Post Reply"; submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
    if (windowHint) { windowHint.textContent = ""; windowHint.classList.add("hidden"); }
  }

  _openModal(modal);
}

function closeHostReplyModal() {
  var modal = document.getElementById("host-reply-modal");
  _closeModal(modal);
  var textInput = document.getElementById("host-reply-text");
  if (textInput) { textInput.value = ""; textInput.disabled = false; }
  var errorEl = document.getElementById("host-reply-error");
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }
  var submitBtn = document.getElementById("host-reply-submit-btn");
  if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
}

// === CHECK-IN MODAL (host) ===
// sir 2026-08-02: six-digit entry boxes for check-in. Auto-advance on type, Backspace steps back,
// paste distributes across boxes, only digits accepted; the assembled value syncs into the hidden
// #checkin-otp so the existing confirm handler keeps reading a single 6-char code.
var __checkinOtpBoxesWired = false;
function __initCheckinOtpBoxes() {
  if (__checkinOtpBoxesWired) return;
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".checkin-otp-digit"));
  var hidden = document.getElementById("checkin-otp");
  if (!boxes.length || !hidden) return;
  __checkinOtpBoxesWired = true;
  function sync() { hidden.value = boxes.map(function (b) { return (b.value || "").replace(/\D/g, ""); }).join(""); }
  boxes.forEach(function (box, idx) {
    box.addEventListener("input", function () {
      box.value = box.value.replace(/\D/g, "").slice(0, 1);
      if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();
      sync();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !box.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ""; sync(); e.preventDefault(); }
      if (e.key === "ArrowLeft" && idx > 0) boxes[idx - 1].focus();
      if (e.key === "ArrowRight" && idx < boxes.length - 1) boxes[idx + 1].focus();
    });
    box.addEventListener("paste", function (e) {
      var text = String((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!text) return;
      e.preventDefault();
      for (var i = 0; i < boxes.length; i++) boxes[i].value = text[i] || "";
      var next = Math.min(text.length, boxes.length - 1);
      boxes[next].focus();
      sync();
    });
  });
}

function openCheckinModal(bookingId) {
  var b = hostBookingsCache.find(function (x) { return (x._id || "") === bookingId; });
  if (!b) return;

  // sir 2026-08-13, found by walking a real door check-in: this said "Guest: Hugo Moreau
  // (1199 guests)" over a booking of 2, and pre-selected 1199 in the seats list.
  //
  // WHY: the old code summed seats across every booking matching "same guest + same occurrence",
  // but the host roster payload carries no guestId, so _guestId resolved to "" — and then EVERY
  // other booking whose id also resolved to "" matched it. "Same guest" quietly became "everyone",
  // and the whole occurrence's 1199 seats were added up for one party of two. A host clicking
  // straight through would submit 1199, which the server then refuses (server.js checks
  // seats > booking.numGuests) — a rejection thrown at the host mid-queue for no reason.
  //
  // sir's ruling: use the booking. The door is about the party standing in front of the host, and
  // this booking's own party size is exactly what the server will accept.
  var maxSeats = Math.max(1, Number(b.numGuests || b.guests || b.guestCount) || 1);

  var nameEl = document.getElementById("checkin-guest-name");
  // (six-digit box wiring lives in __initCheckinOtpBoxes below the modal opener)
  // Owner 2026-08-02: resolve the name like the roster card does — the populated guest object first.
  var __ciName = (b.guestId && typeof b.guestId === "object" && b.guestId.name) ? String(b.guestId.name) : (b.guestName || "Guest");
  if (nameEl) nameEl.textContent = "Guest: " + __ciName + " (" + maxSeats + (maxSeats === 1 ? " guest" : " guests") + ")";
  var otpInput = document.getElementById("checkin-otp");
  if (otpInput) otpInput.value = "";
  // sir 2026-08-02: six separate digit boxes — auto-advance, backspace steps back, paste fills all.
  // Digits sync into the hidden #checkin-otp so the existing submit path reads one 6-char value.
  __initCheckinOtpBoxes();
  var __otpBoxes = document.querySelectorAll(".checkin-otp-digit");
  __otpBoxes.forEach(function (bx) { bx.value = ""; });
  if (__otpBoxes.length) { try { __otpBoxes[0].focus(); } catch (eF) { void eF; } }
  var seatsSelect = document.getElementById("checkin-seats");
  if (seatsSelect) {
    seatsSelect.textContent = "";
    for (var i = 1; i <= maxSeats; i++) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === maxSeats) opt.selected = true;
      seatsSelect.appendChild(opt);
    }
  }
  var errorEl = document.getElementById("checkin-error");
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }

  var confirmBtn = document.getElementById("checkin-confirm-btn");
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.onclick = async function () {
      confirmBtn.disabled = true;
      var otp = otpInput ? otpInput.value.trim() : "";
      var seats = seatsSelect ? parseInt(seatsSelect.value, 10) : (b.numGuests || 1);
      if (!otp || otp.length !== 6) {
        if (errorEl) { errorEl.textContent = "Enter a 6-digit code."; errorEl.classList.remove("hidden"); }
        confirmBtn.disabled = false;
        return;
      }
      try {
        var res = await window.authFetch("/api/host/bookings/" + encodeURIComponent(bookingId) + "/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: otp, checkedInSeats: seats }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          if (errorEl) { errorEl.textContent = __checkinErrorCopy(data); errorEl.classList.remove("hidden"); }
          confirmBtn.disabled = false;
          return;
        }
        closeCheckinModal();
        // Owner 2026-08-02 (late-arrival top-up): say what actually happened.
        var __ciStatus = data && data.data && data.data.status;
        var __ciSeats = data && data.data && data.data.checkedInSeats;
        if (window.tstsNotify) {
          if (__ciStatus === "seats_updated") window.tstsNotify("Updated: " + __ciSeats + " guests checked in.", "success");
          else if (__ciStatus === "already_checked_in") window.tstsNotify("Already checked in with " + __ciSeats + " guests. To add more, pick a higher number.", "warning");
          else window.tstsNotify("Guest checked in!", "success");
        }
        // Refresh the hosting dashboard. Owner 2026-08-02 (found in the top-up proof): this called
        // loadHostBookings(), a function that DOES NOT EXIST — the empty catch swallowed the
        // ReferenceError on every check-in, so the roster never repainted until a manual reload.
        try { await loadHost(); } catch (refreshErr) { console.warn("checkin_refresh_failed", refreshErr); }
      } catch (e) {
        if (errorEl) { errorEl.textContent = "Network error."; errorEl.classList.remove("hidden"); }
        confirmBtn.disabled = false;
      }
    };
  }

  _openModal(checkinModal);
}
function closeCheckinModal() { _closeModal(checkinModal); }

// === ENTRY CODE VIEWER (guest) ===
async function viewEntryCode(bookingId) {
  try {
    var res = await window.authFetch("/api/bookings/" + encodeURIComponent(bookingId) + "/entry-code", { method: "GET" });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      if (window.tstsNotify) window.tstsNotify((data && data.message) || "Your one-time entry code will be sent to your email before the experience starts.", "warning");
      return;
    }
    var code = (data && data.data && data.data.otpCode) || "";
    var codeEl = document.getElementById("entry-pass-code");
    if (codeEl) codeEl.textContent = code;
    if (entryPassOverlay) entryPassOverlay.classList.remove("hidden");
  } catch (e) {
    if (window.tstsNotify) window.tstsNotify("Could not load entry code.", "warning");
  }
}
function closeEntryPass() { if (entryPassOverlay) entryPassOverlay.classList.add("hidden"); }

// Make close functions globally accessible
window.closeCheckinModal = closeCheckinModal;
window.closeEntryPass = closeEntryPass;

// Bind close buttons (replaces inline onclick handlers removed from HTML)
var _cCloseX = document.getElementById("checkin-close-x");
if (_cCloseX) _cCloseX.addEventListener("click", closeCheckinModal);
var _cCancelBtn = document.getElementById("checkin-cancel-btn");
if (_cCancelBtn) _cCancelBtn.addEventListener("click", closeCheckinModal);
var _epCloseBtn = document.getElementById("entry-pass-close-btn");
if (_epCloseBtn) _epCloseBtn.addEventListener("click", closeEntryPass);
// Owner 2026-06-02: Copy-code button on the entry-pass overlay, matching the
// success-page entry-code Copy. Reads the displayed 6-digit code + copies it,
// shows brief "Copied" feedback. Guarded on /^\d{6}$/ so it no-ops if empty.
var _epCopyBtn = document.getElementById("entry-pass-copy-btn");
if (_epCopyBtn) {
  _epCopyBtn.addEventListener("click", function () {
    var codeEl = document.getElementById("entry-pass-code");
    var code = String((codeEl && codeEl.textContent) || "").trim();
    if (!/^\d{6}$/.test(code)) return;
    var done = function () {
      var prev = _epCopyBtn.textContent;
      _epCopyBtn.textContent = "Copied";
      setTimeout(function () { _epCopyBtn.textContent = prev; }, 2000);
    };
    // Gap 12 (sir's decision O-94): the one honest copy routine in common.js. The code is on
    // screen, so a refusal leaves it selected there; the button says "Copied" only on a real copy.
    window.tstsCopyText(code, { selectEl: codeEl }).then(function (copied) {
      if (copied) done();
    });
  });
}

async function submitHostReply(e) {
  e.preventDefault();
  var reviewIdInput = document.getElementById("host-reply-review-id");
  var textInput = document.getElementById("host-reply-text");
  var errorEl = document.getElementById("host-reply-error");
  var submitBtn = document.getElementById("host-reply-submit-btn");
  var reviewId = reviewIdInput ? reviewIdInput.value.trim() : "";
  var text = textInput ? textInput.value.trim() : "";

  if (!reviewId) return;
  if (!text || text.length < 1 || text.length > 800) {
    if (errorEl) { errorEl.textContent = "Reply must be 1-800 characters."; errorEl.classList.remove("hidden"); }
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add("opacity-60", "cursor-not-allowed"); }
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }

  try {
    var res = await window.authFetch("/api/reviews/" + encodeURIComponent(reviewId) + "/host-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyText: text })
    });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      // Owner-approved 2026-08-03 (sir, Item 5): the review API ALWAYS ships a human
      // sentence (__reviewError) and this modal used to throw it away and print the code.
      // Read the backend's wording first, keep one override where ours is clearer, and
      // never render a code.
      var errCode = String((payload && payload.error) || "");
      var errMsg = String((payload && payload.message) || "").trim();
      if (errCode === "HOST_REPLY_EDIT_WINDOW_CLOSED" && /unavailable/i.test(errMsg)) {
        errMsg = "The 24-hour window to edit your reply has closed.";
      }
      if (!errMsg) errMsg = "We couldn't post your reply just now. Please try again.";
      if (errorEl) { errorEl.textContent = errMsg; errorEl.classList.remove("hidden"); }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
      return;
    }
    closeHostReplyModal();
    window.tstsNotify("Reply posted successfully.", "success");
    loadHostReviewsSummary();
  } catch (_) {
    if (errorEl) { errorEl.textContent = "We couldn't reach the server. Please check your connection and try again."; errorEl.classList.remove("hidden"); }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
  }
}

function renderHostReviewsTrendArrow(direction, delta) {
  var El = window.tstsEl;
  if (direction === "new") {
    return El("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-blue-600" }, [
      El("span", { textContent: "New" })
    ]);
  }
  if (direction === "up") {
    return El("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-green-600" }, [
      El("i", { className: "fas fa-arrow-up" }),
      El("span", { textContent: "+" + Number(delta || 0).toFixed(1) })
    ]);
  }
  if (direction === "down") {
    return El("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-red-600" }, [
      El("i", { className: "fas fa-arrow-down" }),
      El("span", { textContent: Number(delta || 0).toFixed(1) })
    ]);
  }
  return El("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-gray-400" }, [
    El("span", { textContent: "—" })
  ]);
}

function renderHostStarRating(rating) {
  var El = window.tstsEl;
  var stars = Math.round(Number(rating) || 0);
  var wrap = El("span", { className: "inline-flex items-center gap-0.5" });
  for (var i = 1; i <= 5; i++) {
    wrap.appendChild(El("i", {
      className: i <= stars ? "fas fa-star text-orange-400 text-sm" : "far fa-star text-gray-300 text-sm"
    }));
  }
  return wrap;
}

function renderHostReviewsSection(data) {
  var El = window.tstsEl;
  var d = data || {};
  var overall = d.overall || {};
  var perListing = Array.isArray(d.perListing) ? d.perListing : [];
  var ratingDist = d.ratingDistribution || {};
  var recentReviews = (d.recentReviews && Array.isArray(d.recentReviews.reviews)) ? d.recentReviews.reviews : [];
  var recentComments = Array.isArray(d.recentComments) ? d.recentComments : [];
  var ratingTrend = d.ratingTrend || {};
  var perListingTrend = Array.isArray(d.perListingTrend) ? d.perListingTrend : [];
  var hints = Array.isArray(d.hints) ? d.hints : [];
  var digestOptOut = !!d.hostDigestOptOut;
  var totalReviews = Number(overall.totalReviews) || 0;
  var avgRating = Number(overall.averageRating) || 0;
  var totalComments = Number(overall.totalComments) || 0;

  var section = El("section", { className: "space-y-6" });

  /* ---- Header + Digest Toggle ---- */
  // Owner 2026-07-24 (sir: "in line with other tabs locked by me"): heading unified to the locked-tab
  // pattern (heading-serif + text-tsts-ink) + a subline, matching My Listings / Bookings — was sans/gray-900.
  var headerRow = El("div", { className: "flex flex-col md:flex-row md:items-start md:justify-between gap-3" }, [
    El("div", { className: "space-y-0.5" }, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Reviews & Performance" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "What guests are saying, and how your rating is trending across every listing." })
    ])
  ]);

  var toggleWrap = El("label", { className: "inline-flex items-center gap-3 cursor-pointer select-none" }, [
    El("span", { className: "text-sm text-gray-600", textContent: "Daily digest email" })
  ]);
  var toggleInput = El("input", { type: "checkbox", className: "sr-only peer" });
  toggleInput.checked = !digestOptOut;
  toggleInput.addEventListener("change", function () { handleDigestOptOutToggle(digestOptOut); });
  var toggleTrack = El("div", {
    className: "relative w-11 h-6 rounded-full transition-colors " + (!digestOptOut ? "bg-orange-500" : "bg-gray-300")
  }, [
    El("div", {
      className: "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform " + (!digestOptOut ? "translate-x-5" : "translate-x-0")
    })
  ]);
  toggleWrap.appendChild(toggleInput);
  toggleWrap.appendChild(toggleTrack);
  headerRow.appendChild(toggleWrap);
  section.appendChild(headerRow);

  /* ---- Empty State ---- */
  if (totalReviews === 0 && recentComments.length === 0) {
    section.appendChild(
      El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
        El("div", { className: "text-5xl mb-4", textContent: "💬" }),
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No reviews yet" }),
        El("p", { className: "text-gray-500", textContent: "Reviews appear here once guests share feedback after their experience." })
      ])
    );
    return section;
  }

  /* ---- Summary Cards ---- */
  var summaryGrid = El("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3" });

  // Overall Rating card
  var ratingCard = El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm" }, [
    El("p", { className: "text-xs uppercase tracking-wide text-gray-500", textContent: "Overall Rating" }),
    El("div", { className: "flex items-center gap-2 mt-1" }, [
      El("p", { className: "text-2xl font-bold text-gray-900", textContent: totalReviews > 0 ? avgRating.toFixed(1) : "New" }),
      renderHostStarRating(avgRating),
      renderHostReviewsTrendArrow(ratingTrend.direction, ratingTrend.delta)
    ])
  ]);
  summaryGrid.appendChild(ratingCard);

  // Total Reviews card
  summaryGrid.appendChild(
    El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm" }, [
      El("p", { className: "text-xs uppercase tracking-wide text-gray-500", textContent: "Total Reviews" }),
      El("p", { className: "text-2xl font-bold text-gray-900 mt-1", textContent: String(totalReviews) })
    ])
  );

  // Total Comments card
  summaryGrid.appendChild(
    El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm" }, [
      El("p", { className: "text-xs uppercase tracking-wide text-gray-500", textContent: "Total Comments" }),
      El("p", { className: "text-2xl font-bold text-gray-900 mt-1", textContent: String(totalComments) })
    ])
  );
  section.appendChild(summaryGrid);

  /* ---- Rating Distribution ---- */
  if (totalReviews > 0) {
    var distBlock = El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2" }, [
      El("h3", { className: "text-sm font-bold text-gray-700 mb-2", textContent: "Rating Distribution" })
    ]);
    for (var star = 5; star >= 1; star--) {
      var count = Number(ratingDist[star]) || 0;
      var pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
      distBlock.appendChild(
        El("div", { className: "flex items-center gap-2" }, [
          El("span", { className: "text-xs text-gray-500 w-8 text-right", textContent: star + "★" }),
          El("div", { className: "flex-grow h-3 bg-gray-100 rounded-full overflow-hidden" }, [
            // Owner 2026-06-12 (sir: "Reviews unavailable" bug): the XSS-safe tstsEl helper REJECTS a `style`
            // attribute (it threw "Blocked unsafe attribute: style", crashing the whole Reviews render). Set
            // the bar width via the DOM .style property instead.
            (function () { var __bar = El("div", { className: "h-full bg-orange-400 rounded-full transition-all" }); __bar.style.width = pct + "%"; return __bar; })()
          ]),
          El("span", { className: "text-xs text-gray-500 w-8", textContent: String(count) })
        ])
      );
    }
    section.appendChild(distBlock);
  }

  /* ---- Per-Listing Table ---- */
  if (perListing.length > 0) {
    var listingBlock = El("div", { className: "bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" }, [
      El("div", { className: "p-4 border-b border-gray-100" }, [
        El("h3", { className: "text-sm font-bold text-gray-700", textContent: "Per-Listing Breakdown" })
      ])
    ]);
    var listingTable = El("div", { className: "divide-y divide-gray-100" });
    perListing.forEach(function (item) {
      var listingTrend = perListingTrend.find(function (t) { return t.experienceId === item.experienceId; }) || {};
      listingTable.appendChild(
        El("div", { className: "flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition" }, [
          El("div", { className: "flex-grow min-w-0" }, [
            El("p", { className: "text-sm font-medium text-gray-900 truncate", textContent: item.title || "Untitled Listing" }),
            El("p", { className: "text-xs text-gray-500", textContent: (item.reviewCount || 0) + " review" + ((item.reviewCount || 0) !== 1 ? "s" : "") })
          ]),
          El("div", { className: "flex items-center gap-2 flex-shrink-0" }, [
            renderHostStarRating(item.averageRating),
            El("span", { className: "text-sm font-bold text-gray-700", textContent: Number(item.averageRating || 0).toFixed(1) }),
            renderHostReviewsTrendArrow(listingTrend.direction, listingTrend.delta)
          ])
        ])
      );
    });
    listingBlock.appendChild(listingTable);
    section.appendChild(listingBlock);
  }

  /* ---- Recent Reviews ---- */
  if (recentReviews.length > 0) {
    var reviewsBlock = El("div", { className: "bg-white rounded-xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "p-4 border-b border-gray-100" }, [
        El("h3", { className: "text-sm font-bold text-gray-700", textContent: "Recent Reviews" })
      ])
    ]);
    var reviewsList = El("div", { className: "divide-y divide-gray-100" });
    recentReviews.forEach(function (rv) {
      var reviewCard = El("div", { className: "p-4 space-y-2" });
      var headerLine = El("div", { className: "flex items-center justify-between gap-2" }, [
        El("div", { className: "flex items-center gap-2 min-w-0" }, [
          El("span", { className: "font-medium text-sm text-gray-900", textContent: rv.authorName || "Guest" }),
          renderHostStarRating(rv.rating),
          El("span", { className: "text-xs text-gray-400", textContent: rv.experienceTitle || "" })
        ])
      ]);
      var dateStr = "";
      if (rv.date) {
        try { dateStr = new Date(rv.date).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "Australia/Melbourne" }); } catch (_) { dateStr = ""; }
      }
      if (dateStr) {
        headerLine.appendChild(El("span", { className: "text-xs text-gray-400 flex-shrink-0", textContent: dateStr }));
      }
      reviewCard.appendChild(headerLine);

      if (rv.comment) {
        reviewCard.appendChild(El("p", { className: "text-sm text-gray-700 break-words", textContent: rv.comment }));
      }

      // Host reply block
      var hostReply = String(rv.hostReply || "").trim();
      if (hostReply) {
        var replyBlock = El("div", { className: "mt-2 pl-4 border-l-2 border-orange-200 bg-orange-50/50 rounded-r-lg p-3" }, [
          El("div", { className: "flex items-center justify-between gap-2 mb-1" }, [
            El("span", { className: "text-xs font-bold text-orange-700 uppercase tracking-wide", textContent: "Your Reply" })
          ]),
          El("p", { className: "text-sm text-slate-700 break-words", textContent: hostReply })
        ]);
        // Edit button if within 24 hours
        if (rv.hostReplyAt) {
          var editableUntil = new Date(new Date(rv.hostReplyAt).getTime() + 24 * 60 * 60 * 1000);
          if (new Date() < editableUntil) {
            var editBtn = El("button", {
              type: "button",
              className: "text-xs text-orange-600 hover:text-orange-800 font-medium mt-1",
              "data-action": "host-reply-edit",
              "data-review-id": rv._id || "",
              "data-reply-text": hostReply,
              "data-reply-at": rv.hostReplyAt || "",
              textContent: "Edit reply"
            });
            replyBlock.firstChild.appendChild(editBtn);
          }
        }
        reviewCard.appendChild(replyBlock);
      } else {
        // Reply button
        var replyBtn = El("button", {
          type: "button",
          className: "text-xs text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1",
          "data-action": "host-reply",
          "data-review-id": rv._id || "",
          textContent: "Reply"
        });
        reviewCard.appendChild(replyBtn);
      }

      reviewsList.appendChild(reviewCard);
    });
    reviewsBlock.appendChild(reviewsList);
    section.appendChild(reviewsBlock);
  }

  /* ---- Recent Comments ---- */
  if (recentComments.length > 0) {
    var commentsBlock = El("div", { className: "bg-white rounded-xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "p-4 border-b border-gray-100" }, [
        El("h3", { className: "text-sm font-bold text-gray-700", textContent: "Recent Comments" })
      ])
    ]);
    var commentsList = El("div", { className: "divide-y divide-gray-100" });
    recentComments.forEach(function (cm) {
      var cmDateStr = "";
      if (cm.createdAt) {
        try { cmDateStr = new Date(cm.createdAt).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "Australia/Melbourne" }); } catch (_) { cmDateStr = ""; }
      }
      commentsList.appendChild(
        El("div", { className: "p-4" }, [
          El("div", { className: "flex items-center justify-between gap-2 mb-1" }, [
            El("div", { className: "flex items-center gap-2 min-w-0" }, [
              El("span", { className: "font-medium text-sm text-gray-900", textContent: cm.authorName || "Guest" }),
              El("span", { className: "text-xs text-gray-400", textContent: cm.experienceTitle || "" })
            ]),
            cmDateStr ? El("span", { className: "text-xs text-gray-400 flex-shrink-0", textContent: cmDateStr }) : El("span", { textContent: "" })
          ]),
          El("p", { className: "text-sm text-gray-700 break-words", textContent: cm.text || "" })
        ])
      );
    });
    commentsBlock.appendChild(commentsList);
    section.appendChild(commentsBlock);
  } else if (totalReviews > 0) {
    section.appendChild(
      El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-sm text-gray-500" }, [
        El("h3", { className: "text-sm font-bold text-gray-700 mb-1", textContent: "Recent Comments" }),
        El("p", { textContent: "No comments yet." })
      ])
    );
  }

  /* ---- Improvement Hints ---- */
  if (hints.length > 0) {
    var hintsBlock = El("div", { className: "bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3" }, [
      El("h3", { className: "text-sm font-bold text-gray-700", textContent: "Insights & Opportunities" })
    ]);
    hints.forEach(function (h) {
      var severityClass = "bg-blue-50 text-blue-700 border-blue-200";
      var iconClass = "fas fa-info-circle text-blue-500";
      if (h.severity === "attention") {
        severityClass = "bg-amber-50 text-amber-700 border-amber-200";
        iconClass = "fas fa-exclamation-circle text-amber-500";
      } else if (h.severity === "positive") {
        severityClass = "bg-green-50 text-green-700 border-green-200";
        iconClass = "fas fa-check-circle text-green-500";
      }
      hintsBlock.appendChild(
        El("div", { className: "flex items-start gap-3 rounded-lg border p-3 " + severityClass }, [
          El("i", { className: iconClass + " mt-0.5" }),
          El("p", { className: "text-sm", textContent: h.message || "" })
        ])
      );
    });
    section.appendChild(hintsBlock);
  }

  return section;
}

function renderHostingSectionContent() {
  const section = hostDashboardState.section || "overview";
  const listingsState = hostDashboardState.listings || {};
  const bookingsState = hostDashboardState.bookings || {};
  const requestsState = hostDashboardState.privateRequests || {};
  const verificationState = hostDashboardState.verification || {};
  const El = window.tstsEl;

  if (section === "overview") return renderHostOverviewSection();

  if (section === "listings") {
    if (listingsState.status === "loading") return renderHostSourceLoading("Loading listings...");
    if (listingsState.status === "error") return renderHostSourceError("Listings unavailable", listingsState.message, "Retry Listings");

    const listingRows = Array.isArray(listingsState.items) ? listingsState.items : [];
    // sir 2026-08-08: "the heading must carry to tabs even when there are no listing with hin to host an
    // expwernece". The empty state used to REPLACE the whole section, so the approved "My Listings" header
    // vanished the moment a host had nothing live — the tab lost its own title. The header now always
    // renders; the empty card sits underneath it, still carrying the invitation to host.
    return renderHostListingsSection(listingRows, bookingsState.status === "ready" ? bookingsState.rows : [], listingsState.deletedItems, listingsState.draftItems);
  }

  // sir's split, element 5 [2026-08-07]: the queue is its own tab — the approved grouped queue,
  // rows expiry-sorted within groups (the countdown is the money clock), header carried over,
  // designed empty state. Nothing else moves in: alternative-offered / counter-pending rows are
  // waiting on the GUEST, not the host, and stay out exactly as the queue filters today.
  if (section === "guest-requests") {
    if (requestsState.status === "loading") return renderHostSourceLoading("Loading guest requests...");
    if (requestsState.status === "error") return renderHostSourceError("Guest requests unavailable", requestsState.message, "Retry Guest Requests");
    return renderHostGuestRequestsSection(requestsState.rows);
  }


  if (section === "bookings") {
    // Owner 2026-06-15: private requests moved OUT of the Bookings body into their own focused modal
    // (opened from the Overview's counted action + the "Pending private requests" metric). This section
    // now shows regular seat bookings only — nothing added to the page body for requests.
    if (bookingsState.status === "loading" && bookingsState.status !== "ready") return renderHostSourceLoading("Loading bookings...");
    if (bookingsState.status === "error") return renderHostSourceError("Bookings unavailable", bookingsState.message, "Retry Bookings");
    return renderHostBookingsSection(bookingsState.rows);
  }

  if (section === "funding") {
    var fundState = hostDashboardState.funding || {};
    if (fundState.status === "loading") return renderHostSourceLoading("Loading your funding details...");
    if (fundState.status === "error") return renderHostSourceError("Funding unavailable", fundState.message, "Retry Funding");
    if (fundState.status === "idle") {
      loadHostFundingSection();
      return renderHostSourceLoading("Loading your funding details...");
    }
    return renderHostFundingSection(fundState.slots);
  }

  if (section === "earnings-fees") {
    // Merged: earnings + fees & charges
    var earnState = hostDashboardState.earnings || {};
    var fcState = hostDashboardState.feesCharges || {};
    if (earnState.status === "idle") {
      loadHostEarnings();
      return renderHostSourceLoading("Loading earnings...");
    }
    if (earnState.status === "loading") return renderHostSourceLoading("Loading earnings...");
    if (earnState.status === "error") return renderHostSourceError("Earnings unavailable", earnState.message, "Retry Earnings");
    var earningsMerged = El("div", { className: "space-y-8" });
    earningsMerged.appendChild(renderHostEarningsSection(earnState.data));
    // Fees & charges below
    if (fcState.status === "idle") {
      loadHostFeesCharges();
      earningsMerged.appendChild(renderHostSourceLoading("Loading fees and charges..."));
    } else if (fcState.status === "loading") {
      earningsMerged.appendChild(renderHostSourceLoading("Loading fees and charges..."));
    } else if (fcState.status === "error") {
      earningsMerged.appendChild(renderHostSourceError("Fees and charges unavailable", fcState.message, "Retry Fees & Charges"));
    } else {
      var fcRows = Array.isArray(fcState.rows) ? fcState.rows : [];
      if (fcRows.length > 0) {
        earningsMerged.appendChild(El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Cancellation Charges" }));
        earningsMerged.appendChild(renderHostFeesChargesSection(fcRows));
      }
    }
    return earningsMerged;
  }

  if (section === "verification") {
    if (verificationState.status === "loading") return renderHostSourceLoading("Loading verification and payout status...");
    if (verificationState.status === "error") return renderHostSourceError("Verification and payout unavailable", verificationState.message, "Retry Verification");
    return renderHostVerificationSection(verificationState.data);
  }

  if (section === "reviews") {
    var reviewsState = hostDashboardState.reviews || {};
    if (reviewsState.status === "loading") return renderHostSourceLoading("Loading reviews and performance data...");
    if (reviewsState.status === "error") return renderHostSourceError("Reviews unavailable", reviewsState.message, "Retry Reviews");
    if (reviewsState.status === "idle") {
      loadHostReviewsSummary();
      return renderHostSourceLoading("Loading reviews and performance data...");
    }
    return renderHostReviewsSection(reviewsState.data);
  }

  if (section === "analytics") {
    var analyticsState = hostDashboardState.analytics || {};
    if (analyticsState.status === "idle") {
      loadHostAnalytics();
      return renderHostSourceLoading("Loading analytics...");
    }
    if (analyticsState.status === "loading") return renderHostSourceLoading("Loading analytics...");
    if (analyticsState.status === "error") return renderHostSourceError("Analytics unavailable", analyticsState.message, "Retry Analytics");
    return renderHostAnalyticsSection(analyticsState.data);
  }

  return renderHostOverviewSection();
}

async function loadHostAnalytics() {
  hostDashboardState.analytics = { status: "loading", data: null, message: "" };
  try {
    var res = await window.authFetch("/api/host/analytics", { method: "GET" });
    var payload = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      hostDashboardState.analytics = { status: "error", data: null, message: mapHostScopeError(payload, res.status, "We couldn't load your analytics just now.") };
      renderHostingDashboard();
      return;
    }
    var d = (payload && payload.data) ? payload.data : payload;
    hostDashboardState.analytics = { status: "ready", data: d, message: "" };
    renderHostingDashboard();
  } catch (_) {
    hostDashboardState.analytics = { status: "error", data: null, message: "We couldn't reach the server. Please check your connection and retry." };
    renderHostingDashboard();
  }
}

// Owner 2026-07-24: "2026-05" → "May 2026" for the Analytics trend axis (bookingDate is a YYYY-MM-DD string).
function __analyticsMonthLabel(ym) {
  var s = String(ym || "");
  var m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s;
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var idx = parseInt(m[2], 10) - 1;
  return (months[idx] || m[2]) + " " + m[1];
}

function renderHostAnalyticsSection(data) {
  var El = window.tstsEl;
  var d = data || {};
  var trend = Array.isArray(d.monthlyTrend) ? d.monthlyTrend : [];
  var tops = (Array.isArray(d.topExperiences) && d.topExperiences.length)
    ? d.topExperiences
    : ((d.topExperience && d.topExperience.title) ? [d.topExperience] : []);
  var hasAny = d.totalBookings || d.last30Days || d.last90Days || d.repeatGuestCount
    || d.guestsServed || trend.length || tops.length;
  if (!hasAny) {
    return El("div", { className: "text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
      El("p", { className: "text-4xl mb-3 text-tsts-clay" }, [El("i", { className: "fa-solid fa-chart-line" })]),
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No analytics yet" }),
      El("p", { className: "text-sm text-slate-500", textContent: "Analytics will appear once you start receiving bookings." })
    ]);
  }
  var section = El("div", { className: "space-y-5" });
  // Owner 2026-07-24 (sir: "in line with other tabs locked by me"): Analytics had NO section heading — added
  // the locked-tab heading pattern (heading-serif + text-tsts-ink) + subline so it reads like every other tab.
  section.appendChild(El("div", { className: "space-y-0.5" }, [
    El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Analytics" }),
    El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "How your hosting is performing. Completed bookings and repeat guests at a glance." })
  ]));
  var grid = El("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3" });
  // Owner 2026-07-24 (sir: Analytics as deep as the locked tabs, REAL data): every tile is the SAME
  // status:"completed" set as the backend headline count, so the tab can never disagree with itself.
  // Repeat-guest RATE = distinct repeat guests / distinct guests. NON-money (money lives on the Earnings tab).
  var uniqueGuests = Number(d.uniqueGuestCount) || 0;
  var repeatRate = uniqueGuests > 0 ? Math.round((Number(d.repeatGuestCount) / uniqueGuests) * 100) : 0;
  var tiles = [
    { label: "Completed Bookings", value: String(d.totalBookings || 0) },
    { label: "Guests Served", value: String(d.guestsServed || 0) },
    { label: "Repeat Guests", value: String(d.repeatGuestCount || 0) },
    { label: "Repeat Guest Rate", value: repeatRate + "%" },
    { label: "Last 30 Days", value: String(d.last30Days || 0) },
    { label: "Last 90 Days", value: String(d.last90Days || 0) }
  ];
  tiles.forEach(function(t) {
    grid.appendChild(
      El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" }, [
        El("p", { className: "text-xs uppercase tracking-wide text-slate-400", textContent: t.label }),
        El("p", { className: "text-lg font-bold text-tsts-ink mt-1", textContent: t.value })
      ])
    );
  });
  section.appendChild(grid);
  section.appendChild(El("p", { className: "text-xs text-slate-400", textContent: "Counts completed bookings only. Your Overview shows all booking requests across every status." }));
  // \u2500\u2500 Bookings by month (trend bars \u2014 same pattern as the Reviews rating distribution) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (trend.length) {
    var maxBk = trend.reduce(function (mx, x) { return Math.max(mx, Number(x.bookings) || 0); }, 0) || 1;
    var trendBlock = El("div", { className: "bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-2" }, [
      El("h3", { className: "text-sm font-bold text-gray-700 mb-2", textContent: "Bookings by month" })
    ]);
    trend.forEach(function (m) {
      var count = Number(m.bookings) || 0;
      var pct = Math.round((count / maxBk) * 100);
      trendBlock.appendChild(
        El("div", { className: "flex items-center gap-2" }, [
          El("span", { className: "text-xs text-slate-500 w-20 text-right flex-shrink-0", textContent: __analyticsMonthLabel(m.month) }),
          El("div", { className: "flex-grow h-3 bg-slate-100 rounded-full overflow-hidden" }, [
            (function () { var b = El("div", { className: "h-full bg-orange-400 rounded-full transition-all" }); b.style.width = pct + "%"; return b; })()
          ]),
          El("span", { className: "text-xs text-slate-500 w-6 flex-shrink-0", textContent: String(count) })
        ])
      );
    });
    section.appendChild(trendBlock);
  }

  // \u2500\u2500 Top experiences (list \u2014 same pattern as the Reviews per-listing breakdown) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (tops.length) {
    var topBlock = El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" }, [
      El("div", { className: "p-4 border-b border-slate-100" }, [
        El("h3", { className: "text-sm font-bold text-gray-700", textContent: "Top experiences" })
      ])
    ]);
    var topList = El("div", { className: "divide-y divide-slate-100" });
    tops.forEach(function (t, i) {
      var bk = Number(t.bookings) || 0;
      topList.appendChild(
        El("div", { className: "flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition" }, [
          El("div", { className: "flex items-center gap-3 min-w-0" }, [
            El("span", { className: "w-6 h-6 rounded-full bg-tsts-cream text-tsts-ink text-xs font-bold flex items-center justify-center flex-shrink-0", textContent: String(i + 1) }),
            El("p", { className: "text-sm font-medium text-tsts-ink truncate", textContent: String(t.title || "Untitled experience") })
          ]),
          El("div", { className: "flex items-center gap-2 flex-shrink-0 text-xs text-slate-500" }, [
            El("span", { textContent: bk + (bk === 1 ? " booking" : " bookings") }),
            El("span", { className: "text-slate-300", textContent: "\u00b7" }),
            El("span", { textContent: String(t.guests || 0) + " guests" })
          ])
        ])
      );
    });
    topBlock.appendChild(topList);
    section.appendChild(topBlock);
  }

  return section;
}

// ── NEVER HOSTED ─────────────────────────────────────────────────────────────
// Owner 2026-08-08 (sir, verbatim): "for someone who have never hosted should never see any of these tab
// but just one msg that host an expeirence or something like shareyour world with fellow traveller -- why
// i need tab if person is never hosted an experience?"
//
// WHAT WAS THERE: nine sub-tabs, all of them empty or written for someone who already hosts — an Overview
// of ten zero rows, "Requests to approve · guests asking to book your whole table land here for your yes",
// "Who's coming · your upcoming guests, ready for the day", "None of your experiences currently require
// additional funding". A person with no table, told about their table. sir's answer is the right one: if
// there is nothing to manage, do not show nine ways to manage it.
//
// WHO GETS THE FULL DASHBOARD — a person is a host once they have HOSTED AN EVENT, at any time. Active or
// past makes no difference; a listing that has finished, or been paused, counts exactly as much as a live
// one. That single test is the whole rule.
//
// VERIFICATION IS NOT A SEPARATE DOOR, and the reason is a mistake of mine worth leaving on the record. I
// raised verification as a way in and had it built before checking whether it was even reachable, so the
// decision to include it was taken on facts I got wrong. server.js:18786 refuses a verification request
// outright unless a listing already exists ("Create at least one listing before requesting host
// verification"). Nobody can be verified before listing, so a verified-with-no-listings branch could never
// execute — it was dead code dressed as a feature. Removed.
//
// Bookings and guest requests stay in the test as a safety net: either one existing proves hosting has
// happened, so nobody with real history can be shown the beginner's message.
//
// EVERY source must have FINISHED loading first, and the default while loading is FALSE — a real host must
// never see the beginner's message for even one frame, so uncertainty resolves toward the full dashboard.
// `st` exists so this gate can be tested. hostDashboardState is module-scoped and unreachable from a test
// file, which meant the first version of this function could only ever be checked by reading it — the
// standard sir has spent the session rejecting. Callers pass nothing; tests pass a state.
function __hostNeverHosted(st) {
  const s = st || hostDashboardState;
  const l = s.listings || {};
  const b = s.bookings || {};
  const r = s.privateRequests || {};
  // Verification is deliberately NOT read here and NOT waited on. When it stopped being a door I left the
  // gate still blocking until verification had loaded, then ignoring the value — dead weight that delayed
  // every decision on data it no longer used.
  if (l.status !== "ready" || b.status !== "ready" || r.status !== "ready") return false;

  // sir 2026-08-08, roles are additive and permanent: "once a host it can never be reverted -- it is not
  // dynamic but fixed". hasEverHosted is the account fact, written on first publish and never unset, so it
  // survives pause, expiry and deletion. The listing count stays only as a belt-and-braces reading for the
  // moment the flag has not loaded; it must never be the thing that DEMOTES someone.
  if (l.hasEverHosted === true) return false;
  const hasEverListed = Array.isArray(l.items) && l.items.length > 0;
  const bookingCount = Array.isArray(b.rows) ? b.rows.length : 0;
  const requestCount = Array.isArray(r.rows) ? r.rows.length : 0;
  return !hasEverListed && bookingCount === 0 && requestCount === 0;
}

// The one message. sir's own words for it: "host an expeirence or something like shareyour world with
// fellow traveller".
//
// NO VERIFICATION AFFORDANCE. I built one here and it was a trap of my own making: this message is shown
// ONLY to a person with no listing, and server.js:18786 refuses a verification request unless a listing
// already exists. So the single group who could see that link was the exact group the server would always
// turn away, and it failed silently on top of that. Removed. The only way forward from this screen is the
// one that actually works: host an experience.
function renderHostNeverHostedInvite() {
  const El = window.tstsEl;
  const card = El("div", { className: "bg-white rounded-3xl border border-gray-100 shadow-soft-card px-6 py-12 md:px-12 md:py-16 text-center" });
  card.appendChild(El("h2", { className: "heading-serif text-2xl md:text-3xl font-bold text-tsts-ink", textContent: "Share your world with fellow travellers" }));
  // No em dash. This platform has ruled against them before (the login screen-reader line and the
  // private-request form were both corrected for exactly this), and I put one straight back into my own
  // copy on a page sir was looking at.
  card.appendChild(El("p", { className: "mt-3 text-base text-gray-600 leading-relaxed max-w-xl mx-auto", textContent: "Host an experience and open your table to a few people. Cook a meal you love, share a walk you know, or teach a craft you practise. You choose the date, the price, and how many can come." }));
  card.appendChild(El("a", { href: "host.html", className: "mt-8 inline-block tsts-btn-primary px-8 py-3 rounded-full font-bold shadow transition", textContent: "Host an experience" }));
  return card;
}

function renderHostingDashboard() {
  if (!contentEl) return;
  if (dashboardRequestState.activeTab !== "hosting") return;
  // Owner 2026-06-12 (sir: "why do I need Booking FAQs in the host overview"): the guest "Booking FAQs"
  // contextual block (#faq-context-dashboard-guest) belongs to the bookings tabs only — hide it on the
  // host dashboard. renderTripsView re-shows it when the bookings tab is active.
  try { var __gf = document.getElementById("faq-context-dashboard-guest"); if (__gf) __gf.classList.add("hidden"); } catch (_ge) { void _ge; }
  const El = window.tstsEl;
  contentEl.textContent = "";

  // sir 2026-08-08: a person who has never hosted sees NO tabs — one message instead.
  //
  // WHAT THIS RENDERS: renderHostNeverHostedInvite() ONLY — a heading, a paragraph, and the
  // "Host an experience" button. Nothing else. There is deliberately NO verification entry point
  // here, because verification REQUIRES an existing listing: server.js refuses the request with
  // NO_LISTINGS — "Create at least one listing before requesting host verification." A verification
  // link on this screen would therefore be a dead end for the only people who can see this screen.
  //
  // DO NOT ADD ONE BACK. An earlier version of this comment claimed the screen "renders the
  // verification panel ALONE"; it never did, and acting on that claim would reintroduce the dead end.
  // (Corrected 2026-08-25 after the screen was walked as a real never-hosted guest.)
  //
  // The tab strip must also stay gone. My first attempt set showall=1 and rebuilt the whole
  // dashboard — sir caught it immediately: "the verifcation link taking to a tab called verification
  // along with all other tabs ---- -- why?". Correct. Reaching one page is not a reason to
  // resurrect the eight empty ones.
  if (__hostNeverHosted()) {
    contentEl.appendChild(renderHostNeverHostedInvite());
    return;
  }

  const wrap = El("div", { className: "space-y-4" }, [
    renderHostingSectionTabs(hostDashboardState.section),
    renderHostOwnershipWarnings(hostDashboardState.listings.warnings),
    renderHostingSectionContent()
  ]);
  contentEl.appendChild(wrap);
  // Owner 2026-08-05 (sir: "Remove it now"): the needs-attention tab count is GONE — see the note in
  // loadHost. The tab reads "My Hosted Experiences" with no number.
}

function setHostingSection(nextSection) {
  hostDashboardState.section = resolveHostingSection(nextSection, dashboardDeepLink.panel);
  renderHostingDashboard();
  syncDashboardTabQuery("hosting", hostDashboardState.section);
  focusDashboardDeepLinkPanel();
}

async function fetchHostListingsSource() {
  try {
    const res = await window.authFetch("/api/host/experiences", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        items: [],
        summary: null,
        warnings: [],
        message: mapHostScopeError(payload, res.status, "Failed to load listings.")
      };
    }

    const root = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
    const items = Array.isArray(root && root.items)
      ? root.items
      : (Array.isArray(root && root.experiences) ? root.experiences : []);
    const summary = computeListingsSummary(items, root && root.summary);
    const warnings = Array.isArray(root && root.warnings) ? root.warnings : [];
    return {
      status: "ready",
      items: items,
      summary: summary,
      // sir 2026-08-08: a permanent fact about the ACCOUNT, not a count of what is visible today.
      hasEverHosted: !!(root && root.hasEverHosted === true),
      draftItems: Array.isArray(root && root.draftItems) ? root.draftItems : [],
      deletedItems: Array.isArray(root && root.deletedItems) ? root.deletedItems : [],
      warnings: warnings,
      message: ""
    };
  } catch (_) {
    return { status: "error", items: [], summary: null, hasEverHosted: false, warnings: [], message: "Failed to load listings." };
  }
}

async function fetchHostBookingsSource() {
  try {
    const res = await window.authFetch("/api/bookings/host-bookings", { method: "GET" });
    const payload = await res.json().catch(() => []);
    if (!res.ok) {
      return { status: "error", rows: [], message: mapHostScopeError(payload, res.status, "Failed to load booking requests.") };
    }
    var unwrapped = (payload && payload.data) ? payload.data : payload;
    if (unwrapped && unwrapped.bookings && Array.isArray(unwrapped.bookings)) unwrapped = unwrapped.bookings;
    var rows = Array.isArray(unwrapped) ? unwrapped : [];
    return { status: "ready", rows: rows, message: "" };
  } catch (_) {
    return { status: "error", rows: [], message: "Failed to load booking requests." };
  }
}

async function fetchHostPrivateRequestsSource() {
  try {
    const res = await window.authFetch("/api/host/private-booking-requests?status=all&limit=100", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", rows: [], message: mapHostScopeError(payload, res.status, "Failed to load private requests.") };
    }
    const unwrapped = (payload && payload.data) ? payload.data : payload;
    const rows = unwrapped != null && Array.isArray(unwrapped.requests) ? unwrapped.requests : [];
    // Host panel shows only actionable rows: live requests awaiting the host,
    // active alternative offers, in-flight counter-accepts, and pre-empted
    // requests still inside their 48h counter-offer window.
    // sir 2026-08-07: the tab now also shows what RAN OUT and who was turned away, in its own
    // collapsed section below — so terminal rows must survive this filter. Confirmed requests still
    // drop out: they became bookings and live on the Bookings tab.
    const _nowMs = Date.now();
    const actionable = rows.filter(function (r) {
      const s = String((r && r.status) || "").toLowerCase();
      if (s === "awaiting_host" || s === "alternative_offered" || s === "counter_accept_pending") return true;
      if (s === "declined" || s === "expired") return true;
      if (s === "invalidated") return true;   // in-window ones stay actionable; lapsed ones read as closed
      return false;
    });
    void _nowMs;
    return { status: "ready", rows: actionable, message: "" };
  } catch (_) {
    return { status: "error", rows: [], message: "Failed to load private requests." };
  }
}

async function fetchHostVerificationSource() {
  try {
    const res = await window.authFetch("/api/host/verification/status", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", data: null, message: mapHostScopeError(payload, res.status, "Failed to load verification and payout status.") };
    }
    return { status: "ready", data: parseHostVerificationPayload(payload), message: "" };
  } catch (_) {
    return { status: "error", data: null, message: "Failed to load verification and payout status." };
  }
}

/* ====================== FUNDING (ported from host.js shortfall) ====================== */

var __fundingSlotsCache = [];
var __fundingRequestCounter = 0;
var __fundingPaymentInFlight = new Set();
var __fundingPaymentPendingWebhook = new Set();

function __fundingBadgeClass(state) {
  var key = String(state || "").toUpperCase();
  if (key === "APPROVED" || key === "FULLY_FUNDED" || key === "STAGE_A_PAID") return "bg-emerald-100 text-emerald-700";
  if (key === "UNDER_REVIEW" || key === "STAGE_A_DUE" || key === "STAGE_B_DUE" || key === "BOOKING_FROZEN_STAGE_B") return "bg-amber-100 text-amber-700";
  if (key === "REJECTED") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function __fundingStateLabel(state) {
  var s = String(state || "none").toUpperCase();
  var labels = {
    "STAGE_A_DUE": "First payment due",
    "STAGE_A_PAID": "First payment made",
    "STAGE_B_DUE": "Second payment due",
    "APPROVED": "Approved",
    "FULLY_FUNDED": "Fully funded",
    "UNDER_REVIEW": "Under review",
    "BOOKING_FROZEN_STAGE_B": "Bookings paused, second payment needed",
    "REJECTED": "Not approved",
    "NONE": "Pending"
  };
  return labels[s] || s.toLowerCase().replace(/_/g, " ");
}

function __fundingEffectiveUiState(slot) {
  var slotId = String((slot && slot.slotId) || "");
  if (__fundingPaymentInFlight.has(slotId)) return "PAYMENT_IN_PROGRESS";
  if (__fundingPaymentPendingWebhook.has(slotId)) return "PAYMENT_CONFIRMED_PENDING_WEBHOOK";
  return String((slot && slot.paymentUiState) || "PAYMENT_REQUIRED");
}

function __fundingNextStage(slot) {
  var s = slot && typeof slot === "object" ? slot : {};
  var stageARemaining = Number((s.stageA && s.stageA.remainingCents) || 0);
  var stageBRemaining = Number((s.stageB && s.stageB.remainingCents) || 0);
  var threshold = Number(s.thresholdSeatsSnapshot || 0);
  var booked = Number(s.bookedSeats || 0);
  if (stageARemaining > 0) return "A";
  if (stageBRemaining > 0 && booked >= threshold) return "B";
  return "";
}

function __fundingFormatCents(centsRaw) {
  var cents = Number(centsRaw);
  if (!Number.isFinite(cents)) return "—";
  // Owner 2026-07-23 (sir: Funding read as a different site): use the app-wide A$ format (A$180), not the
  // one-off "$180.00 AUD" this tab used — so money matches every other Hosted tab.
  return centsToMoney(cents, "aud");
}

// Owner 2026-08-02 (sir): "Fund the experience" — the host CHOOSES the funding method.
// Modal offers: payout balance (when it covers), balance + card split (when partial),
// card (always). Resolves "payout" | "split" | "card" | null (cancelled). Money only
// moves AFTER this explicit choice — the old one-click instant deduction is gone.
function __fundingChooseMethod(stage, remainingCents, balanceCents, opts) {
  return new Promise(function (resolve) {
    var El = window.tstsEl;
    var o = (opts && typeof opts === "object") ? opts : {};
    var remaining = Math.max(0, Number(remainingCents) || 0);
    // null balance = the lookup FAILED — never shown as a factual zero (sir's audit round).
    var balanceUnknown = (balanceCents == null);
    var balance = balanceUnknown ? 0 : Math.max(0, Number(balanceCents) || 0);
    var stageDue = Math.max(remaining, Number(o.stageDueCents) || 0);
    var paidSoFar = Math.max(0, stageDue - remaining);
    var covers = !balanceUnknown && balance >= remaining && remaining > 0;
    var partial = !balanceUnknown && balance > 0 && balance < remaining;
    var selected = covers ? "payout" : (partial ? "split" : "card");
    var openedAt = Date.now();
    var optionNodes = {};

    function money(c) { return __fundingFormatCents(c); }

    function close(result) {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(result);
    }
    function onKey(ev) {
      if (!ev) return;
      if (ev.key === "Escape") { ev.stopPropagation(); close(null); return; }
      // Focus trap: Tab cycles inside the dialog only (sir's audit round).
      if (ev.key === "Tab") {
        var focusables = Array.prototype.slice.call(panel.querySelectorAll("[tabindex='0'], button"));
        if (focusables.length === 0) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    }

    function paintSelection() {
      Object.keys(optionNodes).forEach(function (k) {
        var n = optionNodes[k];
        var on = (k === selected);
        n.className = "w-full text-left rounded-xl border p-3 transition cursor-pointer " +
          (on ? "border-orange-500 bg-orange-50/50" : "border-gray-200 hover:border-gray-300 bg-white");
        n.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    function selectKey(key, focusRow) {
      selected = key;
      paintSelection();
      if (focusRow && optionNodes[key]) optionNodes[key].focus();
    }

    function optionRow(key, title, subText, enabled, disabledNote) {
      var row = El("div", { role: "radio", tabindex: enabled ? "0" : "-1", "aria-checked": "false" }, [
        El("p", { className: "text-sm font-bold " + (enabled ? "text-tsts-ink" : "text-gray-400"), textContent: title }),
        El("p", { className: "text-xs " + (enabled ? "text-gray-600" : "text-gray-400"), textContent: enabled ? subText : disabledNote })
      ]);
      if (enabled) {
        optionNodes[key] = row;
        row.addEventListener("click", function () { selectKey(key, false); });
        row.addEventListener("keydown", function (ev) {
          if (!ev) return;
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectKey(key, false); }
          // WAI-ARIA radio pattern: arrows move the selection (sir's audit round).
          if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            var keys = Object.keys(optionNodes);
            var idx = keys.indexOf(selected);
            var next = ev.key === "ArrowDown" ? keys[(idx + 1) % keys.length] : keys[(idx - 1 + keys.length) % keys.length];
            selectKey(next, true);
          }
        });
      } else {
        row.className = "w-full text-left rounded-xl border border-gray-100 bg-gray-50 p-3 cursor-not-allowed";
        row.setAttribute("aria-disabled", "true");
      }
      return row;
    }

    var rows = [];
    rows.push(optionRow(
      "payout", "Use my payout balance",
      money(balance) + " available. " + money(remaining) + " is set aside from your next payout. No card charged.",
      covers,
      balanceUnknown
        ? "We couldn't check your payout balance just now. Card payment is available."
        : (balance > 0 ? (money(balance) + " available, not enough on its own.") : "No payout balance held yet.")
    ));
    if (partial) {
      rows.push(optionRow(
        "split", "Use balance + card",
        "Pay " + money(remaining - balance) + " by card; your " + money(balance) + " balance is set aside when the card payment completes.",
        true, ""
      ));
    }
    rows.push(optionRow(
      "card", "Pay by card",
      "Pay " + money(remaining) + " by card now." + (paidSoFar > 0 ? "" : " Your payout balance stays untouched."),
      true, ""
    ));

    var noteChildren = [];
    if (paidSoFar > 0) {
      noteChildren.push(El("p", { className: "text-xs text-gray-600", textContent: money(paidSoFar) + " of " + money(stageDue) + " is already covered, " + money(remaining) + " left to finish this payment." }));
    }
    if (o.hasPendingWaiver === true) {
      noteChildren.push(El("p", { className: "text-xs text-amber-800", textContent: "You have a fee-reduction request under review. Completing a payment withdraws it. Your written note is kept." }));
    }

    var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Cancel" });
    var confirmBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: "Fund " + money(remaining) });
    cancelBtn.addEventListener("click", function () { close(null); });
    confirmBtn.addEventListener("click", function () {
      // A held or reflexive Enter must never move money — the dialog ignores
      // activations in its first moments (sir's audit round).
      if (Date.now() - openedAt < 350) return;
      close(selected);
    });

    var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-md p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": "Fund the experience" }, [
      El("div", {}, [
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Fund the experience" }),
        El("p", { className: "text-sm text-gray-600 mt-1", textContent: (String(stage).toUpperCase() === "B" ? "Second payment" : "First payment") + " · " + money(remaining) })
      ]),
      El("div", { className: "space-y-2", role: "radiogroup", "aria-label": "How to fund" }, rows),
      (noteChildren.length > 0 ? El("div", { className: "space-y-1" }, noteChildren) : null),
      El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, confirmBtn])
    ]);
    var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" }, [panel]);
    overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    paintSelection();
    // Focus the SELECTED OPTION, not the confirm button — choosing is the first act.
    if (optionNodes[selected]) optionNodes[selected].focus();
    else cancelBtn.focus();
  });
}

async function __fundingFetchStatus(opts) {
  var options = opts && typeof opts === "object" ? opts : {};
  var query = new URLSearchParams();
  query.set("limit", String(options.limit || 150));
  if (options.slotId) query.set("slotId", String(options.slotId));
  var path = "/api/host/shortfall/status?" + query.toString();
  var res = await window.authFetch(path, { method: "GET" });
  var payload = await res.json().catch(function () { return {}; });
  if (!res.ok || !payload || payload.ok !== true) {
    var msg = String((payload && payload.message) || "We couldn't load your funding details. Please try refreshing.");
    throw new Error(msg);
  }
  var data = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
  var slots = Array.isArray(data.slots) ? data.slots : [];
  return { slots: slots, meta: data };
}

async function __fundingRequestWaiver(slotId) {
  if (!slotId) return;
  // Owner 2026-08-02 (sir): a real writing space — hosts explain in full sentences,
  // not a one-line box ("provide proper space to write a 250 words explanation").
  var note = await window.tstsPrompt("Reason for fee reduction request", "", { minLength: 10, multiline: true, placeholder: "Explain why you're requesting a fee reduction for this experience: what the costs are, what you've already covered, and what a fair fee looks like to you." });
  note = String(note || "").trim();
  if (!note) return;
  try {
    var res = await window.authFetch("/api/host/shortfall/" + encodeURIComponent(slotId) + "/waiver-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note })
    });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok || !payload || payload.ok !== true) throw new Error(String((payload && payload.message) || "We couldn't submit your request. Please try again."));
    window.tstsNotify("Your fee-reduction request was submitted and is under review. We'll email you the decision.", "success");
    await loadHostFundingSection();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "We couldn't submit your request. Please try again."), "error");
  }
}

function __ensureFundingPaymentModal() {
  var overlay = document.getElementById("funding-payment-overlay");
  if (overlay) {
    return {
      overlay: overlay,
      titleEl: document.getElementById("funding-payment-title"),
      metaEl: document.getElementById("funding-payment-meta"),
      elementMount: document.getElementById("funding-payment-element"),
      statusEl: document.getElementById("funding-payment-status"),
      closeBtn: document.getElementById("funding-payment-close"),
      submitBtn: document.getElementById("funding-payment-submit")
    };
  }
  var El = window.tstsEl;
  if (!El) return null;

  overlay = El("div", {
    id: "funding-payment-overlay",
    className: "fixed inset-0 z-[1000] hidden items-center justify-center bg-slate-900/50 px-4"
  });
  var card = El("div", { className: "w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4" });
  var header = El("div", { className: "flex items-start justify-between gap-3" }, [
    El("div", { className: "space-y-1" }, [
      El("h3", { id: "funding-payment-title", className: "text-lg font-bold text-slate-900", textContent: "Make your payment" }),
      El("p", { id: "funding-payment-meta", className: "text-xs text-slate-600", textContent: "" })
    ]),
    El("button", { id: "funding-payment-close", type: "button", className: "rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50", textContent: "Close" })
  ]);
  var mount = El("div", { id: "funding-payment-element", className: "rounded-xl border border-slate-200 p-3 bg-white" });
  var status = El("p", { id: "funding-payment-status", className: "text-xs text-slate-600", textContent: "Complete this payment to continue." });
  var actions = El("div", { className: "flex items-center justify-end gap-2" }, [
    El("button", { id: "funding-payment-submit", type: "button", className: "inline-flex items-center rounded-xl bg-tsts-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90", textContent: "Pay now" })
  ]);
  card.appendChild(header);
  card.appendChild(mount);
  card.appendChild(status);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return {
    overlay: overlay,
    titleEl: document.getElementById("funding-payment-title"),
    metaEl: document.getElementById("funding-payment-meta"),
    elementMount: document.getElementById("funding-payment-element"),
    statusEl: document.getElementById("funding-payment-status"),
    closeBtn: document.getElementById("funding-payment-close"),
    submitBtn: document.getElementById("funding-payment-submit")
  };
}

async function __fundingPollSlotUntilWebhook(slotId, stage) {
  var targetSlotId = String(slotId || "");
  var targetStage = String(stage || "").toUpperCase();
  for (var i = 0; i < 14; i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 2500); });
    var loaded = await __fundingLoadDashboard({ silent: true, slotId: targetSlotId });
    var slots = loaded && Array.isArray(loaded.slots) ? loaded.slots : __fundingSlotsCache;
    var current = null;
    for (var j = 0; j < slots.length; j++) {
      if (String(slots[j] && slots[j].slotId || "") === targetSlotId) { current = slots[j]; break; }
    }
    if (!current) continue;
    var stageAPaid = Number((current.stageA && current.stageA.remainingCents) || 0) <= 0;
    var stageBPaid = Number((current.stageB && current.stageB.remainingCents) || 0) <= 0;
    if (targetStage === "A" && stageAPaid) return true;
    if (targetStage === "B" && stageBPaid) return true;
    if (String(current.fundingStatus || "").toUpperCase() === "FULLY_FUNDED") return true;
  }
  return false;
}

async function __fundingOpenPaymentFlow(slot, stage, paymentData) {
  // Local harness (Stripe simulation): shortfall payments have no publishable key and are auto-completed
  // server-side via a simulated webhook — there is no real Stripe.js Payment Element to drive. Detect that
  // (localhost AND no publishable key) and treat the payment as submitted so the caller polls for the
  // sim-fired webhook. Guarded on hostname + missing key so PRODUCTION (real key + real Elements) is never
  // affected — a prod payment with a key still runs the full Elements flow below.
  var __isLocalSimPay = (function () {
    try {
      var h = String(location.hostname || "");
      var isLocal = (h === "localhost" || h === "127.0.0.1");
      // The in-memory Stripe sim mints PaymentIntents as "pi_sim_…", so its client_secret starts with
      // "pi_sim_". Real Stripe never does. Detect the sim by that prefix (localhost-guarded) rather than a
      // missing publishable key — the harness DOES set a test key, so the key check never fired and the flow
      // fell through to the real Elements path and threw.
      var cs = String((paymentData && paymentData.clientSecret) || "");
      var isSimSecret = cs.indexOf("pi_sim_") === 0;
      return isLocal && isSimSecret;
    } catch (_) { return false; }
  })();
  if (__isLocalSimPay) {
    // Owner 2026-07-24 (sir: "no payment no ----"): NEVER fake a paid state locally. Real card payment
    // runs through Stripe and can't happen against the in-memory sim, so surface that honestly and
    // return false (not submitted) — the caller then does nothing, and no stage is ever marked paid.
    try { if (window.tstsNotify) window.tstsNotify("Card payments run through Stripe and can't be completed in this local test environment. Nothing was charged and nothing is marked paid.", "info"); } catch (_) {}
    return false;
  }
  var modal = __ensureFundingPaymentModal();
  if (!modal) throw new Error("We couldn't open the payment window. Please refresh the page and try again.");
  var publishableKey = String((paymentData && paymentData.publishableKey) || "").trim();
  if (!publishableKey) throw new Error("We couldn't start the payment just now. Please try again in a moment, and tell us if it keeps happening.");
  if (!(window.Stripe && typeof window.Stripe === "function")) throw new Error("The payment window couldn't load. Check your connection, refresh the page, and try again.");
  var stripe = window.Stripe(publishableKey);
  if (!stripe) throw new Error("We couldn't open the payment window. Please refresh the page and try again.");

  var clientSecret = String((paymentData && paymentData.clientSecret) || "").trim();
  if (!clientSecret) throw new Error("We couldn't start the payment just now. Please try again in a moment, and tell us if it keeps happening.");

  modal.titleEl.textContent = "Make " + (String(stage || "").toUpperCase() === "A" ? "first" : "second") + " payment";
  modal.metaEl.textContent = String((slot && slot.experienceTitle) || "Experience") + " • " +
    String((slot && slot.bookingDate) || "") + " " + String((slot && slot.timeSlot) || "") + " • " +
    __fundingFormatCents(Number((paymentData && paymentData.amountCents) || 0));
  modal.statusEl.textContent = "Complete this payment to continue.";
  modal.overlay.classList.remove("hidden");
  modal.overlay.classList.add("flex");

  var elements = stripe.elements({ clientSecret: clientSecret });
  var paymentElement = elements.create("payment");
  modal.elementMount.textContent = "";
  paymentElement.mount(modal.elementMount);

  var closed = false;
  function closeModal() {
    if (closed) return;
    closed = true;
    try { paymentElement.unmount(); } catch (_) {}
    modal.overlay.classList.add("hidden");
    modal.overlay.classList.remove("flex");
    modal.elementMount.textContent = "";
    modal.statusEl.textContent = "";
    modal.submitBtn.disabled = false;
  }

  return await new Promise(function (resolve) {
    modal.closeBtn.onclick = function () {
      closeModal();
      resolve(false);
    };
    modal.submitBtn.disabled = false;
    modal.submitBtn.onclick = async function () {
      modal.submitBtn.disabled = true;
      modal.statusEl.textContent = "Processing your payment…";
      var result = await stripe.confirmPayment({
        elements: elements,
        redirect: "if_required"
      });
      if (result && result.error) {
        modal.statusEl.textContent = String(result.error.message || "Payment didn't go through. Please try again.");
        modal.submitBtn.disabled = false;
        return;
      }
      modal.statusEl.textContent = "Payment submitted, confirming. This may take a moment.";
      resolve(true);
      closeModal();
    };
  });
}

async function __fundingLoadDashboard(opts) {
  var options = (opts && typeof opts === "object") ? opts : {};
  var reqId = ++__fundingRequestCounter;
  if (!options.silent) {
    hostDashboardState.funding = { status: "loading", slots: [], message: "" };
    renderHostingDashboard();
  }
  try {
    var loaded = await __fundingFetchStatus({ limit: 150, slotId: options.slotId || "" });
    if (reqId !== __fundingRequestCounter) return loaded;
    var slots = Array.isArray(loaded.slots) ? loaded.slots : [];
    __fundingSlotsCache = slots;
    hostDashboardState.funding = { status: "ready", slots: slots, message: "" };
    if (!options.silent) renderHostingDashboard();
    return loaded;
  } catch (err) {
    if (reqId !== __fundingRequestCounter) return { slots: [] };
    hostDashboardState.funding = { status: "error", slots: [], message: String((err && err.message) || "We couldn't load your funding details. Please try refreshing.") };
    if (!options.silent) renderHostingDashboard();
    return { slots: [] };
  }
}

async function loadHostFundingSection() {
  await __fundingLoadDashboard({ silent: false });
}

function renderHostFundingSection(slots) {
  var El = window.tstsEl;
  var list = Array.isArray(slots) ? slots : [];

  if (list.length === 0) {
    return El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
      El("div", { className: "text-5xl mb-4 text-emerald-500" }, [El("i", { className: "fa-solid fa-circle-check" })]),
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "No funding required" }),
      El("p", { className: "text-slate-500", textContent: "None of your experiences currently require additional funding." })
    ]);
  }

  // Owner 2026-07-24 (sir: "in line with other tabs locked by me"): Funding had no section heading — added the
  // locked-tab heading pattern (heading-serif + text-tsts-ink); the existing approved explainer is the subline.
  var section = El("div", { className: "space-y-4" }, [
    El("div", { className: "space-y-0.5" }, [
      El("h2", { className: "heading-serif text-2xl font-bold text-tsts-ink", textContent: "Funding" }),
      El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: "Some experiences cost more to run than a single guest's price covers. You pre-pay the table's shortfall in two payments; after the event you're refunded for any seats that stayed empty, so you only end up covering the shortfall on the seats that actually filled." })
    ])
  ]);

  for (var i = 0; i < list.length; i++) {
    var slot = list[i] && typeof list[i] === "object" ? list[i] : {};
    var uiState = __fundingEffectiveUiState(slot);
    var approvalState = String(slot.approvalState || "NONE").toUpperCase();
    var fundingState = String(slot.fundingStatus || "NONE").toUpperCase();
    var nextStage = __fundingNextStage(slot);

    // Money figures — computed up-front so the status pill + actions can react to a FULL WAIVER.
    var __perSeat = Number(slot.shortfallPerSeatSnapshotCents || 0);
    var __cap = Number(slot.capacityTotalSnapshot || 0);
    var __booked = Number(slot.bookedSeats || 0);
    var __threshold = Number(slot.thresholdSeatsSnapshot || 0);
    var __aDue = Number((slot.stageA && slot.stageA.dueCents) || 0);
    var __aPaid = Number((slot.stageA && slot.stageA.paidCents) || 0);
    var __bDue = Number((slot.stageB && slot.stageB.dueCents) || 0);
    var __bPaid = Number((slot.stageB && slot.stageB.paidCents) || 0);
    var __totalDue = __aDue + __bDue;
    var __M = __fundingFormatCents;
    var __wStatus = String((slot.waiver && slot.waiver.status) || "none");
    // Owner 2026-07-24 (sir): fully waived = nothing left to pay. Then there is no agree/pay action and
    // nothing to be refunded — the card must read as settled, not "Action needed".
    var __fullyWaived = (__wStatus === "approved_full") || (__totalDue <= 0);

    // Readable date (15 Aug 2026) + 12h time, matching every other Hosted tab.
    var __fDate = String(slot.bookingDate || "");
    try { if (__fDate && window.tstsFormatDateShort) __fDate = String(window.tstsFormatDateShort(__fDate) || __fDate); } catch (_fe) { void _fe; }
    var __fTime = slot.timeSlot ? __formatPrivateRequestTimeRange12h(String(slot.timeSlot)) : "";
    // ONE clear status pill. "Payment processing" reflects an in-flight payment THIS session only (the
    // client sets) — never the persisted slot.paymentUiState, which can linger after a stage settles.
    var __slotIdForPill = String(slot.slotId || "");
    var __statusText, __statusClass;
    if (__fundingPaymentInFlight.has(__slotIdForPill) || __fundingPaymentPendingWebhook.has(__slotIdForPill)) {
      __statusText = "Payment processing"; __statusClass = "bg-amber-100 text-amber-700";
    } else if (__fullyWaived) {
      __statusText = "Fully waived"; __statusClass = "bg-emerald-100 text-emerald-700";
    } else if (slot.hostConfirmed !== true) {
      __statusText = "Action needed"; __statusClass = "bg-amber-100 text-amber-700";
    } else {
      __statusText = __fundingStateLabel(fundingState); __statusClass = __fundingBadgeClass(fundingState);
    }
    var header = El("div", { className: "flex flex-wrap items-start justify-between gap-2" }, [
      El("div", { className: "min-w-0" }, [
        El("h4", { className: "heading-serif font-bold text-lg text-tsts-ink", textContent: String(slot.experienceTitle || "Experience") }),
        El("p", { className: "text-sm text-gray-500 mt-0.5", textContent: __fDate + (__fTime ? " · " + __fTime : "") })
      ]),
      El("span", { className: "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full " + __statusClass, textContent: __statusText })
    ]);

    // One payment row — left-aligned (sir: never right-aligned). A numbered step badge (1 / 2) that
    // becomes a green ✓ once paid. Text-based, so it always renders (fa-regular isn't loaded here).
    function __fundPayRow(num, label, dueC, paidC, subWhenUnpaid) {
      var isPaid = dueC > 0 && paidC >= dueC;
      var isPartial = !isPaid && paidC > 0 && paidC < dueC;
      var badge = isPaid
        ? El("span", { className: "inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold shrink-0 mt-0.5", textContent: "✓" })
        : El("span", { className: "inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold shrink-0 mt-0.5", textContent: String(num) });
      // Owner 2026-08-02 (sir's audit round): a part-paid stage says exactly where it
      // stands — never the misleading full-amount "due now". sir 2026-08-17 (em-dash sweep,
      // "Words" ruling): the sub joins with a comma, the label carries "of".
      var sub = isPaid ? "Paid" : (isPartial ? (__M(paidC) + " already covered, " + __M(dueC - paidC) + " left") : subWhenUnpaid);
      return El("div", { className: "flex items-start gap-2.5" }, [
        badge,
        El("p", { className: "text-sm text-tsts-ink" }, [
          El("span", { className: "font-semibold", textContent: label + " of " + __M(dueC) }),
          El("span", { className: "text-gray-500", textContent: sub ? " · " + sub : "" })
        ])
      ]);
    }

    // Funding progress figures.
    var __totalPaid = __aPaid + __bPaid;
    var __fundedPct = __totalDue > 0 ? Math.max(0, Math.min(100, Math.round((__totalPaid / __totalDue) * 100))) : 0;

    // After the event — accurate. Only a real settlement shows a definite figure; before that we explain the
    // model, NEVER a "refund" number while the host has funded nothing (the seat count is a stat tile above).
    var __settled = !!(slot.settlement && slot.settlement.caseId);
    var afterEventNode;
    if (__fullyWaived) {
      afterEventNode = El("p", { className: "text-sm text-gray-600", textContent: "Fully waived. Nothing to pay or be refunded." });
    } else if (__settled) {
      var __netRefund = Number(slot.settlement && slot.settlement.netRefundCents || 0);
      afterEventNode = El("p", { className: "text-sm text-gray-600" }, [
        El("span", { textContent: "Settled. You were refunded " }),
        El("span", { className: "font-semibold text-tsts-ink", textContent: __M(__netRefund) }),
        El("span", { textContent: " for the seats that stayed empty." })
      ]);
    } else {
      afterEventNode = El("p", { className: "text-sm text-gray-600", textContent:
        "You're refunded " + __M(__perSeat) + " for each seat that stays empty (less a 5% processing fee), so you only cover the seats that fill."
      });
    }

    // Uppercase section label — matches the Overview "Action items" / "At a glance" headings.
    function __fundLabel(t) { return El("p", { className: "text-xs font-bold uppercase tracking-wide text-gray-500 mb-2", textContent: t }); }
    // Borderless stat column — matches the Earnings tab's per-currency stat columns (no boxy grey panels).
    function __fundStat(label, value) {
      return El("div", {}, [
        El("span", { className: "text-xs text-gray-500 block", textContent: label }),
        El("span", { className: "text-base font-bold text-tsts-ink block mt-0.5", textContent: value })
      ]);
    }
    // Funding progress bar (funded / total).
    var __barFill = El("div", { className: "h-2 rounded-full bg-emerald-500" });
    __barFill.style.width = __fundedPct + "%";
    var __progressBar = El("div", { className: "h-2 w-full rounded-full bg-gray-100 overflow-hidden" }, [__barFill]);

    var __moneyChildren = [
      El("div", {}, [
        __fundLabel("The table"),
        // sir 2026-08-16 ("right and left side edge alignement"): the stat trio distributes
        // across the card's full width, same as the bookings cards.
        El("div", { className: "flex flex-wrap justify-between gap-8" }, [
          __fundStat("Shortfall per seat", __M(__perSeat)),
          __fundStat("Seats booked", __booked + " of " + __cap),
          __fundStat("Total to pre-fund", __M(__totalDue))
        ])
      ])
    ];
    // "Your funding" (progress + the two payments) is only meaningful when there IS something to fund.
    // A full waiver zeroes the table, so this section is dropped and the card reads clean.
    if (!__fullyWaived) {
      __moneyChildren.push(El("div", {}, [
        __fundLabel("Your funding"),
        El("div", { className: "space-y-1.5" }, [
          El("p", { className: "text-sm text-tsts-ink" }, [
            El("span", { className: "font-semibold", textContent: __M(__totalPaid) + " funded" }),
            El("span", { className: "text-gray-500", textContent: " of " + __M(__totalDue) })
          ]),
          __progressBar
        ]),
        El("div", { className: "space-y-2 pt-3" }, [
          __fundPayRow(1, "First payment", __aDue, __aPaid, "due now"),
          __fundPayRow(2, "Second payment", __bDue, __bPaid, "unlocks at " + __threshold + " seat" + (__threshold === 1 ? "" : "s") + " booked")
        ])
      ]));
    }
    __moneyChildren.push(El("div", {}, [
      __fundLabel("After the event"),
      afterEventNode
    ]));
    var moneyBody = El("div", { className: "space-y-5" }, __moneyChildren);

    var actions = El("div", { className: "flex flex-wrap items-center gap-2 pt-1" });
    // Owner 2026-07-24 (sir): ONE-STEP funding, payout-deduction-FIRST. A single button per actionable stage:
    // "Recover A$X from your next payout" when the host has enough held payout (no card — completes here), else
    // "Pay A$X by card". Absorbs the old separate "Agree to payment terms" step. Funding also withdraws a
    // pending fee-reduction request, so double-confirm first if one is under review.
    if (approvalState === "APPROVED" && !__fullyWaived && nextStage) {
      var __fundSlotId = String(slot.slotId || "");
      var __stageRemaining = Number((((nextStage === "A") ? slot.stageA : slot.stageB) || {}).remainingCents || 0);
      // Owner 2026-08-02 (sir): the button is simply "Fund the experience" — the method
      // choice (payout balance / balance + card / card) lives in the modal, and money
      // moves only after that explicit choice. Supersedes the 2026-07-24 one-step design.
      var __fundBtnLabel = "Fund the experience";
      var __fundHasPendingWaiver = String((slot.waiver && slot.waiver.status) || "none") === "pending";
      var fundBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: __fundBtnLabel });
      if (__fundingPaymentInFlight.has(__fundSlotId)) {
        fundBtn.disabled = true; fundBtn.classList.add("opacity-60"); fundBtn.textContent = "Processing…";
      }
      fundBtn.addEventListener("click", (function (slotCopy, stageCopy, hasPendingWaiver) {
        return async function () {
          var slotIdLocal = String((slotCopy && slotCopy.slotId) || "");
          if (hasPendingWaiver) {
            var okWithdraw = window.tstsConfirm
              ? await window.tstsConfirm("You have a fee-reduction request under review. Funding this now withdraws that request. The admin won't review it.", { confirmText: "Fund anyway", cancelText: "Keep waiting" })
              : true;
            if (!okWithdraw) return;
          }
          // Owner 2026-08-02 (sir's audit round): the modal shows FRESH figures fetched
          // at open, and the request carries the figures the host consented to — the
          // server refuses on drift, so amounts the host never saw can never execute.
          var freshSlot = slotCopy;
          try {
            var freshStatus = await __fundingFetchStatus({ slotId: slotIdLocal, limit: 5 });
            var freshMatch = (freshStatus.slots || []).find(function (s) { return String(s.slotId || "") === slotIdLocal; });
            if (freshMatch) freshSlot = freshMatch;
          } catch (freshErr) {
            void freshErr; // the modal still opens on render-time figures; the server's consent check protects execution
          }
          var stageFacts = ((stageCopy === "A") ? freshSlot.stageA : freshSlot.stageB) || {};
          var remainingLocal = Number(stageFacts.remainingCents || 0);
          var covRawLocal = freshSlot.payoutCoverage ? freshSlot.payoutCoverage.availableCents : 0;
          var balanceLocal = (covRawLocal == null) ? null : Math.max(0, Number(covRawLocal) || 0);
          var chosenMethod = await __fundingChooseMethod(stageCopy, remainingLocal, balanceLocal, {
            stageDueCents: Number(stageFacts.dueCents || 0),
            hasPendingWaiver: String(((freshSlot.waiver || {}).status) || "none") === "pending"
          });
          if (!chosenMethod) return;
          var expectedBody = { slotId: slotIdLocal, stage: stageCopy, method: chosenMethod };
          if (chosenMethod === "payout") { expectedBody.expectedDeductedCents = remainingLocal; }
          if (chosenMethod === "card") { expectedBody.expectedCardCents = remainingLocal; }
          if (chosenMethod === "split") {
            expectedBody.expectedDeductedCents = Math.max(0, Number(balanceLocal) || 0);
            expectedBody.expectedCardCents = remainingLocal - Math.max(0, Number(balanceLocal) || 0);
          }
          try {
            __fundingPaymentInFlight.add(slotIdLocal);
            renderHostingDashboard();
            var res = await window.authFetch("/api/host/shortfall/fund", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(expectedBody)
            });
            var payload = await res.json().catch(function () { return {}; });
            if (res.status === 409 && payload && payload.error === "SHORTFALL_FIGURES_CHANGED") {
              window.tstsNotify("The amounts changed since this page loaded. Showing the fresh figures.", "warning");
              return;
            }
            if (!res.ok || !payload || payload.ok !== true) throw new Error(String((payload && payload.message) || "Could not fund this stage. Please try again."));
            var data = payload.data || {};
            if (data.method === "payout_deduction") {
              window.tstsNotify("Funded from your payout balance. No card charged.", "success");
            } else {
              if (data.method === "split") {
                // HONEST copy (sir's audit round): nothing has moved yet — both parts
                // land together when the card payment completes.
                window.tstsNotify("Now pay " + __fundingFormatCents(Number(data.cardAmountCents || 0)) + " by card. Your " + __fundingFormatCents(Number(data.plannedDeductCents || 0)) + " balance is set aside when the payment completes.", "info");
              }
              // CARD path: run the existing Stripe flow (pay-intent → modal → poll).
              var piRes = await window.authFetch("/api/host/shortfall/pay-intent", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slotId: slotIdLocal, stage: stageCopy })
              });
              var piPayload = await piRes.json().catch(function () { return {}; });
              if (!piRes.ok || !piPayload || piPayload.ok !== true) throw new Error(String((piPayload && piPayload.message) || "Could not initialize payment."));
              var submitted = await __fundingOpenPaymentFlow(slotCopy, stageCopy, piPayload.data || {});
              if (submitted) {
                __fundingPaymentPendingWebhook.add(slotIdLocal);
                renderHostingDashboard();
                var applied = await __fundingPollSlotUntilWebhook(slotIdLocal, stageCopy);
                if (applied) window.tstsNotify("Payment confirmed.", "success");
                else window.tstsNotify("Payment submitted. Confirmation may take a moment, try refreshing shortly.", "warning");
              }
            }
          } catch (err) {
            window.tstsNotify(String((err && err.message) || "That didn't go through. Please try again."), "error");
          } finally {
            __fundingPaymentInFlight.delete(slotIdLocal);
            __fundingPaymentPendingWebhook.delete(slotIdLocal);
            try {
              var __fundFresh = await __fundingFetchStatus({ limit: 150 });
              __fundingSlotsCache = Array.isArray(__fundFresh.slots) ? __fundFresh.slots : [];
              hostDashboardState.funding = { status: "ready", slots: __fundingSlotsCache, message: "" };
            } catch (_ffErr) { void _ffErr; }
            renderHostingDashboard();
          }
        };
      })(slot, nextStage, __fundHasPendingWaiver));
      actions.appendChild(fundBtn);
    }
    // Waiver section
    var waiver = (slot && slot.waiver && typeof slot.waiver === "object") ? slot.waiver : {};
    var waiverStatus = String(waiver.status || "none");
    var stageADue = Number((slot.stageA && slot.stageA.dueCents) || 0);
    var stageAPaid = Number((slot.stageA && slot.stageA.paidCents) || 0);
    // Owner 2026-07-24 (sir): a fee reduction can only be asked BEFORE agreeing to the terms. Once the host
    // has agreed (hostConfirmed), they've accepted the full shortfall, so the request button no longer
    // reappears — this closes the agree → re-request → pay loop that could leave "paid + under review".
    var canRequestWaiver = approvalState === "APPROVED" && slot.hostConfirmed !== true && (waiverStatus === "none" || waiverStatus === "rejected") && stageAPaid < stageADue;
    if (canRequestWaiver) {
      var waiverRequestBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Request fee reduction" });
      waiverRequestBtn.addEventListener("click", (function (slotIdCopy) {
        return async function () { await __fundingRequestWaiver(slotIdCopy); };
      })(String(slot.slotId || "")));
      actions.appendChild(waiverRequestBtn);
    }
    // Owner 2026-07-24 (sir): the fee-reduction status is a STATUS, not a button — render it as a clean
    // note on its own line (colored dot + text), never as a pill sitting among the action buttons.
    var __waiverNote = null;
    if (waiverStatus === "pending") __waiverNote = { dot: "bg-amber-400", cls: "text-amber-700", text: "Fee-reduction request under review. We'll email you the decision." };
    else if (waiverStatus === "approved_full") __waiverNote = { dot: "bg-emerald-500", cls: "text-emerald-700", text: "Fee reduction approved. No additional payment needed." };
    else if (waiverStatus === "approved_partial") __waiverNote = { dot: "bg-emerald-500", cls: "text-emerald-700", text: "Partial reduction approved. A reduced amount applies." };
    else if (waiverStatus === "rejected") __waiverNote = { dot: "bg-gray-400", cls: "text-gray-600", text: "Fee-reduction request was not approved." };
    if (__waiverNote) {
      actions.appendChild(El("div", { className: "w-full flex items-center gap-2 text-sm mt-1 " + __waiverNote.cls }, [
        El("span", { className: "inline-block w-2 h-2 rounded-full " + __waiverNote.dot }),
        El("span", { textContent: __waiverNote.text })
      ]));
    }

    if (actions.childNodes.length === 0) {
      actions.appendChild(El("p", { className: "text-sm text-gray-500", textContent: "Nothing for you to do right now." }));
    }

    var card = El("article", { className: "bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4" }, [
      header,
      moneyBody,
      El("div", { className: "border-t border-gray-100" }),
      actions
    ]);
    section.appendChild(card);
  }

  return section;
}

async function loadHost(sectionOverride, loadToken) {
  const token = Number.isFinite(Number(loadToken)) ? Number(loadToken) : nextDashboardLoadToken("hosting");
  if (!isDashboardLoadActive("hosting", token)) return;

  const sessionSnapshot = await getSessionSnapshot();
  if (!sessionSnapshot.ok) {
    if (sessionSnapshot.reason === "AUTH_REQUIRED") {
      redirectToLogin();
      return;
    }
    if (!isDashboardLoadActive("hosting", token)) return;
    const sessionMsg = "Unable to verify your session. Please refresh and try again.";
    hostDashboardState.section = resolveHostingSection(sectionOverride || hostDashboardState.section || dashboardDeepLink.section, dashboardDeepLink.panel);
    hostDashboardState.listings = { status: "error", items: [], summary: null, warnings: [], message: sessionMsg };
    hostDashboardState.bookings = { status: "error", rows: [], message: sessionMsg };
    hostDashboardState.privateRequests = { status: "error", rows: [], message: sessionMsg };
    hostDashboardState.verification = { status: "error", data: null, message: sessionMsg };
    hostBookingsCache = [];
    renderHostingDashboard();
    return;
  }
  if (!isDashboardLoadActive("hosting", token)) return;

  const viewer = (sessionSnapshot.session && sessionSnapshot.session.user) ? sessionSnapshot.session.user : {};
  if (!userHasHostAccess(viewer)) {
    const hostRequiredMsg = "Publish your first experience and your hosting tools open up here.";
    hostDashboardState.section = resolveHostingSection(sectionOverride || hostDashboardState.section || dashboardDeepLink.section, dashboardDeepLink.panel);
    hostDashboardState.listings = { status: "error", items: [], summary: null, warnings: [], message: hostRequiredMsg };
    hostDashboardState.bookings = { status: "error", rows: [], message: hostRequiredMsg };
    hostDashboardState.privateRequests = { status: "error", rows: [], message: hostRequiredMsg };
    hostDashboardState.verification = { status: "error", data: null, message: hostRequiredMsg };
    hostBookingsCache = [];
    renderHostingDashboard();
    syncDashboardTabQuery("hosting", hostDashboardState.section);
    focusDashboardDeepLinkPanel();
    return;
  }

  hostDashboardState.section = resolveHostingSection(sectionOverride || hostDashboardState.section || dashboardDeepLink.section, dashboardDeepLink.panel);
  hostDashboardState.listings = { status: "loading", items: [], summary: null, warnings: [], message: "" };
  hostDashboardState.bookings = { status: "loading", rows: [], message: "" };
  hostDashboardState.privateRequests = { status: "loading", rows: [], message: "" };
  hostDashboardState.verification = { status: "loading", data: null, message: "" };
  renderHostingDashboard();
  syncDashboardTabQuery("hosting", hostDashboardState.section);

  try {
    const [listingsState, bookingsState, privateRequestsState, verificationState, fundingResult] = await Promise.all([
      fetchHostListingsSource(),
      fetchHostBookingsSource(),
      fetchHostPrivateRequestsSource(),
      fetchHostVerificationSource(),
      // Owner 2026-07-23: eager-load funding/shortfall here so the needs-attention badge always counts a
      // shortfall and stays STABLE across every sub-tab (funding otherwise lazy-loads only on Overview/
      // Funding, so navigating to Bookings dropped the shortfall from the badge = a 6↔5 flicker). Never
      // blocks the load — on error it resolves to null and the Funding tab lazy-loads with its own error UI.
      __fundingFetchStatus({ limit: 150 }).then(function (r) { return { slots: (r && Array.isArray(r.slots)) ? r.slots : [] }; }).catch(function () { return null; })
    ]);
    if (!isDashboardLoadActive("hosting", token)) return;

    hostDashboardState.listings = listingsState;
    hostDashboardState.bookings = bookingsState;
    hostDashboardState.privateRequests = privateRequestsState;
    hostDashboardState.verification = verificationState;
    if (fundingResult) { __fundingSlotsCache = fundingResult.slots; hostDashboardState.funding = { status: "ready", slots: fundingResult.slots, message: "" }; }
    hostBookingsCache = (bookingsState.status === "ready" && Array.isArray(bookingsState.rows)) ? bookingsState.rows : [];
    // Owner 2026-08-05 (sir: "Remove it now"): the tab count is GONE. It said "ten of something across
    // eight sections" and named nothing — the same fault that retired the section-pill counts. sir's
    // ACTION ITEMS on Overview already name every obligation in plain English, and notifications (the
    // next build after P6) will name each item and link straight to it. Do NOT reinstate a tab count.

    renderHostingDashboard();
    focusDashboardDeepLinkPanel();
  } catch (_) {
    if (!isDashboardLoadActive("hosting", token)) return;
    const failMsg = "Failed to load hosting data.";
    hostDashboardState.listings = { status: "error", items: [], summary: null, warnings: [], message: failMsg };
    hostDashboardState.bookings = { status: "error", rows: [], message: failMsg };
    hostDashboardState.privateRequests = { status: "error", rows: [], message: failMsg };
    hostDashboardState.verification = { status: "error", data: null, message: failMsg };
    hostBookingsCache = [];
    renderHostingDashboard();
  }
}

/* ====================== GUEST MODAL ====================== */

// Owner 2026-07-23 (sir: "what the ---- is abandoned... proper row of data, not a para"): returns the
// booking's money/state facts as PLAIN-ENGLISH values for the Booking Details ROWS — zero dev jargon
// ("abandoned", raw enums, misleading A$0 payouts). { tone (status colour), status, payment, payout }.
function __hostBookingStory(b) {
  var lc = function (v) { return String(v || "").toLowerCase(); };
  var status = lc(b && b.status);
  var pay = lc(b && b.paymentStatus);
  var ccy = String((b && b.currency) || "aud");
  var paidCents = Number((b && b.amountCents != null) ? b.amountCents : ((b && b.pricingSnapshot && b.pricingSnapshot.totalCents != null) ? b.pricingSnapshot.totalCents : NaN));
  var money = Number.isFinite(paidCents) ? centsToMoney(paidCents, ccy) : "";
  var feeCents = (Number(b && b.platformFeeAmountCents) > 0) ? Number(b.platformFeeAmountCents) : (Number.isFinite(paidCents) ? Math.round(paidCents * 0.10) : 0);
  var netCents = Number((b && b.payoutNetHostCents != null && b.payoutNetHostCents > 0) ? b.payoutNetHostCents : (Number.isFinite(paidCents) && paidCents > 0 ? Math.max(0, paidCents - feeCents) : NaN));
  var isPaidOut = lc(b && b.payoutStatus) === "released";
  var refundCents = Number((b && b.refundDecision && b.refundDecision.amountCents) || (b && b.refundAmountCents) || (b && b.totalRefundedCents) || 0);
  // GAP 31 (sir's order O-128, 2026-09-15): who cancelled a seat is read off the booking's own
  // cancellation record, not guessed from two timestamps. A seat cancelled because our team
  // removed the listing writes neither hostCancelledAt nor guestCancelledAt, so it used to fall
  // through to the never-completed branch below and tell the host the guest had failed to pay,
  // blaming a guest for something the platform did.
  var cancelBy = String((b && b.cancellation && b.cancellation.by) || "").toLowerCase();
  var byHost = !!(b && b.hostCancelledAt) || cancelBy === "host";
  var byGuest = !!(b && b.guestCancelledAt) || cancelBy === "guest";
  var deadPay = (pay === "abandoned" || pay === "failed" || pay === "unpaid" || pay === "");
  var payoutRow = function (ctx) {
    if (!(money && Number.isFinite(netCents))) return "";
    return centsToMoney(netCents, ccy) + " (after " + centsToMoney(feeCents, ccy) + " fee), " + ctx;
  };

  // A cancelled seat that carries a record of who cancelled it, WHOEVER that was. This has to be
  // read BEFORE the branches below, because those decide everything from a status word and two
  // timestamps and get all three actors wrong in turn: a seat an administrator cancelled writes
  // neither timestamp and read "Not completed / No charge (the guest didn't finish paying)", which
  // is untrue twice over; a host-cancelled seat lands on no branch at all and read a bare
  // "Cancelled by host" beside a bare amount, with no hint of whether the guest's money ever went
  // back; and a private booking request the HOST declined read "Not completed / No charge (the
  // guest didn't finish paying)" on the host's own screen, blaming the guest for the host's own
  // decision. The record is the only thing that knows, and now every actor is read from it.
  // "refunded" is here for the same reason: the platform's own state machine moves a cancelled
  // seat to "refunded" when the card provider confirms the money is back, and the seat used to
  // lose its whole story at that moment and fall to the plain fallback.
  if ((cancelBy === "admin" || cancelBy === "host" || cancelBy === "guest")
      && (status === "cancelled" || status === "cancelled_by_host" || status === "refunded")) {
    // The money row is gated on deadPay, the SAME dead-payment signal the never-completed branch
    // below uses, and never on the refund figure alone. A paid seat whose refund FAILED keeps
    // refundDecision.amountCents at 0 (grep `status: "refund_failed"` in the backend), so reading
    // only the figure told the host "No charge (the guest had not paid yet)" about a guest who had
    // paid in full and was still waiting for the money to come back.
    // The one sentence that is NOT the same for all three actors is the zero-refund one. When a
    // HOST or our own team cancels, the policy is a full refund, so nothing back means the money
    // has not reached the guest yet. When the GUEST cancels, the tiered policy can legitimately
    // return nothing, so that is what it says, unless the refund is recorded as having failed.
    var whoRow = (cancelBy === "admin") ? "Cancelled by our team" : ((cancelBy === "host") ? "Cancelled by you" : "Cancelled by the guest");
    var refundFailed = String((b && b.refundDecision && b.refundDecision.status) || "").toLowerCase() === "refund_failed";
    var cancelPayRow;
    if (refundCents > 0) cancelPayRow = "Refunded " + centsToMoney(refundCents, ccy) + " to the guest";
    else if (status === "refunded") cancelPayRow = "Refunded to the guest";
    else if (deadPay) cancelPayRow = "No charge (the guest had not paid yet)";
    else if (cancelBy === "guest" && !refundFailed) cancelPayRow = "No refund (per the cancellation policy)";
    else cancelPayRow = (money ? (money + " paid, the refund has not reached the guest yet") : "Paid, the refund has not reached the guest yet");
    return {
      tone: "#E11D48",
      status: whoRow,
      payment: cancelPayRow,
      payout: ""
    };
  }

  // Never completed: the guest didn't finish paying, so it never became a booking. A seat that
  // carries a cancellation record was cancelled by somebody and is never described this way.
  if ((status === "cancelled" && deadPay && !cancelBy && !(refundCents > 0)) || ((status === "expired" || status === "declined" || status === "rejected") && deadPay)) {
    return { tone: "#6B7280", status: "Not completed", payment: "No charge (the guest didn't finish paying)", payout: "" };
  }
  // Cancelled — a real booking that was later cancelled (show the refund).
  if (status === "cancelled") {
    var refundLine = (refundCents > 0) ? ("Refunded " + centsToMoney(refundCents, ccy) + " to the guest") : "No refund (per the cancellation policy)";
    return { tone: "#E11D48", status: "Cancelled" + (byHost ? " by you" : (byGuest ? " by the guest" : "")), payment: refundLine, payout: "" };
  }
  // Awaiting confirmation — payment authorized (held on the card), not yet captured.
  if (status === "authorized" || (pay === "authorized" && status !== "confirmed" && status !== "completed")) {
    return { tone: "#D97706", status: "Awaiting confirmation", payment: (money ? (money + " held, not yet charged") : "Payment authorized, held on the card"), payout: "" };
  }
  // Completed — the event has taken place.
  if (status === "completed") {
    return { tone: "#059669", status: "Completed", payment: (money ? (money + " paid") : ""), payout: payoutRow(isPaidOut ? "released to you" : "released after settlement") };
  }
  // Confirmed — a live, paid booking.
  if (status === "confirmed" && pay === "paid") {
    return { tone: "#059669", status: "Confirmed", payment: (money ? (money + " paid") : ""), payout: payoutRow("held until after the event") };
  }
  // Fallback — friendly status + amount if the combination isn't mapped above.
  return { tone: "#475569", status: stateLabel(b && b.status) || "Booking", payment: (money || ""), payout: "" };
}

function openGuestModalById(bookingId) {
  const b = hostBookingsCache.find(x => (x._id || "") === bookingId);
  if (!b) return;

  const titleEl = document.getElementById("modal-experience-title");
  const listEl = document.getElementById("modal-guest-list");
  if (titleEl) titleEl.textContent = "Booking Details";

  const guest = b.guestId || b.user || {};
  const name = guest.name || b.guestName || "Guest";
  // O-141 (sir, 2026-09-16): "host doesn't see the direct mail ID or contact details but a button".
  // The guest's address is no longer read here, and the route behind this modal no longer sends it.
  // This supersedes the part of LOCK-012 that put the real address on this screen.
  if (!listEl) { _openModal(guestModal); return; }

  const El = window.tstsEl;
  listEl.textContent = "";

  var pax = Number(b.guests || b.numGuests || b.guestCount || 1);
  var bDate = "";
  try { if (b.bookingDate && window.tstsFormatDateShort) bDate = String(window.tstsFormatDateShort(b.bookingDate) || b.bookingDate); } catch (_bdErr) { bDate = String(b.bookingDate || ""); }
  var bTime = b.timeSlot ? __formatPrivateRequestTimeRange12h(String(b.timeSlot)) : "";
  var bTitle = sanitizeExperienceTitle((b.experience && b.experience.title) || b.title || b.experienceTitle || "");
  var bRef = String((b && b.bookingRef) || "");
  if (!bRef) { var __idStr = String((b && b._id) || ""); if (__idStr.length >= 8) { var __rt = __idStr.slice(-8).toUpperCase(); bRef = __rt.slice(0, 4) + "-" + __rt.slice(4); } }
  var story = __hostBookingStory(b);

  // Guest header: the name, and the guest's own initial in the same avatar sir approved. The line
  // that used to sit under it was the guest's email address; under O-141 nothing takes its place,
  // so the name stands alone and the avatar is centred against it rather than left hanging.
  listEl.appendChild(El("div", { className: "flex items-center gap-4" }, [
    El("div", { className: "bg-tsts-cream text-tsts-ink rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold shrink-0", textContent: ((name || "G").trim().charAt(0) || "G").toUpperCase() }),
    El("p", { className: "font-bold text-lg text-gray-900", textContent: name })
  ]));

  // Booking facts — clean LABEL / VALUE rows (sir: "proper row of data"), values in plain English.
  var __factRow = function (label, value, valueColor) {
    var valEl = El("span", { className: "text-sm font-semibold " + (valueColor ? "" : "text-gray-800"), textContent: value });
    if (valueColor) valEl.style.color = valueColor;
    return El("div", { className: "flex items-start gap-4 py-2.5" }, [
      El("span", { className: "text-sm text-gray-400 w-24 shrink-0 pt-0.5", textContent: label }),
      valEl
    ]);
  };
  var facts = El("div", { className: "bg-gray-50 rounded-lg border border-gray-100 mt-4 px-4 divide-y divide-gray-100" });
  if (bTitle) facts.appendChild(__factRow("Experience", bTitle));
  if (bDate) facts.appendChild(__factRow("Date", bDate + (bTime ? " · " + bTime : "")));
  facts.appendChild(__factRow("Party size", pax + (pax === 1 ? " guest" : " guests")));
  if (story.status) facts.appendChild(__factRow("Status", story.status, story.tone));
  if (story.payment) facts.appendChild(__factRow("Payment", story.payment));
  if (story.payout) facts.appendChild(__factRow("Your payout", story.payout));
  if (bRef) facts.appendChild(__factRow("Ref", bRef));
  listEl.appendChild(facts);

  // O-141 (sir, 2026-09-16): in place of the address, ONE primary action — the platform's own
  // primary button, the same `tsts-btn-primary` this page's other single primary action wears. It
  // sits directly under the facts, where an action belongs, and above the guest's note. The server
  // decides whether it belongs here at all (the seat is paid for, neither account is closed, the
  // pair is not blocked) and says so on the booking itself.
  if (b && b.messaging && b.messaging.available === true) {
    listEl.appendChild(El("div", { className: "mt-4" }, [
      __bookingMessageButton(String((b && b._id) || ""), "host", Number((b.messaging && b.messaging.messageCount) || 0))
    ]));
  }

  // Guest note — only if the guest left one.
  var noteText = String((b && b.guestNotes) || "").trim();
  if (noteText) {
    listEl.appendChild(El("div", { className: "bg-gray-50 p-4 rounded-lg border border-gray-100 mt-4" }, [
      El("p", { className: "text-gray-400 text-sm mb-1", textContent: "Guest note" }),
      El("p", { className: "italic text-gray-700 break-words text-sm", textContent: noteText })
    ]));
  }

  // Owner 2026-07-23 (sir: disputes must be actionable): if the booking is disputed, the host can add their
  // side here (POST /api/host/bookings/:id/dispute-response). Once submitted it shows back as "Your response".
  if (b && b.dispute && b.dispute.active === true) {
    // W7 STRAY-59: this line used to read the card provider's own raw word for why a chargeback
    // was raised ("fraudulent", "product_not_received", "subscription_canceled") and print it on a
    // host's screen exactly as stored. The server now sends the sentence the platform already
    // writes for that same word, the one its administrator alert letter uses, and that is what a
    // host reads. The raw word is used only if no sentence came with it, and even then it is
    // written as the plain phrase the platform's own map falls back to.
    var __dReasonLabel = String((b.dispute && b.dispute.reasonLabel) || "").trim();
    var __dReason = __dReasonLabel || (String((b.dispute && b.dispute.reason) || "").trim() ? "The guest's bank has raised a dispute on this payment." : "");
    var __dResp = String((b.dispute && b.dispute.hostResponse) || "").trim();
    var dWrap = El("div", { className: "mt-4 rounded-lg border border-red-200 bg-red-50 p-4 space-y-2" });
    // Once the host has answered, the heading must stop asking for what they already gave.
    dWrap.appendChild(El("p", { className: "font-bold text-red-700 text-sm", textContent: __dResp ? "Dispute · your response is with our team" : "Dispute · needs your response" }));
    if (__dReason) dWrap.appendChild(El("p", { className: "text-sm text-red-800", textContent: __dReason }));
    if (__dResp) {
      dWrap.appendChild(El("div", { className: "rounded-md bg-white border border-red-100 p-3" }, [
        El("p", { className: "text-gray-400 text-sm mb-1", textContent: "Your response" }),
        El("p", { className: "text-sm text-gray-700 whitespace-pre-line", textContent: __dResp })
      ]));
      dWrap.appendChild(El("p", { className: "text-sm text-red-800", textContent: "We will let you know by email once this is settled." }));
    } else {
      var dTa = El("textarea", { className: "w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none", rows: 3, placeholder: "Add your side: what happened, plus any evidence you have (times, photos, messages).", id: "dispute-response-input" });
      var dErr = El("p", { className: "text-sm text-rose-600 hidden" });
      var dBtn = El("button", { type: "button", className: "px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition", textContent: "Submit response" });
      dBtn.addEventListener("click", function () { handleHostDisputeResponse(String((b && b._id) || ""), dTa, dErr, dBtn); });
      dWrap.appendChild(dTa);
      dWrap.appendChild(dErr);
      dWrap.appendChild(dBtn);
    }
    listEl.appendChild(dWrap);
  }

  // Owner 2026-07-23 (sir: host must be able to cancel): a live CONFIRMED booking can be host-cancelled here.
  // The confirm spells out the money consequence (guest full refund + the live recovery percentage
  // read from the settlement policy, never a figure written into the sentence).
  if (String((b && b.status) || "").toLowerCase() === "confirmed") {
    var cancelBtn = El("button", { type: "button", className: "mt-4 w-full px-4 py-2 rounded-lg border border-red-100 text-red-600 text-sm font-semibold hover:bg-red-50 transition", textContent: "Cancel this booking" });
    cancelBtn.addEventListener("click", function () { handleHostCancelBooking(String((b && b._id) || "")); });
    listEl.appendChild(cancelBtn);
  }

  _openModal(guestModal);
}

// Owner 2026-07-23: host cancels a confirmed booking (full guest refund + a recovery charge on the
// host payout).
//
// 2026-08-21: this sentence stated "a 10% cancellation recovery" as a fixed number, while the charge
// actually reads an admin-editable PlatformConfig value. An admin who set it to 20% would leave hosts
// told 10% and charged 20% — a money misstatement at the exact moment the host decides. The live
// figure now comes from /api/host/settlement-policy, which already existed and had no callers. If it
// cannot be read, the sentence stops naming a figure rather than naming a possibly-wrong one.
async function __hostCancelRecoveryPercent() {
  try {
    var res = await window.authFetch("/api/host/settlement-policy", { method: "GET" });
    if (!res || !res.ok) return null;
    var payload = await res.json().catch(function () { return null; });
    var data = (payload && payload.data) ? payload.data : payload;
    var pct = Number(data && data.hostCancelRecoveryPercent);
    return (Number.isFinite(pct) && pct >= 0) ? pct : null;
  } catch (_polErr) { void _polErr; return null; }
}

async function handleHostCancelBooking(bookingId) {
  var id = String(bookingId || "").trim();
  if (!id) return;
  var pct = await __hostCancelRecoveryPercent();
  var recoveryPhrase = (pct === null)
    ? "a cancellation recovery charge will be taken from your next payout"
    : ("a " + (Math.round(pct * 10) / 10) + "% cancellation recovery will be taken from your next payout");
  var msg = "Cancel this booking? Your guest receives a full refund, and " + recoveryPhrase + ". This can't be undone.";
  var ok = window.tstsConfirm ? await window.tstsConfirm(msg) : window.confirm(msg);
  if (!ok) return;
  try {
    var res = await window.authFetch("/api/host/bookings/" + encodeURIComponent(id) + "/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "host_cancel" })
    });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) { if (window.tstsNotify) window.tstsNotify((raw && raw.message) ? String(raw.message) : "Couldn't cancel the booking.", "error"); return; }
    if (window.tstsNotify) window.tstsNotify("Booking cancelled. Your guest has been refunded in full.", "success");
    closeGuestModal();
    await loadHost();
  } catch (err) {
    if (window.tstsNotify) window.tstsNotify(String((err && err.message) || "Network error. Please try again."), "error");
  }
}

// Owner 2026-07-23: submit the host's response to an active dispute, then re-render the modal to show it.
async function handleHostDisputeResponse(bookingId, taEl, errEl, btnEl) {
  var text = String((taEl && taEl.value) || "").trim();
  if (errEl) errEl.classList.add("hidden");
  if (!text) { if (errEl) { errEl.textContent = "Please add your response before submitting."; errEl.classList.remove("hidden"); } if (taEl) taEl.focus(); return; }
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Submitting…"; }
  try {
    var res = await window.authFetch("/api/host/bookings/" + encodeURIComponent(bookingId) + "/dispute-response", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: text })
    });
    var raw = await res.json().catch(function () { return null; });
    if (!res.ok) {
      if (errEl) { errEl.textContent = (raw && raw.message) ? String(raw.message) : "Couldn't submit your response."; errEl.classList.remove("hidden"); }
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Submit response"; }
      return;
    }
    if (window.tstsNotify) window.tstsNotify("Your dispute response was submitted.", "success");
    try {
      var cb = hostBookingsCache.find(function (x) { return String(x._id || "") === String(bookingId); });
      if (cb && cb.dispute) { cb.dispute.hostResponse = text; }
    } catch (_e) { void _e; }
    openGuestModalById(bookingId); // re-render → now shows "Your response"
  } catch (err) {
    if (errEl) { errEl.textContent = String((err && err.message) || "Network error. Please try again."); errEl.classList.remove("hidden"); }
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Submit response"; }
  }
}

function closeGuestModal() {
  _closeModal(guestModal);
}

function closeReviewModal() {
  const bid = document.getElementById("review-booking-id");
  const eid = document.getElementById("review-exp-id");
  const ratingEl = document.getElementById("review-rating");
  const commentEl = document.getElementById("review-comment");
  if (bid) bid.value = "";
  if (eid) eid.value = "";
  if (reviewIdInput) reviewIdInput.value = "";
  if (ratingEl) ratingEl.value = "5";
  syncStars(5);
  if (starContainer) starContainer.classList.remove("pointer-events-none", "opacity-60");
  if (commentEl) {
    commentEl.value = "";
    commentEl.disabled = false;
  }
  reviewModalState.mode = "create";
  reviewModalState.reviewId = "";
  reviewModalState.canEdit = true;
  reviewModalState.editableUntil = null;
  if (reviewModalTitleEl) reviewModalTitleEl.textContent = "How was it?";
  if (reviewModalSubtitleEl) reviewModalSubtitleEl.textContent = "Share your experience with the community.";
  if (reviewSubmitBtn) {
    reviewSubmitBtn.textContent = "Post Review";
    reviewSubmitBtn.disabled = false;
    reviewSubmitBtn.classList.remove("opacity-60", "cursor-not-allowed");
  }
  if (reviewWindowHintEl) {
    reviewWindowHintEl.textContent = "";
    reviewWindowHintEl.classList.add("hidden");
  }
  var hostReplyContainer = document.getElementById("review-host-reply-container");
  if (hostReplyContainer) {
    hostReplyContainer.textContent = "";
    hostReplyContainer.classList.add("hidden");
  }
  _closeModal(reviewModal);
}

/* ====================== SHARE EXPERIENCE MODAL ====================== */

function openShareModal(expId, bookingDate, timeSlot, expTitle) {
  var El = window.tstsEl;
  // Remove existing share modal
  var existing = document.getElementById("tsts-share-modal");
  if (existing) existing.remove();

  var overlay = El("div", {
    id: "tsts-share-modal",
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40"
  });

  var modal = El("div", {
    className: "bg-white rounded-2xl shadow-lg w-full max-w-md mx-4 p-6 relative max-h-[90vh] overflow-y-auto"
  });

  // Title
  modal.appendChild(El("h2", {
    className: "text-lg font-bold text-tsts-ink heading-serif mb-4",
    textContent: "Share " + (expTitle || "Experience")
  }));

  // Close button
  var closeBtn = El("button", {
    className: "absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl",
    textContent: "\u00D7",
    "aria-label": "Close"
  });
  closeBtn.addEventListener("click", function () { overlay.remove(); });
  modal.appendChild(closeBtn);

  // --- Section 3: Get a Shareable Link (first because it's most useful) ---
  var linkSection = El("div", { className: "mb-5" });
  linkSection.appendChild(El("h3", { className: "text-sm font-bold text-tsts-ink mb-2", textContent: "Get a Shareable Link" }));

  var linkRow = El("div", { className: "flex gap-2 items-center" });
  var linkInput = El("input", {
    type: "text",
    className: "flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600",
    readOnly: true,
    value: "Generating link..."
  });
  linkRow.appendChild(linkInput);

  var copyBtn = El("button", {
    className: "px-3 py-2 bg-tsts-ink text-white text-sm rounded-lg hover:opacity-90 transition",
    textContent: "Copy",
    "data-action": "invite-copy-link",
    "data-invite-url": ""
  });
  linkRow.appendChild(copyBtn);

  if (navigator.share) {
    var nativeShareBtn = El("button", {
      className: "px-3 py-2 border border-tsts-ink text-tsts-ink text-sm rounded-lg hover:bg-tsts-ink hover:text-white transition",
      textContent: "Share",
      "data-action": "invite-native-share",
      "data-invite-url": "",
      "data-exp-title": expTitle || ""
    });
    linkRow.appendChild(nativeShareBtn);
  }

  linkSection.appendChild(linkRow);
  modal.appendChild(linkSection);

  // Generate invite link via API
  (async function () {
    try {
      var body = { experienceId: expId };
      if (bookingDate) body.bookingDate = bookingDate;
      if (timeSlot) body.timeSlot = timeSlot;
      var res = await window.authFetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      var raw = await res.json().catch(function () { return {}; });
      var d = (raw && raw.data) ? raw.data : raw;
      if (res.ok && d && d.inviteUrl) {
        linkInput.value = d.inviteUrl;
        copyBtn.setAttribute("data-invite-url", d.inviteUrl);
        if (nativeShareBtn) nativeShareBtn.setAttribute("data-invite-url", d.inviteUrl);
        window.tstsNotify("Experience shared!", "success");
      } else {
        linkInput.value = "Could not generate link.";
        var errMsg = (d && d.error) ? String(d.error) : "Failed";
        if (errMsg === "INVITE_LIMIT_REACHED") linkInput.value = "Invite limit reached (5 per hour).";
      }
    } catch (_) {
      linkInput.value = "Could not generate link.";
    }
  })();

  // --- Section 1: Invite Friend (connections) ---
  var friendSection = El("div", { className: "mb-5" });
  friendSection.appendChild(El("h3", { className: "text-sm font-bold text-tsts-ink mb-2", textContent: "Invite Friend" }));
  var friendList = El("div", { className: "space-y-2 max-h-40 overflow-y-auto" });
  friendSection.appendChild(friendList);
  modal.appendChild(friendSection);

  // Load connections
  (async function () {
    try {
      var res = await window.authFetch("/api/social/connections?status=accepted&limit=50", { method: "GET" });
      var raw = await res.json().catch(function () { return {}; });
      var connections = window.unwrapApiList ? window.unwrapApiList(raw, "connections") : (raw && raw.data && Array.isArray(raw.data.connections) ? raw.data.connections : []);
      if (!connections || connections.length === 0) {
        friendList.appendChild(El("p", { className: "text-sm text-slate-500", textContent: "You haven\u2019t connected with anyone yet. Search for a fellow traveller above, or connect after sharing an experience together." }));
        return;
      }
      connections.forEach(function (c) {
        // sir 2026-08-16 ("fix this"): the API nests the person under connection.user — reading the
        // top level rendered every row as "User" with no photo AND sent invites to the connection-row
        // id instead of the person's real user id.
        var person = (c && c.user) || c || {};
        var name = String(person.name || person.displayName || "User");
        var pic = String(person.profilePic || "");
        var userId = String(person._id || person.userId || c.userId || "");
        var row = El("div", { className: "flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50" });

        var avatar = El("img", { className: "w-8 h-8 rounded-full object-cover", alt: name });
        window.tstsSafeImg(avatar, pic, "/assets/avatar-default.svg");
        row.appendChild(avatar);

        row.appendChild(El("span", { className: "text-sm text-tsts-ink flex-1", textContent: name }));

        var inviteBtn = El("button", {
          className: "px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200 rounded-full hover:bg-amber-50 transition",
          textContent: "Invite"
        });
        inviteBtn.addEventListener("click", async function () {
          inviteBtn.disabled = true;
          inviteBtn.textContent = "Sending...";
          try {
            var body = { experienceId: expId, targetUserId: userId };
            if (bookingDate) body.bookingDate = bookingDate;
            if (timeSlot) body.timeSlot = timeSlot;
            var r = await window.authFetch("/api/invites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            if (r.ok) {
              inviteBtn.textContent = "Sent!";
              inviteBtn.className = "px-3 py-1 text-xs font-bold text-green-700 border border-green-200 rounded-full bg-green-50";
              window.tstsNotify("Experience shared!", "success");
            } else {
              var errRaw = await r.json().catch(function () { return {}; });
              var errCode = (errRaw && errRaw.error) ? String(errRaw.error) : "";
              if (errCode === "BLOCKED") {
                inviteBtn.textContent = "Blocked";
              } else if (errCode === "INVITE_LIMIT_REACHED") {
                inviteBtn.textContent = "Limit reached";
              } else {
                inviteBtn.textContent = "Failed";
              }
              inviteBtn.disabled = false;
            }
          } catch (_) {
            inviteBtn.textContent = "Failed";
            inviteBtn.disabled = false;
          }
        });
        row.appendChild(inviteBtn);
        friendList.appendChild(row);
      });
    } catch (_) {
      friendList.appendChild(El("p", { className: "text-sm text-gray-400 italic", textContent: "Could not load connections." }));
    }
  })();

  // --- Section 2: Find Someone ---
  var findSection = El("div", { className: "mb-4" });
  findSection.appendChild(El("h3", { className: "text-sm font-bold text-tsts-ink mb-2", textContent: "Find Someone" }));
  var findRow = El("div", { className: "flex gap-2" });
  var findInput = El("input", {
    type: "text",
    className: "flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2",
    placeholder: "Email or handle"
  });
  findRow.appendChild(findInput);
  var findBtn = El("button", { className: "px-4 py-2 bg-tsts-ink text-white text-sm rounded-lg hover:opacity-90 transition", textContent: "Search" });
  findRow.appendChild(findBtn);
  findSection.appendChild(findRow);
  var findResult = El("div", { className: "mt-2" });
  findSection.appendChild(findResult);
  modal.appendChild(findSection);

  findBtn.addEventListener("click", async function () {
    var query = String(findInput.value || "").trim();
    if (!query) return;
    findResult.textContent = "";
    findBtn.disabled = true;
    findBtn.textContent = "Searching...";
    try {
      var res = await window.authFetch("/api/users/search?q=" + encodeURIComponent(query) + "&limit=5", { method: "GET" });
      var raw = await res.json().catch(function () { return {}; });
      var users = window.unwrapApiList ? window.unwrapApiList(raw, "users") : (raw && raw.data && Array.isArray(raw.data.users) ? raw.data.users : []);
      findBtn.disabled = false;
      findBtn.textContent = "Search";
      if (!users || users.length === 0) {
        findResult.appendChild(El("p", { className: "text-sm text-slate-500", textContent: "We couldn\u2019t find anyone by that name. Try a different search or share your invite link above." }));
        return;
      }
      users.forEach(function (u) {
        var name = String(u.name || u.displayName || "User");
        var userId = String(u._id || u.id || "");
        var row = El("div", { className: "flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50" });

        var avatar = El("img", { className: "w-8 h-8 rounded-full object-cover", alt: name });
        window.tstsSafeImg(avatar, String(u.profilePic || ""), "/assets/avatar-default.svg");
        row.appendChild(avatar);
        row.appendChild(El("span", { className: "text-sm text-tsts-ink flex-1", textContent: name }));

        var invBtn = El("button", {
          className: "px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200 rounded-full hover:bg-amber-50 transition",
          textContent: "Invite"
        });
        invBtn.addEventListener("click", async function () {
          invBtn.disabled = true;
          invBtn.textContent = "Sending...";
          try {
            var body = { experienceId: expId, targetUserId: userId };
            if (bookingDate) body.bookingDate = bookingDate;
            if (timeSlot) body.timeSlot = timeSlot;
            var r = await window.authFetch("/api/invites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            if (r.ok) {
              invBtn.textContent = "Sent!";
              invBtn.className = "px-3 py-1 text-xs font-bold text-green-700 border border-green-200 rounded-full bg-green-50";
              window.tstsNotify("Experience shared!", "success");
            } else {
              invBtn.textContent = "Failed";
              invBtn.disabled = false;
            }
          } catch (_) {
            invBtn.textContent = "Failed";
            invBtn.disabled = false;
          }
        });
        row.appendChild(invBtn);
        findResult.appendChild(row);
      });
    } catch (_) {
      findBtn.disabled = false;
      findBtn.textContent = "Search";
      findResult.appendChild(El("p", { className: "text-sm text-gray-400 italic", textContent: "Search failed." }));
    }
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

/* ====================== A11Y: MODAL FOCUS TRAP ====================== */

var _modalTrigger = null;
var _FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function _openModal(modal) {
  if (!modal) return;
  _modalTrigger = document.activeElement;
  modal.classList.remove("hidden");
  var first = modal.querySelector(_FOCUSABLE);
  if (first) first.focus();
}

function _closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
  if (_modalTrigger && typeof _modalTrigger.focus === "function") {
    try { _modalTrigger.focus(); } catch (_) {}
  }
  _modalTrigger = null;
}

function _trapFocus(e) {
  var hostReplyModalEl = document.getElementById("host-reply-modal");
  var allModals = [guestModal, reviewModal, complaintModal, cancelReviewModal, hostReplyModalEl, checkinModal];
  var modal = allModals.find(function(m) {
    return m && !m.classList.contains("hidden");
  });
  if (!modal || e.key !== "Tab") return;
  var focusable = Array.from(modal.querySelectorAll(_FOCUSABLE));
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ====================== WISHLIST TAB (merged from bookmarks.js) ====================== */

function sanitizeWishlistTitle(raw) {
  var title = String(raw || "").trim();
  var debranded = title.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
  if (debranded) return debranded;
  if (title && !/^WORLDCLASS_STARTER_/i.test(title) && !/^starter[_\-\s]/i.test(title)) return title;
  return "Shared experience";
}

function wishlistCard(exp) {
  var El = window.tstsEl;
  var e = exp || {};
  var fallbackImg = "/assets/experience-default.jpg";
  var imgUrl = window.tstsSafeUrl(e.imageUrl || (Array.isArray(e.images) ? e.images[0] : ""), fallbackImg);
  // Owner 2026-07-24 (sir: guest tabs "in line with" the rest): match the EXPLORE experience-card standard —
  // currency-aware A$ price (was a bare "$", an AU-locale slip), not a hardcoded dollar sign.
  var priceCents = (e.priceCents != null) ? Number(e.priceCents) : (e.price != null ? Math.round(Number(e.price) * 100) : 0);
  var priceText = priceCents > 0 ? centsToMoney(priceCents, e.currency || "aud") : "";
  var id = e._id || e.id || "";

  var imgEl = El("img", { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500" });
  window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

  // Container chrome matches the Explore card exactly (rounded-3xl + shadow-soft-card), not the older rounded-xl/shadow-sm.
  return El("a", { href: "experience.html?id=" + encodeURIComponent(id), className: "group block bg-white rounded-3xl shadow-soft-card hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col" }, [
    El("div", { className: "relative h-48 w-full overflow-hidden bg-gray-100" }, [
      imgEl,
      El("div", { className: "absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold shadow-sm text-tsts-ink", textContent: priceText })
    ]),
    El("div", { className: "p-4 flex flex-col gap-2 flex-grow" }, [
      El("h3", { className: "font-bold text-gray-900 mb-1 line-clamp-2", textContent: sanitizeWishlistTitle(e.title), title: sanitizeWishlistTitle(e.title) }),
      El("p", { className: "text-xs text-gray-500 flex items-center gap-1", textContent: e.city || "" }),
      El("div", { className: "mt-auto pt-3 border-t border-gray-50 flex justify-between items-center" }, [
        El("span", { className: "text-xs text-gray-500", textContent: "Saved" }),
        El("span", { className: "text-xs text-orange-600 font-semibold group-hover:underline", textContent: "View \u2192" })
      ])
    ])
  ]);
}

async function loadWishlist() {
  if (!(await requireAuthOrRedirect())) return;
  setLoading();
  try {
    var res = await window.authFetch("/api/my/bookmarks/details", { method: "GET" });
    var data = await res.json().catch(function() { return null; });
    if (!res.ok) throw new Error("load_failed");
    var list = window.unwrapApiList(data, "experiences");
    if (!contentEl) return;
    contentEl.textContent = "";
    if (!list || list.length === 0) {
      var El = window.tstsEl;
      contentEl.appendChild(El("div", { className: "text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-soft-card" }, [
        El("div", { className: "text-4xl mb-3", textContent: "\u2764\uFE0F" }),
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink mb-2", textContent: "Your wishlist is empty" }),
        El("p", { className: "text-gray-500 mb-6", textContent: "Save experiences you love and come back to them anytime." }),
        El("a", { href: "explore.html", className: "inline-block px-8 py-3 rounded-xl bg-tsts-ink text-white font-bold transition hover:opacity-90", textContent: "Explore experiences" })
      ]));
      return;
    }
    var grid = window.tstsEl("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" });
    list.forEach(function(e) { grid.appendChild(wishlistCard(e)); });
    contentEl.appendChild(grid);
  } catch (_) {
    if (contentEl) {
      contentEl.textContent = "";
      var El = window.tstsEl;
      contentEl.appendChild(El("div", { className: "text-center py-12" }, [
        El("p", { className: "text-red-600 font-bold", textContent: "Unable to load your wishlist." }),
        El("button", { type: "button", className: "mt-4 px-6 py-2 rounded-xl bg-tsts-ink text-white text-sm font-bold transition hover:opacity-90", textContent: "Retry" })
      ]));
      contentEl.querySelector("button").addEventListener("click", loadWishlist);
    }
  }
}

/* ====================== EVENT WIRING ====================== */

document.addEventListener("DOMContentLoaded", async () => {
  if (contentEl) contentEl.textContent = "";
  if (!(await requireAuthOrRedirect())) return;

  if (tabTrips) tabTrips.addEventListener("click", () => {
    const token = toggleTab("trips");
    loadTrips(token);
  });
  if (tabHost) tabHost.addEventListener("click", () => {
    const token = toggleTab("hosting");
    loadHost(hostDashboardState.section || dashboardDeepLink.section || "overview", token);
    connectHostWebSocket();
  });
  if (tabWishlist) tabWishlist.addEventListener("click", () => {
    toggleTab("wishlist");
    loadWishlist();
  });

  if (reviewForm) reviewForm.addEventListener("submit", submitReview);
  if (complaintForm) complaintForm.addEventListener("submit", submitComplaint);
  if (complaintMessageInput) {
    complaintMessageInput.addEventListener("input", () => {
      const wc = countWords(complaintMessageInput.value || "");
      if (complaintWordCount) complaintWordCount.textContent = String(wc) + " / 200 words";
    });
  }

  // Delegate clicks for dynamic buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const bid = btn.getAttribute("data-booking-id") || "";
    const expId = btn.getAttribute("data-exp-id") || "";
    const toFriendsRaw = btn.getAttribute("data-to-friends");
    const requestId = btn.getAttribute("data-request-id") || "";
    const requestStatus = btn.getAttribute("data-request-status") || "";
    const hostSection = btn.getAttribute("data-host-section") || "";

    if (action === "host-switch-section") {
      setHostingSection(hostSection);
      return;
    }
    if (action === "trips-switch-sub") {
      setTripsSub(btn.getAttribute("data-trips-sub") || "upcoming");
      return;
    }
    if (action === "host-retry-load") {
      loadHost(hostDashboardState.section || "overview");
      return;
    }

    if (action === "buzz-checkin") {
      handleBuzzPendingCheckins(btn, expId, btn.getAttribute("data-occ-date") || "", btn.getAttribute("data-occ-slot") || "");
      return;
    }
    if (action === "cancel") openCancelReviewModalById(bid);
    if (action === "renounce-gift") { handleRenounceGift(bid, btn.getAttribute("data-gifter-name") || "", btn); }
    if (action === "review") openReviewModal(bid, expId);
    if (action === "complaint") openComplaintModalById(bid);
    if (action === "guest") openGuestModalById(bid);
    // O-141 (sir, 2026-09-16): the booking's conversation, from either side.
    if (action === "booking-message") openBookingMessageThread(bid, btn.getAttribute("data-role") || "");
    if (action === "otp-checkin") openCheckinModal(bid);
    if (action === "view-otp") viewEntryCode(bid);
    if (action === "toggle-visibility") {
      const toFriends = String(toFriendsRaw || "").toLowerCase() === "true";
      updateBookingVisibility(bid, toFriends);
    }
    if (action === "host-private-request-status") {
      // The button is passed so the handler can lock it while the money moves — every other action
      // here already does this. Without it Accept stayed live for the whole request (proven at
      // runtime: 13 samples across 2.4s, never disabled, no spinner), so a second click could fire.
      handleHostPrivateRequestAction(requestId, requestStatus, btn);
    }
    if (action === "guest-private-request-withdraw") {
      handleGuestPrivateRequestWithdraw(requestId, btn);
    }
    if (action === "guest-private-request-resume") {
      handleGuestResumePayment(requestId, btn);
    }
    if (action === "guest-private-request-edit") {
      openPrivateRequestEditModal(requestId);
    }
    if (action === "guest-private-request-message") {
      openPrivateRequestThread(requestId);
    }
    if (action === "guest-accept-alternative") {
      handleGuestAcceptAlternative(requestId, btn.getAttribute("data-group") || "", btn);
    }
    if (action === "guest-decline-alternative") {
      handleGuestDeclineAlternative(requestId, btn);
    }
    if (action === "host-propose-toggle") {
      handleHostProposeToggle(requestId);
    }
    if (action === "host-withdraw-offer") {
      handleHostWithdrawOffer(requestId, btn);
    }
    if (action === "host-private-request-reply") {
      handleHostSendMessage(requestId);
    }
    if (action === "host-propose-submit") {
      handleHostProposeAlternative(requestId, btn);
    }
    if (action === "connection-request-action") {
      handleConnectionRequestAction(requestId, requestStatus);
    }
    if (action === "host-reply") {
      var reviewId = btn.getAttribute("data-review-id") || "";
      openHostReplyModal(reviewId, "", "");
    }
    if (action === "host-reply-edit") {
      var reviewId2 = btn.getAttribute("data-review-id") || "";
      var replyText = btn.getAttribute("data-reply-text") || "";
      var replyAt = btn.getAttribute("data-reply-at") || "";
      openHostReplyModal(reviewId2, replyText, replyAt);
    }
    if (action === "share-experience") {
      var shareExpId = btn.getAttribute("data-exp-id") || "";
      var shareDate = btn.getAttribute("data-booking-date") || "";
      var shareSlot = btn.getAttribute("data-time-slot") || "";
      var shareTitle = btn.getAttribute("data-exp-title") || "";
      openShareModal(shareExpId, shareDate, shareSlot, shareTitle);
    }
    if (action === "invite-copy-link") {
      var copyUrl = btn.getAttribute("data-invite-url") || "";
      if (copyUrl) {
        // Gap 34 (sir's decision O-117): the one honest copy routine in js/common.js, the same one
        // behind every other Copy button. It asks the browser's clipboard, then the older selection
        // copy, and when both refuse it says so itself and leaves the link selected, so there is
        // always a way to take the link by hand. The share dialog keeps the link in the field beside
        // this button, so that field is what stays selected there; the invite card's copy button has
        // no field beside it, and the routine hands the link over in its own sentence instead.
        // The confirmation below is said only on a real copy.
        var inviteLinkField = btn.parentElement ? btn.parentElement.querySelector('input[type="text"]') : null;
        window.tstsCopyText(copyUrl, { selectEl: inviteLinkField }).then(function (copied) {
          if (copied && window.tstsNotify) window.tstsNotify("Link copied to clipboard. See you at the table. ✨", "success");
        });
      }
    }
    if (action === "invite-confirm-gift") { handleInviteConfirmGift(btn.getAttribute("data-invite-token") || "", btn); }
    if (action === "invite-decline-gift") { handleInviteDeclineGift(btn.getAttribute("data-invite-token") || "", btn.getAttribute("data-inviter-name") || "", btn); }
    if (action === "invite-gift-resume-payment") { handleInviteGiftResumePayment(btn.getAttribute("data-invite-token") || "", btn); }
    if (action === "invite-gift-discard") { handleInviteGiftDiscard(btn.getAttribute("data-invite-token") || "", btn); }
    if (action === "invite-revoke") { handleInviteRevoke(btn.getAttribute("data-invite-token") || "", btn); }
    if (action === "invite-nudge") { handleInviteNudge(btn.getAttribute("data-invite-token") || "", btn.getAttribute("data-nudge-name") || "", btn); }
    if (action === "invite-native-share") {
      var shareUrl = btn.getAttribute("data-invite-url") || "";
      var shareExpTitle = btn.getAttribute("data-exp-title") || "Check out this experience";
      if (navigator.share && shareUrl) {
        navigator.share({ title: shareExpTitle, url: shareUrl }).catch(function () {});
      }
    }
  });

  // Close guest modal
  if (closeGuestBtn) closeGuestBtn.addEventListener("click", closeGuestModal);

  // Close review modal (cancel button)
  if (reviewCancelBtn) reviewCancelBtn.addEventListener("click", closeReviewModal);
  if (complaintCancelBtn) complaintCancelBtn.addEventListener("click", closeComplaintModal);
  if (cancelReviewCloseBtn) cancelReviewCloseBtn.addEventListener("click", closeCancelReviewModal);
  if (cancelReviewConfirmBtn) cancelReviewConfirmBtn.addEventListener("click", handleCancelReviewConfirm);

  // Host reply modal handlers
  var hostReplyForm = document.getElementById("host-reply-form");
  var hostReplyCancelBtn = document.getElementById("host-reply-cancel-btn");
  var hostReplyTextInput = document.getElementById("host-reply-text");
  var hostReplyCharCount = document.getElementById("host-reply-char-count");
  if (hostReplyForm) hostReplyForm.addEventListener("submit", submitHostReply);
  if (hostReplyCancelBtn) hostReplyCancelBtn.addEventListener("click", closeHostReplyModal);
  if (hostReplyTextInput && hostReplyCharCount) {
    hostReplyTextInput.addEventListener("input", function () {
      hostReplyCharCount.textContent = String((hostReplyTextInput.value || "").length) + " / 800 characters";
    });
  }

  // Click outside to close
  var hostReplyModalEl = document.getElementById("host-reply-modal");
  document.addEventListener("click", (e) => {
    if (guestModal && !guestModal.classList.contains("hidden") && e.target === guestModal) closeGuestModal();
    if (reviewModal && !reviewModal.classList.contains("hidden") && e.target === reviewModal) closeReviewModal();
    if (complaintModal && !complaintModal.classList.contains("hidden") && e.target === complaintModal) closeComplaintModal();
    if (cancelReviewModal && !cancelReviewModal.classList.contains("hidden") && e.target === cancelReviewModal) closeCancelReviewModal();
    if (hostReplyModalEl && !hostReplyModalEl.classList.contains("hidden") && e.target === hostReplyModalEl) closeHostReplyModal();
  });

  // ESC to close + Tab to trap focus in modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeGuestModal();
      closeReviewModal();
      closeComplaintModal();
      closeCancelReviewModal();
      closeHostReplyModal();
      closeCheckinModal();
      closeEntryPass();
      var shareModal = document.getElementById("tsts-share-modal");
      if (shareModal) shareModal.remove();
      return;
    }
    _trapFocus(e);
  });

  // Default load
  loadActivePolicySnapshot().catch(() => {});
  const initialTab = resolveDashboardTab(dashboardDeepLink.tab);
  hostDashboardState.section = resolveHostingSection(dashboardDeepLink.section, dashboardDeepLink.panel);
  tripsDashboardState.sub = resolveTripsSub(dashboardDeepLink.sub);
  const initialToken = toggleTab(initialTab); __mbScrollActiveTabIntoView(initialTab);
  if (initialTab === "hosting") loadHost(hostDashboardState.section, initialToken);
  else if (initialTab === "wishlist") loadWishlist();
  else loadTrips(initialToken);
});

/* ====================== PHONE SHAPE: TAB STRIP + ACTION BUTTONS ====================== */
// sir's order O-103 (2026-09-13, phone view): the tab strip scrolls sideways on a phone, so a page
// opened on the wishlist could show the wishlist with no highlighted tab anywhere on screen. The tab
// the address asks for is brought into the strip's own view, from its left edge. "nearest" for the
// vertical part means the page itself never scrolls, on a phone or on a wide screen.
function __mbScrollActiveTabIntoView(which) {
  var btn = (which === "hosting") ? tabHost : ((which === "wishlist") ? tabWishlist : tabTrips);
  if (!btn || typeof btn.scrollIntoView !== "function") return;
  try { btn.scrollIntoView({ inline: "start", block: "nearest" }); } catch (_mbTabErr) { void _mbTabErr; }
}

// sir's order O-103 (2026-09-13, phone view): on a phone every action takes its own full-width row and
// its label may wrap, so a long label such as "Hand back this seat" keeps the padding inside its button
// instead of eating it. From 640 up the row is the same auto-fit grid with labels held on one line, so a
// wide window renders exactly as it does today.
// The width is read here rather than fixed when the card is built, and read again on every window
// resize, so a window dragged across 640 changes shape with it.
function __mbIsPhoneActionWidth() {
  return (Number(window.innerWidth) || 0) < 640;
}
function __mbShapeActionGrid(area, nowrapWhenWide) {
  if (!area || !area.style) return;
  var phone = __mbIsPhoneActionWidth();
  area.style.gridTemplateColumns = phone ? "1fr" : "repeat(auto-fit, minmax(140px, 1fr))";
  if (nowrapWhenWide) {
    Array.prototype.slice.call(area.children).forEach(function (c) {
      if (c && c.style) c.style.whiteSpace = phone ? "normal" : "nowrap";
      var inner = (c && c.querySelector) ? c.querySelector("button") : null;
      if (inner && inner.style) inner.style.whiteSpace = phone ? "normal" : "nowrap";
    });
  }
  if (area.setAttribute) area.setAttribute("data-mb-action-grid", nowrapWhenWide ? "nowrap" : "wrap");
  __mbBindActionGridWatcher();
}
var __mbActionGridWatcherBound = false;
function __mbBindActionGridWatcher() {
  if (__mbActionGridWatcherBound || !window.addEventListener) return;
  __mbActionGridWatcherBound = true;
  window.addEventListener("resize", function () {
    try {
      var areas = document.querySelectorAll("[data-mb-action-grid]");
      for (var i = 0; i < areas.length; i++) {
        __mbShapeActionGrid(areas[i], areas[i].getAttribute("data-mb-action-grid") === "nowrap");
      }
    } catch (_mbGridErr) { void _mbGridErr; }
  }, { passive: true });
}
