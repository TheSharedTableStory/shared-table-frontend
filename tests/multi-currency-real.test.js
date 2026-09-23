// MULTI-CURRENCY — REAL coverage, 2026-08-21.
//
// WHY THIS FILE EXISTS. sir asked: "and who said the platform has only A$ currency and cant be
// used for other currency?" The answer was that nobody did — the backend's CURRENCY_DECIMALS
// (Shared-Story-backend/pricing.js) lists TEN supported currencies, every listing and booking
// carries its own `currency`, and an admin chooses which are enabled. AUD is the default, not the
// only one. Several frontend money helpers nevertheless wrote "A$" (or a bare "$") as a literal in
// the path taken when Intl is unavailable, so a ¥ / € / £ listing would have been labelled with the
// wrong currency entirely — the most dangerous kind of money bug, because the NUMBER looks right.
//
// These tests execute the REAL functions out of the shipped files (sliced and materialised, the
// same technique tests/bug-071 and bug-173 use) rather than pattern-matching the source, and they
// exercise BOTH paths: the normal Intl path and the fallback path with Intl forced to fail.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const js = (name) => readFileSync(resolve(__dirname, "..", "js", name), "utf-8");

const POLICY_SRC = js("policy.js");
const EXPERIENCE_SRC = js("experience.js");
const MY_BOOKINGS_SRC = js("my-bookings.js");
const EXPLORE_SRC = js("explore.js");
const ADMIN_SRC = js("admin.js");

// The ten the platform supports, mirrored from the backend's CURRENCY_DECIMALS.
const SUPPORTED = ["aud", "nzd", "usd", "gbp", "eur", "cad", "inr", "jpy", "chf", "sgd"];

// Slice a region of a shipped file and materialise it, returning the named bindings.
function materialise(src, startMarker, endMarker, returnExpr) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error("start marker not found: " + startMarker);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error("end marker not found: " + endMarker);
  const slice = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(slice + "\nreturn (" + returnExpr + ");")();
}

// Same as materialise, but with collaborators injected as named parameters — the pattern
// tests/bug-173 and bug-175 use when a sliced function depends on helpers defined elsewhere in the
// file. Injecting the REAL helper (materialised from the same source) keeps this genuine execution
// rather than a stub.
function materialiseWith(src, startMarker, endMarker, returnExpr, deps) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error("start marker not found: " + startMarker);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error("end marker not found: " + endMarker);
  const slice = src.slice(start, end);
  const names = Object.keys(deps || {});
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, slice + "\nreturn (" + returnExpr + ");");
  return factory(...names.map((n) => deps[n]));
}

// Run a function with Intl.NumberFormat forced to throw, so the fallback branch is the one executed.
function withIntlBroken(fn) {
  const realIntl = globalThis.Intl;
  globalThis.Intl = {
    NumberFormat: function () { throw new Error("Intl unavailable in this environment"); }
  };
  try {
    return fn();
  } finally {
    globalThis.Intl = realIntl;
  }
}

// The admin panel's money helpers, materialised once from the shipped file. They sit at module
// scope because more than one describe block below executes them (formatCurrencyValue needs a
// collaborator injected, so it is materialised separately in its own test).
const admin = materialiseWith(
  ADMIN_SRC,
  "const __ADMIN_CCY_DECIMALS",
  "// Why a report was raised",
  "{ __adminMoney, __adminMoneyExact, __adminCurrencyDecimals, __ADMIN_CCY_SYMBOL }",
  { toNumberOrNull: (v) => (Number.isFinite(Number(v)) ? Number(v) : null) }
);

// Every symbol the site may legitimately print, per host.js's established map.
const EXPECTED_SYMBOL = {
  aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
  eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF"
};

