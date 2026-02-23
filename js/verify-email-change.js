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
    try { if (errorMsgEl) errorMsgEl.textContent = String(msg || "Confirmation failed."); } catch (_) {}
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
      setError("Missing confirmation token. Please open the link from your email again.");
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

        var msg = "Confirmation failed.";
        try {
          msg = (payload && payload.message) ? String(payload.message) : msg;
        } catch (_) {}
        setError(msg);
      })
      .catch(function () {
        setError("Confirmation failed due to a network error. Please try again.");
      });
  }

  try {
    confirm();
  } catch (_) {
    setError("Confirmation failed.");
  }
})();
