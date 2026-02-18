// js/admin.js
// Single-truth networking: window.authFetch + window.getAuthToken from common.js

function redirectToLogin() {
  const returnTo = encodeURIComponent(location.pathname + location.search);
  location.href = "login.html?returnTo=" + returnTo;
}

async function adminFetch(path, opts) {
  return window.authFetch(path, opts || {});
}

async function mustBeAdmin() {
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
    const u = sess.user || {};
    if (u && u.isAdmin === true) {
      return true;
    }
    const role = String((u && u.role) || "").toLowerCase();
    if (role === "admin") {
      return true;
    }
    document.body.replaceChildren();
    const denied = document.createElement("div");
    denied.className = "min-h-screen flex items-center justify-center";
    denied.textContent = "Access denied";
    document.body.replaceChildren(denied);
    return false;
  } catch (_) {
    redirectToLogin();
    return false;
  }
}

async function loadStats() {
  const res = await adminFetch("/api/admin/stats", { method: "GET" });
  if (!res.ok) throw new Error("stats");
  return res.json();
}

async function loadBookings() {
  const res = await adminFetch("/api/admin/bookings", { method: "GET" });
  if (!res.ok) throw new Error("bookings");
  return res.json();
}

async function loadExperiences() {
  const res = await adminFetch("/api/admin/experiences", { method: "GET" });
  if (!res.ok) throw new Error("experiences");
  return res.json();
}

async function loadUsers() {
  const res = await adminFetch("/api/admin/users", { method: "GET" });
  if (!res.ok) throw new Error("users");
  return res.json();
}

function buildAuditQueryString(filters) {
  var f = (filters && typeof filters === "object") ? filters : {};
  var p = new URLSearchParams();
  if (f.from) p.set("from", String(f.from));
  if (f.to) p.set("to", String(f.to));
  if (f.actorId) p.set("actorId", String(f.actorId));
  if (f.action) p.set("action", String(f.action));
  if (typeof f.ok === "boolean") p.set("ok", f.ok ? "true" : "false");
  if (f.method) p.set("method", String(f.method));
  if (f.pathContains) p.set("pathContains", String(f.pathContains));
  if (f.limit) p.set("limit", String(f.limit));
  if (f.skip) p.set("skip", String(f.skip));
  var s = p.toString();
  return s ? ("?" + s) : "";
}

async function loadAuditLogs(filters) {
  var qs = buildAuditQueryString(filters);
  const res = await adminFetch("/api/admin/audit" + qs, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "audit");
  }
  return data;
}

async function exportAuditLogs(format, filters) {
  var f = Object.assign({}, filters || {}, { format: String(format || "csv").toLowerCase() });
  var qs = buildAuditQueryString(f);
  const res = await adminFetch("/api/admin/export/audit" + qs, { method: "GET" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data && data.message) ? data.message : "Export failed");
  }
  if (String(format || "").toLowerCase() === "json") {
    const data = await res.json().catch(() => ({}));
    var text = JSON.stringify(data || {}, null, 2);
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "admin_audit_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const csv = await res.text();
  var blobCsv = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var urlCsv = URL.createObjectURL(blobCsv);
  var link = document.createElement("a");
  link.href = urlCsv;
  link.download = "admin_audit_export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(urlCsv);
}

async function grantAdmin(userId) {
  const res = await adminFetch("/api/admin/users/" + encodeURIComponent(userId) + "/grant-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to grant admin access");
  }
  return data.data || null;
}

async function loadAdminInvites(status) {
  var p = new URLSearchParams();
  p.set("status", String(status || "all"));
  p.set("limit", "100");
  const res = await adminFetch("/api/admin/admin-invites?" + p.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load admin invites");
  }
  return data;
}

async function inviteAdmin(email) {
  const res = await adminFetch("/api/admin/admin-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: String(email || "").trim() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to send admin invite");
  }
  return data.data || null;
}

async function loadCoupons() {
  const res = await adminFetch("/api/admin/promo-codes", { method: "GET" });
  if (!res.ok) throw new Error("coupons");
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.promos) ? data.promos : [];
}

async function loadReports() {
  const res = await adminFetch("/api/admin/reports?limit=100", { method: "GET" });
  if (!res.ok) throw new Error("reports");
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.items) ? data.items : [];
}

async function updateReport(id, payload) {
  const res = await adminFetch("/api/admin/reports/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to update report");
  }
  return data;
}

async function loadPrivateBookingRequests() {
  const res = await adminFetch("/api/admin/private-booking-requests?limit=100", { method: "GET" });
  if (!res.ok) throw new Error("private_requests");
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.requests) ? data.requests : [];
}

async function updatePrivateBookingRequestStatus(id, payload) {
  const res = await adminFetch("/api/admin/private-booking-requests/" + encodeURIComponent(id) + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to update private booking request");
  }
  return data.request || null;
}

async function refundBookingPartial(id, payload) {
  const res = await adminFetch("/api/admin/bookings/" + encodeURIComponent(id) + "/refund-partial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to request partial refund");
  }
  return data;
}

async function createCoupon(payload) {
  const res = await adminFetch("/api/admin/promo-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to create coupon");
  }
  return data.promo || null;
}

async function updateCoupon(code, payload) {
  const res = await adminFetch("/api/admin/promo-codes/" + encodeURIComponent(code), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to update coupon");
  }
  return data.promo || null;
}