describe("the platform is multi-currency, and the frontend must not assume AUD", () => {
  test("the supported set is ten currencies, not one", () => {
    // Guards the premise itself: if someone reduces the platform to AUD-only, this test should be
    // the thing that forces the conversation, rather than the maps silently drifting apart.
    expect(SUPPORTED).toHaveLength(10);
    expect(SUPPORTED).toContain("jpy");
    expect(SUPPORTED).toContain("eur");
  });

  describe("policy.js — the PUBLIC fee schedule a guest opens to check what they will be charged", () => {
    const moneyFromCents = materialise(
      POLICY_SRC,
      "const POLICY_CCY_DECIMALS",
      "function clearNode",
      "moneyFromCents"
    );

    test("each currency renders its own symbol, never a blanket A$", () => {
      for (const ccy of SUPPORTED) {
        const out = moneyFromCents(10000, ccy);
        expect(typeof out).toBe("string");
        expect(out.length).toBeGreaterThan(0);
        if (ccy !== "aud") {
          // The specific regression: a non-AUD fee schedule labelled as Australian dollars.
          expect(out.startsWith("A$")).toBe(false);
        }
      }
    });

    test("a zero-decimal currency is not divided by 100", () => {
      // 2800 minor units of JPY is ¥2,800 — not ¥28.00. Dividing by a fixed 100 understates the
      // amount by 100x on the page that tells a guest what a booking costs.
      const jpy = moneyFromCents(2800, "jpy");
      expect(jpy).toContain("2,800");
      expect(jpy).not.toContain("28.00");

      // And a two-decimal currency still scales the normal way.
      expect(moneyFromCents(2800, "aud")).toContain("28.00");
    });

    test("when Intl is unavailable the fallback still names the RIGHT currency", () => {
      // This is the branch that named Australian dollars for every currency on earth.
      withIntlBroken(() => {
        expect(moneyFromCents(10000, "jpy")).toContain("¥");
        expect(moneyFromCents(10000, "eur")).toContain("€");
        expect(moneyFromCents(10000, "gbp")).toContain("£");
        expect(moneyFromCents(10000, "aud")).toContain("A$");
        // A currency the map does not know is labelled by its CODE, never by a misleading symbol.
        const unknown = moneyFromCents(10000, "zar");
        expect(unknown).toContain("ZAR");
        expect(unknown).not.toContain("$");
      });
    });

    test("the fallback keeps zero-decimal scale too", () => {
      withIntlBroken(() => {
        // ¥2,800 must not become ¥28.00 just because Intl was missing.
        expect(moneyFromCents(2800, "jpy")).toBe("¥2800");
      });
    });
  });

  describe("experience.js — the listing page price voice", () => {
    const tstsFormatPriceSymbol = materialise(
      EXPERIENCE_SRC,
      "var EXP_CCY_SYMBOL",
      "function toFiniteNumber",
      "tstsFormatPriceSymbol"
    );

    test("each currency gets its own symbol on the normal path", () => {
      for (const ccy of SUPPORTED) {
        const out = tstsFormatPriceSymbol(75, ccy);
        if (ccy !== "aud") expect(out.startsWith("A$")).toBe(false);
      }
      expect(tstsFormatPriceSymbol(75, "aud")).toBe("A$75");
    });

    test("the fallback names the right currency instead of a bare dollar", () => {
      // Was `return "$" + n.toFixed(...)` — a ¥ listing would have read "$2800".
      withIntlBroken(() => {
        expect(tstsFormatPriceSymbol(2800, "jpy")).toBe("¥2800");
        expect(tstsFormatPriceSymbol(75, "eur")).toBe("€75");
        expect(tstsFormatPriceSymbol(75, "aud")).toBe("A$75");
        expect(tstsFormatPriceSymbol(75, "usd")).toBe("$75");
      });
    });

    test("the symbol map is declared BEFORE the formatter that reads it", () => {
      // A `var` declared after the function hoists as `undefined`, so the fallback would throw a
      // TypeError instead of falling back. This ordering is load-bearing, not cosmetic.
      const declIdx = EXPERIENCE_SRC.indexOf("var EXP_CCY_SYMBOL = {");
      const useIdx = EXPERIENCE_SRC.indexOf("EXP_CCY_SYMBOL[");
      expect(declIdx).toBeGreaterThan(-1);
      expect(useIdx).toBeGreaterThan(-1);
      expect(declIdx).toBeLessThan(useIdx);
    });
  });

  describe("my-bookings.js — the money a guest and a host read about their own bookings", () => {
    const mod = materialise(
      MY_BOOKINGS_SRC,
      "const __CCY_SYMBOL",
      "function percentLikeToPct",
      "{ toMoney, centsToMoney, __currencyDecimals }"
    );

    test("decimals come from the currency table, not a hand-written jpy check", () => {
      expect(mod.__currencyDecimals("jpy")).toBe(0);
      for (const ccy of SUPPORTED.filter((c) => c !== "jpy")) {
        expect(mod.__currencyDecimals(ccy)).toBe(2);
      }
      // An unknown code defaults to 2 rather than throwing.
      expect(mod.__currencyDecimals("zar")).toBe(2);
    });

    test("centsToMoney scales by the currency, so ¥2,800 is not ¥28.00", () => {
      expect(mod.centsToMoney(2800, "jpy")).toContain("2,800");
      expect(mod.centsToMoney(5500, "aud")).toBe("A$55");
    });

    test("the fallback names the right currency", () => {
      withIntlBroken(() => {
        expect(mod.toMoney(55, "aud")).toBe("A$55");
        expect(mod.toMoney(55, "eur")).toBe("€55");
        expect(mod.toMoney(2800, "jpy")).toBe("¥2800");
        expect(mod.toMoney(55, "zar")).toContain("ZAR");
      });
    });

    test("the symbol map is declared BEFORE the formatter that reads it", () => {
      // `const` after its use sits in the temporal dead zone and throws a ReferenceError.
      const declIdx = MY_BOOKINGS_SRC.indexOf("const __CCY_SYMBOL = {");
      const useIdx = MY_BOOKINGS_SRC.indexOf("__CCY_SYMBOL[");
      expect(declIdx).toBeGreaterThan(-1);
      expect(useIdx).toBeGreaterThan(-1);
      expect(declIdx).toBeLessThan(useIdx);
    });
  });

  describe("explore.js — the price pill on every card", () => {
    test("the symbol map exists at module scope and covers all ten", () => {
      // REGRESSION GUARD: the fallback referenced EXPLORE_CCY_SYMBOL while the map was declared
      // NOWHERE, which is a ReferenceError the moment Intl throws. Executing the declaration is the
      // only way to prove it is really there and really a usable map.
      const map = materialise(
        EXPLORE_SRC,
        "const EXPLORE_CCY_SYMBOL",
        "document.addEventListener",
        "EXPLORE_CCY_SYMBOL"
      );
      expect(map && typeof map).toBe("object");
      for (const ccy of SUPPORTED) {
        expect(typeof map[ccy]).toBe("string");
        expect(map[ccy].trim()).toBe(EXPECTED_SYMBOL[ccy]);
      }
    });

    test("the map is declared before the card renderer can reach it", () => {
      const declIdx = EXPLORE_SRC.indexOf("const EXPLORE_CCY_SYMBOL = {");
      const useIdx = EXPLORE_SRC.indexOf("EXPLORE_CCY_SYMBOL[");
      expect(declIdx).toBeGreaterThan(-1);
      expect(useIdx).toBeGreaterThan(-1);
      expect(declIdx).toBeLessThan(useIdx);
    });
  });
});

