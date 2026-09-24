/* Global runtime configuration for static frontend.
   In production this should be set explicitly (no secrets) via a build/deploy step. */
(function () {
  var cfg = (window.__TSTS_RUNTIME_CONFIG__ && typeof window.__TSTS_RUNTIME_CONFIG__ === "object")
    ? window.__TSTS_RUNTIME_CONFIG__
    : {};

  function readMeta(name) {
    try {
      var el = document.querySelector('meta[name="' + name + '"]');
      if (!el) return "";
      return String(el.getAttribute("content") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function cleanBase(v) {
    return String(v || "").trim().replace(/\/$/, "");
  }

  function cleanUrl(v) {
    return String(v || "").trim();
  }

  // Build-time injected placeholders (optional).
  // NOTE: These are public endpoints (NOT secrets). Render/hosting should inject these at build/deploy time.
  var BUILD_API_BASE = "https://api.thesharedtablestory.com";
  var BUILD_CLOUDINARY_URL = "__TSTS_CLOUDINARY_URL__";

  // Allow either window.__TSTS_RUNTIME_CONFIG__ or meta tags to define public runtime endpoints.
  var apiBase = cleanBase(cfg.API_BASE || cfg.apiBase || readMeta("tsts-api-base"));
  if (apiBase && /\/api$/i.test(apiBase)) apiBase = apiBase.replace(/\/api$/i, "");

  if ((!apiBase || apiBase.charAt(0) === "/") && BUILD_API_BASE && BUILD_API_BASE !== "__TSTS_API_BASE__") {
    apiBase = cleanBase(BUILD_API_BASE);
    if (apiBase && /\/api$/i.test(apiBase)) apiBase = apiBase.replace(/\/api$/i, "");
  }

  // Safety: never allow relative apiBase; relative implies same-origin, which is not valid for our static frontend.
  if (!apiBase || apiBase.charAt(0) === "/") apiBase = "";

  var cloudinaryUrl = cleanUrl(cfg.CLOUDINARY_URL || cfg.cloudinaryUrl || readMeta("tsts-cloudinary-url"));
  if ((!cloudinaryUrl || cloudinaryUrl.charAt(0) === "/") && BUILD_CLOUDINARY_URL && BUILD_CLOUDINARY_URL !== "__TSTS_CLOUDINARY_URL__") {
    cloudinaryUrl = cleanUrl(BUILD_CLOUDINARY_URL);
  }

  window.__TSTS_RUNTIME__ = Object.freeze({
    apiBase: apiBase,
    cloudinaryUrl: cloudinaryUrl
  });
})();
