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
    var ses = (window.tstsGetSession && window.tstsGetSession()) || null;
    if (!ses) {
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
      window.tstsText(el, "");
    } else {
      el.classList.remove("hidden");
      window.tstsText(el, msg);
    }
  }

  function showSuccess(detail) {
    var box = $id("cin-success");
    var d   = $id("cin-success-detail");
    if (box && d) {
      window.tstsText(d, detail);
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
      // Only show ACTIVE experiences — drafts/paused can't have bookings
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
      // Quiet — host can still type the OTP if they know it
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
    window.tstsText(btn, "Checking in…");

    try {
      // Resolve the booking via the check-in-list endpoint, then post check-in.
      var listUrl = "/api/host/experiences/" + encodeURIComponent(experienceId) + "/check-in-list" + (dateStr ? ("?date=" + encodeURIComponent(dateStr)) : "");
      var listRes = await window.authFetch(listUrl, { method: "GET" });
      var listData = await listRes.json();
      var listUnwrap = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
        ? window.unwrapApiPayload(listData) : (listData && listData.data !== undefined ? listData.data : listData);
      var bookings = (listUnwrap && Array.isArray(listUnwrap.bookings)) ? listUnwrap.bookings : [];
      if (bookings.length === 0) {
        setError("No bookings found for this experience on the chosen date.");
        return;
      }

      // Try check-in for each booking until one matches the OTP. Backend
      // returns OTP_INVALID if it doesn't match — quiet on misses.
      var matchedName = null;
      for (var i = 0; i < bookings.length; i++) {
        var bk = bookings[i];
        var bkId = String(bk.id || bk._id || "");
        if (!bkId) continue;
        if (bk.checkedInAt) continue; // already checked in
        try {
          var resp = await window.authFetch("/api/host/bookings/" + encodeURIComponent(bkId) + "/check-in", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ otp: otp }),
          });
          var json = await resp.json();
          if (resp.ok) {
            matchedName = String(bk.guestName || bk.guest && bk.guest.name || "Guest");
            break;
          }
          // OTP_INVALID for this booking — try next
          if (json && json.error && json.error !== "OTP_INVALID") {
            setError(String(json.message || "Couldn't check in. Please try again."));
            return;
          }
        } catch (innerErr) {
          // network error mid-loop — abort
          setError("Network error. Please try again.");
          return;
        }
      }

      if (matchedName) {
        showSuccess(matchedName + " is checked in. Have a great evening at the table.");
        otpEl.value = "";
      } else {
        setError("Entry code didn't match any booking on this date. Double-check with your guest.");
      }
    } finally {
      btn.disabled = false;
      window.tstsText(btn, "Check in");
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
