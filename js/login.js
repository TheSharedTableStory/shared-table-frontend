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
      // One Tap blocked by browser — user can use email/password instead
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
  if (btnLogin) { btnLogin.disabled = true; window.tstsText(btnLogin, "Signing in\u2026"); }
  if (btnSignup) { btnSignup.disabled = true; window.tstsText(btnSignup, "Signing in\u2026"); }

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
    "login.html"
  ]);
  if (!allowed.has(path)) return "profile.html";

  return path + String(parsed.search || "") + String(parsed.hash || "");
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
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = String(params.get("adminInviteToken") || "").trim();
    const inviteEmail = String(params.get("adminInviteEmail") || "").trim();

    try {
        const res = await window.authFetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            showModal("Login Failed", (data && data.message) || "Please check your email and password.", "error");
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
        const rawTarget = redirect || returnTo || "index.html";
        const target = safeRedirectTarget(rawTarget);
        window.location.href = target;

    } catch (err) {
        showModal("Connection Error", "Could not connect to the server. Please try again.", "error");
    }


}

// --- 3. SIGNUP LOGIC ---
async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm-password").value;
    const termsAgreed = document.getElementById("signup-terms").checked;

    if (password !== confirmPassword) {
        showModal("Password Mismatch", "Passwords do not match. Please re-enter your password.", "error");
        return;
    }

    if (password.length < 8) {
        showModal("Password Too Short", "Password must be at least 8 characters long.", "error");
        return;
    }

    if (!termsAgreed) {
        showModal("Terms Required", "You must agree to the Terms of Service to create an account.", "error");
        return;
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
        showModal("Account Created", "Welcome aboard! We\u2019ve sent a verification link to your inbox. Sit tight, we\u2019re taking you to the login page.", "success");

        // Clear any stale auth state (register response may include legacy token fields; cookie auth is authoritative).
        try { if (window.clearAuth) window.clearAuth(); } catch (_) {}

        setTimeout(() => {
            const params = new URLSearchParams(window.location.search);
            const rawTarget = params.get("redirect") || params.get("returnTo") || "index.html";
            const target = safeRedirectTarget(rawTarget);
            const next = new URLSearchParams();
            next.set("returnTo", target);
            const inviteToken = String(params.get("adminInviteToken") || "").trim();
            const inviteEmail = String(params.get("adminInviteEmail") || "").trim();
            if (inviteToken) next.set("adminInviteToken", inviteToken);
            if (inviteEmail) next.set("adminInviteEmail", inviteEmail);
            window.location.href = "login.html?" + next.toString();
        }, 1200);

    } catch (err) {
        showModal("Connection Error", "Could not connect to the server. Please try again.", "error");
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
document.addEventListener("DOMContentLoaded", async () => {
    const redirected = await redirectIfAlreadyAuthed();
    if (redirected) return;

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

    // Initialize Google Sign-In
    __initGoogleSignIn();

    const urlReason = new URLSearchParams(window.location.search).get("reason");
    if (urlReason === "session_expired") {
        try { if (window.tstsNotify) window.tstsNotify("Your session has expired. Please log in to continue.", "info"); } catch (_) {}
    }
});
