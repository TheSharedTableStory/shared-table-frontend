// js/success.js
// ─────────────────────────────────────────────────────────────────────────
// Owner 2026-05-30 (S2 world-best): support helpers for the rebuilt summary
// card — time formatting (mirrors experience.js formatSlotForDisplay), price
// formatter, cancellation deadline (one-liner from the active policy tiers),
// and the .ics calendar-file data URL for the Add-to-Calendar action.
// ─────────────────────────────────────────────────────────────────────────
function formatSlotForDisplaySuccess(slot) {
  const raw = String(slot || "").trim();
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return raw;
  function part(hStr, mStr) {
    const h = parseInt(hStr, 10);
    const period = h >= 12 ? "PM" : "AM";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return String(h12) + ":" + mStr + " " + period;
  }
  return part(m[1], m[2]) + " – " + part(m[3], m[4]);
}

// Minor units → major units. A fixed /100 is only right for a two-decimal currency: a ¥2,800
// booking rendered as ¥28.00 on the receipt screen. The backend was fixed for this; this is the
// matching frontend rule so a booking never reads one figure in an email and another on screen.
function __successCurrencyDecimals(ccy) {
  return String(ccy || "aud").trim().toLowerCase() === "jpy" ? 0 : 2;
}
function __successMinorToMajor(minor, ccy) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, __successCurrencyDecimals(ccy));
}

function formatPriceForSuccess(amount, ccy) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num) || num <= 0) return "—";
  const symbol = ({ AUD: "A$", USD: "US$", EUR: "€", GBP: "£", JPY: "¥" })[ccy] || (ccy + " ");
  const isWhole = num === Math.floor(num);
  return symbol + (isWhole ? String(num) : num.toFixed(2));
}

async function populateCancellationDeadline(booking, experience) {
  if (!booking || !booking.bookingDate || !booking.timeSlot) return;
  let policyRes;
  try {
    // sir 2026-08-16 ("Forgiven — fix the deadline card"): this was a RAW relative
    // fetch that hit the static origin instead of the API server, so the deadline
    // card NEVER rendered anywhere — found only when the element was truly walked.
    // authFetch carries the platform's API base like every other call on this page.
    const r = await window.authFetch("/api/policy/active");
    if (!r.ok) return;
    policyRes = await r.json();
  } catch (_polErr) { void _polErr; return; }
  const rules = (policyRes && policyRes.data && policyRes.data.policy && policyRes.data.policy.rules) || (policyRes && policyRes.policy && policyRes.policy.rules) || null;
  if (!rules || !Array.isArray(rules.userCancelTiers) || rules.userCancelTiers.length === 0) return;
  const tiers = rules.userCancelTiers.slice().sort(function (a, b) { return Number(b.hoursBeforeStartMin || 0) - Number(a.hoursBeforeStartMin || 0); });
  // Compute slot start ms (mirror of experience.js computeSlotStartMs).
  const slotStartMs = computeSlotStartMsForSuccess(booking.bookingDate, booking.timeSlot, (experience && experience.timezone) || "Australia/Melbourne");
  if (!slotStartMs) return;
  // sir 2026-08-16 ("Fix it", scenario defect): the card used to print the MOST
  // generous tier blindly — a guest booking a near date read a deadline already
  // days in the past ("Cancel by Sat, 15 Aug" on a booking made 16 Aug). Walk the
  // tiers from most to least generous and show the best one whose window is still
  // OPEN; when no refund window remains, say so honestly instead of promising
  // the impossible.
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: (experience && experience.timezone) || "Australia/Melbourne",
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true
  });
  const nowMs = Date.now();
  let shown = false;
  for (let ti = 0; ti < tiers.length; ti++) {
    const pct = Math.round((Number(tiers[ti].refundPercent) || 0) * 100);
    if (pct <= 0) continue;
    const hrs = Number(tiers[ti].hoursBeforeStartMin) || 0;
    const deadlineMs = slotStartMs - hrs * 3600 * 1000;
    if (deadlineMs > nowMs) {
      successCancelTextEl.textContent = "Cancel by " + fmt.format(new Date(deadlineMs)) + " for up to " + String(pct) + "% back. See your booking dashboard for the full schedule.";
      shown = true;
      break;
    }
  }
  if (!shown) {
    // Every refund window has closed (or none carries a refund). The truth, plainly.
    if (slotStartMs > nowMs) {
      successCancelTextEl.textContent = "The refund window for this booking has closed. You can still cancel from your booking dashboard, but a refund no longer applies.";
    } else {
      return; // experience already started or passed — no cancellation line at all
    }
  }
  successCancelWrapEl.classList.remove("hidden");
}

function computeSlotStartMsForSuccess(dateStr, slotStr, tz) {
  if (!dateStr || !slotStr) return 0;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(slotStr));
  if (!m) return 0;
  const dParts = String(dateStr).split("-");
  if (dParts.length !== 3) return 0;
  const y = parseInt(dParts[0], 10), mo = parseInt(dParts[1], 10), da = parseInt(dParts[2], 10);
  const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  try {
    const utcGuess = Date.UTC(y, mo - 1, da, hh, mm, 0);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date(utcGuess));
    const gv = function (t) { const f = parts.find(function (x) { return x.type === t; }); return f ? +f.value : 0; };
    let tHh = gv("hour"); if (tHh === 24) tHh = 0;
    const tzShown = Date.UTC(gv("year"), gv("month") - 1, gv("day"), tHh, gv("minute"), 0);
    return utcGuess - (tzShown - utcGuess);
  } catch (_e) { void _e; return new Date(y, mo - 1, da, hh, mm, 0).getTime(); }
}

function buildIcsDataUrl(title, booking, experience) {
  if (!booking || !booking.bookingDate || !booking.timeSlot) return "#";
  const tz = (experience && experience.timezone) || "Australia/Melbourne";
  const startMs = computeSlotStartMsForSuccess(booking.bookingDate, booking.timeSlot, tz);
  if (!startMs) return "#";
  // Parse the end-time from the slot string ("10:00-13:00" → 13:00 end).
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(String(booking.timeSlot));
  let endMs = startMs + 2 * 3600 * 1000; // sensible default = 2h
  if (m) {
    const hh1 = parseInt(m[1], 10), mm1 = parseInt(m[2], 10);
    const hh2 = parseInt(m[3], 10), mm2 = parseInt(m[4], 10);
    const durationMin = (hh2 * 60 + mm2) - (hh1 * 60 + mm1);
    if (durationMin > 0) endMs = startMs + durationMin * 60 * 1000;
  }
  const toIcsTime = function (ms) {
    const d = new Date(ms);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z";
  };
  const addr = String((experience && experience.addressLine) || "").trim();
  const sub = String((experience && experience.suburb) || "").trim();
  const city = String((experience && experience.city) || "").trim();
  const state = String((experience && experience.state) || "").trim();
  const pc = String((experience && experience.postcode) || "").trim();
  const location = [addr, [sub, city, state, pc].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const desc = "Your entry code: " + String((booking && (booking.otp || booking.otpPlain || booking.otpCode)) || "(check your email)") + "\\nView details at " + window.location.origin + "/my-bookings.html";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Shared Table Story//Booking//EN",
    "BEGIN:VEVENT",
    "UID:" + String((booking && (booking._id || booking.bookingId || booking.id)) || ("booking-" + startMs)) + "@thesharedtablestory.com",
    "SUMMARY:" + (title || "Your experience"),
    "DTSTART:" + toIcsTime(startMs),
    "DTEND:" + toIcsTime(endMs),
    location ? "LOCATION:" + location : "",
    "DESCRIPTION:" + desc,
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines);
}
// ─────────────────────────────────────────────────────────────────────────
const loadingStateEl = document.getElementById("loading-state");
const successStateEl = document.getElementById("success-state");
const errorStateEl = document.getElementById("error-state");
const errorMessageEl = document.getElementById("error-message");

