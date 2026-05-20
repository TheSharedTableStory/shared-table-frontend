// REAL coverage for js/policy.js — exercises the load + render flow against
// a jsdom-mounted DOM with a stubbed window.authFetch.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "policy.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="state-loading">Loading…</div>
    <div id="state-error" class="hidden">Error</div>
    <div id="content" class="hidden">
      <span id="policy-version"></span>
      <span id="policy-effective"></span>
      <span id="policy-currency"></span>
      <span id="policy-free-cancel"></span>
      <span id="policy-guest-max"></span>
      <span id="policy-host"></span>
      <span id="policy-pricing-version"></span>
      <span id="policy-refund-version"></span>
      <table>
        <tbody id="policy-tier-table-body"></tbody>
      </table>
      <table>
        <tbody id="policy-refund-window-table-body"></tbody>
      </table>
      <button id="retry-btn">Retry</button>
    </div>
  `;
}

async function loadModule(authFetchImpl) {
  buildScaffold();
  window.authFetch = authFetchImpl;

  // Capture the DOMContentLoaded handler the script registers so we can
  // invoke it exactly once per test (avoids accumulation across runs).
  let captured = null;
  const origAdd = document.addEventListener;
  document.addEventListener = function (type, handler, ...rest) {
    if (type === "DOMContentLoaded" && captured === null) {
      captured = handler;
      return;
    }
    return origAdd.call(this, type, handler, ...rest);
  };
  try {
    new Function(SRC)();
  } finally {
    document.addEventListener = origAdd;
  }
  if (typeof captured === "function") captured(new Event("DOMContentLoaded"));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function jsonRes(body) {
  return {
    ok: true,
    json: async () => body,
  };
}

function failRes(status, body) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

describe("policy.js — successful load", () => {
  test("populates version + effective + currency from response", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: {
        policy: {
          version: "2026-04-01",
          effectiveFrom: "2026-04-01",
          rules: {
            currency: "aud",
            guestFreeCancelHours: 168,
            guestMaxRefundPercent: 1.0,
            hostRefundPercent: 1.0,
          },
        },
        pricingPolicy: { version: "p1", tiers: [] },
        refundPolicy: { version: "r1", windows: [] },
      },
    }));

    expect(document.getElementById("policy-currency").textContent).toBe("AUD");
    expect(document.getElementById("policy-free-cancel").textContent).toContain("168");
    expect(document.getElementById("policy-guest-max").textContent).toBe("100%");
    expect(document.getElementById("policy-host").textContent).toBe("100%");
  });

  test("shows content section + hides loading + error", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: {
        policy: { version: "v", effectiveFrom: "2026-01-01", rules: { currency: "aud" } },
        pricingPolicy: { tiers: [] },
        refundPolicy: { windows: [] },
      },
    }));

    expect(document.getElementById("state-loading").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("content").classList.contains("hidden")).toBe(false);
  });

  test("renders pricing tier rows from active tiers only", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: {
        policy: { rules: {} },
        pricingPolicy: {
          tiers: [
            { minValueCents: 0, maxValueCents: 10000, fixedFeeCents: 500, percentageFeeBps: 1000, status: "active" },
            { minValueCents: 10000, maxValueCents: null, fixedFeeCents: 1000, percentageFeeBps: 800, status: "active" },
            { minValueCents: 0, maxValueCents: 5000, fixedFeeCents: 100, percentageFeeBps: 500, status: "inactive" },
          ],
        },
        refundPolicy: { windows: [] },
      },
    }));

    const tbody = document.getElementById("policy-tier-table-body");
    expect(tbody.children.length).toBe(2);
    // Active tiers labelled "Tier 1" and "Tier 2".
    expect(tbody.textContent).toContain("Tier 1");
    expect(tbody.textContent).toContain("Tier 2");
    // Inactive tier excluded.
    expect(tbody.textContent.split("Tier").length - 1).toBe(2);
  });

  test("renders refund window rows", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: {
        policy: { rules: {} },
        pricingPolicy: { tiers: [] },
        refundPolicy: {
          windows: [
            { minHoursBeforeEvent: 168, maxHoursBeforeEvent: null, refundPercentageBps: 10000, status: "active" },
            { minHoursBeforeEvent: 24, maxHoursBeforeEvent: 167, refundPercentageBps: 5000, status: "active" },
            { minHoursBeforeEvent: 0, maxHoursBeforeEvent: 23, refundPercentageBps: 0, status: "active" },
          ],
        },
      },
    }));

    const tbody = document.getElementById("policy-refund-window-table-body");
    expect(tbody.children.length).toBe(3);
    expect(tbody.textContent).toContain("Window 1");
    expect(tbody.textContent).toContain("Window 2");
    expect(tbody.textContent).toContain("Window 3");
    // First window: 168+ hours
    expect(tbody.textContent).toContain("168+ hours");
    // Last window: 0 to 23 hours
    expect(tbody.textContent).toContain("0 to 23 hours");
  });

  test("empty tiers shows 'No active tiers' row", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: { policy: { rules: {} }, pricingPolicy: { tiers: [] }, refundPolicy: { windows: [] } },
    }));
    const tbody = document.getElementById("policy-tier-table-body");
    expect(tbody.textContent).toContain("No active tiers");
  });

  test("empty refund windows shows 'No active windows' row", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: { policy: { rules: {} }, pricingPolicy: { tiers: [] }, refundPolicy: { windows: [] } },
    }));
    const tbody = document.getElementById("policy-refund-window-table-body");
    expect(tbody.textContent).toContain("No active windows");
  });
});

describe("policy.js — error path", () => {
  test("server returns ok:false → error state visible", async () => {
    await loadModule(async () => jsonRes({ ok: false, error: "POLICY_NOT_FOUND" }));
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("content").classList.contains("hidden")).toBe(true);
  });

  test("HTTP non-ok response → error state visible", async () => {
    await loadModule(async () => failRes(500, {}));
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("fetch throws → error state visible", async () => {
    await loadModule(async () => { throw new Error("network"); });
    expect(document.getElementById("state-error").classList.contains("hidden")).toBe(false);
  });

  test("retry button re-fires load() on click", async () => {
    let calls = 0;
    await loadModule(async () => {
      calls += 1;
      return jsonRes({ ok: true, data: { policy: { rules: {} }, pricingPolicy: { tiers: [] }, refundPolicy: { windows: [] } } });
    });
    expect(calls).toBe(1);
    document.getElementById("retry-btn").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});

describe("policy.js — formatting helpers (exercised via render)", () => {
  test("percent helper handles 0..1 range (0.5 → 50%)", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: { policy: { rules: { guestMaxRefundPercent: 0.5, hostRefundPercent: 0.95 } }, pricingPolicy: { tiers: [] }, refundPolicy: { windows: [] } },
    }));
    expect(document.getElementById("policy-guest-max").textContent).toBe("50%");
    expect(document.getElementById("policy-host").textContent).toBe("95%");
  });

  test("percent helper handles >1 range (75 → 75%)", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: { policy: { rules: { guestMaxRefundPercent: 75 } }, pricingPolicy: { tiers: [] }, refundPolicy: { windows: [] } },
    }));
    expect(document.getElementById("policy-guest-max").textContent).toBe("75%");
  });

  test("money helper formats cents as $N.MM", async () => {
    await loadModule(async () => jsonRes({
      ok: true,
      data: {
        policy: { rules: {} },
        pricingPolicy: {
          tiers: [{ minValueCents: 12345, maxValueCents: 67890, fixedFeeCents: 500, percentageFeeBps: 1000, status: "active" }],
        },
        refundPolicy: { windows: [] },
      },
    }));
    const tbody = document.getElementById("policy-tier-table-body");
    expect(tbody.textContent).toContain("$123.45 to $678.90");
    expect(tbody.textContent).toContain("$5.00");
    expect(tbody.textContent).toContain("10%");
  });
});
