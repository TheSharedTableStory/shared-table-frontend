// js/legal-page.js — fetches and renders the live Privacy / Terms policy from the backend.
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
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener" class="text-tsts-clay underline hover:text-orange-700">' + t + "</a>";
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
        else if (lvl === 2) sizeClass = "text-xl font-bold heading-serif text-tsts-ink mb-3 mt-8";
        else if (lvl === 3) sizeClass = "text-lg font-bold text-tsts-ink mb-2 mt-6";
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

  function getApiBase() {
    var rt = window.__TSTS_RUNTIME__;
    if (rt && typeof rt.apiBase === "string" && rt.apiBase) return rt.apiBase.replace(/\/$/, "");
    var h = (window.location && window.location.hostname) || "";
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return "http://localhost:4000";
    return "https://api.thesharedtablestory.com";
  }

  function formatAusDate(d) {
    if (!d) return "—";
    try {
      var dt = new Date(d);
      return dt.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) { return String(d); }
  }

  function loadAndRender() {
    var type = (document.body.getAttribute("data-legal-type") || "").toLowerCase();
    if (type !== "privacy" && type !== "terms") return;

    var host = document.getElementById("legal-content-host");
    var meta = document.getElementById("legal-meta");
    if (!host) return;

    host.innerHTML = '<p class="text-slate-500 text-center py-12">Loading…</p>';

    var url = getApiBase() + "/api/legal/" + type;
    fetch(url, { credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var data = (json && json.data) || {};
        if (!data.content) throw new Error("Empty response");
        host.innerHTML = markdownToHtml(data.content);
        if (meta) {
          var v = data.version || "—";
          var pub = data.publishedAt ? formatAusDate(data.publishedAt) : "—";
          meta.textContent = "Version " + v + " · Last updated " + pub;
        }
      })
      .catch(function () {
        host.innerHTML = '<p class="text-rose-600 text-center py-12">Could not load this page right now. Please try again shortly.</p>';
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
