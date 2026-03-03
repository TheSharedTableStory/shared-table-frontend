(function () {
  function unmaskAuthGate() {
    try { document.documentElement.removeAttribute("data-auth-pending"); } catch (_) {}
  }

  function redirectToLogin() {
    var returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace("login.html?returnTo=" + returnTo);
  }

	  const form = document.getElementById("create-experience-form");
	  const titleInput = document.getElementById("title");
	  const descriptionInput = document.getElementById("description");
	  const priceInput = document.getElementById("price");
	  const dateInput = document.getElementById("startDate");
	  const endDateInput = document.getElementById("endDate");
	  const timeInput = document.getElementById("startTime");
	  const endTimeInput = document.getElementById("endTime");
	  const locationInput = document.getElementById("city");
	  const suburbInput = document.getElementById("suburb");
	  const postcodeInput = document.getElementById("postcode");
	  const addressLineInput = document.getElementById("addressLine");
	  const addressNotesInput = document.getElementById("addressNotes");
	  const maxGuestsInput = document.getElementById("maxGuests");
	  // availableDays is now a checkbox group, not a single text input
	  const privateEnabledInput = document.getElementById("privateEnabled");
	  const privateConfigFields = document.getElementById("private-config-fields");
	  const privatePriceInput = document.getElementById("privatePrice");
	  const privateCapacityInput = document.getElementById("privateCapacity");
	  const privateIncludedGuestsInput = document.getElementById("privateIncludedGuests");
	  const privateExtraGuestPriceInput = document.getElementById("privateExtraGuestPrice");
	  const verifiedRequestBtn = document.getElementById("verified-request-btn");
	  const verifiedStatusHint = document.getElementById("verified-status-hint");
	  const verifiedRequestMeta = document.getElementById("verified-request-meta");
	  const imageInput = document.getElementById("imageInput");
	  const uploadPreview = document.getElementById("upload-preview");
	  const uploadPlaceholder = document.getElementById("upload-placeholder");
	  const submitBtn = document.getElementById("submit-btn");
      const tagLimitHint = document.getElementById("tag-limit-hint");
  const pricingPublicPerGuestEl = document.getElementById("pricing-public-per-guest");
  const pricingPlatformFeePerGuestEl = document.getElementById("pricing-platform-fee-per-guest");
  const pricingHostPayoutEstimateEl = document.getElementById("pricing-host-payout-estimate");
  const pricingVerifiedImpactEl = document.getElementById("pricing-verified-impact");
  const pricingPrivateSummaryEl = document.getElementById("pricing-private-summary");
  const pricingHostChargeNoteEl = document.getElementById("pricing-host-charge-note");
  const pricingPolicyReferenceEl = document.getElementById("pricing-policy-reference");
  const shortfallRefreshBtn = document.getElementById("shortfall-refresh-btn");
  const shortfallLoadingEl = document.getElementById("shortfall-loading");
  const shortfallEmptyEl = document.getElementById("shortfall-empty");
  const shortfallErrorEl = document.getElementById("shortfall-error");
  const shortfallSlotListEl = document.getElementById("shortfall-slot-list");
  const timezoneInput = document.getElementById("experienceTimezone");
  const cutoffEnabledInput = document.getElementById("bookingCutoffEnabled");
  const cutoffHoursInput = document.getElementById("bookingCutoffHours");
  const cutoffHoursRow = document.getElementById("cutoff-hours-row");
  const cutoffPreviewEl = document.getElementById("cutoff-preview");
  const cutoffLockedBanner = document.getElementById("cutoff-locked-banner");
  const requirementsInput = document.getElementById("requirements");
  const eventDurationMinutesInput = document.getElementById("eventDurationMinutes");
  const discountEnabledInput = document.getElementById("discountEnabled");
  const discountTiersContainer = document.getElementById("discount-tiers-container");
  const discountTiersList = document.getElementById("discount-tiers-list");
  const addDiscountTierBtn = document.getElementById("add-discount-tier");
  const descCounterEl = document.getElementById("desc-counter");

  const CLOUDINARY_URL = (window.CLOUDINARY_URL || "");

  const cityDatalist = document.getElementById("city-suggestions");
  const postcodeWarningEl = document.getElementById("postcode-warning");

  // --- Description character counter ---
  function __updateDescCounter() {
    if (!descCounterEl || !descriptionInput) return;
    var len = String(descriptionInput.value || "").length;
    descCounterEl.textContent = len + " / 1500";
    if (len < 150) {
      descCounterEl.className = "text-xs text-red-500 mt-1 text-right";
    } else if (len > 1400) {
      descCounterEl.className = "text-xs text-amber-500 mt-1 text-right";
    } else {
      descCounterEl.className = "text-xs text-slate-400 mt-1 text-right";
    }
  }
  if (descriptionInput) {
    descriptionInput.addEventListener("input", __updateDescCounter);
  }

  // --- AU Location Autocomplete ---
  var __auLocations = null; // lazy-loaded: array of [locality, state, postcode]
  var __auLoadPromise = null;
  function __loadAuLocations() {
    if (__auLoadPromise) return __auLoadPromise;
    __auLoadPromise = fetch("/data/au-locations.json").then(function (r) {
      return r.ok ? r.json() : [];
    }).then(function (arr) {
      __auLocations = Array.isArray(arr) ? arr : [];
      return __auLocations;
    }).catch(function () { __auLocations = []; return []; });
    return __auLoadPromise;
  }

  var __cityFilterTimer = null;
  function __filterCitySuggestions(val) {
    if (!cityDatalist || !__auLocations) return;
    var tok = String(val || "").trim().toLowerCase();
    if (tok.length < 2) { cityDatalist.innerHTML = ""; return; }
    var matches = [];
    for (var i = 0; i < __auLocations.length && matches.length < 15; i++) {
      var entry = __auLocations[i];
      if (entry[0].toLowerCase().indexOf(tok) === 0) {
        matches.push(entry);
      }
    }
    // Build datalist options using DOM (no innerHTML for safety)
    while (cityDatalist.firstChild) cityDatalist.removeChild(cityDatalist.firstChild);
    for (var j = 0; j < matches.length; j++) {
      var opt = document.createElement("option");
      opt.value = matches[j][0] + ", " + matches[j][1] + " " + matches[j][2];
      cityDatalist.appendChild(opt);
    }
  }

  function __parseCitySelection(val) {
    // Parse "Locality, STATE Postcode" format
    var m = String(val || "").match(/^(.+),\s*([A-Z]{2,3})\s+(\d{4})$/);
    if (m) return { locality: m[1].trim(), state: m[2], postcode: m[3] };
    return null;
  }

  function __onCityInput() {
    var val = locationInput ? locationInput.value : "";
    clearTimeout(__cityFilterTimer);
    __cityFilterTimer = setTimeout(function () { __filterCitySuggestions(val); }, 150);
    // Auto-fill postcode and suburb on selection
    var parsed = __parseCitySelection(val);
    if (parsed) {
      if (postcodeInput && !postcodeInput.value) postcodeInput.value = parsed.postcode;
      // Set city to just the locality name (strip state/postcode)
      if (locationInput) locationInput.value = parsed.locality;
    }
  }

  function __onCityFocus() {
    __loadAuLocations();
  }

  function __validateCityPostcode(city, postcode) {
    // Returns true if valid or data not loaded; returns false if definite mismatch
    if (!__auLocations || __auLocations.length === 0) return true;
    if (!city || !postcode) return true;
    var cityLower = city.toLowerCase().trim();
    var found = false;
    var anyMatchForCity = false;
    for (var i = 0; i < __auLocations.length; i++) {
      if (__auLocations[i][0].toLowerCase() === cityLower) {
        anyMatchForCity = true;
        if (__auLocations[i][2] === postcode) { found = true; break; }
      }
    }
    if (!anyMatchForCity) return true; // unknown city — don't block
    return found;
  }

  if (locationInput) {
    locationInput.addEventListener("input", __onCityInput);
    locationInput.addEventListener("focus", __onCityFocus, { once: true });
  }
  // --- End AU Location Autocomplete ---

  // --- Group Discount Tiers ---
  function addDiscountTierRow(minGuests, percent) {
    if (!discountTiersList) return;
    var row = window.tstsEl("div", { className: "flex items-center gap-2" });
    var mgInput = window.tstsEl("input", {
      type: "number", min: "2", max: "50", placeholder: "Min guests",
      className: "discount-min-guests w-28 px-3 py-1.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none"
    });
    if (minGuests != null) mgInput.value = String(minGuests);
    var pctInput = window.tstsEl("input", {
      type: "number", min: "1", max: "50", placeholder: "% off",
      className: "discount-percent w-20 px-3 py-1.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-tsts-clay/60 focus:border-transparent outline-none"
    });
    if (percent != null) pctInput.value = String(percent);
    var removeBtn = window.tstsEl("button", {
      type: "button",
      className: "text-red-400 hover:text-red-600 text-sm",
      "aria-label": "Remove discount tier"
    });
    removeBtn.textContent = "\u2715";
    removeBtn.addEventListener("click", function () { row.remove(); });
    row.appendChild(mgInput);
    row.appendChild(pctInput);
    row.appendChild(removeBtn);
    discountTiersList.appendChild(row);
  }

  if (discountEnabledInput && discountTiersContainer) {
    discountEnabledInput.addEventListener("change", function () {
      discountTiersContainer.classList.toggle("hidden", !discountEnabledInput.checked);
    });
  }
  if (addDiscountTierBtn) {
    addDiscountTierBtn.addEventListener("click", function () { addDiscountTierRow(); });
  }

  function buildDynamicDiscountsFromForm() {
    if (!discountEnabledInput || !discountEnabledInput.checked) {
      return { group: { host: { enabled: false, tiers: [] } } };
    }
    var tiers = [];
    var rows = discountTiersList ? discountTiersList.querySelectorAll(".flex.items-center") : [];
    for (var i = 0; i < rows.length; i++) {
      var mgEl = rows[i].querySelector(".discount-min-guests");
      var pctEl = rows[i].querySelector(".discount-percent");
      var mg = parseInt(mgEl ? mgEl.value : "", 10);
      var pct = parseInt(pctEl ? pctEl.value : "", 10);
      if (mg >= 2 && pct >= 1 && pct <= 50) tiers.push({ minGuests: mg, percent: pct });
    }
    if (tiers.length > 0) return { group: { host: { enabled: true, tiers: tiers } } };
    return { group: { host: { enabled: false, tiers: [] } } };
  }

  function populateDiscountTiersFromExp(expData) {
    if (!discountEnabledInput || !discountTiersContainer || !discountTiersList) return;
    var dd = expData && expData.dynamicDiscounts && expData.dynamicDiscounts.group && expData.dynamicDiscounts.group.host;
    if (!dd || !dd.enabled || !Array.isArray(dd.tiers) || dd.tiers.length === 0) return;
    discountEnabledInput.checked = true;
    discountTiersContainer.classList.remove("hidden");
    while (discountTiersList.firstChild) discountTiersList.removeChild(discountTiersList.firstChild);
    for (var i = 0; i < dd.tiers.length; i++) {
      var t = dd.tiers[i];
      addDiscountTierRow(t.minGuests, t.percent);
    }
  }
  // --- End Group Discount Tiers ---

  let isEditing = false;
  let editId = null;
  let existingImageUrl = null;
  let currentVerifiedStatus = "none";
  let hostVerificationStatus = "none";
  let pendingEventVerificationRequest = false;
  let verificationFeePercent = 5.0;
  let verificationPolicyVersion = "";
  let activePolicySnapshot = null;
  let activePricingPolicy = null;
  let activeRefundPolicy = null;
  let platformFeeRate = null; // null = policy not yet loaded from API
  let platformFeeBps = null;
  let shortfallSlotsCache = [];
  let shortfallRequestCounter = 0;
  const shortfallPaymentInFlight = new Set();
  const shortfallPaymentPendingWebhook = new Set();

  function ensureInlineNotice() {
    let el = document.getElementById("host-inline-notice");
    if (el) return el;

    if (!form) return null;
    el = window.tstsEl("div", {
      id: "host-inline-notice",
      className: "hidden mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
    }, "");
    form.prepend(el);
    return el;
  }

  function showNotice(kind, msg) {
    const el = ensureInlineNotice();
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = msg;

    el.classList.remove("border-red-200", "bg-red-50", "text-red-700", "border-green-200", "bg-green-50", "text-green-700", "border-gray-200", "bg-gray-50", "text-gray-700");

    if (kind === "error") el.classList.add("border-red-200", "bg-red-50", "text-red-700");
    else if (kind === "success") el.classList.add("border-green-200", "bg-green-50", "text-green-700");
    else el.classList.add("border-gray-200", "bg-gray-50", "text-gray-700");
  }

  function hideNotice() {
    const el = document.getElementById("host-inline-notice");
    if (el) el.classList.add("hidden");
  }

  async function ensureCsrfCookieReady() {
    try {
      const res = await window.authFetch("/api/csrf", { method: "GET" });
      if (!res || !res.ok) return false;
      try {
        const payload = await res.json().catch(() => ({}));
        const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
        const tok = (unwrapped && unwrapped.csrfToken) ? unwrapped.csrfToken : (payload && payload.csrfToken);
        const s = String(tok || "").trim();
        if (s) {
          try { localStorage.setItem("tsts_csrf_token", s); } catch (_) {}
        }
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) {
        redirectToLogin();
        return false;
      }

      // If no local session hint at all, skip the API call and redirect immediately.
      var hasHint = false;
      try { hasHint = !!localStorage.getItem("tsts_user"); } catch (_) {}
      if (!hasHint) {
        redirectToLogin();
        return false;
      }

      const sess = await window.tstsGetSession({ force: true });
      if (!sess || !sess.ok || !sess.user) {
        // Fail-closed: any auth failure redirects to login.
        redirectToLogin();
        return false;
      }

      // Initialize CSRF cookie required for state-changing requests (create/update).
      const okCsrf = await ensureCsrfCookieReady();
      if (!okCsrf) {
        showNotice("error", "Security token could not be initialized. Please refresh and try again.");
        return false;
      }
      return true;
    } catch (_) {
      showNotice("error", "Unable to verify your session. Please refresh and try again.");
      return false;
    }
  }

  function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function extractApiError(payload, fallbackMessage) {
    const root = (payload && typeof payload === "object") ? payload : {};
    const data = (root.data && typeof root.data === "object") ? root.data : root;
    const code = String(data.error || data.code || root.error || root.code || "").trim().toUpperCase();
    const message = String(data.message || root.message || fallbackMessage || "Request failed.").trim();
    return { code: code, message: message };
  }

  function mapHostListingsError(payload, statusCode) {
    const err = extractApiError(payload, "Failed to load listings. Please refresh.");
    if (err.code === "AUTH_REQUIRED" || statusCode === 401) {
      return "Authentication required. Please log in again.";
    }
    if (err.code === "HOST_ROLE_REQUIRED") {
      return "Host role required. Complete host onboarding to access listings.";
    }
    return err.message || "Failed to load listings. Please refresh.";
  }

  function toCents(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function formatMoneyFromCents(centsRaw) {
    const cents = Number(centsRaw);
    if (!Number.isFinite(cents)) return "—";
    return "$" + (cents / 100).toFixed(2) + " AUD";
  }

  function formatMoney(raw) {
    const cents = toCents(raw);
    if (cents == null) return "—";
    return formatMoneyFromCents(cents);
  }

  function percentLikeToPct(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n >= 0 && n <= 1) return n * 100;
    return n;
  }

  function normalizeHostVerificationStatus(v) {
    const s = String(v || "").trim().toLowerCase();
    if (s === "requested") return "requested";
    if (s === "under_review") return "under_review";
    if (s === "verified") return "verified";
    if (s === "rejected") return "rejected";
    return "none";
  }

  function resolveVerificationFeePercent(v, fallback) {
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 5.0;
    const n = Number(v);
    if (!Number.isFinite(n)) return Math.round(fb * 10) / 10;
    const clamped = Math.max(0, Math.min(20, n));
    return Math.round(clamped * 10) / 10;
  }

  function resolvePolicyVersion() {
    const v = activePolicySnapshot && activePolicySnapshot.version ? String(activePolicySnapshot.version) : "";
    return v || "Unavailable";
  }

  function toNonNegInt(value, fallback) {
    var fb = Number.isFinite(Number(fallback)) ? Math.max(0, Math.floor(Number(fallback))) : 0;
    var n = Number(value);
    if (!Number.isFinite(n)) return fb;
    return Math.max(0, Math.floor(n));
  }

  function normalizeTierRows(rawRows) {
    var rows = Array.isArray(rawRows) ? rawRows : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] && typeof rows[i] === "object" ? rows[i] : {};
      var minValueCents = toNonNegInt(
        (row.minValueCents != null) ? row.minValueCents : row.min_value_cents,
        0
      );
      var maxRaw = (row.maxValueCents != null) ? row.maxValueCents : row.max_value_cents;
      var maxValueCents = (maxRaw == null || maxRaw === "") ? null : toNonNegInt(maxRaw, 0);
      out.push({
        id: String(row.id || ("tier_" + i)),
        minValueCents: minValueCents,
        maxValueCents: maxValueCents,
        fixedFeeCents: toNonNegInt((row.fixedFeeCents != null) ? row.fixedFeeCents : row.fixed_fee_cents, 0),
        percentageFeeBps: toNonNegInt((row.percentageFeeBps != null) ? row.percentageFeeBps : row.percentage_fee_bps, 0),
        status: String(row.status || "active").toLowerCase() === "archived" ? "archived" : "active",
        order: Number.isFinite(Number(row.order)) ? Number(row.order) : i
      });
    }
    out.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.minValueCents - b.minValueCents;
    });
    return out;
  }

  function pickTierForBookingValue(rows, bookingValueCents) {
    var value = toNonNegInt(bookingValueCents, 0);
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || row.status !== "active") continue;
      if (value < Number(row.minValueCents || 0)) continue;
      if (row.maxValueCents != null && value >= Number(row.maxValueCents || 0)) continue;
      return row;
    }
    return null;
  }

  function computePlatformFeeFromTierRow(tier, bookingValueCents) {
    if (!tier || typeof tier !== "object") return 0;
    var value = toNonNegInt(bookingValueCents, 0);
    var fixedFee = toNonNegInt(tier.fixedFeeCents, 0);
    var bps = toNonNegInt(tier.percentageFeeBps, 0);
    return Math.max(0, Math.round(fixedFee + (value * (bps / 10000))));
  }

  function tierRangeLabel(tier) {
    if (!tier || typeof tier !== "object") return "Not matched";
    var minLabel = formatMoneyFromCents(toNonNegInt(tier.minValueCents, 0));
    if (tier.maxValueCents == null) return minLabel + "+";
    return minLabel + " to " + formatMoneyFromCents(toNonNegInt(tier.maxValueCents, 0));
  }

  function computePublicPricingBreakdown(priceRaw) {
    const guestPriceCents = toCents(priceRaw);
    if (!(Number.isFinite(guestPriceCents) && guestPriceCents > 0)) return null;
    var tierRows = normalizeTierRows(activePricingPolicy && activePricingPolicy.tiers);
    var tier = pickTierForBookingValue(tierRows, guestPriceCents);
    var platformFeeCents = 0;
    var effectiveBps = null;
    if (tier) {
      platformFeeCents = computePlatformFeeFromTierRow(tier, guestPriceCents);
      effectiveBps = toNonNegInt(tier.percentageFeeBps, 0);
    } else if (platformFeeRate != null) {
      platformFeeCents = Math.max(0, Math.round(Number(guestPriceCents) * platformFeeRate));
      effectiveBps = platformFeeBps;
    }
    const hostPayoutCents = Math.max(0, Number(guestPriceCents) - platformFeeCents);
    return {
      guestPriceCents: Number(guestPriceCents),
      platformFeeBps: effectiveBps,
      platformFeeCents: Number(platformFeeCents),
      hostPayoutCents: Number(hostPayoutCents),
      tier: tier
    };
  }

  function resolveHostPayoutEstimate(price) {
    const b = computePublicPricingBreakdown(price);
    if (!b) return "—";
    return formatMoneyFromCents(b.hostPayoutCents) + " (after platform fee, before host-funded discounts or recovery offsets)";
  }

  function resolvePlatformFeeEstimate(price) {
    const b = computePublicPricingBreakdown(price);
    if (!b) return "—";
    var pct = Number.isFinite(Number(b.platformFeeBps)) ? (Number(b.platformFeeBps) / 100).toFixed(2).replace(/\.00$/, "") : "0";
    var tierText = b.tier ? ("Tier range: " + tierRangeLabel(b.tier)) : "Tier range unavailable";
    return "-" + formatMoneyFromCents(b.platformFeeCents) + " (" + pct + "% + fixed tier component). " + tierText;
  }

  function resolvePrivateSummary() {
    const enabled = !!(privateEnabledInput && privateEnabledInput.checked);
    if (!enabled) return "Private booking disabled";

    const base = privatePriceInput ? safeNum(privatePriceInput.value) : null;
    const cap = privateCapacityInput ? safeNum(privateCapacityInput.value) : null;
    const included = privateIncludedGuestsInput ? safeNum(privateIncludedGuestsInput.value) : null;
    const extra = privateExtraGuestPriceInput ? safeNum(privateExtraGuestPriceInput.value) : null;

    if (!(base != null && base > 0 && cap != null && cap > 0 && included != null && included > 0 && extra != null && extra >= 0)) {
      return "Set private base, capacity, included guests, and extra guest price to see the full formula.";
    }

    return formatMoney(base) + " covers first " + String(Math.floor(included)) + " guests, then +" + formatMoney(extra) +
      " per extra guest (max " + String(Math.floor(cap)) + ").";
  }

  function resolveVerifiedImpact(publicPrice) {
    if (!(Number.isFinite(publicPrice) && publicPrice > 0)) {
      return "Enter a public price to see estimated verification deduction.";
    }
    const fee = Number((publicPrice * (verificationFeePercent / 100)).toFixed(2));
    const status = normalizeVerifiedStatus(currentVerifiedStatus);
    const hostStatus = normalizeHostVerificationStatus(hostVerificationStatus);
    if (status === "verified") {
      return "Verified active: estimated -" + formatMoney(fee) + " per guest from host payout (" + verificationFeePercent.toFixed(1) + "%).";
    }
    if (status === "pending") {
      return "Verification pending: if approved, estimated -" + formatMoney(fee) + " per guest from host payout.";
    }
    if (pendingEventVerificationRequest) {
      return "Verification request queued: if approved, estimated -" + formatMoney(fee) + " per guest from host payout.";
    }
    if (hostStatus !== "verified") {
      return "Host verification is required before requesting event verification.";
    }
    return "No verification deduction until your event verification request is approved.";
  }

  function ensurePricingShortfallWarningEl() {
    var existing = document.getElementById("pricing-shortfall-warning");
    if (existing) return existing;
    var panel = document.getElementById("pricing-transparency-panel");
    if (!panel) return null;
    var el = window.tstsEl("div", {
      id: "pricing-shortfall-warning",
      className: "hidden rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700"
    }, "");
    panel.appendChild(el);
    return el;
  }

  function syncPricingShortfallWarning(pricingBreakdown) {
    var warningEl = ensurePricingShortfallWarningEl();
    if (!warningEl) return;
    var b = pricingBreakdown;
    var active = !!(b && Number(b.platformFeeCents) > Number(b.guestPriceCents));
    if (!active) {
      warningEl.classList.add("hidden");
      warningEl.textContent = "";
      return;
    }
    var shortfallCents = Math.max(0, Number(b.platformFeeCents) - Number(b.guestPriceCents));
    warningEl.classList.remove("hidden");
    warningEl.textContent = "Deficit warning: platform fee (" + formatMoneyFromCents(b.platformFeeCents) + ") is higher than booking value (" + formatMoneyFromCents(b.guestPriceCents) + "). For non-admin deficit cases, host confirmation is required and shortfall funding is staged (50% seats upfront, remaining at threshold). Shortfall per seat: " + formatMoneyFromCents(shortfallCents) + ".";
  }

  function syncPricingTransparency() {
    if (platformFeeRate === null) {
      // Fee policy not yet loaded — show raw public price (fee-independent) and loading states
      const rawPrice = priceInput ? safeNum(priceInput.value) : null;
      const rawCents = toCents(rawPrice);
      if (pricingPublicPerGuestEl) {
        pricingPublicPerGuestEl.textContent = (Number.isFinite(rawCents) && rawCents > 0)
          ? formatMoneyFromCents(rawCents)
          : "Set a valid public price";
      }
      if (pricingPlatformFeePerGuestEl) pricingPlatformFeePerGuestEl.textContent = "Loading fee policy\u2026";
      if (pricingHostPayoutEstimateEl) pricingHostPayoutEstimateEl.textContent = "Loading\u2026";
      if (pricingVerifiedImpactEl) pricingVerifiedImpactEl.textContent = "Loading\u2026";
      if (pricingPolicyReferenceEl) pricingPolicyReferenceEl.textContent = "Loading policy\u2026";
      syncPricingShortfallWarning(null);
      return;
    }
    const publicPrice = priceInput ? safeNum(priceInput.value) : null;
    const pricingBreakdown = computePublicPricingBreakdown(publicPrice);
    if (pricingPublicPerGuestEl) {
      pricingPublicPerGuestEl.textContent = pricingBreakdown ? formatMoneyFromCents(pricingBreakdown.guestPriceCents) : "Set a valid public price";
    }
    if (pricingPlatformFeePerGuestEl) {
      pricingPlatformFeePerGuestEl.textContent = resolvePlatformFeeEstimate(publicPrice);
    }
    if (pricingHostPayoutEstimateEl) {
      pricingHostPayoutEstimateEl.textContent = resolveHostPayoutEstimate(publicPrice);
    }
    if (pricingVerifiedImpactEl) {
      pricingVerifiedImpactEl.textContent = resolveVerifiedImpact(publicPrice);
    }
    if (pricingPrivateSummaryEl) {
      pricingPrivateSummaryEl.textContent = resolvePrivateSummary();
    }
    if (pricingHostChargeNoteEl) {
      pricingHostChargeNoteEl.textContent = "Estimated payout shown above is after platform fee. Verified-event deduction (if approved) and recovery offsets are host-side payout deductions. No guest surcharge is applied for verification.";
    }
    if (pricingPolicyReferenceEl) {
      const ver = resolvePolicyVersion();
      const feeVer = verificationPolicyVersion ? String(verificationPolicyVersion) : "Unavailable";
      const pricingVer = activePricingPolicy && activePricingPolicy.version ? String(activePricingPolicy.version) : "Unavailable";
      const refundVer = activeRefundPolicy && activeRefundPolicy.version ? String(activeRefundPolicy.version) : "Unavailable";
      pricingPolicyReferenceEl.textContent = "Policy reference: " + ver + " (legacy booking policy) • " + pricingVer + " (tier pricing) • " + refundVer + " (refund windows) • " + feeVer + " (verification fee policy " + verificationFeePercent.toFixed(1) + "%).";
    }
    syncPricingShortfallWarning(pricingBreakdown);
  }

  async function loadActivePolicySnapshot() {
    try {
      const res = await window.authFetch("/api/policy/active", { method: "GET" });
      if (!res || !res.ok) {
        activePolicySnapshot = null;
        syncPricingTransparency();
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const policy = (payload && payload.data && payload.data.policy) ? payload.data.policy : ((payload && payload.policy) ? payload.policy : null);
      const pricingPolicy = (payload && payload.data && payload.data.pricingPolicy) ? payload.data.pricingPolicy : null;
      const refundPolicy = (payload && payload.data && payload.data.refundPolicy) ? payload.data.refundPolicy : null;
      activePolicySnapshot = (policy && typeof policy === "object") ? policy : null;
      activePricingPolicy = (pricingPolicy && typeof pricingPolicy === "object") ? pricingPolicy : null;
      activeRefundPolicy = (refundPolicy && typeof refundPolicy === "object") ? refundPolicy : null;
    } catch (_) {
      activePolicySnapshot = null;
      activePricingPolicy = null;
      activeRefundPolicy = null;
    }
    syncPricingTransparency();
  }

  async function loadHostVerificationStatus() {
    try {
      const res = await window.authFetch("/api/host/verification/status", { method: "GET" });
      if (!res || !res.ok) {
        hostVerificationStatus = "none";
        verificationFeePercent = 5.0;
        verificationPolicyVersion = "";
        platformFeeRate = 0.05;
        platformFeeBps = 500;
        syncVerifiedUi();
        syncPricingTransparency();
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const data = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
      const hostVerification = (data && data.hostVerification && typeof data.hostVerification === "object") ? data.hostVerification : {};
      const feePolicy = (data && data.feePolicy && typeof data.feePolicy === "object") ? data.feePolicy : {};
      hostVerificationStatus = normalizeHostVerificationStatus(hostVerification.status);
      verificationFeePercent = resolveVerificationFeePercent(feePolicy.feePercent, 5.0);
      verificationPolicyVersion = String(feePolicy.policyVersion || "");
      const pfp = (data && data.platformFeePolicy && typeof data.platformFeePolicy === "object")
        ? data.platformFeePolicy : null;
      if (pfp && pfp.type === "PERCENT" && Number.isFinite(Number(pfp.value)) && Number(pfp.value) >= 0) {
        platformFeeRate = Math.max(0, Math.min(1, Number(pfp.value) / 100));
        platformFeeBps = Math.round(platformFeeRate * 10000);
      } else {
        platformFeeRate = 0;
        platformFeeBps = 0;
      }
    } catch (_) {
      hostVerificationStatus = "none";
      verificationFeePercent = 5.0;
      verificationPolicyVersion = "";
      platformFeeRate = 0.05;
      platformFeeBps = 500;
    }
    syncVerifiedUi();
    syncPricingTransparency();
  }

  function shortfallBadgeClass(state) {
    var key = String(state || "").toUpperCase();
    if (key === "APPROVED" || key === "FULLY_FUNDED") return "bg-emerald-100 text-emerald-700";
    if (key === "UNDER_REVIEW" || key === "STAGE_A_DUE" || key === "STAGE_B_DUE" || key === "BOOKING_FROZEN_STAGE_B") return "bg-amber-100 text-amber-700";
    if (key === "REJECTED") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-700";
  }

  function shortfallStateLabel(state) {
    return String(state || "none").toLowerCase().replace(/_/g, " ");
  }

  function shortfallPaymentUiLabel(state) {
    var s = String(state || "").toUpperCase();
    if (s === "PAYMENT_IN_PROGRESS") return "Payment in progress";
    if (s === "PAYMENT_CONFIRMED_PENDING_WEBHOOK") return "Payment confirmed, awaiting webhook";
    if (s === "PAID") return "Paid";
    return "Payment required";
  }

  function shortfallEffectiveUiState(slot) {
    var slotId = String((slot && slot.slotId) || "");
    if (shortfallPaymentInFlight.has(slotId)) return "PAYMENT_IN_PROGRESS";
    if (shortfallPaymentPendingWebhook.has(slotId)) return "PAYMENT_CONFIRMED_PENDING_WEBHOOK";
    return String((slot && slot.paymentUiState) || "PAYMENT_REQUIRED");
  }

  function nextShortfallStage(slot) {
    var s = slot && typeof slot === "object" ? slot : {};
    var stageARemaining = Number((s.stageA && s.stageA.remainingCents) || 0);
    var stageBRemaining = Number((s.stageB && s.stageB.remainingCents) || 0);
    var threshold = Number(s.thresholdSeatsSnapshot || 0);
    var booked = Number(s.bookedSeats || 0);
    if (stageARemaining > 0) return "A";
    if (stageBRemaining > 0 && booked >= threshold) return "B";
    return "";
  }

  function setShortfallUiState(mode, errorMessage) {
    if (shortfallLoadingEl) shortfallLoadingEl.classList.add("hidden");
    if (shortfallEmptyEl) shortfallEmptyEl.classList.add("hidden");
    if (shortfallErrorEl) shortfallErrorEl.classList.add("hidden");
    if (shortfallSlotListEl) {
      shortfallSlotListEl.classList.add("hidden");
      shortfallSlotListEl.textContent = "";
    }
    if (mode === "loading" && shortfallLoadingEl) shortfallLoadingEl.classList.remove("hidden");
    if (mode === "empty" && shortfallEmptyEl) shortfallEmptyEl.classList.remove("hidden");
    if (mode === "error" && shortfallErrorEl) {
      shortfallErrorEl.classList.remove("hidden");
      if (errorMessage) shortfallErrorEl.textContent = String(errorMessage);
    }
    if (mode === "ready" && shortfallSlotListEl) shortfallSlotListEl.classList.remove("hidden");
  }

  async function fetchShortfallStatus(opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var query = new URLSearchParams();
    query.set("limit", String(options.limit || 150));
    if (options.slotId) query.set("slotId", String(options.slotId));
    var path = "/api/host/shortfall/status?" + query.toString();
    var res = await window.authFetch(path, { method: "GET" });
    var payload = await res.json().catch(function () { return {}; });
    if (!res.ok || !payload || payload.ok !== true) {
      var msg = String((payload && payload.message) || "Could not load shortfall status.");
      throw new Error(msg);
    }
    var data = (payload && payload.data && typeof payload.data === "object") ? payload.data : payload;
    var slots = Array.isArray(data.slots) ? data.slots : [];
    return { slots: slots, meta: data };
  }

  async function requestFeeWaiver(slotId) {
    if (!slotId) return;
    var note = await window.tstsPrompt("Reason for waiver request", "", { minLength: 10, placeholder: "Explain why you're requesting a fee waiver for this event." });
    note = String(note || "").trim();
    if (!note) return;
    try {
      var res = await window.authFetch("/api/host/shortfall/" + encodeURIComponent(slotId) + "/waiver-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note })
      });
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok || !payload || payload.ok !== true) throw new Error(String((payload && payload.message) || "Could not submit waiver request."));
      window.tstsNotify("Waiver request submitted successfully.", "success");
      await loadShortfallDashboard({ silent: true });
    } catch (err) {
      window.tstsNotify(String((err && err.message) || "Could not submit waiver request."), "error");
    }
  }

  function ensureShortfallPaymentModal() {
    var overlay = document.getElementById("shortfall-payment-overlay");
    if (overlay) {
      return {
        overlay: overlay,
        titleEl: document.getElementById("shortfall-payment-title"),
        metaEl: document.getElementById("shortfall-payment-meta"),
        elementMount: document.getElementById("shortfall-payment-element"),
        statusEl: document.getElementById("shortfall-payment-status"),
        closeBtn: document.getElementById("shortfall-payment-close"),
        submitBtn: document.getElementById("shortfall-payment-submit")
      };
    }
    var El = window.tstsEl;
    if (!El) return null;

    overlay = El("div", {
      id: "shortfall-payment-overlay",
      className: "fixed inset-0 z-[1000] hidden items-center justify-center bg-slate-900/50 px-4"
    });
    var card = El("div", { className: "w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4" });
    var header = El("div", { className: "flex items-start justify-between gap-3" }, [
      El("div", { className: "space-y-1" }, [
        El("h3", { id: "shortfall-payment-title", className: "text-lg font-bold text-slate-900", textContent: "Pay shortfall" }),
        El("p", { id: "shortfall-payment-meta", className: "text-xs text-slate-600", textContent: "" })
      ]),
      El("button", { id: "shortfall-payment-close", type: "button", className: "rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50", textContent: "Close" })
    ]);
    var mount = El("div", { id: "shortfall-payment-element", className: "rounded-xl border border-slate-200 p-3 bg-white" });
    var status = El("p", { id: "shortfall-payment-status", className: "text-xs text-slate-600", textContent: "Complete payment to unlock this stage." });
    var actions = El("div", { className: "flex items-center justify-end gap-2" }, [
      El("button", { id: "shortfall-payment-submit", type: "button", className: "inline-flex items-center rounded-xl bg-tsts-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90", textContent: "Pay now" })
    ]);
    card.appendChild(header);
    card.appendChild(mount);
    card.appendChild(status);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    return {
      overlay: overlay,
      titleEl: document.getElementById("shortfall-payment-title"),
      metaEl: document.getElementById("shortfall-payment-meta"),
      elementMount: document.getElementById("shortfall-payment-element"),
      statusEl: document.getElementById("shortfall-payment-status"),
      closeBtn: document.getElementById("shortfall-payment-close"),
      submitBtn: document.getElementById("shortfall-payment-submit")
    };
  }

  async function pollShortfallSlotUntilWebhook(slotId, stage) {
    var targetSlotId = String(slotId || "");
    var targetStage = String(stage || "").toUpperCase();
    for (var i = 0; i < 14; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, 2500); });
      var loaded = await loadShortfallDashboard({ silent: true, slotId: targetSlotId });
      var slots = loaded && Array.isArray(loaded.slots) ? loaded.slots : shortfallSlotsCache;
      var current = null;
      for (var j = 0; j < slots.length; j++) {
        if (String(slots[j] && slots[j].slotId || "") === targetSlotId) { current = slots[j]; break; }
      }
      if (!current) continue;
      var stageAPaid = Number((current.stageA && current.stageA.remainingCents) || 0) <= 0;
      var stageBPaid = Number((current.stageB && current.stageB.remainingCents) || 0) <= 0;
      if (targetStage === "A" && stageAPaid) return true;
      if (targetStage === "B" && stageBPaid) return true;
      if (String(current.fundingStatus || "").toUpperCase() === "FULLY_FUNDED") return true;
    }
    return false;
  }

  async function openShortfallPaymentFlow(slot, stage, paymentData) {
    var modal = ensureShortfallPaymentModal();
    if (!modal) throw new Error("Payment modal could not be initialized.");
    var publishableKey = String((paymentData && paymentData.publishableKey) || "").trim();
    if (!publishableKey) throw new Error("Stripe publishable key is missing.");
    if (!(window.Stripe && typeof window.Stripe === "function")) throw new Error("Stripe SDK not available.");
    var stripe = window.Stripe(publishableKey);
    if (!stripe) throw new Error("Stripe could not initialize.");

    var clientSecret = String((paymentData && paymentData.clientSecret) || "").trim();
    if (!clientSecret) throw new Error("Payment intent secret missing.");

    modal.titleEl.textContent = "Pay shortfall Stage " + String(stage || "");
    modal.metaEl.textContent = String((slot && slot.experienceTitle) || "Experience") + " • " +
      String((slot && slot.bookingDate) || "") + " " + String((slot && slot.timeSlot) || "") + " • " +
      formatMoneyFromCents(Number((paymentData && paymentData.amountCents) || 0));
    modal.statusEl.textContent = "Complete payment to unlock this stage.";
    modal.overlay.classList.remove("hidden");
    modal.overlay.classList.add("flex");

    var elements = stripe.elements({ clientSecret: clientSecret });
    var paymentElement = elements.create("payment");
    modal.elementMount.textContent = "";
    paymentElement.mount(modal.elementMount);

    var closed = false;
    function closeModal() {
      if (closed) return;
      closed = true;
      try { paymentElement.unmount(); } catch (_) {}
      modal.overlay.classList.add("hidden");
      modal.overlay.classList.remove("flex");
      modal.elementMount.textContent = "";
      modal.statusEl.textContent = "";
      modal.submitBtn.disabled = false;
    }

    return await new Promise(function (resolve) {
      modal.closeBtn.onclick = function () {
        closeModal();
        resolve(false);
      };
      modal.submitBtn.disabled = false;
      modal.submitBtn.onclick = async function () {
        modal.submitBtn.disabled = true;
        modal.statusEl.textContent = "Processing payment…";
        var result = await stripe.confirmPayment({
          elements: elements,
          redirect: "if_required"
        });
        if (result && result.error) {
          modal.statusEl.textContent = String(result.error.message || "Payment failed.");
          modal.submitBtn.disabled = false;
          return;
        }
        modal.statusEl.textContent = "Payment submitted. Waiting for webhook confirmation…";
        resolve(true);
        closeModal();
      };
    });
  }

  function renderShortfallSlots(slots) {
    if (!shortfallSlotListEl) return;
    shortfallSlotListEl.textContent = "";
    var El = window.tstsEl;
    var list = Array.isArray(slots) ? slots : [];
    for (var i = 0; i < list.length; i++) {
      var slot = list[i] && typeof list[i] === "object" ? list[i] : {};
      var uiState = shortfallEffectiveUiState(slot);
      var approvalState = String(slot.approvalState || "NONE").toUpperCase();
      var fundingState = String(slot.fundingStatus || "NONE").toUpperCase();
      var nextStage = nextShortfallStage(slot);

      var header = El("div", { className: "flex flex-wrap items-center justify-between gap-2" }, [
        El("div", { className: "space-y-1" }, [
          El("h4", { className: "text-sm font-bold text-slate-900", textContent: String(slot.experienceTitle || "Experience") }),
          El("p", { className: "text-xs text-slate-600", textContent: String(slot.bookingDate || "") + " • " + String(slot.timeSlot || "") })
        ]),
        El("div", { className: "flex flex-wrap items-center gap-2 text-[11px]" }, [
          El("span", { className: "rounded-full px-2 py-1 font-bold " + shortfallBadgeClass(approvalState), textContent: "Approval: " + shortfallStateLabel(approvalState) }),
          El("span", { className: "rounded-full px-2 py-1 font-bold " + shortfallBadgeClass(fundingState), textContent: "Funding: " + shortfallStateLabel(fundingState) }),
          El("span", { className: "rounded-full px-2 py-1 font-bold " + shortfallBadgeClass(uiState), textContent: shortfallPaymentUiLabel(uiState) })
        ])
      ]);

      var seatsPanel = El("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs text-slate-700" }, [
        El("p", { className: "font-bold uppercase tracking-wide text-slate-500", textContent: "Seats" }),
        El("p", { textContent: "Booked seats: " + String(Number(slot.bookedSeats || 0)) }),
        El("p", { textContent: "Capacity snapshot: " + String(Number(slot.capacityTotalSnapshot || 0)) }),
        El("p", { textContent: "Threshold (50%): " + String(Number(slot.thresholdSeatsSnapshot || 0)) })
      ]);
      var fundingPanel = El("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs text-slate-700" }, [
        El("p", { className: "font-bold uppercase tracking-wide text-slate-500", textContent: "Funding" }),
        El("p", { textContent: "Shortfall per seat: " + formatMoneyFromCents(Number(slot.shortfallPerSeatSnapshotCents || 0)) }),
        El("p", { textContent: "Stage A paid: " + formatMoneyFromCents(Number(slot.stageA && slot.stageA.paidCents || 0)) + " / " + formatMoneyFromCents(Number(slot.stageA && slot.stageA.dueCents || 0)) }),
        El("p", { textContent: "Stage B paid: " + formatMoneyFromCents(Number(slot.stageB && slot.stageB.paidCents || 0)) + " / " + formatMoneyFromCents(Number(slot.stageB && slot.stageB.dueCents || 0)) })
      ]);
      var settlementPanel = El("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs text-slate-700" }, [
        El("p", { className: "font-bold uppercase tracking-wide text-slate-500", textContent: "Settlement (+72h)" }),
        El("p", { textContent: "Refundable principal: " + formatMoneyFromCents(Number(slot.settlement && slot.settlement.refundablePrincipalCents || 0)) }),
        El("p", { textContent: "Processing fee (5%): " + formatMoneyFromCents(Number(slot.settlement && slot.settlement.processingFeeCents || 0)) }),
        El("p", { textContent: "Net refund: " + formatMoneyFromCents(Number(slot.settlement && slot.settlement.netRefundCents || 0)) }),
        El("p", { textContent: "Case status: " + shortfallStateLabel(slot.settlement && slot.settlement.status || "none") })
      ]);

      var actions = El("div", { className: "flex flex-wrap items-center gap-2 pt-1" });
      if (approvalState === "APPROVED" && slot.hostConfirmed !== true) {
        var confirmBtn = El("button", { type: "button", className: "inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50", textContent: "Confirm shortfall terms" });
        confirmBtn.addEventListener("click", (function (slotIdCopy) {
          return async function () {
            try {
              var r = await window.authFetch("/api/host/shortfall/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slotId: slotIdCopy })
              });
              var p = await r.json().catch(function () { return {}; });
              if (!r.ok || !p || p.ok !== true) throw new Error(String((p && p.message) || "Confirmation failed."));
              window.tstsNotify("Shortfall terms confirmed.", "success");
              await loadShortfallDashboard({ silent: true });
            } catch (err) {
              window.tstsNotify(String((err && err.message) || "Confirmation failed."), "error");
            }
          };
        })(String(slot.slotId || "")));
        actions.appendChild(confirmBtn);
      }
      if (approvalState === "APPROVED" && slot.hostConfirmed === true && nextStage) {
        var payBtn = El("button", { type: "button", className: "inline-flex items-center rounded-xl bg-tsts-ink px-3 py-2 text-xs font-bold text-white hover:opacity-90", textContent: "Pay shortfall (Stage " + nextStage + ")" });
        var slotId = String(slot.slotId || "");
        if (shortfallPaymentInFlight.has(slotId)) {
          payBtn.disabled = true;
          payBtn.classList.add("opacity-60");
          payBtn.textContent = "Payment in progress";
        }
        payBtn.addEventListener("click", (function (slotCopy, stageCopy) {
          return async function () {
            var slotIdLocal = String((slotCopy && slotCopy.slotId) || "");
            try {
              shortfallPaymentInFlight.add(slotIdLocal);
              renderShortfallSlots(shortfallSlotsCache);
              var res = await window.authFetch("/api/host/shortfall/pay-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slotId: slotIdLocal, stage: stageCopy })
              });
              var payload = await res.json().catch(function () { return {}; });
              if (!res.ok || !payload || payload.ok !== true) throw new Error(String((payload && payload.message) || "Could not initialize payment."));
              var data = payload.data || {};
              var submitted = await openShortfallPaymentFlow(slotCopy, stageCopy, data);
              if (!submitted) return;
              shortfallPaymentPendingWebhook.add(slotIdLocal);
              renderShortfallSlots(shortfallSlotsCache);
              var webhookApplied = await pollShortfallSlotUntilWebhook(slotIdLocal, stageCopy);
              if (!webhookApplied) {
                window.tstsNotify("Payment submitted. Webhook confirmation is still pending; refresh in a moment.", "warning");
              } else {
                shortfallPaymentPendingWebhook.delete(slotIdLocal);
                window.tstsNotify("Shortfall payment confirmed.", "success");
              }
              await loadShortfallDashboard({ silent: true });
            } catch (err) {
              window.tstsNotify(String((err && err.message) || "Payment failed."), "error");
            } finally {
              shortfallPaymentInFlight.delete(slotIdLocal);
              renderShortfallSlots(shortfallSlotsCache);
            }
          };
        })(slot, nextStage));
        actions.appendChild(payBtn);
      }
      // Waiver section
      var waiver = (slot && slot.waiver && typeof slot.waiver === "object") ? slot.waiver : {};
      var waiverStatus = String(waiver.status || "none");
      var stageADue = Number((slot.stageA && slot.stageA.dueCents) || 0);
      var stageAPaid = Number((slot.stageA && slot.stageA.paidCents) || 0);
      var canRequestWaiver = approvalState === "APPROVED" && (waiverStatus === "none" || waiverStatus === "rejected") && stageAPaid < stageADue;
      if (canRequestWaiver) {
        var waiverRequestBtn = El("button", { type: "button", className: "inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50", textContent: "Request fee waiver" });
        waiverRequestBtn.addEventListener("click", (function (slotIdCopy) {
          return async function () { await requestFeeWaiver(slotIdCopy); };
        })(String(slot.slotId || "")));
        actions.appendChild(waiverRequestBtn);
      }
      if (waiverStatus === "pending") {
        actions.appendChild(El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-800", textContent: "Waiver request under review" }));
      } else if (waiverStatus === "approved_full") {
        actions.appendChild(El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-800", textContent: "Full waiver approved — no payment required" }));
      } else if (waiverStatus === "approved_partial") {
        actions.appendChild(El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-800", textContent: "Partial waiver approved — reduced fee applies" }));
      } else if (waiverStatus === "rejected") {
        actions.appendChild(El("span", { className: "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-slate-100 text-slate-600", textContent: "Waiver request was not approved" }));
      }

      if (actions.childNodes.length === 0) {
        actions.appendChild(El("p", { className: "text-xs text-slate-500", textContent: "No host action required at this stage." }));
      }

      var card = El("article", { className: "rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm" }, [
        header,
        El("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3" }, [seatsPanel, fundingPanel, settlementPanel]),
        actions
      ]);
      shortfallSlotListEl.appendChild(card);
    }
  }

  async function loadShortfallDashboard(opts) {
    var options = (opts && typeof opts === "object") ? opts : {};
    var reqId = ++shortfallRequestCounter;
    if (!options.silent) setShortfallUiState("loading");
    try {
      var loaded = await fetchShortfallStatus({ limit: 150, slotId: options.slotId || "" });
      if (reqId !== shortfallRequestCounter) return loaded;
      var slots = Array.isArray(loaded.slots) ? loaded.slots : [];
      shortfallSlotsCache = slots;
      if (slots.length === 0) {
        setShortfallUiState("empty");
        return loaded;
      }
      setShortfallUiState("ready");
      renderShortfallSlots(slots);
      return loaded;
    } catch (err) {
      if (reqId !== shortfallRequestCounter) return { slots: [] };
      setShortfallUiState("error", String((err && err.message) || "Could not load shortfall status."));
      return { slots: [] };
    }
  }

  function normalizeVerifiedStatus(v) {
    const s = String(v || "").trim().toLowerCase();
    if (s === "verified") return "verified";
    if (s === "pending") return "pending";
    if (s === "rejected") return "rejected";
    return "none";
  }

  function syncPrivateConfigUi() {
    const enabled = !!(privateEnabledInput && privateEnabledInput.checked);
    if (privateConfigFields) {
      privateConfigFields.classList.toggle("opacity-60", !enabled);
      privateConfigFields.classList.toggle("pointer-events-none", !enabled);
    }
    const fields = [privatePriceInput, privateCapacityInput, privateIncludedGuestsInput, privateExtraGuestPriceInput];
    fields.forEach((el) => {
      if (!el) return;
      el.disabled = !enabled;
    });
  }

  function syncVerifiedUi() {
    const status = normalizeVerifiedStatus(currentVerifiedStatus);
    const hostStatus = normalizeHostVerificationStatus(hostVerificationStatus);
    const hostCanRequest = hostStatus === "verified";

    if (verifiedRequestBtn) {
      verifiedRequestBtn.classList.remove("opacity-60", "cursor-not-allowed");
      if (status === "verified") {
        verifiedRequestBtn.disabled = true;
        verifiedRequestBtn.textContent = "Event verified";
        verifiedRequestBtn.classList.add("opacity-60", "cursor-not-allowed");
      } else if (status === "pending") {
        verifiedRequestBtn.disabled = true;
        verifiedRequestBtn.textContent = "Verification pending";
        verifiedRequestBtn.classList.add("opacity-60", "cursor-not-allowed");
      } else if (!hostCanRequest) {
        verifiedRequestBtn.disabled = true;
        verifiedRequestBtn.textContent = "Host verification required";
        verifiedRequestBtn.classList.add("opacity-60", "cursor-not-allowed");
      } else if (pendingEventVerificationRequest) {
        verifiedRequestBtn.disabled = false;
        verifiedRequestBtn.textContent = "Verification request queued";
      } else {
        verifiedRequestBtn.disabled = false;
        verifiedRequestBtn.textContent = "Request event verification";
      }
    }

    if (verifiedStatusHint) {
      if (status === "verified") {
        verifiedStatusHint.textContent = "Verified and locked. Approved bookings apply the snapshotted verification deduction to host payout.";
      } else if (status === "pending") {
        verifiedStatusHint.textContent = "Verification request pending admin review.";
      } else if (status === "rejected") {
        verifiedStatusHint.textContent = hostCanRequest
          ? "Previous verification request was rejected. You can request verification again."
          : "Previous verification request was rejected. Complete host verification before requesting again.";
      } else if (!hostCanRequest) {
        verifiedStatusHint.textContent = "Host verification is required before event verification request.";
      } else if (pendingEventVerificationRequest) {
        verifiedStatusHint.textContent = "Event verification request will be submitted after listing save.";
      } else {
        verifiedStatusHint.textContent = "Request event verification to send this listing for admin review.";
      }
    }
    if (verifiedRequestMeta) {
      if (hostStatus === "verified") {
        verifiedRequestMeta.textContent = "Current verification fee policy: " + verificationFeePercent.toFixed(1) + "% of guest total paid, deducted from host payout after approval.";
      } else {
        verifiedRequestMeta.textContent = "Host verification is required before event verification.";
      }
    }
  }

  async function requestEventVerification(experienceId) {
    const id = String(experienceId || "").trim();
    if (!id) throw new Error("Experience id missing");

    const vr = await window.authFetch("/api/host/experiences/" + encodeURIComponent(id) + "/verified-opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const vrRaw = await vr.json().catch(() => ({}));
    const vrPayload = (vrRaw && vrRaw.data) ? vrRaw.data : vrRaw;
    if (!vr.ok) {
      throw new Error(String((vrPayload && vrPayload.message) || (vrRaw && vrRaw.message) || "Verification request failed."));
    }
    const updated = (vrPayload && vrPayload.experience) ? vrPayload.experience : vrPayload;
    currentVerifiedStatus = normalizeVerifiedStatus(updated && updated.verifiedStatus);
    pendingEventVerificationRequest = false;
    syncVerifiedUi();
    syncPricingTransparency();
  }

  if (verifiedRequestBtn) {
    verifiedRequestBtn.addEventListener("click", async function () {
      hideNotice();
      const hostStatus = normalizeHostVerificationStatus(hostVerificationStatus);
      const status = normalizeVerifiedStatus(currentVerifiedStatus);
      if (status === "verified" || status === "pending") return;
      if (hostStatus !== "verified") {
        showNotice("error", "Complete host verification in Hosting dashboard before requesting event verification.");
        return;
      }

      if (isEditing && editId) {
        try {
          await requestEventVerification(editId);
          showNotice("success", "Event verification request submitted.");
        } catch (err) {
          showNotice("error", String((err && err.message) || "Verification request failed."));
        }
        return;
      }

      pendingEventVerificationRequest = true;
      syncVerifiedUi();
      syncPricingTransparency();
      showNotice("info", "Event verification will be requested after listing is saved.");
    });
  }

  function setPreview(url) {
    if (uploadPreview) uploadPreview.classList.remove("hidden");
    if (uploadPlaceholder) uploadPlaceholder.classList.add("hidden");
    if (uploadPreview) window.tstsSafeImg(uploadPreview, url, "/assets/experience-default.jpg");
  }

  function parseAvailableDays(raw) {
    const s = String(raw || "").trim();
    if (!s) return [];
    const parts = s.split(/[,\s]+/).map((x) => String(x || "").trim()).filter((x) => x);
    const map = {
      sun: "Sun",
      sunday: "Sun",
      mon: "Mon",
      monday: "Mon",
      tue: "Tue",
      tues: "Tue",
      tuesday: "Tue",
      wed: "Wed",
      weds: "Wed",
      wednesday: "Wed",
      thu: "Thu",
      thur: "Thu",
      thurs: "Thu",
      thursday: "Thu",
      fri: "Fri",
      friday: "Fri",
      sat: "Sat",
      saturday: "Sat",
    };
    const out = [];
    for (const p of parts) {
      const k = String(p).toLowerCase();
      const v = map[k];
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }

  function getSelectedTags() {
    try {
      const nodes = document.querySelectorAll('input[name="tags"]:checked');
      const tags = [];
      for (const n of nodes) {
        const v = String(n && n.value ? n.value : "").trim();
        if (v) tags.push(v);
      }
      return tags.slice(0, 2);
    } catch (_) {
      return [];
    }
  }

  function syncTagLimitUI() {
    const LIMIT = 2;
    let nodes = [];
    try { nodes = Array.from(document.querySelectorAll('input[name="tags"]')); } catch (_) { nodes = []; }
    const checked = nodes.filter((n) => n && n.checked);
    const count = checked.length;

    if (tagLimitHint) {
      tagLimitHint.textContent = String(count) + "/" + String(LIMIT) + " selected";
    }

    const disableOthers = count >= LIMIT;
    nodes.forEach((n) => {
      try {
        if (!n) return;
        if (!n.checked) n.disabled = disableOthers;
        const lbl = (typeof n.closest === "function") ? n.closest("label") : null;
        if (lbl) {
          if (n.disabled) lbl.classList.add("opacity-50", "cursor-not-allowed");
          else lbl.classList.remove("opacity-50", "cursor-not-allowed");
        }
      } catch (_) {}
    });
  }

  function setSelectedTags(tags) {
    const set = new Set((Array.isArray(tags) ? tags : []).map((t) => String(t || "").trim()).filter((t) => t));
    try {
      const nodes = document.querySelectorAll('input[name="tags"]');
      for (const n of nodes) {
        const v = String(n && n.value ? n.value : "").trim();
        n.checked = set.has(v);
      }
    } catch (_) {}
    syncTagLimitUI();
  }

  async function getSignature() {
    const res = await window.authFetch("/api/uploads/cloudinary-signature", { method: "POST" });
    if (!res.ok) throw new Error("signature_failed");
    const envelope = await res.json();
    const data = (envelope && envelope.data) ? envelope.data : envelope;
    const need = ["timestamp", "signature", "apiKey", "cloudName", "folder"];
    for (const k of need) {
      if (!data || !data[k]) throw new Error("signature_bad_shape");
    }
    return data;
  }

  async function uploadImage(file) {
    if (!CLOUDINARY_URL) throw new Error("upload_not_configured");

    const sig = await getSignature();

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", CLOUDINARY_URL, true);
      xhr.onload = () => {
        try {
          const r = JSON.parse(xhr.responseText || "{}");
          const url = r.secure_url || r.url || "";
          if (!url) return reject(new Error("upload_no_url"));
          resolve(url);
        } catch (e) {
          reject(new Error("upload_parse_error"));
        }
      };
      xhr.onerror = () => reject(new Error("upload_network_error"));

      const fd = new FormData();
      fd.append("file", file);
      fd.append("timestamp", String(sig.timestamp));
      fd.append("signature", String(sig.signature));
      fd.append("api_key", String(sig.apiKey));
      fd.append("folder", String(sig.folder));
      xhr.send(fd);
    });
  }

  async function loadEditMode() {
    try {
      const params = new URLSearchParams(location.search || "");
      const id = params.get("edit");
      if (!id) return;

      isEditing = true;
      editId = id;

      const res = await window.authFetch("/api/experiences/" + encodeURIComponent(id), { method: "GET" });
      if (!res.ok) return;

      const payload = await res.json();
      const exp = payload && (payload.experience || payload.data || payload) ? (payload.experience || payload.data || payload) : {};
      existingImageUrl = exp.imageUrl || (Array.isArray(exp.images) ? exp.images[0] : "") || "";

      if (titleInput) titleInput.value = exp.title || "";
      if (descriptionInput) descriptionInput.value = exp.description || "";
      __updateDescCounter();
      if (priceInput) priceInput.value = exp.price != null ? String(exp.price) : "";
      if (dateInput) dateInput.value = String(exp.startDate || exp.date || exp.experienceDate || "").slice(0, 10);
      if (endDateInput) endDateInput.value = String(exp.endDate || "").slice(0, 10);

      const ts0 = (Array.isArray(exp.timeSlots) && exp.timeSlots[0]) ? String(exp.timeSlots[0]) : "";
      const tsParts = ts0.split("-");
      const derivedStart = (tsParts[0] || "").trim();
      const derivedEnd = (tsParts[1] || "").trim();

      if (timeInput) timeInput.value = String(exp.startTime || exp.time || derivedStart || "").trim();
      if (endTimeInput) endTimeInput.value = String(exp.endTime || derivedEnd || "").trim();
      if (locationInput) locationInput.value = exp.city || exp.location || "";
      if (suburbInput) suburbInput.value = exp.suburb || "";
      if (postcodeInput) postcodeInput.value = exp.postcode || "";
      if (addressLineInput) addressLineInput.value = exp.addressLine || "";
      if (addressNotesInput) addressNotesInput.value = exp.addressNotes || "";
      if (maxGuestsInput) maxGuestsInput.value = (exp.maxGuests != null ? String(exp.maxGuests) : (exp.capacity != null ? String(exp.capacity) : ""));
      // Populate availableDays checkboxes from stored data
      (function () {
        var rawDays = Array.isArray(exp.availableDays) ? exp.availableDays : parseAvailableDays(exp.availableDays);
        var daySet = new Set(rawDays.map(function (d) { return String(d || "").trim(); }));
        var cbs = document.querySelectorAll('input[name="availableDays"]');
        for (var i = 0; i < cbs.length; i++) { cbs[i].checked = daySet.has(cbs[i].value); }
      })();
      const privateCap = safeNum(exp.privateCapacity);
      const privateBase = safeNum(exp.privatePrice);
      const privateEnabled = (privateCap != null && privateCap > 0 && privateBase != null && privateBase > 0);
      if (privateEnabledInput) privateEnabledInput.checked = privateEnabled;
      if (privatePriceInput) privatePriceInput.value = (privateBase != null && privateBase > 0) ? String(privateBase) : "";
      if (privateCapacityInput) privateCapacityInput.value = (privateCap != null && privateCap > 0) ? String(privateCap) : "";
      if (privateIncludedGuestsInput) {
        const included = safeNum(exp.privateIncludedGuests);
        privateIncludedGuestsInput.value = (included != null && included > 0) ? String(included) : "";
      }
      if (privateExtraGuestPriceInput) {
        const extra = safeNum(exp.privateExtraGuestPrice);
        privateExtraGuestPriceInput.value = (extra != null && extra >= 0) ? String(extra) : "";
      }
      // Hydrate booking controls
      if (timezoneInput) timezoneInput.value = exp.timezone || "Australia/Melbourne";
      if (cutoffEnabledInput) cutoffEnabledInput.checked = (exp.bookingCutoffEnabled !== false);
      if (cutoffHoursInput) cutoffHoursInput.value = String(Math.round((exp.bookingCutoffMinutes || 1440) / 60));
      syncCutoffUi();

      // Hydrate group discount tiers
      populateDiscountTiersFromExp(exp);

      currentVerifiedStatus = normalizeVerifiedStatus(exp.verifiedStatus);
      pendingEventVerificationRequest = false;
      syncPrivateConfigUi();
      syncVerifiedUi();
      setSelectedTags(exp.tags);
      syncPricingTransparency();

      if (existingImageUrl) setPreview(existingImageUrl);

      if (submitBtn) submitBtn.textContent = "Update Experience";
    } catch (_) {}
  }

  if (imageInput) {
    imageInput.addEventListener("change", function () {
      hideNotice();
      try {
        const f = imageInput.files && imageInput.files[0];
        if (!f) return;
        const localUrl = URL.createObjectURL(f);
        setPreview(localUrl);
        // Show a local file preview via FileReader
        var reader = new FileReader();
        reader.onload = function (e) {
          var previewImg = document.getElementById("upload-preview-img");
          if (previewImg) previewImg.src = e.target.result;
        };
        reader.readAsDataURL(f);
      } catch (_) {}
    });
  }

  // Enforce category selection cap (max 2)
  try {
    const nodes = document.querySelectorAll('input[name="tags"]');
    for (const n of nodes) {
      n.addEventListener("change", function () {
        hideNotice();
        syncTagLimitUI();
      });
    }
  } catch (_) {}
  syncTagLimitUI();
  if (privateEnabledInput) {
    privateEnabledInput.addEventListener("change", function () {
      hideNotice();
      syncPrivateConfigUi();
      syncPricingTransparency();
    });
  }
  [priceInput, privatePriceInput, privateCapacityInput, privateIncludedGuestsInput, privateExtraGuestPriceInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", function () {
      hideNotice();
      syncPricingTransparency();
    });
  });
  syncPrivateConfigUi();
  syncVerifiedUi();
  syncPricingTransparency();

  // Cutoff toggle + preview sync
  function syncCutoffUi() {
    var enabled = cutoffEnabledInput ? cutoffEnabledInput.checked : true;
    if (cutoffHoursRow) cutoffHoursRow.style.display = enabled ? "" : "none";
    if (cutoffPreviewEl) {
      if (!enabled) { cutoffPreviewEl.textContent = "Bookings remain open until event start."; return; }
      var hrs = cutoffHoursInput ? parseInt(cutoffHoursInput.value, 10) || 0 : 24;
      cutoffPreviewEl.textContent = hrs === 0 ? "Bookings remain open until event start." : "Bookings close " + hrs + "h before each time slot.";
    }
  }
  if (cutoffEnabledInput) {
    cutoffEnabledInput.addEventListener("change", function () { hideNotice(); syncCutoffUi(); });
  }
  if (cutoffHoursInput) {
    cutoffHoursInput.addEventListener("input", function () { hideNotice(); syncCutoffUi(); });
  }
  syncCutoffUi();

  // DATE-GUARD-001: Prevent past-date selection (local timezone)
  (function () {
    var _d = new Date();
    var _today = new Date(_d.getTime() - _d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
    if (dateInput) dateInput.min = _today;
    if (endDateInput) endDateInput.min = _today;
  })();

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideNotice();

      if (!(await requireAuth())) return;

      if (submitBtn) submitBtn.disabled = true;

      try {
        const title = titleInput ? String(titleInput.value || "").trim() : "";
        const description = descriptionInput ? String(descriptionInput.value || "").trim() : "";
        const price = priceInput ? safeNum(priceInput.value) : null;
        const startDate = dateInput ? String(dateInput.value || "").trim() : "";
        const endDate = endDateInput ? String(endDateInput.value || "").trim() : "";
        const startTime = timeInput ? String(timeInput.value || "").trim() : "";
        const endTime = endTimeInput ? String(endTimeInput.value || "").trim() : "";
        const city = locationInput ? String(locationInput.value || "").trim() : "";
        const suburb = suburbInput ? String(suburbInput.value || "").trim() : "";
        const postcode = postcodeInput ? String(postcodeInput.value || "").trim() : "";
        const addressLine = addressLineInput ? String(addressLineInput.value || "").trim() : "";
        const addressNotes = addressNotesInput ? String(addressNotesInput.value || "").trim() : "";
        const capacity = maxGuestsInput ? safeNum(maxGuestsInput.value) : null;
        const availableDays = Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(function (cb) { return cb.value; });
        const tags = getSelectedTags();
        const privateEnabled = !!(privateEnabledInput && privateEnabledInput.checked);
        const privatePrice = privatePriceInput ? safeNum(privatePriceInput.value) : null;
        const privateCapacity = privateCapacityInput ? safeNum(privateCapacityInput.value) : null;
        const privateIncludedGuests = privateIncludedGuestsInput ? safeNum(privateIncludedGuestsInput.value) : null;
        const privateExtraGuestPrice = privateExtraGuestPriceInput ? safeNum(privateExtraGuestPriceInput.value) : null;
        const requirements = requirementsInput ? String(requirementsInput.value || "").trim() : "";
        const eventDurationMinutes = eventDurationMinutesInput ? (parseInt(eventDurationMinutesInput.value, 10) || null) : null;

        if (!title || !description || price == null || !startDate || !endDate || !startTime || !city || !suburb || !postcode || !addressLine || capacity == null) {
          showNotice("error", "Please fill all required fields.");
          return;
        }
        if (description.length < 150 || description.length > 1500) {
          showNotice("error", "Description must be between 150 and 1500 characters.");
          if (descriptionInput) descriptionInput.focus();
          return;
        }
        if (!tags || tags.length < 1) {
          showNotice("error", "Please select at least one category (up to 2).");
          return;
        }
        if (!/^[0-9]{4}$/.test(postcode)) {
          showNotice("error", "Postcode must be 4 digits.");
          return;
        }
        // AU city-postcode cross-check (informational warning, does not block)
        if (postcodeWarningEl) postcodeWarningEl.classList.add("hidden");
        if (!__validateCityPostcode(city, postcode)) {
          if (postcodeWarningEl) {
            postcodeWarningEl.textContent = "This postcode doesn\u2019t match the selected city in our records. Please double-check.";
            postcodeWarningEl.classList.remove("hidden");
          }
        }
        if (new Date(endDate) < new Date(startDate)) {
          showNotice("error", "End date must be on or after start date.");
          return;
        }
        var timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (startTime && !timeRe.test(startTime)) {
          showNotice("error", "Start time must be a valid time (HH:MM).");
          return;
        }
        if (endTime && !timeRe.test(endTime)) {
          showNotice("error", "End time must be a valid time (HH:MM).");
          return;
        }
        if (startTime && endTime && endTime <= startTime) {
          showNotice("error", "End time must be after start time.");
          return;
        }
        if (privateEnabled) {
          if (privatePrice == null || privatePrice <= 0) {
            showNotice("error", "Private base price must be greater than 0.");
            return;
          }
          if (privateCapacity == null || privateCapacity < 1) {
            showNotice("error", "Private max guests must be at least 1.");
            return;
          }
          if (privateIncludedGuests == null || privateIncludedGuests < 1) {
            showNotice("error", "Included private guests must be at least 1.");
            return;
          }
          if (privateIncludedGuests > privateCapacity) {
            showNotice("error", "Included private guests cannot exceed private max guests.");
            return;
          }
          if (privateExtraGuestPrice == null || privateExtraGuestPrice < 0) {
            showNotice("error", "Private extra guest price cannot be negative.");
            return;
          }
        }

        const deficitBreakdown = computePublicPricingBreakdown(price);
        if (deficitBreakdown && Number(deficitBreakdown.platformFeeCents) > Number(deficitBreakdown.guestPriceCents)) {
          const shortfallPerSeatCents = Math.max(0, Number(deficitBreakdown.platformFeeCents) - Number(deficitBreakdown.guestPriceCents));
          const thresholdSeats = Math.max(1, Math.ceil(Number(capacity) * 0.5));
          const stageADueCents = shortfallPerSeatCents * thresholdSeats;
          const stageBDueCents = shortfallPerSeatCents * Math.max(0, Number(capacity) - thresholdSeats);
          const proceed = await window.tstsConfirm(
            "Deficit shortfall warning:\n\nBooking value per seat: " + formatMoneyFromCents(deficitBreakdown.guestPriceCents) +
            "\nPlatform fee per seat: " + formatMoneyFromCents(deficitBreakdown.platformFeeCents) +
            "\nShortfall per seat: " + formatMoneyFromCents(shortfallPerSeatCents) +
            "\n\nIf this slot is approved as non-admin deficit, Stage A due will be " + formatMoneyFromCents(stageADueCents) +
            " (first 50% seats), and Stage B due will be " + formatMoneyFromCents(stageBDueCents) +
            " (remaining seats at threshold).\n\nProceed with this listing?",
            { confirmText: "Proceed", destructive: true }
          );
          if (!proceed) {
            showNotice("error", "Listing save cancelled. Update the price if you do not want deficit shortfall funding.");
            return;
          }
        }

        // ISS-018: nudge when publishing without a cover photo
        const hasImage = (imageInput && imageInput.files && imageInput.files.length > 0) || !!existingImageUrl;
        if (!hasImage) {
          const proceed = await window.tstsConfirm(
            "No cover photo added. Experiences with a photo get significantly more attention — would you still like to publish?",
            { confirmText: "Publish Anyway", cancelText: "Add a Photo" }
          );
          if (!proceed) {
            if (submitBtn) submitBtn.disabled = false;
            if (imageInput) imageInput.click();
            return;
          }
        }

        let imageUrl = existingImageUrl || "";

        // If user selected a new image, try upload. If upload fails, do NOT break the entire flow.
        if (imageInput && imageInput.files && imageInput.files.length > 0) {
          const file = imageInput.files[0];
          try {
            showNotice("info", "Uploading image…");
            imageUrl = await uploadImage(file);
            showNotice("success", "Image uploaded.");
          } catch (err) {
            // Accept-and-move-on behavior: keep existing image, allow save to proceed.
            showNotice("error", "We couldn't upload your image right now, but your experience has been saved. Try uploading the image again in a moment.");
            imageUrl = existingImageUrl || "";
          }
        }

        const body = {
          title,
          description,
          requirements,
          price,
          city,
          suburb,
          postcode,
          addressLine,
          addressNotes,
          capacity: Math.max(1, Math.floor(Number(capacity))),
          startDate,
          endDate,
          startTime,
          availableDays,
          tags
        };
        if (eventDurationMinutes != null) body.eventDurationMinutes = eventDurationMinutes;
        if (endTime) body.endTime = endTime;
        if (startTime && endTime) body.timeSlots = [startTime + "-" + endTime];
        if (imageUrl) body.imageUrl = imageUrl;
        else body.imageUrl = "/assets/experience-default.jpg";
        if (privateEnabled) {
          body.privatePrice = Number(privatePrice);
          body.privateCapacity = Math.max(1, Math.floor(Number(privateCapacity)));
          body.privateIncludedGuests = Math.max(1, Math.floor(Number(privateIncludedGuests)));
          body.privateExtraGuestPrice = Math.max(0, Number(privateExtraGuestPrice));
        } else {
          body.privatePrice = 0;
          body.privateCapacity = 0;
          body.privateIncludedGuests = 0;
          body.privateExtraGuestPrice = 0;
        }

        // Booking controls
        body.timezone = timezoneInput ? timezoneInput.value : "Australia/Melbourne";
        body.bookingCutoffEnabled = cutoffEnabledInput ? cutoffEnabledInput.checked : true;
        body.bookingCutoffMinutes = cutoffHoursInput ? Math.max(0, parseInt(cutoffHoursInput.value, 10) || 0) * 60 : 1440;

        // Group discounts
        body.dynamicDiscounts = buildDynamicDiscountsFromForm();

        const url = isEditing ? ("/api/experiences/" + encodeURIComponent(editId)) : "/api/experiences";
        const method = isEditing ? "PUT" : "POST";

        const res = await window.authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          var errCode = (payload && payload.error) || "";
          if (errCode === "CUTOFF_EDIT_LOCKED") {
            if (cutoffLockedBanner) cutoffLockedBanner.classList.remove("hidden");
          } else if (errCode === "CAPACITY_EXCEEDS_BUFFER_LIMIT" || errCode === "CAPACITY_BELOW_BOOKED") {
            if (window.tstsNotify) window.tstsNotify(String(payload.message || errCode), "warning");
          } else if (errCode === "INVALID_TIMEZONE") {
            if (window.tstsNotify) window.tstsNotify("Invalid timezone selected.", "warning");
          }
          showNotice("error", String((payload && payload.message) || "Failed to save experience. Please try again."));
          return;
        }
        if (cutoffLockedBanner) cutoffLockedBanner.classList.add("hidden");

        const savedExp = (payload && payload.experience) ? payload.experience : ((payload && payload.data) ? payload.data : payload);
        const savedExperienceId = String((savedExp && (savedExp._id || savedExp.id)) || editId || "").trim();
        const wantsVerified = !!pendingEventVerificationRequest;
        if (
          wantsVerified &&
          savedExperienceId &&
          currentVerifiedStatus !== "verified" &&
          currentVerifiedStatus !== "pending" &&
          normalizeHostVerificationStatus(hostVerificationStatus) === "verified"
        ) {
          try {
            await requestEventVerification(savedExperienceId);
          } catch (err) {
            showNotice("error", "Experience saved, but verification request failed: " + String((err && err.message) || "Unknown error"));
            return;
          }
        }

        showNotice("success", isEditing ? "Experience updated." : "Experience published.");
        // Reset to create mode after save
        isEditing = false;
        editId = null;
        existingImageUrl = null;
        currentVerifiedStatus = "none";
        if (form) form.reset();
        var hiddenId = document.getElementById("editing-experience-id");
        if (hiddenId) hiddenId.value = "";
        if (submitBtn) submitBtn.textContent = "Publish Experience";
        syncTagLimitUI();
        syncPrivateConfigUi();
        syncVerifiedUi();
        syncPricingTransparency();
        await loadHostListings();
        await loadShortfallDashboard({ silent: true });
      } catch (_) {
        showNotice("error", "Something went wrong. Please try again.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function renderListingCard(exp) {
    var El = window.tstsEl;
    var id = String((exp && (exp._id || exp.id)) || "");
    var rawTitle = String((exp && exp.title) || "Untitled");
    var status = String((exp && exp.status) || "ACTIVE");
    var labels = { ACTIVE: "Active", PAUSED: "Paused", DRAFT: "Draft", PENDING_REVIEW: "In Review", DELETED_SOFT: "Deleted" };
    var badgeClasses = {
      ACTIVE: "bg-green-100 text-green-800",
      PAUSED: "bg-yellow-100 text-yellow-800",
      DRAFT: "bg-gray-100 text-gray-600",
      PENDING_REVIEW: "bg-blue-100 text-blue-800",
      DELETED_SOFT: "bg-red-100 text-red-800"
    };
    var badgeEl = El("span", { className: "inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + (badgeClasses[status] || "bg-gray-100 text-gray-600"), textContent: labels[status] || status });
    var titleEl = El("span", { className: "font-semibold text-gray-900 text-sm truncate", textContent: rawTitle });

    var actionBtns = [];
    function makeBtn(label, cls, action) {
      var btn = El("button", { type: "button", className: "text-xs px-3 py-1.5 rounded-lg transition " + cls, textContent: label });
      btn.addEventListener("click", function () {
        if (action === "edit") loadListingForEdit(id);
        else if (action === "delete") doDeleteExperience(id, rawTitle);
        else doStatusAction(id, action);
      });
      return btn;
    }
    if (status === "ACTIVE") {
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
      actionBtns.push(makeBtn("Pause", "border border-orange-300 text-orange-700 hover:bg-orange-50", "pause"));
      actionBtns.push(makeBtn("Delete Experience", "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100", "delete"));
    } else if (status === "PAUSED") {
      actionBtns.push(makeBtn("Resume", "bg-green-600 text-white hover:bg-green-700", "resume"));
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
      actionBtns.push(makeBtn("Delete Experience", "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100", "delete"));
    } else if (status === "DRAFT" || status === "PENDING_REVIEW") {
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
      actionBtns.push(makeBtn("Delete Experience", "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100", "delete"));
    }

    var li = El("div", { className: "flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" }, [
      El("div", { className: "flex items-center gap-3 min-w-0" }, [titleEl, badgeEl]),
      El("div", { className: "flex items-center gap-2 flex-shrink-0" }, actionBtns)
    ]);
    return li;
  }

  async function loadHostListings() {
    var loadingEl = document.getElementById("my-listings-loading");
    var emptyEl = document.getElementById("my-listings-empty");
    var errorEl = document.getElementById("my-listings-error");
    var listEl = document.getElementById("my-listings-list");
    if (!listEl) return;
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    if (errorEl) errorEl.classList.add("hidden");
    listEl.classList.add("hidden");
    listEl.textContent = "";
    try {
      var res = await window.authFetch("/api/host/experiences");
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        throw new Error(mapHostListingsError(data, res.status));
      }
      var unwrapped = (data && data.data !== undefined) ? data.data : data;
      var exps = Array.isArray(unwrapped && unwrapped.items)
        ? unwrapped.items
        : (Array.isArray(unwrapped) ? unwrapped : (unwrapped && unwrapped.experiences ? unwrapped.experiences : []));
      if (loadingEl) loadingEl.classList.add("hidden");
      if (!exps || exps.length === 0) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      exps.forEach(function (exp) { listEl.appendChild(renderListingCard(exp)); });
      listEl.classList.remove("hidden");
    } catch (err) {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (errorEl) {
        errorEl.textContent = String((err && err.message) || "Failed to load listings. Please refresh.");
        errorEl.classList.remove("hidden");
      }
    }
  }

  async function doStatusAction(id, action) {
    try {
      var res = await window.authFetch("/api/experiences/" + encodeURIComponent(id) + "/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action })
      });
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (window.tstsNotify) window.tstsNotify(String((payload && payload.message) || "Action failed. Please try again."), "error");
        return;
      }
      await loadHostListings();
      await loadShortfallDashboard({ silent: true });
    } catch (_) {
      if (window.tstsNotify) window.tstsNotify("Action failed. Please try again.", "error");
    }
  }

  // B1+B2: Delete experience with booking check + consent modal
  async function doDeleteExperience(id, title) {
    try {
      // Check for confirmed bookings first
      var bRes = await window.authFetch("/api/host/bookings/" + encodeURIComponent(id));
      var bData = await bRes.json().catch(function () { return {}; });
      var bookings = [];
      if (bRes.ok && bData && bData.data) {
        var raw = bData.data;
        bookings = Array.isArray(raw.bookings) ? raw.bookings : (Array.isArray(raw) ? raw : []);
      }
      var confirmed = bookings.filter(function (b) {
        var s = String((b && b.status) || "").toLowerCase();
        return s === "confirmed" || s === "pending_payment";
      });

      if (confirmed.length === 0) {
        // No active bookings — simple confirm
        var ok = await window.tstsConfirm("Are you sure you want to delete this experience? It will be permanently removed.");
        if (!ok) return;
      } else {
        // Has active bookings — consent modal with penalty details
        var totalCents = 0;
        confirmed.forEach(function (b) {
          var amt = 0;
          if (b.pricingSnapshot && Number.isFinite(Number(b.pricingSnapshot.totalCents))) amt = Number(b.pricingSnapshot.totalCents);
          else if (b.feeBreakdown && Number.isFinite(Number(b.feeBreakdown.totalCents))) amt = Number(b.feeBreakdown.totalCents);
          else if (Number.isFinite(Number(b.amountCents))) amt = Number(b.amountCents);
          totalCents += amt;
        });
        var recoveryCents = Math.max(0, Math.round(totalCents * 0.05));
        var recoveryDollars = (recoveryCents / 100).toFixed(2);

        var msg = "This experience has " + confirmed.length + " confirmed booking(s). " +
          "Deleting it will cancel all guest bookings, issue full refunds, " +
          "and apply a 5% cancellation charge ($" + recoveryDollars + ") deducted from your future payouts. " +
          "By proceeding, you confirm you understand and accept these terms.";

        var ok2 = await window.tstsConfirm(msg, { confirmText: "Delete and Refund Guests", cancelText: "Cancel", destructive: true });
        if (!ok2) return;
      }

      // OTP dual-auth verification for experience deletion
      var otpToken = await window.tstsOtpVerify("experience_delete", {
        message: "To confirm listing deletion, verify your identity.",
        actionLabel: "Verify & Delete",
        meta: { experienceId: id }
      });
      if (!otpToken) return;

      // Proceed with delete
      var dRes = await window.authFetch("/api/experiences/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken: otpToken })
      });
      var dData = await dRes.json().catch(function () { return {}; });
      if (!dRes.ok) {
        if (window.tstsNotify) window.tstsNotify(String((dData && dData.message) || "Delete failed. Please try again."), "error");
        return;
      }
      if (window.tstsNotify) window.tstsNotify("Experience deleted.", "success");
      await loadHostListings();
      await loadShortfallDashboard({ silent: true });
    } catch (err) {
      if (window.tstsNotify) window.tstsNotify("Delete failed. Please try again.", "error");
    }
  }

  async function loadListingForEdit(id) {
    try {
      var res = await window.authFetch("/api/experiences/" + encodeURIComponent(id));
      if (!res.ok) { if (window.tstsNotify) window.tstsNotify("Could not load listing.", "error"); return; }
      var expRaw = await res.json().catch(function () { return null; });
      if (!expRaw) { if (window.tstsNotify) window.tstsNotify("Could not load listing.", "error"); return; }
      var exp = (expRaw && expRaw.data) ? expRaw.data : expRaw;
      isEditing = true;
      editId = id;
      existingImageUrl = exp.imageUrl || "";
      currentVerifiedStatus = exp.verifiedStatus || "none";
      if (titleInput) titleInput.value = String(exp.title || "");
      if (descriptionInput) descriptionInput.value = String(exp.description || "");
      __updateDescCounter();
      if (priceInput) priceInput.value = String(exp.price != null ? exp.price : "");
      if (dateInput) dateInput.value = String(exp.startDate || "");
      if (endDateInput) endDateInput.value = String(exp.endDate || "");
      if (timeInput) timeInput.value = String(exp.startTime || "");
      if (endTimeInput) endTimeInput.value = String(exp.endTime || "");
      if (locationInput) locationInput.value = String(exp.city || "");
      if (suburbInput) suburbInput.value = String(exp.suburb || "");
      if (postcodeInput) postcodeInput.value = String(exp.postcode || "");
      if (addressLineInput) addressLineInput.value = String(exp.addressLine || "");
      if (addressNotesInput) addressNotesInput.value = String(exp.addressNotes || "");
      if (maxGuestsInput) maxGuestsInput.value = String(exp.maxGuests != null ? exp.maxGuests : "");
      if (requirementsInput) requirementsInput.value = String(exp.requirements || "");
      if (eventDurationMinutesInput) eventDurationMinutesInput.value = exp.eventDurationMinutes != null ? String(exp.eventDurationMinutes) : "";
      // Populate availableDays checkboxes from stored data
      (function () {
        var rawDays = Array.isArray(exp.availableDays) ? exp.availableDays : parseAvailableDays(exp.availableDays);
        var daySet = new Set(rawDays.map(function (d) { return String(d || "").trim(); }));
        var cbs = document.querySelectorAll('input[name="availableDays"]');
        for (var i = 0; i < cbs.length; i++) { cbs[i].checked = daySet.has(cbs[i].value); }
      })();
      var tagCheckboxes = document.querySelectorAll('input[name="tags"]');
      var expTags = Array.isArray(exp.tags) ? exp.tags : [];
      tagCheckboxes.forEach(function (cb) { cb.checked = expTags.includes(cb.value); });
      syncTagLimitUI();
      var hasPrivate = !!(exp.privatePrice && Number(exp.privatePrice) > 0);
      if (privateEnabledInput) privateEnabledInput.checked = hasPrivate;
      syncPrivateConfigUi();
      if (hasPrivate) {
        if (privatePriceInput) privatePriceInput.value = String(exp.privatePrice || "");
        if (privateCapacityInput) privateCapacityInput.value = String(exp.privateCapacity || "");
        if (privateIncludedGuestsInput) privateIncludedGuestsInput.value = String(exp.privateIncludedGuests || "");
        if (privateExtraGuestPriceInput) privateExtraGuestPriceInput.value = String(exp.privateExtraGuestPrice || "");
      }
      // Hydrate booking controls
      if (timezoneInput) timezoneInput.value = exp.timezone || "Australia/Melbourne";
      if (cutoffEnabledInput) cutoffEnabledInput.checked = (exp.bookingCutoffEnabled !== false);
      if (cutoffHoursInput) cutoffHoursInput.value = String(Math.round((exp.bookingCutoffMinutes || 1440) / 60));
      syncCutoffUi();

      // Hydrate group discount tiers
      populateDiscountTiersFromExp(exp);

      var hiddenId = document.getElementById("editing-experience-id");
      if (hiddenId) hiddenId.value = id;
      if (submitBtn) submitBtn.textContent = "Save Changes";
      syncVerifiedUi();
      syncPricingTransparency();
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {
      if (window.tstsNotify) window.tstsNotify("Could not load listing for editing.", "error");
    }
  }

  var createNewBtn = document.getElementById("create-new-listing-btn");
  if (createNewBtn) {
    createNewBtn.addEventListener("click", function () {
      isEditing = false;
      editId = null;
      existingImageUrl = null;
      currentVerifiedStatus = "none";
      if (form) form.reset();
      var hiddenId = document.getElementById("editing-experience-id");
      if (hiddenId) hiddenId.value = "";
      if (submitBtn) submitBtn.textContent = "Publish Experience";
      syncTagLimitUI();
      syncPrivateConfigUi();
      syncVerifiedUi();
      syncPricingTransparency();
      hideNotice();
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (shortfallRefreshBtn) {
    shortfallRefreshBtn.addEventListener("click", function () {
      loadShortfallDashboard({ silent: false });
    });
  }

  (async function initHostPage() {
    const ok = await requireAuth();
    if (!ok) {
      unmaskAuthGate();
      return;
    }
    await loadEditMode();
    await loadHostVerificationStatus();
    await loadActivePolicySnapshot();
    syncPricingTransparency();
    await loadHostListings();
    await loadShortfallDashboard({ silent: false });
    unmaskAuthGate();
  })().catch(function () {
    unmaskAuthGate();
  });
})();
