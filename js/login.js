// js/login.js


// --- Modal fallback (prevents login breaking if modal component isn't loaded) ---
window.showModal = window.showModal || function (title, message, type) {
  var t = String(type || "info").toLowerCase();
  var notifyType = (t === "error") ? "error" : (t === "success") ? "success" : "info";
  window.tstsNotify(String(title || "") + ": " + String(message || ""), notifyType);
};

// ── Google Sign-In ──────────────────────────────────────────────────────
// Uses Google Identity Services (GIS) One Tap / popup flow.
// Backend: POST /api/auth/google { idToken, termsAccepted? }

var __googleSignInBusy = false;

function __initGoogleSignIn() {
  if (typeof google === "undefined" || !google.accounts || !google.accounts.id) {
    setTimeout(__initGoogleSignIn, 200);
    return;
  }

  var clientId = (window.__runtimeConfig && window.__runtimeConfig.GOOGLE_CLIENT_ID_WEB)
    ? String(window.__runtimeConfig.GOOGLE_CLIENT_ID_WEB)
    : "758078162613-i5kungjqa0s862qa1h2uhhuuck9db0u0.apps.googleusercontent.com";

  google.accounts.id.initialize({
    client_id: clientId,
    callback: __handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  var btnLogin = document.getElementById("btn-google-login");
  var btnSignup = document.getElementById("btn-google-signup");
  if (btnLogin) btnLogin.addEventListener("click", function () { __triggerGoogleSignIn(false); });
  if (btnSignup) btnSignup.addEventListener("click", function () { __triggerGoogleSignIn(true); });
}

function __triggerGoogleSignIn(isSignup) {
  if (__googleSignInBusy) return;

  if (isSignup) {
    var termsEl = document.getElementById("signup-terms");
    if (termsEl && !termsEl.checked) {
      showModal("Terms Required", "Please accept the Terms of Service before continuing with Google.", "error");
      return;
    }
  }

  google.accounts.id.prompt(function (notification) {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // One Tap blocked by browser, user can use email/password instead
    }
  });

  window.__googleSignInIsSignup = !!isSignup;
}

async function __handleGoogleCredential(response) {
  if (__googleSignInBusy) return;
  __googleSignInBusy = true;

  var idToken = response && response.credential;
  if (!idToken) {
    showModal("Google Sign-In", "Google sign-in failed. Please try again.", "error");
    __googleSignInBusy = false;
    return;
  }

  var isSignup = !!window.__googleSignInIsSignup;
  var termsAccepted = false;
  if (isSignup) {
    var termsEl = document.getElementById("signup-terms");
    termsAccepted = !!(termsEl && termsEl.checked);
  }

  var btnLogin = document.getElementById("btn-google-login");
  var btnSignup = document.getElementById("btn-google-signup");
  if (btnLogin) { btnLogin.disabled = true; window.tstsSetText(btnLogin, "Signing in\u2026"); }
  if (btnSignup) { btnSignup.disabled = true; window.tstsSetText(btnSignup, "Signing in\u2026"); }

  try {
    var res = await window.authFetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken, termsAccepted: termsAccepted }),
    });

    var data = null;
    try { data = await res.json(); } catch (parseErr) {
      showModal("Google Sign-In", "Invalid server response. Please try again.", "error");
      return;
    }

    if (!res.ok) {
      var errMsg = "Google sign-in failed. Please try again.";
      var errCode = (data && data.error) ? String(data.error) : "";
      if (errCode === "GOOGLE_ACCOUNT_CONFLICT") errMsg = "This email is linked to a different Google account.";
      else if (errCode === "TERMS_REQUIRED") errMsg = "Please accept the Terms of Service to continue.";
      else if (errCode === "ACCOUNT_DISABLED") errMsg = "This account has been disabled. Please contact support.";
      else if (data && data.message) errMsg = String(data.message);
      showModal("Google Sign-In", errMsg, "error");
      return;
    }

    var payload = (window.tstsUnwrap && typeof window.tstsUnwrap === "function") ? window.tstsUnwrap(data) : (data && data.data !== undefined ? data.data : data);
    var user = (payload && payload.user) ? payload.user : null;
    var csrfToken = (payload && (payload.csrfToken || payload.token)) ? String(payload.csrfToken || payload.token) : "";

    if (window.setAuth) window.setAuth(csrfToken, user);
    try {
      if (window.tstsMarkLoginOk) window.tstsMarkLoginOk();
      else if (window.sessionStorage) window.sessionStorage.setItem("tsts_login_ok_ts", String(Date.now()));
    } catch (markErr) {
      if (window.tstsNotify) window.tstsNotify("Session state warning", "info");
    }

    var isAdmin = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));
    if (isAdmin) {
      window.location.href = "admin.html";
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var rawTarget = params.get("redirect") || params.get("returnTo") || "index.html";
    window.location.href = safeRedirectTarget(rawTarget);

  } catch (networkErr) {
    showModal("Connection Error", "Could not connect to the server. Please try again.", "error");
  } finally {
    __googleSignInBusy = false;
    if (btnLogin) { btnLogin.disabled = false; while (btnLogin.firstChild) btnLogin.removeChild(btnLogin.firstChild); var i1 = document.createElement("img"); i1.src = "assets/google-g.svg"; i1.alt = ""; i1.width = 20; i1.height = 20; i1.className = "flex-shrink-0"; btnLogin.appendChild(i1); btnLogin.appendChild(document.createTextNode(" Continue with Google")); }
    if (btnSignup) { btnSignup.disabled = false; while (btnSignup.firstChild) btnSignup.removeChild(btnSignup.firstChild); var i2 = document.createElement("img"); i2.src = "assets/google-g.svg"; i2.alt = ""; i2.width = 20; i2.height = 20; i2.className = "flex-shrink-0"; btnSignup.appendChild(i2); btnSignup.appendChild(document.createTextNode(" Continue with Google")); }
  }
}

