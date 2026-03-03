(function () {
  const form = document.getElementById("report-form");
  const alertEl = document.getElementById("alert");
  const submitBtn = document.getElementById("submit-btn");

  const targetTypeEl = document.getElementById("targetType");
  const targetIdEl = document.getElementById("targetId");
  const categoryEl = document.getElementById("category");
  const messageEl = document.getElementById("message");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      const sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    const returnTarget = String((location.pathname || "report.html") + (location.search || "")).replace(/^\//, "");
    const returnTo = encodeURIComponent(returnTarget || "report.html");
    location.href = "login.html?returnTo=" + returnTo;
    return false;
  }

  function setAlert(type, msg) {
    if (!alertEl) return;
    alertEl.classList.remove("hidden");
    alertEl.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    alertEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    const t = String(type || "error");
    if (t === "success") alertEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    else alertEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    alertEl.textContent = String(msg || "");
  }

  function fillFromUrl() {
    try {
      const q = new URLSearchParams(location.search);
      const tt = q.get("targetType");
      const tid = q.get("targetId");
      if (tt && targetTypeEl) targetTypeEl.value = String(tt);
      // FIX-06: Validate targetId — must be a 24-char hex (MongoDB ObjectId)
      var validId = tid && /^[0-9a-fA-F]{24}$/.test(String(tid).trim());
      if (validId && targetIdEl) {
        targetIdEl.value = String(tid).trim();
        targetIdEl.readOnly = true;
        targetIdEl.classList.add("bg-gray-100", "cursor-not-allowed");
      } else {
        // No valid target — show guidance, disable form
        var helper = document.getElementById("targetId-helper");
        if (helper) {
          helper.textContent = "To report an issue, use the report button on the relevant experience or profile.";
          helper.classList.remove("hidden");
          helper.classList.add("text-sm", "text-slate-500", "text-center", "py-4");
        }
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = true; });
        }
      }
    } catch (_) {}
  }

  async function submit(e) {
    e.preventDefault();
    if (!(await requireAuth())) return;

    const payload = {
      targetType: targetTypeEl ? String(targetTypeEl.value || "").trim() : "",
      targetId: targetIdEl ? String(targetIdEl.value || "").trim() : "",
      category: categoryEl ? String(categoryEl.value || "").trim() : "",
      message: messageEl ? String(messageEl.value || "").trim() : ""
    };

    if (!payload.targetId) {
      setAlert("error", "Target ID must be provided via URL parameter.");
      return;
    }

    if (!payload.targetType || !payload.category) {
      setAlert("error", "Please fill the required fields.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    try {
      const res = await window.authFetch("/api/moderation/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.message) ? data.message : "Report failed");

      setAlert("success", "Report submitted. Thank you.");
      if (form) form.reset();
    } catch (err) {
      setAlert("error", (err && err.message) ? err.message : "Report failed");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await requireAuth())) return;
    fillFromUrl();
    if (form) form.addEventListener("submit", submit);
  });
})();