// Booking summary elements
const successExpImageEl = document.getElementById("success-exp-image");
const successExpImageLinkEl = document.getElementById("success-exp-image-link");
const successExpTitleEl = document.getElementById("success-exp-title");
const successExpTitleLinkEl = document.getElementById("success-exp-title-link");
const successVerifiedBadgeEl = document.getElementById("success-verified-badge");
const successHostAvatarEl = document.getElementById("success-host-avatar");
const successHostInitialsEl = document.getElementById("success-host-initials");
const successHostProfileLinkEl = document.getElementById("success-host-profile-link");
const successExpDateEl = document.getElementById("success-exp-date");
const successExpGuestsEl = document.getElementById("success-exp-guests");
const successExpTimeEl = document.getElementById("success-exp-time");
const successExpTotalEl = document.getElementById("success-exp-total");
const successExpHostEl = document.getElementById("success-exp-host");
const successExpAddressEl = document.getElementById("success-exp-address");
const successExpMapLinkEl = document.getElementById("success-exp-map-link");
const successExpOtpEl = document.getElementById("success-exp-otp");
const successOtpCopyBtnEl = document.getElementById("success-otp-copy");
const successOtpCopyFeedbackEl = document.getElementById("success-otp-copy-feedback");
const successOtpLabelEl = document.getElementById("success-otp-label");
const successOtpHelperEl = document.getElementById("success-otp-helper");
// Owner 2026-05-30 (S2 world-best): prep section + actions + cancellation deadline + booking id.
const successPrepSectionEl = document.getElementById("success-prep-section");
const successAboutWrapEl = document.getElementById("success-about-wrap");
const successExpAboutEl = document.getElementById("success-exp-about");
const successAboutToggleEl = document.getElementById("success-about-toggle");
const successBringWrapEl = document.getElementById("success-bring-wrap");
const successExpBringEl = document.getElementById("success-exp-bring");
const successJoiningWrapEl = document.getElementById("success-joining-wrap");
const successExpJoiningEl = document.getElementById("success-exp-joining");
const successCancelWrapEl = document.getElementById("success-cancel-wrap");
const successCancelTextEl = document.getElementById("success-cancel-text");
const successActionCalendarEl = document.getElementById("success-action-calendar");
const successBookingIdEl = document.getElementById("success-booking-id");

// Viral loop elements
const inviteLinkInputEl = document.getElementById("invite-link-input");
const copyInviteBtnEl = document.getElementById("copy-invite-btn");
const copyFeedbackEl = document.getElementById("copy-feedback");

// Parse URL params: bookingId, sessionId, (optionally) experienceId
const urlParams = new URLSearchParams(window.location.search);
const bookingIdFromUrl = urlParams.get("bookingId") || urlParams.get("booking_id");
const sessionId = urlParams.get("sessionId") || urlParams.get("session_id");
const experienceIdFromUrl = urlParams.get("experienceId"); // optional

// ── PRIVATE BOOKING REQUEST — hold state (Owner 2026-06-03) ──────────────────
// When a private booking request is sent the guest lands here with ?holdPlaced=1
// (and usually &requestId=…). This is NOT a confirmed booking — a Stripe
// authorization HOLD was placed. The hold renders through the SAME #success-state
// card as a confirmed booking, via populateBookingSummary(booking, {isHold:true}).
const holdPlacedFromUrl = urlParams.get("holdPlaced") === "1" || urlParams.get("hold_placed") === "1";
const requestIdFromUrl = urlParams.get("requestId") || urlParams.get("request_id") || "";

function resolveBookingId(verifyPayload, fallbackBookingId) {
  const root = (verifyPayload && typeof verifyPayload === "object") ? verifyPayload : {};
  const data = (root.data && typeof root.data === "object") ? root.data : root;
  const nestedBooking = (data.booking && typeof data.booking === "object") ? data.booking : {};
  return String(
    fallbackBookingId ||
    data.bookingId ||
    data.booking_id ||
    data.id ||
    nestedBooking._id ||
    nestedBooking.id ||
    ""
  ).trim();
}

function collectBookingRows(envelope) {
  const root = (envelope && typeof envelope === "object") ? envelope : {};
  const data = (root.data && typeof root.data === "object") ? root.data : root;
  if (Array.isArray(root)) return root;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.bookings)) return data.bookings;
  if (Array.isArray(root.bookings)) return root.bookings;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(root.items)) return root.items;
  if (data.booking && typeof data.booking === "object") return [data.booking];
  if (root.booking && typeof root.booking === "object") return [root.booking];
  return [];
}

function applySummaryFallback(title, dateText, guestsText, inviteUrl) {
  if (successExpTitleEl) successExpTitleEl.textContent = title;
  if (successExpDateEl) successExpDateEl.textContent = dateText;
  if (successExpGuestsEl) successExpGuestsEl.textContent = guestsText || "";
  if (inviteLinkInputEl) inviteLinkInputEl.value = inviteUrl || (window.location.origin + "/explore.html");
  applySafeBookingImage("/assets/experience-default.jpg", title || "Experience image");
}

function applySafeBookingImage(primaryUrl, altText, allImages) {
  if (!successExpImageEl) return;
  const fallback = "/assets/experience-default.jpg";
  // Owner 2026-06-06: the success/hold page hero shows ALL host photos in a carousel
  // (same tstsBuildImageCarousel helper + locked glass-arrow chrome as the trip card and
  // the experience page). Single image -> the original <img>, no chrome.
  var list = [];
  (function () {
    var seen = {};
    var push = function (u) { if (u && typeof u === "string" && !seen[u]) { seen[u] = 1; list.push(u); } };
    push(primaryUrl);
    if (Array.isArray(allImages)) allImages.forEach(push);
  })();
  var link = document.getElementById("success-exp-image-link");
  if (link && window.tstsBuildImageCarousel && list.length > 1) {
    var prev = link.querySelector("[data-success-carousel]");
    if (prev) prev.remove();
    var carousel = window.tstsBuildImageCarousel(list, { aspectRatio: "16 / 9", rounded: "", alt: altText || "Experience image", fallback: fallback });
    carousel.setAttribute("data-success-carousel", "1");
    carousel.style.maxHeight = "320px";
    successExpImageEl.style.display = "none";
    link.appendChild(carousel);
    return;
  }
  if (link) { var prevC = link.querySelector("[data-success-carousel]"); if (prevC) prevC.remove(); }
  successExpImageEl.style.display = "";
  const resolvedPrimary = String(primaryUrl || "").trim() || fallback;
  successExpImageEl.alt = altText || "Experience image";
  successExpImageEl.onerror = function () {
    if (successExpImageEl.src.indexOf(fallback) !== -1) return;
    successExpImageEl.src = fallback;
  };
  if (window.tstsSafeImg) {
    window.tstsSafeImg(successExpImageEl, resolvedPrimary, fallback);
    return;
  }
  successExpImageEl.src = resolvedPrimary;
}