let forgotPasswordInFlight = false;

async function handleForgotPassword(e) {
    try { if (e && typeof e.preventDefault === "function") e.preventDefault(); } catch (_) {}

    const emailEl = document.getElementById("login-email");
    const forgotBtn = document.getElementById("btn-forgot-password");
    const email = String((emailEl && emailEl.value) ? emailEl.value : "").trim();

    if (!email) {
        showModal("Forgot Password", "Enter your email in the field above and we\u2019ll help you reset your password.", "error");
        return;
    }

    if (forgotPasswordInFlight) return;
    forgotPasswordInFlight = true;
    try {
        if (forgotBtn) {
            forgotBtn.disabled = true;
            forgotBtn.setAttribute("aria-busy", "true");
        }
    } catch (_) {}

    try {
        const res = await window.authFetch("/api/auth/otp/request-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const errMsg = (data && data.message)
                ? String(data.message)
                : "Could not send reset instructions. Please try again.";
            showModal("Reset Password", errMsg, "error");
            return;
        }
        const inner = (data && data.data && typeof data.data === "object") ? data.data : data;
        var otpSessionId = (inner && inner.otpSessionId) ? String(inner.otpSessionId) : "";

        // Redirect to reset-password page with OTP session
        if (otpSessionId) {
            showModal("Reset Password", "A verification code has been sent to your email.", "success");
            setTimeout(function() {
                location.href = "reset-password.html?otpSessionId=" + encodeURIComponent(otpSessionId) + "&email=" + encodeURIComponent(email);
            }, 1200);
        } else {
            showModal("Reset Password", "If an account exists, you will receive a verification code.", "success");
        }
    } catch (_) {
        showModal("Reset Password", "Could not reach the server. Please try again.", "error");
    } finally {
        forgotPasswordInFlight = false;
        try {
            if (forgotBtn) {
                forgotBtn.disabled = false;
                forgotBtn.removeAttribute("aria-busy");
            }
        } catch (_) {}
    }
}