async function deactivateCoupon(code) {
  const res = await adminFetch("/api/admin/promo-codes/" + encodeURIComponent(code) + "/deactivate", {
    method: "POST"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to deactivate coupon");
  }
  return data.promo || null;
}

async function toggleExperience(id) {
  const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/toggle", {
    method: "PATCH"
  });
  if (!res.ok) {
    let msg = "Failed to toggle experience";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function approveVerifiedExperience(id) {
  const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/verified/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    let msg = "Failed to approve verification";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function rejectVerifiedExperience(id) {
  const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/verified/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    let msg = "Failed to reject verification";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function deleteExperience(id) {
  const res = await window.authFetch("/api/experiences/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) {
    let msg = "Failed to delete experience";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function deleteUser(id) {
  const res = await adminFetch("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) {
    let msg = "Failed to delete user";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function cancelBooking(id) {
  const res = await window.authFetch("/api/bookings/" + encodeURIComponent(id) + "/cancel", { method: "POST" });
  if (!res.ok) {
    let msg = "Failed to cancel booking";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

// ---- Existing render helpers (minimal assumptions) ----
function $(id) { return document.getElementById(id); }

function safe(v, fallback="") { return (v === null || v === undefined) ? fallback : v; }

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDateValue(raw) {
  const dt = raw ? new Date(raw) : null;
  if (!dt || isNaN(dt.getTime())) return "—";
  try { if (window.tstsFormatDateShort) return window.tstsFormatDateShort(dt); } catch (_) {}
  try { return dt.toLocaleDateString("en-AU"); } catch (_) { return dt.toDateString(); }
}

function formatCurrencyValue(raw) {
  const num = toNumberOrNull(raw);
  return num === null ? "—" : "$" + String(num);
}

function formatCurrencyFromCents(raw) {
  const num = toNumberOrNull(raw);
  return num === null ? "—" : ("$" + (num / 100).toFixed(2));
}

function normalizeStateLabel(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "None";
  return s.replace(/_/g, " ");
}

function normalizeVerifiedStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "verified") return "verified";
  if (s === "pending") return "pending";
  if (s === "rejected") return "rejected";
  return "none";
}

function __csvToArray(v) {
  return String(v || "")
    .split(",")
    .map(function (x) { return String(x || "").trim(); })
    .filter(function (x) { return x.length > 0; });
}

function formatPromoDiscount(p) {
  const pct = Number(p && p.percentOff);
  const fixed = Number(p && p.fixedOffCents);
  if (Number.isFinite(pct) && pct > 0) return String(pct) + "%";
  if (Number.isFinite(fixed) && fixed > 0) return "$" + (fixed / 100).toFixed(2);
  return "—";
}

function formatPromoWindow(p) {
  const from = p && p.validFrom ? formatDateValue(p.validFrom) : "Now";
  const to = p && p.validTo ? formatDateValue(p.validTo) : "No expiry";
  return from + " → " + to;
}

function formatPromoScope(p) {
  const scope = String((p && p.scopeType) || "global").toLowerCase();
  if (scope === "category") {
    const cats = Array.isArray(p && p.appliesToCategories) ? p.appliesToCategories : [];
    return "Category (" + (cats.length > 0 ? cats.join(", ") : "none") + ")";
  }
  if (scope === "experience") {
    const ids = Array.isArray(p && p.appliesToExperienceIds) ? p.appliesToExperienceIds : [];
    return "Experience (" + ids.length + ")";
  }
  return "Global";
}

function renderStats(stats) {
  const s = stats || {};
  const usersEl = $("stats-total-users");
  const hostsEl = $("stats-total-hosts");
  const bookingsEl = $("stats-total-bookings");
  const revenueEl = $("stats-total-revenue");

  const userCount = toNumberOrNull(s.userCount);
  const hostCount = toNumberOrNull(s.hostCount);
  const bookingCount = toNumberOrNull(s.bookingCount);
  const revenue = toNumberOrNull(s.totalRevenue);

  if (usersEl) usersEl.textContent = userCount === null ? "—" : String(userCount);
  if (hostsEl) hostsEl.textContent = hostCount === null ? "—" : String(hostCount);
  if (bookingsEl) bookingsEl.textContent = bookingCount === null ? "—" : String(bookingCount);
  if (revenueEl) revenueEl.textContent = revenue === null ? "—" : "$" + String(revenue);
}

function renderBookings(bookings) {
  const El = window.tstsEl;
  const tbody = $("bookings-table-body");
  const loadingEl = $("bookings-loading");
  if (!tbody) return;
  tbody.textContent = "";
  if (loadingEl) loadingEl.classList.add("hidden");

  var list = Array.isArray(bookings) ? bookings : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No bookings." })
    ]));
    return;
  }

  list.forEach(function(b) {
    var id = b._id || b.id || "";
    var exp = b.experience || {};
    var title = exp.title || b.experienceTitle || "Experience";
    var guest = (b.guestId && b.guestId.name) || (b.user && b.user.name) || b.guestName || "Guest";
    var date = formatDateValue(b.bookingDate || b.experienceDate || b.date || b.createdAt);
    var totalCents = toNumberOrNull(
      (b.pricing && b.pricing.totalCents) ||
      (b.pricingSnapshot && b.pricingSnapshot.totalCents) ||
      (b.feeBreakdown && b.feeBreakdown.totalCents) ||
      b.amountCents
    );
    var totalPaid = totalCents === null ? formatCurrencyValue((b.pricing && b.pricing.totalPrice) || b.amountTotal || b.totalPrice || "") : formatCurrencyFromCents(totalCents);
    var hostPayoutCents = toNumberOrNull(
      b.payoutNetHostCents ||
      b.payoutGrossHostCents ||
      (b.pricingSnapshot && b.pricingSnapshot.hostPayoutCents) ||
      (b.feeBreakdown && b.feeBreakdown.hostPayoutCents) ||
      (b.pricing && b.pricing.hostPayoutCents)
    );
    var refundedCents = toNumberOrNull(
      b.totalRefundedCents ||
      (b.refundDecision && b.refundDecision.amountCents)
    );
    var status = String(b.status || "none");
    var paymentStatus = String(b.paymentStatus || "none");
    var refundStatus = String((b.refundDecision && b.refundDecision.status) || "none");
    var payoutStatus = String(b.payoutStatus || "none");
    var policyVersion = String(b.policyVersion || (b.policySnapshot && b.policySnapshot.version) || "");
    var isCancelled = status.toLowerCase().includes("cancel");
    var isPaid = String(paymentStatus || "").toLowerCase() === "paid";

    var actions = [];
    if (!isCancelled) {
      var cancelBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50",
        textContent: "Cancel"
      });
      cancelBtn.addEventListener("click", function() { handleCancelBooking(id); });
      actions.push(cancelBtn);
    }
    if (isPaid) {
      var refundBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50",
        textContent: "Partial Refund"
      });
      refundBtn.addEventListener("click", function() { handlePartialRefundBooking(id, b); });
      actions.push(refundBtn);
    }
    if (actions.length === 0) {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }

    var financial = El("div", { className: "text-sm text-slate-700 space-y-1" }, [
      El("div", { className: "font-semibold text-emerald-700", textContent: "Total: " + totalPaid }),
      El("div", { className: "text-xs text-slate-500", textContent: "Host payout: " + (hostPayoutCents === null ? "—" : formatCurrencyFromCents(hostPayoutCents)) }),
      El("div", { className: "text-xs text-slate-500", textContent: "Refunded: " + (refundedCents === null ? "—" : formatCurrencyFromCents(refundedCents)) })
    ]);

    var lifecycle = El("div", { className: "text-xs text-slate-600 space-y-1" }, [
      El("div", { textContent: "Booking: " + normalizeStateLabel(status) }),
      El("div", { textContent: "Payment: " + normalizeStateLabel(paymentStatus) }),
      El("div", { textContent: "Refund: " + normalizeStateLabel(refundStatus) }),
      El("div", { textContent: "Payout: " + normalizeStateLabel(payoutStatus) }),
      El("div", { textContent: "Policy: " + (policyVersion || "Unavailable") })
    ]);

    var actionWrap = El("div", { className: "flex flex-wrap gap-2 justify-end" }, actions);

    tbody.appendChild(El("tr", { className: "border-t border-slate-100 align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: date }),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: guest }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: title }),
      El("td", { className: "px-6 py-4" }, [financial]),
      El("td", { className: "px-6 py-4" }, [lifecycle]),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [actionWrap])
    ]));
  });
}

