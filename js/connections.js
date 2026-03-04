(function () {
  const handleEl = document.getElementById("handle");
  const connectBtn = document.getElementById("connect-btn");
  const connectStatusEl = document.getElementById("connect-status");

  const reqLoading = document.getElementById("requests-loading");
  const reqEmpty = document.getElementById("requests-empty");
  const reqList = document.getElementById("requests-list");
  const reqRefresh = document.getElementById("refresh-requests");

  const connLoading = document.getElementById("connections-loading");
  const connEmpty = document.getElementById("connections-empty");
  const connList = document.getElementById("connections-list");
  const connRefresh = document.getElementById("refresh-connections");

  async function requireAuth() {
    try {
      if (!window.tstsGetSession) throw new Error("missing_session_helper");
      const sess = await window.tstsGetSession({ force: true });
      if (sess && sess.ok && sess.user) return true;
    } catch (_) {}
    const returnTo = encodeURIComponent("connections.html");
    location.href = "login.html?returnTo=" + returnTo;
    return false;
  }

  function setText(el, msg) {
    if (!el) return;
    el.textContent = String(msg || "");
  }

  function setStatus(msg, type) {
    if (!connectStatusEl) return;
    connectStatusEl.textContent = "";
    connectStatusEl.className = "text-sm flex items-center gap-1";
    if (!msg) return;
    var colors = { error: "text-red-600", success: "text-emerald-600", loading: "text-slate-500" };
    connectStatusEl.className = "text-sm flex items-center gap-1 " + (colors[type] || "text-gray-600");
    var icons = { error: "\u2716", success: "\u2714", loading: "\u23F3" };
    var icon = icons[type] || "";
    if (icon) {
      var span = document.createElement("span");
      span.textContent = icon;
      connectStatusEl.appendChild(span);
    }
    var txt = document.createElement("span");
    txt.textContent = String(msg);
    connectStatusEl.appendChild(txt);
  }

  function showReq(which) {
    [reqLoading, reqEmpty, reqList].forEach((el) => el && el.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
  }

  function showConn(which) {
    [connLoading, connEmpty, connList].forEach((el) => el && el.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
  }

  function userRowEl(u) {
    const El = window.tstsEl;
    const user = u || {};
    const pic = window.tstsSafeUrl(user.profilePic, "/assets/avatar-default.svg");
    const name = user.name || "User";
    const handle = user.handle ? ("@" + user.handle) : "";
    const id = user._id || user.id || "";

    var imgEl = El("img", { className: "h-10 w-10 rounded-full border border-gray-100 object-cover" });
    window.tstsSafeImg(imgEl, pic, "/assets/avatar-default.svg");

    return El("div", { className: "flex items-center gap-3" }, [
      imgEl,
      El("div", { className: "min-w-0" }, [
        El("div", { className: "font-bold text-gray-900 truncate", textContent: name }),
        El("div", { className: "text-xs text-gray-500 truncate", textContent: handle })
      ])
    ]);
  }

  async function post(path) {
    const res = await window.authFetch(path, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.message) ? data.message : "Request failed");
    return data;
  }

  async function loadRequests() {
    if (!(await requireAuth())) return;
    showReq(reqLoading);

    try {
      const res = await window.authFetch("/api/social/requests", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("requests");
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

      if (!reqList) return;
      reqList.textContent = "";

      if (list.length === 0) {
        if (reqEmpty) reqEmpty.textContent = "No pending requests.";
        showReq(reqEmpty);
        return;
      }

      const El = window.tstsEl;
      list.forEach(function(r) {
        var wrap = El("div", { className: "p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-3" }, [
          userRowEl(r.from),
          El("div", { className: "flex items-center gap-2" }, [
            El("button", { className: "px-3 py-2 rounded-xl tsts-btn-primary text-xs font-bold", "data-action": "accept", "data-id": r._id || "", textContent: "Accept" }),
            El("button", { className: "px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold hover:bg-gray-50", "data-action": "reject", "data-id": r._id || "", textContent: "Reject" }),
            El("button", { className: "px-3 py-2 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50", "data-action": "block", "data-id": r._id || "", textContent: "Block" })
          ])
        ]);
        reqList.appendChild(wrap);
      });

      showReq(reqList);
    } catch (_) {
      if (reqEmpty) {
        reqEmpty.textContent = "Unable to load requests.";
        showReq(reqEmpty);
      }
    }
  }

  async function loadConnections() {
    if (!(await requireAuth())) return;
    showConn(connLoading);

    try {
      const res = await window.authFetch("/api/social/connections", { method: "GET" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("connections");
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

      if (!connList) return;
      connList.textContent = "";

      if (list.length === 0) {
        if (connEmpty) connEmpty.textContent = "You haven\u2019t connected with anyone yet. Search for a fellow traveller above, or connect after sharing an experience together.";
        showConn(connEmpty);
        return;
      }

      const El = window.tstsEl;
      list.forEach(function(c) {
        var userId = (c.user && (c.user._id || c.user.id)) || "";
        var wrap = El("div", { className: "p-4 rounded-xl border border-gray-100 bg-white flex items-center justify-between gap-3" }, [
          userRowEl(c.user),
          El("div", { className: "flex items-center gap-2" }, [
            El("a", { className: "text-sm font-bold text-orange-600 hover:underline", href: "public-profile.html?id=" + encodeURIComponent(userId), textContent: "View profile" }),
            El("button", { className: "px-3 py-2 rounded-lg border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50", "data-action": "remove", "data-userid": userId, textContent: "Remove" })
          ])
        ]);
        connList.appendChild(wrap);
      });

      showConn(connList);
    } catch (_) {
      if (connEmpty) {
        connEmpty.textContent = "Unable to load connections.";
        showConn(connEmpty);
      }
    }
  }

  async function connect() {
    if (!(await requireAuth())) return;

    let handle = handleEl ? String(handleEl.value || "").trim() : "";
    if (handle.startsWith("@")) handle = handle.substring(1);

    if (!handle) {
      setStatus("Enter a handle.", "error");
      return;
    }

    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "Sending...";
    }

    setStatus("Looking up handle\u2026", "loading");

    try {
      const res = await window.authFetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle
        })
      });

      const connRaw = await res.json().catch(() => ({}));
      const data = (connRaw && connRaw.data) ? connRaw.data : connRaw;
      if (!res.ok) throw new Error((data && data.message) ? data.message : ((connRaw && connRaw.message) ? connRaw.message : "Connect failed"));

      const st = String(data.status || "");
      if (st) setStatus("Connection request sent!", "success");
      else setStatus("Connection request sent!", "success");

      if (handleEl) handleEl.value = "";
      await loadRequests();
      await loadConnections();
    } catch (e) {
      setStatus((e && e.message) ? e.message : "Could not connect. Please try again.", "error");
    } finally {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect";
      }
    }
  }

  async function onConnectionsClick(e) {
    const btn = e && e.target ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const userId = btn.getAttribute("data-userid");
    if (!action || !userId) return;

    try {
      if (action === "remove") {
        var confirmed = await window.tstsConfirm("Remove this connection?", { destructive: true, confirmText: "Remove" });
        if (!confirmed) return;
        await post("/api/social/connections/" + encodeURIComponent(userId) + "/remove");
        await loadConnections();
      }
    } catch (err) {
      window.tstsNotify((err && err.message) ? err.message : "Action failed", "error");
    }
  }

  async function onRequestsClick(e) {
    const btn = e && e.target ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!action || !id) return;

    try {
      if (action === "accept") await post("/api/social/requests/" + encodeURIComponent(id) + "/accept");
      if (action === "reject") await post("/api/social/requests/" + encodeURIComponent(id) + "/reject");
      if (action === "block") {
        var confirmed = await window.tstsConfirm("Block this user?", { destructive: true, confirmText: "Block" });
        if (!confirmed) return;
        await post("/api/social/requests/" + encodeURIComponent(id) + "/block");
      }
      await loadRequests();
      await loadConnections();
    } catch (err) {
      window.tstsNotify((err && err.message) ? err.message : "Action failed", "error");
    }
  }

  // E1: Outgoing (Sent) Requests
  const outLoading = document.getElementById("outgoing-loading");
  const outEmpty = document.getElementById("outgoing-empty");
  const outList = document.getElementById("outgoing-list");
  const outRefresh = document.getElementById("refresh-outgoing");

  function showOut(which) {
    [outLoading, outEmpty, outList].forEach((el) => el && el.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
  }

  async function loadOutgoing() {
    if (!(await requireAuth())) return;
    showOut(outLoading);
    try {
      const res = await window.authFetch("/api/social/outgoing-requests", { method: "GET" });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("outgoing");
      const d = (raw && raw.data) ? raw.data : raw;
      const list = Array.isArray(d) ? d : (Array.isArray(d && d.requests) ? d.requests : []);
      if (!outList) return;
      outList.textContent = "";
      if (list.length === 0) {
        if (outEmpty) outEmpty.textContent = "You haven\u2019t sent any connection requests.";
        showOut(outEmpty);
        return;
      }
      const El = window.tstsEl;
      list.forEach(function(r) {
        var target = r.to || r.addressee || r.user || {};
        var reqId = r._id || r.id || "";
        var wrap = El("div", { className: "p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-3" }, [
          userRowEl(target),
          El("button", { className: "px-3 py-2 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50", "data-action": "cancel-outgoing", "data-id": reqId, textContent: "Cancel Request" })
        ]);
        outList.appendChild(wrap);
      });
      showOut(outList);
    } catch (_) {
      if (outEmpty) { outEmpty.textContent = "Unable to load sent requests."; showOut(outEmpty); }
    }
  }

  async function onOutgoingClick(e) {
    var btn = e && e.target ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");
    if (action === "cancel-outgoing" && id) {
      try {
        await post("/api/social/outgoing-requests/" + encodeURIComponent(id) + "/cancel");
        await loadOutgoing();
      } catch (err) { window.tstsNotify((err && err.message) ? err.message : "Cancel failed", "error"); }
    }
  }

  // E2: Blocked Users
  const blkLoading = document.getElementById("blocked-loading");
  const blkEmpty = document.getElementById("blocked-empty");
  const blkList = document.getElementById("blocked-list");
  const blkRefresh = document.getElementById("refresh-blocked");

  function showBlk(which) {
    [blkLoading, blkEmpty, blkList].forEach((el) => el && el.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
  }

  async function loadBlocked() {
    if (!(await requireAuth())) return;
    showBlk(blkLoading);
    try {
      const res = await window.authFetch("/api/social/blocked", { method: "GET" });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("blocked");
      const d = (raw && raw.data) ? raw.data : raw;
      const list = Array.isArray(d) ? d : (Array.isArray(d && d.users) ? d.users : []);
      if (!blkList) return;
      blkList.textContent = "";
      if (list.length === 0) {
        if (blkEmpty) blkEmpty.textContent = "You haven\u2019t blocked anyone.";
        showBlk(blkEmpty);
        return;
      }
      const El = window.tstsEl;
      list.forEach(function(b) {
        var user = b.user || b;
        var userId = (user && (user._id || user.id)) || "";
        var wrap = El("div", { className: "p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-3" }, [
          userRowEl(user),
          El("button", { className: "px-3 py-2 rounded-xl border border-blue-200 bg-white text-xs font-bold text-blue-700 hover:bg-blue-50", "data-action": "unblock", "data-userid": userId, textContent: "Unblock User" })
        ]);
        blkList.appendChild(wrap);
      });
      showBlk(blkList);
    } catch (_) {
      if (blkEmpty) { blkEmpty.textContent = "Unable to load blocked users."; showBlk(blkEmpty); }
    }
  }

  async function onBlockedClick(e) {
    var btn = e && e.target ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var userId = btn.getAttribute("data-userid");
    if (action === "unblock" && userId) {
      try {
        var res = await window.authFetch("/api/social/block/" + encodeURIComponent(userId), { method: "DELETE" });
        if (!res.ok) { var d = await res.json().catch(() => ({})); throw new Error((d && d.message) || "Unblock failed"); }
        window.tstsNotify("User unblocked.", "success");
        await loadBlocked();
      } catch (err) { window.tstsNotify((err && err.message) ? err.message : "Unblock failed", "error"); }
    }
  }

  // ── Friends Feed (merged from feed.js) ──
  const feedLoadingEl = document.getElementById("feed-loading");
  const feedEmptyEl = document.getElementById("feed-empty");
  const feedErrorEl = document.getElementById("feed-error");
  const feedListEl = document.getElementById("feed-list");
  const feedRetryBtn = document.getElementById("feed-retry-btn");
  const feedRefresh = document.getElementById("refresh-feed");

  function showFeed(which) {
    [feedLoadingEl, feedEmptyEl, feedErrorEl, feedListEl].forEach(function(el) { if (el) el.classList.add("hidden"); });
    if (which) which.classList.remove("hidden");
  }

  function renderFeedItem(item) {
    var El = window.tstsEl;
    var safeUrl = window.tstsSafeUrl;
    var fallbackImg = "/assets/experience-default.jpg";
    var fallbackPic = "/assets/avatar-default.svg";
    var it = item || {};
    var guest = it.guest || {};
    var exp = it.experience || {};
    var when = window.tstsFormatDateShort ? window.tstsFormatDateShort(it.when) : String(it.when || "");
    var title = exp.title || "Experience";
    var expId = exp._id || exp.id || it.experienceId || "";
    var imgUrl = safeUrl(exp.imageUrl, fallbackImg);
    var guestName = guest.name || "Friend";
    var guestId = guest._id || guest.id || "";
    var guestPicUrl = safeUrl(guest.profilePic, fallbackPic);
    var handle = guest.handle ? ("@" + guest.handle) : "";

    var expImg = El("img", { className: "w-full h-full object-cover" });
    window.tstsSafeImg(expImg, imgUrl, fallbackImg);
    var guestImg = El("img", { className: "h-10 w-10 rounded-full border border-gray-100 object-cover" });
    window.tstsSafeImg(guestImg, guestPicUrl, fallbackPic);

    var titleLink = El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "font-bold text-gray-900 hover:text-orange-600 transition", textContent: title });
    var whenEl = El("div", { className: "text-xs text-gray-500 mt-1", textContent: when ? ("Booked: " + when) : "" });
    var cityEl = El("div", { className: "text-xs text-gray-500", textContent: exp.city || "" });
    var visibilityChip = El("span", { className: "inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px] font-bold", textContent: "Visible to: Connections" });
    var guestNameEl = El("div", { className: "text-sm font-bold text-gray-900 truncate", textContent: guestName });
    var handleElF = El("div", { className: "text-xs text-gray-500 truncate", textContent: handle });

    return El("div", { className: "bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden" }, [
      El("div", { className: "flex flex-col sm:flex-row" }, [
        El("a", { href: "experience.html?id=" + encodeURIComponent(expId), className: "sm:w-56 h-40 sm:h-auto bg-gray-100 overflow-hidden" }, [expImg]),
        El("div", { className: "flex-1 p-5" }, [
          El("div", { className: "flex items-start justify-between gap-4" }, [
            El("div", {}, [titleLink, whenEl]),
            El("div", { className: "text-right flex flex-col items-end gap-2" }, [cityEl, visibilityChip])
          ]),
          El("div", { className: "mt-4 flex items-center justify-between gap-4" }, [
            El("a", { href: "public-profile.html?id=" + encodeURIComponent(guestId), className: "flex items-center gap-3 min-w-0" }, [
              guestImg,
              El("div", { className: "min-w-0" }, [guestNameEl, handleElF])
            ]),
            El("a", { href: "public-profile.html?id=" + encodeURIComponent(guestId), className: "text-sm font-bold text-orange-600 hover:underline", textContent: "View profile" })
          ])
        ])
      ])
    ]);
  }

  async function loadFeed() {
    showFeed(feedLoadingEl);
    try {
      var res = await window.authFetch("/api/social/feed", { method: "GET" });
      var data = await res.json().catch(function() { return null; });
      if (!res.ok) throw new Error("feed");
      var list = window.unwrapApiList(data, "items");
      if (!feedListEl) return;
      feedListEl.textContent = "";
      if (list.length === 0) { showFeed(feedEmptyEl); return; }
      list.forEach(function(it) { feedListEl.appendChild(renderFeedItem(it)); });
      showFeed(feedListEl);
    } catch (_) {
      showFeed(feedErrorEl);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await requireAuth())) return;

    if (connectBtn) connectBtn.addEventListener("click", connect);
    if (handleEl) handleEl.addEventListener("input", function () { setStatus("", ""); });
    if (reqRefresh) reqRefresh.addEventListener("click", loadRequests);
    if (connRefresh) connRefresh.addEventListener("click", loadConnections);
    if (reqList) reqList.addEventListener("click", onRequestsClick);
    if (connList) connList.addEventListener("click", onConnectionsClick);
    if (outRefresh) outRefresh.addEventListener("click", loadOutgoing);
    if (outList) outList.addEventListener("click", onOutgoingClick);
    if (blkRefresh) blkRefresh.addEventListener("click", loadBlocked);
    if (blkList) blkList.addEventListener("click", onBlockedClick);
    if (feedRetryBtn) feedRetryBtn.addEventListener("click", loadFeed);
    if (feedRefresh) feedRefresh.addEventListener("click", loadFeed);

    loadRequests();
    loadConnections();
    loadOutgoing();
    loadBlocked();
    loadFeed();
  });
})();
