(function () {
  function unmaskAuthGate() {
    try { document.documentElement.removeAttribute("data-auth-pending"); } catch (_) {}
  }

  function redirectToLogin() {
    var returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace("login.html?returnTo=" + returnTo);
  }

	  const form = document.getElementById("create-experience-form");
	  const titleInput = document.getElementById("title");
	  const descriptionInput = document.getElementById("description");
	  const priceInput = document.getElementById("price");
	  const dateInput = document.getElementById("startDate");
	  const endDateInput = document.getElementById("endDate");
	  const timeInput = document.getElementById("startTime");
	  const endTimeInput = document.getElementById("endTime");
	  const locationInput = document.getElementById("city");
	  const suburbInput = document.getElementById("suburb");
	  const postcodeInput = document.getElementById("postcode");
	  const addressLineInput = document.getElementById("addressLine");
	  const addressNotesInput = document.getElementById("addressNotes");
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

  const CLOUDINARY_URL = (window.CLOUDINARY_URL || "");

  let isEditing = false;
  let editId = null;
  let existingImageUrl = null;
  let currentVerifiedStatus = "none";
  let hostVerificationStatus = "none";
  let pendingEventVerificationRequest = false;
  let verificationFeePercent = 5.0;
  let verificationPolicyVersion = "";
  let activePolicySnapshot = null;
  let platformFeeRate = null; // null = policy not yet loaded from API
  let platformFeeBps = null;

  function ensureInlineNotice() {
    let el = document.getElementById("host-inline-notice");
    if (el) return el;

    if (!form) return null;
    el = window.tstsEl("div", {
      id: "host-inline-notice",
      className: "hidden mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
    }, "");
    form.prepend(el);
    return el;
  }

  function showNotice(kind, msg) {
    const el = ensureInlineNotice();
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = msg;

    el.classList.remove("border-red-200", "bg-red-50", "text-red-700", "border-green-200", "bg-green-50", "text-green-700", "border-gray-200", "bg-gray-50", "text-gray-700");

    if (kind === "error") el.classList.add("border-red-200", "bg-red-50", "text-red-700");
    else if (kind === "success") el.classList.add("border-green-200", "bg-green-50", "text-green-700");
    else el.classList.add("border-gray-200", "bg-gray-50", "text-gray-700");
  }

  function hideNotice() {
    const el = document.getElementById("host-inline-notice");
    if (el) el.classList.add("hidden");
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

  function formatMoneyFromCents(centsRaw) {
    const cents = Number(centsRaw);
    if (!Number.isFinite(cents)) return "—";
    return "$" + (cents / 100).toFixed(2) + " AUD";
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

  function computePublicPricingBreakdown(priceRaw) {
    const guestPriceCents = toCents(priceRaw);
    if (!(Number.isFinite(guestPriceCents) && guestPriceCents > 0)) return null;
    const platformFeeCents = Math.max(0, Math.round(Number(guestPriceCents) * platformFeeRate));
    const hostPayoutCents = Math.max(0, Number(guestPriceCents) - platformFeeCents);
    return {
      guestPriceCents: Number(guestPriceCents),
      platformFeeBps: platformFeeBps,
      platformFeeCents: Number(platformFeeCents),
      hostPayoutCents: Number(hostPayoutCents),
    };
  }

  function resolveHostPayoutEstimate(price) {
    const b = computePublicPricingBreakdown(price);
    if (!b) return "—";
    return formatMoneyFromCents(b.hostPayoutCents) + " (after platform fee, before host-funded discounts or recovery offsets)";
  }

  function resolvePlatformFeeEstimate(price) {
    const b = computePublicPricingBreakdown(price);
    if (!b) return "—";
    return "-" + formatMoneyFromCents(b.platformFeeCents) + " (" + String(platformFeeBps / 100) + "% of public price)";
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

  function syncPricingTransparency() {
    if (platformFeeRate === null) {
      // Fee policy not yet loaded — show raw public price (fee-independent) and loading states
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
      if (pricingPolicyReferenceEl) pricingPolicyReferenceEl.textContent = "Loading policy\u2026";
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
      pricingHostChargeNoteEl.textContent = "Estimated payout shown above is after platform fee. Verified-event deduction (if approved) and recovery offsets are host-side payout deductions. No guest surcharge is applied for verification.";
    }
    if (pricingPolicyReferenceEl) {
      const ver = resolvePolicyVersion();
      const feeVer = verificationPolicyVersion ? String(verificationPolicyVersion) : "Unavailable";
      pricingPolicyReferenceEl.textContent = "Policy reference: " + ver + " (booking policy) • " + feeVer + " (verification fee policy " + verificationFeePercent.toFixed(1) + "%).";
    }
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
      activePolicySnapshot = (policy && typeof policy === "object") ? policy : null;
    } catch (_) {
      activePolicySnapshot = null;
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

  async function requestEventVerification(experienceId) {
    const id = String(experienceId || "").trim();
    if (!id) throw new Error("Experience id missing");

    const vr = await window.authFetch("/api/host/experiences/" + encodeURIComponent(id) + "/verified-opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const vrPayload = await vr.json().catch(() => ({}));
    if (!vr.ok) {
      throw new Error(String((vrPayload && vrPayload.message) || "Verification request failed."));
    }
    const updated = (vrPayload && vrPayload.experience) ? vrPayload.experience : vrPayload;
    currentVerifiedStatus = normalizeVerifiedStatus(updated && updated.verifiedStatus);
    pendingEventVerificationRequest = false;
    syncVerifiedUi();
    syncPricingTransparency();
  }

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
        try {
          await requestEventVerification(editId);
          showNotice("success", "Event verification request submitted.");
        } catch (err) {
          showNotice("error", String((err && err.message) || "Verification request failed."));
        }
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

  async function uploadImage(file) {
    if (!CLOUDINARY_URL) throw new Error("upload_not_configured");

    const sig = await getSignature();

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", CLOUDINARY_URL, true);
      xhr.onload = () => {
        try {
          const r = JSON.parse(xhr.responseText || "{}");
          const url = r.secure_url || r.url || "";
          if (!url) return reject(new Error("upload_no_url"));
          resolve(url);
        } catch (e) {
          reject(new Error("upload_parse_error"));
        }
      };
      xhr.onerror = () => reject(new Error("upload_network_error"));

      const fd = new FormData();
      fd.append("file", file);
      fd.append("timestamp", String(sig.timestamp));
      fd.append("signature", String(sig.signature));
      fd.append("api_key", String(sig.apiKey));
      fd.append("folder", String(sig.folder));
      xhr.send(fd);
    });
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
      if (priceInput) priceInput.value = exp.price != null ? String(exp.price) : "";
      if (dateInput) dateInput.value = String(exp.startDate || exp.date || exp.experienceDate || "").slice(0, 10);
      if (endDateInput) endDateInput.value = String(exp.endDate || "").slice(0, 10);

      const ts0 = (Array.isArray(exp.timeSlots) && exp.timeSlots[0]) ? String(exp.timeSlots[0]) : "";
      const tsParts = ts0.split("-");
      const derivedStart = (tsParts[0] || "").trim();
      const derivedEnd = (tsParts[1] || "").trim();

      if (timeInput) timeInput.value = String(exp.startTime || exp.time || derivedStart || "").trim();
      if (endTimeInput) endTimeInput.value = String(exp.endTime || derivedEnd || "").trim();
      if (locationInput) locationInput.value = exp.city || exp.location || "";
      if (suburbInput) suburbInput.value = exp.suburb || "";
      if (postcodeInput) postcodeInput.value = exp.postcode || "";
      if (addressLineInput) addressLineInput.value = exp.addressLine || "";
      if (addressNotesInput) addressNotesInput.value = exp.addressNotes || "";
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

      currentVerifiedStatus = normalizeVerifiedStatus(exp.verifiedStatus);
      pendingEventVerificationRequest = false;
      syncPrivateConfigUi();
      syncVerifiedUi();
      setSelectedTags(exp.tags);
      syncPricingTransparency();

      if (existingImageUrl) setPreview(existingImageUrl);

      if (submitBtn) submitBtn.textContent = "Update Experience";
    } catch (_) {}
  }

  if (imageInput) {
    imageInput.addEventListener("change", function () {
      hideNotice();
      try {
        const f = imageInput.files && imageInput.files[0];
        if (!f) return;
        const localUrl = URL.createObjectURL(f);
        setPreview(localUrl);
        // Show a local file preview via FileReader
        var reader = new FileReader();
        reader.onload = function (e) {
          var previewImg = document.getElementById("upload-preview-img");
          if (previewImg) previewImg.src = e.target.result;
        };
        reader.readAsDataURL(f);
      } catch (_) {}
    });
  }

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

  // DATE-GUARD-001: Prevent past-date selection (local timezone)
  (function () {
    var _d = new Date();
    var _today = new Date(_d.getTime() - _d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
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
        const capacity = maxGuestsInput ? safeNum(maxGuestsInput.value) : null;
        const availableDays = Array.from(document.querySelectorAll('input[name="availableDays"]:checked')).map(function (cb) { return cb.value; });
        const tags = getSelectedTags();
        const privateEnabled = !!(privateEnabledInput && privateEnabledInput.checked);
        const privatePrice = privatePriceInput ? safeNum(privatePriceInput.value) : null;
        const privateCapacity = privateCapacityInput ? safeNum(privateCapacityInput.value) : null;
        const privateIncludedGuests = privateIncludedGuestsInput ? safeNum(privateIncludedGuestsInput.value) : null;
        const privateExtraGuestPrice = privateExtraGuestPriceInput ? safeNum(privateExtraGuestPriceInput.value) : null;

        if (!title || !description || price == null || !startDate || !endDate || !startTime || !city || !suburb || !postcode || !addressLine || capacity == null) {
          showNotice("error", "Please fill all required fields.");
          return;
        }
        if (!tags || tags.length < 1) {
          showNotice("error", "Please select at least one category (up to 2).");
          return;
        }
        if (!/^[0-9]{4}$/.test(postcode)) {
          showNotice("error", "Postcode must be 4 digits.");
          return;
        }
        if (new Date(endDate) < new Date(startDate)) {
          showNotice("error", "End date must be on or after start date.");
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

        let imageUrl = existingImageUrl || "";

        // If user selected a new image, try upload. If upload fails, do NOT break the entire flow.
        if (imageInput && imageInput.files && imageInput.files.length > 0) {
          const file = imageInput.files[0];
          try {
            showNotice("info", "Uploading image…");
            imageUrl = await uploadImage(file);
            showNotice("success", "Image uploaded.");
          } catch (err) {
            // Accept-and-move-on behavior: keep existing image, allow save to proceed.
            showNotice("error", "Image upload is temporarily unavailable. Your experience will be saved without changing the image.");
            imageUrl = existingImageUrl || "";
          }
        }

        const body = {
          title,
          description,
          price,
          city,
          suburb,
          postcode,
          addressLine,
          addressNotes,
          capacity: Math.max(1, Math.floor(Number(capacity))),
          startDate,
          endDate,
          startTime,
          availableDays,
          tags
        };
        if (endTime) body.endTime = endTime;
        if (startTime && endTime) body.timeSlots = [startTime + "-" + endTime];
        if (imageUrl) body.imageUrl = imageUrl;
        else body.imageUrl = "/assets/experience-default.jpg";
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

        const url = isEditing ? ("/api/experiences/" + encodeURIComponent(editId)) : "/api/experiences";
        const method = isEditing ? "PUT" : "POST";

        const res = await window.authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          var errCode = (payload && payload.error) || "";
          if (errCode === "CUTOFF_EDIT_LOCKED") {
            if (cutoffLockedBanner) cutoffLockedBanner.classList.remove("hidden");
          } else if (errCode === "CAPACITY_EXCEEDS_BUFFER_LIMIT" || errCode === "CAPACITY_BELOW_BOOKED") {
            if (window.tstsNotify) window.tstsNotify(String(payload.message || errCode), "warning");
          } else if (errCode === "INVALID_TIMEZONE") {
            if (window.tstsNotify) window.tstsNotify("Invalid timezone selected.", "warning");
          }
          showNotice("error", String((payload && payload.message) || "Failed to save experience. Please try again."));
          return;
        }
        if (cutoffLockedBanner) cutoffLockedBanner.classList.add("hidden");

        const savedExp = (payload && payload.experience) ? payload.experience : ((payload && payload.data) ? payload.data : payload);
        const savedExperienceId = String((savedExp && (savedExp._id || savedExp.id)) || editId || "").trim();
        const wantsVerified = !!pendingEventVerificationRequest;
        if (
          wantsVerified &&
          savedExperienceId &&
          currentVerifiedStatus !== "verified" &&
          currentVerifiedStatus !== "pending" &&
          normalizeHostVerificationStatus(hostVerificationStatus) === "verified"
        ) {
          try {
            await requestEventVerification(savedExperienceId);
          } catch (err) {
            showNotice("error", "Experience saved, but verification request failed: " + String((err && err.message) || "Unknown error"));
            return;
          }
        }

        showNotice("success", isEditing ? "Experience updated." : "Experience published.");
        // Reset to create mode after save
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
        await loadHostListings();
      } catch (_) {
        showNotice("error", "Something went wrong. Please try again.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function statusBadge(status) {
    var badges = { DRAFT: "bg-gray-100 text-gray-600", PENDING_REVIEW: "bg-amber-100 text-amber-700", ACTIVE: "bg-green-100 text-green-700", PAUSED: "bg-orange-100 text-orange-700", DELETED_SOFT: "bg-red-100 text-red-700" };
    var labels = { DRAFT: "Draft", PENDING_REVIEW: "Pending Review", ACTIVE: "Active", PAUSED: "Paused", DELETED_SOFT: "Deleted" };
    var cls = badges[status] || "bg-gray-100 text-gray-600";
    var label = labels[status] || status;
    return '<span class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold ' + cls + '">' + (window.tstsText ? window.tstsText(label) : label) + '</span>';
  }

  function renderListingCard(exp) {
    var El = window.tstsEl;
    var id = String((exp && (exp._id || exp.id)) || "");
    var rawTitle = String((exp && exp.title) || "Untitled");
    var status = String((exp && exp.status) || "ACTIVE");
    var labels = { ACTIVE: "Active", PAUSED: "Paused", DRAFT: "Draft", PENDING_REVIEW: "In Review", DELETED_SOFT: "Deleted" };
    var badgeClasses = {
      ACTIVE: "bg-green-100 text-green-800",
      PAUSED: "bg-yellow-100 text-yellow-800",
      DRAFT: "bg-gray-100 text-gray-600",
      PENDING_REVIEW: "bg-blue-100 text-blue-800",
      DELETED_SOFT: "bg-red-100 text-red-800"
    };
    var badgeEl = El("span", { className: "inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + (badgeClasses[status] || "bg-gray-100 text-gray-600"), textContent: labels[status] || status });
    var titleEl = El("span", { className: "font-semibold text-gray-900 text-sm truncate", textContent: rawTitle });

    var actionBtns = [];
    function makeBtn(label, cls, action) {
      var btn = El("button", { type: "button", className: "text-xs px-3 py-1.5 rounded-lg transition " + cls, textContent: label });
      btn.addEventListener("click", function () {
        if (action === "edit") loadListingForEdit(id);
        else doStatusAction(id, action);
      });
      return btn;
    }
    if (status === "ACTIVE") {
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
      actionBtns.push(makeBtn("Pause", "border border-orange-300 text-orange-700 hover:bg-orange-50", "pause"));
    } else if (status === "PAUSED") {
      actionBtns.push(makeBtn("Resume", "bg-green-600 text-white hover:bg-green-700", "resume"));
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
    } else if (status === "DRAFT" || status === "PENDING_REVIEW") {
      actionBtns.push(makeBtn("Edit", "border border-gray-300 text-gray-600 hover:bg-gray-50", "edit"));
    }

    var li = El("div", { className: "flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" }, [
      El("div", { className: "flex items-center gap-3 min-w-0" }, [titleEl, badgeEl]),
      El("div", { className: "flex items-center gap-2 flex-shrink-0" }, actionBtns)
    ]);
    return li;
  }

  async function loadHostListings() {
    var loadingEl = document.getElementById("my-listings-loading");
    var emptyEl = document.getElementById("my-listings-empty");
    var errorEl = document.getElementById("my-listings-error");
    var listEl = document.getElementById("my-listings-list");
    if (!listEl) return;
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    if (errorEl) errorEl.classList.add("hidden");
    listEl.classList.add("hidden");
    listEl.textContent = "";
    try {
      var res = await window.authFetch("/api/host/experiences");
      if (!res.ok) { throw new Error("Failed"); }
      var data = await res.json().catch(function () { return {}; });
      var unwrapped = (data && data.data !== undefined) ? data.data : data;
      var exps = Array.isArray(unwrapped) ? unwrapped : (unwrapped && unwrapped.experiences ? unwrapped.experiences : []);
      if (loadingEl) loadingEl.classList.add("hidden");
      if (!exps || exps.length === 0) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      exps.forEach(function (exp) { listEl.appendChild(renderListingCard(exp)); });
      listEl.classList.remove("hidden");
    } catch (_) {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (errorEl) errorEl.classList.remove("hidden");
    }
  }

  async function doStatusAction(id, action) {
    try {
      var res = await window.authFetch("/api/experiences/" + encodeURIComponent(id) + "/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action })
      });
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (window.tstsNotify) window.tstsNotify(String((payload && payload.message) || "Action failed. Please try again."), "error");
        return;
      }
      await loadHostListings();
    } catch (_) {
      if (window.tstsNotify) window.tstsNotify("Action failed. Please try again.", "error");
    }
  }

  async function loadListingForEdit(id) {
    try {
      var res = await window.authFetch("/api/experiences/" + encodeURIComponent(id));
      if (!res.ok) { if (window.tstsNotify) window.tstsNotify("Could not load listing.", "error"); return; }
      var expRaw = await res.json().catch(function () { return null; });
      if (!expRaw) { if (window.tstsNotify) window.tstsNotify("Could not load listing.", "error"); return; }
      var exp = (expRaw && expRaw.data) ? expRaw.data : expRaw;
      isEditing = true;
      editId = id;
      existingImageUrl = exp.imageUrl || "";
      currentVerifiedStatus = exp.verifiedStatus || "none";
      if (titleInput) titleInput.value = String(exp.title || "");
      if (descriptionInput) descriptionInput.value = String(exp.description || "");
      if (priceInput) priceInput.value = String(exp.price != null ? exp.price : "");
      if (dateInput) dateInput.value = String(exp.startDate || "");
      if (endDateInput) endDateInput.value = String(exp.endDate || "");
      if (timeInput) timeInput.value = String(exp.startTime || "");
      if (endTimeInput) endTimeInput.value = String(exp.endTime || "");
      if (locationInput) locationInput.value = String(exp.city || "");
      if (suburbInput) suburbInput.value = String(exp.suburb || "");
      if (postcodeInput) postcodeInput.value = String(exp.postcode || "");
      if (addressLineInput) addressLineInput.value = String(exp.addressLine || "");
      if (addressNotesInput) addressNotesInput.value = String(exp.addressNotes || "");
      if (maxGuestsInput) maxGuestsInput.value = String(exp.maxGuests != null ? exp.maxGuests : "");
      // Populate availableDays checkboxes from stored data
      (function () {
        var rawDays = Array.isArray(exp.availableDays) ? exp.availableDays : parseAvailableDays(exp.availableDays);
        var daySet = new Set(rawDays.map(function (d) { return String(d || "").trim(); }));
        var cbs = document.querySelectorAll('input[name="availableDays"]');
        for (var i = 0; i < cbs.length; i++) { cbs[i].checked = daySet.has(cbs[i].value); }
      })();
      var tagCheckboxes = document.querySelectorAll('input[name="tags"]');
      var expTags = Array.isArray(exp.tags) ? exp.tags : [];
      tagCheckboxes.forEach(function (cb) { cb.checked = expTags.includes(cb.value); });
      syncTagLimitUI();
      var hasPrivate = !!(exp.privatePrice && Number(exp.privatePrice) > 0);
      if (privateEnabledInput) privateEnabledInput.checked = hasPrivate;
      syncPrivateConfigUi();
      if (hasPrivate) {
        if (privatePriceInput) privatePriceInput.value = String(exp.privatePrice || "");
        if (privateCapacityInput) privateCapacityInput.value = String(exp.privateCapacity || "");
        if (privateIncludedGuestsInput) privateIncludedGuestsInput.value = String(exp.privateIncludedGuests || "");
        if (privateExtraGuestPriceInput) privateExtraGuestPriceInput.value = String(exp.privateExtraGuestPrice || "");
      }
      // Hydrate booking controls
      if (timezoneInput) timezoneInput.value = exp.timezone || "Australia/Melbourne";
      if (cutoffEnabledInput) cutoffEnabledInput.checked = (exp.bookingCutoffEnabled !== false);
      if (cutoffHoursInput) cutoffHoursInput.value = String(Math.round((exp.bookingCutoffMinutes || 1440) / 60));
      syncCutoffUi();

      var hiddenId = document.getElementById("editing-experience-id");
      if (hiddenId) hiddenId.value = id;
      if (submitBtn) submitBtn.textContent = "Save Changes";
      syncVerifiedUi();
      syncPricingTransparency();
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {
      if (window.tstsNotify) window.tstsNotify("Could not load listing for editing.", "error");
    }
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

  (async function initHostPage() {
    const ok = await requireAuth();
    if (!ok) {
      unmaskAuthGate();
      return;
    }
    await loadEditMode();
    await loadHostVerificationStatus();
    await loadActivePolicySnapshot();
    syncPricingTransparency();
    loadHostListings();
    unmaskAuthGate();
  })().catch(function () {
    unmaskAuthGate();
  });
})();
