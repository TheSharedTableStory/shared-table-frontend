// js/admin.js
// Single-truth networking: window.authFetch + window.getAuthToken from common.js

function redirectToLogin() {
  const returnTo = encodeURIComponent(location.pathname + location.search);
  location.href = "login.html?returnTo=" + returnTo;
}

async function adminFetch(path, opts) {
  return window.authFetch(path, opts || {});
}

// BUG-166/167 (2026-05-17): admin approve/reject/verification actions had NO
// Idempotency-Key — a double-click (or a retry after a slow response) fired
// the mutation twice → duplicate moderation/verification side effects +
// duplicate AdminAudit. authFetch maps `opts.idempotencyKey` →
// `Idempotency-Key` (common.js), and the server's adminMutationIdempotency
// middleware (BUG-138) + canonical request-hash (BUG-167 cluster) now de-
// duplicate same-key replays. This mints a fresh per-invocation key for the
// admin action handlers (mirrors the existing grant/suspend flows at
// admin.js:507/3196 which already use window.tstsIdempotencyKey).
function __adminIdemKey() {
  return (window.tstsIdempotencyKey) ? window.tstsIdempotencyKey({ dataset: {} }) : "";
}

// BUG-167 (2026-05-17, restored 2026-08-20 on sir's order — the admin.js rework had dropped it):
// the UX half of the double-submit fix. The triggering control locks while its request is in
// flight, so a double-tap cannot fire the mutation twice from the screen; the server's
// idempotency middleware stays the hard backstop. Restores the control's PRIOR disabled state
// (even on throw), and a missing/null control is safe.
async function __adminGuardedClick(btn, fn) {
  const wasDisabled = btn ? !!btn.disabled : false;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    if (btn) btn.disabled = wasDisabled;
  }
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
      try {
        if (window.tstsHydrateNavAuth) await window.tstsHydrateNavAuth({ force: true, session: sess });
      } catch (_) {}
      return true;
    }
    const role = String((u && u.role) || "").toLowerCase();
    if (role === "admin") {
      try {
        if (window.tstsHydrateNavAuth) await window.tstsHydrateNavAuth({ force: true, session: sess });
      } catch (_) {}
      return true;
    }
    // 2026-08-25: this used to call document.body.replaceChildren() — destroying the shared header and
    // footer along with the admin panel — and leave the words "Access denied" alone on a blank page.
    // That header is the one universal escape route on this platform, so the single screen where a
    // person most needs a way out was the only screen that removed it. There were ZERO links in the
    // result; the browser's back button was the only exit.
    //
    // "Access denied" is also a system phrase: it says neither WHY (you are signed in, just not as an
    // administrator) nor what to do next.
    //
    // admin.html is <nav id="navbar-placeholder"> + <main> + <footer id="footer-placeholder">, so only
    // <main> is replaced. Nav and footer survive untouched. The shape mirrors the platform's own error
    // states (404 and the email-change failure page): headline, plain explanation, one way out.
    const El = window.tstsEl;
    const mainEl = document.querySelector("main");
    const target = mainEl || document.body;
    if (El) {
      const card = El("div", { className: "flex items-center justify-center px-6 py-16" }, [
        El("div", { className: "max-w-md text-center" }, [
          El("h1", { className: "heading-serif text-2xl md:text-3xl font-bold text-tsts-ink" }, "This area is for administrators"),
          El("p", { className: "mt-3 text-base text-gray-600 leading-relaxed" },
            "You're signed in, but this account doesn't have admin access. If you think it should, ask an administrator to grant it."),
          El("a", { href: "index.html", className: "mt-8 inline-block tsts-btn-primary px-8 py-3 rounded-full font-bold shadow transition" }, "Go Home")
        ])
      ]);
      // inline height: `min-h-[60vh]` is not present in the compiled tailwind.css (purged), so the
      // class would be inert. <main> is not a flex container either, so flex-grow does nothing here.
      card.style.minHeight = "60vh";
      target.replaceChildren(card);
    } else {
      // tstsEl unavailable: still never wipe the whole document, and still leave a way out.
      const fb = document.createElement("div");
      fb.className = "flex items-center justify-center px-6 py-16 text-center";
      fb.style.minHeight = "60vh";
      const p1 = document.createElement("p");
      p1.textContent = "This area is for administrators. You're signed in, but this account doesn't have admin access.";
      const a1 = document.createElement("a");
      a1.href = "index.html";
      a1.textContent = "Go Home";
      a1.className = "block mt-6 underline";
      fb.appendChild(p1); fb.appendChild(a1);
      target.replaceChildren(fb);
    }
    return false;
  } catch (_) {
    redirectToLogin();
    return false;
  }
}

var currentListingsFilter = "all";
var allExperiencesCache = [];
var experiencesPageSize = 100;
var experiencesTotalCount = 0;
var shortfallReasonCodes = [];
var shortfallSettlementReasonCodes = [];
var shortfallWaiverReasonCodes = [];
var bookingsPage = 0;
var bookingsPageSize = 20;
var bookingsTotalCount = 0;

async function loadDashboardSummary() {
  const res = await adminFetch("/api/admin/dashboard-summary", { method: "GET" });
  if (!res.ok) throw new Error("dashboard-summary");
  const raw = await res.json();
  return (raw && raw.data) ? raw.data : raw;
}

function renderDashboardSummary(data) {
  const expSection = document.getElementById("lifecycle-summary-section");
  const expCards = document.getElementById("exp-status-cards");
  const bkCards = document.getElementById("booking-status-cards");
  if (!expSection || !expCards || !bkCards) return;
  const El = window.tstsEl;

  var _d = data || {};
  var expByStatus = _d.expByStatus || {};
  var bookingByStatus = _d.bookingByStatus || {};

  var expDefs = [
    { key: "ACTIVE", label: "Active", color: "text-green-700", bg: "bg-green-50 border-green-200" },
    { key: "PAUSED", label: "Paused", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
    { key: "DELETED_SOFT", label: "Deleted", color: "text-red-600", bg: "bg-red-50 border-red-200" }
  ];
  // sir 2026-08-09: this was a fixed list of four, and it lied twice — it drew a "Disputed" tile for a
  // status no booking can hold (a dispute is a separate flag, so it could only ever read 0) and it
  // silently dropped "authorized", the guests whose card is held but not yet charged. Seven bookings
  // were invisible and the four tiles totalled 626 against a headline of 633. The tiles are now built
  // from whatever the server actually reports, so they always add up and a new status can never go
  // unseen. Colours are chosen by meaning; anything unrecognised still gets a tile, in slate.
  var bkTone = {
    confirmed: { color: "text-green-700", bg: "bg-green-50 border-green-200" },
    completed: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    cancelled: { color: "text-red-600", bg: "bg-red-50 border-red-200" },
    authorized: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    pending: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    pending_payment: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    expired: { color: "text-slate-600", bg: "bg-slate-50 border-slate-200" }
  };
  var bkOrder = ["confirmed", "authorized", "pending_payment", "pending", "completed", "cancelled", "expired"];
  var bkDefs = Object.keys(bookingByStatus)
    .filter(function (k) { return Number(bookingByStatus[k] || 0) > 0 || bkOrder.indexOf(k) >= 0; })
    .sort(function (a, b) {
      var ia = bkOrder.indexOf(a), ib = bkOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(function (k) {
      var tone = bkTone[k] || { color: "text-slate-700", bg: "bg-slate-50 border-slate-200" };
      // "Authorized" is the payment world's word. To a person it means the card is held, not charged.
      return { key: k, label: (k === "authorized" ? "Payment held" : normalizeStateLabel(k)), color: tone.color, bg: tone.bg };
    });

  expCards.textContent = "";
  expDefs.forEach(function(d) {
    expCards.appendChild(El("article", { className: "rounded-xl border p-4 " + d.bg }, [
      El("span", { className: "text-xs uppercase tracking-widest text-slate-500", textContent: d.label }),
      El("p", { className: "text-2xl font-bold mt-1 " + d.color, textContent: String(expByStatus[d.key] || 0) })
    ]));
  });

  bkCards.textContent = "";
  bkDefs.forEach(function(d) {
    bkCards.appendChild(El("article", { className: "rounded-xl border p-4 " + d.bg }, [
      El("span", { className: "text-xs uppercase tracking-widest text-slate-500", textContent: d.label }),
      El("p", { className: "text-2xl font-bold mt-1 " + d.color, textContent: String(bookingByStatus[d.key] || 0) })
    ]));
  });

  __renderModerationWaiting(Number((_d.moderation && _d.moderation.flaggedChatsAwaitingReview) || 0));
  __renderNeedsAttention(_d.needsAttention || {});

  expSection.classList.remove("hidden");
}

// sir 2026-08-09, verbatim: "not just what server feeds them but also what additional are needed by
// admin and build it". Counts of confirmed and completed tell an admin what HAPPENED. They never tell
// anyone what is WAITING. Each of these was already knowable and shown on no screen: a guest waiting
// on their money, a host who cannot be paid, a dispute nobody has answered, a host waiting to be
// checked, a conversation someone reported. The row appears only when something is actually waiting —
// a caught-up admin sees a clean dashboard and so never learns to scroll past this. Every tile opens
// the screen where the work is done, because a number nobody can act on is decoration.
function __renderNeedsAttention(counts) {
  var host = document.getElementById("lifecycle-summary-section");
  if (!host) return;
  var El = window.tstsEl;
  var existing = document.getElementById("needs-attention-block");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  // Each destination is a screen that really exists (the view ids switchTab accepts) and is where that
  // particular job is actually done. Refunds, disputes and held payouts are all booking work, and the
  // bookings table sits on THIS page — so those scroll to it rather than pretending to navigate.
  var defs = [
    { key: "refundsWaiting", label: "Refunds waiting", go: "bookings", tone: "text-red-600", bg: "bg-red-50 border-red-200" },
    { key: "disputesOpen", label: "Disputes open", go: "bookings", tone: "text-red-600", bg: "bg-red-50 border-red-200" },
    { key: "payoutsHeld", label: "Payouts held", go: "bookings", tone: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    { key: "hostsAwaitingCheck", label: "Hosts to check", go: "verification", tone: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    { key: "flaggedChats", label: "Chats reported", go: "moderation", tone: "text-amber-700", bg: "bg-amber-50 border-amber-200" }
  ].filter(function (d) { return Number(counts[d.key] || 0) > 0; });

  if (defs.length === 0) return;

  function goTo(target) {
    if (target === "bookings") {
      var table = document.getElementById("bookings-table-body");
      var section = table ? table.closest("section") : null;
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    try { switchTab(target); } catch (_navErr) { void _navErr; }
  }

  var cards = defs.map(function (d) {
    var card = El("article", {
      className: "rounded-xl border p-4 cursor-pointer hover:shadow-md transition " + d.bg,
      role: "button", tabIndex: 0,
      "aria-label": d.label + ": " + String(counts[d.key])
    }, [
      El("span", { className: "text-xs uppercase tracking-widest text-slate-500", textContent: d.label }),
      El("p", { className: "text-2xl font-bold mt-1 " + d.tone, textContent: String(counts[d.key]) })
    ]);
    card.addEventListener("click", function () { goTo(d.go); });
    card.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goTo(d.go); }
    });
    return card;
  });

  var block = El("div", { id: "needs-attention-block" }, [
    El("h2", { className: "font-bold text-lg text-tsts-ink mb-3 mt-6", textContent: "Waiting on you" }),
    El("div", { className: "grid gap-3 grid-cols-2 sm:grid-cols-4" }, cards)
  ]);
  host.appendChild(block);
}

// Owner 2026-08-05 (sir: "what will admin do once the msg is deliverd?" · "how many email will you
// sned for million violations?"). A flagged conversation used to land in the database and tell nobody,
// while the Report modal promised the guest "our team reads every report". This is the standing signal:
// it appears only when something is actually waiting, so a caught-up admin sees a clean dashboard and
// never learns to ignore it, and it reads the same at three or three hundred thousand.
function __renderModerationWaiting(count) {
  var host = document.getElementById("lifecycle-summary-section");
  if (!host) return;
  var El = window.tstsEl;
  var existing = document.getElementById("moderation-waiting-banner");
  if (existing) existing.remove();
  if (!(count > 0)) return;

  var goTo = El("button", {
    type: "button",
    className: "shrink-0 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition",
    textContent: "Review " + (count === 1 ? "it" : "them")
  });
  goTo.addEventListener("click", function () {
    var tab = document.getElementById("tab-private-requests");
    if (tab) tab.click();
    window.setTimeout(function () {
      var btns = Array.prototype.slice.call(document.querySelectorAll("button"));
      for (var i = 0; i < btns.length; i++) {
        if (String(btns[i].textContent || "").trim() === "Flagged chats") { btns[i].click(); return; }
      }
    }, 600);
  });

  var banner = El("section", {
    id: "moderation-waiting-banner",
    className: "rounded-xl border border-rose-200 bg-rose-50 p-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
  }, [
    El("div", {}, [
      El("p", { className: "text-sm font-bold text-rose-800", textContent:
        count === 1 ? "1 conversation is waiting for review" : count + " conversations are waiting for review" }),
      El("p", { className: "text-xs text-rose-700 mt-0.5", textContent: count === 1
        ? "Someone reported it, or our checks caught something in it. Nobody has looked yet."
        : "Someone reported these, or our checks caught something in them. Nobody has looked yet." })
    ]),
    goTo
  ]);
  host.parentNode.insertBefore(banner, host);
}

async function loadStats() {
  const res = await adminFetch("/api/admin/stats", { method: "GET" });
  if (!res.ok) throw new Error("stats");
  const body = await res.json();
  return (body && body.data) ? body.data : body;
}

// Owner-approved 2026-05-02: today's bookings tile + dedicated page loader.
async function loadBookingsToday() {
  const res = await adminFetch("/api/admin/bookings/today", { method: "GET" });
  if (!res.ok) throw new Error("bookings_today");
  const body = await res.json();
  return (body && body.data) ? body.data : body;
}

async function refreshBookingsTodayTile() {
  try {
    const data = await loadBookingsToday();
    const el = document.getElementById("bookings-today-summary");
    if (!el) return;
    var n = Number((data && data.count) || 0);
    var rev = String((data && data.revenueDisplay) || "A$0.00");
    el.textContent = "Today: " + n + " booking" + (n === 1 ? "" : "s") + " · " + rev + " revenue";
  } catch (_tileErr) { /* keep placeholder */ }
}

async function renderBookingsTodayPage() {
  var tbody = document.getElementById("bookings-today-tbody");
  var emptyEl = document.getElementById("bookings-today-empty");
  if (!tbody) return;
  tbody.textContent = "";
  tbody.appendChild(window.tstsEl("tr", {}, [
    window.tstsEl("td", { colSpan: 8, className: "px-4 py-8 text-center text-slate-500", textContent: "Loading..." })
  ]));
  try {
    const data = await loadBookingsToday();
    var dateEl = document.getElementById("bookings-today-date");
    if (dateEl) dateEl.textContent = String((data && data.date) || "");
    var statCount = document.getElementById("bookings-today-stat-count");
    if (statCount) statCount.textContent = String(((data && data.count) || 0)) + " booking" + (Number((data && data.count) || 0) === 1 ? "" : "s");
    var statRev = document.getElementById("bookings-today-stat-revenue");
    if (statRev) statRev.textContent = String((data && data.revenueDisplay) || "A$0.00") + " revenue";

    var rows = (data && data.bookings) || [];
    tbody.textContent = "";
    if (rows.length === 0) {
      tbody.appendChild(window.tstsEl("tr", {}, [
        window.tstsEl("td", { colSpan: 8, className: "px-4 py-8 text-center text-slate-500", textContent: "No bookings yet today." })
      ]));
      return;
    }
    rows.forEach(function(b) {
      var time = "";
      try { time = new Date(b && b.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Melbourne" }); } catch (_tErr) { /* time format failed */ }
      var guestName = (b && b.guestId && b.guestId.name) || (b && b.guestName) || "—";
      var expTitle  = (b && b.experience && b.experience.title) || "—";
      var hostName  = (b && b.experience && b.experience.hostName) || "—";
      var seats     = (b && (b.guests || b.numGuests || b.seats)) || 1;
      var amtCents  = (b && b.amountCents) || (b && b.pricingSnapshot && b.pricingSnapshot.totalCents) || 0;
      var amtStr    = __adminMoneyExact(Number(amtCents || 0), (b && b.currency) || (b && b.pricingSnapshot && b.pricingSnapshot.currency) || "AUD");
      var status    = String((b && b.status) || "—");
      var bookingId = String((b && b._id) || "");

      var statusBadge = window.tstsEl("span", {
        className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " +
                   (status === "confirmed" ? "bg-emerald-100 text-emerald-800"
                    : status === "completed" ? "bg-slate-100 text-slate-700"
                    : status === "pending_payment" ? "bg-amber-100 text-amber-800"
                    : status.indexOf("cancel") >= 0 ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-700"),
        // `status.replace(/_/g, " ")` is the machine's own vocabulary with the underscores
        // combed out — "pending payment", "cancelled by host". normalizeStateLabel is the map
        // six other tables on this page already read from.
        textContent: normalizeStateLabel(status)
      });
      var actionsCell = window.tstsEl("td", { className: "px-4 py-3 text-right" }, [
        window.tstsEl("a", {
          href: "experience.html?id=" + encodeURIComponent(String((b && b.experience && b.experience._id) || (b && b.experienceId) || "")),
          target: "_blank",
          className: "text-orange-600 hover:underline text-xs font-bold",
          textContent: "View"
        })
      ]);

      tbody.appendChild(window.tstsEl("tr", {}, [
        window.tstsEl("td", { className: "px-4 py-3 text-slate-700", textContent: time }),
        window.tstsEl("td", { className: "px-4 py-3 text-slate-700", textContent: guestName }),
        window.tstsEl("td", { className: "px-4 py-3 text-slate-900 font-medium", textContent: expTitle }),
        window.tstsEl("td", { className: "px-4 py-3 text-slate-700", textContent: hostName }),
        window.tstsEl("td", { className: "px-4 py-3 text-slate-700", textContent: String(seats) }),
        window.tstsEl("td", { className: "px-4 py-3 text-slate-900 font-semibold", textContent: amtStr }),
        window.tstsEl("td", { className: "px-4 py-3" }, [statusBadge]),
        actionsCell
      ]));
    });
  } catch (_pageErr) {
    tbody.textContent = "";
    tbody.appendChild(window.tstsEl("tr", {}, [
      window.tstsEl("td", { colSpan: 8, className: "px-4 py-8 text-center text-red-600", textContent: "Couldn't load today's bookings." })
    ]));
  }
}

// Tile click handler, show the dedicated page (toggles via existing view/* divs).
(function wireBookingsTodayLink() {
  document.addEventListener("DOMContentLoaded", function() {
    var link = document.getElementById("bookings-today-link");
    if (!link) return;
    link.addEventListener("click", function(ev) {
      ev.preventDefault();
      var views = document.querySelectorAll("[id^='view-']");
      views.forEach(function(v) { v.classList.add("hidden"); });
      var page = document.getElementById("view-bookings-today");
      if (page) page.classList.remove("hidden");
      renderBookingsTodayPage();
    });
    refreshBookingsTodayTile();
  });
})();

async function loadBookings() {
  var skip = bookingsPage * bookingsPageSize;
  const res = await adminFetch("/api/admin/bookings?limit=" + bookingsPageSize + "&skip=" + skip + "&sort=-createdAt", { method: "GET" });
  if (!res.ok) throw new Error("bookings");
  const body = await res.json();
  if (body && body.meta && typeof body.meta.total === "number") bookingsTotalCount = body.meta.total;
  return (body && body.data) ? body.data : body;
}

async function loadExperiences(opts) {
  var o = (opts && typeof opts === "object") ? opts : {};
  var status = String(o.status || "").trim();
  var skip = Number(o.skip) || 0;
  var limit = Number(o.limit) || experiencesPageSize;
  var qs = "?limit=" + limit + "&skip=" + skip;
  if (status && status !== "all") qs += "&status=" + encodeURIComponent(status);
  // Owner-approved 2026-08-03 (sir, Item 13 scale rework): server-side title search.
  var q = String(o.q || "").trim();
  if (q) qs += "&q=" + encodeURIComponent(q);
  const res = await adminFetch("/api/admin/experiences" + qs, { method: "GET" });
  if (!res.ok) throw new Error("experiences");
  const payload = await res.json();
  var data = (payload && Array.isArray(payload.data)) ? payload.data : (Array.isArray(payload) ? payload : []);
  var meta = (payload && payload.meta) ? payload.meta : {};
  experiencesTotalCount = Number(meta.total) || data.length;
  return data;
}

async function loadUsers() {
  const res = await adminFetch("/api/admin/users", { method: "GET" });
  if (!res.ok) throw new Error("users");
  const body = await res.json();
  return (body && body.data) ? body.data : body;
}

async function loadHostVerifications(status) {
  var p = new URLSearchParams();
  p.set("status", String(status || "all"));
  p.set("limit", "150");
  const res = await adminFetch("/api/admin/verifications/hosts?" + p.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load host verifications");
  }
  return data;
}

async function updateHostVerificationStatus(userId, status, note) {
  const res = await adminFetch("/api/admin/verifications/hosts/" + encodeURIComponent(userId) + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    idempotencyKey: __adminIdemKey(), // BUG-166/167: de-dup double-submit
    body: JSON.stringify({
      status: String(status || "").trim(),
      note: String(note || "").trim()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to update host verification");
  }
  return data;
}

async function loadEventVerifications(status) {
  var p = new URLSearchParams();
  p.set("status", String(status || "all"));
  p.set("limit", "150");
  const res = await adminFetch("/api/admin/verifications/events?" + p.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load event verifications");
  }
  return data;
}

async function loadShortfallMonitor(options) {
  var o = (options && typeof options === "object") ? options : {};
  var p = new URLSearchParams();
  p.set("limit", String(o.limit || 200));
  if (o.approvalState) p.set("approvalState", String(o.approvalState));
  if (o.fundingStatus) p.set("fundingStatus", String(o.fundingStatus));
  if (o.slotId) p.set("slotId", String(o.slotId));
  const res = await adminFetch("/api/admin/shortfall/monitor?" + p.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load shortfall monitor");
  }
  return data;
}

async function decideShortfallApproval(slotId, decision, reasonCode, note) {
  const res = await adminFetch("/api/admin/shortfall/" + encodeURIComponent(slotId) + "/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: String(decision || "").toLowerCase(),
      reasonCode: String(reasonCode || "").trim(),
      note: String(note || "").trim()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to update shortfall decision");
  }
  return data;
}

async function decideShortfallSettlement(caseId, decision, reasonCode, note) {
  const res = await adminFetch("/api/admin/shortfall/settlement/" + encodeURIComponent(caseId) + "/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: String(decision || "").toLowerCase(),
      reasonCode: String(reasonCode || "").trim(),
      note: String(note || "").trim()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to process settlement case");
  }
  return data;
}

async function decideShortfallWaiver(slotId, decision, reasonCode, note, waivedAmountCents) {
  var body = {
    decision: String(decision || "").trim(),
    reasonCode: String(reasonCode || "").trim(),
    note: String(note || "").trim()
  };
  if (decision === "approve_partial" && waivedAmountCents > 0) {
    body.waivedAmountCents = waivedAmountCents;
  }
  const res = await adminFetch("/api/admin/shortfall/" + encodeURIComponent(slotId) + "/waiver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to process waiver decision");
  }
  return data;
}

async function loadVerificationFeePolicy() {
  const res = await adminFetch("/api/admin/verification-fee-policy", { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load verification fee policy");
  }
  return data;
}

async function loadMarketingEmailStatus() {
  const res = await adminFetch("/api/admin/marketing-email-status", { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load marketing email status");
  }
  return data;
}

async function saveVerificationFeePolicy(feePercent) {
  const res = await adminFetch("/api/admin/verification-fee-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feePercent: feePercent })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to save verification fee policy");
  }
  return data;
}

async function __safeJsonForAdmin(res) {
  try {
    return await res.json();
  } catch (err) {
    var fallback = { ok: false, error: "json_parse_failed", message: "Bad JSON response", _parseError: String((err && err.message) || err) };
    return fallback;
  }
}

async function loadApprovalThreshold() {
  const res = await adminFetch("/api/admin/platform-config/experience-approval-threshold", { method: "GET" });
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load approval threshold");
  }
  return data.data || {};
}

async function saveApprovalThreshold(thresholdDollars) {
  const res = await adminFetch("/api/admin/platform-config/experience-approval-threshold", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thresholdDollars: thresholdDollars })
  });
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to save approval threshold");
  }
  return data.data || {};
}

async function sendDiagnosticTestEmail(toAddr) {
  const res = await adminFetch("/api/admin/diagnostics/send-test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: toAddr })
  });
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to send test email");
  }
  return data.data || {};
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
  const data = await res.json().catch(function (parseErr) { void parseErr; return null; });
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "audit");
  }
  // Found during Item 16 (owner 2026-08-03): both consumers read `.items`/`.total`
  // off this return, but the route wraps them in the { ok, data } envelope, so the
  // Audit tab rendered "No audit rows found" forever. Return the unwrapped payload.
  return (data.data && typeof data.data === "object") ? data.data : data;
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

async function grantAdmin(userId, otpToken) {
  var body = {};
  if (otpToken) body.otpToken = otpToken;
  var __grantIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey({ dataset: {} }) : "";
  const res = await adminFetch("/api/admin/users/" + encodeURIComponent(userId) + "/grant-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    idempotencyKey: __grantIdemKey
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
  const raw = await res.json().catch(() => ({}));
  const data = (raw && raw.data) ? raw.data : raw;
  return Array.isArray(data.promos) ? data.promos : [];
}

async function loadReports() {
  const res = await adminFetch("/api/admin/reports?limit=100", { method: "GET" });
  if (!res.ok) throw new Error("reports");
  const raw = await res.json().catch(() => ({}));
  const data = (raw && raw.data) ? raw.data : raw;
  // Owner 2026-08-03 (sir, Item 9): held so the duplicate dialog can OFFER the other
  // reports about the same target instead of asking an admin to type a database id.
  window.__tstsReportsCache = Array.isArray(data.items) ? data.items : [];
  return window.__tstsReportsCache;
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

// Owner 2026-08-02 (sir, chat governance): flagged-only filter narrows to threads the keyword scan
// or a party report marked for review. Remembered so Refresh/tab re-entry keep the chosen view.
var __prAdminFlaggedOnly = false;
async function loadPrivateBookingRequests() {
  const res = await adminFetch("/api/admin/private-booking-requests?limit=100" + (__prAdminFlaggedOnly ? "&flagged=true" : ""), { method: "GET" });
  if (!res.ok) throw new Error("private_requests");
  const raw = await res.json().catch(() => ({}));
  const data = (raw && raw.data) ? raw.data : raw;
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

async function loadAdminActionItems(status) {
  var p = new URLSearchParams();
  p.set("status", String(status || "pending"));
  p.set("ownerType", "admin");
  p.set("limit", "200");
  const res = await adminFetch("/api/admin/action-items?" + p.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load action items");
  }
  return data;
}

async function acknowledgeAdminActionItem(id) {
  const res = await adminFetch("/api/admin/action-items/" + encodeURIComponent(id) + "/ack", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to acknowledge action item");
  }
  return data;
}

async function completeAdminActionItem(id) {
  const res = await adminFetch("/api/admin/action-items/" + encodeURIComponent(id) + "/complete", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to complete action item");
  }
  return data;
}

async function refundBookingPartial(id, payload, idempotencyKey) { // one confirmed intent, one Idempotency-Key (authFetch sends it) — a retry is replayed, never refunded twice
  const res = await adminFetch("/api/admin/bookings/" + encodeURIComponent(id) + "/refund-partial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}), idempotencyKey: idempotencyKey || __adminIdemKey()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    // BUG-033 FE alignment (2026-05-15): surface over-refund-cap details so
    // admin sees WHY the refund was refused. Backend returns
    // `data.data: { alreadyRefundedCents, requestedCents, paidCapCents }` for
    // REFUND_EXCEEDS_PAID.
    if (data && data.error === "REFUND_EXCEEDS_PAID" && data.data) {
      var d = data.data;
      // Owner-approved 2026-08-03 (sir, Item 10): was a four-line figure dump in bare "$".
      // Now one sentence in Australian dollars that says what is actually left.
      var left = Math.max(0, Number(d.paidCapCents || 0) - Number(d.alreadyRefundedCents || 0));
      var __refundCcy = String(d.currency || "AUD");
      var msg = "You asked to refund " + __adminMoneyExact(d.requestedCents, __refundCcy) +
        ", but only " + __adminMoneyExact(left, __refundCcy) + " is left on this booking. " +
        __adminMoneyExact(d.alreadyRefundedCents, __refundCcy) + " of the " +
        __adminMoneyExact(d.paidCapCents, __refundCcy) + " paid has already been refunded.";
      var err = new Error(msg);
      err.code = "REFUND_EXCEEDS_PAID";
      err.refundCapDetails = d;
      throw err;
    }
    // Owner-approved 2026-08-03 (sir, Item 10): the backend's internal wording named a
    // Stripe field. The admin gets the plain reason instead.
    if (data && /stripePaymentIntentId/i.test(String(data.message || ""))) {
      throw new Error("This booking has no card payment attached, so there is nothing to refund from here.");
    }
    throw new Error((data && data.message) ? data.message : "The refund could not be sent. Please try again.");
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

async function activateCoupon(code) {
  const res = await adminFetch("/api/admin/promo-codes/" + encodeURIComponent(code) + "/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active: true })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to activate coupon");
  }
  return data.promo || null;
}

async function loadRedemptions(code) {
  const res = await adminFetch("/api/admin/promo-codes/" + encodeURIComponent(code) + "/redemptions", {
    method: "GET"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to load redemptions");
  }
  // The route answers { ok, data: { count, redemptions } }. Reading data.data as an array (or
  // data.redemptions at the top level) matched NEITHER shape, so every coupon reported
  // "No redemptions" while the inventory column counted them — the same envelope trap the
  // audit-log loader hit. Read the real nesting first, keep the flat shapes as fallbacks.
  const d = (data && data.data && typeof data.data === "object") ? data.data : data;
  if (d && Array.isArray(d.redemptions)) return d.redemptions;
  if (Array.isArray(d)) return d;
  return Array.isArray(data.redemptions) ? data.redemptions : [];
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
    idempotencyKey: __adminIdemKey(), // BUG-166/167: de-dup double-submit
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
    idempotencyKey: __adminIdemKey(), // BUG-166/167: de-dup double-submit
    body: JSON.stringify({})
  });
  if (!res.ok) {
    let msg = "Failed to reject verification";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function moderationApprove(id) {
  const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/moderation/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    idempotencyKey: __adminIdemKey(), // BUG-166/167: de-dup double-submit
    body: JSON.stringify({})
  });
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to approve experience");
  }
  return data.data || {};
}

async function moderationReject(id, reason) {
  const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/moderation/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    idempotencyKey: __adminIdemKey(), // BUG-166/167: de-dup double-submit
    body: JSON.stringify({ reason: String(reason || "") })
  });
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "Failed to reject experience");
  }
  return data.data || {};
}

async function deleteExperience(id, otpToken) {
  var fetchOpts = { method: "DELETE" };
  if (otpToken) {
    fetchOpts.headers = { "Content-Type": "application/json" };
    fetchOpts.body = JSON.stringify({ otpToken: otpToken });
  }
  const res = await window.authFetch("/api/experiences/" + encodeURIComponent(id), fetchOpts);
  if (!res.ok) {
    let msg = "Failed to delete experience";
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

async function deleteUser(id, otpToken) {
  var fetchOpts = { method: "DELETE" };
  if (otpToken) {
    fetchOpts.headers = { "Content-Type": "application/json" };
    fetchOpts.body = JSON.stringify({ otpToken: otpToken });
  }
  const res = await adminFetch("/api/admin/users/" + encodeURIComponent(id), fetchOpts);
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

// The admin's request queue printed the stored "17:00-20:00" while the column beside it printed a
// human date, so one screen spoke two languages. This is the platform's own 12-hour formatter, lifted
// verbatim from __formatPrivateRequestTimeRange12h in my-bookings.js (same states, same edge case:
// a sitting ending at 24:00 ends at midnight, which naive maths renders as noon — twelve hours wrong).
function formatTimeRange12h(raw) {
  const s = String(raw || "").trim();
  const m = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  function to12(h, mm) {
    const rawH = Number(h);
    const hh = rawH >= 24 ? (rawH - 24) : rawH;
    const period = hh >= 12 ? "PM" : "AM";
    let h12 = hh % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + mm + " " + period;
  }
  return to12(m[1], m[2]) + " – " + to12(m[3], m[4]);
}

// THE SCALE AND THE SYMBOL, FOR EVERY MONEY STRING IN THE ADMIN PANEL.
// Found 2026-08-21 by creating a real ¥2,500 coupon and watching the table render it as "¥25.00":
// all three formatters below divided or multiplied by a fixed 100 and fell back to "A$". Because
// the 2026-08-21 sweep deliberately routed EVERY admin money string through these, that single
// assumption mis-stated every figure in a zero-decimal currency across the whole panel — funding,
// fees, refunds, revenue, settlements, coupons — by a factor of one hundred.
// Decimals mirror CURRENCY_DECIMALS in the backend's pricing.js; symbols mirror host.js's map.
const __ADMIN_CCY_DECIMALS = { aud: 2, nzd: 2, usd: 2, gbp: 2, eur: 2, cad: 2, inr: 2, jpy: 0, chf: 2, sgd: 2 };
const __ADMIN_CCY_SYMBOL = {
  aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
  eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF "
};
function __adminCurrencyDecimals(currency) {
  const c = String(currency || "aud").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(__ADMIN_CCY_DECIMALS, c) ? __ADMIN_CCY_DECIMALS[c] : 2;
}
function __adminCurrencyFallback(code, value, decimals) {
  const sym = __ADMIN_CCY_SYMBOL[String(code || "").toLowerCase()] || (String(code || "").toUpperCase() + " ");
  return sym + value.toFixed(decimals);
}

// Major-unit money (dollars, possibly a legacy string) in the row's own currency.
// The bare-"$" era ended with the 2026-08-21 currency sweep: every admin money
// string now goes through __adminMoneyExact so AUD reads "A$40.00" everywhere.
function formatCurrencyValue(raw, currency) {
  const num = toNumberOrNull(raw);
  if (num === null) return "—";
  return __adminMoneyExact(Math.round(num * Math.pow(10, __adminCurrencyDecimals(currency))), currency);
}

// Money in the booking's OWN currency, matching the platform formatter in
// my-bookings.js (en-US + the real currency code, so AUD reads "A$40.00").
function __adminMoney(cents, currency) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  const dp = __adminCurrencyDecimals(currency);
  const v = n / Math.pow(10, dp);
  const code = String(currency || "AUD").toUpperCase();
  const shown = (dp === 0 || v % 1 === 0) ? 0 : dp;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: shown,
      maximumFractionDigits: shown,
      currencyDisplay: "symbol"
    }).format(v);
  } catch (_e) { void _e; return __adminCurrencyFallback(code, v, shown); }
}

// sir 2026-08-09, verbatim: "Always show cents in admin money columns". __adminMoney drops ".00" on a
// whole amount, which is right on a guest's screen but leaves an admin scanning "A$40" above "A$40.50"
// with nothing to line the decimal points up against. This is the ledger variant: same currency
// handling, cents always shown. Guest-facing surfaces keep the platform style and are untouched.
function __adminMoneyExact(cents, currency) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  // "Always show cents" is sir's rule for lining up decimal points in a ledger column. A
  // zero-decimal currency has no cents to line up — forcing two onto yen invented a precision the
  // currency does not have AND read a hundred times low ("¥25.00" for a ¥2,500 coupon, seen live).
  const dp = __adminCurrencyDecimals(currency);
  const v = n / Math.pow(10, dp);
  const code = String(currency || "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
      currencyDisplay: "symbol"
    }).format(v);
  } catch (_e) { void _e; return __adminCurrencyFallback(code, v, dp); }
}

// Why a report was raised, in words. The five stored values are the reporting form's own
// categories; a moderator should read the same thing the reporter chose, not the enum.
function __reportCategoryWords(category) {
  const WORDS = {
    safety: "Safety concern",
    harassment: "Harassment",
    fraud: "Fraud or scam",
    spam: "Spam or fake content",
    other: "Something else",
    general: "Something else",
  };
  const c = String(category || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(WORDS, c)) return WORDS[c];
  return c ? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ")) : "Something else";
}

// What a report or an audit row was ABOUT, in words. Shared by the audit log and the reports
// table so the same thing is never "A listing" on one screen and "experience • 68f3a91c22" on
// the next. An id fragment is never part of the answer.
function __reportTargetWords(targetType) {
  const TARGET_WORDS = {
    experience: "A listing",
    user: "A user",
    report: "A report",
    booking: "A booking",
    promo: "A promo code",
    review: "A review",
    comment: "A comment",
    message: "A message",
    // Added 2026-08-22 with the platform report type: a report not tied to a listing or a person.
    // Without this the moderator's table would fall through and print the raw word "Platform".
    platform: "The platform itself",
  };
  const t = String(targetType || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TARGET_WORDS, t)) return TARGET_WORDS[t];
  return t ? (t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ")) : "—";
}

// Dollars typed on screen → the cents the API stores. Rounded, never truncated, so A$10.05
// cannot land as 1004. Blank or nonsense reads as zero, which is what the fields default to.
// Major units typed on screen → the minor units the API stores. Multiplying by a fixed 100 is only
// right for a two-decimal currency: an admin creating a ¥2,500 coupon would have stored 250,000
// minor units — a ¥250,000 discount, a hundred times what was typed. The scale comes from the
// currency, via the single __adminCurrencyDecimals table defined above with the formatters.
function __adminDollarsToCents(raw, currency) {
  const n = Number(String(raw == null ? "" : raw).trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * Math.pow(10, __adminCurrencyDecimals(currency)));
}

