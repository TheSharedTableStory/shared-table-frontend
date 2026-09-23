// js/check-in.js
// Host check-in flow on the website. Mirrors mobile HostCheckInScreen.
// Flow:
//   1. Auth-gate (redirects to /login.html?next=/check-in.html if not authed)
//   2. Load host's experiences via GET /api/host/experiences (already auth-gated)
//   3. Host picks experience + date → optional /api/host/experiences/:id/check-in-list
//   4. Host enters guest's 6-digit OTP
//   5. POST /api/host/bookings/:bookingId/check-in { otp } via guest's bookingId
//
// For the simplest UX, we let the host enter the OTP directly. The backend
// resolves the booking by OTP+experience+date so the host doesn't have to
// pick the guest's booking explicitly.

(function () {
  function $id(x) { return document.getElementById(x); }

  // sir's Melbourne rule — already carried by host.js and explore.js, and missing here.
  // The listings run in Melbourne, so every calendar date on this page reads Melbourne's
  // clock. The old code used `new Date().toISOString()`, which is the UTC date, and UTC is
  // a DAY BEHIND Melbourne for every morning sitting (Melbourne is UTC+10, so before 10am
  // local the UTC date is still yesterday). A host running the 8am coffee cupping would
  // have loaded yesterday's roster and sent yesterday's date to the check-in route, so the
  // guest standing in front of them could not get through the door. en-CA prints
  // YYYY-MM-DD, the shape this pipeline carries.
  function melbourneTodayIso() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (_tzErr) {
      var _d = new Date();
      return new Date(_d.getTime() - _d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
    }
  }

  // Melbourne-anchored day arithmetic for the retroactive floor, so minDate, maxDate and
  // the prefilled value are all measured on the same clock as the dates the host picks.
  function melbourneIsoMinusDays(iso, days) {
    var d = new Date(String(iso) + "T12:00:00"); // midday anchor keeps DST shifts off the date
    d.setDate(d.getDate() - Number(days || 0));
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    return d.getFullYear() + "-" + (mm.length < 2 ? "0" + mm : mm) + "-" + (dd.length < 2 ? "0" + dd : dd);
  }

  // Owner 2026-05-30 (date-picker rollout R3): module-level handle so the date
  // picker can be read after creation. Check-in supports retroactive marks, so
  // we allow ~30 days back (matches the attendance cron horizon) and cap at
  // today (a future check-in makes no sense). Owner's calendar-nav rule still
  // holds — Flatpickr hides the prev arrow once you walk past minDate, so a
  // host on a June calendar will NOT be able to drift into ancient months.
  var checkInDatePicker = null;

  async function ensureAuth() {
    // BUG-164 (2026-05-17): `window.tstsGetSession()` returns a PROMISE. The
    // prior code used it WITHOUT `await`, so `ses` was the (always-truthy)
    // Promise → `if (!ses)` never fired → an UNAUTHENTICATED visitor was
    // NEVER redirected to /login (the auth-gate was dead). Fix: await it
    // (with force:true for a fresh check, matching the other auth gates in
    // common.js) and gate on the REAL resolved shape `{ ok, user }`. NOTE:
    // the audit's snippet `ses?.ok?.user` is itself incorrect — `ok` is a
    // boolean (every common.js call site uses `sess && sess.ok &&
    // sess.user`), so the codebase-canonical `!ses || !ses.ok || !ses.user`
    // guard is used (faithful correction of the audit typo).
    var ses = (window.tstsGetSession && await window.tstsGetSession({ force: true })) || null;
    if (!ses || !ses.ok || !ses.user) {
      // sir 2026-08-15 ("Fix it — both lines"): was "?next=", a parameter login.js never
      // reads — after signing in the host lost the check-in station and landed on My
      // Account. returnTo is the platform-wide vocabulary login.js actually honours.
      window.location.href = "/login.html?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
    return ses;
  }

  function setError(msg) {
    var el = $id("cin-error");
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      window.tstsSetText(el, "");
    } else {
      el.classList.remove("hidden");
      window.tstsSetText(el, msg);
    }
  }

  function showSuccess(detail) {
    var box = $id("cin-success");
    var d   = $id("cin-success-detail");
    if (box && d) {
      window.tstsSetText(d, detail);
      box.classList.remove("hidden");
    }
  }

  // Owner 2026-08-06 (sir: world-best check-in): the station knows the room, not just the code.
  // Experiences are cached (with their timeSlots) to drive the slot picker; the selected
  // occurrence loads a live roster panel (counts + search) that refreshes after every check-in.
  var experiencesCache = [];
  var rosterItems = [];
  var rosterShown = 50;
  var ROSTER_PAGE = 50;

  async function loadExperiences() {
    var picker = $id("cin-experience");
    if (!picker) return;
    try {
      var res = await window.authFetch("/api/host/experiences", { method: "GET" });
      // 2026-09-08 — A HOST COULD BE LOCKED OUT AT THE DOOR.
      // This read the answer without ever asking whether the request succeeded. A failed request still
      // produces an object, so the list came back empty — indistinguishable from a host who has published
      // nothing. The page then told a host with real events that they had none, and switched the check-in
      // button off, on event night, in front of a queue. Ask first, and when the answer is a refusal say
      // what happened and leave the button alone so a retry is possible.
      if (!res || res.ok === false) {
        var __why = "";
        try {
          var __body = await res.json();
          __why = (__body && __body.message) ? String(__body.message) : "";
        } catch (__parseErr) { __why = ""; }
        setError(__why || "We couldn\u2019t load your experiences just now. Check your connection and try again.");
        return;
      }
      var data = await res.json();
      var unwrapped = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
        ? window.unwrapApiPayload(data) : (data && data.data !== undefined ? data.data : data);
      // 2026-08-25 — ROOT CAUSE OF THE CHECK-IN DEAD END.
      // GET /api/host/experiences returns `data.items` (server.js ~:21017). This read
      // `unwrapped.experiences` — a key that has NEVER existed in that response. So `list` was ALWAYS
      // empty, for EVERY host: the picker never rendered, and pressing "Check in" always answered
      // "Pick an experience first." while pointing at a control that was not on the page.
      // Confirmed against the platform's other consumers of this endpoint — js/my-bookings.js reads
      // `.items` in three places (:1000, :1002, :8829). Found by signing in as a host with 16 ACTIVE
      // listings and being told there were none.
      var list = (unwrapped && Array.isArray(unwrapped.items)) ? unwrapped.items
               : (unwrapped && Array.isArray(unwrapped.experiences)) ? unwrapped.experiences
               : [];
      // Only show ACTIVE experiences, drafts/paused can't have bookings
      list = list.filter(function (e) { return String(e.status || "").toUpperCase() === "ACTIVE"; });
      if (list.length === 0) {
        // 2026-08-25: this used to `return` in silence. The picker stayed hidden, the form still looked
        // usable, and pressing "Check in" answered "Pick an experience first." — pointing at a control
        // that was not on the page. A dead end, and it hits real hosts too: the filter demands ACTIVE,
        // so a host whose listings are all DRAFT or PAUSED saw exactly the same thing on event night.
        //
        // Say why, and stop offering an action that cannot succeed. Uses the page's own #cin-error
        // (role="alert", so it is announced) and the submit button's existing disabled styling.
        setError("You don\u2019t have an active experience, so there\u2019s nobody to check in yet. Publish a listing first, then come back.");
        var __submitEl = $id("cin-submit");
        if (__submitEl) __submitEl.disabled = true;
        return;
      }
      experiencesCache = list;
      $id("cin-experience-picker").classList.remove("hidden");
      list.forEach(function (e) {
        var opt = window.tstsEl("option", { value: String(e.id || e._id || "") }, String(e.title || "Untitled experience"));
        picker.appendChild(opt);
      });
      // Default date = today (calendar already pinned to today by the picker
      // init below; this line keeps the .value behaviour identical for the
      // submit-time read in submitCheckIn()).
      var iso = melbourneTodayIso();
      var dateEl = $id("cin-date");
      if (dateEl) {
        dateEl.value = iso;
        // Owner 2026-05-30 (date-picker rollout R3): mirror the value into the
        // brand picker so the visible alt-input stays in sync with the ISO
        // source. Same pattern as host.html and experience.html.
        if (checkInDatePicker && typeof checkInDatePicker.setDate === "function") {
          try { checkInDatePicker.setDate(iso, false); } catch (_e) { void _e; }
        }
      }
    } catch (e) {
      // Quiet, host can still type the OTP if they know it
    }
  }

  function syncSlotOptions() {
    var picker = $id("cin-experience");
    var wrap = $id("cin-slot-wrap");
    var slotSel = $id("cin-slot");
    if (!picker || !wrap || !slotSel) return;
    var expId = String(picker.value || "");
    var exp = experiencesCache.find(function (e) { return String(e.id || e._id || "") === expId; });
    var slots = (exp && Array.isArray(exp.timeSlots)) ? exp.timeSlots : [];
    while (slotSel.options.length > 1) slotSel.remove(1);
    if (!expId || slots.length === 0) { wrap.classList.add("hidden"); return; }
    slots.forEach(function (s) {
      slotSel.appendChild(window.tstsEl("option", { value: String(s) }, String(s)));
    });
    // One slot → it's the obvious answer; select it and load the room.
    if (slots.length === 1) slotSel.value = String(slots[0]);
    wrap.classList.remove("hidden");
  }

  function __rosterStatus(item) {
    var seats = Math.max(1, Number(item.numGuests || 1));
    if (item.attendanceStatus === "checked_in") {
      var inSeats = Number(item.checkedInSeats || seats);
      if (inSeats < seats) return { label: inSeats + " of " + seats + " in · late arrivals due", cls: "bg-amber-100 text-amber-700" };
      var at = item.checkedInAt ? new Date(item.checkedInAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";
      return { label: "In" + (at ? " · " + at : ""), cls: "bg-emerald-100 text-emerald-700" };
    }
    if (item.attendanceStatus === "no_show") return { label: "No show", cls: "bg-gray-100 text-gray-500" };
    return { label: "Not in yet", cls: "bg-amber-50 text-amber-700" };
  }

  function renderRoster() {
    var listEl = $id("cin-roster-list");
    var moreBtn = $id("cin-roster-more");
    if (!listEl) return;
    var q = String(($id("cin-search") && $id("cin-search").value) || "").trim().toLowerCase();
    var filtered = q
      ? rosterItems.filter(function (i) { return String(i.guestName || "").toLowerCase().indexOf(q) >= 0; })
      : rosterItems;
    listEl.replaceChildren();
    filtered.slice(0, rosterShown).forEach(function (item) {
      var st = __rosterStatus(item);
      var row = window.tstsEl("button", {
        type: "button",
        className: "w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-tsts-clay/50 transition text-left"
      }, [
        window.tstsEl("span", { className: "min-w-0" }, [
          window.tstsEl("span", { className: "block text-sm font-bold text-tsts-ink truncate" }, String(item.guestName || "Guest")),
          window.tstsEl("span", { className: "block text-xs text-gray-500" }, Math.max(1, Number(item.numGuests || 1)) + (Number(item.numGuests || 1) === 1 ? " seat" : " seats"))
        ]),
        window.tstsEl("span", { className: "shrink-0 px-2.5 py-1 rounded-full text-xs font-bold " + st.cls }, st.label)
      ]);
      // Tapping a guest points the host at the one true door action: their entry code.
      row.addEventListener("click", function () {
        var otpEl = $id("cin-otp");
        var hint = $id("cin-otp-hint");
        if (hint) {
          window.tstsSetText(hint, item.attendanceStatus === "checked_in"
            ? "Re-enter " + String(item.guestName || "the guest") + "'s same entry code to add late arrivals."
            : "Ask " + String(item.guestName || "the guest") + " for their 6-digit entry code.");
          hint.classList.remove("hidden");
        }
        if (otpEl) { otpEl.focus(); otpEl.scrollIntoView({ block: "center", behavior: "smooth" }); }
      });
      listEl.appendChild(row);
    });
    if (moreBtn) {
      if (filtered.length > rosterShown) {
        window.tstsSetText(moreBtn, "Show more (" + (filtered.length - rosterShown) + " remaining)");
        moreBtn.classList.remove("hidden");
      } else {
        moreBtn.classList.add("hidden");
      }
    }
  }

  async function loadRoster() {
    var picker = $id("cin-experience");
    var dateEl = $id("cin-date");
    var slotSel = $id("cin-slot");
    var panel = $id("cin-roster");
    if (!panel) return;
    var expId = String((picker && picker.value) || "").trim();
    var dateStr = String((dateEl && dateEl.value) || "").trim();
    var slotStr = String((slotSel && slotSel.value) || "").trim();
    if (!expId || !dateStr || !slotStr) { panel.classList.add("hidden"); return; }
    // 2026-09-08: a host at the door had nothing to look at while the guest list was fetched, and if the
    // request failed the panel simply vanished — which reads exactly like an evening with no guests. Say
    // what is happening, and if it cannot be loaded say that and stay on screen so a retry is possible.
    var __listEl = $id("cin-roster-list");
    if (__listEl) window.tstsSetText(__listEl, "Loading the guest list\u2026");
    panel.classList.remove("hidden");
    try {
      var res = await window.authFetch(
        "/api/host/experiences/" + encodeURIComponent(expId) + "/check-in-list?date=" +
        encodeURIComponent(dateStr) + "&slot=" + encodeURIComponent(slotStr),
        { method: "GET" }
      );
      var json = null;
      try { json = await res.json(); } catch (parseErr) { void parseErr; json = null; }
      if (!res.ok || !json) {
        var __msg = (json && json.message) ? String(json.message)
                  : "We couldn\u2019t load the guest list just now. Check your connection and try again.";
        if (__listEl) window.tstsSetText(__listEl, __msg);
        panel.classList.remove("hidden");
        return;
      }
      var data = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
        ? window.unwrapApiPayload(json) : (json && json.data !== undefined ? json.data : json);
      rosterItems = (data && Array.isArray(data.items)) ? data.items : [];
      rosterShown = ROSTER_PAGE;
      var totalSeats = 0, inSeats = 0;
      rosterItems.forEach(function (i) {
        var seats = Math.max(1, Number(i.numGuests || 1));
        totalSeats += seats;
        if (i.attendanceStatus === "checked_in") inSeats += Math.min(seats, Math.max(0, Number(i.checkedInSeats || seats)));
      });
      window.tstsSetText($id("cin-count-in"), String(inSeats));
      window.tstsSetText($id("cin-count-pending"), String(Math.max(0, totalSeats - inSeats)));
      window.tstsSetText($id("cin-count-total"), String(totalSeats));
      renderRoster();
      panel.classList.remove("hidden");
    } catch (rosterErr) {
      void rosterErr;
      panel.classList.add("hidden");
    }
  }

  async function submitCheckIn() {
    setError("");
    var otpEl  = $id("cin-otp");
    var btn    = $id("cin-submit");
    var picker = $id("cin-experience");
    var dateEl = $id("cin-date");
    var slotEl = $id("cin-slot");

    var otp = String((otpEl && otpEl.value) || "").trim();
    if (!/^[0-9]{6}$/.test(otp)) {
      setError("Enter the 6-digit entry code from the booking confirmation.");
      return;
    }

    var experienceId = String((picker && picker.value) || "").trim();
    var dateStr      = String((dateEl && dateEl.value) || "").trim();
    // WALK-P26-1: loadRoster() already sends this same slot to check-in-list so the
    // guest list on screen is scoped to the roster the host picked. submitCheckIn() never read it at
    // all, so an entry code from a DIFFERENT sitting on the same date matched and checked in with no
    // warning it did not belong to the roster in front of the host. Sent whenever a slot is selected;
    // the server only filters by it when present, so a listing with a single sitting (no slot picker
    // shown) is unaffected.
    var slotStr      = String((slotEl && slotEl.value) || "").trim();
    if (!experienceId) {
      setError("Pick an experience first.");
      return;
    }

    btn.disabled = true;
    window.tstsSetText(btn, "Checking in…");

    try {
      // BUG-165 (2026-05-17): SINGLE resolve-by-OTP call. The server resolves
      // the ONE matching booking by OTP + experience + date and checks it in
      // atomically. The prior flow fetched the booking list then looped
      // `POST /api/host/bookings/:id/check-in` for EVERY booking until one
      // matched — N HTTP requests per OTP entry, N consumptions of the
      // per-request limiter, and the OTP attempt fanned across other guests'
      // bookings. Now: exactly one request, server-side resolution.
      var resp = await window.authFetch(
        "/api/host/experiences/" + encodeURIComponent(experienceId) + "/check-in-by-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: otp, date: dateStr, slot: slotStr }),
        }
      );
      var json = await resp.json();
      if (resp.ok) {
        var data = (window.unwrapApiPayload && typeof window.unwrapApiPayload === "function")
          ? window.unwrapApiPayload(json) : (json && json.data !== undefined ? json.data : json);
        var matchedName = String((data && data.guestName) || "Guest");
        showSuccess(matchedName + " is checked in. Have a great evening at the table.");
        otpEl.value = "";
        var hintEl = $id("cin-otp-hint");
        if (hintEl) hintEl.classList.add("hidden");
        // The room just changed — refresh the door panel counts + roster.
        void loadRoster();
      } else {
        setError(String((json && json.message) || "Entry code didn't match any booking on this date. Double-check with your guest."));
      }
    } catch (netErr) {
      setError("Network error. Please try again.");
    } finally {
      btn.disabled = false;
      window.tstsSetText(btn, "Check in");
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var ses = await ensureAuth();
    if (!ses) return;

    // Owner 2026-05-30 (date-picker rollout R3): Replace native <input
    // type="date"> with the shared Flatpickr wrapper so the calendar matches
    // the experience-page R3 look. Retroactive check-in window = 30 days back,
    // cap = today. minDate stops drift into ancient months (Flatpickr hides
    // the prev arrow at the boundary), maxDate stops accidental future picks.
    var dateInputEl = $id("cin-date");
    if (dateInputEl && typeof window.tstsDatePicker === "function") {
      // Native type="date" never shows the polyfill calendar on desktop; flip
      // to type="text" so the Flatpickr alt-input renders as the only visible
      // control. The original element keeps id="cin-date" so the existing
      // submit-time read `$id("cin-date").value` (ISO yyyy-mm-dd) still works.
      try { dateInputEl.setAttribute("type", "text"); } catch (_e) { void _e; }
      try { dateInputEl.setAttribute("readonly", "readonly"); } catch (_e) { void _e; }
      try { dateInputEl.setAttribute("placeholder", "Pick a date"); } catch (_e) { void _e; }
      try { dateInputEl.setAttribute("autocomplete", "off"); } catch (_e) { void _e; }
      var melbToday = melbourneTodayIso();
      checkInDatePicker = window.tstsDatePicker(dateInputEl, {
        minDate: melbourneIsoMinusDays(melbToday, 30),
        maxDate: melbToday,
        defaultDate: melbToday
      });
    }

    await loadExperiences();

    // Door-panel wiring (sir 2026-08-06): experience/date/slot changes reload the room;
    // ?experienceId=&date=&slot= deep-links (the Bookings card's "Open check-in") pre-select
    // the occurrence so the host lands on THEIR event with the roster already up.
    var expPicker = $id("cin-experience");
    var slotSel = $id("cin-slot");
    var dateEl2 = $id("cin-date");
    if (expPicker) expPicker.addEventListener("change", function () { syncSlotOptions(); void loadRoster(); });
    if (slotSel) slotSel.addEventListener("change", function () { void loadRoster(); });
    if (dateEl2) dateEl2.addEventListener("change", function () { void loadRoster(); });
    var searchEl = $id("cin-search");
    if (searchEl) searchEl.addEventListener("input", function () { renderRoster(); });
    var moreBtn = $id("cin-roster-more");
    if (moreBtn) moreBtn.addEventListener("click", function () { rosterShown += ROSTER_PAGE; renderRoster(); });

    try {
      var qp = new URLSearchParams(window.location.search || "");
      var qpExp = String(qp.get("experienceId") || "").trim();
      var qpDate = String(qp.get("date") || "").trim();
      var qpSlot = String(qp.get("slot") || "").trim();
      if (qpExp && expPicker) {
        expPicker.value = qpExp;
        syncSlotOptions();
        if (qpDate && dateEl2) {
          dateEl2.value = qpDate;
          if (checkInDatePicker && typeof checkInDatePicker.setDate === "function") {
            try { checkInDatePicker.setDate(qpDate, false); } catch (_qpErr) { void _qpErr; }
          }
        }
        if (qpSlot && slotSel) slotSel.value = qpSlot;
        void loadRoster();
      }
    } catch (qpWireErr) { void qpWireErr; }

    var btn = $id("cin-submit");
    if (btn) btn.addEventListener("click", function () { void submitCheckIn(); });

    var otpEl = $id("cin-otp");
    if (otpEl) {
      otpEl.addEventListener("input", function () {
        // Strip non-digits
        otpEl.value = String(otpEl.value || "").replace(/[^0-9]/g, "").slice(0, 6);
        setError("");
      });
      otpEl.addEventListener("keydown", function (e) {
        if (e && e.key === "Enter") void submitCheckIn();
      });
    }
  });
})();
