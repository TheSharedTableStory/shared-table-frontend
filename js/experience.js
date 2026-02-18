// __EXPERIENCE_HARDENED__
// Single-source, defensive experience page logic (no backend dependency reopen)

(function () {
  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (_) { return null; }
  }

  async function isAuthed() {
    try {
      if (!window.tstsGetSession) return false;
      let sess = await window.tstsGetSession({ force: false });
      if (sess && sess.ok && sess.user) return true;
      // Reserve flow must re-probe auth to avoid stale cache/local-hint drift.
      sess = await window.tstsGetSession({ force: true });
      return !!(sess && sess.ok && sess.user);
    } catch (_) {
      return false;
    }
  }

  function redirectToLogin() {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.href = "login.html?returnTo=" + returnTo;
  }

  async function af(path, opts) {
    // STRICT: single truth must come from common.js
    if (window.authFetch == null) {
      window.tstsNotify("App bootstrap error: common.js not loaded.", "error");
      throw new Error("authFetch missing");
    }
    return window.authFetch(path, opts);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val ?? "");
  }

  function setImg(id, url, fallbackOverride) {
    const el = document.getElementById(id);
    if (!el) return;
    const fallback = String(fallbackOverride || "/assets/experience-default.jpg");
    window.tstsSafeImg(el, url, fallback);
  }

  function looksLikeEmail(v) {
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

  function normalizeHostName(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostName || "").trim();
    if (fromTop && !looksLikeEmail(fromTop)) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj.name || "").trim();
    if (fromNested && !looksLikeEmail(fromNested)) return fromNested;
    return "";
  }

  function normalizeHostPic(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostPic || "").trim();
    if (fromTop) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj.avatar || hostObj.profilePic || "").trim();
    if (fromNested) return fromNested;
    return "";
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  }

  function money(n) {
    const num = Number(n || 0);
    return "$" + (Number.isFinite(num) ? num.toFixed(2) : "0.00");
  }

  function moneyNumberString(n) {
    const num = Number(n || 0);
    return Number.isFinite(num) ? num.toFixed(2) : "0.00";
  }

  function toFiniteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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

  function normalizeHostId(expLike) {
    const expObj = expLike || {};
    const fromTop = String(expObj.hostId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromTop)) return fromTop;
    const hostObj = (expObj.host && typeof expObj.host === "object") ? expObj.host : {};
    const fromNested = String(hostObj._id || hostObj.id || "").trim();
    if (/^[a-f0-9]{24}$/i.test(fromNested)) return fromNested;
    return "";
  }

  function publicTitle(raw) {
    const t = String(raw || "").trim();
    const debranded = stripWorldClassPrefix(t);
    if (debranded) return debranded;
    if (t && !isStarterTitle(t)) return t;
    return "Shared experience";
  }

  function publicDescription(expLike) {
    const expObj = expLike || {};
    const raw = String(expObj.description || "").trim();
    if (!raw) return "Details coming soon.";
    return raw;
  }

  function normalizedVerifiedStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "verified") return "verified";
    if (s === "pending") return "pending";
    if (s === "rejected") return "rejected";
    return "none";
  }

  function applyBookingModeButtonState(btn, active, disabled) {
    if (!btn) return;
    btn.classList.remove("bg-tsts-ink", "text-white", "shadow-sm", "bg-white", "text-slate-600", "hover:bg-slate-50", "opacity-50", "cursor-not-allowed");
    if (active) {
      btn.classList.add("bg-tsts-ink", "text-white", "shadow-sm");
    } else {
      btn.classList.add("bg-white", "text-slate-600", "hover:bg-slate-50");
    }
    if (disabled) {
      btn.classList.add("opacity-50", "cursor-not-allowed");
      btn.setAttribute("aria-disabled", "true");
    } else {
      btn.removeAttribute("aria-disabled");
    }
  }

  function restoreSharedGuestOptions() {
    if (!guestInput) return;
    guestInput.disabled = false;
    if (defaultGuestOptionsMarkup) guestInput.innerHTML = defaultGuestOptionsMarkup;

    const target = String(lastSharedGuestCount || "1");
    const hasTarget = Array.from(guestInput.options).some((opt) => String(opt.value || "") === target);
    if (hasTarget) guestInput.value = target;
    else if (guestInput.options.length > 0) guestInput.value = guestInput.options[0].value;
  }

  function setPrivateGuestOptions(capacity) {
    if (!guestInput) return;
    const cap = Math.max(1, Number(capacity) || 1);
    guestInput.disabled = false;
    guestInput.textContent = "";
    for (let i = 1; i <= cap; i += 1) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = i + (i === 1 ? " guest" : " guests");
      guestInput.appendChild(opt);
    }
    const target = String(lastPrivateGuestCount || "1");
    const hasTarget = Array.from(guestInput.options).some((opt) => String(opt.value || "") === target);
    guestInput.value = hasTarget ? target : "1";
  }

  function refreshBookingModeUI() {
    const isPrivate = bookingMode === "private";
    applyBookingModeButtonState(bookingModeSharedBtn, !isPrivate, false);
    applyBookingModeButtonState(bookingModePrivateBtn, isPrivate, !privateBookingEnabled);

    if (guestCountLabelEl) {
      guestCountLabelEl.textContent = "Guests";
    }

    if (isPrivate && privateBookingEnabled) {
      setPrivateGuestOptions(privateCapacity);
    } else {
      restoreSharedGuestOptions();
    }

    if (bookingTypeLabelEl) {
      bookingTypeLabelEl.textContent = isPrivate ? "Private booking" : "Shared experience";
    }
    if (bookingTypeSublineEl) {
      if (isPrivate) bookingTypeSublineEl.textContent = "Exclusive slot for your group.";
      else if (privateBookingEnabled) bookingTypeSublineEl.textContent = "Private option available for this experience.";
      else bookingTypeSublineEl.textContent = "Shared booking only for this experience.";
    }

    if (privateBookingNoteEl) {
      if (!privateBookingEnabled) {
        privateBookingNoteEl.textContent = "Private booking is currently not available for this experience.";
      } else if (isPrivate) {
        const baseNote = (privatePrice != null) ? ("Base private price: " + money(privatePrice) + " covers up to " + String(privateIncludedGuests) + " guests.") : "";
        const extraNote = privateExtraGuestPrice > 0
          ? (" Additional guests up to " + String(privateCapacity) + " are " + money(privateExtraGuestPrice) + " each.")
          : (" Max private group size: " + String(privateCapacity) + " guests.");
        privateBookingNoteEl.textContent = baseNote + extraNote;
      } else {
        privateBookingNoteEl.textContent = "Need the entire slot? Switch to Private booking for an exclusive group experience.";
      }
    }

    if (submitBtn) {
      submitBtn.textContent = isPrivate ? "Book private experience" : "Reserve your seat";
    }
    updateDisplayedPrice();
  }

  function currentPrivateGuests() {
    if (!guestInput) return 1;
    const selected = Number.parseInt(String(guestInput.value || "1"), 10);
    const fallback = Number.isFinite(selected) ? selected : 1;
    const cap = Math.max(1, Number(privateCapacity || 1));
    return Math.max(1, Math.min(cap, fallback));
  }

  function updateDisplayedPrice() {
    if (!expPriceValueEl) return;
    const isPrivate = bookingMode === "private" && privateBookingEnabled;
    if (!isPrivate) {
      expPriceValueEl.textContent = moneyNumberString(sharedUnitPrice);
      if (expPriceSuffixEl) expPriceSuffixEl.textContent = " per guest";
      return;
    }

    const guests = currentPrivateGuests();
    const included = Math.max(1, Number(privateIncludedGuests || 1));
    const base = Number(privatePrice || 0);
    const extra = Math.max(0, Number(privateExtraGuestPrice || 0));
    const extras = Math.max(0, guests - included);
    const total = base + (extras * extra);

    expPriceValueEl.textContent = moneyNumberString(total);
    if (expPriceSuffixEl) expPriceSuffixEl.textContent = " private total";
  }

  function setBookingMode(nextMode) {
    const wanted = String(nextMode || "shared").toLowerCase() === "private" ? "private" : "shared";
    if (wanted === "private" && !privateBookingEnabled) {
      bookingMode = "shared";
    } else {
      bookingMode = wanted;
    }
    refreshBookingModeUI();
  }

  function hydrateBookingMode(e) {
    const capRaw = (e && e.privateCapacity != null) ? e.privateCapacity : 0;
    const cap = toFiniteNumber(capRaw);
    privateCapacity = (cap != null && cap > 0) ? Math.floor(cap) : 0;

    const privatePriceRaw = (e && e.privatePrice != null) ? e.privatePrice : null;
    const pp = toFiniteNumber(privatePriceRaw);
    privatePrice = (pp != null && pp > 0) ? pp : null;

    const includedRaw = (e && e.privateIncludedGuests != null) ? e.privateIncludedGuests : privateCapacity;
    const includedNum = toFiniteNumber(includedRaw);
    privateIncludedGuests = (includedNum != null && includedNum > 0)
      ? Math.min(privateCapacity || Number.MAX_SAFE_INTEGER, Math.floor(includedNum))
      : privateCapacity;

    const extraRaw = (e && e.privateExtraGuestPrice != null) ? e.privateExtraGuestPrice : 0;
    const extraNum = toFiniteNumber(extraRaw);
    privateExtraGuestPrice = (extraNum != null && extraNum >= 0) ? extraNum : 0;

    privateBookingEnabled = privateCapacity > 0 && privatePrice != null;
    if (!privateBookingEnabled) bookingMode = "shared";
    refreshBookingModeUI();
  }

  function showNotFound(msg) {
    const content = document.getElementById("experience-content");
    const empty = document.getElementById("experience-not-found");
    const text = document.getElementById("experience-not-found-text");
    if (content) content.classList.add("hidden");
    if (text) text.textContent = String(msg || "This experience is unavailable or may have been removed.");
    if (empty) empty.classList.remove("hidden");
  }

  const experienceId = qs("id");
  const bookingForm = document.getElementById("booking-form");
  const dateInput = document.getElementById("booking-date");
  const guestInput = document.getElementById("guest-count");
  const timeSlotInput = document.getElementById("time-slot");
  const submitBtn = document.getElementById("book-btn");
  const expPriceValueEl = document.getElementById("exp-price");
  const expPriceSuffixEl = document.getElementById("exp-price-suffix");
  const termsBox = document.getElementById("booking-terms");
  const bookingTypeLabelEl = document.getElementById("booking-type-label");
  const bookingTypeSublineEl = document.getElementById("booking-type-subline");
  const verifiedFeeNoteEl = document.getElementById("verified-fee-note");
  const bookingModeSharedBtn = document.getElementById("booking-mode-shared");
  const bookingModePrivateBtn = document.getElementById("booking-mode-private");
  const privateBookingNoteEl = document.getElementById("private-booking-note");
  const guestCountLabelEl = document.getElementById("guest-count-label");
  const verifiedBadgeEl = document.getElementById("exp-verified-badge");
  const verifiedPendingBadgeEl = document.getElementById("exp-verified-pending-badge");
  const promoCodeInput = document.getElementById("promo-code");

  const bookmarkBtn = document.getElementById("bookmark-btn");
  const bookmarkIcon = document.getElementById("bookmark-icon");
  const bookmarkLabel = document.getElementById("bookmark-label");

  const likeBtn = document.getElementById("like-btn");
  const likeIcon = document.getElementById("like-icon");
  const likeCountEl = document.getElementById("like-count");
  const reportExperienceBtn = document.getElementById("report-experience-btn");

  const similarSection = document.getElementById("similar-section");
  const similarGrid = document.getElementById("similar-grid");

  const featuredReviewContainer = document.getElementById("featured-review-container");

  const reviewsSection = document.getElementById("reviews-section");
  const reviewsList = document.getElementById("reviews-list");

  const commentsSection = document.getElementById("comments-section");
  const commentsList = document.getElementById("comments-list");
  const commentForm = document.getElementById("comment-form");
  const commentText = document.getElementById("comment-text");
  const commentHint = document.getElementById("comment-hint");

  let exp = null;
  let activePolicyVersion = "";
  const TERMS_VERSION = "tsts_terms_v1";
  const defaultGuestOptionsMarkup = guestInput ? String(guestInput.innerHTML || "") : "";
  let bookingMode = "shared";
  let privateBookingEnabled = false;
  let privateCapacity = 0;
  let privatePrice = null;
  let privateIncludedGuests = 0;
  let privateExtraGuestPrice = 0;
  let sharedUnitPrice = 0;
  let lastSharedGuestCount = (guestInput && guestInput.value) ? String(guestInput.value) : "1";
  let lastPrivateGuestCount = "1";

  function normalizeExperience(payload) {
    if (!payload) return null;
    if (payload.experience) return payload.experience;
    if (payload.data && payload.data.experience) return payload.data.experience;
    return payload;
  }

  async function loadExperience() {
    if (!experienceId) {
      showNotFound("This experience link is invalid. Please open a valid experience from Explore.");
      return;
    }

    const res = await af(`/api/experiences/${experienceId}`, { method: "GET" });

    if (res.status === 401 || res.status === 403) {
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      return redirectToLogin();
    }
    if (!res.ok) {
      showNotFound("This experience is unavailable or no longer exists.");
      return;
    }

    const raw = await res.json();
    exp = normalizeExperience(raw);
    if (!exp) {
      showNotFound("This experience could not be loaded.");
      return;
    }
    if (reportExperienceBtn) {
      const reportId = String((exp && (exp._id || exp.id)) || experienceId || "").trim();
      reportExperienceBtn.href = "report.html?targetType=experience&targetId=" + encodeURIComponent(reportId);
    }

    setText("exp-title", publicTitle(exp.title || ""));
    setText("exp-city", exp.city || exp.location || "");
    setText("exp-description", publicDescription(exp));
    const priceNum = Number(exp.price);
    sharedUnitPrice = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0;
    updateDisplayedPrice();

    setImg(
      "main-image",
      exp.imageUrl || (Array.isArray(exp.images) ? exp.images[0] : null)
    );

    if (exp.menu) {
      setText("exp-menu", exp.menu);
      show("menu-section");
    }

    let hostName = normalizeHostName(exp);
    let hostPic = normalizeHostPic(exp);

    // Backfill host display for legacy experiences that were saved without hostName/hostPic.
    if ((!hostName || !hostPic) && /^[a-f0-9]{24}$/i.test(String(exp.hostId || "").trim())) {
      try {
        const profileRes = await af("/api/users/" + encodeURIComponent(String(exp.hostId || "")) + "/profile", { method: "GET" });
        if (profileRes && profileRes.ok) {
          const profile = await profileRes.json().catch(() => ({}));
          if (!hostName) {
            const profileName = String((profile && (profile.name || profile.displayName || profile.fullName)) || "").trim();
            if (profileName && !looksLikeEmail(profileName)) hostName = profileName;
          }
          if (!hostPic) hostPic = String((profile && profile.profilePic) || "").trim();
        }
      } catch (_) {
        // Keep safe fallbacks below.
      }
    }

    const verifiedState = normalizedVerifiedStatus(exp.verifiedStatus);
    const hostFallbackName = (verifiedState === "verified") ? "Verified Host" : "Host";
    setText("host-name", hostName || hostFallbackName);
    setImg("host-pic", hostPic || "", "/assets/avatar-default.svg");
    const hostLinkEl = document.getElementById("host-profile-link");
    const hostCtaEl = document.getElementById("host-profile-cta");
    const hostId = normalizeHostId(exp);
    if (hostLinkEl) {
      if (hostId) {
        hostLinkEl.href = "public-profile.html?id=" + encodeURIComponent(hostId);
        hostLinkEl.classList.remove("cursor-default", "pointer-events-none");
        hostLinkEl.removeAttribute("aria-disabled");
        if (hostCtaEl) hostCtaEl.textContent = "View public profile";
      } else {
        hostLinkEl.removeAttribute("href");
        hostLinkEl.classList.add("cursor-default", "pointer-events-none");
        hostLinkEl.setAttribute("aria-disabled", "true");
        if (hostCtaEl) hostCtaEl.textContent = "Profile unavailable";
      }
    }

    if (verifiedBadgeEl) verifiedBadgeEl.classList.toggle("hidden", verifiedState !== "verified");
    if (verifiedPendingBadgeEl) verifiedPendingBadgeEl.classList.toggle("hidden", verifiedState !== "pending");
    if (verifiedFeeNoteEl) verifiedFeeNoteEl.classList.toggle("hidden", verifiedState !== "verified");

    hydrateBookingMode(exp);
    hydrateTimeSlots(exp);

    if (dateInput) {
      const today = new Date().toISOString().slice(0, 10);
      dateInput.min = today;
      if (!dateInput.value) dateInput.value = today;
    }

    show("experience-content");

    // fire-and-forget secondary panels
    loadPolicyVersion().catch(() => {});
    initBookmarkState().catch(() => {});
    initLikeState().catch(() => {});
    loadReviews().catch(() => {});
    loadSimilar().catch(() => {});
    loadComments().catch(() => {});
  }

  function hydrateTimeSlots(e) {
    if (!timeSlotInput) return;

    const slots = (e && Array.isArray(e.timeSlots) && e.timeSlots.length > 0)
      ? e.timeSlots
      : ["18:00-20:00"];

    timeSlotInput.textContent = "";
    for (const s of slots) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = String(s);
      timeSlotInput.appendChild(opt);
    }
  }

  async function loadPolicyVersion() {
    try {
      const res = await af("/api/policy/active", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true) return "";
      const payload = (data && typeof data === "object") ? data : {};
      const p = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
      const v = String((p && p.version) || "");
      activePolicyVersion = v;
      return v;
    } catch (_) {
      return "";
    }
  }

  function fmtDate(x) {
    try {
      if (window.tstsFormatDateShort) return window.tstsFormatDateShort(x);
    } catch (_) {}
    try {
      const d = new Date(String(x || ""));
      if (isNaN(d.getTime())) return String(x || "");
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (_) {
      return String(x || "");
    }
  }

  function setBookmarkUI(on) {
    if (bookmarkIcon) {
      bookmarkIcon.className = on ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
    }
    if (bookmarkLabel) {
      bookmarkLabel.textContent = on ? "Saved" : "Save";
    }
  }

  function setLikeUI(liked, count) {
    if (likeIcon) likeIcon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
    if (likeCountEl) likeCountEl.textContent = String(Number.isFinite(Number(count)) ? Number(count) : 0);
  }

  async function initBookmarkState() {
    if (!bookmarkBtn) return;
    if (!(await isAuthed())) {
      bookmarkBtn.classList.add("hidden");
      return;
    }

    try {
      const res = await af("/api/my/bookmarks/details", { method: "GET" });
      if (res.status === 401 || res.status === 403) {
        bookmarkBtn.classList.add("hidden");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const list = Array.isArray(data) ? data : [];
      const isOn = list.some((x) => String((x && (x._id || x.id)) || "") === String(experienceId));
      setBookmarkUI(isOn);
    } catch (_) {}

    bookmarkBtn.addEventListener("click", async () => {
      try {
        const res = await af("/api/bookmarks/" + encodeURIComponent(experienceId), { method: "POST" });
        if (res.status === 401 || res.status === 403) return redirectToLogin();
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.message) ? data.message : "Failed");
        const msg = String((data && data.message) || "").toLowerCase();
        if (msg.includes("removed")) setBookmarkUI(false);
        else if (msg.includes("added")) setBookmarkUI(true);
      } catch (e) {
        window.tstsNotify((e && e.message) ? e.message : "Bookmark failed", "error");
      }
    });
  }

  async function initLikeState() {
    if (!likeBtn) return;
    if (!(await isAuthed())) {
      setLikeUI(false, 0);
      likeBtn.addEventListener("click", () => redirectToLogin());
      return;
    }

    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/like", { method: "GET" });
      if (res.status === 401 || res.status === 403) {
        setLikeUI(false, 0);
        likeBtn.addEventListener("click", () => redirectToLogin());
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLikeUI(!!data.liked, data.count);
    } catch (_) {}

    likeBtn.addEventListener("click", async () => {
      try {
        const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/like", { method: "POST" });
        if (res.status === 401 || res.status === 403) return redirectToLogin();
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.message) ? data.message : "Like failed");
        setLikeUI(!!data.liked, data.count);
      } catch (e) {
        window.tstsNotify((e && e.message) ? e.message : "Like failed", "error");
      }
    });
  }

  function buildReviewCard(r) {
    const El = window.tstsEl;
    const rating = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
    const when = r.date ? fmtDate(r.date) : "";
    const name = r.authorName || "Guest";
    const comment = (r.comment == null) ? "" : String(r.comment);

    return El("div", { className: "bg-slate-50/70 border border-slate-200 rounded-2xl p-4" }, [
      El("div", { className: "flex justify-between items-start gap-4" }, [
        El("div", {}, [
          El("div", { className: "font-bold text-slate-900", textContent: name }),
          El("div", { className: "text-xs text-slate-500", textContent: when })
        ]),
        El("div", { className: "text-xs text-yellow-500", textContent: "★".repeat(rating) + "☆".repeat(5 - rating) })
      ]),
      El("p", { className: "text-sm text-slate-700 mt-3 italic", textContent: '"' + comment + '"' })
    ]);
  }

  async function loadReviews() {
    if (!reviewsSection || !reviewsList) return;
    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/reviews", { method: "GET" });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : [];
      if (!res.ok || list.length === 0) return;

      reviewsList.textContent = "";
      list.slice(0, 8).forEach(function(r) {
        reviewsList.appendChild(buildReviewCard(r));
      });

      reviewsSection.classList.remove("hidden");

      if (featuredReviewContainer) {
        const top = list[0];
        if (top) {
          const El = window.tstsEl;
          const rating = Math.max(0, Math.min(5, parseInt(top.rating, 10) || 0));
          featuredReviewContainer.textContent = "";
          featuredReviewContainer.appendChild(
            El("div", {}, [
              El("p", { className: "text-xs uppercase tracking-[0.18em] text-slate-500 mb-1", textContent: "Featured review" }),
              El("div", { className: "flex items-center justify-between gap-3" }, [
                El("p", { className: "font-semibold text-tsts-ink", textContent: top.authorName || "Guest" }),
                El("p", { className: "text-xs text-yellow-500", textContent: "★".repeat(rating) + "☆".repeat(5 - rating) })
              ]),
              El("p", { className: "text-sm text-slate-700 mt-3 italic", textContent: '"' + String(top.comment || "") + '"' })
            ])
          );
          featuredReviewContainer.classList.remove("hidden");
        }
      }
    } catch (_) {}
  }

  async function loadSimilar() {
    if (!similarGrid || !similarSection) return;
    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/similar", { method: "GET" });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : [];
      if (!res.ok || list.length === 0) return;

      const El = window.tstsEl;
      const safeUrl = window.tstsSafeUrl;
      const fallbackImg = "/assets/experience-default.jpg";

      similarGrid.textContent = "";
      list.slice(0, 3).forEach(function(e) {
        const id = e._id || e.id || "";
        const imgUrl = safeUrl(e.imageUrl || (Array.isArray(e.images) ? e.images[0] : ""), fallbackImg);
        const price = (e.price == null) ? "" : String(e.price);

        var imgEl = El("img", { className: "w-full h-full object-cover group-hover:scale-105 transition duration-500" });
        window.tstsSafeImg(imgEl, imgUrl, fallbackImg);

        var a = El("a", { href: "experience.html?id=" + encodeURIComponent(id), className: "group block bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col" }, [
          El("div", { className: "relative h-40 w-full overflow-hidden bg-gray-100" }, [
            imgEl,
            El("div", { className: "absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold shadow-sm", textContent: "$" + price })
          ]),
          El("div", { className: "p-4" }, [
            El("div", { className: "font-bold text-slate-900 truncate", textContent: publicTitle(e.title || "") }),
            El("div", { className: "text-xs text-slate-500 mt-1", textContent: e.city || "" })
          ])
        ]);
        similarGrid.appendChild(a);
      });

      similarSection.classList.remove("hidden");
    } catch (_) {}
  }

  function buildCommentCard(c) {
    const El = window.tstsEl;
    const a = c.author || {};
    const name = a ? (a.name || "User") : "User";
    const when = c.createdAt ? fmtDate(c.createdAt) : "";
    const text = String(c.text || "");

    return El("div", { className: "bg-slate-50/70 border border-slate-200 rounded-2xl p-4" }, [
      El("div", { className: "flex justify-between items-start gap-4" }, [
        El("div", { className: "font-bold text-slate-900", textContent: name }),
        El("div", { className: "text-xs text-slate-500", textContent: when })
      ]),
      El("p", { className: "text-sm text-slate-700 mt-2", textContent: text })
    ]);
  }

  async function loadComments() {
    if (!commentsSection || !commentsList) return;
    if (!(await isAuthed())) {
      commentsSection.classList.remove("hidden");
      if (commentHint) commentHint.textContent = "Login required to view/post comments.";
      if (commentForm) commentForm.classList.add("hidden");
      return;
    }
    try {
      const res = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/comments", { method: "GET" });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        commentsSection.classList.remove("hidden");
        if (commentHint) commentHint.textContent = "Login required to view/post comments.";
        if (commentForm) commentForm.classList.add("hidden");
        return;
      }

      if (res.status === 403) {
        commentsSection.classList.remove("hidden");
        if (commentHint) commentHint.textContent = "Comments are available only to the host and confirmed attendees.";
        if (commentForm) commentForm.classList.add("hidden");
        return;
      }

      const list = Array.isArray(data) ? data : [];
      commentsList.textContent = "";
      list.forEach(function(c) {
        commentsList.appendChild(buildCommentCard(c));
      });

      commentsSection.classList.remove("hidden");
      if (commentHint) commentHint.textContent = "";

      if (commentForm) {
        commentForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const txt = String((commentText && commentText.value) ? commentText.value : "").trim();
          if (!txt) return;
          try {
            const res2 = await af("/api/experiences/" + encodeURIComponent(experienceId) + "/comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: txt })
            });
            const out = await res2.json().catch(() => ({}));
            if (!res2.ok) throw new Error((out && out.message) ? out.message : "Comment failed");
            if (commentText) commentText.value = "";
            loadComments().catch(() => {});
          } catch (err) {
            window.tstsNotify((err && err.message) ? err.message : "Comment failed", "error");
          }
        }, { once: true });
      }
    } catch (_) {
      commentsSection.classList.remove("hidden");
      if (commentHint) commentHint.textContent = "Unable to load comments.";
    }
  }

  if (guestInput) {
    guestInput.addEventListener("change", () => {
      if (bookingMode === "private") {
        lastPrivateGuestCount = String(guestInput.value || "1");
        updateDisplayedPrice();
        return;
      }
      lastSharedGuestCount = String(guestInput.value || "1");
      updateDisplayedPrice();
    });
  }

  if (bookingModeSharedBtn) {
    bookingModeSharedBtn.addEventListener("click", () => setBookingMode("shared"));
  }

  if (bookingModePrivateBtn) {
    bookingModePrivateBtn.addEventListener("click", () => {
      if (!privateBookingEnabled) {
        window.tstsNotify("Private booking is not available for this experience.", "warning");
        return;
      }
      setBookingMode("private");
    });
  }

  refreshBookingModeUI();

  if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!(await isAuthed())) return redirectToLogin();

      if (termsBox && !termsBox.checked) {
        window.tstsNotify("Please accept the cancellation policy.", "warning");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        const policyVer = activePolicyVersion || (await loadPolicyVersion());
        if (!policyVer) {
          window.tstsNotify("Unable to load policy. Please try again.", "error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const isPrivateBooking = bookingMode === "private";
        if (isPrivateBooking && !privateBookingEnabled) {
          window.tstsNotify("Private booking is not available for this experience.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const numGuests = isPrivateBooking
          ? Math.max(1, Number((guestInput && guestInput.value) || 1))
          : Number((guestInput && guestInput.value) || 1);
        const timeSlot = String((timeSlotInput && timeSlotInput.value) || "").trim();
        const bookingDate = String((dateInput && dateInput.value) || "").trim();
        const promoCode = promoCodeInput ? String(promoCodeInput.value || "").trim().toUpperCase() : "";
        if (promoCodeInput) promoCodeInput.value = promoCode;

        if (!bookingDate) {
          window.tstsNotify("Please select a date.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (!timeSlot) {
          window.tstsNotify("Please select a time slot.", "warning");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const res = await af(`/api/experiences/${experienceId}/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingDate: bookingDate,
            timeSlot: timeSlot,
            numGuests: numGuests,
            isPrivate: isPrivateBooking,
            promoCode: promoCode,
            policyVersionAccepted: policyVer,
            termsVersionAccepted: TERMS_VERSION
          })
        });

        if (res.status === 401 || res.status === 403) {
          try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
          return redirectToLogin();
        }

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          let msg = (data && data.message) ? String(data.message) : "Booking failed";
          if (isPrivateBooking && data && data.nextPrivateAvailable && data.nextPrivateAvailable.bookingDate && data.nextPrivateAvailable.timeSlot) {
            msg += " Next available private slot: " + fmtDate(data.nextPrivateAvailable.bookingDate) + " (" + String(data.nextPrivateAvailable.timeSlot) + ").";
          }
          window.tstsNotify(msg, "error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        if (data && data.url) {
          location.href = data.url;
        } else {
          location.href = "success.html";
        }
      } catch (_) {
        window.tstsNotify("Booking failed", "error");
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }


  loadExperience().catch(() => {
    showNotFound("We could not load this experience right now. Please try again.");
  });
})();
