(function () {
  const form = document.getElementById("reset-form");
  const newPasswordEl = document.getElementById("newPassword");
  const confirmPasswordEl = document.getElementById("confirmPassword");
  const submitBtn = document.getElementById("submit-btn");
  const alertEl = document.getElementById("alert");

  function setAlert(type, msg) {
    if (!alertEl) return;
    alertEl.classList.remove("hidden");
    alertEl.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    alertEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    const t = String(type || "info");
    if (t === "success") {
      alertEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    } else {
      alertEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    }
    alertEl.textContent = String(msg || "");
  }

  let urlEmail = "";
  let urlToken = "";
  function parseUrlParams() {
    let email = "";
    let token = "";

    try {
      const rawHash = (location.hash || "");
      const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
      const h = new URLSearchParams(hash || "");
      const ht = h.get("token");
      const he = h.get("email");
      if (ht) token = String(ht);
      if (he) email = String(he);
    } catch (_) {}

    try {
      const q = new URLSearchParams(location.search || "");
      const se = q.get("email");
      if (!email && se) email = String(se);
    } catch (_) {}

    try {
      if (token) {
        const u = new URL(location.href);
        if (u.hash) {
          const hh = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
          const qs = new URLSearchParams(hh || "");
          if (qs.has("token")) {
            qs.delete("token");
            const nh = qs.toString();
            u.hash = nh ? ("#" + nh) : "";
            history.replaceState(null, "", u.toString());
          }
        }
      }
    } catch (_) {}

    return { email, token };
  }

function scrubUrlToken() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("token")) {
      u.searchParams.delete("token");
      const clean = u.pathname + (u.searchParams.toString() ? ("?" + u.searchParams.toString()) : "") + u.hash;
      history.replaceState({}, document.title, clean);
    }
  } catch (_) {}

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

function fillFromUrl() {
  try {
    const p = parseUrlParams();
    urlEmail = p.email ? String(p.email) : "";
    urlToken = p.token ? String(p.token) : "";
    if (!urlToken) {
      setAlert("error", "This reset link is incomplete or expired. Please request a new password reset link and try again.");
      setSubmitEnabled(false);
      return;
    }
    setSubmitEnabled(true);
    scrubUrlToken();
  } catch (_) {}
}

  async function submit(e) {
    e.preventDefault();

    const email = urlEmail ? String(urlEmail).trim().toLowerCase() : "";
    const token = urlToken ? String(urlToken).trim() : "";
    const newPassword = (newPasswordEl && newPasswordEl.value) ? String(newPasswordEl.value) : "";
    const confirmPassword = (confirmPasswordEl && confirmPasswordEl.value) ? String(confirmPasswordEl.value) : "";

    if (!token || !newPassword || !confirmPassword) {
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

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Resetting...";
    }

    try {
      const payload = {
        token,
        newPassword,
        confirmPassword
      };
      if (email) payload.email = email;
      const res = await window.authFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAlert("error", (data && data.message) ? data.message : "Password reset failed.");
        return;
      }

      setAlert("success", "Password updated. Redirecting to login...");
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      setTimeout(() => { location.href = "login.html"; }, 900);
    } catch (_) {
      setAlert("error", "Network error. Please try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Reset Password";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillFromUrl();
    if (form) form.addEventListener("submit", submit);
  });
})();
