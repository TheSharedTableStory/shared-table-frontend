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
  var msgTotal = document.getElementById("report-msg-total");
  var phoneInput = document.getElementById("reportPhone");
  var submitBtn = document.getElementById("report-submit-btn");
  var nextBtn1 = document.getElementById("report-next-1");
  var returnLink = document.getElementById("report-return-link");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      var sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
      // A rate-limit is not a signed-out user. tstsGetSession only protects against this when a
      // good session is already cached, so a FIRST load that hits the limit used to throw a
      // genuinely signed-in person out to the login page — while they were trying to report
      // something. Wait and retry instead of evicting them.
      if (sess && Number(sess.status) === 429) {
        setAlert("error", "We're a bit busy right now. Give it a moment and refresh this page — nothing you typed is lost.");
        return false;
      }
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
          // F181: selection was conveyed by colour alone, so a screen reader could not tell
          // which category was chosen on a moderation flow. Keep ARIA in step with the paint.
          c.setAttribute("aria-pressed", "false");
        });
        card.classList.remove("border-slate-200");
        card.classList.add("border-tsts-clay", "bg-orange-50");
        card.setAttribute("aria-pressed", "true");
        __selectedCategory = card.getAttribute("data-report-category") || "";
        // WALK-P44-1: the category tag is part of what is sent, so the budget moves with it.
        applyMessageBudget();
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
        // WALK-P44-1: the contact note is part of what is sent, so the budget moves with it.
        applyMessageBudget();
      });
    });
  }

  // WALK-P44-1: the platform stores at most 2,000 characters for a report, and this form used to
  // let a person fill all 2,000 and THEN append the category tag and the contact note on top, so
  // the combined text went over and the server's own safety-net trim silently cut the tail: the
  // reporter's phone number. Reserving room for the tag and the note instead moved the loss onto
  // the reporter's own words, which is worse, and the screen still promised 2,000 either way.
  // Nothing is cut now and nothing is promised that is not true: the tag and the note are measured
  // first, whatever is left is the real budget, the counter shows THAT number, the box stops at it,
  // and if a change shrinks the budget under what is already typed the person is told, not trimmed.
  var MESSAGE_CAP = 2000; // matches the platform's own cap for the stored report text

  function categoryPrefix() {
    return (__selectedCategory === "inaccurate") ? "[Category: Inaccurate or misleading information]\n" : "";
  }

  function contactSuffix() {
    var radio = document.querySelector("input[name='reportContact']:checked");
    var pref = radio ? radio.value : "";
    if (pref !== "phone" || !phoneInput) return "";
    var phone = String(phoneInput.value || "").trim();
    return phone ? ("\n\n[Contact preference: phone, " + phone + "]") : "";
  }

  function messageBudget() {
    var room = MESSAGE_CAP - categoryPrefix().length - contactSuffix().length;
    return room < 0 ? 0 : room;
  }

  // The refusal used to name a phone number and a category tag every time, whether or not either
  // was there, so a person who had given no number read that their number was taking up the room.
  // This names only what really is.
  function budgetReason() {
    var hasTag = categoryPrefix().length > 0;
    var hasPhone = contactSuffix().length > 0;
    if (hasTag && hasPhone) return "Your phone number and the category tag are sent with this report";
    if (hasPhone) return "Your phone number is sent with this report";
    if (hasTag) return "The category tag is sent with this report";
    return "Your description is sent with this report";
  }

  function applyMessageBudget() {
    var room = messageBudget();
    if (messageEl) messageEl.maxLength = room;
    if (msgTotal) msgTotal.textContent = String(room);
    if (messageEl && msgCounter) msgCounter.textContent = String(messageEl.value.length);
    if (messageEl && messageEl.value.length > room) {
      setAlert("error", budgetReason() + ", so there is room for " + room + " characters of your description. Please shorten it by " + (messageEl.value.length - room) + " characters.");
    }
  }

  function initMessageCounter() {
    if (messageEl && msgCounter) {
      messageEl.addEventListener("input", function () {
        msgCounter.textContent = String(messageEl.value.length);
      });
    }
    if (phoneInput) phoneInput.addEventListener("input", applyMessageBudget);
    applyMessageBudget();
  }

  async function submitReport() {
    var msg = messageEl ? String(messageEl.value || "").trim() : "";
    if (msg.length < 10) {
      setAlert("error", "Please provide more detail about what happened (at least 10 characters).");
      return;
    }

    // Build category, map "inaccurate" to "other" for backend compat (backend only accepts 5 values)
    var catMap = { safety: "safety", spam: "spam", harassment: "harassment", fraud: "fraud", inaccurate: "other", other: "other" };
    var category = catMap[__selectedCategory] || "other";

    // WALK-P44-1: the category tag and the contact note are measured FIRST and the description is
    // fitted into what is left, never the other way round. Nothing a person deliberately chose to
    // add is ever the part that goes missing, and if there is not enough room they are told so and
    // the report is not sent, rather than being trimmed behind their back.
    var prefix = categoryPrefix();
    var suffix = contactSuffix();
    var room = messageBudget();
    if (msg.length > room) {
      setAlert("error", budgetReason() + ", so there is room for " + room + " characters of your description. Please shorten it by " + (msg.length - room) + " characters and send it again.");
      applyMessageBudget();
      return;
    }
    var fullMessage = prefix + msg + suffix;

    var payload = {
      targetType: targetTypeEl ? String(targetTypeEl.value || "").trim() : "",
      targetId: targetIdEl ? String(targetIdEl.value || "").trim() : "",
      category: category,
      message: fullMessage
    };

    // A platform report carries no target by design; everything else must name one.
    if (payload.targetType !== "platform" && !payload.targetId) {
      warnIfNothingToReportAbout();
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
      setAlert("error", (err && err.message) ? err.message : "We couldn't send your report just now. Please try again.");
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

  // A report has to be ABOUT something — the server needs the listing, person or booking being
  // reported, OR the explicit "platform" type for a concern that is not tied to either. Reached
  // from an experience or a profile, the target comes in on the URL. Reached from the footer link
  // (which sits on every page) or from the help centre, nothing comes in — and the old behaviour
  // let the reporter choose a category, write out what happened, press Submit, and only THEN be
  // told to go and find a different button. There was no way at all to report the platform itself.
  // Now the first question is what the report is about, and neither answer is a dead end.
  function hasRealTarget() {
    return !!(targetIdEl && /^[0-9a-fA-F]{24}$/.test(String(targetIdEl.value || "").trim()));
  }

  function warnIfNothingToReportAbout() {
    if (hasRealTarget()) return;
    setAlert(
      "error",
      "Tell us what this report is about first, so it reaches the right people."
    );
  }

  function initAboutStep() {
    var aboutBlock = document.getElementById("report-about");
    var catBlock = document.getElementById("report-categories-block");
    var specificHelp = document.getElementById("report-about-specific-help");
    if (!aboutBlock || !catBlock) return;

    // Arrived from a listing or a profile: the target is already known, nothing to ask.
    if (hasRealTarget()) return;

    aboutBlock.classList.remove("hidden");
    catBlock.classList.add("hidden");
    // The step marker at the top must agree with the question actually on screen. While the
    // about-step is showing, step 1 IS "what is this about?"; it returns to the wizard's own
    // wording the moment the reporter chooses. A label contradicting the heading under it is
    // exactly the kind of small mismatch that reads as unfinished.
    var step1Label = document.querySelector("[data-report-step-label='1']");
    var step1LabelDefault = step1Label ? step1Label.textContent : "";
    if (step1Label) step1Label.textContent = "1. What is this about?";

    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-report-about]");
      if (!btn) return;
      var choice = btn.getAttribute("data-report-about");
      if (choice === "specific") {
        if (specificHelp) specificHelp.classList.remove("hidden");
        return;
      }
      if (choice === "platform") {
        // The server accepts this type with no target id; the report goes to the same
        // moderation queue and the reporter gets the same reference back.
        if (targetTypeEl) targetTypeEl.value = "platform";
        if (targetIdEl) targetIdEl.value = "";
        aboutBlock.classList.add("hidden");
        catBlock.classList.remove("hidden");
        if (step1Label && step1LabelDefault) step1Label.textContent = step1LabelDefault;
        clearAlert();
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
    initAboutStep();
  });
})();
