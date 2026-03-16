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

    if (reportUserLinkEl) {
        reportUserLinkEl.href = "report.html?targetType=user&targetId=" + encodeURIComponent(userId);
    }

    // F2: Block user button — only for authenticated users viewing someone else
    var blockBtn = document.getElementById("block-user-btn");
    if (blockBtn) {
        var session = window.tstsGetSession ? await window.tstsGetSession() : null;
        var myId = (session && session.user && (session.user._id || session.user.id)) ? String(session.user._id || session.user.id) : "";
        if (myId && myId !== userId) {
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
                    if (window.tstsNotify) window.tstsNotify("Something went wrong.", "error");
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
                    if (window.tstsNotify) window.tstsNotify("Link copied — share the love!", "success");
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

    // F6: Location from backend — fall back to "Global"
    if (hostLocationEl) {
        var loc = String(p.location || "").trim();
        hostLocationEl.textContent = "";
        var mapIcon = document.createElement("i");
        mapIcon.className = "fas fa-map-marker-alt mr-1";
        hostLocationEl.appendChild(mapIcon);
        hostLocationEl.appendChild(document.createTextNode(" " + (loc || "Global")));
    }

    hostRatingEl.textContent = "New";
    if (hostBadgeEl) hostBadgeEl.classList.toggle('hidden', !hostVerified);

    // F5: Join date — "Fellow Traveller since March 2026"
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

        // Tier badge — insert next to host name
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

        // Stats row — insert after the header card
        var stats = host.stats || {};
        var headerCard = hostNameEl ? hostNameEl.closest(".bg-white") : null;
        if (headerCard && headerCard.parentNode) {
            var statsGrid = El("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 mb-8" }, [
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

    try {
        const ratings = list.map((r) => Number(r.rating)).filter((n) => isFinite(n) && n > 0);
        if (ratings.length > 0) {
            const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            hostRatingEl.textContent = `${avg.toFixed(1)} (${ratings.length} reviews)`;
        }
    } catch (_) {}
}

async function loadHostExperiences() {
    if (!gridEl || !noExpEl) return;
    const params = new URLSearchParams();
    params.set("hostId", userId);
    const res = await window.authFetch(`/api/experiences?${params.toString()}`, { method: "GET" });
    const payload = await res.json().catch(() => null);
    const unwrapped = (payload && payload.data) ? payload.data : payload;
    const list = Array.isArray(unwrapped) ? unwrapped : (unwrapped && Array.isArray(unwrapped.experiences) ? unwrapped.experiences : []);

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
    (exp.tags || []).slice(0, 2).forEach(function(tag) {
        tagsContainer.appendChild(El('span', { className: 'px-2 py-1 bg-black/60 text-white text-[10px] uppercase font-bold rounded', textContent: tag }));
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
            El('div', { className: 'absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm', textContent: '$' + (exp.price || '') }),
            tagsContainer
        ]),
        El('div', { className: 'p-4 flex flex-col gap-2 flex-grow' }, [
            El('h3', { className: 'font-bold text-gray-900 mb-1 line-clamp-2', textContent: safeTitle, title: safeTitle }),
            El('p', { className: 'text-xs text-gray-500 flex items-center gap-1' }, [markerIcon, ' ' + (exp.city || '')]),
            El('div', { className: 'mt-auto pt-3 border-t border-gray-50 flex justify-between items-center' }, [
                El('div', { className: 'flex items-center text-xs text-yellow-500 gap-1' }, [
                    starIcon,
                    El('span', { className: 'font-bold text-gray-700', textContent: exp.averageRating ? exp.averageRating.toFixed(1) : 'New' })
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
    try {
        var res = await window.authFetch("/api/social/user/" + encodeURIComponent(userId) + "/visible-bookings", { method: "GET" });
        var raw = await res.json().catch(function () { return {}; });
        if (!res.ok) return; // silently skip if not connected or self
        var d = (raw && raw.data) ? raw.data : raw;
        var bookings = Array.isArray(d) ? d : (Array.isArray(d && d.bookings) ? d.bookings : []);
        if (bookings.length === 0) return;
        container.classList.remove("hidden");
        var El = window.tstsEl;
        bookings.forEach(function (b) {
            var title = String((b.experience && b.experience.title) || b.experienceTitle || "Experience");
            var dateStr = b.bookingDate || "";
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
