// tsts-scroll-top-guard (global)
// Purpose: prevent Safari/Back-Forward Cache scroll restoration landing mid-page.
(function(){
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    function reset(e){
      if (location.hash) return;
      if (e && e.persisted) { window.scrollTo(0, 0); return; }
      window.scrollTo(0, 0);
    }

    window.addEventListener("DOMContentLoaded", reset);
    window.addEventListener("pageshow", reset);
  } catch (_) {}
})();

/* ================================
   TSTS COMMON (single truth)
   - API base
   - auth helpers
   - navbar/footer injection
   - DOM XSS-safe helpers
   ================================ */

// WS-FE-05: Helper version marker for reliable validation
window.__TSTS_HELPERS_VERSION__ = "2026.01.19";

// XSS-safe DOM helpers
window.tstsSetText = function(el, value) {
  if (!el) return;
  el.textContent = (value == null) ? "" : String(value);
};

window.tstsEl = function(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(key) {
      const v = attrs[key];
      const isDev = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
      function blocked(k) {
        if (isDev) throw new Error("Blocked unsafe attribute: " + k);
        return;
      }

      if (key === "innerHTML" || key === "outerHTML" || key === "srcdoc") {
        blocked(key);
        return;
      }

      if (key === "className") {
        el.className = v;
      } else if (key === "textContent") {
        el.textContent = v;
      } else if (key === "dataset") {
        if (v == null) return;
        if (typeof v !== "object" || Array.isArray(v)) {
          blocked("dataset");
          return;
        }
        Object.keys(v).forEach(function(dk) {
          try {
            if (v[dk] == null) return;
            el.dataset[dk] = String(v[dk]);
          } catch (_) {}
        });
      } else if (key === "style") {
        if (v == null) return;
        if (typeof v !== "object" || Array.isArray(v)) {
          blocked("style");
          return;
        }
        Object.keys(v).forEach(function(sk) {
          try {
            if (v[sk] == null) return;
            el.style[sk] = String(v[sk]);
          } catch (_) {}
        });
      } else if (key.startsWith("on")) {
        if (typeof v === "function") {
          el.addEventListener(key.slice(2).toLowerCase(), v);
        } else if (typeof v === "string") {
          blocked(key);
        }
      } else if (key.startsWith("data-")) {
        el.setAttribute(key, v);
      } else {
        if (typeof v === "function") return;
        try { el[key] = v; } catch (_) {}
      }
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(function(child) {
      if (child == null) return;
      if (typeof child === "string" || typeof child === "number") {
        el.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
  }
  return el;
};

window.tstsSafeUrl = function(url, fallback) {
  if (!url || typeof url !== "string") return fallback || "";
  const raw = url.trim();
  const trimmed = raw.toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return fallback || "";
  }
  if (trimmed.startsWith("//")) {
    return fallback || "";
  }

  const hasColon = trimmed.indexOf(":") !== -1;
  if (hasColon && !(trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
    return fallback || "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return raw;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return raw;
  if (trimmed.startsWith("#")) return raw;
  return raw;
};

window.tstsSafeImg = function(imgEl, url, fallback) {
  if (!imgEl) return;
  const fb = fallback || "/assets/experience-default.jpg";
  const safeUrl = window.tstsSafeUrl(url, fb);
  imgEl.src = safeUrl || fb;
  imgEl.addEventListener("error", function() { imgEl.src = fb; }, { once: true });
};

// WS-FE-06: Safe mailto helper - prevents href injection
window.tstsSafeMailto = function(email) {
  if (!email || typeof email !== "string") return "";
  var trimmed = email.trim();
  if (!trimmed) return "";
  // Reject if contains dangerous characters: spaces, newlines, control chars, colons, angle brackets
  if (/[\s\n\r\x00-\x1f:<>]/.test(trimmed)) return "";
  // Reject if looks like a protocol
  if (/^[a-z]+:/i.test(trimmed)) return "";
  // Basic email pattern: must have @ and at least one dot after @
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "";
  return "mailto:" + trimmed;
};

// WS-FE-07: Branded toast notification (replaces alert())
(function() {
  var toastContainer = null;

  function ensureContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = window.tstsEl("div", {
      id: "tsts-toast-container",
      className: "fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    });
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  window.tstsNotify = function(msg, type) {
    var t = String(type || "info").toLowerCase();
    var colors = {
      success: "bg-green-600 text-white",
      error: "bg-red-600 text-white",
      warning: "bg-amber-500 text-white",
      info: "bg-gray-800 text-white"
    };
    var icons = {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle"
    };
    var colorClass = colors[t] || colors.info;
    var iconClass = icons[t] || icons.info;

    var container = ensureContainer();

    var icon = window.tstsEl("i", { className: "fas " + iconClass + " text-lg flex-shrink-0" });
    var text = window.tstsEl("span", { className: "text-sm font-medium" }, String(msg || ""));
    var closeBtn = window.tstsEl("button", {
      className: "ml-2 text-white/80 hover:text-white transition flex-shrink-0",
      type: "button"
    }, [window.tstsEl("i", { className: "fas fa-times" })]);
    closeBtn.setAttribute("aria-label", "Close");

    var toast = window.tstsEl("div", {
      className: colorClass + " px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto transform translate-x-full opacity-0 transition-all duration-300 max-w-sm"
    }, [icon, text, closeBtn]);

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        toast.classList.remove("translate-x-full", "opacity-0");
        toast.classList.add("translate-x-0", "opacity-100");
      });
    });

    var dismiss = function() {
      toast.classList.remove("translate-x-0", "opacity-100");
      toast.classList.add("translate-x-full", "opacity-0");
      setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener("click", dismiss);
    setTimeout(dismiss, 5000);
  };
})();

// WS-FE-08: Branded confirmation modal (replaces confirm())
window.tstsConfirm = function(msg, opts) {
  return new Promise(function(resolve) {
    var options = opts || {};
    var confirmText = options.confirmText || "Confirm";
    var cancelText = options.cancelText || "Cancel";
    var isDestructive = options.destructive === true;

    var overlay = window.tstsEl("div", {
      className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200"
    });

    var icon = window.tstsEl("div", {
      className: "w-12 h-12 rounded-full flex items-center justify-center mb-4 " + (isDestructive ? "bg-red-100" : "bg-orange-100")
    }, [
      window.tstsEl("i", { className: "fas fa-question text-xl " + (isDestructive ? "text-red-600" : "text-orange-600") })
    ]);

    var message = window.tstsEl("p", { className: "text-gray-700 text-center mb-6" }, String(msg || "Are you sure?"));

    var cancelBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition",
      type: "button"
    }, cancelText);

    var confirmBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl font-medium transition " + (isDestructive ? "bg-red-600 text-white hover:bg-red-700" : "tsts-btn-primary"),
      type: "button"
    }, confirmText);

    var buttons = window.tstsEl("div", { className: "flex gap-3" }, [cancelBtn, confirmBtn]);

    var modal = window.tstsEl("div", {
      className: "bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 transform scale-95 opacity-0 transition-all duration-200"
    }, [icon, message, buttons]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.classList.remove("opacity-0");
        overlay.classList.add("opacity-100");
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
      });
    });

    var cleanup = function(result) {
      overlay.classList.remove("opacity-100");
      overlay.classList.add("opacity-0");
      modal.classList.remove("scale-100", "opacity-100");
      modal.classList.add("scale-95", "opacity-0");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }, 200);
    };

    cancelBtn.addEventListener("click", function() { cleanup(false); });
    confirmBtn.addEventListener("click", function() { cleanup(true); });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handler);
        cleanup(false);
      }
    });

    // Focus trap
    confirmBtn.focus();
  });
};