// One voice for every "Last updated …" config meta line: Australian date format, and the
// updater rendered as plain words — ids belong in the audit log, never on screen.
function __adminUpdatedMetaLine(d) {
  var when = d && d.updatedAt ? new Date(d.updatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  var byId = String((d && d.updatedByAdminId) || "");
  var by = byId ? (byId.toLowerCase().indexOf("system") === 0 ? " · updated automatically" : " · by an admin") : "";
  return when ? ("Last updated " + when + by) : "";
}

// sir 2026-08-09, verbatim: "Use that wording". This used to lowercase the stored token and swap
// underscores for spaces, so the admin read "alternative offered", "blocked anti abuse", "refund
// succeeded" — the machine's vocabulary with cosmetic spacing. Every state a screen can show is
// written out here in plain words. The fallback still sentence-cases anything new so an unmapped
// state can never render as a raw token, and never as an empty cell.
const STATE_LABELS = {
  // Booking
  pending: "Pending",
  pending_payment: "Waiting for payment",
  awaiting_payment: "Waiting for payment",
  pending_card: "Waiting for card details",
  awaiting_host: "Waiting for the host",
  counter_accept_pending: "Waiting for the guest to accept",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  expired: "Expired",
  abandoned: "Not completed",
  // Payment
  unpaid: "Not paid",
  paid: "Paid",
  failed: "Payment failed",
  // Refund
  none: "None",
  // sir approved "Refunded in full" before it could be seen against the money beside it. On screen it
  // sat next to "Total: $40.00 · Refunded: $38.00" — a 95% cancellation tier, not "in full". The status
  // only means the refund was processed; how much came back depends on when the guest cancelled, and
  // the exact figure is already on the same row. "Refunded" is true at every tier, 95% or 100%.
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  refund_requested: "Refund requested",
  partial_refund_requested: "Part refund requested",
  refund_succeeded: "Refund completed",
  refund_failed: "Refund failed",
  manual: "Handled by hand",
  // Payout
  on_hold: "On hold",
  released: "Paid out",
  blocked_connect: "Held, host payout account not set up",
  blocked_dispute: "Held, dispute open",
  blocked_complaint: "Held, complaint open",
  blocked_cancelled: "Held, booking cancelled",
  blocked_transfer: "Held, transfer failed",
  blocked_anti_abuse: "Held, under review",
  // Private booking requests
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  booked: "Booked",
  invalidated: "No longer valid",
  alternative_offered: "Another date offered"
};
function normalizeStateLabel(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "None";
  if (Object.prototype.hasOwnProperty.call(STATE_LABELS, s)) return STATE_LABELS[s];
  const words = s.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function normalizeVerifiedStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "verified") return "verified";
  if (s === "pending") return "pending";
  if (s === "rejected") return "rejected";
  return "none";
}

function normalizeHostVerificationStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "requested") return "requested";
  if (s === "under_review") return "under_review";
  if (s === "verified") return "verified";
  if (s === "rejected") return "rejected";
  return "none";
}

function formatPromoDiscount(p) {
  const pct = Number(p && p.percentOff);
  const fixed = Number(p && p.fixedOffCents);
  if (Number.isFinite(pct) && pct > 0) return String(pct) + "%";
  // A coupon carries its own currency. This printed every fixed discount as Australian dollars, so
  // a €20 coupon read "A$20.00" in the very table an admin uses to check what they created.
  if (Number.isFinite(fixed) && fixed > 0) return __adminMoneyExact(fixed, (p && p.currency) || "AUD");
  return "—";
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
  // Owner 2026-06-12: dashboard revenue is the AUD-equivalent rollup (totalRevenueAud) of all currencies →
  // show A$, never a bare $. The per-currency breakdown lives in s.revenueByCurrency.
  // A bare toLocaleString drops trailing zeros, so A$79,445.50 rendered "A$79,445.5" and
  // A$79,445.00 rendered "A$79,445" — a money figure with a digit missing off the end.
  // __adminMoneyExact takes MINOR units and always shows both decimal places.
  if (revenueEl) revenueEl.textContent = revenue === null ? "—" : __adminMoneyExact(Math.round(Number(revenue) * 100), "AUD");
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
    // The currency sweep this table was still waiting for (see the note on formatCurrencyFromCents).
    // A bare "$40.00" on an Australian platform is ambiguous — the dashboard tile above it already
    // reads "A$79,445". __adminMoney is the platform's own formatter and takes the booking's OWN
    // currency, so a booking taken in another currency shows that currency rather than a wrong symbol.
    var __rowCcy = String(b.currency || (b.pricing && b.pricing.currency) || "AUD");
    var totalPaid = totalCents === null ? formatCurrencyValue((b.pricing && b.pricing.totalPrice) || b.amountTotal || b.totalPrice || "", __rowCcy) : __adminMoneyExact(totalCents, __rowCcy);
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
    // The policy "version" is a raw ISO timestamp, so this row printed
    // "Policy: 2026-08-09T19:30:01.943Z" — machine text on a rendered surface. The platform already
    // settled this (owner 2026-06-12, verification queue ~1548: "No raw ISO strings in the admin
    // queue"); the bookings table simply never got the same treatment. Same rule, same format.
    var __policyDate = policyVersion ? new Date(policyVersion) : null;
    var policyLabel = (__policyDate && !isNaN(__policyDate.getTime()))
      ? __policyDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : policyVersion;
    // BUG-029 FE alignment (2026-05-15): surface paymentAnomaly so admin sees
    // WHICH class of anomaly occurred (paid_after_expiry / paid_after_cancel /
    // paid_after_unexpected_terminal). Previously this field was schema-stripped;
    // now it persists and needs admin visibility for refund decisions.
    var paymentAnomaly = String(b.paymentAnomaly || "");
    var paymentAnomalyAt = b.paymentAnomalyAt ? new Date(b.paymentAnomalyAt) : null;
    var isCancelled = status.toLowerCase().includes("cancel");
    var isPaid = String(paymentStatus || "").toLowerCase() === "paid";

    var actions = [];
    if (!isCancelled) {
      var cancelBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50",
        textContent: "Cancel"
      });
      cancelBtn.addEventListener("click", function() { __adminGuardedClick(cancelBtn, function() { return handleCancelBooking(id); }); });
      actions.push(cancelBtn);
    }
    if (isPaid) {
      var refundBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50",
        textContent: "Partial Refund"
      });
      refundBtn.addEventListener("click", function() { __adminGuardedClick(refundBtn, function() { return handlePartialRefundBooking(id, b); }); });
      actions.push(refundBtn);
    }
    if (actions.length === 0) {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }

    var financial = El("div", { className: "text-sm text-slate-700 space-y-1" }, [
      El("div", { className: "font-semibold text-emerald-700", textContent: "Total: " + totalPaid }),
      El("div", { className: "text-xs text-slate-500", textContent: "Host payout: " + (hostPayoutCents === null ? "—" : __adminMoneyExact(hostPayoutCents, __rowCcy)) }),
      El("div", { className: "text-xs text-slate-500", textContent: "Refunded: " + (refundedCents === null ? "—" : __adminMoneyExact(refundedCents, __rowCcy)) })
    ]);

    var lifecycleChildren = [
      El("div", { textContent: "Booking: " + normalizeStateLabel(status) }),
      El("div", { textContent: "Payment: " + normalizeStateLabel(paymentStatus) }),
      El("div", { textContent: "Refund: " + normalizeStateLabel(refundStatus) }),
      // "None" is the honest word for a refund that never happened, but for a payout it reads as if
      // the host is owed nothing. sir's wording for this one: "Not paid out yet".
      El("div", { textContent: "Payout: " + (String(payoutStatus || "none").toLowerCase() === "none" ? "Not paid out yet" : normalizeStateLabel(payoutStatus)) }),
      El("div", { textContent: "Policy: " + (policyLabel || "Unavailable") })
    ];
    // BUG-029 FE alignment: conditionally surface paymentAnomaly when present.
    // Rendered in amber to flag the anomaly. Empty string = no anomaly, hide row.
    if (paymentAnomaly && paymentAnomaly.length > 0) {
      var anomalyText = "Payment Anomaly: " + normalizeStateLabel(paymentAnomaly);
      if (paymentAnomalyAt && !Number.isNaN(paymentAnomalyAt.getTime())) {
        anomalyText += " (" + paymentAnomalyAt.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ")";
      }
      lifecycleChildren.push(El("div", { className: "text-amber-700 font-semibold", textContent: anomalyText }));
    }
    var lifecycle = El("div", { className: "text-xs text-slate-600 space-y-1" }, lifecycleChildren);

    var actionWrap = El("div", { className: "flex flex-wrap gap-2 justify-end" }, actions);

    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: date }),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: guest }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: title }),
      El("td", { className: "px-6 py-4" }, [financial]),
      El("td", { className: "px-6 py-4" }, [lifecycle]),
      El("td", { className: "px-6 py-4 text-sm text-right" }, [actionWrap])
    ]));
  });

  // Pagination controls
  var pagEl = $("bookings-pagination");
  var infoEl = $("bookings-page-info");
  var prevBtn = $("bookings-prev");
  var nextBtn = $("bookings-next");
  if (pagEl && bookingsTotalCount > bookingsPageSize) {
    pagEl.classList.remove("hidden");
    var totalPages = Math.ceil(bookingsTotalCount / bookingsPageSize);
    if (infoEl) infoEl.textContent = "Page " + (bookingsPage + 1) + " of " + totalPages + " (" + bookingsTotalCount + " bookings)";
    if (prevBtn) prevBtn.disabled = (bookingsPage <= 0);
    if (nextBtn) nextBtn.disabled = (bookingsPage >= totalPages - 1);
  } else if (pagEl) {
    pagEl.classList.add("hidden");
  }
}

function renderExperiences(exps) {
  const El = window.tstsEl;
  const tbody = $("listings-table-body");
  if (!tbody) return;

  allExperiencesCache = Array.isArray(exps) ? exps : [];
  var list = allExperiencesCache;

  // Update count + load more visibility
  var countEl = $("listings-count");
  var loadMoreEl = $("listings-load-more");
  if (countEl) countEl.textContent = "Showing " + list.length + " of " + experiencesTotalCount;
  if (loadMoreEl) {
    if (list.length < experiencesTotalCount) loadMoreEl.classList.remove("hidden");
    else loadMoreEl.classList.add("hidden");
  }

  tbody.textContent = "";
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
    var price = formatCurrencyValue(e.price, e.currency);
    var statusValue = e.status || (e.isDeleted ? "DELETED_SOFT" : (e.isPaused ? "PAUSED" : "ACTIVE"));
    var statusLabels = { DRAFT: "Draft", PENDING_REVIEW: "Pending Review", ACTIVE: "Active", PAUSED: "Paused", DELETED_SOFT: "Deleted" };
    var statusColors = { DRAFT: "text-gray-500", PENDING_REVIEW: "text-amber-700 font-bold", ACTIVE: "text-green-700", PAUSED: "text-orange-600", DELETED_SOFT: "text-red-500" };
    var statusText = statusLabels[statusValue] || statusValue;
    var statusColor = statusColors[statusValue] || "text-slate-700";
    var verifiedStatus = normalizeVerifiedStatus(e.verifiedStatus);
    var verifiedText = verifiedStatus === "verified"
      ? "Event: Verified"
      : (verifiedStatus === "pending"
        ? "Event: Verification pending"
        : (verifiedStatus === "rejected" ? "Event: Verification rejected" : ""));

    var imgUrl = (window.tstsSafeUrl && window.tstsSafeUrl(e.imageUrl || (Array.isArray(e.images) ? e.images[0] : ""), "/assets/experience-default.jpg")) || (e.imageUrl || "");
    var imgEl = El("img", { className: "h-12 w-16 rounded-lg object-cover", alt: "Experience" });
    if (window.tstsSafeImg) { window.tstsSafeImg(imgEl, imgUrl, "/assets/experience-default.jpg"); } else { imgEl.src = imgUrl; }

    var actions = [];

    // Lifecycle moderation: Approve / Reject for events in PENDING_REVIEW.
    if (statusValue === "PENDING_REVIEW") {
      var modApproveBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
        textContent: "Approve"
      });
      modApproveBtn.addEventListener("click", function() { __adminGuardedClick(modApproveBtn, function() { return handleModerationApprove(id, title); }); });
      var modRejectBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50",
        textContent: "Reject"
      });
      modRejectBtn.addEventListener("click", function() { __adminGuardedClick(modRejectBtn, function() { return handleModerationReject(id, title); }); });
      if (actions.length > 0) actions.push(El("span", { textContent: " " }));
      actions.push(modApproveBtn, El("span", { textContent: " " }), modRejectBtn);
    }

    // Pause (ACTIVE → PAUSED) via lifecycle API (requires reason, writes audit)
    // Resume (PAUSED → ACTIVE) via legacy toggle (non-destructive, no reason required)
    if (statusValue === "ACTIVE") {
      var pauseBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-gray-200 text-gray-700 hover:bg-gray-50",
        textContent: "Pause"
      });
      pauseBtn.addEventListener("click", function() { __adminGuardedClick(pauseBtn, function() { return handleLifecycleAction(id, "force-pause"); }); });
      if (actions.length > 0) actions.push(El("span", { textContent: " " }));
      actions.push(pauseBtn);
    } else if (statusValue === "PAUSED") {
      var resumeBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-green-200 text-green-700 hover:bg-green-50",
        textContent: "Resume"
      });
      resumeBtn.addEventListener("click", function() { __adminGuardedClick(resumeBtn, function() { return handleToggleExperience(id); }); });
      if (actions.length > 0) actions.push(El("span", { textContent: " " }));
      actions.push(resumeBtn);
    }

    // Event verification buttons (SEPARATE from lifecycle)
    var verifyApproveBtn = null, verifyRejectBtn = null;
    if (verifiedStatus === "pending") {
      verifyApproveBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Approve Verification" });
      verifyApproveBtn.addEventListener("click", function() { __adminGuardedClick(verifyApproveBtn, function() { return handleApproveVerifiedExperience(id); }); });
      verifyRejectBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Reject Verification" });
      verifyRejectBtn.addEventListener("click", function() { __adminGuardedClick(verifyRejectBtn, function() { return handleRejectVerifiedExperience(id); }); });
      if (actions.length > 0) actions.push(El("span", { textContent: " " }));
      actions.push(verifyApproveBtn, El("span", { textContent: " " }), verifyRejectBtn);
    }

    // Delete (not for already deleted), via lifecycle API (cascade booking cancel + audit log with reason)
    if (statusValue !== "DELETED_SOFT") {
      var deleteBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Delete" });
      deleteBtn.addEventListener("click", function() { __adminGuardedClick(deleteBtn, function() { return handleLifecycleAction(id, "force-delete"); }); });
      if (actions.length > 0) actions.push(El("span", { textContent: " " }));
      actions.push(deleteBtn);
    }

    var statusCell = [El("div", { className: "font-semibold " + statusColor, textContent: statusText })];
    if (verifiedText) statusCell.push(El("div", { className: "text-xs mt-1 " + (verifiedStatus === "verified" ? "text-blue-700" : verifiedStatus === "pending" ? "text-amber-700" : "text-slate-500"), textContent: verifiedText }));

    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-4" }, [imgEl]),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: title }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: host }),
      El("td", { className: "px-6 py-4 text-sm text-emerald-700 font-semibold", textContent: price }),
      El("td", { className: "px-6 py-4 text-sm text-slate-500" }, statusCell),
      El("td", { className: "px-6 py-4 text-sm text-right" }, actions.length > 0 ? actions : [El("span", { className: "text-slate-400 text-xs", textContent: "—" })])
    ]));
  });

  // Wire up filter tabs (server-side filtering)
  var tabEls = document.querySelectorAll(".listing-filter-tab");
  tabEls.forEach(function(tab) {
    tab.onclick = async function() {
      currentListingsFilter = tab.getAttribute("data-filter") || "all";
      // 2026-08-26: the SELECTED pill rendered white-on-white and its label was invisible, so an
      // admin could not tell which filter was active. Cause: this toggled with classList, which
      // leaves every other class in place — and in the compiled stylesheet `.bg-white` sits AFTER
      // `.bg-tsts-ink` at equal specificity, so whenever both landed on the element `bg-white` won
      // while `text-white` was already applied. It also left the "All" tab with no border when
      // deselected, since only its five siblings carry one in the markup.
      // Both are cured by assigning className WHOLESALE — the pattern the Verification sub-tabs in
      // this same file already use correctly (see the verification-sub-tabs handler).
      tabEls.forEach(function(t) {
        t.className = (t === tab)
          ? "listing-filter-tab text-xs px-3 py-1.5 rounded-full font-semibold bg-tsts-ink text-white"
          : "listing-filter-tab text-xs px-3 py-1.5 rounded-full font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-gray-50";
      });
      // The card heading used to read "All Listings" no matter which filter was active, so an
      // admin looking at the Deleted filter was told they were looking at everything.
      var headingEl = document.getElementById("listings-card-heading");
      if (headingEl) {
        var LISTING_HEADINGS = {
          "all": "All Listings",
          "DRAFT": "Draft Listings",
          "PENDING_REVIEW": "Listings Pending Review",
          "ACTIVE": "Active Listings",
          "PAUSED": "Paused Listings",
          "DELETED_SOFT": "Deleted Listings"
        };
        headingEl.textContent = LISTING_HEADINGS[currentListingsFilter] || "All Listings";
      }
      try {
        var data = await loadExperiences({ status: currentListingsFilter, skip: 0 });
        renderExperiences(data);
      } catch (_) {
        renderExperiences([]);
      }
    };
  });

  // "Load More" button
  var loadMoreBtn = $("listings-load-more");
  if (loadMoreBtn) {
    loadMoreBtn.onclick = async function() {
      if (allExperiencesCache.length >= experiencesTotalCount) return;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "Loading...";
      try {
        var moreData = await loadExperiences({ status: currentListingsFilter, skip: allExperiencesCache.length });
        allExperiencesCache = allExperiencesCache.concat(moreData);
        renderExperiences(allExperiencesCache);
      } catch (_) {}
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load More";
    };
  }
}

function renderVerificationPolicy(payload) {
  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var policy = (data.policy && typeof data.policy === "object") ? data.policy : {};
  var feePercentRaw = Number(policy.feePercent);
  var feePercent = Number.isFinite(feePercentRaw) ? Math.round(Math.max(0, Math.min(20, feePercentRaw)) * 10) / 10 : 0;

  var input = $("verification-fee-percent");
  if (input) input.value = feePercent.toFixed(1);

  var meta = $("verification-policy-meta");
  if (meta) {
    // policyVersion is an ISO timestamp under the hood — never show the machine string on screen.
    var versionRaw = String(policy.policyVersion || "");
    var versionDate = versionRaw ? new Date(versionRaw) : null;
    var version = (versionDate && !isNaN(versionDate.getTime()))
      ? versionDate.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : (versionRaw || "Unavailable");
    var effective = formatDateValue(policy.effectiveFrom);
    meta.textContent = "Version: " + version + " • Effective: " + effective + " • Active fee: " + feePercent.toFixed(1) + "%";
  }
}

function renderMarketingEmailStatus(payload) {
  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var enabled = data.enabled === true;
  var source = String(data.source || "env");

  var badge = $("marketing-email-status-badge");
  var dot = $("marketing-email-status-dot");
  var label = $("marketing-email-status-label");
  var sourceLabel = $("marketing-email-source-label");
  var btnEnable = $("btn-marketing-enable");
  var btnPause = $("btn-marketing-pause");

  if (badge) {
    badge.className = enabled
      ? "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-50 text-green-700"
      : "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-orange-50 text-orange-600";
  }
  if (dot) {
    dot.className = enabled ? "w-2 h-2 rounded-full bg-green-500" : "w-2 h-2 rounded-full bg-orange-500";
  }
  if (label) {
    label.textContent = enabled ? "Sending enabled" : "Paused";
  }
  if (sourceLabel) {
    // Owner-approved 2026-08-04 (sir, Item 22): where the setting lives, in words. A third source
    // was added on the server: nothing stored and nothing set on the server means the platform's own
    // default is deciding, and saying "the server's settings" for that was not true.
    sourceLabel.textContent = source === "db"
      ? "Controlled from this panel"
      : (source === "env" ? "Controlled by the server's settings" : "Using the platform's own default");
    sourceLabel.className = "text-xs text-slate-400";
  }
  if (btnEnable) {
    btnEnable.className = enabled
      ? "hidden px-4 py-2 rounded-xl bg-tsts-ink text-white text-sm font-semibold hover:opacity-90 transition-opacity"
      : "px-4 py-2 rounded-xl bg-tsts-ink text-white text-sm font-semibold hover:opacity-90 transition-opacity";
  }
  if (btnPause) {
    btnPause.className = enabled
      ? "px-4 py-2 rounded-xl border border-orange-400 text-orange-600 bg-white text-sm font-semibold hover:bg-orange-50 transition-colors"
      : "hidden px-4 py-2 rounded-xl border border-orange-400 text-orange-600 bg-white text-sm font-semibold hover:bg-orange-50 transition-colors";
  }
}

async function setMarketingEmailEnabled(enabled) {
  var confirmed = await window.tstsConfirm(
    enabled
      ? "Enable marketing emails? Recommendation emails will resume being sent to users who have not opted out."
      : "Pause marketing emails? No recommendation emails will be sent until re-enabled."
  );
  if (!confirmed) return;
  try {
    const res = await adminFetch("/api/admin/marketing-email-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: enabled })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.ok !== true) {
      window.tstsNotify((data && data.message) ? data.message : "Failed to update marketing email status.", "error");
      return;
    }
    window.tstsNotify(enabled ? "Marketing emails enabled." : "Marketing emails paused.", "success");
    loadMarketingEmailStatus().then(renderMarketingEmailStatus).catch(function () {
      window.tstsNotify("Status updated but failed to refresh display.", "error");
    });
  } catch (e) {
    window.tstsNotify("Failed to update marketing email status.", "error");
  }
}

function renderHostVerifications(payload) {
  const El = window.tstsEl;
  const tbody = $("host-verifications-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var list = Array.isArray(data.items) ? data.items : [];

  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "4", textContent: "No host verification requests." })
    ]));
    return;
  }

  list.forEach(function(item) {
    var userId = String((item && item.userId) || "");
    var hostName = String((item && item.name) || "Host");
    var email = String((item && item.email) || "");
    var mobile = String((item && item.mobile) || "");
    var listingCount = Number((item && item.listingCount) || 0);
    var hv = (item && item.hostVerification && typeof item.hostVerification === "object") ? item.hostVerification : {};
    var status = normalizeHostVerificationStatus(hv.status);
    var statusClass = status === "verified"
      ? "text-emerald-700"
      : (status === "under_review"
        ? "text-blue-700"
        : (status === "requested" ? "text-amber-700" : (status === "rejected" ? "text-red-700" : "text-slate-500")));
    var statusText = ({
      requested: "Requested",
      under_review: "Under review",
      verified: "Verified",
      rejected: "Rejected",
      none: "Not requested"
    })[status] || "Not requested";
    var statusDate = hv.verifiedAt || hv.rejectedAt || hv.reviewedAt || hv.requestedAt;

    var actions = [];
    function mkBtn(text, cls, cb) {
      var btn = El("button", { className: cls, textContent: text });
      // BUG-167 (restored 2026-08-20): every verification action locks while in flight —
      // a double-tap cannot fire the transition twice from the screen.
      btn.addEventListener("click", function () { __adminGuardedClick(btn, function () { return Promise.resolve(cb()); }); });
      return btn;
    }
    if (status === "requested") {
      actions.push(mkBtn("Under review", "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50", function() { return handleHostVerificationTransition(userId, "under_review"); }));
      actions.push(mkBtn("Verify", "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", function() { return handleHostVerificationTransition(userId, "verified"); }));
      actions.push(mkBtn("Reject", "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", function() { return handleHostVerificationTransition(userId, "rejected"); }));
    } else if (status === "under_review") {
      actions.push(mkBtn("Verify", "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", function() { return handleHostVerificationTransition(userId, "verified"); }));
      actions.push(mkBtn("Reject", "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", function() { return handleHostVerificationTransition(userId, "rejected"); }));
    } else if (status === "rejected" || status === "revoked") {
      actions.push(mkBtn("Reopen", "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50", function() { return handleHostVerificationTransition(userId, "requested"); }));
    } else if (status === "verified") {
      // Owner-spec 2026-05-02, admin can revoke a verified host with reason.
      actions.push(mkBtn("Revoke", "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", function() { return handleHostVerificationTransition(userId, "revoked"); }));
    } else {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }
    // KYC document links, visible to admin only. Show idType + clickable links.
    var kyc = (hv && hv.kyc && typeof hv.kyc === "object") ? hv.kyc : null;
    var kycRow = null;
    if (kyc && kyc.idDocumentUrl) {
      var idTypeLabel = ({
        passport: "Passport",
        drivers_licence: "Driver's licence",
        national_id: "National ID"
      })[String(kyc.idType || "")] || "ID";
      var children = [
        El("span", { className: "text-xs font-semibold text-slate-700", textContent: "KYC: " }),
        El("span", { className: "text-xs text-slate-600 mr-2", textContent: idTypeLabel })
      ];
      // The server sends a RELATIVE API path ("/api/admin/kyc/<id>/id-document"). Opened against
      // the static site that 404s, so an admin was approving or rejecting a person's identity
      // without ever being able to see the document they were judging. Point at the API origin.
      var __apiBase = (window.__TSTS_RUNTIME__ && window.__TSTS_RUNTIME__.apiBase) ? String(window.__TSTS_RUNTIME__.apiBase) : "";
      var __docHref = function (u) {
        var s = String(u || "").trim();
        if (!s) return "";
        return /^https?:\/\//i.test(s) ? s : (__apiBase + s);
      };
      var idLink = El("a", { className: "text-xs font-bold text-orange-600 hover:underline mr-3", textContent: "View ID document" });
      idLink.href = __docHref(kyc.idDocumentUrl);
      idLink.target = "_blank";
      idLink.rel = "noopener noreferrer";
      children.push(idLink);
      if (kyc.proofOfAddressUrl) {
        var addrLink = El("a", { className: "text-xs font-bold text-orange-600 hover:underline", textContent: "View address proof" });
        addrLink.href = __docHref(kyc.proofOfAddressUrl);
        addrLink.target = "_blank";
        addrLink.rel = "noopener noreferrer";
        children.push(addrLink);
      }
      kycRow = El("div", { className: "mt-2" }, children);
    }

    var hostCell = [
      El("div", { className: "font-semibold text-slate-800", textContent: hostName }),
      El("div", { className: "text-xs text-slate-500 mt-1", textContent: email || "—" }),
      El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Mobile: " + (mobile || "—") })
    ];
    if (kycRow) hostCell.push(kycRow);
    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, hostCell),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "font-semibold " + statusClass, textContent: statusText }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Updated: " + formatDateValue(statusDate) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: String((hv && hv.note) ? ("Note: " + hv.note) : "") })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-600 font-semibold", textContent: String(listingCount) }),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
    ]));
  });
}

function renderEventVerifications(payload) {
  const El = window.tstsEl;
  const tbody = $("event-verifications-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var list = Array.isArray(data.items) ? data.items : [];

  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No event verification records." })
    ]));
    return;
  }

  // 2026-08-26 (Rule 16): this table printed RAW ENUM VALUES straight onto the screen — the STATUS
  // column showed lowercase "verified" / "rejected" / "pending", and the host line rendered the
  // literal token "none" (the leaked `none` recorded as F56). Machine values belong in logs, never
  // on a rendered surface. Both now map to plain English.
  function __eventVerifiedStatusLabel(v) {
    var map = {
      pending: "Awaiting review",
      verified: "Verified",
      rejected: "Rejected",
      revoked: "Revoked",
      none: "Not requested"
    };
    var key = String(v || "").toLowerCase().trim();
    return map[key] || "Awaiting review";
  }
  function __hostVerificationLabel(v) {
    var map = {
      verified: "Host verified",
      none: "Host not verified",
      requested: "Host verification requested",
      under_review: "Host verification under review",
      rejected: "Host verification rejected",
      revoked: "Host verification revoked"
    };
    var key = String(v || "").toLowerCase().trim();
    return map[key] || "Host not verified";
  }

  list.forEach(function(item) {
    var experienceId = String((item && item.experienceId) || "");
    var title = String((item && item.title) || "Experience");
    var city = String((item && item.city) || "");
    var hostName = String((item && item.hostName) || "Host");
    var hostVerificationStatus = String((item && item.hostVerificationStatus) || "none");
    var verifiedStatus = normalizeVerifiedStatus(item && item.verifiedStatus);
    var snapshot = (item && item.snapshot && typeof item.snapshot === "object") ? item.snapshot : null;
    // Owner 2026-06-12: the fee-policy "version" is a raw ISO timestamp — render it as a readable date
    // when it parses as one, else show the value as-is. No raw ISO strings in the admin queue.
    var __snapPv = snapshot ? String(snapshot.policyVersion || "") : "";
    var __snapPvDate = __snapPv ? new Date(__snapPv) : null;
    var __snapPvLabel = (__snapPvDate && !isNaN(__snapPvDate.getTime()))
      ? __snapPvDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : __snapPv;
    var feeText = snapshot
      ? (Number(snapshot.feePercent || 0).toFixed(1) + "%" + (__snapPvLabel ? " · policy " + __snapPvLabel : ""))
      : "No fee recorded at submission";

    var actions = [];
    if (verifiedStatus === "pending") {
      var approveBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Approve" });
      approveBtn.addEventListener("click", function() { __adminGuardedClick(approveBtn, function() { return handleApproveVerifiedExperience(experienceId); }); });
      var rejectBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Reject" });
      rejectBtn.addEventListener("click", function() { __adminGuardedClick(rejectBtn, function() { return handleRejectVerifiedExperience(experienceId); }); });
      actions.push(approveBtn, rejectBtn);
    } else if (verifiedStatus === "verified") {
      // Owner-spec 2026-05-02, admin can revoke a verified event with reason.
      var revokeBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Revoke" });
      revokeBtn.addEventListener("click", function() { __adminGuardedClick(revokeBtn, function() { return handleRevokeVerifiedExperience(experienceId); }); });
      actions.push(revokeBtn);
    } else {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }
    // Owner-spec 2026-05-02, surface the host's submitted plan + safety + promise
    // so the admin can review what they actually wrote, not just the fee snapshot.
    var requestBundle = (item && item.verifiedRequest && typeof item.verifiedRequest === "object") ? item.verifiedRequest : null;
    var detailsRow = null;
    if (requestBundle) {
      var detailsBox = El("details", { className: "mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" });
      var summary = El("summary", { className: "cursor-pointer text-xs font-bold text-slate-800 select-none", textContent: "Show host's submission" });
      detailsBox.appendChild(summary);
      var rows = [
        ["Event plan", requestBundle.eventPlan],
        ["Safety measures", requestBundle.safetyMeasures],
        ["Promise of fulfilment", requestBundle.promiseOfFulfilment],
        ["Capacity rationale", requestBundle.capacityRationale]
      ];
      if (requestBundle.insurancePolicyNumber) rows.push(["Insurance policy", requestBundle.insurancePolicyNumber]);
      rows.forEach(function(rr) {
        if (!rr[1]) return;
        detailsBox.appendChild(El("p", { className: "text-[11px] uppercase tracking-wide text-slate-500 mt-2", textContent: String(rr[0]) }));
        detailsBox.appendChild(El("p", { className: "text-xs text-slate-700 whitespace-pre-line mt-1", textContent: String(rr[1]) }));
      });
      if (requestBundle.foodSafetyCert) {
        var certLink = El("a", { className: "text-xs font-bold text-orange-600 hover:underline mt-2 inline-block" });
        certLink.href = String(requestBundle.foodSafetyCert);
        certLink.target = "_blank";
        certLink.rel = "noopener noreferrer";
        certLink.textContent = "View food-safety certificate";
        detailsBox.appendChild(certLink);
      }
      detailsRow = detailsBox;
    }

    var titleCell = [
      El("div", { className: "font-semibold text-slate-800", textContent: title }),
      El("div", { className: "text-xs text-slate-500 mt-1", textContent: city || "—" })
    ];
    if (detailsRow) titleCell.push(detailsRow);
    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, titleCell),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold text-slate-800", textContent: hostName }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: __hostVerificationLabel(hostVerificationStatus) })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: feeText }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: __eventVerifiedStatusLabel(verifiedStatus) }),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
    ]));
  });
}

// Owner-spec 2026-05-02, admin revoke verified event with required reason.
async function handleRevokeVerifiedExperience(experienceId) {
  if (!experienceId) return;
  const reason = await window.tstsPrompt("Reason for revoking this verified event (required)", "", { minLength: 5, placeholder: "Explain why the verified status is being revoked." });
  const trimmed = String(reason || "").trim();
  if (!trimmed) return;
  let data = null;
  try {
    const res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(experienceId) + "/verified/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: trimmed })
    });
    try { data = await res.json(); } catch (eParse) { void eParse; data = null; }
    if (!res.ok || !data || data.ok !== true) {
      throw new Error((data && data.message) ? data.message : "Failed to revoke verified status");
    }
    window.tstsNotify("Verified status revoked.", "success");
    await loadEventVerifications("all").then(renderEventVerifications);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to revoke.", "error");
  }
}

function shortfallBadgeClass(state) {
  var s = String(state || "").toUpperCase();
  if (s === "APPROVED" || s === "APPROVED_EXECUTED" || s === "FULLY_FUNDED") return "text-emerald-700";
  if (s === "UNDER_REVIEW" || s === "PENDING_ADMIN_REVIEW" || s === "STAGE_A_DUE" || s === "STAGE_B_DUE" || s === "BOOKING_FROZEN_STAGE_B") return "text-amber-700";
  if (s === "REJECTED") return "text-red-700";
  return "text-slate-600";
}

// Owner-approved 2026-08-03 (sir, Item 15): every state the backend can emit, said as
// a short human phrase. The old helper mechanically lowercased the constants, so an
// admin read half-digested code like "stage a due" and "pending admin review".
var __SHORTFALL_STATE_LABELS = {
  // Funding approval (shortfallApprovalState)
  NONE: "No decision yet",
  UNDER_REVIEW: "Waiting for your review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  // Funding progress (fundingState)
  STAGE_A_DUE: "First half due",
  STAGE_A_PAID: "First half paid",
  STAGE_B_DUE: "Second half due",
  FULLY_FUNDED: "Fully funded",
  NOT_REQUIRED: "No funding needed",
  // Settlement case status
  PENDING_ADMIN_REVIEW: "Waiting for your review",
  APPROVED_EXECUTED: "Refund approved and sent",
  // Waiver statuses that can surface through shared renderers
  REQUESTED: "Fee reduction requested",
  APPROVED_FULL: "Fully waived",
  APPROVED_PARTIAL: "Partly waived"
};
function toShortfallStateLabel(v) {
  var key = String(v || "NONE").trim().toUpperCase();
  if (__SHORTFALL_STATE_LABELS[key]) return __SHORTFALL_STATE_LABELS[key];
  // Unknown state: still readable, never the raw constant.
  var words = key.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderShortfallReview(payload) {
  const El = window.tstsEl;
  const tbody = $("shortfall-review-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var slots = Array.isArray(data.slots) ? data.slots : [];
  shortfallReasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : [];
  shortfallSettlementReasonCodes = Array.isArray(data.settlementReasonCodes) ? data.settlementReasonCodes : [];
  shortfallWaiverReasonCodes = Array.isArray(data.waiverReasonCodes) ? data.waiverReasonCodes : [];

  if (slots.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No shortfall slots." })
    ]));
    return;
  }

  slots.forEach(function (slot) {
    var slotId = String((slot && slot.slotId) || "");
    var approval = String((slot && slot.approvalState) || "NONE");
    var funding = String((slot && slot.fundingStatus) || "NONE");
    var actions = [];

    if (approval === "UNDER_REVIEW") {
      var approveBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Approve" });
      approveBtn.addEventListener("click", function () { handleShortfallApprovalDecision(slotId, "approve"); });
      var rejectBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Reject" });
      rejectBtn.addEventListener("click", function () { handleShortfallApprovalDecision(slotId, "reject"); });
      actions.push(approveBtn, rejectBtn);
    } else {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }

    // Waiver section
    var waiver = (slot && slot.waiver && typeof slot.waiver === "object") ? slot.waiver : {};
    var waiverStatus = String(waiver.status || "none");
    if (waiverStatus === "pending") {
      var waiverBadge = El("div", { className: "mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800", textContent: "\u2691 Waiver request pending" });
      var reviewWaiverBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-amber-300 text-amber-800 hover:bg-amber-50", textContent: "Review Waiver" });
      (function (sid, slotCopy) { reviewWaiverBtn.addEventListener("click", function () { handleWaiverDecision(sid, slotCopy); }); })(slotId, slot);
      actions.push(waiverBadge, reviewWaiverBtn);
    } else if (waiverStatus === "approved_full") {
      actions.push(El("div", { className: "mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800", textContent: "Full waiver approved" }));
    } else if (waiverStatus === "approved_partial") {
      actions.push(El("div", { className: "mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800", textContent: "Partial waiver: " + __adminMoneyExact(Number(waiver.amountCents || 0), slot.slotCurrencySnapshot) }));
    } else if (waiverStatus === "rejected") {
      actions.push(El("div", { className: "mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-600", textContent: "Waiver rejected" }));
    }

    var flags = (slot && slot.antiAbuseFlags && typeof slot.antiAbuseFlags === "object") ? slot.antiAbuseFlags : {};
    var flagCount = Number(flags.flagCount || 0);
    var flagBadgeChildren = [
      El("div", { className: "font-semibold text-slate-800", textContent: String(slot.experienceTitle || "Experience") }),
      El("div", { className: "text-xs text-slate-500 mt-1", textContent: formatDateValue(slot.bookingDate) + " • " + String(slot.timeSlot || "") })
    ];
    if (flagCount > 0) {
      var flagLabels = [];
      if (flags.highShortfallPerSeat) flagLabels.push("High per-seat amount");
      if (flags.unknownDiscountOrigin) flagLabels.push("Unknown discount origin");
      if (flags.highDemandWithShortfall) flagLabels.push("High demand ratio");
      if (flags.unverifiedHost) flagLabels.push("Unverified host");
      flagBadgeChildren.push(El("div", { className: "mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800", textContent: "\u2691 " + flagCount + " risk flag" + (flagCount > 1 ? "s" : "") + ": " + flagLabels.join(", ") }));
    }

    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, flagBadgeChildren),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "font-semibold " + shortfallBadgeClass(approval), textContent: toShortfallStateLabel(approval) }),
        (String(slot.approvalReasonCode || "").trim()
          ? El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Reason: " + __shortfallReasonLabel(slot.approvalReasonCode) })
          : null)
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { textContent: "Booked: " + String(Number(slot.bookedSeats || 0)) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Capacity: " + String(Number(slot.capacityTotalSnapshot || 0)) + " • Threshold: " + String(Number(slot.thresholdSeatsSnapshot || 0)) })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold " + shortfallBadgeClass(funding), textContent: toShortfallStateLabel(funding) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "First half remaining: " + __adminMoneyExact(Number(slot.stageA && slot.stageA.remainingCents || 0), slot.slotCurrencySnapshot) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Second half remaining: " + __adminMoneyExact(Number(slot.stageB && slot.stageB.remainingCents || 0), slot.slotCurrencySnapshot) })
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
    ]));
  });
}