describe("the admin panel's money formatters — every figure an admin decides on", () => {
  // FOUND LIVE 2026-08-21 by creating a real ¥2,500 coupon and watching the table print "¥25.00".
  // All three admin formatters divided or multiplied by a fixed 100 and fell back to "A$". The
  // 2026-08-21 sweep had deliberately routed EVERY admin money string through them, so that one
  // assumption mis-stated every zero-decimal figure in the whole panel — funding, fees, refunds,
  // revenue, settlement cases, coupons — by a factor of one hundred, on the screens where an admin
  // approves refunds and waivers.
  test("a zero-decimal currency is scaled by its own base, not by 100", () => {
    // The exact live defect: 2500 minor units of JPY is ¥2,500, never ¥25.00.
    expect(admin.__adminMoneyExact(2500, "jpy")).toBe("¥2,500");
    expect(admin.__adminMoney(2500, "jpy")).toBe("¥2,500");
    expect(admin.__adminMoneyExact(2500, "jpy")).not.toContain("25.00");
  });

  test("sir's always-show-cents rule still holds for two-decimal currencies", () => {
    // The ledger rule is about lining decimal points up in a column; it must survive this fix.
    expect(admin.__adminMoneyExact(5500, "aud")).toBe("A$55.00");
    expect(admin.__adminMoneyExact(7944550, "aud")).toBe("A$79,445.50");
    expect(admin.__adminMoneyExact(0, "aud")).toBe("A$0.00");
  });

  test("decimals come from the shared table for all ten", () => {
    expect(admin.__adminCurrencyDecimals("jpy")).toBe(0);
    for (const ccy of SUPPORTED.filter((c) => c !== "jpy")) {
      expect(admin.__adminCurrencyDecimals(ccy)).toBe(2);
    }
  });

  test("major units typed on screen convert at the currency's own scale", () => {
    // formatCurrencyValue takes MAJOR units and leans on toNumberOrNull, which lives elsewhere in
    // admin.js — injected here rather than stubbed, so the real conversion is what runs.
    const formatCurrencyValue = materialiseWith(
      ADMIN_SRC,
      "const __ADMIN_CCY_DECIMALS",
      "// Why a report was raised",
      "formatCurrencyValue",
      { toNumberOrNull: (v) => (Number.isFinite(Number(v)) ? Number(v) : null) }
    );
    // 2500 yen must not become 250,000 minor units.
    expect(formatCurrencyValue(2500, "jpy")).toBe("¥2,500");
    expect(formatCurrencyValue(55, "aud")).toBe("A$55.00");
  });

  test("the fallback names the right currency instead of always A$", () => {
    withIntlBroken(() => {
      expect(admin.__adminMoneyExact(2500, "jpy")).toBe("¥2500");
      expect(admin.__adminMoneyExact(5500, "eur")).toBe("€55.00");
      expect(admin.__adminMoneyExact(5500, "aud")).toBe("A$55.00");
    });
  });

  test("the admin symbol map covers all ten and agrees with the rest of the site", () => {
    for (const ccy of SUPPORTED) {
      expect(typeof admin.__ADMIN_CCY_SYMBOL[ccy]).toBe("string");
      expect(admin.__ADMIN_CCY_SYMBOL[ccy].trim()).toBe(EXPECTED_SYMBOL[ccy]);
    }
  });
});