// WS-FE-09: Branded prompt modal (replaces prompt())
window.tstsPrompt = function(msg, defaultValue, opts) {
  return new Promise(function(resolve) {
    var options = opts || {};
    var confirmText = options.confirmText || "Submit";
    var cancelText = options.cancelText || "Cancel";
    var placeholder = options.placeholder || "";
    var minLength = options.minLength || 0;

    var overlay = window.tstsEl("div", {
      className: "fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200"
    });

    var icon = window.tstsEl("div", {
      className: "w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-orange-100"
    }, [
      window.tstsEl("i", { className: "fas fa-pencil-alt text-xl text-orange-600" })
    ]);

    var message = window.tstsEl("p", { className: "text-gray-700 text-center mb-4" }, String(msg || "Enter value:"));

    var input = window.tstsEl("input", {
      type: "text",
      className: "w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition mb-2",
      placeholder: placeholder,
      value: String(defaultValue || "")
    });

    var errorEl = window.tstsEl("p", { className: "text-red-500 text-xs mb-4 h-4" });

    var cancelBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition",
      type: "button"
    }, cancelText);

    var submitBtn = window.tstsEl("button", {
      className: "flex-1 px-4 py-2.5 rounded-xl tsts-btn-primary font-medium transition",
      type: "button"
    }, confirmText);

    var buttons = window.tstsEl("div", { className: "flex gap-3" }, [cancelBtn, submitBtn]);

    var modal = window.tstsEl("div", {
      className: "bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 transform scale-95 opacity-0 transition-all duration-200"
    }, [icon, message, input, errorEl, buttons]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.classList.remove("opacity-0");
        overlay.classList.add("opacity-100");
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
      });
    });

    var cleanup = function(result) {
      overlay.classList.remove("opacity-100");
      overlay.classList.add("opacity-0");
      modal.classList.remove("scale-100", "opacity-100");
      modal.classList.add("scale-95", "opacity-0");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }, 200);
    };

    var validate = function() {
      var val = String(input.value || "").trim();
      if (minLength > 0 && val.length < minLength) {
        errorEl.textContent = "Must be at least " + minLength + " characters";
        return null;
      }
      errorEl.textContent = "";
      return val;
    };

    cancelBtn.addEventListener("click", function() { cleanup(null); });
    submitBtn.addEventListener("click", function() {
      var val = validate();
      if (val !== null) cleanup(val);
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        var val = validate();
        if (val !== null) cleanup(val);
      }
    });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) cleanup(null);
    });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handler);
        cleanup(null);
      }
    });

    // Focus input
    input.focus();
    input.select();
  });
};

// WS-FE-04: Dev guard - throws if helpers are missing (catches load order issues)
(function() {
  var isDev = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  if (isDev) {
    window.__TSTS_ASSERT_HELPERS__ = function() {
      if (!window.tstsEl) throw new Error("TSTS: common.js not loaded - tstsEl missing");
      if (!window.tstsSafeUrl) throw new Error("TSTS: common.js not loaded - tstsSafeUrl missing");
      if (!window.tstsSafeImg) throw new Error("TSTS: common.js not loaded - tstsSafeImg missing");
    };
  }
})();

