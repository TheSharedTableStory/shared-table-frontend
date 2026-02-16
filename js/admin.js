// js/admin.js
// Single-truth networking: window.authFetch + window.getAuthToken from common.js

function redirectToLogin() {
  const returnTo = encodeURIComponent(location.pathname + location.search);
  location.href = "login.html?returnTo=" + returnTo;
}

async function getAdminReason() {
  let r = "";
  try { r = String(sessionStorage.getItem("admin_reason") || ""); } catch (_) { r = ""; }
  r = r.trim();
  if (r.length >= 5) return r;
  try {
    r = await window.tstsPrompt("Admin reason (required)", "", { minLength: 5, placeholder: "Enter reason for this action..." });
    r = String(r || "").trim();
  } catch (_) { r = ""; }
  if (r.length < 5) return "";
  try { sessionStorage.setItem("admin_reason", r); } catch (_) {}
  return r;
}

function withOptionalAdminReasonHeaders(opts) {
  let r = "";
  try { r = String(sessionStorage.getItem("admin_reason") || ""); } catch (_) { r = ""; }
  r = r.trim();
  if (r.length < 5) return opts || {};
  const headers = Object.assign({}, (opts && opts.headers) || {}, { "X-Admin-Reason": r });
  return Object.assign({}, opts || {}, { headers });
}

async function adminFetch(path, opts) {
  if (!path.startsWith("/api/admin/")) {
    return window.authFetch(path, withOptionalAdminReasonHeaders(opts));
  }
  const reason = await getAdminReason();
  if (!reason) throw new Error("Admin reason required");
  const headers = Object.assign({}, (opts && opts.headers) || {}, { "X-Admin-Reason": reason });
  return window.authFetch(path, Object.assign({}, opts || {}, { headers }));
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

async function loadCoupons() {
  const res = await adminFetch("/api/admin/promo-codes", { method: "GET" });
  if (!res.ok) throw new Error("coupons");
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.promos) ? data.promos : [];
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
  const res = await window.authFetch("/api/experiences/" + encodeURIComponent(id), withOptionalAdminReasonHeaders({ method: "DELETE" }));
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
    var amount = formatCurrencyValue((b.pricing && b.pricing.totalPrice) || b.amountTotal || b.totalPrice || "");
    var status = String(b.status || "—");
    var isCancelled = status.toLowerCase().includes("cancel");

    var actionEl = El("span", { className: "text-xs text-slate-400", textContent: "—" });
    if (!isCancelled) {
      var cancelBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Cancel" });
      cancelBtn.addEventListener("click", function() { handleCancelBooking(id); });
      actionEl = cancelBtn;
    }

    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: date }),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: guest }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: title }),
      El("td", { className: "px-6 py-4 text-sm text-emerald-700 font-semibold", textContent: amount }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: status }),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [actionEl])
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

    var deleteBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Delete" });
    deleteBtn.addEventListener("click", function() { handleDeleteUser(id); });

    tbody.appendChild(El("tr", { className: "border-t border-slate-100" }, [
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: name }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: email }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: role }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: joined }),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [deleteBtn])
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
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: formatPromoScope(promo) }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700 font-semibold", textContent: formatPromoDiscount(promo) }),
      El("td", { className: "px-6 py-4 text-sm " + statusClass, textContent: statusText }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500", textContent: formatPromoWindow(promo) }),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [editBtn, El("span", { textContent: " " }), stopBtn])
    ]));
  });
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
async function handleCancelBooking(id) {
  var confirmed = await window.tstsConfirm("Cancel this booking?", { destructive: true, confirmText: "Cancel Booking" });
  if (!confirmed) return;
  try { await cancelBooking(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
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
  const views = ['dashboard', 'listings', 'users', 'coupons'];
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
  }
  if (tabName === 'listings') {
    loadExperiences().then(renderExperiences).catch(() => renderExperiences([]));
  }
  if (tabName === 'coupons') {
    loadCoupons().then(renderCoupons).catch(() => renderCoupons([]));
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
};

let __adminWired = false;

function wireAdminEvents() {
  if (__adminWired) return;
  __adminWired = true;

  const tabDashboard = $("tab-dashboard");
  const tabListings = $("tab-listings");
  const tabUsers = $("tab-users");
  const tabCoupons = $("tab-coupons");
  const refreshListings = $("btn-refresh-listings");
  const refreshUsers = $("btn-refresh-users");
  const refreshCoupons = $("btn-refresh-coupons");
  const couponCreateForm = $("coupon-create-form");

  if (tabDashboard) tabDashboard.addEventListener("click", () => switchTab("dashboard"));
  if (tabListings) tabListings.addEventListener("click", () => switchTab("listings"));
  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (tabCoupons) tabCoupons.addEventListener("click", () => switchTab("coupons"));
  if (refreshListings) refreshListings.addEventListener("click", () => loadExperiences().then(renderExperiences).catch(() => renderExperiences([])));
  if (refreshUsers) refreshUsers.addEventListener("click", () => loadUsers().then(renderUsers).catch(() => renderUsers([])));
  if (refreshCoupons) refreshCoupons.addEventListener("click", () => loadCoupons().then(renderCoupons).catch(() => renderCoupons([])));
  if (couponCreateForm) couponCreateForm.addEventListener("submit", handleCreateCoupon);
}

async function boot() {
  if (!(await mustBeAdmin())) return;

  try { getAdminReason(); } catch (_) {}

  wireAdminEvents();

  // basic skeleton if containers exist
  try {
    const [stats, bookings, exps, users, promos] = await Promise.all([
      loadStats().catch(() => ({})),
      loadBookings().catch(() => ([])),
      loadExperiences().catch(() => ([])),
      loadUsers().catch(() => ([])),
      loadCoupons().catch(() => ([]))
    ]);

    renderStats(stats);
    renderBookings(bookings);
    renderExperiences(exps);
    renderUsers(users);
    renderCoupons(promos);
  } catch (e) {
    window.tstsNotify("Admin load failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", boot);
