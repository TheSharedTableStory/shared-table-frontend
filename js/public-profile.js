// Frontend/js/public-profile.js

// 🔴 CONFIG
// Get Host ID from URL
const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const contentEl = document.getElementById('profile-content');

// Elements
const hostNameEl = document.getElementById('host-name');
const hostPicEl = document.getElementById('host-pic');
const hostLocationEl = document.getElementById('host-location');
const hostRatingEl = document.getElementById('host-rating');
const hostBioEl = document.getElementById('host-bio');
const hostBadgeEl = document.getElementById('host-badge');
const gridEl = document.getElementById('experiences-grid');
const noExpEl = document.getElementById('no-experiences');
const reportUserLinkEl = document.getElementById('report-user-link');

// Review Elements
const reviewsContainer = document.getElementById('reviews-container');
const reviewsList = document.getElementById('reviews-list');

document.addEventListener('DOMContentLoaded', async () => {
    if (!userId) {
        showError();
        return;
    }

    // 2026-08-25: ONE session lookup, shared by Report and Block.
    //
    // Block already asked "is this me?" and hid itself on your own profile. Report, three lines above
    // it, never asked at all — so on your own profile Block correctly vanished and Report remained,
    // offering to report yourself to moderation. The guard existed six lines from the control that
    // needed it. Both now read the SAME answer, so they cannot diverge again.
    //
    // The two conditions are deliberately NOT identical:
    //   Report — hidden ONLY on your own profile. A signed-OUT visitor must still be able to report.
    //   Block  — requires being signed in AND viewing someone else (unchanged).
    var session = window.tstsGetSession ? await window.tstsGetSession() : null;
    var myId = (session && session.user && (session.user._id || session.user.id)) ? String(session.user._id || session.user.id) : "";
    var __isOwnProfile = !!(myId && myId === userId);

    if (reportUserLinkEl) {
        if (__isOwnProfile) {
            reportUserLinkEl.classList.add("hidden");
        } else {
            reportUserLinkEl.href = "report.html?targetType=user&targetId=" + encodeURIComponent(userId);
        }
    }

    // F2: Block user button, only for authenticated users viewing someone else
    var blockBtn = document.getElementById("block-user-btn");
    if (blockBtn) {
        if (myId && !__isOwnProfile) {
            blockBtn.classList.remove("hidden");
            blockBtn.addEventListener("click", async function () {
                var confirmed = window.tstsConfirm
                    ? await window.tstsConfirm("They won\u2019t be able to see your profile or reach out to you. You can unblock anytime from your connections page.", { destructive: true, confirmText: "Block", cancelText: "Cancel" })
                    : confirm("Block this user?");
                if (!confirmed) return;
                try {
                    var res = await window.authFetch("/api/social/block/" + encodeURIComponent(userId), { method: "POST" });
                    if (res.ok) {
                        if (window.tstsNotify) window.tstsNotify("User blocked.", "success");
                        window.location.href = "connections.html";
                    } else {
                        var body = await res.json().catch(function () { return {}; });
                        if (window.tstsNotify) window.tstsNotify(body.message || "Could not block user.", "error");
                    }
                } catch (_) {
                    if (window.tstsNotify) window.tstsNotify("We couldn't reach the server just now. Please try again.", "error");
                }
            });
        }
    }

    // F3: Share profile button
    var shareBtn = document.getElementById("share-profile-btn");
    if (shareBtn) {
        shareBtn.addEventListener("click", function () {
            var profileUrl = window.location.origin + "/public-profile.html?id=" + encodeURIComponent(userId);
            if (navigator.share) {
                navigator.share({ title: "Check out this profile", url: profileUrl }).catch(function () {});
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(profileUrl).then(function () {
                    if (window.tstsNotify) window.tstsNotify("Link copied, share the love!", "success");
                }).catch(function () {
                    if (window.tstsNotify) window.tstsNotify("Could not copy link.", "error");
                });
            }
        });
    }

    try {
        const res = await window.authFetch(`/api/users/${userId}/profile`, { method: "GET" });
        const profileRaw = await res.json().catch(() => null);
        if (!res.ok) throw new Error("Host not found");
        const profileData = (profileRaw && profileRaw.data) ? profileRaw.data : profileRaw;
        renderProfile(profileData);
    } catch (err) {
        showError();
    }
});