function renderExperiences(exps) {
  const El = window.tstsEl;
  const tbody = $("listings-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(exps) ? exps : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No listings." })
    ]));
    return;
  }

  list.forEach(function(e) {
    var id = e._id || e.id || "";
    var title = e.title || "Untitled";
    var host = e.hostName || "—";
    var price = formatCurrencyValue(e.price);
    var statusText = e.isDeleted ? "Deleted" : (e.isPaused ? "Paused" : "Active");
    var verifiedStatus = normalizeVerifiedStatus(e.verifiedStatus);
    var verifiedText = verifiedStatus === "verified"
      ? "Verified"
      : (verifiedStatus === "pending"
        ? "Verification pending"
        : (verifiedStatus === "rejected" ? "Verification rejected" : "Not verified"));

    var imgUrl = (window.tstsSafeUrl && window.tstsSafeUrl(e.imageUrl || (Array.isArray(e.images) ? e.images[0] : ""), "/assets/experience-default.jpg")) || (e.imageUrl || "");
    var imgEl = El("img", { className: "h-12 w-16 rounded-lg object-cover", alt: "Experience" });
    if (window.tstsSafeImg) {
      window.tstsSafeImg(imgEl, imgUrl, "/assets/experience-default.jpg");
    } else {
      imgEl.src = imgUrl;
    }

    var toggleLabel = e.isPaused ? "Resume" : "Pause";
    var toggleBtn = El("button", { 
      className: "px-3 py-1 text-xs font-bold rounded border " + (e.isPaused ? "border-green-200 text-green-700 hover:bg-green-50" : "border-gray-200 text-gray-700 hover:bg-gray-50"),
      textContent: toggleLabel
    });
    toggleBtn.addEventListener("click", function() { handleToggleExperience(id); });

    var deleteBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Delete" });
    deleteBtn.addEventListener("click", function() { handleDeleteExperience(id); });
    var verifyApproveBtn = null;
    var verifyRejectBtn = null;
    if (verifiedStatus === "pending") {
      verifyApproveBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50", textContent: "Approve" });
      verifyApproveBtn.addEventListener("click", function() { handleApproveVerifiedExperience(id); });
      verifyRejectBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50", textContent: "Reject" });
      verifyRejectBtn.addEventListener("click", function() { handleRejectVerifiedExperience(id); });
    }
    var actions = [toggleBtn];
    if (verifyApproveBtn) actions.push(El("span", { textContent: " " }), verifyApproveBtn);
    if (verifyRejectBtn) actions.push(El("span", { textContent: " " }), verifyRejectBtn);
    actions.push(El("span", { textContent: " " }), deleteBtn);

    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4" }, [imgEl]),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: title }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: host }),
      El("td", { className: "px-6 py-4 text-sm text-emerald-700 font-semibold", textContent: price }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500" }, [
        El("div", { className: "font-semibold text-slate-700", textContent: statusText }),
        El("div", { className: "text-xs mt-1 " + (verifiedStatus === "verified" ? "text-blue-700" : verifiedStatus === "pending" ? "text-amber-700" : "text-slate-500"), textContent: verifiedText })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-right" }, actions)
    ]));
  });
}

