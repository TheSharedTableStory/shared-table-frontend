// js/success.js
const loadingStateEl = document.getElementById("loading-state");
const successStateEl = document.getElementById("success-state");
const errorStateEl = document.getElementById("error-state");
const errorMessageEl = document.getElementById("error-message");

// Booking summary elements
const successExpImageEl = document.getElementById("success-exp-image");
const successExpTitleEl = document.getElementById("success-exp-title");
const successExpDateEl = document.getElementById("success-exp-date");
const successExpGuestsEl = document.getElementById("success-exp-guests");

// Viral loop elements
const inviteLinkInputEl = document.getElementById("invite-link-input");
const copyInviteBtnEl = document.getElementById("copy-invite-btn");
const copyFeedbackEl = document.getElementById("copy-feedback");

// Parse URL params: bookingId, sessionId, (optionally) experienceId
const urlParams = new URLSearchParams(window.location.search);
const bookingIdFromUrl = urlParams.get("bookingId") || urlParams.get("booking_id");
const sessionId = urlParams.get("sessionId") || urlParams.get("session_id");
const experienceIdFromUrl = urlParams.get("experienceId"); // optional

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

function applySafeBookingImage(primaryUrl, altText) {
  if (!successExpImageEl) return;
  const fallback = "/assets/experience-default.jpg";
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

// Utility: show/hide states
function showLoading() {
  loadingStateEl.classList.remove("hidden");
  successStateEl.classList.add("hidden");
  errorStateEl.classList.add("hidden");
}

function showSuccess() {
  loadingStateEl.classList.add("hidden");
  successStateEl.classList.remove("hidden");
  errorStateEl.classList.add("hidden");
}

function showError(message) {
  if (message && errorMessageEl) {
    errorMessageEl.textContent = message;
  }
  loadingStateEl.classList.add("hidden");
  successStateEl.classList.add("hidden");
  errorStateEl.classList.remove("hidden");
}

// Verify payment with backend
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
    throw new Error("Payment verification failed");
  }

  const data = await res.json().catch(() => ({}));
  // Gate on ok === true before trusting status
  if (!data || data.ok !== true) {
    var errMsg = (data && data.message) ? String(data.message) : "Payment verification failed";
    throw new Error(errMsg);
  }
  // Backend returns { ok: true, data: { status: "confirmed" } }
  var verifyStatus = (data.data && data.data.status) || (data.status) || "";
  if (verifyStatus !== "confirmed" && verifyStatus !== "paid") {
    throw new Error("Booking not confirmed yet. Status: " + verifyStatus);
  }

  return data;
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

// Populate booking card UI
function populateBookingSummary(booking) {
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

  if (dateRaw) {
    try {
      const d = new Date(dateRaw);
      let formatted = "";
      try {
        if (window.tstsFormatDateShort) formatted = window.tstsFormatDateShort(d);
      } catch (_) {}
      if (!formatted) {
        formatted = d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
      if (successExpDateEl) successExpDateEl.textContent = `Date: ${formatted}`;
    } catch (e) {
      if (successExpDateEl) successExpDateEl.textContent = `Date: ${dateRaw}`;
    }
  } else {
    if (successExpDateEl) successExpDateEl.textContent = "Date: —";
  }

  if (guestsRaw) {
    const guestsNum = Number(guestsRaw);
    if (!Number.isNaN(guestsNum) && guestsNum > 0) {
      if (successExpGuestsEl) successExpGuestsEl.textContent =
        `Guests: ${guestsNum} guest${guestsNum > 1 ? "s" : ""}`;
    } else {
      if (successExpGuestsEl) successExpGuestsEl.textContent = "Guests: —";
    }
  } else {
    if (successExpGuestsEl) successExpGuestsEl.textContent = "Guests: —";
  }

  applySafeBookingImage(imageUrl, title || "Experience image");

  // Generate viral invite link
  const experienceId =
    experienceIdFromUrl ||
    experience._id ||
    experience.id ||
    booking.experienceId ||
    booking.expId ||
    "";

  generateInviteLink(experienceId, booking);
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
      // Keep fallback URL — no error shown
    });
  }
}

// Copy invite URL to clipboard
async function handleCopyInvite() {
  if (!inviteLinkInputEl) return;
  const link = inviteLinkInputEl.value;
  if (!link) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      // Fallback
      const tempArea = document.createElement("textarea");
      tempArea.value = link;
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand("copy");
      document.body.removeChild(tempArea);
    }

    if (copyFeedbackEl) {
      copyFeedbackEl.classList.remove("hidden");
      setTimeout(() => {
        copyFeedbackEl.classList.add("hidden");
      }, 2500);
    }
  } catch (err) {
    // Clipboard copy failed silently
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
  // Basic guards
  if (!sessionId) {
    showError("Missing booking information in the link. Please check your email or try again.");
    return;
  }

  showLoading();

  try {
    // 1) Verify with backend (10s timeout)
    const verifyPayload = await withTimeout(verifyBooking(bookingIdFromUrl, sessionId), 10000);
    const resolvedBookingId = resolveBookingId(verifyPayload, bookingIdFromUrl);

    // 2) Try to get booking details (cookie-auth); fall back to generic success for unauthenticated viewers.
    try {
      const booking = await withTimeout(fetchBookingDetails(resolvedBookingId, sessionId), 10000);
      populateBookingSummary(booking);
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

// Retry button
var retryVerifyBtn = document.getElementById("retry-verify-btn");
if (retryVerifyBtn) retryVerifyBtn.addEventListener("click", initSuccessPage);

// Run on load
document.addEventListener("DOMContentLoaded", initSuccessPage);
