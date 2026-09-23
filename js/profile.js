(function () {
  const CLOUDINARY_URL = (window.CLOUDINARY_URL || "");

  const form = document.getElementById("profile-form");
  const nameInput = document.getElementById("name");
  const emailDisplay = document.getElementById("email");
  const mobileInput = document.getElementById("mobile");
  const mobileCountryCode = document.getElementById("mobileCountryCode");
  const bioInput = document.getElementById("bio");
  const locationInput = document.getElementById("location");
  const handleInput = document.getElementById("handle");
  const allowHandleSearchToggle = document.getElementById("allow-handle-search");
  const shareToFriendsToggle = document.getElementById("share-to-friends");
  const recommendationEmailToggle = document.getElementById("recommendation-email-toggle");
  const publicProfileToggle = document.getElementById("public-profile-toggle");
  const hostOwnershipWarning = document.getElementById("host-ownership-warning");

  const profilePicInput = document.getElementById("file-upload");
  const profilePicPreview = document.getElementById("profile-pic-preview");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadStatus = document.getElementById("upload-status");
  let previewObjectUrl = "";

  function redirectToLogin() {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace("login.html?returnTo=" + returnTo);
  }

  function handleUnauthorized(res) {
    if (!res) return false;
    if (res.status === 401 || res.status === 403) {
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      redirectToLogin();
      return true;
    }
    return false;
  }

  function setUploadStatus(kind, msg) {
    if (!uploadStatus) return;
    uploadStatus.textContent = msg || "";
    uploadStatus.classList.remove("text-red-600", "text-green-600", "text-gray-500");
    if (kind === "error") uploadStatus.classList.add("text-red-600");
    else if (kind === "success") uploadStatus.classList.add("text-green-600");
    else uploadStatus.classList.add("text-gray-500");
  }

  function syncNavAvatar(url) {
    try {
      const img = document.getElementById("nav-user-pic");
      if (img && url) window.tstsSafeImg(img, url, "/assets/avatar-default.svg");
    } catch (_) {}
  }

  function releasePreviewUrl() {
    try {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = "";
    } catch (_) {}
  }

  function getStoredUser() {
    try { return JSON.parse(localStorage.getItem("tsts_user") || "{}") || {}; } catch (_) { return {}; }
  }
  function setStoredUser(u) {
    try { localStorage.setItem("tsts_user", JSON.stringify(u || {})); } catch (_) {}
  }

  function applyHostOwnershipHintFromQuery() {
    if (!hostOwnershipWarning) return;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const value = String(params.get("hostOwnership") || "").trim().toLowerCase();
      const shouldShow = (value === "ambiguous" || value === "ambiguous_host_name" || value === "needs-handle");
      hostOwnershipWarning.classList.toggle("hidden", !shouldShow);
    } catch (_) {
      hostOwnershipWarning.classList.add("hidden");
    }
  }

  async function loadMe() {
    try {
      if (!window.tstsGetSession) {
        redirectToLogin();
        return;
      }
      const sess = await window.tstsGetSession({ force: true });
      if (!sess || !sess.ok || !sess.user) {
        redirectToLogin();
        return;
      }
      const user = sess.user || {};

      try { if (nameInput) nameInput.value = user.name || ""; } catch (_) {}
      try { if (emailDisplay) emailDisplay.value = user.email || ""; } catch (_) {}
      try {
        if (mobileInput && user.mobile) {
          const knownCodes = ["+61", "+44", "+64", "+65", "+60", "+91", "+1"];
          let matched = false;
          for (const code of knownCodes) {
            if (user.mobile.startsWith(code)) {
              if (mobileCountryCode) mobileCountryCode.value = code;
              mobileInput.value = user.mobile.slice(code.length);
              matched = true;
              break;
            }
          }
          if (!matched) mobileInput.value = user.mobile;
        }
      } catch (_) {}
      try { if (bioInput) bioInput.value = user.bio || ""; } catch (_) {}
      try { if (locationInput) locationInput.value = user.location || ""; } catch (_) {}
      try { if (handleInput) handleInput.value = user.handle || ""; } catch (_) {}
      try { if (allowHandleSearchToggle) allowHandleSearchToggle.checked = !!user.allowHandleSearch; } catch (_) {}
      try { if (shareToFriendsToggle) shareToFriendsToggle.checked = !!user.showExperiencesToFriends; } catch (_) {}
      try { if (recommendationEmailToggle) recommendationEmailToggle.checked = !user.recommendationEmailOptOut; } catch (_) {}
      try { if (publicProfileToggle) publicProfileToggle.checked = !!user.publicProfile; } catch (_) {}

      if (profilePicPreview && user.profilePic) window.tstsSafeImg(profilePicPreview, user.profilePic, "/assets/avatar-default.svg");

      var photoNudge = document.getElementById("photo-nudge");
      if (photoNudge) photoNudge.classList.toggle("hidden", !!user.profilePic);

      const prev = getStoredUser();
      const merged = Object.assign({}, prev, user);
      setStoredUser(merged);
      if (user.profilePic) syncNavAvatar(user.profilePic);
    } catch (_) {}
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
    const directUpload = async () => {
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
          } catch (_) {
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
    };

    const backendUpload = async () => {
      const fd = new FormData();
      fd.append("photos", file);
      const res = await window.authFetch("/api/upload", { method: "POST", body: fd });
      if (handleUnauthorized(res)) throw new Error("unauthorized");
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((out && out.message) ? out.message : "upload_failed");
      const unwrapped = (out && out.data) ? out.data : out;
      const images = (unwrapped && Array.isArray(unwrapped.images)) ? unwrapped.images : [];
      const url = String(images[0] || "");
      if (!url) throw new Error("upload_no_url");
      return url;
    };

    try {
      return await directUpload();
    } catch (_) {
      return await backendUpload();
    }
  }

  if (profilePicInput) {
    profilePicInput.addEventListener("change", function () {
      const f = profilePicInput.files && profilePicInput.files[0];
      if (!f) {
        if (uploadBtn) uploadBtn.classList.add("hidden");
        setUploadStatus("info", "");
        return;
      }
      releasePreviewUrl();
      try {
        previewObjectUrl = URL.createObjectURL(f);
        if (profilePicPreview) window.tstsSafeImg(profilePicPreview, previewObjectUrl, "/assets/avatar-default.svg");
      } catch (_) {}
      if (uploadBtn) uploadBtn.classList.remove("hidden");
      setUploadStatus("info", "Ready to upload.");
      var photoNudge = document.getElementById("photo-nudge");
      if (photoNudge) photoNudge.classList.add("hidden");
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async function () {
      setUploadStatus("info", "");

      const f = profilePicInput && profilePicInput.files && profilePicInput.files[0];
      if (!f) {
        setUploadStatus("error", "Choose an image first.");
        return;
      }

      uploadBtn.disabled = true;

      try {
        setUploadStatus("info", "Uploading…");

        let secureUrl = "";
        try {
          secureUrl = await uploadImage(f);
        } catch (_) {
          // Accept-and-move-on behavior: do not feel broken; tell user cleanly.
          setUploadStatus("error", "We couldn't upload your photo right now. Please try again in a moment.");
          return;
        }

        const res = await window.authFetch("/api/auth/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profilePic: secureUrl })
        });

        if (handleUnauthorized(res)) return;
        if (!res.ok) {
          setUploadStatus("error", "Failed to save your profile picture.");
          return;
        }

        if (profilePicPreview) window.tstsSafeImg(profilePicPreview, secureUrl, "/assets/avatar-default.svg");
        syncNavAvatar(secureUrl);
        if (profilePicInput) profilePicInput.value = "";
        if (uploadBtn) uploadBtn.classList.add("hidden");
        releasePreviewUrl();

        const prev = getStoredUser();
        prev.profilePic = secureUrl;
        setStoredUser(prev);

        setUploadStatus("success", "Profile picture updated.");
      } catch (_) {
        setUploadStatus("error", "We couldn't upload that picture. Please try again.");
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      // BUG-172 (2026-05-19): build a DELTA body — only send a field when its
      // input EXISTS and its value actually CHANGED vs the loaded snapshot.
      // The old code sent every field (and "" for any absent input), so a
      // partial/lazy-rendered form OVERWROTE saved bio/location/handle/mobile
      // with "". Server PUT /api/auth/update is hasOwnProperty-gated, so an
      // omitted key is left untouched. Intentional clears (input present,
      // emptied by the user) still differ from the snapshot -> still sent, so
      // clearing a field deliberately still works (the inferior "treat empty
      // as undefined" option would have broken that).
      const snap = getStoredUser() || {};
      const body = {};
      if (nameInput) {
        const v = String(nameInput.value || "").trim();
        if (v !== String(snap.name || "")) body.name = v;
      }
      if (mobileInput) {
        const mobileLocal = String(mobileInput.value || "").trim();
        const countryCode = mobileCountryCode ? (mobileCountryCode.value || "+61") : "+61";
        const v = mobileLocal ? countryCode + mobileLocal.replace(/^0/, "") : "";
        if (v !== String(snap.mobile || "")) body.mobile = v;
      }
      if (bioInput) {
        const v = String(bioInput.value || "").trim();
        if (v !== String(snap.bio || "")) body.bio = v;
      }
      if (locationInput) {
        const v = String(locationInput.value || "").trim();
        if (v !== String(snap.location || "")) body.location = v;
      }
      if (handleInput) {
        const v = String(handleInput.value || "").trim();
        if (v !== String(snap.handle || "")) body.handle = v;
      }
      if (allowHandleSearchToggle) {
        const v = !!allowHandleSearchToggle.checked;
        if (v !== !!snap.allowHandleSearch) body.allowHandleSearch = v;
      }
      if (shareToFriendsToggle) {
        const v = !!shareToFriendsToggle.checked;
        if (v !== !!snap.showExperiencesToFriends) body.showExperiencesToFriends = v;
      }
      if (recommendationEmailToggle) {
        const v = !recommendationEmailToggle.checked;
        if (v !== !!snap.recommendationEmailOptOut) body.recommendationEmailOptOut = v;
      }
      if (publicProfileToggle) {
        const v = !!publicProfileToggle.checked;
        if (v !== !!snap.publicProfile) body.publicProfile = v;
      }

      if (Object.keys(body).length === 0) {
        setUploadStatus("success", "No changes to save.");
        return;
      }

      try {
        const res = await window.authFetch("/api/auth/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (handleUnauthorized(res)) return;
        if (!res.ok) {
          setUploadStatus("error", "Failed to save profile. Please try again.");
          return;
        }

        setUploadStatus("success", "Profile updated.");
        loadMe();
      } catch (_netErr) {
        setUploadStatus("error", "Failed to save profile. Please try again.");
      }
    });
  }

  // --- Change Email ---
  const changeEmailBtn = document.getElementById("change-email-btn");
  const changeEmailForm = document.getElementById("change-email-form");
  const changeEmailSubmit = document.getElementById("change-email-submit");
  const changeEmailCancel = document.getElementById("change-email-cancel");
  const newEmailInput = document.getElementById("new-email");
  const changeEmailPassword = document.getElementById("change-email-password");
  const changeEmailStatus = document.getElementById("change-email-status");

  function setChangeEmailStatus(kind, msg) {
    if (!changeEmailStatus) return;
    changeEmailStatus.textContent = msg || "";
    changeEmailStatus.classList.remove("hidden", "text-red-600", "text-green-600", "text-gray-500");
    if (!msg) { changeEmailStatus.classList.add("hidden"); return; }
    if (kind === "error") changeEmailStatus.classList.add("text-red-600");
    else if (kind === "success") changeEmailStatus.classList.add("text-green-600");
    else changeEmailStatus.classList.add("text-gray-500");
  }

  if (changeEmailBtn && changeEmailForm) {
    changeEmailBtn.addEventListener("click", function () {
      changeEmailForm.classList.toggle("hidden");
      setChangeEmailStatus("", "");
    });
  }
  if (changeEmailCancel && changeEmailForm) {
    changeEmailCancel.addEventListener("click", function () {
      changeEmailForm.classList.add("hidden");
      setChangeEmailStatus("", "");
      if (newEmailInput) newEmailInput.value = "";
      if (changeEmailPassword) changeEmailPassword.value = "";
    });
  }
  if (changeEmailSubmit) {
    changeEmailSubmit.addEventListener("click", async function () {
      const newEmail = newEmailInput ? String(newEmailInput.value || "").trim() : "";
      const password = changeEmailPassword ? String(changeEmailPassword.value || "") : "";

      if (!newEmail) { setChangeEmailStatus("error", "Please enter a new email address."); return; }
      if (!password) { setChangeEmailStatus("error", "Please enter your current password."); return; }

      // OTP dual-auth verification for email change
      var otpToken = await window.tstsOtpVerify("email_change", {
        message: "To change your email, verify your identity.",
        actionLabel: "Verify & Change"
      });
      if (!otpToken) { return; }

      changeEmailSubmit.disabled = true;
      setChangeEmailStatus("info", "Sending verification...");

      try {
        var __chEmailIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey(changeEmailSubmit) : "";
        const res = await window.authFetch("/api/auth/change-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEmail: newEmail, password: password, otpToken: otpToken }),
          idempotencyKey: __chEmailIdemKey
        });

        if (handleUnauthorized(res)) return;
        const payload = await res.json().catch(function () { return null; });

        if (res.ok && payload && payload.ok) {
          setChangeEmailStatus("success", "Verification email sent to " + newEmail + ". Please check your inbox to confirm the change.");
          if (changeEmailPassword) changeEmailPassword.value = "";
        } else {
          var msg = "Failed to request email change.";
          try {
            if (payload && payload.message) msg = String(payload.message);
            if (payload && payload.error === "SAME_EMAIL") msg = "That's already your current email.";
            if (payload && payload.error === "EMAIL_IN_USE") msg = "That email is already in use by another account.";
            if (payload && payload.error === "INVALID_PASSWORD") msg = "Incorrect password. Please try again.";
          } catch (_) {}
          setChangeEmailStatus("error", msg);
        }
      } catch (_) {
        setChangeEmailStatus("error", "Network error. Please try again.");
      } finally {
        changeEmailSubmit.disabled = false;
      }
    });
  }

  // === Notification Preferences (merged from settings-data.js) ===
  var notifPrefsLoading = document.getElementById("notif-prefs-loading");
  var notifPrefsError = document.getElementById("notif-prefs-error");
  var notifPrefsList = document.getElementById("notif-prefs-list");
  var notifPrefsStatus = document.getElementById("notif-prefs-status");

  // 2026-09-07: "bookingConfirmations" was taken out of this list. The switch for it is gone from the page,
  // because the Privacy Policy says a booking confirmation is always sent and cannot be turned off, and the
  // platform does send it either way. Leaving the key here would look for a control that no longer exists.
  var NOTIF_KEYS = ["bookingReminders","newReviews","communityActivity","hostDigest","promotional"];

  function showNotifPrefs(which) {
    [notifPrefsLoading, notifPrefsError, notifPrefsList].forEach(function (el) { if (el) el.classList.add("hidden"); });
    if (which) which.classList.remove("hidden");
  }

  function setNotifStatus(msg, kind) {
    if (!notifPrefsStatus) return;
    notifPrefsStatus.textContent = String(msg || "");
    notifPrefsStatus.classList.remove("text-gray-500", "text-red-600", "text-emerald-700");
    if (kind === "error") notifPrefsStatus.classList.add("text-red-600");
    else if (kind === "success") notifPrefsStatus.classList.add("text-emerald-700");
    else notifPrefsStatus.classList.add("text-gray-500");
  }

  async function loadNotificationPreferences() {
    showNotifPrefs(notifPrefsLoading);
    setNotifStatus("", "info");
    try {
      var res = await window.authFetch("/api/user/notification-preferences", { method: "GET" });
      var raw = await res.json().catch(function () { return {}; });
      if (!res.ok || !raw || raw.ok !== true) throw new Error("load_failed");
      var data = (raw.data && typeof raw.data === "object") ? raw.data : {};
      NOTIF_KEYS.forEach(function (key) {
        var el = document.getElementById("notif-" + key);
        if (el) el.checked = !!data[key];
      });
      // Also sync recommendation toggle from user profile
      showNotifPrefs(notifPrefsList);
    } catch (_) {
      if (notifPrefsError) { notifPrefsError.textContent = "Unable to load notification preferences."; showNotifPrefs(notifPrefsError); }
    }
  }

  async function saveNotificationPreference(key, value) {
    setNotifStatus("Saving...", "info");
    try {
      var body = {};
      body[key] = value;
      var res = await window.authFetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      var raw = await res.json().catch(function () { return {}; });
      if (!res.ok || !raw || raw.ok !== true) throw new Error("Save failed");
      var data = (raw.data && typeof raw.data === "object") ? raw.data : {};
      NOTIF_KEYS.forEach(function (k) {
        var el = document.getElementById("notif-" + k);
        if (el && data.hasOwnProperty(k)) el.checked = !!data[k];
      });
      setNotifStatus("Saved.", "success");
      setTimeout(function () { setNotifStatus("", "info"); }, 2000);
    } catch (err) {
      var el = document.getElementById("notif-" + key);
      if (el) el.checked = !value;
      setNotifStatus((err && err.message) ? err.message : "Save failed.", "error");
    }
  }

  // Wire notification toggle listeners
  NOTIF_KEYS.forEach(function (key) {
    var el = document.getElementById("notif-" + key);
    if (el) el.addEventListener("change", function () { saveNotificationPreference(key, el.checked); });
  });

  // Recommendation toggle now saves via profile update API (same as before)
  if (recommendationEmailToggle) {
    recommendationEmailToggle.addEventListener("change", async function () {
      var optOut = !recommendationEmailToggle.checked;
      setNotifStatus("Saving...", "info");
      try {
        var res = await window.authFetch("/api/auth/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recommendationEmailOptOut: optOut })
        });
        if (!res.ok) throw new Error("Save failed");
        setNotifStatus("Saved.", "success");
        setTimeout(function () { setNotifStatus("", "info"); }, 2000);
      } catch (_) {
        recommendationEmailToggle.checked = !recommendationEmailToggle.checked;
        setNotifStatus("Save failed.", "error");
      }
    });
  }

  // === Change Password ===
  var cpCurrentEl = document.getElementById("current-password");
  var cpNewEl = document.getElementById("new-password");
  var cpRepeatEl = document.getElementById("repeat-password");
  var cpBtn = document.getElementById("change-password-btn");
  var cpStatusEl = document.getElementById("change-password-status");

  function setCpStatus(kind, msg) {
    if (!cpStatusEl) return;
    cpStatusEl.textContent = msg || "";
    cpStatusEl.classList.remove("hidden", "text-red-600", "text-green-600", "text-gray-500");
    if (!msg) { cpStatusEl.classList.add("hidden"); return; }
    if (kind === "error") cpStatusEl.classList.add("text-red-600");
    else if (kind === "success") cpStatusEl.classList.add("text-green-600");
    else cpStatusEl.classList.add("text-gray-500");
  }

  // Eye toggle for password fields
  document.querySelectorAll(".cp-eye-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetId = btn.getAttribute("data-target");
      var input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      var isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      var icon = btn.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fas fa-eye-slash" : "fas fa-eye";
      }
    });
  });

  if (cpBtn) {
    cpBtn.addEventListener("click", async function () {
      var current = cpCurrentEl ? String(cpCurrentEl.value || "") : "";
      var newPw = cpNewEl ? String(cpNewEl.value || "") : "";
      var repeat = cpRepeatEl ? String(cpRepeatEl.value || "") : "";

      if (!current) { setCpStatus("error", "Please enter your current password."); return; }
      if (!newPw) { setCpStatus("error", "Please enter a new password."); return; }
      if (newPw.length < 8) { setCpStatus("error", "Password must be at least 8 characters."); return; }
      if (!/[a-z]/.test(newPw)) { setCpStatus("error", "Password must include a lowercase letter."); return; }
      if (!/[A-Z]/.test(newPw)) { setCpStatus("error", "Password must include an uppercase letter."); return; }
      if (!/[0-9]/.test(newPw)) { setCpStatus("error", "Password must include a number."); return; }
      if (newPw !== repeat) { setCpStatus("error", "Passwords do not match."); return; }

      cpBtn.disabled = true;
      setCpStatus("info", "Updating...");

      try {
        var res = await window.authFetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: current, newPassword: newPw })
        });

        var payload = await res.json().catch(function () { return null; });

        if (res.ok && payload && payload.ok) {
          if (window.tstsNotify) window.tstsNotify("Password updated.", "success");
          try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
          setTimeout(function () { location.replace("login.html"); }, 700);
          return;
        }

        var msg = "Could not update password.";
        if (payload && payload.error === "INVALID_PASSWORD") msg = "Current password is incorrect.";
        else if (payload && payload.error === "PASSWORD_POLICY") msg = (payload.message || "Password does not meet requirements.");
        else if (payload && payload.message) msg = String(payload.message);
        setCpStatus("error", msg);
      } catch (_) {
        setCpStatus("error", "We couldn't change your password just now. Please try again.");
      } finally {
        cpBtn.disabled = false;
      }
    });
  }

  // === Data & Account (merged from settings-data.js) ===
  var dataCategoriesEl = document.getElementById("data-categories");
  var exportedAtEl = document.getElementById("exported-at");
  var retentionMetaEl = document.getElementById("retention-meta");
  var exportBtn = document.getElementById("export-btn");
  var deleteBtn = document.getElementById("delete-btn");
  var actionStatusEl = document.getElementById("action-status");

  function setActionStatus(message, kind) {
    if (!actionStatusEl) return;
    actionStatusEl.textContent = String(message || "");
    actionStatusEl.classList.remove("text-gray-500", "text-red-600", "text-emerald-700");
    if (kind === "error") actionStatusEl.classList.add("text-red-600");
    else if (kind === "success") actionStatusEl.classList.add("text-emerald-700");
    else actionStatusEl.classList.add("text-gray-500");
  }

  function appendDataCategory(label, value) {
    if (!dataCategoriesEl) return;
    dataCategoriesEl.appendChild(
      window.tstsEl("li", { className: "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50" }, [
        window.tstsEl("span", { className: "font-semibold text-gray-900", textContent: label }),
        window.tstsEl("span", { className: "text-gray-600", textContent: value })
      ])
    );
  }

  async function loadDataSection() {
    try {
      var res = await window.authFetch("/api/me/export", { method: "GET" });
      var payload = await res.json().catch(function () { return null; });
      if (!res.ok || !payload || payload.ok !== true || !payload.data) return;
      var data = payload.data;
      var bookings = Array.isArray(data.bookings) ? data.bookings : [];
      var experiences = Array.isArray(data.experiences) ? data.experiences : [];
      var reviewsWritten = Array.isArray(data.reviewsWritten) ? data.reviewsWritten : [];
      var connections = Array.isArray(data.connections) ? data.connections : [];
      var waitlistEntries = Array.isArray(data.waitlistEntries) ? data.waitlistEntries : [];
      var shortfallPayments = Array.isArray(data.shortfallPayments) ? data.shortfallPayments : [];
      var attendanceIncidents = Array.isArray(data.attendanceIncidents) ? data.attendanceIncidents : [];
      var reportsFiled = Array.isArray(data.reportsFiled) ? data.reportsFiled : [];
      var privateRequestMessages = Array.isArray(data.privateRequestMessages) ? data.privateRequestMessages : [];
      if (dataCategoriesEl) dataCategoriesEl.textContent = "";
      appendDataCategory("Profile", "Your name, handle, profile photo, and bio");
      // SR-5 (sir's fix-all order 2026-08-20): "1 records" → singular/plural agree.
      appendDataCategory("Bookings", bookings.length > 0 ? (String(bookings.length) + (bookings.length === 1 ? " record" : " records")) : "No bookings stored.");
      appendDataCategory("Hosted listings", experiences.length > 0 ? (String(experiences.length) + (experiences.length === 1 ? " record" : " records")) : "No hosted listings stored.");
      // 2026-09-07: the download now carries seven more kinds of record, so the list above the
      // button names them too. A person must be able to see, before pressing it, everything the
      // file will contain.
      appendDataCategory("Reviews you wrote", reviewsWritten.length > 0 ? (String(reviewsWritten.length) + (reviewsWritten.length === 1 ? " record" : " records")) : "No reviews stored.");
      appendDataCategory("Your connections", connections.length > 0 ? (String(connections.length) + (connections.length === 1 ? " record" : " records")) : "No connections stored.");
      appendDataCategory("Waitlist entries", waitlistEntries.length > 0 ? (String(waitlistEntries.length) + (waitlistEntries.length === 1 ? " record" : " records")) : "No waitlist entries stored.");
      appendDataCategory("Notification preferences", "Included in your download.");
      appendDataCategory("Extra payments you made as a host", shortfallPayments.length > 0 ? (String(shortfallPayments.length) + (shortfallPayments.length === 1 ? " record" : " records")) : "No extra payments stored.");
      appendDataCategory("Attendance reports for events you hosted", attendanceIncidents.length > 0 ? (String(attendanceIncidents.length) + (attendanceIncidents.length === 1 ? " record" : " records")) : "No attendance reports stored.");
      appendDataCategory("Reports you filed", reportsFiled.length > 0 ? (String(reportsFiled.length) + (reportsFiled.length === 1 ? " record" : " records")) : "No reports stored.");
      appendDataCategory("Messages you sent about a private booking", privateRequestMessages.length > 0 ? (String(privateRequestMessages.length) + (privateRequestMessages.length === 1 ? " message" : " messages")) : "No messages stored.");
      if (exportedAtEl) {
        var exportedAt = "";
        try { if (window.tstsFormatDateShort) exportedAt = window.tstsFormatDateShort(data.exportedAt); } catch (_) {}
        exportedAtEl.textContent = exportedAt ? ("Data snapshot generated on " + exportedAt + ".") : "";
      }
    } catch (_) {}
    // Load retention policy meta
    try {
      var pRes = await window.authFetch("/api/policy/active", { method: "GET" });
      var pPayload = await pRes.json().catch(function () { return null; });
      if (retentionMetaEl && pRes.ok && pPayload && pPayload.ok === true) {
        var policy = (pPayload.data && pPayload.data.policy) ? pPayload.data.policy : {};
        var version = String((policy && policy.version) || "").trim();
        if (version) {
          var effective = "";
          try { if (window.tstsFormatDateShort) effective = window.tstsFormatDateShort(policy.effectiveFrom); } catch (_) {}
          // Audit alignment (sir's rule: machine values never render — the harness policy version
          // is a raw ISO timestamp): the screen speaks the effective date; the version stays in data.
          retentionMetaEl.textContent = effective ? ("Current policy effective " + effective + ".") : "";
        }
      }
    } catch (_) {}
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async function () {
      setActionStatus("Preparing export...", "info");
      exportBtn.disabled = true;
      var prevLabel = exportBtn.textContent;
      exportBtn.textContent = "Preparing...";
      try {
        var res = await window.authFetch("/api/me/export", { method: "GET" });
        var payload = await res.json().catch(function () { return null; });
        if (!res.ok || !payload || payload.ok !== true) throw new Error("Data export failed.");
        var json = JSON.stringify(payload.data || payload, null, 2);
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        var now = new Date();
        a.download = "tsts-data-export-" + now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0") + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setActionStatus("Export downloaded successfully.", "success");
      } catch (err) {
        setActionStatus((err && err.message) ? err.message : "Data export failed.", "error");
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = prevLabel || "Download My Data";
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function () {
      var confirmed = await window.tstsConfirm(
        "Deleting your account is permanent. Any seat you are still holding for a table that has not happened yet will be cancelled, and whatever the cancellation policy gives back is returned to the card you paid with. We will email you what was cancelled and what is coming back. Your data, bookings, reviews and connections will be removed, and this cannot be undone.",
        { destructive: true, confirmText: "Delete My Account", cancelText: "Cancel" }
      );
      if (!confirmed) return;

      var otpToken = await window.tstsOtpVerify("account_delete", {
        message: "To confirm account deletion, verify your identity.",
        actionLabel: "Verify & Delete"
      });
      if (!otpToken) { setActionStatus("", "info"); return; }

      setActionStatus("Deleting account...", "info");
      deleteBtn.disabled = true;
      var prevLabel = deleteBtn.textContent;
      deleteBtn.textContent = "Deleting...";
      try {
        var __delIdemKey = window.tstsIdempotencyKey ? window.tstsIdempotencyKey(deleteBtn) : "";
        var res = await window.authFetch("/api/auth/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otpToken: otpToken }),
          idempotencyKey: __delIdemKey
        });
        var payload = await res.json().catch(function () { return {}; });
        if (!res.ok || !payload || payload.ok !== true) throw new Error((payload && payload.message) ? payload.message : "Account deletion failed.");
        setActionStatus("Account deleted. Redirecting...", "success");
        try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
        setTimeout(function () { location.replace("index.html"); }, 700);
      } catch (err) {
        setActionStatus((err && err.message) ? err.message : "Account deletion failed.", "error");
        deleteBtn.disabled = false;
        deleteBtn.textContent = prevLabel || "Delete My Account";
      }
    });
  }

  applyHostOwnershipHintFromQuery();
  loadMe().then(function () {
    loadNotificationPreferences();
    loadDataSection();
    loadHostVerificationSection();
  });

  // Owner-spec 2026-05-02, Host verification (KYC) section.
  // Reads current status, surfaces it to the host, lets them upload an ID document
  // (and optional address proof) to a private Cloudinary folder, then POSTs the
  // resulting URLs to /api/host/verification/request.
  async function loadHostVerificationSection() {
    const section = document.getElementById("host-verification-section");
    if (!section) return;
    const statusLine = document.getElementById("host-verification-status-line");
    const card       = document.getElementById("host-verification-card");
    const submitBtn  = document.getElementById("kyc-submit-btn");
    const idTypeEl   = document.getElementById("kyc-id-type");
    const idFileEl   = document.getElementById("kyc-id-file");
    const addrFileEl = document.getElementById("kyc-addr-file");
    const errorEl    = document.getElementById("kyc-error");
    const progressEl = document.getElementById("kyc-progress");
    if (!submitBtn || !idTypeEl || !idFileEl || !addrFileEl) return;

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = String(msg || "");
      errorEl.classList.remove("hidden");
    }
    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }
    function showProgress(msg) {
      if (!progressEl) return;
      progressEl.textContent = String(msg || "");
      progressEl.classList.remove("hidden");
    }
    function clearProgress() {
      if (!progressEl) return;
      progressEl.textContent = "";
      progressEl.classList.add("hidden");
    }

    function setStatusUI(status, payload) {
      const s = String(status || "none").toLowerCase();
      if (!statusLine || !card) return;
      if (s === "verified") {
        statusLine.textContent = "You're a verified host. The badge appears on your listings.";
        card.classList.add("hidden");
      } else if (s === "requested" || s === "under_review") {
        statusLine.textContent = "We're reviewing your verification. We'll write to you once it's decided.";
        card.classList.add("hidden");
      } else if (s === "rejected") {
        const note = (payload && payload.note) ? (", " + String(payload.note)) : "";
        statusLine.textContent = "Your verification was rejected" + note + ". You can re-submit below.";
        card.classList.remove("hidden");
      } else if (s === "revoked") {
        const note = (payload && payload.revokedReason) ? (", " + String(payload.revokedReason)) : "";
        statusLine.textContent = "Your verified status was revoked" + note + ". You can submit a fresh request below.";
        card.classList.remove("hidden");
      } else {
        statusLine.textContent = "Submit a quick ID check to earn the Verified host badge on your listings.";
        card.classList.remove("hidden");
      }
    }

    async function fetchStatus() {
      try {
        const res = await window.authFetch("/api/host/verification/status", { method: "GET" });
        let body = null;
        try { body = await res.json(); } catch (eParse) { void eParse; body = null; }
        if (!res.ok || !body || body.ok !== true) return;
        const hv = (body.data && body.data.hostVerification) || {};
        setStatusUI(hv.status, hv);

        // 2026-08-25: NO ID DOCUMENT SHOULD LEAVE THE DEVICE FOR A REQUEST THAT CANNOT BE GRANTED.
        // The submit handler uploads the ID and proof of address to storage FIRST and only then calls
        // the endpoint — which refuses with NO_LISTINGS unless a listing already exists. So an account
        // with no listing was handing over identity documents for a request that was always going to
        // fail. The status endpoint now reports the same condition (canRequestHostVerification, using
        // the identical query as the refusal), and the form is closed before any upload can start.
        // The sentence shown is the server's own refusal message, not a new one.
        if (body.data && body.data.canRequestHostVerification === false) {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute("title", "Create at least one listing before requesting host verification.");
          }
          if (statusLine) {
            statusLine.textContent = "Create at least one listing before requesting host verification.";
          }
        }
      } catch (eFetch) {
        void eFetch;
      }
    }
    await fetchStatus();

    async function uploadOne(file, folder) {
      const sigRes = await window.authFetch("/api/uploads/cloudinary-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folder })
      });
      let sigBody = null;
      try { sigBody = await sigRes.json(); } catch (eS) { void eS; sigBody = null; }
      if (!sigRes.ok || !sigBody || sigBody.ok !== true) {
        throw new Error("Could not get upload signature.");
      }
      const sd = sigBody.data || {};
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", String(sd.apiKey || ""));
      fd.append("timestamp", String(sd.timestamp || ""));
      fd.append("signature", String(sd.signature || ""));
      fd.append("folder", String(sd.folder || folder));
      if (sd.type) fd.append("type", String(sd.type));
      const upUrl = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(String(sd.cloudName || "")) + "/auto/upload";
      const upRes = await fetch(upUrl, { method: "POST", body: fd });
      if (!upRes.ok) throw new Error("Upload failed.");
      const upBody = await upRes.json();
      return String(upBody.secure_url || upBody.url || "");
    }

    submitBtn.addEventListener("click", async function () {
      clearError();
      clearProgress();
      const idType = String(idTypeEl.value || "").trim();
      if (!idType) { showError("Choose an ID type."); return; }
      const idFile = idFileEl.files && idFileEl.files[0];
      if (!idFile) { showError("Add your ID document."); return; }
      const addrFile = addrFileEl.files && addrFileEl.files[0];
      const totalBytes = (idFile.size || 0) + (addrFile ? (addrFile.size || 0) : 0);
      const MAX = 5 * 1024 * 1024;
      if (totalBytes > MAX) { showError("Documents must be under 5 MB total."); return; }

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Uploading…";
      try {
        showProgress("Uploading ID document…");
        const idUrl = await uploadOne(idFile, "kyc-private");
        let addrUrl = "";
        if (addrFile) {
          showProgress("Uploading proof of address…");
          addrUrl = await uploadOne(addrFile, "kyc-private");
        }
        showProgress("Sending for review…");
        const res = await window.authFetch("/api/host/verification/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idType: idType,
            idDocumentUrl: idUrl,
            proofOfAddressUrl: addrUrl,
            fileBytes: totalBytes
          })
        });
        let body = null;
        try { body = await res.json(); } catch (eR) { void eR; body = null; }
        if (!res.ok || !body || body.ok !== true) {
          const msg = (body && body.message) ? body.message : "Could not submit for review.";
          throw new Error(msg);
        }
        clearProgress();
        if (window.tstsToast) window.tstsToast({ type: "success", message: "Sent for review." });
        await fetchStatus();
      } catch (err) {
        clearProgress();
        showError((err && err.message) ? err.message : "Submission failed.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }
})();
