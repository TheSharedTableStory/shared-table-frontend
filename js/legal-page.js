// js/legal-page.js, fetches and renders the live Privacy / Terms policy from the backend.
// Used by privacy.html and terms.html. The page must include:
//   <div id="legal-content-host"></div>
//   <p id="legal-meta"></p>
// and a body data-attribute: data-legal-type="privacy" | "terms".

(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function renderInline(text) {
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, h) {
      var safe = /^https?:\/\//i.test(h) ? h : "#";
      // BUG-174 (2026-05-19): noopener already blocks reverse-tabnabbing
      // (window.opener nulled); add noreferrer to also strip the Referer
      // header to the external site (matches the codebase standard used at
      // admin.js host-verification links).
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer" class="text-tsts-clay underline hover:text-orange-700">' + t + "</a>";
    });
    return html;
  }

  function markdownToHtml(md) {
    if (!md) return "";
    var lines = String(md).split(/\r?\n/);
    var out = [];
    var para = [];
    var inList = false;
    var listType = null;

    function flushPara() {
      if (para.length === 0) return;
      out.push('<p class="text-slate-700 leading-relaxed mb-4">' + renderInline(para.join(" ").trim()) + "</p>");
      para = [];
    }
    function closeList() {
      if (inList) {
        out.push(listType === "ol" ? "</ol>" : "</ul>");
        inList = false;
        listType = null;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.trim();
      if (line === "") { flushPara(); closeList(); continue; }
      if (line === "---") { flushPara(); closeList(); out.push('<hr class="my-8 border-slate-200">'); continue; }

      var m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m) {
        flushPara(); closeList();
        var lvl = m[1].length;
        var sizeClass = "";
        if (lvl === 1) sizeClass = "text-3xl font-bold heading-serif text-tsts-ink mb-4 mt-2";
        // 2026-09-07: one ladder, top to bottom — 30 for the page title, 24 for a section,
        // 20 for a sub-heading, 16 below that. A section and a sub-heading used to render at
        // the same size, which told a reader nothing about which contained which.
        else if (lvl === 2) sizeClass = "text-2xl font-bold heading-serif text-tsts-ink mb-3 mt-8";
        else if (lvl === 3) sizeClass = "text-xl font-bold text-tsts-ink mb-2 mt-6";
        else sizeClass = "text-base font-bold text-tsts-ink mb-2 mt-4";
        out.push("<h" + lvl + ' class="' + sizeClass + '">' + renderInline(m[2]) + "</h" + lvl + ">");
        continue;
      }

      m = line.match(/^[-*]\s+(.+)$/);
      if (m) {
        flushPara();
        if (!inList || listType !== "ul") { closeList(); out.push('<ul class="list-disc list-outside ml-6 space-y-2 mb-4 text-slate-700 leading-relaxed">'); inList = true; listType = "ul"; }
        out.push("<li>" + renderInline(m[1]) + "</li>");
        continue;
      }
      m = line.match(/^\d+\.\s+(.+)$/);
      if (m) {
        flushPara();
        if (!inList || listType !== "ol") { closeList(); out.push('<ol class="list-decimal list-outside ml-6 space-y-2 mb-4 text-slate-700 leading-relaxed">'); inList = true; listType = "ol"; }
        out.push("<li>" + renderInline(m[1]) + "</li>");
        continue;
      }
      para.push(line);
    }
    flushPara();
    closeList();
    return out.join("\n");
  }

  // Owner 2026-08-05 (sir: "where is xpand collapse and all the ---- that i had approved"). The
  // 2026-04-29 migration to admin-driven legal pages kept only flat Markdown and dropped the page
  // STRUCTURE. Everything below is transcribed from sir's own committed host-terms.html (commit
  // 17e573ad, lines 41-56): a "Full <policy>" heading with Expand All / Collapse All controls, then
  // one <details> row per section with the chevron. Same classes, same markup. The admin Legal
  // Policies editor still supplies every word — only the shape comes from sir's page.
  var CHEVRON = '<svg class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>';

  function splitSections(md) {
    var lines = String(md || "").split(/\r?\n/);
    var intro = [], sections = [], current = null;
    for (var i = 0; i < lines.length; i++) {
      var h = lines[i].match(/^##\s+(?!#)(.+)$/);
      if (h) { if (current) sections.push(current); current = { title: h[1].trim(), body: [] }; continue; }
      if (current) current.body.push(lines[i]);
      else if (!/^#\s+/.test(lines[i])) intro.push(lines[i]);
    }
    if (current) sections.push(current);
    return { intro: intro.join("\n").trim(), sections: sections };
  }

  function renderStructured(md, label) {
    var parts = splitSections(md);
    if (!parts.sections.length) return markdownToHtml(md);
    var out = [];
    if (parts.intro) {
      out.push('<div class="bg-white rounded-3xl border border-gray-100 shadow-soft-card p-6 mb-8">' + markdownToHtml(parts.intro) + "</div>");
    }
    out.push('<div class="flex flex-col items-start gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">');
    // This heading introduces the whole document, so it sits at the section size, not below it.
    out.push('<h2 class="text-2xl font-bold heading-serif text-tsts-ink">Full ' + escapeHtml(label || "Policy") + "</h2>");
    out.push('<div class="flex gap-2">');
    // Phone tap target: below 640 the box is 46 pixels tall on padding alone, over the platform's
    // 44 pixel minimum (Shared-Modules/audit/MOBILE_VISUAL_DESIGN_AUDIT.txt, section 4, TOUCH
    // TARGETS). From 640 up sm:px-3 sm:py-1.5 sm:text-xs hand the desktop row back unchanged.
    out.push('<button type="button" data-legal-expand="all" class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition whitespace-nowrap sm:px-3 sm:py-1.5 sm:text-xs">Expand All</button>');
    out.push('<button type="button" data-legal-collapse="all" class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition whitespace-nowrap sm:px-3 sm:py-1.5 sm:text-xs">Collapse All</button>');
    out.push("</div></div>");
    out.push('<div class="space-y-3">');
    parts.sections.forEach(function (s) {
      out.push('<details class="border border-gray-100 rounded-lg overflow-hidden bg-white">');
      out.push('<summary class="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 cursor-pointer hover:bg-gray-100 transition text-sm font-semibold text-gray-900">' + renderInline(s.title) + CHEVRON + "</summary>");
      out.push('<div class="px-4 py-3 text-sm text-gray-700 leading-relaxed space-y-2">' + markdownToHtml(s.body.join("\n").trim()) + "</div>");
      out.push("</details>");
    });
    out.push("</div>");
    return out.join("\n");
  }

  function wireExpandCollapse(host) {
    host.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-legal-expand],[data-legal-collapse]") : null;
      if (!btn) return;
      var open = btn.hasAttribute("data-legal-expand");
      host.querySelectorAll("details").forEach(function (d) { d.open = open; });
    });
  }

  function getApiBase() {
    var rt = window.__TSTS_RUNTIME__;
    if (rt && typeof rt.apiBase === "string" && rt.apiBase) return rt.apiBase.replace(/\/$/, "");
    var h = (window.location && window.location.hostname) || "";
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return "http://localhost:4000";
    return "https://api.thesharedtablestory.com";
  }

  function formatAusDate(d) {
    // Owner 2026-07-24: was a bare ", " placeholder that rendered as a lone comma (same dev-cruft
    // anti-pattern already fixed in admin.js and host.js) — em dash reads as "no value".
    if (!d) return "—";
    try {
      var dt = new Date(d);
      // 2026-08-25: `toLocaleDateString("en-AU", …)` sets the FORMAT to Australian but NOT the
      // TIMEZONE — the date was still resolved against the READER's clock. A policy stored as
      // 2026-08-24T00:13Z therefore rendered "24 August 2026" in Melbourne and "23 August 2026" for
      // anyone west of UTC. The effective date of a binding document must not depend on who is
      // reading it. Pinned to the platform's own jurisdiction, matching what the shared
      // window.tstsFormatDateShort helper in common.js already does. Format is unchanged (long month),
      // so nothing on these pages moves except the date being correct.
      return dt.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric", timeZone: "Australia/Melbourne" });
    } catch (e) { return String(d); }
  }

  // POLICY-006 (2026-05-15): All 7 policy types are loaded by this script.
  var VALID_TYPES = ["privacy", "terms", "host_terms", "cookies", "refund", "community_guidelines", "acceptable_use"];

  function loadAndRender() {
    var type = (document.body.getAttribute("data-legal-type") || "").toLowerCase();
    if (VALID_TYPES.indexOf(type) === -1) return;

    var host = document.getElementById("legal-content-host");
    var meta = document.getElementById("legal-meta");
    if (!host) return;

    // safety: built via DOM helpers, no innerHTML on the loading state.
    var loadingP = document.createElement("p");
    loadingP.className = "text-slate-500 text-center py-12";
    loadingP.textContent = "Loading…";
    host.replaceChildren(loadingP);

    var url = getApiBase() + "/api/legal/" + type;
    fetch(url, { credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var data = (json && json.data) || {};
        if (!data.content) throw new Error("Empty response");
        // safety: markdownToHtml escapes input via escapeHtml() before any inline
        // markdown transform (see line 28+), so output is built from escaped text
        // plus a fixed set of allowed inline tags.
        host.innerHTML = renderStructured(data.content, data.label || "");
        wireExpandCollapse(host);
        if (meta) {
          // POLICY-006 (2026-05-15): Surface label + version + effective date so
          // every page reads "Privacy Policy · v2026.05.15-1 · Effective 15 May 2026".
          // Owner 2026-07-24 (sir: pages "in line with locked ones"): all 7 legal pages had NO <h1> while
          // policy.html had a proper serif one — a consistency AND accessibility gap. Each page now carries a
          // static `heading-serif text-tsts-ink` H1 (matching policy.html), so the policy LABEL is dropped
          // from this meta line to avoid printing the title twice. Meta now reads "v… · Effective …".
          var v = data.version || "(unversioned)";
          var eff = data.effectiveDate ? formatAusDate(data.effectiveDate) : (data.publishedAt ? formatAusDate(data.publishedAt) : "");
          var bits = [];
          bits.push("v" + v);
          if (eff) bits.push("Effective " + eff);
          meta.textContent = bits.join(" · ");
        }
      })
      .catch(function () {
        // safety: built via DOM helpers, no innerHTML.
        var errP = document.createElement("p");
        errP.className = "text-rose-600 text-center py-12";
        errP.textContent = "Could not load this page right now. Please try again shortly.";
        host.replaceChildren(errP);
        if (meta) meta.textContent = "";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndRender);
  } else {
    loadAndRender();
  }

  // Expose for tests
  window.__tstsLegalRender = markdownToHtml;
})();