function renderProfile(profile) {
    const p = (profile && profile.user) ? profile.user : (profile || {});
    const hostVerificationStatus = String((p && p.hostVerificationStatus) || "").trim().toLowerCase();
    const hostVerified = !!(p && p.hostVerified === true) || hostVerificationStatus === "verified";

    hostNameEl.textContent = p.name || "";
    if (p.profilePic && hostPicEl) window.tstsSafeImg(hostPicEl, p.profilePic, "/assets/avatar-default.svg");
    if (p.bio) hostBioEl.textContent = p.bio;

    // sir's ruling 2026-08-13: a host who has set no location must NOT be labelled
    // "Global" — invented copy that tells a guest nothing. Order of truth: (1) what the
    // host wrote; (2) otherwise where their listings actually are — and sir's own point,
    // a host can run listings in more than one place, so we name the cities rather than
    // pretend there is one ("Melbourne", "Melbourne & Geelong", "Melbourne +2 more");
    // (3) if neither exists, the line stays hidden until they tell us. Filled in later
    // by applyDerivedLocation() once the listings load.
    if (hostLocationEl) {
        var loc = String(p.location || "").trim();
        hostLocationEl.textContent = "";
        if (loc) {
            var mapIcon = document.createElement("i");
            mapIcon.className = "fas fa-map-marker-alt mr-1";
            hostLocationEl.appendChild(mapIcon);
            hostLocationEl.appendChild(document.createTextNode(" " + loc));
            hostLocationEl.dataset.locationSource = "host";
        } else {
            hostLocationEl.classList.add("hidden");
            hostLocationEl.dataset.locationSource = "";
        }
    }

    hostRatingEl.textContent = "New";
    if (hostBadgeEl) hostBadgeEl.classList.toggle('hidden', !hostVerified);

    // F5: Join date, "Fellow Traveller since March 2026"
    if (p.createdAt) {
        try {
            var joinDate = new Date(p.createdAt);
            if (!isNaN(joinDate.getTime())) {
                var monthYear = joinDate.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Melbourne" });
                var joinWrap = document.getElementById("host-join-date");
                var joinText = document.getElementById("host-join-date-text");
                if (joinWrap && joinText) {
                    joinText.textContent = "Fellow Traveller since " + monthYear;
                    joinWrap.classList.remove("hidden");
                }
            }
        } catch (_) {}
    }

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    loadReviews().catch(() => {});
    loadHostExperiences().catch(() => {});
    loadVisibleBookings().catch(() => {});
    loadHostPortfolio().catch(() => {});
}

