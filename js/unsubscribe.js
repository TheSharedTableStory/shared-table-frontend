(function () {
        var params = new URLSearchParams(window.location.search || "");
        var userId = String(params.get("userId") || "").trim();
        var category = String(params.get("category") || "").trim();
        var ts = String(params.get("ts") || "").trim();
        var token = String(params.get("token") || "").trim();

        var stateConfirm = document.getElementById("state-confirm");
        var stateSuccess = document.getElementById("state-success");
        var stateError = document.getElementById("state-error");
        var confirmBtn = document.getElementById("confirm-btn");
        var confirmStatus = document.getElementById("confirm-status");

        var categoryLabels = { recommendations: "experience recommendation" };
        var categoryLabel = categoryLabels[category] || category || "notification";

        function showState(id) {
            if (stateConfirm) stateConfirm.classList.add("hidden");
            if (stateSuccess) stateSuccess.classList.add("hidden");
            if (stateError) stateError.classList.add("hidden");
            var el = document.getElementById(id);
            if (el) el.classList.remove("hidden");
        }

        if (!userId || !category || !ts || !token) {
            var errText = document.getElementById("error-text");
            if (errText && window.tstsText) window.tstsText(errText, "This unsubscribe link is invalid. Please manage your email preferences from your Profile settings.");
            showState("state-error");
            return;
        }

        var confirmText = document.getElementById("confirm-text");
        if (confirmText && window.tstsText) {
            window.tstsText(confirmText, "Click below to stop receiving " + categoryLabel + " emails from The Shared Table Story.");
        }

        if (confirmBtn) {
            confirmBtn.addEventListener("click", function () {
                confirmBtn.disabled = true;
                if (window.tstsText) window.tstsText(confirmBtn, "Processing\u2026");
                if (confirmStatus) {
                    confirmStatus.classList.remove("hidden", "text-red-600");
                    confirmStatus.classList.add("text-gray-500");
                    if (window.tstsText) window.tstsText(confirmStatus, "");
                }

                var apiBase = (window.__tstsApiBase || window.API_BASE || "");
                var url = apiBase + "/api/email/unsubscribe";

                fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: userId, category: category, ts: ts, token: token })
                }).then(function (res) {
                    return res.json().then(function (data) {
                        return { status: res.status, data: data };
                    }).catch(function () {
                        return { status: res.status, data: {} };
                    });
                }).then(function (result) {
                    if (result.data && result.data.ok === true) {
                        var successText = document.getElementById("success-text");
                        if (successText && window.tstsText) {
                            window.tstsText(successText, "You have been unsubscribed from " + categoryLabel + " emails. You can re-enable them anytime from your Profile settings.");
                        }
                        showState("state-success");
                    } else {
                        var errCode = (result.data && result.data.error) || "";
                        var msg = "This unsubscribe link is invalid or has expired. Please manage your email preferences from your Profile settings.";
                        if (errCode === "TOKEN_EXPIRED") {
                            msg = "This unsubscribe link has expired. Please manage your email preferences from your Profile settings.";
                        }
                        var errText2 = document.getElementById("error-text");
                        if (errText2 && window.tstsText) window.tstsText(errText2, msg);
                        showState("state-error");
                    }
                }).catch(function () {
                    var errText3 = document.getElementById("error-text");
                    if (errText3 && window.tstsText) window.tstsText(errText3, "Something went wrong. Please try again or manage your email preferences from your Profile settings.");
                    showState("state-error");
                });
            });
        }
    })();
