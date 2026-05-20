// js/check-in.js
// Host check-in flow on the website. Mirrors mobile HostCheckInScreen.
// Flow:
//   1. Auth-gate (redirects to /login.html?next=/check-in.html if not authed)
//   2. Load host's experiences via GET /api/host/experiences (already auth-gated)
//   3. Host picks experience + date → optional /api/host/experiences/:id/check-in-list
//   4. Host enters guest's 6-digit OTP
//   5. POST /api/host/bookings/:bookingId/check-in { otp } via guest's bookingId
//
// For the simplest UX, we let the host enter the OTP directly. The backend
// resolves the booking by OTP+experience+date so the host doesn't have to
// pick the guest's booking explicitly.

(function () {
  function $id(x) { return document.getElementById(x); }

  async function ensureAuth() {
    // BUG-164 (2026-05-17): `window.tstsGetSession()` returns a PROMISE. The
    // prior code used it WITHOUT `await`, so `ses` was the (always-truthy)
    // Promise → `if (!ses)` never fired → an UNAUTHENTICATED visitor was
    // NEVER redirected to /login (the auth-gate was dead). Fix: await it
    // (with force:true for a fresh check, matching the other auth gates in
    // common.js) and gate on the REAL resolved shape `{ ok, user }`. NOTE:
    // the audit's snippet `ses?.ok?.user` is itself incorrect — `ok` is a
    // boolean (every common.js call site uses `sess && sess.ok &&
    // sess.user`), so the codebase-canonical `!ses || !ses.ok || !ses.user`
    // guard is used (faithful correction of the audit typo).
    var ses = (window.tstsGetSession && await window.tstsGetSession({ force: true })) || null;
    if (!ses || !ses.ok || !ses.user) {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
    return ses;
  }

  function setError(msg) {
    var el = $id("cin-error");
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      window.tstsSetText(el, "");
    } else {
      el.classList.remove("hidden");
      window.tstsSetText(el, msg);
    }
  }

  function showSuccess(detail) {
    var box = $id("cin-success");
    var d   = $id("cin-success-detail");
    if (box && d) {
      window.tstsSetText(d, detail);
      box.classList.remove("hidden");
    }
  }

  async function loadExperiences() {
    var picker = $id("cin-experience");
    if (!picker) return;
    try {
      var res = await window.authFetch("/api/host/experiences", { method: "GET" });
      var data = await res.json();
      var unwrapped = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
        ? window.unwrapApiPayload(data) : (data && data.data !== undefined ? data.data : data);
      var list = (unwrapped && Array.isArray(unwrapped.experiences)) ? unwrapped.experiences : [];
      // Only show ACTIVE experiences, drafts/paused can't have bookings
      list = list.filter(function (e) { return String(e.status || "").toUpperCase() === "ACTIVE"; });
      if (list.length === 0) return;
      $id("cin-experience-picker").classList.remove("hidden");
      list.forEach(function (e) {
        var opt = window.tstsEl("option", { value: String(e.id || e._id || "") }, String(e.title || "Untitled experience"));
        picker.appendChild(opt);
      });
      // Default date = today
      var today = new Date();
      var iso   = today.toISOString().split("T")[0];
      var dateEl = $id("cin-date");
      if (dateEl) dateEl.value = iso;
    } catch (e) {
      // Quiet, host can still type the OTP if they know it
    }
  }

  async function submitCheckIn() {
    setError("");
    var otpEl  = $id("cin-otp");
    var btn    = $id("cin-submit");
    var picker = $id("cin-experience");
    var dateEl = $id("cin-date");

    var otp = String((otpEl && otpEl.value) || "").trim();
    if (!/^[0-9]{6}$/.test(otp)) {
      setError("Enter the 6-digit entry code from the booking confirmation.");
      return;
    }

    var experienceId = String((picker && picker.value) || "").trim();
    var dateStr      = String((dateEl && dateEl.value) || "").trim();
    if (!experienceId) {
      setError("Pick an experience first.");
      return;
    }

    btn.disabled = true;
    window.tstsSetText(btn, "Checking in…");

    try {
      // BUG-165 (2026-05-17): SINGLE resolve-by-OTP call. The server resolves
      // the ONE matching booking by OTP + experience + date and checks it in
      // atomically. The prior flow fetched the booking list then looped
      // `POST /api/host/bookings/:id/check-in` for EVERY booking until one
      // matched — N HTTP requests per OTP entry, N consumptions of the
      // per-request limiter, and the OTP attempt fanned across other guests'
      // bookings. Now: exactly one request, server-side resolution.
      var resp = await window.authFetch(
        "/api/host/experiences/" + encodeURIComponent(experienceId) + "/check-in-by-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: otp, date: dateStr }),
        }
      );
      var json = await resp.json();
      if (resp.ok) {
        var data = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
          ? window.unwrapApiPayload(json) : (json && json.data !== undefined ? json.data : json);
        var matchedName = String((data && data.guestName) || "Guest");
        showSuccess(matchedName + " is checked in. Have a great evening at the table.");
        otpEl.value = "";
      } else {
        setError(String((json && json.message) || "Entry code didn't match any booking on this date. Double-check with your guest."));
      }
    } catch (netErr) {
      setError("Network error. Please try again.");
    } finally {
      btn.disabled = false;
      window.tstsSetText(btn, "Check in");
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var ses = await ensureAuth();
    if (!ses) return;

    await loadExperiences();

    var btn = $id("cin-submit");
    if (btn) btn.addEventListener("click", function () { void submitCheckIn(); });

    var otpEl = $id("cin-otp");
    if (otpEl) {
      otpEl.addEventListener("input", function () {
        // Strip non-digits
        otpEl.value = String(otpEl.value || "").replace(/[^0-9]/g, "").slice(0, 6);
        setError("");
      });
      otpEl.addEventListener("keydown", function (e) {
        if (e && e.key === "Enter") void submitCheckIn();
      });
    }
  });
})();
