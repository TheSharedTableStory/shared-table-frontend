// REAL coverage for js/check-in.js — exercises host check-in flow:
// experience loader, OTP validation, check-in match loop, error states.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "check-in.js"), "utf-8");

function buildScaffold() {
  document.body.innerHTML = `
    <div id="cin-experience-picker" class="hidden">
      <select id="cin-experience"></select>
      <input id="cin-date" type="date" />
    </div>
    <input id="cin-otp" type="text" />
    <button id="cin-submit" type="button">Check in</button>
    <div id="cin-error" class="hidden"></div>
    <div id="cin-success" class="hidden">
      <p id="cin-success-detail"></p>
    </div>
  `;
}

async function loadModule(opts) {
  opts = opts || {};
  buildScaffold();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);
  window.tstsGetSession = opts.session || (() => ({ ok: true, user: { id: "u1" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, json: async () => ({}) }));

  let captured = null;
  const origAdd = document.addEventListener;
  document.addEventListener = function (type, handler, ...rest) {
    if (type === "DOMContentLoaded" && captured === null) { captured = handler; return; }
    return origAdd.call(this, type, handler, ...rest);
  };
  try { new Function(SRC)(); } finally { document.addEventListener = origAdd; }
  if (typeof captured === "function") await captured(new Event("DOMContentLoaded"));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("check-in — experience loader", () => {
  test("loads active experiences and populates picker", async () => {
    const callMap = (url) => {
      if (url.includes("/api/host/experiences") && !url.includes("check-in")) {
        return { ok: true, json: async () => ({ ok: true, data: { experiences: [
          { _id: "e1", title: "Sunset Paella", status: "ACTIVE" },
          { _id: "e2", title: "Yum Cha", status: "ACTIVE" },
          { _id: "e3", title: "Old Draft", status: "DRAFT" },
        ] } }) };
      }
      return { ok: false, json: async () => ({}) };
    };
    await loadModule({ authFetch: async (url) => callMap(url) });
    const picker = document.getElementById("cin-experience");
    expect(picker.children.length).toBe(2);
    expect(picker.children[0].textContent).toBe("Sunset Paella");
    expect(picker.children[1].textContent).toBe("Yum Cha");
    expect(document.getElementById("cin-experience-picker").classList.contains("hidden")).toBe(false);
  });

  test("no active experiences leaves picker hidden", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { experiences: [
        { _id: "e3", title: "Draft", status: "DRAFT" },
      ] } }) }),
    });
    expect(document.getElementById("cin-experience-picker").classList.contains("hidden")).toBe(true);
  });

  test("server error on /api/host/experiences is non-fatal", async () => {
    await loadModule({ authFetch: async () => { throw new Error("network"); } });
    expect(document.getElementById("cin-error").classList.contains("hidden")).toBe(true);
  });

  test("date input pre-fills with today (YYYY-MM-DD)", async () => {
    await loadModule({
      authFetch: async () => ({ ok: true, json: async () => ({ ok: true, data: { experiences: [
        { _id: "e1", title: "X", status: "ACTIVE" },
      ] } }) }),
    });
    const dateEl = document.getElementById("cin-date");
    expect(dateEl.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("check-in — OTP submit validation", () => {
  test("OTP must be exactly 6 digits", async () => {
    await loadModule({});
    document.getElementById("cin-otp").value = "abc";
    document.getElementById("cin-submit").click();
    await Promise.resolve();
    await Promise.resolve();
    const err = document.getElementById("cin-error");
    expect(err.classList.contains("hidden")).toBe(false);
    expect(err.textContent).toMatch(/6-digit/);
  });

  test("OTP input strips non-digits + caps at 6", async () => {
    await loadModule({});
    const otpEl = document.getElementById("cin-otp");
    otpEl.value = "12abc34567890";
    otpEl.dispatchEvent(new Event("input"));
    expect(otpEl.value).toBe("123456");
  });

  test("missing experience selection blocks submit with error", async () => {
    await loadModule({});
    document.getElementById("cin-otp").value = "123456";
    document.getElementById("cin-submit").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById("cin-error").textContent).toMatch(/Pick an experience/);
  });
});

describe("check-in — submit + match flow", () => {
  // BUG-165 (2026-05-17, runtime-verified 2026-05-20): single resolve-by-OTP
  // call replaced the old fetch-list-then-loop-POST flow. Tests updated to the
  // new contract (Rule 15-C) — production js/check-in.js is correct, unchanged.
  test("single check-in-by-otp call → success shows matched guest (BUG-165)", async () => {
    let postCalled = 0;
    const fetchImpl = async (url, opts) => {
      if (url.includes("/check-in-by-otp") && opts && opts.method === "POST") {
        postCalled += 1;
        return { ok: true, json: async () => ({ ok: true, data: { guestName: "Sofia" } }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "X", status: "ACTIVE" }] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    const picker = document.getElementById("cin-experience");
    picker.value = "e1";
    document.getElementById("cin-otp").value = "123456";
    document.getElementById("cin-submit").click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(postCalled).toBe(1); // exactly ONE request — no per-booking loop (the BUG-165 fix)
    expect(document.getElementById("cin-success").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("cin-success-detail").textContent).toContain("Sofia");
  });

  test("OTP_INVALID per booking falls through, eventually shows 'didn't match' error", async () => {
    const fetchImpl = async (url, opts) => {
      if (url.includes("/check-in-list")) {
        return { ok: true, json: async () => ({ ok: true, data: { bookings: [
          { _id: "bk1", guestName: "Sofia", checkedInAt: null },
          { _id: "bk2", guestName: "Marcus", checkedInAt: null },
        ] } }) };
      }
      if (url.includes("/check-in") && opts && opts.method === "POST") {
        return { ok: false, json: async () => ({ ok: false, error: "OTP_INVALID" }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "X", status: "ACTIVE" }] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    document.getElementById("cin-experience").value = "e1";
    document.getElementById("cin-otp").value = "999999";
    document.getElementById("cin-submit").click();
    // Need ~10 microtask cycles to flush 2-booking loop with nested async paths.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(document.getElementById("cin-error").textContent).toMatch(/didn't match/);
  });

  test("non-OTP_INVALID error halts loop with server message", async () => {
    const fetchImpl = async (url, opts) => {
      if (url.includes("/check-in-list")) {
        return { ok: true, json: async () => ({ ok: true, data: { bookings: [{ _id: "bk1", guestName: "S", checkedInAt: null }] } }) };
      }
      if (url.includes("/check-in") && opts && opts.method === "POST") {
        return { ok: false, json: async () => ({ ok: false, error: "BOOKING_LOCKED", message: "Locked by another host." }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "X", status: "ACTIVE" }] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    document.getElementById("cin-experience").value = "e1";
    document.getElementById("cin-otp").value = "111111";
    document.getElementById("cin-submit").click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById("cin-error").textContent).toContain("Locked by another host.");
  });

  test("no matching booking → server error message surfaced (BUG-165)", async () => {
    const fetchImpl = async (url, opts) => {
      if (url.includes("/check-in-by-otp") && opts && opts.method === "POST") {
        return { ok: false, json: async () => ({ ok: false, message: "No booking matched that code on this date." }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "X", status: "ACTIVE" }] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    document.getElementById("cin-experience").value = "e1";
    document.getElementById("cin-otp").value = "123456";
    document.getElementById("cin-submit").click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById("cin-error").textContent).toContain("No booking matched that code on this date.");
  });

  test("Enter key in OTP input triggers submit (BUG-165 single call)", async () => {
    let submitCalled = false;
    const fetchImpl = async (url, opts) => {
      if (url.includes("/check-in-by-otp") && opts && opts.method === "POST") {
        submitCalled = true;
        return { ok: true, json: async () => ({ ok: true, data: { guestName: "G" } }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { experiences: [{ _id: "e1", title: "X", status: "ACTIVE" }] } }) };
    };
    await loadModule({ authFetch: fetchImpl });
    document.getElementById("cin-experience").value = "e1";
    const otpEl = document.getElementById("cin-otp");
    otpEl.value = "123456";
    const enter = new Event("keydown");
    enter.key = "Enter";
    otpEl.dispatchEvent(enter);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(submitCalled).toBe(true);
  });
});