(function () {
  (function ensureLocalIconCss() {
    try {
      const id = "tsts-icon-font";
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "/css/icon-font.css?v=20260209";
      link.referrerPolicy = "no-referrer";
      document.head.appendChild(link);
    } catch (_) {}
  })();

  const isLocal = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  const runtimeCfg = (window.__TSTS_RUNTIME__ && typeof window.__TSTS_RUNTIME__ === "object")
    ? window.__TSTS_RUNTIME__
    : {};
  const runtimeApiBase = String(runtimeCfg.apiBase || runtimeCfg.API_BASE || "").trim().replace(/\/$/, "");
  const runtimeCloudinaryUrl = String(runtimeCfg.cloudinaryUrl || runtimeCfg.CLOUDINARY_URL || "").trim();

  // Optional override for QA:
  // localStorage.setItem("API_BASE", "http://localhost:4000");
  const storedBase = (() => {
    try { return localStorage.getItem("API_BASE") || ""; } catch (_) { return ""; }
  })();
  const storedCloudinary = (() => {
    try { return localStorage.getItem("CLOUDINARY_URL") || ""; } catch (_) { return ""; }
  })();

  // Runtime config priority: localStorage override > runtime config > local default > same-origin relative
  // Local default must match the current hostname to avoid cookie domain mismatch (localhost vs 127.0.0.1).
  const localDefaultApi = isLocal
    ? ((location.hostname === "127.0.0.1") ? "http://127.0.0.1:4000" : "http://localhost:4000")
    : "";
  let apiOrigin = String(storedBase || runtimeApiBase || localDefaultApi).trim().replace(/\/$/, "");
  if (apiOrigin && /\/api$/i.test(apiOrigin)) apiOrigin = apiOrigin.replace(/\/api$/i, "");
  if (apiOrigin && apiOrigin.charAt(0) === "/") apiOrigin = "";
  window.API_BASE = apiOrigin;
  // Cloudinary config (single-truth; used by profile.js / host.js)
  window.CLOUDINARY_URL = String(window.CLOUDINARY_URL || runtimeCloudinaryUrl || storedCloudinary || "").trim();

  // === CAT-001: Locked Category Pillars (slugs + labels; single source of truth) ===
  // Rules:
  // - Stable internal keys are slugs.
  // - Display labels are separate from keys.
  // - Legacy 3-pillar values (Culture/Food/Nature) are normalized for backward compatibility.
  (function initCategoryPillars() {
    const CATS = [
      {
        slug: "food-gatherings",
        label: "Food & Gatherings",
        teaser: "Shared tables. Real conversations.",
        icon: "fa-utensils",
        image: "/assets/categories/food-gatherings.jpg",
        blurb: "Shared meals as social glue: supper clubs, beach BBQs, community brunches, coffee circles, and cultural food rituals."
      },
      {
        slug: "explore-outdoors",
        label: "Explore & Outdoors",
        teaser: "Walk the land. Share the moment.",
        icon: "fa-mountain",
        image: "/assets/categories/explore-outdoors.jpg",
        blurb: "Coastal walks, scenic trails, picnics, foraging, and light adventures designed for connection, not tourism."
      },
      {
        slug: "culture-stories",
        label: "Culture & Stories",
        teaser: "Where tradition meets the present.",
        icon: "fa-book-open",
        image: "/assets/categories/culture-stories.jpg",
        blurb: "Heritage nights, cultural rituals, seasonal traditions, and storytelling circles built with respect and belonging."
      },
      {
        slug: "social-nights",
        label: "Social & Nights",
        teaser: "Meet new faces after sunset.",
        icon: "fa-moon",
        image: "/assets/categories/social-nights.jpg",
        blurb: "Rooftop gatherings, trivia nights, open mic socials, and relaxed after-hours meetups with curated energy."
      },
      {
        slug: "move-wellness",
        label: "Move & Wellness",
        teaser: "Move your body. Reset your mind.",
        icon: "fa-spa",
        image: "/assets/categories/move-wellness.jpg",
        blurb: "Beach yoga, group runs, breathwork, outdoor fitness, and calm reset circles that feel safe and inclusive."
      },
      {
        slug: "create-express",
        label: "Create & Express",
        teaser: "Make something. Share something.",
        icon: "fa-paint-brush",
        image: "/assets/categories/create-express.jpg",
        blurb: "Art sessions, music jams, pottery, photography walks, and writing circles designed to unlock creative flow."
      },
      {
        slug: "learn-passion",
        label: "Learn & Passion",
        teaser: "Curiosity brings people together.",
        icon: "fa-lightbulb",
        image: "/assets/categories/learn-passion.jpg",
        blurb: "Books and coffee circles, skill-sharing, hobby clubs, and micro-talks that turn interests into community."
      },
      {
        slug: "games-play",
        label: "Games & Play",
        teaser: "Fun brings strangers closer.",
        icon: "fa-dice",
        image: "/assets/categories/games-play.jpg",
        blurb: "Board games, casual sports, lawn games, and playful socials where laughter does the connecting."
      }
    ];

    const LEGACY_TO_SLUG = Object.freeze({
      Culture: "culture-stories",
      Food: "food-gatherings",
      Nature: "explore-outdoors"
    });

    const bySlug = Object.create(null);
    for (const c of CATS) bySlug[c.slug] = c;

    function normalize(raw) {
      const s0 = String(raw || "").trim();
      if (!s0) return "";
      // Case-insensitive legacy mapping
      const low = s0.toLowerCase();
      let mapped = "";
      for (const k of Object.keys(LEGACY_TO_SLUG)) {
        if (k.toLowerCase() === low) { mapped = LEGACY_TO_SLUG[k]; break; }
      }
      const s = (mapped || s0).trim();
      return bySlug[s] ? s : "";
    }

    window.TSTS_CATEGORIES = Object.freeze(CATS.map((c) => Object.freeze({ ...c })));

    window.tstsNormalizeCategory = function(v) {
      return normalize(v);
    };
    window.tstsCategoryMeta = function(v) {
      const slug = normalize(v);
      return slug ? bySlug[slug] : null;
    };
    window.tstsCategoryLabel = function(v) {
      const m = window.tstsCategoryMeta(v);
      return m ? m.label : String(v || "").trim();
    };
  })();


  // === SEC-002: Cookie-based auth (no localStorage tokens) ===
  // CSRF token is in cookie (non-HttpOnly) - read directly for double-submit pattern
  // This ensures CSRF works across tabs (cookies are shared, sessionStorage is not)
  
  const CSRF_COOKIE_NAME = window.__TSTS_CSRF_COOKIE__ || "tsts_csrf";
  const FRONT_AUTH_HINT_COOKIE = "tsts_fe_auth_hint";
  const FRONT_AUTH_HINT_MAX_AGE_SEC = 60 * 60 * 24 * 7;
  const CSRF_STORAGE_KEY = "tsts_csrf_token";
  
  // SEC-002: Response unwrapper helper for normalized { ok, data } responses
  window.tstsUnwrap = function(payload) {
    if (payload && payload.data !== undefined) return payload.data;
    return payload;
  };
  
  function __getStoredCsrfToken() {
    try { return String(localStorage.getItem(CSRF_STORAGE_KEY) || ""); } catch (_) { return ""; }
  }

  function __setStoredCsrfToken(v) {
    try {
      const s = String(v || "").trim();
      if (s) localStorage.setItem(CSRF_STORAGE_KEY, s);
      else localStorage.removeItem(CSRF_STORAGE_KEY);
    } catch (_) {}
  }

  function __setFrontendAuthHintCookie() {
    try {
      document.cookie = FRONT_AUTH_HINT_COOKIE + "=1; Path=/; Max-Age=" + String(FRONT_AUTH_HINT_MAX_AGE_SEC) + "; SameSite=Lax";
    } catch (_) {}
  }

  function __clearFrontendAuthHintCookie() {
    try {
      document.cookie = FRONT_AUTH_HINT_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (_) {}
  }

  // CSRF token strategy:
  // Cookie is the ONLY authoritative source (server-set, HttpOnly:false, has maxAge).
  // If cookie is absent (expired or cleared), return "" to trigger GET /api/csrf recovery
  // in authFetch. Do NOT fall back to localStorage — stale localStorage values cause
  // CSRF_MISSING rejections because the server validates header vs cookie (double-submit
  // pattern requires both to be present and matching).
  function __getCsrfToken() {
    try {
      const cookies = String(document.cookie || "");
      const parts = cookies.split(";");
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part.startsWith(CSRF_COOKIE_NAME + "=")) {
          const v = decodeURIComponent(part.slice(CSRF_COOKIE_NAME.length + 1));
          if (v) return v;
        }
      }
    } catch (_) {}
    return "";
  }

  async function __refreshCsrfToken(base) {
    try {
      const b = String(base || "").replace(/\/$/, "");
      const url = b + "/api/csrf";
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, { method: "GET", credentials: "include", signal: controller.signal });
        if (!res || !res.ok) return "";
        const payload = await res.json().catch(() => ({}));
        const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
        const token = (unwrapped && unwrapped.csrfToken) ? unwrapped.csrfToken : (payload && payload.csrfToken);
        const s = String(token || "").trim();
        if (s) __setStoredCsrfToken(s);
        return s;
      } finally {
        clearTimeout(t);
      }
    } catch (_) {
      return "";
    }
  }

  // setAuth stores non-sensitive UI user data + CSRF token (public) for cross-origin CSRF header use.
  window.setAuth = function (csrfToken, user) {
    try {
      if (user != null) {
        localStorage.setItem("tsts_user", JSON.stringify(user));
        __setFrontendAuthHintCookie();
      } else {
        localStorage.removeItem("tsts_user");
        __clearFrontendAuthHintCookie();
      }

      __setStoredCsrfToken(csrfToken);

      // Clean up legacy keys
      try { localStorage.removeItem("token"); } catch (_) {}
      try { localStorage.removeItem("user"); } catch (_) {}
    } catch (_) {}
  };

  // Deprecated: auth token is now in HttpOnly cookie, not accessible to JS
  window.getAuthToken = function () {
    return ""; // Token is in HttpOnly cookie, not accessible
  };

  // FE-019: Clear all auth state on logout
  // Note: CSRF cookie is cleared by backend on logout, not by frontend
  window.clearAuth = function () {
    try {
      localStorage.removeItem("tsts_user");
      localStorage.removeItem(CSRF_STORAGE_KEY);
      // Clean up legacy keys
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      __clearFrontendAuthHintCookie();
    } catch (_) {}
  };

  window.getAuthUser = function () {
    try {
      const newUser = localStorage.getItem("tsts_user");
      if (newUser) return JSON.parse(newUser);
      return {};
    } catch (_) { return {}; }
  };

  function normalizePath(path) {
    if (!path) return "/";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return "/" + path;
    return path;
  }
  
  // SEC-002: authFetch uses credentials: "include" for cookie auth
  // SEC-035: Add CSRF header on state-changing requests
  // GUARD: 401 Interceptor with redirect loop guard
  window.authFetch = async function (path, opts) {
    const headers = Object.assign({}, (opts && opts.headers) || {});
    const method = (opts && opts.method) ? String(opts.method).toUpperCase() : "GET";

    const needsCsrf = (method !== "GET" && method !== "HEAD" && method !== "OPTIONS");
    if (needsCsrf) {
      const csrfToken = __getCsrfToken();
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    }
    
    // RF-05: Do NOT set Content-Type when body is FormData (breaks multipart boundary)
    const body = opts && opts.body;
    const isFormData = (typeof FormData !== "undefined" && body instanceof FormData);
    if (!headers["Content-Type"] && method !== "GET" && !isFormData) headers["Content-Type"] = "application/json";

    const raw = String(path || "");

    // If caller passes a full URL, do not rewrite it.
    if (/^https?:\/\//i.test(raw)) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch(raw, Object.assign({}, opts || {}, { headers, credentials: "include", signal: controller.signal }));
      } finally {
        clearTimeout(t);
      }
    }

    const normalized = raw.startsWith("/") ? raw : ("/" + raw);
    const apiPath = normalized.startsWith("/api/") ? normalized : ("/api" + normalized);

    const base = String(window.API_BASE || "").replace(/\/$/, "");
    const url = base + apiPath;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    try {
      // If CSRF token isn't readable (cross-origin), refresh it via /api/csrf once before state-changing calls.
      if (needsCsrf && !headers["X-CSRF-Token"]) {
        const refreshed = await __refreshCsrfToken(base);
        if (refreshed) headers["X-CSRF-Token"] = refreshed;
      }
      const response = await fetch(url, Object.assign({}, opts || {}, { headers, credentials: "include", signal: controller.signal }));
      
      // RF-03: Remove redirect logic from authFetch - tstsRequireAuth is the ONLY redirect authority
      // This prevents double-redirects and ensures returnTo is always preserved

      return response;
    } finally {
      clearTimeout(t);
    }
  };

  // Single-truth session probe (cookie-auth); returns { ok, status, user, csrfToken }.
  // Cache: prevents every page calling /api/auth/me multiple times during bootstrap.
  window.tstsGetSession = (function () {
    let inFlight = null;
    let refreshInFlight = null;
    let cache = { ts: 0, ok: false, status: 0, user: null, csrfToken: "" };
    const TTL_MS = 8000;
    const AUTH_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;
    const ME_PROBE_COOLDOWN_MS = 10 * 1000;
    const REFRESH_FAIL_STREAK_MAX = 12;
    const REFRESH_COOLDOWN_STEP_MS = 5 * 1000;
    let refreshCooldownUntil = 0;
    let refreshFailureStreak = 0;
    const REFRESH_COOLDOWN_MAX_MS = 60000;
    const SESSION_KEY_LAST_ME_OK_TS = "tsts_last_me_ok_ts";
    const SESSION_KEY_LOGIN_OK_TS = "tsts_login_ok_ts";
    const SESSION_KEY_REFRESH_COOLDOWN_UNTIL = "tsts_refresh_cooldown_until";
    const SESSION_KEY_REFRESH_FAIL_STREAK = "tsts_refresh_fail_streak";
    const SESSION_KEY_REFRESH_LAST_ATTEMPT_TS = "tsts_refresh_last_attempt_ts";
    const SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL = "tsts_me_probe_cooldown_until";

    function readSessionNumber(key) {
      try {
        const raw = String(window.sessionStorage.getItem(String(key || "")) || "").trim();
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
      } catch (_) {
        return 0;
      }
    }

    function readLocalNumber(key) {
      try {
        const raw = String(window.localStorage.getItem(String(key || "")) || "").trim();
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
      } catch (_) {
        return 0;
      }
    }

    function writeSessionNumber(key, value) {
      try {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) {
          window.sessionStorage.removeItem(String(key || ""));
          return;
        }
        window.sessionStorage.setItem(String(key || ""), String(Math.floor(n)));
      } catch (_) {}
    }

    function writeLocalNumber(key, value) {
      try {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) {
          window.localStorage.removeItem(String(key || ""));
          return;
        }
        window.localStorage.setItem(String(key || ""), String(Math.floor(n)));
      } catch (_) {}
    }

    function readEvidenceNumber(key) {
      return Math.max(readSessionNumber(key), readLocalNumber(key));
    }

    function syncRefreshStateFromStorage() {
      const storedCooldown = readSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL);
      const storedStreak = readSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK);
      if (storedCooldown > refreshCooldownUntil) refreshCooldownUntil = storedCooldown;
      if (storedStreak > refreshFailureStreak) refreshFailureStreak = Math.min(storedStreak, REFRESH_FAIL_STREAK_MAX);
    }

    function parseMe(payload) {
      const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
      const user = (unwrapped && unwrapped.user) ? unwrapped.user : ((payload && payload.user) ? payload.user : (unwrapped || null));
      const csrfToken = (unwrapped && unwrapped.csrfToken) ? unwrapped.csrfToken : ((payload && payload.csrfToken) ? payload.csrfToken : "");
      return { user, csrfToken };
    }

    function hasAuthHint() {
      try {
        const cookie = String(document.cookie || "");
        if (/(^|;\s*)tsts_auth_hint=1(?:;|$)/.test(cookie)) return true;
        if (/(^|;\s*)tsts_fe_auth_hint=1(?:;|$)/.test(cookie)) return true;
      } catch (_) {}
      return false;
    }

    function hasFreshEvidence(key, nowMs) {
      const now = Number(nowMs || Date.now());
      const ts = readEvidenceNumber(key);
      if (!ts) return false;
      return (now - ts) >= 0 && (now - ts) <= AUTH_EVIDENCE_TTL_MS;
    }

    function markAuthEvidence(key, nowMs) {
      const ts = Number(nowMs || Date.now());
      writeSessionNumber(key, ts);
      writeLocalNumber(key, ts);
      __setFrontendAuthHintCookie();
    }

    function hasAuthEvidence(nowMs) {
      const now = Number(nowMs || Date.now());
      if (hasAuthHint()) return true;
      if (hasFreshEvidence(SESSION_KEY_LAST_ME_OK_TS, now)) return true;
      if (hasFreshEvidence(SESSION_KEY_LOGIN_OK_TS, now)) return true;
      return false;
    }

    function isForcedMeProbeCooling(nowMs) {
      const now = Number(nowMs || Date.now());
      return readSessionNumber(SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL) > now;
    }

    function markForcedMeProbe(nowMs) {
      const now = Number(nowMs || Date.now());
      writeSessionNumber(SESSION_KEY_ME_PROBE_COOLDOWN_UNTIL, now + ME_PROBE_COOLDOWN_MS);
    }

    function isRefreshCooldownActive(nowMs) {
      syncRefreshStateFromStorage();
      return refreshCooldownUntil > Number(nowMs || 0);
    }

    function markRefreshFailure(statusCode) {
      const status = Number(statusCode || 0);
      if (!(status === 0 || status === 401 || status === 429)) return;
      syncRefreshStateFromStorage();
      refreshFailureStreak = Math.min(refreshFailureStreak + 1, REFRESH_FAIL_STREAK_MAX);
      const waitMs = Math.min(REFRESH_COOLDOWN_MAX_MS, REFRESH_COOLDOWN_STEP_MS * refreshFailureStreak);
      const now = Date.now();
      refreshCooldownUntil = now + waitMs;
      writeSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK, refreshFailureStreak);
      writeSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL, refreshCooldownUntil);
      writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, now);
    }

    function markRefreshSuccess() {
      refreshFailureStreak = 0;
      refreshCooldownUntil = 0;
      writeSessionNumber(SESSION_KEY_REFRESH_FAIL_STREAK, 0);
      writeSessionNumber(SESSION_KEY_REFRESH_COOLDOWN_UNTIL, 0);
      writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, Date.now());
    }

    async function refreshAccessTokenOnce() {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = (async function () {
        try {
          const now = Date.now();
          if (isRefreshCooldownActive(now)) return false;
          writeSessionNumber(SESSION_KEY_REFRESH_LAST_ATTEMPT_TS, now);
          if (!window.authFetch) return false;
          const res = await window.authFetch("/api/auth/refresh", { method: "POST" });
          if (!res || !res.ok) {
            markRefreshFailure(res ? res.status : 0);
            return false;
          }
          const payload = await res.json().catch(() => ({}));
          const unwrapped = (window.tstsUnwrap ? window.tstsUnwrap(payload) : ((payload && payload.data !== undefined) ? payload.data : payload));
          const csrfToken = String((unwrapped && unwrapped.csrfToken) || "");
          if (csrfToken && window.setAuth) {
            const existingUser = (window.getAuthUser && window.getAuthUser()) || null;
            window.setAuth(csrfToken, existingUser && Object.keys(existingUser).length ? existingUser : null);
          }
          markRefreshSuccess();
          return true;
        } catch (_) {
          markRefreshFailure(0);
          return false;
        } finally {
          refreshInFlight = null;
        }
      })();
      return refreshInFlight;
    }

    return async function (opts) {
      const o = opts || {};
      const force = o.force === true;
      const now = Date.now();

      if (!force && cache.ts && (now - cache.ts) < TTL_MS) return cache;
      if (!force && inFlight) return inFlight;

      inFlight = (async function () {
        const out = { ts: Date.now(), ok: false, status: 0, user: null, csrfToken: "" };
        try {
          if (!window.authFetch) return out;
          const hasEvidence = hasAuthEvidence(now);
          if (force && !hasEvidence && isForcedMeProbeCooling(now)) {
            if (cache && cache.ok && cache.user) return cache;
            return out;
          }
          if (force && !hasEvidence) markForcedMeProbe(now);

          let res = await window.authFetch("/api/auth/me", { method: "GET" });
          out.status = res ? res.status : 0;

          if (res && res.ok) {
            const payload = await res.json().catch(() => ({}));
            const parsed = parseMe(payload);
            out.ok = true;
            out.user = parsed.user || null;
            out.csrfToken = String(parsed.csrfToken || "");
            markAuthEvidence(SESSION_KEY_LAST_ME_OK_TS, Date.now());
            try { if (window.setAuth) window.setAuth(out.csrfToken, out.user); } catch (_) {}
            cache = out;
            return cache;
          }

          if (res && (res.status === 401 || res.status === 403)) {
            const shouldTryRefresh = hasAuthEvidence(Date.now()) && !isRefreshCooldownActive(Date.now());
            const refreshed = shouldTryRefresh ? await refreshAccessTokenOnce() : false;
            if (refreshed) {
              res = await window.authFetch("/api/auth/me", { method: "GET" });
              out.status = res ? res.status : 0;
              if (res && res.ok) {
                const retryPayload = await res.json().catch(() => ({}));
                const retryParsed = parseMe(retryPayload);
                out.ok = true;
                out.user = retryParsed.user || null;
                out.csrfToken = String(retryParsed.csrfToken || "");
                markAuthEvidence(SESSION_KEY_LAST_ME_OK_TS, Date.now());
                try { if (window.setAuth) window.setAuth(out.csrfToken, out.user); } catch (_) {}
                cache = out;
                return cache;
              }
            }
            try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
            cache = out;
            return cache;
          }

          // Avoid forced logout on transient rate-limit/network failures.
          if (res && res.status === 429 && cache && cache.ok && cache.user) {
            return cache;
          }

          cache = out;
          return cache;
        } catch (_) {
          if (cache && cache.ok && cache.user) return cache;
          cache = out;
          return cache;
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    };
  })();

  window.tstsMarkLoginOk = function () {
    try {
      const ts = String(Date.now());
      window.sessionStorage.setItem("tsts_login_ok_ts", ts);
      window.localStorage.setItem("tsts_login_ok_ts", ts);
      __setFrontendAuthHintCookie();
    } catch (_) {}
  };

  function tstsParseDateLike(x) {
    try {
      if (!x) return null;
      if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
      const s = String(x).trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    } catch (_) {
      return null;
    }
  }

  window.tstsFormatDateShort = function (x) {
    const d = tstsParseDateLike(x);
    if (!d) return "";
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (_) {
      return d.toDateString();
    }
  };

  window.tstsFormatDateWeekday = function (x) {
    const d = tstsParseDateLike(x);
    if (!d) return "";
    try {
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch (_) {
      return d.toDateString();
    }
  };
})();