// Owner-approved 2026-08-03 (sir, Item 14): payment-system and database ids never
// render as body text. Where a reference genuinely helps support work, it sits
// behind a small button that copies it without ever displaying it.
function __adminCopyRefButton(label, value) {
  var El = window.tstsEl;
  var v = String(value || "");
  var btn = El("button", {
    type: "button",
    className: "inline-flex items-center px-2 py-1 text-xs font-semibold rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition",
    textContent: String(label || "Copy reference")
  });
  btn.addEventListener("click", function () {
    try {
      navigator.clipboard.writeText(v).then(function () {
        window.tstsNotify("Reference copied. Paste it into your support ticket.", "success");
      }, function () {
        window.tstsNotify("The reference could not be copied. Try again.", "error");
      });
    } catch (copyErr) {
      void copyErr;
      window.tstsNotify("The reference could not be copied. Try again.", "error");
    }
  });
  return btn;
}

function renderShortfallReconciliation(payload) {
  const El = window.tstsEl;
  const tbody = $("shortfall-recon-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var slots = Array.isArray(data.slots) ? data.slots : [];

  if (slots.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No shortfall reconciliation rows." })
    ]));
    return;
  }

  slots.forEach(function (slot) {
    var settlement = (slot && slot.settlement && typeof slot.settlement === "object") ? slot.settlement : {};
    var settlementCaseId = String(settlement.caseId || "");
    var actions = [];
    if (String(settlement.status || "") === "PENDING_ADMIN_REVIEW" && settlementCaseId) {
      var approveBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Approve refund" });
      approveBtn.addEventListener("click", function () { handleShortfallSettlementDecision(settlementCaseId, "approve"); });
      var rejectBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Reject refund" });
      rejectBtn.addEventListener("click", function () { handleShortfallSettlementDecision(settlementCaseId, "reject"); });
      actions.push(approveBtn, rejectBtn);
    } else {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }

    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold text-slate-800", textContent: String(slot.experienceTitle || "Experience") }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: String(slot.bookingDate || "") + " • " + String(slot.timeSlot || "") })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold " + shortfallBadgeClass(slot.approvalState), textContent: "Approval: " + toShortfallStateLabel(slot.approvalState) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Approver: " + String(slot.approvedBy || "—") }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Decision at: " + formatDateValue(slot.decisionAt) })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { textContent: "Capacity: " + String(Number(slot.capacityTotalSnapshot || 0)) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Threshold: " + String(Number(slot.thresholdSeatsSnapshot || 0)) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Booked: " + String(Number(slot.bookedSeats || 0)) })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { textContent: "First half paid: " + __adminMoneyExact(Number(slot.stageA && slot.stageA.paidCents || 0), slot.slotCurrencySnapshot) + " of " + __adminMoneyExact(Number(slot.stageA && slot.stageA.dueCents || 0), slot.slotCurrencySnapshot) }),
        El("div", { className: "mt-2", textContent: "Second half paid: " + __adminMoneyExact(Number(slot.stageB && slot.stageB.paidCents || 0), slot.slotCurrencySnapshot) + " of " + __adminMoneyExact(Number(slot.stageB && slot.stageB.dueCents || 0), slot.slotCurrencySnapshot) }),
        (slot.stageA && slot.stageA.paymentIntentId) || (slot.stageB && slot.stageB.paymentIntentId)
          ? El("div", { className: "mt-2 flex flex-wrap gap-2" }, [
              (slot.stageA && slot.stageA.paymentIntentId) ? __adminCopyRefButton("Copy first payment reference", slot.stageA.paymentIntentId) : null,
              (slot.stageB && slot.stageB.paymentIntentId) ? __adminCopyRefButton("Copy second payment reference", slot.stageB.paymentIntentId) : null
            ])
          : null
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold " + shortfallBadgeClass(settlement.status), textContent: toShortfallStateLabel(settlement.status || "none") }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Principal: " + __adminMoneyExact(Number(settlement.refundablePrincipalCents || 0), slot.slotCurrencySnapshot) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Processing fee: " + __adminMoneyExact(Number(settlement.processingFeeCents || 0), slot.slotCurrencySnapshot) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Net refund: " + __adminMoneyExact(Number(settlement.netRefundCents || 0), slot.slotCurrencySnapshot) })
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
    ]));
  });
}

// A settlement case's money is the SLOT's money, and the monitor route attaches the slot's own
// currency snapshot. AUD remains the platform default for a case that predates that field, so an
// old row still renders rather than showing nothing.
function __settlementCaseCurrency(caseRow) {
  return String((caseRow && caseRow.slotCurrencySnapshot) || "AUD");
}

function renderShortfallSettlementCases(payload) {
  const El = window.tstsEl;
  const tbody = $("shortfall-settlement-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var cases = Array.isArray(data.settlementCases) ? data.settlementCases : [];

  if (cases.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "5", textContent: "No settlement cases." })
    ]));
    return;
  }

  cases.forEach(function (caseRow) {
    var caseId = String((caseRow && (caseRow._id || caseRow.id)) || "");
    var actions = [];
    if (String(caseRow && caseRow.status || "") === "PENDING_ADMIN_REVIEW") {
      var approveBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Approve" });
      approveBtn.addEventListener("click", function () { handleShortfallSettlementDecision(caseId, "approve"); });
      var rejectBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-700 hover:bg-red-50", textContent: "Reject" });
      rejectBtn.addEventListener("click", function () { handleShortfallSettlementDecision(caseId, "reject"); });
      actions.push(approveBtn, rejectBtn);
    } else {
      actions.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }
    // Owner-approved 2026-08-03 (sir, Item 14): the event speaks for itself in words;
    // the case id lives behind a copy button, and the slot id is not shown at all.
    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { textContent: String(caseRow && caseRow.bookingDate || "") + " • " + String(caseRow && caseRow.timeSlot || "") })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        // The old comment here claimed AUD "mirrors the engine" because settlement cases carry no
        // currency. Checked 2026-08-21: the case really has no currency field, but it DOES name its
        // slot, and the slot has one — so forcing AUD was a guess that read "A$2,400" over a
        // ¥240,000 event. The monitor route now attaches the slot's own currency snapshot.
        El("div", { textContent: "Principal: " + __adminMoneyExact(Number(caseRow && caseRow.refundablePrincipalCents || 0), __settlementCaseCurrency(caseRow)) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Fee: " + __adminMoneyExact(Number(caseRow && caseRow.processingFeeCents || 0), __settlementCaseCurrency(caseRow)) }),
        El("div", { className: "text-xs text-slate-500 mt-1", textContent: "Net: " + __adminMoneyExact(Number(caseRow && caseRow.netRefundCents || 0), __settlementCaseCurrency(caseRow)) })
      ]),
      El("td", { className: "px-6 py-4 text-sm " + shortfallBadgeClass(caseRow && caseRow.status), textContent: toShortfallStateLabel(caseRow && caseRow.status || "none") }),
      El("td", { className: "px-6 py-4 text-sm" }, [
        caseId ? __adminCopyRefButton("Copy case reference", caseId) : El("span", { className: "text-xs text-slate-400", textContent: "—" })
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex flex-wrap gap-2" }, actions)
      ])
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
    // sir's locked role matrix (2026-08-08): roles are ADDITIVE and permanent — an admin who has
    // hosted is Admin AND Host AND User, and "Host" survives pause/expiry/deletion. Derived from
    // the account flags; the dead stored role string is gone from the API.
    var everHosted = !!(u && (u.everHosted === true || u.hasEverHosted === true));
    var isAdmin = !!(u && u.isAdmin === true);
    var role = isAdmin && everHosted ? "Admin · Host" : isAdmin ? "Admin" : everHosted ? "Host" : "User";
    var joined = formatDateValue(u.createdAt);
    var emailVerified = !!(u && u.emailVerified === true);
    var accountStatus = String((u && u.accountStatus) || "active").toLowerCase().trim();

    var deleteBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Delete" });
    deleteBtn.addEventListener("click", function() { handleDeleteUser(id); });
    var actionButtons = [];
    if (!isAdmin && emailVerified && accountStatus === "active" && String(email || "").toLowerCase().endsWith("@thesharedtablestory.com")) {
      var grantBtn = El("button", {
        className: "px-3 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
        textContent: "Grant Admin"
      });
      grantBtn.addEventListener("click", function() { handleGrantAdmin(id, email || name); });
      actionButtons.push(grantBtn);
      actionButtons.push(El("span", { textContent: " " }));
    }
    if (!isAdmin) {
      var suspendLabel = accountStatus === "suspended" ? "Restore" : "Suspend Account";
      var suspendClass = accountStatus === "suspended" ? "px-3 py-1 text-xs font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50" : "px-3 py-1 text-xs font-bold rounded border border-amber-200 text-amber-700 hover:bg-amber-50";
      var suspendBtn = El("button", { className: suspendClass, textContent: suspendLabel });
      (function(uid, st) { suspendBtn.addEventListener("click", function() { handleSuspendUser(uid, st); }); })(id, accountStatus);
      actionButtons.push(suspendBtn);
      actionButtons.push(El("span", { textContent: " " }));
    }
    // The bootstrap admin can never be deleted (backend refuses with BOOTSTRAP_ADMIN_LOCKED),
    // so its row offers no Delete — same hiding rule the Suspend button already follows.
    var isBootstrapAdmin = isAdmin && String(email || "").toLowerCase() === "admin@thesharedtablestory.com";
    if (!isBootstrapAdmin) actionButtons.push(deleteBtn);
    if (actionButtons.length === 0) actionButtons.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));

    tbody.appendChild(El("tr", {}, [
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
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700 font-semibold", textContent: String((item && item.email) || "—") }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: status }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: expires }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: String((item && item.invitedByAdminMasked) || "—") })
    ]));
  });
}

// Owner-approved 2026-08-03 (sir, Item 16): every audit action the backend emits
// (enumerated from server.js __auditAdmin calls), said as a plain phrase. Unmapped
// actions degrade to readable words, never the raw constant. Exports keep raw codes.
var __AUDIT_ACTION_LABELS = {
  admin_stats: "Viewed the dashboard figures",
  admin_experiences_list: "Viewed the listings",
  admin_experience_toggle: "Paused or resumed a listing",
  admin_bookings_list: "Viewed the bookings",
  admin_bookings_today: "Viewed today's bookings",
  admin_users_list: "Viewed the users",
  admin_user_delete: "Deleted a user's account",
  admin_user_status_update: "Changed a user's account status",
  admin_reports_list: "Viewed the reports",
  admin_report_update: "Decided a report",
  admin_host_applications_list: "Viewed the host applications",
  admin_host_application_update: "Decided a host application",
  admin_marketing_email_toggle: "Changed the marketing email setting",
  admin_request: "Admin request"
};
function __auditActionLabel(code) {
  var c = String(code || "admin_request").trim();
  if (__AUDIT_ACTION_LABELS[c]) return __AUDIT_ACTION_LABELS[c];
  var words = c.toLowerCase().replace(/^admin_/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
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
    // An audit trail needs the clock, not just the day (caught in my own design
    // re-check after sir refused the close: three same-day rows were indistinguishable).
    var created = "—";
    var createdDt = (item && item.createdAt) ? new Date(item.createdAt) : null;
    if (createdDt && !isNaN(createdDt.getTime())) {
      created = createdDt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) +
        ", " + createdDt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    }
    var actor = String((item && item.actorMasked) || "—");
    // Owner-ordered 2026-08-03 (sir, Item 16 second correction): the raw
    // "GET /api/…" request line was code on a human's screen and truncating it
    // was a shortcut. It is GONE from the table; exports keep the raw data.
    // The target renders as the human word for WHAT was touched, never an id.
    var targetType = String((item && item.targetType) || "").toLowerCase();
    var target = __reportTargetWords(targetType);
    // Owner-approved 2026-08-03 (sir, Item 16): plain outcome words, colours kept.
    var status = (item && item.ok === true) ? "Done" : "Failed";
    var statusClass = (item && item.ok === true) ? "text-emerald-700" : "text-red-600";
    var rid = String((item && item.rid) || "");

    tbody.appendChild(El("tr", { className: "align-middle" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600 whitespace-nowrap", textContent: created }),
      // The domain is the platform's own on every row; the masked local part
      // identifies the admin, the full masked address sits on hover.
      El("td", { className: "px-6 py-4 text-sm text-slate-700 whitespace-nowrap", title: actor, textContent: actor.indexOf("@") > 0 ? actor.slice(0, actor.indexOf("@")) : actor }),
      El("td", { className: "px-6 py-4 text-sm font-semibold text-tsts-ink whitespace-nowrap", textContent: __auditActionLabel(item && item.action) }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600 whitespace-nowrap", textContent: target }),
      El("td", { className: "px-6 py-4 text-sm font-semibold " + statusClass, textContent: status }),
      El("td", { className: "px-6 py-4 text-sm whitespace-nowrap" }, [
        rid ? __adminCopyRefButton("Copy reference", rid) : El("span", { className: "text-xs text-slate-400", textContent: "—" })
      ]),
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
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No promo codes yet. Create one to get started." })
    ]));
    return;
  }

  list.forEach(function(promo) {
    var code = String((promo && promo.code) || "");
    var active = !!(promo && promo.active);
    var statusClass = active ? "text-emerald-700" : "text-amber-700";
    var statusText = active ? "Active" : "Inactive";
    var maxUses = Number(promo && promo.maxUsesTotal) || 0;
    var used = Number(promo && promo.usedCount) || 0;
    var maxUsesText = maxUses > 0 ? String(maxUses) : "Unlimited";

    var editBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50", textContent: "Edit" });
    editBtn.addEventListener("click", function() { handleEditCoupon(code, promo); });

    var actionBtns = [editBtn];

    if (active) {
      var stopBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Deactivate" });
      stopBtn.addEventListener("click", function() { handleDeactivateCoupon(code); });
      actionBtns.push(stopBtn);
    } else {
      var startBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50", textContent: "Activate" });
      startBtn.addEventListener("click", function() { handleActivateCoupon(code); });
      actionBtns.push(startBtn);
    }

    var viewBtn = El("button", { className: "px-3 py-1 text-xs font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50", textContent: "View Redemptions" });
    viewBtn.addEventListener("click", function() { handleViewRedemptions(code); });
    actionBtns.push(viewBtn);

    // Interleave spacers between buttons
    var actionChildren = [];
    actionBtns.forEach(function(btn, i) {
      actionChildren.push(btn);
      if (i < actionBtns.length - 1) actionChildren.push(El("span", { textContent: " " }));
    });

    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-4 text-sm font-semibold text-slate-800", textContent: code || "\u2014" }),
      El("td", { className: "px-6 py-4 text-sm text-slate-700 font-semibold", textContent: formatPromoDiscount(promo) }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: maxUsesText }),
      El("td", { className: "px-6 py-4 text-sm text-slate-600 font-semibold", textContent: String(used) }),
      El("td", { className: "px-6 py-4 text-sm " + statusClass, textContent: statusText }),
      El("td", { className: "px-6 py-4 text-sm" }, actionChildren)
    ]));
  });
}

// Owner-approved 2026-08-03 (sir, Item 9): ONE designed dialog per moderation decision.
// Replaces a chain of up to three mismatched popups, the machine-worded confirm, and the
// hand-typed 24-character database id. When marking a duplicate, the OTHER open reports
// about the same target are offered as selectable rows: the admin picks, never types.
// Resolves { note, duplicateOfReportId } or null.
function __reportDecisionDialog(cfg) {
  return new Promise(function (resolve) {
    var El = window.tstsEl;
    var openedAt = Date.now();
    var siblings = Array.isArray(cfg.siblings) ? cfg.siblings : [];
    var pickedId = siblings.length ? String(siblings[0].id) : "";
    var pickNodes = {};

    function close(r) {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(r);
    }
    function onKey(ev) { if (ev && ev.key === "Escape") { ev.stopPropagation(); close(null); } }
    function paint() {
      Object.keys(pickNodes).forEach(function (k) {
        var on = (k === pickedId);
        pickNodes[k].className = "w-full text-left rounded-xl border p-3 transition cursor-pointer " +
          (on ? "border-orange-500 bg-orange-50/50" : "border-gray-200 hover:border-gray-300 bg-white");
        pickNodes[k].setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    var body = [];
    body.push(El("div", {}, [
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: String(cfg.title || "Review this report") }),
      cfg.subtitle ? El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(cfg.subtitle) }) : null
    ]));
    if (cfg.reportSummary) {
      body.push(El("div", { className: "bg-gray-50 rounded-xl p-3 border-l-2 border-orange-300" }, [
        El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-gray-400 mb-1", textContent: "The report" }),
        El("p", { className: "text-sm text-gray-700 italic", textContent: String(cfg.reportSummary) })
      ]));
    }
    if (cfg.needsDuplicatePick) {
      if (siblings.length) {
        body.push(El("div", {}, [
          El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: "Which report is the original?" }),
          El("div", { className: "space-y-2", role: "radiogroup", "aria-label": "Original report" }, siblings.map(function (sib) {
            var row = El("div", { role: "radio", tabindex: "0", "aria-checked": "false" }, [
              El("p", { className: "text-sm font-bold text-tsts-ink", textContent: sib.headline }),
              El("p", { className: "text-xs text-gray-600", textContent: sib.detail })
            ]);
            pickNodes[String(sib.id)] = row;
            row.addEventListener("click", function () { pickedId = String(sib.id); paint(); });
            row.addEventListener("keydown", function (ev) {
              if (ev && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); pickedId = String(sib.id); paint(); }
            });
            return row;
          }))
        ]));
      } else {
        body.push(El("p", { className: "text-sm text-gray-600 bg-gray-50 rounded-xl p-3", textContent: "There are no other reports about this target, so there is nothing for this one to duplicate. Close this and choose a different outcome." }));
      }
    }
    var noteArea = El("textarea", { rows: "4", className: "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm leading-relaxed" });
    // resize-y is not in the compiled sheet, so the constraint is set directly.
    noteArea.style.resize = "vertical";
    noteArea.placeholder = String(cfg.notePlaceholder || "Explain this decision for the record.");
    var errEl = El("p", { className: "text-red-500 text-xs h-4" });
    body.push(El("div", {}, [
      El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: String(cfg.noteLabel || "Reviewer note") }),
      noteArea,
      errEl
    ]));

    var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Cancel" });
    var okBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: String(cfg.submitLabel || "Save decision") });
    cancelBtn.addEventListener("click", function () { close(null); });
    okBtn.addEventListener("click", function () {
      if (Date.now() - openedAt < 350) return;
      if (cfg.needsDuplicatePick && !pickedId) { errEl.textContent = "Pick the original report first."; return; }
      var note = String(noteArea.value || "").trim();
      if (note.length < 5) { errEl.textContent = "Please write a short note for the record."; return; }
      close({ note: note, duplicateOfReportId: pickedId });
    });
    body.push(El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, okBtn]));

    var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-lg p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": String(cfg.title || "Review this report") }, body);
    panel.style.maxHeight = "85vh";
    panel.style.overflowY = "auto";
    var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" }, [panel]);
    overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    // The default pick must be VISIBLE, not just held in state (caught in my own live check).
    paint();
    noteArea.focus();
  });
}

// Sibling reports about the SAME target, excluding this one, newest first.
function __siblingReportsFor(reportId, targetType, targetId) {
  var all = Array.isArray(window.__tstsReportsCache) ? window.__tstsReportsCache : [];
  return all.filter(function (r) {
    var rid = String((r && (r._id || r.id)) || "");
    return rid && rid !== String(reportId) &&
      String(r.targetType || "") === String(targetType || "") &&
      String(r.targetId || "") === String(targetId || "");
  }).map(function (r) {
    var when = formatDateValue(r && r.createdAt);
    var cat = String((r && r.category) || "general").replace(/_/g, " ");
    var msg = String((r && (r.message || r.reason)) || "").trim();
    return {
      id: String(r._id || r.id),
      headline: cat.charAt(0).toUpperCase() + cat.slice(1) + (when && when !== "\u2014" ? (" \u00b7 " + when) : ""),
      detail: msg ? (msg.length > 110 ? msg.slice(0, 110) + "\u2026" : msg) : "No description given."
    };
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
    // The stored category is the backend's enum (spam / harassment / fraud / safety / other).
    // Printing it raw put the word "other" in a column a moderator reads while deciding what to do.
    var category = __reportCategoryWords((r && r.category) || "general");
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

    // Owner-spec 2026-05-03 (D-10 world-best): three new disposition buttons
    // available on every report regardless of targetType.
    var dismissBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-slate-300 text-slate-700 hover:bg-slate-100",
      textContent: "Dismiss"
    });
    dismissBtn.addEventListener("click", async function () {
      var out = await __reportDecisionDialog({
        title: "Dismiss this report?", subtitle: "No violation found. The report is closed and no action is taken.",
        reportSummary: summary, noteLabel: "Why you're dismissing it",
        notePlaceholder: "Explain what you checked and why nothing needs action.", submitLabel: "Dismiss report"
      });
      if (!out) return;
      handleReportAction(id, "dismiss_rejected", "closed", { reason: out.note }, { skipConfirm: true });
    });

    var dupBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-slate-300 text-slate-700 hover:bg-slate-100",
      textContent: "Duplicate"
    });
    dupBtn.addEventListener("click", async function () {
      var out = await __reportDecisionDialog({
        title: "Mark as a duplicate", subtitle: "Point this report at the original so they are handled together.",
        reportSummary: summary, needsDuplicatePick: true,
        siblings: __siblingReportsFor(id, targetType, String((r && r.targetId) || "")),
        noteLabel: "Why it's a duplicate", notePlaceholder: "Explain how this matches the original report.",
        submitLabel: "Mark as duplicate"
      });
      if (!out || !out.duplicateOfReportId) return;
      handleReportAction(id, "mark_duplicate", "closed", { reason: out.note, duplicateOfReportId: out.duplicateOfReportId }, { skipConfirm: true });
    });

    var falseBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-red-300 text-red-700 hover:bg-red-50",
      textContent: "False Report"
    });
    falseBtn.addEventListener("click", async function () {
      var out = await __reportDecisionDialog({
        title: "Mark as a false report",
        subtitle: "This counts a strike against the person who reported it. Three strikes in 90 days mutes them for 7 days.",
        reportSummary: summary, noteLabel: "Why it's a false report",
        notePlaceholder: "Explain what shows the report was not made in good faith.", submitLabel: "Mark as false report"
      });
      if (!out) return;
      handleReportAction(id, "mark_false_report", "closed", { reason: out.note }, { skipConfirm: true });
    });

    // Owner-spec 2026-05-04 (D-10 chunk 8): two new buttons.
    // `Under Watch` keeps the report open in the queue for re-review (no email).
    // `Request Evidence` triggers the procedural-fairness gate (3-day deadline).
    var watchBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-amber-300 text-amber-800 hover:bg-amber-50",
      textContent: "Under Watch"
    });
    watchBtn.addEventListener("click", async function () {
      var out = await __reportDecisionDialog({
        title: "Keep this report under watch", subtitle: "It stays in the queue for another look. Nobody is emailed.",
        reportSummary: summary, noteLabel: "Why you're watching it",
        notePlaceholder: "Explain what you want to see before deciding.", submitLabel: "Keep under watch"
      });
      if (!out) return;
      handleReportAction(id, "mark_under_watch", "triaged", { reason: out.note }, { skipConfirm: true });
    });

    var evidenceBtn = El("button", {
      className: "px-2 py-1 text-xs font-bold rounded border border-blue-300 text-blue-800 hover:bg-blue-50",
      textContent: "Request Evidence"
    });
    evidenceBtn.addEventListener("click", async function () {
      var out = await __reportDecisionDialog({
        title: "Ask the host to explain",
        subtitle: "They get an email and three days to respond. If they don't, the report comes back ready to action.",
        reportSummary: summary, noteLabel: "What you want them to explain",
        notePlaceholder: "Tell the host exactly what context you need from them.", submitLabel: "Request evidence"
      });
      if (!out) return;
      handleReportAction(id, "request_host_evidence", "triaged", { reason: out.note }, { skipConfirm: true });
    });

    actionBtns.push(dismissBtn, dupBtn, falseBtn, watchBtn, evidenceBtn);

    // sir 2026-08-16 ("Build it"): abusive review/comment content can be BLOCKED — hidden from
    // every public surface and from the rating averages. The record stays for the audit trail.
    if (targetType === "review" || targetType === "comment") {
      var hideBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-red-300 text-red-700 hover:bg-red-50",
        textContent: "Hide the content"
      });
      hideBtn.addEventListener("click", async function () {
        var kindWord = (targetType === "review") ? "review" : "comment";
        var out = await __reportDecisionDialog({
          title: "Hide this " + kindWord + "?",
          subtitle: "It disappears from every public page" + (targetType === "review" ? " and stops counting in the host's rating" : "") + ". The record is kept for the audit trail.",
          reportSummary: summary, noteLabel: "Why you're hiding it",
          notePlaceholder: "Say what in the " + kindWord + " breaks the rules.", submitLabel: "Hide the " + kindWord
        });
        if (!out) return;
        handleReportAction(id, "hide_content", "actioned", { reason: out.note }, { skipConfirm: true });
      });
      actionBtns.push(hideBtn);
    }

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

    tbody.appendChild(El("tr", { className: "align-top" }, [
      El("td", { className: "px-6 py-4 text-sm text-slate-600", textContent: created }),
      // Was "experience • 68f3a91c22" — the raw database word plus ten characters of an id,
      // which tells a moderator nothing and is exactly the id fragment that is banned on screen.
      // The same TARGET_WORDS map this file already uses for the moderation queue says it in words.
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: __reportTargetWords(targetType) }),
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

// Owner 2026-08-02 (sir, privacy-safe chat review). Plain-English labels for scan reasons; the chip
// shows workflow state (Needs review / outcome); the modal fetches content via the flagged-only
// endpoint (every read is in the immutable AdminAudit trail) and records the admin's outcome.
var __CHAT_FLAG_LABELS = {
  cash_payment: "Cash payment mention",
  bank_transfer: "Bank transfer details",
  payid: "PayID mention",
  external_payment_app: "External payment app",
  pay_off_platform: "Off-platform payment ask",
  fee_avoidance: "Fee avoidance",
  phone_number: "Phone number shared",
  email_address: "Email address shared",
  external_messaging_app: "External messaging app",
  party_report: "Reported by a participant"
};
function __chatFlagLabel(reason) { return __CHAT_FLAG_LABELS[String(reason || "")] || String(reason || "Flagged"); }
var __CHAT_REVIEW_STATES = {
  needs_review: { label: "Chat · Needs review", cls: "bg-red-50 border-red-200 text-red-700" },
  reviewed_no_issue: { label: "Chat · Reviewed, no issue", cls: "bg-slate-50 border-slate-200 text-slate-600" },
  warning_sent: { label: "Chat · Warning sent", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  escalated: { label: "Chat · Escalated", cls: "bg-red-100 border-red-300 text-red-800" }
};
function __chatReviewChip(r) {
  var El = window.tstsEl;
  var st = __CHAT_REVIEW_STATES[String((r && r.chatReviewStatus) || "needs_review")] || __CHAT_REVIEW_STATES.needs_review;
  return El("div", { className: "mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold " + st.cls, textContent: st.label });
}

async function openChatReviewModal(requestId) {
  var El = window.tstsEl;
  var res = await adminFetch("/api/admin/private-booking-requests/" + encodeURIComponent(requestId) + "/chat", { method: "GET" });
  var raw = await res.json().catch(function () { return null; });
  if (!res.ok || !raw || raw.ok !== true) {
    window.tstsNotify((raw && raw.message) || "Couldn't open the conversation.", "error");
    return;
  }
  var d = raw.data || {};
  // z-[9990], max-w-[75%], px-3.5 and mb-0.5 are NOT in the compiled sheet (caught in
  // the Item 20 design sweep); compiled equivalents and inline widths are used instead.
  var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" });
  function closeModal() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

  var closeBtn = El("button", { type: "button", className: "text-slate-400 hover:text-slate-600 text-2xl leading-none px-2", "aria-label": "Close", textContent: "×" });
  closeBtn.addEventListener("click", closeModal);

  // Flag reasons in words, one line per flag, with the offending message quoted.
  var flagChips = El("div", { className: "space-y-1" },
    (Array.isArray(d.chatFlags) ? d.chatFlags : []).map(function (f) {
      var labels = (Array.isArray(f.reasons) ? f.reasons : []).map(__chatFlagLabel).join(" · ");
      var who = f.source === "report"
        ? ("Reported by the " + (f.fromRole === "host" ? "host" : "guest"))
        : ("Caught automatically on the " + (f.fromRole === "host" ? "host's" : "guest's") + " message");
      return El("div", {}, [
        El("p", { className: "text-sm font-bold text-red-700", textContent: who + ": " + labels }),
        f.excerpt ? El("p", { className: "text-sm text-gray-700 italic", textContent: "“" + String(f.excerpt).slice(0, 120) + "”" }) : null
      ]);
    }));

  // The two sides visually distinct: guest left on white, host right on the site's
  // warm tint, each bubble carrying the sender's name and the message time.
  function __chatWhen(at) {
    var dt = at ? new Date(at) : null;
    if (!dt || isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + ", " + dt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }
  var thread = El("div", { className: "space-y-2 max-h-64 overflow-y-auto bg-slate-50 rounded-xl p-4" },
    (Array.isArray(d.messages) && d.messages.length ? d.messages : []).map(function (m) {
      var isHost = String(m.fromRole) === "host";
      var when = __chatWhen(m.at);
      var bubble = El("div", { className: "rounded-xl px-3 py-2 text-xs leading-relaxed break-words border " + (isHost ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200") }, [
        El("p", { className: "font-bold text-slate-500 text-[10px] mb-1", textContent: (m.fromName || (isHost ? "Host" : "Guest")) + (when ? (" · " + when) : "") }),
        El("p", { className: "text-slate-800", textContent: String(m.text || "") })
      ]);
      bubble.style.maxWidth = "75%";
      return El("div", { className: "flex " + (isHost ? "justify-end" : "justify-start") }, [bubble]);
    }));
  if (!(Array.isArray(d.messages) && d.messages.length)) thread.appendChild(El("p", { className: "text-xs text-slate-400 text-center py-4", textContent: "No messages in this thread." }));

  var noteInput = El("textarea", { className: "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm leading-relaxed", rows: 3, placeholder: "Kept on the record. The next admin who opens this reads it." });
  noteInput.style.resize = "vertical";
  function outcomeBtn(label, outcome, cls) {
    var b = El("button", { type: "button", className: "px-3 py-2 rounded-lg text-xs font-bold border transition " + cls, textContent: label });
    b.addEventListener("click", async function () {
      b.disabled = true;
      var r2 = await adminFetch("/api/admin/private-booking-requests/" + encodeURIComponent(requestId) + "/chat-review", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: outcome, note: String(noteInput.value || "") })
      });
      var raw2 = await r2.json().catch(function () { return null; });
      if (r2.ok && raw2 && raw2.ok) {
        window.tstsNotify("Review saved.", "success");
        closeModal();
        loadPrivateBookingRequests().then(renderPrivateRequests);
      } else {
        b.disabled = false;
        window.tstsNotify((raw2 && raw2.message) || "Couldn't save the review.", "error");
      }
    });
    return b;
  }

  // Owner-ordered 2026-08-04 (sir, Item 20 redesign after "this is fake and very
  // rudimentary"): the dialog now follows the approved family. The last decision
  // reads as a labelled block through the SAME words as the chips, never the raw
  // outcome constant; the note is introduced properly, no em-dash.
  var __lastReviewWords = { reviewed_no_issue: "No issue found", warning_sent: "Warning sent", escalated: "Escalated", needs_review: "Still needs review" };
  var reviewedBlock = d.chatReviewedAt ? El("div", { className: "bg-gray-50 rounded-xl p-3 border-l-2 border-orange-300" }, [
    El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-gray-400 mb-1", textContent: "Last review" }),
    El("p", { className: "text-sm text-gray-700", textContent: (__lastReviewWords[String(d.chatReviewStatus || "")] || "Reviewed")
      + (d.chatReviewedBy ? (", by " + String(d.chatReviewedBy)) : "") + "."
      + (d.chatReviewNote ? (" Note: " + d.chatReviewNote) : "") })
  ]) : null;

  var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-lg p-6 space-y-4" }, [
    El("div", { className: "flex items-start justify-between gap-3" }, [
      El("div", {}, [
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Flagged conversation" }),
        El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(d.requesterName || "Guest") + " and " + String(d.hostName || "Host") + " · " + String(d.experienceTitle || "") })
      ]),
      closeBtn
    ]),
    El("div", { className: "bg-red-50 rounded-xl p-3 border-l-2 border-red-200" }, [
      El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-red-700 mb-1", textContent: "Why it was flagged" }),
      flagChips
    ]),
    El("div", {}, [
      El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: "The conversation" }),
      thread
    ])
  ].concat(reviewedBlock ? [reviewedBlock] : []).concat([
    El("div", {}, [
      El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: "Review note" }),
      noteInput
    ]),
    El("div", { className: "flex flex-wrap gap-2 justify-end pt-1" }, [
      outcomeBtn("No issue", "reviewed_no_issue", "border border-gray-200 text-gray-700 hover:bg-gray-50"),
      outcomeBtn("Send warning", "warning_sent", "border border-amber-300 text-amber-700 hover:bg-amber-50"),
      outcomeBtn("Escalate", "escalated", "bg-red-600 hover:bg-red-700 text-white shadow-sm")
    ])
  ]));
  panel.style.maxHeight = "85vh";
  panel.style.overflowY = "auto";
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function renderPrivateRequests(requests) {
  const El = window.tstsEl;
  const tbody = $("private-requests-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var list = Array.isArray(requests) ? requests : [];
  if (list.length === 0) {
    // The empty line matches the active filter, so "Flagged chats" never claims there are no requests at all.
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: __prAdminFlaggedOnly ? "No flagged chats. Nothing needs review right now." : "No private booking requests." })
    ]));
    return;
  }

  list.forEach(function (r) {
    var id = String((r && (r._id || r.id)) || "");
    var created = formatDateValue(r && r.createdAt);
    var expTitle = String((r && r.experienceTitle) || "Experience");
    var requester = String((r && r.requesterName) || "Guest");
    var requesterEmail = String((r && r.requesterEmail) || "");
    // House format, the one sir locked on P6: "7 Aug 2026 · 5:00 PM – 8:00 PM". This cell used to print
    // the stored values raw — "2026-09-11 • 17:00–20:00" — next to a CREATED column already showing
    // "10 Aug 2026", so the same screen dated the same thing two different ways.
    var __schedDateRaw = String((r && r.preferredDate) || "").trim();
    var __schedDate = __schedDateRaw ? formatDateValue(__schedDateRaw) : "Date to be agreed";
    var __schedTimeRaw = String((r && r.preferredTime) || "").trim();
    var __schedTime = __schedTimeRaw ? formatTimeRange12h(__schedTimeRaw) : "Time to be agreed";
    var schedule = __schedDate + " · " + __schedTime;
    var status = normalizeStateLabel(r && r.status);
    var guests = Number(r && r.guests);
    var adminNote = String((r && r.adminNote) || "").slice(0, 100);

    function mkStatusBtn(label, nextStatus, className) {
      var btn = El("button", { className: className, textContent: label });
      btn.addEventListener("click", function () { handlePrivateRequestStatus(id, nextStatus); });
      return btn;
    }

    // Owner 2026-08-02 (sir, legacy-buttons fix): Contacted/Approve/Close removed — they wrote retired
    // lead-states raw onto the live lifecycle, and admin "Approve" flipped status WITHOUT capturing the
    // guest's hold. Admin oversight = decline-only (real settle machinery: hold released, guest told).
    // Approving stays the host's decision alone; Decline shows only while the request is actionable.
    var actions = [];
    if (String((r && r.status) || "").toLowerCase() === "awaiting_host") {
      actions.push(mkStatusBtn("Decline", "declined", "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50"));
    }
    if (r && r.chatFlagged) {
      var reviewBtn = El("button", { className: "px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50", textContent: "Review chat" });
      reviewBtn.addEventListener("click", function () { openChatReviewModal(id); });
      actions.unshift(reviewBtn);
    }

    tbody.appendChild(El("tr", { className: "align-top" }, [
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
      ].concat(r && r.chatFlagged ? [__chatReviewChip(r)] : [])),
      El("td", { className: "px-6 py-4 text-sm" }, [
        actions.length
          ? El("div", { className: "flex flex-wrap gap-2" }, actions)
          : El("span", { className: "text-slate-400", textContent: "—" })
      ])
    ]));
  });
}

