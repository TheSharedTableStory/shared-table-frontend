// details-utils.js — extracted from inline scripts to comply with CSP
// Handles: expand/collapse toggles, privacy#cookies hash, policy TOC generation

(function () {
  // --- Expand / Collapse toggles (terms.html, host-terms.html) ---
  var expandIds  = ["terms-expand-all",   "ht-expand-all"];
  var collapseIds= ["terms-collapse-all", "ht-collapse-all"];
  function allDetails() { return document.querySelectorAll("details"); }
  expandIds.forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", function () {
      allDetails().forEach(function (d) { d.open = true; });
    });
  });
  collapseIds.forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", function () {
      allDetails().forEach(function (d) { d.open = false; });
    });
  });

  // --- Privacy page: auto-expand #cookies section ---
  if (window.location.hash === "#cookies") {
    var el = document.getElementById("cookies");
    if (el && el.tagName === "DETAILS") {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // --- Policy page: TOC generator ---
  var container = document.getElementById("policy-sections");
  var tocList   = document.getElementById("policy-toc-list");
  if (container && tocList) {
    var details = container.querySelectorAll("details");
    details.forEach(function (d, i) {
      var summary = d.querySelector("summary");
      if (!summary) return;
      var text = summary.textContent.trim();
      var id   = "policy-s" + i;
      d.id = id;
      var li = document.createElement("li");
      var a  = document.createElement("a");
      a.href        = "#" + id;
      a.textContent = text;
      a.className   = "text-tsts-brown hover:underline";
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }
})();
