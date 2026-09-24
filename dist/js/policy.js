(function () {
  const loadingEl = document.getElementById("state-loading");
  const errorEl = document.getElementById("state-error");
  const contentEl = document.getElementById("content");
  const retryBtn = document.getElementById("retry-btn");

  const vEl = document.getElementById("policy-version");
  const effEl = document.getElementById("policy-effective");
  const curEl = document.getElementById("policy-currency");
  const freeEl = document.getElementById("policy-free-cancel");
  const gmaxEl = document.getElementById("policy-guest-max");
  const hostEl = document.getElementById("policy-host");

  function showOnly(which) {
    const all = [loadingEl, errorEl, contentEl];
    all.forEach((el) => { if (el) el.classList.add("hidden"); });
    if (which && which.classList) which.classList.remove("hidden");
  }

  function pct(x) {
    const n = Number(x);
    if (!isFinite(n)) return "—";
    return Math.round(n * 100) + "%";
  }

  async function load() {
    showOnly(loadingEl);
    try {
      const res = await window.authFetch("/api/policy/active", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload || payload.ok !== true) throw new Error("policy");

      const p = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
      const rules = p.rules || {};

      if (vEl) vEl.textContent = String(p.version || "—");
      if (effEl) {
        const d = (window.tstsFormatDateShort ? window.tstsFormatDateShort(p.effectiveFrom) : "");
        effEl.textContent = d ? ("Effective from: " + d) : "";
      }
      if (curEl) curEl.textContent = String(rules.currency || "aud").toUpperCase();
      if (freeEl) freeEl.textContent = String(Number(rules.guestFreeCancelHours || 0)) + " hours";
      if (gmaxEl) gmaxEl.textContent = pct(rules.guestMaxRefundPercent);
      if (hostEl) hostEl.textContent = pct(rules.hostRefundPercent);

      showOnly(contentEl);
    } catch (_) {
      showOnly(errorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (retryBtn) retryBtn.addEventListener("click", load);
    load();
  });
})();