describe("the coupon currency picker — the feature gap sir refused to tolerate", () => {
  // The promo schema has always carried a `currency`, and the UPDATE route already clamped it to
  // the enabled set, but the create form never sent one — so every coupon the panel could produce
  // was AUD and the money labels said "(A$)" as a statement of fact rather than a choice. There was
  // no way to give a fixed discount on a € or ¥ listing at all. Built 2026-08-21 on sir's order.
  // Proven live end to end: picked Japanese yen, typed 2500, and the table rendered "¥2,500";
  // reopening Edit showed the currency as yen with "Minimum spend (¥)" and the amount still 2500.

  test("the create form sends the picked currency, converted at that currency's scale", () => {
    const start = ADMIN_SRC.indexOf("async function handleCreateCoupon");
    expect(start).toBeGreaterThan(-1);
    const block = ADMIN_SRC.slice(start, start + 2600);
    expect(block).toMatch(/currency: ccyVal/);
    // The money conversion must be currency-aware, not a bare call that assumes 100.
    expect(block).toMatch(/__adminDollarsToCents\(\$\("coupon-fixed"\)[^,]*,\s*ccyVal\)/);
    expect(block).toMatch(/__adminDollarsToCents\(\$\("coupon-min-subtotal"\)[^,]*,\s*ccyVal\)/);
  });

  test("the dollars-to-minor-units converter respects the currency", () => {
    const toCents = materialiseWith(
      ADMIN_SRC,
      "function __adminDollarsToCents",
      "// One voice for every",
      "__adminDollarsToCents",
      // The REAL decimals helper from the same file, not a stand-in.
      { __adminCurrencyDecimals: materialise(ADMIN_SRC, "const __ADMIN_CCY_DECIMALS", "function __adminCurrencyFallback", "__adminCurrencyDecimals") }
    );
    // Typing 2500 in a yen coupon must store 2500, not 250000.
    expect(toCents("2500", "jpy")).toBe(2500);
    expect(toCents("15.00", "aud")).toBe(1500);
    expect(toCents("15", "aud")).toBe(1500);
    expect(toCents("0", "aud")).toBe(0);
  });

  test("the coupon table renders each coupon in its OWN currency", () => {
    const fmt = materialiseWith(
      ADMIN_SRC,
      "function formatPromoDiscount",
      "function renderStats",
      "formatPromoDiscount",
      // The REAL admin formatter, materialised from the same source.
      { __adminMoneyExact: admin.__adminMoneyExact }
    );
    expect(fmt({ fixedOffCents: 2500, currency: "jpy" })).toBe("¥2,500");
    expect(fmt({ fixedOffCents: 2000, currency: "eur" })).toBe("€20.00");
    expect(fmt({ fixedOffCents: 1500, currency: "aud" })).toBe("A$15.00");
    // A percentage is currency-neutral and must stay that way.
    expect(fmt({ percentOff: 10, currency: "jpy" })).toBe("10%");
    // A coupon written before the field existed still renders in the platform default.
    expect(fmt({ fixedOffCents: 1500 })).toBe("A$15.00");
  });

  test("the picker is fed by the platform's own enabled-currency route", () => {
    // Inventing a local list would let the coupon tab offer a currency the platform cannot take.
    const start = ADMIN_SRC.indexOf("async function __couponLoadCurrencies");
    expect(start).toBeGreaterThan(-1);
    const block = ADMIN_SRC.slice(start, start + 900);
    expect(block).toMatch(/\/api\/pricing\/listing-currencies/);
  });

  test("the edit dialog carries the currency both ways", () => {
    const start = ADMIN_SRC.indexOf("function __couponEditDialog");
    expect(start).toBeGreaterThan(-1);
    // Anchored to the NEXT function rather than a byte count, so the window always covers the whole
    // dialog even as it grows — a fixed slice silently stopped short of the save handler.
    const nextFn = ADMIN_SRC.indexOf("\nasync function handleEditCoupon", start);
    expect(nextFn).toBeGreaterThan(start);
    const block = ADMIN_SRC.slice(start, nextFn);
    // Reads the coupon's currency, and sends it back on save.
    expect(block).toMatch(/var editCcy = String\(p\.currency \|\| "aud"\)/);
    expect(block).toMatch(/currency: editCcy/);
    // Money in and out uses that currency's scale, never a fixed 100.
    expect(block).toMatch(/editScale\(\)/);
    expect(block).not.toMatch(/Math\.round\(amt \* 100\)/);
    expect(block).not.toMatch(/Math\.round\(minSpend \* 100\)/);
  });
});

