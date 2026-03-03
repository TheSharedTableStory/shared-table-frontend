(function () {
  const loadingEl = document.getElementById("state-loading");
  const unauthorizedEl = document.getElementById("state-unauthorized");
  const errorEl = document.getElementById("state-error");
  const readyEl = document.getElementById("state-ready");
  const errorMessageEl = document.getElementById("error-message");
  const retryBtn = document.getElementById("retry-btn");
  const exportBtn = document.getElementById("export-btn");
  const deleteBtn = document.getElementById("delete-btn");
  const actionStatusEl = document.getElementById("action-status");
  const loginLinkEl = document.getElementById("login-link");

  const profileFieldsCountEl = document.getElementById("profile-fields-count");
  const bookingsCountEl = document.getElementById("bookings-count");
  const experiencesCountEl = document.getElementById("experiences-count");
  const dataCategoriesEl = document.getElementById("data-categories");
  const exportedAtEl = document.getElementById("exported-at");
  const retentionMetaEl = document.getElementById("retention-meta");

  // Notification preference elements
  const notifPrefsLoading = document.getElementById("notif-prefs-loading");
  const notifPrefsError = document.getElementById("notif-prefs-error");
  const notifPrefsList = document.getElementById("notif-prefs-list");
  const notifPrefsStatus = document.getElementById("notif-prefs-status");

  const NOTIF_KEYS = [
    "bookingConfirmations",
    "bookingReminders",
    "newReviews",
    "communityActivity",
    "hostDigest",
    "promotional"
  ];

  let latestExportPayload = null;

  function showState(which) {
    [loadingEl, unauthorizedEl, errorEl, readyEl].forEach(function (el) {
      if (!el) return;
      el.classList.add("hidden");
    });
    if (which) which.classList.remove("hidden");
  }

  function setActionStatus(message, kind) {
    if (!actionStatusEl) return;
    actionStatusEl.textContent = String(message || "");
    actionStatusEl.classList.remove("text-gray-500", "text-red-600", "text-emerald-700");
    if (kind === "error") actionStatusEl.classList.add("text-red-600");
    else if (kind === "success") actionStatusEl.classList.add("text-emerald-700");
    else actionStatusEl.classList.add("text-gray-500");
  }

  function safeString(value) {
    if (value == null) return "";
    return String(value);
  }

  function formatDate(value) {
    try {
      if (window.tstsFormatDateShort) return window.tstsFormatDateShort(value);
    } catch (_) {}
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  }

  function loginReturnTo() {
    return encodeURIComponent(String((location.pathname || "settings-data.html") + (location.search || "")).replace(/^\//, ""));
  }

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      const sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    if (loginLinkEl) loginLinkEl.href = "login.html?returnTo=" + loginReturnTo();
    showState(unauthorizedEl);
    return false;
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

  function renderExportData(exportData) {
    const data = (exportData && typeof exportData === "object") ? exportData : {};
    const profile = (data.profile && typeof data.profile === "object") ? data.profile : {};
    const bookings = Array.isArray(data.bookings) ? data.bookings : [];
    const experiences = Array.isArray(data.experiences) ? data.experiences : [];
    const profileKeys = Object.keys(profile).filter(Boolean);

    if (profileFieldsCountEl) profileFieldsCountEl.textContent = String(profileKeys.length);
    if (bookingsCountEl) bookingsCountEl.textContent = String(bookings.length);
    if (experiencesCountEl) experiencesCountEl.textContent = String(experiences.length);

    if (dataCategoriesEl) dataCategoriesEl.textContent = "";
    appendDataCategory("Profile", "Your name, handle, profile photo, and bio");
    appendDataCategory("Bookings", bookings.length > 0 ? (String(bookings.length) + " records") : "No bookings stored.");
    appendDataCategory("Hosted listings", experiences.length > 0 ? (String(experiences.length) + " records") : "No hosted listings stored.");

    if (exportedAtEl) {
      const exportedAt = formatDate(data.exportedAt);
      exportedAtEl.textContent = exportedAt ? ("Data snapshot generated on " + exportedAt + ".") : "";
    }
  }

  async function loadPolicyMeta() {
    if (!retentionMetaEl) return;
    try {
      const res = await window.authFetch("/api/policy/active", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload || payload.ok !== true) {
        retentionMetaEl.textContent = "";
        return;
      }
      const policy = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
      const version = safeString(policy && policy.version).trim();
      const effective = formatDate(policy && policy.effectiveFrom);
      if (!version) {
        retentionMetaEl.textContent = "";
        return;
      }
      retentionMetaEl.textContent = effective
        ? ("Current policy: " + version + " (effective " + effective + ").")
        : ("Current policy: " + version + ".");
    } catch (_) {
      retentionMetaEl.textContent = "";
    }
  }

  function buildExportFileName() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return "tsts-data-export-" + yyyy + "-" + mm + "-" + dd + ".json";
  }

  function downloadJsonFile(payload) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildExportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportDataNow() {
    if (!exportBtn) return;
    setActionStatus("Preparing export...", "info");
    exportBtn.disabled = true;
    var previousLabel = exportBtn.textContent;
    exportBtn.textContent = "Preparing...";
    try {
      const res = await window.authFetch("/api/me/export", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.message) ? payload.message : "Data export failed.");
      }
      latestExportPayload = payload;
      downloadJsonFile(payload.data || payload);
      setActionStatus("Export downloaded successfully.", "success");
    } catch (err) {
      setActionStatus((err && err.message) ? err.message : "Data export failed.", "error");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = previousLabel || "Download My Data";
    }
  }

  async function deleteAccountNow() {
    if (!deleteBtn) return;

    // Step 1: Confirm intent
    var confirmed = await window.tstsConfirm(
      "Deleting your account is permanent. All your data, bookings, reviews, and connections will be removed. This cannot be undone.",
      { destructive: true, confirmText: "Delete My Account", cancelText: "Cancel" }
    );
    if (!confirmed) return;

    // Step 2: OTP verification (replaces password prompt)
    var otpToken = await window.tstsOtpVerify("account_delete", {
      message: "To confirm account deletion, verify your identity.",
      actionLabel: "Verify & Delete"
    });
    if (!otpToken) {
      setActionStatus("", "info");
      return;
    }

    setActionStatus("Deleting account...", "info");
    deleteBtn.disabled = true;
    var previousLabel = deleteBtn.textContent;
    deleteBtn.textContent = "Deleting...";
    try {
      var res = await window.authFetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken: otpToken })
      });
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.message) ? payload.message : "Account deletion failed.");
      }
      setActionStatus("Account deleted. Redirecting...", "success");
      try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
      setTimeout(function () {
        location.replace("index.html");
      }, 700);
    } catch (err) {
      setActionStatus((err && err.message) ? err.message : "Account deletion failed.", "error");
      deleteBtn.disabled = false;
      deleteBtn.textContent = previousLabel || "Delete My Account";
    }
  }

  // === F3: Notification Preferences ===

  function showNotifPrefs(which) {
    [notifPrefsLoading, notifPrefsError, notifPrefsList].forEach(function (el) {
      if (el) el.classList.add("hidden");
    });
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

      showNotifPrefs(notifPrefsList);
    } catch (_) {
      if (notifPrefsError) {
        notifPrefsError.textContent = "Unable to load notification preferences.";
        showNotifPrefs(notifPrefsError);
      }
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
      if (!res.ok || !raw || raw.ok !== true) {
        throw new Error((raw && raw.message) ? raw.message : "Save failed");
      }
      // Sync all toggles with server response
      var data = (raw.data && typeof raw.data === "object") ? raw.data : {};
      NOTIF_KEYS.forEach(function (k) {
        var el = document.getElementById("notif-" + k);
        if (el && data.hasOwnProperty(k)) el.checked = !!data[k];
      });
      setNotifStatus("Saved.", "success");
      setTimeout(function () { setNotifStatus("", "info"); }, 2000);
    } catch (err) {
      // Revert toggle on failure
      var el = document.getElementById("notif-" + key);
      if (el) el.checked = !value;
      setNotifStatus((err && err.message) ? err.message : "Save failed.", "error");
    }
  }

  function onNotifToggle(e) {
    var target = e && e.target;
    if (!target) return;
    var id = target.id || "";
    if (!id.startsWith("notif-")) return;
    var key = id.replace("notif-", "");
    if (NOTIF_KEYS.indexOf(key) === -1) return;
    saveNotificationPreference(key, target.checked);
  }

  // === Page Load ===

  async function load() {
    showState(loadingEl);
    setActionStatus("", "info");

    if (!(await requireAuth())) return;

    try {
      const res = await window.authFetch("/api/me/export", { method: "GET" });
      const payload = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403) {
        if (loginLinkEl) loginLinkEl.href = "login.html?returnTo=" + loginReturnTo();
        showState(unauthorizedEl);
        return;
      }
      if (!res.ok || !payload || payload.ok !== true || !payload.data) {
        throw new Error((payload && payload.message) ? payload.message : "Data export payload unavailable.");
      }

      latestExportPayload = payload;
      renderExportData(payload.data);
      await loadPolicyMeta();
      showState(readyEl);

      // Load notification preferences after main content is ready
      loadNotificationPreferences();
    } catch (err) {
      if (errorMessageEl) errorMessageEl.textContent = (err && err.message) ? err.message : "Try again in a moment.";
      showState(errorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (retryBtn) retryBtn.addEventListener("click", load);
    if (exportBtn) exportBtn.addEventListener("click", exportDataNow);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteAccountNow);

    // Wire notification toggle listeners
    NOTIF_KEYS.forEach(function (key) {
      var el = document.getElementById("notif-" + key);
      if (el) el.addEventListener("change", onNotifToggle);
    });

    if (latestExportPayload == null) load();
  });
})();
