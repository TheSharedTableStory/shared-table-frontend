// TSTS, Verify Email (web)
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
  var pageHeading        = document.getElementById("page-heading");

  // ─── State ──
  var otpSessionId = "";
  var emailUsed    = "";
  var resendTimer  = null;
  var resendSecondsLeft = 0;
  var inflightSend   = false;
  var inflightVerify = false;
  // GF-9 (sir's fix-all order 2026-08-20): signup lands here with ?email=&sent=1 —
  // the code is already in their inbox, so the page opens on the code-entry step.
  // ?returnTo= carries where to go after Continue (relative paths only).
  var sentFromSignup = false;
  var returnTarget   = "";

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
    // sir 2026-08-08: "Why the headinsays Verify the email when email is verified?" — the subtitle was
    // cleared on success but the h1 was not, so the page ordered the person to verify an email while the
    // card beneath it said "Email verified" with a green tick. One screen contradicting itself. The card
    // already carries the success message, so the heading retires on step 3 rather than repeating it.
    if (pageHeading) pageHeading.classList.toggle("hidden", n === 3);
  }

  // ─── URL param parsing (deep-link entry points) ──
  function parseUrlParams() {
    try {
      var q = new URLSearchParams(location.search || "");
      var em = q.get("email");
      if (em) emailUsed = String(em).trim();
      sentFromSignup = q.get("sent") === "1";
      var rtRaw = String(q.get("returnTo") || "").trim();
      // Same-site relative paths only, built the same way the approved sign-in page builds it:
      // undo any percent-encoding FIRST (an encoded scheme slips straight past a plain string
      // test), refuse any scheme or protocol-relative target BEFORE the leading slashes are
      // stripped, then require what is left to resolve to this exact site and to name a page
      // this platform actually serves. Anything else is ignored and the person lands on the
      // home page, which is what the line at the end of this file already does.
      if (rtRaw) {
        var rt = rtRaw;
        try { rt = decodeURIComponent(rt); } catch (eDecode) { swallow(eDecode); }
        var rtLower = rt.toLowerCase();
        var rtHasScheme = rtLower.indexOf("http://") === 0 ||
          rtLower.indexOf("https://") === 0 ||
          rtLower.indexOf("//") === 0 ||
          rtLower.indexOf("javascript:") === 0;
        if (!rtHasScheme) {
          var rtPath = rt.charAt(0) === "/" ? rt.slice(1) : rt;
          try {
            var rtParsed = new URL(rtPath, location.origin + "/");
            if (rtParsed.origin === location.origin) {
              var rtAllowed = {
                "index.html": true, "admin.html": true, "profile.html": true,
                "host.html": true, "explore.html": true, "feed.html": true,
                "connections.html": true, "bookmarks.html": true, "my-bookings.html": true,
                "experience.html": true, "reset-password.html": true, "login.html": true,
                "check-in.html": true
              };
              var rtCleanPath = String(rtParsed.pathname || "").replace(/^\/+/, "");
              if (rtAllowed[rtCleanPath]) {
                returnTarget = rtCleanPath + String(rtParsed.search || "") + String(rtParsed.hash || "");
              }
            }
          } catch (eParse) { swallow(eParse); }
        }
      }
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
      try { u.searchParams.delete("sent"); } catch (eDelS) { swallow(eDelS); }
      try { u.searchParams.delete("returnTo"); } catch (eDelR) { swallow(eDelR); }
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

      // sir 2026-08-08: "if a user is already verified then why is he allowed t ogo to next window with
      // fake hole ot get code and put it?" — the page used to advance to the code screen and announce a
      // code that was never sent, leaving the person waiting on an email that could not come. It now stops
      // here and says so. This branch is the ONLY place that may hint at password reset: sir noted
      // "FOrgot passowrd is hint that user exisits", and every other branch (unknown address, deleted,
      // inactive) stays deliberately generic on the server, so a hint there would silently confirm an
      // address the server just refused to confirm.
      if (inner && inner.alreadyVerified === true) {
        // sir: "Why would i drop Rest your passowrd from sentenceand not make it a link which acutlly
        // takes to rest password apge". Right — my version said "reset your password" in the sentence and
        // then repeated it as a separate link underneath, saying the same words twice. The phrase in the
        // sentence IS the action, so it carries the link itself. Built as nodes through tstsEl (setAlert
        // writes textContent, and this project never takes raw markup).
        setAlert("success", "");
        try {
          if (alertEl && window.tstsEl) {
            alertEl.classList.add("text-center");
            alertEl.appendChild(document.createTextNode("This email is already verified. If you can't log in, "));
            alertEl.appendChild(window.tstsEl("a", {
              href: "reset-password.html",
              className: "font-bold underline"
            }, "reset your password"));
            alertEl.appendChild(document.createTextNode("."));
          } else {
            setAlert("success", inner.message || data.message || "This email is already verified.");
          }
        } catch (eLink) {
          swallow(eLink);
          setAlert("success", inner.message || data.message || "This email is already verified.");
        }
        return;
      }

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
      // BUG-080 fix: multi-digit paste distributes from idx (cursor cell), not from 0.
      if (raw.length > 1) {
        var fillEnd = Math.min(otpCells.length, idx + raw.length);
        for (var i = idx; i < fillEnd; i++) {
          var ch = raw[i - idx] || "";
          otpCells[i].value = ch;
          otpCells[i].classList.toggle("is-filled", !!ch);
        }
        var lastFilled = fillEnd - 1;
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
    // GF-9: honor the destination the signup flow carried in (relative paths only,
    // sanitized in parseUrlParams); everyone else goes home as before.
    location.href = returnTarget || "index.html";
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
      // BUG-080 fix: paste distributes from this cell's idx, not from index 0.
      c.addEventListener("paste", (function (pasteIdx) {
        return function (e) {
          try {
            var txt = (e.clipboardData && e.clipboardData.getData("text")) || "";
            var available = otpCells.length - pasteIdx;
            var clean = String(txt).replace(/\D/g, "").slice(0, available);
            if (!clean) return;
            e.preventDefault();
            var fillEnd = Math.min(otpCells.length, pasteIdx + clean.length);
            for (var i = pasteIdx; i < fillEnd; i++) {
              var ch = clean[i - pasteIdx] || "";
              otpCells[i].value = ch;
              otpCells[i].classList.toggle("is-filled", !!ch);
            }
            setOtpError("");
            var lastFilled = fillEnd - 1;
            if (lastFilled >= 0 && lastFilled < otpCells.length - 1) {
              otpCells[lastFilled + 1].focus();
            } else if (otpCells[otpCells.length - 1]) {
              otpCells[otpCells.length - 1].focus();
            }
            var full = getOtpValue();
            if (full.length === 6) {
              setVerifyEnabled(true);
              if (!inflightVerify) verifyOtp();
            }
          } catch (eP) { swallow(eP); }
        };
      })(idx));
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
    if (emailUsed && sentFromSignup) {
      // GF-9: the signup flow already emailed the code — open on the code-entry step
      // (the verify endpoint accepts email + code; resend works from the email alone).
      if (sentBannerEmailEl) sentBannerEmailEl.textContent = emailUsed;
      resetOtpCells();
      showStep(2);
      startResendCooldown(60);
      try { if (otpCells[0]) otpCells[0].focus(); } catch (eFocus2) { swallow(eFocus2); }
    } else {
      showStep(1);
      try { if (emailFieldEl) emailFieldEl.focus(); } catch (eFocus) { swallow(eFocus); }
    }
    scrubUrl();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
