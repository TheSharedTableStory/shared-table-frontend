(function () {
  var __reportStep = 1;
  var __selectedCategory = "";
  var __referrerUrl = "";

  var alertEl = document.getElementById("report-alert");
  var progressBar = document.getElementById("report-progress-bar");
  var targetTypeEl = document.getElementById("reportTargetType");
  var targetIdEl = document.getElementById("reportTargetId");
  var pageUrlEl = document.getElementById("reportPageUrl");
  var messageEl = document.getElementById("reportMessage");
  var msgCounter = document.getElementById("report-msg-counter");
  var phoneInput = document.getElementById("reportPhone");
  var submitBtn = document.getElementById("report-submit-btn");
  var nextBtn1 = document.getElementById("report-next-1");
  var returnLink = document.getElementById("report-return-link");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      var sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    var returnTarget = String((location.pathname || "report.html") + (location.search || "")).replace(/^\//, "");
    var returnTo = encodeURIComponent(returnTarget || "report.html");
    location.href = "login.html?returnTo=" + returnTo;
    return false;
  }

  function setAlert(type, msg) {
    if (!alertEl) return;
    alertEl.classList.remove("hidden");
    alertEl.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    alertEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    var t = String(type || "error");
    if (t === "success") alertEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    else alertEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
    alertEl.textContent = String(msg || "");
  }

  function clearAlert() {
    if (!alertEl) return;
    alertEl.classList.add("hidden");
    alertEl.textContent = "";
  }

  function showStep(step) {
    __reportStep = step;
    for (var i = 1; i <= 3; i++) {
      var el = document.getElementById("report-step-" + i);
      if (el) {
        if (i === step) el.classList.remove("hidden");
        else el.classList.add("hidden");
      }
      var label = document.querySelector("[data-report-step-label='" + i + "']");
      if (label) {
        if (i <= step) {
          label.classList.remove("text-slate-400");
          label.classList.add("font-bold", "text-tsts-ink");
        } else {
          label.classList.add("text-slate-400");
          label.classList.remove("font-bold", "text-tsts-ink");
        }
      }
    }
    if (progressBar) progressBar.style.width = Math.round((step / 3) * 100) + "%";
    clearAlert();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fillFromUrl() {
    try {
      var q = new URLSearchParams(location.search);
      var tt = q.get("targetType");
      var tid = q.get("targetId");
      var pageUrl = q.get("pageUrl") || q.get("from") || "";
      if (tt && targetTypeEl) targetTypeEl.value = String(tt);
      var validId = tid && /^[0-9a-fA-F]{24}$/.test(String(tid).trim());
      if (validId && targetIdEl) targetIdEl.value = String(tid).trim();
      if (pageUrl && pageUrlEl) pageUrlEl.value = String(pageUrl);
      __referrerUrl = String(pageUrl || document.referrer || "").trim();
      if (__referrerUrl && returnLink) returnLink.href = __referrerUrl;
    } catch (_) {}
  }

  function initCategoryCards() {
    var cards = document.querySelectorAll("[data-report-category]");
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        cards.forEach(function (c) {
          c.classList.remove("border-tsts-clay", "bg-orange-50");
          c.classList.add("border-slate-200");
        });
        card.classList.remove("border-slate-200");
        card.classList.add("border-tsts-clay", "bg-orange-50");
        __selectedCategory = card.getAttribute("data-report-category") || "";
        if (nextBtn1) nextBtn1.disabled = false;
      });
    });
  }

  function initContactToggle() {
    var radios = document.querySelectorAll("input[name='reportContact']");
    radios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (phoneInput) {
          if (radio.value === "phone") phoneInput.classList.remove("hidden");
          else phoneInput.classList.add("hidden");
        }
      });
    });
  }

  function initMessageCounter() {
    if (messageEl && msgCounter) {
      messageEl.addEventListener("input", function () {
        msgCounter.textContent = String(messageEl.value.length);
      });
    }
  }

  async function submitReport() {
    var msg = messageEl ? String(messageEl.value || "").trim() : "";
    if (msg.length < 10) {
      setAlert("error", "Please provide more detail about what happened (at least 10 characters).");
      return;
    }

    // Build category — map "inaccurate" to "other" for backend compat (backend only accepts 5 values)
    var catMap = { safety: "safety", spam: "spam", harassment: "harassment", fraud: "fraud", inaccurate: "other", other: "other" };
    var category = catMap[__selectedCategory] || "other";

    // Build message with extras
    var fullMessage = msg;
    var contactPref = "";
    var contactRadio = document.querySelector("input[name='reportContact']:checked");
    if (contactRadio) contactPref = contactRadio.value;
    if (contactPref === "phone" && phoneInput) {
      var phone = String(phoneInput.value || "").trim();
      if (phone) fullMessage += "\n\n[Contact preference: phone — " + phone + "]";
    }
    if (__selectedCategory === "inaccurate") {
      fullMessage = "[Category: Inaccurate or misleading information]\n" + fullMessage;
    }

    var payload = {
      targetType: targetTypeEl ? String(targetTypeEl.value || "").trim() : "",
      targetId: targetIdEl ? String(targetIdEl.value || "").trim() : "",
      category: category,
      message: fullMessage
    };

    if (!payload.targetId) {
      setAlert("error", "To report an issue, use the report button on the relevant experience or profile page.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    try {
      var res = await window.authFetch("/api/moderation/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error((data && data.message) ? data.message : "Report failed");

      showStep(3);
    } catch (err) {
      setAlert("error", (err && err.message) ? err.message : "Something went wrong. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
      }
    }
  }

  function initNavigation() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-report-nav]");
      if (!btn) return;
      var action = btn.getAttribute("data-report-nav");
      if (action === "next" && __reportStep === 1) {
        if (!__selectedCategory) {
          setAlert("error", "Please select a category.");
          return;
        }
        showStep(2);
      } else if (action === "prev" && __reportStep === 2) {
        showStep(1);
      } else if (action === "submit") {
        submitReport();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!(await requireAuth())) return;
    fillFromUrl();
    initCategoryCards();
    initContactToggle();
    initMessageCounter();
    initNavigation();
  });
})();