// GF-9 (sir's fix-all order 2026-08-20): shown once after a failed login. New accounts must
// verify their email before login works, but the refusal is a generic wrong-password sentence
// (anti-guessing hardening) — this line is the honest bridge to the code-entry page.
function revealVerifyBridge(emailValue) {
    if (document.getElementById("verify-bridge-line")) return;
    const form = document.getElementById("form-login");
    if (!form || !window.tstsEl) return;
    const href = "verify-email.html" + (emailValue ? ("?email=" + encodeURIComponent(String(emailValue).trim())) : "");
    const link = window.tstsEl("a", { className: "font-bold text-orange-600 hover:underline", textContent: "enter your code here" });
    link.href = href;
    const line = window.tstsEl("p", { id: "verify-bridge-line", className: "text-xs text-slate-500 text-center" }, [
        "Just signed up? Your email may still need verifying, ",
        link,
        "."
    ]);
    form.appendChild(line);
}

function safeRedirectTarget(rawTarget) {
  // Allow only same-site relative navigations (no schemes, no protocol-relative)
  let t = String(rawTarget || "index.html").trim();
  try { t = decodeURIComponent(t); } catch (_) {}

  const lower = t.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//") ||
    lower.startsWith("javascript:")
  ) {
    return "index.html";
  }

  if (t.startsWith("/")) t = t.slice(1);

  let parsed;
  try {
    parsed = new URL(t, window.location.origin + "/");
  } catch (_) {
    return "index.html";
  }

  if (parsed.origin !== window.location.origin) return "index.html";

  const path = String(parsed.pathname || "").replace(/^\/+/, "");
  const allowed = new Set([
    "index.html",
    "admin.html",
    "profile.html",
    "host.html",
    "explore.html",
    "feed.html",
    "connections.html",
    "bookmarks.html",
    "my-bookings.html",
    "experience.html",
    "reset-password.html",
    "login.html",
    // sir 2026-08-15 ("Fix it — both lines"): the door check-in station is a legitimate
    // signed-in destination — without it here, a host signing in at the door was forced
    // onto profile.html and lost the station.
    "check-in.html"
  ]);
  if (!allowed.has(path)) return "profile.html";

  return path + String(parsed.search || "") + String(parsed.hash || "");
}

// Owner 2026-05-27: when login is reached WITHOUT a ?returnTo / ?redirect param
// (e.g. a plain nav to the page, or an auth redirect that didn't set one), fall
// back to the page the user came FROM (same-origin only) instead of dumping them
// on the landing page. Returns "" when there's no usable referrer so the caller's
// final "index.html" default still applies. safeRedirectTarget re-validates the result.
function referrerReturnTarget() {
  try {
    var ref = String(document.referrer || "").trim();
    if (!ref) return "";
    var u = new URL(ref);
    if (u.origin !== window.location.origin) return "";
    var p = String(u.pathname || "").replace(/^\/+/, "");
    if (!p || p === "login.html") return ""; // never bounce back to the login page itself
    return p + String(u.search || "") + String(u.hash || "");
  } catch (_) { return ""; }
}



// --- 1. TOGGLE FORMS ---
function toggleAuth(mode) {
    const loginForm = document.getElementById("form-login");
    const signupForm = document.getElementById("form-signup");
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");

    if (mode === 'login') {
        loginForm.classList.remove("hidden");
        signupForm.classList.add("hidden");
        tabLogin.className = "flex-1 pb-3 font-bold text-orange-600 border-b-2 border-orange-600 transition-colors";
        tabSignup.className = "flex-1 pb-3 font-medium text-gray-500 hover:text-gray-900 transition-colors";
    } else {
        signupForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        tabSignup.className = "flex-1 pb-3 font-bold text-orange-600 border-b-2 border-orange-600 transition-colors";
        tabLogin.className = "flex-1 pb-3 font-medium text-gray-500 hover:text-gray-900 transition-colors";
    }
}

