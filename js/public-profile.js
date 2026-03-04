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

    hostRatingEl.textContent = "New";
    if (hostBadgeEl) hostBadgeEl.classList.toggle('hidden', !hostVerified);

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    loadReviews().catch(() => {});
    loadHostExperiences().catch(() => {});
    loadVisibleBookings().catch(() => {});
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