// ─────────────────────────────────────────────────────────────────────────
// Owner 2026-06-01: world-best entry code — fetch the real 6-digit OTP from
// the existing entry-code endpoint and render it in #success-exp-otp. The
// endpoint enforces guest-only authz + confirmed+paid gate + decrypts otpEnc,
// so this is a frontend-only change. On any failure, the placeholder text
// set by populateBookingSummary ("Check your email") stays put.
// ─────────────────────────────────────────────────────────────────────────
// Entry-code display states (owner 2026-06-02). The prior fallback rendered
// "Available closer to the event" in the BIG 6-digit monospace style, which
// (a) looked wrong for a sentence and (b) was misleading — the endpoint has NO
// time-delay; it returns the code the instant otpEnc exists, and a real booking
// generates it at confirm (R12 fix even emails it at booking time). So we show
// the real code in big-mono, OR a normal-text honest message.
function __setOtpCodeState(code) {
  if (successExpOtpEl) {
    successExpOtpEl.textContent = code;
    successExpOtpEl.className = "font-mono font-bold text-xl sm:text-2xl text-tsts-ink";
    successExpOtpEl.style.letterSpacing = "0.12em";
  }
  if (successOtpLabelEl) successOtpLabelEl.textContent = "Show this entry code to your host on arrival";
  if (successOtpCopyBtnEl) successOtpCopyBtnEl.classList.remove("hidden");
  if (successOtpHelperEl) successOtpHelperEl.classList.remove("hidden");
}
function __setOtpMessageState(text) {
  if (successExpOtpEl) {
    successExpOtpEl.textContent = text;
    successExpOtpEl.className = "text-sm font-medium text-slate-600";
    successExpOtpEl.style.letterSpacing = "";
  }
  if (successOtpLabelEl) successOtpLabelEl.textContent = "Entry code";
  if (successOtpCopyBtnEl) successOtpCopyBtnEl.classList.add("hidden");
  if (successOtpHelperEl) successOtpHelperEl.classList.add("hidden");
}
function __bookingEventIsPast(booking) {
  try {
    const ds = String((booking && (booking.bookingDate || booking.date)) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ev = new Date(ds + "T00:00:00");
    return ev.getTime() < today.getTime();
  } catch (_pErr) { void _pErr; return false; }
}

async function fetchAndShowEntryCode(bookingId, booking) {
  if (!bookingId || !successExpOtpEl) return;
  // Past event → there is no live entry code to show; say so plainly.
  if (__bookingEventIsPast(booking)) {
    __setOtpMessageState("This experience has ended.");
    return;
  }
  let r;
  try {
    r = await window.authFetch("/api/bookings/" + encodeURIComponent(bookingId) + "/entry-code");
  } catch (_netErr) { void _netErr; return; }
  if (!r) return;
  if (r.ok) {
    let j;
    try { j = await r.json(); } catch (_parseErr) { void _parseErr; return; }
    const code = String((j && j.data && j.data.otpCode) || "").trim();
    if (code && /^\d{6}$/.test(code)) {
      __setOtpCodeState(code);
      // sir 2026-08-16 ("Fix it", walk-found): the calendar file said "check your
      // email" while this very code sat on the page — the builder ran before the
      // code arrived. Now that the page knows it, rebuild the Add-to-calendar link
      // so the downloaded file carries the real code. Unknown code → honest fallback stays.
      try {
        booking.otpCode = code;
        const __icsExp = booking.experience || booking.experienceDetails || {};
        const __icsTitle = String(__icsExp.title || booking.experienceTitle || "Your experience");
        if (successActionCalendarEl) successActionCalendarEl.href = buildIcsDataUrl(__icsTitle, booking, __icsExp);
      } catch (_icsErr) { void _icsErr; }
      return;
    }
    // 200 but no usable code — fall through to the email-backup default.
    return;
  }
  // OTP not generated yet (otpEnc absent) → honest "on its way" message, NOT
  // the misleading "closer to the event" (there is no release delay).
  try {
    const j = await r.json();
    if (j && j.error === "OTP_NOT_AVAILABLE") {
      __setOtpMessageState("Your entry code will be ready soon. We'll also email it to you before the experience.");
      return;
    }
  } catch (_jsonErr) { void _jsonErr; }
  // 401 / 403 / 404 / 500 / other — keep the populateBookingSummary fallback.
}

// Utility: show/hide states

function showLoading() {
  loadingStateEl.classList.remove("hidden");
  successStateEl.classList.add("hidden");
  errorStateEl.classList.add("hidden");}

// GIFT SEAT — sir's go-ahead 2026-08-19 («Fix P5 gift mode — go ahead»). When the paid booking is a
// GIFT, the page's self-booking voice would lie to the payer ("your seat at the table", the entry
// code, attending next-steps). This swaps WORDS and VISIBILITY only, inside the locked design:
// headline + sub-line speak the gift, the entry-code panel stays hidden (the code belongs to
// whoever holds the seat; the payer's card keeps it while unclaimed), and What-happens-next tells
// the gift story. The receiver's name comes best-effort from the invite this booking minted.
async function applyGiftSuccessMode(booking) {
  var receiverName = "";
  try {
    var invToken = String((booking && booking.giftInviteToken) || "").trim();
    if (invToken && typeof window.authFetch === "function") {
      var res = await window.authFetch("/api/invites/my-sent", { method: "GET" });
      var raw = await res.json().catch(function () { return null; });
      var rows = (raw && raw.data && raw.data.invites) || [];
      var inv = rows.find(function (i) { return String(i.token) === invToken; });
      if (inv) receiverName = String(inv.targetName || inv.targetEmail || "").trim();
    }
  } catch (_recvErr) { void _recvErr; }
  var who = receiverName || "your fellow traveller";

  var h1 = document.querySelector("#success-state h1") || document.querySelector("h1.heading-serif");
  if (h1) h1.textContent = "Your gift is on its way!";

  var emailSpan = document.getElementById("success-confirmation-email");
  var subP = emailSpan ? emailSpan.closest("p") : null;
  if (subP && emailSpan) {
    subP.textContent = "";
    subP.appendChild(document.createTextNode("It's paid and ready. We've invited " + who + " to claim their seat, and sent your confirmation to "));
    subP.appendChild(emailSpan);
    subP.appendChild(document.createTextNode("."));
  }

  var otpLabel = document.getElementById("success-otp-label");
  var otpPanel = otpLabel ? otpLabel.closest("div.rounded-2xl") : null;
  if (otpPanel) otpPanel.classList.add("hidden");

  // sir's go-ahead 2026-08-19 («Also fix the helper line»): on a gift purchase the gift-block helper
  // drops the attending phrasing — the payer just gave this seat away; another gift is "another".
  var giftHelper = document.getElementById("gift-block-helper");
  if (giftHelper) giftHelper.textContent = "Gift another paid seat to one of your connections, or invite someone new to the table.";

  var nextSteps = document.getElementById("success-next-steps");
  var list = nextSteps ? nextSteps.querySelector("ul") : null;
  if (list) {
    list.textContent = "";
    ["A gift confirmation is on its way to your inbox", who.charAt(0).toUpperCase() + who.slice(1) + " has been invited to claim the seat", "Watch the claim on your Invitations page", "The booking stays yours: re-gift it or cancel it from My Experiences"].forEach(function (line) {
      var li = document.createElement("li");
      li.className = "flex items-start gap-2";
      var tick = document.createElement("span");
      tick.className = "text-emerald-600 mt-0.5";
      tick.textContent = "✓";
      li.appendChild(tick);
      li.appendChild(document.createTextNode(" " + line));
      list.appendChild(li);
    });
  }
}

function showSuccess() {
  loadingStateEl.classList.add("hidden");
  successStateEl.classList.remove("hidden");
  errorStateEl.classList.add("hidden");  // Owner 2026-05-30 (S1): inject the user's email into the hero confirmation
  // line ("...sent a confirmation to <email>") so they see exactly where it
  // went. Falls back gracefully to the generic "your email" placeholder if the
  // session lookup fails.
  try {
    if (typeof window.tstsGetSession === "function") {
      window.tstsGetSession({ force: false }).then(function (sess) {
        const emailEl = document.getElementById("success-confirmation-email");
        if (!emailEl) return;
        const email = String((sess && sess.user && sess.user.email) || "").trim();
        if (email) emailEl.textContent = email;
      }).catch(function (_sErr) { void _sErr; });
    }
  } catch (_e) { void _e; }
}

function showError(message) {
  if (message && errorMessageEl) {
    errorMessageEl.textContent = message;
  }
  loadingStateEl.classList.add("hidden");
  successStateEl.classList.add("hidden");
  errorStateEl.classList.remove("hidden");}

// Verify payment with backend
// Owner 2026-06-05 (sir's directive — ONE success page): the HOLD renders through the
// SAME approved card (#success-state) as a confirmed booking — same hero image, host card,
// grid, REAL address, Open-in-maps, About, Booking ID — differing ONLY by logical swaps:
// entry-code slot → on-hold message; "Total paid" → "On hold"; hero → "Request sent";
// "Cancel booking" → "Withdraw request"; not-yet-applicable bits (Add-to-calendar,
// cancellation deadline) dropped. Overrides are RUNTIME + holdPlaced-gated, so the locked
// #success-state markup and the confirmed view are untouched.
// Resolve the private-request row this success page is about (by ?requestId, else the first
// actionable row). Shared by the hold render and the counter-offer auto-confirm detection.
async function __resolveHoldRow() {
  try {
    if (typeof window.authFetch !== "function") return null;
    const res = await window.authFetch("/api/my/private-requests?status=all");
    const raw = await res.json().catch(function () { return null; });
    const rows = (raw && raw.data && Array.isArray(raw.data.requests)) ? raw.data.requests : [];
    if (requestIdFromUrl) {
      for (let i = 0; i < rows.length; i++) {
        if (String((rows[i] && (rows[i]._id || rows[i].id)) || "") === String(requestIdFromUrl)) return rows[i];
      }
    }
    for (let j = 0; j < rows.length; j++) {
      const s = String((rows[j] && rows[j].status) || "").toLowerCase();
      if (s === "awaiting_host" || s === "counter_accept_pending") return rows[j];
    }
    return rows.length ? rows[0] : null;
  } catch (_e) { void _e; return null; }
}

async function renderHoldAsSuccess(preRow) {
  const row = (preRow && typeof preRow === "object") ? preRow : await __resolveHoldRow();

  const hostName = String((row && row.hostName) || "your host").trim() || "your host";

  // Map the private-request row → the booking shape populateBookingSummary expects.
  const mapped = {
    _id: String((row && (row.bookingId || row._id)) || ""),
    experienceId: String((row && row.experienceId) || ""),
    bookingDate: row && row.preferredDate,
    timeSlot: row && row.preferredTime,
    numGuests: row && row.guests,
    amountCents: row && row.amountCents,
    currency: row && row.currency,
    bookingRef: row && row.bookingRef,
    hostName: hostName,
    hostPic: row && row.hostPic,
    experience: {
      _id: String((row && row.experienceId) || ""),
      title: row && row.experienceTitle,
      images: (row && row.experienceImage) ? [row.experienceImage] : [],
      imageUrl: row && row.experienceImage,
      description: row && row.experienceAbout,
      verifiedStatus: row && row.verifiedStatus,
      hostName: hostName,
      hostId: String((row && (row.experienceHostId || row.hostId)) || ""),
      addressLine: row && row.addressLine, suburb: row && row.suburb, city: row && row.city,
      state: row && row.state, postcode: row && row.postcode, country: row && row.country,
      requirements: row && row.requirements, addressNotes: row && row.addressNotes
    }
  };

  // ONE render path: populate the card AND apply the hold swaps inline (opts.isHold). The
  // hold logic now lives in populateBookingSummary — there is no separate override pass here.
  try {
    populateBookingSummary(mapped, {
      isHold: true,
      hostName: hostName,
      requestId: String((row && (row._id || row.id)) || ""),
      note: String((row && row.note) || "")
    });
  } catch (_pErr) { void _pErr; }
  showSuccess();

  // Host avatar from the request's hostPic (populateBookingSummary keys avatar off the
  // experience object; the request row carries hostPic separately).
  try {
    if (successHostAvatarEl && row && row.hostPic) {
      successHostAvatarEl.src = String(row.hostPic);
      successHostAvatarEl.classList.remove("hidden");
      if (successHostInitialsEl) successHostInitialsEl.classList.add("hidden");
    }
  } catch (_avErr) { void _avErr; }
}

async function withdrawHoldRequest(requestId, btn) {
  if (!requestId) return;
  if (btn) { btn.disabled = true; btn.textContent = "Withdrawing…"; }
  try {
    const res = await window.authFetch("/api/private-booking-requests/" + encodeURIComponent(requestId) + "/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    // The trips side reads `sub`, never `panel`, so this used to drop the guest on "Upcoming"
    // with no sign of what they had just done. A withdrawn request is terminal and renders under
    // Past → Cancelled, which is where they should land to see it.
    if (res && res.ok) { window.location.href = "my-bookings.html?tab=experiences&sub=past"; return; }
    if (btn) { btn.disabled = false; btn.textContent = "Withdraw request"; }
    if (window.tstsNotify) window.tstsNotify("Couldn't withdraw the request. Please try again.", "error");
  } catch (_wErr) { void _wErr; if (btn) { btn.disabled = false; btn.textContent = "Withdraw request"; } if (window.tstsNotify) window.tstsNotify("Couldn't withdraw the request.", "error"); }
}

async function verifyBooking(bookingId, sessionId) {
  const url = `/api/bookings/verify`;

  const body = { sessionId };
  if (bookingId) body.bookingId = bookingId;

  const res = await window.authFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    // Owner-approved 2026-08-03 (sir, Item 2 + adjacent holes): a transient failure
    // (rate limit, server hiccup, network) must never read as a payment failure to a
    // guest who just paid. Only definitive answers are final; everything else retries.
    var failEnvelope = await res.json().catch(function () { return null; });
    if (res.status === 400 || res.status === 403 || res.status === 404) {
      throw new Error((failEnvelope && failEnvelope.message) ? String(failEnvelope.message) : "We couldn't find this booking. Please open the link from your confirmation email.");
    }
    var tErr = new Error("We're still confirming your payment. This usually takes under a minute, and this page keeps checking for you.");
    tErr.transient = true;
    throw tErr;
  }

  const data = await res.json().catch(() => ({}));
  // Gate on ok === true before trusting status
  if (!data || data.ok !== true) {
    var errMsg = (data && data.message) ? String(data.message) : "Payment verification failed";
    throw new Error(errMsg);
  }
  // Backend returns { ok: true, data: { status: "confirmed" } }
  // BUG-031 FE alignment (2026-05-15): /verify can now return paid_after_expiry,
  // paid_after_cancel, or paid_after_unexpected_terminal when Stripe captured
  // payment AFTER the booking had already transitioned to a terminal state
  // (cron expired it, host cancelled, etc). Surface these to the user with a
  // clear refund message instead of a generic error.
  var verifyStatus = (data.data && data.data.status) || (data.status) || "";
  if (verifyStatus === "confirmed" || verifyStatus === "paid") {
    return data;
  }
  if (verifyStatus === "paid_after_expiry") {
    var err1 = new Error("Your payment was received, but the booking had expired before payment completed. We will refund you within 5-10 business days. Check your inbox for a refund confirmation.");
    err1.code = "PAID_AFTER_EXPIRY";
    err1.refundExpected = true;
    throw err1;
  }
  if (verifyStatus === "paid_after_cancel") {
    var err2 = new Error("Your payment was received, but the booking had been cancelled before payment completed. We will refund you within 5-10 business days. Check your inbox for a refund confirmation.");
    err2.code = "PAID_AFTER_CANCEL";
    err2.refundExpected = true;
    throw err2;
  }
  if (verifyStatus === "paid_after_unexpected_terminal") {
    var err3 = new Error("Your payment was received, but there was an issue confirming your booking. Our team has been notified and will reach out within 24 hours." + (data.data && data.data.bookingId ? (" If you contact us first, quote this support reference: " + String(data.data.bookingId)) : ""));
    err3.code = "PAID_AFTER_UNEXPECTED_TERMINAL";
    err3.refundExpected = true;
    throw err3;
  }
  // Owner-approved 2026-08-03 (sir, Item 2): every other status is IN FLIGHT — the raw
  // word goes to the console only; the guest reads the keeps-checking copy while the
  // page retries by itself.
  console.warn("Booking verify not final yet, status:", verifyStatus);
  var pendErr = new Error("We're still confirming your payment. This usually takes under a minute, and this page keeps checking for you.");
  pendErr.transient = true;
  throw pendErr;
}

// Get bookings for current user and find matching one
async function fetchBookingDetails(bookingId, checkoutSessionId) {
  const url = `/api/bookings/my-bookings`;

  const res = await window.authFetch(url, {
    method: "GET"
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!res.ok) {
    throw new Error("Unable to load your bookings. Please try again.");
  }

  const envelope = await res.json().catch(() => ({}));
  const bookings = collectBookingRows(envelope);

  // Find booking by id (schema-safe: booking._id OR booking.bookingId)
  const bookingIdStr = String(bookingId || "").trim();
  const booking = bookings.find(function (b) {
    const rowId = String((b && (b._id || b.bookingId || b.id)) || "").trim();
    if (bookingIdStr && rowId === bookingIdStr) return true;
    const stripeSession = String((b && (b.sessionId || b.checkoutSessionId || b.stripeCheckoutSessionId)) || "").trim();
    if (!bookingIdStr && checkoutSessionId && stripeSession && stripeSession === String(checkoutSessionId)) return true;
    return false;
  }) || null;

  if (!booking) {
    throw new Error("We couldn't find this booking in your account.");
  }

  return booking;
}

// Populate booking card UI — ONE render path for both states.
// Owner 2026-06-05 (sir: "one single page for success and hold... why 2 different logic"):
// this same function renders the confirmed booking AND the private hold. When opts.isHold is
// true, the hold swaps (hero, on-hold band, special request, Withdraw, hold next-steps) are
// applied inline at the END of this function — there is NO separate hold renderer anymore.
function populateBookingSummary(booking, opts) {
  opts = (opts && typeof opts === "object") ? opts : {};
  const __isHold = opts.isHold === true;
  const __holdHost = String((opts.hostName || (booking && booking.hostName) || "your host")).trim() || "your host";
  const __holdNote = String((opts.note || (booking && booking.note) || "")).trim();
  const __holdReqId = String(opts.requestId || "").trim();
  // Try multiple possible shapes defensively
  const experience = booking.experience || booking.experienceDetails || {};
  const title =
    experience.title ||
    booking.title ||
    "Your shared table experience";

  const dateRaw =
    booking.date ||
    booking.bookingDate ||
    booking.experienceDate ||
    experience.date ||
    null;

  const guestsRaw =
    booking.guests ||
    booking.numGuests ||
    booking.guestCount ||
    null;

  const imageUrl =
    experience.imageUrl ||
    (experience.images && experience.images[0]) ||
    experience.coverImage ||
    booking.imageUrl ||
    "/assets/experience-default.jpg";

  if (successExpTitleEl) successExpTitleEl.textContent = title;

  // Owner 2026-05-30 (S2 world-best): new HTML uses <dl>/<dt>/<dd> so the
  // label sits in <dt> — the value cells no longer need the "Date: "/"Guests: "
  // prefixes. Just the raw value.
  if (dateRaw) {
    try {
      const d = new Date(dateRaw);
      let formatted = "";
      try {
        if (window.tstsFormatDateShort) formatted = window.tstsFormatDateShort(d);
      } catch (_fmtShortErr) { void _fmtShortErr; }
      if (!formatted) {
        formatted = d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
      if (successExpDateEl) successExpDateEl.textContent = formatted;
    } catch (_dateParseErr) {
      void _dateParseErr;
      if (successExpDateEl) successExpDateEl.textContent = String(dateRaw);
    }
  } else {
    if (successExpDateEl) successExpDateEl.textContent = "—";
  }

  if (guestsRaw) {
    const guestsNum = Number(guestsRaw);
    if (!Number.isNaN(guestsNum) && guestsNum > 0) {
      if (successExpGuestsEl) successExpGuestsEl.textContent =
        `${guestsNum} guest${guestsNum > 1 ? "s" : ""}`;
    } else {
      if (successExpGuestsEl) successExpGuestsEl.textContent = "—";
    }
  } else {
    if (successExpGuestsEl) successExpGuestsEl.textContent = "—";
  }

  applySafeBookingImage(imageUrl, title || "Experience image", experience.images);

  // Owner 2026-05-30 (S2 world-best): populate every field on the card.
  // Time slot — format "HH:MM-HH:MM" → "10:00 AM – 1:00 PM" using the same
  // approach as experience.js formatSlotForDisplay (kept simple inline here).
  if (successExpTimeEl) {
    const timeRaw = String((booking && (booking.timeSlot || booking.time)) || "").trim();
    successExpTimeEl.textContent = formatSlotForDisplaySuccess(timeRaw) || "—";
  }
  // Total paid: the figure the record itself holds, never a guess while the record
  // knows. The stored total is the first cents field the booking actually carries
  // (totalAmountCents, totalCents, amountCents, the pricing snapshot, the fee
  // breakdown), then the major-unit fields, and a stored zero IS a total, not a
  // missing one. Seat price x guests is an approximation and runs only when the
  // record carries no total field at all (legacy or directly seeded rows).
  if (successExpTotalEl) {
    const ccy = String((booking && booking.currency) || (experience && experience.currency) || "AUD").toUpperCase();
    const bk = booking || {};
    const ps = bk.pricingSnapshot || {};
    const fb = bk.feeBreakdown || {};
    const firstStoredNumber = function (values) {
      for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") continue;
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
      return null;
    };
    const storedCents = firstStoredNumber([bk.totalAmountCents, bk.totalCents, bk.amountCents, ps.totalCents, fb.totalCents]);
    const storedMajor = storedCents === null ? firstStoredNumber([bk.totalAmount, bk.amount]) : null;
    const storedTotal = storedCents === null ? storedMajor : __successMinorToMajor(storedCents, ccy);
    // sir 2026-09-13: a seat the host funded or an administrator waived reads "The Seat is free for all"; the dash stays for a value the page does not have.
    if (storedTotal !== null) {
      if (storedTotal > 0) successExpTotalEl.textContent = formatPriceForSuccess(storedTotal, ccy);
      else if (storedTotal === 0) successExpTotalEl.textContent = "The Seat is free for all";
      else successExpTotalEl.textContent = "—";
    } else {
      const seat = Number((experience && experience.price) || bk.pricePerSeat || 0);
      const guests = Number(bk.numGuests || 1);
      const approx = seat * (guests > 0 ? guests : 1);
      if (approx > 0) successExpTotalEl.textContent = formatPriceForSuccess(approx, ccy);
      else successExpTotalEl.textContent = "—";
    }
  }
  if (successExpHostEl) {
    const hostNm = String((experience && experience.hostName) || (booking && booking.hostName) || "").trim();
    successExpHostEl.textContent = hostNm || "—";
  }
  // Verified badge — show if experience.verifiedStatus === "verified".
  if (successVerifiedBadgeEl) {
    const verified = String((experience && experience.verifiedStatus) || "").toLowerCase() === "verified";
    if (verified) successVerifiedBadgeEl.classList.remove("hidden");
    else successVerifiedBadgeEl.classList.add("hidden");
  }
  // Host avatar + profile link — owner 2026-06-02 (premium pass #2): show the
  // host photo when present; otherwise 2-letter initials on the brand-orange
  // circle (same treatment as the Explore card host avatar, common.js ~506) so a
  // missing photo reads as a designed avatar, not a flat grey disc; only fall
  // back to the neutral silhouette when there is also no host name to initial.
  if (successHostAvatarEl) {
    const avatar = String((experience && (experience.hostPic || experience.hostAvatar || experience.hostPhoto)) || "").trim();
    const hostNmForAvatar = String((experience && experience.hostName) || (booking && booking.hostName) || "").trim();
    const hostInitials = (function () {
      if (!hostNmForAvatar) return "";
      const parts = hostNmForAvatar.split(/\s+/).filter(Boolean);
      if (!parts.length) return "";
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    })();
    if (avatar) {
      successHostAvatarEl.src = avatar;
      successHostAvatarEl.alt = (hostNmForAvatar || "Host") + " avatar";
      successHostAvatarEl.classList.remove("hidden");
      if (successHostInitialsEl) successHostInitialsEl.classList.add("hidden");
    } else if (hostInitials && successHostInitialsEl) {
      // textContent only — XSS-safe (name is user-controlled).
      successHostInitialsEl.textContent = hostInitials;
      successHostInitialsEl.classList.remove("hidden");
      successHostAvatarEl.classList.add("hidden");
    } else {
      // No photo AND no name → neutral silhouette (same grey circle Stripe / GitHub use).
      successHostAvatarEl.src = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23e2e8f0'/%3E%3Ccircle cx='24' cy='19' r='8' fill='%23cbd5e1'/%3E%3Cpath d='M6 48c0-10 8-16 18-16s18 6 18 16' fill='%23cbd5e1'/%3E%3C/svg%3E";
      successHostAvatarEl.classList.remove("hidden");
      if (successHostInitialsEl) successHostInitialsEl.classList.add("hidden");
    }
  }
  if (successHostProfileLinkEl) {
    const hostId = String((experience && (experience.hostId || experience.host_id)) || "").trim();
    if (hostId) {
      successHostProfileLinkEl.href = "public-profile.html?id=" + encodeURIComponent(hostId);
      successHostProfileLinkEl.classList.remove("hidden");
    } else {
      successHostProfileLinkEl.classList.add("hidden");
    }
  }
  if (successExpAddressEl) {
    const addrLine = String((experience && experience.addressLine) || "").trim();
    const sub = String((experience && experience.suburb) || "").trim();
    const city = String((experience && experience.city) || "").trim();
    const state = String((experience && experience.state) || "").trim();
    const pc = String((experience && experience.postcode) || "").trim();
    const cou = String((experience && experience.country) || "").trim();
    // Owner 2026-05-30 (S2 visual audit): addressNotes was being shown TWICE —
    // once here as "Notes: …" inside the WHERE block, and again below as the
    // JOINING INSTRUCTIONS section. Drop the duplicate here; let the dedicated
    // section own that text.
    // Owner 2026-06-05 (S2#6 review, sir "comma after suburb"): separate the suburb from the
    // city with a comma so it doesn't run together ("Fitzroy, Melbourne VIC 3065" not
    // "Fitzroy Melbourne VIC 3065"). Locality = "<suburb>, <city state postcode>".
    const __localityRest = [city, state, pc].filter(Boolean).join(" ");
    const __locality = [sub, __localityRest].filter(Boolean).join(", ");
    const pieces = [addrLine, __locality, cou].filter(Boolean);
    const addrText = pieces.join("\n");
    successExpAddressEl.textContent = addrText || "—";
    // Map deep-link — Google Maps universal URL works on all platforms.
    if (successExpMapLinkEl && pieces.length > 0) {
      const q = encodeURIComponent(pieces.join(", "));
      successExpMapLinkEl.href = "https://www.google.com/maps/search/?api=1&query=" + q;
      successExpMapLinkEl.classList.remove("hidden");
    } else if (successExpMapLinkEl) {
      successExpMapLinkEl.classList.add("hidden");
    }
  }
  // Re-read experience + image link + title link.
  const _expIdForLink = String((experience && (experience._id || experience.id)) || (booking && booking.experienceId) || "").trim();
  if (_expIdForLink) {
    const _expUrl = "experience.html?id=" + encodeURIComponent(_expIdForLink);
    if (successExpTitleLinkEl) successExpTitleLinkEl.href = _expUrl;
    if (successExpImageLinkEl) successExpImageLinkEl.href = _expUrl;
  }
  // About / What to bring / Joining instructions — show whichever the host
  // populated. The whole prep section is hidden if all three are empty.
  let _anyPrep = false;
  if (successExpAboutEl && successAboutWrapEl) {
    const about = String((experience && experience.description) || "").trim();
    if (about) {
      // Owner 2026-06-02: preview (~220 chars) + a "Show more"/"Show less" toggle
      // that expands the FULL description IN-PAGE (rich one-stop recap, no
      // navigation). textContent only — host-written copy, XSS-safe.
      const LIMIT = 220;
      const isLong = about.length > LIMIT;
      const truncated = isLong ? (about.slice(0, LIMIT).replace(/\s+\S*$/, "") + "…") : about;
      successExpAboutEl.textContent = truncated;
      if (successAboutToggleEl) {
        if (isLong) {
          let __aboutExpanded = false;
          successAboutToggleEl.textContent = "Show more";
          successAboutToggleEl.classList.remove("hidden");
          successAboutToggleEl.onclick = function () {
            __aboutExpanded = !__aboutExpanded;
            successExpAboutEl.textContent = __aboutExpanded ? about : truncated;
            successAboutToggleEl.textContent = __aboutExpanded ? "Show less" : "Show more";
          };
        } else {
          successAboutToggleEl.classList.add("hidden");
        }
      }
      successAboutWrapEl.classList.remove("hidden");
      _anyPrep = true;
    } else { successAboutWrapEl.classList.add("hidden"); }
  }
  if (successExpBringEl && successBringWrapEl) {
    const bring = String((experience && experience.requirements) || "").trim();
    if (bring) {
      successExpBringEl.textContent = bring;
      successBringWrapEl.classList.remove("hidden");
      _anyPrep = true;
    } else { successBringWrapEl.classList.add("hidden"); }
  }
  if (successExpJoiningEl && successJoiningWrapEl) {
    const joining = String((experience && experience.addressNotes) || "").trim();
    if (joining) {
      successExpJoiningEl.textContent = joining;
      successJoiningWrapEl.classList.remove("hidden");
      _anyPrep = true;
    } else { successJoiningWrapEl.classList.add("hidden"); }
  }
  if (successPrepSectionEl) {
    if (_anyPrep) successPrepSectionEl.classList.remove("hidden");
    else successPrepSectionEl.classList.add("hidden");
  }
  // Cancellation deadline — pull active policy tiers, compute slot start ms,
  // and surface the FIRST refund tier's deadline as a single concrete line
  // ("Cancel by Wed 3 Jun 10:00 AM for up to 95% back"). Best-tier-only keeps
  // the message short; full schedule was deliberately collapsed on P4 per sir.
  // sir 2026-08-16 ("Fix it", hold race): NEVER on a hold — sir's hold spec drops
  // this card (nothing is charged yet). It used to stay hidden only because its
  // fetch always failed; once the fetch was fixed, the async card un-hid itself
  // AFTER the hold-swap had hidden it. The guard closes that race.
  if (!__isHold && successCancelWrapEl && successCancelTextEl) {
    populateCancellationDeadline(booking, experience).catch(function (_cErr) { void _cErr; });
  }
  // Booking reference + Add-to-calendar. Owner 2026-06-02: show the human-facing
  // bookingRef (e.g. "7H3K-9P2A"), not the raw ObjectId. Fallback for any legacy
  // booking without a ref: a short uppercased tail of the id (still unique, never
  // the full 24-char hex).
  if (successBookingIdEl) {
    const __ref = String((booking && booking.bookingRef) || "").trim();
    let __display = __ref;
    if (!__display) {
      const __rawId = String((booking && (booking._id || booking.bookingId || booking.id)) || "").trim();
      if (__rawId.length >= 8) {
        const __tail = __rawId.slice(-8).toUpperCase();
        __display = __tail.slice(0, 4) + "-" + __tail.slice(4);
      } else { __display = __rawId; }
    }
    successBookingIdEl.textContent = __display || "—";
  }
  if (successActionCalendarEl) {
    successActionCalendarEl.href = buildIcsDataUrl(title, booking, experience);
  }

  if (successExpOtpEl) {
    const otp = String((booking && (booking.otp || booking.otpPlain || booking.otpCode)) || "").trim();
    // Sensible default before the live entry-code fetch resolves: a real OTP if
    // the booking already carries one, else point to the confirmation email
    // (which carries the code per the R12 fix). fetchAndShowEntryCode overrides.
    if (otp && /^\d{6}$/.test(otp)) __setOtpCodeState(otp);
    else __setOtpMessageState("Your entry code is in your confirmation email.");
  }

  // Cancel booking — store the id + show the subtle cancel link only for an
  // upcoming, cancellable (confirmed, not-past) booking (owner 2026-06-02).
  __wireCancelForBooking(booking);

  // Generate viral invite link
  const experienceId =
    experienceIdFromUrl ||
    experience._id ||
    experience.id ||
    booking.experienceId ||
    booking.expId ||
    "";

  generateInviteLink(experienceId, booking);

  // ── Hold state: the ONLY differences from a confirmed booking (sir-specified swaps),
  // applied inline so there is ONE render path (no separate hold renderer). The locked
  // #success-state markup is untouched — these are runtime swaps gated by opts.isHold.
  if (__isHold) {
    try {
      const heroH1 = document.querySelector("#success-state h1");
      if (heroH1) heroH1.textContent = "Request sent to " + __holdHost;
      // Hero icon: confirmed shows a green check; a hold is PENDING → clock-in-orange. DOM-safe.
      const heroIconWrap = document.querySelector("#success-state .rounded-full.bg-emerald-50");
      if (heroIconWrap) {
        heroIconWrap.classList.remove("bg-emerald-50");
        heroIconWrap.classList.add("bg-orange-50");
        while (heroIconWrap.firstChild) heroIconWrap.removeChild(heroIconWrap.firstChild);
        const __NS = "http://www.w3.org/2000/svg";
        const __svg = document.createElementNS(__NS, "svg");
        __svg.setAttribute("class", "h-9 w-9 text-orange-600");
        __svg.setAttribute("viewBox", "0 0 24 24");
        __svg.setAttribute("fill", "none");
        __svg.setAttribute("stroke", "currentColor");
        __svg.setAttribute("stroke-width", "2");
        __svg.setAttribute("stroke-linecap", "round");
        __svg.setAttribute("stroke-linejoin", "round");
        __svg.setAttribute("aria-hidden", "true");
        const __circ = document.createElementNS(__NS, "circle");
        __circ.setAttribute("cx", "12"); __circ.setAttribute("cy", "12"); __circ.setAttribute("r", "9");
        const __hand = document.createElementNS(__NS, "path");
        __hand.setAttribute("d", "M12 7v5l3 2");
        __svg.appendChild(__circ); __svg.appendChild(__hand);
        heroIconWrap.appendChild(__svg);
      }
      const emailSpan = document.getElementById("success-confirmation-email");
      if (emailSpan && emailSpan.parentElement) {
        const p = emailSpan.parentElement;
        while (p.firstChild) p.removeChild(p.firstChild);
        p.appendChild(document.createTextNode("A hold is placed on your card, "));
        const bspan = document.createElement("span"); bspan.className = "font-semibold text-tsts-ink"; bspan.textContent = "not a charge";
        p.appendChild(bspan);
        p.appendChild(document.createTextNode(". " + __holdHost + " has 24 hours to accept, and we'll email you the moment they do. You're only charged if they say yes."));
      }
      const totalDd = document.getElementById("success-exp-total");
      if (totalDd && totalDd.previousElementSibling && totalDd.previousElementSibling.tagName === "DT") {
        totalDd.previousElementSibling.textContent = "On hold";
      }
      const otpLabel = document.getElementById("success-otp-label");
      if (otpLabel) otpLabel.textContent = "Your card is on hold, not charged";
      const otpDigits = document.getElementById("success-exp-otp");
      if (otpDigits && otpDigits.parentElement) otpDigits.parentElement.classList.add("hidden");
      const otpHelper = document.getElementById("success-otp-helper");
      if (otpHelper) otpHelper.textContent = "Your entry code arrives the moment " + __holdHost + " accepts.";
      // Guest's special request (their note to the host) — shown above "Where" when present.
      if (__holdNote) {
        const __addrEl = document.getElementById("success-exp-address");
        const __whereBlock = __addrEl ? __addrEl.parentElement : null;
        if (__whereBlock && __whereBlock.parentElement && !document.getElementById("success-guest-note-wrap")) {
          const __nWrap = document.createElement("div");
          __nWrap.id = "success-guest-note-wrap";
          const __nH = document.createElement("p");
          __nH.className = "heading-serif text-base font-semibold text-tsts-ink mb-1";
          __nH.textContent = "Your note to " + __holdHost;
          const __nBody = document.createElement("p");
          __nBody.className = "text-sm text-slate-700 leading-relaxed whitespace-pre-line";
          __nBody.textContent = __holdNote;
          __nWrap.appendChild(__nH);
          __nWrap.appendChild(__nBody);
          __whereBlock.parentElement.insertBefore(__nWrap, __whereBlock);
        }
      }
      const cancelDeadlineWrap = document.getElementById("success-cancel-wrap");
      if (cancelDeadlineWrap) cancelDeadlineWrap.classList.add("hidden");
      const calBtn = document.getElementById("success-action-calendar");
      if (calBtn) calBtn.classList.add("hidden");
      const cancelActionWrap = document.getElementById("success-cancel-action-wrap");
      const cancelBtn = document.getElementById("success-cancel-btn");
      if (cancelActionWrap) cancelActionWrap.classList.remove("hidden");
      if (cancelBtn) {
        cancelBtn.textContent = "Withdraw request";
        cancelBtn.onclick = function () { withdrawHoldRequest(__holdReqId, cancelBtn); };
      }
      // "What happens next" — un-hide #success-next-steps + hold-specific steps. Marker uses
      // the SAME emerald tick as the confirmed markup (NOT the earlier invented orange) so both
      // states share one treatment; the marker design itself is an UNREVIEWED S2 item.
      const __nextSteps = document.getElementById("success-next-steps");
      if (__nextSteps) {
        __nextSteps.classList.remove("hidden");
        const __ul = __nextSteps.querySelector("ul");
        if (__ul) {
          while (__ul.firstChild) __ul.removeChild(__ul.firstChild);
          const __holdSteps = [
            __holdHost + " has 24 hours to respond to your request",
            "We'll email you the moment they respond",
            "Track or withdraw this request anytime in My Experiences"
          ];
          __holdSteps.forEach(function (__txt) {
            const __li = document.createElement("li");
            __li.className = "flex items-start gap-2";
            const __chk = document.createElement("span");
            __chk.className = "text-emerald-600 mt-0.5";
            __chk.textContent = "✓";
            __li.appendChild(__chk);
            __li.appendChild(document.createTextNode(" " + __txt));
            __ul.appendChild(__li);
          });
        }
      }
    } catch (_holdErr) { void _holdErr; }
  }
}

// Generate invite link via API (fallback to plain experience link)
function generateInviteLink(expId, booking) {
  const baseUrl = window.location.origin + "/experience.html";
  if (!inviteLinkInputEl) return;

  // Fallback URL (plain experience link)
  const fallbackUrl = expId ? baseUrl + "?id=" + encodeURIComponent(expId) : baseUrl;
  inviteLinkInputEl.value = fallbackUrl;

  // Try to create an invite via API for a proper tracked link
  if (expId && window.authFetch) {
    var body = { experienceId: expId };
    if (booking && booking.bookingDate) body.bookingDate = String(booking.bookingDate);
    if (booking && booking.timeSlot) body.timeSlot = String(booking.timeSlot);
    window.authFetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return;
      return res.json();
    }).then(function (raw) {
      var d = (raw && raw.data) ? raw.data : raw;
      if (d && d.inviteUrl) inviteLinkInputEl.value = d.inviteUrl;
    }).catch(function () {
      // Keep fallback URL, no error shown
    });
  }

  // Owner 2026-06-11 (sir): the GIFT button opens the connection-aware gift picker (gift a paid seat to
  // a connection / invite someone new / email someone to join). The "Copy link" button (handled
  // elsewhere) is the quick friend-pays raw share.
  try {
    var giftSeatBtn = document.getElementById("gift-seat-btn");
    if (giftSeatBtn && !giftSeatBtn.__wired && window.tstsGiftSeatPicker) {
      giftSeatBtn.__wired = true;
      giftSeatBtn.addEventListener("click", function (e) {
        e.preventDefault();
        window.tstsGiftSeatPicker({
          experienceId: expId,
          bookingDate: (booking && booking.bookingDate) ? String(booking.bookingDate) : "",
          timeSlot: (booking && booking.timeSlot) ? String(booking.timeSlot) : "",
          sourceBookingId: (booking && (booking._id || booking.id)) ? String(booking._id || booking.id) : "",
          experienceTitle: (booking && booking.experienceTitle) ? String(booking.experienceTitle) : ""
        });
      });
    }
  } catch (_giftErr) { void _giftErr; }
}

// Copy invite URL to clipboard
async function handleCopyInvite() {
  if (!inviteLinkInputEl) return;
  const link = inviteLinkInputEl.value;
  if (!link) return;

  // Gap 12 (sir's decision O-94): the one honest copy routine in common.js. It says so itself
  // when the copy is refused, so the confirmation line below appears only on a real copy.
  const copied = await window.tstsCopyText(link, { selectEl: inviteLinkInputEl });
  if (!copied) return;

  if (copyFeedbackEl) {
    copyFeedbackEl.classList.remove("hidden");
    setTimeout(() => {
      copyFeedbackEl.classList.add("hidden");
    }, 2500);
  }
}

// Main init
function withTimeout(promise, ms) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error("Request timed out. Please try again.")); }, ms);
    promise.then(function(v) { clearTimeout(timer); resolve(v); }, function(e) { clearTimeout(timer); reject(e); });
  });
}

