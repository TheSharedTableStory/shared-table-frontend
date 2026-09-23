(function () {
  function unmaskAuthGate() {
    try { document.documentElement.removeAttribute("data-auth-pending"); } catch (_) {}
  }

  // sir 2026-08-13 (timezone fix, all three files): the host form's "today" floor was the
  // DEVICE's day — a host travelling ahead of Melbourne could not schedule Melbourne's own
  // today, and one behind could pick a Melbourne day already over. The listings run in
  // Melbourne, so the calendar floor reads Melbourne's clock. en-CA prints YYYY-MM-DD.
  function melbourneTodayIso() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (_tzErr) {
      var _d = new Date();
      return new Date(_d.getTime() - _d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
    }
  }

  function redirectToLogin() {
    var returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace("login.html?returnTo=" + returnTo);
  }

	  const form = document.getElementById("create-experience-form");
	  const titleInput = document.getElementById("title");
	  const descriptionInput = document.getElementById("description");
	  const priceInput = document.getElementById("price");
	  const currencyInput = document.getElementById("currency");
	  const dateInput = document.getElementById("startDate");
	  const endDateInput = document.getElementById("endDate");
	  // Owner 2026-05-30 (date-picker rollout): wire both date inputs to the shared
	  // Flatpickr wrapper from common.js so host start/end pickers match experience.html
	  // exactly (brand palette, Mon-start, mobile native). endDate's minDate follows
	  // startDate so the host can never pick an end date before the start.
	  let startDatePicker = null;
	  let endDatePicker = null;
	  if (window.tstsDatePicker && dateInput) {
	    startDatePicker = window.tstsDatePicker(dateInput, {
	      // sir 2026-08-13: "today" here was the device's today — Melbourne's day now (see melbourneTodayIso).
	      minDate: melbourneTodayIso(),
	      onChange: function (selectedDates, dateStr) {
	        if (endDatePicker && dateStr) {
	          try { endDatePicker.set("minDate", dateStr); } catch (_e) { void _e; }
	        }
	      }
	    });
	  }
	  if (window.tstsDatePicker && endDateInput) {
	    endDatePicker = window.tstsDatePicker(endDateInput, { minDate: melbourneTodayIso() });
	  }
	  const timeInput = document.getElementById("startTime");
	  const endTimeInput = document.getElementById("endTime");
	  // Owner 2026-05-30 (date-picker rollout R3 audit): wire startTime + endTime
	  // to Flatpickr time-only mode so the host gets the brand picker for time too
	  // (otherwise Chrome's native HH:MM polyfill renders alongside Flatpickr dates
	  // — inconsistent). dateFormat "H:i" (24h) matches the timeRe validation. The
	  // visible altInput shows "h:i K" (e.g. "07:30 PM") for readability. endTime's
	  // minTime tracks startTime so end <= start can't be picked.
	  let startTimePicker = null;
	  let endTimePicker = null;
	  if (window.flatpickr && timeInput) {
	    try {
	      timeInput.setAttribute("type", "text");
	      timeInput.setAttribute("readonly", "readonly");
	      timeInput.setAttribute("autocomplete", "off");
	      startTimePicker = window.flatpickr(timeInput, {
	        noCalendar: true,
	        enableTime: true,
	        time_24hr: true,
	        dateFormat: "H:i",
	        altInput: true,
	        altFormat: "h:i K",
	        disableMobile: false,
	        onChange: function (_selectedDates, dateStr) {
	          if (endTimePicker && dateStr) {
	            try { endTimePicker.set("minTime", dateStr); } catch (_e) { void _e; }
	          }
	        }
	      });
	    } catch (_e) { void _e; }
	  }
	  if (window.flatpickr && endTimeInput) {
	    try {
	      endTimeInput.setAttribute("type", "text");
	      endTimeInput.setAttribute("readonly", "readonly");
	      endTimeInput.setAttribute("autocomplete", "off");
	      endTimePicker = window.flatpickr(endTimeInput, {
	        noCalendar: true,
	        enableTime: true,
	        time_24hr: true,
	        dateFormat: "H:i",
	        altInput: true,
	        altFormat: "h:i K",
	        disableMobile: false
	      });
	    } catch (_e) { void _e; }
	  }
	  const locationInput = document.getElementById("city");
	  const suburbInput = document.getElementById("suburb");
	  const postcodeInput = document.getElementById("postcode");
	  const addressLineInput = document.getElementById("addressLine");
	  const addressNotesInput = document.getElementById("addressNotes");
	  // Owner-spec 2026-05-03: state + country fields auto-filled from Places.
	  const stateInput = document.getElementById("state");
	  const countryInput = document.getElementById("country");
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
  const timezoneInput = document.getElementById("experienceTimezone");
  const cutoffEnabledInput = document.getElementById("bookingCutoffEnabled");
  const cutoffHoursInput = document.getElementById("bookingCutoffHours");
  const cutoffHoursRow = document.getElementById("cutoff-hours-row");
  const cutoffPreviewEl = document.getElementById("cutoff-preview");
  const cutoffLockedBanner = document.getElementById("cutoff-locked-banner");
  const requirementsInput = document.getElementById("requirements");
  const eventDurationMinutesInput = document.getElementById("eventDurationMinutes");
  // Owner-approved 2026-05-02: Hours + Minutes inputs (Gareth feedback). Hidden
  // eventDurationMinutes is computed from hours + minutes; existing logic that
  // reads/writes that hidden field continues to work without change.
  const eventDurationHoursInput = document.getElementById("eventDurationHours");
  const eventDurationMinsInput  = document.getElementById("eventDurationMins");
  const durationSummaryEl       = document.getElementById("duration-summary");
  function syncDurationFromHoursMins() {
    if (!eventDurationMinutesInput) return;
    var h = eventDurationHoursInput ? parseInt(eventDurationHoursInput.value, 10) : 0;
    var m = eventDurationMinsInput  ? parseInt(eventDurationMinsInput.value, 10)  : 0;
    if (!Number.isFinite(h) || h < 0) h = 0;
    if (!Number.isFinite(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    var total = h * 60 + m;
    eventDurationMinutesInput.value = total > 0 ? String(total) : "";
    if (durationSummaryEl) {
      if (total <= 0) {
        durationSummaryEl.textContent = "Use this for each event instance. Start/end date and time above define the recurring schedule window.";
      } else {
        var label;
        if (total < 60) label = total + " min";
        else if (total === 60) label = "1 hr";
        else if (total % 60 === 0) label = (total / 60) + " hr";
        else label = h + " hr " + m + " min";
        durationSummaryEl.textContent = "Each event runs " + label + ". Start/end date and time above define the recurring schedule window.";
      }
    }
  }
  // sir's ruling, 2026-08-22 (overturns BUG-074's "no free experiences" rule): price may be
  // zero when the host funds the seat themselves or an admin waives the fee; only a negative
  // price is invalid. Pure → unit-testable.
  function isHostPriceRejected(price) {
    return price < 0;
  }
  function seedDurationHoursMinsFromHidden() {
    if (!eventDurationMinutesInput) return;
    var raw = parseInt(eventDurationMinutesInput.value, 10);
    if (!Number.isFinite(raw) || raw <= 0) return;
    var h = Math.floor(raw / 60);
    var m = raw % 60;
    if (eventDurationHoursInput && !eventDurationHoursInput.value) eventDurationHoursInput.value = String(h);
    if (eventDurationMinsInput  && !eventDurationMinsInput.value)  eventDurationMinsInput.value  = String(m);
    syncDurationFromHoursMins();
  }
  if (eventDurationHoursInput) eventDurationHoursInput.addEventListener("input", syncDurationFromHoursMins);
  if (eventDurationMinsInput)  eventDurationMinsInput.addEventListener("input",  syncDurationFromHoursMins);
  // Initial seed for edit mode where hidden value pre-populates from server.
  setTimeout(seedDurationHoursMinsFromHidden, 50);

  // Owner-approved 2026-05-02 (Gareth): single combined Address search using
  // Google Places Autocomplete. Picks fill City, Suburb, Postcode, Street.
  // Manual edit of each field still works after auto-fill.
  function initAddressAutocomplete() {
    var input = document.getElementById("address-search");
    if (!input) return;
    if (!(window.google && window.google.maps && window.google.maps.places)) return false;
    try {
      var ac = new window.google.maps.places.Autocomplete(input, {
        fields: ["address_components", "geometry", "formatted_address"],
        // Owner 2026-05-24: opened to international locations (was AU-only) so hosts
        // can list events anywhere; the listing currency auto-defaults from the
        // selected country (see applyCurrencyDefaultFromCountry).
        types: ["address"]
      });
      ac.addListener("place_changed", function() {
        var place = ac.getPlace();
        if (!place || !Array.isArray(place.address_components)) return;
        var byType = {};
        place.address_components.forEach(function(c) {
          (c.types || []).forEach(function(t) { byType[t] = c; });
        });
        var streetNumber = byType.street_number ? byType.street_number.long_name : "";
        var route        = byType.route ? byType.route.long_name : "";
        var locality     = byType.locality ? byType.locality.long_name : (byType.postal_town ? byType.postal_town.long_name : "");
        var subLocality  = byType.sublocality_level_1 ? byType.sublocality_level_1.long_name : (byType.sublocality ? byType.sublocality.long_name : "");
        var postcode     = byType.postal_code ? byType.postal_code.long_name : "";
        // Owner-spec 2026-05-03: also capture state (short_name e.g. "VIC") + country (long_name).
        // Cards render `Suburb · City · STATE` so interstate listings (QLD vs VIC) are unambiguous.
        // Country stored for future international expansion; not rendered today (TSTS is AU-only).
        var stateShort   = byType.administrative_area_level_1 ? byType.administrative_area_level_1.short_name : "";
        var countryName  = byType.country ? byType.country.long_name : "";
        var streetLine   = (streetNumber ? streetNumber + " " : "") + route;
        var cityField     = document.getElementById("city");
        var suburbField   = document.getElementById("suburb");
        var postcodeField = document.getElementById("postcode");
        var addressField  = document.getElementById("addressLine");
        var stateField    = document.getElementById("state");
        var countryField  = document.getElementById("country");
        if (cityField     && locality)    { cityField.value     = locality;    cityField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (suburbField   && subLocality) { suburbField.value   = subLocality; suburbField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (suburbField   && !subLocality && locality) { suburbField.value = locality; suburbField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (postcodeField && postcode)    { postcodeField.value = postcode;    postcodeField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (addressField  && streetLine)  { addressField.value  = streetLine;  addressField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (stateField    && stateShort)  { stateField.value    = stateShort;  stateField.dispatchEvent(new Event("input", {bubbles:true})); }
        if (countryField  && countryName) { countryField.value  = countryName; countryField.dispatchEvent(new Event("input", {bubbles:true})); }
      });
      return true;
    } catch (_acErr) {
      try { console && console.warn && console.warn("[host] address autocomplete init failed:", _acErr); } catch (_logErr) { /* logger unavailable */ }
      return false;
    }
  }
  // Maps script loads async; poll briefly until ready.
  var _acTries = 0;
  (function tryInitAc() {
    if (initAddressAutocomplete()) return;
    if (_acTries++ < 20) setTimeout(tryInitAc, 250);
  })();

  // Owner 2026-05-24: default the listing currency from the event's country
  // (Places fills `country`, which fires an "input" event we listen for) — unless
  // the host manually changes the currency picker, in which case we leave it alone.
  var __userTouchedCurrency = false;
  var __COUNTRY_CCY = {
    "australia": "AUD", "new zealand": "NZD",
    "united states": "USD", "united states of america": "USD",
    "united kingdom": "GBP", "canada": "CAD", "india": "INR", "japan": "JPY",
    "germany": "EUR", "france": "EUR", "italy": "EUR", "spain": "EUR", "ireland": "EUR",
    "netherlands": "EUR", "portugal": "EUR", "austria": "EUR", "belgium": "EUR",
    "greece": "EUR", "finland": "EUR", "luxembourg": "EUR"
  };
  function applyCurrencyDefaultFromCountry() {
    if (!currencyInput || __userTouchedCurrency) return;
    var c = String((countryInput && countryInput.value) || "").trim().toLowerCase();
    var ccy = __COUNTRY_CCY[c];
    if (ccy) currencyInput.value = ccy;
  }
  if (currencyInput) currencyInput.addEventListener("change", function () { __userTouchedCurrency = true; });
  if (countryInput) countryInput.addEventListener("input", applyCurrencyDefaultFromCountry);
  applyCurrencyDefaultFromCountry();

  // CONFIGURE-BEFORE-LIST: the picker shows only the currencies the admin has enabled
  // (fetched from the canonical money config), not a hardcoded set. Falls back to the
  // static <option>s already in the markup if the fetch fails.
  var __CCY_SYMBOL = { aud: "A$", nzd: "NZ$", usd: "$", gbp: "£", eur: "€", cad: "CA$", inr: "₹", jpy: "¥", chf: "CHF", sgd: "S$" };
  async function populateListingCurrencies() {
    if (!currencyInput) return;
    try {
      var res = await window.authFetch("/api/pricing/listing-currencies", { method: "GET" });
      var payload = await res.json();
      var list = (payload && payload.data && Array.isArray(payload.data.currencies)) ? payload.data.currencies : [];
      if (!list.length) return; // keep the static fallback options
      var prev = String(currencyInput.value || "").toUpperCase();
      while (currencyInput.firstChild) currencyInput.removeChild(currencyInput.firstChild);
      list.forEach(function (c) {
        var code = String((c && c.code) || "").toUpperCase();
        if (!code) return;
        var sym = __CCY_SYMBOL[code.toLowerCase()] || "";
        var opt = document.createElement("option");
        opt.value = code;
        opt.textContent = (sym ? sym + " " : "") + code;
        currencyInput.appendChild(opt);
      });
      // Restore prior selection if still available, else re-derive from country.
      var codes = list.map(function (c) { return String((c && c.code) || "").toUpperCase(); });
      if (prev && codes.indexOf(prev) >= 0) currencyInput.value = prev;
      else { __userTouchedCurrency = false; applyCurrencyDefaultFromCountry(); }
    } catch (e) { /* keep static fallback options */ }
  }
  populateListingCurrencies();

  // Owner-spec 2026-05-03 (D-9 sub #5): expand-on-select for booking-type picker.
  // Selected card shows the long helper (with trade-off line on Shared/Private,
  // factual operating note on Both). Other cards collapse to short summary.
  function refreshBookingModeCards() {
    var picker = document.querySelector("[data-booking-mode-picker]");
    if (!picker) return;
    var cards = picker.querySelectorAll("[data-bm-card]");
    cards.forEach(function (card) {
      var input = card.querySelector('input[type="radio"]');
      var shortEl = card.querySelector("[data-bm-short]");
      var longEl = card.querySelector("[data-bm-long]");
      if (!input || !shortEl || !longEl) return;
      if (input.checked) {
        card.classList.add("border-tsts-clay", "bg-orange-50/50");
        card.classList.remove("border-slate-200", "bg-slate-50/50");
        shortEl.classList.add("hidden");
        shortEl.classList.remove("block");
        longEl.classList.remove("hidden");
        longEl.classList.add("block");
      } else {
        card.classList.remove("border-tsts-clay", "bg-orange-50/50");
        card.classList.add("border-slate-200", "bg-slate-50/50");
        shortEl.classList.remove("hidden");
        shortEl.classList.add("block");
        longEl.classList.add("hidden");
        longEl.classList.remove("block");
      }
    });
  }
  // Wire change listeners + initial paint.
  document.querySelectorAll('input[name="bookingMode"]').forEach(function (r) {
    r.addEventListener("change", refreshBookingModeCards);
  });
  refreshBookingModeCards();
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
    // 2026-08-25: the counter already turned RED below 150, but never said WHAT 150 was — a host at
    // 140 saw a red "140 / 1500" and no reason for it, then got refused on Next by a rule the page had
    // never stated. The threshold is now named while it is unmet, in the same words the report form
    // already uses ("at least N"). Above the minimum the counter stays exactly as it was.
    descCounterEl.textContent = (len < 150)
      ? (len + " / 1500 · at least 150")
      : (len + " / 1500");
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
    // 2026-08-26: the counter named the 150 minimum correctly, but ONLY once the host typed —
    // the listener was its only trigger on a NEW listing, so the form opened showing host.html's
    // static "0 / 1500" in grey and the requirement stayed unstated until the first keystroke.
    // That is the exact gap the minimum was added to close. Run it once at rest so the rule is
    // on screen before the host writes a word. (Edit mode already called it at :1831.)
    __updateDescCounter();
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
    if (tok.length < 2) { cityDatalist.textContent = ""; return; } // safety: clear without innerHTML
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

  // Country-aware postcode validity — mirrors the server (__isValidPostcodeForCountry).
  // AU (+ empty/unset, to preserve home-market behaviour) keeps the strict 4-digit rule;
  // explicitly-international hosts get a permissive postal format (US/UK/CA/JP/EU).
  function __isAuAddr(country) {
    var c = String(country || "").trim().toLowerCase();
    return c === "" || c === "australia" || c === "au" || c === "aus";
  }
  function __validPostcodeForCountry(pc, country) {
    pc = String(pc || "").trim();
    if (__isAuAddr(country)) return /^[0-9]{4}$/.test(pc);
    if (pc === "") return true; // some countries have no postal code
    return /^[A-Za-z0-9][A-Za-z0-9 \-]{0,11}$/.test(pc);
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
    if (!anyMatchForCity) return true; // unknown city, don't block
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

  // Toast feedback, uses the global tstsNotify (common.js) so messages always render
  // in the bottom-right corner regardless of where the user is in the wizard.
  // The previous implementation prepended a notice to the form, which sat above wizard
  // step 1 and was invisible from the publish button on step 5.
  function showNotice(kind, msg) {
    var k = (kind === "error" || kind === "success" || kind === "warning" || kind === "info") ? kind : "info";
    if (window.tstsNotify) { window.tstsNotify(String(msg || ""), k); return; }
    if (typeof console !== "undefined" && console && typeof console.warn === "function") {
      console.warn("tstsNotify unavailable, falling back:", k, msg);
    }
  }

  function hideNotice() {
    // No-op: tstsNotify toasts auto-dismiss after 5s.
  }

  // 2026-08-25: the toast is the ONLY error signal on this wizard and it erases itself after 5s,
  // while the field itself was never marked at all — .focus() gives the ordinary orange focus ring,
  // so a WRONG field looked identical to one the host had merely clicked into. Five seconds later
  // there was no trace of the error anywhere on screen.
  //
  // This marks the offending field persistently and clears it the moment the host starts fixing it.
  // Inline style on purpose: no stylesheet is touched, and it cannot fight the Tailwind classes on
  // the input. aria-invalid is set so the failure is announced, not just coloured.
  function __markFieldInvalid(el) {
    if (!el) return;
    try {
      el.style.borderColor = "#f87171";
      el.setAttribute("aria-invalid", "true");
      var __clear = function () {
        el.style.borderColor = "";
        el.removeAttribute("aria-invalid");
        el.removeEventListener("input", __clear);
      };
      el.addEventListener("input", __clear);
    } catch (_e) { void _e; }
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

  function toCents(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  // Owner 2026-07-24 (sir: pages "in line with locked ones"): this HARDCODED "$…  AUD" even though the
  // listing currency picker supports AUD/CAD/NZD/SGD/USD and SAVES the host's choice onto the listing
  // (currency: currencyInput.value). A host listing in NZD/USD/CAD/SGD therefore saw the WRONG currency on
  // their own per-guest price, platform fee, payout estimate, tier bands and private-table summary. Now reads
  // the picker and renders the correct symbol, matching the Explore card's A$/NZ$/CA$ convention.
  // The invalid-value placeholder was a bare ", " which rendered as a lone comma (seen live on
  // #publish-success-price) — same dev-cruft anti-pattern already fixed in admin.js; now an em dash.
  // Covers every option the #currency picker actually offers (AUD CAD CHF EUR GBP INR JPY NZD SGD USD).
  // Anything unmapped falls back to a "CODE " prefix, which is unambiguous rather than a misleading "$".
  const LISTING_CCY_SYMBOL = {
    AUD: "A$", NZD: "NZ$", CAD: "CA$", SGD: "S$", USD: "$",
    EUR: "€", GBP: "£", INR: "₹", JPY: "¥", CHF: "CHF "
  };
  function listingCurrencyCode() {
    const raw = currencyInput ? String(currencyInput.value || "AUD") : "AUD";
    const code = raw.trim().toUpperCase();
    return code || "AUD";
  }
  function formatMoneyFromCents(centsRaw) {
    const cents = Number(centsRaw);
    if (!Number.isFinite(cents)) return "—";
    const code = listingCurrencyCode();
    const symbol = LISTING_CCY_SYMBOL[code] || (code + " ");
    return symbol + (cents / 100).toFixed(2);
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

  // tierRangeLabel removed 2026-08-16 with the W3 jargon fix that orphaned it —
  // sir's standing rule: dead code dies in the same change that replaces it.

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
    // sir 2026-08-16 ("Fix it", walk gap W3): plain words a host understands —
    // "recovery offsets" is the fee engine's term, not a host's. Number unchanged.
    return formatMoneyFromCents(b.hostPayoutCents) + " after the platform fee. Discounts you fund come out of this.";
  }

  function resolvePlatformFeeEstimate(price) {
    const b = computePublicPricingBreakdown(price);
    if (!b) return "—";
    // sir 2026-08-16 ("Fix it", walk gap W3): the old line printed the fee engine's
    // internals to the host — "−A$0.00 (0% + fixed tier component). Tier range
    // unavailable". Zero fee now says so plainly; a real fee reads as one honest
    // sentence with the exact per-guest amount. Tier vocabulary never renders.
    if (!(Number(b.platformFeeCents) > 0)) {
      return formatMoneyFromCents(0) + ". You keep the full guest price.";
    }
    var pct = Number.isFinite(Number(b.platformFeeBps)) ? (Number(b.platformFeeBps) / 100).toFixed(2).replace(/\.00$/, "") : "0";
    var pctPart = (Number(pct) > 0) ? (" (" + pct + "% of the guest price)") : "";
    return formatMoneyFromCents(b.platformFeeCents) + " per guest" + pctPart;
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
    var guestCents = b ? Number(b.guestPriceCents) : 0;
    if (!active || !Number.isFinite(guestCents) || guestCents < 500) {
      warningEl.classList.add("hidden");
      warningEl.textContent = "";
      return;
    }
    var shortfallCents = Math.max(0, Number(b.platformFeeCents) - Number(b.guestPriceCents));
    warningEl.classList.remove("hidden");
    warningEl.textContent = "Heads up: the platform cost per guest (" + formatMoneyFromCents(b.platformFeeCents) + ") exceeds the guest price (" + formatMoneyFromCents(b.guestPriceCents) + "). You'll cover the difference (" + formatMoneyFromCents(shortfallCents) + " per guest) in two payments as seats fill. This amount is refunded after the event.";
  }

  function syncPricingTransparency() {
    if (platformFeeRate === null) {
      // Fee policy not yet loaded, show raw public price (fee-independent) and loading states
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
      if (pricingPolicyReferenceEl) { pricingPolicyReferenceEl.textContent = ""; pricingPolicyReferenceEl.classList.add("hidden"); }
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
      // Owner-approved 2026-05-02: copy aligns with the inline 'How event verification works' steps.
      pricingHostChargeNoteEl.textContent = "Estimated payout shown above is after platform fee. If your event becomes verified, the verified-event fee is added to the platform fee at that point and reflected in your payout.";
    }
    if (pricingPolicyReferenceEl) {
      pricingPolicyReferenceEl.textContent = "";
      pricingPolicyReferenceEl.classList.add("hidden");
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

  // 2026-09-07: the host funding screen that used to live here was removed. It had been ported to the
  // My Bookings funding tab (the version sir approved), and the copy left behind here was never given any
  // markup: every container it wrote into is absent from every page in the site, so no host ever saw it,
  // while this page still asked the server for funding status on every load and threw the answer away.
  // The pricing warning a host sees while setting the price is a different thing and is still above.

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

  async function requestEventVerification(experienceId, payload) {
    const id = String(experienceId || "").trim();
    if (!id) throw new Error("Experience id missing");

    const vr = await window.authFetch("/api/host/experiences/" + encodeURIComponent(id) + "/verified-opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const vrRaw = await vr.json().catch(() => ({}));
    const vrPayload = (vrRaw && vrRaw.data) ? vrRaw.data : vrRaw;
    if (!vr.ok) {
      // Owner-approved 2026-08-04 (sir, Item 24): the backend's own sentence is carried
      // on `humanMessage` so callers can show it WITHOUT ever risking exception text.
      var __beMsg = String((vrPayload && vrPayload.message) || (vrRaw && vrRaw.message) || "").trim();
      var __err = new Error(__beMsg || "verification request failed");
      if (__beMsg) __err.humanMessage = __beMsg;
      throw __err;
    }
    const updated = (vrPayload && vrPayload.experience) ? vrPayload.experience : vrPayload;
    currentVerifiedStatus = normalizeVerifiedStatus(updated && updated.verifiedStatus);
    pendingEventVerificationRequest = false;
    syncVerifiedUi();
    syncPricingTransparency();
  }

  // Owner-spec 2026-05-02, open the event-verification submission modal.
  // Collects eventPlan + safetyMeasures + promiseOfFulfilment + capacityRationale,
  // posts to /verified-opt-in, closes on success, surfaces backend validation errors.
  function openEventVerificationModal(experienceId) {
    const id = String(experienceId || "").trim();
    if (!id) return;
    const backdrop = document.getElementById("event-verification-modal-backdrop");
    const modal    = document.getElementById("event-verification-modal");
    const closeBtn = document.getElementById("event-verification-modal-close");
    const cancelBtn = document.getElementById("ev-cancel");
    const submitBtn = document.getElementById("ev-submit");
    const errorEl  = document.getElementById("ev-error");
    const planEl   = document.getElementById("ev-plan");
    const safetyEl = document.getElementById("ev-safety");
    const promiseEl = document.getElementById("ev-promise");
    const capacityEl = document.getElementById("ev-capacity");
    const insuranceEl = document.getElementById("ev-insurance");
    const foodCertEl  = document.getElementById("ev-food-cert");
    if (!backdrop || !modal || !submitBtn) return;

    function open() {
      backdrop.classList.remove("hidden");
      modal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      if (errorEl) { errorEl.classList.add("hidden"); errorEl.textContent = ""; }
    }
    function close() {
      backdrop.classList.add("hidden");
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    }
    if (closeBtn)  closeBtn.onclick  = close;
    if (cancelBtn) cancelBtn.onclick = close;
    backdrop.onclick = close;

    submitBtn.onclick = async function () {
      if (errorEl) { errorEl.classList.add("hidden"); errorEl.textContent = ""; }
      const submitPayload = {
        eventPlan: String((planEl && planEl.value) || "").trim(),
        safetyMeasures: String((safetyEl && safetyEl.value) || "").trim(),
        promiseOfFulfilment: String((promiseEl && promiseEl.value) || "").trim(),
        capacityRationale: String((capacityEl && capacityEl.value) || "").trim(),
        insurancePolicyNumber: String((insuranceEl && insuranceEl.value) || "").trim(),
        foodSafetyCert: String((foodCertEl && foodCertEl.value) || "").trim(),
      };
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
      try {
        await requestEventVerification(id, submitPayload);
        close();
        if (window.tstsToast) window.tstsToast({ type: "success", message: "Verification request sent." });
      } catch (err) {
        // Owner 2026-06-12: never show raw schema field names to the host — map them to friendly labels.
        const __EV_FIELD_LABELS = {
          eventPlan: "Event plan",
          safetyMeasures: "Safety measures",
          promiseOfFulfilment: "Promise of fulfilment",
          capacityRationale: "Capacity rationale",
          insurancePolicyNumber: "Insurance policy number",
          foodSafetyCert: "Food safety certificate",
        };
        const missing = err && Array.isArray(err.missing) ? err.missing : null;
        const friendly = (missing && missing.length) ? missing.map(function (k) { return __EV_FIELD_LABELS[k] || k; }) : null;
        // Owner-approved 2026-08-04 (sir, Item 24): the backend's sentence via
        // humanMessage, never err.message (which may carry machine text).
        const msg = (friendly && friendly.length)
          ? "Please add a bit more detail to: " + friendly.join(", ") + "."
          : String((err && err.humanMessage) || "We couldn't send your verification request just now. Please try again in a moment.");
        if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove("hidden"); }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit for review";
      }
    };
    open();
  }
  window.tstsOpenEventVerificationModal = openEventVerificationModal;

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
        // Owner-spec 2026-05-02, open the submission modal instead of direct POST.
        // (The dead direct-POST block that used to sit here behind a no-unreachable suppression
        // is gone — it could never run, and it posted the same empty body that never worked.)
        openEventVerificationModal(editId);
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

  // Client-side compression for files > 2 MB. Resizes longest side to 1920px and
  // re-encodes to JPEG q80, drops a 6 MB iPhone HEIC down to ~400 KB while
  // staying sharp on mobile + desktop. Returns the original file if compression
  // is unsupported or if the file is already small enough.
  function compressImageIfNeeded(file) {
    return new Promise(function (resolve) {
      var twoMB = 2 * 1024 * 1024;
      if (!file || file.size <= twoMB) return resolve(file);
      if (typeof FileReader !== "function" || typeof Image !== "function" || !document.createElement("canvas").toBlob) {
        return resolve(file);
      }
      var reader = new FileReader();
      reader.onerror = function () { resolve(file); };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { resolve(file); };
        img.onload = function () {
          var maxSide = 1920;
          var w = img.width || maxSide;
          var h = img.height || maxSide;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext("2d");
          if (!ctx) return resolve(file);
          ctx.drawImage(img, 0, 0, cw, ch);
          canvas.toBlob(function (blob) {
            if (!blob || blob.size >= file.size) return resolve(file);
            var renamed = new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
            resolve(renamed);
          }, "image/jpeg", 0.8);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setUploadProgress(percent, text) {
    var wrap = document.getElementById("upload-progress-wrap");
    var bar = document.getElementById("upload-progress-bar");
    var label = document.getElementById("upload-progress-text");
    if (!wrap) return;
    if (percent === null) { wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round(percent))) + "%";
    if (label) label.textContent = text || "Uploading…";
  }

  async function uploadImage(file) {
    if (!CLOUDINARY_URL) throw new Error("upload_not_configured");

    var compressed = await compressImageIfNeeded(file);

    var sig = await getSignature();

    return await new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", CLOUDINARY_URL, true);
      if (xhr.upload && typeof xhr.upload.addEventListener === "function") {
        xhr.upload.addEventListener("progress", function (ev) {
          if (ev && ev.lengthComputable && ev.total > 0) {
            setUploadProgress((ev.loaded / ev.total) * 100, "Uploading photo…");
          }
        });
      }
      xhr.onload = function () {
        setUploadProgress(null);
        try {
          var r = JSON.parse(xhr.responseText || "{}");
          var url = r.secure_url || r.url || "";
          if (!url) return reject(new Error("upload_no_url"));
          resolve(url);
        } catch (e) {
          reject(new Error("upload_parse_error"));
        }
      };
      xhr.onerror = function () { setUploadProgress(null); reject(new Error("upload_network_error")); };
      xhr.onabort = function () { setUploadProgress(null); reject(new Error("upload_aborted")); };

      var fd = new FormData();
      fd.append("file", compressed);
      fd.append("timestamp", String(sig.timestamp));
      fd.append("signature", String(sig.signature));
      fd.append("api_key", String(sig.apiKey));
      fd.append("folder", String(sig.folder));
      // The signature locks every constraint the server signed (resource_type,
      // allowed_formats, max_bytes, unique_filename, overwrite, use_filename,
      // strip_metadata, public_id_prefix, and type for the private-document folder).
      // Echo every one of them back exactly as received, or the photo storage
      // service recomputes a different signature than the one the server issued
      // and refuses the photo outright.
      var __sigPassthroughSkip = { timestamp: 1, signature: 1, apiKey: 1, cloudName: 1, folder: 1 };
      Object.keys(sig || {}).forEach(function (k) {
        if (!__sigPassthroughSkip[k] && sig[k] !== undefined && sig[k] !== null) {
          fd.append(k, String(sig[k]));
        }
      });
      setUploadProgress(0, "Uploading photo…");
      xhr.send(fd);
    });
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
      if (currencyInput && exp.currency) { currencyInput.value = String(exp.currency).toUpperCase(); __userTouchedCurrency = true; }
      // Owner 2026-05-30: sync the Flatpickr visible alt input when pre-filling from an
      // existing experience (programmatic .value = X doesn't update Flatpickr's display).
      if (dateInput) {
        const __sd = String(exp.startDate || exp.date || exp.experienceDate || "").slice(0, 10);
        dateInput.value = __sd;
        if (startDatePicker && __sd) { try { startDatePicker.setDate(__sd, false); } catch (_e) { void _e; } }
      }
      if (endDateInput) {
        const __ed = String(exp.endDate || "").slice(0, 10);
        endDateInput.value = __ed;
        if (endDatePicker && __ed) { try { endDatePicker.setDate(__ed, false); } catch (_e2) { void _e2; } }
      }

      const ts0 = (Array.isArray(exp.timeSlots) && exp.timeSlots[0]) ? String(exp.timeSlots[0]) : "";
      const tsParts = ts0.split("-");
      const derivedStart = (tsParts[0] || "").trim();
      const derivedEnd = (tsParts[1] || "").trim();

      if (timeInput) {
        const __st = String(exp.startTime || exp.time || derivedStart || "").trim();
        timeInput.value = __st;
        // Owner 2026-05-30 (date-picker rollout R3 audit): mirror the value into
        // the Flatpickr alt-input so the visible chip syncs with the prefilled
        // ISO source. Without this, the brand picker stays empty after edit.
        if (startTimePicker && __st) { try { startTimePicker.setDate(__st, false); } catch (_e2) { void _e2; } }
      }
      if (endTimeInput) {
        const __et = String(exp.endTime || derivedEnd || "").trim();
        endTimeInput.value = __et;
        if (endTimePicker && __et) { try { endTimePicker.setDate(__et, false); } catch (_e2) { void _e2; } }
      }
      if (locationInput) locationInput.value = exp.city || exp.location || "";
      if (suburbInput) suburbInput.value = exp.suburb || "";
      if (postcodeInput) postcodeInput.value = exp.postcode || "";
      if (addressLineInput) addressLineInput.value = exp.addressLine || "";
      if (addressNotesInput) addressNotesInput.value = exp.addressNotes || "";
      // Owner-spec 2026-05-03 (D-9): hydrate state, country, bookingMode on edit.
      if (stateInput) stateInput.value = String(exp.state || "").toUpperCase();
      if (countryInput) countryInput.value = exp.country || "Australia";
      (function() {
        var mode = String(exp.bookingMode || "shared").trim().toLowerCase();
        if (["shared", "private", "both"].indexOf(mode) < 0) mode = "shared";
        var radio = document.getElementById("bookingMode-" + mode);
        if (radio) radio.checked = true;
      })();
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

      // Owner 2026-05-30 (P3 multi-image): hydrate the multi-photo grid from
      // exp.images[] (or fall back to [exp.imageUrl] for legacy single-image
      // listings). Each existing image lands as status="uploaded" so the publish
      // flow doesn't try to re-upload them; the URL is already a Cloudinary one.
      var existingImages = Array.isArray(exp.images) && exp.images.length
        ? exp.images.slice(0, MAX_PHOTOS)
        : (exp.imageUrl ? [exp.imageUrl] : []);
      if (existingImages.length) {
        photosState = existingImages.map(function (url) {
          return {
            id: __nextPhotoId(),
            file: null,
            previewUrl: url,
            uploadedUrl: url,
            status: "uploaded"
          };
        });
        renderPhotosGrid();
      }

      // sir 2026-08-16: a DRAFT opened for editing has never been published — its CTA
      // is "Publish". A live/paused listing being edited keeps "Save Changes".
      if (submitBtn) submitBtn.textContent = (String((exp && exp.status) || "").toUpperCase() === "DRAFT") ? "Publish" : "Save Changes";
    } catch (_loadEditModeErr) {
      // Edit-mode hydration is best-effort: if the GET fails, fall back to the
      // empty draft state. The publish-time validation still gates the save.
      void _loadEditModeErr;
    }
  }

  function clearImageInput() {
    if (!imageInput) return;
    if (typeof imageInput.value === "string") {
      try { imageInput.value = ""; }
      catch (e) { /* IE-era fallback: replace the node */
        var clone = imageInput.cloneNode(true);
        imageInput.parentNode && imageInput.parentNode.replaceChild(clone, imageInput);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Multi-photo state + rendering (owner 2026-05-30, P3 multi-image pipeline).
  // The host can attach up to 3 photos. The first photo is the cover (shown on
  // Explore + booking confirmation). Photos can be reordered (drag-and-drop on
  // desktop, ↑/↓ arrows everywhere) and deleted individually. Each photo lives
  // in `photosState` as one of:
  //   { id, file?, previewUrl, uploadedUrl?, status }
  // status ∈ { 'pending' | 'uploading' | 'uploaded' | 'failed' }
  // 'pending'  = newly attached, not yet uploaded
  // 'uploaded' = either a fresh upload returned a Cloudinary URL, or this is
  //              an existing image hydrated from exp.images[] on edit-mode
  // ═════════════════════════════════════════════════════════════════════════
  // Owner 2026-06-01: raised from 3 to 6 — sir's call after I argued 3 was too
  // few for the marketplace category (Airbnb 5-7 recommended, Vrbo 10+). 6
  // covers the 6 narrative elements (food, space, host face, vibe, detail,
  // group) without overwhelming the carousel. Minimum 1 photo required.
  var MAX_PHOTOS = 6;
  var photosState = [];
  var __photoIdCounter = 0;
  function __nextPhotoId() { __photoIdCounter += 1; return "ph-" + __photoIdCounter; }

  // Validate one File against host requirements before adding to state. Returns
  // a string error code on failure, or null on success.
  function __validatePhotoFile(f) {
    if (!f) return "missing";
    var maxBytes = 10 * 1024 * 1024; // 10 MB hard cap, matches helper-text
    if (f.size > maxBytes) return "too_large";
    if (f.type && f.type.indexOf("image/") !== 0) return "wrong_type";
    var t = String(f.type || "").toLowerCase();
    // Accept JPEG, PNG, WebP — matches the backend's signed allowed_formats.
    if (t !== "image/jpeg" && t !== "image/png" && t !== "image/webp" && t !== "") {
      return "wrong_type";
    }
    return null;
  }

  // Append newly-selected files to photosState until MAX_PHOTOS is reached.
  // Returns the number actually added (so the caller can show "added 2 of 3").
  function addPhotosFromFiles(fileList) {
    if (!fileList || !fileList.length) return 0;
    hideNotice();
    var added = 0;
    var skippedTooLarge = 0;
    var skippedWrongType = 0;
    for (var i = 0; i < fileList.length; i += 1) {
      if (photosState.length >= MAX_PHOTOS) break;
      var f = fileList[i];
      var err = __validatePhotoFile(f);
      if (err === "too_large") { skippedTooLarge += 1; continue; }
      if (err === "wrong_type") { skippedWrongType += 1; continue; }
      var previewUrl = "";
      try { previewUrl = URL.createObjectURL(f); } catch (_objErr) { previewUrl = ""; }
      photosState.push({
        id: __nextPhotoId(),
        file: f,
        previewUrl: previewUrl,
        uploadedUrl: null,
        status: "pending"
      });
      added += 1;
    }
    if (skippedTooLarge > 0) {
      showNotice("error", skippedTooLarge + " photo" + (skippedTooLarge > 1 ? "s were" : " was") + " over 10 MB and skipped. Please choose smaller files.");
    } else if (skippedWrongType > 0) {
      showNotice("error", skippedWrongType + " file" + (skippedWrongType > 1 ? "s were" : " was") + " not a supported image (JPG, PNG, or WebP) and skipped.");
    }
    renderPhotosGrid();
    clearImageInput();
    return added;
  }

  function removePhoto(id) {
    var before = photosState.length;
    photosState = photosState.filter(function (p) {
      if (p.id !== id) return true;
      // Revoke the blob URL so we don't leak memory on long edit sessions.
      if (p.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL && /^blob:/.test(p.previewUrl)) {
        try { URL.revokeObjectURL(p.previewUrl); } catch (_revokeErr) { /* best-effort */ }
      }
      return false;
    });
    if (photosState.length !== before) renderPhotosGrid();
  }

  function movePhoto(id, direction) {
    var idx = -1;
    for (var i = 0; i < photosState.length; i += 1) {
      if (photosState[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var target = idx + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= photosState.length) return;
    var tmp = photosState[idx];
    photosState[idx] = photosState[target];
    photosState[target] = tmp;
    renderPhotosGrid();
  }

  // Owner 2026-06-01: host explicitly picks the cover by tapping "Make cover"
  // on any non-first tile. The chosen photo gets spliced to position 0; the
  // rest shift down by one. Backend's auto-pick (imageUrl = images[0]) keeps
  // working unchanged — the cover is always the first array element.
  function makeCover(id) {
    var idx = -1;
    for (var i = 0; i < photosState.length; i += 1) {
      if (photosState[i].id === id) { idx = i; break; }
    }
    if (idx <= 0) return; // already cover, or not found
    var picked = photosState.splice(idx, 1)[0];
    photosState.unshift(picked);
    renderPhotosGrid();
  }

  // Render the photo grid. Slot 0 is the cover; other slots get up/down arrows
  // + "Make cover" action. Empty slots render an "Add" tile.
  function renderPhotosGrid() {
    var grid = document.getElementById("photos-grid");
    if (!grid) return;
    // Security-rule compliance 2026-08-05 (owner T0: never innerHTML): DOM-safe clear.
    grid.replaceChildren();
    for (var slot = 0; slot < MAX_PHOTOS; slot += 1) {
      var photo = photosState[slot];
      var tile = document.createElement("div");
      // Owner 2026-05-30 (P3): aspect-square is purged from the compiled
      // Tailwind, so set aspect-ratio inline.
      tile.className = "relative rounded-xl overflow-hidden border-2";
      tile.style.aspectRatio = "1";
      if (photo) {
        tile.className += " border-tsts-soft bg-white";
        tile.dataset.photoId = photo.id;
        tile.draggable = true;
        // Thumb image
        var img = document.createElement("img");
        img.src = photo.previewUrl || photo.uploadedUrl || "";
        img.alt = "Photo " + (slot + 1);
        img.className = "w-full h-full object-cover";
        img.loading = "lazy";
        tile.appendChild(img);
        // Cover badge on the first slot — owner 2026-05-30 (P3 visual fix):
        // top-2/left-2 purged from Tailwind build; set position inline.
        if (slot === 0) {
          var coverBadge = document.createElement("span");
          coverBadge.className = "absolute bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md shadow-sm";
          coverBadge.style.top = "8px";
          coverBadge.style.left = "8px";
          coverBadge.textContent = "Cover";
          tile.appendChild(coverBadge);
        }
        // Status overlay for uploading/failed
        if (photo.status === "uploading") {
          var upOv = document.createElement("div");
          upOv.className = "absolute inset-0 bg-black/40 flex items-center justify-center";
          var upTxt = document.createElement("span");
          upTxt.className = "text-white text-xs font-semibold";
          upTxt.textContent = "Uploading…";
          upOv.appendChild(upTxt);
          tile.appendChild(upOv);
        } else if (photo.status === "failed") {
          var failOv = document.createElement("div");
          failOv.className = "absolute inset-0 bg-red-600/70 flex items-center justify-center";
          var failTxt = document.createElement("span");
          failTxt.className = "text-white text-xs font-semibold";
          failTxt.textContent = "Upload failed";
          failOv.appendChild(failTxt);
          tile.appendChild(failOv);
        }
        // Bottom control row: ↑ ↓ ×
        var controls = document.createElement("div");
        controls.className = "absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1.5 bg-gradient-to-t from-black/60 to-transparent";
        var navWrap = document.createElement("div");
        navWrap.className = "flex items-center gap-1";
        // Up arrow (hidden on first slot)
        var upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.title = "Move up";
        upBtn.dataset.action = "up";
        upBtn.dataset.photoId = photo.id;
        upBtn.className = "h-6 w-6 rounded-md bg-white/90 text-gray-800 text-xs font-bold hover:bg-white flex items-center justify-center" + (slot === 0 ? " invisible" : "");
        upBtn.textContent = "↑";
        navWrap.appendChild(upBtn);
        // Down arrow (hidden on last filled slot)
        var downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.title = "Move down";
        downBtn.dataset.action = "down";
        downBtn.dataset.photoId = photo.id;
        var isLast = slot === photosState.length - 1;
        downBtn.className = "h-6 w-6 rounded-md bg-white/90 text-gray-800 text-xs font-bold hover:bg-white flex items-center justify-center" + (isLast ? " invisible" : "");
        downBtn.textContent = "↓";
        navWrap.appendChild(downBtn);
        // Make cover — owner 2026-06-01. Only on non-first tiles. Tapping moves
        // this photo to position 0 and the existing cover shifts down.
        if (slot !== 0) {
          var coverBtn = document.createElement("button");
          coverBtn.type = "button";
          coverBtn.title = "Make this the cover photo";
          coverBtn.dataset.action = "make-cover";
          coverBtn.dataset.photoId = photo.id;
          coverBtn.className = "h-6 px-2 rounded-md bg-white/90 text-orange-600 text-[10px] font-bold hover:bg-white flex items-center justify-center";
          coverBtn.textContent = "Make cover";
          navWrap.appendChild(coverBtn);
        }
        controls.appendChild(navWrap);
        // Delete
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.title = "Remove";
        delBtn.dataset.action = "delete";
        delBtn.dataset.photoId = photo.id;
        delBtn.className = "h-6 w-6 rounded-md bg-white/90 text-red-600 text-xs font-bold hover:bg-white flex items-center justify-center";
        delBtn.textContent = "×";
        controls.appendChild(delBtn);
        tile.appendChild(controls);
      } else {
        // Empty slot — "Add" tile. Only the first empty slot is clickable; the rest
        // render as muted "+" placeholders so the picker isn't triggered N times.
        var firstEmpty = photosState.length === slot;
        if (firstEmpty) {
          tile.className += " border-dashed border-gray-300 hover:bg-gray-50 transition cursor-pointer flex items-center justify-center";
          tile.dataset.action = "add";
          var addLabel = document.createElement("div");
          addLabel.className = "text-center px-2";
          var addPlus = document.createElement("div");
          addPlus.className = "text-3xl text-gray-400 leading-none";
          addPlus.textContent = "+";
          var addTxt = document.createElement("p");
          addTxt.className = "text-xs text-gray-500 mt-1";
          addTxt.textContent = "Add photo";
          addLabel.appendChild(addPlus);
          addLabel.appendChild(addTxt);
          tile.appendChild(addLabel);
        } else {
          tile.className += " border-dashed border-gray-200 bg-gray-50/50";
        }
      }
      grid.appendChild(tile);
    }
  }

  // Delegate clicks within the grid to add / delete / up / down handlers.
  (function wirePhotosGrid() {
    var grid = document.getElementById("photos-grid");
    if (!grid || !imageInput) return;
    grid.addEventListener("click", function (e) {
      var t = e.target;
      // Climb to the nearest action carrier (button or tile).
      while (t && t !== grid && !(t.dataset && t.dataset.action)) {
        t = t.parentNode;
      }
      if (!t || t === grid) return;
      var action = t.dataset.action;
      var photoId = t.dataset.photoId || "";
      if (action === "add") {
        try { imageInput.click(); } catch (_clickErr) { /* picker open is best-effort */ }
      } else if (action === "delete" && photoId) {
        removePhoto(photoId);
      } else if ((action === "up" || action === "down") && photoId) {
        movePhoto(photoId, action);
      } else if (action === "make-cover" && photoId) {
        makeCover(photoId);
      }
    });
    // HTML5 drag-and-drop: drag a filled tile onto another tile to swap places.
    // Mobile users use the ↑/↓ arrows; drag-and-drop is desktop-first sugar.
    var draggedId = null;
    grid.addEventListener("dragstart", function (e) {
      var tile = e.target && e.target.closest ? e.target.closest("[data-photo-id]") : null;
      if (!tile) return;
      draggedId = tile.dataset.photoId || null;
      if (e.dataTransfer) {
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", draggedId || ""); } catch (_dtErr) { /* dataTransfer set is best-effort */ }
      }
      tile.style.opacity = "0.4";
    });
    grid.addEventListener("dragend", function (e) {
      var tile = e.target && e.target.closest ? e.target.closest("[data-photo-id]") : null;
      if (tile) tile.style.opacity = "";
      draggedId = null;
    });
    grid.addEventListener("dragover", function (e) {
      if (!draggedId) return;
      e.preventDefault();
      if (e.dataTransfer) try { e.dataTransfer.dropEffect = "move"; } catch (_doErr) { /* dropEffect set is best-effort */ }
    });
    grid.addEventListener("drop", function (e) {
      if (!draggedId) return;
      e.preventDefault();
      var targetTile = e.target && e.target.closest ? e.target.closest("[data-photo-id]") : null;
      if (!targetTile) return;
      var targetId = targetTile.dataset.photoId;
      if (!targetId || targetId === draggedId) return;
      var fromIdx = -1, toIdx = -1;
      for (var i = 0; i < photosState.length; i += 1) {
        if (photosState[i].id === draggedId) fromIdx = i;
        if (photosState[i].id === targetId) toIdx = i;
      }
      if (fromIdx < 0 || toIdx < 0) return;
      var moving = photosState.splice(fromIdx, 1)[0];
      photosState.splice(toIdx, 0, moving);
      renderPhotosGrid();
    });
  })();

  // Replace the legacy single-photo file-input handler with the multi-photo one.
  if (imageInput) {
    imageInput.addEventListener("change", function () {
      addPhotosFromFiles(imageInput.files);
    });
  }
  // Paint the empty initial grid so the user sees three "Add" slots on load.
  renderPhotosGrid();

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

  // DATE-GUARD-001: Prevent past-date selection.
  // sir 2026-08-13: "past" judged by MELBOURNE's calendar, not the device's (see melbourneTodayIso).
  (function () {
    var _today = melbourneTodayIso();
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
        // Owner-spec 2026-05-03 (D-9): publish-flow variables for state, country, bookingMode.
        const state = stateInput ? String(stateInput.value || "").trim().toUpperCase() : "";
        const country = countryInput ? String(countryInput.value || "").trim() : "";
        const bookingMode = (function() {
          var sel = document.querySelector('input[name="bookingMode"]:checked');
          return sel ? String(sel.value || "shared").trim().toLowerCase() : "shared";
        })();
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

        if (!title || !description || price == null || !startDate || !endDate || !startTime || !endTime || !city || !suburb || !addressLine || capacity == null) {
          showNotice("error", "Please fill all required fields.");
          return;
        }
        if (title.length < 3) {
          showNotice("error", "Title must be at least 3 characters.");
          if (titleInput) titleInput.focus();
          return;
        }
        // sir's ruling, 2026-08-22: price may be zero (host-funded or admin-waived); only
        // negative is invalid.
        if (isHostPriceRejected(price)) {
          showNotice("error", "Price can't be negative.");
          if (priceInput) priceInput.focus();
          return;
        }
        if (capacity < 1) {
          showNotice("error", "Capacity must be at least 1 guest.");
          if (maxGuestsInput) maxGuestsInput.focus();
          return;
        }
        if (!availableDays || availableDays.length < 1) {
          showNotice("error", "Please select at least one available day.");
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
        if (!__validPostcodeForCountry(postcode, countryInput && countryInput.value)) {
          showNotice("error", __isAuAddr(countryInput && countryInput.value) ? "Postcode must be 4 digits." : "Enter a valid postcode for the event's country.");
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
        const _deficitGuestCents = deficitBreakdown ? Number(deficitBreakdown.guestPriceCents) : 0;
        if (deficitBreakdown && Number.isFinite(_deficitGuestCents) && _deficitGuestCents >= 500 && Number(deficitBreakdown.platformFeeCents) > Number(deficitBreakdown.guestPriceCents)) {
          const shortfallPerSeatCents = Math.max(0, Number(deficitBreakdown.platformFeeCents) - Number(deficitBreakdown.guestPriceCents));
          const thresholdSeats = Math.max(1, Math.ceil(Number(capacity) * 0.5));
          const stageADueCents = shortfallPerSeatCents * thresholdSeats;
          const stageBDueCents = shortfallPerSeatCents * Math.max(0, Number(capacity) - thresholdSeats);
          const proceed = await window.tstsConfirm(
            "Heads up, this experience has higher platform costs.\n\n" +
            "Each guest pays: " + formatMoneyFromCents(deficitBreakdown.guestPriceCents) + "\n" +
            "Platform cost per guest: " + formatMoneyFromCents(deficitBreakdown.platformFeeCents) + "\n" +
            "Extra cost you'll cover: " + formatMoneyFromCents(shortfallPerSeatCents) + " per guest\n\n" +
            "You'll make two payments as seats fill:\n" +
            "First payment (" + formatMoneyFromCents(stageADueCents) + ") when " + thresholdSeats + " seats are booked.\n" +
            "Second payment (" + formatMoneyFromCents(stageBDueCents) + ") when remaining seats fill.\n\n" +
            "After the event, the amount (minus a processing fee) is refunded to you.\n\nPublish this experience?",
            { confirmText: "Publish", destructive: true }
          );
          if (!proceed) {
            showNotice("error", "Listing not saved. You can increase the guest price to avoid additional platform costs.");
            return;
          }
        }

        // Owner 2026-05-30 (P3 multi-image): require AT LEAST 1 photo in the
        // multi-photo state. The host can have up to 3, first = cover. Hard-gate.
        if (photosState.length === 0) {
          showNotice("error", "Please add at least one photo before publishing. The first photo is your cover and is required so guests can see what your experience looks like.");
          if (submitBtn) submitBtn.disabled = false;
          var emptyAddTile = document.querySelector('#photos-grid [data-action="add"]');
          if (emptyAddTile && typeof emptyAddTile.click === "function") emptyAddTile.click();
          return;
        }

        // Upload every photo whose status is still 'pending'. Run in parallel.
        // Any failure aborts the publish so we never persist a partial gallery.
        var pending = photosState.filter(function (p) { return p.status === "pending"; });
        if (pending.length > 0) {
          showNotice("info", "Uploading " + pending.length + " photo" + (pending.length > 1 ? "s" : "") + "…");
          // Mark all pending as uploading so the grid shows the overlay.
          pending.forEach(function (p) { p.status = "uploading"; });
          renderPhotosGrid();
          try {
            await Promise.all(pending.map(async function (p) {
              try {
                var url = await uploadImage(p.file);
                p.uploadedUrl = url;
                p.status = "uploaded";
              } catch (uploadErr) {
                p.status = "failed";
                throw uploadErr;
              }
            }));
            renderPhotosGrid();
            showNotice("success", pending.length + " photo" + (pending.length > 1 ? "s" : "") + " uploaded.");
          } catch (err) {
            renderPhotosGrid();
            showNotice("error", "One or more photos failed to upload. Please remove the failed tile or retry. Your experience has not been published yet.");
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }

        // Collect URLs in their current order. First = cover.
        var orderedImageUrls = photosState
          .filter(function (p) { return p.status === "uploaded" && p.uploadedUrl; })
          .map(function (p) { return p.uploadedUrl; });
        if (orderedImageUrls.length === 0) {
          showNotice("error", "Please add at least one photo before publishing.");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        var imageUrl = orderedImageUrls[0]; // legacy var kept for downstream references

        const body = {
          title,
          description,
          requirements,
          price,
          // Listing currency from the picker (configure-before-list; defaults from the
          // event country, host can override). Must be sent on PUBLISH, not only the
          // draft auto-save — else the host's chosen currency is dropped and the listing
          // silently falls back to AUD. Backend clamps to the admin-enabled set.
          currency: currencyInput ? String(currencyInput.value || "AUD").trim().toUpperCase() : "AUD",
          city,
          suburb,
          postcode,
          addressLine,
          addressNotes,
          state,
          country,
          bookingMode,
          capacity: Math.max(1, Math.floor(Number(capacity))),
          startDate,
          endDate,
          startTime,
          availableDays,
          tags
        };
        if (eventDurationMinutes != null) body.eventDurationMinutes = eventDurationMinutes;
        if (endTime) body.endTime = endTime;
        if (startTime && endTime) {
          body.timeSlots = [startTime + "-" + endTime];
          // Build weeklySchedule: same time range for all checked days (Phase 2, backward compat)
          var ws = {};
          for (var di = 0; di < availableDays.length; di++) {
            ws[availableDays[di]] = [startTime + "-" + endTime];
          }
          body.weeklySchedule = ws;
        }
        // Owner 2026-05-30 (P3 multi-image): send the full ordered array.
        // Backend auto-sets imageUrl = images[0] as the cover (server.js:18242).
        body.images = orderedImageUrls.length ? orderedImageUrls : [];
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
        var __expIdemKey = (!isEditing && window.tstsIdempotencyKey) ? window.tstsIdempotencyKey(submitBtn) : "";

        const res = await window.authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          idempotencyKey: __expIdemKey || undefined
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          var errCode = (payload && payload.error) || "";
          if (errCode === "CUTOFF_EDIT_LOCKED") {
            if (cutoffLockedBanner) cutoffLockedBanner.classList.remove("hidden");
          } else if (errCode === "CAPACITY_EXCEEDS_BUFFER_LIMIT" || errCode === "CAPACITY_BELOW_BOOKED") {
            // Owner-approved 2026-08-03 (sir, Item 7A): the code must never reach a host,
            // even if the backend one day stops sending its own sentence.
            var capCopy = (errCode === "CAPACITY_BELOW_BOOKED")
              ? "You can't set capacity below the seats guests have already booked."
              : "That capacity is higher than this experience allows. Please choose a smaller number.";
            if (window.tstsNotify) window.tstsNotify(String((payload && payload.message) || capCopy), "warning");
            return; // the toast above already said it — the banner below would say it twice
          } else if (errCode === "INVALID_TIMEZONE") {
            // "Invalid timezone selected." told a host nothing they could act on, and it also
            // stacked a second message under the first.
            if (window.tstsNotify) window.tstsNotify("We couldn't read the time zone for this experience. Please pick the city's time zone again.", "warning");
            return;
          }
          showNotice("error", String((payload && payload.message) || "We couldn't save your experience just now. Your details are still here, so please try again."));
          return;
        }
        if (cutoffLockedBanner) cutoffLockedBanner.classList.add("hidden");

        const savedExp = (payload && payload.experience) ? payload.experience : ((payload && payload.data) ? payload.data : payload);
        const savedExperienceId = String((savedExp && (savedExp._id || savedExp.id)) || editId || "").trim();
        const wantsVerified = !!pendingEventVerificationRequest;
        // 2026-08-21: this used to POST the verification request with an EMPTY body the moment the
        // listing saved. The route requires an event plan, safety measures, a promise of fulfilment
        // and a capacity rationale — so it failed every single time, and the host, who had never
        // been shown anywhere to write those, read "Please add a bit more detail to: Event plan,
        // Safety measures…". The early return then swallowed the success card, the form reset and
        // the funding refresh as well. The edit path already opens a modal that collects exactly
        // those fields; the create path now opens the same one, AFTER the success card renders.
        var __openVerificationModalFor = "";
        if (
          wantsVerified &&
          savedExperienceId &&
          currentVerifiedStatus !== "verified" &&
          currentVerifiedStatus !== "pending" &&
          normalizeHostVerificationStatus(hostVerificationStatus) === "verified"
        ) {
          __openVerificationModalFor = savedExperienceId;
        }

        // Reset form state but DON'T toast, the success card below is the visible feedback.
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
        __showWizardStep(1);
        // Show the post-publish success card (replaces the form on screen).
        renderPublishSuccessCard(savedExp);
        // Good news first, then the questions: the host asked for event verification while filling
        // the wizard, so now collect what the reviewers actually need.
        if (__openVerificationModalFor) {
          pendingEventVerificationRequest = false;
          openEventVerificationModal(__openVerificationModalFor);
        }
      } catch (_) {
        showNotice("error", "We couldn't publish your experience just now. Your details are still here, so please try again.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Replaces the wizard form with a status-aware success card after a successful publish.
  // For ACTIVE: "Your experience is live!" with View / Share / Edit / Publish another.
  // For PENDING_REVIEW: "We're taking a quick look, usually live within 24h" with Edit / Publish another.
  // No internal status names ever surface to the host.
  function renderPublishSuccessCard(savedExp) {
    var card = document.getElementById("publish-success-card");
    var formEl = document.getElementById("create-experience-form");
    if (!card) return;
    var status = String((savedExp && savedExp.status) || "ACTIVE").toUpperCase();
    var queued = (status === "PENDING_REVIEW" || status === "DRAFT");
    var title = String((savedExp && savedExp.title) || "Your experience");
    var price = Number((savedExp && savedExp.price) != null ? savedExp.price : 0);
    var img = String((savedExp && (savedExp.imageUrl || (Array.isArray(savedExp.images) && savedExp.images[0]) || "")));
    var startDate = String((savedExp && savedExp.startDate) || "");
    var startTime = String((savedExp && savedExp.startTime) || "");
    var expId = String((savedExp && (savedExp._id || savedExp.id)) || "");
    var publicUrl = expId ? (window.location.origin + "/experience.html?id=" + encodeURIComponent(expId)) : "";

    // Heading + sub-heading + icon tone based on status
    var iconWrap = document.getElementById("publish-success-icon");
    var iconI = iconWrap ? iconWrap.querySelector("i") : null;
    var heading = document.getElementById("publish-success-heading");
    var sub = document.getElementById("publish-success-subheading");
    if (queued) {
      if (iconWrap) { iconWrap.classList.remove("bg-emerald-100"); iconWrap.classList.add("bg-amber-100"); }
      if (iconI) { iconI.className = "fas fa-clock text-2xl text-amber-600"; }
      if (heading) heading.textContent = "We're taking a quick look at your experience";
      if (sub) sub.textContent = "A team member will check your listing, usually within 24 hours, often much sooner. We'll email you the moment it's live on Explore.";
    } else {
      if (iconWrap) { iconWrap.classList.add("bg-emerald-100"); iconWrap.classList.remove("bg-amber-100"); }
      if (iconI) { iconI.className = "fas fa-check text-2xl text-emerald-600"; }
      if (heading) heading.textContent = "Your experience is live!";
      if (sub) sub.textContent = "Guests can now discover and book your experience on Explore. Sharing it with your community helps it build momentum early.";
    }

    var titleEl = document.getElementById("publish-success-title");
    if (titleEl) titleEl.textContent = title;
    // sir's ruling, 2026-08-22: price === 0 is a real, valid listing (host-funded or
    // admin-waived), not an unreachable state — show "Free" rather than "A$0.00 / guest".
    var priceEl = document.getElementById("publish-success-price");
    // Owner 2026-07-24: currency-aware like the rest of the pricing step.
    if (priceEl) priceEl.textContent = (Number(price) === 0) ? "Free" : (formatMoneyFromCents(Math.round(Number(price || 0) * 100)) + " / guest");
    var whenEl = document.getElementById("publish-success-when");
    if (whenEl) {
      var whenStr = startDate || "";
      if (startDate && startTime) whenStr = startDate + " · " + startTime;
      whenEl.textContent = whenStr || "—";
    }

    var imgEl = document.getElementById("publish-success-image");
    if (imgEl) {
      if (img) {
        imgEl.src = img; imgEl.alt = title;
        imgEl.style.display = "";
      } else {
        imgEl.style.display = "none";
      }
    }

    // CTA buttons
    var viewBtn = document.getElementById("publish-success-view");
    var shareBtn = document.getElementById("publish-success-share");
    var editBtn = document.getElementById("publish-success-edit");
    var anotherBtn = document.getElementById("publish-success-another");

    if (viewBtn) {
      if (!queued && publicUrl) {
        viewBtn.href = publicUrl;
        viewBtn.classList.remove("hidden");
      } else {
        viewBtn.classList.add("hidden");
      }
    }
    if (shareBtn) {
      if (!queued && publicUrl) {
        shareBtn.classList.remove("hidden");
        shareBtn.onclick = function () {
          var shareData = { title: title, text: "I'm hosting on The Shared Table Story, would you like to join?", url: publicUrl };
          if (navigator.share) {
            navigator.share(shareData).catch(function () { /* user cancelled or share failed; copy fallback below covers this */ });
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(publicUrl).then(function () {
              if (window.tstsNotify) window.tstsNotify("Link copied to clipboard.", "success");
            });
          } else {
            // Owner-approved 2026-08-03 (sir, Item 7B): the undesigned browser prompt is
            // replaced by the site's own dialog with the link ready to copy.
            if (window.tstsPrompt) {
              window.tstsPrompt("Copy this link to share your experience", publicUrl, { confirmText: "Done", cancelText: "Close" });
            } else if (window.tstsNotify) {
              window.tstsNotify("Copy this link to share: " + publicUrl, "info");
            }
          }
        };
      } else {
        shareBtn.classList.add("hidden");
      }
    }
    if (editBtn) {
      editBtn.onclick = function () {
        if (!expId) return;
        window.location.href = window.location.pathname + "?edit=" + encodeURIComponent(expId);
      };
    }
    if (anotherBtn) {
      anotherBtn.onclick = function () {
        card.classList.add("hidden");
        if (formEl) formEl.classList.remove("hidden");
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
      };
    }

    // Hide the form, reveal the card, scroll to top so it's actually seen.
    if (formEl) formEl.classList.add("hidden");
    card.classList.remove("hidden");
    try { card.scrollIntoView({ behavior: "smooth", block: "start" }); }
    catch (e) { window.scrollTo(0, 0); }
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

  // ═══════════════════════════════════════════════════════
  // Wizard Step Navigation (Action 11)
  // ═══════════════════════════════════════════════════════
  var __wizardStep = 1;
  var __WIZARD_STEPS = 5;

  function __showWizardStep(step) {
    hideNotice();
    for (var s = 1; s <= __WIZARD_STEPS; s++) {
      var el = document.getElementById("wizard-step-" + s);
      if (el) el.classList.toggle("hidden", s !== step);
    }
    var bar = document.getElementById("wizard-progress-bar");
    if (bar) bar.style.width = String(Math.round(step / __WIZARD_STEPS * 100)) + "%";
    var labels = document.querySelectorAll("[data-step-label]");
    for (var i = 0; i < labels.length; i++) {
      var num = parseInt(labels[i].getAttribute("data-step-label"), 10) || 0;
      if (num <= step) {
        labels[i].classList.add("text-tsts-ink");
        labels[i].classList.remove("text-slate-400");
      } else {
        labels[i].classList.remove("text-tsts-ink");
        labels[i].classList.add("text-slate-400");
      }
      if (num === step) labels[i].classList.add("font-bold");
      else labels[i].classList.remove("font-bold");
    }
    __wizardStep = step;
    if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
    if (step === 5) {
      syncPricingTransparency();
      __buildReviewSummary();
    }
  }

  function __validateWizardStep(step) {
    if (step === 1) {
      var t = titleInput ? String(titleInput.value || "").trim() : "";
      if (!t) { showNotice("error", "Please enter a title for your experience."); __markFieldInvalid(titleInput); if (titleInput) titleInput.focus(); return false; }
      var tags = getSelectedTags();
      if (!tags || tags.length < 1) { showNotice("error", "Please select at least one category."); return false; }
      var desc = descriptionInput ? String(descriptionInput.value || "").trim() : "";
      if (!desc || desc.length < 150) { showNotice("error", "Description must be at least 150 characters."); __markFieldInvalid(descriptionInput); if (descriptionInput) descriptionInput.focus(); return false; }
      if (desc.length > 1500) { showNotice("error", "Description must be under 1500 characters."); __markFieldInvalid(descriptionInput); if (descriptionInput) descriptionInput.focus(); return false; }
      var req = requirementsInput ? String(requirementsInput.value || "").trim() : "";
      if (!req) { showNotice("error", "Please fill in what guests should know before attending."); __markFieldInvalid(requirementsInput); if (requirementsInput) requirementsInput.focus(); return false; }
      return true;
    }
    if (step === 2) {
      var city = locationInput ? String(locationInput.value || "").trim() : "";
      if (!city) { showNotice("error", "Please enter a city."); if (locationInput) locationInput.focus(); return false; }
      var suburb = suburbInput ? String(suburbInput.value || "").trim() : "";
      if (!suburb) { showNotice("error", "Please enter a suburb."); if (suburbInput) suburbInput.focus(); return false; }
      var pc = postcodeInput ? String(postcodeInput.value || "").trim() : "";
      var __pcCountry = countryInput && countryInput.value;
      if (!__validPostcodeForCountry(pc, __pcCountry) || (__isAuAddr(__pcCountry) && !pc)) { showNotice("error", __isAuAddr(__pcCountry) ? "Postcode must be 4 digits." : "Enter a valid postcode for the event's country."); if (postcodeInput) postcodeInput.focus(); return false; }
      var addr = addressLineInput ? String(addressLineInput.value || "").trim() : "";
      if (!addr) { showNotice("error", "Please enter a street address."); if (addressLineInput) addressLineInput.focus(); return false; }
      var sd = dateInput ? String(dateInput.value || "").trim() : "";
      if (!sd) { showNotice("error", "Please select a start date."); if (dateInput) dateInput.focus(); return false; }
      var ed = endDateInput ? String(endDateInput.value || "").trim() : "";
      if (!ed) { showNotice("error", "Please select an end date."); if (endDateInput) endDateInput.focus(); return false; }
      if (new Date(ed) < new Date(sd)) { showNotice("error", "End date must be on or after start date."); return false; }
      var st = timeInput ? String(timeInput.value || "").trim() : "";
      if (!st) { showNotice("error", "Please enter a start time."); if (timeInput) timeInput.focus(); return false; }
      var et = endTimeInput ? String(endTimeInput.value || "").trim() : "";
      if (!et) { showNotice("error", "Please enter an end time."); if (endTimeInput) endTimeInput.focus(); return false; }
      var timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (st && !timeRe.test(st)) { showNotice("error", "Start time must be valid (HH:MM)."); return false; }
      if (et && !timeRe.test(et)) { showNotice("error", "End time must be valid (HH:MM)."); return false; }
      if (st && et && et <= st) { showNotice("error", "End time must be after start time."); return false; }
      var dur = eventDurationMinutesInput ? parseInt(eventDurationMinutesInput.value, 10) : null;
      if (!dur || dur < 15) { showNotice("error", "Please enter a duration (minimum 15 minutes)."); if (eventDurationMinutesInput) eventDurationMinutesInput.focus(); return false; }
      return true;
    }
    if (step === 3) {
      var price = priceInput ? safeNum(priceInput.value) : null;
      if (price == null || price < 0) { showNotice("error", "Please enter a valid price."); if (priceInput) priceInput.focus(); return false; }
      var mg = maxGuestsInput ? safeNum(maxGuestsInput.value) : null;
      if (mg == null || mg < 1) { showNotice("error", "Please enter max guests (at least 1)."); if (maxGuestsInput) maxGuestsInput.focus(); return false; }
      var ad = document.querySelectorAll('input[name="availableDays"]:checked');
      if (!ad || ad.length === 0) { showNotice("error", "Please select at least one available day."); return false; }
      return true;
    }
    return true;
  }

  function __buildReviewSummary() {
    var el = document.getElementById("wizard-review-summary");
    if (!el) return;
    el.textContent = "";
    var El = window.tstsEl;
    if (!El) return;
    function addRow(label, value) {
      el.appendChild(El("div", { className: "flex justify-between py-2 border-b border-slate-100 text-sm" }, [
        El("span", { className: "text-slate-500 flex-shrink-0", textContent: label }),
        // tstsEl's guard THROWS on string styles (dev) \u2014 this line killed the whole
        // review summary and with it the create-mode footer. Object form is the
        // guard-safe contract (common.js style handler iterates object keys).
        El("span", { className: "font-medium text-slate-800 text-right max-w-[60%]", style: { overflowWrap: "break-word" }, textContent: String(value || "\u2014") })
      ]));
    }
    addRow("Title", titleInput ? titleInput.value : "");
    // sir's zero-jargon law: a host reads "Food & Gatherings", never the machine
    // slug "food-gatherings". Same canonical map every other surface uses.
    addRow("Category", getSelectedTags().map(function (t) {
      return window.tstsCategoryLabel ? window.tstsCategoryLabel(t) : t;
    }).join(", ") || "None");
    var descVal = descriptionInput ? String(descriptionInput.value || "").trim() : "";
    addRow("Description", descVal.length > 100 ? descVal.substring(0, 100) + "\u2026" : descVal);
    var reqVal = requirementsInput ? String(requirementsInput.value || "").trim() : "";
    addRow("Requirements", reqVal.length > 100 ? reqVal.substring(0, 100) + "\u2026" : reqVal);
    addRow("City", locationInput ? locationInput.value : "");
    addRow("Suburb", suburbInput ? suburbInput.value : "");
    addRow("Postcode", postcodeInput ? postcodeInput.value : "");
    addRow("Address", addressLineInput ? addressLineInput.value : "");
    if (addressNotesInput && addressNotesInput.value) addRow("Address notes", addressNotesInput.value);
    // sir 2026-08-16 ("Fix it", walk gap W5): the host read their own listing back in
    // raw machine shapes ("2026-08-22 to 2026-11-28", "09:00 - 12:00") while every
    // guest surface renders friendly AU formats. Display only \u2014 values unchanged.
    addRow("Dates", __friendlyReviewDate(dateInput ? dateInput.value : "") + " to " + __friendlyReviewDate(endDateInput ? endDateInput.value : ""));
    addRow("Time", __friendlyReviewTime(timeInput ? timeInput.value : "") + " \u2013 " + __friendlyReviewTime(endTimeInput ? endTimeInput.value : ""));
    addRow("Duration", eventDurationMinutesInput && eventDurationMinutesInput.value ? eventDurationMinutesInput.value + " min" : "");
    addRow("Timezone", timezoneInput ? timezoneInput.value : "");
    addRow("Price", priceInput && priceInput.value ? (priceInput.value + " " + (currencyInput ? String(currencyInput.value || "AUD") : "AUD")) : "");
    addRow("Max guests", maxGuestsInput ? maxGuestsInput.value : "");
    var days = [];
    try { days = Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(function (cb) { return cb.value; }); } catch (_) {}
    addRow("Available days", days.join(", ") || "None");
    var cutoffOn = cutoffEnabledInput ? cutoffEnabledInput.checked : true;
    addRow("Booking cutoff", cutoffOn ? ((cutoffHoursInput ? cutoffHoursInput.value : "24") + "h before start") : "Open until start");
    var hasImg = photosState.length > 0 || !!existingImageUrl;
    addRow("Cover photo", hasImg ? "Added" : "None");
    var privOn = privateEnabledInput ? privateEnabledInput.checked : false;
    addRow("Private booking", privOn ? "Enabled" : "Disabled");
  }

  async function __wizardAutoSaveDraft() {
    try {
      var title = titleInput ? String(titleInput.value || "").trim() : "";
      if (!title) return;
      var body = {
        title: title,
        description: descriptionInput ? String(descriptionInput.value || "").trim() : "",
        requirements: requirementsInput ? String(requirementsInput.value || "").trim() : "",
        city: locationInput ? String(locationInput.value || "").trim() : "",
        suburb: suburbInput ? String(suburbInput.value || "").trim() : "",
        postcode: postcodeInput ? String(postcodeInput.value || "").trim() : "",
        addressLine: addressLineInput ? String(addressLineInput.value || "").trim() : "",
        addressNotes: addressNotesInput ? String(addressNotesInput.value || "").trim() : "",
        // Owner-spec 2026-05-03: state + country submitted alongside existing fields.
        state: stateInput ? String(stateInput.value || "").trim().toUpperCase() : "",
        country: countryInput ? String(countryInput.value || "").trim() : "",
        // Owner 2026-05-24: listing currency (defaults from country, host can override).
        currency: currencyInput ? String(currencyInput.value || "AUD").trim().toUpperCase() : "AUD",
        // Owner-spec 2026-05-03 (D-9 step 7): bookingMode picked from radio group.
        bookingMode: (function() {
          var sel = document.querySelector('input[name="bookingMode"]:checked');
          return sel ? String(sel.value || "shared").trim().toLowerCase() : "shared";
        })(),
        tags: getSelectedTags(),
        // sir's ruling 2026-08-16 ("Yes — draft until explicit Publish"): this auto-save
        // always sent status:"DRAFT", but the backend overwrote it and the listing went
        // PUBLICLY LIVE mid-wizard (walk-proven: booked before the host saw Review).
        // draft:true is the honoured flag — the server keeps the listing a private
        // DRAFT on both create (POST) and every later auto-save (PUT).
        status: "DRAFT",
        draft: true
      };
      var price = priceInput ? safeNum(priceInput.value) : null;
      if (price != null && price > 0) body.price = price;
      var capacity = maxGuestsInput ? safeNum(maxGuestsInput.value) : null;
      if (capacity != null && capacity > 0) body.capacity = Math.max(1, Math.floor(Number(capacity)));
      var sd = dateInput ? String(dateInput.value || "").trim() : "";
      if (sd) body.startDate = sd;
      var ed = endDateInput ? String(endDateInput.value || "").trim() : "";
      if (ed) body.endDate = ed;
      var st = timeInput ? String(timeInput.value || "").trim() : "";
      if (st) body.startTime = st;
      var et = endTimeInput ? String(endTimeInput.value || "").trim() : "";
      if (et) body.endTime = et;
      if (st && et) body.timeSlots = [st + "-" + et];
      body.timezone = timezoneInput ? timezoneInput.value : "Australia/Melbourne";
      var dur = eventDurationMinutesInput ? parseInt(eventDurationMinutesInput.value, 10) : null;
      if (dur && dur > 0) body.eventDurationMinutes = dur;
      var ad = [];
      try { ad = Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(function (cb) { return cb.value; }); } catch (_) {}
      if (ad.length > 0) body.availableDays = ad;
      if (existingImageUrl) body.images = [existingImageUrl];
      body.bookingCutoffEnabled = cutoffEnabledInput ? cutoffEnabledInput.checked : true;
      body.bookingCutoffMinutes = cutoffHoursInput ? Math.max(0, parseInt(cutoffHoursInput.value, 10) || 0) * 60 : 1440;
      body.dynamicDiscounts = buildDynamicDiscountsFromForm();
      // Discoverability taxonomies + instant book (owner-approved 2026-05-02, full filter wiring).
      ["vibe", "dietary", "accessibility", "cuisine", "languages", "occasion"].forEach(function (k) {
        try {
          var picked = Array.from(document.querySelectorAll('[data-host-tax-chip-active="' + k + '"]')).map(function (el) { return el.getAttribute("data-tax-value"); }).filter(Boolean);
          body[k] = picked;
        } catch (_) { body[k] = []; }
      });
      var __ib = document.getElementById("host-instant-book");
      body.instantBook = !!(__ib && __ib.checked);
      // Mirror eventDurationMinutes onto durationMinutes (canonical filter field). Use the same numeric value.
      if (typeof body.eventDurationMinutes === "number" && body.eventDurationMinutes > 0) {
        body.durationMinutes = body.eventDurationMinutes;
      }
      var url = isEditing && editId ? "/api/experiences/" + encodeURIComponent(editId) : "/api/experiences";
      var method = isEditing && editId ? "PUT" : "POST";
      var __expIdemKey2 = (!(isEditing && editId) && window.tstsIdempotencyKey) ? window.tstsIdempotencyKey(submitBtn) : "";
      var res = await window.authFetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        idempotencyKey: __expIdemKey2 || undefined
      });
      if (res.ok) {
        var payload = await res.json().catch(function () { return {}; });
        var saved = (payload && payload.data) ? payload.data : ((payload && payload.experience) ? payload.experience : payload);
        var savedId = String((saved && (saved._id || saved.id)) || "").trim();
        if (savedId && !editId) {
          isEditing = true;
          editId = savedId;
          var hiddenId = document.getElementById("editing-experience-id");
          if (hiddenId) hiddenId.value = savedId;
          // sir 2026-08-16: the auto-save only ever creates/keeps a private DRAFT, so a
          // never-published listing's CTA reads "Publish" — never "Save Changes" (the
          // walk found a brand-new listing wearing an edit label with no publish moment).
          if (submitBtn) submitBtn.textContent = "Publish";
        }
      }
    } catch (_) { /* Silent best-effort */ }
  }

  // sir 2026-08-16 ("Fix it", walk gap W5): every date and time a host reads back must be in
  // friendly Australian format, never the raw machine shape. Declared once, here, and used by
  // both the review panel above and the duplicate-listing warning below — a function declaration
  // is available to the whole of this file, so there must never be a second copy of either.
  function __friendlyReviewDate(iso) {
    var raw = String(iso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
      if (window.tstsFormatDateShort) return window.tstsFormatDateShort(new Date(raw + "T00:00:00"));
    } catch (_fmtErr) { void _fmtErr; }
    return raw;
  }
  function __friendlyReviewTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return String(hhmm || "");
    var h = parseInt(m[1], 10);
    var period = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + m[2] + " " + period;
  }

  async function __checkDuplicateListing() {
    var sd = dateInput ? String(dateInput.value || "").trim() : "";
    var st = timeInput ? String(timeInput.value || "").trim() : "";
    var dupeNotice = document.getElementById("wizard-dupe-notice");
    if (!dupeNotice) return;
    dupeNotice.classList.add("hidden");
    dupeNotice.textContent = "";
    if (!sd || !st) return;
    try {
      var res = await window.authFetch("/api/host/experiences");
      if (!res.ok) return;
      var data = await res.json().catch(function () { return {}; });
      var unwrapped = (data && data.data !== undefined) ? data.data : data;
      var exps = Array.isArray(unwrapped && unwrapped.items)
        ? unwrapped.items
        : (Array.isArray(unwrapped) ? unwrapped : ((unwrapped && unwrapped.experiences) ? unwrapped.experiences : []));
      for (var i = 0; i < exps.length; i++) {
        var exp = exps[i];
        if (!exp) continue;
        var expId = String(exp._id || exp.id || "");
        if (editId && expId === editId) continue;
        var expStart = String(exp.startDate || "").slice(0, 10);
        var expTime = String(exp.startTime || "").trim();
        if (expStart === sd && expTime === st) {
          dupeNotice.classList.remove("hidden");
          var El = window.tstsEl;
          if (El) {
            dupeNotice.textContent = "";
            var text1 = document.createTextNode("You already have \u201c" + String(exp.title || "Untitled") + "\u201d scheduled for " + __friendlyReviewDate(sd) + " at " + __friendlyReviewTime(st) + ". ");
            var link = El("a", {
              href: "host.html?edit=" + encodeURIComponent(expId),
              className: "underline font-bold text-orange-700 hover:text-orange-900"
            });
            link.textContent = "Edit existing";
            var text2 = document.createTextNode(" instead?");
            dupeNotice.appendChild(text1);
            dupeNotice.appendChild(link);
            dupeNotice.appendChild(text2);
          }
          return;
        }
      }
    } catch (_) { /* Silent */ }
  }

  // Trigger duplicate check on date/time change in Step 2
  if (dateInput) dateInput.addEventListener("change", function () { if (__wizardStep === 2) __checkDuplicateListing(); });
  if (timeInput) timeInput.addEventListener("change", function () { if (__wizardStep === 2) __checkDuplicateListing(); });

  // Wire wizard navigation buttons (event delegation)
  document.addEventListener("click", function (e) {
    if (!e.target) return;
    var btn = e.target.closest("[data-wizard-nav]");
    if (!btn) return;
    var action = btn.getAttribute("data-wizard-nav");
    if (action === "next") {
      if (!__validateWizardStep(__wizardStep)) return;
      hideNotice();
      var fromStep = __wizardStep;
      __showWizardStep(Math.min(__wizardStep + 1, __WIZARD_STEPS));
      __wizardAutoSaveDraft();
      if (fromStep === 2) __checkDuplicateListing();
    } else if (action === "prev") {
      hideNotice();
      __showWizardStep(Math.max(__wizardStep - 1, 1));
    }
  });

  // Save as Draft button
  var wizardDraftBtn = document.getElementById("wizard-save-draft-btn");
  if (wizardDraftBtn) {
    wizardDraftBtn.addEventListener("click", async function () {
      hideNotice();
      wizardDraftBtn.disabled = true;
      try {
        await __wizardAutoSaveDraft();
        showNotice("success", "Draft saved successfully.");
      } catch (_) {
        showNotice("error", "Could not save draft. Please try again.");
      } finally {
        wizardDraftBtn.disabled = false;
      }
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
    // Owner 2026-06-12: deep-link target for the host dashboard "Get verified" CTA. When the URL carries
    // verify=1 on an edit, open the event-verification form automatically. The button's own click handler
    // enforces the preconditions (host must be verified; listing not already verified/pending) and shows
    // the correct notice otherwise — so we reuse it rather than calling the modal directly.
    try {
      var __vparams = new URLSearchParams(location.search || "");
      if (__vparams.get("verify") === "1" && isEditing && editId && verifiedRequestBtn) {
        verifiedRequestBtn.click();
      }
    } catch (_ve) { void _ve; }
    await loadActivePolicySnapshot();
    syncPricingTransparency();
    await loadHostTaxonomies();
    unmaskAuthGate();
  })().catch(function () {
    unmaskAuthGate();
  });

  // Owner-approved 2026-05-02: dynamic taxonomy chips driven by /api/taxonomies (admin-editable).
  async function loadHostTaxonomies() {
    try {
      var res = await fetch((window.__TSTS_RUNTIME__ && window.__TSTS_RUNTIME__.apiBase ? window.__TSTS_RUNTIME__.apiBase : "") + "/api/taxonomies", { method: "GET" });
      if (!res || !res.ok) return;
      var payload = await res.json();
      var taxonomies = (payload && payload.data) || {};
      ["vibe", "dietary", "accessibility", "cuisine", "languages", "occasion"].forEach(function (key) {
        var wrap = document.querySelector('[data-host-tax-chips="' + key + '"]');
        if (!wrap) return;
        wrap.textContent = "";
        var items = Array.isArray(taxonomies[key]) ? taxonomies[key] : [];
        if (items.length === 0) {
          wrap.appendChild(window.tstsEl("p", { className: "text-xs text-slate-400" }, ["No options yet, admin can add them in Filter Taxonomies."]));
          return;
        }
        items.forEach(function (it) {
          var btn = window.tstsEl("button", {
            type: "button",
            className: "px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-full text-xs font-medium hover:border-orange-500 transition",
            "data-tax-key": key,
            "data-tax-value": it.value,
            "aria-pressed": "false"
          }, [it.label]);
          btn.addEventListener("click", function () {
            var on = btn.getAttribute("data-host-tax-chip-active") === key;
            if (on) {
              btn.removeAttribute("data-host-tax-chip-active");
              btn.setAttribute("aria-pressed", "false");
              btn.className = "px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-full text-xs font-medium hover:border-orange-500 transition";
            } else {
              btn.setAttribute("data-host-tax-chip-active", key);
              btn.setAttribute("aria-pressed", "true");
              btn.className = "px-3 py-1.5 bg-orange-600 border border-orange-600 text-white rounded-full text-xs font-bold transition";
            }
          });
          wrap.appendChild(btn);
        });
      });
      // Pre-select stored values when editing an existing experience.
      try {
        var hiddenId = document.getElementById("editing-experience-id");
        var editId = hiddenId ? String(hiddenId.value || "").trim() : "";
        if (editId) {
          var rExp = await window.authFetch("/api/experiences/" + encodeURIComponent(editId), { method: "GET" });
          if (rExp && rExp.ok) {
            var pExp = await rExp.json();
            var exp = (pExp && pExp.data) || pExp || {};
            ["vibe", "dietary", "accessibility", "cuisine", "languages", "occasion"].forEach(function (key) {
              var picked = Array.isArray(exp[key]) ? exp[key] : [];
              picked.forEach(function (val) {
                var chip = document.querySelector('[data-tax-key="' + key + '"][data-tax-value="' + String(val).replace(/"/g, '\\"') + '"]');
                if (chip && !chip.getAttribute("data-host-tax-chip-active")) chip.click();
              });
            });
            var ib = document.getElementById("host-instant-book");
            if (ib) ib.checked = !!exp.instantBook;
          }
        }
      } catch (_) { /* edit-mode pre-select is best-effort */ }
    } catch (_) { /* taxonomy load is non-fatal, host can still save without these */ }
  }

  // Owner-spec 2026-05-04 (D-10 chunk 7): host evidence-submission form.
  // Surfaces when URL has ?evidence=<reportId>. Loads report context, validates
  // user input, uploads optional files via Cloudinary, posts to backend.
  (function initEvidenceForm() {
    var qsEv = (function () {
      try { return new URLSearchParams(window.location.search).get("evidence"); }
      catch (_qsErr) { void _qsErr; return null; }
    })();
    if (!qsEv || !/^[a-fA-F0-9]{24}$/.test(qsEv)) return;

    var sec = document.getElementById("evidence-section");
    var formWrap = document.getElementById("create-experience-form");
    var wizardProgress = document.getElementById("wizard-progress");
    var hostHeading = (sec && sec.parentElement) ? sec.parentElement.querySelector("h1.heading-serif") : null;
    var hostSub = (hostHeading && hostHeading.nextElementSibling && hostHeading.nextElementSibling.matches("p")) ? hostHeading.nextElementSibling : null;
    if (!sec) return;

    // Hide the create-experience wizard while host is in evidence mode.
    if (formWrap) formWrap.classList.add("hidden");
    if (wizardProgress) wizardProgress.classList.add("hidden");
    if (hostHeading) hostHeading.classList.add("hidden");
    if (hostSub) hostSub.classList.add("hidden");
    sec.classList.remove("hidden");

    var ctxId = document.getElementById("evidence-report-id");
    var ctxNote = document.getElementById("evidence-reviewer-note");
    var ctxDeadline = document.getElementById("evidence-deadline");
    var alreadySubmitted = document.getElementById("evidence-already-submitted");
    var formEl = document.getElementById("evidence-form");
    var textEl = document.getElementById("evidence-text");
    var counterEl = document.getElementById("evidence-text-counter");
    var filesInput = document.getElementById("evidence-files");
    var filesStatus = document.getElementById("evidence-files-status");
    var errEl = document.getElementById("evidence-error");
    var successEl = document.getElementById("evidence-success");
    var cancelBtn = document.getElementById("evidence-cancel");
    var submitBtn = document.getElementById("evidence-submit");

    function showErr(msg) {
      if (!errEl) return;
      errEl.textContent = String(msg || "That didn't go through. Please try again.");
      errEl.classList.remove("hidden");
    }
    function clearErr() { if (errEl) errEl.classList.add("hidden"); }

    function fmtDate(iso) {
      if (!iso) return "";
      try {
        return new Date(iso).toLocaleString("en-AU", {
          weekday: "short", day: "numeric", month: "short",
          year: "numeric", hour: "numeric", minute: "2-digit"
        });
      } catch (_fmtErr) { void _fmtErr; return String(iso); }
    }

    if (textEl && counterEl) {
      var updateCounter = function () {
        counterEl.textContent = String((textEl.value || "").length);
      };
      textEl.addEventListener("input", updateCounter);
      updateCounter();
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        // Strip the ?evidence param and reload the standard host form.
        try {
          var u = new URL(window.location.href);
          u.searchParams.delete("evidence");
          window.location.href = u.pathname + (u.search ? u.search : "");
        } catch (_navErr) { void _navErr; window.location.href = "/host.html"; }
      });
    }

    // Load the report context (read-only).
    (async function loadContext() {
      try {
        var r = await window.authFetch("/api/host/reports/" + encodeURIComponent(qsEv) + "/evidence", { method: "GET" });
        if (!r || !r.ok) {
          var msg = "We could not load this report. The link may have expired or you may not have access.";
          try {
            var body = await r.json();
            if (body && body.message) msg = body.message;
          } catch (_jsonErr) { void _jsonErr; }
          showErr(msg);
          if (formEl) formEl.classList.add("hidden");
          return;
        }
        var data = await r.json();
        var d = (data && data.data) ? data.data : data;
        if (ctxId) ctxId.textContent = String(d.id || "");
        if (ctxNote) ctxNote.textContent = String(d.adminReason || "(no note from reviewer)");
        if (ctxDeadline) ctxDeadline.textContent = fmtDate(d.evidenceDeadline);

        if (d.hostEvidenceSubmittedAt) {
          if (alreadySubmitted) alreadySubmitted.classList.remove("hidden");
          if (formEl) formEl.classList.add("hidden");
        }
      } catch (e) {
        showErr("We could not load this report. Please try again or reply to the email you received.");
        if (formEl) formEl.classList.add("hidden");
      }
    })();

    if (formEl) {
      formEl.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        clearErr();
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting..."; }

        var text = String((textEl && textEl.value) || "").trim();
        if (!text) {
          showErr("Please share your account of what happened. Even a few sentences help our team make a fair decision.");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit response"; }
          return;
        }

        // Optional file uploads via existing uploadImage() helper (Cloudinary).
        var files = (filesInput && filesInput.files) ? Array.from(filesInput.files) : [];
        files = files.slice(0, 8);
        var urls = [];
        for (var i = 0; i < files.length; i++) {
          try {
            if (filesStatus) filesStatus.textContent = "Uploading file " + (i + 1) + " of " + files.length + "...";
            var url = await uploadImage(files[i]);
            urls.push(url);
          } catch (upErr) {
            showErr("File upload failed. You can submit text only, or reply to the email with attachments.");
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit response"; }
            return;
          }
        }
        if (filesStatus) filesStatus.textContent = "";

        try {
          var res = await window.authFetch("/api/host/reports/" + encodeURIComponent(qsEv) + "/evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text, files: urls })
          });
          if (!res || !res.ok) {
            var emsg = "We could not save your response. Please try again or reply to the email.";
            try { var eb = await res.json(); if (eb && eb.message) emsg = eb.message; } catch (_jsonErr2) { void _jsonErr2; }
            showErr(emsg);
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit response"; }
            return;
          }
          if (formEl) formEl.classList.add("hidden");
          if (successEl) successEl.classList.remove("hidden");
          window.scrollTo({ top: sec.offsetTop, behavior: "smooth" });
        } catch (e) {
          showErr("We could not save your response. Please try again or reply to the email.");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit response"; }
        }
      });
    }
  })();
})();