function renderUsers(users) {
  const El = window.tstsEl;
  const tbody = $("users-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(users) ? users : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No users." })
    ]));
    return;
  }

  list.forEach(function(u) {
    var id = u._id || u.id || "";
    var name = u.name || "—";
    var email = u.email || "—";
    var role = u.role || (u.isAdmin ? "Admin" : "Guest");
    var joined = formatDateValue(u.createdAt);
    var emailVerified = !!(u && u.emailVerified === true);
    var accountStatus = String((u && u.accountStatus) || "active").toLowerCase().trim();
    var isAdmin = !!(u && (u.isAdmin === true || String(role).toLowerCase() === "admin"));

    var deleteBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Delete" });
    deleteBtn.addEventListener("click", function() { handleDeleteUser(id); });
    var actionButtons = [];
    if (!isAdmin && emailVerified && accountStatus === "active") {
      var grantBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
        textContent: "Grant Admin"
      });
      grantBtn.addEventListener("click", function() { handleGrantAdmin(id, email || name); });
      actionButtons.push(grantBtn);
      actionButtons.push(El("span", { textContent: " " }));
    }
    actionButtons.push(deleteBtn);

    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: name }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: email }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500" }, [
        El("div", { className: "font-semibold text-slate-700", textContent: role }),
        El("div", { className: "text-xs mt-1 text-slate-500", textContent: "Status: " + normalizeStateLabel(accountStatus) + " • Verified: " + (emailVerified ? "Yes" : "No") })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: joined }),
      El("td", { className: "px-6 py-4 text-sm text-right" }, actionButtons)
    ]));
  });
}

function renderAdminInvites(items) {
  const El = window.tstsEl;
  const tbody = $("admin-invites-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No admin invites." })
    ]));
    return;
  }

  list.forEach(function (item) {
    var created = formatDateValue(item && item.createdAt);
    var expires = formatDateValue(item && item.expiresAt);
    var status = normalizeStateLabel(item && item.status);
    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700 font-semibold", textContent: String((item && item.email) || "—") }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: status }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: expires }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: String((item && item.invitedByAdminMasked) || "—") })
    ]));
  });
}

function renderAuditLogs(items) {
  const El = window.tstsEl;
  const tbody = $("audit-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "8", textContent: "No audit rows found." })
    ]));
    return;
  }

  list.forEach(function (item) {
    var created = formatDateValue(item && item.createdAt);
    var actor = String((item && item.actorMasked) || "—");
    var action = String((item && item.action) || "admin_request");
    var method = String((item && item.method) || "—");
    var path = String((item && item.path) || "—");
    var target = String((item && item.targetType) || "");
    if (item && item.targetId) target = target ? (target + " • " + String(item.targetId).slice(0, 12)) : String(item.targetId).slice(0, 12);
    if (!target) target = "—";
    var status = (item && item.ok === true) ? "OK" : "FAIL";
    var statusClass = (item && item.ok === true) ? "text-emerald-700" : "text-red-600";
    var rid = String((item && item.rid) || "");

    tbody.appendChild(El("tr", { className: "border-t border-slate-100 align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: actor }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold", textContent: action }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: rid ? ("RID: " + rid) : "RID: —" })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: method }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600 max-w-[320px] truncate", title: path, textContent: path }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: target }),
      El("td", { className: "px-6 py-4 text-sm " + statusClass, textContent: status }),
      El("td", { className: "px-6 py-4 text-xs text-slate-500", textContent: String((item && item.reason) || "—") })
    ]));
  });
}

function renderCoupons(promos) {
  const El = window.tstsEl;
  const tbody = $("coupons-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(promos) ? promos : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No coupons." })
    ]));
    return;
  }

  list.forEach(function(promo) {
    var code = String((promo && promo.code) || "");
    var active = !!(promo && promo.active);
    var statusClass = active ? "text-emerald-700" : "text-amber-700";
    var statusText = active ? "Active" : "Inactive";

    var editBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50", textContent: "Edit" });
    editBtn.addEventListener("click", function() { handleEditCoupon(code, promo); });
    var stopBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Deactivate" });
    stopBtn.disabled = !active;
    stopBtn.classList.toggle("opacity-50", !active);
    stopBtn.addEventListener("click", function() { handleDeactivateCoupon(code); });

    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: code || "—" }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600" }, [
        El("div", { className: "font-semibold text-slate-700", textContent: formatPromoScope(promo) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Funding: Platform subsidy (current pricing policy)" })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700 font-semibold", textContent: formatPromoDiscount(promo) }),
      El("td", { className: "px-6 py-4 text-sm " + statusClass, textContent: statusText }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: formatPromoWindow(promo) }),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [editBtn, El("span", { textContent: " " }), stopBtn])
    ]));
  });
}