function renderActionItems(payload) {
  const El = window.tstsEl;
  const tbody = $("action-items-table-body");
  if (!tbody) return;
  tbody.textContent = "";

  var root = (payload && typeof payload === "object") ? payload : {};
  var data = (root.data && typeof root.data === "object") ? root.data : root;
  var list = Array.isArray(data.items) ? data.items : [];

  if (list.length === 0) {
    tbody.appendChild(El("tr", {}, [
      El("td", { className: "px-6 py-6 text-center text-sm text-slate-500", colSpan: "6", textContent: "No action items found." })
    ]));
    return;
  }

  list.forEach(function (item) {
    var id = String((item && item.id) || "");
    // Owner-approved 2026-08-03 (sir, Item 17): if the title falls back to the machine
    // action type, it is converted to words, never shown as a snake_case key.
    var rawTitle = String((item && item.title) || "").trim();
    var typeWords = String((item && item.actionType) || "").toLowerCase().replace(/_/g, " ").trim();
    var title = rawTitle || (typeWords ? (typeWords.charAt(0).toUpperCase() + typeWords.slice(1)) : "Pending action");
    var ownerType = String((item && item.ownerType) || "admin");
    var priority = String((item && item.priority) || "normal");
    var status = String((item && item.status) || "pending");
    var reminderAt = formatDateValue(item && item.nextReminderAt);
    var reminderCount = Number((item && item.reminderCount) || 0);
    var dashboardUrl = String((item && item.dashboardUrl) || "");
    // The item's own plain sentence. Without it every row of this kind reads the same: the title is
    // the action type in words, so "the money has been taken back" and "the money has to be
    // recovered by hand" arrived on screen as one identical line.
    var meta = (item && item.meta && typeof item.meta === "object") ? item.meta : {};
    var summary = String((meta && meta.summary) || "").trim();
    // Sentence-cased chip words (same convention as Items 15 and 16).
    var priorityLabel = priority === "time_sensitive" ? "Time sensitive" : (priority.charAt(0).toUpperCase() + priority.slice(1));
    var statusLabel = status.replace(/_/g, " ");
    statusLabel = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);

    var priorityClass = priority === "critical"
      ? "bg-red-100 text-red-700"
      : (priority === "time_sensitive" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700");
    var statusClass = status === "completed"
      ? "bg-emerald-100 text-emerald-700"
      : (status === "acknowledged" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700");

    var actionButtons = [];
    if (status !== "acknowledged" && status !== "completed") {
      var ackBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-slate-200 text-slate-700 hover:bg-slate-50",
        textContent: "Acknowledge"
      });
      ackBtn.addEventListener("click", function () { handleActionItemAck(id); });
      actionButtons.push(ackBtn);
    }
    if (status !== "completed") {
      var completeBtn = El("button", {
        className: "px-2 py-1 text-xs font-bold rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
        textContent: "Complete"
      });
      completeBtn.addEventListener("click", function () { handleActionItemComplete(id); });
      actionButtons.push(completeBtn);
    }

    if (dashboardUrl) {
      var openBtn = El("a", {
        href: dashboardUrl,
        className: "px-2 py-1 text-xs font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50",
        textContent: "Open",
        target: "_self",
        rel: "noopener"
      });
      actionButtons.push(openBtn);
    }
    if (actionButtons.length === 0) {
      actionButtons.push(El("span", { className: "text-xs text-slate-400", textContent: "—" }));
    }

    var rowId = id ? ("action-item-row-" + id) : "";
    var rowAttrs = { className: "align-top" };
    if (rowId) rowAttrs.id = rowId;
    // Owner-approved 2026-08-03 (sir, Item 17): the machine actionKey line is GONE
    // from under the title; chips read sentence-cased words.
    // AUDIT ITEM 5 (O-156 + rule 16): the sentence above says what happened and what to do, in
    // plain words only. The evidence sir's decision asks the record to name, the web address the
    // reply left from and the kind of refusal it was, is shown here as its own named fields, behind
    // a phrase, the way this panel already shows a host's own submission (line 1953). The
    // 2026-08-03 ruling (sir, Item 17) that took the machine actionKey line out from under the
    // title is kept whole: nothing machine-shaped is written into the title or the sentence, and
    // the kind of refusal is read in words, never as its key. The class names here are the ones
    // that disclosure already uses, so they are in the compiled stylesheet.
    var evidenceBox = null;
    if (String((item && item.actionType) || "") === "reply_missing_own_sentence") {
      var replyAddress = String((meta && meta.address) || "").trim();
      var replyKind = String((meta && meta.code) || "").toLowerCase().replace(/_/g, " ").trim();
      if (replyKind) replyKind = replyKind.charAt(0).toUpperCase() + replyKind.slice(1);
      if (replyAddress || replyKind) {
        evidenceBox = El("details", { className: "mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" }, [
          El("summary", { className: "cursor-pointer text-xs font-bold text-slate-800 select-none", textContent: "Show where this happened" })
        ]);
        if (replyAddress) {
          evidenceBox.appendChild(El("p", { className: "text-[11px] uppercase tracking-wide text-slate-500 mt-2", textContent: "Web address" }));
          evidenceBox.appendChild(El("p", { className: "text-xs text-slate-700 mt-1", textContent: replyAddress }));
        }
        if (replyKind) {
          evidenceBox.appendChild(El("p", { className: "text-[11px] uppercase tracking-wide text-slate-500 mt-2", textContent: "Kind of refusal" }));
          evidenceBox.appendChild(El("p", { className: "text-xs text-slate-700 mt-1", textContent: replyKind }));
        }
      }
    }
    tbody.appendChild(El("tr", rowAttrs, [
      El("td", { className: "px-6 py-4 text-sm text-slate-700" }, [
        El("div", { className: "font-semibold text-slate-800", textContent: title }),
        summary ? El("div", { className: "text-xs text-slate-500 mt-1", textContent: summary }) : null,
        evidenceBox
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-700", textContent: ownerType.charAt(0).toUpperCase() + ownerType.slice(1) }),
      // Chips never wrap mid-phrase; reminder noise only shows when it says something;
      // action buttons sit side by side on one line (sir, Item 17 format check).
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("span", { className: "px-2 py-1 text-xs font-bold rounded whitespace-nowrap " + priorityClass, textContent: priorityLabel })
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("span", { className: "px-2 py-1 text-xs font-bold rounded whitespace-nowrap " + statusClass, textContent: statusLabel })
      ]),
      El("td", { className: "px-6 py-4 text-sm text-slate-600 whitespace-nowrap" }, [
        El("div", { textContent: reminderAt }),
        reminderCount > 0 ? El("div", { className: "text-xs text-slate-500 mt-1", textContent: reminderCount === 1 ? "1 reminder sent" : (String(reminderCount) + " reminders sent") }) : null
      ]),
      El("td", { className: "px-6 py-4 text-sm" }, [
        El("div", { className: "flex gap-2 whitespace-nowrap" }, actionButtons)
      ])
    ]));
  });
}

function focusActionItemFromQuery() {
  var params = new URLSearchParams(window.location.search || "");
  var actionId = String(params.get("actionId") || "").trim();
  if (!actionId) return;
  var row = document.getElementById("action-item-row-" + actionId);
  if (!row) return;
  try {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (_) {
    row.scrollIntoView();
  }
  row.classList.add("bg-amber-50");
  setTimeout(function () {
    try { row.classList.remove("bg-amber-50"); } catch (_) {}
  }, 2200);
}

async function refreshActionItemsView() {
  var status = String(($("action-items-status-filter") && $("action-items-status-filter").value) || "pending").trim().toLowerCase();
  var data = await loadAdminActionItems(status);
  renderActionItems(data);
  focusActionItemFromQuery();
}

// Owner-ordered 2026-08-03 (sir, Item 16 filter fix): the Action filter is a dropdown
// of phrases whose values carry the codes invisibly. Populated once from the label map.
function __auditFillActionFilter() {
  var sel = $("audit-filter-action");
  if (!sel || sel.tagName !== "SELECT" || sel.options.length > 1) return;
  Object.keys(__AUDIT_ACTION_LABELS).forEach(function (code) {
    var o = window.tstsEl("option", { textContent: __AUDIT_ACTION_LABELS[code] });
    o.value = code;
    sel.appendChild(o);
  });
}

function collectAuditFilters() {
  __auditFillActionFilter();
  var okRaw = String(($("audit-filter-ok") && $("audit-filter-ok").value) || "").trim().toLowerCase();
  var out = {
    from: String(($("audit-filter-from") && $("audit-filter-from").value) || "").trim(),
    to: String(($("audit-filter-to") && $("audit-filter-to").value) || "").trim(),
    action: String(($("audit-filter-action") && $("audit-filter-action").value) || "").trim(),
    limit: 100,
    skip: 0
  };
  if (!out.from) delete out.from;
  if (!out.to) delete out.to;
  if (!out.action) delete out.action;
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

async function refreshVerificationViews() {
  const results = await Promise.all([
    loadVerificationFeePolicy().catch(() => null),
    loadHostVerifications("all").catch(() => null),
    loadEventVerifications("all").catch(() => null),
    loadShortfallMonitor({ limit: 250 }).catch(() => null)
  ]);
  if (results[0]) renderVerificationPolicy(results[0]);
  if (results[1]) renderHostVerifications(results[1]);
  if (results[2]) renderEventVerifications(results[2]);
  if (results[3]) {
    renderShortfallReview(results[3]);
    renderShortfallReconciliation(results[3]);
    renderShortfallSettlementCases(results[3]);
  }
}

async function handleHostVerificationTransition(userId, nextStatus) {
  var target = String(nextStatus || "").trim().toLowerCase();
  if (!userId || !target) return;
  var note = "";
  if (target === "rejected") {
    note = await window.tstsPrompt("Reason for rejection (required)", "", { minLength: 5, placeholder: "Explain why this verification is rejected." });
    note = String(note || "").trim();
    if (!note) return;
  } else if (target === "revoked") {
    note = await window.tstsPrompt("Reason for revoking the verified badge (required)", "", { minLength: 5, placeholder: "Explain why the verified status is being revoked." });
    note = String(note || "").trim();
    if (!note) return;
  } else if (target === "verified") {
    var confirmed = await window.tstsConfirm("Mark this host as verified?", { confirmText: "Verify" });
    if (!confirmed) return;
  } else if (target === "under_review") {
    note = await window.tstsPrompt("Optional review note", "", { minLength: 0, placeholder: "Add a note for this review (optional)." });
    note = String(note || "").trim();
  }

  try {
    await updateHostVerificationStatus(userId, target, note);
    window.tstsNotify("Host verification status updated.", "success");
    await refreshVerificationViews();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to update host verification.", "error");
  }
}

async function handleSaveVerificationPolicy() {
  var input = $("verification-fee-percent");
  var valueRaw = Number((input && input.value) || NaN);
  if (!Number.isFinite(valueRaw)) {
    window.tstsNotify("Enter a valid fee percent.", "error");
    return;
  }
  if (valueRaw < 0 || valueRaw > 20) {
    window.tstsNotify("Fee percent must be between 0.0 and 20.0.", "error");
    return;
  }
  var rounded = Math.round(valueRaw * 10) / 10;
  try {
    await saveVerificationFeePolicy(rounded);
    window.tstsNotify("Verification fee policy updated.", "success");
    await refreshVerificationViews();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to update verification fee policy.", "error");
  }
}

async function refreshShortfallViews() {
  const payload = await loadShortfallMonitor({ limit: 250 });
  renderShortfallReview(payload);
  renderShortfallReconciliation(payload);
  renderShortfallSettlementCases(payload);
}

// Owner 2026-08-03 (sir, platform-wide rule): humans never see or type code-language.
// Every reason code renders through this map; the machine keeps the code, the human
// reads plain words. Fallback title-cases unknown codes so a new backend code can
// never surface raw.
var __SHORTFALL_REASON_LABELS = {
  HOST_GOODWILL: "Goodwill to the host",
  FIRST_TIME_HOST: "First-time host",
  PLATFORM_SUBSIDY: "Platform subsidy",
  CAPACITY_RISK_LOW: "Low risk of empty seats",
  TECHNICAL_ERROR: "Our technical error",
  ADMIN_DISCRETION: "Admin discretion",
  RISK_LOW: "Low risk",
  RISK_MEDIUM: "Medium risk",
  RISK_HIGH: "High risk",
  HOST_VERIFIED: "Verified host",
  HOST_UNVERIFIED: "Unverified host",
  DISCOUNT_ORIGIN_UNKNOWN: "Discount origin unclear",
  REPEATED_SHORTFALL: "Repeated shortfall requests",
  CAPACITY_DEMAND_ANOMALY: "Unusual capacity or demand",
  MANUAL_OVERRIDE: "Manual override",
  UNUSED_CAPACITY_REFUND: "Refund for unused seats",
  SLOT_REJECTED_AFTER_PAYMENT: "Slot rejected after payment",
  SLOT_CANCELLED_NO_BOOKINGS: "Cancelled with no bookings",
  SLOT_CANCELLED_WITH_BOOKINGS: "Cancelled with bookings",
  MANUAL_OFF_PLATFORM: "Handled off-platform",
  FRAUD_REVIEW: "Fraud review",
  POLICY_EXCEPTION: "Policy exception"
};
function __shortfallReasonLabel(code) {
  var c = String(code || "").trim();
  if (__SHORTFALL_REASON_LABELS[c]) return __SHORTFALL_REASON_LABELS[c];
  return c.toLowerCase().split("_").map(function (w) { return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w; }).join(" ");
}

// Owner 2026-08-03 (sir): ONE designed dialog for admin decisions — never a chain of
// mismatched popups. Shows the full context (including the host's own written request),
// natural-language choice rows, an amount field only when the chosen option needs one,
// a reason DROPDOWN (no free-typed magic words possible), and a real multiline note.
// Resolves { choice, amountCents, reasonCode, note } or null on cancel.
// Owner-ordered 2026-08-03 (sir, Item 11 correction): money is never typed into a free
// text box. This control accepts ONLY digits and one decimal point (two decimals max),
// carries minus and plus steppers in whole dollars, and a dropdown of preset amounts
// when the ceiling is known. Everything clamps to [0.01, maxCents].
function __moneyStepperField(cfg) {
  var El = window.tstsEl;
  var symbol = String(cfg.symbol || "A$");
  var maxCents = (cfg.maxCents === null || cfg.maxCents === undefined) ? null : Math.max(0, Math.floor(Number(cfg.maxCents) || 0));

  var input = El("input", {
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    className: "w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm font-semibold text-tsts-ink"
  });
  input.placeholder = "0.00";

  // Digits and ONE dot, two decimals max. Anything else never lands in the field.
  function sanitize(raw) {
    var s = String(raw || "").replace(/[^0-9.]/g, "");
    var firstDot = s.indexOf(".");
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
      var parts = s.split(".");
      s = parts[0] + "." + (parts[1] || "").slice(0, 2);
    }
    return s.slice(0, 10);
  }
  input.addEventListener("input", function () {
    var clean = sanitize(input.value);
    if (clean !== input.value) input.value = clean;
  });
  input.addEventListener("blur", function () {
    var c = getCents();
    if (c > 0) setCents(c);
  });

  function getCents() {
    var v = parseFloat(String(input.value || "").trim());
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.round(v * 100);
  }
  function setCents(c) {
    c = Math.max(0, Math.floor(Number(c) || 0));
    if (maxCents !== null && c > maxCents) c = maxCents;
    input.value = (c / 100).toFixed(2);
    if (select) select.value = "";
  }

  function stepBtn(label, dir) {
    var b = El("button", {
      type: "button",
      className: "shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-200 text-tsts-ink text-lg font-bold hover:bg-gray-50 transition select-none",
      textContent: label,
      "aria-label": dir > 0 ? "Add one dollar" : "Take off one dollar"
    });
    b.addEventListener("click", function () {
      var c = getCents() + dir * 100;
      if (c < 100) c = dir > 0 ? 100 : 0;
      if (c <= 0) { input.value = ""; if (select) select.value = ""; return; }
      setCents(c);
    });
    return b;
  }

  var prefix = El("span", {
    className: "absolute inset-y-0 left-0 w-8 inline-flex items-center justify-center text-sm font-bold text-gray-400 pointer-events-none",
    textContent: symbol
  });
  var inputWrap = El("div", { className: "relative flex-1" }, [prefix, input]);
  var row = El("div", { className: "flex items-center gap-2" }, [stepBtn("−", -1), inputWrap, stepBtn("+", 1)]);

  // Preset amounts of what is still available, so common picks are one choice, not typing.
  var select = null;
  if (maxCents !== null && maxCents >= 100) {
    var fmt = (typeof cfg.format === "function") ? cfg.format : function (c) { return symbol + (c / 100).toFixed(2); };
    select = El("select", { className: "w-full mt-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-tsts-ink focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition cursor-pointer" });
    var choose = El("option", { textContent: "Or pick an amount" });
    choose.value = "";
    select.appendChild(choose);
    [
      { part: 0.25, label: "A quarter" },
      { part: 0.5, label: "Half" },
      { part: 0.75, label: "Three quarters" },
      { part: 1, label: "Everything left" }
    ].forEach(function (p) {
      var cents = Math.round(maxCents * p.part);
      if (cents < 100) return;
      var o = El("option", { textContent: p.label + " (" + fmt(cents) + ")" });
      o.value = String(cents);
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      var v = Number(select.value);
      if (Number.isFinite(v) && v > 0) input.value = (v / 100).toFixed(2);
    });
  }

  var root = El("div", {}, select ? [row, select] : [row]);
  return { root: root, input: input, getCents: getCents };
}

// Owner-approved 2026-08-03 (sir, Item 10 of the human-language walkthrough).
// ONE designed dialog per admin action, replacing the reason-box-then-confirm-popup
// chains. The figures, the consequences, the reason and the single action button all
// live on the same surface, so the admin decides once with everything in view.
function __adminActionDialog(cfg) {
  return new Promise(function (resolve) {
    var El = window.tstsEl;
    var openedAt = Date.now();
    var danger = cfg.destructive === true;
    var noteRequired = cfg.noteRequired !== false;

    function close(r) {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(r);
    }
    function onKey(ev) { if (ev && ev.key === "Escape") { ev.stopPropagation(); close(null); } }

    var body = [];
    body.push(El("div", {}, [
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: String(cfg.title || "Confirm this action") }),
      cfg.subtitle ? El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(cfg.subtitle) }) : null
    ]));

    // Real figures as real lines, never as faint placeholder text.
    if (Array.isArray(cfg.context) && cfg.context.length) {
      body.push(El("div", { className: "grid grid-cols-2 gap-x-4 gap-y-3" }, cfg.context.map(function (row) {
        return El("div", {}, [
          El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-gray-400", textContent: String(row.label) }),
          El("p", { className: "text-sm text-tsts-ink", textContent: String(row.value) })
        ]);
      })));
    }

    // Exactly what this action does, spelled out before it is taken.
    if (Array.isArray(cfg.consequences) && cfg.consequences.length) {
      body.push(El("div", {
        className: danger
          ? "bg-red-50 rounded-xl p-3 border-l-2 border-red-200"
          : "bg-gray-50 rounded-xl p-3 border-l-2 border-orange-300"
      }, [
        El("p", {
          className: "text-[11px] uppercase tracking-wide font-bold mb-1 " + (danger ? "text-red-700" : "text-gray-400"),
          textContent: String(cfg.consequencesLabel || "What this does")
        }),
        El("div", { className: "space-y-1" }, cfg.consequences.map(function (line) {
          return El("p", {
            className: "text-sm " + (danger ? "text-red-700" : "text-gray-700"),
            textContent: "• " + String(line)
          });
        }))
      ]));
    }

    var errEl = El("p", { className: "text-red-500 text-xs h-4" });

    // Amount control, when the action moves money. Owner-ordered 2026-08-03 (sir,
    // Item 11 correction): digits-only entry with a currency prefix, minus and plus
    // dollar steppers, and a dropdown of preset amounts. No free typing of garbage.
    var moneyField = null;
    if (cfg.amount) {
      moneyField = __moneyStepperField({
        symbol: cfg.amount.symbol,
        maxCents: cfg.amount.maxCents,
        format: cfg.amount.format
      });
      body.push(El("div", {}, [
        // The default label used to name Australian dollars outright. The platform takes ten
        // currencies, so the fallback now borrows the caller's own symbol and says nothing it
        // cannot know — the prefix inside the field already shows the currency.
        El("p", {
          className: "text-xs font-bold text-gray-500 mb-1",
          textContent: String(cfg.amount.label || ("Amount" + (cfg.amount.symbol ? (" (" + String(cfg.amount.symbol).trim() + ")") : "")))
        }),
        moneyField.root,
        cfg.amount.help ? El("p", { className: "text-xs text-gray-500 mt-1", textContent: String(cfg.amount.help) }) : null
      ]));
    }

    var noteArea = El("textarea", {
      rows: "4",
      className: "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm leading-relaxed"
    });
    noteArea.style.resize = "vertical";
    noteArea.placeholder = String(cfg.notePlaceholder || "Explain this decision for the record.");
    body.push(El("div", {}, [
      El("p", {
        className: "text-xs font-bold text-gray-500 mb-1",
        textContent: String(cfg.noteLabel || "Reason") + (noteRequired ? "" : " (optional)")
      }),
      noteArea,
      errEl
    ]));

    var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: String(cfg.cancelLabel || "Cancel") });
    var okBtn = El("button", {
      type: "button",
      className: danger
        ? "inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm transition"
        : "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm",
      textContent: String(cfg.submitLabel || "Confirm")
    });
    cancelBtn.addEventListener("click", function () { close(null); });
    okBtn.addEventListener("click", function () {
      if (Date.now() - openedAt < 350) return;
      var amountCents = 0;
      if (moneyField) {
        amountCents = moneyField.getCents();
        if (amountCents <= 0) { errEl.textContent = "Enter the amount, or pick one from the list."; return; }
        var cap = cfg.amount.maxCents;
        if (cap !== null && cap !== undefined && amountCents > cap) {
          // This fell back to __adminMoneyExact(cap, "AUD"), naming Australian dollars whatever the
          // booking was actually taken in — so a ¥12,000 booking refused the admin with "more than
          // the A$120.00 still available". The caller's own formatter knows the real currency; the
          // stale comment claiming the field is "A$-fixed" was wrong too, since callers pass a
          // symbol. Only if no formatter is supplied do we fall back, and then without a symbol.
          var capText = (typeof cfg.amount.format === "function")
            ? cfg.amount.format(cap)
            : __adminMoneyExact(cap, cfg.amount.currency || "AUD");
          errEl.textContent = String(cfg.amount.overCapMessage || ("That is more than the " + capText + " still available."));
          return;
        }
      }
      var note = String(noteArea.value || "").trim();
      if (noteRequired && note.length < 5) { errEl.textContent = "Please write a short reason for the record."; return; }
      close({ note: note, amountCents: amountCents });
    });
    body.push(El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, okBtn]));

    var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-lg p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": String(cfg.title || "Confirm this action") }, body);
    panel.style.maxHeight = "85vh";
    panel.style.overflowY = "auto";
    var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" }, [panel]);
    overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    if (moneyField) moneyField.input.focus(); else noteArea.focus();
  });
}

function __adminDecisionModal(cfg) {
  return new Promise(function (resolve) {
    var El = window.tstsEl;
    var openedAt = Date.now();
    var choices = Array.isArray(cfg.choices) ? cfg.choices : [];
    var selected = choices.length ? String(choices[0].value) : "";
    var choiceNodes = {};

    function close(result) {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(result);
    }
    function onKey(ev) {
      if (ev && ev.key === "Escape") { ev.stopPropagation(); close(null); }
    }
    function paint() {
      Object.keys(choiceNodes).forEach(function (k) {
        var on = (k === selected);
        choiceNodes[k].className = "w-full text-left rounded-xl border p-3 transition cursor-pointer " +
          (on ? "border-orange-500 bg-orange-50/50" : "border-gray-200 hover:border-gray-300 bg-white");
        choiceNodes[k].setAttribute("aria-checked", on ? "true" : "false");
      });
      var needsAmount = cfg.amountForChoice && selected === cfg.amountForChoice;
      amountWrap.className = needsAmount ? "space-y-1" : "hidden";
    }

    var body = [];
    body.push(El("div", {}, [
      El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: String(cfg.title || "Decision") }),
      cfg.subtitle ? El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(cfg.subtitle) }) : null
    ]));
    if (Array.isArray(cfg.context) && cfg.context.length) {
      body.push(El("div", { className: "grid grid-cols-2 gap-x-4 gap-y-3" }, cfg.context.map(function (row) {
        return El("div", {}, [
          El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-gray-400", textContent: String(row.label) }),
          El("p", { className: "text-sm text-tsts-ink", textContent: String(row.value) })
        ]);
      })));
    }
    if (cfg.requestNote && String(cfg.requestNote.text || "").trim()) {
      body.push(El("div", { className: "bg-gray-50 rounded-xl p-3 border-l-2 border-orange-300" }, [
        El("p", { className: "text-[11px] uppercase tracking-wide font-bold text-gray-400 mb-1", textContent: String(cfg.requestNote.label || "The host's request") }),
        El("p", { className: "text-sm text-gray-700 italic", textContent: "“" + String(cfg.requestNote.text).trim() + "”" })
      ]));
    }
    if (choices.length) {
      body.push(El("div", { className: "space-y-2", role: "radiogroup", "aria-label": "Decision" }, choices.map(function (ch) {
        var row = El("div", { role: "radio", tabindex: "0", "aria-checked": "false" }, [
          El("p", { className: "text-sm font-bold text-tsts-ink", textContent: String(ch.label) }),
          ch.sub ? El("p", { className: "text-xs text-gray-600", textContent: String(ch.sub) }) : null
        ]);
        choiceNodes[String(ch.value)] = row;
        row.addEventListener("click", function () { selected = String(ch.value); paint(); });
        row.addEventListener("keydown", function (ev) {
          if (ev && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); selected = String(ch.value); paint(); }
        });
        return row;
      })));
    }
    // Owner-ordered 2026-08-03 (sir, Item 11 correction): same controlled money entry
    // as __adminActionDialog. Digits only, steppers, presets when capped.
    // The symbol was fixed at "A$" while the dialog's own context line above it already printed the
    // booking's real currency — so on a JPY event an admin read "Amounts due ¥12,000 now" and was
    // then asked to type into a field labelled A$, two currencies for one decision on one screen.
    // The caller passes its currency through; A$ remains only as the platform's default.
    var amountField = __moneyStepperField({
      symbol: cfg.amountSymbol || "A$",
      maxCents: cfg.amountMaxCents,
      format: cfg.amountFormat
    });
    var amountWrap = El("div", { className: "hidden" }, [
      El("p", {
        className: "text-xs font-bold text-gray-500 mb-1",
        textContent: String(cfg.amountLabel || ("Amount" + (cfg.amountSymbol ? (" (" + String(cfg.amountSymbol).trim() + ")") : "")))
      }),
      amountField.root
    ]);
    body.push(amountWrap);
    var reasonSelect = El("select", { className: "w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-tsts-ink focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition cursor-pointer" },
      (Array.isArray(cfg.reasonCodes) ? cfg.reasonCodes : []).map(function (code) {
        var opt = El("option", { textContent: __shortfallReasonLabel(code) });
        opt.value = String(code);
        return opt;
      }));
    if (cfg.reasonDefault) reasonSelect.value = String(cfg.reasonDefault);
    body.push(El("div", {}, [
      El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: "Reason" }),
      reasonSelect
    ]));
    var noteArea = El("textarea", { rows: "5", className: "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm leading-relaxed" });
    // resize-y is not in the compiled sheet, so the constraint is set directly.
    noteArea.style.resize = "vertical";
    noteArea.placeholder = String(cfg.notePlaceholder || "Explain this decision. The host reads it.");
    var noteErr = El("p", { className: "text-red-500 text-xs h-4" });
    body.push(El("div", {}, [
      El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: String(cfg.noteLabel || "Decision note") }),
      noteArea,
      noteErr
    ]));
    var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Cancel" });
    var submitBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: String(cfg.submitLabel || "Save decision") });
    cancelBtn.addEventListener("click", function () { close(null); });
    submitBtn.addEventListener("click", function () {
      if (Date.now() - openedAt < 350) return;
      var note = String(noteArea.value || "").trim();
      if (note.length < 5) { noteErr.textContent = "Please write a short note. The host reads it."; return; }
      var amountCents = 0;
      if (cfg.amountForChoice && selected === cfg.amountForChoice) {
        amountCents = amountField.getCents();
        if (amountCents <= 0) { noteErr.textContent = "Enter the amount, or pick one from the list."; return; }
      }
      close({ choice: selected, amountCents: amountCents, reasonCode: String(reasonSelect.value || ""), note: note });
    });
    body.push(El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, submitBtn]));

    var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-lg p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": String(cfg.title || "Decision") }, body);
    // Height cap via DOM style (arbitrary Tailwind classes like max-h-[85vh] are NOT in
    // the compiled sheet — an uncapped panel grew past small windows and made the Save
    // button unreachable; caught live on sir's 764px-tall window).
    panel.style.maxHeight = "85vh";
    panel.style.overflowY = "auto";
    var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" }, [panel]);
    overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    paint();
    var firstChoice = choices.length ? choiceNodes[String(choices[0].value)] : null;
    if (firstChoice) firstChoice.focus(); else reasonSelect.focus();
  });
}

async function handleShortfallApprovalDecision(slotId, decision) {
  var action = String(decision || "").toLowerCase();
  if (!slotId || (action !== "approve" && action !== "reject")) return;
  var result = await __adminDecisionModal({
    title: action === "approve" ? "Approve this funding request" : "Reject this funding request",
    subtitle: action === "approve" ? "The host can start funding once approved." : "The host will not be able to fund this event.",
    reasonCodes: (Array.isArray(shortfallReasonCodes) && shortfallReasonCodes.length) ? shortfallReasonCodes : ["RISK_LOW", "RISK_MEDIUM", "RISK_HIGH"],
    reasonDefault: action === "approve" ? "RISK_LOW" : "RISK_HIGH",
    noteLabel: "Decision note",
    notePlaceholder: "Explain this decision. It goes on the record.",
    submitLabel: action === "approve" ? "Approve" : "Reject"
  });
  if (!result) return;
  try {
    await decideShortfallApproval(slotId, action, result.reasonCode, result.note);
    window.tstsNotify("Shortfall decision saved.", "success");
    await refreshShortfallViews();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to save shortfall decision.", "error");
  }
}

async function handleShortfallSettlementDecision(caseId, decision) {
  var action = String(decision || "").toLowerCase();
  if (!caseId || (action !== "approve" && action !== "reject")) return;
  var result = await __adminDecisionModal({
    title: action === "approve" ? "Approve this settlement refund" : "Reject this settlement refund",
    subtitle: action === "approve" ? "The host is refunded for the seats that stayed empty." : "No refund is issued for this event.",
    reasonCodes: (Array.isArray(shortfallSettlementReasonCodes) && shortfallSettlementReasonCodes.length) ? shortfallSettlementReasonCodes : ["UNUSED_CAPACITY_REFUND", "FRAUD_REVIEW"],
    reasonDefault: action === "approve" ? "UNUSED_CAPACITY_REFUND" : "FRAUD_REVIEW",
    noteLabel: "Settlement note",
    notePlaceholder: "Explain this decision. It goes on the record.",
    submitLabel: action === "approve" ? "Approve refund" : "Reject refund"
  });
  if (!result) return;
  try {
    await decideShortfallSettlement(caseId, action, result.reasonCode, result.note);
    window.tstsNotify("Settlement decision saved.", "success");
    await refreshShortfallViews();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to process settlement decision.", "error");
  }
}

async function handleWaiverDecision(slotId, slot) {
  if (!slotId) return;
  var s = (slot && typeof slot === "object") ? slot : {};
  var waiver = (s.waiver && typeof s.waiver === "object") ? s.waiver : {};
  var stageADue = Number((s.stageA && s.stageA.dueCents) || 0);
  var stageBDue = Number((s.stageB && s.stageB.dueCents) || 0);
  var context = [];
  if (s.experienceTitle || s.title) context.push({ label: "Experience", value: String(s.experienceTitle || s.title) });
  if (s.bookingDate) context.push({ label: "Event", value: String(s.bookingDate) + (s.timeSlot ? (" · " + s.timeSlot) : "") });
  if (stageADue > 0 || stageBDue > 0) context.push({ label: "Amounts due", value: __adminMoneyExact(stageADue, s.slotCurrencySnapshot) + " now, " + __adminMoneyExact(stageBDue, s.slotCurrencySnapshot) + " later" });
  // The slot's own currency, threaded into the amount field so the figure the admin TYPES is in the
  // same currency as the figures they are reading directly above it. Symbol taken from the real
  // formatter (the idiom this file already uses for the refund dialog) so the label can never drift
  // from the numbers beside it.
  var waiverCcy = s.slotCurrencySnapshot || "AUD";
  var waiverMoney = function (c) { return __adminMoneyExact(c, waiverCcy); };
  var waiverSymbol = waiverMoney(0).replace(/[\d.,\s ]/g, "") || "A$";
  var result = await __adminDecisionModal({
    title: "Fee-reduction request",
    subtitle: "Decide how much of the funding this host still pays.",
    context: context,
    amountSymbol: waiverSymbol,
    amountFormat: waiverMoney,
    requestNote: { label: "The host's request", text: String(waiver.requestNote || "") },
    choices: [
      { value: "approve_full", label: "Waive everything", sub: "The host pays nothing for this event's funding." },
      { value: "approve_partial", label: "Waive part of it", sub: "You set the amount taken off, and the host pays the rest." },
      { value: "reject", label: "Decline the request", sub: "The full amounts stay due." }
    ],
    amountForChoice: "approve_partial",
    amountLabel: "Amount taken off",
    amountMaxCents: (stageADue + stageBDue) > 0 ? (stageADue + stageBDue) : null,
    reasonCodes: (Array.isArray(shortfallWaiverReasonCodes) && shortfallWaiverReasonCodes.length) ? shortfallWaiverReasonCodes : ["HOST_GOODWILL", "FIRST_TIME_HOST", "PLATFORM_SUBSIDY", "CAPACITY_RISK_LOW", "TECHNICAL_ERROR", "ADMIN_DISCRETION"],
    reasonDefault: "ADMIN_DISCRETION",
    noteLabel: "Decision note",
    notePlaceholder: "Explain this decision. The host reads it in their email.",
    submitLabel: "Save decision"
  });
  if (!result) return;
  try {
    await decideShortfallWaiver(slotId, result.choice, result.reasonCode, result.note, result.amountCents);
    window.tstsNotify("Waiver decision saved.", "success");
    await refreshShortfallViews();
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to save waiver decision.", "error");
  }
}

// Local action handlers (no window.* exposure)
async function handleToggleExperience(id) {
  try { await toggleExperience(id); await boot(); } catch (e) { window.tstsNotify(e.message || "Failed", "error"); }
}
async function handleLifecycleAction(id, action) {
  // Owner-approved 2026-08-03 (sir, Item 10): was a reason box followed by a separate
  // confirm popup (and a third identity step on delete). Now one dialog carries the
  // consequences and the reason, and the identity check is triggered from inside it.
  var isDelete = action === "force-delete";
  var out = await __adminActionDialog({
    title: isDelete ? "Delete this listing" : "Pause this listing",
    subtitle: isDelete
      ? "This takes the listing off the site for good."
      : "The host keeps the listing, and you can put it back on sale whenever you want.",
    destructive: isDelete,
    consequences: isDelete
      ? [
          "Guests can no longer find it or book it.",
          "Bookings that have not happened yet are cancelled.",
          "This cannot be undone.",
          "You will verify your identity before it goes through."
        ]
      : [
          "Guests can no longer find it or book it.",
          "Nothing is cancelled, and bookings already made are untouched.",
          "You can make it bookable again at any time."
        ],
    noteLabel: isDelete ? "Why are you deleting it?" : "Why are you pausing it?",
    notePlaceholder: isDelete
      ? "This is kept on the record and shared with the host."
      : "This is kept on the record and shared with the host.",
    submitLabel: isDelete ? "Delete listing" : "Pause listing"
  });
  if (!out) return;
  var reason = out.note;
  try {
    var bodyPayload = { action: action, reason: reason };
    // FE-ALIGN-045 (2026-05-15): OTP dual-auth gate ONLY on force-delete per BUG-045.
    // Force-pause is reversible and keeps the lighter UX; force-delete is the
    // destructive operation listed in OTP_ADMIN_PURPOSES as admin_force_delete_experience.
    if (action === "force-delete") {
      var otpToken = await window.tstsOtpVerify("admin_force_delete_experience", {
        message: "Deleting a listing is permanent, so please confirm it is you.",
        actionLabel: "Confirm and delete",
        meta: { experienceId: id }
      });
      if (!otpToken) return;
      bodyPayload.otpToken = otpToken;
    }
    var res = await adminFetch("/api/admin/experiences/" + encodeURIComponent(id) + "/lifecycle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });
    var payload = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      window.tstsNotify(String((payload && payload.message) || "Action failed. Please try again."), "error");
      return;
    }
    window.tstsNotify(action === "force-delete" ? "Listing deleted. The host has been told why." : "Listing paused. Guests can no longer book it.", "success");
    await boot();
  } catch (e) {
    window.tstsNotify((e && e.message) || "Action failed. Please try again.", "error");
  }
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

// ===========================================================================
// THE REVIEW QUEUE (sir's order O-146, 2026-09-16)
// sir, verbatim: "the Admin needs to have proper panel to see all listing pending for his revuew".
// Before this, the only way to see what was waiting was a Pending Review pill inside the full
// Experiences table, where a listing waiting on a decision looked like every other row and the
// decision had to be made from a title, a price and nothing else.
// Each card here carries everything the decision needs, so nothing has to be looked up elsewhere.
// ===========================================================================
var _reviewQueueCache = [];

async function loadReviewQueue() {
  const res = await adminFetch("/api/admin/review-queue?limit=200");
  const data = await __safeJsonForAdmin(res);
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && data.message) ? data.message : "We couldn't load the review queue just now.");
  }
  return { items: (data.data && data.data.items) || [], meta: data.meta || {}, thresholdLabel: (data.data && data.data.thresholdLabel) || "" };
}

async function refreshReviewQueueBadge() {
  var badge = document.getElementById("review-queue-badge");
  if (!badge) return 0;
  try {
    const res = await adminFetch("/api/admin/review-queue/count");
    const data = await __safeJsonForAdmin(res);
    var n = (res.ok && data && data.ok === true) ? Number((data.data && data.data.count) || 0) : 0;
    if (!Number.isFinite(n) || n <= 0) {
      badge.classList.add("hidden");
      badge.textContent = "";
      return 0;
    }
    badge.classList.remove("hidden");
    badge.textContent = String(n > 99 ? "99+" : n);
    badge.setAttribute("aria-label", n === 1 ? "1 listing waiting for review" : (n + " listings waiting for review"));
    return n;
  } catch (_badgeErr) {
    // A badge that cannot be counted says nothing rather than a wrong number.
    badge.classList.add("hidden");
    badge.textContent = "";
    return 0;
  }
}

function __reviewQueueDateLine(value) {
  if (!value) return "Date not recorded";
  var d = new Date(value);
  if (isNaN(d.getTime())) return "Date not recorded";
  try {
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  } catch (_dErr) {
    return d.toISOString().slice(0, 10);
  }
}

function __reviewQueueWaitingLine(value) {
  if (!value) return "";
  var d = new Date(value);
  if (isNaN(d.getTime())) return "";
  var days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Sent today";
  if (days === 1) return "Waiting 1 day";
  return "Waiting " + days + " days";
}