// --- 2. LOGIN LOGIC ---
let loginInFlight = false;

async function handleLogin(e) {
    e.preventDefault();
    // sir 2026-09-13: the email sign-in and sign-up buttons guard a second press like their siblings on this page.
    if (loginInFlight) return;
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = String(params.get("adminInviteToken") || "").trim();
    const inviteEmail = String(params.get("adminInviteEmail") || "").trim();

    const loginBtn = (e && e.submitter) ? e.submitter : document.querySelector('#form-login button[type="submit"]');
    const loginBtnWords = loginBtn ? String(loginBtn.textContent || "") : "";
    loginInFlight = true;
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.setAttribute("aria-busy", "true");
        window.tstsSetText(loginBtn, "Signing in\u2026");
    }

    try {
        const res = await window.authFetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            showModal("Login Failed", (data && data.message) || "Please check your email and password.", "error");
            // GF-9 (sir's fix-all order 2026-08-20): an unverified account is refused with the
            // generic wrong-password sentence (deliberate anti-guessing hardening), so the real
            // owner of a fresh account gets no route to the code page. After a failed attempt,
            // surface the one bridge that rescues that person.
            revealVerifyBridge(email);
            return;
        }

        const payload = (window.tstsUnwrap && typeof window.tstsUnwrap === "function") ? window.tstsUnwrap(data) : (data && data.data !== undefined ? data.data : data);
        let user = (payload && payload.user) ? payload.user : (data && data.user ? data.user : null);
        const csrfToken = (payload && (payload.csrfToken || payload.token)) ? String(payload.csrfToken || payload.token) : String((data && (data.csrfToken || data.token)) || "");

        if (window.setAuth) window.setAuth(csrfToken, user);
        try {
            if (window.tstsMarkLoginOk) window.tstsMarkLoginOk();
            else if (window.sessionStorage) window.sessionStorage.setItem("tsts_login_ok_ts", String(Date.now()));
        } catch (_) {}

        if (inviteToken) {
            try {
                const acceptRes = await window.authFetch("/api/auth/admin-invites/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: inviteToken,
                        email: inviteEmail || email
                    })
                });
                const acceptData = await acceptRes.json().catch(() => ({}));
                if (!acceptRes.ok || !acceptData || acceptData.ok !== true) {
                    const msg = (acceptData && acceptData.message) ? String(acceptData.message) : "Admin invite acceptance failed.";
                    showModal("Admin Invite", msg, "error");
                } else {
                    showModal("Admin Invite", "Admin access granted successfully.", "success");
                }
                if (window.tstsGetSession) {
                    const fresh = await window.tstsGetSession({ force: true }).catch(() => null);
                    if (fresh && fresh.ok && fresh.user) {
                        user = Object.assign({}, user || {}, fresh.user || {});
                    }
                }
            } catch (_) {
                showModal("Admin Invite", "Unable to accept the admin invite right now.", "error");
            }
        }

        // Admin routing must be role-based, not email-hardcoded.
        const isAdmin = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));
        if (isAdmin) {
            window.location.href = "admin.html";
            return;
        }

        const redirect = params.get("redirect");
        const returnTo = params.get("returnTo");
        // Owner 2026-05-27: no returnTo param → return to the page the user came from
        // (referrer), not the landing page. safeRedirectTarget validates the result.
        const rawTarget = redirect || returnTo || referrerReturnTarget() || "index.html";
        const target = safeRedirectTarget(rawTarget);
        window.location.href = target;

    } catch (err) {
        showModal("Connection Error", "Could not connect to the server. Please try again.", "error");
    } finally {
        loginInFlight = false;
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.removeAttribute("aria-busy");
            window.tstsSetText(loginBtn, loginBtnWords);
        }
    }


}

