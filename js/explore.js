// Frontend/js/explore.js

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
    const elClearFilters = document.getElementById("clear-filters-btn");
    const elClearFiltersEmpty = document.getElementById("clear-filters-empty-btn");
    const elApplyFilters = document.getElementById("apply-filters");
    const elSort = document.getElementById("sort-select");
    const elPrivateBookingOnly = document.getElementById("private-booking-only");
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

    const elExploreCurations = document.getElementById("explore-curations");
    const elExploreCurationsList = document.getElementById("explore-curations-list");

    if (!experiencesGrid) return;

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
        maxPrice: 300
    };

    function syncUrlFromState() {
        try {
            const p = new URLSearchParams();
            if (filterState.search) p.set("q", String(filterState.search));
            if (filterState.location) p.set("city", String(filterState.location));
            if (filterState.date) p.set("date", String(filterState.date));
            if (filterState.guests) p.set("guests", String(filterState.guests));
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
            if (filterState.maxPrice < 300) p.set("maxPrice", String(filterState.maxPrice));
            if (window.TSTS_DEALS_UI_MODE) p.set("filter", "deals");

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

    function publicExperienceTitle(exp) {
        const title = String((exp && exp.title) || "").trim();
        if (title && !isStarterTitle(title)) return title;
        return "Shared experience";
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

    function syncCategoryChips() {
        const activeSet = new Set(Array.isArray(filterState.categories) ? filterState.categories : []);
        categoryChips.forEach((chip) => {
            chip.classList.remove("active", "bg-gray-900", "text-white", "border-transparent");
            chip.classList.add("bg-white", "border-gray-200", "text-gray-600");
            const key = String(chip.getAttribute("data-category") || "");
            const isAll = key === "all";
            const isActive = (isAll && activeSet.size === 0) || (!isAll && activeSet.has(key));
            if (isActive) {
                chip.classList.add("active", "bg-gray-900", "text-white", "border-transparent");
                chip.classList.remove("bg-white", "border-gray-200", "text-gray-600");
            }
        });
        refreshFilterUi();
    }

    function getActiveFilterCount() {
        let count = 0;
        if (filterState.search) count += 1;
        if (filterState.location) count += 1;
        if (filterState.date) count += 1;
        if (filterState.guests) count += 1;
        if (filterState.sort) count += 1;
        if (filterState.privateBookingOnly) count += 1;
        if (filterState.verifiedOnly) count += 1;
        if (Array.isArray(filterState.categories) && filterState.categories.some((c) => c && c !== "all")) count += 1;
        if (filterState.minPrice > 0 || filterState.maxPrice < 300) count += 1;
        return count;
    }

    function setFilterPanelOpen(open) {
        const shouldOpen = !!open;
        if (elFilterPanel) elFilterPanel.classList.toggle("hidden", !shouldOpen);
        if (elFilterBtn) {
            elFilterBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
            elFilterBtn.classList.toggle("filter-btn-active", shouldOpen);
        }
        if (elFilterBtnLabel) {
            elFilterBtnLabel.textContent = shouldOpen ? "Hide filters" : "Filters";
        }
    }

    function refreshFilterUi() {
        const count = getActiveFilterCount();
        if (elFilterCountBadge) {
            if (count > 0) {
                elFilterCountBadge.classList.remove("hidden");
                elFilterCountBadge.textContent = String(count);
            } else {
                elFilterCountBadge.classList.add("hidden");
                elFilterCountBadge.textContent = "0";
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
                const vals = Object.values(dyn).map((v) => Number(v)).filter((v) => isFinite(v));
                if (vals.some((v) => v > 0)) return true;
            }
        } catch (_) {}
        return false;
    }

    function tstsSetDealsBanner(_) {
        return;
    }

    function escapeHtml(s) {
      return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    async function loadExploreCurations() {
      if (!elExploreCurations || !elExploreCurationsList) return;
      try {
        if (!window.tstsGetSession) return;
        // Avoid noisy /api/auth/me 401s on public Explore for guests.
        // Logged-in sessions always set a local user cache via setAuth().
        if (!localStorage.getItem("tsts_user")) return;
        const sess = await window.tstsGetSession({ force: false });
        if (!sess || !sess.ok) return;
      } catch (_) { return; }

      try {
        const res = await window.authFetch("/api/curations", { method: "GET" });
        if (!res || !res.ok) return;

        const payload = await res.json();
        const collections = payload && Array.isArray(payload.collections) ? payload.collections : [];
        if (collections.length <= 0) return;

        elExploreCurations.classList.remove("hidden");
        elExploreCurationsList.textContent = "";

        collections.slice(0, 3).forEach((c) => {
          const a = document.createElement("a");
          a.className = "bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between h-full";
          a.href = (function() {
            const p = new URLSearchParams();
            if (c.filters && c.filters.q) p.set("q", String(c.filters.q));
            if (c.filters && c.filters.city) p.set("city", String(c.filters.city));
            if (c.filters && c.filters.category) {
              const norm = normalizeCategory(c.filters.category);
              if (norm) p.set("category", String(norm));
            }
            if (c.filters && c.filters.minPrice != null) p.set("minPrice", String(c.filters.minPrice));
            if (c.filters && c.filters.maxPrice != null) p.set("maxPrice", String(c.filters.maxPrice));
            if (c.filters && c.filters.date) p.set("date", String(c.filters.date));
            return "explore.html?" + p.toString();
          })();

          const title = String(c.title || "").trim();
          const subtitle = String(c.subtitle || "").trim();

          const titleDiv = document.createElement("div");
          const h3 = document.createElement("h3");
          h3.className = "text-xl font-bold font-serif text-gray-900";
          h3.textContent = title || "Explore";
          titleDiv.appendChild(h3);
          if (subtitle) {
            const pSub = document.createElement("p");
            pSub.className = "text-gray-600 text-sm mt-2";
            pSub.textContent = subtitle;
            titleDiv.appendChild(pSub);
          }
          a.appendChild(titleDiv);

          const browseDiv = document.createElement("div");
          browseDiv.className = "mt-6 flex items-center text-sm font-bold text-orange-600";
          browseDiv.textContent = "Browse \u2192";
          a.appendChild(browseDiv);

          elExploreCurationsList.appendChild(a);
        });

        const more = document.createElement("a");
        more.className = "bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between h-full";
        more.href = "explore.html";

        const moreTitleDiv = document.createElement("div");
        const moreH3 = document.createElement("h3");
        moreH3.className = "text-xl font-bold font-serif text-gray-900";
        moreH3.textContent = "Explore more experiences \u2192";
        moreTitleDiv.appendChild(moreH3);
        const morePSub = document.createElement("p");
        morePSub.className = "text-gray-600 text-sm mt-2";
        morePSub.textContent = "See everything available right now.";
        moreTitleDiv.appendChild(morePSub);
        more.appendChild(moreTitleDiv);

        const moreBrowseDiv = document.createElement("div");
        moreBrowseDiv.className = "mt-6 flex items-center text-sm font-bold text-orange-600";
        moreBrowseDiv.textContent = "Explore \u2192";
        more.appendChild(moreBrowseDiv);

        elExploreCurationsList.appendChild(more);
      } catch (_) {
        return;
      }
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
    syncCategoryChips();

    window.TSTS_DEALS_UI_MODE = (String(urlFilter || "").trim().toLowerCase() === "deals");

    // === INITIALIZE SLIDER ===
    if (elPriceSlider && typeof noUiSlider !== 'undefined') {
        noUiSlider.create(elPriceSlider, {
            start: [0, 300],
            connect: true,
            range: { 'min': 0, 'max': 300 },
            step: 10,
            tooltips: false
        });

        elPriceSlider.noUiSlider.on('update', function (values) {
            filterState.minPrice = Math.round(values[0]);
            filterState.maxPrice = Math.round(values[1]);
            if (elPriceMinLabel) elPriceMinLabel.textContent = `$${filterState.minPrice}`;
            if (elPriceMaxLabel) elPriceMaxLabel.textContent = `$${filterState.maxPrice}+`;
        });
    }

    // === FILTER ACTIONS ===
    
    // 1. Build Query & Fetch
    const fetchExperiences = async () => {
        // UI Loading - DOM-safe
        experiencesGrid.textContent = "";
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
        if (filterState.date) params.set("date", filterState.date);
        if (Array.isArray(filterState.categories) && filterState.categories.length > 0) {
            filterState.categories
                .map((c) => normalizeCategory(c))
                .filter((c) => c && c !== "all")
                .forEach((category) => params.append("category", category));
        }
        if (filterState.sort) params.set("sort", filterState.sort);
        if (filterState.minPrice > 0) params.set("minPrice", filterState.minPrice);
        if (filterState.maxPrice < 300) params.set("maxPrice", filterState.maxPrice);
        if (filterState.guests) params.set("guests", filterState.guests);
        if (filterState.privateBookingOnly) params.set("privateBookingAllowed", "true");
        if (filterState.verifiedOnly) params.set("verified", "true");

        try {
            const res = await window.authFetch(`/api/experiences?${params.toString()}`, { method: "GET" });
            if (!res.ok) throw new Error("API Error");
            const data = await res.json().catch(() => null);

            const list = Array.isArray(data) ? data : (data && Array.isArray(data.experiences) ? data.experiences : []);
            const privateFiltered = filterState.privateBookingOnly ? list.filter(isPrivateBookingAvailable) : list;
            const out = window.TSTS_DEALS_UI_MODE ? privateFiltered.filter(tstsIsDeal) : privateFiltered;
            if (window.TSTS_DEALS_UI_MODE) tstsSetDealsBanner("");
            renderExperiences(out);
        } catch (err) {
            experiencesGrid.classList.add("hidden");
            noResultsEl.classList.add("hidden");
            experiencesGrid.textContent = "";
            if (loadErrorEl) loadErrorEl.classList.remove("hidden");
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
        // Reset State
        filterState.search = "";
        filterState.location = "";
        filterState.date = "";
        filterState.guests = "";
        filterState.categories = [];
        filterState.sort = "";
        filterState.privateBookingOnly = false;
        filterState.verifiedOnly = false;
        filterState.minPrice = 0;
        filterState.maxPrice = 300;

        // Reset DOM
        if (elSearch) elSearch.value = "";
        if (elLocation) elLocation.value = "";
        if (elDate) elDate.value = "";
        if (elGuests) elGuests.value = "";
        if (elSort) elSort.value = "";
        if (elPrivateBookingOnly) elPrivateBookingOnly.checked = false;
        if (elVerifiedOnly) elVerifiedOnly.checked = false;
        
        if (elPriceSlider && elPriceSlider.noUiSlider) elPriceSlider.noUiSlider.set([0, 300]);

        // Reset Category Chips
        syncCategoryChips();
        
        syncUrlFromState();

        fetchExperiences();
    };

    // === RENDER LOGIC ===
    const renderExperiences = (experiences) => {
        const El = window.tstsEl;
        const safeUrl = window.tstsSafeUrl;
        const fallbackImg = "/assets/experience-default.jpg";
        const fallbackHostPic = "/assets/avatar-default.svg";

        experiencesGrid.textContent = "";
        if (!experiences || !experiences.length) {
            experiencesGrid.classList.add("hidden");
            noResultsEl.classList.remove("hidden");
            if (loadErrorEl) loadErrorEl.classList.add("hidden");
            return;
        }
        experiencesGrid.classList.remove("hidden");
        noResultsEl.classList.add("hidden");
        if (loadErrorEl) loadErrorEl.classList.add("hidden");

        experiences.forEach(function(exp) {
            const imgUrl = safeUrl(exp.imageUrl || (exp.images && exp.images[0]), fallbackImg);
            const price = exp.price || 0;
            const hostPicUrl = safeUrl(exp.hostPic, fallbackHostPic);
            const privateAvailable = isPrivateBookingAvailable(exp);
            const verifiedState = normalizedVerifiedStatus(exp);
            const title = publicExperienceTitle(exp);
            const teaser = cardTeaser(exp);
            const duration = String(exp.duration || "").trim();
            const groupCap = Number(exp.maxGuests || exp.capacity || 0);
            const groupLabel = (Number.isFinite(groupCap) && groupCap > 0) ? ("Up to " + String(groupCap) + " guests") : "Small group";

            var imgEl = El("img", { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500" });
            window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

            var hostImgEl = El("img", { className: "w-6 h-6 rounded-full border border-gray-100" });
            window.tstsSafeImg(hostImgEl, hostPicUrl, fallbackHostPic);

            var imageContainer = El("div", { className: "relative h-48 w-full overflow-hidden bg-gray-100" }, [
                imgEl,
                El("div", { className: "absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm", textContent: "$" + price })
            ]);
            if (privateAvailable) {
                imageContainer.appendChild(
                    El("div", {
                        className: "absolute top-3 left-3 bg-emerald-600/90 text-white px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm",
                        textContent: "Private booking"
                    })
                );
            }
            if (verifiedState === "verified") {
                imageContainer.appendChild(
                    El("div", {
                        className: privateAvailable
                            ? "absolute top-11 left-3 bg-blue-600/90 text-white px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm"
                            : "absolute top-3 left-3 bg-blue-600/90 text-white px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm",
                        textContent: "Verified"
                    })
                );
            } else if (verifiedState === "pending") {
                imageContainer.appendChild(
                    El("div", {
                        className: privateAvailable
                            ? "absolute top-11 left-3 bg-amber-500/90 text-white px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm"
                            : "absolute top-3 left-3 bg-amber-500/90 text-white px-2 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm",
                        textContent: "Verification pending"
                    })
                );
            }

            if (exp.isPaused) {
                imageContainer.appendChild(El("div", { className: "absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold", textContent: "Paused" }));
            }

            var markerIcon = El("i", { className: "fas fa-map-marker-alt text-orange-500" });
            var starIcon = El("i", { className: "fas fa-star" });
            var hostDisplayName = String(exp.hostName || "").trim();
            if (!hostDisplayName || looksLikeEmailName(hostDisplayName)) {
                hostDisplayName = (verifiedState === "verified") ? "Verified Host" : "Host";
            }

            var card = El("a", { href: "experience.html?id=" + encodeURIComponent(exp._id || ""), className: "group block bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col" }, [
                imageContainer,
                El("div", { className: "p-4 flex flex-col gap-2 flex-grow" }, [
                    El("div", { className: "flex items-center gap-2 mb-1" }, [
                        hostImgEl,
                        El("span", { className: "text-xs text-gray-500 truncate", textContent: hostDisplayName })
                    ]),
                    El("h3", { className: "font-bold text-gray-900 mb-1 truncate", textContent: title }),
                    El("p", { className: "text-xs text-gray-600 mb-2 line-clamp-2 min-h-[2.5rem]", textContent: teaser }),
                    El("p", { className: "text-xs text-gray-500 flex items-center gap-1 mb-1" }, [markerIcon, " " + (exp.city || "")]),
                    El("p", { className: "text-[11px] text-gray-500 mb-2", textContent: (duration ? (duration + " \u2022 ") : "") + groupLabel }),
                    El("div", { className: "mt-auto pt-3 border-t border-gray-50 flex justify-between items-center" }, [
                        El("div", { className: "flex items-center text-xs text-yellow-500 gap-1" }, [
                            starIcon,
                            El("span", { className: "font-bold text-gray-700", textContent: exp.averageRating ? exp.averageRating.toFixed(1) : "New" }),
                            El("span", { className: "text-gray-400", textContent: "(" + (exp.reviewCount || 0) + ")" })
                        ]),
                        El("span", { className: "text-xs text-orange-600 font-semibold group-hover:underline", textContent: "View →" })
                    ])
                ])
            ]);
            experiencesGrid.appendChild(card);
        });
    };

    // === HELPER: ACTIVE CHIPS ===
    const updateActiveChips = () => {
        if (!activeFiltersBar) return;
        activeFiltersBar.textContent = "";
        
        const addChip = (label) => {
            const span = document.createElement("span");
            span.className = "px-2 py-1 bg-orange-50 text-orange-700 rounded-full border border-orange-100 text-xs font-bold";
            span.textContent = label;
            activeFiltersBar.appendChild(span);
        };

        if (filterState.search) addChip("Search: " + String(filterState.search));
        if (filterState.location) addChip("City: " + String(filterState.location));
        if (filterState.date) addChip("Date: " + (window.tstsFormatDateShort ? window.tstsFormatDateShort(filterState.date) : String(filterState.date)));
        if (filterState.guests) addChip("Guests: " + String(filterState.guests));
        if (Array.isArray(filterState.categories) && filterState.categories.length > 0) {
            filterState.categories
                .map((c) => normalizeCategory(c))
                .filter((c) => c && c !== "all")
                .forEach((c) => {
                    const label = (window.tstsCategoryLabel ? window.tstsCategoryLabel(c) : c);
                    addChip(String(label || c));
                });
        }
        if (filterState.sort) {
            const sortLabel = filterState.sort === "price_asc" ? "Price: Low to High"
                : filterState.sort === "rating_desc" ? "Top Rated"
                : String(filterState.sort);
            addChip("Sort: " + sortLabel);
        }
        if (filterState.privateBookingOnly) addChip("Private booking");
        if (filterState.verifiedOnly) addChip("Verified events");
        if (filterState.minPrice > 0 || filterState.maxPrice < 300) addChip("Price: $" + filterState.minPrice + " - $" + filterState.maxPrice);
        refreshFilterUi();
    };

    // === EVENT LISTENERS ===
    setFilterPanelOpen(false);
    refreshFilterUi();

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
    
    if (elSearch) {
        elSearch.addEventListener("input", () => {
            filterState.search = elSearch.value.trim();
            debouncedFetch();
        });
    }
    
    if (elLocation) elLocation.addEventListener("change", applyFilters);
    if (elDate) elDate.addEventListener("change", applyFilters);
    if (elGuests) elGuests.addEventListener("change", applyFilters);
    if (elSort) elSort.addEventListener("change", applyFilters);
    if (elPrivateBookingOnly) elPrivateBookingOnly.addEventListener("change", applyFilters);
    if (elVerifiedOnly) elVerifiedOnly.addEventListener("change", applyFilters);

    // Category Chips
    categoryChips.forEach(chip => {
        chip.addEventListener("click", () => {
            const key = normalizeCategory(chip.getAttribute("data-category") || "");
            if (key === "all") {
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
    loadExploreCurations();
    fetchExperiences();
});