function renderReviewQueue(payload) {
  const El = window.tstsEl;
  var listEl = document.getElementById("review-queue-list");
  var emptyEl = document.getElementById("review-queue-empty");
  var errorEl = document.getElementById("review-queue-error");
  var countEl = document.getElementById("review-queue-count");
  var introEl = document.getElementById("review-queue-intro");
  if (!listEl) return;

  var items = (payload && Array.isArray(payload.items)) ? payload.items : [];
  _reviewQueueCache = items;
  if (errorEl) errorEl.classList.add("hidden");
  listEl.textContent = "";

  if (introEl) {
    introEl.textContent = payload && payload.thresholdLabel
      ? ("Every listing waiting for one of us to read it, oldest first. A table goes in here when it is free, or when a seat costs less than " + payload.thresholdLabel + ".")
      : "Every listing waiting for one of us to read it, oldest first.";
  }

  if (items.length === 0) {
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (countEl) countEl.textContent = "";
    return;
  }
  if (emptyEl) emptyEl.classList.add("hidden");
  if (countEl) countEl.textContent = items.length === 1 ? "1 listing waiting" : (items.length + " listings waiting");

  items.forEach(function (item) {
    var id = String(item._id || "");
    var title = String(item.title || "Untitled listing");

    // ---- header: title, host, price, how long it has waited ----
    var waiting = __reviewQueueWaitingLine(item.submittedAt);
    var headerRight = [];
    headerRight.push(El("div", {
      className: "text-sm font-bold " + (item.isFree ? "text-tsts-ink" : "text-emerald-700"),
      textContent: String(item.priceLabel || "")
    }));
    if (waiting) headerRight.push(El("div", { className: "text-xs text-slate-500 mt-0.5", textContent: waiting }));

    var header = El("div", { className: "flex items-start justify-between gap-4 flex-wrap" }, [
      El("div", { className: "min-w-0" }, [
        El("h3", { className: "heading-serif text-lg font-bold text-tsts-ink", textContent: title }),
        El("p", { className: "text-sm text-slate-600 mt-0.5", textContent: "Hosted by " + (String(item.hostName || "").trim() || "a host whose name we don't have") }),
        El("p", { className: "text-xs text-slate-500 mt-0.5", textContent: "Sent for review on " + __reviewQueueDateLine(item.submittedAt) })
      ]),
      El("div", { className: "text-right shrink-0" }, headerRight)
    ]);

    // ---- why it is here: the one functional colour on the card ----
    var why = El("div", { className: "mt-4 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-start gap-3" }, [
      El("i", { className: "fa-solid fa-circle-info text-amber-600 mt-0.5", "aria-hidden": "true" }),
      El("p", { className: "text-sm text-amber-900 leading-relaxed", textContent: String(item.queuedBecause || "") })
    ]);

    // ---- when the platform itself put it back, say so on the card ----
    var putBack = null;
    if (item.returnedByUs === true) {
      putBack = El("div", { className: "mt-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-start gap-3" }, [
        // fa-circle-info, not fa-rotate-left: the latter is not in the icon set this site loads and
        // would have drawn nothing. This icon is already used elsewhere in this same file.
        El("i", { className: "fa-solid fa-circle-info text-slate-500 mt-0.5", "aria-hidden": "true" }),
        El("p", { className: "text-sm text-slate-700 leading-relaxed", textContent: "We put this one back ourselves on " + __reviewQueueDateLine(item.returnedByUsAt) + ". It had gone live without anyone reading it, and the host has been told." })
      ]);
    }

    // ---- the whole listing, opened in place ----
    var detail = El("div", { className: "hidden mt-4 border-t border-slate-100 pt-4 space-y-4" });

    var photos = (Array.isArray(item.images) && item.images.length > 0)
      ? item.images
      : (String(item.imageUrl || "").trim() ? [item.imageUrl] : []);
    if (photos.length > 0) {
      var strip = El("div", { className: "flex gap-3 overflow-x-auto pb-1" });
      photos.slice(0, 10).forEach(function (u) {
        // h-24, not h-28: `h-28` is not in the compiled stylesheet, so the photo would have had no
        // height at all and the strip would have collapsed.
        var img = El("img", { className: "h-24 w-40 shrink-0 rounded-xl object-cover border border-slate-100", alt: "Photo of " + title });
        if (window.tstsSafeImg) window.tstsSafeImg(img, u, "/assets/experience-default.jpg");
        strip.appendChild(img);
      });
      detail.appendChild(strip);
    } else {
      detail.appendChild(El("p", { className: "text-sm text-slate-500", textContent: "This listing has no photos." }));
    }

    detail.appendChild(El("div", {}, [
      El("p", { className: "text-xs uppercase tracking-widest text-slate-400 font-bold", textContent: "The story" }),
      El("p", { className: "text-sm text-slate-700 leading-relaxed mt-1 whitespace-pre-line", textContent: String(item.description || "").trim() || "This listing has no description." })
    ]));

    var areaParts = [];
    if (String(item.suburb || "").trim()) areaParts.push(String(item.suburb).trim());
    if (String(item.city || "").trim()) areaParts.push(String(item.city).trim());
    if (String(item.state || "").trim()) areaParts.push(String(item.state).trim());
    if (String(item.country || "").trim()) areaParts.push(String(item.country).trim());

    var dateParts = [];
    if (String(item.startDate || "").trim() && String(item.endDate || "").trim()) dateParts.push(item.startDate + " to " + item.endDate);
    else if (String(item.startDate || "").trim()) dateParts.push("From " + item.startDate);
    if (Array.isArray(item.availableDays) && item.availableDays.length) dateParts.push(item.availableDays.join(", "));
    if (Array.isArray(item.timeSlots) && item.timeSlots.length) dateParts.push(item.timeSlots.join(", "));

    var factRow = function (label, value) {
      return El("div", {}, [
        El("p", { className: "text-xs uppercase tracking-widest text-slate-400 font-bold", textContent: label }),
        El("p", { className: "text-sm text-slate-700 mt-1", textContent: value })
      ]);
    };
    detail.appendChild(El("div", { className: "grid gap-4 sm:grid-cols-2" }, [
      factRow("Where", areaParts.length ? areaParts.join(" \u00b7 ") : "No area on this listing"),
      factRow("When", dateParts.length ? dateParts.join(" \u00b7 ") : "No dates on this listing"),
      factRow("Seats", Number(item.maxGuests) > 0 ? (item.maxGuests + " at the table") : "No seat count on this listing"),
      factRow("Kind of food", (Array.isArray(item.cuisine) ? item.cuisine.join(", ") : String(item.cuisine || "")).trim() || "Not said")
    ]));

    if (String(item.requirements || "").trim()) {
      detail.appendChild(factRow("What guests should know", String(item.requirements).trim()));
    }

    // ---- the letters this host has already had about this listing ----
    var decisions = Array.isArray(item.decisions) ? item.decisions : [];
    if (decisions.length > 0) {
      var histRows = decisions.map(function (h) {
        var kids = [
          El("p", { className: "text-sm font-bold text-tsts-ink", textContent: String(h.actionLabel || "Decision") }),
          El("p", { className: "text-xs text-slate-500 mt-0.5", textContent: __reviewQueueDateLine(h.at) })
        ];
        if (String(h.letter || "").trim()) {
          kids.push(El("p", { className: "text-sm text-slate-600 mt-1", textContent: "The host read: \u201c" + String(h.letter).trim() + "\u201d" }));
        }
        if (String(h.reason || "").trim()) {
          kids.push(El("p", { className: "text-sm text-slate-700 mt-1 italic", textContent: "\u201c" + String(h.reason).trim() + "\u201d" }));
        }
        return El("li", { className: "rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3" }, kids);
      });
      detail.appendChild(El("div", {}, [
        El("p", { className: "text-xs uppercase tracking-widest text-slate-400 font-bold", textContent: "What this host has already been told" }),
        El("ul", { className: "mt-2 space-y-2" }, histRows)
      ]));
    } else {
      detail.appendChild(El("div", {}, [
        El("p", { className: "text-xs uppercase tracking-widest text-slate-400 font-bold", textContent: "What this host has already been told" }),
        El("p", { className: "text-sm text-slate-600 mt-1", textContent: "Nothing yet. This is the first decision on this listing." })
      ]));
    }

    // ---- actions ----
    var openBtn = El("button", {
      type: "button",
      className: "px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition",
      textContent: "Read the whole listing"
    });
    openBtn.setAttribute("aria-expanded", "false");
    openBtn.addEventListener("click", function () {
      var open = detail.classList.toggle("hidden") === false;
      openBtn.textContent = open ? "Close the listing" : "Read the whole listing";
      openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    var approveBtn = El("button", {
      type: "button",
      className: "px-5 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm",
      textContent: "Approve and publish"
    });
    approveBtn.addEventListener("click", function () {
      __adminGuardedClick(approveBtn, function () { return handleReviewQueueApprove(id, title); });
    });

    var rejectBtn = El("button", {
      type: "button",
      className: "px-5 py-2 text-sm font-bold rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 transition",
      textContent: "Send back with a note"
    });
    rejectBtn.addEventListener("click", function () {
      __adminGuardedClick(rejectBtn, function () { return handleReviewQueueReject(id, title); });
    });

    var actions = El("div", { className: "mt-4 flex items-center gap-2 flex-wrap justify-end" }, [openBtn, rejectBtn, approveBtn]);

    var cardKids = [header, why];
    if (putBack) cardKids.push(putBack);
    cardKids.push(detail, actions);

    listEl.appendChild(El("article", {
      className: "bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5",
      "aria-label": "Listing waiting for review: " + title
    }, cardKids));
  });
}

function renderReviewQueueError(message) {
  var listEl = document.getElementById("review-queue-list");
  var emptyEl = document.getElementById("review-queue-empty");
  var errorEl = document.getElementById("review-queue-error");
  var msgEl = document.getElementById("review-queue-error-msg");
  var countEl = document.getElementById("review-queue-count");
  if (listEl) listEl.textContent = "";
  if (countEl) countEl.textContent = "";
  if (emptyEl) emptyEl.classList.add("hidden");
  if (msgEl) msgEl.textContent = String(message || "Something stopped the queue from loading. Try again in a moment.");
  if (errorEl) errorEl.classList.remove("hidden");
}

function refreshReviewQueueView() {
  return loadReviewQueue()
    .then(function (payload) { renderReviewQueue(payload); return refreshReviewQueueBadge(); })
    .catch(function (e) { renderReviewQueueError((e && e.message) || ""); });
}

async function handleReviewQueueApprove(id, title) {
  var titleStr = String(title || "this experience");
  var confirmed = await window.tstsConfirm(
    "Approve \"" + titleStr + "\"?\n\nThe host will be emailed and the listing will go live on Explore immediately.",
    { confirmText: "Approve and publish" }
  );
  if (!confirmed) return;
  try {
    await moderationApprove(id);
    window.tstsNotify("Approved. The host has been notified and the listing is live.", "success");
    await refreshReviewQueueView();
  } catch (e) {
    window.tstsNotify((e && e.message) || "We couldn't approve that listing just now. Try again in a moment.", "error");
  }
}

async function handleReviewQueueReject(id, title) {
  var titleStr = String(title || "this experience");
  var reason = await window.tstsPrompt(
    "Tell the host what to fix on \"" + titleStr + "\". Be specific, they'll see this exact message.",
    "",
    { minLength: 10, maxLength: 1000, placeholder: "e.g. Photo doesn't match the listing description. Please use a clearer cover photo of your venue." }
  );
  reason = String(reason || "").trim();
  if (!reason) return;
  if (reason.length < 10) {
    window.tstsNotify("Please give the host at least a sentence about what to fix.", "error");
    return;
  }
  try {
    await moderationReject(id, reason);
    window.tstsNotify("Sent back to the host as a draft. They have your note by email.", "success");
    await refreshReviewQueueView();
  } catch (e) {
    window.tstsNotify((e && e.message) || "We couldn't send that one back just now. Try again in a moment.", "error");
  }
}

async function handleModerationApprove(id, title) {
  var titleStr = String(title || "this experience");
  var confirmed = await window.tstsConfirm(
    "Approve \"" + titleStr + "\"?\n\nThe host will be emailed and the listing will go live on Explore immediately.",
    { confirmText: "Approve and publish" }
  );
  if (!confirmed) return;
  try {
    await moderationApprove(id);
    window.tstsNotify("Approved. The host has been notified and the listing is live.", "success");
    await loadExperiences().then(renderExperiences).catch(function () { return null; });
    // The number on the side menu is the same number this decision just changed.
    await refreshReviewQueueBadge().catch(function () { return 0; });
  } catch (e) {
    window.tstsNotify((e && e.message) || "Failed to approve.", "error");
  }
}

async function handleModerationReject(id, title) {
  var titleStr = String(title || "this experience");
  var reason = await window.tstsPrompt(
    "Tell the host what to fix on \"" + titleStr + "\". Be specific, they'll see this exact message.",
    "",
    { minLength: 10, maxLength: 1000, placeholder: "e.g. Photo doesn't match the listing description. Please use a clearer cover photo of your venue." }
  );
  reason = String(reason || "").trim();
  if (!reason) return;
  if (reason.length < 10) {
    window.tstsNotify("Please give the host at least a sentence about what to fix.", "error");
    return;
  }
  try {
    await moderationReject(id, reason);
    window.tstsNotify("Returned to host as Draft. The host has been emailed with your note.", "success");
    await loadExperiences().then(renderExperiences).catch(function () { return null; });
    await refreshReviewQueueBadge().catch(function () { return 0; });
  } catch (e) {
    window.tstsNotify((e && e.message) || "Failed to reject.", "error");
  }
}
// GAP-41 (sir's question 3 on gap 32's audit, 2026-09-15): closing a host's account cancels
// that host's live bookings, releases any money held on a guest's card, and can now leave a
// booking behind that it could not cancel. Until now this screen said nothing at all: the
// counts came back in the answer and were thrown away, so an administrator closed an account
// and had no idea whether three guests had just been cancelled and refunded or none had, and
// a booking left behind was invisible. These sentences say what happened, and when something
// is left behind they say what to do about it, in the panel's own result-area shape (the
// diagnostic email result below uses the same hidden bordered box).
function renderUserDeleteResult(data) {
  var el = $("user-delete-result");
  if (!el) return;
  var d = (data && typeof data === "object") ? data : {};
  var seats = Number(d.bookingsCascaded) || 0;
  var holds = Number(d.holdsReleased) || 0;
  var stuck = Number(d.bookingsCascadeFailed) || 0;
  // Two more things that can be left behind, each different work for whoever picks it up:
  // a card hold that came off and whose guest was told, on a booking that would not close;
  // and a hold the card provider refused to release, whose guest has been told the truth and
  // is waiting. Both used to be either silent or reported as "a booking nobody could cancel",
  // which told the administrator the opposite of what had happened.
  var holdsStuck = Number(d.holdsStuck) || 0;
  var holdsNotReleased = Number(d.holdsNotReleased) || 0;
  var leftBehind = stuck + holdsStuck + holdsNotReleased;

  el.classList.remove("hidden", "border-slate-100", "border-amber-200", "bg-amber-50", "text-amber-800", "border-emerald-200", "bg-emerald-50", "text-emerald-700");
  el.classList.add(leftBehind > 0 ? "border-amber-200" : "border-emerald-200", leftBehind > 0 ? "bg-amber-50" : "bg-emerald-50", leftBehind > 0 ? "text-amber-800" : "text-emerald-700");
  el.textContent = "";

  var did = [];
  if (seats > 0) did.push(seats === 1 ? "1 booking was cancelled and that guest was told" : (seats + " bookings were cancelled and those guests were told"));
  if (holds > 0) did.push(holds === 1 ? "1 hold on a guest's card was released" : (holds + " holds on guests' cards were released"));
  var didSentence = did.length
    ? ("The account is closed. " + did.join(", and ") + ".")
    : "The account is closed. There were no bookings left to cancel.";
  el.appendChild(window.tstsEl("p", { textContent: didSentence }));

  // Each thing left behind says what it is and what to do about it, in that order. The tab
  // named here is the one on this panel's own sidebar: "Bookings & Requests".
  if (stuck > 0) {
    el.appendChild(window.tstsEl("p", {
      className: "mt-2 font-semibold",
      textContent: (stuck === 1
        ? "1 booking could not be cancelled, so that guest has not been told and no money has gone back to them yet."
        : (stuck + " bookings could not be cancelled, so those guests have not been told and no money has gone back to them yet."))
    }));
    el.appendChild(window.tstsEl("p", {
      className: "mt-1",
      textContent: "What to do: open the Bookings and Requests tab, find the bookings on this host's experiences, and cancel and refund each one yourself."
    }));
  }
  if (holdsStuck > 0) {
    el.appendChild(window.tstsEl("p", {
      className: "mt-2 font-semibold",
      textContent: (holdsStuck === 1
        ? "1 card hold was released and that guest was told, but its booking could not be closed. No money is held on that guest's card."
        : (holdsStuck + " card holds were released and those guests were told, but their bookings could not be closed. No money is held on those guests' cards."))
    }));
    el.appendChild(window.tstsEl("p", {
      className: "mt-1",
      textContent: (holdsStuck === 1
        ? "What to do: open the Bookings and Requests tab and close that booking by hand."
        : "What to do: open the Bookings and Requests tab and close those bookings by hand.")
    }));
  }
  if (holdsNotReleased > 0) {
    el.appendChild(window.tstsEl("p", {
      className: "mt-2 font-semibold",
      textContent: (holdsNotReleased === 1
        ? "1 hold on a guest's card could not be released, and that guest has been told we are still clearing it."
        : (holdsNotReleased + " holds on guests' cards could not be released, and those guests have been told we are still clearing them."))
    }));
    el.appendChild(window.tstsEl("p", {
      className: "mt-1",
      textContent: (holdsNotReleased === 1
        ? "What to do: release that hold with the card provider, then reply to the guest to say it is done."
        : "What to do: release those holds with the card provider, then reply to those guests to say it is done.")
    }));
  }
}

async function handleDeleteUser(id) {
  // Whatever the last closure said is about the last account, not this one. It goes before
  // anything else happens, so a closure that fails can never leave a stale report standing
  // over a different user.
  var __prev = $("user-delete-result");
  if (__prev) { __prev.textContent = ""; __prev.classList.add("hidden"); }
  var confirmed = await window.tstsConfirm("Delete this user?", { destructive: true, confirmText: "Delete" });
  if (!confirmed) return;
  try {
    // FE-ALIGN-045 (2026-05-15): OTP dual-auth gate for admin_delete_user per BUG-045.
    var otpToken = await window.tstsOtpVerify("admin_delete_user", {
      message: "To delete this user account, verify your identity.",
      actionLabel: "Verify & Delete User",
      meta: { targetUserId: id }
    });
    if (!otpToken) return;
    var out = await deleteUser(id, otpToken);
    // What happened is reported BEFORE the list is refreshed, so a refresh that fails can
    // never swallow the one account of the work that was actually done.
    var payload = (out && out.data && typeof out.data === "object") ? out.data : {};
    renderUserDeleteResult(payload);
    var stuck = (Number(payload.bookingsCascadeFailed) || 0) + (Number(payload.holdsStuck) || 0) + (Number(payload.holdsNotReleased) || 0);
    if (stuck > 0) {
      window.tstsNotify(stuck === 1
        ? "Account closed, but 1 thing was left behind. The note above the user list says what to do."
        : ("Account closed, but " + stuck + " things were left behind. The note above the user list says what to do."), "warning");
    } else {
      window.tstsNotify("Account closed.", "success");
    }
    await boot();
  } catch (e) {
    window.tstsNotify(e.message || "Failed", "error");
  }
}
async function handleGrantAdmin(id, label) {
  var confirmed = await window.tstsConfirm("Grant admin access to " + String(label || "this user") + "?", { confirmText: "Grant Admin" });
  if (!confirmed) return;
  try {
    // FE-ALIGN-045 (2026-05-15): OTP dual-auth gate for admin_grant_admin per BUG-045.
    // Admin must verify the second factor (OTP to their @thesharedtablestory.com mailbox)
    // before the elevation completes. Same pattern as host.js:2385 / profile.js:345.
    var otpToken = await window.tstsOtpVerify("admin_grant_admin", {
      message: "To grant admin access to " + String(label || "this user") + ", verify your identity.",
      actionLabel: "Verify & Grant Admin",
      meta: { targetUserId: id }
    });
    if (!otpToken) return;
    await grantAdmin(id, otpToken);
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
  // Owner-approved 2026-08-03 (sir, Item 10): was an amount box with the maximum hidden
  // in faint placeholder text, then a separate confirm popup. The ceiling is now a real
  // line the admin can read, and an amount above it is refused before anything is sent.
  var b = booking || {};
  // These two caps mirror the server's own checks exactly (REFUND_EXCEEDS_TOTAL uses
  // feeBreakdown/pricingSnapshot; REFUND_EXCEEDS_PAID uses amountCents). Showing any
  // other total would promise a refund the server would then refuse.
  var totalCents = toNumberOrNull(
    (b.feeBreakdown && b.feeBreakdown.totalCents) != null
      ? b.feeBreakdown.totalCents
      : ((b.pricingSnapshot && b.pricingSnapshot.totalCents) != null ? b.pricingSnapshot.totalCents : null)
  );
  var paidCents = toNumberOrNull(b.amountCents);
  var alreadyCents = Math.max(0, Number(b.totalRefundedCents) || 0);

  var caps = [totalCents, paidCents].filter(function (v) { return v !== null && v > 0; });
  var ceilingCents = caps.length ? Math.max(0, Math.min.apply(null, caps) - alreadyCents) : null;

  var guestName = (b.guestId && b.guestId.name) || (b.user && b.user.name) || b.guestName || "This guest";
  // The booking's own currency, so an AUD booking reads A$ and a JPY one reads ¥.
  var ccy = (b.pricingSnapshot && b.pricingSnapshot.currency) ||
    (b.refundDecision && b.refundDecision.currency) || b.currency || "AUD";
  var money = function (c) { return __adminMoney(c, ccy); };
  // The symbol alone, taken from the real formatter so the label can never drift
  // from the figures beside it. Strips digits, separators and any space kind.
  var ccySymbol = money(0).replace(/[\d.,\s ]/g, "") || "A$";

  var context = [
    { label: "Guest", value: String(guestName) },
    { label: "Booking total", value: caps.length ? money(Math.min.apply(null, caps)) : "Not recorded" }
  ];
  if (alreadyCents > 0) {
    context.push({ label: "Already refunded", value: money(alreadyCents) });
    context.push({ label: "Still refundable", value: ceilingCents === null ? "Not recorded" : money(ceilingCents) });
  }

  if (ceilingCents !== null && ceilingCents <= 0) {
    window.tstsNotify("This booking has already been refunded in full, so there is nothing left to refund.", "error");
    return;
  }

  var out = await __adminActionDialog({
    title: "Refund part of this booking",
    subtitle: "The money goes back to the guest's original payment method, usually within a few business days.",
    destructive: true,
    context: context,
    amount: {
      label: "Refund amount",
      symbol: ccySymbol,
      format: money,
      currency: ccy,
      maxCents: ceilingCents,
      help: ceilingCents === null
        ? "This booking has no recorded total, so the amount is checked when it is sent."
        : ("You can refund up to " + money(ceilingCents) + " on this booking."),
      overCapMessage: ceilingCents === null
        // Said "in dollars, like 25.50" whatever the booking was taken in — wrong wording, and a
        // wrong shape for a zero-decimal currency where ¥25.50 is not an amount that exists. The
        // example now comes from the booking's own formatter, so it is always a real figure in the
        // right currency ("A$25" / "¥2,500").
        ? ("Enter the amount, like " + money(2500) + ".")
        : ("That is more than the " + money(ceilingCents) + " left on this booking. Enter that amount or less.")
    },
    consequences: [
      "The guest is refunded to the card they paid with.",
      "The rest of the booking stays as it is.",
      "This cannot be reversed from here."
    ],
    noteLabel: "Why are you refunding this?",
    notePlaceholder: "This is kept on the booking record.",
    submitLabel: "Send refund"
  });
  if (!out) return;
  try {
    await refundBookingPartial(id, { amountCents: out.amountCents, reason: "requested_by_customer", note: out.note }, __adminIdemKey()); // one key per confirmed intent
    window.tstsNotify("Refund of " + money(out.amountCents) + " sent to " + String(guestName) + ".", "success");
    await boot();
  } catch (e) {
    window.tstsNotify((e && e.message) ? e.message : "The refund could not be sent. Please try again.", "error");
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
async function handleReportAction(id, action, status, extra, opts) {
  // Owner 2026-08-03 (sir, Item 9): decisions made in the designed dialog have already
  // been confirmed there, so they skip this step instead of stacking a second popup.
  // The remaining direct actions ask in plain English, never in the machine's action name.
  var o = (opts && typeof opts === "object") ? opts : {};
  if (o.skipConfirm !== true) {
    var ACTION_ASKS = {
      delete_user: { q: "Delete this user's account? This can't be undone.", ok: "Delete account" },
      pause_experience: { q: "Pause this listing so it can't be booked?", ok: "Pause listing" },
      mute_user: { q: "Mute this user for 24 hours?", ok: "Mute for 24 hours" },
      unpause_experience: { q: "Put this listing back on sale?", ok: "Make it bookable" }
    };
    var ask = ACTION_ASKS[action] || { q: "Apply this moderation decision?", ok: "Apply decision" };
    var confirmed = await window.tstsConfirm(ask.q, { destructive: action !== "mute_user", confirmText: ask.ok });
    if (!confirmed) return;
  }
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
    // Owner-approved 2026-08-03 (sir, Item 10): the note used to be asked AFTER the
    // confirm, which is backwards. It now sits in the same dialog as the decision.
    var out = await __adminActionDialog({
      title: "Decline this request",
      subtitle: "You are declining on the host's behalf, so the note matters.",
      destructive: true,
      consequences: [
        "The guest's payment hold is released and they are not charged.",
        "The guest is told the request was declined.",
        "The host keeps their calendar free for that date."
      ],
      noteLabel: "Note for the record",
      noteRequired: false,
      notePlaceholder: "Why is this being declined? Helpful if anyone asks later.",
      submitLabel: "Decline request"
    });
    if (!out) return;
    await updatePrivateBookingRequestStatus(id, { status: status, adminNote: out.note });
    window.tstsNotify("Request declined. The guest's hold was released and they've been notified.", "success");
    await loadPrivateBookingRequests().then(renderPrivateRequests);
  } catch (e) {
    window.tstsNotify(e.message || "Private request update failed", "error");
  }
}
async function handleActionItemAck(id) {
  if (!id) return;
  try {
    await acknowledgeAdminActionItem(id);
    window.tstsNotify("Action item acknowledged.", "success");
    await refreshActionItemsView();
  } catch (e) {
    window.tstsNotify(e.message || "Failed to acknowledge action item.", "error");
  }
}
async function handleActionItemComplete(id) {
  if (!id) return;
  var confirmed = await window.tstsConfirm("Mark this action item as completed?", { confirmText: "Complete" });
  if (!confirmed) return;
  try {
    await completeAdminActionItem(id);
    window.tstsNotify("Action item completed.", "success");
    await refreshActionItemsView();
  } catch (e) {
    window.tstsNotify(e.message || "Failed to complete action item.", "error");
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
    // Override limit to 1000 (backend max) for exports, avoids truncating multi-year data.
    // UI default (100) is for the live view only.
    var filters = Object.assign({}, collectAuditFilters(), { limit: 1000 });
    await exportAuditLogs(format, filters);
    window.tstsNotify("Audit export downloaded.", "success");
  } catch (e) {
    window.tstsNotify(e.message || "Failed to export audit logs.", "error");
  }
}
// Owner-approved 2026-08-03 (sir, Item 13 + scale rework): coupon scoping is picked
// from real names, never typed as slugs or ids, and it scales. Experiences and hosts
// are SERVER-SEARCHED (the catalogue never loads into the browser); each pick becomes
// a removable chip. Categories stay a fixed checklist of the platform's 8.
function __couponPickedValues(listId) {
  var list = $(listId);
  if (!list) return [];
  return Array.from(list.querySelectorAll("input[type=checkbox]:checked")).map(function (c) { return String(c.value); });
}

// One chip-picker instance per target. Holds picked id -> label, renders chips,
// debounces the server search, and shows a results list to pick from.
function __couponChipPicker(cfg) {
  var El = window.tstsEl;
  var picked = new Map();
  var searchEl = $(cfg.searchId);
  var chipsEl = $(cfg.chipsId);
  var resultsEl = $(cfg.resultsId);
  var timer = null;

  function renderChips() {
    if (!chipsEl) return;
    chipsEl.textContent = "";
    picked.forEach(function (label, id) {
      var x = El("button", { type: "button", className: "ml-1 text-orange-700 hover:text-red-600 font-bold", textContent: "×", "aria-label": "Remove " + label });
      x.addEventListener("click", function () { picked.delete(id); renderChips(); });
      chipsEl.appendChild(El("span", { className: "inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-semibold text-tsts-ink" }, [
        El("span", { textContent: label }), x
      ]));
    });
  }

  function hideResults() { if (resultsEl) { resultsEl.classList.add("hidden"); resultsEl.textContent = ""; } }

  function showResults(rows) {
    if (!resultsEl) return;
    resultsEl.textContent = "";
    if (!rows.length) {
      resultsEl.appendChild(El("p", { className: "px-3 py-2 text-sm text-slate-500", textContent: String(cfg.emptyCopy) }));
    }
    rows.forEach(function (r) {
      var row = El("button", { type: "button", className: "w-full text-left px-3 py-2 text-sm text-tsts-ink hover:bg-orange-50 transition" }, [
        El("span", { textContent: r.label })
      ]);
      row.addEventListener("click", function () {
        picked.set(String(r.id), String(r.label));
        renderChips();
        hideResults();
        if (searchEl) { searchEl.value = ""; searchEl.focus(); }
      });
      resultsEl.appendChild(row);
    });
    resultsEl.classList.remove("hidden");
  }

  async function runSearch() {
    var q = String((searchEl && searchEl.value) || "").trim();
    if (q.length < 2) { hideResults(); return; }
    try {
      var rows = await cfg.search(q);
      // The admin may have kept typing while this request ran; only show fresh results.
      if (String((searchEl && searchEl.value) || "").trim() === q) {
        showResults(rows.filter(function (r) { return !picked.has(String(r.id)); }));
      }
    } catch (searchErr) {
      void searchErr;
      showResults([]);
    }
  }

  if (searchEl) {
    searchEl.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSearch, 300);
    });
  }

  return {
    ids: function () { return Array.from(picked.keys()); },
    clear: function () { picked.clear(); renderChips(); hideResults(); }
  };
}

var __couponExpPicker = null;
var __couponHostPicker = null;

function __couponEnsurePickers() {
  if (!__couponExpPicker) {
    __couponExpPicker = __couponChipPicker({
      searchId: "coupon-exp-search",
      chipsId: "coupon-exp-chips",
      resultsId: "coupon-exp-results",
      emptyCopy: "No experiences match that name.",
      search: async function (q) {
        var rows = await loadExperiences({ status: "all", limit: 10, q: q });
        return rows.map(function (exp) {
          var where = String((exp && (exp.suburb || exp.city || (exp.location && exp.location.city))) || "");
          return { id: String((exp && (exp._id || exp.id)) || ""), label: String((exp && exp.title) || "Untitled experience") + (where ? (" · " + where) : "") };
        }).filter(function (r) { return r.id; });
      }
    });
  }
  if (!__couponHostPicker) {
    __couponHostPicker = __couponChipPicker({
      searchId: "coupon-host-search",
      chipsId: "coupon-host-chips",
      resultsId: "coupon-host-results",
      emptyCopy: "No hosts match that name or email.",
      search: async function (q) {
        var res = await adminFetch("/api/admin/users?hostsOnly=1&limit=10&q=" + encodeURIComponent(q), { method: "GET" });
        if (!res.ok) throw new Error("host search failed with status " + res.status);
        var body = await res.json();
        var rows = (body && Array.isArray(body.data)) ? body.data : [];
        return rows.map(function (u) {
          var name = String((u && u.name) || "").trim() || "Unnamed host";
          var email = String((u && u.email) || "");
          return { id: String((u && (u._id || u.id)) || ""), label: name + (email ? (" · " + email) : "") };
        }).filter(function (r) { return r.id; });
      }
    });
  }
}

function __couponBuildCategoryPicker() {
  var list = $("coupon-categories-list");
  if (!list || list.childElementCount > 0) return;
  var cats = Array.isArray(window.TSTS_CATEGORIES) ? window.TSTS_CATEGORIES : [];
  cats.forEach(function (c) {
    var box = window.tstsEl("input", { type: "checkbox", className: "rounded border-gray-300 text-orange-600 focus:ring-orange-500" });
    box.value = String(c.slug);
    list.appendChild(window.tstsEl("label", { className: "flex items-center gap-2 text-sm text-tsts-ink cursor-pointer py-0.5" }, [
      box,
      window.tstsEl("span", { textContent: String(c.label) })
    ]));
  });
}

function __couponScopeChanged() {
  var scope = String(($("coupon-scope") && $("coupon-scope").value) || "global").toLowerCase();
  var globalNote = $("coupon-scope-global-note");
  var catPicker = $("coupon-categories-picker");
  var expPicker = $("coupon-experiences-picker");
  var hostPicker = $("coupon-hosts-picker");
  if (globalNote) globalNote.classList.toggle("hidden", scope !== "global");
  if (catPicker) catPicker.classList.toggle("hidden", scope !== "category");
  if (expPicker) expPicker.classList.toggle("hidden", scope !== "experience");
  if (hostPicker) hostPicker.classList.toggle("hidden", scope !== "host");
  if (scope === "category") __couponBuildCategoryPicker();
  if (scope === "experience" || scope === "host") __couponEnsurePickers();
}

// THE COUPON CURRENCY PICKER — built 2026-08-21 on sir's order ("i will not tolerate any feature
// gap"). The promo schema has carried a `currency` field all along and the update route already
// clamped it to the enabled set, but the create form never sent one, so EVERY coupon the platform
// could produce was Australian dollars and the two money labels said "(A$)" as a statement of fact
// rather than a choice. On a platform that takes ten currencies that is a hole, not a preference:
// there was no way to discount a €90 or ¥12,000 listing by a fixed amount at all.
// The list comes from /api/pricing/listing-currencies — the SAME enabled set the hosting form's
// picker uses — so the coupon tab can never offer a currency the platform does not trade in.
var __couponCurrencies = null;

async function __couponLoadCurrencies() {
  if (Array.isArray(__couponCurrencies)) return __couponCurrencies;
  try {
    // Same public-fetch idiom this file already uses for unauthenticated config routes.
    var __base = (window.__TSTS_RUNTIME__ && window.__TSTS_RUNTIME__.apiBase) ? window.__TSTS_RUNTIME__.apiBase : "";
    var res = await fetch(__base + "/api/pricing/listing-currencies");
    var payload = await res.json().catch(function () { return null; });
    var rows = (payload && payload.data && Array.isArray(payload.data.currencies)) ? payload.data.currencies : [];
    __couponCurrencies = rows.length ? rows : [{ code: "aud", decimals: 2 }];
  } catch (_e) {
    void _e;
    // The form still works in the platform's default currency rather than showing an empty picker.
    __couponCurrencies = [{ code: "aud", decimals: 2 }];
  }
  return __couponCurrencies;
}

// The whole currency name, so an admin picking one is never guessing at three letters.
var __COUPON_CCY_NAME = {
  aud: "Australian dollars", nzd: "New Zealand dollars", usd: "US dollars", gbp: "British pounds",
  eur: "Euros", cad: "Canadian dollars", inr: "Indian rupees", jpy: "Japanese yen",
  chf: "Swiss francs", sgd: "Singapore dollars"
};

function __couponCurrencySymbol(code) {
  var sym = __adminMoneyExact(0, code).replace(/[\d.,\s ]/g, "");
  return sym || String(code || "AUD").toUpperCase();
}

async function __couponBuildCurrencyPicker() {
  var sel = $("coupon-currency");
  if (!sel) return;
  var rows = await __couponLoadCurrencies();
  if (sel.options && sel.options.length === rows.length) return;
  sel.textContent = "";
  rows.forEach(function (row) {
    var code = String((row && row.code) || "aud").toLowerCase();
    var opt = document.createElement("option");
    opt.value = code;
    opt.textContent = (__COUPON_CCY_NAME[code] || code.toUpperCase()) + " (" + __couponCurrencySymbol(code) + ")";
    sel.appendChild(opt);
  });
  if (rows.some(function (r) { return String(r.code).toLowerCase() === "aud"; })) sel.value = "aud";
  __couponCurrencyChanged();
}

// Both money fields belong to the picked currency: the label names it, and the step matches its
// scale so a zero-decimal currency cannot be given cents it does not have.
function __couponCurrencyChanged() {
  var code = String(($("coupon-currency") && $("coupon-currency").value) || "aud").toLowerCase();
  var symbol = __couponCurrencySymbol(code);
  var decimals = __adminCurrencyDecimals(code);
  var fixedLabel = $("coupon-fixed-label");
  var minLabel = $("coupon-min-subtotal-label");
  if (fixedLabel) fixedLabel.textContent = "Fixed amount off (" + symbol + ")";
  if (minLabel) minLabel.textContent = "Minimum spend (" + symbol + ")";
  var step = decimals === 0 ? "1" : "0.01";
  var fixedInput = $("coupon-fixed");
  var minInput = $("coupon-min-subtotal");
  if (fixedInput) {
    fixedInput.step = step;
    if (decimals === 0) fixedInput.value = String(Math.round(Number(fixedInput.value || 0)));
  }
  if (minInput) {
    minInput.step = step;
    if (decimals === 0) minInput.value = String(Math.round(Number(minInput.value || 0)));
  }
}

async function handleCreateCoupon(e) {
  e.preventDefault();
  try {
    var scopeVal = String(($("coupon-scope") && $("coupon-scope").value) || "global").trim().toLowerCase();
    var pickedCats = __couponPickedValues("coupon-categories-list");
    var pickedExps = __couponExpPicker ? __couponExpPicker.ids() : [];
    var pickedHosts = __couponHostPicker ? __couponHostPicker.ids() : [];
    if (scopeVal === "category" && !pickedCats.length) {
      throw new Error("Tick at least one category for this coupon to apply to.");
    }
    if (scopeVal === "experience" && !pickedExps.length) {
      throw new Error("Search and pick at least one experience for this coupon to apply to.");
    }
    if (scopeVal === "host" && !pickedHosts.length) {
      throw new Error("Search and pick at least one host for this coupon to apply to.");
    }
    var ccyVal = String(($("coupon-currency") && $("coupon-currency").value) || "aud").trim().toLowerCase();
    var payload = {
      code: String(($("coupon-code") && $("coupon-code").value) || "").trim().toUpperCase(),
      scopeType: scopeVal,
      // The currency the admin picked. Before this existed the form sent none, the route defaulted
      // to "aud", and no non-AUD coupon could ever be created through the panel.
      currency: ccyVal,
      percentOff: Number(($("coupon-percent") && $("coupon-percent").value) || 0),
      // The two money fields take MAJOR units on screen (an admin should never type "1000" to mean
      // A$10). The API contract is unchanged — the conversion to minor units happens here, at the
      // picked currency's own scale, so ¥2,500 is 2500 and not 250,000.
      fixedOffCents: __adminDollarsToCents($("coupon-fixed") && $("coupon-fixed").value, ccyVal),
      maxUsesTotal: Number(($("coupon-max-total") && $("coupon-max-total").value) || 0),
      maxUsesPerUser: Number(($("coupon-max-user") && $("coupon-max-user").value) || 1),
      minSubtotalCents: __adminDollarsToCents($("coupon-min-subtotal") && $("coupon-min-subtotal").value, ccyVal),
      minGuests: Number(($("coupon-min-guests") && $("coupon-min-guests").value) || 0),
      appliesToCategories: scopeVal === "category" ? pickedCats : [],
      appliesToExperienceIds: scopeVal === "experience" ? pickedExps : [],
      appliesToHostIds: scopeVal === "host" ? pickedHosts : []
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
    // Owner 2026-05-30 (date-picker rollout R3): form.reset() clears the source
    // <input>.value but NOT the Flatpickr alt-input chip. Call .clear() on each
    // attached picker so the visible chip resets in lockstep.
    var __cvf = $("coupon-valid-from");
    var __cvt = $("coupon-valid-to");
    if (__cvf && __cvf._flatpickr && typeof __cvf._flatpickr.clear === "function") {
      try { __cvf._flatpickr.clear(); } catch (_e) { void _e; }
    }
    if (__cvt && __cvt._flatpickr && typeof __cvt._flatpickr.clear === "function") {
      try { __cvt._flatpickr.clear(); } catch (_e) { void _e; }
    }
    // form.reset() returns the scope to Global; clear the chip pickers and realign visibility.
    if (__couponExpPicker) __couponExpPicker.clear();
    if (__couponHostPicker) __couponHostPicker.clear();
    __couponScopeChanged();
    // form.reset() returns the currency select to its first option too, so the two money labels
    // have to follow it back or they would keep naming the currency of the coupon just created.
    __couponCurrencyChanged();
    await loadCoupons().then(renderCoupons);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Coupon create failed", "error");
  }
}
// Owner-approved 2026-08-03 (sir, Item 8): editing a coupon used to hand the admin a raw
// JSON patch to type by hand, code field names and machine timestamps included. This is a
// real form in the site's dialog language: one labelled field per setting, a DROPDOWN for
// discount type (per sir's rule: a fixed set is never free text), real date fields, and a
// plain-English active toggle. Nothing on screen is code.
function __couponEditDialog(code, promo) {
  return new Promise(function (resolve) {
    var El = window.tstsEl;
    var p = promo || {};
    var openedAt = Date.now();
    // The coupon's own currency drives every money field in this dialog. It used to divide and
    // multiply by a fixed 100 and label everything A$, so a ¥ coupon opened here would have had its
    // amount shown a hundred times too small and saved back a hundred times too large.
    var editCcy = String(p.currency || "aud").toLowerCase();
    function editDecimals() { return __adminCurrencyDecimals(editCcy); }
    function editScale() { return Math.pow(10, editDecimals()); }
    function money(cents) {
      return (Math.max(0, Number(cents) || 0) / editScale()).toFixed(editDecimals());
    }
    function dateVal(v) {
      if (!v) return "";
      var d = new Date(v);
      if (isNaN(d.getTime())) return "";
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function field(labelText, inputEl, hintText) {
      return El("div", {}, [
        El("p", { className: "text-xs font-bold text-gray-500 mb-1", textContent: labelText }),
        inputEl,
        hintText ? El("p", { className: "text-[11px] text-gray-400 mt-1", textContent: hintText }) : null
      ]);
    }
    function textInput(value, placeholder) {
      var i = El("input", { type: "text", className: "w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm" });
      i.value = String(value == null ? "" : value);
      if (placeholder) i.placeholder = placeholder;
      return i;
    }
    function dateInput(value) {
      // Audit alignment (sir's R3 law, locked 2026-05-30: every date input site-wide uses the
      // shared Flatpickr wrapper): this was the last native type="date" on the platform.
      var i = El("input", { type: "text", readonly: "readonly", placeholder: "Pick a date", autocomplete: "off", className: "w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition text-sm bg-white" });
      i.value = value || "";
      if (typeof window.tstsDatePicker === "function") {
        try { window.tstsDatePicker(i, {}); } catch (_dp) { void _dp; }
      }
      return i;
    }

    var isPercent = Number(p.percentOff) > 0 || !(Number(p.fixedOffCents) > 0);
    var typeSelect = El("select", { className: "w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-tsts-ink focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition cursor-pointer" }, [
      (function () { var o = El("option", { textContent: "Percentage off the booking" }); o.value = "percent"; return o; })(),
      (function () { var o = El("option", { textContent: "Fixed amount off the booking" }); o.value = "fixed"; return o; })()
    ]);
    typeSelect.value = isPercent ? "percent" : "fixed";

    var amountInput = textInput(isPercent ? (Number(p.percentOff) || "") : money(p.fixedOffCents), isPercent ? "e.g. 10" : "e.g. 15.00");
    // Owner-ordered 2026-08-03 (sir, Item 11 correction): number fields never accept
    // letters. Digits and one decimal point only, same rule as the money stepper.
    amountInput.addEventListener("input", function () {
      var s = String(amountInput.value || "").replace(/[^0-9.]/g, "");
      var dot = s.indexOf(".");
      if (dot !== -1) {
        s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
        var pr = s.split(".");
        s = pr[0] + "." + (pr[1] || "").slice(0, 2);
      }
      if (s !== amountInput.value) amountInput.value = s;
    });
    // "in dollars" named a currency the coupon might not be in. The hint and the example now come
    // from the coupon's own currency.
    function amountHintText() {
      if (typeSelect.value === "percent") return "Percent off, between 1 and 100.";
      return "Amount off in " + (__COUPON_CCY_NAME[editCcy] || editCcy.toUpperCase()) + ".";
    }
    function amountExample() {
      return typeSelect.value === "percent" ? "e.g. 10" : ("e.g. " + money(15 * editScale()));
    }
    var amountWrap = field("Discount amount", amountInput, amountHintText());
    function paintAmountHint() {
      var hint = amountWrap.querySelector("p.text-\\[11px\\]") || amountWrap.querySelectorAll("p")[1];
      if (hint) hint.textContent = amountHintText();
      amountInput.placeholder = amountExample();
    }
    // The currency picker, offering exactly the enabled set the create form uses. Changing it
    // relabels the money fields so the admin always sees which currency they are editing in.
    var ccyRows = Array.isArray(__couponCurrencies) && __couponCurrencies.length
      ? __couponCurrencies
      : [{ code: editCcy, decimals: __adminCurrencyDecimals(editCcy) }];
    var ccySelect = El("select", { className: "w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-tsts-ink focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition cursor-pointer" },
      ccyRows.map(function (row) {
        var c = String((row && row.code) || "aud").toLowerCase();
        var o = El("option", { textContent: (__COUPON_CCY_NAME[c] || c.toUpperCase()) + " (" + __couponCurrencySymbol(c) + ")" });
        o.value = c;
        return o;
      }));
    if (ccyRows.some(function (r) { return String(r.code).toLowerCase() === editCcy; })) ccySelect.value = editCcy;

    typeSelect.addEventListener("change", paintAmountHint);

    var minSpendInput = textInput(money(p.minSubtotalCents), money(0));
    var minSpendWrap = field("Minimum spend (" + __couponCurrencySymbol(editCcy) + ")", minSpendInput, "0 for no minimum.");

    // Switching currency re-labels the minimum-spend field and re-shapes both money inputs, so the
    // figures on screen always belong to the currency named beside them.
    ccySelect.addEventListener("change", function () {
      editCcy = String(ccySelect.value || "aud").toLowerCase();
      var lbl = minSpendWrap.querySelector("p");
      if (lbl) lbl.textContent = "Minimum spend (" + __couponCurrencySymbol(editCcy) + ")";
      if (editDecimals() === 0) {
        minSpendInput.value = String(Math.round(Number(minSpendInput.value || 0)));
        if (typeSelect.value !== "percent") amountInput.value = String(Math.round(Number(amountInput.value || 0)));
      }
      paintAmountHint();
    });

    var minGuestsInput = textInput(Number(p.minGuests) || 0, "0");
    var maxTotalInput = textInput(Number(p.maxUsesTotal) || 0, "0");
    var maxPerUserInput = textInput(Number(p.maxUsesPerUser) || 1, "1");
    var fromInput = dateInput(dateVal(p.validFrom));
    var toInput = dateInput(dateVal(p.validTo));

    var errEl = El("p", { className: "text-red-500 text-xs h-4" });
    var cancelBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition", textContent: "Cancel" });
    var saveBtn = El("button", { type: "button", className: "inline-flex items-center px-4 py-2 tsts-btn-primary text-sm font-bold rounded-lg shadow-sm", textContent: "Save changes" });

    function close(result) {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(result);
    }
    function onKey(ev) { if (ev && ev.key === "Escape") { ev.stopPropagation(); close(null); } }

    cancelBtn.addEventListener("click", function () { close(null); });
    saveBtn.addEventListener("click", function () {
      if (Date.now() - openedAt < 350) return;
      var pct = typeSelect.value === "percent";
      var amt = parseFloat(String(amountInput.value || "").trim());
      if (!Number.isFinite(amt) || amt <= 0) { errEl.textContent = pct ? "Enter the percent off, like 10." : ("Enter the amount off, like " + money(15 * editScale()) + "."); return; }
      if (pct && amt > 100) { errEl.textContent = "A percentage discount can't be more than 100."; return; }
      var minSpend = parseFloat(String(minSpendInput.value || "0").trim());
      if (!Number.isFinite(minSpend) || minSpend < 0) { errEl.textContent = "Enter a minimum spend, or 0 for none."; return; }
      var patch = {
        // The currency travels with the money, so the amounts below are always read at the scale
        // they were typed at. The route clamps it to the platform's enabled set.
        currency: editCcy,
        percentOff: pct ? Math.round(amt) : 0,
        fixedOffCents: pct ? 0 : Math.round(amt * editScale()),
        minSubtotalCents: Math.round(minSpend * editScale()),
        minGuests: Math.max(0, parseInt(String(minGuestsInput.value || "0"), 10) || 0),
        maxUsesTotal: Math.max(0, parseInt(String(maxTotalInput.value || "0"), 10) || 0),
        maxUsesPerUser: Math.max(1, parseInt(String(maxPerUserInput.value || "1"), 10) || 1),
        validFrom: fromInput.value ? new Date(fromInput.value + "T00:00:00").toISOString() : null,
        validTo: toInput.value ? new Date(toInput.value + "T23:59:59").toISOString() : null
      };
      if (patch.validFrom && patch.validTo && new Date(patch.validTo) < new Date(patch.validFrom)) {
        errEl.textContent = "The end date can't be before the start date."; return;
      }
      close(patch);
    });

    var panel = El("div", { className: "bg-white rounded-3xl shadow-soft-card w-full max-w-lg p-6 space-y-4", role: "dialog", "aria-modal": "true", "aria-label": "Edit promo code" }, [
      El("div", {}, [
        El("h3", { className: "heading-serif text-xl font-bold text-tsts-ink", textContent: "Edit promo code" }),
        El("p", { className: "text-sm text-gray-600 mt-1", textContent: String(code || "") })
      ]),
      El("div", { className: "grid grid-cols-2 gap-3" }, [
        field("Discount type", typeSelect),
        field("Currency", ccySelect, "Applies to bookings taken in this currency.")
      ]),
      amountWrap,
      El("div", { className: "grid grid-cols-2 gap-3" }, [
        minSpendWrap,
        field("Minimum guests", minGuestsInput, "0 for no minimum.")
      ]),
      El("div", { className: "grid grid-cols-2 gap-3" }, [
        field("Total uses allowed", maxTotalInput, "0 for unlimited."),
        field("Uses per guest", maxPerUserInput)
      ]),
      El("div", { className: "grid grid-cols-2 gap-3" }, [
        field("Valid from", fromInput, "Leave empty for no start date."),
        field("Valid until", toInput, "Leave empty for no end date.")
      ]),
      errEl,
      El("div", { className: "flex items-center justify-end gap-2 pt-1" }, [cancelBtn, saveBtn])
    ]);
    panel.style.maxHeight = "85vh";
    panel.style.overflowY = "auto";
    var overlay = El("div", { className: "fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" }, [panel]);
    overlay.addEventListener("click", function (ev) { if (ev && ev.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    typeSelect.focus();
  });
}

async function handleEditCoupon(code, promo) {
  var patch = await __couponEditDialog(code, promo);
  if (!patch) return;
  try {
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

async function handleActivateCoupon(code) {
  var confirmed = await window.tstsConfirm("Activate coupon " + code + "?", { confirmText: "Activate" });
  if (!confirmed) return;
  try {
    await activateCoupon(code);
    window.tstsNotify("Coupon activated.", "success");
    await loadCoupons().then(renderCoupons);
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Activate failed", "error");
  }
}

async function handleViewRedemptions(code) {
  try {
    var redemptions = await loadRedemptions(code);
    var El = window.tstsEl;
    if (redemptions.length === 0) {
      window.tstsNotify("No redemptions for " + code + ".", "info");
      return;
    }
    // Each line names the guest, what they booked, when, and how much came off \u2014 never an id fragment.
    var lines = redemptions.map(function(r) {
      var who = String((r && r.guestName) || "").trim() || "A guest whose account has since been removed";
      var what = String((r && r.experienceTitle) || "").trim();
      var date = formatDateValue(r && r.createdAt);
      var off = Number((r && r.amountOffCents) || 0);
      var offText = off > 0 ? (" \u2014 " + __adminMoneyExact(off, "AUD") + " off") : "";
      return who + (what ? (" \u2014 " + what) : "") + (date ? (" \u2014 " + date) : "") + offText;
    });
    await window.tstsConfirm("Redemptions for " + code + " (" + String(redemptions.length) + "):\n\n" + lines.join("\n"), { confirmText: "Close", cancelText: "" });
  } catch (err) {
    window.tstsNotify((err && err.message) ? err.message : "Failed to load redemptions", "error");
  }
}

// Tab switching functionality (local, no window.* exposure)
// ISS-UX-001: Debounce + stale-response suppression for rapid tab switching
var _currentAdminTab = "";
var _adminTabToken = 0;
var _adminTabDebounceTimer = null;
// ───── Filter Taxonomies (admin-editable) ─────
async function loadTaxonomies() {
  const list = document.getElementById("taxonomies-list");
  if (!list) return;
  list.textContent = "";
  list.appendChild(window.tstsEl("p", { className: "text-sm text-slate-500" }, ["Loading taxonomies…"]));
  try {
    const res = await window.adminFetch("/api/admin/taxonomies", { method: "GET" });
    if (!res || !res.ok) throw new Error("HTTP " + (res && res.status));
    const data = await res.json();
    const taxonomies = (data && data.data) || {};
    renderTaxonomies(taxonomies);
  } catch (err) {
    list.textContent = "";
    list.appendChild(window.tstsEl("p", { className: "text-sm text-red-600" }, ["Failed to load taxonomies. Try Refresh."]));
  }
}

function renderTaxonomies(taxonomies) {
  const list = document.getElementById("taxonomies-list");
  if (!list) return;
  list.textContent = "";
  const labels = {
    vibe: "Vibe", dietary: "Dietary", accessibility: "Accessibility",
    cuisine: "Cuisine", languages: "Languages spoken", occasion: "Occasion"
  };
  Object.keys(labels).forEach((key) => {
    const data = taxonomies[key] || { items: [], updatedAt: null, updatedByAdminId: "", usingDefault: true };
    list.appendChild(buildTaxonomyCard(key, labels[key], data));
  });
}

function buildTaxonomyCard(key, label, data) {
  const items = Array.isArray(data.items) ? data.items.slice() : [];
  const card = window.tstsEl("section", { className: "bg-white rounded-3xl border border-slate-100 shadow-sm p-6", "data-taxonomy-key": key });
  const head = window.tstsEl("div", { className: "flex items-center justify-between gap-4 flex-wrap mb-4" });
  head.appendChild(window.tstsEl("div", {}, [
    window.tstsEl("h3", { className: "font-bold text-lg text-tsts-ink" }, [label]),
    window.tstsEl("p", { className: "text-xs text-slate-500 mt-0.5" }, [
      data.usingDefault
        ? "Currently using built-in default values."
        // Australian date voice; ids belong in the audit log, never on screen.
        : ("Last updated " + (data.updatedAt ? new Date(data.updatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—") + (data.updatedByAdminId ? (String(data.updatedByAdminId).toLowerCase().indexOf("system") === 0 ? ", updated automatically" : ", by an admin") : ""))
    ])
  ]));
  card.appendChild(head);

  const itemsWrap = window.tstsEl("div", { className: "space-y-2 mb-4", "data-taxonomy-items": "" });
  items.forEach((it, idx) => itemsWrap.appendChild(buildTaxonomyRow(key, it, idx, items.length)));
  card.appendChild(itemsWrap);

  // Add new row
  const addRow = window.tstsEl("div", { className: "flex items-center gap-2 mb-4 pt-4 border-t border-slate-100" });
  const labelInput = window.tstsEl("input", { type: "text", placeholder: "New label (e.g. Spicy)", maxLength: "80", className: "flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-tsts-clay/60 outline-none" });
  const valueInput = window.tstsEl("input", { type: "text", placeholder: "value (auto)", maxLength: "60", className: "w-40 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono text-slate-600 focus:ring-2 focus:ring-tsts-clay/60 outline-none" });
  labelInput.addEventListener("input", () => {
    if (!valueInput.dataset.userEdited) {
      valueInput.value = labelInput.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    }
  });
  valueInput.addEventListener("input", () => { valueInput.dataset.userEdited = "1"; });
  const addBtn = window.tstsEl("button", { type: "button", className: "px-4 py-2 rounded-xl tsts-btn-primary text-sm font-semibold" }, ["Add"]);
  addBtn.addEventListener("click", () => {
    const lbl = labelInput.value.trim();
    const val = valueInput.value.trim().toLowerCase();
    if (!lbl || !val) { window.tstsNotify("Both label and value are required.", "error"); return; }
    if (items.some((x) => x.value === val)) { window.tstsNotify("Value already exists.", "error"); return; }
    items.push({ value: val, label: lbl });
    itemsWrap.appendChild(buildTaxonomyRow(key, { value: val, label: lbl }, items.length - 1, items.length));
    labelInput.value = ""; valueInput.value = ""; delete valueInput.dataset.userEdited;
  });
  addRow.appendChild(labelInput); addRow.appendChild(valueInput); addRow.appendChild(addBtn);
  card.appendChild(addRow);

  // Save row
  const saveRow = window.tstsEl("div", { className: "flex items-center gap-3" });
  const saveStatus = window.tstsEl("p", { className: "text-xs text-slate-500", "data-tax-status": "" }, [""]);
  const saveBtn = window.tstsEl("button", { type: "button", className: "px-5 py-2 rounded-xl tsts-btn-primary text-sm font-semibold" }, ["Save changes"]);
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveStatus.textContent = "Saving…";
    saveStatus.className = "text-xs text-slate-500";
    try {
      const rows = Array.from(itemsWrap.querySelectorAll("[data-tax-row]"));
      const payload = rows.map((row) => ({ value: row.dataset.value, label: row.dataset.label }));
      const res = await window.adminFetch("/api/admin/taxonomies/" + encodeURIComponent(key), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload })
      });
      if (!res || !res.ok) {
        // WALK-P869-1 (2026-09-15): this used to throw a status number away and paint the same
        // four words for every refusal, so the server's own sentence, which says what was wrong
        // with the list and what to do about it, reached nobody. The server's sentence is shown
        // when it sends one; the old wording stays as the fallback for a refusal with no body.
        var __taxMsg = "";
        try { var __taxBody = await res.json(); __taxMsg = String((__taxBody && __taxBody.message) || ""); } catch (_taxParse) { __taxMsg = ""; }
        throw new Error(__taxMsg || "Save failed. Try again.");
      }
      saveStatus.textContent = "Saved at " + new Date().toLocaleTimeString();
      saveStatus.className = "text-xs text-emerald-700 font-semibold";
    } catch (err) {
      saveStatus.textContent = (err && err.message) ? String(err.message) : "Save failed. Try again.";
      saveStatus.className = "text-xs text-red-600 font-semibold";
    } finally {
      saveBtn.disabled = false;
    }
  });
  saveRow.appendChild(saveBtn); saveRow.appendChild(saveStatus);
  card.appendChild(saveRow);
  return card;
}

function buildTaxonomyRow(key, item, idx, total) {
  const row = window.tstsEl("div", {
    className: "flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl",
    "data-tax-row": "",
    "data-value": item.value,
    "data-label": item.label
  });
  const lbl = window.tstsEl("span", { className: "flex-1 text-sm font-semibold text-tsts-ink" }, [item.label]);
  const val = window.tstsEl("span", { className: "text-xs font-mono text-slate-500" }, [item.value]);
  const del = window.tstsEl("button", { type: "button", className: "px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:underline", "aria-label": "Remove " + item.label }, ["Remove"]);
  del.addEventListener("click", () => row.remove());
  row.appendChild(lbl); row.appendChild(val); row.appendChild(del);
  return row;
}

function switchTab(tabName) {
  // Debounce: if user clicks tabs rapidly, only honour the last one within 250ms
  clearTimeout(_adminTabDebounceTimer);
  _adminTabToken++;
  var myToken = _adminTabToken;
  _currentAdminTab = tabName;
  const views = ['dashboard', 'review-queue', 'listings', 'pricing', 'verification', 'action-items', 'users', 'coupons', 'moderation', 'private-requests', 'incidents', 'fees-charges', 'audit', 'legal', 'taxonomies'];
  const activeClass = "w-full text-left px-4 py-2.5 font-bold text-tsts-ink bg-orange-50 border-l-2 border-tsts-clay";
  const inactiveClass = "w-full text-left px-4 py-2.5 text-slate-600 hover:bg-slate-50 border-l-2 border-transparent";

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

  // The Review queue button is the only one in this menu that holds a second thing beside its label,
  // and this function assigns className WHOLESALE. Without putting the row layout back, the first tab
  // click stripped it and the count badge fell in behind the words instead of sitting at the right edge.
  // Found by reading this function after adding the button, not on a screen.
  var reviewQueueTab = document.getElementById('tab-review-queue');
  if (reviewQueueTab) reviewQueueTab.className += " flex items-center justify-between gap-2";

  // Close mobile sidebar when tab is selected
  var sidebar = document.getElementById("admin-sidebar");
  if (sidebar && window.innerWidth < 1024) {
    sidebar.classList.add("hidden");
    sidebar.classList.remove("fixed", "inset-0", "z-40", "flex");
  }

  // Debounce data loading by 250ms; stale-guard ensures only the latest tab renders
  _adminTabDebounceTimer = setTimeout(function () { _adminTabLoadData(tabName, myToken); }, 250);
};

// Stale-guarded data loader: if _adminTabToken changed since invocation, skip render
function _adminTabLoadData(tabName, token) {
  function isStale() { return _adminTabToken !== token; }
  function safeNotify(msg) { if (!isStale()) window.tstsNotify(msg, "error"); }

  if (tabName === 'users') {
    loadUsers().then(function (d) { if (!isStale()) renderUsers(d); }).catch(function () { safeNotify("Failed to load users."); if (!isStale()) renderUsers([]); });
    refreshAdminInvites().catch(function () { safeNotify("Failed to load invites."); if (!isStale()) renderAdminInvites([]); });
  }
  if (tabName === 'review-queue') {
    loadReviewQueue()
      .then(function (payload) { if (!isStale()) renderReviewQueue(payload); })
      .catch(function (e) { if (!isStale()) renderReviewQueueError((e && e.message) || ""); });
    refreshReviewQueueBadge().catch(function () { return 0; });
  }
  if (tabName === 'listings') {
    loadExperiences().then(function (d) { if (!isStale()) renderExperiences(d); }).catch(function () { safeNotify("Failed to load experiences."); if (!isStale()) renderExperiences([]); });
  }
  if (tabName === 'pricing') {
    Promise.all([
      loadVerificationFeePolicy().catch(function () { return null; }),
      loadMarketingEmailStatus().catch(function () { return null; }),
      Promise.resolve(null), // (legacy tier-policy removed — slot kept to preserve indices)
      loadRefundWindowPolicy().catch(function () { return null; }),
      loadApprovalThreshold().catch(function () { return null; }),
      loadCurrencyFees().catch(function () { return null; })
    ]).then(function (results) {
      if (isStale()) return;
      if (results[0]) renderVerificationPolicy(results[0]);
      if (results[1]) renderMarketingEmailStatus(results[1]);
      if (results[3]) renderRefundWindowPolicy(results[3]);
      if (results[5]) renderCurrencyFees(results[5]);
      if (results[4]) {
        var ti = document.getElementById("experience-approval-threshold");
        if (ti && Number.isFinite(Number(results[4].thresholdDollars))) ti.value = String(results[4].thresholdDollars);
        var meta = document.getElementById("approval-threshold-meta");
        if (meta) {
          meta.textContent = __adminUpdatedMetaLine(results[4]);
        }
      }
    }).catch(function () { safeNotify("Some pricing data failed to load."); });
  }
  if (tabName === 'verification') {
    Promise.all([
      loadHostVerifications("all").catch(function () { return null; }),
      loadEventVerifications("all").catch(function () { return null; }),
      loadShortfallMonitor({ limit: 250 }).catch(function () { return null; })
    ]).then(function (results) {
      if (isStale()) return;
      if (results[0]) renderHostVerifications(results[0]);
      if (results[1]) renderEventVerifications(results[1]);
      if (results[2]) {
        renderShortfallReview(results[2]);
        renderShortfallReconciliation(results[2]);
        renderShortfallSettlementCases(results[2]);
      }
    }).catch(function () {
      if (isStale()) return;
      safeNotify("Failed to load verifications.");
      renderHostVerifications({ data: { items: [] } });
      renderEventVerifications({ data: { items: [] } });
      renderShortfallReview({ data: { slots: [] } });
      renderShortfallReconciliation({ data: { slots: [] } });
      renderShortfallSettlementCases({ data: { settlementCases: [] } });
    });
  }
  if (tabName === 'action-items') {
    refreshActionItemsView().catch(function () { safeNotify("Failed to load action items."); if (!isStale()) renderActionItems({ data: { items: [] } }); });
  }
  if (tabName === 'coupons') {
    loadCoupons().then(function (d) { if (!isStale()) renderCoupons(d); }).catch(function () { safeNotify("Failed to load coupons."); if (!isStale()) renderCoupons([]); });
  }
  if (tabName === 'moderation') {
    loadReports().then(function (d) { if (!isStale()) renderReports(d); }).catch(function () { safeNotify("Failed to load reports."); if (!isStale()) renderReports([]); });
  }
  if (tabName === 'private-requests') {
    loadPrivateBookingRequests().then(function (d) { if (!isStale()) renderPrivateRequests(d); }).catch(function () { safeNotify("Failed to load private requests."); if (!isStale()) renderPrivateRequests([]); });
  }
  if (tabName === 'legal') {
    wireLegalAdminEvents();
    __legalSetType(__legalCurrentType || "privacy");
    loadPublishedIntoEditor();
  }
  if (tabName === 'taxonomies') {
    loadTaxonomies().catch(function () { safeNotify("Failed to load taxonomies."); });
  }
  if (tabName === 'dashboard') {
    Promise.all([
      loadStats().catch(function () { safeNotify("Failed to load stats."); return {}; }),
      loadBookings().catch(function () { safeNotify("Failed to load bookings."); return []; }),
      loadDashboardSummary().catch(function () { return {}; })
    ]).then(function(results) {
      if (isStale()) return;
      renderStats(results[0]);
      renderBookings(results[1]);
      renderDashboardSummary(results[2]);
    });
  }
  if (tabName === 'incidents') {
    loadAdminIncidents().then(function (d) { if (!isStale()) renderAdminIncidents(d); }).catch(function () { safeNotify("Failed to load incidents."); if (!isStale()) renderAdminIncidents([]); });
  }
  if (tabName === 'fees-charges') {
    loadAdminFeesCharges().then(function (d) { if (!isStale()) renderAdminFeesCharges(d); }).catch(function () { safeNotify("Failed to load fees and charges."); if (!isStale()) renderAdminFeesCharges([]); });
  }
  if (tabName === 'audit') {
    refreshAuditLogs().catch(function () { safeNotify("Failed to load audit logs."); if (!isStale()) renderAuditLogs([]); });
  }
}

function resolveInitialAdminTab() {
  var params = new URLSearchParams(window.location.search || "");
  var requested = String(params.get("tab") || "dashboard").trim().toLowerCase();
  var allowed = {
    "dashboard": true,
    "listings": true,
    "pricing": true,
    "verification": true,
    "action-items": true,
    "users": true,
    "coupons": true,
    "moderation": true,
    "private-requests": true,
    "incidents": true,
    "fees-charges": true,
    "audit": true,
    "legal": true,
    "taxonomies": true
  };
  return allowed[requested] ? requested : "dashboard";
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN ATTENDANCE INCIDENTS

async function loadAdminIncidents() {
  const res = await adminFetch("/api/admin/incidents?status=all&limit=200", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload && payload.error) || "Failed to load incidents."));
  const d = (payload && payload.data) ? payload.data : payload;
  return Array.isArray(d && d.items) ? d.items : (Array.isArray(d) ? d : []);
}

async function resolveIncident(incidentId, decision) {
  var note = await window.tstsPrompt("Admin note (optional):");
  if (note === null) return;
  try {
    var res = await adminFetch("/api/admin/incidents/" + encodeURIComponent(incidentId) + "/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: decision, note: String(note || "").trim() })
    });
    var payload = await res.json().catch(() => ({}));
    if (!res.ok) { window.tstsNotify(String((payload && payload.message) || "Failed to resolve incident."), "error"); return; }
    window.tstsNotify("Incident " + decision + ".", "success");
    loadAdminIncidents().then(renderAdminIncidents).catch(function () {});
  } catch (_) { window.tstsNotify("Failed to resolve incident.", "error"); }
}

function renderAdminIncidents(rows) {
  const El = window.tstsEl;
  const body = document.getElementById("admin-incidents-body");
  if (!body) return;
  body.textContent = "";
  var items = Array.isArray(rows) ? rows : [];
  if (items.length === 0) {
    body.appendChild(El("p", { className: "text-sm text-slate-500 text-center py-8", textContent: "All clear. No attendance issues right now." }));
    return;
  }
  var table = El("table", { className: "w-full text-sm" });
  table.appendChild(El("thead", {}, [
    El("tr", { className: "border-b border-slate-200 text-left" }, [
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Type" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Experience" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Date" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Severity" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Status" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Actions" })
    ])
  ]));
  var tbody = El("tbody", {});
  // Owner-approved 2026-08-03 (sir, Item 18): incident types read as words, never the
  // backend constant. ZERO_CHECKINS is the only type the backend writes today; unknown
  // future types degrade to sentence-cased words.
  var INCIDENT_TYPE_WORDS = { ZERO_CHECKINS: "Nobody checked in" };
  items.forEach(function (inc) {
    var status = String(inc.status || "open").toLowerCase();
    var severity = String(inc.severity || "low").toLowerCase();
    var typeKey = String(inc.type || "").toUpperCase();
    var typeWords = INCIDENT_TYPE_WORDS[typeKey];
    if (!typeWords) {
      var tw = typeKey.toLowerCase().replace(/_/g, " ");
      typeWords = tw ? (tw.charAt(0).toUpperCase() + tw.slice(1)) : "—";
    }
    var statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    var severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
    var badgeClass = "text-xs font-semibold px-2 py-0.5 rounded-full ";
    if (status === "resolved") badgeClass += "bg-emerald-50 text-emerald-700";
    else if (status === "dismissed") badgeClass += "bg-slate-50 text-slate-600";
    else badgeClass += "bg-orange-50 text-orange-700";
    var sevClass = "text-xs font-semibold px-2 py-0.5 rounded-full ";
    if (severity === "high") sevClass += "bg-red-50 text-red-700";
    else if (severity === "medium") sevClass += "bg-amber-50 text-amber-700";
    else sevClass += "bg-blue-50 text-blue-700";
    var dateStr = inc.createdAt ? new Date(inc.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
    var actions = [];
    if (status === "open") {
      actions.push(El("button", { className: "text-xs font-bold text-emerald-700 hover:underline", textContent: "Resolve", onclick: function () { resolveIncident(String(inc._id || ""), "resolved"); } }));
      actions.push(El("button", { className: "text-xs font-bold text-slate-500 hover:underline ml-2", textContent: "Dismiss", onclick: function () { resolveIncident(String(inc._id || ""), "dismissed"); } }));
    }
    tbody.appendChild(El("tr", { className: "border-b border-slate-100 hover:bg-slate-50" }, [
      El("td", { className: "py-2 px-2 text-tsts-ink whitespace-nowrap", textContent: typeWords }),
      // No raw record-id fallback: a missing title shows the quiet marker.
      El("td", { className: "py-2 px-2 text-tsts-ink truncate max-w-[200px]", title: String(inc.experienceTitle || ""), textContent: String(inc.experienceTitle || "—") }),
      El("td", { className: "py-2 px-2 text-slate-600 whitespace-nowrap", textContent: dateStr }),
      El("td", { className: "py-2 px-2" }, [El("span", { className: sevClass + " whitespace-nowrap", textContent: severityLabel })]),
      El("td", { className: "py-2 px-2" }, [El("span", { className: badgeClass + " whitespace-nowrap", textContent: statusLabel })]),
      El("td", { className: "py-2 px-2 whitespace-nowrap" }, actions)
    ]));
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN SUSPEND USER

async function handleSuspendUser(userId, currentStatus) {
  var isSuspended = currentStatus === "suspended";
  // Owner conventions (Items 10 + 19, 2026-08-04): suspension is ONE designed dialog
  // with the reason inside it. The backend REQUIRES a reason for any non-active
  // status; the old confirm never asked for one, so every suspension died with a
  // silent 400. Restore stays a light confirm: it is restorative and needs no reason.
  var suspendReason = "";
  if (isSuspended) {
    var ok = await window.tstsConfirm("Restore this account so they can log in again?", { confirmText: "Restore account" });
    if (!ok) return;
  } else {
    var out = await __adminActionDialog({
      title: "Suspend this account",
      subtitle: "You are locking a real person out, so the reason matters.",
      destructive: true,
      consequences: [
        "They won't be able to log in until you restore them.",
        "Their listings and bookings stay as they are.",
        "You will confirm it is you before it goes through."
      ],
      noteLabel: "Why are you suspending them?",
      notePlaceholder: "This is kept on the account record.",
      submitLabel: "Suspend account"
    });
    if (!out) return;
    suspendReason = out.note;
  }
  try {
    var bodyPayload = { status: isSuspended ? "active" : "suspended" };
    if (suspendReason) bodyPayload.reason = suspendReason;
    // FE-ALIGN-045 (2026-05-15): OTP dual-auth gate ONLY on suspension (active → suspended)
    // per BUG-045. Restoration to active is restorative and keeps the lighter UX.
    if (!isSuspended) {
      var otpToken = await window.tstsOtpVerify("admin_suspend_user", {
        message: "Suspending an account is serious, so please confirm it is you.",
        actionLabel: "Confirm and suspend",
        meta: { targetUserId: userId }
      });
      if (!otpToken) return;
      bodyPayload.otpToken = otpToken;
    }
    var __suspIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey({ dataset: {} }) : "";
    var res = await adminFetch("/api/admin/users/" + encodeURIComponent(userId) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
      idempotencyKey: __suspIdemKey
    });
    var payload = await res.json().catch(function (parseErr) { void parseErr; return null; });
    // Owner-approved 2026-08-03 (sir, Item 19): written sentences per branch, never
    // glued word endings (the old concatenation printed "User suspendd.").
    var failCopy = isSuspended
      ? "The account couldn't be restored. Please try again."
      : "The account couldn't be suspended. Please try again.";
    if (!res.ok) { window.tstsNotify(String((payload && payload.message) || failCopy), "error"); return; }
    window.tstsNotify(isSuspended
      ? "The account has been restored. They can log in again."
      : "The account has been suspended. They can't log in until you restore them.", "success");
    loadUsers().then(renderUsers).catch(function (reloadErr) { void reloadErr; });
  } catch (suspendErr) {
    void suspendErr;
    window.tstsNotify(isSuspended
      ? "The account couldn't be restored. Please try again."
      : "The account couldn't be suspended. Please try again.", "error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN FEES & CHARGES

async function loadAdminFeesCharges() {
  const res = await adminFetch("/api/admin/cancellation-charges", { method: "GET" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload && payload.error) || "Failed to load admin fees."));
  const d = (payload && payload.data) ? payload.data : payload;
  return Array.isArray(d && d.charges) ? d.charges : (Array.isArray(d) ? d : []);
}

function renderAdminFeesCharges(rows) {
  const El = window.tstsEl;
  const body = document.getElementById("admin-fees-charges-body");
  if (!body) return;
  body.textContent = "";

  var items = Array.isArray(rows) ? rows : [];
  if (items.length === 0) {
    body.appendChild(El("p", { className: "text-sm text-slate-500 text-center py-8", textContent: "No cancellation charges. You're all clear." }));
    return;
  }

  var table = El("table", { className: "w-full text-sm" });
  var thead = El("thead", {}, [
    El("tr", { className: "border-b border-slate-200 text-left" }, [
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Host" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Experience" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Date" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Charge" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Status" }),
      El("th", { className: "py-2 px-2 font-semibold text-slate-600 text-xs uppercase tracking-wide", textContent: "Balance" })
    ])
  ]);
  table.appendChild(thead);

  var tbody = El("tbody", {});
  items.forEach(function (ch) {
    var status = String(ch.status || "outstanding").toLowerCase();
    var badgeClass = "text-xs font-semibold px-2 py-0.5 rounded-full ";
    if (status === "recovered") badgeClass += "bg-emerald-50 text-emerald-700";
    else if (status === "partial") badgeClass += "bg-yellow-50 text-yellow-700";
    else badgeClass += "bg-orange-50 text-orange-700";
    var badgeText = status === "recovered" ? "Recovered" : (status === "partial" ? "Partial" : "Outstanding");
    var chargeCents = Number(ch.chargeCents) || 0;
    var balanceCents = Number(ch.balanceCents) || 0;
    var dateStr = ch.bookingDate ? new Date(ch.bookingDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

    var row = El("tr", { className: "border-b border-slate-100 hover:bg-slate-50" }, [
      El("td", { className: "py-2 px-2 text-tsts-ink", textContent: String(ch.hostName || "—") }),
      El("td", { className: "py-2 px-2 text-tsts-ink truncate max-w-[200px]", textContent: String(ch.experienceTitle || "—") }),
      El("td", { className: "py-2 px-2 text-slate-600", textContent: dateStr }),
      El("td", { className: "py-2 px-2 font-bold text-tsts-ink", textContent: __adminMoneyExact(chargeCents, ch.currency) }),
      El("td", { className: "py-2 px-2" }, [El("span", { className: badgeClass, textContent: badgeText })]),
      El("td", { className: "py-2 px-2 font-bold text-tsts-ink", textContent: __adminMoneyExact(balanceCents, ch.currency) })
    ]);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

// ──────────────────────────────────────────────────────────────────────────────
// PRICING TIER POLICY
// ──────────────────────────────────────────────────────────────────────────────
// (Legacy single-currency tier-policy admin UI removed — superseded by the
// Per-Currency Platform Fees card below. The shared preflight helper remains.)

// BUG-168/169 (2026-05-19): the Publish handlers POSTed straight to /publish.
// The server DOES validate + reject (so an invalid policy cannot actually go
// live), but the admin previously had to manually click "Validate" first —
// otherwise they confirmed a scary destructive publish only to receive a
// single generic error instead of the detailed per-rule list the dedicated
// /validate endpoint returns. Run /validate FIRST, render the full error list
// in the existing result panel, and abort BEFORE the confirm if invalid.
async function __pricingPreflightValidate(validateEndpoint, payload, resultEl, okText) {
  if (!resultEl) return true; // no panel to render into — server still gates it
  var res = await adminFetch(validateEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  var raw;
  try { raw = await res.json(); } catch (e) { raw = null; }
  resultEl.classList.remove("hidden");
  if (res.ok && raw && raw.ok === true) {
    resultEl.className = "text-xs rounded-xl px-3 py-2 bg-emerald-50 text-emerald-700";
    resultEl.textContent = okText;
    return true;
  }
  var errs = (raw && raw.data && Array.isArray(raw.data.errors)) ? raw.data.errors : [(raw && raw.error) || "Validation failed"];
  // Owner-approved 2026-08-04 (sir, Item 23): the same plain-English map the manual
  // "Validate" button already uses for these codes. This preflight runs the same
  // endpoint, so it must show the same human sentences, never the raw constant.
  var WINDOW_ERROR_COPY = {
    INVALID_WINDOW_OVERLAP: "Two windows overlap. Each window must end where the next begins.",
    INVALID_WINDOW_GAP: "There is a gap between two windows. Each window must end where the next begins.",
    INVALID_WINDOW_RANGE: "A window's hours or refund percentage are out of range, or there are no windows at all."
  };
  var sentences = errs.map(function (c) {
    var key = String(c || "").toUpperCase();
    if (WINDOW_ERROR_COPY[key]) return WINDOW_ERROR_COPY[key];
    var words = key.toLowerCase().replace(/_/g, " ");
    return words ? ("This could not be validated (" + words + ").") : "This could not be validated.";
  });
  resultEl.className = "text-xs rounded-xl px-3 py-2 bg-red-50 text-red-700";
  resultEl.textContent = "";
  resultEl.appendChild(window.tstsEl("p", { className: "font-bold mb-1", textContent: "Cannot publish. Fix these first:" }));
  Array.from(new Set(sentences)).forEach(function (s) {
    resultEl.appendChild(window.tstsEl("p", { className: "mt-0.5", textContent: s }));
  });
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// PER-CURRENCY PLATFORM FEES (canonical multi-currency money system)
// ──────────────────────────────────────────────────────────────────────────────
// The working copy is the full currencies map in the BACKEND shape (minor units +
// bps). Input fields show major units + percentage; we convert on read/write so the
// admin never deals with cents/bps directly. Editing one currency at a time; switching
// currency (or publishing) first flushes the on-screen rows into the working copy.
var _ccyFeeWorking = {};
var _ccyFeeActive = "aud";
var _ccyFeeSupported = [];
var _ccyFeeDecimalsMap = {};

function _ccyFeeDecimals(ccy) {
  var c = String(ccy || "").toLowerCase();
  var d = _ccyFeeDecimalsMap[c];
  return (typeof d === "number") ? d : 2;
}
function _minorToMajor(minor, dec) { return Number(minor || 0) / Math.pow(10, dec); }
function _majorToMinor(major, dec) {
  var n = Number(major);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * Math.pow(10, dec));
}

async function loadCurrencyFees() {
  var res = await adminFetch("/api/admin/pricing/currencies", { method: "GET" });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data || data.ok !== true) throw new Error("Failed to load currency fees");
  return data;
}

function renderCurrencyFees(payload) {
  var root = (payload && typeof payload === "object") ? payload : {};
  var d = (root.data && typeof root.data === "object") ? root.data : root;
  _ccyFeeWorking = (d.currencies && typeof d.currencies === "object") ? JSON.parse(JSON.stringify(d.currencies)) : {};
  _ccyFeeSupported = Array.isArray(d.supported) ? d.supported.slice() : [];
  _ccyFeeDecimalsMap = (d.decimals && typeof d.decimals === "object") ? d.decimals : {};
  var keys = Object.keys(_ccyFeeWorking);
  if (keys.indexOf(_ccyFeeActive) < 0) _ccyFeeActive = keys.indexOf("aud") >= 0 ? "aud" : (keys[0] || "aud");
  var sel = $("currency-fee-select");
  if (sel) {
    sel.textContent = "";
    keys.sort().forEach(function (ccy) {
      var opt = document.createElement("option");
      opt.value = ccy;
      var en = _ccyFeeWorking[ccy] && _ccyFeeWorking[ccy].enabled !== false;
      opt.textContent = ccy.toUpperCase() + (en ? "" : " (disabled)");
      sel.appendChild(opt);
    });
    sel.value = _ccyFeeActive;
  }
  var meta = $("currency-fee-meta");
  if (meta) {
    var enabledList = keys.filter(function (c) { return _ccyFeeWorking[c] && _ccyFeeWorking[c].enabled !== false; });
    meta.textContent = "Enabled for listing: " + (enabledList.length ? enabledList.map(function (c) { return c.toUpperCase(); }).join(", ") : "(none)") + ". Version: " + String(d.version || "");
  }
  renderCurrencyFeeEditor();
}

function _makeCurrencyFeeRowEl(container, data, dec) {
  data = data || {};
  var row = document.createElement("div");
  row.className = "flex flex-wrap gap-2 items-end";
  function _numField(hint, value, placeholder, step) {
    var wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-0.5";
    var lbl = document.createElement("label");
    lbl.className = "text-xs text-slate-400";
    lbl.textContent = hint;
    var inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.step = step || "any";
    inp.placeholder = placeholder;
    inp.className = "w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
    inp.value = value != null ? String(value) : "";
    wrap.appendChild(lbl); wrap.appendChild(inp);
    return { wrap: wrap, inp: inp };
  }
  var minV = _numField("Min value", (data.minValueMinor != null ? _minorToMajor(data.minValueMinor, dec) : 0), "0");
  var maxV = _numField("Max value (blank=open)", (data.maxValueMinor != null ? _minorToMajor(data.maxValueMinor, dec) : ""), "Open");
  var pctF = _numField("% fee (e.g. 10)", (data.percentageFeeBps != null ? (data.percentageFeeBps / 100) : 0), "10");
  var floorF = _numField("Min fee (local)", (data.feeMinMinor != null ? _minorToMajor(data.feeMinMinor, dec) : 0), "1");
  var removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "text-red-400 hover:text-red-600 text-xs font-bold pb-1.5";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove band";
  removeBtn.addEventListener("click", function () { if (container.contains(row)) container.removeChild(row); });
  row.appendChild(minV.wrap); row.appendChild(maxV.wrap); row.appendChild(pctF.wrap); row.appendChild(floorF.wrap); row.appendChild(removeBtn);
  row._collectBand = function () {
    return {
      minValueMinor: _majorToMinor(minV.inp.value || "0", dec),
      maxValueMinor: maxV.inp.value.trim() === "" ? null : _majorToMinor(maxV.inp.value, dec),
      percentageFeeBps: Math.max(0, Math.round((Number(pctF.inp.value) || 0) * 100)),
      feeMinMinor: _majorToMinor(floorF.inp.value || "0", dec),
      status: "active"
    };
  };
  container.appendChild(row);
}

function renderCurrencyFeeEditor() {
  var entry = _ccyFeeWorking[_ccyFeeActive] || { enabled: true, decimals: _ccyFeeDecimals(_ccyFeeActive), fxToAudRate: (_ccyFeeActive === "aud" ? 1 : 0), tiers: [] };
  var dec = (typeof entry.decimals === "number") ? entry.decimals : _ccyFeeDecimals(_ccyFeeActive);
  var lbl = $("currency-fee-active-label"); if (lbl) lbl.textContent = _ccyFeeActive.toUpperCase();
  var unit = $("currency-fee-unit-label"); if (unit) unit.textContent = "major units" + (dec === 0 ? " (whole units, 0-decimal currency)" : " (e.g. 50 = 50.00)");
  var enabledBox = $("currency-fee-enabled"); if (enabledBox) enabledBox.checked = entry.enabled !== false;
  var fx = $("currency-fee-fx"); if (fx) fx.value = (entry.fxToAudRate != null ? String(entry.fxToAudRate) : "");
  var container = $("currency-fee-rows-editor");
  if (container) {
    container.textContent = "";
    var tiers = Array.isArray(entry.tiers) && entry.tiers.length ? entry.tiers : [{ minValueMinor: 0, maxValueMinor: null, percentageFeeBps: 1000, feeMinMinor: _majorToMinor(1, dec) }];
    tiers.forEach(function (t) { _makeCurrencyFeeRowEl(container, t, dec); });
  }
  var vr = $("currency-fee-validation-result"); if (vr) vr.classList.add("hidden");
}

function saveCurrentCurrencyEdits() {
  var container = $("currency-fee-rows-editor");
  if (!container) return;
  var dec = _ccyFeeDecimals(_ccyFeeActive);
  var bands = Array.from(container.children).map(function (r) { return typeof r._collectBand === "function" ? r._collectBand() : null; }).filter(Boolean);
  var enabledBox = $("currency-fee-enabled");
  var fx = $("currency-fee-fx");
  _ccyFeeWorking[_ccyFeeActive] = {
    enabled: enabledBox ? !!enabledBox.checked : true,
    decimals: dec,
    fxToAudRate: Number((fx && fx.value) || 0) || (_ccyFeeActive === "aud" ? 1 : 0),
    tiers: bands
  };
}

function onCurrencyFeeSelectChange() {
  var sel = $("currency-fee-select");
  if (!sel) return;
  saveCurrentCurrencyEdits();
  _ccyFeeActive = String(sel.value || "aud").toLowerCase();
  renderCurrencyFeeEditor();
}

function addCurrencyFee() {
  var codeInput = $("currency-fee-add-code");
  var code = String((codeInput && codeInput.value) || "").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) { window.tstsNotify("Enter a 3-letter ISO currency code.", "error"); return; }
  saveCurrentCurrencyEdits();
  var dec = _ccyFeeDecimals(code);
  if (!_ccyFeeWorking[code]) {
    _ccyFeeWorking[code] = {
      enabled: true, decimals: dec, fxToAudRate: 0,
      tiers: [{ minValueMinor: 0, maxValueMinor: null, percentageFeeBps: 1000, feeMinMinor: _majorToMinor(1, dec) }]
    };
  }
  _ccyFeeActive = code;
  if (codeInput) codeInput.value = "";
  renderCurrencyFees({ data: { currencies: _ccyFeeWorking, supported: _ccyFeeSupported, decimals: _ccyFeeDecimalsMap } });
}

function _currencyFeeResultEl() { return $("currency-fee-validation-result"); }

// Owner-approved 2026-08-03 (sir, Item 12): every fee-band validation code the backend
// can emit (the nine in pricing.js validateCurrencyConfig), said in plain English.
var __TIER_ERROR_COPY = {
  INVALID_TIER_RANGE: "a band ends at or below where it starts, or there are no bands at all.",
  INVALID_TIER_NEGATIVE_MIN: "a band starts below zero.",
  INVALID_TIER_BPS: "a percentage is outside 0 to 100.",
  INVALID_TIER_MIN: "a minimum fee is below zero.",
  INVALID_TIER_FIRST_NONZERO: "the first band must start at 0.",
  INVALID_TIER_OVERLAP: "two bands overlap. Each band must end where the next begins.",
  INVALID_TIER_GAP: "there is a gap between two bands. Each band must end where the next begins.",
  INVALID_TIER_OPEN_NOT_LAST: "only the last band can be open-ended.",
  INVALID_TIER_TOP_NOT_OPEN: "the last band must be open-ended, with no upper limit."
};
function __tierErrorSentence(code) {
  var c = String(code || "").toUpperCase();
  if (__TIER_ERROR_COPY[c]) return __TIER_ERROR_COPY[c];
  return "the bands could not be validated (" + c.toLowerCase().replace(/_/g, " ") + ").";
}

async function validateCurrencyFees() {
  saveCurrentCurrencyEdits();
  var resultEl = _currencyFeeResultEl();
  try {
    var res = await adminFetch("/api/admin/pricing/currencies/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currencies: _ccyFeeWorking })
    });
    var data = await res.json().catch(function () { return {}; });
    if (resultEl) resultEl.classList.remove("hidden");
    if (res.ok && data && data.ok === true) {
      if (resultEl) { resultEl.className = "text-xs rounded-xl px-3 py-2 mt-3 bg-emerald-50 text-emerald-700"; resultEl.textContent = "Valid. All currencies' bands are contiguous and well-formed."; }
      return true;
    }
    // Owner-approved 2026-08-03 (sir, Item 12): no pipe-chained raw codes. One readable
    // line per currency, each code mapped to a plain sentence, no em-dash.
    var ebc = (data && data.data && data.data.errorsByCurrency) || {};
    var ccys = Object.keys(ebc);
    if (resultEl) {
      resultEl.className = "text-xs rounded-xl px-3 py-2 mt-3 bg-red-50 text-red-700";
      resultEl.textContent = "";
      if (ccys.length) {
        resultEl.appendChild(window.tstsEl("p", { className: "font-bold mb-1", textContent: "These fee bands can't be published yet:" }));
        ccys.forEach(function (c) {
          var sentences = (Array.isArray(ebc[c]) ? ebc[c] : []).map(__tierErrorSentence);
          Array.from(new Set(sentences)).forEach(function (s) {
            resultEl.appendChild(window.tstsEl("p", { className: "mt-0.5", textContent: c.toUpperCase() + ": " + s }));
          });
        });
      } else {
        resultEl.textContent = "The fee bands could not be validated. Check each currency's rows and try again.";
      }
    }
    return false;
  } catch (e) {
    if (resultEl) { resultEl.classList.remove("hidden"); resultEl.className = "text-xs rounded-xl px-3 py-2 mt-3 bg-red-50 text-red-700"; resultEl.textContent = "Validation request failed."; }
    return false;
  }
}

async function publishCurrencyFees() {
  var ok = await validateCurrencyFees();
  if (!ok) return;
  var confirmed = await window.tstsConfirm("Publish per-currency platform fees? Applies to all new bookings from now (existing bookings unaffected).", { confirmText: "Publish" });
  if (!confirmed) return;
  try {
    var res = await adminFetch("/api/admin/pricing/currencies/publish", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currencies: _ccyFeeWorking })
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data && data.ok === true) {
      window.tstsNotify("Per-currency platform fees published.", "success");
      loadCurrencyFees().then(renderCurrencyFees).catch(function () {});
    } else {
      // Owner-approved 2026-08-03 (sir, Item 12): the publish failure explains itself
      // instead of echoing the backend's code.
      var pubMsg = (data && data.error === "INVALID_CURRENCY_TIERS")
        ? "The fees were not published because some bands are invalid. Run Validate to see exactly what to fix."
        : ((data && data.message) ? String(data.message) : "The fees could not be published. Please try again.");
      window.tstsNotify(pubMsg, "error");
    }
  } catch (e) { window.tstsNotify("The fees could not be published. Check your connection and try again.", "error"); }
}

// ──────────────────────────────────────────────────────────────────────────────
// REFUND WINDOW POLICY
// ──────────────────────────────────────────────────────────────────────────────
var _activeRefundRows = [];

async function loadRefundWindowPolicy() {
  var res = await adminFetch("/api/admin/pricing/refund-policy", { method: "GET" });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data || data.ok !== true) throw new Error("Failed to load refund policy");
  return data;
}

function renderRefundWindowPolicy(payload) {
  var root = (payload && typeof payload === "object") ? payload : {};
  var d = (root.data && typeof root.data === "object") ? root.data : root;
  var active = (d.active && typeof d.active === "object") ? d.active : {};
  var metaEl = $("refund-policy-version-meta");
  var tbody = $("refund-policy-table-body");
  if (metaEl) {
    var effFrom = active.effectiveFrom ? formatDateValue(active.effectiveFrom) : "—";
    metaEl.textContent = "Active policy, in effect from: " + effFrom;
  }
  if (tbody) {
    tbody.textContent = ""; // safety: clear without innerHTML
    var rows = Array.isArray(active.windows) ? active.windows : [];
    _activeRefundRows = rows.slice();
    if (rows.length === 0) {
      var emptyTr = document.createElement("tr");
      var emptyTd = document.createElement("td");
      emptyTd.colSpan = 6;
      emptyTd.className = "px-4 py-6 text-center text-slate-400 text-sm";
      emptyTd.textContent = "No active windows. Click Edit Refund Windows to define windows.";
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
    } else {
      rows.forEach(function (w, i) {
        var tr = document.createElement("tr");
        var refBps = w.refundPercentageBps != null ? w.refundPercentageBps : (w.refundPercentBps || 0);
        var refundPct = refBps / 100;  // e.g. 95.0
        var retainedPct = 100 - refundPct;  // e.g. 5.0
        var hostAllocRatePct = (w.hostAllocationBps || 0) / 100;  // % of retained, e.g. 50
        var hostAbsPct = retainedPct * hostAllocRatePct / 100;   // absolute %, e.g. 2.5
        var platformAbsPct = retainedPct - hostAbsPct;           // absolute %, e.g. 2.5
        function _fmt(n) { return (n % 1 === 0) ? String(n) : n.toFixed(1); }
        [
          String(i + 1),
          String(w.minHoursBeforeEvent || 0) + "h",
          (w.maxHoursBeforeEvent == null) ? "Open-ended" : String(w.maxHoursBeforeEvent) + "h",
          _fmt(refundPct) + "% guest",
          _fmt(retainedPct) + "% retained (auto)",
          _fmt(hostAllocRatePct) + "% of retained → host " + _fmt(hostAbsPct) + "% / platform " + _fmt(platformAbsPct) + "%"
        ].forEach(function (val) {
          var td = document.createElement("td");
          td.className = "px-4 py-3 text-slate-700 text-sm";
          td.textContent = val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
  }
}

function _makeRefundRowEl(container, data) {
  data = data || {};
  var row = document.createElement("div");
  row.className = "flex flex-wrap gap-2 items-end";
  function _numField(hint, value, placeholder) {
    var wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-0.5";
    var lbl = document.createElement("label");
    lbl.className = "text-xs text-slate-400";
    lbl.textContent = hint;
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.placeholder = placeholder;
    inp.className = "w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
    inp.value = value != null ? String(value) : "";
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return { wrap: wrap, inp: inp };
  }
  var minH = _numField("Min hours before event", data.minHoursBeforeEvent, "0");
  var maxH = _numField("Max hours (blank=open)", data.maxHoursBeforeEvent != null ? data.maxHoursBeforeEvent : "", "Open");
  // Backend may send refundPercentageBps or refundPercentBps, handle both.
  var _refBps = data.refundPercentageBps != null ? data.refundPercentageBps : (data.refundPercentBps != null ? data.refundPercentBps : null);
  var refPct = _numField("Guest refund % (0–100)", _refBps != null ? (_refBps / 100) : "", "0");
  var _hostAllocBps = data.hostAllocationBps != null ? data.hostAllocationBps : 0;
  var hostAlloc = _numField("Host alloc % of retained (0–100)", Math.round(_hostAllocBps / 100), "0");

  // Live preview: guest refund → retained → host compensation → platform retained
  var previewEl = document.createElement("div");
  previewEl.className = "text-xs text-slate-400 self-end pb-2 whitespace-nowrap";
  function _updatePreview() {
    var refP = Math.max(0, Math.min(100, parseFloat(refPct.inp.value || "0") || 0));
    var allocRateP = Math.max(0, Math.min(100, parseFloat(hostAlloc.inp.value || "0") || 0));
    var retainedP = 100 - refP;                       // absolute retained %
    var hostCompP = retainedP * allocRateP / 100;     // absolute host % = retained × rate
    var platformP = retainedP - hostCompP;            // absolute platform % = retained − host
    function _f(n) { return (n % 1 === 0) ? n.toFixed(0) : n.toFixed(1); }
    previewEl.textContent = "Guest " + _f(refP) + "% + Host " + _f(hostCompP) + "% + Platform " + _f(platformP) + "% = 100%";
  }
  refPct.inp.addEventListener("input", _updatePreview);
  hostAlloc.inp.addEventListener("input", _updatePreview);
  _updatePreview();

  var removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "text-red-400 hover:text-red-600 text-xs font-bold pb-1.5";
  removeBtn.textContent = "✕ Remove";
  removeBtn.addEventListener("click", function () { if (container.contains(row)) container.removeChild(row); });
  row.appendChild(minH.wrap);
  row.appendChild(maxH.wrap);
  row.appendChild(refPct.wrap);
  row.appendChild(hostAlloc.wrap);
  row.appendChild(previewEl);
  row.appendChild(removeBtn);
  row._collectWindow = function () {
    // Send as percentage integers, backend __ratioToBps multiplies by 100 to get bps.
    return {
      minHoursBeforeEvent: parseInt(minH.inp.value || "0", 10),
      maxHoursBeforeEvent: maxH.inp.value.trim() === "" ? null : parseInt(maxH.inp.value, 10),
      refundPercentageBps: parseFloat(refPct.inp.value || "0") || 0,
      hostAllocationBps: parseFloat(hostAlloc.inp.value || "0") || 0
    };
  };
  container.appendChild(row);
}

function initRefundEditor(activeWindows) {
  var container = $("refund-rows-editor");
  var editForm = $("refund-policy-edit-form");
  var editBtn = $("btn-edit-refund-policy");
  if (!container || !editForm || !editBtn) return;
  container.textContent = ""; // safety: clear without innerHTML
  var rows = Array.isArray(activeWindows) && activeWindows.length > 0
    ? activeWindows
    : [
        { minHoursBeforeEvent: 72, maxHoursBeforeEvent: null, refundPercentageBps: 9500, hostAllocationBps: 0 },
        { minHoursBeforeEvent: 48, maxHoursBeforeEvent: 72, refundPercentageBps: 7500, hostAllocationBps: 0 },
        { minHoursBeforeEvent: 24, maxHoursBeforeEvent: 48, refundPercentageBps: 5000, hostAllocationBps: 0 },
        { minHoursBeforeEvent: 0, maxHoursBeforeEvent: 24, refundPercentageBps: 0, hostAllocationBps: 0 }
      ];
  rows.forEach(function (w) {
    _makeRefundRowEl(container, {
      minHoursBeforeEvent: w.minHoursBeforeEvent != null ? w.minHoursBeforeEvent : 0,
      maxHoursBeforeEvent: w.maxHoursBeforeEvent != null ? w.maxHoursBeforeEvent : null,
      refundPercentageBps: w.refundPercentageBps != null ? w.refundPercentageBps : (w.refundPercentBps || 0),
      hostAllocationBps: w.hostAllocationBps != null ? w.hostAllocationBps : 0
    });
  });
  editForm.classList.remove("hidden");
  editBtn.classList.add("hidden");
  var vr = $("refund-validation-result");
  if (vr) vr.classList.add("hidden");
}

async function handleValidateRefund() {
  var container = $("refund-rows-editor");
  var resultEl = $("refund-validation-result");
  if (!container || !resultEl) return;
  var rows = Array.from(container.children).map(function (r) { return typeof r._collectWindow === "function" ? r._collectWindow() : null; }).filter(Boolean);
  try {
    var res = await adminFetch("/api/admin/pricing/refund-policy/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ windows: rows })
    });
    var data = await res.json().catch(function () { return {}; });
    resultEl.classList.remove("hidden");
    if (res.ok && data && data.ok === true) {
      resultEl.className = "text-xs rounded-xl px-3 py-2 bg-emerald-50 text-emerald-700";
      resultEl.textContent = "Validation passed, refund windows are valid.";
    } else {
      // Owner-approved 2026-08-04 (sir, Item 23): the Item 12 pattern. All three codes
      // the server's __validateRefundWindowRows can emit, said in plain English, one
      // readable line each. Unknown codes degrade readable, never the raw constant.
      var errs = (data && data.data && Array.isArray(data.data.errors)) ? data.data.errors : [];
      var WINDOW_ERROR_COPY = {
        INVALID_WINDOW_OVERLAP: "Two windows overlap. Each window must end where the next begins.",
        INVALID_WINDOW_GAP: "There is a gap between two windows. Each window must end where the next begins.",
        INVALID_WINDOW_RANGE: "A window's hours or refund percentage are out of range, or there are no windows at all."
      };
      resultEl.className = "text-xs rounded-xl px-3 py-2 bg-red-50 text-red-700";
      resultEl.textContent = "";
      resultEl.appendChild(window.tstsEl("p", { className: "font-bold mb-1", textContent: "These refund windows can't be published yet:" }));
      var sentences = errs.map(function (c) {
        var key = String(c || "").toUpperCase();
        if (WINDOW_ERROR_COPY[key]) return WINDOW_ERROR_COPY[key];
        var words = key.toLowerCase().replace(/_/g, " ");
        return words ? ("The windows could not be validated (" + words + ").") : "The windows could not be validated.";
      });
      if (!sentences.length) sentences = ["The refund windows could not be validated. Check each row and try again."];
      Array.from(new Set(sentences)).forEach(function (s) {
        resultEl.appendChild(window.tstsEl("p", { className: "mt-0.5", textContent: s }));
      });
    }
  } catch (e) {
    resultEl.classList.remove("hidden");
    resultEl.className = "text-xs rounded-xl px-3 py-2 bg-red-50 text-red-700";
    resultEl.textContent = "Validation request failed.";
  }
}

async function handlePublishRefund() {
  var container = $("refund-rows-editor");
  if (!container) return;
  var rows = Array.from(container.children).map(function (r) { return typeof r._collectWindow === "function" ? r._collectWindow() : null; }).filter(Boolean);
  // BUG-169 (2026-05-19): same preflight gate as handlePublishTiers.
  var __preflightOk = await __pricingPreflightValidate("/api/admin/pricing/refund-policy/validate", { windows: rows }, $("refund-validation-result"), "Validation passed, refund windows are valid.");
  if (!__preflightOk) return;
  var confirmed = await window.tstsConfirm("Publish new refund window policy? This will apply to all new bookings from this point forward. Existing bookings use their snapshot.", { confirmText: "Publish" });
  if (!confirmed) return;
  try {
    var res = await adminFetch("/api/admin/pricing/refund-policy/publish", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ windows: rows })
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data && data.ok === true) {
      window.tstsNotify("New refund window policy published.", "success");
      var ef = $("refund-policy-edit-form"); var eb = $("btn-edit-refund-policy");
      if (ef) ef.classList.add("hidden"); if (eb) eb.classList.remove("hidden");
      loadRefundWindowPolicy().then(renderRefundWindowPolicy).catch(function () {});
    } else {
      // Owner-approved 2026-08-04 (sir, Item 21): the backend's human sentence when it
      // sends one, otherwise a plain outcome. Never the raw code.
      window.tstsNotify((data && data.message) ? String(data.message) : "The refund policy was not published. Nothing changed for guests. Please try again.", "error");
    }
  } catch (e) { window.tstsNotify("The refund policy was not published. Nothing changed for guests. Please check your connection and try again.", "error"); }
}

let __adminWired = false;

// ─── LEGAL POLICIES ADMIN ──────────────────────────────────────────────────
let __legalCurrentType = "privacy";

function __legalEscapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

// Tiny safe Markdown renderer, supports headings, bold, italic, lists, links, paragraphs, hr.
function __legalMarkdownToHtml(md) {
  if (!md) return "";
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let para = [];
  let inList = false;
  let listType = null;

  function flushPara() {
    if (para.length === 0) return;
    let html = para.join(" ").trim();
    html = __legalEscapeHtml(html);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, text, href) {
      const safeHref = /^https?:\/\//i.test(href) ? href : "#";
      // BUG-174 (2026-05-19): noopener+noreferrer (codebase standard); the
      // legal-doc renderer must not leak Referer to external links.
      return '<a href="' + __legalEscapeHtml(safeHref) + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
    });
    out.push("<p>" + html + "</p>");
    para = [];
  }

  function closeList() {
    if (inList) {
      out.push(listType === "ol" ? "</ol>" : "</ul>");
      inList = false;
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === "") { flushPara(); closeList(); continue; }
    if (line === "---") { flushPara(); closeList(); out.push("<hr>"); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.+)$/))) {
      flushPara(); closeList();
      const lvl = m[1].length;
      const text = __legalEscapeHtml(m[2]).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      out.push("<h" + lvl + ">" + text + "</h" + lvl + ">");
      continue;
    }
    if ((m = line.match(/^[-*]\s+(.+)$/))) {
      flushPara();
      if (!inList || listType !== "ul") { closeList(); out.push("<ul>"); inList = true; listType = "ul"; }
      let item = __legalEscapeHtml(m[1]);
      item = item.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      item = item.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m2, t, h){ const sh=/^https?:\/\//i.test(h)?h:"#"; return '<a href="'+__legalEscapeHtml(sh)+'" target="_blank" rel="noopener noreferrer">'+t+"</a>"; }); // BUG-174 (2026-05-19): +noreferrer
      out.push("<li>" + item + "</li>");
      continue;
    }
    if ((m = line.match(/^\d+\.\s+(.+)$/))) {
      flushPara();
      if (!inList || listType !== "ol") { closeList(); out.push("<ol>"); inList = true; listType = "ol"; }
      let item = __legalEscapeHtml(m[1]);
      item = item.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      out.push("<li>" + item + "</li>");
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}
window.__tstsRenderLegalMarkdown = __legalMarkdownToHtml;

// POLICY-005 (2026-05-15): 7 admin-editable policy types.
const __LEGAL_VALID_TYPES = ["privacy", "terms", "cookies", "refund", "host_terms", "community_guidelines", "acceptable_use"];
function __legalSetType(type) {
  const t = String(type || "privacy").toLowerCase();
  __legalCurrentType = __LEGAL_VALID_TYPES.includes(t) ? t : "privacy";
  const active = "px-5 py-2 rounded-2xl bg-tsts-ink text-white font-semibold text-sm";
  const idle = "px-5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-600 font-semibold text-sm";
  __LEGAL_VALID_TYPES.forEach((tt) => {
    const btn = document.getElementById("legal-type-" + tt);
    if (btn) btn.className = (tt === __legalCurrentType) ? active : idle;
  });
  loadLegalCurrent();
  loadLegalHistory();
  const note = document.getElementById("legal-change-note");
  if (note) note.value = "";
  const eff = document.getElementById("legal-effective-date");
  if (eff) {
    eff.value = "";
    // Owner 2026-05-30 (date-picker rollout R3): clearing .value alone does NOT
    // refresh the Flatpickr alt-input — the visible chip would keep the stale
    // date. Call the picker's clear() so source + visible reset together.
    if (eff._flatpickr && typeof eff._flatpickr.clear === "function") {
      try { eff._flatpickr.clear(); } catch (_e) { void _e; }
    }
  }
  const status = document.getElementById("legal-status-msg");
  if (status) { status.textContent = ""; status.className = "mt-3 text-sm"; }
  const diffPane = document.getElementById("legal-diff-pane");
  if (diffPane) { diffPane.classList.add("hidden"); diffPane.textContent = ""; }
  // Cache currently-published content for diff toggle.
  __legalPublishedCache = "";
}
var __legalPublishedCache = "";

async function loadLegalCurrent() {
  try {
    const path = "/api/legal/" + __legalCurrentType;
    const res = await fetch((window.__TSTS_RUNTIME__ ? window.__TSTS_RUNTIME__.apiBase : "") + path);
    const meta = document.getElementById("legal-current-meta");
    if (res.status === 404) {
      if (meta) meta.textContent = "No version of this policy is published yet. Save a draft and publish it to go live.";
      return;
    }
    const json = await res.json();
    const data = (json && json.data) || {};
    if (meta) {
      // POLICY-005 (2026-05-15): Show version + effective + published times.
      const v = data.version || "(unknown)";
      const __legalWhen = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
      const pub = data.publishedAt ? new Date(data.publishedAt).toLocaleString("en-AU", __legalWhen) : "—";
      const eff = data.effectiveDate ? new Date(data.effectiveDate).toLocaleString("en-AU", __legalWhen) : "—";
      meta.textContent = "Version " + v + " · effective " + eff + " (published " + pub + ")";
    }
  } catch (e) {
    const meta = document.getElementById("legal-current-meta");
    if (meta) meta.textContent = "Could not load currently published version.";
  }
}

async function loadPublishedIntoEditor() {
  try {
    const path = "/api/legal/" + __legalCurrentType;
    const res = await fetch((window.__TSTS_RUNTIME__ ? window.__TSTS_RUNTIME__.apiBase : "") + path);
    const json = await res.json();
    const data = (json && json.data) || {};
    const content = data.content || "";
    const editor = document.getElementById("legal-editor");
    if (editor) {
      editor.value = content;
      __legalRenderPreview();
    }
    __legalPublishedCache = content;
  } catch (e) {
    window.tstsNotify("Could not load currently published version.", "error");
  }
}

// POLICY-005 (2026-05-15): Upload a .md / .txt file straight into the editor
// so admins do not have to paste from a text editor. File is read fully then
// the editor is populated; nothing is uploaded to the server until the admin
// presses Save Draft or Publish.
function __legalHandleFileUpload(ev) {
  try {
    const file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 200000) {
      window.tstsNotify("File too large (max 200 KB).", "error");
      ev.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = String((e && e.target && e.target.result) || "");
      const editor = document.getElementById("legal-editor");
      if (editor) { editor.value = text; __legalRenderPreview(); }
      const status = document.getElementById("legal-status-msg");
      if (status) {
        status.textContent = "Loaded " + file.name + " (" + (text.length / 1000).toFixed(1) + " KB). Review the preview, then Save Draft or Publish.";
        status.className = "mt-3 text-sm text-slate-700";
      }
    };
    reader.onerror = function () { window.tstsNotify("Could not read that file.", "error"); };
    reader.readAsText(file);
  } catch (_err) {
    window.tstsNotify("Could not read that file.", "error");
  } finally {
    if (ev && ev.target) ev.target.value = "";
  }
}

// POLICY-005 (2026-05-15): Minimal line-by-line diff between the draft text in
// the editor and the currently-published version. Pure-text diff, no library
// dependency, no innerHTML — every line is a textContent line in a <pre>-like
// wrapper.
function __legalToggleDiff() {
  const pane = document.getElementById("legal-diff-pane");
  const editor = document.getElementById("legal-editor");
  if (!pane || !editor) return;
  if (!pane.classList.contains("hidden")) {
    pane.classList.add("hidden");
    pane.textContent = "";
    return;
  }
  const draftLines = String(editor.value || "").split(/\r?\n/);
  const publishedLines = String(__legalPublishedCache || "").split(/\r?\n/);
  if (!__legalPublishedCache) {
    pane.textContent = "Load the currently published version first (button above) so we can compare it with your draft.";
    pane.classList.remove("hidden");
    return;
  }
  pane.textContent = "";
  pane.classList.remove("hidden");
  const max = Math.max(draftLines.length, publishedLines.length);
  let changes = 0;
  for (let i = 0; i < max; i++) {
    const a = publishedLines[i];
    const b = draftLines[i];
    if (a === b) continue;
    changes += 1;
    if (typeof a === "string") {
      const minus = document.createElement("div");
      minus.style.color = "#9f1239"; // rose-800
      minus.textContent = "- " + a;
      pane.appendChild(minus);
    }
    if (typeof b === "string") {
      const plus = document.createElement("div");
      plus.style.color = "#065f46"; // emerald-800
      plus.textContent = "+ " + b;
      pane.appendChild(plus);
    }
  }
  if (changes === 0) {
    pane.textContent = "No changes. Your draft matches the currently published version.";
  } else {
    const header = document.createElement("div");
    header.style.color = "#334155";
    header.style.marginBottom = "8px";
    header.textContent = changes + " line" + (changes === 1 ? "" : "s") + " differ (minus = published, plus = draft):";
    pane.insertBefore(header, pane.firstChild);
  }
}

// BUG-083 (2026-05-15): allowlist DOM sanitizer for the legal-preview render.
// Defense-in-depth: even though __legalMarkdownToHtml escapes its input via
// __legalEscapeHtml() before composing HTML strings, the prior innerHTML write
// was a foot-gun — a single missed escape in a future edit would have made the
// admin dashboard an XSS surface. We now parse + allowlist + appendChild — never
// innerHTML on user-controlled content again.
var __LEGAL_ALLOWED_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "UL", "OL", "LI",
  "STRONG", "EM",
  "HR", "BR",
  "A"
]);
function __legalSanitizeNode(node) {
  // Strip disallowed elements but preserve their textContent (graceful degradation).
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  var tag = node.tagName;
  if (!__LEGAL_ALLOWED_TAGS.has(tag)) {
    // Wrap any disallowed element's text content into a plain text node so meaning is preserved.
    return document.createTextNode(node.textContent || "");
  }
  var clean = document.createElement(tag.toLowerCase());
  if (tag === "A") {
    // Strict href allowlist: http(s) only. Strip everything else (javascript:, data:, file:, etc.).
    var rawHref = String(node.getAttribute("href") || "");
    if (/^https?:\/\//i.test(rawHref)) {
      clean.setAttribute("href", rawHref);
      clean.setAttribute("target", "_blank");
      clean.setAttribute("rel", "noopener noreferrer");
    } else {
      // Drop the anchor wrapper entirely on bad href — render as plain text.
      return document.createTextNode(node.textContent || "");
    }
  }
  // Recurse into children with the same allowlist.
  for (var i = 0; i < node.childNodes.length; i++) {
    var childClean = __legalSanitizeNode(node.childNodes[i]);
    if (childClean) clean.appendChild(childClean);
  }
  return clean;
}
function __legalSanitizeHtmlToFragment(htmlString) {
  var frag = document.createDocumentFragment();
  if (!htmlString) return frag;
  // Use DOMParser instead of innerHTML — DOMParser does NOT execute <script>/<img onerror>
  // during parse, so the parse stage itself is safe even before sanitization runs.
  try {
    var parsed = new DOMParser().parseFromString("<!DOCTYPE html><body>" + htmlString + "</body>", "text/html");
    var body = parsed && parsed.body;
    if (!body) return frag;
    for (var i = 0; i < body.childNodes.length; i++) {
      var clean = __legalSanitizeNode(body.childNodes[i]);
      if (clean) frag.appendChild(clean);
    }
  } catch (_parseErr) {
    // Fall back to plain-text rendering — defense in depth.
    frag.appendChild(document.createTextNode(String(htmlString)));
  }
  return frag;
}

function __legalRenderPreview() {
  const editor = document.getElementById("legal-editor");
  const preview = document.getElementById("legal-preview");
  if (!editor || !preview) return;
  // BUG-083 fix: never assign innerHTML on user-editable content. Build via DOMParser +
  // allowlist sanitization + appendChild.
  preview.textContent = "";  // clear without innerHTML
  var sanitizedFragment = __legalSanitizeHtmlToFragment(__legalMarkdownToHtml(editor.value));
  preview.appendChild(sanitizedFragment);
}

async function loadLegalHistory() {
  const list = document.getElementById("legal-history-list");
  if (!list) return;
  list.textContent = "Loading…"; // safety: plain text, no innerHTML
  try {
    const res = await adminFetch("/api/admin/legal/" + __legalCurrentType + "/versions", { method: "GET" });
    if (!res.ok) throw new Error("versions http " + res.status);
    const raw = await res.json();
    const versions = (raw && raw.data && raw.data.versions) || [];
    if (versions.length === 0) {
      list.replaceChildren(window.tstsEl("p", { className: "text-slate-500" }, ["No versions yet."]));
      return;
    }
    list.textContent = ""; // safety: clear without innerHTML
    versions.forEach((v) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50";
      const left = document.createElement("div");
      const ver = document.createElement("p");
      ver.className = "font-bold text-tsts-ink text-sm";
      ver.textContent = v.version + (v.isPublished ? " · LIVE" : " · draft");
      const created = document.createElement("p");
      created.className = "text-xs text-slate-500 mt-1";
      const cdate = v.createdAt ? new Date(v.createdAt).toLocaleString("en-AU") : "";
      const pdate = v.publishedAt ? " · published " + new Date(v.publishedAt).toLocaleString("en-AU") : "";
      created.textContent = "created " + cdate + pdate + (v.changeNote ? " · " + v.changeNote : "");
      left.appendChild(ver); left.appendChild(created);
      const right = document.createElement("div");
      right.className = "flex gap-2";
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold hover:bg-slate-100";
      loadBtn.textContent = "Load into editor";
      loadBtn.onclick = () => loadVersionIntoEditor(v.id);
      right.appendChild(loadBtn);
      if (!v.isPublished) {
        const pubBtn = document.createElement("button");
        pubBtn.type = "button";
        pubBtn.className = "px-3 py-1.5 rounded-lg tsts-btn-primary text-xs font-semibold";
        pubBtn.textContent = "Publish";
        pubBtn.onclick = () => publishVersionById(v.id);
        right.appendChild(pubBtn);
      }
      row.appendChild(left); row.appendChild(right);
      list.appendChild(row);
    });
  } catch (e) {
    list.replaceChildren(window.tstsEl("p", { className: "text-rose-600" }, ["Failed to load history."]));
  }
}

async function loadVersionIntoEditor(id) {
  try {
    const res = await adminFetch("/api/admin/legal/" + __legalCurrentType + "/version/" + encodeURIComponent(id), { method: "GET" });
    if (!res.ok) throw new Error("version http " + res.status);
    const raw = await res.json();
    const data = (raw && raw.data) || {};
    const editor = document.getElementById("legal-editor");
    if (editor) { editor.value = data.contentMarkdown || ""; __legalRenderPreview(); }
    window.tstsNotify("Loaded version " + (data.version || ""), "success");
  } catch (e) {
    window.tstsNotify("Could not load that version.", "error");
  }
}

async function saveLegalDraft() {
  const editor = document.getElementById("legal-editor");
  const note = document.getElementById("legal-change-note");
  const effInput = document.getElementById("legal-effective-date");
  const status = document.getElementById("legal-status-msg");
  if (!editor) return;
  const content = editor.value || "";
  if (content.trim().length < 50) {
    if (status) { status.textContent = "Draft must be at least 50 characters."; status.className = "mt-3 text-sm text-rose-600"; }
    return;
  }
  // POLICY-005 (2026-05-15): If admin filled the datetime-local field, send it
  // as ISO so the backend can store the scheduled effectiveDate. Browser
  // datetime-local omits the seconds + timezone — appending ":00" + ISO
  // through Date() gives the local-time interpretation we want.
  let effectiveIso = "";
  if (effInput && effInput.value) {
    const parsed = new Date(effInput.value);
    if (!Number.isNaN(parsed.getTime())) effectiveIso = parsed.toISOString();
  }
  const body = { contentMarkdown: content, changeNote: (note && note.value) || "" };
  if (effectiveIso) body.effectiveDate = effectiveIso;
  try {
    const res = await adminFetch("/api/admin/legal/" + __legalCurrentType, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const raw = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      if (status) { status.textContent = (raw && raw.message) ? String(raw.message) : "The draft was not saved. Please try again."; status.className = "mt-3 text-sm text-rose-600"; }
      return;
    }
    const data = (raw && raw.data) || {};
    if (status) {
      const eff = effectiveIso ? " (effective " + new Date(effectiveIso).toLocaleString("en-AU") + ")" : "";
      status.textContent = "Draft " + (data.version || "") + " saved" + eff + ". Use Publish on the history row when ready.";
      status.className = "mt-3 text-sm text-emerald-700";
    }
    loadLegalHistory();
    return data;
  } catch (e) {
    if (status) { status.textContent = "The draft was not saved. Please try again."; status.className = "mt-3 text-sm text-rose-600"; }
  }
}

async function publishVersionById(id) {
  const ok = await window.tstsConfirm("Publish this version live? It replaces the current published policy on website + mobile.");
  if (!ok) return;
  try {
    // BUG-170 (2026-05-19): adminFetch -> authFetch RESOLVES on 4xx/5xx, so an
    // unconditional success notify made a FAILED publish look published — the
    // admin believed ToS/Privacy was live on website + mobile when it was NOT.
    // Mirror the canonical saveLegalDraft gate: assert HTTP res.ok AND the
    // envelope's ok===true before announcing "Published." and reloading.
    const res = await adminFetch("/api/admin/legal/" + __legalCurrentType + "/publish/" + encodeURIComponent(id), { method: "POST" });
    if (!res.ok) throw new Error("publish http " + res.status);
    const raw = await res.json();
    if (!raw || raw.ok !== true) throw new Error((raw && raw.error) || "publish rejected");
    window.tstsNotify("Published.", "success");
    loadLegalCurrent();
    loadLegalHistory();
  } catch (e) {
    // Owner-approved 2026-08-04 (sir, Item 21): outcome in words, never exception text.
    void e;
    window.tstsNotify("The policy was not published. The live version is unchanged. Please try again.", "error");
  }
}

async function saveAndPublishLegal() {
  const ok = await window.tstsConfirm("This will save the current text as a new version AND publish it live on the website and mobile app. Continue?");
  if (!ok) return;
  const draft = await saveLegalDraft();
  if (draft && draft.id) {
    try {
      // BUG-170 (2026-05-19): same false-success defect as publishVersionById —
      // a non-2xx publish previously still printed the green "live on website +
      // mobile" status. Gate on res.ok AND envelope ok===true.
      const res = await adminFetch("/api/admin/legal/" + __legalCurrentType + "/publish/" + encodeURIComponent(draft.id), { method: "POST" });
      if (!res.ok) throw new Error("publish http " + res.status);
      const raw = await res.json();
      if (!raw || raw.ok !== true) throw new Error((raw && raw.error) || "publish rejected");
      const status = document.getElementById("legal-status-msg");
      if (status) { status.textContent = "Published version " + draft.version + " live on website + mobile."; status.className = "mt-3 text-sm text-emerald-700"; }
      loadLegalCurrent();
      loadLegalHistory();
    } catch (e) {
      // Owner-approved 2026-08-04 (sir, Item 21): what happened and where things stand,
      // never developer sequencing language or exception text.
      void e;
      window.tstsNotify("The policy was not published. Your draft is saved, and the live version is unchanged. Please try again.", "error");
    }
  }
}

function wireLegalAdminEvents() {
  // POLICY-005 (2026-05-15): Wire all 7 type buttons + file upload + diff.
  __LEGAL_VALID_TYPES.forEach((tt) => {
    const btn = document.getElementById("legal-type-" + tt);
    if (btn) btn.addEventListener("click", () => __legalSetType(tt));
  });
  const editor = document.getElementById("legal-editor");
  const loadPub = document.getElementById("legal-load-published");
  const uploadInput = document.getElementById("legal-upload-file");
  const saveBtn = document.getElementById("legal-save-draft");
  const pubBtn = document.getElementById("legal-publish");
  const diffBtn = document.getElementById("legal-diff-toggle");
  const refreshHist = document.getElementById("legal-refresh-history");
  if (editor) editor.addEventListener("input", __legalRenderPreview);
  if (loadPub) loadPub.addEventListener("click", () => loadPublishedIntoEditor());
  if (uploadInput) uploadInput.addEventListener("change", __legalHandleFileUpload);
  if (saveBtn) saveBtn.addEventListener("click", () => saveLegalDraft());
  if (pubBtn) pubBtn.addEventListener("click", () => saveAndPublishLegal());
  if (diffBtn) diffBtn.addEventListener("click", __legalToggleDiff);
  if (refreshHist) refreshHist.addEventListener("click", () => loadLegalHistory());
}

function wireAdminEvents() {
  if (__adminWired) return;
  __adminWired = true;

  const tabDashboard = $("tab-dashboard");
  const tabListings = $("tab-listings");
  const tabPricing = $("tab-pricing");
  const tabVerification = $("tab-verification");
  const tabActionItems = $("tab-action-items");
  const tabUsers = $("tab-users");
  const tabCoupons = $("tab-coupons");
  const tabModeration = $("tab-moderation");
  const tabPrivateRequests = $("tab-private-requests");
  const tabIncidents = $("tab-incidents");
  const tabFeesCharges = $("tab-fees-charges");
  const tabAudit = $("tab-audit");
  const refreshListings = $("btn-refresh-listings");
  const refreshVerificationPolicy = $("btn-refresh-verification-policy");
  const refreshMarketingStatus = $("btn-refresh-marketing-status");
  const btnMarketingEnable = $("btn-marketing-enable");
  const btnMarketingPause = $("btn-marketing-pause");
  const saveVerificationPolicyBtn = $("btn-save-verification-policy");
  const refreshHostVerifications = $("btn-refresh-host-verifications");
  const refreshEventVerifications = $("btn-refresh-event-verifications");
  const refreshShortfallMonitor = $("btn-refresh-shortfall-monitor");
  const refreshActionItems = $("btn-refresh-action-items");
  const actionItemsStatusFilter = $("action-items-status-filter");
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

  // Dashboard stat tiles → navigate to relevant tab on click
  var statsTiles = $("stats-tiles");
  if (statsTiles) {
    statsTiles.addEventListener("click", function (e) {
      var tile = e.target.closest("[data-nav-tab]");
      if (tile) switchTab(tile.getAttribute("data-nav-tab"));
    });
    statsTiles.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        var tile = e.target.closest("[data-nav-tab]");
        if (tile) { e.preventDefault(); switchTab(tile.getAttribute("data-nav-tab")); }
      }
    });
  }

  const tabReviewQueue = $("tab-review-queue");
  if (tabReviewQueue) tabReviewQueue.addEventListener("click", () => switchTab("review-queue"));
  const refreshReviewQueueBtn = $("btn-refresh-review-queue");
  if (refreshReviewQueueBtn) refreshReviewQueueBtn.addEventListener("click", () => refreshReviewQueueView());
  const reviewQueueEmptyCta = $("review-queue-empty-cta");
  if (reviewQueueEmptyCta) reviewQueueEmptyCta.addEventListener("click", () => switchTab("listings"));
  const reviewQueueErrorCta = $("review-queue-error-cta");
  if (reviewQueueErrorCta) reviewQueueErrorCta.addEventListener("click", () => refreshReviewQueueView());
  // The count is fetched once on first paint, so the number is right on the side menu from the
  // dashboard onwards and an administrator never has to open the queue to learn there is work in it.
  refreshReviewQueueBadge().catch(function () { return 0; });

  if (tabDashboard) tabDashboard.addEventListener("click", () => switchTab("dashboard"));
  if (tabListings) tabListings.addEventListener("click", () => switchTab("listings"));
  if (tabPricing) tabPricing.addEventListener("click", () => switchTab("pricing"));
  if (tabVerification) tabVerification.addEventListener("click", () => switchTab("verification"));
  if (tabActionItems) tabActionItems.addEventListener("click", () => switchTab("action-items"));
  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (tabCoupons) tabCoupons.addEventListener("click", () => switchTab("coupons"));
  if (tabModeration) tabModeration.addEventListener("click", () => switchTab("moderation"));
  if (tabPrivateRequests) tabPrivateRequests.addEventListener("click", () => switchTab("private-requests"));
  if (tabIncidents) tabIncidents.addEventListener("click", () => switchTab("incidents"));
  if (tabFeesCharges) tabFeesCharges.addEventListener("click", () => switchTab("fees-charges"));
  if (tabAudit) tabAudit.addEventListener("click", () => switchTab("audit"));
  const tabLegal = document.getElementById("tab-legal");
  if (tabLegal) tabLegal.addEventListener("click", () => switchTab("legal"));
  const tabTaxonomies = document.getElementById("tab-taxonomies");
  if (tabTaxonomies) tabTaxonomies.addEventListener("click", () => switchTab("taxonomies"));
  const taxonomiesRefreshBtn = document.getElementById("taxonomies-refresh");
  if (taxonomiesRefreshBtn) taxonomiesRefreshBtn.addEventListener("click", () => loadTaxonomies().catch(() => window.tstsNotify("Failed to refresh taxonomies.", "error")));
  if (refreshListings) refreshListings.addEventListener("click", () => loadExperiences().then(renderExperiences).catch(function () { window.tstsNotify("Failed to refresh listings.", "error"); renderExperiences([]); }));
  if (refreshVerificationPolicy) refreshVerificationPolicy.addEventListener("click", () => refreshVerificationViews().catch(function () { window.tstsNotify("Failed to refresh verification policy.", "error"); }));
  if (refreshMarketingStatus) refreshMarketingStatus.addEventListener("click", () => loadMarketingEmailStatus().then(renderMarketingEmailStatus).catch(function () { window.tstsNotify("Failed to refresh marketing email status.", "error"); }));
  if (btnMarketingEnable) btnMarketingEnable.addEventListener("click", () => setMarketingEmailEnabled(true));
  if (btnMarketingPause) btnMarketingPause.addEventListener("click", () => setMarketingEmailEnabled(false));
  if (saveVerificationPolicyBtn) saveVerificationPolicyBtn.addEventListener("click", () => handleSaveVerificationPolicy());

  // Approval Threshold (Pricing & Policies tab)
  var approvalThresholdInput = $("experience-approval-threshold");
  var approvalThresholdMeta = $("approval-threshold-meta");
  var refreshApprovalThresholdBtn = $("btn-refresh-approval-threshold");
  var saveApprovalThresholdBtn = $("btn-save-approval-threshold");
  // BUG-173 (2026-05-19): track the last-known-good threshold so a failed
  // client validation restores the input instead of leaving the bad value
  // sitting in the field (where it could be re-submitted blindly).
  var __lastGoodThreshold = null;
  function renderApprovalThresholdMeta(d) {
    if (!approvalThresholdMeta) return;
    approvalThresholdMeta.textContent = __adminUpdatedMetaLine(d);
  }
  function refreshApprovalThreshold() {
    return loadApprovalThreshold().then(function (d) {
      if (approvalThresholdInput && d && Number.isFinite(Number(d.thresholdDollars))) {
        approvalThresholdInput.value = String(d.thresholdDollars);
        __lastGoodThreshold = Number(d.thresholdDollars);
      }
      renderApprovalThresholdMeta(d);
    });
  }
  if (refreshApprovalThresholdBtn) {
    refreshApprovalThresholdBtn.addEventListener("click", function () {
      refreshApprovalThreshold().catch(function (e) { window.tstsNotify((e && e.message) || "Failed to load approval threshold.", "error"); });
    });
  }
  if (saveApprovalThresholdBtn) {
    saveApprovalThresholdBtn.addEventListener("click", function () {
      // BUG-175 (2026-05-19): Number() accepted hex ("0x10"→16), scientific
      // ("1e3"→1000), whitespace, and "" (→0, silently saved). Strict-parse
      // the trimmed raw string with a decimal regex (the field is dollars, so
      // up to 2 decimal places is valid — NOT integer-only, contra the audit's
      // generic "isInteger" note; the live copy + accepted 12.5 confirm
      // decimals). Anything not matching → NaN → the existing guard rejects it
      // and the BUG-173 restore fires.
      var raw = String((approvalThresholdInput && approvalThresholdInput.value) || "").trim();
      var v = /^\d{1,4}(\.\d{1,2})?$/.test(raw) ? parseFloat(raw) : NaN;
      if (!Number.isFinite(v) || v < 0 || v > 1000) {
        window.tstsNotify("Threshold must be a whole or decimal number between 0 and 1000.", "error");
        // BUG-173 (2026-05-19): restore the last-known-good value so the
        // invalid entry doesn't linger in the field.
        if (approvalThresholdInput && __lastGoodThreshold !== null) {
          approvalThresholdInput.value = String(__lastGoodThreshold);
        }
        return;
      }
      saveApprovalThreshold(v).then(function (d) {
        __lastGoodThreshold = v;
        renderApprovalThresholdMeta(d);
        window.tstsNotify("Approval threshold saved.", "success");
      }).catch(function (e) {
        window.tstsNotify((e && e.message) || "Failed to save approval threshold.", "error");
      });
    });
  }

  // ── Owner 2026-06-12: Host Settlement & Recovery knobs (payout hold + 2 fee %s) ──
  // Generic numeric-config wiring (whole numbers only; last-known-good restore on bad input).
  function __wireNumericConfig(opts) {
    var inputEl = document.getElementById(opts.inputId);
    var metaEl = document.getElementById(opts.metaId);
    var saveBtn = document.getElementById(opts.saveId);
    var lastGood = null;
    function renderMeta(d) {
      if (!metaEl) return;
      metaEl.textContent = __adminUpdatedMetaLine(d);
    }
    function load() {
      return adminFetch(opts.endpoint, { method: "GET" }).then(function (res) {
        return __safeJsonForAdmin(res).then(function (data) {
          if (!res.ok || !data || data.ok !== true) throw new Error((data && data.message) || ("Failed to load " + opts.label));
          var d = data.data || {};
          var val = Number(d[opts.field]);
          if (inputEl && Number.isFinite(val)) { inputEl.value = String(val); lastGood = val; }
          renderMeta(d);
          return d;
        });
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var raw = String((inputEl && inputEl.value) || "").trim();
        var v = /^\d{1,3}$/.test(raw) ? parseInt(raw, 10) : NaN; // whole numbers only (hours + %)
        if (!Number.isFinite(v) || v < opts.min || v > opts.max) {
          window.tstsNotify(opts.label + " must be a whole number between " + opts.min + " and " + opts.max + ".", "error");
          if (inputEl && lastGood !== null) inputEl.value = String(lastGood);
          return;
        }
        var body = {}; body[opts.field] = v;
        adminFetch(opts.endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (res) {
          return __safeJsonForAdmin(res).then(function (data) {
            if (!res.ok || !data || data.ok !== true) throw new Error((data && data.message) || ("Failed to save " + opts.label));
            lastGood = v; renderMeta(data.data || {});
            window.tstsNotify(opts.label + " saved.", "success");
          });
        }).catch(function (e) { window.tstsNotify((e && e.message) || ("Failed to save " + opts.label), "error"); });
      });
    }
    return load;
  }
  var __loadPayoutHold = __wireNumericConfig({ endpoint: "/api/admin/platform-config/payout-hold-hours", field: "payoutHoldHours", inputId: "payout-hold-hours", saveId: "btn-save-payout-hold", metaId: "payout-hold-meta", label: "Payout hold", min: 1, max: 168 });
  var __loadRecoveryPct = __wireNumericConfig({ endpoint: "/api/admin/platform-config/host-cancel-recovery-percent", field: "hostCancelRecoveryPercent", inputId: "host-cancel-recovery-percent", saveId: "btn-save-cancel-recovery", metaId: "cancel-recovery-meta", label: "Host-cancel recovery", min: 0, max: 100 });
  var __loadShortfallFee = __wireNumericConfig({ endpoint: "/api/admin/platform-config/shortfall-processing-fee-percent", field: "shortfallProcessingFeePercent", inputId: "shortfall-fee-percent", saveId: "btn-save-shortfall-fee", metaId: "shortfall-fee-meta", label: "Shortfall processing fee", min: 0, max: 100 });
  // WALK-P776-1 fix (2026-09-15): the backend admin write path for this key did not exist at all;
  // added alongside its 3 siblings above (server.js). Wired the same way as they already are.
  var __loadShortfallStuckDebtWindow = __wireNumericConfig({ endpoint: "/api/admin/platform-config/shortfall-stuck-debt-window-days", field: "shortfallStuckDebtWindowDays", inputId: "shortfall-stuck-debt-window-days", saveId: "btn-save-shortfall-stuck-debt-window", metaId: "shortfall-stuck-debt-window-meta", label: "Stuck-debt collection window", min: 1, max: 365 });
  var __refreshHostSettlementBtn = document.getElementById("btn-refresh-host-settlement");
  function __loadHostSettlementAll() {
    return Promise.all([__loadPayoutHold(), __loadRecoveryPct(), __loadShortfallFee(), __loadShortfallStuckDebtWindow()]);
  }
  if (__refreshHostSettlementBtn) {
    __refreshHostSettlementBtn.addEventListener("click", function () {
      __loadHostSettlementAll().catch(function (e) { window.tstsNotify((e && e.message) || "Failed to load settlement settings.", "error"); });
    });
  }
  __loadHostSettlementAll().catch(function () { return null; }); // initial populate

  // Email Diagnostics
  var diagToInput = $("diagnostic-test-email-to");
  var sendTestEmailBtn = $("btn-send-test-email");
  var diagResultEl = $("diagnostic-test-email-result");
  function renderDiagnosticResult(payload, isError) {
    if (!diagResultEl) return;
    diagResultEl.classList.remove("hidden", "border-red-200", "bg-red-50", "text-red-700", "border-emerald-200", "bg-emerald-50", "text-emerald-700");
    if (isError) {
      diagResultEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    } else {
      diagResultEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    }
    // Owner-approved 2026-08-04 (sir, Item 22): outcomes in sentences. The provider's
    // machine id sits behind the Items 14/16 copy-reference convention; raw provider
    // error text never reaches the screen.
    diagResultEl.textContent = "";
    var p = (payload && typeof payload === "object") ? payload : {};
    var sentence;
    if (p.delivered === true) {
      sentence = "The test email was delivered to " + String(p.to || "the address") + ".";
      var dt = p.sentAt ? new Date(p.sentAt) : null;
      if (dt && !isNaN(dt.getTime())) {
        sentence += " Sent " + dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
          + " at " + dt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) + ".";
      }
    } else {
      sentence = "The test email could not be sent" + (p.to ? (" to " + String(p.to)) : "")
        + ". Check the address and the email settings, then try again.";
    }
    diagResultEl.appendChild(window.tstsEl("p", { textContent: sentence }));
    if (p.providerMessageId) {
      diagResultEl.appendChild(window.tstsEl("div", { className: "mt-2" }, [__adminCopyRefButton("Copy delivery reference", p.providerMessageId)]));
    }
  }
  if (sendTestEmailBtn) {
    sendTestEmailBtn.addEventListener("click", function () {
      var to = String((diagToInput && diagToInput.value) || "").trim();
      if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        window.tstsNotify("Enter a valid email address to test.", "error");
        return;
      }
      sendTestEmailBtn.disabled = true;
      sendDiagnosticTestEmail(to).then(function (d) {
        renderDiagnosticResult(d, !d.delivered);
      }).catch(function (e) {
        // Never the thrown text: the panel states the outcome itself.
        void e;
        renderDiagnosticResult({ delivered: false, to: to }, true);
      }).finally(function () {
        sendTestEmailBtn.disabled = false;
      });
    });
  }
  if (refreshHostVerifications) refreshHostVerifications.addEventListener("click", () => loadHostVerifications("all").then(renderHostVerifications).catch(function () { window.tstsNotify("Failed to refresh host verifications.", "error"); renderHostVerifications({ data: { items: [] } }); }));
  if (refreshEventVerifications) refreshEventVerifications.addEventListener("click", () => loadEventVerifications("all").then(renderEventVerifications).catch(function () { window.tstsNotify("Failed to refresh event verifications.", "error"); renderEventVerifications({ data: { items: [] } }); }));
  if (refreshShortfallMonitor) refreshShortfallMonitor.addEventListener("click", () => refreshShortfallViews().catch(function () { window.tstsNotify("Failed to refresh shortfall monitor.", "error"); }));

  // (Legacy single-currency tier-policy button wiring removed — superseded by the
  // Per-Currency Platform Fees wiring below.)

  // Per-Currency Platform Fees
  var refreshCcyFeesBtn = $("btn-refresh-currency-fees");
  var ccyFeeSelect = $("currency-fee-select");
  var ccyFeeAddBtn = $("btn-currency-fee-add");
  var ccyFeeAddRowBtn = $("btn-currency-fee-add-row");
  var ccyFeeValidateBtn = $("btn-currency-fee-validate");
  var ccyFeePublishBtn = $("btn-currency-fee-publish");
  if (refreshCcyFeesBtn) refreshCcyFeesBtn.addEventListener("click", function () { loadCurrencyFees().then(renderCurrencyFees).catch(function () { window.tstsNotify("Failed to refresh currency fees.", "error"); }); });
  if (ccyFeeSelect) ccyFeeSelect.addEventListener("change", onCurrencyFeeSelectChange);
  if (ccyFeeAddBtn) ccyFeeAddBtn.addEventListener("click", addCurrencyFee);
  if (ccyFeeAddRowBtn) ccyFeeAddRowBtn.addEventListener("click", function () { _makeCurrencyFeeRowEl($("currency-fee-rows-editor"), {}, _ccyFeeDecimals(_ccyFeeActive)); });
  if (ccyFeeValidateBtn) ccyFeeValidateBtn.addEventListener("click", function () { validateCurrencyFees(); });
  if (ccyFeePublishBtn) ccyFeePublishBtn.addEventListener("click", publishCurrencyFees);

  // Refund Window Policy
  var refreshRefundPolicyBtn = $("btn-refresh-refund-policy");
  var editRefundPolicyBtn = $("btn-edit-refund-policy");
  var addRefundRowBtn = $("btn-add-refund-row");
  var validateRefundBtn = $("btn-validate-refund");
  var publishRefundBtn = $("btn-publish-refund");
  var cancelRefundEditBtn = $("btn-cancel-refund-edit");
  if (refreshRefundPolicyBtn) refreshRefundPolicyBtn.addEventListener("click", function () { loadRefundWindowPolicy().then(renderRefundWindowPolicy).catch(function () { window.tstsNotify("Failed to refresh refund policy.", "error"); }); });
  if (editRefundPolicyBtn) editRefundPolicyBtn.addEventListener("click", function () { initRefundEditor(_activeRefundRows); });
  if (addRefundRowBtn) addRefundRowBtn.addEventListener("click", function () { _makeRefundRowEl($("refund-rows-editor")); });
  if (validateRefundBtn) validateRefundBtn.addEventListener("click", handleValidateRefund);
  if (publishRefundBtn) publishRefundBtn.addEventListener("click", handlePublishRefund);
  if (cancelRefundEditBtn) cancelRefundEditBtn.addEventListener("click", function () {
    var ef = $("refund-policy-edit-form"); var eb = $("btn-edit-refund-policy");
    if (ef) ef.classList.add("hidden"); if (eb) eb.classList.remove("hidden");
  });
  if (refreshActionItems) refreshActionItems.addEventListener("click", () => refreshActionItemsView().catch(function () { window.tstsNotify("Failed to refresh action items.", "error"); renderActionItems({ data: { items: [] } }); }));
  if (actionItemsStatusFilter) actionItemsStatusFilter.addEventListener("change", () => refreshActionItemsView().catch(function () { window.tstsNotify("Failed to filter action items.", "error"); renderActionItems({ data: { items: [] } }); }));
  if (refreshUsers) refreshUsers.addEventListener("click", () => loadUsers().then(renderUsers).catch(function () { window.tstsNotify("Failed to refresh users.", "error"); renderUsers([]); }));
  if (refreshCoupons) refreshCoupons.addEventListener("click", () => loadCoupons().then(renderCoupons).catch(function () { window.tstsNotify("Failed to refresh coupons.", "error"); renderCoupons([]); }));
  if (refreshReports) refreshReports.addEventListener("click", () => loadReports().then(renderReports).catch(function () { window.tstsNotify("Failed to refresh reports.", "error"); renderReports([]); }));
  if (refreshPrivateRequests) refreshPrivateRequests.addEventListener("click", () => loadPrivateBookingRequests().then(renderPrivateRequests).catch(function () { window.tstsNotify("Failed to refresh private requests.", "error"); renderPrivateRequests([]); }));
  // Owner 2026-08-02 (sir, chat governance): All / Flagged-chats filter toggle on the admin queue.
  var prFilterAll = $("btn-pr-filter-all");
  var prFilterFlagged = $("btn-pr-filter-flagged");
  function __setPrFilter(flaggedOnly) {
    __prAdminFlaggedOnly = flaggedOnly === true;
    if (prFilterAll) prFilterAll.className = "px-3 py-1.5 " + (__prAdminFlaggedOnly ? "bg-white text-slate-500 hover:bg-slate-50" : "bg-slate-100 text-slate-800");
    if (prFilterFlagged) prFilterFlagged.className = "px-3 py-1.5 " + (__prAdminFlaggedOnly ? "bg-red-50 text-red-700" : "bg-white text-slate-500 hover:bg-slate-50");
    loadPrivateBookingRequests().then(renderPrivateRequests).catch(function () { window.tstsNotify("Failed to load private requests.", "error"); renderPrivateRequests([]); });
  }
  if (prFilterAll) prFilterAll.addEventListener("click", function () { __setPrFilter(false); });
  if (prFilterFlagged) prFilterFlagged.addEventListener("click", function () { __setPrFilter(true); });
  if (refreshAudit) refreshAudit.addEventListener("click", () => handleRefreshAudit());
  if (applyAuditFilters) applyAuditFilters.addEventListener("click", () => handleRefreshAudit());
  if (exportAuditCsv) exportAuditCsv.addEventListener("click", () => handleExportAudit("csv"));
  if (exportAuditJson) exportAuditJson.addEventListener("click", () => handleExportAudit("json"));
  if (adminInviteForm) adminInviteForm.addEventListener("submit", handleInviteAdminSubmit);
  if (refreshAdminInvitesBtn) refreshAdminInvitesBtn.addEventListener("click", () => refreshAdminInvites().catch(function () { window.tstsNotify("Failed to refresh admin invites.", "error"); renderAdminInvites([]); }));
  if (couponCreateForm) couponCreateForm.addEventListener("submit", handleCreateCoupon);
  // Owner-approved 2026-08-03 (sir, Item 13 + scale rework): scope pickers replace
  // typed slugs and ids; the chip pickers wire their own search listeners on creation.
  var couponScopeSel = $("coupon-scope");
  if (couponScopeSel) couponScopeSel.addEventListener("change", __couponScopeChanged);
  // The currency picker fills from the platform's enabled set, and re-labels the two money fields
  // whenever it changes so the amount on screen always names the currency it is in.
  var couponCcySel = $("coupon-currency");
  if (couponCcySel) {
    couponCcySel.addEventListener("change", __couponCurrencyChanged);
    __couponBuildCurrencyPicker();
  }

  // Bookings pagination
  var bPrev = $("bookings-prev");
  var bNext = $("bookings-next");
  function reloadBookingsPage() {
    loadBookings().then(renderBookings).catch(function () { window.tstsNotify("Failed to load bookings.", "error"); });
  }
  if (bPrev) bPrev.addEventListener("click", function () { if (bookingsPage > 0) { bookingsPage--; reloadBookingsPage(); } });
  if (bNext) bNext.addEventListener("click", function () { var totalPages = Math.ceil(bookingsTotalCount / bookingsPageSize); if (bookingsPage < totalPages - 1) { bookingsPage++; reloadBookingsPage(); } });

  // Mobile sidebar toggle
  // sir's decision 2026-09-13: "fix it using agent".
  var sidebarToggle = $("admin-sidebar-toggle");
  var sidebar = $("admin-sidebar");
  var sidebarToggleWrap = $("admin-sidebar-toggle-wrap");
  function adminMenuIsOpen() {
    return !!sidebar && !sidebar.classList.contains("hidden");
  }
  function setAdminMenuOpen(open) {
    if (open) {
      sidebar.classList.remove("hidden");
      sidebar.classList.add("fixed", "inset-0", "z-40", "flex");
    } else {
      sidebar.classList.add("hidden");
      sidebar.classList.remove("fixed", "inset-0", "z-40", "flex");
    }
    sidebarToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    var toggleIcon = sidebarToggle.querySelector("i");
    if (toggleIcon) {
      toggleIcon.classList.toggle("fa-bars", !open);
      toggleIcon.classList.toggle("fa-times", open);
    }
    if (sidebarToggleWrap) sidebarToggleWrap.classList.toggle("admin-menu-open", open);
  }
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", function () {
      setAdminMenuOpen(!adminMenuIsOpen());
    });
    document.addEventListener("click", function (e) {
      if (!adminMenuIsOpen()) return;
      if (sidebar.contains(e.target) || sidebarToggle.contains(e.target)) return;
      setAdminMenuOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && adminMenuIsOpen()) setAdminMenuOpen(false);
    });
  }

  // Verification sub-tabs
  var verSubTabs = document.getElementById("verification-sub-tabs");
  if (verSubTabs) {
    verSubTabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-verification-sub]");
      if (!btn) return;
      var sub = btn.getAttribute("data-verification-sub");
      var subs = ["hosts", "events", "funding"];
      subs.forEach(function (s) {
        var panel = document.getElementById("verification-sub-" + s);
        if (panel) panel.classList.toggle("hidden", s !== sub);
      });
      verSubTabs.querySelectorAll("[data-verification-sub]").forEach(function (b) {
        if (b.getAttribute("data-verification-sub") === sub) {
          b.className = "text-xs px-4 py-2 rounded-full font-semibold bg-tsts-ink text-white";
        } else {
          b.className = "text-xs px-4 py-2 rounded-full font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-gray-50";
        }
      });
    });
  }
}

