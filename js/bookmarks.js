(function () {
  const loadingEl = document.getElementById("state-loading");
  const errorEl = document.getElementById("state-error");
  const emptyEl = document.getElementById("state-empty");
  const gridEl = document.getElementById("grid");
  const retryBtn = document.getElementById("retry-btn");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      const sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    const returnTo = encodeURIComponent("bookmarks.html");
    location.href = "login.html?returnTo=" + returnTo;
    return false;
  }

  function showOnly(which) {
    const all = [loadingEl, errorEl, emptyEl, gridEl];
    all.forEach((el) => { if (el) el.classList.add("hidden"); });
    if (which && which.classList) which.classList.remove("hidden");
  }

  function sanitizeExperienceTitle(raw) {
    const title = String(raw || "").trim();
    const debranded = title.replace(/^world[\s_-]*class\s*[:\-]?\s*/i, "").trim();
    if (debranded) return debranded;
    if (title && !/^WORLDCLASS_STARTER_/i.test(title) && !/^starter[_\-\s]/i.test(title)) return title;
    return "Shared experience";
  }

  function card(exp) {
    const El = window.tstsEl;
    const e = exp || {};
    const fallbackImg = "/assets/experience-default.jpg";
    const imgUrl = window.tstsSafeUrl(e.imageUrl || (Array.isArray(e.images) ? e.images[0] : ""), fallbackImg);
    const price = (e.price == null) ? "" : String(e.price);
    const id = e._id || e.id || "";

    var imgEl = El("img", { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500" });
    window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

    var markerIcon = El("i", { className: "fas fa-map-marker-alt text-orange-500" });

    var a = El("a", { href: "experience.html?id=" + encodeURIComponent(id), className: "group block bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col" }, [
      El("div", { className: "relative h-48 w-full overflow-hidden bg-gray-100" }, [
        imgEl,
        El("div", { className: "absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm", textContent: "$" + price })
      ]),
      El("div", { className: "p-4 flex flex-col gap-2 flex-grow" }, [
        El("h3", { className: "font-bold text-gray-900 mb-1 line-clamp-2", textContent: sanitizeExperienceTitle(e.title), title: sanitizeExperienceTitle(e.title) }),
        El("p", { className: "text-xs text-gray-500 flex items-center gap-1" }, [markerIcon, " " + (e.city || "")]),
        El("div", { className: "mt-auto pt-3 border-t border-gray-50 flex justify-between items-center" }, [
          El("span", { className: "text-xs text-gray-500", textContent: "Saved" }),
          El("span", { className: "text-xs text-orange-600 font-semibold group-hover:underline", textContent: "View →" })
        ])
      ])
    ]);
    return a;
  }

  async function load() {
    if (!(await requireAuth())) return;

    showOnly(loadingEl);

    try {
      const res = await window.authFetch("/api/my/bookmarks/details", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("load_failed");
      const list = window.unwrapApiList(data, "experiences");

      if (!gridEl) return;
      gridEl.textContent = "";

      if (!list || list.length === 0) {
        showOnly(emptyEl);
        return;
      }

      list.forEach((e) => gridEl.appendChild(card(e)));
      showOnly(gridEl);
    } catch (_) {
      showOnly(errorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (retryBtn) retryBtn.addEventListener("click", load);
    load();
  });
})();
