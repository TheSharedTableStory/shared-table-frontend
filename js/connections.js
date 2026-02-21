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
            El("button", { className: "px-3 py-2 rounded-xl bg-tsts-ink text-white text-xs font-bold hover:bg-slate-800", "data-action": "accept", "data-id": r._id || "", textContent: "Accept" }),
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
        if (connEmpty) connEmpty.textContent = "No connections yet. Visit someone\u2019s profile and click Connect to get started.";
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
      setText(connectStatusEl, "Enter a handle.");
      return;
    }

    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "Sending...";
    }

    setText(connectStatusEl, "");

    try {
      const res = await window.authFetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.message) ? data.message : "Connect failed");

      const st = String(data.status || "");
      if (st) setText(connectStatusEl, "Status: " + st);
      else setText(connectStatusEl, "Request sent.");

      await loadRequests();
      await loadConnections();
    } catch (e) {
      setText(connectStatusEl, (e && e.message) ? e.message : "Connect failed");
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

  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await requireAuth())) return;

    if (connectBtn) connectBtn.addEventListener("click", connect);
    if (reqRefresh) reqRefresh.addEventListener("click", loadRequests);
    if (connRefresh) connRefresh.addEventListener("click", loadConnections);
    if (reqList) reqList.addEventListener("click", onRequestsClick);
    if (connList) connList.addEventListener("click", onConnectionsClick);

    loadRequests();
    loadConnections();
  });
})();
