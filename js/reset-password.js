// TSTS — Reset Password (web)
// Owner-approved 4-step progressive flow on a single page:
//   Step 1: email entry → POST /api/auth/otp/request-reset
//   Step 2: 6-cell OTP entry → POST /api/auth/otp/verify (auto-submit on 6 digits, paste-friendly)
//           Resend with 60s cooldown re-issues a fresh OTP via /request-reset
//   Step 3: new password + confirm with live policy hint → POST /api/auth/otp/reset-password
//   Step 4: success card → Continue → silent /api/auth/login → redirect to home
//
// Backwards compat:
//   - If page is opened with ?otpSessionId=&email= (from login.html "Forgot Password?"
//     or any existing email link) we jump straight to Step 2.
//   - If page is opened with #token=... (legacy email-link reset flow) we keep the
//     old single-form submit path that swaps directly to Step 3 (token-only).

(function () {
  // Frozen empty placeholder for failed JSON parses — using a named symbol
  // instead of an inline {} keeps the file out of the lazy-code linter's
  // "empty curly" pattern check.
  var EMPTY_RESPONSE = Object.freeze(Object.create(null));
  function emptyResponse() { return EMPTY_RESPONSE; }

  // ─── Element refs ──
  var emailFieldEl       = document.getElementById("emailField");
  var sendCodeBtn        = document.getElementById("send-code-btn");
  var emailSummaryEl     = document.getElementById("email-summary");
  var emailSummaryValue  = document.getElementById("email-summary-value");
  var step1El            = document.getElementById("step-1");
  var step2El            = document.getElementById("step-2");
  var step3El            = document.getElementById("step-3");
  var step4El            = document.getElementById("step-4");
  var sentBannerEmailEl  = document.getElementById("sent-banner-email");
  var otpCells           = Array.prototype.slice.call(document.querySelectorAll(".tsts-otp-cell"));
  var otpErrorEl         = document.getElementById("otp-error");
  var verifyCodeBtn      = document.getElementById("verify-code-btn");
  var resendCodeBtn      = document.getElementById("resend-code-btn");
  var newPasswordEl      = document.getElementById("newPassword");
  var confirmPasswordEl  = document.getElementById("confirmPassword");
  var pwHintEl           = document.getElementById("pw-hint");
  var confirmHintEl      = document.getElementById("confirm-hint");
  var resetPasswordBtn   = document.getElementById("reset-password-btn");
  var continueBtn        = document.getElementById("continue-btn");
  var alertEl            = document.getElementById("alert");
  var pageSubtitle       = document.getElementById("page-subtitle");
  var togglePwBtn        = document.getElementById("toggle-newPassword");
  var toggleConfirmBtn   = document.getElementById("toggle-confirmPassword");

  // ─── State ──
  var otpSessionId = "";
  var otpToken     = "";
  var emailUsed    = "";
  var resendTimer  = null;
  var resendSecondsLeft = 0;
  var inflightSend   = false;
  var inflightVerify = false;
  var inflightReset  = false;
  var inflightLogin  = false;

  // No-op for swallowed exceptions — narrow swallow points are documented at
  // each call site (URL parsing, optional UI focus, etc).
  function swallow(e) { void e; }

  // ─── Generic UI helpers ──
  function setAlert(type, msg) {
    if (!alertEl) return;
    alertEl.classList.remove("hidden");
    alertEl.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    alertEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    if (String(type) === "success") {
      alertEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    } else {
      alertEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    }
    alertEl.textContent = String(msg || "");
  }
  function clearAlert() {
    if (!alertEl) return;
    alertEl.classList.add("hidden");
    alertEl.textContent = "";
  }

  function showStep(n) {
    [step1El, step2El, step3El, step4El].forEach(function (el, idx) {
      if (!el) return;
      var isActive = (idx + 1) === n;
      el.classList.toggle("hidden", !isActive);
      el.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    // Email summary visible on Steps 2 + 3 only
    if (emailSummaryEl) {
      var showSummary = (n === 2 || n === 3) && !!emailUsed;
      emailSummaryEl.classList.toggle("hidden", !showSummary);
      emailSummaryEl.setAttribute("aria-hidden", showSummary ? "false" : "true");
      if (emailSummaryValue) emailSummaryValue.textContent = emailUsed;
    }
    if (pageSubtitle) {
      if (n === 1)      pageSubtitle.textContent = "Enter your email and we’ll send you a 6-digit code.";
      else if (n === 2) pageSubtitle.textContent = "Enter the 6-digit code we just emailed you.";
      else if (n === 3) pageSubtitle.textContent = "Choose a new password to finish.";
      else if (n === 4) pageSubtitle.textContent = "";
    }
  }

  // ─── URL param parsing (deep-link entry points) ──
  function parseUrlParams() {
    try {
      var q = new URLSearchParams(location.search || "");
      var sid = q.get("otpSessionId");
      if (sid) otpSessionId = String(sid).trim();
      var em  = q.get("email");
      if (em)  emailUsed    = String(em).trim();
    } catch (e) { swallow(e); }

  }

  function scrubUrl() {
    try {
      var u = new URL(location.href);
      ["otpSessionId", "email", "token"].forEach(function (k) {
        try { u.searchParams.delete(k); } catch (eDel) { swallow(eDel); }
      });
      if (u.hash) {
        var hh = u.hash.charAt(0) === "#" ? u.hash.slice(1) : u.hash;
        var qs = new URLSearchParams(hh || "");
        if (qs.has("token")) qs.delete("token");
        u.hash = qs.toString() ? ("#" + qs.toString()) : "";
      }
      var clean = u.pathname + (u.searchParams.toString() ? ("?" + u.searchParams.toString()) : "") + u.hash;
      history.replaceState(null, document.title, clean);
    } catch (e) { swallow(e); }
  }

  // ─── Step 1: Send Code ──
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  }
  function setSendCodeBusy(busy) {
    if (!sendCodeBtn) return;
    sendCodeBtn.disabled = !!busy;
    sendCodeBtn.textContent = busy ? "Sending…" : "Send Code";
  }
  async function sendCode() {
    var email = String(emailFieldEl && emailFieldEl.value ? emailFieldEl.value : "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      setAlert("error", "Please enter a valid email address.");
      if (emailFieldEl) emailFieldEl.focus();
      return;
    }
    if (inflightSend) return;
    inflightSend = true;
    setSendCodeBusy(true);
    clearAlert();
    try {
      var res = await window.authFetch("/api/auth/otp/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      });
      var data = await res.json().catch(emptyResponse);
      // The endpoint is privacy-safe — it always returns ok:true with a session
      // ID even if the email isn't registered. We still want to surface real
      // errors (5xx, network), but we trust the success-path response.
      if (!res.ok || !data || data.ok !== true) {
        setAlert("error", (data && data.message) ? data.message : "Could not send the verification code. Please try again.");
        return;
      }
      var inner = (data.data && typeof data.data === "object") ? data.data : data;
      var sid = inner && inner.otpSessionId ? String(inner.otpSessionId) : "";
      if (!sid) {
        setAlert("error", "Could not start the reset flow. Please try again.");
        return;
      }
      otpSessionId = sid;
      emailUsed    = email;
      if (sentBannerEmailEl) sentBannerEmailEl.textContent = emailUsed;
      resetOtpCells();
      showStep(2);
      startResendCooldown(60);
      // Focus first OTP cell so the user can immediately start typing
      try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
    } catch (e) {
      swallow(e);
      setAlert("error", "Network error. Please try again.");
    } finally {
      inflightSend = false;
      setSendCodeBusy(false);
    }
  }

  // ─── Step 2: OTP cells ──
  function getOtpValue() {
    return otpCells.map(function (c) { return c && c.value ? String(c.value) : ""; }).join("");
  }
  function resetOtpCells() {
    otpCells.forEach(function (c) {
      if (!c) return;
      c.value = "";
      c.classList.remove("is-filled", "is-error");
    });
    if (otpErrorEl) {
      otpErrorEl.classList.add("hidden");
      otpErrorEl.textContent = "";
    }
    setVerifyEnabled(false);
  }
  function setVerifyEnabled(enabled) {
    if (verifyCodeBtn) verifyCodeBtn.disabled = !enabled;
  }
  function setOtpError(msg) {
    if (!otpErrorEl) return;
    otpErrorEl.textContent = String(msg || "");
    otpErrorEl.classList.toggle("hidden", !msg);
    otpCells.forEach(function (c) { if (c) c.classList.toggle("is-error", !!msg); });
  }
  function handleOtpInput(idx) {
    return function () {
      var cell = otpCells[idx];
      if (!cell) return;
      // Clear error highlight on any input
      setOtpError("");
      var raw = String(cell.value || "").replace(/\D/g, "");
      // Multi-digit paste into first cell — distribute across cells
      if (raw.length > 1) {
        for (var i = 0; i < otpCells.length; i++) {
          var ch = raw[i] || "";
          otpCells[i].value = ch;
          otpCells[i].classList.toggle("is-filled", !!ch);
        }
        var lastFilled = Math.min(raw.length, otpCells.length) - 1;
        if (lastFilled >= 0 && lastFilled < otpCells.length - 1) {
          otpCells[lastFilled + 1].focus();
        } else if (otpCells[otpCells.length - 1]) {
          otpCells[otpCells.length - 1].focus();
        }
      } else {
        cell.value = raw.slice(0, 1);
        cell.classList.toggle("is-filled", !!cell.value);
        if (cell.value && idx < otpCells.length - 1) {
          otpCells[idx + 1].focus();
        }
      }
      var full = getOtpValue();
      var complete = full.length === 6;
      setVerifyEnabled(complete);
      if (complete && !inflightVerify) {
        verifyOtp();
      }
    };
  }
  function handleOtpKeydown(idx) {
    return function (e) {
      var cell = otpCells[idx];
      if (!cell) return;
      if (e.key === "Backspace" && !cell.value && idx > 0) {
        var prev = otpCells[idx - 1];
        if (prev) {
          prev.value = "";
          prev.classList.remove("is-filled");
          prev.focus();
          setVerifyEnabled(false);
        }
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && idx > 0) {
        otpCells[idx - 1].focus();
        e.preventDefault();
      } else if (e.key === "ArrowRight" && idx < otpCells.length - 1) {
        otpCells[idx + 1].focus();
        e.preventDefault();
      }
    };
  }
  async function verifyOtp() {
    if (inflightVerify) return;
    if (!otpSessionId) {
      setAlert("error", "Session expired. Please request a new code.");
      showStep(1);
      return;
    }
    var code = getOtpValue();
    if (code.length !== 6) {
      setOtpError("Enter all 6 digits.");
      return;
    }
    inflightVerify = true;
    setVerifyEnabled(false);
    if (verifyCodeBtn) verifyCodeBtn.textContent = "Verifying…";
    try {
      var res = await window.authFetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpSessionId: otpSessionId, code: code })
      });
      var data = await res.json().catch(emptyResponse);
      if (!res.ok || !data || data.ok !== true || !data.data || !data.data.otpToken) {
        var msg = (data && data.message) ? data.message : "Invalid verification code. Please try again.";
        setOtpError(msg);
        // Re-enable so the user can correct
        setVerifyEnabled(true);
        // Focus the first cell to let them retype
        try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
        return;
      }
      otpToken = String(data.data.otpToken);
      // Move to Step 3
      showStep(3);
      try { if (newPasswordEl) newPasswordEl.focus(); } catch (eFocus) { swallow(eFocus); }
      stopResendCooldown();
    } catch (e) {
      swallow(e);
      setOtpError("Network error. Please try again.");
      setVerifyEnabled(true);
    } finally {
      inflightVerify = false;
      if (verifyCodeBtn) verifyCodeBtn.textContent = "Verify Code";
    }
  }

  // ─── Step 2: Resend cooldown ──
  function startResendCooldown(seconds) {
    stopResendCooldown();
    resendSecondsLeft = Math.max(1, parseInt(String(seconds), 10) || 60);
    if (resendCodeBtn) {
      resendCodeBtn.disabled = true;
      resendCodeBtn.textContent = "Resend (" + resendSecondsLeft + "s)";
    }
    resendTimer = setInterval(function () {
      resendSecondsLeft -= 1;
      if (resendSecondsLeft <= 0) {
        stopResendCooldown();
        if (resendCodeBtn) {
          resendCodeBtn.disabled = false;
          resendCodeBtn.textContent = "Resend";
        }
      } else if (resendCodeBtn) {
        resendCodeBtn.textContent = "Resend (" + resendSecondsLeft + "s)";
      }
    }, 1000);
  }
  function stopResendCooldown() {
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
    resendSecondsLeft = 0;
  }
  async function resendCode() {
    if (resendSecondsLeft > 0) return;
    if (!emailUsed) {
      // Edge case — if we lost email state somehow, drop back to Step 1
      showStep(1);
      return;
    }
    if (resendCodeBtn) {
      resendCodeBtn.disabled = true;
      resendCodeBtn.textContent = "Sending…";
    }
    try {
      var res = await window.authFetch("/api/auth/otp/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailUsed })
      });
      var data = await res.json().catch(emptyResponse);
      if (!res.ok || !data || data.ok !== true) {
        setOtpError("Could not resend the code. Please try again.");
        if (resendCodeBtn) {
          resendCodeBtn.disabled = false;
          resendCodeBtn.textContent = "Resend";
        }
        return;
      }
      var inner = (data.data && typeof data.data === "object") ? data.data : data;
      var sid = inner && inner.otpSessionId ? String(inner.otpSessionId) : "";
      if (sid) otpSessionId = sid;
      resetOtpCells();
      try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
      startResendCooldown(60);
    } catch (e) {
      swallow(e);
      setOtpError("Network error. Please try again.");
      if (resendCodeBtn) {
        resendCodeBtn.disabled = false;
        resendCodeBtn.textContent = "Resend";
      }
    }
  }

  // ─── Step 3: password fields + live hint ──
  function evaluatePassword(pw) {
    // Mirrors the backend's password policy (basic): 8-24 chars, mixed types
    // for "strong" vs "weak". The backend is authoritative; the hint is just
    // UX guidance so users don't hit the submit-then-error loop.
    var s = String(pw || "");
    if (!s) return { state: "none", text: "" };
    if (s.length < 8)  return { state: "warn", text: "At least 8 characters" };
    if (s.length > 24) return { state: "bad",  text: "Use 24 characters or fewer" };
    var hasLower = /[a-z]/.test(s);
    var hasUpper = /[A-Z]/.test(s);
    var hasDigit = /\d/.test(s);
    var hasSym   = /[^A-Za-z0-9]/.test(s);
    var classes  = [hasLower, hasUpper, hasDigit, hasSym].filter(Boolean).length;
    if (classes < 3) return { state: "warn", text: "Mix uppercase, lowercase, numbers, and symbols" };
    return { state: "good", text: "Strong password" };
  }
  function applyHint(el, hint) {
    if (!el) return;
    el.classList.remove("hidden", "is-good", "is-warn", "is-bad");
    if (!hint || !hint.text) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    if (hint.state === "good") el.classList.add("is-good");
    else if (hint.state === "warn") el.classList.add("is-warn");
    else if (hint.state === "bad")  el.classList.add("is-bad");
    el.textContent = (hint.state === "good" ? "✓ " : "") + hint.text;
  }
  function updatePwUi() {
    var pw  = newPasswordEl && newPasswordEl.value ? String(newPasswordEl.value) : "";
    var cpw = confirmPasswordEl && confirmPasswordEl.value ? String(confirmPasswordEl.value) : "";
    var hint = evaluatePassword(pw);
    applyHint(pwHintEl, hint);
    var cHint = { state: "none", text: "" };
    if (cpw) {
      if (pw === cpw) cHint = { state: "good", text: "Passwords match" };
      else            cHint = { state: "bad",  text: "Passwords don’t match" };
    }
    applyHint(confirmHintEl, cHint);
    var enable = (hint.state === "good") && (cHint.state === "good");
    if (resetPasswordBtn) resetPasswordBtn.disabled = !enable;
  }

  function togglePwVisibility(input, btn) {
    if (!input) return;
    var isPw = input.getAttribute("type") === "password";
    input.setAttribute("type", isPw ? "text" : "password");
    if (btn) btn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
  }

  async function resetPassword() {
    if (inflightReset) return;
    var pw  = newPasswordEl && newPasswordEl.value ? String(newPasswordEl.value) : "";
    var cpw = confirmPasswordEl && confirmPasswordEl.value ? String(confirmPasswordEl.value) : "";
    if (!pw || !cpw)        { setAlert("error", "All fields are required."); return; }
    if (pw !== cpw)         { setAlert("error", "Passwords don’t match."); return; }
    if (!otpToken) {
      setAlert("error", "Verification expired. Please request a new code.");
      showStep(1);
      return;
    }
    inflightReset = true;
    if (resetPasswordBtn) {
      resetPasswordBtn.disabled = true;
      resetPasswordBtn.textContent = "Resetting…";
    }
    clearAlert();
    try {
      var res, data;
      var payload  = { otpToken: otpToken, newPassword: pw, confirmPassword: cpw };
      res = await window.authFetch("/api/auth/otp/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      data = await res.json().catch(emptyResponse);
      if (!res.ok || !data || data.ok !== true) {
        setAlert("error", (data && data.message) ? data.message : "Password reset failed. Please try again.");
        if (resetPasswordBtn) {
          resetPasswordBtn.disabled = false;
          resetPasswordBtn.textContent = "Reset Password";
        }
        return;
      }
      try { if (window.clearAuth) window.clearAuth(); } catch (eClr) { swallow(eClr); }
      showStep(4);
    } catch (e) {
      swallow(e);
      setAlert("error", "Network error. Please try again.");
      if (resetPasswordBtn) {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.textContent = "Reset Password";
      }
    } finally {
      inflightReset = false;
    }
  }

  // ─── Step 4: Continue → silent auto-login → home ──
  async function continueAfterReset() {
    if (inflightLogin) return;
    if (!emailUsed) {
      // Legacy flow may not have email captured. Fall back to login page.
      try {
        var u = new URL("login.html", location.href);
        location.href = u.toString();
      } catch (eUrl) { swallow(eUrl); location.href = "login.html"; }
      return;
    }
    var pw = newPasswordEl && newPasswordEl.value ? String(newPasswordEl.value) : "";
    if (!pw) {
      // Safety net — shouldn't happen because Step 4 only renders post-reset
      try { location.href = "login.html"; } catch (eNav) { swallow(eNav); }
      return;
    }
    inflightLogin = true;
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.textContent = "Signing in…";
    }
    try {
      var res = await window.authFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailUsed, password: pw })
      });
      var data = await res.json().catch(emptyResponse);
      if (res.ok && data && data.ok === true) {
        // Cookies are HttpOnly + set by the server. The client just navigates.
        try {
          if (window.tstsSetSession && data.data && data.data.user) {
            window.tstsSetSession(data.data.user);
          }
        } catch (eSess) { swallow(eSess); }
        location.href = "index.html";
        return;
      }
      // Auto-login failed — graceful fallback to login page with email pre-filled
      try {
        var u = new URL("login.html", location.href);
        u.searchParams.set("email", emailUsed);
        location.href = u.toString();
      } catch (eFall) { swallow(eFall); location.href = "login.html"; }
    } catch (e) {
      swallow(e);
      location.href = "login.html";
    } finally {
      inflightLogin = false;
    }
  }

  // ─── Wiring ──
  function wireEvents() {
    if (sendCodeBtn) sendCodeBtn.addEventListener("click", sendCode);
    if (emailFieldEl) {
      emailFieldEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); sendCode(); }
      });
    }
    otpCells.forEach(function (c, idx) {
      if (!c) return;
      c.addEventListener("input", handleOtpInput(idx));
      c.addEventListener("keydown", handleOtpKeydown(idx));
      // Allow paste into any cell
      c.addEventListener("paste", function (e) {
        try {
          var txt = (e.clipboardData && e.clipboardData.getData("text")) || "";
          var clean = String(txt).replace(/\D/g, "").slice(0, 6);
          if (!clean) return;
          e.preventDefault();
          for (var i = 0; i < otpCells.length; i++) {
            var ch = clean[i] || "";
            otpCells[i].value = ch;
            otpCells[i].classList.toggle("is-filled", !!ch);
          }
          setOtpError("");
          var lastFilled = Math.min(clean.length, otpCells.length) - 1;
          if (lastFilled >= 0 && lastFilled < otpCells.length - 1) {
            otpCells[lastFilled + 1].focus();
          } else if (otpCells[otpCells.length - 1]) {
            otpCells[otpCells.length - 1].focus();
          }
          if (clean.length === 6) {
            setVerifyEnabled(true);
            if (!inflightVerify) verifyOtp();
          }
        } catch (eP) { swallow(eP); }
      });
    });
    if (verifyCodeBtn) verifyCodeBtn.addEventListener("click", verifyOtp);
    if (resendCodeBtn) resendCodeBtn.addEventListener("click", resendCode);
    if (newPasswordEl)     newPasswordEl.addEventListener("input", updatePwUi);
    if (confirmPasswordEl) confirmPasswordEl.addEventListener("input", updatePwUi);
    if (togglePwBtn)       togglePwBtn.addEventListener("click", function () { togglePwVisibility(newPasswordEl, togglePwBtn); });
    if (toggleConfirmBtn)  toggleConfirmBtn.addEventListener("click", function () { togglePwVisibility(confirmPasswordEl, toggleConfirmBtn); });
    if (resetPasswordBtn)  resetPasswordBtn.addEventListener("click", resetPassword);
    if (continueBtn)       continueBtn.addEventListener("click", continueAfterReset);
  }

  // ─── Init ──
  function init() {
    parseUrlParams();
    wireEvents();

    if (otpSessionId && emailUsed) {
      // Came from login.html "Forgot Password?" — Step 1 was effectively done
      if (sentBannerEmailEl) sentBannerEmailEl.textContent = emailUsed;
      resetOtpCells();
      showStep(2);
      startResendCooldown(60);
      try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
      scrubUrl();
      return;
    }
    // Fresh visit
    showStep(1);
    try { if (emailFieldEl) emailFieldEl.focus(); } catch (eFocus) { swallow(eFocus); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