// --- 3. SIGNUP LOGIC ---
// Live password checklist, flips each rule's dot to a green check as the
// user types. Rules mirror backend __passwordPolicyOk exactly.
// BUG-050 (2026-05-15): upper bound 24 → 72 to match the backend bcrypt-aligned cap.
function tstsPasswordRulesEval(pw) {
    return {
        length: pw.length >= 8 && pw.length <= 72,
        lower:  /[a-z]/.test(pw),
        upper:  /[A-Z]/.test(pw),
        number: /[0-9]/.test(pw),
    };
}
function tstsBindSignupPasswordRules() {
    var input = document.getElementById("signup-password");
    var list = document.getElementById("signup-password-rules");
    var segs = document.querySelectorAll("#signup-password-strength .pw-seg");
    var label = document.getElementById("pw-strength-label");
    if (!input || !list) return;
    var TRACK = "#ece3da";
    // Warm, on-brand strength scale (soft clay → brand orange), keyed by rules met (0–4).
    var LEVELS = [
        { c: TRACK,     t: "" },
        { c: "#dca890", t: "Weak" },
        { c: "#c28d6b", t: "Fair" },
        { c: "#f97316", t: "Good" },
        { c: "#ea580c", t: "Strong" }
    ];
    function paint() {
        var pw = String(input.value || "");
        var s = tstsPasswordRulesEval(pw);
        var met = 0;
        list.querySelectorAll("li[data-rule]").forEach(function (li) {
            var ok = !!s[li.getAttribute("data-rule")];
            if (ok) met++;
            li.setAttribute("data-met", ok ? "1" : "0");
        });
        var lvl = (pw.length === 0) ? 0 : met;
        var info = LEVELS[lvl];
        segs.forEach(function (seg, i) {
            seg.style.backgroundColor = (i < lvl) ? info.c : TRACK;
        });
        if (label) { label.textContent = info.t; label.style.color = (lvl === 0) ? "#b9a99c" : info.c; }
    }
    input.addEventListener("input", paint);
    paint();
}
// Bind once DOM is ready (login.html already loads this script with defer).
document.addEventListener("DOMContentLoaded", tstsBindSignupPasswordRules);

// Show/hide password toggle for every .pw-toggle button (login + signup fields).
// Lets the user reveal what they typed to catch typos. Swaps type + eye/eye-off icon.
function tstsBindPasswordToggles() {
    document.querySelectorAll(".pw-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var input = document.getElementById(btn.getAttribute("data-target"));
            if (!input) return;
            var show = input.getAttribute("type") === "password";
            input.setAttribute("type", show ? "text" : "password");
            btn.classList.toggle("is-on", show);
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        });
    });
}
document.addEventListener("DOMContentLoaded", tstsBindPasswordToggles);

// Live confirm-password match feedback on the signup form (catches typos before submit).
function tstsBindConfirmMatch() {
    var pw = document.getElementById("signup-password");
    var cpw = document.getElementById("signup-confirm-password");
    var tick = document.getElementById("signup-confirm-tick");
    if (!pw || !cpw || !tick) return;
    function paint() {
        var c = String(cpw.value || "");
        var match = c.length > 0 && c === String(pw.value || "");
        tick.classList.toggle("is-match", match);
    }
    cpw.addEventListener("input", paint);
    pw.addEventListener("input", paint);
    paint();
}
document.addEventListener("DOMContentLoaded", tstsBindConfirmMatch);

let signupInFlight = false;