// Owner 2026-05-30 (date-picker rollout R3): every native datetime-local
// input on the admin panel is replaced with the shared Flatpickr wrapper so
// admins get the same calendar as the rest of the site. Five inputs:
//   1. legal-effective-date  — when a policy takes effect (can be future).
//   2. coupon-valid-from     — coupon validity start (admin may backdate).
//   3. coupon-valid-to       — coupon validity end (>= coupon-valid-from).
//   4. audit-filter-from     — audit history start (past, <= today).
//   5. audit-filter-to       — audit history end   (past, <= today).
// Output format = "Y-m-dTH:i" so every existing read site (which does
// `new Date(input.value).toISOString()`) keeps working with zero changes.
function wireAdminDatePickers() {
  if (typeof window.tstsDatePicker !== "function") return;
  // The picker keeps the original <input> as the hidden source-of-truth and
  // renders a visible alt-input next to it. We strip native type="datetime-local"
  // (so Chrome doesn't render its own polyfill on top) and let the wrapper
  // hide the source-input via altInput.
  function $$(id) { return document.getElementById(id); }
  function nativeStripAndPicker(id, opts) {
    var el = $$(id);
    if (!el) return null;
    try { el.setAttribute("type", "text"); } catch (_e) { void _e; }
    try { el.setAttribute("autocomplete", "off"); } catch (_e) { void _e; }
    var defaults = {
      enableTime: true,
      time_24hr: false,
      // Keep the source-input string compatible with `new Date(value)` parsing
      // used by saveLegalDraft / collectAuditFilters / createCoupon submit.
      dateFormat: "Y-m-d\\TH:i",
      altFormat: "D j M Y · h:i K"
    };
    return window.tstsDatePicker(el, Object.assign(defaults, opts || {}));
  }
  // 1. Legal effective date — forward-effective (today-or-later).
  // (Inherits the wrapper's default minDate: "today" — exactly right here.)
  nativeStripAndPicker("legal-effective-date", { minDate: "today" });
  // 2 + 3. Coupon validity window — admin may backdate, so explicitly OVERRIDE
  // the wrapper's default minDate to null. The "to" picker tracks the "from"
  // picker's value once a "from" date is chosen.
  var couponFromPicker = nativeStripAndPicker("coupon-valid-from", { minDate: null });
  var couponToPicker = nativeStripAndPicker("coupon-valid-to", { minDate: null });
  if (couponFromPicker && couponToPicker) {
    couponFromPicker.set("onChange", [function (selectedDates, dateStr) {
      try { couponToPicker.set("minDate", dateStr || null); } catch (_e) { void _e; }
    }]);
  }
  // 4 + 5. Audit history filters — past or today, never future. MUST override
  // the wrapper default minDate: "today" to null; with min AND max both clamped
  // to today, BOTH calendar nav arrows would be flatpickr-disabled and the
  // host could never walk back to filter older audit records.
  nativeStripAndPicker("audit-filter-from", { minDate: null, maxDate: "today" });
  nativeStripAndPicker("audit-filter-to",   { minDate: null, maxDate: "today" });
}

