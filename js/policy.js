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

  // The platform is not AUD-only: it supports ten currencies, every listing carries its own, and an
  // admin chooses which are enabled. So neither the scale nor the symbol may be assumed here.
  // Decimals mirror CURRENCY_DECIMALS in the backend's pricing.js — the single source of truth for
  // minor-unit scale — and the symbols mirror the map host.js already ships. An unmapped code falls
  // back to a "CODE " prefix, which is unambiguous rather than a misleading "$".
  const POLICY_CCY_DECIMALS = { aud: 2, nzd: 2, usd: 2, gbp: 2, eur: 2, cad: 2, inr: 2, jpy: 0, chf: 2, sgd: 2 };
  const POLICY_CCY_SYMBOL = {
    aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
    eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF "
  };

  // This is the PUBLIC fee schedule — the page a guest opens to check what they will be charged.
  // It printed a bare "$" and divided by a fixed 100, which is wrong for a zero-decimal currency.
  // Symbol and scale both come from the currency, and the fallback used when Intl refuses names the
  // right currency too — it used to say A$ whatever the currency actually was.
  function moneyFromCents(centsRaw, currencyRaw) {
    const cents = Number(centsRaw);
    if (!isFinite(cents)) return "—";
    const currency = String(currencyRaw || "aud").trim().toLowerCase() || "aud";
    const decimals = Object.prototype.hasOwnProperty.call(POLICY_CCY_DECIMALS, currency)
      ? POLICY_CCY_DECIMALS[currency]
      : 2;
    const major = cents / Math.pow(10, decimals);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        currencyDisplay: "symbol",
      }).format(major);
    } catch (_fmtErr) {
      void _fmtErr;
      const symbol = POLICY_CCY_SYMBOL[currency] || (currency.toUpperCase() + " ");
      return symbol + major.toFixed(decimals);
    }
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

  function renderTierRows(policy, currency) {
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
      const maxText = (maxRaw == null) ? "and above" : moneyFromCents(Number(maxRaw), currency);
      const rangeText = moneyFromCents(minCents, currency) + " to " + maxText;
      const row = document.createElement("tr");
      appendCell(row, "Tier " + String(idx + 1));
      appendCell(row, rangeText);
      appendCell(row, moneyFromCents(Number(tier && tier.fixedFeeCents), currency));
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

      var fmt = window.tstsFormatDateShort || function(v) {
        if (!v) return "";
        try { var d = new Date(v); return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); } catch(_) { return String(v); }
      };
      if (vEl) vEl.textContent = fmt(p.version) || "—";
      if (effEl) {
        var d = fmt(p.effectiveFrom);
        effEl.textContent = d ? ("Effective from: " + d) : "";
      }
      if (curEl) curEl.textContent = String(rules.currency || "aud").toUpperCase();
      if (freeEl) freeEl.textContent = String(Number(rules.guestFreeCancelHours || 0)) + " hours";
      if (gmaxEl) gmaxEl.textContent = pct(rules.guestMaxRefundPercent);
      if (hostEl) hostEl.textContent = pct(rules.hostRefundPercent);
      // 2026-08-25: this printed a date next to "Active tier pricing version" even when the table
      // below it read "No active tiers" — announcing a live version for content that does not exist,
      // and the date shown was just the policy record's own timestamp reused. Say what is true instead.
      // Uses the SAME active-tier filter as renderTierRows() so the label and the table cannot disagree.
      if (pricingVersionEl) {
        var __pt = Array.isArray(pricingPolicy && pricingPolicy.tiers) ? pricingPolicy.tiers : [];
        var __ptActive = __pt.filter(function (t) { return String((t && t.status) || "active").toLowerCase() === "active"; });
        pricingVersionEl.textContent = __ptActive.length ? (fmt(pricingPolicy.version) || "—") : "Not configured";
      }
      if (refundVersionEl) refundVersionEl.textContent = fmt(refundPolicy.version) || "—";
      renderTierRows(pricingPolicy, rules.currency);
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