describe("the frontend currency tables must not drift from the backend's", () => {
  // HONEST NOTE ON WHY THIS BLOCK EXISTS. The decimals helpers were changed from a hand-written
  // `currency === "jpy" ? 0 : 2` to a real table. Revert-probed on 2026-08-21, that change turned
  // out to be UNDETECTABLE by behaviour: today jpy is the only zero-decimal currency in the
  // supported set, so both forms return identical answers for all ten. The change is therefore
  // preventative, not a live bug fix — it only starts to matter when an 11th currency with 0 or 3
  // decimals is enabled (KRW and VND are zero-decimal; BHD, KWD and TND are three-decimal).
  //
  // Rather than leave that as an unprovable claim, these tests give it teeth: the frontend tables
  // are asserted EQUAL to the backend's CURRENCY_DECIMALS, so enabling a new currency in
  // pricing.js without updating the frontend fails here instead of silently mis-scaling money on
  // someone's screen. That is the real protection the table buys.
  const BACKEND_PRICING = readFileSync(
    resolve(__dirname, "..", "..", "Shared-Story-backend", "pricing.js"),
    "utf-8"
  );

  const backendDecimals = materialise(
    BACKEND_PRICING,
    "const CURRENCY_DECIMALS",
    "function currencyDecimals",
    "CURRENCY_DECIMALS"
  );

  test("the backend really is the ten-currency source of truth", () => {
    expect(Object.keys(backendDecimals).sort()).toEqual([...SUPPORTED].sort());
    expect(backendDecimals.jpy).toBe(0);
    expect(backendDecimals.aud).toBe(2);
  });

  test("policy.js's decimal table matches the backend exactly", () => {
    const table = materialise(
      POLICY_SRC,
      "const POLICY_CCY_DECIMALS",
      "const POLICY_CCY_SYMBOL",
      "POLICY_CCY_DECIMALS"
    );
    expect(table).toEqual(backendDecimals);
  });

  test("my-bookings.js's decimal table matches the backend exactly", () => {
    const table = materialise(
      MY_BOOKINGS_SRC,
      "const __CCY_DECIMALS",
      "function __currencyDecimals",
      "__CCY_DECIMALS"
    );
    expect(table).toEqual(backendDecimals);
  });

  test("every symbol map on the site agrees with every other one", () => {
    // Four copies of this map now exist across these files (host.js has shipped two more of them
    // for months). They do not have to be centralised, but they DO have to agree — a listing that
    // reads "A$75" on Explore and "$75" on its own page is exactly the drift this catches.
    const maps = {
      policy: materialise(POLICY_SRC, "const POLICY_CCY_SYMBOL", "// This is the PUBLIC fee schedule", "POLICY_CCY_SYMBOL"),
      experience: materialise(EXPERIENCE_SRC, "var EXP_CCY_SYMBOL", "// Owner-spec 2026-05-04", "EXP_CCY_SYMBOL"),
      myBookings: materialise(MY_BOOKINGS_SRC, "const __CCY_SYMBOL", "// Owner 2026-06-05", "__CCY_SYMBOL"),
      explore: materialise(EXPLORE_SRC, "const EXPLORE_CCY_SYMBOL", "document.addEventListener", "EXPLORE_CCY_SYMBOL")
    };
    const names = Object.keys(maps);
    for (const name of names) {
      expect(Object.keys(maps[name]).sort()).toEqual([...SUPPORTED].sort());
    }
    for (const name of names.slice(1)) {
      expect(maps[name]).toEqual(maps.policy);
    }
  });
});

