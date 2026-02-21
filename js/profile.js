(function () {
  const CLOUDINARY_URL = (window.CLOUDINARY_URL || "");

  const form = document.getElementById("profile-form");
  const nameInput = document.getElementById("name");
  const bioInput = document.getElementById("bio");
  const handleInput = document.getElementById("handle");
  const allowHandleSearchToggle = document.getElementById("allow-handle-search");
  const shareToFriendsToggle = document.getElementById("share-to-friends");
  const recommendationEmailToggle = document.getElementById("recommendation-email-toggle");
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
      try { if (bioInput) bioInput.value = user.bio || ""; } catch (_) {}
      try { if (handleInput) handleInput.value = user.handle || ""; } catch (_) {}
      try { if (allowHandleSearchToggle) allowHandleSearchToggle.checked = !!user.allowHandleSearch; } catch (_) {}
      try { if (shareToFriendsToggle) shareToFriendsToggle.checked = !!user.showExperiencesToFriends; } catch (_) {}
      try { if (recommendationEmailToggle) recommendationEmailToggle.checked = !user.recommendationEmailOptOut; } catch (_) {}

      if (profilePicPreview && user.profilePic) window.tstsSafeImg(profilePicPreview, user.profilePic, "/assets/avatar-default.svg");

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
          setUploadStatus("error", "Image upload is temporarily unavailable. Please try again later.");
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
        setUploadStatus("error", "Something went wrong. Please try again.");
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const name = nameInput ? String(nameInput.value || "").trim() : "";
      const bio = bioInput ? String(bioInput.value || "").trim() : "";
      const handle = handleInput ? String(handleInput.value || "").trim() : "";

      const allowHandleSearch = !!(allowHandleSearchToggle && allowHandleSearchToggle.checked);
      const showExperiencesToFriends = !!(shareToFriendsToggle && shareToFriendsToggle.checked);
      const recommendationEmailOptOut = !(recommendationEmailToggle && recommendationEmailToggle.checked);

      try {
        const res = await window.authFetch("/api/auth/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, bio, handle, allowHandleSearch, showExperiencesToFriends, recommendationEmailOptOut })
        });

        if (handleUnauthorized(res)) return;
        if (!res.ok) {
          setUploadStatus("error", "Failed to save profile. Please try again.");
          return;
        }

        setUploadStatus("success", "Profile updated.");
        loadMe();
      } catch (_) {}
    });
  }

  applyHostOwnershipHintFromQuery();
  loadMe();
})();