async function loadHostPortfolio() {
    try {
        var base = String(window.API_BASE || "").replace(/\/$/, "");
        if (!base || !userId) return;
        var res = await fetch(base + "/api/hosts/" + encodeURIComponent(userId) + "/portfolio", {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) return;
        var payload = await res.json().catch(function() { return null; });
        if (!payload || !payload.ok || !payload.data || !payload.data.host) return;
        var host = payload.data.host;
        var El = window.tstsEl;

        // Tier badge, insert next to host name
        var tier = String(host.tier || "").toLowerCase();
        if (tier && tier !== "new") {
            var tierColors = {
                active: "bg-green-100 text-green-700",
                rising: "bg-blue-100 text-blue-700",
                super: "bg-amber-100 text-amber-700",
                elite: "bg-purple-100 text-purple-700"
            };
            var tierLabels = {
                active: "Active Host",
                rising: "Rising Host",
                super: "Super Host",
                elite: "Elite Host"
            };
            var tierBadge = El("span", {
                className: "ml-3 px-3 py-1 rounded-full text-xs font-bold " + (tierColors[tier] || "bg-slate-100 text-slate-700"),
                textContent: tierLabels[tier] || tier
            });
            if (hostNameEl && hostNameEl.parentNode) {
                hostNameEl.parentNode.insertBefore(tierBadge, hostNameEl.nextSibling);
            }
        }

        // Stats row, insert after the header card
        var stats = host.stats || {};
        var headerCard = hostNameEl ? hostNameEl.closest(".bg-white") : null;
        if (headerCard && headerCard.parentNode) {
            var statsGrid = El("div", { className: "grid grid-cols-4 gap-3 mt-8 mb-10" }, [
                El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" }, [
                    El("p", { className: "text-xs uppercase tracking-wide text-slate-400", textContent: "Experiences" }),
                    El("p", { className: "text-lg font-bold text-tsts-ink mt-1", textContent: String(stats.experienceCount || 0) })
                ]),
                El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" }, [
                    El("p", { className: "text-xs uppercase tracking-wide text-slate-400", textContent: "Bookings Completed" }),
                    El("p", { className: "text-lg font-bold text-tsts-ink mt-1", textContent: String(stats.completedBookings || 0) })
                ]),
                El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" }, [
                    El("p", { className: "text-xs uppercase tracking-wide text-slate-400", textContent: "Guests Hosted" }),
                    El("p", { className: "text-lg font-bold text-tsts-ink mt-1", textContent: String(stats.guestsHosted || 0) })
                ]),
                El("div", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center" }, [
                    El("p", { className: "text-xs uppercase tracking-wide text-slate-400", textContent: "Avg Rating" }),
                    El("p", { className: "text-lg font-bold text-tsts-ink mt-1", textContent: stats.avgRating ? String(stats.avgRating) : "New" })
                ])
            ]);
            headerCard.parentNode.insertBefore(statsGrid, headerCard.nextSibling);
        }

        // Update rating display
        if (hostRatingEl && stats.avgRating) {
            hostRatingEl.textContent = String(stats.avgRating) + " avg";
            // 2026-08-25: mark this as the authoritative figure. It is computed over ALL of the host's
            // reviews. loadReviews() only ever holds the 6 most recent, so it must not overwrite this.
            // Same precedence pattern this file already uses for location (dataset.locationSource).
            hostRatingEl.dataset.ratingSource = "stats";
        }
    } catch (_) {}
}

