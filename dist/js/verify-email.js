(function () {
  if (window.__TSTS_VERIFY_EMAIL_RAN__) return;
  window.__TSTS_VERIFY_EMAIL_RAN__ = true;

  var loadingEl = document.getElementById("state-loading");
  var successEl = document.getElementById("state-success");
  var errorEl = document.getElementById("state-error");
  var errorMsgEl = document.getElementById("error-message");
  var resendBtn = document.getElementById("resend-btn");
  var resendInFlight = false;

  function show(el) { try { if (el) el.classList.remove("hidden"); } catch (_) {} }
  function hide(el) { try { if (el) el.classList.add("hidden"); } catch (_) {} }

  function setError(msg) {
    hide(loadingEl);
    hide(successEl);
    show(errorEl);
    try { if (errorMsgEl) errorMsgEl.textContent = String(msg || "Verification failed."); } catch (_) {}
  }

  function setSuccess() {
    hide(loadingEl);
    hide(errorEl);
    show(successEl);
  }

  function parseHash() {
    var raw = String(location.hash || "");
    var hash = raw.startsWith("#") ? raw.slice(1) : raw;
    var qs = new URLSearchParams(hash || "");
    var token = qs.get("token") || "";
    var email = qs.get("email") || "";
    return { token: String(token || ""), email: String(email || "") };
  }

  function scrubUrlToken() {
    try {
      var u = new URL(location.href);
      if (u.hash) {
        var h = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
        var qs = new URLSearchParams(h || "");
        if (qs.has("token")) {
          qs.delete("token");
          var nh = qs.toString();
          u.hash = nh ? ("#" + nh) : "";
          history.replaceState(null, "", u.toString());
        }
      }
    } catch (_) {}
  }

  function authFetch(path, opts) {
    if (window.authFetch) return window.authFetch(path, opts);
    var base = String(window.API_BASE || "");
    var url = base + String(path || "");
    var o = opts || {};
    o.credentials = "include";
    return fetch(url, o);
  }

  function goLogin(returnTo) {
    try {
      var rt = encodeURIComponent(String(returnTo || "verify-email.html"));
      location.replace("login.html?returnTo=" + rt);
    } catch (_) {}
  }

  function verify() {
    hide(successEl);
    hide(errorEl);
    show(loadingEl);

    var parsed = parseHash();
    var token = parsed.token;

    if (!token) {
      setError("Missing verification token. Please open the link from your email again.");
      return;
    }

    scrubUrlToken();

    authFetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token })
    })
      .then(function (res) {
        if (!res || !res.ok) {
          return res && res.json ? res.json().catch(function () { return null; }) : Promise.resolve(null);
        }
        return res.json ? res.json().catch(function () { return {}; }) : Promise.resolve({});
      })
      .then(function (payload) {
        var ok = false;
        try {
          if (payload && payload.ok === true) ok = true;
          if (payload && payload.data && payload.data.ok === true) ok = true;
        } catch (_) {}

        if (ok) {
          setSuccess();
          return;
        }

        var msg = "Verification failed.";
        try {
          msg = (payload && payload.message) ? String(payload.message) : msg;
        } catch (_) {}
        setError(msg);
      })
      .catch(function () {
        setError("Verification failed due to a network error. Please try again.");
      });
  }

  function wireResend() {
    if (!resendBtn) return;
    resendBtn.addEventListener("keydown", function (e) {
      if (!resendInFlight) return;
      if (e && (e.key === "Enter" || e.keyCode === 13)) {
        try { e.preventDefault(); } catch (_) {}
      }
    });
    resendBtn.addEventListener("click", function (e) {
      try { e.preventDefault(); } catch (_) {}
      if (resendInFlight) return;

      var parsed = parseHash();
      var email = parsed.email;

      if (!email) {
        setError("Missing email in the verification link. Please log in and request a new verification email.");
        return;
      }

      resendInFlight = true;
      try {
        resendBtn.disabled = true;
        resendBtn.setAttribute("aria-busy", "true");
      } catch (_) {}

      authFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      })
        .then(function (res) { return res && res.json ? res.json().catch(function () { return null; }) : Promise.resolve(null); })
        .then(function (payload) {
          var msg = "If an account exists for this email, a new verification email will be sent.";
          try { if (payload && payload.message) msg = String(payload.message); } catch (_) {}
          setError(msg);
        })
        .catch(function () {
          setError("Could not resend verification email due to a network error.");
        })
        .finally(function () {
          resendInFlight = false;
          try {
            resendBtn.disabled = false;
            resendBtn.removeAttribute("aria-busy");
          } catch (_) {}
        });
    });
  }

  try {
    wireResend();
    verify();
  } catch (_) {
    setError("Verification failed.");
  }
})();
