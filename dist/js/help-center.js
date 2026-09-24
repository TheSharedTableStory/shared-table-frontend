(() => {
  const HUBS = ["guest", "host", "platform"];
  const rendered = Object.create(null);
  const hubMeta = {
    guest: {
      title: "Guest FAQ",
      subtitle: "Booking, payments, cancellations, and trust questions in one place."
    },
    host: {
      title: "Host FAQ",
      subtitle: "Hosting, payouts, policies, and trust questions in one place."
    },
    platform: {
      title: "How The Platform Works",
      subtitle: "Platform lifecycle, policies, and trust questions in one place."
    }
  };
  let activeHub = "";

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
    const result = window.renderTheSharedTableStoryFaqHub(hub, mountSelector, { includeTrust: true });
    if (!result || !result.ok) {
      showRenderError(mount, hub);
      return false;
    }
    rendered[hub] = true;
    return true;
  }

  function setActiveMeta(hub) {
    const title = document.getElementById("faq-active-title");
    const subtitle = document.getElementById("faq-active-subtitle");
    const meta = hubMeta[hub];
    if (title) title.textContent = meta ? meta.title : "";
    if (subtitle) subtitle.textContent = meta ? meta.subtitle : "";
  }

  function toggleHub(hub) {
    const shell = document.getElementById("faq-active-shell");
    const panel = document.getElementById(panelId(hub));
    const button = document.querySelector('[data-hub-toggle="' + hub + '"]');
    if (!shell || !panel || !button) return;

    if (activeHub === hub) {
      collapseHub(hub);
      shell.classList.add("hidden");
      activeHub = "";
      return;
    }

    collapseAllExcept(hub);
    panel.classList.remove("hidden");
    setTileState(button, true);
    setActiveMeta(hub);
    shell.classList.remove("hidden");
    activeHub = hub;
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
