(function () {
  var form = document.getElementById("reset-form");
  var otpCodeEl = document.getElementById("otpCode");
  var newPasswordEl = document.getElementById("newPassword");
  var confirmPasswordEl = document.getElementById("confirmPassword");
  var submitBtn = document.getElementById("submit-btn");
  var alertEl = document.getElementById("alert");

  function setAlert(type, msg) {
    if (!alertEl) return;
    alertEl.classList.remove("hidden");
    alertEl.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    alertEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    var t = String(type || "info");
    if (t === "success") {
      alertEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    } else {
      alertEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    }
    alertEl.textContent = String(msg || "");
  }

  function setSubmitEnabled(enabled) {
    if (!submitBtn) return;
    submitBtn.disabled = !enabled;
    if (!enabled) {
      submitBtn.classList.add("opacity-60", "cursor-not-allowed");
    } else {
      submitBtn.classList.remove("opacity-60", "cursor-not-allowed");
    }
  }

  var otpSessionId = "";
  var urlToken = "";

  function parseUrlParams() {
    try {
      var q = new URLSearchParams(location.search || "");
      var sid = q.get("otpSessionId");
      if (sid) otpSessionId = String(sid).trim();
    } catch (_) {}

    // Legacy: also check for token-based flow (backward compat with existing reset emails)
    try {
      var rawHash = (location.hash || "");
      var hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
      var h = new URLSearchParams(hash || "");
      var ht = h.get("token");
      if (ht) urlToken = String(ht).trim();
    } catch (_) {}
    try {
      var q2 = new URLSearchParams(location.search || "");
      var qt = q2.get("token");
      if (!urlToken && qt) urlToken = String(qt).trim();
    } catch (_) {}
  }

  function initPage() {
    parseUrlParams();

    if (otpSessionId) {
      // OTP-based flow
      setSubmitEnabled(true);
      if (otpCodeEl) otpCodeEl.focus();
      // Scrub otpSessionId from URL
      try {
        var u = new URL(location.href);
        u.searchParams.delete("otpSessionId");
        u.searchParams.delete("email");
        var clean = u.pathname + (u.searchParams.toString() ? ("?" + u.searchParams.toString()) : "") + u.hash;
        history.replaceState({}, document.title, clean);
      } catch (_) {}
    } else if (urlToken) {
      // Legacy token-based flow — hide OTP code field, use old API
      if (otpCodeEl && otpCodeEl.parentNode) {
        otpCodeEl.parentNode.style.display = "none";
      }
      setSubmitEnabled(true);
      // Scrub token from URL
      try {
        var u2 = new URL(location.href);
        if (u2.searchParams.has("token")) u2.searchParams.delete("token");
        if (u2.hash) {
          var hh = u2.hash.startsWith("#") ? u2.hash.slice(1) : u2.hash;
          var qs = new URLSearchParams(hh || "");
          if (qs.has("token")) { qs.delete("token"); u2.hash = qs.toString() ? ("#" + qs.toString()) : ""; }
        }
        history.replaceState({}, document.title, u2.toString());
      } catch (_) {}
    } else {
      setAlert("error", "This reset link is incomplete or expired. Please request a new password reset from the login page.");
      setSubmitEnabled(false);
    }
  }

  async function submit(e) {
    e.preventDefault();

    var newPassword = (newPasswordEl && newPasswordEl.value) ? String(newPasswordEl.value) : "";
    var confirmPassword = (confirmPasswordEl && confirmPasswordEl.value) ? String(confirmPasswordEl.value) : "";

    if (!newPassword || !confirmPassword) {
      setAlert("error", "All fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setAlert("error", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAlert("error", "Passwords do not match.");
      return;
    }

    if (otpSessionId) {
      // OTP-based flow
      var code = (otpCodeEl && otpCodeEl.value) ? String(otpCodeEl.value).trim() : "";
      if (!code || !/^\d{6}$/.test(code)) {
        setAlert("error", "Please enter a valid 6-digit verification code.");
        return;
      }
      await submitOtpFlow(code, newPassword, confirmPassword);
    } else if (urlToken) {
      // Legacy token-based flow
      await submitLegacyFlow(newPassword, confirmPassword);
    } else {
      setAlert("error", "No reset session found. Please request a new password reset.");
    }
  }

  async function submitOtpFlow(code, newPassword, confirmPassword) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying...";
    }

    try {
      // Step 1: Verify OTP code
      var verRes = await window.authFetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpSessionId: otpSessionId, code: code })
      });
      var verData = await verRes.json().catch(function() { return {}; });

      if (!verRes.ok || !verData || verData.ok !== true || !verData.data || !verData.data.otpToken) {
        var verMsg = (verData && verData.message) ? verData.message : "Invalid verification code.";
        setAlert("error", verMsg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Reset Password";
        }
        return;
      }

      var otpToken = verData.data.otpToken;

      // Step 2: Reset password with OTP token
      if (submitBtn) submitBtn.textContent = "Resetting...";

      var resetRes = await window.authFetch("/api/auth/otp/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken: otpToken, newPassword: newPassword, confirmPassword: confirmPassword })
      });
      var resetData = await resetRes.json().catch(function() { return {}; });

      if (!resetRes.ok || !resetData || resetData.ok !== true) {
        var resetMsg = (resetData && resetData.message) ? resetData.message : "Password reset failed.";
        setAlert("error", resetMsg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Reset Password";
        }
        return;
      }

      setAlert("success", "Password updated. Redirecting to login...");
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      setTimeout(function() { location.href = "login.html"; }, 900);
    } catch (_) {
      setAlert("error", "Network error. Please try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Reset Password";
      }
    }
  }

  async function submitLegacyFlow(newPassword, confirmPassword) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Resetting...";
    }

    try {
      var payload = {
        token: urlToken,
        newPassword: newPassword,
        confirmPassword: confirmPassword
      };
      var res = await window.authFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function() { return {}; });

      if (!res.ok) {
        setAlert("error", (data && data.message) ? data.message : "Password reset failed.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Reset Password";
        }
        return;
      }

      setAlert("success", "Password updated. Redirecting to login...");
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      setTimeout(function() { location.href = "login.html"; }, 900);
    } catch (_) {
      setAlert("error", "Network error. Please try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Reset Password";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function() {
    initPage();
    if (form) form.addEventListener("submit", submit);
  });
})();