async function loadReviews() {
    if (!reviewsContainer || !reviewsList) return;
    const res = await window.authFetch(`/api/reviews?hostId=${encodeURIComponent(userId)}&limit=6&sort=recent`, { method: "GET" });
    const payload = await res.json().catch(() => null);
    const unwrapped = (payload && payload.data) ? payload.data : payload;
    const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped && Array.isArray(unwrapped.reviews) ? unwrapped.reviews : []);
    if (!res.ok || list.length === 0) return;

    const El = window.tstsEl;
    reviewsContainer.classList.remove('hidden');
    // Owner 2026-08-02 (sir): explore-card ratings deep-link to this host review
    // section; the container is hidden until this reveal, so the browser's initial
    // hash jump finds nothing — honour the hash here, after reveal.
    if (String(location.hash || "") === "#reviews-container") {
        setTimeout(function () { reviewsContainer.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    }
    reviewsList.textContent = '';

    list.forEach(function(r) {
        const rating = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
        const dateStr = r.date ? (window.tstsFormatDateShort ? window.tstsFormatDateShort(r.date) : new Date(r.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" })) : "";
        const comment = (r.comment == null) ? "" : String(r.comment);
        const authorName = r.authorName || 'Guest';

        var card = El('div', { className: 'bg-white/80 p-4 rounded-xl border border-slate-100 shadow-soft-card' }, [
            El('div', { className: 'flex justify-between items-center mb-2' }, [
                El('span', { className: 'font-bold text-tsts-ink text-sm', textContent: authorName }),
                El('span', { className: 'text-xs text-slate-500', textContent: dateStr })
            ]),
            El('div', { className: 'text-yellow-500 text-xs mb-2', textContent: '★'.repeat(rating) + '☆'.repeat(5 - rating) }),
            comment ? El('p', { className: 'text-slate-600 text-sm italic', textContent: '\u201c' + comment + '\u201d' }) : El('span', {})
        ]);
        reviewsList.appendChild(card);
    });

    // 2026-08-25: this block used to overwrite the host's rating with an average of ONLY the 6 reviews
    // this function fetches, labelled "(6 reviews)" — while loadHostPortfolio() sets the real average
    // over ALL of them. Both are fired without await from the same tick, so they RACED: whichever
    // resolved last won, and the rating a visitor saw was not deterministic. Maria's true average is
    // 4.1 over 7 reviews; the 6 shown average 4.5, so this could publish 4.5 as her rating.
    //
    // The authoritative figure now wins. This stays only as a fallback for when the portfolio call
    // fails or returns no average, and it says how many reviews it is based on so the number is never
    // mistaken for the full picture.
    try {
        if (hostRatingEl && hostRatingEl.dataset.ratingSource !== "stats") {
            const ratings = list.map((r) => Number(r.rating)).filter((n) => isFinite(n) && n > 0);
            if (ratings.length > 0) {
                const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                hostRatingEl.textContent = `${avg.toFixed(1)} (${ratings.length} reviews)`;
            }
        }
    } catch (_) {}

    // 2026-08-25: say how many reviews exist when more are held than shown. The list is capped at 6
    // and sorted most-recent-first, so the ones that fall off are the oldest — and nothing on the page
    // acknowledged they existed, leaving a visitor unable to reconcile the average with what they read.
    try {
        const __total = Number(unwrapped && unwrapped.total);
        if (isFinite(__total) && __total > list.length) {
            const __note = El("p", {
                className: "text-xs text-slate-500 mt-3",
                textContent: "Showing " + list.length + " of " + __total + " reviews, most recent first."
            });
            reviewsList.parentNode.insertBefore(__note, reviewsList.nextSibling);
        }
    } catch (_) {}
}

// sir's ruling 2026-08-13: when the host has set no location, name where their
// listings actually are. sir's own caveat drives the wording — a host may run
// listings in several places, so we never claim a single home: one city reads
// "Melbourne", two read "Melbourne & Geelong", three or more read "Melbourne +2
// more". Nothing at all if they have no listings either — silence beats invention.
function applyDerivedLocation(list) {
    if (!hostLocationEl) return;
    if (hostLocationEl.dataset.locationSource === "host") return; // host's own words win
    const cities = [];
    (list || []).forEach((e) => {
        const c = String((e && (e.city || e.suburb)) || "").trim();
        if (c && cities.indexOf(c) === -1) cities.push(c);
    });
    if (!cities.length) { hostLocationEl.classList.add("hidden"); return; }
    let label;
    if (cities.length === 1) label = cities[0];
    else if (cities.length === 2) label = cities[0] + " & " + cities[1];
    else label = cities[0] + " +" + (cities.length - 1) + " more";
    hostLocationEl.textContent = "";
    const mapIcon = document.createElement("i");
    mapIcon.className = "fas fa-map-marker-alt mr-1";
    hostLocationEl.appendChild(mapIcon);
    hostLocationEl.appendChild(document.createTextNode(" " + label));
    hostLocationEl.title = cities.join(", ");
    hostLocationEl.classList.remove("hidden");
}

async function loadHostExperiences() {
    if (!gridEl || !noExpEl) return;
    const params = new URLSearchParams();
    params.set("hostId", userId);
    // 2026-09-08: this section already says the right thing when there is nothing to show and when the
    // platform cannot answer, but said nothing while it waited, so a visitor met an empty box under the
    // heading with no way to tell whether the host has no events or the page is still working.
    noExpEl.textContent = "Loading this host\u2019s experiences\u2026";
    noExpEl.classList.remove("hidden");
    const res = await window.authFetch(`/api/experiences?${params.toString()}`, { method: "GET" });
    const payload = await res.json().catch(() => null);
    const unwrapped = (payload && payload.data) ? payload.data : payload;
    const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped && Array.isArray(unwrapped.experiences) ? unwrapped.experiences : []);

    applyDerivedLocation(list);

    gridEl.textContent = "";
    if (!res.ok) {
        if (noExpEl) {
            noExpEl.textContent = "Unable to load experiences. Please try again later.";
            noExpEl.classList.remove('hidden');
        }
        return;
    }
    if (list.length === 0) {
        if (noExpEl) {
            noExpEl.textContent = "This host has no active listings at the moment.";
            noExpEl.classList.remove('hidden');
        }
        return;
    }

    noExpEl.classList.add('hidden');
    list.forEach(exp => {
        const card = createExperienceCard(exp);
        gridEl.appendChild(card);
    });
}

function createExperienceCard(exp) {
    const El = window.tstsEl;
    const safeUrl = window.tstsSafeUrl;
    const fallbackImg = "/assets/experience-default.jpg";
    const imgUrl = safeUrl(exp.imageUrl || (exp.images && exp.images[0]), fallbackImg);
    const safeId = exp._id || exp.id;

    var imgEl = El('img', { className: 'w-full h-full object-cover group-hover:scale-105 transition duration-500' });
    window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

    var tagsContainer = El('div', { className: 'absolute bottom-3 left-3 flex gap-1' });
    // Audit alignment: the ribbon printed the raw category slug ("food-gatherings" uppercased to
    // FOOD-GATHERINGS). The 8 pillars' display names render instead; unknown tags prettify.
    var __pillarNames = { 'food-gatherings': 'Food & Gatherings', 'explore-outdoors': 'Explore & Outdoors', 'culture-stories': 'Culture & Stories', 'social-nights': 'Social & Nights', 'move-wellness': 'Move & Wellness', 'create-express': 'Create & Express', 'learn-passion': 'Learn & Passion', 'games-play': 'Games & Play' };
    (exp.tags || []).slice(0, 2).forEach(function(tag) {
        var key = String(tag || '').toLowerCase();
        var label = __pillarNames[key] || String(tag || '').replace(/-/g, ' ');
        tagsContainer.appendChild(El('span', { className: 'px-2 py-1 bg-black/60 text-white text-[10px] uppercase font-bold rounded', textContent: label }));
    });
    var visibilityChip = El('span', { className: 'absolute top-3 left-3 inline-flex items-center rounded-full bg-blue-100/90 text-blue-700 px-2 py-1 text-[10px] font-bold', textContent: 'Visible to: Public' });
    const verifiedStatus = String((exp && exp.verifiedStatus) || "").trim().toLowerCase();
    var verifiedChip = null;
    if (verifiedStatus === "verified") {
        verifiedChip = El('span', { className: 'absolute top-3 left-3 mt-7 inline-flex items-center rounded-full bg-blue-100/90 text-blue-700 px-2 py-1 text-[10px] font-bold', textContent: 'Verified event' });
    }

    var markerIcon = El('i', { className: 'fas fa-map-marker-alt text-orange-500' });
    var starIcon = El('i', { className: 'fas fa-star' });
    const rawTitle = String((exp && exp.title) || "").trim();
    const debrandedTitle = rawTitle.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
    const safeTitle = debrandedTitle || ((/^WORLDCLASS_STARTER_/i.test(rawTitle) || /^starter[_\-\s]/i.test(rawTitle)) ? "Shared experience" : (rawTitle || "Shared experience"));
    visibilityChip.addEventListener("click", function(ev) {
        if (!ev) return;
        ev.preventDefault();
        ev.stopPropagation();
    });

    var card = El('a', { href: 'experience.html?id=' + encodeURIComponent(safeId), className: 'group block bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col' }, [
        El('div', { className: 'relative h-48 w-full overflow-hidden bg-gray-100' }, [
            imgEl,
            visibilityChip,
            verifiedChip || El('span', { className: 'hidden', textContent: '' }),
            // Audit alignment: the flag spoke "$70.00 /person" — the approved card money voice is
            // "A$70 / person" (currency-aware, no forced decimals on whole amounts).
            El('div', { className: 'absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm', textContent: (function () {
                var cur = String((exp && exp.currency) || 'aud').toUpperCase();
                var n = Number(exp.price || 0);
                var amt = (n % 1 === 0) ? String(n) : n.toFixed(2);
                return (cur === 'AUD' ? ('A$' + amt) : (cur + ' ' + amt)) + ' / person';
            })() }),
            tagsContainer
        ]),
        El('div', { className: 'p-4 flex flex-col gap-2 flex-grow' }, [
            El('h3', { className: 'font-bold text-gray-900 mb-1 line-clamp-2', textContent: safeTitle, title: safeTitle }),
            El('p', { className: 'text-xs text-gray-500 flex items-center gap-1' }, [markerIcon, ' ' + (exp.city || '')]),
            El('div', { className: 'mt-auto pt-3 border-t border-gray-50 flex justify-between items-center' }, [
                El('div', { className: 'flex items-center text-xs text-yellow-500 gap-1' + ((function () {
                    var r0 = (exp && exp.averageRating != null) ? Number(exp.averageRating) : 0;
                    // Ratings run 1-5, so 0 means no reviews — the approved card rule shows nothing.
                    return (Number.isFinite(r0) && r0 > 0) ? '' : ' hidden';
                })()) }, [
                    starIcon,
                    // BUG-079 (2026-05-15): wrap with Number() + finite guard. The prior
                    // `exp.averageRating.toFixed(1)` threw TypeError if backend returned
                    // a string (Mongo Decimal128 toJSON, lean() field as string) or null.
                    // The truthy-falsy `exp.averageRating ?` also hid a legitimate 0
                    // rating as "New"; check `!= null` + finite to treat 0 correctly.
                    El('span', { className: 'font-bold text-gray-700', textContent: (function () {
                        var r = (exp && exp.averageRating != null) ? Number(exp.averageRating) : null;
                        return (r != null && Number.isFinite(r)) ? r.toFixed(1) : 'New';
                    })() })
                ]),
                El('span', { className: 'text-xs text-orange-600 font-semibold group-hover:underline', textContent: 'View →' })
            ])
        ])
    ]);
    return card;
}

async function loadVisibleBookings() {
    var container = document.getElementById("visible-bookings-container");
    var listEl = document.getElementById("visible-bookings-list");
    if (!container || !listEl || !userId) return;
    // SR-6 (sir's fix-all order 2026-08-20): the server refuses self-lookups here
    // (SELF_REFERENCE 400), so viewing your own profile logged a console error on
    // every load. Skip the call for self-views — your own bookings live in My Experiences.
    try {
        var selfSession = window.tstsGetSession ? await window.tstsGetSession() : null;
        var selfId = (selfSession && selfSession.user && (selfSession.user._id || selfSession.user.id)) ? String(selfSession.user._id || selfSession.user.id) : "";
        if (selfId && selfId === String(userId)) return;
    } catch (_selfErr) { void _selfErr; }
    try {
        var res = await window.authFetch("/api/social/user/" + encodeURIComponent(userId) + "/visible-bookings", { method: "GET" });
        var raw = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            // A refusal used to hide this whole section with no explanation. Most refusals here
            // should stay silent: "not connected" is not news, and this section simply has
            // nothing to show. A blocked pair is different, because the platform sends its own
            // sentence for it and the reader is left staring at a section that vanished, with
            // nothing on the screen saying why.
            var refusal = (raw && raw.data) ? raw.data : raw;
            var refusalCode = String((refusal && refusal.error) || (raw && raw.error) || "");
            var refusalLine = String((refusal && refusal.message) || (raw && raw.message) || "").trim();
            if (refusalCode === "BLOCKED" && refusalLine) {
                container.classList.remove("hidden");
                listEl.textContent = "";
                listEl.appendChild(window.tstsEl("p", { className: "text-sm text-slate-500", textContent: refusalLine }));
            }
            return;
        }
        var d = (raw && raw.data) ? raw.data : raw;
        var bookings = Array.isArray(d) ? d : (Array.isArray(d && d.bookings) ? d.bookings : []);
        if (bookings.length === 0) return;
        container.classList.remove("hidden");
        var El = window.tstsEl;
        bookings.forEach(function (b) {
            var title = String((b.experience && b.experience.title) || b.experienceTitle || "Experience");
            var dateStr = (b.when || b.bookingDate) ? (window.tstsFormatDateShort ? window.tstsFormatDateShort(b.when || b.bookingDate) : new Date(b.when || b.bookingDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" })) : "";
            listEl.appendChild(El("div", { className: "p-4 rounded-xl border border-gray-100 bg-white flex items-center justify-between gap-3" }, [
                El("div", {}, [
                    El("div", { className: "font-bold text-tsts-ink text-sm", textContent: title }),
                    dateStr ? El("div", { className: "text-xs text-slate-500", textContent: dateStr }) : null
                ].filter(Boolean)),
                El("i", { className: "fa-solid fa-calendar-check text-orange-400" })
            ]));
        });
    } catch (_) {}
}

function showError() {
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
}
