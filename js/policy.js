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
  const pricingVersionEl = document.getElementById("policy-pricing-version");
  const refundVersionEl = document.getElementById("policy-refund-version");
  const tierTableBodyEl = document.getElementById("policy-tier-table-body");
  const refundTableBodyEl = document.getElementById("policy-refund-window-table-body");

  function showOnly(which) {
    const all = [loadingEl, errorEl, contentEl];
    all.forEach((el) => { if (el) el.classList.add("hidden"); });
    if (which && which.classList) which.classList.remove("hidden");
  }

  function pct(x) {
    const n = Number(x);
    if (!isFinite(n)) return "—";
    if (n >= 0 && n <= 1) return Math.round(n * 100) + "%";
    return Math.round(n) + "%";
  }

  function pctFromBps(bpsRaw) {
    const bps = Number(bpsRaw);
    if (!isFinite(bps)) return "—";
    return (bps / 100).toFixed(2).replace(/\.00$/, "") + "%";
  }

  function moneyFromCents(centsRaw) {
    const cents = Number(centsRaw);
    if (!isFinite(cents)) return "—";
    return "$" + (cents / 100).toFixed(2);
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function appendCell(row, value, className) {
    const cell = document.createElement("td");
    cell.className = className || "px-3 py-2 text-gray-700";
    cell.textContent = String(value == null ? "—" : value);
    row.appendChild(cell);
  }

  function renderTierRows(policy) {
    clearNode(tierTableBodyEl);
    if (!tierTableBodyEl) return;
    const tiers = Array.isArray(policy && policy.tiers) ? policy.tiers : [];
    const active = tiers.filter((t) => String((t && t.status) || "active").toLowerCase() === "active");
    if (active.length === 0) {
      const row = document.createElement("tr");
      appendCell(row, "No active tiers", "px-3 py-3 text-gray-500");
      appendCell(row, "—");
      appendCell(row, "—");
      appendCell(row, "—");
      tierTableBodyEl.appendChild(row);
      return;
    }
    active.forEach((tier, idx) => {
      const minCents = Number((tier && tier.minValueCents) != null ? tier.minValueCents : 0);
      const maxRaw = tier ? tier.maxValueCents : null;
      const maxText = (maxRaw == null) ? "and above" : moneyFromCents(Number(maxRaw));
      const rangeText = moneyFromCents(minCents) + " to " + maxText;
      const row = document.createElement("tr");
      appendCell(row, "Tier " + String(idx + 1));
      appendCell(row, rangeText);
      appendCell(row, moneyFromCents(Number(tier && tier.fixedFeeCents)));
      appendCell(row, pctFromBps(Number(tier && tier.percentageFeeBps)));
      tierTableBodyEl.appendChild(row);
    });
  }

  function renderRefundWindows(policy) {
    clearNode(refundTableBodyEl);
    if (!refundTableBodyEl) return;
    const windows = Array.isArray(policy && policy.windows) ? policy.windows : [];
    const active = windows.filter((w) => String((w && w.status) || "active").toLowerCase() === "active");
    if (active.length === 0) {
      const row = document.createElement("tr");
      appendCell(row, "No active windows", "px-3 py-3 text-gray-500");
      appendCell(row, "—");
      appendCell(row, "—");
      refundTableBodyEl.appendChild(row);
      return;
    }
    active.forEach((win, idx) => {
      const minH = Number((win && win.minHoursBeforeEvent) != null ? win.minHoursBeforeEvent : 0);
      const maxHRaw = win ? win.maxHoursBeforeEvent : null;
      let windowText = "";
      if (maxHRaw == null) windowText = String(minH) + "+ hours";
      else windowText = String(minH) + " to " + String(Number(maxHRaw)) + " hours";
      const row = document.createElement("tr");
      appendCell(row, "Window " + String(idx + 1));
      appendCell(row, windowText);
      appendCell(row, pctFromBps(Number(win && win.refundPercentageBps)));
      refundTableBodyEl.appendChild(row);
    });
  }

  async function load() {
    showOnly(loadingEl);
    try {
      const res = await window.authFetch("/api/policy/active", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload || payload.ok !== true) throw new Error("policy");

      const p = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
      const pricingPolicy = (payload.data && payload.data.pricingPolicy) ? payload.data.pricingPolicy : {};
      const refundPolicy = (payload.data && payload.data.refundPolicy) ? payload.data.refundPolicy : {};
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
      if (pricingVersionEl) pricingVersionEl.textContent = String(pricingPolicy.version || "—");
      if (refundVersionEl) refundVersionEl.textContent = String(refundPolicy.version || "—");
      renderTierRows(pricingPolicy);
      renderRefundWindows(refundPolicy);

      showOnly(contentEl);
    } catch (err) {
      console.warn("[TSTS] Policy load failed:", err);
      showOnly(errorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (retryBtn) retryBtn.addEventListener("click", load);
    load();
  });
})();
