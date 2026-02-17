// js/my-bookings.js (CLOSED: dashboard + hosting)
// Uses common.js single-truth: window.authFetch, window.getAuthToken

const contentEl = document.getElementById("content-area");
const tabTrips = document.getElementById("tab-trips");
const tabHost = document.getElementById("tab-hosting");

const guestModal = document.getElementById("guest-modal");
const reviewModal = document.getElementById("review-modal");
const complaintModal = document.getElementById("complaint-modal");

const closeGuestBtn = document.getElementById("close-modal-btn");
const reviewCancelBtn = document.getElementById("review-cancel-btn");
const reviewForm = document.getElementById("review-form");
const complaintCancelBtn = document.getElementById("complaint-cancel-btn");
const complaintForm = document.getElementById("complaint-form");
const complaintMessageInput = document.getElementById("complaint-message");
const complaintWordCount = document.getElementById("complaint-word-count");
const complaintStatus = document.getElementById("complaint-status");
const complaintSubmitBtn = document.getElementById("complaint-submit-btn");

let hostBookingsCache = []; // for modal lookup by booking id
let guestBookingsCache = []; // for complaint modal lookup by booking id

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
}

/* ====================== GUEST TRIPS ====================== */

async function loadTrips() {
  if (!(await requireAuthOrRedirect())) return;
  setLoading();

  try {
    const res = await window.authFetch("/api/bookings/my-bookings");
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError((data && data.message) || "Failed to load trips.");
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      guestBookingsCache = [];
      const El = window.tstsEl;
      contentEl.textContent = "";
      contentEl.appendChild(
        El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
          El("div", { className: "text-5xl mb-4", textContent: "🌏" }),
          El("h3", { className: "text-xl font-bold text-gray-900 mb-2", textContent: "No trips yet" }),
          El("p", { className: "text-gray-500 mb-6", textContent: "You haven't booked any experiences yet." }),
          El("a", { href: "explore.html", className: "inline-block bg-orange-600 text-white px-8 py-3 rounded-full font-bold shadow hover:bg-orange-700 transition", textContent: "Find an Adventure" })
        ])
      );
      return;
    }

    guestBookingsCache = data;
    contentEl.textContent = "";
    data.forEach(function(b) { contentEl.appendChild(renderTripCard(b)); });
  } catch (_) {
    setError("Failed to load trips.");
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
  const title = exp.title || booking.title || "Unknown Experience";
  const guests = booking.guests || booking.numGuests || booking.guestCount || 1;
  const city = exp.city || booking.city || "Location TBA";

  var statusBadge, actionArea, actionNote = null;

  if (isCancelled) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-700", textContent: "CANCELLED" });
    actionArea = El("span", { className: "text-sm text-gray-400 italic", textContent: "This booking was cancelled." });
  } else if (isCompleted) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-gray-100 text-gray-700", textContent: "COMPLETED" });

    const reviewBtn = El("button", {
      className: "w-full md:w-auto px-5 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg shadow hover:bg-black transition flex items-center justify-center gap-2",
      "data-action": "review", "data-booking-id": bookingId, "data-exp-id": expId
    }, [El("i", { className: "fas fa-star" }), " Write a Review"]);

    const nodes = [reviewBtn];
    if (canFileComplaint) {
      nodes.push(
        El("button", {
          className: "w-full md:w-auto px-5 py-2 border border-amber-200 text-amber-700 text-sm font-bold rounded-lg hover:bg-amber-50 transition",
          "data-action": "complaint",
          "data-booking-id": bookingId
        }, [El("i", { className: "fas fa-flag" }), " Report an Issue"])
      );
      if (complaintWindowEndsAt) {
        actionNote = El("p", {
          className: "text-xs text-amber-700 md:text-right",
          textContent: "Complaint window closes on " + fmtTripDate(complaintWindowEndsAt) + "."
        });
      }
    } else if (complaintId) {
      actionNote = El("p", { className: "text-xs text-gray-500 md:text-right", textContent: "Issue already reported for this booking." });
    }
    actionArea = El("div", { className: "w-full md:w-auto flex flex-col gap-2 md:items-end" }, nodes);
  } else if (isPast) {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-blue-100 text-blue-700", textContent: "AWAITING COMPLETION" });
    actionArea = El("span", { className: "text-sm text-gray-500 italic", textContent: "Completion is being finalized." });
  } else {
    statusBadge = El("span", { className: "px-2 py-1 text-xs font-bold rounded bg-green-100 text-green-700", textContent: "CONFIRMED" });
    actionArea = El("button", {
      className: "w-full md:w-auto px-5 py-2 border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition",
      "data-action": "cancel", "data-booking-id": bookingId, textContent: "Cancel Booking"
    });
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
          El("span", { className: "flex items-center gap-2" }, [El("i", { className: "fas fa-map-marker-alt w-4" }), " " + city])
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
  const bid = document.getElementById("review-booking-id");
  const eid = document.getElementById("review-exp-id");
  if (bid) bid.value = bookingId || "";
  if (eid) eid.value = expId || "";
  if (reviewModal) reviewModal.classList.remove("hidden");
}