async function handleSignup(e) {
    e.preventDefault();
    if (signupInFlight) return;
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm-password").value;
    const termsAgreed = document.getElementById("signup-terms").checked;

    if (password !== confirmPassword) {
        showModal("Password Mismatch", "Passwords do not match. Please re-enter your password.", "error");
        return;
    }

    // Mirror backend rules client-side so the user can't get rejected by the
    // server after completing the form.
    var pwRules = tstsPasswordRulesEval(password);
    if (!pwRules.length) {
        // BUG-050 (2026-05-15): copy updated to 8–72 to match backend __passwordPolicyOk
        showModal("Password requirements", "Password must be 8–72 characters.", "error");
        return;
    }
    if (!pwRules.lower) {
        showModal("Password requirements", "Password must include a lowercase letter.", "error");
        return;
    }
    if (!pwRules.upper) {
        showModal("Password requirements", "Password must include an uppercase letter.", "error");
        return;
    }
    if (!pwRules.number) {
        showModal("Password requirements", "Password must include a number.", "error");
        return;
    }

    if (!termsAgreed) {
        showModal("Terms Required", "You must agree to the Terms of Service to create an account.", "error");
        return;
    }

    const signupBtn = (e && e.submitter) ? e.submitter : document.querySelector('#form-signup button[type="submit"]');
    const signupBtnWords = signupBtn ? String(signupBtn.textContent || "") : "";
    signupInFlight = true;
    if (signupBtn) {
        signupBtn.disabled = true;
        signupBtn.setAttribute("aria-busy", "true");
        window.tstsSetText(signupBtn, "Creating your account\u2026");
    }

    try {
        const res = await window.authFetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, confirmPassword, termsAgreed: true })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            showModal("Sign up failed", (data && data.message) || "Please try again.", "error");
            return;
        }

        // Registration creates the account but does NOT establish a cookie session.
        // Email verification is required before login (world-class baseline security).
        // GF-9 (sir's fix-all order 2026-08-20): the email carries a 6-digit CODE, not a link, and
        // the only page that accepts it is verify-email.html \u2014 say "code", and go THERE next.
        showModal("Account Created", "Welcome aboard! We\u2019ve emailed you a 6-digit code. Taking you to the code page now.", "success");

        // Clear any stale auth state (register response may include legacy token fields; cookie auth is authoritative).
        try { if (window.clearAuth) window.clearAuth(); } catch (_) {}

        setTimeout(() => {
            const params = new URLSearchParams(window.location.search);
            const rawTarget = params.get("redirect") || params.get("returnTo") || "index.html";
            const target = safeRedirectTarget(rawTarget);
            const inviteToken = String(params.get("adminInviteToken") || "").trim();
            const inviteEmail = String(params.get("adminInviteEmail") || "").trim();
            // Admin invites are accepted at sign-in, so their post-verify stop is the login
            // form with the invite params; everyone else goes straight to their destination
            // (verification auto-signs the account in).
            let afterVerify = target;
            if (inviteToken) {
                const next = new URLSearchParams();
                next.set("returnTo", target);
                next.set("adminInviteToken", inviteToken);
                if (inviteEmail) next.set("adminInviteEmail", inviteEmail);
                afterVerify = "login.html?" + next.toString();
            }
            const vq = new URLSearchParams();
            vq.set("email", email);
            vq.set("sent", "1");
            vq.set("returnTo", afterVerify);
            window.location.href = "verify-email.html?" + vq.toString();
        }, 1200);

    } catch (err) {
        showModal("Connection Error", "Could not connect to the server. Please try again.", "error");
    } finally {
        signupInFlight = false;
        if (signupBtn) {
            signupBtn.disabled = false;
            signupBtn.removeAttribute("aria-busy");
            window.tstsSetText(signupBtn, signupBtnWords);
        }
    }


}

async function redirectIfAlreadyAuthed() {
    try {
        if (!window.tstsGetSession) return false;
        const sess = await window.tstsGetSession({ force: true });
        if (!sess || !sess.ok || !sess.user) return false;

        const user = sess.user || {};
        const isAdmin = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));
        if (isAdmin) {
            window.location.href = "admin.html";
            return true;
        }

        const params = new URLSearchParams(window.location.search);
        const rawTarget = params.get("redirect") || params.get("returnTo") || "index.html";
        window.location.href = safeRedirectTarget(rawTarget);
        return true;
    } catch (_) {
        return false;
    }
}

// --- 4. INIT ---
// ── Apple Sign-In (App Store guideline 4.8 parity with mobile) ─────────
// Uses Apple JS SDK if loaded (https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js)
// Backend: POST /api/auth/apple { idToken, code, name, email, termsAccepted? }
// If the SDK is not loaded yet (Apple Developer not configured), the button
// shows a friendly message rather than breaking the page.

