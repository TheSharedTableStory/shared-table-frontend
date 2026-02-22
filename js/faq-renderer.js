// Safe FAQ hub renderer for The Shared Table Story website.
// This file intentionally avoids attaching public APIs directly.

(() => {
  const INTERNAL_DATA_KEY = "__THE_SHARED_TABLE_STORY_FAQ_INTERNAL__";
  const INTERNAL_RENDERER_KEY = "__THE_SHARED_TABLE_STORY_FAQ_RENDERER_INTERNAL__";
  const SECTION_LABELS = Object.freeze({
    "before-attending": "Before Attending",
    "booking-management": "Booking Management",
    "booking-lifecycle": "Booking Lifecycle",
    "cancellation-refunds": "Cancellation & Refunds",
    "host-cancellation": "Host Cancellation",
    "location-privacy": "Location Privacy",
    "refund-timing": "Refund Timing",
    "trust-safety": "Trust & Safety"
  });
  const HUB_SECTION_ORDER = Object.freeze({
    guest: ["before-attending", "booking", "payments", "cancellation", "safety", "support", "trust-safety"],
    host: ["onboarding", "listing", "booking-management", "earnings", "cancellation", "safety", "disputes", "trust-safety"],
    platform: ["basics", "booking-lifecycle", "roles", "payments", "cancellation-refunds", "disputes", "trust-safety", "privacy", "policies"]
  });

  function getFaqState() {
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

  function safeHref(href) {
    if (window.tstsSafeUrl) return window.tstsSafeUrl(String(href || ""), "");
    return String(href || "");
  }

  function resolveMount(mountSelector) {
    if (!mountSelector) return null;
    if (mountSelector instanceof Element) return mountSelector;
    if (typeof mountSelector === "string") return document.querySelector(mountSelector);
    return null;
  }

  function normalizeSection(value) {
    return String(value || "").trim().toLowerCase();
  }

  function titleizeSection(section) {
    const text = String(section || "").trim();
    if (!text) return "General";
    const normalized = normalizeSection(text);
    if (SECTION_LABELS[normalized]) return SECTION_LABELS[normalized];
    return text
      .split("-")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
      .join(" ");
  }

  function sortSections(sectionNames, hubId) {
    const normalizedHub = String(hubId || "").trim().toLowerCase();
    const order = HUB_SECTION_ORDER[normalizedHub];
    if (!Array.isArray(order) || order.length === 0) return sectionNames.sort();
    const indexMap = new Map();
    order.forEach((name, index) => indexMap.set(String(name || ""), index));
    return sectionNames.sort((a, b) => {
      const ai = indexMap.has(a) ? indexMap.get(a) : Number.MAX_SAFE_INTEGER;
      const bi = indexMap.has(b) ? indexMap.get(b) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }

  function matchQuery(item, query) {
    if (!query) return true;
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const haystack = [item.question, item.answer, item.section]
      .map((v) => String(v || "").toLowerCase())
      .join(" ");
    return haystack.indexOf(q) >= 0;
  }

  function normalizeQuestion(question) {
    return String(question || "").trim().toLowerCase();
  }

  function getHubItems(hubId, options) {
    const state = getFaqState();
    const targetHub = String(hubId || "");
    const includeTrust = Boolean(options && options.includeTrust && targetHub !== "trust");
    const baseItems = state.catalog.filter((item) => {
      if (!item || typeof item !== "object") return false;
      if (String(item.status || "") !== "active") return false;
      if (String(item.hub || "") !== targetHub) return false;
      return Array.isArray(item.contexts) && item.contexts.indexOf("hub") >= 0;
    });

    if (!includeTrust) return baseItems;

    const seenQuestions = new Set(baseItems.map((item) => normalizeQuestion(item.question)));
    const trustItems = state.catalog
      .filter((item) => {
        if (!item || typeof item !== "object") return false;
        if (String(item.status || "") !== "active") return false;
        return String(item.hub || "") === "trust";
      })
      .filter((item) => {
        const key = normalizeQuestion(item.question);
        if (!key || seenQuestions.has(key)) return false;
        seenQuestions.add(key);
        return true;
      })
      .map((item) =>
        Object.assign({}, item, {
          section: "trust-safety"
        })
      );

    return baseItems.concat(trustItems);
  }

  function createQuestionDetails(item) {
    const summary = createEl(
      "summary",
      {
        className:
          "flex items-center justify-between px-4 py-3 bg-gray-50/80 cursor-pointer hover:bg-gray-100 transition text-base font-semibold text-gray-900"
      },
      [
        createEl("span", { className: "pr-4", textContent: String(item.question || "") }),
        createEl("span", { className: "help-center-chevron text-gray-500 text-base leading-none" }, "⌄")
      ]
    );

    const body = createEl(
      "div",
      {
        className: "px-4 py-3 text-base text-gray-700 leading-relaxed space-y-2"
      },
      String(item.answer || "")
    );

    const details = createEl(
      "details",
      {
        className: "border border-gray-100 rounded-lg overflow-hidden"
      },
      [summary, body]
    );

    return details;
  }

  function createEscalationBlock() {
    const state = getFaqState();
    const escalation =
      state.trustConfig && state.trustConfig.escalation
        ? state.trustConfig.escalation
        : {
            manageBookingsUrl: "my-bookings.html",
            reportIssueUrl: "report.html",
            contactSupportHref: "mailto:admin@thesharedtablestory.com"
          };

    const manageLink = createEl(
      "a",
      {
        href: safeHref(escalation.manageBookingsUrl || "my-bookings.html"),
        className:
          "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition"
      },
      "Manage bookings"
    );

    const reportLink = createEl(
      "a",
      {
        href: safeHref(escalation.reportIssueUrl || "report.html"),
        className:
          "inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition"
      },
      "Report an issue"
    );

    const contactLink = createEl(
      "a",
      {
        href: safeHref(escalation.contactSupportHref || "mailto:admin@thesharedtablestory.com"),
        className: "inline-flex items-center justify-center rounded-xl tsts-btn-primary px-3 py-2 text-xs font-semibold"
      },
      "Contact support"
    );

    return createEl(
      "section",
      {
        className: "rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 sm:px-5 sm:py-5"
      },
      [
        createEl("h3", { className: "heading-serif text-lg font-semibold text-tsts-ink mb-1" }, "Still Need Help?"),
        createEl("p", { className: "text-sm text-slate-600 mb-4" }, "Use one of these actions and we will route you to the right support flow."),
        createEl("div", { className: "flex flex-wrap gap-2" }, [manageLink, reportLink, contactLink])
      ]
    );
  }

  function ensureHubSkeleton(root) {
    root.classList.add("help-center");

    let search = root.querySelector("[data-faq-search]");
    if (!search) {
      search = createEl("input", {
        type: "search",
        className:
          "w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400",
        placeholder: "Search questions...",
        "aria-label": "Search questions",
        "data-faq-search": "1"
      });
      root.appendChild(search);
    }

    const count = root.querySelector("[data-faq-count]");
    if (count) count.classList.add("hidden");

    let list = root.querySelector("[data-faq-list]");
    if (!list) {
      list = createEl("div", { className: "space-y-3", "data-faq-list": "1" });
      root.appendChild(list);
    }

    let hint = root.querySelector("[data-faq-hint]");
    if (!hint) {
      hint = createEl(
        "p",
        {
          className: "text-xs sm:text-sm text-slate-500",
          "data-faq-hint": "1"
        },
        "Select a section to expand questions and answers."
      );
      root.appendChild(hint);
    }

    let empty = root.querySelector("[data-faq-empty]");
    if (!empty) {
      empty = createEl(
        "p",
        {
          className: "hidden rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500",
          "data-faq-empty": "1"
        },
        "No matching questions yet. Try a different keyword."
      );
      root.appendChild(empty);
    }

    let escalation = root.querySelector("[data-faq-escalation]");
    if (!escalation) {
      escalation = createEl("div", { className: "mt-8", "data-faq-escalation": "1" });
      root.appendChild(escalation);
    }

    return { search, list, hint, empty, escalation };
  }

  function groupBySection(items, query) {
    const grouped = new Map();
    items.forEach((item) => {
      if (!matchQuery(item, query)) return;
      const section = normalizeSection(item.section) || "general";
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section).push(item);
    });
    return grouped;
  }

  function renderFaqHubInternal(hubId, mountSelector, options) {
    const root = resolveMount(mountSelector);
    if (!root) return { ok: false, error: "FAQ_MOUNT_NOT_FOUND" };

    const items = getHubItems(hubId, options || {});
    const skeleton = ensureHubSkeleton(root);

    function renderSections() {
      const query = String(skeleton.search.value || "").trim();
      const grouped = groupBySection(items, query);
      const sections = sortSections(Array.from(grouped.keys()), hubId);

      skeleton.list.textContent = "";

      sections.forEach((sectionName) => {
        const sectionItems = grouped.get(sectionName) || [];
        const summary = createEl(
          "summary",
          {
            className:
              "flex items-center justify-between px-4 py-3 bg-gray-50/80 cursor-pointer hover:bg-gray-100 transition text-base font-semibold text-gray-900"
          },
          [
            createEl("span", { className: "pr-4", textContent: titleizeSection(sectionName) }),
            createEl("span", { className: "help-center-chevron text-slate-500 text-base leading-none" }, "⌄")
          ]
        );

        const sectionBody = createEl("div", { className: "px-4 py-3 text-base text-gray-700 leading-relaxed space-y-2" });
        sectionItems.forEach((item) => {
          sectionBody.appendChild(createQuestionDetails(item));
        });

        const sectionDetails = createEl(
          "details",
          {
            className: "border border-gray-100 rounded-lg overflow-hidden"
          },
          [summary, sectionBody]
        );
        if (query && sectionItems.length > 0) {
          sectionDetails.open = true;
        }

        skeleton.list.appendChild(sectionDetails);
      });

      if (sections.length === 0) {
        skeleton.empty.classList.remove("hidden");
      } else {
        skeleton.empty.classList.add("hidden");
      }

    }

    skeleton.search.addEventListener("input", renderSections);
    renderSections();

    skeleton.escalation.textContent = "";
    skeleton.escalation.appendChild(createEscalationBlock());

    return { ok: true, count: items.length };
  }

  window[INTERNAL_RENDERER_KEY] = Object.freeze({
    renderFaqHub: renderFaqHubInternal,
    createEscalationBlock
  });
})();