async function initSuccessPage() {
  // ── PRIVATE BOOKING REQUEST hold-placed branch (Owner 2026-06-03) ─────────
  // A private request was just sent (?holdPlaced=1). This is NOT a confirmed
  // booking to verify — show the dedicated "request sent, hold placed" card and
  // stop. Must run BEFORE the sessionId guard (the hold link carries a sessionId
  // too, but we deliberately do not run the booking-verify path for it).
  if (holdPlacedFromUrl) {
    // A COUNTER-OFFER accept auto-confirms the booking (no second host step), so by the time
    // the guest lands here the request may already be "confirmed" — a real confirmed + paid
    // booking. Render the confirmed success state (bookingId + sessionId are in the URL) instead
    // of the "request sent / hold / 24h to accept / charged only if they say yes" copy, which
    // would mislead the guest. Otherwise (a fresh whole-table request still awaiting the host),
    // render the hold-placed card.
    const __holdRow = await __resolveHoldRow();
    if (String((__holdRow && __holdRow.status) || "").toLowerCase() !== "confirmed") {
      await renderHoldAsSuccess(__holdRow);
      return;
    }
    // confirmed → fall through to the normal confirmed-booking verify/render path below.
  }

  // Basic guards
  // Owner 2026-08-05 (sir approved "Fix the copy and the empty img"): this said "Missing booking
  // information in the link" even when the link DID carry a booking id — the guard needs the Stripe
  // session reference, not the booking id, so the old line told the guest something untrue about
  // their own URL. The copy now names what is actually missing and points somewhere useful.
  if (!sessionId) {
    showError(bookingIdFromUrl
      ? "This link is missing its payment reference, so we can't confirm the booking from here. Open My Experiences to see where this booking stands."
      : "This link doesn't carry your booking details. Please use the link in your confirmation email, or open My Experiences.");
    return;
  }

  showLoading();

  try {
    // 1) Verify with backend (10s timeout per attempt). Owner-approved 2026-08-03
    // (sir, Item 2): transient outcomes (payment still settling, rate limit, hiccup,
    // timeout) AUTO-RETRY with backoff (~90s total) while the loading copy says so;
    // only after that does the error state offer the manual Try Again.
    var verifyPayload = null;
    var verifyBackoffs = [2000, 4000, 8000, 15000, 30000, 30000];
    for (var verifyAttempt = 0; ; verifyAttempt++) {
      try {
        verifyPayload = await withTimeout(verifyBooking(bookingIdFromUrl, sessionId), 10000);
        break;
      } catch (vErr) {
        var vTransient = !!(vErr && vErr.transient) || /timed out/i.test(String((vErr && vErr.message) || ""));
        if (!vTransient) throw vErr;
        if (verifyAttempt >= verifyBackoffs.length) {
          throw new Error("This is taking longer than usual. We'll email your confirmation the moment it lands, or tap Try Again below.");
        }
        var waitCopyEl = loadingStateEl ? loadingStateEl.querySelector("p") : null;
        if (waitCopyEl) waitCopyEl.textContent = "We're still confirming your payment. This usually takes under a minute, and this page keeps checking for you.";
        await new Promise(function (r) { setTimeout(r, verifyBackoffs[verifyAttempt]); });
      }
    }
    const resolvedBookingId = resolveBookingId(verifyPayload, bookingIdFromUrl);

    // 2) Try to get booking details (cookie-auth); fall back to generic success for unauthenticated viewers.
    try {
      const booking = await withTimeout(fetchBookingDetails(resolvedBookingId, sessionId), 10000);
      populateBookingSummary(booking);
      // GIFT SEAT — sir's go-ahead 2026-08-19 («Fix P5 gift mode — go ahead»): a paid GIFT's success
      // page speaks the gift. The payer did not save "their seat"; the entry code belongs to whoever
      // holds the seat, so its panel never shows here. Words and visibility only — same design family.
      if (booking && booking.isGiftSeat === true) {
        try { await applyGiftSuccessMode(booking); } catch (_giftModeErr) { void _giftModeErr; }
      } else {
        // Owner 2026-06-01: world-best entry code — fetch the real OTP from the
        // existing `GET /api/bookings/:id/entry-code` endpoint (server.js:24737,
        // guest-only authz + confirmed+paid gate + decrypts otpEnc). Replaces
        // the "Check your email" placeholder with the actual 6-digit code so
        // guests don't have to dig through email on event day. Best-effort —
        // any failure leaves the placeholder intact.
        try { await fetchAndShowEntryCode(String((booking && (booking._id || booking.id)) || resolvedBookingId), booking); } catch (_otpFetchErr) { void _otpFetchErr; }
      }
    } catch (e) {
      const code = String((e && e.message) || "");
      if (code === "AUTH_REQUIRED") {
        applySummaryFallback("Booking confirmed!", "Please log in to view full details", "", window.location.origin + "/explore.html");
      } else {
        // Show generic success if details unavailable
        applySummaryFallback("Your experience is booked!", "Check your email for details", "", window.location.origin + "/explore.html");
      }
    }

    // 3) Show success + next steps
    showSuccess();
    var nextStepsEl = document.getElementById("success-next-steps");
    if (nextStepsEl) nextStepsEl.classList.remove("hidden");
  } catch (err) {
    showError(err.message || "We couldn't confirm this booking. Please try again.");
  }
}

