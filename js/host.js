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
	  const availableDaysInput = document.getElementById("availableDays");
	  const privateEnabledInput = document.getElementById("privateEnabled");
	  const privateConfigFields = document.getElementById("private-config-fields");
	  const privatePriceInput = document.getElementById("privatePrice");
	  const privateCapacityInput = document.getElementById("privateCapacity");
	  const privateIncludedGuestsInput = document.getElementById("privateIncludedGuests");
	  const privateExtraGuestPriceInput = document.getElementById("privateExtraGuestPrice");
		  const imageInput = document.getElementById("imageInput");
		  const uploadPreview = document.getElementById("upload-preview");
		  const uploadPlaceholder = document.getElementById("upload-placeholder");
		  const submitBtn = document.getElementById("submit-btn");
      const tagLimitHint = document.getElementById("tag-limit-hint");

  const CLOUDINARY_URL = (window.CLOUDINARY_URL || "");

  let isEditing = false;
  let editId = null;
  let existingImageUrl = null;

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
      const sess = await window.tstsGetSession({ force: true });
      if (!sess || !sess.ok || !sess.user) {
        // Fail-closed for protected pages: treat auth probes that are effectively "not authenticated"
        // (including local rate-limit 429 during UAT) as redirect-to-login.
        if (sess && (sess.status === 401 || sess.status === 403 || sess.status === 429)) {
          redirectToLogin();
          return false;
        }
        showNotice("error", "Unable to verify your session. Please refresh and try again.");
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
    const data = await res.json();
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
      if (availableDaysInput) availableDaysInput.value = Array.isArray(exp.availableDays) ? exp.availableDays.join(", ") : String(exp.availableDays || "");
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
      syncPrivateConfigUi();
      setSelectedTags(exp.tags);

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
    });
  }
  syncPrivateConfigUi();

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
        const availableDays = availableDaysInput ? parseAvailableDays(availableDaysInput.value) : [];
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

        const url = isEditing ? ("/api/experiences/" + encodeURIComponent(editId)) : "/api/experiences";
        const method = isEditing ? "PUT" : "POST";

        const res = await window.authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          showNotice("error", "Failed to save experience. Please try again.");
          return;
        }

        showNotice("success", isEditing ? "Experience updated." : "Experience created.");
        setTimeout(() => {
          location.href = "my-bookings.html";
        }, 450);
      } catch (_) {
        showNotice("error", "Something went wrong. Please try again.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  (async function initHostPage() {
    const ok = await requireAuth();
    if (!ok) {
      unmaskAuthGate();
      return;
    }
    await loadEditMode();
    unmaskAuthGate();
  })().catch(function () {
    unmaskAuthGate();
  });
})();
