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

// Tab switching functionality (local, no window.* exposure)
function switchTab(tabName) {
  const views = ['dashboard', 'listings', 'users'];
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
  const refreshListings = $("btn-refresh-listings");
  const refreshUsers = $("btn-refresh-users");

  if (tabDashboard) tabDashboard.addEventListener("click", () => switchTab("dashboard"));
  if (tabListings) tabListings.addEventListener("click", () => switchTab("listings"));
  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (refreshListings) refreshListings.addEventListener("click", () => loadExperiences().then(renderExperiences).catch(() => renderExperiences([])));
  if (refreshUsers) refreshUsers.addEventListener("click", () => loadUsers().then(renderUsers).catch(() => renderUsers([])));
}

async function boot() {
  if (!(await mustBeAdmin())) return;

  try { getAdminReason(); } catch (_) {}

  wireAdminEvents();

  // basic skeleton if containers exist
  try {
    const [stats, bookings, exps, users] = await Promise.all([
      loadStats().catch(() => ({})),
      loadBookings().catch(() => ([])),
      loadExperiences().catch(() => ([])),
      loadUsers().catch(() => ([]))
    ]);

    renderStats(stats);
    renderBookings(bookings);
    renderExperiences(exps);
    renderUsers(users);
  } catch (e) {
    window.tstsNotify("Admin load failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", boot);
