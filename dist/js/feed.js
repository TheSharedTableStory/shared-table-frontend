(function () {
  const loadingEl = document.getElementById("state-loading");
  const emptyEl = document.getElementById("state-empty");
  const errorEl = document.getElementById("state-error");
  const listEl = document.getElementById("list");
  const retryBtn = document.getElementById("retry-btn");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      const sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    const returnTo = encodeURIComponent("feed.html");
    location.href = "login.html?returnTo=" + returnTo;
    return false;
  }

  function showOnly(which) {
    [loadingEl, emptyEl, errorEl, listEl].forEach((el) => el && el.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
  }

  function renderItem(item) {
    const El = window.tstsEl;
    const safeUrl = window.tstsSafeUrl;
    const fallbackImg = "/assets/experience-default.jpg";
    const fallbackPic = "/assets/avatar-default.svg";

    const it = item || {};
    const guest = it.guest || {};
    const exp = it.experience || {};

    const when = window.tstsFormatDateShort ? window.tstsFormatDateShort(it.when) : String(it.when || "");
    const title = exp.title || "Experience";
    const expId = exp._id || exp.id || it.experienceId || "";
    const imgUrl = safeUrl(exp.imageUrl, fallbackImg);

    const guestName = guest.name || "Friend";
    const guestId = guest._id || guest.id || "";
    const guestPicUrl = safeUrl(guest.profilePic, fallbackPic);
    const handle = guest.handle ? ("@" + guest.handle) : "";

    var expImg = El("img", { className: "w-full h-full object-cover" });
    window.tstsSafeImg(expImg, imgUrl, fallbackImg);

    var guestImg = El("img", { className: "h-10 w-10 rounded-full border border-gray-100 object-cover" });
    window.tstsSafeImg(guestImg, guestPicUrl, fallbackPic);

    var titleLink = El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "font-bold text-gray-900 hover:text-orange-600 transition", textContent: title });
    var whenEl = El("div", { className: "text-xs text-gray-500 mt-1", textContent: when ? ("Booked: " + when) : "" });
    var cityEl = El("div", { className: "text-xs text-gray-500", textContent: exp.city || "" });
    var visibilityChip = El("span", { className: "inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px] font-bold", textContent: "Visible to: Connections" });
    var guestNameEl = El("div", { className: "text-sm font-bold text-gray-900 truncate", textContent: guestName });
    var handleEl = El("div", { className: "text-xs text-gray-500 truncate", textContent: handle });

    var row = El("div", { className: "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" }, [
      El("div", { className: "flex flex-col sm:flex-row" }, [
        El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "sm:w-56 h-40 sm:h-auto bg-gray-100 overflow-hidden" }, [expImg]),
        El("div", { className: "flex-1 p-5" }, [
          El("div", { className: "flex items-start justify-between gap-4" }, [
            El("div", {}, [titleLink, whenEl]),
            El("div", { className: "text-right flex flex-col items-end gap-2" }, [cityEl, visibilityChip])
          ]),
          El("div", { className: "mt-4 flex items-center justify-between gap-4" }, [
            El("a", { href: "public-profile.html?id=" + encodeURIComponent(guestId), className: "flex items-center gap-3 min-w-0" }, [
              guestImg,
              El("div", { className: "min-w-0" }, [guestNameEl, handleEl])
            ]),
            El("a", { href: "public-profile.html?id=" + encodeURIComponent(guestId), className: "text-sm font-bold text-orange-600 hover:underline", textContent: "View profile" })
          ])
        ])
      ])
    ]);

    return row;
  }

  async function load() {
    if (!(await requireAuth())) return;
    showOnly(loadingEl);

    try {
      const res = await window.authFetch("/api/social/feed", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("feed");
      const list = (data && Array.isArray(data.data)) ? data.data : (Array.isArray(data) ? data : []);

      if (!listEl) return;
      listEl.textContent = "";

      if (list.length === 0) {
        showOnly(emptyEl);
        return;
      }

      list.forEach((it) => listEl.appendChild(renderItem(it)));
      showOnly(listEl);
    } catch (_) {
      showOnly(errorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (retryBtn) retryBtn.addEventListener("click", load);
    load();
  });
})();
