// FAQ bootstrap: data hydration + public API exposure + auto-mount.

(() => {
  const INTERNAL_DATA_KEY = "__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__";
  const INTERNAL_RENDERER_KEY = "__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__";
  const INTERNAL_CONTEXTUAL_KEY = "__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__";

  function getCatalog() {
    if (typeof FAQ_CATALOG === "undefined" || !Array.isArray(FAQ_CATALOG)) return [];
    return FAQ_CATALOG;
  }

  function getTrustConfig() {
    if (typeof FAQ_TRUST_CONFIG === "undefined" || typeof FAQ_TRUST_CONFIG !== "object" || FAQ_TRUST_CONFIG == null) {
      return { trustFaqIds: [], contextPlacement: {}, escalation: {} };
    }
    return FAQ_TRUST_CONFIG;
  }

  function hydrateInternalData() {
    window[INTERNAL_DATA_KEY] = {
      catalog: getCatalog(),
      trustConfig: getTrustConfig()
    };
  }

  function exposePublicFunctions() {
    const renderer = window[INTERNAL_RENDERER_KEY];
    const contextual = window[INTERNAL_CONTEXTUAL_KEY];

    window.renderTheSharedTableStoryFaqHub = function renderTheSharedTableStoryFaqHub(hubId, mountSelector, options) {
      const mount = mountSelector || "#faq-hub-root";
      if (!renderer || typeof renderer.renderFaqHub !== "function") {
        return { ok: false, error: "FAQ_RENDERER_NOT_READY" };
      }
      return renderer.renderFaqHub(hubId, mount, options || {});
    };

    window.mountTheSharedTableStoryContextualFaq = function mountTheSharedTableStoryContextualFaq(contextId, mountSelector, options) {
      const mount = mountSelector || "#faq-contextual-root";
      if (!contextual || typeof contextual.mountContextualFaq !== "function") {
        return { ok: false, error: "FAQ_CONTEXTUAL_NOT_READY" };
      }
      return contextual.mountContextualFaq(contextId, mount, options || {});
    };
  }

  function inferHubFromPath(pathname) {
    const file = String(pathname || "").split("/").pop() || "";
    if (file === "help-guest.html") return "guest";
    if (file === "help-host.html") return "host";
    if (file === "help-platform.html") return "platform";
    return "";
  }

  function mountHubPageIfPresent() {
    const hubRoot = document.querySelector("#faq-hub-root");
    if (!hubRoot) return;

    const explicitHub = String(hubRoot.getAttribute("data-faq-hub") || "").trim();
    const inferredHub = inferHubFromPath(location.pathname || "");
    const hub = explicitHub || inferredHub;
    if (!hub) return;

    window.renderTheSharedTableStoryFaqHub(hub, hubRoot, {});
  }

  function mountContextualIfPresent() {
    const mounts = [
      { context: "experience", selector: "#faq-context-experience" },
      { context: "checkout", selector: "#faq-context-checkout" },
      { context: "host_onboarding", selector: "#faq-context-host-onboarding" },
      { context: "dashboard_guest", selector: "#faq-context-dashboard-guest" },
      { context: "dashboard_host", selector: "#faq-context-dashboard-host" },
      { context: "about_platform", selector: "#faq-context-about-platform" },
      { context: "about_trust", selector: "#faq-context-about-trust" }
    ];

    mounts.forEach((entry) => {
      const root = document.querySelector(entry.selector);
      if (!root) return;
      window.mountTheSharedTableStoryContextualFaq(entry.context, root, {});
    });
  }

  function bootstrap() {
    hydrateInternalData();
    exposePublicFunctions();
    mountHubPageIfPresent();
    mountContextualIfPresent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
