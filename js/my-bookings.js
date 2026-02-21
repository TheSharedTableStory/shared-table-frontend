// js/my-bookings.js (CLOSED: dashboard + hosting)
// Uses common.js single-truth: window.authFetch, window.getAuthToken

const contentEl = document.getElementById("content-area");
const tabTrips = document.getElementById("tab-trips");
const tabHost = document.getElementById("tab-hosting");

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
const cancelReviewPolicyVersionEl = document.getElementById("cancel-review-policy-version");
const cancelReviewPolicyEffectiveEl = document.getElementById("cancel-review-policy-effective");
const cancelReviewRefundStateEl = document.getElementById("cancel-review-refund-state");
const cancelReviewRefundBaseEl = document.getElementById("cancel-review-refund-base");
const cancelReviewRefundPercentEl = document.getElementById("cancel-review-refund-percent");
const cancelReviewRefundEstimateEl = document.getElementById("cancel-review-refund-estimate");
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
let activePolicySnapshot = null;
const reviewModalState = { mode: "create", reviewId: "", canEdit: true, editableUntil: null };
const dashboardQueryParams = new URLSearchParams(window.location.search || "");
const dashboardDeepLink = {
  tab: String(dashboardQueryParams.get("tab") || "").trim().toLowerCase(),
  section: String(dashboardQueryParams.get("section") || "").trim().toLowerCase(),
  panel: String(dashboardQueryParams.get("panel") || "").trim().toLowerCase(),
  requestId: String(dashboardQueryParams.get("requestId") || "").trim()
};
const HOSTING_SECTION_KEYS = Object.freeze(["overview", "listings", "bookings", "private-requests", "verification-payout", "reviews"]);
const HOSTING_SECTION_LABELS = Object.freeze({
  overview: "Overview",
  listings: "My Listings",
  bookings: "Booking Requests",
  "private-requests": "Private Requests",
  "verification-payout": "Verification & Payout",
  reviews: "Reviews & Performance"
});
const hostDashboardState = {
  section: "overview",
  listings: { status: "idle", items: [], summary: null, warnings: [], message: "" },
  bookings: { status: "idle", rows: [], message: "" },
  privateRequests: { status: "idle", rows: [], message: "" },
  verification: { status: "idle", data: null, message: "" },
  reviews: { status: "idle", data: null, message: "" }
};

function resolveDashboardTab(rawTab) {
  const tab = String(rawTab || "").trim().toLowerCase();
  if (tab === "hosting") return "hosting";
  if (tab === "experiences" || tab === "trips" || tab === "") return "trips";
  return "trips";
}

function resolveHostingSection(rawSection, panelHint) {
  const section = String(rawSection || "").trim().toLowerCase();
  if (HOSTING_SECTION_KEYS.includes(section)) return section;
  const panel = String(panelHint || "").trim().toLowerCase();
  if (panel === "private-request-actions") return "private-requests";
  return "overview";
}

function canonicalTabParam(internalTab) {
  return internalTab === "hosting" ? "hosting" : "experiences";
}