async function boot() {
  if (!(await mustBeAdmin())) return;

  wireAdminEvents();
  wireAdminDatePickers();

  // Set admin identity label
  try {
    var sess = await window.tstsGetSession({ force: false });
    var identityLabel = $("admin-identity-label");
    if (identityLabel && sess && sess.user) {
      identityLabel.textContent = "Admin: " + String(sess.user.email || sess.user.name || "Admin");
    }
  } catch (_) {}

  // basic skeleton if containers exist
  try {
    // Owner 2026-08-05, verbatim: "Fix the page load, leave the limiter alone". Boot used to fire all
    // 17 admin endpoints at once on every visit, whichever tab the admin actually wanted. adminLimiter
    // allows 60 requests per 15 minutes, so the FOURTH page load locked an admin out of their own tool,
    // and the lockout arrived as empty tables and "Failed to load private requests" — never as an
    // explanation. Every one of those 17 was already redundant: _adminTabLoadData below fetches each
    // tab's data when that tab opens, including the dashboard. Boot now fetches nothing itself and
    // hands straight to switchTab, so an admin only ever pays for the tab in front of them. The
    // limiter is untouched — it is security code and stays as sir set it.
    switchTab(_currentAdminTab || resolveInitialAdminTab());
  } catch (e) {
    window.tstsNotify("Admin load failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", boot);