// DOM bootstrap
document.addEventListener("DOMContentLoaded", () => {
  injectNavbar();
  injectFooter();
  if (window.tstsHydrateNavAuth) {
    window.tstsHydrateNavAuth({ force: false }).catch(() => {});
  }
  initMobileMenu();
  setTimeout(function () {
    initGlobalStatusBanner().catch(() => {});
  }, 900);
  hydrateFooterPolicyMeta().catch(() => {});
});

// 1) NAVBAR (single truth) - DOM-safe construction
function injectNavbar() {
  const root = document.getElementById("navbar-placeholder");
  if (!root) return;

  // A11Y: Skip-to-main link (first focusable element on every page)
  if (!document.getElementById("skip-to-main")) {
    var mainEl = document.querySelector("main");
    if (mainEl && !mainEl.id) mainEl.id = "main";
    var skipTarget = (mainEl && mainEl.id) ? mainEl.id : "main";
    var skipLink = tstsEl("a", {
      id: "skip-to-main",
      href: "#" + skipTarget,
      className: "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-orange-600 focus:font-bold"
    }, "Skip to main content");
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  const logoBadge = tstsEl("span", { className: "inline-flex items-center justify-center h-9 w-9 rounded-full bg-orange-50 border border-orange-100" }, [
    tstsEl("img", { src: "/assets/logo-mark.png", alt: "The Shared Table Story", className: "h-7 w-7 object-contain" })
  ]);
  const logoText = tstsEl("span", { className: "leading-none" }, "The Shared Table Story");
  const logo = tstsEl("a", { href: "index.html", className: "text-2xl font-bold text-orange-600 flex items-center gap-2 font-serif" }, [logoBadge, logoText]);
  logo.setAttribute("aria-label", "The Shared Table Story");

  const navHome = tstsEl("a", { href: "index.html", className: "text-gray-600 hover:text-orange-600 font-medium transition" }, "Home");
  const navExplore = tstsEl("a", { href: "explore.html", className: "text-gray-600 hover:text-orange-600 font-medium transition" }, "Explore");
  const dealsIcon = tstsEl("i", { className: "fas fa-fire" });
  const navDeals = tstsEl("a", { href: "explore.html?filter=deals", className: "text-red-600 hover:text-red-700 font-bold transition flex items-center gap-1" }, [dealsIcon, " Deals"]);
  const navHost = tstsEl("a", { href: "host.html", className: "text-gray-600 hover:text-orange-600 font-medium transition" }, "Become a Host");
  const authDesktop = tstsEl("div", { id: "auth-section-desktop" }, [
    tstsEl("a", { href: "login.html", className: "tsts-btn-primary px-5 py-2 rounded-full font-medium transition" }, "Login")
  ]);
  const nav = tstsEl("nav", { className: "hidden md:flex items-center space-x-8" }, [navHome, navExplore, navDeals, navHost, authDesktop]);

  const menuBtn = tstsEl("button", { id: "mobile-menu-btn", className: "md:hidden text-gray-700 focus:outline-none" }, [
    tstsEl("i", { className: "fas fa-bars text-2xl" })
  ]);
  menuBtn.setAttribute("aria-label", "Open menu");

  const container = tstsEl("div", { className: "container mx-auto px-4 py-4 flex justify-between items-center" }, [logo, nav, menuBtn]);

  const mobileHome = tstsEl("a", { href: "index.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Home");
  const mobileExplore = tstsEl("a", { href: "explore.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Explore");
  const mobileDealsIcon = tstsEl("i", { className: "fas fa-fire" });
  const mobileDeals = tstsEl("a", { href: "explore.html?filter=deals", className: "text-red-600 font-bold flex items-center gap-2" }, [mobileDealsIcon, " Deals"]);
  const mobileHost = tstsEl("a", { href: "host.html", className: "text-gray-700 hover:text-orange-600 font-medium" }, "Become a Host");
  const authMobile = tstsEl("div", { id: "auth-section-mobile", className: "pt-4 border-t border-gray-100" }, [
    tstsEl("a", { href: "login.html", className: "block w-full text-center tsts-btn-primary px-5 py-3 rounded-xl font-medium transition" }, "Login / Sign Up")
  ]);
  const mobileMenuInner = tstsEl("div", { className: "flex flex-col p-4 space-y-4" }, [mobileHome, mobileExplore, mobileDeals, mobileHost, authMobile]);
  const mobileMenu = tstsEl("div", { id: "mobile-menu", className: "hidden md:hidden bg-white border-t border-gray-100 absolute w-full left-0 shadow-lg" }, [mobileMenuInner]);

  const header = tstsEl("header", { className: "bg-white shadow-sm sticky top-0 z-50" }, [container, mobileMenu]);
  root.appendChild(header);
}

// 2) FOOTER - DOM-safe construction
function injectFooter() {
  const root = document.getElementById("footer-placeholder");
  if (!root) return;

  const col1 = tstsEl("div", {}, [
    tstsEl("h3", { className: "text-xl font-bold text-orange-500 mb-4 font-serif" }, "The Shared Table Story"),
    tstsEl("p", { className: "text-gray-400 text-sm" }, "Reconnect with the world, one meal at a time.")
  ]);

  const col2 = tstsEl("div", {}, [
    tstsEl("h4", { className: "font-bold mb-4" }, "Company"),
    tstsEl("ul", { className: "space-y-2 text-gray-400 text-sm" }, [
      tstsEl("li", {}, [tstsEl("a", { href: "about.html", className: "hover:text-white transition" }, "About Us")]),
      tstsEl("li", {}, [tstsEl("a", { href: "host.html", className: "hover:text-white transition" }, "Become a Host")]),
      tstsEl("li", {}, [tstsEl("a", { href: "mailto:contact@thesharedtablestory.com", className: "hover:text-white transition" }, "Contact")])
    ])
  ]);

  const col3 = tstsEl("div", {}, [
    tstsEl("h4", { className: "font-bold mb-4" }, "Support"),
    tstsEl("ul", { className: "space-y-2 text-gray-400 text-sm" }, [
      tstsEl("li", {}, [tstsEl("a", { href: "terms.html", className: "hover:text-white transition" }, "Terms of Service")]),
      tstsEl("li", {}, [tstsEl("a", { href: "host-terms.html", className: "hover:text-white transition" }, "Host Terms")]),
      tstsEl("li", {}, [tstsEl("a", { href: "privacy.html", className: "hover:text-white transition" }, "Privacy Policy")]),
      tstsEl("li", {}, [tstsEl("a", { href: "cookie-policy.html", className: "hover:text-white transition" }, "Cookie Policy")]),
      tstsEl("li", {}, [tstsEl("a", { href: "policy.html", className: "hover:text-white transition" }, "Cancellation Policy")]),
      tstsEl("li", {}, [tstsEl("a", { href: "settings-data.html", className: "hover:text-white transition" }, "Data & Privacy")]),
      tstsEl("li", {}, [tstsEl("a", { href: "report.html", className: "hover:text-white transition" }, "Report an Issue")])
    ])
  ]);

  const grid = tstsEl("div", { className: "container mx-auto px-4 grid md:grid-cols-3 gap-8" }, [col1, col2, col3]);
  const companyInfo = tstsEl("p", { className: "text-gray-500 text-sm" }, "The Shared Table Story PTY LTD | 24 Balance Pl, Birtinya QLD 4575");
  const policyMeta = tstsEl("p", { id: "footer-policy-version", className: "text-gray-500 text-xs" }, "Policy details could not be loaded.");
  const copyrightText = "© " + new Date().getFullYear() + " The Shared Table Story. All rights reserved.";
  const copyright = tstsEl("div", { className: "border-t border-gray-800 mt-12 pt-8 text-center text-gray-500 text-sm space-y-2" }, [tstsEl("p", {}, copyrightText), companyInfo, policyMeta]);
  const footer = tstsEl("footer", { className: "bg-gray-900 text-white py-12 mt-auto" }, [grid, copyright]);
  root.appendChild(footer);
}

function formatPolicyDate(v) {
  if (!v) return "";
  try {
    if (window.tstsFormatDateShort) return window.tstsFormatDateShort(v);
  } catch (_) {}
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

function shouldSkipGlobalMetaFetch() {
  var path = "";
  try { path = String(location.pathname || "").toLowerCase(); } catch (_) {}
  var file = path.split("/").pop() || "";
  var protectedPages = {
    "admin.html": true,
    "bookmarks.html": true,
    "connections.html": true,
    "feed.html": true,
    "host.html": true,
    "my-bookings.html": true,
    "profile.html": true,
    "report.html": true,
    "settings-data.html": true
  };
  if (!protectedPages[file]) return false;

  var hasUserHint = false;
  try { hasUserHint = !!localStorage.getItem("tsts_user"); } catch (_) { hasUserHint = false; }
  return !hasUserHint;
}

async function resolveSystemStatus() {
  // Probe a CORS-safe API route through authFetch. Do not call /health directly
  // because /health is defined before CORS middleware in backend server.js.
  try {
    if (shouldSkipGlobalMetaFetch()) return { level: "normal", label: "Normal", message: "" };

    if (!window.authFetch) {
      return {
        level: "outage",
        label: "Outage",
        message: "We cannot reach platform services right now. Please retry shortly."
      };
    }

    const res = await window.authFetch("/api/policy/active", { method: "GET" });
    if (!res) {
      return {
        level: "outage",
        label: "Outage",
        message: "We cannot reach platform services right now. Please retry shortly."
      };
    }

    // Any reachable non-5xx response means platform is reachable.
    if (res.status < 500) return { level: "normal", label: "Normal", message: "" };

    return {
      level: "degraded",
      label: "Degraded",
      message: "Core systems are responding slowly. Actions may take longer than usual."
    };
  } catch (_) {
    return {
      level: "outage",
      label: "Outage",
      message: "We cannot reach platform services right now. Please retry shortly."
    };
  }
}

async function initGlobalStatusBanner() {
  const root = document.getElementById("navbar-placeholder");
  if (!root) return;

  const existing = document.getElementById("tsts-system-status-banner");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const status = await resolveSystemStatus();
  if (!status || status.level === "normal") return;

  const isDegraded = status.level === "degraded";
  const badgeClass = isDegraded
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-red-100 text-red-800 border-red-200";
  const rowClass = isDegraded
    ? "bg-amber-50 border-b border-amber-200 text-amber-900"
    : "bg-red-50 border-b border-red-200 text-red-900";

  const banner = tstsEl("div", { id: "tsts-system-status-banner", className: rowClass }, [
    tstsEl("div", { className: "container mx-auto px-4 py-2.5 text-xs sm:text-sm flex flex-wrap items-center gap-2" }, [
      tstsEl("span", { className: "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold border " + badgeClass, textContent: status.label }),
      tstsEl("span", { className: "font-medium", textContent: String(status.message || "") })
    ])
  ]);

  root.appendChild(banner);
}

async function hydrateFooterPolicyMeta() {
  const line = document.getElementById("footer-policy-version");
  if (!line || !window.authFetch) return;
  if (shouldSkipGlobalMetaFetch()) {
    line.textContent = "Policy details could not be loaded.";
    return;
  }

  try {
    const res = await window.authFetch("/api/policy/active", { method: "GET" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      line.textContent = "Policy details could not be loaded.";
      return;
    }
    const policy = (payload.data && payload.data.policy) ? payload.data.policy : (payload.policy || {});
    const version = String((policy && policy.version) || "").trim();
    const effective = formatPolicyDate(policy && policy.effectiveFrom);
    if (!version) {
      line.textContent = "Policy details could not be loaded.";
      return;
    }
    line.textContent = effective
      ? ("Policy: " + version + " • Effective: " + effective)
      : ("Policy: " + version);
  } catch (_) {
    line.textContent = "Policy details could not be loaded.";
  }
}

// 3) AUTH STATE IN NAV - DOM-safe construction
// Auth must work when frontend and backend are on different hosts (cookies not readable from JS).
async function applyAuthStateToNav(opts) {
  if (!window.tstsGetSession) return;
  const o = (opts && typeof opts === "object") ? opts : {};
  const force = o.force === true;
  const sess = (o.session && typeof o.session === "object")
    ? o.session
    : await window.tstsGetSession({ force: force });
  if (!sess || !sess.ok || !sess.user) return;
  const user = sess.user || {};
  const isAdminUser = !!(user && (user.isAdmin === true || String(user.role || "").toLowerCase() === "admin"));

  // Desktop auth menu - click-toggle dropdown
  const desktopAuth = document.getElementById("auth-section-desktop");
  if (desktopAuth) {
    desktopAuth.textContent = "";
    const userPic = tstsEl("img", { id: "nav-user-pic", src: "/assets/avatar-default.svg", className: "w-10 h-10 rounded-full border border-gray-200" });
    const menuBtn = tstsEl("button", { id: "nav-dropdown-btn", className: "flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded-full" }, [userPic]);
    menuBtn.setAttribute("aria-label", "Account menu");
    menuBtn.setAttribute("aria-expanded", "false");

    const menuLinks = [
      { href: "my-bookings.html", text: "My Bookings" },
      { href: "profile.html", text: "My Profile" },
      { href: "bookmarks.html", text: "Bookmarks" },
      { href: "connections.html", text: "Connections" },
      { href: "settings-data.html", text: "Data & Privacy" }
    ];
    if (isAdminUser) menuLinks.push({ href: "admin.html", text: "Admin Dashboard" });
    const dropdownItems = menuLinks.map(function(lnk) {
      return tstsEl("a", { href: lnk.href, className: "block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition" }, lnk.text);
    });
    const logoutBtn = tstsEl("button", { id: "logout-btn", className: "block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition" }, "Logout");
    dropdownItems.push(logoutBtn);
    const dropdown = tstsEl("div", { id: "nav-dropdown", className: "hidden absolute right-0 w-48 bg-white shadow-xl rounded-lg border border-gray-100 py-2 mt-2 opacity-0 -translate-y-2 transition-all duration-200" }, dropdownItems);
    dropdown.style.pointerEvents = "none";
    const wrapper = tstsEl("div", { className: "relative" }, [menuBtn, dropdown]);
    desktopAuth.appendChild(wrapper);

    try {
      if (user && user.profilePic) window.tstsSafeImg(userPic, user.profilePic, "/assets/avatar-default.svg");
    } catch (_) {}
  }

  // Mobile auth menu
  const mobileAuth = document.getElementById("auth-section-mobile");
  if (mobileAuth) {
    mobileAuth.textContent = "";
    const mobileLinks = [
      { href: "my-bookings.html", text: "My Bookings" },
      { href: "profile.html", text: "My Profile" },
      { href: "settings-data.html", text: "Data & Privacy" }
    ];
    if (isAdminUser) mobileLinks.push({ href: "admin.html", text: "Admin Dashboard" });
    mobileLinks.forEach(function(lnk) {
      mobileAuth.appendChild(tstsEl("a", { href: lnk.href, className: "block text-gray-700 hover:text-orange-600 font-medium py-2" }, lnk.text));
    });
    mobileAuth.appendChild(tstsEl("button", { id: "logout-btn-mobile", className: "block w-full text-left text-red-600 font-medium py-2" }, "Logout"));
  }

  attachLogoutListeners();
  initDropdownToggle();
  loadNavProfilePic();
}

window.tstsHydrateNavAuth = async function (opts) {
  try {
    return await applyAuthStateToNav(opts || {});
  } catch (_) {
    return false;
  }
};

// 4) MOBILE MENU
function initMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => menu.classList.toggle("hidden"));
}

// 5) DROPDOWN TOGGLE (click-based, polished)
function initDropdownToggle() {
  const btn = document.getElementById("nav-dropdown-btn");
  const dropdown = document.getElementById("nav-dropdown");
  if (!btn || !dropdown) return;

  let isOpen = false;

  const openDropdown = () => {
    isOpen = true;
    dropdown.classList.remove("hidden");
    dropdown.style.pointerEvents = "auto";
    setTimeout(() => {
      dropdown.classList.remove("opacity-0", "-translate-y-2");
      dropdown.classList.add("opacity-100", "translate-y-0");
    }, 10);
    btn.setAttribute("aria-expanded", "true");
  };

  const closeDropdown = () => {
    if (!isOpen) return;
    isOpen = false;
    dropdown.classList.remove("opacity-100", "translate-y-0");
    dropdown.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => {
      dropdown.classList.add("hidden");
      dropdown.style.pointerEvents = "none";
    }, 200);
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  document.addEventListener("click", (e) => {
    if (isOpen && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      closeDropdown();
      btn.focus();
    }
  });

  dropdown.addEventListener("click", (e) => {
    if (e.target.tagName === "A" || e.target.tagName === "BUTTON") {
      closeDropdown();
    }
  });
}

// 6) LOGOUT
function attachLogoutListeners() {
  const handleLogout = async () => {
    try {
      const res = await window.authFetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        try { console.warn("Logout revoke failed", res.status); } catch (_) {}
      }
    } catch (_) {
      try { console.warn("Logout revoke failed", "network"); } catch (_) {}
    }
    try { if (window.clearAuth) window.clearAuth(); } catch (_) {}
    location.replace("index.html");
  };

  const desktopBtn = document.getElementById("logout-btn");
  const mobileBtn = document.getElementById("logout-btn-mobile");
  if (desktopBtn) desktopBtn.addEventListener("click", handleLogout);
  if (mobileBtn) mobileBtn.addEventListener("click", handleLogout);
}

// 7) NAV PROFILE PIC
async function loadNavProfilePic() {
  try {
    if (String(location.pathname || "").endsWith("/profile.html") || String(location.pathname || "").endsWith("profile.html")) return;
  } catch (_) {}

  const img = document.getElementById("nav-user-pic");
  if (!img) return;

  try {
    const cached = (window.getAuthUser && window.getAuthUser()) || {};
    if (cached && cached.profilePic) { window.tstsSafeImg(img, cached.profilePic, "/assets/avatar-default.svg"); return; }
    if (!window.tstsGetSession) return;
    const sess = await window.tstsGetSession({ force: false });
    if (!sess || !sess.ok || !sess.user) return;
    if (sess.user && sess.user.profilePic) window.tstsSafeImg(img, sess.user.profilePic, "/assets/avatar-default.svg");
  } catch (_) {}
}

// === SEC-AUTH-GUARD: Single auth guard for protected pages (cookie auth) ===
// Use this at top of protected page JS to verify auth via /api/auth/me
window.tstsRequireAuth = function (opts) {
  const o = opts || {};
  const returnTo = String(o.returnTo || (location.pathname + location.search) || "");
  const loginUrl = String(o.loginUrl || "login.html");
  function hasAuthHintCookie() {
    try {
      return /(^|;\s*)tsts_auth_hint=1(?:;|$)/.test(String(document.cookie || ""));
    } catch (_) {
      return false;
    }
  }
  const q = "returnTo=" + encodeURIComponent(returnTo) + (hasAuthHintCookie() ? "&reason=session_expired" : "");

  function go() { location.replace(loginUrl + (loginUrl.indexOf("?") >= 0 ? "&" : "?") + q); }

  try {
    if (!window.tstsGetSession) { go(); return Promise.resolve(false); }
    return window.tstsGetSession({ force: true })
      .then(function (sess) {
        if (sess && sess.ok && sess.user) {
          try {
            if (window.tstsHydrateNavAuth) window.tstsHydrateNavAuth({ force: true, session: sess });
          } catch (_) {}
          return true;
        }
        if (sess && Number(sess.status) === 429) {
          try { if (window.tstsNotify) window.tstsNotify("Session check is temporarily rate-limited. Please retry.", "warning"); } catch (_) {}
          return false;
        }
        go();
        return false;
      })
      .catch(function () {
        go();
        return false;
      });
  } catch (_) {
    go();
    return Promise.resolve(false);
  }
};
