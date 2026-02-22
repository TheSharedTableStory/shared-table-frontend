// Contextual trust FAQ renderer.
// This file intentionally avoids attaching public APIs directly.

(() => {
  const INTERNAL_DATA_KEY = "__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__";
  const INTERNAL_CONTEXTUAL_KEY = "__THE_SHARED_TABLE_STORY_FAQ_CONTEXTUAL_INTERNAL__";

  function getState() {
    const state = window[INTERNAL_DATA_KEY];
    if (!state || typeof state !== "object") return { catalog: [], trustConfig: null };
    return {
      catalog: Array.isArray(state.catalog) ? state.catalog : [],
      trustConfig: state.trustConfig && typeof state.trustConfig === "object" ? state.trustConfig : null
    };
  }

  function createEl(tag, attrs, children) {
    if (window.tstsEl) return window.tstsEl(tag, attrs, children);
    const el = document.createElement(tag);
    if (attrs && typeof attrs === "object") {
      Object.keys(attrs).forEach((key) => {
        if (key === "className") {
          el.className = attrs[key];
        } else if (key === "textContent") {
          el.textContent = attrs[key];
        } else if (key.startsWith("data-")) {
          el.setAttribute(key, attrs[key]);
        } else {
          try {
            el[key] = attrs[key];
          } catch (_) {}
        }
      });
    }
    const nodes = Array.isArray(children) ? children : [children];
    nodes.forEach((child) => {
      if (child == null) return;
      if (typeof child === "string" || typeof child === "number") {
        el.appendChild(document.createTextNode(String(child)));
        return;
      }
      if (child instanceof Node) el.appendChild(child);
    });
    return el;
  }

  function setText(el, value) {
    if (!el) return;
    if (window.tstsSetText) {
      window.tstsSetText(el, value);
      return;
    }
    el.textContent = value == null ? "" : String(value);
  }

  function resolveMount(mountSelector) {
    if (!mountSelector) return null;
    if (mountSelector instanceof Element) return mountSelector;
    if (typeof mountSelector === "string") return document.querySelector(mountSelector);
    return null;
  }

  function getTrustItemsForContext(contextId) {
    const state = getState();
    const trustConfig = state.trustConfig || {};
    const placement = trustConfig.contextPlacement && trustConfig.contextPlacement[String(contextId || "")];
    const fallback = Array.isArray(trustConfig.trustFaqIds) ? trustConfig.trustFaqIds : [];
    const wantedIds = Array.isArray(placement) && placement.length > 0 ? placement : fallback;

    return state.catalog.filter((item) => {
      if (!item || typeof item !== "object") return false;
      if (String(item.status || "") !== "active") return false;
      return wantedIds.indexOf(String(item.id || "")) >= 0;
    });
  }

  function makeAccordionItem(item) {
    const toggle = createEl(
      "button",
      {
        type: "button",
        className:
          "w-full text-left flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:text-base font-semibold text-tsts-ink hover:bg-slate-50 transition"
      },
      [
        createEl("span", { className: "pr-3", textContent: String(item.question || "") }),
        createEl("span", { className: "text-slate-500 text-base leading-none", textContent: "+" })
      ]
    );
    toggle.setAttribute("aria-expanded", "false");

    const answer = createEl(
      "div",
      {
        className:
          "hidden rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm sm:text-base leading-relaxed text-slate-700"
      },
      String(item.answer || "")
    );

    toggle.addEventListener("click", () => {
      const hidden = answer.classList.contains("hidden");
      const icon = toggle.querySelector("span:last-child");
      if (hidden) {
        answer.classList.remove("hidden");
        setText(icon, "−");
        toggle.setAttribute("aria-expanded", "true");
      } else {
        answer.classList.add("hidden");
        setText(icon, "+");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    return createEl("article", { className: "space-y-2" }, [toggle, answer]);
  }

  function createEscalation() {
    const rendererInternal = window.__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__;
    if (rendererInternal && typeof rendererInternal.createEscalationBlock === "function") {
      return rendererInternal.createEscalationBlock();
    }

    return createEl(
      "section",
      {
        className:
          "rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 sm:px-5 sm:py-5"
      },
      [
        createEl("h3", { className: "heading-serif text-lg font-semibold text-tsts-ink mb-1" }, "Still Need Help?"),
        createEl("p", { className: "text-sm text-slate-600 mb-4" }, "Use one of these actions and we will route you to the right support flow."),
        createEl("div", { className: "flex flex-wrap gap-2" }, [
          createEl(
            "a",
            {
              href: "my-bookings.html",
              className:
                "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition"
            },
            "Manage bookings"
          ),
          createEl(
            "a",
            {
              href: "report.html",
              className:
                "inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition"
            },
            "Report an issue"
          ),
          createEl(
            "a",
            {
              href: "mailto:admin@thesharedtablestory.com",
              className: "inline-flex items-center justify-center rounded-xl tsts-btn-primary px-3 py-2 text-xs font-semibold"
            },
            "Contact support"
          )
        ])
      ]
    );
  }

  function mountContextualFaq(contextId, mountSelector) {
    const mount = resolveMount(mountSelector);
    if (!mount) return { ok: false, error: "FAQ_CONTEXT_MOUNT_NOT_FOUND" };

    const items = getTrustItemsForContext(contextId);
    if (items.length === 0) {
      mount.classList.add("hidden");
      return { ok: true, count: 0 };
    }

    mount.classList.remove("hidden");
    mount.classList.add("help-center", "help-center-contextual");
    mount.textContent = "";

    const contextKey = String(contextId || "").trim().toLowerCase();
    let headingText = "Trust & Safety Questions";
    let subtitleText = "Questions about refunds, cancellations, payments, and safety?";
    if (contextKey === "dashboard_guest") {
      headingText = "Booking FAQs";
      subtitleText = "Expand quick answers for booking management, cancellations, and support.";
    } else if (contextKey === "dashboard_host") {
      headingText = "Host FAQs";
      subtitleText = "Expand quick answers for hosting operations, payouts, and reporting.";
    } else if (contextKey === "about_platform") {
      headingText = "How The Platform Works";
      subtitleText = "Expand to view lifecycle, payment, and policy snapshot answers.";
    } else if (contextKey === "about_trust") {
      headingText = "Trust & Safety Questions";
      subtitleText = "Expand to view payments, cancellation, dispute, and privacy answers.";
    }

    const headerButton = createEl(
      "button",
      {
        type: "button",
        className:
          "w-full text-left rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 flex items-start justify-between gap-3 hover:bg-white transition"
      },
      [
        createEl("span", { className: "block" }, [
          createEl("span", { className: "block text-sm font-semibold text-tsts-ink" }, headingText),
          createEl(
            "span",
            { className: "block mt-1 text-xs text-slate-600" },
            subtitleText
          )
        ]),
        createEl("span", { className: "text-slate-500 text-lg leading-none", textContent: "+" })
      ]
    );

    const panel = createEl("div", { className: "hidden mt-3 space-y-3" });
    items.forEach((item) => panel.appendChild(makeAccordionItem(item)));
    panel.appendChild(createEscalation());

    headerButton.addEventListener("click", () => {
      const hidden = panel.classList.contains("hidden");
      const icon = headerButton.querySelector("span:last-child");
      if (hidden) {
        panel.classList.remove("hidden");
        setText(icon, "−");
        headerButton.setAttribute("aria-expanded", "true");
      } else {
        panel.classList.add("hidden");
        setText(icon, "+");
        headerButton.setAttribute("aria-expanded", "false");
      }
    });

    headerButton.setAttribute("aria-expanded", "false");

    mount.appendChild(headerButton);
    mount.appendChild(panel);

    return { ok: true, count: items.length };
  }

  window[INTERNAL_CONTEXTUAL_KEY] = Object.freeze({
    mountContextualFaq
  });
})();