describe("the host's grouped booking row shows the amount it always should have", () => {
  // FOUND ON SCREEN 2026-08-21: the grouped host card rendered `b.amountTotal ||
  // b.pricing.totalPrice`. NEITHER field exists — the Booking schema stores bookingValueCents /
  // paidAmountCents / amountCents, and `amountTotal` is a Stripe session field the API never sends
  // here. So the amount was ALWAYS an empty string: a host opening a grouped card saw seats,
  // status and attendance, but never what any booking was worth. Proven live: four rows, four
  // empty money spans, then A$55 / A$55 / A$75 / A$75 after the fix, cross-checked against the
  // booking's own detail dialog ("A$55 paid").
  const resolveRefundBaseCents = materialise(
    MY_BOOKINGS_SRC,
    "function resolveRefundBaseCents",
    "function pickUserCancelTier",
    "resolveRefundBaseCents"
  );

  test("the renderer no longer reads fields that do not exist", () => {
    const start = MY_BOOKINGS_SRC.indexOf("function _renderHostSubBookingRow");
    expect(start).toBeGreaterThan(-1);
    const block = MY_BOOKINGS_SRC.slice(start, start + 1800);
    // The dead field names may still appear in the explanatory comment; what must not appear is a
    // live read of them.
    expect(block).not.toMatch(/var paid = b\.amountTotal/);
    expect(block).toMatch(/resolveRefundBaseCents\(b\)/);
    expect(block).toMatch(/centsToMoney\(paidCents, b\.currency\)/);
    // And it must not prepend a bare symbol to an already-formatted string.
    expect(block).not.toMatch(/"\$" \+ paid/);
  });

  test("the resolver reads the fields the API really sends", () => {
    expect(resolveRefundBaseCents({ bookingValueCents: 5500 })).toBe(5500);
    expect(resolveRefundBaseCents({ paidAmountCents: 7500 })).toBe(7500);
    expect(resolveRefundBaseCents({ amountCents: 3000 })).toBe(3000);
    // The fields the old code read are not a source of truth and must not resurrect the bug.
    expect(resolveRefundBaseCents({ amountTotal: 5500 })).toBe(0);
    expect(resolveRefundBaseCents({ pricing: { totalPrice: 55 } })).toBe(0);
    // Nothing to show is an honest zero, which the renderer turns into an empty label.
    expect(resolveRefundBaseCents({})).toBe(0);
  });
});