function syncDashboardTabQuery(internalTab, hostingSection) {
  try {
    const url = new URL(window.location.href);
    const prevPath = url.pathname + (url.search || "") + (url.hash || "");
    const nextTab = canonicalTabParam(internalTab);
    url.searchParams.set("tab", nextTab);
    if (internalTab === "hosting") {
      url.searchParams.set("section", resolveHostingSection(hostingSection, dashboardDeepLink.panel));
    } else {
      url.searchParams.delete("section");
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
  try {
    if (!window.tstsGetSession) {
      redirectToLogin();
      return false;
    }
    const sess = await window.tstsGetSession({ force: true });
    if (!sess || !sess.ok || !sess.user) {
      redirectToLogin();
      return false;
    }
    if (sess.status && sess.status !== 200) {
      window.tstsNotify("Unable to verify your session. Please refresh and try again.", "error");
      return false;
    }
    return true;
  } catch (_) {
    window.tstsNotify("Unable to verify your session. Please refresh and try again.", "error");
    return false;
  }
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
  contentEl.appendChild(El("p", { className: "text-red-500 text-center", textContent: msg || "Something went wrong." }));
}

function safeStr(x) {
  return (typeof x === "string") ? x : (x == null ? "" : String(x));
}

function safeDate(d) {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function toMoney(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  return "$" + rounded.toFixed(2);
}

function centsToMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return toMoney(n / 100);
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

function normalizeState(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "none";
  return s;
}

function stateLabel(raw) {
  const s = normalizeState(raw);
  if (s === "none") return "None";
  return s.replace(/_/g, " ").toUpperCase();
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
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
  let chosen = null;
  for (const row of rows) {
    const min = Number(row && row.hoursBeforeStartMin);
    if (!Number.isFinite(min)) continue;
    if (hoursBeforeStart < min) continue;
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

  if (!canCancel) {
    note = "This booking is in a terminal lifecycle state and cannot be cancelled from dashboard.";
    state = status;
  } else if (baseCents <= 0) {
    state = "no_paid_amount";
    note = "No paid amount is recorded for this booking. Refund is 0 in the current state.";
  } else if (!rules) {
    const existingAmount = Number(b && b.refundDecision && b.refundDecision.amountCents);
    if (Number.isFinite(existingAmount) && existingAmount >= 0) {
      refundCents = Math.floor(existingAmount);
      refundPct = clampPct(percentLikeToPct((b && b.refundDecision && b.refundDecision.percent), 0), 95);
      state = normalizeState((b && b.refundDecision && b.refundDecision.status) || "from_existing_decision");
      note = "Refund estimate is from the latest stored refund decision.";
    } else {
      state = "manual";
      note = "Refund policy snapshot is unavailable. Server will compute refund at cancellation time.";
    }
  } else {
    const configuredCap = percentLikeToPct(
      (rules.userCancelRefundCapPercent != null) ? rules.userCancelRefundCapPercent : rules.absoluteMaxGuestRefundPercent,
      95
    );
    const capPct = clampPct(Math.round(configuredCap), 95);

    const startAt = resolveBookingStartAt(b);
    const hoursBeforeStart = startAt ? ((startAt.getTime() - Date.now()) / (60 * 60 * 1000)) : null;
    const tier = pickUserCancelTier(rules, hoursBeforeStart);
    let tierPct = percentLikeToPct(
      (tier && tier.refundPercent != null) ? tier.refundPercent : rules.guestMaxRefundPercent,
      0
    );

    const freeCancelHours = Math.max(0, Math.floor(Number(rules.guestFreeCancelHours) || 0));
    if (Number.isFinite(hoursBeforeStart) && freeCancelHours > 0 && hoursBeforeStart >= freeCancelHours) {
      tierPct = Math.max(tierPct, 100);
    }

    refundPct = clampPct(Math.min(capPct, tierPct), 95);
    refundCents = Math.max(0, Math.round(baseCents * (refundPct / 100)));
    state = "estimated";
    note = "Estimated using current policy snapshot and booking state.";
  }

  return {
    canCancel,
    policyVersion: bookingPolicyVersion(b) || "Unavailable",
    policyEffectiveDate: formatPolicyEffective(b) || "Unavailable",
    state: state,
    baseCents: baseCents,
    refundPct: refundPct,
    refundCents: refundCents,
    note: note || "Refund will be computed by server at cancellation time."
  };
}

function fmtTripDate(dt) {
  try {
    if (window.tstsFormatDateShort) return window.tstsFormatDateShort(dt);
  } catch (_) {}
  try {
    return dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
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

  if (which === "trips") {
    tabTrips.className = "border-orange-600 text-orange-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm";
    tabHost.className = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm";
  } else {
    tabHost.className = "border-orange-600 text-orange-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm";
    tabTrips.className = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm";
  }
  syncDashboardTabQuery(which, hostDashboardState.section);
}

/* ====================== GUEST TRIPS ====================== */

async function loadTrips() {
  if (!(await requireAuthOrRedirect())) return;
  setLoading();

  try {
    const res = await window.authFetch("/api/bookings/my-bookings");
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError((data && data.message) || "Failed to load bookings.");
      return;
    }

    const pendingConnections = await loadPendingConnectionRequests().catch(function () { return []; });

    if (!Array.isArray(data) || data.length === 0) {
      guestBookingsCache = [];
      const El = window.tstsEl;
      contentEl.textContent = "";
      contentEl.appendChild(renderConnectionActionPanel(pendingConnections));
      contentEl.appendChild(
        El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
          El("div", { className: "text-5xl mb-4", textContent: "🌏" }),
          El("h3", { className: "text-xl font-bold text-gray-900 mb-2", textContent: "No bookings yet" }),
          El("p", { className: "text-gray-500 mb-6", textContent: "You haven't booked any experiences yet." }),
          El("a", { href: "explore.html", className: "inline-block bg-orange-700 text-white px-8 py-3 rounded-full font-bold shadow hover:bg-orange-800 transition", textContent: "Find an Adventure" })
        ])
      );
      focusDashboardDeepLinkPanel();
      return;
    }

    guestBookingsCache = data;
    contentEl.textContent = "";
    contentEl.appendChild(renderConnectionActionPanel(pendingConnections));
    data.forEach(function(b) { contentEl.appendChild(renderTripCard(b)); });
    focusDashboardDeepLinkPanel();
  } catch (_) {
    setError("Failed to load bookings.");
  }
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
  const title = sanitizeExperienceTitle(exp.title || booking.title || "Unknown Experience");
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
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-700", textContent: "CANCELLED" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking was cancelled." });
  } else if (isCompleted) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-gray-100 text-gray-700", textContent: "COMPLETED" });
    const reviewInfo = (booking && booking.review && typeof booking.review === "object") ? booking.review : null;
    const hasReview = !!String((reviewInfo && reviewInfo.id) || "").trim();
    const canEditReview = !!(reviewInfo && reviewInfo.canEdit);
    let reviewLabel = "Write a Review";
    let reviewIcon = "fas fa-star";
    if (hasReview && canEditReview) {
      reviewLabel = "Edit Review";
      reviewIcon = "fas fa-pen";
    } else if (hasReview) {
      reviewLabel = "View Review";
      reviewIcon = "fas fa-eye";
    }

    const reviewBtn = El("button", {
      className: "w-full md:w-auto px-5 py-2 bg-tsts-ink text-white text-sm font-bold rounded-xl shadow hover:bg-slate-800 transition flex items-center justify-center gap-2",
      "data-action": "review", "data-booking-id": bookingId, "data-exp-id": expId
    }, [El("i", { className: reviewIcon }), " " + reviewLabel]);

    let actionNoteText = "Rate from 1 to 5 stars after completion.";
    const nodes = [reviewBtn];
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
        const complaintNote = "Complaint window closes on " + fmtTripDate(complaintWindowEndsAt) + ".";
        actionNoteText += " " + complaintNote;
      }
    } else if (complaintId) {
      const issueNote = "Issue already reported for this booking.";
      actionNoteText += " " + issueNote;
    }
    actionNote = El("p", { className: "text-xs text-slate-600 md:text-right", textContent: actionNoteText });
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full md:w-auto flex flex-col gap-2 md:items-end" }, nodes);
  } else if (status === "expired") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-gray-100 text-gray-500", textContent: "PAYMENT EXPIRED" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking has expired." });
  } else if (status === "pending_payment") {
    var payStatus = safeStr(booking.paymentStatus).toLowerCase();
    if (payStatus === "failed" || payStatus === "abandoned") {
      statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-600", textContent: "PAYMENT FAILED" });
      actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "Payment could not be completed." });
    } else {
      statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-yellow-100 text-yellow-700", textContent: "PAYMENT PENDING" });
      actionArea = El("span", { className: "text-sm text-gray-500 italic", textContent: "Payment has not been completed." });
    }
  } else if (status === "refunded") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-gray-100 text-gray-600", textContent: "REFUNDED" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking has been refunded." });
  } else if (status === "confirmed" && isPast) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-blue-100 text-blue-700", textContent: "AWAITING COMPLETION" });
    const nodes = [El("span", { className: "text-sm text-gray-500 italic", textContent: "Completion is being finalized." })];
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full md:w-auto flex flex-col gap-2 md:items-end" }, nodes);
  } else if (status === "confirmed") {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-green-100 text-green-700", textContent: "CONFIRMED" });
    const nodes = [El("button", {
      className: "w-full md:w-auto px-5 py-2 border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition",
      "data-action": "cancel", "data-booking-id": bookingId, textContent: "Cancel Booking"
    })];
    // Entry code button for confirmed+paid upcoming bookings
    if (paymentStatus === "paid" && !isPast) {
      nodes.push(El("button", {
        className: "w-full md:w-auto px-5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold rounded-lg hover:bg-emerald-100 transition",
        "data-action": "view-otp", "data-booking-id": bookingId, textContent: "View Entry Code"
      }));
    }
    if (visibilityToggleBtn) nodes.push(visibilityToggleBtn);
    actionArea = El("div", { className: "w-full md:w-auto flex flex-col gap-2 md:items-end" }, nodes);
  } else {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-gray-100 text-gray-600", textContent: "NEEDS REVIEW" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking requires attention." });
  }

  var imgEl = El("img", { className: "w-full h-full object-cover", alt: "Experience" });
  window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

  var card = El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 mb-4 hover:shadow-md transition" }, [
    El("div", { className: "w-full md:w-48 h-32 md:h-auto bg-gray-100 rounded-xl overflow-hidden flex-shrink-0" }, [imgEl]),
    El("div", { className: "flex-grow flex flex-col justify-between" }, [
      El("div", {}, [
        El("div", { className: "flex justify-between items-start mb-2 gap-4" }, [
          El("h3", { className: "font-bold text-xl text-gray-900 leading-tight", textContent: title }),
          statusBadge
        ]),
        El("div", { className: "text-gray-500 text-sm flex flex-col gap-1" }, [
          El("span", { className: "flex items-center gap-2" }, [El("i", { className: "far fa-calendar w-4" }), " " + dateStr]),
          El("span", { className: "flex items-center gap-2" }, [El("i", { className: "fas fa-user-friends w-4" }), " " + guests + " Guests"]),
          El("span", { className: "flex items-center gap-2" }, [El("i", { className: "fas fa-map-marker-alt w-4" }), " " + city]),
          El("span", { className: "flex items-center gap-2 text-xs text-slate-500" }, [El("i", { className: "fas fa-file-contract w-4" }), " Policy: " + policyVersion + " • Effective: " + policyEffective]),
          El("span", { className: "flex items-center gap-2 text-xs text-slate-500" }, [El("i", { className: "fas fa-receipt w-4" }), " Refund: " + refundState + refundAmountText + " • Payout: " + payoutState]),
          El("span", { className: "flex items-center gap-2 text-xs text-slate-500" }, [
            El("i", { className: "fas fa-eye w-4" }),
            " Visible to:",
            El("span", { className: "px-2 py-0.5 rounded-full text-[11px] font-bold " + visibilityClass, textContent: visibilityLabel })
          ])
        ])
      ]),
      El("div", { className: "mt-4 md:mt-0 pt-4 md:pt-0 flex flex-col gap-2 items-stretch md:items-end" }, [
        actionArea,
        actionNote || El("span", { className: "hidden", textContent: "" })
      ])
    ])
  ]);

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
      El("p", { className: "text-sm text-slate-700", textContent: hostReply })
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
      loadTrips().catch(() => {});
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

  // Legacy bookings (pre-Feb-17) may have no locked policySnapshot — fetch fresh policy for those only.
  if (!b.policySnapshot || typeof b.policySnapshot !== "object" || !b.policySnapshot.version) {
    await loadActivePolicySnapshot();
  }

  const preview = buildCancelPreview(b);

  if (cancelReviewBookingIdInput) cancelReviewBookingIdInput.value = String(bookingId || "");
  if (cancelReviewPolicyVersionEl) cancelReviewPolicyVersionEl.textContent = preview.policyVersion || "Unavailable";
  if (cancelReviewPolicyEffectiveEl) cancelReviewPolicyEffectiveEl.textContent = preview.policyEffectiveDate || "Unavailable";
  if (cancelReviewRefundStateEl) cancelReviewRefundStateEl.textContent = stateLabel(preview.state);
  if (cancelReviewRefundBaseEl) cancelReviewRefundBaseEl.textContent = centsToMoney(preview.baseCents);
  if (cancelReviewRefundPercentEl) cancelReviewRefundPercentEl.textContent = preview.refundPct.toFixed(0) + "%";
  if (cancelReviewRefundEstimateEl) cancelReviewRefundEstimateEl.textContent = centsToMoney(preview.refundCents);
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
    window.tstsNotify("Complaint can be filed only after booking completion.", "warning");
    return;
  }
  if (String(b.complaintReportId || "").trim().length > 0) {
    window.tstsNotify("An issue is already reported for this booking.", "info");
    return;
  }
  if (!b.canFileComplaint) {
    window.tstsNotify("Complaint window is not open for this booking.", "warning");
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
  const out = await up.json().catch(() => ({}));
  if (!up.ok) {
    const msg = String((out && out.message) || "Evidence upload failed.");
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

  try {
    const res = await window.authFetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const refundCents = Number(data && data.refund && data.refund.amountCents);
      const refundText = Number.isFinite(refundCents) ? centsToMoney(refundCents) : "";
      window.tstsNotify(refundText ? ("Cancelled. Refund: " + refundText) : "Cancelled.", "success");
      await loadTrips();
      return true;
    } else {
      window.tstsNotify("Error: " + (data.message || "Unable to cancel."), "error");
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
  const section = El("section", { className: "space-y-4 mb-8", id: "user-connection-actions-panel" }, [
    El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Pending Connection Requests" })
  ]);

  if (rows.length === 0) {
    section.appendChild(El("div", {
      className: "bg-white p-4 rounded-xl border border-gray-100 text-sm text-gray-500",
      textContent: "No pending connection requests."
    }));
    return section;
  }

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
            className: "px-3 py-2 rounded-xl bg-tsts-ink text-white text-xs font-bold hover:bg-slate-800 transition",
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

async function loadHostPrivateBookingRequests() {
  const res = await window.authFetch("/api/host/private-booking-requests?status=pending&limit=100", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  const rows = Array.isArray(payload && payload.requests) ? payload.requests : [];
  return rows;
}

async function updateHostPrivateBookingRequestStatus(requestId, status) {
  const id = String(requestId || "").trim();
  const next = String(status || "").trim().toLowerCase();
  if (!id) throw new Error("Request id missing.");
  const allowed = { contacted: true, approved: true, declined: true, closed: true };
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

function renderHostPrivateRequestActionsPanel(requests) {
  const El = window.tstsEl;
  const rows = Array.isArray(requests) ? requests : [];
  const section = El("section", { className: "space-y-4 mb-8", id: "host-private-request-actions-panel" }, [
    El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Private Request Actions" })
  ]);

  if (rows.length === 0) {
    section.appendChild(El("div", {
      className: "bg-white p-4 rounded-xl border border-gray-100 text-sm text-gray-500",
      textContent: "No pending private booking requests."
    }));
    return section;
  }

  rows.forEach(function (row) {
    const requestId = String((row && row._id) || "");
    const requesterName = String((row && row.requesterName) || "Guest");
    const requesterEmail = String((row && row.requesterEmail) || "");
    const dateText = String((row && row.preferredDate) || "Date TBA");
    const timeText = String((row && row.preferredTime) || "Time TBA");
    const guestText = Number.isFinite(Number(row && row.guests)) ? (String(Math.max(1, Number(row.guests))) + " guests") : "Guests not set";
    const safeMailto = window.tstsSafeMailto ? window.tstsSafeMailto(requesterEmail) : "";
    const rowId = "host-private-request-row-" + requestId;

    section.appendChild(
      El("div", { className: "bg-white p-4 rounded-xl border border-gray-100 space-y-3", id: rowId }, [
        El("div", { className: "flex flex-col md:flex-row md:items-start md:justify-between gap-2" }, [
          El("div", { className: "space-y-1" }, [
            El("div", { className: "font-bold text-gray-900", textContent: requesterName + " • " + String((row && row.experienceTitle) || "Private experience request") }),
            El("div", { className: "text-xs text-gray-500", textContent: dateText + " • " + timeText + " • " + guestText })
          ]),
          El("div", { className: "text-xs text-slate-500", textContent: "Status: " + String((row && row.status) || "pending") })
        ]),
        El("div", { className: "flex flex-wrap items-center gap-2" }, [
          El("button", {
            type: "button",
            className: "px-3 py-2 rounded-xl bg-tsts-ink text-white text-xs font-bold hover:bg-slate-800 transition",
            "data-action": "host-private-request-status",
            "data-request-id": requestId,
            "data-request-status": "approved",
            textContent: "Accept"
          }),
          El("button", {
            type: "button",
            className: "px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 transition",
            "data-action": "host-private-request-status",
            "data-request-id": requestId,
            "data-request-status": "declined",
            textContent: "Decline"
          }),
          El("button", {
            type: "button",
            className: "px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition",
            "data-action": "host-private-request-status",
            "data-request-id": requestId,
            "data-request-status": "contacted",
            textContent: "Marked Contacted"
          }),
          safeMailto
            ? El("a", {
              href: safeMailto,
              className: "px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 transition",
              textContent: "Email Guest"
            })
            : El("span", { className: "text-xs text-slate-500", textContent: requesterEmail || "Guest email unavailable" })
        ])
      ])
    );
  });
  return section;
}

async function handleHostPrivateRequestAction(requestId, nextStatus) {
  const id = String(requestId || "").trim();
  const status = String(nextStatus || "").trim().toLowerCase();
  if (!id || !status) return;
  try {
    await updateHostPrivateBookingRequestStatus(id, status);
    window.tstsNotify("Private request updated.", "success");
    await loadHost();
  } catch (err) {
    window.tstsNotify(String((err && err.message) || "Failed to update private request."), "error");
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

function focusDashboardDeepLinkPanel() {
  const panel = String((dashboardDeepLink && dashboardDeepLink.panel) || "").trim().toLowerCase();
  const requestId = String((dashboardDeepLink && dashboardDeepLink.requestId) || "").trim();
  if (!panel) return;

  let target = null;
  if (panel === "private-request-actions") {
    target = document.getElementById(requestId ? ("host-private-request-row-" + requestId) : "host-private-request-actions-panel");
  } else if (panel === "connection-actions") {
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

function formatPriceLabel(priceRaw) {
  const n = Number(priceRaw);
  if (!Number.isFinite(n) || n < 0) return "Price TBA";
  const rounded = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)) + " per guest";
}

function getSessionUserId() {
  return window.tstsGetSession({ force: true })
    .then(function (sess) {
      const u = (sess && sess.user) ? sess.user : {};
      return String(u._id || u.id || "").trim();
    })
    .catch(function () { return ""; });
}

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

async function fetchHostVerificationState() {
  const res = await window.authFetch("/api/host/verification/status", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "Could not load verification status."));
  }
  return parseHostVerificationPayload(payload);
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
  const res = await window.authFetch("/api/stripe/connect/standard/start", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload && payload.message) || "Could not start Stripe onboarding."));
  }
  const data = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
  const url = String((data && data.url) || "").trim();
  if (!url) throw new Error("Stripe onboarding URL missing.");
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
    throw new Error(String((payload && payload.message) || "Could not disconnect Stripe account."));
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
    className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition " + (canRequest ? "bg-tsts-ink text-white hover:bg-slate-800" : "bg-gray-200 text-gray-500 cursor-not-allowed"),
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
    className: "inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition " + (stripeConnected ? "bg-emerald-100 text-emerald-700 cursor-not-allowed" : "border border-blue-200 text-blue-700 hover:bg-blue-50"),
    textContent: stripeConnected ? "Stripe connected" : "Connect Stripe payouts",
    disabled: stripeConnected
  });
  connectBtn.addEventListener("click", async function () {
    try {
      connectBtn.disabled = true;
      await startStripeConnectStandard();
    } catch (err) {
      connectBtn.disabled = false;
      window.tstsNotify(String((err && err.message) || "Could not start Stripe onboarding."), "error");
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
      window.tstsNotify(String((err && err.message) || "Could not disconnect Stripe account."), "error");
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

  return El("section", { className: "space-y-4 mb-8" }, [
    El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Host Verification & Payout Setup" }),
    El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4" }, [
      El("div", { className: "flex flex-wrap items-center gap-2" }, [
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full " + statusClass, textContent: "Host verification: " + statusLabel }),
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700", textContent: "Event verification fee policy: " + feePolicy.feePercent.toFixed(1) + "%" }),
        El("span", { className: "px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700", textContent: "Stripe payout: " + stripeStatus })
      ]),
      El("p", { className: "text-sm text-slate-600", textContent: noteLine }),
      El("div", { className: "text-xs text-slate-500 grid grid-cols-1 md:grid-cols-2 gap-2" }, [
        El("span", { textContent: "Verification policy version: " + (feePolicy.policyVersion || "Unavailable") }),
        El("span", { textContent: "Connected account: " + (stripeConnect.accountIdMasked || "Not connected") })
      ]),
      El("div", { className: "flex flex-wrap items-center gap-2" }, [requestBtn, docSubmitButton, connectBtn, disconnectBtn])
    ])
  ]);
}

function renderHostListingsSection(listings, hostBookings) {
  const El = window.tstsEl;
  const wrap = El("section", { className: "space-y-4 mb-8" });
  wrap.appendChild(El("h2", { className: "text-xl font-bold text-gray-900", textContent: "My Listings" }));

  const countByExperienceId = new Map();
  (Array.isArray(hostBookings) ? hostBookings : []).forEach(function (b) {
    const expId = String((b && (b.experienceId || (b.experience && b.experience._id))) || "").trim();
    if (!expId) return;
    countByExperienceId.set(expId, Number(countByExperienceId.get(expId) || 0) + 1);
  });

  (Array.isArray(listings) ? listings : []).forEach(function (exp) {
    const expId = String((exp && (exp._id || exp.id)) || "").trim();
    const bookingCount = Number(countByExperienceId.get(expId) || 0);
    const verifiedStatus = String((exp && exp.verifiedStatus) || "").trim().toLowerCase();
    const privateAllowed = !!(exp && exp.privateBookingAllowed);
    const chips = [];
    if (verifiedStatus === "verified") chips.push(El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-blue-100 text-blue-700", textContent: "Verified" }));
    else if (verifiedStatus === "pending") chips.push(El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-amber-100 text-amber-700", textContent: "Verification pending" }));
    if (privateAllowed) chips.push(El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-slate-100 text-slate-700", textContent: "Private booking" }));

    wrap.appendChild(
      El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-4" }, [
        El("div", { className: "space-y-2" }, [
          El("div", { className: "flex flex-wrap items-center gap-2" }, [
            El("h3", { className: "font-bold text-lg text-gray-900", textContent: sanitizeExperienceTitle(String((exp && exp.title) || "Untitled listing")) })
          ].concat(chips)),
          El("p", { className: "text-sm text-gray-500", textContent: String((exp && exp.city) || "Location TBA") + " • " + formatPriceLabel(exp && exp.price) }),
          El("p", { className: "text-xs text-gray-500", textContent: "Bookings received: " + bookingCount })
        ]),
        El("div", { className: "flex flex-wrap items-center gap-2" }, [
          El("a", {
            href: "host.html?edit=" + encodeURIComponent(expId),
            className: "inline-flex items-center px-4 py-2 bg-tsts-ink text-white text-sm font-bold rounded-xl shadow hover:bg-slate-800 transition",
            textContent: "Edit Listing"
          }),
          El("a", {
            href: "experience.html?id=" + encodeURIComponent(expId),
            className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 transition",
            textContent: "View Public Page"
          })
        ])
      ])
    );
  });

  return wrap;
}

function renderHostBookingsSection(bookings) {
  const El = window.tstsEl;
  const wrap = El("section", { className: "space-y-4" });
  wrap.appendChild(El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Recent Booking Requests" }));

  if (!Array.isArray(bookings) || bookings.length === 0) {
    wrap.appendChild(
      El("div", { className: "bg-white p-6 rounded-2xl border border-gray-100 text-gray-500", textContent: "No bookings yet. Your listing is live and ready." })
    );
    return wrap;
  }

  bookings.forEach(function(b) {
    const dt = safeDate(b.bookingDate || b.experienceDate || b.createdAt);
    const month = dt ? dt.toLocaleString("default", { month: "short" }) : "--";
    const day = dt ? dt.getDate() : "--";

    const exp = b.experience || {};
    const title = sanitizeExperienceTitle(exp.title || b.title || "Listing");

    const guest = b.guestId || b.user || {};
    const guestName = guest.name || b.guestName || "Unknown Guest";
    const pax = b.guests || b.numGuests || b.guestCount || "-";
    const paid = b.amountTotal || (b.pricing && b.pricing.totalPrice) || "";
    const policyVersion = bookingPolicyVersion(b) || "Unavailable";
    const policyEffective = formatPolicyEffective(b) || "Unavailable";
    const refundState = stateLabel(b && b.refundDecision && b.refundDecision.status);
    const payoutState = stateLabel(b && b.payoutStatus);
    const paymentState = stateLabel(b && b.paymentStatus);
    const disputeActive = !!(b && b.dispute && b.dispute.active === true);
    const payoutGrossCents = Number(
      (b && b.payoutGrossHostCents != null) ? b.payoutGrossHostCents :
      (b && b.pricingSnapshot && b.pricingSnapshot.hostPayoutCents != null) ? b.pricingSnapshot.hostPayoutCents :
      (b && b.feeBreakdown && b.feeBreakdown.hostPayoutCents != null) ? b.feeBreakdown.hostPayoutCents :
      (b && b.pricing && b.pricing.hostPayoutCents != null) ? b.pricing.hostPayoutCents :
      NaN
    );
    const payoutVerificationFeeCents = Number(
      (b && b.payoutVerificationFeeCents != null) ? b.payoutVerificationFeeCents :
      (b && b.eventVerificationFee && b.eventVerificationFee.amountCents != null) ? b.eventVerificationFee.amountCents :
      (b && b.feeBreakdown && b.feeBreakdown.eventVerificationFeeCents != null) ? b.feeBreakdown.eventVerificationFeeCents :
      0
    );
    const payoutRecoveryOffsetCents = Number((b && b.payoutRecoveryOffsetCents != null) ? b.payoutRecoveryOffsetCents : 0);
    const payoutNetCents = Number(
      (b && b.payoutNetHostCents != null) ? b.payoutNetHostCents :
      (Number.isFinite(payoutGrossCents) ? Math.max(0, payoutGrossCents - Math.max(0, payoutVerificationFeeCents) - Math.max(0, payoutRecoveryOffsetCents)) : NaN)
    );
    const refundAmountCents = Number(b && b.refundDecision && b.refundDecision.amountCents);

    var viewBtn = El("button", {
      className: "w-full md:w-auto bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition whitespace-nowrap",
      "data-action": "guest", "data-booking-id": b._id || "", textContent: "View Details"
    });

    // Check-in / attendance controls for host
    var hostActionBtns = [viewBtn];
    var attStatus = b.attendanceStatus || null;
    if (attStatus === "checked_in") {
      hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700", textContent: "Checked in" }));
    } else if (attStatus === "no_show") {
      hostActionBtns.push(El("span", { className: "px-3 py-1.5 text-xs font-bold rounded-full bg-gray-100 text-gray-500", textContent: "No show" }));
    } else if (bookingStatusNorm === "confirmed" && (b.paymentStatus === "paid")) {
      hostActionBtns.push(El("button", {
        className: "w-full md:w-auto bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition whitespace-nowrap",
        "data-action": "otp-checkin", "data-booking-id": b._id || "", textContent: "Check In"
      }));
    }

    // Booking lifecycle status badge for host view
    var bookingStatusNorm = normalizeState(b.status);
    var bookingStatusColors = { confirmed: "bg-green-100 text-green-700", completed: "bg-blue-100 text-blue-700", cancelled: "bg-red-100 text-red-700", cancelled_by_host: "bg-red-100 text-red-700", disputed: "bg-amber-100 text-amber-700", pending_payment: "bg-gray-100 text-gray-600" };
    var bookingStatusBadgeClass = bookingStatusColors[bookingStatusNorm] || "bg-slate-100 text-slate-700";
    var bookingStatusBadge = El("span", { className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold " + bookingStatusBadgeClass, textContent: stateLabel(bookingStatusNorm) });

    var card = El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 mb-4" }, [
      El("div", { className: "flex items-center gap-4 w-full" }, [
        El("div", { className: "bg-orange-50 text-orange-600 w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-orange-100 flex-shrink-0" }, [
          El("span", { className: "text-xs font-bold uppercase", textContent: month }),
          El("span", { className: "text-xl font-bold", textContent: String(day) })
        ]),
        El("div", {}, [
          El("div", { className: "flex items-center gap-2 mb-1" }, [
            El("h3", { className: "font-bold text-lg text-gray-900", textContent: title }),
            bookingStatusBadge
          ]),
          El("p", { className: "text-sm text-gray-500" }, ["Guest: ", El("span", { className: "font-bold text-gray-700", textContent: guestName })]),
          El("div", { className: "flex gap-4 text-xs text-gray-400 mt-1" }, [
            El("span", { textContent: "Paid: " + (paid !== "" ? "$" + paid : "—") }),
            El("span", { textContent: "•" }),
            El("span", { textContent: pax + " Pax" })
          ]),
          El("div", { className: "flex flex-wrap gap-2 mt-2" }, [
            El("span", { className: "px-2 py-1 text-[11px] font-bold rounded bg-slate-100 text-slate-700", textContent: "Payment: " + paymentState }),
            El("span", { className: "px-2 py-1 text-[11px] font-bold rounded bg-slate-100 text-slate-700", textContent: "Refund: " + refundState }),
            El("span", { className: "px-2 py-1 text-[11px] font-bold rounded bg-slate-100 text-slate-700", textContent: "Payout: " + payoutState }),
            disputeActive ? El("span", { className: "px-2 py-1 text-[11px] font-bold rounded bg-red-100 text-red-700", textContent: "Dispute Active" }) : El("span", { className: "hidden", textContent: "" })
          ]),
          El("div", { className: "text-xs text-slate-500 mt-2 flex flex-col gap-1" }, [
            El("span", { textContent: "Policy: " + policyVersion + " • Effective: " + policyEffective }),
            El("span", { textContent: "Payout gross: " + (Number.isFinite(payoutGrossCents) ? centsToMoney(payoutGrossCents) : "—") }),
            El("span", { textContent: "Verification deduction: -" + (Number.isFinite(payoutVerificationFeeCents) ? centsToMoney(Math.max(0, payoutVerificationFeeCents)) : "—") }),
            El("span", { textContent: "Recovery offset: -" + (Number.isFinite(payoutRecoveryOffsetCents) ? centsToMoney(Math.max(0, payoutRecoveryOffsetCents)) : "—") }),
            El("span", { className: "font-semibold text-slate-700", textContent: "Net payout: " + (Number.isFinite(payoutNetCents) ? centsToMoney(payoutNetCents) : "—") }),
            El("span", { textContent: "Refund amount: " + (Number.isFinite(refundAmountCents) ? centsToMoney(refundAmountCents) : "—") })
          ])
        ])
      ]),
      El("div", { className: "flex flex-col gap-2 items-end flex-shrink-0" }, hostActionBtns)
    ]);
    wrap.appendChild(card);
  });

  return wrap;
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

function renderHostingSectionTabs(activeSection) {
  const El = window.tstsEl;
  const nav = El("nav", { className: "bg-white rounded-2xl border border-gray-100 p-2 shadow-sm" });
  const row = El("div", { className: "flex flex-wrap items-center gap-2" });
  HOSTING_SECTION_KEYS.forEach(function (key) {
    const isActive = key === activeSection;
    row.appendChild(
      El("button", {
        type: "button",
        className: (isActive
          ? "bg-tsts-ink text-white border-tsts-ink"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50") + " px-4 py-2 rounded-xl border text-sm font-bold transition",
        "data-action": "host-switch-section",
        "data-host-section": key,
        textContent: HOSTING_SECTION_LABELS[key] || key
      })
    );
  });
  nav.appendChild(row);
  return nav;
}

function renderHostSourceLoading(text) {
  const El = window.tstsEl;
  return El("div", { className: "bg-white p-6 rounded-2xl border border-gray-100 text-sm text-gray-500 flex items-center gap-2" }, [
    El("i", { className: "fas fa-spinner fa-spin text-gray-400" }),
    El("span", { textContent: text || "Loading..." })
  ]);
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
      El("p", { className: "font-bold", textContent: "Host ownership fallback is restricted." }),
      El("p", { textContent: "Multiple active users share this display name. Set or verify your handle for deterministic admin listing attribution." })
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

  const cards = [
    { label: "Total listings", value: formatMetricValue(listingsState.status, summary.totalListings) },
    { label: "Active listings", value: formatMetricValue(listingsState.status, summary.activeListings) },
    { label: "Paused listings", value: formatMetricValue(listingsState.status, summary.pausedListings) },
    {
      label: "Pending private requests",
      value: formatMetricValue(requestsState.status, Array.isArray(requestsState.rows) ? requestsState.rows.length : 0)
    },
    {
      label: "Host bookings count",
      value: formatMetricValue(bookingsState.status, Array.isArray(bookingsState.rows) ? bookingsState.rows.length : 0)
    },
    { label: "Verification status", value: verificationStatus }
  ];

  const section = El("section", { className: "space-y-4" }, [
    El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Hosting Overview" })
  ]);
  const grid = El("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3" });
  cards.forEach(function (card) {
    grid.appendChild(
      El("div", { className: "bg-white rounded-xl border border-gray-100 p-4 shadow-sm" }, [
        El("p", { className: "text-xs uppercase tracking-wide text-gray-500", textContent: card.label }),
        El("p", { className: "text-2xl font-bold text-gray-900 mt-1", textContent: String(card.value || "0") })
      ])
    );
  });
  section.appendChild(grid);

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
      hostDashboardState.reviews = { status: "error", data: null, message: String((payload && payload.error) || "Failed to load reviews.") };
      renderHostingDashboard();
      return;
    }
    var d = (payload && payload.data) ? payload.data : {};
    hostDashboardState.reviews = { status: "ready", data: d, message: "" };
    renderHostingDashboard();
  } catch (_) {
    hostDashboardState.reviews = { status: "error", data: null, message: "Failed to load reviews." };
    renderHostingDashboard();
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
      window.tstsNotify(String((payload && payload.error) || "Failed to update preference."), "error");
      return;
    }
    var d = hostDashboardState.reviews.data || {};
    d.hostDigestOptOut = next;
    hostDashboardState.reviews.data = d;
    renderHostingDashboard();
    window.tstsNotify(next ? "Daily digest email turned off." : "Daily digest email turned on.", "success");
  } catch (_) {
    window.tstsNotify("Failed to update preference.", "error");
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
function openCheckinModal(bookingId) {
  var b = hostBookingsCache.find(function (x) { return (x._id || "") === bookingId; });
  if (!b) return;
  var nameEl = document.getElementById("checkin-guest-name");
  if (nameEl) nameEl.textContent = "Guest: " + (b.guestName || "—") + " (" + (b.numGuests || 1) + " pax)";
  var otpInput = document.getElementById("checkin-otp");
  if (otpInput) otpInput.value = "";
  var seatsSelect = document.getElementById("checkin-seats");
  if (seatsSelect) {
    seatsSelect.textContent = "";
    for (var i = 1; i <= (b.numGuests || 1); i++) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === (b.numGuests || 1)) opt.selected = true;
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
          if (errorEl) { errorEl.textContent = (data && data.message) || (data && data.error) || "Check-in failed."; errorEl.classList.remove("hidden"); }
          confirmBtn.disabled = false;
          return;
        }
        closeCheckinModal();
        if (window.tstsNotify) window.tstsNotify("Guest checked in!", "success");
        // Refresh host bookings
        try { await loadHostBookings(); } catch (_) {}
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
      if (window.tstsNotify) window.tstsNotify((data && data.message) || "Entry code not available yet.", "warning");
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

// Make close functions globally accessible for onclick handlers
window.closeCheckinModal = closeCheckinModal;
window.closeEntryPass = closeEntryPass;

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
      var errMsg = String((payload && payload.error) || "Failed to submit reply.");
      if (errMsg === "HOST_REPLY_EDIT_WINDOW_CLOSED") errMsg = "Edit window has closed (24 hours from first reply).";
      if (errMsg === "HOST_REPLY_ALREADY_EXISTS") errMsg = "You have already replied to this review.";
      if (errMsg === "HOST_REPLY_CONTAINS_PII") errMsg = "Reply cannot contain personal contact information (email or phone).";
      if (errorEl) { errorEl.textContent = errMsg; errorEl.classList.remove("hidden"); }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove("opacity-60", "cursor-not-allowed"); }
      return;
    }
    closeHostReplyModal();
    window.tstsNotify("Reply posted successfully.", "success");
    loadHostReviewsSummary();
  } catch (_) {
    if (errorEl) { errorEl.textContent = "Failed to submit reply. Please try again."; errorEl.classList.remove("hidden"); }
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
  var headerRow = El("div", { className: "flex flex-col md:flex-row md:items-center md:justify-between gap-3" }, [
    El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Reviews & Performance" })
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
        El("h3", { className: "text-xl font-bold text-gray-900 mb-2", textContent: "No reviews yet" }),
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
      El("p", { className: "text-2xl font-bold text-gray-900", textContent: totalReviews > 0 ? avgRating.toFixed(1) : "—" }),
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
            El("div", { className: "h-full bg-orange-400 rounded-full transition-all", style: "width:" + pct + "%" })
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
        reviewCard.appendChild(El("p", { className: "text-sm text-gray-700", textContent: rv.comment }));
      }

      // Host reply block
      var hostReply = String(rv.hostReply || "").trim();
      if (hostReply) {
        var replyBlock = El("div", { className: "mt-2 pl-4 border-l-2 border-orange-200 bg-orange-50/50 rounded-r-lg p-3" }, [
          El("div", { className: "flex items-center justify-between gap-2 mb-1" }, [
            El("span", { className: "text-xs font-bold text-orange-700 uppercase tracking-wide", textContent: "Your Reply" })
          ]),
          El("p", { className: "text-sm text-slate-700", textContent: hostReply })
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
          El("p", { className: "text-sm text-gray-700", textContent: cm.text || "" })
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
    if (listingRows.length === 0) {
      return El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
        El("div", { className: "text-5xl mb-4", textContent: "🍳" }),
        El("h3", { className: "text-xl font-bold text-gray-900 mb-2", textContent: "No listings yet" }),
        El("p", { className: "text-gray-500 mb-6", textContent: "Create your first experience and it will appear here for editing." }),
        El("a", { href: "host.html", className: "inline-block bg-tsts-ink text-white px-8 py-3 rounded-full font-bold shadow hover:bg-slate-800 transition", textContent: "Create Listing" })
      ]);
    }
    return renderHostListingsSection(listingRows, bookingsState.status === "ready" ? bookingsState.rows : []);
  }

  if (section === "bookings") {
    if (bookingsState.status === "loading") return renderHostSourceLoading("Loading booking requests...");
    if (bookingsState.status === "error") return renderHostSourceError("Bookings unavailable", bookingsState.message, "Retry Bookings");
    return renderHostBookingsSection(bookingsState.rows);
  }

  if (section === "private-requests") {
    if (requestsState.status === "loading") return renderHostSourceLoading("Loading private requests...");
    if (requestsState.status === "error") return renderHostSourceError("Private requests unavailable", requestsState.message, "Retry Private Requests");
    return renderHostPrivateRequestActionsPanel(requestsState.rows);
  }

  if (section === "verification-payout") {
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

  return renderHostOverviewSection();
}

function renderHostingDashboard() {
  if (!contentEl) return;
  const El = window.tstsEl;
  contentEl.textContent = "";
  const wrap = El("div", { className: "space-y-4" }, [
    renderHostingSectionTabs(hostDashboardState.section),
    renderHostOwnershipWarnings(hostDashboardState.listings.warnings),
    renderHostingSectionContent()
  ]);
  contentEl.appendChild(wrap);
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
        message: String((payload && payload.message) || "Failed to load listings.")
      };
    }

    const root = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
    const items = Array.isArray(root && root.items) ? root.items : [];
    const summary = computeListingsSummary(items, root && root.summary);
    const warnings = Array.isArray(root && root.warnings) ? root.warnings : [];
    return {
      status: "ready",
      items: items,
      summary: summary,
      warnings: warnings,
      message: ""
    };
  } catch (_) {
    return { status: "error", items: [], summary: null, warnings: [], message: "Failed to load listings." };
  }
}