var __appleSignInBusy = false;

function __initAppleSignIn() {
  var btnLogin  = document.getElementById("btn-apple-login");
  var btnSignup = document.getElementById("btn-apple-signup");
  if (btnLogin)  btnLogin.addEventListener("click",  function () { __triggerAppleSignIn(false); });
  if (btnSignup) btnSignup.addEventListener("click", function () { __triggerAppleSignIn(true); });

  // Load Apple's JS SDK only when a web Services ID is configured (runtime-config).
  // Until then, AppleID stays undefined and the button shows a graceful "being set up"
  // message (see __triggerAppleSignIn) — placeholder behaviour is preserved pre-config.
  var rt = window.__TSTS_RUNTIME__ || {};
  var servicesId = String(rt.appleServicesId || "").trim();
  if (!servicesId) return;
  if (document.querySelector('script[src*="appleid.cdn-apple.com"]')) return;
  var redirectUri = String(rt.appleRedirectUri || (window.location.origin + "/login.html")).trim();
  var s = document.createElement("script");
  s.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
  s.async = true;
  s.onload = function () {
    try {
      if (typeof AppleID !== "undefined" && AppleID.auth) {
        AppleID.auth.init({ clientId: servicesId, scope: "name email", redirectURI: redirectUri, usePopup: true });
      }
    } catch (e) { /* init failed; placeholder remains */ }
  };
  document.head.appendChild(s);
}

function __triggerAppleSignIn(isSignup) {
  if (__appleSignInBusy) return;

  if (isSignup) {
    var termsEl = document.getElementById("signup-terms");
    if (termsEl && !termsEl.checked) {
      showModal("Terms Required", "Please accept the Terms of Service before continuing with Apple.", "error");
      return;
    }
  }

  // Apple Sign-In requires the Apple Developer subscription + a Service ID + an
  // authorised redirect URI. The mobile app already supports it via expo-apple-authentication.
  // On the website, until the Service ID is configured, surface a clear note
  // instead of failing silently.
  if (typeof AppleID === "undefined" || !AppleID.auth) {
    showModal(
      "Sign in with Apple",
      "Apple Sign-In on the web is being set up. For now, please continue with Google or your email, both connect to the same account.",
      "info"
    );
    return;
  }

  __appleSignInBusy = true;
  var btnLogin  = document.getElementById("btn-apple-login");
  var btnSignup = document.getElementById("btn-apple-signup");
  if (btnLogin)  { btnLogin.disabled = true;  window.tstsSetText(btnLogin, "Signing in\u2026"); }
  if (btnSignup) { btnSignup.disabled = true; window.tstsSetText(btnSignup, "Signing in\u2026"); }

  AppleID.auth.signIn().then(function (response) {
    return __handleAppleCredential(response, isSignup);
  }).catch(function () {
    showModal("Apple Sign-In", "Apple sign-in was cancelled or failed. Please try again.", "error");
    __appleSignInBusy = false;
    if (btnLogin)  { btnLogin.disabled = false;  window.tstsSetText(btnLogin, "Continue with Apple"); }
    if (btnSignup) { btnSignup.disabled = false; window.tstsSetText(btnSignup, "Continue with Apple"); }
  });
}

