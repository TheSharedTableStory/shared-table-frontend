// Frontend/js/explore.js

const PRICE_SLIDER_MAX = 500;

// The platform supports ten currencies and every listing carries its own, so the card's price pill
// may not assume a dollar. Mirrors the map host.js already ships; an unmapped code falls back to a
// "CODE " prefix, which is unambiguous rather than a misleading "$". Declared at module scope so it
// is initialised before the DOMContentLoaded handler below can reach it.
const EXPLORE_CCY_SYMBOL = {
  aud: "A$", nzd: "NZ$", cad: "CA$", sgd: "S$", usd: "$",
  eur: "€", gbp: "£", inr: "₹", jpy: "¥", chf: "CHF "
};

document.addEventListener("DOMContentLoaded", () => {
    // === DOM ELEMENTS ===
    const elSearch = document.getElementById("search-input");
    const elLocation = document.getElementById("location-input");
    const elDate = document.getElementById("date-input");
    const elGuests = document.getElementById("guests-input");
    
    const elFilterBtn = document.getElementById("filter-btn");
    const elFilterBtnLabel = document.getElementById("filter-btn-label");
    const elFilterCountBadge = document.getElementById("filter-count-badge");
    const elFilterPanel = document.getElementById("filter-panel");
    // Owner-flagged 2026-05-02: Clear all should only show when at least one filter is active.
    const elModalClearAll = document.getElementById("modal-clear-all");
    const elClearFilters = document.getElementById("clear-filters-btn");
    const elNearMeBtn    = document.getElementById("near-me-btn");
    const elClearFiltersEmpty = document.getElementById("clear-filters-empty-btn");
    const elApplyFilters = document.getElementById("apply-filters");
    const elSort = document.getElementById("sort-select");
    // These two used to look up ids that exist NOWHERE in explore.html, so every read and write
    // through them did nothing: the Private-booking box stayed unticked after a URL reload that
    // asked for it, and stayed ticked after its chip was removed. The real controls are the
    // modal-* ids, which the rest of this file already uses.
    const elPrivateBookingOnly = document.getElementById("modal-private-booking");
    const elVerifiedOnly = document.getElementById("verified-only");

    const elPriceSlider = document.getElementById("price-slider");
    const elPriceMinLabel = document.getElementById("price-min-label");
    const elPriceMaxLabel = document.getElementById("price-max-label");

    const categoryChips = document.querySelectorAll(".filter-chip");
    const activeFiltersBar = document.getElementById("active-filters-bar");
    const filtersSummary = document.getElementById("filters-summary");
    const experiencesGrid = document.getElementById("experiences-grid");
    const noResultsEl = document.getElementById("no-results");
    const loadErrorEl = document.getElementById("load-error");
    const retryLoadBtn = document.getElementById("retry-load-btn");

    if (!experiencesGrid) return;

    // sir 2026-08-13 (timezone fix, all three files): the date pickers' "today" floor was the
    // DEVICE's day, so a browser behind Melbourne offered a Melbourne day already over, and one
    // ahead greyed out Melbourne's own today. The experiences run in Melbourne — the calendar
    // floor reads Melbourne's clock. en-CA prints YYYY-MM-DD, the shape this pipeline carries.
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

    // Owner 2026-05-30 (date-picker rollout R3 — explore.html temp-unfrozen):
    // Replace native type="date" on #date-input (hero search bar) and
    // #filter-date-input (filter modal) with the shared Flatpickr wrapper. Both
    // are forward-looking booking-date pickers floored at Melbourne's today
    // (passed per-input; see melbourneTodayIso). We strip type="date" → type="text" so Chrome doesn't
    // render its own polyfill on top of the brand calendar. The "change" events
    // wired further below on the same DOM nodes keep working because Flatpickr
    // dispatches a `change` event whenever the alt-input value updates.
    if (typeof window.tstsDatePicker === "function") {
        var __heroDateEl   = elDate;
        var __filterDateEl = document.getElementById("filter-date-input");
        [
            // sir 2026-08-13: minDate passed explicitly — Melbourne's day, not the wrapper's
            // device-clock "today" default.
            { el: __heroDateEl,   opts: { minDate: melbourneTodayIso() } },
            // Filter-modal picker: render INLINE inside the modal flow. The
            // filter drawer's transform/overflow context broke every
            // absolute-positioned strategy (appendTo:body + below-left still
            // landed on the wrong viewport coordinates because Playwright's
            // bounding-rect reads don't match Flatpickr's positioning math
            // through the transformed ancestor). `inline: true` keeps the
            // calendar permanently rendered as a block below the input — a
            // calmer UX inside a modal anyway, and identical to how Airbnb /
            // Booking.com show their filter date picker.
            { el: __filterDateEl, opts: { inline: true, minDate: melbourneTodayIso() } }
        ].forEach(function (entry) {
            var el = entry.el;
            if (!el) return;
            try { el.setAttribute("type", "text"); } catch (_e) { void _e; }
            try { el.setAttribute("readonly", "readonly"); } catch (_e) { void _e; }
            try { el.setAttribute("placeholder", "Pick a date"); } catch (_e) { void _e; }
            try { el.setAttribute("autocomplete", "off"); } catch (_e) { void _e; }
            window.tstsDatePicker(el, entry.opts);
        });
    }

    // === UNIFIED STATE ===
    const filterState = {
        search: "",
        location: "",
        date: "",
        guests: "",
        categories: [],
        sort: "",
        privateBookingOnly: false,
        verifiedOnly: false,
        minPrice: 0,
        maxPrice: PRICE_SLIDER_MAX,
        // W1 (web parity, owner-approved 2026-04-30): location flow.
        nearMeActive: false,
        userLat: null,
        userLon: null,
        // W2 (web parity): Airbnb-grade filters.
        vibe:          [],
        dietary:       [],
        accessibility: [],
        newHostsOnly:  false,
        // Owner-flagged 2026-05-01 17:30, comprehensive filter dimensions
        // matching mobile FiltersSheet.
        cuisine:       [],
        languages:     [],
        occasion:      [],
        daysOfWeek:    [],
        timeOfDay:     [],
        duration:      "",
        minRating:     "",
        minReviews:    "",
        instantBook:   false,
        // Owner-approved 2026-05-02: full mobile parity additions.
        suburb:        "",
        city:          "",
        distanceKm:    "25",
        modalCategories: [], // category multi-select inside modal (mirrors mobile)
    };

    // W1: haversine distance helper (km between two lat/lon).
    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const la1 = toRad(lat1);
        const la2 = toRad(lat2);
        const h = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    window.tstsHaversineKm = haversineKm;

    // W1: enrich experiences array with _distanceKm field when user location known.
    function enrichWithDistance(experiences) {
        if (filterState.userLat == null || filterState.userLon == null) return experiences;
        return experiences.map(function(exp) {
            const lat = Number(exp.lat || (exp.location && exp.location.lat));
            const lng = Number(exp.lng || (exp.location && exp.location.lng));
            if (!isFinite(lat) || !isFinite(lng)) return exp;
            return Object.assign({}, exp, {
                _distanceKm: haversineKm(filterState.userLat, filterState.userLon, lat, lng),
            });
        });
    }
    window.tstsEnrichWithDistance = enrichWithDistance;

    // W1: Near me handler, request browser geolocation, set state, refresh.
    // sir 2026-08-22 ("every ---- filter with every ---- posibility must be tested end to
    // end"): Near me was a SILENT DEAD END, and it is the one filter that can fail for reasons the
    // guest controls. Both failure branches called `window.tstsToast(...)` behind
    // `if (window.tstsToast)` — and **that helper does not exist anywhere on the platform**. The
    // guard is therefore always false, so every failure message was skipped and nothing whatever
    // appeared on screen. The real helper is `window.tstsNotify(msg, type)` (common.js:1008).
    // PROVEN: ticked Near me → box went checked, geolocation was refused, and then: badge stayed
    // 0, the distance chips never appeared, and NOT ONE word was shown. A guest is left with a
    // ticked box that did nothing and no reason why — sir's rule that no button may be silent.
    // Also fixed here: a REFUSED request used to leave the checkbox ticked, which claimed a filter
    // that is not applied; it is now put back so the control tells the truth.
    // NOTE: this same non-existent helper is called in 12 further places across common.js, host.js
    // and profile.js — all on FROZEN surfaces, so they are REPORTED, not touched.
    function __nearMeSay(msg, type) {
        try { if (typeof window.tstsNotify === "function") window.tstsNotify(msg, type || "info"); } catch (_nErr) { void _nErr; }
    }
    function __nearMeUntick() {
        const box = document.getElementById("filter-near-me");
        if (box) box.checked = false;
        filterState.nearMeActive = false;
        try { window.tstsSyncDistanceChips && window.tstsSyncDistanceChips(); } catch (_dErr) { void _dErr; }
        try { refreshFilterUi(); } catch (_uiErr) { void _uiErr; }
    }
    function handleNearMeClick() {
        if (!navigator.geolocation) {
            __nearMeSay("This browser can't share your location, so Near me isn't available. Try the Suburb or City field instead.", "error");
            __nearMeUntick();
            return;
        }
        // Toggle off if already active.
        if (filterState.nearMeActive) {
            filterState.nearMeActive = false;
            if (elNearMeBtn) {
                elNearMeBtn.classList.remove("bg-orange-50", "border-orange-500", "text-orange-700");
                elNearMeBtn.setAttribute("aria-pressed", "false");
            }
            fetchExperiences();
            return;
        }
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                filterState.userLat = pos.coords.latitude;
                filterState.userLon = pos.coords.longitude;
                filterState.nearMeActive = true;
                if (elNearMeBtn) {
                    elNearMeBtn.classList.add("bg-orange-50", "border-orange-500", "text-orange-700");
                    elNearMeBtn.setAttribute("aria-pressed", "true");
                }
                fetchExperiences();
            },
            function(err) {
                // Rule 16 — say what happened AND what to do next. The old strings were bare
                // statements of failure ("Location permission denied.") with no way forward, and
                // they never rendered anyway.
                const msg = (err && err.code === 1)
                    ? "We don't have permission to use your location. Allow it in your browser settings, or search by Suburb or City instead."
                    : "We couldn't get your location just now. Give it a moment and try again, or search by Suburb or City instead.";
                __nearMeSay(msg, "warning");
                __nearMeUntick();
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
    }
    if (elNearMeBtn) elNearMeBtn.addEventListener("click", handleNearMeClick);

    // Chip selected-state must SWAP base<->selected utilities, not stack them:
    // bg-white/border-slate-200/text-slate-700 override bg-orange-50/border-orange-500/
    // text-orange-700 in the compiled tailwind.css (equal specificity, base emitted
    // later), so stacking the orange trio on the base renders no visible change.
    // Verified 2026-05-24 via getComputedStyle. Every chip group shares this base.
    function setChipSelected(btn, on) {
        if (!btn) return;
        if (on) {
            btn.classList.remove("bg-white", "border-slate-200", "text-slate-700");
            btn.classList.add("bg-orange-50", "border-orange-500", "text-orange-700");
        } else {
            btn.classList.remove("bg-orange-50", "border-orange-500", "text-orange-700");
            btn.classList.add("bg-white", "border-slate-200", "text-slate-700");
        }
    }

    // W2 (web parity): wire up Vibe / Dietary / Accessibility / New-hosts chips.
    function bindMultiChip(selector, stateKey, dataAttr) {
        const chips = document.querySelectorAll(selector);
        chips.forEach(function(btn) {
            btn.addEventListener("click", function(ev) {
                ev.preventDefault();
                const key = btn.getAttribute(dataAttr || "data-vibe")
                    || btn.getAttribute("data-dietary")
                    || btn.getAttribute("data-accessibility")
                    || "";
                if (!key) return;
                const idx = filterState[stateKey].indexOf(key);
                if (idx >= 0) {
                    filterState[stateKey].splice(idx, 1);
                    setChipSelected(btn, false);
                } else {
                    filterState[stateKey].push(key);
                    setChipSelected(btn, true);
                }
                // Owner-flagged 2026-05-02: refresh UI so filter count badge + Clear all visibility update live.
                try { refreshFilterUi(); } catch (_uiErr) { /* refreshFilterUi not yet defined; will be called on apply */ }
            });
        });
    }
    bindMultiChip(".vibe-chip",          "vibe",          "data-vibe");
    bindMultiChip(".dietary-chip",       "dietary",       "data-dietary");
    bindMultiChip(".accessibility-chip", "accessibility", "data-accessibility");
    // Owner-flagged 2026-05-01 17:30, wire new chip groups.
    bindMultiChip(".cuisine-chip",       "cuisine",       "data-cuisine");
    bindMultiChip(".language-chip",      "languages",     "data-language");
    bindMultiChip(".occasion-chip",      "occasion",      "data-occasion");
    bindMultiChip(".dow-chip",           "daysOfWeek",    "data-dow");
    bindMultiChip(".tod-chip",           "timeOfDay",     "data-tod");

    // ============================================================
    // SMART DYNAMIC FILTER CHIPS (owner-approved 2026-05-24).
    // /api/experiences/facets returns every taxonomy value merged
    // with a live count of ACTIVE experiences carrying that tag,
    // sorted count-desc. Rendering rule:
    //   • never empty     — the taxonomy always supplies curated
    //                       defaults, so a dimension with zero tagged
    //                       listings still shows sensible starter chips.
    //   • never cluttered — only the top FILTER_VISIBLE chips show by
    //                       default; the rest collapse behind "Show all".
    // count-desc order means the most-tagged values float to the top
    // automatically as the catalogue grows. Any failure leaves the
    // hardcoded HTML chips intact as a graceful fallback.
    const FILTER_VISIBLE = 8;
    const DYNAMIC_FILTER_GROUPS = [
        { key: "cuisine",       containerId: "cuisine-chips",       chipClass: "cuisine-chip",       dataAttr: "data-cuisine",       stateKey: "cuisine" },
        { key: "vibe",          containerId: "vibe-chips",          chipClass: "vibe-chip",          dataAttr: "data-vibe",          stateKey: "vibe" },
        { key: "occasion",      containerId: "occasion-chips",      chipClass: "occasion-chip",      dataAttr: "data-occasion",      stateKey: "occasion" },
        { key: "dietary",       containerId: "dietary-chips",       chipClass: "dietary-chip",       dataAttr: "data-dietary",       stateKey: "dietary" },
        { key: "accessibility", containerId: "accessibility-chips", chipClass: "accessibility-chip", dataAttr: "data-accessibility", stateKey: "accessibility" },
        { key: "languages",     containerId: "language-chips",      chipClass: "language-chip",      dataAttr: "data-language",      stateKey: "languages" }
    ];

    function buildFilterChip(group, opt, hidden) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = group.chipClass + " px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-full text-xs font-medium hover:border-orange-500 transition";
        if (hidden) btn.classList.add("hidden", "tsts-filter-overflow");
        btn.setAttribute(group.dataAttr, opt.value);
        btn.textContent = opt.label || opt.value;
        // Pre-apply selected state from filterState (URL-driven or prior selection).
        if (Array.isArray(filterState[group.stateKey]) && filterState[group.stateKey].indexOf(opt.value) >= 0) {
            setChipSelected(btn, true);
        }
        return btn;
    }

    async function renderDynamicFilterChips() {
        let facets = null;
        try {
            const res = await window.authFetch("/api/experiences/facets", { method: "GET" });
            const body = await res.json();
            facets = (body && body.ok) ? (body.data || null) : null;
        } catch (_facetErr) {
            facets = null; // keep hardcoded chips as graceful fallback
        }
        if (!facets) return;

        DYNAMIC_FILTER_GROUPS.forEach(function (group) {
            const list = Array.isArray(facets[group.key]) ? facets[group.key] : null;
            const container = document.getElementById(group.containerId);
            // Skip (keep hardcoded fallback) if data missing/empty or container absent.
            if (!container || !list || !list.length) return;

            container.textContent = ""; // clear hardcoded defaults; this group is now facet-driven

            const visible  = list.slice(0, FILTER_VISIBLE);
            const overflow = list.slice(FILTER_VISIBLE);

            visible.forEach(function (opt) {
                if (opt && opt.value) container.appendChild(buildFilterChip(group, opt, false));
            });
            overflow.forEach(function (opt) {
                if (opt && opt.value) container.appendChild(buildFilterChip(group, opt, true));
            });

            if (overflow.length) {
                const toggle = document.createElement("button");
                toggle.type = "button";
                // Owner 2026-08-05 ("fix all 12"): removed the inert `tsts-filter-showall` token —
                // never styled, never queried; the button's full styling is the utilities below.
                // Zero visual change on the frozen Explore page (P3).
                toggle.className = "px-3 py-1.5 bg-white border border-orange-300 text-orange-600 rounded-full text-xs font-semibold hover:bg-orange-50 hover:border-orange-500 transition";
                toggle.textContent = "Show all (" + overflow.length + ")";
                toggle.setAttribute("aria-expanded", "false");
                toggle.addEventListener("click", function () {
                    const expanded = toggle.getAttribute("aria-expanded") === "true";
                    container.querySelectorAll(".tsts-filter-overflow").forEach(function (c) {
                        c.classList.toggle("hidden", expanded);
                    });
                    toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
                    toggle.textContent = expanded ? ("Show all (" + overflow.length + ")") : "Show less";
                });
                container.appendChild(toggle);
            }

            // Re-bind freshly rendered chips (old nodes + their listeners were cleared).
            bindMultiChip("." + group.chipClass, group.stateKey, group.dataAttr);
        });

        // Selected classes were re-applied above; refresh count badge + Clear-all visibility.
        try { refreshFilterUi(); } catch (_uiErr) { /* defined later in closure; safe to ignore */ }
    }

    // Single-select chip groups (clicking sets the value, clicking again clears).
    function bindSingleChip(selector, stateKey, dataAttr) {
        const chips = document.querySelectorAll(selector);
        chips.forEach(function(btn) {
            btn.addEventListener("click", function(ev) {
                ev.preventDefault();
                const value = btn.getAttribute(dataAttr) || "";
                // Clear other chips
                chips.forEach(function(o) { setChipSelected(o, false); });
                // Toggle: if value already selected, clear; else set
                if (filterState[stateKey] === value) {
                    filterState[stateKey] = "";
                } else {
                    filterState[stateKey] = value;
                    setChipSelected(btn, true);
                }
                // Owner-flagged 2026-05-02: refresh UI so filter count + Clear all reflect change live.
                try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
            });
        });
    }
    bindSingleChip(".duration-chip",   "duration",   "data-duration");
    bindSingleChip(".min-rating-chip", "minRating",  "data-min-rating");
    bindSingleChip(".min-reviews-chip","minReviews", "data-min-reviews");
    bindSingleChip(".distance-chip",   "distanceKm", "data-distance");
    bindMultiChip(".modal-cat-chip",   "modalCategories", "data-modal-cat");

    // Owner-approved 2026-05-02: Suburb + City inputs + Date input + Guests input + modal Private/NewHosts toggles.
    const elFilterSuburb = document.getElementById("filter-suburb");
    if (elFilterSuburb) {
        elFilterSuburb.addEventListener("input", function() {
            filterState.suburb = String(elFilterSuburb.value || "").trim();
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    const elFilterCity = document.getElementById("filter-city");
    if (elFilterCity) {
        elFilterCity.addEventListener("input", function() {
            filterState.location = String(elFilterCity.value || "").trim();
            // sir 2026-08-15, verbatim: "fix both firled". sir again 2026-08-22: "the explore
            // filter is mess up ---- and even after 24 hours it was not fixed".
            // THE SAME DEFECT AS GUESTS, LEFT BEHIND WHEN I FIXED GUESTS. applyFilters() (:1071)
            // does `filterState.location = elLocation.value.trim()` — elLocation is the HERO box
            // `#location-input`, NOT this drawer field. So typing a city here set the state, and
            // pressing "Show results" immediately overwrote it with the hero box's EMPTY string.
            // PROVEN ON SCREEN BEFORE THIS FIX: typed "Melbourne" → Show results → the URL carried
            // NO parameters at all, the badge read 0, all 21 unfiltered cards came back, and
            // "Melbourne" sat in the field still looking applied. The drawer's city filter had
            // never worked at any value.
            // City is ONE question with two views on this page, so the value is mirrored into the
            // hero box — the same remedy already applied to guests. applyFilters stays correct for
            // BOTH entry paths and is not rewritten, and the two boxes can never disagree.
            if (elLocation) elLocation.value = elFilterCity.value;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    const elFilterDateInput = document.getElementById("filter-date-input");
    if (elFilterDateInput) {
        elFilterDateInput.addEventListener("change", function() {
            filterState.date = String(elFilterDateInput.value || "").trim();
            // The third field of the same defect — sir 2026-08-15 named "date per same walk".
            // applyFilters() (:1072) does `filterState.date = elDate.value` off the HERO picker, so
            // a date chosen in the drawer was wiped the moment "Show results" was pressed.
            // Mirrored to the hero picker like city and guests. The hero input is OWNED by
            // Flatpickr, so its own state is set through setDate rather than writing .value behind
            // its back — otherwise the picker's internal date and the text on screen drift apart,
            // and clearFilters()/updateActiveChips() (which both call _flatpickr.clear()) would be
            // clearing a picker that never knew it held a date. The `false` second argument stops
            // setDate re-firing "change", which would loop straight back into this handler.
            if (elDate) {
                if (elDate._flatpickr && typeof elDate._flatpickr.setDate === "function") {
                    try { elDate._flatpickr.setDate(elFilterDateInput.value, false); } catch (_fpErr) { void _fpErr; }
                } else {
                    elDate.value = elFilterDateInput.value;
                }
            }
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    const elFilterGuestsInput = document.getElementById("filter-guests-input");
    if (elFilterGuestsInput) {
        elFilterGuestsInput.addEventListener("change", function() {
            filterState.guests = String(elFilterGuestsInput.value || "").trim();
            // sir found this 2026-08-22 ("why filter of 100 guest is not applicabe?"). Removing the
            // max="12" cap was only half of it. `applyFilters()` reads `elGuests` — the HERO box —
            // when it rebuilds the state, so pressing "Show results" wrote an EMPTY string over
            // whatever was typed HERE and the request went out with no `guests` parameter at all.
            // Proven on the wire: GET /api/experiences? with nothing after the "?", badge 1 → 0,
            // and the number still sitting on screen looking applied. So the panel's guests filter
            // had never worked at ANY number, not just at 100.
            // Guests is ONE question with two views on this page. Mirroring the value into the hero
            // box keeps them in agreement, so applyFilters:1062 stays correct for BOTH entry paths
            // and is not rewritten — and the two boxes can no longer disagree with each other.
            if (elGuests) elGuests.value = elFilterGuestsInput.value;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    const elModalPrivate = document.getElementById("modal-private-booking");
    if (elModalPrivate) {
        elModalPrivate.addEventListener("change", function() {
            filterState.privateBookingOnly = !!elModalPrivate.checked;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    const elModalNewHosts = document.getElementById("modal-new-hosts");
    if (elModalNewHosts) {
        elModalNewHosts.addEventListener("change", function() {
            filterState.newHostsOnly = !!elModalNewHosts.checked;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }
    // Reveal/hide distance-chips when Near me toggles.
    function syncDistanceChipsVisibility() {
        const wrap = document.getElementById("distance-chips-wrap");
        if (!wrap) return;
        if (filterState.nearMeActive) {
            wrap.classList.remove("hidden");
        } else {
            wrap.classList.add("hidden");
        }
    }
    window.tstsSyncDistanceChips = syncDistanceChipsVisibility;

    // Near me toggle inside FiltersSheet.
    const elFilterNearMe = document.getElementById("filter-near-me");
    if (elFilterNearMe) {
        elFilterNearMe.addEventListener("change", function() {
            if (elFilterNearMe.checked) {
                handleNearMeClick();  // request location + set state
            } else {
                filterState.nearMeActive = false;
            }
            try { window.tstsSyncDistanceChips && window.tstsSyncDistanceChips(); } catch (_dErr) { /* sync helper not yet bound */ }
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }

    // Instant book toggle.
    const elInstantBook = document.getElementById("instant-book-toggle");
    if (elInstantBook) {
        elInstantBook.addEventListener("change", function() {
            filterState.instantBook = !!elInstantBook.checked;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }

    // Same contract as the three checkboxes around it (private-booking, new-hosts, instant-book):
    // stage the choice and refresh the chips — never apply, never close the drawer.
    if (elVerifiedOnly) {
        elVerifiedOnly.addEventListener("change", function() {
            filterState.verifiedOnly = !!elVerifiedOnly.checked;
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }
        });
    }

    const elNewHostsOnly = document.getElementById("modal-new-hosts");
    if (elNewHostsOnly) {
        elNewHostsOnly.addEventListener("change", function() {
            filterState.newHostsOnly = !!elNewHostsOnly.checked;
        });
    }

    function syncUrlFromState() {
        try {
            const p = new URLSearchParams();
            if (filterState.search) p.set("q", String(filterState.search));
            if (filterState.location) p.set("city", String(filterState.location));
            if (filterState.suburb) p.set("suburb", String(filterState.suburb));
            if (filterState.date) p.set("date", String(filterState.date));
            if (filterState.guests) p.set("guests", String(filterState.guests));
            // Owner-approved 2026-05-02: distance radius (only meaningful when nearMeActive).
            if (filterState.nearMeActive && filterState.distanceKm) p.set("distanceKm", String(filterState.distanceKm));
            // Owner-approved 2026-05-02: modal category multi-select (matches mobile param naming).
            if (Array.isArray(filterState.modalCategories) && filterState.modalCategories.length > 0) {
                filterState.modalCategories.forEach((c) => p.append("category", String(c)));
            }
            if (Array.isArray(filterState.categories) && filterState.categories.length > 0) {
                filterState.categories
                    .map((c) => normalizeCategory(c))
                    .filter((c) => c && c !== "all")
                    .forEach((c) => p.append("category", c));
            }
            if (filterState.sort) p.set("sort", String(filterState.sort));
            if (filterState.privateBookingOnly) p.set("privateBookingAllowed", "true");
            if (filterState.verifiedOnly) p.set("verified", "true");
            if (filterState.minPrice > 0) p.set("minPrice", String(filterState.minPrice));
            if (filterState.maxPrice < PRICE_SLIDER_MAX) p.set("maxPrice", String(filterState.maxPrice));
            if (window.TSTS_DEALS_UI_MODE) p.set("filter", "deals");
            // Owner-flagged 2026-05-01 17:30, comprehensive web filter dims.
            if (Array.isArray(filterState.vibe)          && filterState.vibe.length          > 0) p.set("vibe",         filterState.vibe.join(","));
            if (Array.isArray(filterState.dietary)       && filterState.dietary.length       > 0) p.set("dietary",      filterState.dietary.join(","));
            if (Array.isArray(filterState.accessibility) && filterState.accessibility.length > 0) p.set("accessibility",filterState.accessibility.join(","));
            if (filterState.newHostsOnly)                                                         p.set("newHostsOnly", "true");
            if (Array.isArray(filterState.cuisine)       && filterState.cuisine.length       > 0) p.set("cuisine",      filterState.cuisine.join(","));
            if (Array.isArray(filterState.languages)     && filterState.languages.length     > 0) p.set("languages",    filterState.languages.join(","));
            if (Array.isArray(filterState.occasion)      && filterState.occasion.length      > 0) p.set("occasion",     filterState.occasion.join(","));
            if (Array.isArray(filterState.daysOfWeek)    && filterState.daysOfWeek.length    > 0) p.set("daysOfWeek",   filterState.daysOfWeek.join(","));
            if (Array.isArray(filterState.timeOfDay)     && filterState.timeOfDay.length     > 0) p.set("timeOfDay",    filterState.timeOfDay.join(","));
            if (filterState.duration)                                                             p.set("duration",     String(filterState.duration));
            if (filterState.minRating)                                                            p.set("minRating",    String(filterState.minRating));
            if (filterState.minReviews)                                                           p.set("minReviewCount", String(filterState.minReviews));
            if (filterState.instantBook)                                                          p.set("instantBook",  "true");
            if (filterState.nearMeActive)                                                         p.set("nearMe",       "true");

            const qs = p.toString();
            const next = window.location.pathname + (qs ? ("?" + qs) : "");
            window.history.replaceState({}, document.title, next);
        } catch (_) {
            return;
        }
    }

    function normalizeCategory(raw) {
        try {
            if (window.tstsNormalizeCategory && typeof window.tstsNormalizeCategory === "function") {
                return window.tstsNormalizeCategory(raw);
            }
        } catch (_) {}
        return String(raw || "").trim();
    }

    function isPrivateBookingAvailable(exp) {
        const e = exp || {};
        if (typeof e.privateBookingAllowed === "boolean") return e.privateBookingAllowed;
        const privateCap = Number(e.privateCapacity || 0);
        const privatePrice = Number(e.privatePrice || 0);
        return Number.isFinite(privateCap) && privateCap > 0 && Number.isFinite(privatePrice) && privatePrice > 0;
    }

    function looksLikeEmailName(v) {
        const s = String(v || "").trim();
        if (!s) return false;
        if (s.length > 254) return false;
        if (/\s/.test(s)) return false;
        const at = s.indexOf("@");
        if (at <= 0 || at !== s.lastIndexOf("@")) return false;
        const local = s.slice(0, at);
        const domain = s.slice(at + 1);
        if (!local || !domain) return false;
        if (local.length > 64 || domain.length < 3 || domain.length > 253) return false;
        if (domain.indexOf(".") < 1) return false;
        if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") || domain.endsWith("-")) return false;
        const tld = domain.split(".").pop() || "";
        if (!/^[a-z]{2,24}$/i.test(tld)) return false;
        if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
        if (!/^[a-z0-9.-]+$/i.test(domain)) return false;
        return true;
    }

    function isStarterTitle(raw) {
        const t = String(raw || "").trim();
        if (!t) return false;
        return /^WORLDCLASS_STARTER_/i.test(t) || /^starter[_\-\s]/i.test(t);
    }

    function stripWorldClassPrefix(raw) {
        const t = String(raw || "").trim();
        if (!t) return "";
        return t.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
    }

    function publicExperienceTitle(exp) {
        const title = String((exp && exp.title) || "").trim();
        const debranded = stripWorldClassPrefix(title);
        if (debranded) return debranded;
        if (title && !isStarterTitle(title)) return title;
        return "Shared experience";
    }

    function normalizeHostId(expLike) {
        const expObj = expLike || {};
        const fromTop = String(expObj.hostId || "").trim();
        if (/^[a-f0-9]{24}$/i.test(fromTop)) return fromTop;
        const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
        const fromNested = String(hostObj._id || hostObj.id || "").trim();
        if (/^[a-f0-9]{24}$/i.test(fromNested)) return fromNested;
        return "";
    }

    function cardTeaser(exp) {
        const city = String((exp && exp.city) || "your city");
        if (isStarterTitle(exp && exp.title)) return "Hosted in " + city;
        const raw = String((exp && exp.description) || "").trim().replace(/\s+/g, " ");
        if (!raw) return "Hosted in " + city;
        if (/starter experience|worldclass_starter/i.test(raw)) return "Hosted in " + city;
        if (raw.length <= 110) return raw;
        return raw.slice(0, 107).trimEnd() + "...";
    }

    function normalizedVerifiedStatus(exp) {
        const s = String((exp && exp.verifiedStatus) || "").trim().toLowerCase();
        if (s === "verified") return "verified";
        if (s === "pending") return "pending";
        if (s === "rejected") return "rejected";
        return "none";
    }

    // sir 2026-09-13: the only declaration — a second one further down once shadowed this and no chip ever looked selected.
    function syncCategoryChips() {
        const activeSet = new Set(Array.isArray(filterState.categories) ? filterState.categories : []);
        categoryChips.forEach((chip) => {
            chip.classList.remove("active", "tsts-indicator-ink", "border-transparent");
            chip.classList.add("bg-tsts-cream", "border-slate-200", "text-slate-600");
            const key = String(chip.getAttribute("data-category") || "");
            const isAll = key === "all";
            const isActive = (isAll && activeSet.size === 0) || (!isAll && activeSet.has(key));
            if (isActive) {
                chip.classList.add("active", "tsts-indicator-ink", "border-transparent");
                chip.classList.remove("bg-tsts-cream", "border-slate-200", "text-slate-600");
            }
        });
        refreshFilterUi();
    }

    function getActiveFilterCount() {
        let count = 0;
        // Original dimensions
        if (filterState.search) count += 1;
        if (filterState.location) count += 1;
        if (filterState.date) count += 1;
        if (filterState.guests) count += 1;
        // Sort is NOT a filter, owner-flagged 2026-05-02. Removed from filter count.
        if (filterState.privateBookingOnly) count += 1;
        if (filterState.verifiedOnly) count += 1;
        if (Array.isArray(filterState.categories) && filterState.categories.some((c) => c && c !== "all")) count += 1;
        if (filterState.minPrice > 0 || filterState.maxPrice < PRICE_SLIDER_MAX) count += 1;
        // Owner-flagged 2026-05-02: count ALL filter dimensions for parity with mobile.
        if (filterState.newHostsOnly) count += 1;
        if (filterState.nearMeActive) count += 1;
        if (Array.isArray(filterState.vibe)          && filterState.vibe.length          > 0) count += 1;
        if (Array.isArray(filterState.dietary)       && filterState.dietary.length       > 0) count += 1;
        if (Array.isArray(filterState.accessibility) && filterState.accessibility.length > 0) count += 1;
        if (Array.isArray(filterState.cuisine)       && filterState.cuisine.length       > 0) count += 1;
        if (Array.isArray(filterState.languages)     && filterState.languages.length     > 0) count += 1;
        if (Array.isArray(filterState.occasion)      && filterState.occasion.length      > 0) count += 1;
        if (Array.isArray(filterState.daysOfWeek)    && filterState.daysOfWeek.length    > 0) count += 1;
        if (Array.isArray(filterState.timeOfDay)     && filterState.timeOfDay.length     > 0) count += 1;
        if (filterState.duration)    count += 1;
        if (filterState.minRating)   count += 1;
        if (filterState.minReviews)  count += 1;
        if (filterState.instantBook) count += 1;
        if (filterState.distanceKm && filterState.distanceKm !== '25') count += 1;
        // Owner-approved 2026-05-02: full mobile parity additions.
        if (filterState.suburb) count += 1;
        if (Array.isArray(filterState.modalCategories) && filterState.modalCategories.length > 0) count += 1;
        return count;
    }

    // Owner-flagged 2026-05-01 20:35, Airbnb-style full-screen modal.
    // Backdrop fades in, panel slides in from the right, body scroll locks.
    function setFilterPanelOpen(open) {
        const shouldOpen = !!open;
        const elBackdrop = document.getElementById("filter-modal-backdrop");
        if (elFilterPanel) {
            if (shouldOpen) {
                elFilterPanel.classList.remove("hidden");
                // requestAnimationFrame to let the browser paint hidden state
                // before applying the translate-x-0 transform (so the slide
                // animation actually plays).
                requestAnimationFrame(() => {
                    elFilterPanel.classList.remove("translate-x-full");
                    elFilterPanel.classList.add("translate-x-0");
                });
            } else {
                elFilterPanel.classList.add("translate-x-full");
                elFilterPanel.classList.remove("translate-x-0");
                // Hide after transition (300ms)
                setTimeout(() => { elFilterPanel.classList.add("hidden"); }, 320);
            }
        }
        if (elBackdrop) {
            if (shouldOpen) {
                elBackdrop.classList.remove("hidden");
                requestAnimationFrame(() => { elBackdrop.classList.add("opacity-100"); elBackdrop.classList.remove("opacity-0"); });
            } else {
                elBackdrop.classList.add("opacity-0");
                elBackdrop.classList.remove("opacity-100");
                setTimeout(() => { elBackdrop.classList.add("hidden"); }, 320);
            }
        }
        if (elFilterBtn) {
            elFilterBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
            elFilterBtn.classList.toggle("filter-btn-active", shouldOpen);
        }
        if (elFilterBtnLabel) {
            elFilterBtnLabel.textContent = "Filters";
        }
        // Body scroll lock when modal open
        try {
            document.body.style.overflow = shouldOpen ? "hidden" : "";
        } catch (e) { void e; }
    }
    // Close handlers, backdrop click + X button
    document.addEventListener("click", function(ev) {
        const t = ev.target;
        if (!t) return;
        if (t.id === "filter-modal-backdrop" || t.closest && t.closest("#modal-close-btn")) {
            setFilterPanelOpen(false);
        }
    });

    function refreshFilterUi() {
        const count = getActiveFilterCount();
        if (elFilterCountBadge) {
            if (count > 0) {
                elFilterCountBadge.classList.remove("hidden");
                elFilterCountBadge.style.display = "";
                elFilterCountBadge.textContent = String(count);
            } else {
                elFilterCountBadge.classList.add("hidden");
                elFilterCountBadge.style.display = "none";
                elFilterCountBadge.textContent = "0";
            }
        }
        // Owner-flagged 2026-05-02: hide "Clear all" when no filters active.
        // Use inline visibility (Tailwind 'invisible' utility isn't in our compiled CSS).
        if (elModalClearAll) {
            if (count > 0) {
                elModalClearAll.style.visibility = "visible";
                elModalClearAll.removeAttribute("aria-hidden");
                elModalClearAll.removeAttribute("tabindex");
            } else {
                elModalClearAll.style.visibility = "hidden";
                elModalClearAll.setAttribute("aria-hidden", "true");
                elModalClearAll.setAttribute("tabindex", "-1");
            }
        }
        // Owner-approved 2026-05-02: when no filters, the Clear pill is removed from
        // the layout via the HTML `hidden` attribute (not display:none style which
        // can leave whitespace artifacts in some flex contexts). When filters apply,
        // the pill comes back and the search bar contracts to make room.
        if (elClearFilters) {
            if (count > 0) {
                elClearFilters.hidden = false;
                elClearFilters.removeAttribute("aria-hidden");
                elClearFilters.removeAttribute("tabindex");
            } else {
                elClearFilters.hidden = true;
                elClearFilters.setAttribute("aria-hidden", "true");
                elClearFilters.setAttribute("tabindex", "-1");
            }
        }
        if (filtersSummary) {
            filtersSummary.textContent = count > 0 ? (String(count) + " active filter" + (count > 1 ? "s" : "")) : "All stories";
        }
    }

    function tstsIsDeal(exp) {
        try {
            const e = exp || {};
            if (e.isDeal === true) return true;
            const direct = Number(e.discountPercent || e.discount || 0);
            if (isFinite(direct) && direct > 0) return true;
            const dyn = e.dynamicDiscounts && typeof e.dynamicDiscounts === "object" ? e.dynamicDiscounts : null;
            if (dyn) {
                // Owner 2026-08-02 (sir's Deals ruling — the REAL wiring defect): the backend stores
                // discounts as dynamicDiscounts.group.{host,admin}.tiers[].percent. The old flat
                // Object.values(dyn) read Number({...}) = NaN, so a genuine host discount NEVER
                // registered as a deal. Read the real tier shape (legacy flat values kept below).
                const group = (dyn.group && typeof dyn.group === "object") ? dyn.group : {};
                // Only ENABLED configs count — the pricing kernel ignores disabled tiers, and a chip
                // the checkout won't honour would be a lying deal.
                const tierSets = [group.host, group.admin];
                for (const cfg of tierSets) {
                    if (!cfg || cfg.enabled !== true) continue;
                    const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
                    if (tiers.some((t) => isFinite(Number(t && t.percent)) && Number(t.percent) > 0)) return true;
                }
                const vals = Object.values(dyn).map((v) => Number(v)).filter((v) => isFinite(v));
                if (vals.some((v) => v > 0)) return true;
            }
        } catch (_) {}
        return false;
    }

    // === URL PARAM HANDLER ===
    const urlParams = new URLSearchParams(window.location.search);
    const urlCategoryRaw = urlParams.getAll("category");
    const urlQuery = urlParams.get("q");
    const urlFilter = urlParams.get("filter");
    const urlPrivateBookingAllowed = String(urlParams.get("privateBookingAllowed") || "").trim().toLowerCase();
    const urlVerified = String(urlParams.get("verified") || "").trim().toLowerCase();

    if (urlQuery && elSearch) {
        filterState.search = String(urlQuery).trim();
        elSearch.value = filterState.search;
    }

    if (Array.isArray(urlCategoryRaw) && urlCategoryRaw.length > 0) {
        const picked = [];
        for (const raw of urlCategoryRaw) {
            const parts = String(raw || "").split(",").map((p) => p.trim()).filter(Boolean);
            for (const p of parts) {
                const n = normalizeCategory(p);
                if (n && n !== "all" && !picked.includes(n)) picked.push(n);
            }
        }
        filterState.categories = picked;
    }
    if (urlPrivateBookingAllowed === "true" || urlPrivateBookingAllowed === "1") {
        filterState.privateBookingOnly = true;
        if (elPrivateBookingOnly) elPrivateBookingOnly.checked = true;
    }
    if (urlVerified === "true" || urlVerified === "1" || urlVerified === "yes") {
        filterState.verifiedOnly = true;
        if (elVerifiedOnly) elVerifiedOnly.checked = true;
    }

    // Phase 7 hydration, read all 17 remaining filter dimensions from URL so deep links work.
    const urlBoolTrue = (v) => { const s = String(v || "").trim().toLowerCase(); return s === "true" || s === "1" || s === "yes"; };
    const urlMulti = (key) => {
        const out = [];
        const all = urlParams.getAll(key);
        for (const raw of all) {
            String(raw || "").split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => {
                if (!out.includes(p)) out.push(p);
            });
        }
        return out;
    };

    const urlCity = String(urlParams.get("city") || "").trim();
    if (urlCity) filterState.location = urlCity;

    const urlSuburb = String(urlParams.get("suburb") || "").trim();
    if (urlSuburb) filterState.suburb = urlSuburb;

    const urlDate = String(urlParams.get("date") || "").trim();
    if (urlDate) {
        filterState.date = urlDate;
        // Owner 2026-05-30 (date-picker rollout R3): seed the brand picker(s)
        // so the visible alt-input chip reflects the URL-hydrated date too.
        // Pre-Flatpickr, the native <input type="date"> would have shown the
        // raw URL value when the .value was assigned elsewhere — with Flatpickr
        // we have to set it explicitly via the picker API.
        var __urlHeroDateEl   = document.getElementById("date-input");
        var __urlFilterDateEl = document.getElementById("filter-date-input");
        if (__urlHeroDateEl && __urlHeroDateEl._flatpickr) {
            try { __urlHeroDateEl._flatpickr.setDate(urlDate, false); } catch (_e) { void _e; }
        }
        if (__urlFilterDateEl && __urlFilterDateEl._flatpickr) {
            try { __urlFilterDateEl._flatpickr.setDate(urlDate, false); } catch (_e) { void _e; }
        }
    }

    const urlGuests = String(urlParams.get("guests") || "").trim();
    if (urlGuests) filterState.guests = urlGuests;

    const urlDistance = String(urlParams.get("distanceKm") || "").trim();
    if (urlDistance) filterState.distanceKm = urlDistance;

    const urlSort = String(urlParams.get("sort") || "").trim();
    if (urlSort) {
        filterState.sort = urlSort;
        if (elSort) elSort.value = urlSort;
    }

    const urlMinPrice = Number(urlParams.get("minPrice"));
    if (Number.isFinite(urlMinPrice) && urlMinPrice >= 0) filterState.minPrice = urlMinPrice;

    const urlMaxPrice = Number(urlParams.get("maxPrice"));
    if (Number.isFinite(urlMaxPrice) && urlMaxPrice > 0) filterState.maxPrice = urlMaxPrice;

    const urlVibe = urlMulti("vibe");
    if (urlVibe.length) filterState.vibe = urlVibe;

    const urlDietary = urlMulti("dietary");
    if (urlDietary.length) filterState.dietary = urlDietary;

    const urlAccessibility = urlMulti("accessibility");
    if (urlAccessibility.length) filterState.accessibility = urlAccessibility;

    const urlCuisine = urlMulti("cuisine");
    if (urlCuisine.length) filterState.cuisine = urlCuisine;

    const urlLanguages = urlMulti("languages");
    if (urlLanguages.length) filterState.languages = urlLanguages;

    const urlOccasion = urlMulti("occasion");
    if (urlOccasion.length) filterState.occasion = urlOccasion;

    const urlDaysOfWeek = urlMulti("daysOfWeek");
    if (urlDaysOfWeek.length) filterState.daysOfWeek = urlDaysOfWeek;

    const urlTimeOfDay = urlMulti("timeOfDay");
    if (urlTimeOfDay.length) filterState.timeOfDay = urlTimeOfDay;

    // Smart facet-driven chips: render AFTER URL params so pre-selected
    // values from the link are reflected as selected chips. Async,
    // progressive-enhancement — hardcoded chips work until this resolves.
    renderDynamicFilterChips();

    const urlDuration = String(urlParams.get("duration") || "").trim();
    if (urlDuration) filterState.duration = urlDuration;

    const urlMinRating = String(urlParams.get("minRating") || "").trim();
    if (urlMinRating) filterState.minRating = urlMinRating;

    const urlMinReviewCount = String(urlParams.get("minReviewCount") || "").trim();
    if (urlMinReviewCount) filterState.minReviews = urlMinReviewCount;

    if (urlBoolTrue(urlParams.get("instantBook"))) filterState.instantBook = true;
    if (urlBoolTrue(urlParams.get("newHostsOnly"))) filterState.newHostsOnly = true;

    // ⛔ sir 2026-08-22 — THE WORST DEFECT IN THIS WHOLE SET, and it only appears if you ARRIVE on
    // a link and then open the drawer. Found at tablet width while sweeping viewport sizes.
    //
    // Five dimensions were hydrated into `filterState` from the URL above but NEVER written back
    // onto their controls: city, suburb, guests, instant-book and new-hosts. (search, date, sort,
    // verified and private-booking already did this — these five were simply missed.)
    //
    // On its own that reads as cosmetic; the results ARE filtered. The damage is what happens next:
    // `applyFilters()` rebuilds filterState from the HERO fields, and those were left empty, so
    // pressing "Show results" **destroyed the filters the guest arrived with**.
    //
    // PROVEN, CHANGING NOTHING IN BETWEEN: opened "?city=Melbourne&guests=600" → 1 result, badge 2,
    // every control blank → opened Filters → pressed "Show results" → URL became bare
    // "explore.html", both filters GONE. A guest follows a shared link, opens the drawer to refine
    // it, presses the only button in there, and loses everything.
    //
    // Writing the hydrated state back onto the controls fixes the display AND removes the trap:
    // applyFilters then reads populated fields and is correct for every entry path — typed in the
    // drawer, typed in the hero, or arrived by link. This is also the root cure for the
    // "URL filters are applied but not shown on the controls" gap recorded earlier this session.
    if (filterState.location) {
        if (elLocation) elLocation.value = filterState.location;
        var __hydCity = document.getElementById("filter-city");
        if (__hydCity) __hydCity.value = filterState.location;
    }
    if (filterState.suburb) {
        var __hydSuburb = document.getElementById("filter-suburb");
        if (__hydSuburb) __hydSuburb.value = filterState.suburb;
    }
    if (filterState.guests) {
        if (elGuests) elGuests.value = filterState.guests;
        var __hydGuests = document.getElementById("filter-guests-input");
        if (__hydGuests) __hydGuests.value = filterState.guests;
    }
    if (filterState.instantBook) {
        var __hydInstant = document.getElementById("instant-book-toggle");
        if (__hydInstant) __hydInstant.checked = true;
    }
    if (filterState.newHostsOnly) {
        var __hydNewHosts = document.getElementById("modal-new-hosts");
        if (__hydNewHosts) __hydNewHosts.checked = true;
    }
    // Date needs nothing here — both pickers are seeded via setDate() in the urlDate block above.

    syncCategoryChips();

    window.TSTS_DEALS_UI_MODE = (String(urlFilter || "").trim().toLowerCase() === "deals");

    // === INITIALIZE SLIDER ===
    if (elPriceSlider && typeof noUiSlider !== 'undefined') {
        noUiSlider.create(elPriceSlider, {
            // sir 2026-08-22 ("every ---- filter with every ---- posibility ... in
            // combination and permutation") — found by ARRIVING on a link, not by clicking.
            // This used to start at [0, PRICE_SLIDER_MAX] unconditionally. noUiSlider fires its
            // 'update' event the moment it is created, and that handler writes filterState.minPrice
            // and .maxPrice — so it OVERWROTE the values hydrated from the URL a few lines above
            // (:867-871), and syncUrlFromState then rewrote the address bar without them.
            // PROVEN: opened "…&maxPrice=300" → the URL came back as
            // "?city=Melbourne&suburb=Carlton&guests=4&category=food-gatherings&vibe=lively&minRating=4&instantBook=true"
            // — maxPrice GONE, slider back at [0,500], labels back to A$0 / A$500+, no price pill —
            // while all SEVEN other filters in that same link survived. So every shared link,
            // bookmark and back-button return silently dropped its price range, and ONLY its price.
            // Starting from the hydrated state makes that first 'update' write the same numbers
            // back instead of clobbering them. With no price in the URL these are still 0 and
            // PRICE_SLIDER_MAX, so the default behaviour is unchanged.
            start: [filterState.minPrice, filterState.maxPrice],
            connect: true,
            range: { 'min': 0, 'max': PRICE_SLIDER_MAX },
            step: 10,
            tooltips: false
        });

        elPriceSlider.noUiSlider.on('update', function (values) {
            filterState.minPrice = Math.round(values[0]);
            filterState.maxPrice = Math.round(values[1]);
            // A$, like the cards these filters sit beside ("From A$75"). A bare $ next to them
            // read as a different currency on the same screen. The "+" is only true at the top
            // of the range — below it the number is exact, not "and above".
            if (elPriceMinLabel) elPriceMinLabel.textContent = `A$${filterState.minPrice}`;
            if (elPriceMaxLabel) elPriceMaxLabel.textContent = `A$${filterState.maxPrice}` + (filterState.maxPrice >= PRICE_SLIDER_MAX ? "+" : "");
            // sir 2026-08-22 ("every ---- filter with every ---- posibility must be tested
            // end to end"): the price slider was the ONLY control in the drawer that never
            // refreshed the filter count. Every chip, checkbox and field calls refreshFilterUi()
            // so the badge and the "Clear all" affordance answer live — moving this slider left
            // the badge reading 0 while a price filter was genuinely set, so a guest had no way to
            // tell it had taken until they pressed Show results.
            // PROVEN: one ArrowLeft on the upper handle → labels correctly read A$0 / A$490 and
            // filterState.maxPrice was 490, yet the badge still said 0; it jumped to 1 only after
            // Show results. It now counts the moment the handle moves, like every other control.
            // Guarded because this 'update' event also fires during noUiSlider.create() above,
            // before refreshFilterUi is defined further down the closure.
            try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined during create(); ok */ }
        });
    }

    // === FILTER ACTIONS ===
    
    // 1. Build Query & Fetch
    const fetchExperiences = async () => {
        // UI Loading - DOM-safe
        experiencesGrid.textContent = "";
        experiencesGrid.classList.add("explore-loading");
        experiencesGrid.classList.remove("hidden");
        var spinnerWrap = window.tstsEl("div", { className: "col-span-full text-center py-12" }, [
            window.tstsEl("i", { className: "fas fa-spinner fa-spin text-3xl text-orange-500" })
        ]);
        experiencesGrid.appendChild(spinnerWrap);
        noResultsEl.classList.add("hidden");
        if (loadErrorEl) loadErrorEl.classList.add("hidden");
        updateActiveChips(); 
        syncUrlFromState();

        const params = new URLSearchParams();
        if (filterState.search) params.set("q", filterState.search);
        if (filterState.location) params.set("city", filterState.location);
        if (filterState.suburb) params.set("suburb", filterState.suburb);
        if (filterState.date) params.set("date", filterState.date);
        if (Array.isArray(filterState.categories) && filterState.categories.length > 0) {
            filterState.categories
                .map((c) => normalizeCategory(c))
                .filter((c) => c && c !== "all")
                .forEach((category) => params.append("category", category));
        }
        if (Array.isArray(filterState.modalCategories) && filterState.modalCategories.length > 0) {
            filterState.modalCategories.forEach((c) => params.append("category", String(c)));
        }
        if (filterState.sort) params.set("sort", filterState.sort);
        if (filterState.minPrice > 0) params.set("minPrice", filterState.minPrice);
        if (filterState.maxPrice < PRICE_SLIDER_MAX) params.set("maxPrice", filterState.maxPrice);
        if (filterState.guests) params.set("guests", filterState.guests);
        if (filterState.privateBookingOnly) params.set("privateBookingAllowed", "true");
        if (filterState.verifiedOnly) params.set("verified", "true");
        // Owner-approved 2026-05-02: full filter taxonomy wiring (was 9 params, now 22).
        if (Array.isArray(filterState.vibe)          && filterState.vibe.length          > 0) params.set("vibe",          filterState.vibe.join(","));
        if (Array.isArray(filterState.dietary)       && filterState.dietary.length       > 0) params.set("dietary",       filterState.dietary.join(","));
        if (Array.isArray(filterState.accessibility) && filterState.accessibility.length > 0) params.set("accessibility", filterState.accessibility.join(","));
        if (Array.isArray(filterState.cuisine)       && filterState.cuisine.length       > 0) params.set("cuisine",       filterState.cuisine.join(","));
        if (Array.isArray(filterState.languages)     && filterState.languages.length     > 0) params.set("languages",     filterState.languages.join(","));
        if (Array.isArray(filterState.occasion)      && filterState.occasion.length      > 0) params.set("occasion",      filterState.occasion.join(","));
        if (Array.isArray(filterState.daysOfWeek)    && filterState.daysOfWeek.length    > 0) params.set("daysOfWeek",    filterState.daysOfWeek.join(","));
        if (Array.isArray(filterState.timeOfDay)     && filterState.timeOfDay.length     > 0) params.set("timeOfDay",     filterState.timeOfDay.join(","));
        if (filterState.duration)                                                             params.set("duration",      String(filterState.duration));
        if (filterState.minRating)                                                            params.set("minRating",     String(filterState.minRating));
        if (filterState.minReviews)                                                           params.set("minReviewCount",String(filterState.minReviews));
        if (filterState.instantBook)                                                          params.set("instantBook",   "true");
        if (filterState.newHostsOnly)                                                         params.set("newHostsOnly",  "true");
        if (filterState.nearMeActive) {
            params.set("nearMe", "true");
            if (filterState.distanceKm) params.set("distanceKm", String(filterState.distanceKm));
            if (Number.isFinite(filterState.userLat)) params.set("lat", String(filterState.userLat));
            if (Number.isFinite(filterState.userLon)) params.set("lng", String(filterState.userLon));
        }

        try {
            const res = await window.authFetch(`/api/experiences?${params.toString()}`, { method: "GET" });
            if (!res.ok) {
                // The platform answers a refusal with a sentence of its own, and this page used
                // to throw it away unread and show "check your connection" for a sort value the
                // reader typed into their own address bar. Carry the sentence on the error so
                // the catch below can show it in place of the page's own line. The only refusal
                // this page can cause is a sort value that is not one of ours, and a reader who
                // typed it deserves to be told that rather than blamed for the network.
                const refusal = await res.json().catch(() => null);
                const refusalBody = (refusal && refusal.data) ? refusal.data : refusal;
                const refusalLine = String((refusalBody && refusalBody.message) || (refusal && refusal.message) || "").trim();
                const loadErr = new Error("API Error");
                if (refusalLine) loadErr.tstsSentence = refusalLine;
                // The sentence alone does not say whose fault it was. The platform fills a
                // sentence on EVERY refusal, its own failure included, so the refusal's own code
                // has to travel with it: only a value this page can put in the address bar earns
                // the heading that names the filter.
                loadErr.tstsCode = String((refusalBody && refusalBody.error) || (refusal && refusal.error) || "").trim();
                throw loadErr;
            }
            const data = await res.json().catch(() => null);
            const unwrapped = window.tstsUnwrap ? window.tstsUnwrap(data) : data;

            const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped && Array.isArray(unwrapped.experiences) ? unwrapped.experiences : []);
            const privateFiltered = filterState.privateBookingOnly ? list.filter(isPrivateBookingAvailable) : list;

            if (window.TSTS_DEALS_UI_MODE) {
                // Owner ruling 2026-08-02: Deals is not a separate island — it is Explore with the
                // deals lifted to the top and every other experience following (chips mark which
                // are deals). Never a near-empty page.
                const deals = privateFiltered.filter(tstsIsDeal);
                if (deals.length > 0) {
                    const rest = privateFiltered.filter(function (e) { return !tstsIsDeal(e); });
                    renderExperiences(deals.concat(rest));
                } else {
                    // No deals at all: subtle note, then the full catalogue people may like.
                    renderDealsEmptyFallback(privateFiltered);
                }
            } else {
                renderExperiences(privateFiltered);
            }
            // W7 STRAY-46: this page used to record its own copy of this step, and the route that
            // served the list records the same step itself (grep __trackEvent "explore:view"), so
            // every search was counted twice and the administrator's funnel read about double what
            // really happened. The platform's own record is the one that stays, which is the same
            // choice already made for the phone app.
            // Click-learning recorder (sir approved 2026-08-11): when a card is opened
            // FROM AN ACTIVE SEARCH, tell the platform which table these words led to.
            // Delegated on the grid (capture phase, bound once) so the shared card
            // renderer in common.js is never touched; the id comes from the card's own
            // experience link. keepalive lets the beacon survive the navigation.
            if (experiencesGrid && !experiencesGrid.__searchClickLearnBound) {
                experiencesGrid.__searchClickLearnBound = true;
                experiencesGrid.addEventListener("click", function (ev) {
                    try {
                        const q = String(filterState.search || "").trim();
                        if (!q) return;
                        let node = ev.target;
                        while (node && node !== experiencesGrid && !node.__tstsCardRoot) {
                            if (node.parentElement === experiencesGrid) break;
                            node = node.parentElement;
                        }
                        if (!node || node === experiencesGrid) return;
                        const a = node.querySelector('a[href*="experience.html?id="]');
                        const href = a ? a.getAttribute("href") : ((node.getAttribute && node.getAttribute("data-experience-id")) ? ("experience.html?id=" + node.getAttribute("data-experience-id")) : "");
                        const m = String(href || "").match(/experience\.html\?id=([a-fA-F0-9]{24})/);
                        if (!m) return;
                        // window.API_BASE is the platform's real base (common.js:1834);
                        // an earlier wrong global sent every beacon to the static server.
                        const API = String(window.API_BASE || "").replace(/\/$/, "");
                        fetch(API + "/api/analytics/track", {
                            method: "POST",
                            credentials: "include",
                            keepalive: true,
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ event: "search:click", category: "discovery", properties: { q: q, experienceId: m[1] }, platform: "web" })
                        }).catch(function () {});
                    } catch (_e) { void _e; }
                }, true);
            }
        } catch (err) {
            console.error("explore fetchExperiences failed:", err && err.message, err && err.stack);
            experiencesGrid.classList.remove("explore-loading");
            experiencesGrid.classList.add("hidden");
            noResultsEl.classList.add("hidden");
            experiencesGrid.textContent = "";
            if (loadErrorEl) {
                loadErrorEl.classList.remove("hidden");
                const loadErrorLine = loadErrorEl.querySelector("p");
                const loadErrorHeading = loadErrorEl.querySelector("h3");
                if (loadErrorLine) {
                    loadErrorLine.textContent = (err && err.tstsSentence)
                        ? err.tstsSentence
                        : "Check your connection, then try again.";
                }
                // The heading has to move with the sentence, and it has to move with the REASON.
                // "A little quiet on our end" is true when the network is down, true when the
                // platform itself failed, and true when a reader has simply tried too many times
                // in a row; it is false only when the platform refused a value the reader typed
                // into the address bar, where it blames us for their own input. So the heading
                // that names the filter is shown for exactly the two refusals this page can
                // cause, and every other answer keeps the page's own heading with the sentence
                // the platform sent. Restored every time, exactly like the line below it, so one
                // refusal never outlives itself.
                const readerTypedIt = (err && (err.tstsCode === "INVALID_SORT" || err.tstsCode === "INVALID_DATE"));
                if (loadErrorHeading) {
                    loadErrorHeading.textContent = readerTypedIt
                        ? "That filter isn't one of ours"
                        : "A little quiet on our end";
                }
            }
        }
    };

    const debouncedFetch = debounce(fetchExperiences, 500);

    // 2. Apply Filters
    const applyFilters = () => {
        if (elSearch) filterState.search = elSearch.value.trim();
        if (elLocation) filterState.location = elLocation.value.trim();
        if (elDate) filterState.date = elDate.value;
        if (elGuests) filterState.guests = elGuests.value;
        if (elSort) filterState.sort = elSort.value;
        if (elPrivateBookingOnly) filterState.privateBookingOnly = !!elPrivateBookingOnly.checked;
        if (elVerifiedOnly) filterState.verifiedOnly = !!elVerifiedOnly.checked;
        
        fetchExperiences();
        if (elFilterPanel && !elFilterPanel.classList.contains("hidden")) {
            setFilterPanelOpen(false);
        }
    };

    // 3. Clear Filters
    const clearFilters = () => {
        // Reset State, original dimensions
        filterState.search = "";
        filterState.location = "";
        filterState.date = "";
        filterState.guests = "";
        filterState.categories = [];
        filterState.sort = "";
        filterState.privateBookingOnly = false;
        filterState.verifiedOnly = false;
        filterState.minPrice = 0;
        filterState.maxPrice = PRICE_SLIDER_MAX;
        // Owner-approved 2026-05-02: full mobile-parity dimensions also reset.
        filterState.nearMeActive = false;
        filterState.userLat = null;
        filterState.userLon = null;
        filterState.vibe          = [];
        filterState.dietary       = [];
        filterState.accessibility = [];
        filterState.newHostsOnly  = false;
        filterState.cuisine       = [];
        filterState.languages     = [];
        filterState.occasion      = [];
        filterState.daysOfWeek    = [];
        filterState.timeOfDay     = [];
        filterState.duration      = "";
        filterState.minRating     = "";
        filterState.minReviews    = "";
        filterState.instantBook   = false;
        filterState.suburb        = "";
        filterState.city          = "";
        filterState.distanceKm    = "25";
        filterState.modalCategories = [];

        // Reset DOM, original
        if (elSearch) elSearch.value = "";
        if (elLocation) elLocation.value = "";
        if (elDate) {
            elDate.value = "";
            // Owner 2026-05-30 (date-picker rollout R3): also clear the brand
            // picker so the visible alt-input chip resets in lockstep.
            if (elDate._flatpickr && typeof elDate._flatpickr.clear === "function") {
                try { elDate._flatpickr.clear(false); } catch (_e) { void _e; }
            }
        }
        if (elGuests) elGuests.value = "";
        if (elSort) elSort.value = "";
        if (elPrivateBookingOnly) elPrivateBookingOnly.checked = false;
        if (elVerifiedOnly) elVerifiedOnly.checked = false;

        // Reset DOM, modal-parity dimensions.
        const _modalSuburb = document.getElementById("filter-suburb");
        if (_modalSuburb) _modalSuburb.value = "";
        const _modalCity = document.getElementById("filter-city");
        if (_modalCity) _modalCity.value = "";
        const _modalDate = document.getElementById("filter-date-input");
        if (_modalDate) {
            _modalDate.value = "";
            // Owner 2026-05-30 (date-picker rollout R3): also clear the brand
            // picker so the visible alt-input chip resets in lockstep.
            if (_modalDate._flatpickr && typeof _modalDate._flatpickr.clear === "function") {
                try { _modalDate._flatpickr.clear(false); } catch (_e) { void _e; }
            }
        }
        const _modalGuests = document.getElementById("filter-guests-input");
        if (_modalGuests) _modalGuests.value = "";
        const _modalPrivate = document.getElementById("modal-private-booking");
        if (_modalPrivate) _modalPrivate.checked = false;
        const _modalNewHosts = document.getElementById("modal-new-hosts");
        if (_modalNewHosts) _modalNewHosts.checked = false;
        const _modalNearMe = document.getElementById("filter-near-me");
        if (_modalNearMe) _modalNearMe.checked = false;
        const _modalInstant = document.getElementById("instant-book-toggle");
        if (_modalInstant) _modalInstant.checked = false;
        // Reset all chip selected styling across every chip group.
        document.querySelectorAll(
            ".modal-cat-chip, .vibe-chip, .dietary-chip, .accessibility-chip, .dow-chip, .tod-chip, .duration-chip, .cuisine-chip, .occasion-chip, .language-chip, .min-rating-chip, .min-reviews-chip, .distance-chip"
        ).forEach(function(btn) {
            setChipSelected(btn, false);
        });
        // Hide distance-chips wrap when nearMe off.
        try { window.tstsSyncDistanceChips && window.tstsSyncDistanceChips(); } catch (_dErr) { /* sync helper not yet bound */ }

        if (elPriceSlider && elPriceSlider.noUiSlider) elPriceSlider.noUiSlider.set([0, PRICE_SLIDER_MAX]);

        // Reset Category Chips (top chip row, separate from modal Type group)
        syncCategoryChips();

        syncUrlFromState();
        try { refreshFilterUi(); } catch (_uiErr) { /* not yet defined; ok */ }

        fetchExperiences();
    };

    // === DEALS EMPTY FALLBACK ===
    function renderDealsEmptyFallback(allExperiences) {
        const El = window.tstsEl;
        experiencesGrid.classList.remove("explore-loading");
        experiencesGrid.textContent = "";
        experiencesGrid.classList.remove("hidden");
        noResultsEl.classList.add("hidden");
        if (loadErrorEl) loadErrorEl.classList.add("hidden");

        // Banner: no deals right now
        var banner = El("div", { className: "col-span-full text-center py-8 mb-2" }, [
            El("div", { className: "w-14 h-14 mx-auto mb-3 rounded-full bg-orange-50 flex items-center justify-center text-orange-600" }, [
                El("i", { className: "fas fa-tag text-xl" })
            ]),
            // Owner 2026-08-02 (sir's Deals ruling): the empty state must SAY it's about deals — a guest
            // who clicked "Deals" was getting a generic "nothing here" over the full catalogue with no
            // explanation of what they were looking at.
            El("h3", { className: "text-lg font-bold text-gray-900 mb-1", textContent: "No deals running right now." }),
            El("p", { className: "text-sm text-gray-500", textContent: "Hosts drop special prices from time to time. Meanwhile, here are more experiences you may like." })
        ]);
        experiencesGrid.appendChild(banner);

        // Render all experiences below the banner
        if (allExperiences && allExperiences.length > 0) {
            renderExperienceCards(allExperiences);
        }
    }

    // === RENDER LOGIC ===

    // Cloudinary CDN optimization: resize to exact display dimensions, auto-format (WebP), auto-quality
    function cloudinaryCardImg(url, w, h) {
        if (!url || url.indexOf('res.cloudinary.com') === -1) return url;
        return url.replace('/upload/', '/upload/c_fill,w_' + w + ',h_' + h + ',f_auto,q_auto/');
    }

    const renderExperienceCards = (experiences) => {
        // W1 (web parity): enrich with _distanceKm if user location known.
        // When Near me is active, also filter to within 25km + sort by distance.
        if (filterState.userLat != null && filterState.userLon != null) {
            experiences = enrichWithDistance(experiences);
            if (filterState.nearMeActive) {
                experiences = experiences
                    .filter(function(e) { return typeof e._distanceKm === "number" && e._distanceKm <= 25; })
                    .sort(function(a, b) { return (a._distanceKm || 999) - (b._distanceKm || 999); });
            }
        }
        // Vibe / Dietary / Accessibility filtering happens server-side via Mongo $in
        // on dedicated fields. The earlier client-side matchTagAny pass read the wrong
        // field (exp.tags) and double-filtered to an empty list, removed 2026-05-02.
        if (filterState.newHostsOnly) {
            const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
            experiences = experiences.filter(function(e) {
                if (!e.hostCreatedAt) return false;
                const ts = new Date(e.hostCreatedAt).getTime();
                if (!isFinite(ts)) return false;
                return Date.now() - ts < ninetyDaysMs;
            });
        }

        const El = window.tstsEl;
        const safeUrl = window.tstsSafeUrl;
        const fallbackImg = "/assets/experience-default.jpg";
        const fallbackHostPic = "/assets/avatar-default.svg";
        const preventCardNav = (node) => {
            if (!node || typeof node.setAttribute !== "function") return node;
            node.setAttribute("data-no-card-nav", "true");
            node.addEventListener("click", function(ev) {
                if (!ev) return;
                ev.preventDefault();
                ev.stopPropagation();
            });
            return node;
        };

        experiences.forEach(function(exp, idx) {
            const imgUrl = cloudinaryCardImg(safeUrl(exp.imageUrl || (exp.images && exp.images[0]), fallbackImg), 400, 192);
            const rawPrice = exp.price || 0;
            const price = typeof rawPrice === 'string' ? Number(String(rawPrice).replace(/[^0-9.]/g, '')) || 0 : Number(rawPrice) || 0;
            const hostPicUrl = cloudinaryCardImg(safeUrl(exp.hostPic, fallbackHostPic), 24, 24);
            const privateAvailable = isPrivateBookingAvailable(exp);
            const verifiedState = normalizedVerifiedStatus(exp);
            const title = publicExperienceTitle(exp);
            const teaser = cardTeaser(exp);
            const duration = String(exp.duration || "").trim();
            const groupCap = Number(exp.maxGuests || exp.capacity || 0);
            const groupLabel = (Number.isFinite(groupCap) && groupCap > 0) ? ("Up to " + String(groupCap) + " guests") : "Small group";
            const hostId = normalizeHostId(exp);

            var imgAttrs = { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500", width: 400, height: 192 };
            if (idx === 0) { imgAttrs.fetchPriority = "high"; } else { imgAttrs.loading = "lazy"; }
            var imgEl = El("img", imgAttrs);
            window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

            // W3 (web parity): host avatar, Spotify pattern. Photo when present,
            // else 2-letter initials (e.g. 'AB') in white on warm-orange circle
            // with 1px ivory ring. Matches mobile.
            var hostInitials = (function() {
                const trimmed = String(exp.hostName || "").trim();
                if (!trimmed) return "";
                const parts = trimmed.split(/\s+/).filter(Boolean);
                if (parts.length === 0) return "";
                if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
                return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
            })();
            var hasHostPic = exp.hostPic && String(exp.hostPic).trim() !== "" && !looksLikeEmailName(String(exp.hostPic));
            var hostImgEl;
            if (hasHostPic) {
                hostImgEl = El("img", { className: "w-6 h-6 rounded-full border border-orange-50", loading: "lazy", width: 24, height: 24 });
                window.tstsSafeImg(hostImgEl, hostPicUrl, fallbackHostPic);
            } else if (hostInitials) {
                hostImgEl = El("div", {
                    className: "w-6 h-6 rounded-full bg-orange-600 border border-orange-50 flex items-center justify-center text-white text-[11px] font-semibold leading-none",
                    "aria-hidden": "true"
                }, [El("span", { textContent: hostInitials })]);
            } else {
                hostImgEl = El("div", {
                    className: "w-6 h-6 rounded-full bg-orange-300 border border-orange-50 flex items-center justify-center text-white text-[11px] leading-none",
                    "aria-hidden": "true"
                }, [El("i", { className: "fas fa-user text-[10px]" })]);
            }

            // W3 (web parity, owner-flagged 2026-05-01): Heart icon top-LEFT
            // mirrors mobile bookmark heart. White circle with outline heart
            // by default; filled red when bookmarked. Auth-gated: tap routes
            // to login if unauthenticated.
            // Heart button, owner-approved 2026-05-02. Outlined ♡ when not liked,
            // filled ♥ in brand orange when liked. Tooltip "Like"/"Liked" via title.
            // Click triggers the tsts-heart-pop scale animation (0.42s) and toggles
            // bookmark in backend (window.tstsToggleBookmark persists).
            // Heart button, owner-spec 2026-05-02. NO white circle. Thick dark
            // outlined heart floats directly on the photo. When liked, the heart
            // is filled and stroked in brand orange.
            var heartIcon = El("i", {
                className: exp.isBookmarked
                    ? "fas fa-heart tsts-heart-photo-liked text-xl"
                    : "fas fa-heart tsts-heart-photo text-xl"
            });
            var heartBtn = preventCardNav(El("button", {
                type: "button",
                className: "absolute top-3 left-3 w-9 h-9 flex items-center justify-center transition hover:scale-110 rounded-full tsts-glass-circle tsts-glass-faint p-0",
                "aria-label": exp.isBookmarked ? "Liked" : "Like",
                "aria-pressed": exp.isBookmarked ? "true" : "false",
                title: exp.isBookmarked ? "Liked" : "Like",
                "data-tooltip": exp.isBookmarked ? "Liked" : "Like",
                "data-tooltip-pos": "below"
            }, [heartIcon]));
            // Pop animation runs on the BUTTON (works for both cutout and filled
            // states, there isn't always an inner icon when in cutout mode).
            heartBtn.addEventListener("click", function() {
                heartBtn.classList.remove("tsts-heart-pop");
                void heartBtn.offsetWidth;
                heartBtn.classList.add("tsts-heart-pop");
                heartBtn.addEventListener("animationend", function clearPop() {
                    heartBtn.classList.remove("tsts-heart-pop");
                    heartBtn.removeEventListener("animationend", clearPop);
                }, { once: true });
                if (window.tstsToggleBookmark) window.tstsToggleBookmark(exp._id || exp.id, heartBtn);
            });

            // Owner-approved 2026-05-03: private-booking experiences get a tiny
            // "By request" sub-label under the price tag (top-right of photo).
            // Single visual pill, keeps 4-corner balance, signals approval-required
            // path before the user clicks through to booking.
            // sir's orders O-146 and O-147, 2026-09-16, recorded in DOCS/OWNER_ORDERS_MASTER.md. O-146 in
            // sir's own words: "anything draft is just put a preview and nroever for booking to se the
            // interest of people". O-147 is sir's answer on the preview gate, and its record is the
            // authority for a preview being seen on Explore and never bookable. A preview is a draft the
            // host has chosen to show; it has no price to advertise, so the pill that normally carries
            // the price carries the label instead.
            // One pill, same corner, same shape: the card's four-corner balance is untouched.
            var __isPreviewCard = (exp && exp.previewEnabled === true);
            var __priceText = (function() {
              if (__isPreviewCard) return "Coming soon";
              const code = String(exp.currency || "AUD").toUpperCase();
              // Owner-spec 2026-05-03: world-class price-pill format, every currency
              // gets an unambiguous country-prefixed symbol so internationals can't
              // mistake AUD for USD. AUD→A$, NZD→NZ$, CAD→CA$ require formatting via
              // en-US locale (en-AU strips the prefix because locals are assumed to
              // know the local currency). INR/GBP/EUR/USD/JPY symbols are already
              // unambiguous so en-US works for everything.
              // Owner-approved 2026-06-03: a PRIVATE-only listing shows the whole-table
              // TOTAL ("A$500 · whole table") — its real price — not a per-person figure
              // (a single seat can't be booked). Shared / both keep "From A$X / person".
              const __isPrivateOnly = String(exp.bookingMode || "shared").trim().toLowerCase() === "private";
              const __amt = __isPrivateOnly ? (Number(exp.privatePrice) || 0) : price;
              const __fmt = function (n) {
                try {
                  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: (n % 1 === 0 ? 0 : 2), maximumFractionDigits: (n % 1 === 0 ? 0 : 2), currencyDisplay: "symbol" }).format(n);
                } catch (_) {
                  // The comment above promises "every currency gets an unambiguous country-prefixed
                  // symbol" — this fallback broke that promise, printing a bare "$" for all ten.
                  const __sym = EXPLORE_CCY_SYMBOL[code.toLowerCase()] || (code + " ");
                  return __sym + Number(n).toFixed(2);
                }
              };
              if (__isPrivateOnly) return __fmt(__amt) + " · whole table";
              return "From " + __fmt(__amt) + " / person";
            })();
            var __priceChildren = [El("div", { className: "leading-tight", textContent: __priceText })];
            // Owner 2026-05-25: the booking-mode label (Private only / Shared / Shared or
            // private) moved OFF the price tag to the reco-chip row (right-aligned), so all
            // three modes are captured there. Price tag now shows price only.
            var __priceTag = El("div", {
              className: __isPreviewCard
                ? "absolute top-3 right-3 bg-amber-50/95 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm text-right text-amber-800"
                : "absolute top-3 right-3 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm text-right"
            }, __priceChildren);
            if (__isPreviewCard) __priceTag.setAttribute("aria-label", "Coming soon, not open for bookings yet");
            var imageContainer = El("div", { className: "relative h-48 w-full overflow-hidden bg-gray-100" }, [
                imgEl,
                heartBtn,
                __priceTag
            ]);
            // "Private booking" badge, moved off hero to clean up the 4-corner
            // balance (heart top-L, price top-R, trust bottom-L, ⋯ bottom-R).
            // Will surface in body row instead (W3 parity with mobile).
            // (Moved to bottom-left as 'New listing' / 'Verified' / 'Verification pending'
            //  trust badge below, see W3 parity block. Top-left now has heart only.)

            // sir 2026-08-22 ("every ---- filter with every ---- posibility ... end to end"):
            // found because a REAL CLICK on the Like heart could not land — Playwright reported
            // `<div class="absolute inset-0 bg-black/40"> intercepts pointer events`.
            // BOTH scrims below are `absolute inset-0` and are appended to imageContainer AFTER the
            // heart but BEFORE the share button, so they paint over the heart and swallow its
            // clicks — while the share button, appended later, still works.
            // MEASURED on the live page: on the "Not yet open for booking" card the heart is
            // `reachable: false, blockedBy: "absolute inset-0 bg-black/40"`, while share is
            // `reachable: true`. On the five cards without a scrim both are reachable.
            // THAT INCONSISTENCY IS THE TELL — a listing you may SHARE but cannot SAVE is not a
            // decision, it is DOM order. And saving is the action that matters most on something
            // not yet bookable: "tell me when this opens" is exactly what the heart is for.
            // `pointer-events-none` makes each scrim purely informational. The card's own click
            // handler is unaffected — it lives on the card root, so a click landing on the image
            // still bubbles up and still opens the experience.
            if (exp.isPaused) {
                imageContainer.appendChild(El("div", { className: "absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold pointer-events-none", textContent: "Paused" }));
            }

            // Owner 2026-07-23 (sir): a shortfall listing that is approved but not yet
            // host-confirmed + Stage-A-funded is visible but NOT bookable. Show a clear
            // "Not yet open for booking" scrim (Coming soon) so guests see it building
            // without a dead Book path. bookingOpen is set server-side; the detail page
            // and booking POST enforce the real gate.
            if (exp.bookingOpen === false && !exp.isPaused) {
                imageContainer.appendChild(El("div", { className: "absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none" }, [
                    El("div", { className: "inline-flex items-center gap-1 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold shadow-sm text-tsts-ink" }, [
                        El("i", { className: "fas fa-clock" }),
                        El("span", { textContent: String(exp.bookingClosedReason || "Not yet open for booking") })
                    ])
                ]));
            }

            // Owner-approved 2026-05-02: card bottom-right is a Share-only circle button.
            // The previous ⋯ menu (Save/Share/Hide/Report) was dropped, Save is the heart
            // top-left, Report lives inside the experience detail view, Hide is not built.
            // Share button, owner-spec 2026-05-02. NO white circle. Thick dark
            // outlined share icon floats directly on the photo.
            var shareBtn = preventCardNav(El("button", {
                type: "button",
                className: "absolute bottom-3 right-3 w-9 h-9 flex items-center justify-center transition hover:scale-110 rounded-full tsts-glass-circle tsts-glass-faint p-0",
                "aria-label": "Share this experience",
                title: "Share",
                "data-tooltip": "Share"
            }, [
                El("i", { className: "fas fa-share-nodes tsts-icon-photo text-xl" })
            ]));
            shareBtn.addEventListener("click", function(ev) {
                ev.stopPropagation();
                if (window.tstsShareExperience) {
                    window.tstsShareExperience({
                        title: exp.title || "",
                        text: exp.description || "",
                        experienceId: String(exp._id || exp.id || ""),
                    });
                }
            });
            imageContainer.appendChild(shareBtn);

            // Owner rule (2026-05-01 14:00): trust badge bottom-LEFT shows ONLY
            // for verified experiences. Pending / new / unverified → render
            // NOTHING (no clutter, no doubt).
            if (verifiedState === "verified") {
                var trustBadge = preventCardNav(El("div", {
                    className: "absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm bg-blue-600/95 text-white"
                }, [
                    El("i", { className: "fas fa-shield-halved text-[10px]" }),
                    El("span", { textContent: " Verified" })
                ]));
                imageContainer.appendChild(trustBadge);
            }

            // Factories, DOM nodes can only have one parent. The previous code
            // shared a single markerIcon/starIcon node across two appendChild calls,
            // which silently moved the node out of the visible location row into a
            // hidden legacy block. Use factories so each consumer gets its own node.
            var makeMarkerIcon = function() { return El("i", { className: "fas fa-map-marker-alt text-orange-500" }); };
            var makeStarIcon = function() { return El("i", { className: "fas fa-star" }); };
            var markerIcon = makeMarkerIcon();
            var starIcon = makeStarIcon();
            var hostDisplayName = String(exp.hostName || "").trim();
            if (!hostDisplayName || looksLikeEmailName(hostDisplayName)) {
                hostDisplayName = (verifiedState === "verified") ? "Verified Host" : "Host";
            }

            const expHref = "experience.html?id=" + encodeURIComponent(exp._id || "");
            // Owner rule (2026-05-01): host pill shows ONLY for verified hosts.
            // Otherwise → render NOTHING.
            var hostMetaChildren = [
                hostImgEl,
                El("span", { className: "text-xs text-gray-500 truncate", textContent: hostDisplayName })
            ];
            if (exp.hostVerified) {
                hostMetaChildren.push(El("i", {
                    className: "fas fa-shield-halved text-blue-600 text-[11px] ml-1",
                    title: "Verified host",
                    "aria-label": "Verified host"
                }));
            }
            var hostMeta = El("div", { className: "inline-flex items-center gap-2 mb-1 flex-wrap" }, hostMetaChildren);
            if (hostId) {
                hostMeta = El("a", {
                    href: "public-profile.html?id=" + encodeURIComponent(hostId),
                    className: "inline-flex items-center gap-2 mb-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 flex-wrap",
                    "data-no-card-nav": "true"
                }, [
                    hostImgEl,
                    El("span", { className: "text-xs text-gray-500 truncate hover:text-orange-600 transition", textContent: hostDisplayName }),
                    ...(exp.hostVerified ? [El("i", {
                        className: "fas fa-shield-halved text-blue-600 text-[11px] ml-1",
                        title: "Verified host",
                        "aria-label": "Verified host"
                    })] : [])
                ]);
                hostMeta.addEventListener("click", function(ev) {
                    if (!ev) return;
                    ev.stopPropagation();
                });
            }

            var card = El("div", {
                className: "group block bg-white rounded-3xl shadow-soft-card hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col cursor-pointer",
                role: "link",
                tabindex: "0",
                "aria-label": "Open " + title
            }, [
                imageContainer,
                El("div", { className: "p-4 flex flex-col gap-1 flex-grow" }, [
                    // Owner-spec 2026-05-02, body order:
                    // 1. Signal row (above title) — ONE row, constant height, so every card
                    //    body starts on the same line (owner-spec 2026-05-25). LEFT: the
                    //    single "why recommended" chip. RIGHT: terse deal tag — owner-approved
                    //    2026-08-02 (sir, "Final — implement all"): "% off" only, right slot
                    //    of the reco row, curiosity copy; the detail page carries the full
                    //    terms. The left chip ellipsizes when space runs out (guard proven
                    //    live at 3-col width with the longest affinity label); the deal tag
                    //    never gives way — an offer must not be cut.
                    (function() {
                        // Deal tag (right slot). Reads the same enabled tier shapes the
                        // pricing kernel honours; percents compare CAPPED (50 max) so the
                        // shown number is always the number checkout gives; equal capped
                        // percents keep the LOWEST minGuests. Falls back to the direct
                        // discountPercent fields so a real number never degrades to a
                        // vague label.
                        var dealTag = null;
                        if (tstsIsDeal(exp)) {
                            var dd = (exp.dynamicDiscounts && typeof exp.dynamicDiscounts === "object") ? exp.dynamicDiscounts : {};
                            var group = (dd.group && typeof dd.group === "object") ? dd.group : {};
                            var best = { pct: 0, min: 0 };
                            [group.host, group.admin].forEach(function (cfg) {
                                if (!cfg || cfg.enabled !== true) return;
                                var tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
                                tiers.forEach(function (t) {
                                    var p = Math.min(50, Number(t && t.percent) || 0);
                                    var m = Number(t && t.minGuests) || 0;
                                    if (p > best.pct || (p > 0 && p === best.pct && m < best.min)) best = { pct: p, min: m };
                                });
                            });
                            if (best.pct <= 0) {
                                var direct = Math.min(50, Number(exp.discountPercent || exp.discount) || 0);
                                if (direct > 0) best.pct = direct;
                            }
                            var tagLabel = best.pct > 0 ? (best.pct + "% off") : "Special price";
                            dealTag = El("div", {
                                className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ml-auto flex-none whitespace-nowrap bg-orange-50 text-orange-800",
                                "aria-label": best.pct > 0 ? ("Deal: " + best.pct + "% off") : "Deal: special price"
                            }, [
                                El("i", { className: "fas fa-tag text-orange-600 text-[9px]", "aria-hidden": "true" }),
                                El("span", { textContent: " " + tagLabel })
                            ]);
                        }
                        // Owner-spec 2026-05-25 (EXPERIMENT MODE): the reco chip is the
                        // "why recommended" explanation. Requirements:
                        //  (a) ALWAYS render so every card body starts on the same line
                        //      (row alignment — closes GAP-1);
                        //  (b) carry NO suburb — the location row already shows it. Each reason
                        //      TYPE renders a FIXED de-located label, so the " in <suburb>" the
                        //      server appends is inherently dropped (closes GAP-2/3);
                        //  (c) carry NO numeric rating — the trust row already shows it; the
                        //      rating reason becomes the traveller-themed "Loved by travellers"
                        //      (sir: theme-based platform, not a generic marketplace);
                        //  (d) each TYPE gets its own icon + warm-palette colour so signals are
                        //      scannable at a glance (sir: "style each chip"). Colours are limited
                        //      to those compiled in tailwind.css — amber/orange/emerald/red ONLY
                        //      (rose/stone/teal are NOT compiled and would render unstyled), and
                        //      every icon is one already shipped elsewhere on the site.
                        // NOTE: priority/order of WHICH reason wins is decided server-side in
                        // __deriveRecommendedReason (the cascade). This block only styles the
                        // single winning reason; it does not re-rank.
                        const raw = String(exp.recommendedReason || "").trim();
                        if (!raw && !dealTag) return null;
                        var recoChip = null;
                        if (raw) {
                        let icon, chipCls, iconCls, label;
                        if (/★/.test(raw)) {                        // rating reason -> traveller social proof
                            icon = "fa-heart"; chipCls = "bg-red-50 text-red-700"; iconCls = "text-red-500";
                            label = "Loved by travellers";
                        } else if (/^(because you love|for you|for your)/i.test(raw)) {  // personalised affinity (warm user)
                            // Affinity copy is dynamic (names the cuisine/vibe/occasion the
                            // user loves, from the SAME profile the sort ranks by) and already
                            // de-located — render it verbatim.
                            icon = "fa-sparkles"; chipCls = "bg-amber-50 text-amber-900"; iconCls = "text-amber-700";
                            label = raw;
                        } else if (/^popular/i.test(raw)) {         // crowd signal (top popularity pool)
                            icon = "fa-fire"; chipCls = "bg-orange-100 text-orange-800"; iconCls = "text-orange-600";
                            label = "A favourite table";
                        } else if (/^just listed/i.test(raw)) {     // newly listed (< 14 days)
                            icon = "fa-seedling"; chipCls = "bg-emerald-50 text-emerald-800"; iconCls = "text-emerald-600";
                            label = "Newly set table";
                        } else if (/^open this week/i.test(raw)) {  // near availability (urgency)
                            icon = "fa-calendar-check"; chipCls = "bg-amber-50 text-amber-900"; iconCls = "text-amber-700";
                            label = "A seat this week";
                        } else {                                    // catch-all ("Fresh in X" / "Discover...")
                            icon = "fa-compass"; chipCls = "bg-amber-50 text-amber-900"; iconCls = "text-amber-700";
                            label = "Worth discovering";
                        }
                        // Booking-mode moved OUT of this row (owner 2026-05-25): "Shared" is the
                        // common default and looked weird here. The private-booking PILL now lives
                        // in the capacity row (next to "only N seats"). min-w-0 + truncate span =
                        // the collision guard: the mood label gives way, never the deal tag.
                        recoChip = El("div", {
                            className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold min-w-0 " + chipCls
                        }, [
                            El("i", { className: "fas " + icon + " " + iconCls + " text-[9px] flex-none" }),
                            El("span", { className: "truncate", textContent: " " + label })
                        ]);
                        }
                        return El("div", { className: "flex items-center gap-2 mb-1.5" }, [recoChip, dealTag]);
                    })(),
                    // 2. Title
                    El("h3", { className: "font-bold text-gray-900 mb-1.5 line-clamp-2", textContent: title, title: title }),
                    // 3. Trust row: Host avatar + name + Verified host pill + Rating
                    El("div", { className: "flex items-center justify-between gap-2 mb-1.5 flex-wrap" }, [
                        hostMeta,
                        (function () {
                            if (!(Number(exp.reviewCount || 0) > 0)) return null;
                            var ratingKids = [
                                El("i", { className: "fas fa-star text-amber-500 text-[11px]" }),
                                El("span", { className: "font-bold text-gray-800", textContent: " " + (Number(exp.averageRating) || 0).toFixed(1) }),
                                El("span", { className: "text-gray-500", textContent: " (" + (Number(exp.reviewCount) || 0) + ")" })
                            ];
                            // Owner 2026-08-02 (sir): the rating is a door — click lands on the
                            // review section of this host's public profile. The whole-card click
                            // still opens the experience page; this link opts out of it.
                            if (!hostId) return El("span", { className: "inline-flex items-center gap-1 text-xs" }, ratingKids);
                            var ratingLink = El("a", {
                                href: "public-profile.html?id=" + encodeURIComponent(hostId) + "#reviews-container",
                                className: "inline-flex items-center gap-1 text-xs rounded-md hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                                "data-no-card-nav": "true",
                                "aria-label": "See reviews for this host"
                            }, ratingKids);
                            ratingLink.addEventListener("click", function (ev) { if (ev) ev.stopPropagation(); });
                            return ratingLink;
                        })()
                    ]),
                    // 3. Description preview, char-count truncate so "Read more" sits inline at the end.
                    (function() {
                        const fullDesc = String(exp.description || teaser || "").trim();
                        const MAX_CHARS = 110;
                        let display = fullDesc;
                        let truncated = false;
                        if (fullDesc.length > MAX_CHARS) {
                            display = fullDesc.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").replace(/[\s,.;:!?\u00b7-]+$/, "") + "… ";
                            truncated = true;
                        }
                        const children = [El("span", { textContent: display })];
                        if (truncated) {
                            const more = El("a", {
                                className: "text-orange-600 font-semibold hover:underline whitespace-nowrap",
                                "data-no-card-nav": "true"
                            });
                            more.href = expHref;
                            more.textContent = "Read more";
                            more.addEventListener("click", function(ev) { if (ev) ev.stopPropagation(); });
                            children.push(more);
                        }
                        return El("p", { className: "text-xs text-gray-700" }, children);
                    })(),
                    // 4a. Location row
                    // Owner-spec 2026-05-03: render `Suburb · City · STATE` so interstate
                    // listings (QLD vs VIC) are unambiguous. State is appended ONLY when
                    // the experience has a non-empty state field, legacy listings without
                    // state degrade gracefully to `Suburb · City` (the prior format).
                    // Owner 2026-05-25: leading icon in a fixed-width (w-4) column so the
                    // location / capacity rows' text aligns on one consistent left edge.
                    El("p", { className: "text-xs text-gray-700 flex items-center gap-1" }, [
                        El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [makeMarkerIcon()]),
                        El("span", { textContent: (function() {
                            const suburb = String(exp.suburb || "").trim();
                            const city = String(exp.city || "").trim();
                            const state = String(exp.state || "").trim().toUpperCase();
                            const parts = [];
                            if (suburb) parts.push(suburb);
                            if (city && city !== suburb) parts.push(city);
                            if (state) parts.push(state);
                            return parts.join(" · ");
                        })() })
                    ]),
                    // 4b. Duration + capacity row — GAP-5 (owner 2026-05-25): the single
                    //     clock icon was mislabelling the guest count (e.g. "🕐 for 8 guests"
                    //     read as duration). Split into TWO icon+text segments so each metric
                    //     carries its correct icon — clock for DURATION, people (fa-user-friends)
                    //     for CAPACITY — and each renders only when present.
                    (function() {
                        const segs = [];
                        const minutes = Number(exp.eventDurationMinutes || 0);
                        if (isFinite(minutes) && minutes > 0) {
                            let dur;
                            if (minutes === 60) dur = "1 hour";
                            else if (minutes % 60 === 0) dur = (minutes / 60) + " hours";
                            else if (minutes < 60) dur = minutes + " min";
                            else dur = (minutes / 60).toFixed(1).replace(/\.0$/, "") + " hours";
                            segs.push(El("span", { className: "inline-flex items-center gap-1" }, [
                                El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [El("i", { className: "far fa-clock text-gray-500" })]),
                                El("span", { textContent: dur })
                            ]));
                        }
                        // Owner 2026-05-25: show the REAL seats remaining for the next
                        // occurrence — "only N seats" (availableSeats from the server; no "of M").
                        // Private-only books the WHOLE table, so it reads "up to N guests" instead.
                        // The NUMBER is emphasised black + bold + underline (no colour). Falls back
                        // to capacity if the server didn't attach availableSeats.
                        const __capMode = String(exp.bookingMode || "shared").trim().toLowerCase();
                        const __cap = Number(exp.maxGuests || exp.capacity || 0);
                        const __seatIcon = function () {
                            return El("span", { className: "inline-flex justify-center shrink-0 w-4" }, [El("i", { className: "fas fa-user-friends text-gray-500" })]);
                        };
                        const __numEl = function (n) {
                            return El("span", { className: "font-bold underline text-gray-900", textContent: String(n) });
                        };
                        if (__capMode === "private") {
                            const pg = Number(exp.privateCapacity || exp.privateIncludedGuests || __cap || 0);
                            if (pg > 0) {
                                segs.push(El("span", { className: "inline-flex items-center gap-1" }, [
                                    __seatIcon(),
                                    El("span", { className: "text-gray-700" }, ["up to ", __numEl(pg), " " + (pg === 1 ? "guest" : "guests")])
                                ]));
                            }
                        } else if (__cap > 0) {
                            // sir's ruling 2026-08-22 ("Fix all four"), two defects on this one line:
                            //
                            // (1) THE NUMBER COULD LIE. It read `availableSeats` and, when the server
                            //     did not attach one, fell back to FULL CAPACITY — so a table with 2
                            //     seats left could display "only 700 seats", telling a guest there is
                            //     plenty of room when there is almost none. A figure about AVAILABILITY
                            //     must never round UP. Unknown availability is now stated as capacity in
                            //     the page's own existing words ("up to N"), which is the honest claim,
                            //     and is the same wording the private branch above already uses.
                            //
                            // (2) "ONLY" WAS APPLIED TO EVERY COUNT WITH NO THRESHOLD, so a 700-seat
                            //     hall read "only 700 seats". "Only" means hurry, few left — nonsense at
                            //     that size, and it destroyed the signal for a table genuinely down to
                            //     its last seats, because every card said it. The platform ALREADY has
                            //     the right vocabulary on mobile (BookingScreen: "Sold out" / "1 seat
                            //     left" / "N seats left") — neutral, no false scarcity. Derived from
                            //     that, not invented, and it brings the two platforms into one voice.
                            const __availKnown = (typeof exp.availableSeats === "number" && isFinite(exp.availableSeats));
                            if (__availKnown) {
                                const avail = Math.max(0, Number(exp.availableSeats));
                                const availText = (avail === 0)
                                    ? El("span", { className: "text-gray-700" }, ["Sold out"])
                                    : El("span", { className: "text-gray-700" }, [__numEl(avail), " " + (avail === 1 ? "seat" : "seats") + " left"]);
                                segs.push(El("span", { className: "inline-flex items-center gap-1" }, [__seatIcon(), availText]));
                            } else {
                                segs.push(El("span", { className: "inline-flex items-center gap-1" }, [
                                    __seatIcon(),
                                    El("span", { className: "text-gray-700" }, ["up to ", __numEl(__cap), " " + (__cap === 1 ? "seat" : "seats")])
                                ]));
                            }
                        }
                        // Private-booking PILL (owner 2026-05-25): same row as the seats, with a
                        // hover tooltip. "Shared" is the common default → NO pill. Show ONLY for a
                        // private-only experience, OR a "both" experience whose whole table is still
                        // free to book privately (no seats booked yet → availableSeats == capacity).
                        if (__capMode === "private") {
                            segs.push(El("span", {
                                className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 shrink-0",
                                title: "Private-only. You book the whole table for your group.",
                                textContent: "Private table"
                            }));
                        } else if (__capMode === "both") {
                            const __availP = (typeof exp.availableSeats === "number" && isFinite(exp.availableSeats)) ? exp.availableSeats : __cap;
                            if (__cap > 0 && __availP >= __cap) {
                                segs.push(El("span", {
                                    className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 shrink-0",
                                    title: "No seats booked yet. You can make this whole table private for your group.",
                                    textContent: "Can be private"
                                }));
                            }
                        }
                        if (segs.length === 0) return null;
                        return El("p", { className: "text-xs text-gray-700 flex items-center gap-3 flex-wrap" }, segs);
                    })(),
                    // 5. Next available slot + frequency on one row (orange pill)
                    (function() {
                        const next = window.tstsFormatNextOccurrence ? window.tstsFormatNextOccurrence(exp.nextOccurrenceAt) : "";
                        if (!next) return null;
                        const days = Array.isArray(exp.availableDays) ? exp.availableDays.filter(Boolean) : [];
                        let freq = "";
                        const set = new Set(days);
                        const isWeekend = set.size === 2 && set.has("Sat") && set.has("Sun");
                        const isWeekday = set.size === 5 && set.has("Mon") && set.has("Tue") && set.has("Wed") && set.has("Thu") && set.has("Fri");
                        if (days.length === 1) {
                            const dayFull = { Sun: "Sundays", Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays" };
                            freq = dayFull[days[0]] || "";
                        } else if (days.length === 7) {
                            freq = "Every day";
                        } else if (isWeekend) {
                            freq = "Weekends";
                        } else if (isWeekday) {
                            freq = "Weekdays";
                        } else if (days.length === 2) {
                            freq = days[0] + " & " + days[1];
                        } else if (days.length === 3) {
                            freq = days[0] + ", " + days[1] + " & " + days[2];
                        } else if (days.length > 0) {
                            freq = days.length + " days a week";
                        }
                        // sir 2026-08-09, verbatim: "Make the one-line change". A carved date-series runs on
                        // specific dates and has no weekly pattern at all, so this chain used to reach its last
                        // branch with an empty list and print "0 days a week" on the card. No weekly rhythm
                        // means no frequency clause — the line below already renders the date on its own.
                        const text = freq ? (next + " · " + freq) : next;
                        return El("div", {
                            className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 mb-1.5 self-start"
                        }, [
                            El("i", { className: "fas fa-calendar text-orange-700 text-[10px]" }),
                            El("span", { textContent: " " + text })
                        ]);
                    })(),
                    // 6. Latest tag REMOVED (owner 2026-05-25): the green "Fresh in <suburb>"
                    //    pill duplicated BOTH the suburb (already in the location row) and the
                    //    freshness signal. Freshness now reads, de-located, in the first-row
                    //    reco chip above as "Fresh" / "Just listed". One signal, one place.
                    // sir's ruling 2026-08-15 ("why the dead code still there in first place? remove it"):
                    // a hidden legacy block lived here, the pre-redesign location row, duration line,
                    // reco chip, "Fresh in <suburb>" pill and rating row, built invisibly into EVERY
                    // card "to avoid disturbing structure". That hedge was never approved; the locked
                    // card renders complete without it. Removed permanently under sir's word.
                ])
            ]);
            card.addEventListener("click", function(ev) {
                const t = ev && ev.target;
                if (t && typeof t.closest === "function" && t.closest('[data-no-card-nav=\"true\"]')) return;
                window.location.href = expHref;
            });
            card.addEventListener("keydown", function(ev) {
                if (!ev) return;
                const key = String(ev.key || "");
                if (key !== "Enter" && key !== " ") return;
                ev.preventDefault();
                window.location.href = expHref;
            });
            experiencesGrid.appendChild(card);
        });
    };

    const renderExperiences = (experiences) => {
        experiencesGrid.classList.remove("explore-loading");
        experiencesGrid.textContent = "";
        if (!experiences || !experiences.length) {
            experiencesGrid.classList.add("hidden");
            noResultsEl.classList.remove("hidden");
            if (loadErrorEl) loadErrorEl.classList.add("hidden");
            // Show active filters in zero-results area
            var zeroFiltersEl = document.getElementById("zero-result-filters");
            if (zeroFiltersEl) {
                zeroFiltersEl.textContent = "";
                var El = window.tstsEl;
                var hasFilter = false;
                if (filterState.search) { hasFilter = true; zeroFiltersEl.appendChild(makeZeroChip("Search: " + filterState.search, function() { filterState.search = ""; if (elSearch) elSearch.value = ""; fetchExperiences(); })); }
                if (filterState.location) { hasFilter = true; zeroFiltersEl.appendChild(makeZeroChip("City: " + filterState.location, function() { filterState.location = ""; if (elLocation) elLocation.value = ""; fetchExperiences(); })); }
                if (filterState.categories.length) { hasFilter = true; filterState.categories.forEach(function(c) { zeroFiltersEl.appendChild(makeZeroChip("Category: " + c.replace(/-/g, " "), function() { filterState.categories = filterState.categories.filter(function(x) { return x !== c; }); syncCategoryChips(); fetchExperiences(); })); }); }
                if (filterState.minPrice > 0 || filterState.maxPrice < PRICE_SLIDER_MAX) { hasFilter = true; zeroFiltersEl.appendChild(makeZeroChip("Price: A$" + filterState.minPrice + "-A$" + filterState.maxPrice, function() { filterState.minPrice = 0; filterState.maxPrice = PRICE_SLIDER_MAX; fetchExperiences(); })); }
                if (!hasFilter) zeroFiltersEl.classList.add("hidden"); else zeroFiltersEl.classList.remove("hidden");
            }
            return;
        }
        experiencesGrid.classList.remove("hidden");
        noResultsEl.classList.add("hidden");
        if (loadErrorEl) loadErrorEl.classList.add("hidden");
        renderExperienceCards(experiences);
    };

    function makeZeroChip(label, onRemove) {
        var El = window.tstsEl;
        var btn = El("button", { type: "button", className: "inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-sm text-orange-700 font-medium hover:bg-orange-100 transition" });
        var txt = document.createElement("span"); txt.textContent = label; btn.appendChild(txt);
        var x = document.createElement("span"); x.textContent = "\u00D7"; x.className = "font-bold"; btn.appendChild(x);
        btn.addEventListener("click", onRemove);
        return btn;
    }

    // === HELPER: ACTIVE CHIPS ===
    // sir 2026-08-10 (gap sir found himself: "how can i remove just one parameter while
    // keeping other? i dont see x mark in the filter pill"): every active-filter pill is
    // individually removable — its × drops ONLY that filter and re-runs the results.
    // These were dead <span>s with no ×, leaving Clear-all as the only exit; the pill
    // pattern with per-chip removal (makeZeroChip) already existed for the zero-results
    // state and is reused here so both surfaces stay identical.
    const updateActiveChips = () => {
        if (!activeFiltersBar) return;
        activeFiltersBar.textContent = "";

        const removeAnd = (mutate) => {
            return () => {
                mutate();
                fetchExperiences();
                updateActiveChips();
            };
        };
        const addChip = (label, onRemove) => {
            activeFiltersBar.appendChild(makeZeroChip(String(label), onRemove));
        };

        if (filterState.search) addChip("Search: " + String(filterState.search), removeAnd(() => {
            filterState.search = "";
            if (elSearch) elSearch.value = "";
        }));
        // sir 2026-08-22 ("the explore filter is mess up"): city, date and guests each have TWO
        // views — the hero bar and the drawer — and they are now mirrored forward so the drawer
        // actually filters. These three × handlers cleared ONLY the hero half, so removing a pill
        // left the drawer still showing the value: reopen Filters and "Melbourne" / "25 Aug" / "100"
        // were sitting there looking active while the results were unfiltered. A half-cleared mirror
        // is worse than no mirror, because the drawer then lies about what is applied.
        // PROVEN before this fix: removed the Date pill → URL cleared, badge 0, 21 cards back, hero
        // picker empty — and `#filter-date-input` still read "2026-08-25".
        // clearFilters() has always cleared both halves (:1136-1150); only these per-pill removals
        // were one-way. Now they clear the drawer twin too, so both surfaces agree either way.
        if (filterState.location) addChip("City: " + String(filterState.location), removeAnd(() => {
            filterState.location = "";
            if (elLocation) elLocation.value = "";
            const _drawerCity = document.getElementById("filter-city");
            if (_drawerCity) _drawerCity.value = "";
        }));
        if (filterState.date) addChip("Date: " + (window.tstsFormatDateShort ? window.tstsFormatDateShort(filterState.date) : String(filterState.date)), removeAnd(() => {
            filterState.date = "";
            if (elDate) {
                elDate.value = "";
                if (elDate._flatpickr && typeof elDate._flatpickr.clear === "function") {
                    try { elDate._flatpickr.clear(false); } catch (_e) { void _e; }
                }
            }
            // The drawer picker is a SEPARATE Flatpickr instance (rendered inline inside the
            // modal), so clearing the hero one leaves this calendar still showing the chosen day
            // highlighted. Clear the instance, not just the input, or the highlight survives.
            const _drawerDate = document.getElementById("filter-date-input");
            if (_drawerDate) {
                _drawerDate.value = "";
                if (_drawerDate._flatpickr && typeof _drawerDate._flatpickr.clear === "function") {
                    try { _drawerDate._flatpickr.clear(false); } catch (_e) { void _e; }
                }
            }
        }));
        if (filterState.guests) addChip("Guests: " + String(filterState.guests), removeAnd(() => {
            filterState.guests = "";
            if (elGuests) elGuests.value = "";
            const _drawerGuests = document.getElementById("filter-guests-input");
            if (_drawerGuests) _drawerGuests.value = "";
        }));
        if (Array.isArray(filterState.categories) && filterState.categories.length > 0) {
            filterState.categories
                .map((c) => normalizeCategory(c))
                .filter((c) => c && c !== "all")
                .forEach((c) => {
                    const label = (window.tstsCategoryLabel ? window.tstsCategoryLabel(c) : c);
                    addChip(String(label || c), removeAnd(() => {
                        filterState.categories = filterState.categories.filter((x) => normalizeCategory(x) !== c);
                        syncCategoryChips();
                    }));
                });
        }
        // sir 2026-08-22 ("every ---- filter with every ---- posibility must be tested end to
        // end ... in combination and permutation") — and it was the COMBINATION that exposed this.
        // A category chosen INSIDE the drawer lands in `modalCategories`, a different list from the
        // top chip row's `categories`. It is sent (`category=food-gatherings`) and it IS counted by
        // the badge, but only `categories` had a pill — so the drawer's category was the one filter
        // a guest could not remove without wiping every other filter with Clear all.
        // PROVEN: all 18 dimensions set at once → 18 parameters on the URL, badge 18, but only
        // SEVENTEEN pills. The missing one was the category.
        // This is the same defect sir already caught once ("how can i remove just one parameter
        // while keeping other? i dont see x mark in the filter pill") — the drawer's category was
        // left out of that fix. Same helpers, same shape as the block above; removal also unticks
        // the drawer chip so both surfaces agree.
        if (Array.isArray(filterState.modalCategories) && filterState.modalCategories.length > 0) {
            filterState.modalCategories.forEach((c) => {
                const key = String(c);
                const label = (window.tstsCategoryLabel ? window.tstsCategoryLabel(key) : key);
                addChip(String(label || key), removeAnd(() => {
                    filterState.modalCategories = filterState.modalCategories.filter((x) => String(x) !== key);
                    document.querySelectorAll('[data-modal-cat="' + key + '"]').forEach((btn) => setChipSelected(btn, false));
                }));
            });
        }
        // Sort is NOT a filter, owner-flagged 2026-05-02. Removed from active-chips bar.
        if (filterState.privateBookingOnly) addChip("Private booking", removeAnd(() => {
            filterState.privateBookingOnly = false;
            if (elPrivateBookingOnly) elPrivateBookingOnly.checked = false;
        }));
        if (filterState.verifiedOnly) addChip("Verified events", removeAnd(() => {
            filterState.verifiedOnly = false;
            if (elVerifiedOnly) elVerifiedOnly.checked = false;
        }));
        if (filterState.minPrice > 0 || filterState.maxPrice < PRICE_SLIDER_MAX) addChip("Price: A$" + filterState.minPrice + " - A$" + filterState.maxPrice, removeAnd(() => {
            filterState.minPrice = 0;
            filterState.maxPrice = PRICE_SLIDER_MAX;
            const slider = document.getElementById("price-slider");
            if (slider && slider.noUiSlider) {
                try { slider.noUiSlider.set([0, PRICE_SLIDER_MAX]); } catch (_e) { void _e; }
            }
        }));

        // sir approved per-filter removal for EVERY filter; the first build only covered
        // the dimensions the old code already listed, so the drawer's other fifteen were
        // counted by the Filters badge but had no pill to remove — a guest who chose
        // "Lively" could only wipe everything with Clear. Each dimension below now gets
        // its own removable pill, using the same helpers, and un-ticks its own chip.
        const untickChip = (attr, value) => {
            document.querySelectorAll('[' + attr + '="' + value + '"]').forEach((btn) => setChipSelected(btn, false));
        };
        const multiPills = [
            { key: "vibe",          attr: "data-vibe" },
            { key: "dietary",       attr: "data-dietary" },
            { key: "accessibility", attr: "data-accessibility" },
            { key: "cuisine",       attr: "data-cuisine" },
            { key: "languages",     attr: "data-language" },
            { key: "occasion",      attr: "data-occasion" },
            { key: "daysOfWeek",    attr: "data-dow" },
            { key: "timeOfDay",     attr: "data-tod" }
        ];
        multiPills.forEach((dim) => {
            const vals = Array.isArray(filterState[dim.key]) ? filterState[dim.key] : [];
            vals.forEach((v) => {
                const label = String(v).replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
                addChip(label, removeAnd(() => {
                    filterState[dim.key] = filterState[dim.key].filter((x) => x !== v);
                    untickChip(dim.attr, v);
                }));
            });
        });
        if (filterState.suburb) addChip("Suburb: " + filterState.suburb, removeAnd(() => {
            filterState.suburb = "";
            const el = document.getElementById("filter-suburb"); if (el) el.value = "";
        }));
        // sir's Rule 16 — no technical jargon on any user-visible surface. `filterState.duration`
        // holds the MACHINE value ("60,120" — a minutes range), so this pill printed
        // **"Length: 60,120"** on screen while the chip the guest actually clicked said "1–2 hrs".
        // Proven in the 18-filter combination run. The human label is not authored here: it is read
        // back off the very chip that set the value, so the pill can never drift from the control
        // and no second copy of the wording exists to maintain. The machine value stays in the
        // URL and the request, where it belongs.
        if (filterState.duration) {
            const __durChip = document.querySelector('[data-duration="' + String(filterState.duration) + '"]');
            const __durLabel = __durChip ? String(__durChip.textContent || "").trim() : "";
            addChip("Length: " + (__durLabel || String(filterState.duration).replace(/-/g, " ")), removeAnd(() => {
                filterState.duration = "";
                document.querySelectorAll('[data-duration]').forEach((b) => setChipSelected(b, false));
            }));
        }
        if (filterState.minRating) addChip("Rating " + filterState.minRating + "+", removeAnd(() => {
            filterState.minRating = "";
            document.querySelectorAll('[data-min-rating]').forEach((b) => setChipSelected(b, false));
        }));
        if (filterState.minReviews) addChip(filterState.minReviews + "+ reviews", removeAnd(() => {
            filterState.minReviews = "";
            document.querySelectorAll('[data-min-reviews]').forEach((b) => setChipSelected(b, false));
        }));
        if (filterState.instantBook) addChip("Instant book", removeAnd(() => {
            filterState.instantBook = false;
            // The control is #instant-book-toggle — clearFilters() has always used the real id, this
            // chip used one that exists nowhere, so removing the chip left the box still ticked.
            const el = document.getElementById("instant-book-toggle"); if (el) el.checked = false;
        }));
        if (filterState.newHostsOnly) addChip("New hosts", removeAnd(() => {
            filterState.newHostsOnly = false;
            const el = document.getElementById("modal-new-hosts"); if (el) el.checked = false;
        }));
        if (filterState.nearMeActive) addChip("Near me (" + filterState.distanceKm + " km)", removeAnd(() => {
            filterState.nearMeActive = false;
            const el = document.getElementById("filter-near-me"); if (el) el.checked = false;
        }));
        refreshFilterUi();
    };

    // === EVENT LISTENERS ===
    setFilterPanelOpen(false);
    refreshFilterUi();

    // DATE-GUARD-001: Prevent past-date selection — judged by MELBOURNE's calendar.
    // Owner 2026-05-30 (date-picker rollout R3): when Flatpickr is attached, the
    // Melbourne-day floor passed at init (sir 2026-08-13; see melbourneTodayIso) enforces
    // this same guard inside the brand calendar (greyed-out past days, hidden prev arrow).
    // The native input.min line below is kept as a defence-in-depth no-op for
    // the brief moment before Flatpickr initializes and for any (legacy) browser
    // that fails to load Flatpickr — the wrapper detects flatpickr-missing and
    // bails, leaving the native input intact with this min applied.
    if (elDate && !elDate._flatpickr) {
        // sir 2026-08-13: Melbourne's day, not the device's (see melbourneTodayIso above).
        elDate.min = melbourneTodayIso();
    }

    if (elFilterBtn) {
        elFilterBtn.addEventListener("click", () => {
            if (!elFilterPanel) return;
            const isOpen = !elFilterPanel.classList.contains("hidden");
            setFilterPanelOpen(!isOpen);
        });
    }
    if (elApplyFilters) elApplyFilters.addEventListener("click", applyFilters);
    if (elClearFilters) elClearFilters.addEventListener("click", clearFilters);
    if (elClearFiltersEmpty) elClearFiltersEmpty.addEventListener("click", clearFilters);
    // Owner-flagged 2026-05-01 20:35, clean wiring for the Airbnb modal:
    // modal-clear-all triggers clearFilters() (same behaviour as the
    // top-row Clear button). The legacy close-filters-btn was removed
    // when the inline-panel footer was replaced with a sticky modal CTA.
    var modalClearAll = document.getElementById("modal-clear-all");
    if (modalClearAll) modalClearAll.addEventListener("click", clearFilters);
    
    if (elSearch) {
        elSearch.addEventListener("input", () => {
            filterState.search = elSearch.value.trim();
            debouncedFetch();
        });
    }
    
    // --- Location Autocomplete for Explore ---
    // Uses Google Places when API available, falls back to AU datalist otherwise.
    var __explorePlacesAttached = false;

    function __initExplorePlaces() {
      if (!elLocation) return;
      if (typeof google === "undefined" || !google.maps || !google.maps.places) {
        // Google Places not loaded, fall back to AU datalist
        __initExploreAuDatalist();
        return;
      }

      try {
        // Remove datalist attribute so it doesn't interfere with Places dropdown
        elLocation.removeAttribute("list");
        var datalistEl = document.getElementById("explore-city-suggestions");
        if (datalistEl) datalistEl.remove();

        var autocomplete = new google.maps.places.Autocomplete(elLocation, {
          componentRestrictions: { country: "au" },
          fields: ["address_components", "name"],
        });

        autocomplete.addListener("place_changed", function () {
          var place = autocomplete.getPlace();
          if (!place || !place.address_components) return;
          var components = place.address_components;
          var city = "";
          for (var i = 0; i < components.length; i++) {
            var types = components[i].types;
            if (types.indexOf("locality") >= 0 || types.indexOf("administrative_area_level_2") >= 0) {
              city = components[i].long_name;
              break;
            }
          }
          if (city) {
            elLocation.value = city;
            filterState.location = city;
            applyFilters();
          }
        });

        __explorePlacesAttached = true;
      } catch (placesErr) {
        // Places init failed, fall back to datalist
        __initExploreAuDatalist();
      }
    }

    // Fallback: AU locations datalist (same as previous implementation)
    const exploreCityDatalist = document.getElementById("explore-city-suggestions");
    var __exploreAuLocations = null;
    var __exploreAuLoadPromise = null;

    function __initExploreAuDatalist() {
      if (!elLocation) return;
      elLocation.addEventListener("focus", function () { __loadExploreAuLocations(); }, { once: true });
      elLocation.addEventListener("input", function () {
        clearTimeout(__exploreCityTimer);
        var val = elLocation.value;
        __exploreCityTimer = setTimeout(function () { __filterExploreCitySuggestions(val); }, 150);
      });
    }

    function __loadExploreAuLocations() {
      if (__exploreAuLoadPromise) return __exploreAuLoadPromise;
      __exploreAuLoadPromise = fetch("/data/au-locations.json").then(function (r) {
        return r.ok ? r.json() : [];
      }).then(function (arr) {
        __exploreAuLocations = Array.isArray(arr) ? arr : [];
        return __exploreAuLocations;
      }).catch(function (loadErr) {
        __exploreAuLocations = [];
        return [];
      });
      return __exploreAuLoadPromise;
    }
    var __exploreCityTimer = null;
    function __filterExploreCitySuggestions(val) {
      if (!exploreCityDatalist || !__exploreAuLocations) return;
      var tok = String(val || "").trim().toLowerCase();
      if (tok.length < 2) { while (exploreCityDatalist.firstChild) exploreCityDatalist.removeChild(exploreCityDatalist.firstChild); return; }
      var seen = {};
      var matches = [];
      for (var i = 0; i < __exploreAuLocations.length && matches.length < 15; i++) {
        var entry = __exploreAuLocations[i];
        var name = entry[0];
        var nameLower = name.toLowerCase();
        if (nameLower.indexOf(tok) === 0 && !seen[nameLower]) {
          seen[nameLower] = true;
          matches.push(name);
        }
      }
      while (exploreCityDatalist.firstChild) exploreCityDatalist.removeChild(exploreCityDatalist.firstChild);
      for (var j = 0; j < matches.length; j++) {
        var opt = document.createElement("option");
        opt.value = matches[j];
        exploreCityDatalist.appendChild(opt);
      }
    }

    // Try Google Places first, datalist fallback
    if (typeof google !== "undefined" && google.maps && google.maps.places) {
      __initExplorePlaces();
    } else {
      // Wait for Google Maps script to load (async defer)
      window.addEventListener("load", function () {
        if (!__explorePlacesAttached) __initExplorePlaces();
      });
      // If still not loaded after 3s, fall back to datalist
      setTimeout(function () {
        if (!__explorePlacesAttached) __initExploreAuDatalist();
      }, 3000);
    }
    // --- End Location Autocomplete ---

    if (elLocation) elLocation.addEventListener("change", applyFilters);
    if (elDate) elDate.addEventListener("change", applyFilters);
    if (elGuests) elGuests.addEventListener("change", applyFilters);
    if (elSort) elSort.addEventListener("change", applyFilters);
    // sir 2026-08-22, verbatim: "Yes — fix both checkboxes now".
    // These two are the ONLY 2 of 87 drawer controls that applied on tick and slammed the drawer
    // shut mid-setup. The cause is visible right here: they were grouped with the TOP-BAR controls
    // above (location / date / guests / sort), which are supposed to apply instantly because they
    // are not in the drawer. They are drawer controls and belong to the drawer contract instead:
    // a tick stages the choice, refreshes the chips, and nothing is applied until "Show results".
    // #modal-private-booking already had its contract handler at ~:479; this listener was a SECOND
    // one fighting it. #verified-only had none, so it gains one beside its neighbour ~:520.
    // applyFilters() still reads both checkboxes itself (~:1205-1206), so pressing "Show results"
    // picks the state up exactly as before — nothing is lost by not applying on tick.

    // Sort: button-with-menu component (owner-approved 2026-05-02).
    // Closed button reads "Sort". Click toggles menu. Pick option → set value, close
    // menu, button stays "Sort" (no in-button label per owner spec). Click selected
    // option in menu → deselect (back to "" / Recommended). Click outside → close.
    (function bindSortMenu() {
        const sortBtn = document.getElementById("sort-btn");
        const sortMenu = document.getElementById("sort-menu");
        const sortWrap = document.getElementById("sort-wrap");
        if (!sortBtn || !sortMenu || !sortWrap) return;
        const sortOptions = Array.from(sortMenu.querySelectorAll(".sort-option"));

        function refreshSortMenuHighlight() {
            const current = (elSort && elSort.value) || "";
            for (const opt of sortOptions) {
                const v = String(opt.getAttribute("data-sort-value") || "");
                if (v === current) {
                    opt.classList.add("bg-orange-50", "text-orange-700", "font-bold");
                    opt.setAttribute("aria-checked", "true");
                } else {
                    opt.classList.remove("bg-orange-50", "text-orange-700", "font-bold");
                    opt.setAttribute("aria-checked", "false");
                }
            }
        }
        function setSortMenuOpen(open) {
            const shouldOpen = !!open;
            if (shouldOpen) {
                sortMenu.classList.remove("hidden");
                sortBtn.setAttribute("aria-expanded", "true");
                refreshSortMenuHighlight();
            } else {
                sortMenu.classList.add("hidden");
                sortBtn.setAttribute("aria-expanded", "false");
            }
        }

        sortBtn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            const isOpen = !sortMenu.classList.contains("hidden");
            setSortMenuOpen(!isOpen);
        });

        sortOptions.forEach(function (opt) {
            opt.addEventListener("click", function (ev) {
                ev.stopPropagation();
                const v = String(opt.getAttribute("data-sort-value") || "");
                const currentSort = (elSort && elSort.value) || "";
                if (v === currentSort) {
                    // Re-click on the currently-selected option → deselect (Recommended).
                    if (elSort) elSort.value = "";
                    filterState.sort = "";
                } else {
                    if (elSort) elSort.value = v;
                    filterState.sort = v;
                }
                setSortMenuOpen(false);
                refreshSortMenuHighlight();
                applyFilters();
            });
        });

        // Click anywhere outside the wrapper closes the menu.
        document.addEventListener("click", function (ev) {
            if (sortMenu.classList.contains("hidden")) return;
            if (sortWrap.contains(ev.target)) return;
            setSortMenuOpen(false);
        });
        // Escape closes the menu.
        document.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape" && !sortMenu.classList.contains("hidden")) {
                setSortMenuOpen(false);
                sortBtn.focus();
            }
        });

        // Initial highlight in case URL hydrated a sort value.
        refreshSortMenuHighlight();
    })();

    // Category Chips
    categoryChips.forEach(chip => {
        chip.addEventListener("click", () => {
            // sir 2026-08-22 ("every ---- filter with every ---- posibility"): the
            // **"All Stories" chip was DEAD** — the one control on the main row whose job is to
            // clear a category selection.
            // WHY: this tested the NORMALISED value against "all", but
            // `window.tstsNormalizeCategory("all")` returns an **empty string**, not "all". So the
            // clear-branch never ran; the else-branch pushed "" into filterState.categories; and
            // both syncUrlFromState and fetchExperiences drop falsy/"all" entries
            // (`.filter((c) => c && c !== "all")`), so that empty string was silently discarded and
            // NOTHING happened at all.
            // PROVEN: selected Culture & Stories + Move & Wellness (3 cards), clicked All Stories →
            // URL still "?category=culture-stories&category=move-wellness", still 3 cards, both
            // chips still marked active, both pills still present. Zero change.
            // FIX: read the chip's OWN attribute for "all" before normalising. The `!key` guard
            // covers the same trap generally — a value the normaliser cannot map must clear the
            // selection, never be pushed in as an empty entry that silently vanishes downstream.
            const rawCat = String(chip.getAttribute("data-category") || "").trim().toLowerCase();
            const key = normalizeCategory(rawCat);
            if (rawCat === "all" || !key) {
                filterState.categories = [];
            } else {
                const curr = Array.isArray(filterState.categories) ? [...filterState.categories] : [];
                const idx = curr.indexOf(key);
                if (idx >= 0) curr.splice(idx, 1);
                else curr.push(key);
                filterState.categories = curr;
            }
            syncCategoryChips();
            fetchExperiences();
        });
    });

    if (retryLoadBtn) {
        retryLoadBtn.addEventListener("click", function () {
            fetchExperiences();
        });
    }

    function debounce(fn, delay) {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
    }
    const closeFiltersOnOutsideClick = (ev) => {
        if (!elFilterPanel || elFilterPanel.classList.contains("hidden")) return;
        const target = ev && ev.target;
        if (!target) return;
        if (elFilterPanel.contains(target)) return;
        if (elFilterBtn && elFilterBtn.contains(target)) return;
        setFilterPanelOpen(false);
    };
    document.addEventListener("click", closeFiltersOnOutsideClick);
    document.addEventListener("keydown", (ev) => {
        if (!ev || ev.key !== "Escape") return;
        if (!elFilterPanel || elFilterPanel.classList.contains("hidden")) return;
        setFilterPanelOpen(false);
    });

    // INITIAL LOAD
    fetchExperiences();
});
