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
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error("Host not found");
        renderProfile(data);
    } catch (err) {
        showError();
    }
});

function renderProfile(profile) {
    const p = (profile && profile.user) ? profile.user : (profile || {});

    hostNameEl.textContent = p.name || "";
    if (p.profilePic && hostPicEl) window.tstsSafeImg(hostPicEl, p.profilePic, "/assets/avatar-default.svg");
    if (p.bio) hostBioEl.textContent = p.bio;

    hostRatingEl.textContent = "New";
    hostBadgeEl.classList.add('hidden');

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    loadReviews().catch(() => {});
    loadHostExperiences().catch(() => {});
}

async function loadReviews() {
    if (!reviewsContainer || !reviewsList) return;
    const res = await window.authFetch(`/api/reviews?hostId=${encodeURIComponent(userId)}&limit=6&sort=recent`, { method: "GET" });
    const payload = await res.json().catch(() => null);
    const list = (payload && payload.ok === true && Array.isArray(payload.reviews)) ? payload.reviews : [];
    if (!res.ok || list.length === 0) return;

    const El = window.tstsEl;
    reviewsContainer.classList.remove('hidden');
    reviewsList.textContent = '';

    list.forEach(function(r) {
        const rating = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
        const dateStr = r.date ? new Date(r.date).toLocaleDateString() : "";
        const comment = (r.comment == null) ? "" : String(r.comment);
        const authorName = r.authorName || 'Guest';

        var card = El('div', { className: 'bg-gray-50 p-4 rounded-xl border border-gray-100' }, [
            El('div', { className: 'flex justify-between items-center mb-2' }, [
                El('span', { className: 'font-bold text-gray-900 text-sm', textContent: authorName }),
                El('span', { className: 'text-xs text-gray-500', textContent: dateStr })
            ]),
            El('div', { className: 'text-yellow-500 text-xs mb-2', textContent: '★'.repeat(rating) + '☆'.repeat(5 - rating) }),
            El('p', { className: 'text-gray-600 text-sm italic', textContent: '"' + comment + '"' })
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
    const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.experiences) ? payload.experiences : []);

    gridEl.textContent = "";
    if (!res.ok || list.length === 0) {
        noExpEl.classList.remove('hidden');
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

    var markerIcon = El('i', { className: 'fas fa-map-marker-alt text-orange-500' });
    var starIcon = El('i', { className: 'fas fa-star' });

    var card = El('a', { href: 'experience.html?id=' + encodeURIComponent(safeId), className: 'group block bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col' }, [
        El('div', { className: 'relative h-48 w-full overflow-hidden bg-gray-100' }, [
            imgEl,
            visibilityChip,
            El('div', { className: 'absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm', textContent: '$' + (exp.price || '') }),
            tagsContainer
        ]),
        El('div', { className: 'p-4 flex flex-col gap-2 flex-grow' }, [
            El('h3', { className: 'font-bold text-gray-900 mb-1 truncate', textContent: exp.title || '' }),
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

function showError() {
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
}