function renderReports(items) {
  const El = window.tstsEl;
  const tbody = $("reports-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No reports." })
    ]));
    return;
  }

  list.forEach(function (r) {
    var id = String((r && (r._id || r.id)) || "");
    var created = formatDateValue(r && r.createdAt);
    var targetType = String((r && r.targetType) || "unknown");
    var targetId = String((r && r.targetId) || "").slice(0, 10);
    var category = String((r && r.category) || "general");
    var status = normalizeStateLabel(r && r.status);
    var summary = String((r && r.message) || (r && r.reason) || "").slice(0, 120);

    var triageBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50",
      textContent: "Triage"
    });
    triageBtn.addEventListener("click", function () { handleReportStatusUpdate(id, "triaged"); });

    var closeBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50",
      textContent: "Close"
    });
    closeBtn.addEventListener("click", function () { handleReportStatusUpdate(id, "closed"); });

    var actionBtns = [triageBtn, closeBtn];
    if (targetType === "user") {
      var muteBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50",
        textContent: "Mute 24h"
      });
      muteBtn.addEventListener("click", function () { handleReportAction(id, "mute_user", "actioned", { muteMinutes: 1440 }); });
      var delBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50",
        textContent: "Delete User"
      });
      delBtn.addEventListener("click", function () { handleReportAction(id, "delete_user", "actioned", {}); });
      actionBtns.push(muteBtn, delBtn);
    } else if (targetType === "experience") {
      var pauseBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50",
        textContent: "Pause Listing"
      });
      pauseBtn.addEventListener("click", function () { handleReportAction(id, "pause_experience", "actioned", {}); });
      actionBtns.push(pauseBtn);
    }

    tbody.appendChild(El("tr", { className: "border-t border-slate-100 align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: targetType + (targetId ? (" • " + targetId) : "") }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold", textContent: category }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: summary || "No additional details." })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: status }),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actionBtns)
      ])
    ]));
  });
}

function renderPrivateRequests(requests) {
  const El = window.tstsEl;
  const tbody = $("private-requests-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(requests) ? requests : [];
  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No private booking requests." })
    ]));
    return;
  }

  list.forEach(function (r) {
    var id = String((r && (r._id || r.id)) || "");
    var created = formatDateValue(r && r.createdAt);
    var expTitle = String((r && r.experienceTitle) || "Experience");
    var requester = String((r && r.requesterName) || "Guest");
    var requesterEmail = String((r && r.requesterEmail) || "");
    var schedule = String((r && r.preferredDate) || "Date TBA") + " • " + String((r && r.preferredTime) || "Time TBA");
    var status = normalizeStateLabel(r && r.status);
    var guests = Number(r && r.guests);
    var adminNote = String((r && r.adminNote) || "").slice(0, 100);

    function mkStatusBtn(label, nextStatus, className) {
      var btn = El("button", { className: className, textContent: label });
      btn.addEventListener("click", function () { handlePrivateRequestStatus(id, nextStatus); });
      return btn;
    }

    var actions = [
      mkStatusBtn("Contacted", "contacted", "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50"),
      mkStatusBtn("Approve", "approved", "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"),
      mkStatusBtn("Decline", "declined", "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50"),
      mkStatusBtn("Close", "closed", "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50")
    ];

    tbody.appendChild(El("tr", { className: "border-t border-slate-100 align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: expTitle }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold", textContent: requester }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: requesterEmail || "No email provided" })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { textContent: schedule }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: (Number.isFinite(guests) ? (guests + " guests") : "Guests not set") })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-600" }, [
        El("div", { className: "font-semibold", textContent: status }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: adminNote || "No admin note" })
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
    ]));
  });
}

function collectAuditFilters() {
  var method = String(($("audit-filter-method") && $("audit-filter-method").value) || "").trim().toUpperCase();
  var okRaw = String(($("audit-filter-ok") && $("audit-filter-ok").value) || "").trim().toLowerCase();
  var out = {
    from: String(($("audit-filter-from") && $("audit-filter-from").value) || "").trim(),
    to: String(($("audit-filter-to") && $("audit-filter-to").value) || "").trim(),
    actorId: String(($("audit-filter-actor") && $("audit-filter-actor").value) || "").trim(),
    action: String(($("audit-filter-action") && $("audit-filter-action").value) || "").trim(),
    method: method,
    pathContains: String(($("audit-filter-path") && $("audit-filter-path").value) || "").trim(),
    limit: 100,
    skip: 0
  };
  if (!out.from) delete out.from;
  if (!out.to) delete out.to;
  if (!out.actorId) delete out.actorId;
  if (!out.action) delete out.action;
  if (!out.method) delete out.method;
  if (!out.pathContains) delete out.pathContains;
  if (okRaw === "true") out.ok = true;
  if (okRaw === "false") out.ok = false;
  return out;
}

async function refreshAuditLogs() {
  const data = await loadAuditLogs(collectAuditFilters());
  if ($("audit-total-count")) $("audit-total-count").textContent = String((data && data.total) || 0);
  renderAuditLogs((data && data.items) || []);
}

async function refreshAdminInvites() {
  const data = await loadAdminInvites("all");
  renderAdminInvites((data && data.items) || []);
}