// Wire copy button
if (copyInviteBtnEl) {
  copyInviteBtnEl.addEventListener("click", handleCopyInvite);
}

// Owner 2026-05-30 (S2): copy-to-clipboard on the entry code so the user can
// paste it into a notes app / calendar event / Telegram thread quickly.
if (successOtpCopyBtnEl) {
  successOtpCopyBtnEl.addEventListener("click", function () {
    const code = String((successExpOtpEl && successExpOtpEl.textContent) || "").trim();
    if (!code || !/^\d{6}$/.test(code)) return;
    // Gap 12 (sir's decision O-94): the one honest copy routine in common.js. The code is on
    // screen, so a refusal leaves it selected there; "Copied" shows only on a real copy.
    window.tstsCopyText(code, { selectEl: successExpOtpEl }).then(function (copied) {
      if (copied && successOtpCopyFeedbackEl) {
        successOtpCopyFeedbackEl.classList.remove("hidden");
        setTimeout(function () { successOtpCopyFeedbackEl.classList.add("hidden"); }, 1800);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Cancel booking + safety modal (owner 2026-06-02). The subtle "Cancel booking"
// link opens a modal that calls GET /cancel-preview and shows the EXACT refund +
// cancellation charge AT THIS MOMENT (server-authoritative — no FE math, so it
// can't disagree with what's issued). Confirm → OTP dual-auth (required by the
// backend cancel handler) → POST /cancel. Mirrors the proven my-bookings flow.
// ─────────────────────────────────────────────────────────────────────────
const successCancelActionWrapEl = document.getElementById("success-cancel-action-wrap");
const successCancelBtnEl = document.getElementById("success-cancel-btn");
const cancelModalOverlayEl = document.getElementById("cancel-modal-overlay");
const cancelModalRefundEl = document.getElementById("cancel-modal-refund");
const cancelModalChargeEl = document.getElementById("cancel-modal-charge");
const cancelModalPaidEl = document.getElementById("cancel-modal-paid");
const cancelModalErrorEl = document.getElementById("cancel-modal-error");
const cancelModalKeepEl = document.getElementById("cancel-modal-keep");
const cancelModalConfirmEl = document.getElementById("cancel-modal-confirm");
let __cancelBookingId = "";

// Like formatPriceForSuccess but ALWAYS shows the amount (incl. 0) — a refund or
// charge of A$0 is meaningful in this modal and must not collapse to "—".
function __successMoneyExact(amount, ccy) {
  const num = Number(amount || 0);
  const c = String(ccy || "AUD").toUpperCase();
  const symbol = ({ AUD: "A$", USD: "US$", EUR: "€", GBP: "£", JPY: "¥" })[c] || (c + " ");
  const isWhole = num === Math.floor(num);
  return symbol + (isWhole ? String(num) : num.toFixed(2));
}
function __closeCancelModal() { if (cancelModalOverlayEl) cancelModalOverlayEl.classList.add("hidden"); }

function __wireCancelForBooking(booking) {
  __cancelBookingId = String((booking && (booking._id || booking.id)) || bookingIdFromUrl || "").trim();
  const status = String((booking && booking.status) || "").toLowerCase();
  const cancellable = (status === "confirmed") && !__bookingEventIsPast(booking);
  if (successCancelActionWrapEl) {
    if (cancellable) successCancelActionWrapEl.classList.remove("hidden");
    else successCancelActionWrapEl.classList.add("hidden");
  }
}

async function __showCancelPreview(bookingId) {
  if (cancelModalErrorEl) { cancelModalErrorEl.classList.add("hidden"); cancelModalErrorEl.textContent = ""; }
  if (cancelModalConfirmEl) { cancelModalConfirmEl.disabled = false; cancelModalConfirmEl.textContent = "Cancel booking"; }
  if (cancelModalPaidEl) cancelModalPaidEl.textContent = "…";
  if (cancelModalChargeEl) cancelModalChargeEl.textContent = "…";
  if (cancelModalRefundEl) cancelModalRefundEl.textContent = "…";
  if (cancelModalOverlayEl) cancelModalOverlayEl.classList.remove("hidden");
  try {
    const r = await window.authFetch("/api/bookings/" + encodeURIComponent(bookingId) + "/cancel-preview");
    let d = null;
    try { d = await r.json(); } catch (_je) { void _je; }
    if (!r.ok || !d || d.ok !== true) throw new Error((d && d.message) || "Could not load cancellation details.");
    const p = (d && d.data) ? d.data : {};
    const cur = String(p.currency || "aud").toUpperCase();
    const refund = __successMinorToMajor(p.refundCents || 0, cur);
    const base = __successMinorToMajor(p.refundBaseCents || 0, cur);
    const charge = Math.max(0, base - refund);
    if (cancelModalPaidEl) cancelModalPaidEl.textContent = __successMoneyExact(base, cur);
    if (cancelModalChargeEl) cancelModalChargeEl.textContent = __successMoneyExact(charge, cur);
    if (cancelModalRefundEl) cancelModalRefundEl.textContent = __successMoneyExact(refund, cur);
  } catch (e) {
    if (cancelModalPaidEl) cancelModalPaidEl.textContent = "—";
    if (cancelModalChargeEl) cancelModalChargeEl.textContent = "—";
    if (cancelModalRefundEl) cancelModalRefundEl.textContent = "—";
    if (cancelModalErrorEl) { cancelModalErrorEl.textContent = String((e && e.message) || "Could not load cancellation details."); cancelModalErrorEl.classList.remove("hidden"); }
  }
}

async function __confirmCancel(bookingId) {
  if (cancelModalErrorEl) { cancelModalErrorEl.classList.add("hidden"); cancelModalErrorEl.textContent = ""; }
  // OTP dual-auth is REQUIRED by the backend cancel handler (booking_cancel).
  let otpToken = "";
  try {
    if (typeof window.tstsOtpVerify === "function") {
      otpToken = await window.tstsOtpVerify("booking_cancel", {
        message: "To confirm cancellation, verify your identity.",
        actionLabel: "Verify & cancel",
        meta: { bookingId: bookingId }
      });
    }
  } catch (_otpErr) { void _otpErr; }
  if (!otpToken) {
    if (cancelModalErrorEl) { cancelModalErrorEl.textContent = "Verification wasn't completed. Your booking is unchanged."; cancelModalErrorEl.classList.remove("hidden"); }
    return;
  }
  if (cancelModalConfirmEl) { cancelModalConfirmEl.disabled = true; cancelModalConfirmEl.textContent = "Cancelling…"; }
  try {
    const idem = window.tstsIdempotencyKey ? window.tstsIdempotencyKey({ dataset: Object.create(null) }) : "";
    const res = await window.authFetch("/api/bookings/" + encodeURIComponent(bookingId) + "/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpToken: otpToken }),
      idempotencyKey: idem
    });
    let envelope = null;
    try { envelope = await res.json(); } catch (_je2) { void _je2; }
    const data = (envelope && envelope.data) ? envelope.data : envelope;
    if (res.ok && envelope && envelope.ok !== false) {
      const refundCents = Number(data && data.refund && data.refund.amountCents);
      const refundCur = String((data && data.refund && data.refund.currency) || "aud");
      const refundText = Number.isFinite(refundCents) ? __successMoneyExact(__successMinorToMajor(refundCents, refundCur), refundCur) : "";
      __closeCancelModal();
      if (typeof window.tstsNotify === "function") {
        window.tstsNotify(refundText ? ("Booking cancelled. Refund " + refundText + " is on its way.") : "Booking cancelled.", "success");
      }
      if (successCancelActionWrapEl) successCancelActionWrapEl.classList.add("hidden");
      __setOtpMessageState("This booking has been cancelled.");
    } else {
      if (cancelModalConfirmEl) { cancelModalConfirmEl.disabled = false; cancelModalConfirmEl.textContent = "Cancel booking"; }
      if (cancelModalErrorEl) { cancelModalErrorEl.textContent = String((data && data.message) || "Unable to cancel. Please try again."); cancelModalErrorEl.classList.remove("hidden"); }
    }
  } catch (_e) {
    void _e;
    if (cancelModalConfirmEl) { cancelModalConfirmEl.disabled = false; cancelModalConfirmEl.textContent = "Cancel booking"; }
    if (cancelModalErrorEl) { cancelModalErrorEl.textContent = "Network error. Your booking is unchanged."; cancelModalErrorEl.classList.remove("hidden"); }
  }
}

if (successCancelBtnEl) {
  successCancelBtnEl.addEventListener("click", function () { if (__cancelBookingId) __showCancelPreview(__cancelBookingId); });
}
if (cancelModalKeepEl) cancelModalKeepEl.addEventListener("click", __closeCancelModal);
if (cancelModalConfirmEl) cancelModalConfirmEl.addEventListener("click", function () { if (__cancelBookingId) __confirmCancel(__cancelBookingId); });
if (cancelModalOverlayEl) cancelModalOverlayEl.addEventListener("click", function (e) { if (e.target === cancelModalOverlayEl) __closeCancelModal(); });

// Retry button
var retryVerifyBtn = document.getElementById("retry-verify-btn");
if (retryVerifyBtn) retryVerifyBtn.addEventListener("click", initSuccessPage);

// Run on load
document.addEventListener("DOMContentLoaded", initSuccessPage);