async function __handleAppleCredential(response, isSignup) {
  var idToken = response && response.authorization && response.authorization.id_token;
  var code    = response && response.authorization && response.authorization.code;
  var name    = (response && response.user && response.user.name) || null;
  var email   = (response && response.user && response.user.email) || null;
  if (!idToken || !code) {
    showModal("Apple Sign-In", "Apple sign-in failed. Please try again.", "error");
    __appleSignInBusy = false;
    return;
  }

  var termsAccepted = false;
  if (isSignup) {
    var termsEl = document.getElementById("signup-terms");
    termsAccepted = !!(termsEl && termsEl.checked);
  }

  try {
    var res = await window.authFetch("/api/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityToken: idToken,
        code: code,
        fullName: (name && (name.firstName || name.lastName)) ? { givenName: String(name.firstName || ""), familyName: String(name.lastName || "") } : null,
        email: email,
        termsAccepted: termsAccepted
      }),
    });
    var data = null;
    try { data = await res.json(); } catch (e) {
      showModal("Apple Sign-In", "Invalid server response. Please try again.", "error");
      return;
    }
    if (!res.ok) {
      var errCode = (data && data.error) ? String(data.error) : "";
      var errMsg = "Apple sign-in failed. Please try again.";
      if (errCode === "APPLE_ACCOUNT_CONFLICT") errMsg = "This email is linked to a different Apple account.";
      else if (errCode === "TERMS_REQUIRED")    errMsg = "Please accept the Terms of Service to continue.";
      else if (errCode === "ACCOUNT_DISABLED")  errMsg = "This account has been disabled. Please contact support.";
      else if (data && data.message)            errMsg = String(data.message);
      showModal("Apple Sign-In", errMsg, "error");
      return;
    }
    var payload = (window.tstsUnwrap && typeof window.tstsUnwrap === "function") ? window.tstsUnwrap(data) : (data && data.data !== undefined ? data.data : data);
    var user = (payload && payload.user) ? payload.user : null;
    var csrfToken = (payload && (payload.csrfToken || payload.token)) ? String(payload.csrfToken || payload.token) : "";
    if (window.setAuth) window.setAuth(csrfToken, user);
    try { if (window.tstsMarkLoginOk) window.tstsMarkLoginOk(); else if (window.sessionStorage) window.sessionStorage.setItem("tsts_login_ok_ts", String(Date.now())); } catch (e) {}
    var isAdmin = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));
    window.location.href = isAdmin ? "/admin.html" : "/index.html";
  } catch (err) {
    showModal("Apple Sign-In", "Network error. Please try again.", "error");
  } finally {
    __appleSignInBusy = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
    const redirected = await redirectIfAlreadyAuthed();
    if (redirected) return;

    // Show login card after auth check completes (prevents redirect flash)
    var loginCard = document.getElementById("login-card");
    if (loginCard) loginCard.style.opacity = "1";

    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");
    const loginForm = document.getElementById("form-login");
    const signupForm = document.getElementById("form-signup");
    const forgotBtn = document.getElementById("btn-forgot-password");

    if (tabLogin) tabLogin.addEventListener("click", () => toggleAuth("login"));
    if (tabSignup) tabSignup.addEventListener("click", () => toggleAuth("signup"));
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
    if (signupForm) signupForm.addEventListener("submit", handleSignup);
    if (forgotBtn) forgotBtn.addEventListener("click", handleForgotPassword);
    if (forgotBtn) {
        forgotBtn.addEventListener("keydown", (ev) => {
            if (forgotPasswordInFlight && (ev.key === "Enter" || ev.keyCode === 13)) {
                try { ev.preventDefault(); } catch (_) {}
            }
        });
    }

    // Cross-link buttons (below forms)
    var switchToSignup = document.getElementById("switch-to-signup");
    var switchToLogin = document.getElementById("switch-to-login");
    if (switchToSignup) switchToSignup.addEventListener("click", function () { toggleAuth("signup"); });
    if (switchToLogin) switchToLogin.addEventListener("click", function () { toggleAuth("login"); });

    if (loginForm && signupForm && tabLogin && tabSignup) {
        toggleAuth("login");
    }

    // Initialize Google + Apple Sign-In
    __initGoogleSignIn();
    __initAppleSignIn();

    const urlReason = new URLSearchParams(window.location.search).get("reason");
    if (urlReason === "session_expired") {
        try { if (window.tstsNotify) window.tstsNotify("Your session has expired. Please log in to continue.", "info"); } catch (_) {}
    }
});