// Local action handlers (no window.* exposure)
async function handleToggleExperience(id) {
  try { await toggleExperience(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleDeleteExperience(id) {
  var confirmed = await window.tstsConfirm("Delete this experience?", { destructive: true, confirmText: "Delete" });
  if (!confirmed) return;
  try { await deleteExperience(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleApproveVerifiedExperience(id) {
  var confirmed = await window.tstsConfirm("Approve verification for this experience?", { confirmText: "Approve" });
  if (!confirmed) return;
  try { await approveVerifiedExperience(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleRejectVerifiedExperience(id) {
  var confirmed = await window.tstsConfirm("Reject verification for this experience?", { destructive: true, confirmText: "Reject" });
  if (!confirmed) return;
  try { await rejectVerifiedExperience(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleDeleteUser(id) {
  var confirmed = await window.tstsConfirm("Delete this user?", { destructive: true, confirmText: "Delete" });
  if (!confirmed) return;
  try { await deleteUser(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleGrantAdmin(id, label) {
  var confirmed = await window.tstsConfirm("Grant admin access to " + String(label || "this user") + "?", { confirmText: "Grant Admin" });
  if (!confirmed) return;
  try {
    await grantAdmin(id);
    window.tstsNotify("Admin access granted.", "success");
    await Promise.all([
      loadUsers().then(renderUsers),
      refreshAdminInvites().catch(function () {})
    ]);
  } catch (e) {
    window.tstsNotify(e.message || "Failed to grant admin access.", "error");
  }
}
async function handleCancelBooking(id) {
  var confirmed = await window.tstsConfirm("Cancel this booking?", { destructive: true, confirmText: "Cancel Booking" });
  if (!confirmed) return;
  try { await cancelBooking(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handlePartialRefundBooking(id, booking) {
  var totalCents = toNumberOrNull(
    (booking && booking.pricingSnapshot && booking.pricingSnapshot.totalCents) ||
    (booking && booking.feeBreakdown && booking.feeBreakdown.totalCents) ||
    (booking && booking.pricing && booking.pricing.totalCents) ||
    booking.amountCents
  );
  var hint = totalCents === null ? "" : ("Max total: " + formatCurrencyFromCents(totalCents));
  var raw = await window.tstsPrompt("Partial refund amount (AUD)", "", { minLength: 1, placeholder: hint || "e.g. 25.50" });
  raw = String(raw || "").trim();
  if (!raw) return;
  var aud = Number(raw);
  if (!Number.isFinite(aud) || aud <= 0) {
    window.tstsNotify("Enter a valid amount greater than 0.", "error");
    return;
  }
  var amountCents = Math.max(1, Math.round(aud * 100));
  var confirmed = await window.tstsConfirm("Request partial refund of " + formatCurrencyFromCents(amountCents) + "?", { destructive: true, confirmText: "Request Refund" });
  if (!confirmed) return;
  try {
    await refundBookingPartial(id, { amountCents: amountCents, reason: "requested_by_customer" });
    window.tstsNotify("Partial refund requested.", "success");
    await boot();
  } catch (e) {
    window.tstsNotify(e.message || "Partial refund failed", "error");
  }
}
async function handleReportStatusUpdate(id, nextStatus) {
  try {
    await updateReport(id, { status: String(nextStatus || ""), action: "none" });
    window.tstsNotify("Report updated.", "success");
    await loadReports().then(renderReports);
  } catch (e) {
    window.tstsNotify(e.message || "Report update failed", "error");
  }
}
async function handleReportAction(id, action, status, extra) {
  var confirmText = action === "delete_user" ? "Delete User" : (action === "pause_experience" ? "Pause Listing" : "Apply Action");
  var confirmed = await window.tstsConfirm("Apply moderation action: " + action.replace(/_/g, " ") + "?", { destructive: action !== "mute_user", confirmText: confirmText });
  if (!confirmed) return;
  try {
    var payload = Object.assign({}, extra || {}, { action: action, status: status || "actioned" });
    await updateReport(id, payload);
    window.tstsNotify("Moderation action applied.", "success");
    await loadReports().then(renderReports);
    await loadUsers().then(renderUsers).catch(() => renderUsers([]));
    await loadExperiences().then(renderExperiences).catch(() => renderExperiences([]));
  } catch (e) {
    window.tstsNotify(e.message || "Moderation action failed", "error");
  }
}
async function handlePrivateRequestStatus(id, status) {
  try {
    var note = await window.tstsPrompt("Optional admin note", "", { minLength: 0, placeholder: "Add internal context..." });
    await updatePrivateBookingRequestStatus(id, { status: status, adminNote: String(note || "").trim() });
    window.tstsNotify("Private request updated.", "success");
    await loadPrivateBookingRequests().then(renderPrivateRequests);
  } catch (e) {
    window.tstsNotify(e.message || "Private request update failed", "error");
  }
}
async function handleInviteAdminSubmit(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  var email = String(($("admin-invite-email") && $("admin-invite-email").value) || "").trim();
  if (!email) {
    window.tstsNotify("Invite email is required.", "error");
    return;
  }
  try {
    await inviteAdmin(email);
    if ($("admin-invite-email")) $("admin-invite-email").value = "";
    window.tstsNotify("Admin invite sent.", "success");
    await refreshAdminInvites();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to send invite", "error");
  }
}
async function handleRefreshAudit() {
  try {
    await refreshAuditLogs();
  } catch (e) {
    window.tstsNotify(e.message || "Failed to load audit logs.", "error");
  }
}
async function handleExportAudit(format) {
  try {
    await exportAuditLogs(format, collectAuditFilters());
    window.tstsNotify("Audit export downloaded.", "success");
  } catch (e) {
    window.tstsNotify(e.message || "Failed to export audit logs.", "error");
  }
}
async function handleCreateCoupon(e) {
  e.preventDefault();
  try {
    var payload = {
      code: String(($("coupon-code") && $("coupon-code").value) || "").trim().toUpperCase(),
      scopeType: String(($("coupon-scope") && $("coupon-scope").value) || "global").trim().toLowerCase(),
      percentOff: Number(($("coupon-percent") && $("coupon-percent").value) || 0),
      fixedOffCents: Number(($("coupon-fixed") && $("coupon-fixed").value) || 0),
      maxUsesTotal: Number(($("coupon-max-total") && $("coupon-max-total").value) || 0),
      maxUsesPerUser: Number(($("coupon-max-user") && $("coupon-max-user").value) || 1),
      minSubtotalCents: Number(($("coupon-min-subtotal") && $("coupon-min-subtotal").value) || 0),
      minGuests: Number(($("coupon-min-guests") && $("coupon-min-guests").value) || 0),
      appliesToCategories: __csvToArray(($("coupon-categories") && $("coupon-categories").value) || ""),
      appliesToExperienceIds: __csvToArray(($("coupon-experience-ids") && $("coupon-experience-ids").value) || "")
    };
    var vf = String(($("coupon-valid-from") && $("coupon-valid-from").value) || "").trim();
    var vt = String(($("coupon-valid-to") && $("coupon-valid-to").value) || "").trim();
    if (vf) payload.validFrom = new Date(vf).toISOString();
    if (vt) payload.validTo = new Date(vt).toISOString();
    if (!payload.code) delete payload.code;
    if (!(payload.percentOff > 0) && !(payload.fixedOffCents > 0)) {
      throw new Error("Provide percent off or fixed off amount.");
    }
    await createCoupon(payload);
    window.tstsNotify("Coupon created.", "success");
    var form = $("coupon-create-form");
    if (form && typeof form.reset === "function") form.reset();
    if ($("coupon-max-user")) $("coupon-max-user").value = "1";
    await loadCoupons().then(renderCoupons);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Coupon create failed", "error");
  }
}
async function handleEditCoupon(code, promo) {
  try {
    var seed = {
      percentOff: Number(promo && promo.percentOff) || 0,
      fixedOffCents: Number(promo && promo.fixedOffCents) || 0,
      maxUsesTotal: Number(promo && promo.maxUsesTotal) || 0,
      maxUsesPerUser: Number(promo && promo.maxUsesPerUser) || 1,
      minSubtotalCents: Number(promo && promo.minSubtotalCents) || 0,
      minGuests: Number(promo && promo.minGuests) || 0,
      validFrom: (promo && promo.validFrom) ? new Date(promo.validFrom).toISOString() : null,
      validTo: (promo && promo.validTo) ? new Date(promo.validTo).toISOString() : null,
      scopeType: String((promo && promo.scopeType) || "global"),
      appliesToCategories: Array.isArray(promo && promo.appliesToCategories) ? promo.appliesToCategories : [],
      appliesToExperienceIds: Array.isArray(promo && promo.appliesToExperienceIds) ? promo.appliesToExperienceIds : []
    };
    var raw = await window.tstsPrompt("Edit coupon JSON patch", JSON.stringify(seed, null, 2), { minLength: 2, placeholder: "{\"percentOff\":10}" });
    raw = String(raw || "").trim();
    if (!raw) return;
    var patch = JSON.parse(raw);
    await updateCoupon(code, patch);
    window.tstsNotify("Coupon updated.", "success");
    await loadCoupons().then(renderCoupons);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Coupon update failed", "error");
  }
}
async function handleDeactivateCoupon(code) {
  var confirmed = await window.tstsConfirm("Deactivate coupon " + code + "?", { destructive: true, confirmText: "Deactivate" });
  if (!confirmed) return;
  try {
    await deactivateCoupon(code);
    window.tstsNotify("Coupon deactivated.", "success");
    await loadCoupons().then(renderCoupons);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Deactivate failed", "error");
  }
}

// Tab switching functionality (local, no window.* exposure)
function switchTab(tabName) {
  const views = ['dashboard', 'listings', 'users', 'coupons', 'moderation', 'private-requests', 'audit'];
  const activeClass = "border-tsts-clay text-tsts-clay border-b-2 py-4 px-1 font-bold text-sm";
  const inactiveClass = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 border-b-2 py-4 px-1 font-medium text-sm";

  views.forEach(view => {
    const viewEl = document.getElementById('view-' + view);
    if (viewEl) viewEl.classList.add('hidden');
  });

  views.forEach(view => {
    const tabEl = document.getElementById('tab-' + view);
    if (tabEl) tabEl.className = inactiveClass;
  });

  const selectedView = document.getElementById('view-' + tabName);
  if (selectedView) selectedView.classList.remove('hidden');

  const selectedTab = document.getElementById('tab-' + tabName);
  if (selectedTab) selectedTab.className = activeClass;

  if (tabName === 'users') {
    loadUsers().then(renderUsers).catch(() => renderUsers([]));
    refreshAdminInvites().catch(() => renderAdminInvites([]));
  }
  if (tabName === 'listings') {
    loadExperiences().then(renderExperiences).catch(() => renderExperiences([]));
  }
  if (tabName === 'coupons') {
    loadCoupons().then(renderCoupons).catch(() => renderCoupons([]));
  }
  if (tabName === 'moderation') {
    loadReports().then(renderReports).catch(() => renderReports([]));
  }
  if (tabName === 'private-requests') {
    loadPrivateBookingRequests().then(renderPrivateRequests).catch(() => renderPrivateRequests([]));
  }
  if (tabName === 'dashboard') {
    Promise.all([
      loadStats().catch(() => ({})),
      loadBookings().catch(() => ([]))
    ]).then(([stats, bookings]) => {
      renderStats(stats);
      renderBookings(bookings);
    });
  }
  if (tabName === 'audit') {
    refreshAuditLogs().catch(() => renderAuditLogs([]));
  }
};

let __adminWired = false;

function wireAdminEvents() {
  if (__adminWired) return;
  __adminWired = true;

  const tabDashboard = $("tab-dashboard");
  const tabListings = $("tab-listings");
  const tabUsers = $("tab-users");
  const tabCoupons = $("tab-coupons");
  const tabModeration = $("tab-moderation");
  const tabPrivateRequests = $("tab-private-requests");
  const tabAudit = $("tab-audit");
  const refreshListings = $("btn-refresh-listings");
  const refreshUsers = $("btn-refresh-users");
  const refreshCoupons = $("btn-refresh-coupons");
  const refreshReports = $("btn-refresh-reports");
  const refreshPrivateRequests = $("btn-refresh-private-requests");
  const refreshAudit = $("btn-refresh-audit");
  const applyAuditFilters = $("btn-audit-apply");
  const exportAuditCsv = $("btn-export-audit-csv");
  const exportAuditJson = $("btn-export-audit-json");
  const adminInviteForm = $("admin-invite-form");
  const refreshAdminInvitesBtn = $("btn-refresh-admin-invites");
  const couponCreateForm = $("coupon-create-form");

  if (tabDashboard) tabDashboard.addEventListener("click", () => switchTab("dashboard"));
  if (tabListings) tabListings.addEventListener("click", () => switchTab("listings"));
  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (tabCoupons) tabCoupons.addEventListener("click", () => switchTab("coupons"));
  if (tabModeration) tabModeration.addEventListener("click", () => switchTab("moderation"));
  if (tabPrivateRequests) tabPrivateRequests.addEventListener("click", () => switchTab("private-requests"));
  if (tabAudit) tabAudit.addEventListener("click", () => switchTab("audit"));
  if (refreshListings) refreshListings.addEventListener("click", () => loadExperiences().then(renderExperiences).catch(() => renderExperiences([])));
  if (refreshUsers) refreshUsers.addEventListener("click", () => loadUsers().then(renderUsers).catch(() => renderUsers([])));
  if (refreshCoupons) refreshCoupons.addEventListener("click", () => loadCoupons().then(renderCoupons).catch(() => renderCoupons([])));
  if (refreshReports) refreshReports.addEventListener("click", () => loadReports().then(renderReports).catch(() => renderReports([])));
  if (refreshPrivateRequests) refreshPrivateRequests.addEventListener("click", () => loadPrivateBookingRequests().then(renderPrivateRequests).catch(() => renderPrivateRequests([])));
  if (refreshAudit) refreshAudit.addEventListener("click", () => handleRefreshAudit());
  if (applyAuditFilters) applyAuditFilters.addEventListener("click", () => handleRefreshAudit());
  if (exportAuditCsv) exportAuditCsv.addEventListener("click", () => handleExportAudit("csv"));
  if (exportAuditJson) exportAuditJson.addEventListener("click", () => handleExportAudit("json"));
  if (adminInviteForm) adminInviteForm.addEventListener("submit", handleInviteAdminSubmit);
  if (refreshAdminInvitesBtn) refreshAdminInvitesBtn.addEventListener("click", () => refreshAdminInvites().catch(() => renderAdminInvites([])));
  if (couponCreateForm) couponCreateForm.addEventListener("submit", handleCreateCoupon);
}

async function boot() {
  if (!(await mustBeAdmin())) return;

  wireAdminEvents();

  // basic skeleton if containers exist
  try {
    const [stats, bookings, exps, users, promos, reports, privateRequests, auditData, inviteData] = await Promise.all([
      loadStats().catch(() => ({})),
      loadBookings().catch(() => ([])),
      loadExperiences().catch(() => ([])),
      loadUsers().catch(() => ([])),
      loadCoupons().catch(() => ([])),
      loadReports().catch(() => ([])),
      loadPrivateBookingRequests().catch(() => ([])),
      loadAuditLogs({ limit: 100, skip: 0 }).catch(() => ({ total: 0, items: [] })),
      loadAdminInvites("all").catch(() => ({ items: [] }))
    ]);

    renderStats(stats);
    renderBookings(bookings);
    renderExperiences(exps);
    renderUsers(users);
    renderCoupons(promos);
    renderReports(reports);
    renderPrivateRequests(privateRequests);
    if ($("audit-total-count")) $("audit-total-count").textContent = String((auditData && auditData.total) || 0);
    renderAuditLogs((auditData && auditData.items) || []);
    renderAdminInvites((inviteData && inviteData.items) || []);
  } catch (e) {
    window.tstsNotify("Admin load failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", boot);
