(() => {
  const HUBS = ["guest", "host", "platform", "trust"];
  const rendered = Object.create(null);

  function panelId(hub) {
    return "faq-hub-panel-" + hub;
  }

  function mountId(hub) {
    return "faq-hub-" + hub + "-root";
  }

  function setTileState(button, expanded) {
    if (!button) return;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    button.setAttribute("data-expanded", expanded ? "true" : "false");
    const icon = button.querySelector("[data-hub-icon]");
    if (icon) icon.textContent = expanded ? "−" : "+";
  }

  function collapseHub(hub) {
    const panel = document.getElementById(panelId(hub));
    const button = document.querySelector('[data-hub-toggle="' + hub + '"]');
    if (panel) panel.classList.add("hidden");
    setTileState(button, false);
  }

  function collapseAllExcept(keepHub) {
    HUBS.forEach((hub) => {
      if (hub === keepHub) return;
      collapseHub(hub);
    });
  }

  function showRenderError(mount, hub) {
    if (!mount) return;
    mount.textContent = "";
    const box = document.createElement("p");
    box.className = "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700";
    box.textContent = "Unable to load " + hub + " questions right now. Please refresh and try again.";
    mount.appendChild(box);
  }

  function ensureHubRendered(hub) {
    if (rendered[hub]) return true;
    const mountSelector = "#" + mountId(hub);
    const mount = document.querySelector(mountSelector);
    if (!mount) return false;
    if (typeof window.renderTheSharedTableStoryFaqHub !== "function") {
      showRenderError(mount, hub);
      return false;
    }
    const result = window.renderTheSharedTableStoryFaqHub(hub, mountSelector, {});
    if (!result || !result.ok) {
      showRenderError(mount, hub);
      return false;
    }
    rendered[hub] = true;
    return true;
  }

  function toggleHub(hub) {
    const panel = document.getElementById(panelId(hub));
    const button = document.querySelector('[data-hub-toggle="' + hub + '"]');
    if (!panel || !button) return;

    const willOpen = panel.classList.contains("hidden");
    if (!willOpen) {
      panel.classList.add("hidden");
      setTileState(button, false);
      return;
    }

    collapseAllExcept(hub);
    panel.classList.remove("hidden");
    setTileState(button, true);

    ensureHubRendered(hub);
  }

  function bind() {
    const root = document.getElementById("help-root");
    if (!root) return;

    HUBS.forEach((hub) => {
      const button = document.querySelector('[data-hub-toggle="' + hub + '"]');
      if (!button) return;
      setTileState(button, false);
      button.addEventListener("click", () => toggleHub(hub));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