async function submitReview(e) {
  e.preventDefault();
  if (!(await requireAuthOrRedirect())) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : "";

  if (submitBtn) { submitBtn.textContent = "Posting..."; submitBtn.disabled = true; }

  const bookingId = (document.getElementById("review-booking-id") || {}).value || "";
  const expId = (document.getElementById("review-exp-id") || {}).value || "";
  const ratingRaw = (document.getElementById("review-rating") || {}).value || "5";
  const comment = (document.getElementById("review-comment") || {}).value || "";

  try {
    const payload = {
      bookingId,
      experienceId: expId,
      rating: parseInt(ratingRaw, 10) || 5,
      comment
    };

    const res = await window.authFetch("/api/reviews", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      window.tstsNotify("Review posted successfully! Thank you.", "success");
      if (reviewModal) reviewModal.classList.add("hidden");
      e.target.reset();
    } else {
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

  if (complaintModal) complaintModal.classList.remove("hidden");
}

function closeComplaintModal() {
  if (complaintModal) complaintModal.classList.add("hidden");
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

async function cancelBooking(id) {
  if (!id) return;
  var confirmed = await window.tstsConfirm("Are you sure? Refund policies apply.", { destructive: true, confirmText: "Cancel Booking" });
  if (!confirmed) return;

  try {
    const res = await window.authFetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const amount = (data && data.refund && data.refund.amount) ? data.refund.amount : "";
      window.tstsNotify(amount !== "" ? "Cancelled. Refund: $" + amount : "Cancelled.", "success");
      loadTrips();
    } else {
      window.tstsNotify("Error: " + (data.message || "Unable to cancel."), "error");
    }
  } catch (_) {
    window.tstsNotify("Network error.", "error");
  }
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

function renderHostListingsSection(listings, hostBookings) {
  const El = window.tstsEl;
  const wrap = El("section", { className: "space-y-4 mb-8" });
  wrap.appendChild(El("h2", { className: "text-xl font-bold text-gray-900", textContent: "Your Listings" }));

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
            El("h3", { className: "font-bold text-lg text-gray-900", textContent: String((exp && exp.title) || "Untitled listing") })
          ].concat(chips)),
          El("p", { className: "text-sm text-gray-500", textContent: String((exp && exp.city) || "Location TBA") + " • " + formatPriceLabel(exp && exp.price) }),
          El("p", { className: "text-xs text-gray-500", textContent: "Bookings received: " + bookingCount })
        ]),
        El("div", { className: "flex flex-wrap items-center gap-2" }, [
          El("a", {
            href: "host.html?edit=" + encodeURIComponent(expId),
            className: "inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg shadow hover:bg-black transition",
            textContent: "Edit Listing"
          }),
          El("a", {
            href: "experience.html?id=" + encodeURIComponent(expId),
            className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 transition",
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
    const title = exp.title || b.title || "Listing";

    const guest = b.guestId || b.user || {};
    const guestName = guest.name || b.guestName || "Unknown Guest";
    const pax = b.guests || b.numGuests || b.guestCount || "-";
    const paid = b.amountTotal || (b.pricing && b.pricing.totalPrice) || "";

    var viewBtn = El("button", {
      className: "w-full md:w-auto bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition whitespace-nowrap",
      "data-action": "guest", "data-booking-id": b._id || "", textContent: "View Details"
    });

    var card = El("div", { className: "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 mb-4" }, [
      El("div", { className: "flex items-center gap-4 w-full" }, [
        El("div", { className: "bg-orange-50 text-orange-600 w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-orange-100 flex-shrink-0" }, [
          El("span", { className: "text-xs font-bold uppercase", textContent: month }),
          El("span", { className: "text-xl font-bold", textContent: String(day) })
        ]),
        El("div", {}, [
          El("h3", { className: "font-bold text-lg text-gray-900", textContent: title }),
          El("p", { className: "text-sm text-gray-500" }, ["Guest: ", El("span", { className: "font-bold text-gray-700", textContent: guestName })]),
          El("div", { className: "flex gap-4 text-xs text-gray-400 mt-1" }, [
            El("span", { textContent: "Paid: " + (paid !== "" ? "$" + paid : "—") }),
            El("span", { textContent: "•" }),
            El("span", { textContent: pax + " Pax" })
          ])
        ])
      ]),
      viewBtn
    ]);
    wrap.appendChild(card);
  });

  return wrap;
}

async function loadHost() {
  if (!(await requireAuthOrRedirect())) return;
  setLoading();

  try {
    const hostId = await getSessionUserId();
    if (!hostId) {
      setError("Unable to load hosting profile.");
      return;
    }

    const [bookingsRes, listingsRes] = await Promise.all([
      window.authFetch("/api/bookings/host-bookings"),
      window.authFetch("/api/experiences?hostId=" + encodeURIComponent(hostId) + "&limit=200", { method: "GET" })
    ]);

    const bookings = await bookingsRes.json().catch(() => []);
    const listings = await listingsRes.json().catch(() => []);

    if (!bookingsRes.ok && !listingsRes.ok) {
      const msg = (bookings && bookings.message) || (listings && listings.message) || "Failed to load hosting data.";
      setError(msg);
      return;
    }

    hostBookingsCache = Array.isArray(bookings) ? bookings : [];
    const listingRows = Array.isArray(listings) ? listings : [];

    if (listingRows.length === 0 && hostBookingsCache.length === 0) {
      const El = window.tstsEl;
      contentEl.textContent = "";
      contentEl.appendChild(
        El("div", { className: "text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" }, [
          El("div", { className: "text-5xl mb-4", textContent: "🍳" }),
          El("h3", { className: "text-xl font-bold text-gray-900 mb-2", textContent: "No listings yet" }),
          El("p", { className: "text-gray-500 mb-6", textContent: "Create your first experience and it will appear here for editing." }),
          El("a", { href: "host.html", className: "inline-block bg-gray-900 text-white px-8 py-3 rounded-full font-bold shadow hover:bg-black transition", textContent: "Create Listing" })
        ])
      );
      return;
    }

    const El = window.tstsEl;
    contentEl.textContent = "";
    if (listingRows.length > 0) contentEl.appendChild(renderHostListingsSection(listingRows, hostBookingsCache));
    contentEl.appendChild(renderHostBookingsSection(hostBookingsCache));
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

  if (guestModal) guestModal.classList.remove("hidden");
}

function closeGuestModal() {
  if (guestModal) guestModal.classList.add("hidden");
}

function closeReviewModal() {
  if (reviewModal) reviewModal.classList.add("hidden");
}

/* ====================== EVENT WIRING ====================== */

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await requireAuthOrRedirect())) return;

  if (tabTrips) tabTrips.addEventListener("click", () => { toggleTab("trips"); loadTrips(); });
  if (tabHost) tabHost.addEventListener("click", () => { toggleTab("hosting"); loadHost(); });

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

    if (action === "cancel") cancelBooking(bid);
    if (action === "review") openReviewModal(bid, expId);
    if (action === "complaint") openComplaintModalById(bid);
    if (action === "guest") openGuestModalById(bid);
  });

  // Close guest modal
  if (closeGuestBtn) closeGuestBtn.addEventListener("click", closeGuestModal);

  // Close review modal (cancel button)
  if (reviewCancelBtn) reviewCancelBtn.addEventListener("click", closeReviewModal);
  if (complaintCancelBtn) complaintCancelBtn.addEventListener("click", closeComplaintModal);

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (guestModal && !guestModal.classList.contains("hidden") && e.target === guestModal) closeGuestModal();
    if (reviewModal && !reviewModal.classList.contains("hidden") && e.target === reviewModal) closeReviewModal();
    if (complaintModal && !complaintModal.classList.contains("hidden") && e.target === complaintModal) closeComplaintModal();
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeGuestModal();
    closeReviewModal();
    closeComplaintModal();
  });

  // Default load
  toggleTab("trips");
  loadTrips();
});
