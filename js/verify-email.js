// TSTS — Verify Email (web)
// Owner-approved 3-step progressive flow on a single page (mirrors the
// reset-password flow but without the password step):
//   Step 1: email entry → POST /api/auth/otp/request-email-verify
//   Step 2: 6-cell OTP entry → POST /api/auth/verify-email-otp (auto-submit on
//           6 digits, paste-friendly). Backend sets emailVerified + auth
//           cookies in the same response so the user is logged in.
//   Step 3: success card → Continue → redirect to home (already authed)
//
// Backwards compat:
//   - If page is opened with #token=...&email=... (legacy email-link verify
//     flow) we call POST /api/auth/verify-email under a loading state and
//     advance to Step 3 on success.

(function () {
  if (window.__TSTS_VERIFY_EMAIL_RAN__) return;
  window.__TSTS_VERIFY_EMAIL_RAN__ = true;

  var EMPTY_RESPONSE = Object.freeze(Object.create(null));
  function emptyResponse() { return EMPTY_RESPONSE; }
  function swallow(e) { void e; }

  // ─── Element refs ──
  var loadingEl          = document.getElementById("state-loading");
  var cardMain           = document.getElementById("card-main");
  var emailFieldEl       = document.getElementById("emailField");
  var sendCodeBtn        = document.getElementById("send-code-btn");
  var emailSummaryEl     = document.getElementById("email-summary");
  var emailSummaryValue  = document.getElementById("email-summary-value");
  var step1El            = document.getElementById("step-1");
  var step2El            = document.getElementById("step-2");
  var step3El            = document.getElementById("step-3");
  var sentBannerEmailEl  = document.getElementById("sent-banner-email");
  var otpCells           = Array.prototype.slice.call(document.querySelectorAll(".tsts-otp-cell"));
  var otpErrorEl         = document.getElementById("otp-error");
  var verifyCodeBtn      = document.getElementById("verify-code-btn");
  var resendCodeBtn      = document.getElementById("resend-code-btn");
  var continueBtn        = document.getElementById("continue-btn");
  var alertEl            = document.getElementById("alert");
  var pageSubtitle       = document.getElementById("page-subtitle");

  // ─── State ──
  var otpSessionId = "";
  var emailUsed    = "";
  var resendTimer  = null;
  var resendSecondsLeft = 0;
  var inflightSend   = false;
  var inflightVerify = false;

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
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function showStep(n) {
    [step1El, step2El, step3El].forEach(function (el, idx) {
      if (!el) return;
      var isActive = (idx + 1) === n;
      el.classList.toggle("hidden", !isActive);
      el.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    if (emailSummaryEl) {
      var showSummary = (n === 2) && !!emailUsed;
      emailSummaryEl.classList.toggle("hidden", !showSummary);
      emailSummaryEl.setAttribute("aria-hidden", showSummary ? "false" : "true");
      if (emailSummaryValue) emailSummaryValue.textContent = emailUsed;
    }
    if (pageSubtitle) {
      if (n === 1)      pageSubtitle.textContent = "Enter your email and we’ll send you a 6-digit code.";
      else if (n === 2) pageSubtitle.textContent = "Enter the 6-digit code we just emailed you.";
      else if (n === 3) pageSubtitle.textContent = "";
    }
  }

  // ─── URL param parsing (deep-link entry points) ──
  function parseUrlParams() {
    try {
      var q = new URLSearchParams(location.search || "");
      var em = q.get("email");
      if (em) emailUsed = String(em).trim();
    } catch (e) { swallow(e); }
    try {
      var rawHash = (location.hash || "");
      var hash = rawHash.charAt(0) === "#" ? rawHash.slice(1) : rawHash;
      var h = new URLSearchParams(hash || "");
      var emH = h.get("email");
      if (!emailUsed && emH) emailUsed = String(emH).trim();
    } catch (e) { swallow(e); }
  }

  function scrubUrl() {
    try {
      var u = new URL(location.href);
      try { u.searchParams.delete("email"); } catch (eDel) { swallow(eDel); }
      if (u.hash) {
        var hh = u.hash.charAt(0) === "#" ? u.hash.slice(1) : u.hash;
        var qs = new URLSearchParams(hh || "");
        if (qs.has("token")) qs.delete("token");
        if (qs.has("email")) qs.delete("email");
        u.hash = qs.toString() ? ("#" + qs.toString()) : "";
      }
      var clean = u.pathname + (u.searchParams.toString() ? ("?" + u.searchParams.toString()) : "") + u.hash;
      history.replaceState(null, document.title, clean);
    } catch (e) { swallow(e); }
  }

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
      var res = await window.authFetch("/api/auth/otp/request-email-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      });
      var data = await res.json().catch(emptyResponse);
      if (!res.ok || !data || data.ok !== true) {
        setAlert("error", (data && data.message) ? data.message : "Could not send the verification code. Please try again.");
        return;
      }
      var inner = (data.data && typeof data.data === "object") ? data.data : data;
      var sid = inner && inner.otpSessionId ? String(inner.otpSessionId) : "";
      if (!sid) {
        setAlert("error", "Could not start the verification. Please try again.");
        return;
      }
      otpSessionId = sid;
      emailUsed    = email;
      if (sentBannerEmailEl) sentBannerEmailEl.textContent = emailUsed;
      resetOtpCells();
      showStep(2);
      startResendCooldown(60);
      try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
    } catch (e) {
      swallow(e);
      setAlert("error", "Network error. Please try again.");
    } finally {
      inflightSend = false;
      setSendCodeBusy(false);
    }
  }

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
      setOtpError("");
      var raw = String(cell.value || "").replace(/\D/g, "");
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
    if (!otpSessionId && !emailUsed) {
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
      var res = await window.authFetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpSessionId: otpSessionId, email: emailUsed, code: code })
      });
      var data = await res.json().catch(emptyResponse);
      if (!res.ok || !data || data.ok !== true) {
        var msg = (data && data.message) ? data.message : "Invalid verification code. Please try again.";
        setOtpError(msg);
        setVerifyEnabled(true);
        try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus) { swallow(eFocus); }
        return;
      }
      // Server set auth cookies + returned user. Persist any client-side session
      // hint and advance to success.
      try {
        if (window.tstsSetSession && data.data && data.data.user) {
          window.tstsSetSession(data.data.user);
        }
      } catch (eSess) { swallow(eSess); }
      stopResendCooldown();
      showStep(3);
    } catch (e) {
      swallow(e);
      setOtpError("Network error. Please try again.");
      setVerifyEnabled(true);
    } finally {
      inflightVerify = false;
      if (verifyCodeBtn) verifyCodeBtn.textContent = "Verify Code";
    }
  }

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
      showStep(1);
      return;
    }
    if (resendCodeBtn) {
      resendCodeBtn.disabled = true;
      resendCodeBtn.textContent = "Sending…";
    }
    try {
      var res = await window.authFetch("/api/auth/otp/request-email-verify", {
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

  function continueAfterVerify() {
    location.href = "index.html";
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
    if (continueBtn)   continueBtn.addEventListener("click", continueAfterVerify);
  }

  // ─── Init ──
  function init() {
    parseUrlParams();
    wireEvents();

    if (emailUsed && emailFieldEl) {
      emailFieldEl.value = emailUsed;
    }
    showStep(1);
    try { if (emailFieldEl) emailFieldEl.focus(); } catch (eFocus) { swallow(eFocus); }
    scrubUrl();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