async function fetchHostBookingsSource() {
  try {
    const res = await window.authFetch("/api/bookings/host-bookings", { method: "GET" });
    const payload = await res.json().catch(() => []);
    if (!res.ok) {
      return { status: "error", rows: [], message: String((payload && payload.message) || "Failed to load booking requests.") };
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
    const res = await window.authFetch("/api/host/private-booking-requests?status=pending&limit=100", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", rows: [], message: String((payload && payload.message) || "Failed to load private requests.") };
    }
    const rows = Array.isArray(payload && payload.requests) ? payload.requests : [];
    return { status: "ready", rows: rows, message: "" };
  } catch (_) {
    return { status: "error", rows: [], message: "Failed to load private requests." };
  }
}

async function fetchHostVerificationSource() {
  try {
    const res = await window.authFetch("/api/host/verification/status", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", data: null, message: String((payload && payload.message) || "Failed to load verification and payout status.") };
    }
    return { status: "ready", data: parseHostVerificationPayload(payload), message: "" };
  } catch (_) {
    return { status: "error", data: null, message: "Failed to load verification and payout status." };
  }
}

async function loadHost(sectionOverride) {
  if (!(await requireAuthOrRedirect())) return;

  hostDashboardState.section = resolveHostingSection(sectionOverride || hostDashboardState.section || dashboardDeepLink.section, dashboardDeepLink.panel);
  hostDashboardState.listings = { status: "loading", items: [], summary: null, warnings: [], message: "" };
  hostDashboardState.bookings = { status: "loading", rows: [], message: "" };
  hostDashboardState.privateRequests = { status: "loading", rows: [], message: "" };
  hostDashboardState.verification = { status: "loading", data: null, message: "" };
  renderHostingDashboard();
  syncDashboardTabQuery("hosting", hostDashboardState.section);

  try {
    const [listingsState, bookingsState, privateRequestsState, verificationState] = await Promise.all([
      fetchHostListingsSource(),
      fetchHostBookingsSource(),
      fetchHostPrivateRequestsSource(),
      fetchHostVerificationSource()
    ]);

    hostDashboardState.listings = listingsState;
    hostDashboardState.bookings = bookingsState;
    hostDashboardState.privateRequests = privateRequestsState;
    hostDashboardState.verification = verificationState;
    hostBookingsCache = (bookingsState.status === "ready" && Array.isArray(bookingsState.rows)) ? bookingsState.rows : [];

    renderHostingDashboard();
    focusDashboardDeepLinkPanel();
  } catch (_) {
    setError("Failed to load hosting data.");
  }
}

/* ====================== GUEST MODAL ====================== */

function openGuestModalById(bookingId) {
  const b = hostBookingsCache.find(x => (x._id || "") === bookingId);
  if (!b) return;

  const titleEl = document.getElementById("modal-experience-title");
  const listEl = document.getElementById("modal-guest-list");

  if (titleEl) titleEl.textContent = "Booking Details";

  const guest = b.guestId || b.user || {};
  const name = guest.name || b.guestName || "Unknown";
  const email = guest.email || b.guestEmail || "No Email";

  if (listEl) {
    const El = window.tstsEl;
    listEl.textContent = "";
    // WS-FE-06: Use safe mailto helper - if invalid, show email as text (no link)
    var safeMailto = window.tstsSafeMailto ? window.tstsSafeMailto(email) : "";
    var emailEl = safeMailto
      ? El("a", { href: safeMailto, className: "text-orange-600 hover:underline text-sm", textContent: email })
      : El("span", { className: "text-gray-600 text-sm", textContent: email });
    listEl.appendChild(
      El("div", { className: "flex items-start gap-4" }, [
        El("div", { className: "bg-gray-200 rounded-full w-12 h-12 flex items-center justify-center text-xl", textContent: "👤" }),
        El("div", {}, [
          El("p", { className: "font-bold text-lg text-gray-900", textContent: name }),
          emailEl
        ])
      ])
    );
    listEl.appendChild(
      El("div", { className: "bg-gray-50 p-4 rounded-lg border border-gray-100 mt-4 text-sm" }, [
        El("p", { className: "font-bold text-gray-500 text-xs uppercase mb-1", textContent: "Guest Note" }),
        El("p", { className: "italic text-gray-700", textContent: b.guestNotes || "No notes provided." })
      ])
    );
  }

  _openModal(guestModal);
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

/* ====================== EVENT WIRING ====================== */

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await requireAuthOrRedirect())) return;

  if (tabTrips) tabTrips.addEventListener("click", () => { toggleTab("trips"); loadTrips(); });
  if (tabHost) tabHost.addEventListener("click", () => {
    toggleTab("hosting");
    loadHost(hostDashboardState.section || dashboardDeepLink.section || "overview");
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
    if (action === "host-retry-load") {
      loadHost(hostDashboardState.section || "overview");
      return;
    }

    if (action === "cancel") openCancelReviewModalById(bid);
    if (action === "review") openReviewModal(bid, expId);
    if (action === "complaint") openComplaintModalById(bid);
    if (action === "guest") openGuestModalById(bid);
    if (action === "otp-checkin") openCheckinModal(bid);
    if (action === "view-otp") viewEntryCode(bid);
    if (action === "toggle-visibility") {
      const toFriends = String(toFriendsRaw || "").toLowerCase() === "true";
      updateBookingVisibility(bid, toFriends);
    }
    if (action === "host-private-request-status") {
      handleHostPrivateRequestAction(requestId, requestStatus);
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
      return;
    }
    _trapFocus(e);
  });

  // Default load
  loadActivePolicySnapshot().catch(() => {});
  const initialTab = resolveDashboardTab(dashboardDeepLink.tab);
  hostDashboardState.section = resolveHostingSection(dashboardDeepLink.section, dashboardDeepLink.panel);
  toggleTab(initialTab);
  if (initialTab === "hosting") loadHost(hostDashboardState.section);
  else loadTrips();
});
