(function () {
  if (window.__TSTS_VERIFY_EMAIL_CHANGE_RAN__) return;
  window.__TSTS_VERIFY_EMAIL_CHANGE_RAN__ = true;

  var loadingEl = document.getElementById("state-loading");
  var successEl = document.getElementById("state-success");
  var successMsgEl = document.getElementById("success-message");
  var errorEl = document.getElementById("state-error");
  var errorMsgEl = document.getElementById("error-message");

  function show(el) { try { if (el) el.classList.remove("hidden"); } catch (_) {} }
  function hide(el) { try { if (el) el.classList.add("hidden"); } catch (_) {} }

  function setError(msg) {
    hide(loadingEl);
    hide(successEl);
    show(errorEl);
    // The old default here was a bare "Confirmation failed." — no reason, no next step. Every live
    // caller below passes a real sentence, so it was unreachable today, but it stays a landmine for
    // the next caller that forgets. Defaulting to the same sentence the other paths use means this
    // screen can never render a system phrase, whoever calls it.
    try { if (errorMsgEl) errorMsgEl.textContent = String(msg || "We couldn't confirm this email change. Open the link from your email again, or start the change from your profile."); } catch (_) {}
  }

  function setSuccess(email) {
    hide(loadingEl);
    hide(errorEl);
    show(successEl);
    if (successMsgEl && email) {
      try {
        successMsgEl.textContent = "Your email has been changed to " + String(email) + ". Please log in with your new email.";
      } catch (_) {}
    }
  }

  function parseHash() {
    var raw = String(location.hash || "");
    var hash = raw.startsWith("#") ? raw.slice(1) : raw;
    var qs = new URLSearchParams(hash || "");
    return String(qs.get("token") || "");
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

  function apiFetch(path, opts) {
    var base = String(window.API_BASE || "");
    var url = base + String(path || "");
    var o = opts || {};
    o.credentials = "include";
    return fetch(url, o);
  }

  function confirm() {
    hide(successEl);
    hide(errorEl);
    show(loadingEl);

    var token = parseHash();

    if (!token) {
      // "token" is developer shorthand and the reader has no idea what is missing or whose fault
      // it is. The unsubscribe page next door already says this properly; match it.
      // Seen on screen 2026-08-22: this sentence OPENED with "This link didn't work." — which is
      // word-for-word the <h1> directly above it, so the reader was told the same thing twice
      // before reaching the part that helps. The heading states the problem; the body's job is
      // the next step. Caused by editing the heading and the body separately and never viewing
      // them together.
      setError("Open the confirmation link straight from your email, and it will bring you back here.");
      return;
    }

    scrubUrlToken();

    apiFetch("/api/auth/confirm-email-change", {
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
        var email = "";
        try {
          if (payload && payload.ok === true) { ok = true; email = (payload.data && payload.data.email) || ""; }
          if (payload && payload.data && payload.data.ok === true) { ok = true; email = payload.data.email || ""; }
        } catch (_) {}

        if (ok) {
          setSuccess(email);
          return;
        }

        // A bare "Confirmation failed." tells the reader nothing they can act on. The server sends its
        // own sentence when it has one; this is the fallback for when it does not.
        var msg = "We couldn't confirm this email change. Open the link from your email again, or start the change from your profile.";
        try {
          msg = (payload && payload.message) ? String(payload.message) : msg;
        } catch (_) {}
        setError(msg);
      })
      .catch(function () {
        // Was "We couldn't reach us just now." — not a sentence anyone would say. Found by reading
        // the file end to end rather than grepping the one string I came here to change.
        setError("We couldn't reach the site just now. Check your connection and open the link again.");
      });
  }

  try {
    confirm();
  } catch (_) {
    setError("We couldn't confirm this email change. Open the link from your email again, or start the change from your profile.");
  }
})();
