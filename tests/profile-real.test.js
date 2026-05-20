// REAL coverage for js/profile.js — user profile page:
// auth gate + redirect, loadMe field population, mobile country-code split,
// profile save, change-email OTP + POST, change-password validation + POST,
// notification preferences, recommendation toggle direct save, data export,
// account delete, host verification status + submit.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "profile.js"), "utf-8");

const NOTIF_KEYS = ["bookingConfirmations","bookingReminders","newReviews","communityActivity","hostDigest","promotional"];

function buildDom() {
  document.body.innerHTML = `
    <img id="nav-user-pic" />
    <p id="host-ownership-warning" class="hidden"></p>

    <form id="profile-form">
      <input id="name" />
      <input id="email" readonly />
      <select id="mobileCountryCode">
        <option value="+61">+61</option>
        <option value="+91">+91</option>
        <option value="+1">+1</option>
      </select>
      <input id="mobile" />
      <textarea id="bio"></textarea>
      <input id="location" />
      <input id="handle" />
      <input type="checkbox" id="allow-handle-search" />
      <input type="checkbox" id="share-to-friends" />
      <input type="checkbox" id="recommendation-email-toggle" />
      <input type="checkbox" id="public-profile-toggle" />
      <button type="submit">Save</button>
    </form>

    <div>
      <img id="profile-pic-preview" />
      <input type="file" id="file-upload" />
      <button id="upload-btn" class="hidden">Upload</button>
      <p id="upload-status"></p>
      <p id="photo-nudge" class="hidden">Add a photo!</p>
    </div>

    <section>
      <button id="change-email-btn">Change Email</button>
      <div id="change-email-form" class="hidden">
        <input id="new-email" />
        <input id="change-email-password" type="password" />
        <button id="change-email-submit">Submit</button>
        <button id="change-email-cancel">Cancel</button>
        <p id="change-email-status" class="hidden"></p>
      </div>
    </section>

    <section>
      <div id="notif-prefs-loading"></div>
      <div id="notif-prefs-error" class="hidden"></div>
      <div id="notif-prefs-list" class="hidden">
        ${NOTIF_KEYS.map((k) => `<input type="checkbox" id="notif-${k}" />`).join("")}
      </div>
      <p id="notif-prefs-status"></p>
    </section>

    <section>
      <input id="current-password" type="password" />
      <button class="cp-eye-toggle" data-target="current-password"><i class="fas fa-eye"></i></button>
      <input id="new-password" type="password" />
      <input id="repeat-password" type="password" />
      <button id="change-password-btn">Change password</button>
      <p id="change-password-status" class="hidden"></p>
    </section>

    <section>
      <ul id="data-categories"></ul>
      <p id="exported-at"></p>
      <p id="retention-meta"></p>
      <button id="export-btn">Download My Data</button>
      <button id="delete-btn">Delete My Account</button>
      <p id="action-status"></p>
    </section>

    <section id="host-verification-section">
      <p id="host-verification-status-line"></p>
      <div id="host-verification-card" class="hidden">
        <select id="kyc-id-type">
          <option value="">Choose</option>
          <option value="passport">Passport</option>
        </select>
        <input type="file" id="kyc-id-file" />
        <input type="file" id="kyc-addr-file" />
        <p id="kyc-error" class="hidden"></p>
        <p id="kyc-progress" class="hidden"></p>
        <button id="kyc-submit-btn">Submit</button>
      </div>
    </section>
  `;
}

const __registeredHandlers = [];
function cleanupDocHandlers() {
  while (__registeredHandlers.length) {
    const reg = __registeredHandlers.pop();
    try {
      document.removeEventListener(reg.event, reg.handler);
    } catch (err) {
      // ignore: handler may already be detached
    }
  }
}

let __navigatedTo = "";

function loadProfile(opts) {
  opts = opts || {};
  cleanupDocHandlers();
  buildDom();
  // eslint-disable-next-line no-eval
  (0, eval)(COMMON_SRC);

  __navigatedTo = "";
  Object.defineProperty(window, "location", {
    value: {
      pathname: "/profile.html",
      search: opts.search || "",
      replace(v) { __navigatedTo = String(v); },
      get href() { return ""; },
      set href(v) { __navigatedTo = String(v); },
    },
    writable: true, configurable: true,
  });

  window.CLOUDINARY_URL = "";
  window.tstsGetSession = opts.session || (async () => ({ ok: true, user: opts.user || { name: "U", email: "u@example.com" } }));
  window.authFetch = opts.authFetch || (async () => ({ ok: false, status: 500, json: async () => ({}) }));
  window.tstsConfirm = opts.confirm || (async () => false);
  window.tstsNotify = opts.notify || vi.fn();
  window.tstsOtpVerify = opts.otpVerify || (async () => "");
  window.tstsSafeImg = (el, p) => { if (el) el.src = String(p || ""); };
  window.tstsFormatDateShort = null;
  window.tstsIdempotencyKey = () => "idem-1";
  window.clearAuth = opts.clearAuth || vi.fn();

  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
  globalThis.URL.revokeObjectURL = vi.fn();

  __registeredHandlers.length = 0;
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((event, handler, options) => {
    if (event === "DOMContentLoaded") {
      // profile.js doesn't register DOMContentLoaded — its IIFE runs everything immediately
      __registeredHandlers.push({ event, handler });
      return;
    }
    __registeredHandlers.push({ event, handler });
    return origAdd(event, handler, options);
  });

  new Function(SRC)();
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe("profile — auth gate + load", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("missing session → redirect to login.html?returnTo=...", async () => {
    loadProfile({ session: async () => ({ ok: false }) });
    await flush();
    expect(__navigatedTo).toMatch(/login\.html\?returnTo=/);
  });

  test("session populates form fields", async () => {
    loadProfile({
      user: {
        name: "Alice", email: "alice@example.com",
        bio: "I cook lentils", location: "Melbourne", handle: "alice_h",
        mobile: "+61400111222",
        allowHandleSearch: true, showExperiencesToFriends: false,
        recommendationEmailOptOut: false, publicProfile: true,
        profilePic: "https://img/me.jpg",
      },
    });
    await flush();
    expect(document.getElementById("name").value).toBe("Alice");
    expect(document.getElementById("email").value).toBe("alice@example.com");
    expect(document.getElementById("bio").value).toBe("I cook lentils");
    expect(document.getElementById("location").value).toBe("Melbourne");
    expect(document.getElementById("handle").value).toBe("alice_h");
    // mobile +61 stripped from country code
    expect(document.getElementById("mobileCountryCode").value).toBe("+61");
    expect(document.getElementById("mobile").value).toBe("400111222");
    expect(document.getElementById("allow-handle-search").checked).toBe(true);
    expect(document.getElementById("public-profile-toggle").checked).toBe(true);
    expect(document.getElementById("recommendation-email-toggle").checked).toBe(true); // !optOut
    expect(document.getElementById("profile-pic-preview").src).toContain("img/me.jpg");
    // photo nudge hidden because profilePic exists
    expect(document.getElementById("photo-nudge").classList.contains("hidden")).toBe(true);
  });

  test("?hostOwnership=ambiguous → warning revealed", async () => {
    loadProfile({ search: "?hostOwnership=ambiguous" });
    await flush();
    expect(document.getElementById("host-ownership-warning").classList.contains("hidden")).toBe(false);
  });
});

describe("profile — save form", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("submit PUTs /api/auth/update with normalised mobile (+61 prefix)", async () => {
    let captured = null;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/auth/update" && opts && opts.method === "PUT") {
          captured = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("name").value = "New Name";
    document.getElementById("mobile").value = "0412345678";
    document.getElementById("mobileCountryCode").value = "+61";
    document.getElementById("bio").value = "Updated bio";
    document.getElementById("location").value = "Sydney";
    document.getElementById("handle").value = "newh";
    document.getElementById("profile-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    expect(captured.name).toBe("New Name");
    // leading 0 stripped, country code prepended
    expect(captured.mobile).toBe("+61412345678");
    expect(captured.bio).toBe("Updated bio");
    expect(captured.location).toBe("Sydney");
    expect(captured.handle).toBe("newh");
  });
});

describe("profile — change email flow", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("toggle button shows the change-email form, cancel hides it", async () => {
    loadProfile({});
    await flush();
    expect(document.getElementById("change-email-form").classList.contains("hidden")).toBe(true);
    document.getElementById("change-email-btn").click();
    expect(document.getElementById("change-email-form").classList.contains("hidden")).toBe(false);
    document.getElementById("change-email-cancel").click();
    expect(document.getElementById("change-email-form").classList.contains("hidden")).toBe(true);
  });

  test("submit empty email shows status error, no POST", async () => {
    let posted = false;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/auth/change-email" && opts && opts.method === "POST") posted = true;
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("change-email-submit").click();
    await flush();
    expect(posted).toBe(false);
    expect(document.getElementById("change-email-status").textContent).toMatch(/new email/i);
  });

  test("submit happy path: OTP token + valid fields → POST /change-email, success status", async () => {
    let captured = null;
    loadProfile({
      otpVerify: async () => "otp_email_tok",
      authFetch: async (url, opts) => {
        if (url === "/api/auth/change-email" && opts && opts.method === "POST") {
          captured = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("new-email").value = "new@example.com";
    document.getElementById("change-email-password").value = "currentPw";
    document.getElementById("change-email-submit").click();
    await flush();
    expect(captured).toEqual({ newEmail: "new@example.com", password: "currentPw", otpToken: "otp_email_tok" });
    expect(document.getElementById("change-email-status").textContent).toMatch(/Verification email sent/);
  });

  test("server EMAIL_IN_USE error surfaces friendly message", async () => {
    loadProfile({
      otpVerify: async () => "otp",
      authFetch: async (url) => {
        if (url === "/api/auth/change-email") return { ok: false, status: 400, json: async () => ({ ok: false, error: "EMAIL_IN_USE" }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("new-email").value = "taken@example.com";
    document.getElementById("change-email-password").value = "pw";
    document.getElementById("change-email-submit").click();
    await flush();
    expect(document.getElementById("change-email-status").textContent).toMatch(/already in use/i);
  });
});

describe("profile — change password flow", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("weak password (no uppercase) shows error, no POST", async () => {
    let posted = false;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/auth/change-password" && opts && opts.method === "POST") posted = true;
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("current-password").value = "old";
    document.getElementById("new-password").value = "lowercase1";
    document.getElementById("repeat-password").value = "lowercase1";
    document.getElementById("change-password-btn").click();
    await flush();
    expect(posted).toBe(false);
    expect(document.getElementById("change-password-status").textContent).toMatch(/uppercase/i);
  });

  test("happy path: POST /change-password, notify + clearAuth + redirect to login.html", async () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const clearAuth = vi.fn();
    loadProfile({
      notify,
      clearAuth,
      authFetch: async (url, opts) => {
        if (url === "/api/auth/change-password" && opts && opts.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("current-password").value = "old";
    document.getElementById("new-password").value = "NewPass1!";
    document.getElementById("repeat-password").value = "NewPass1!";
    document.getElementById("change-password-btn").click();
    await vi.advanceTimersByTimeAsync(800);
    expect(notify).toHaveBeenCalled();
    expect(clearAuth).toHaveBeenCalled();
    expect(__navigatedTo).toBe("login.html");
    vi.useRealTimers();
  });

  test("eye-toggle flips input type password ↔ text", async () => {
    loadProfile({});
    await flush();
    const input = document.getElementById("current-password");
    expect(input.type).toBe("password");
    document.querySelector(".cp-eye-toggle").click();
    expect(input.type).toBe("text");
    document.querySelector(".cp-eye-toggle").click();
    expect(input.type).toBe("password");
  });
});

describe("profile — notification preferences", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("toggling promotional PATCHes endpoint, server data syncs all toggles", async () => {
    let patched = null;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/user/notification-preferences" && (!opts || !opts.method || opts.method === "GET")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { promotional: false } }) };
        }
        if (url === "/api/user/notification-preferences" && opts.method === "PATCH") {
          patched = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { promotional: true, hostDigest: true } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    const promo = document.getElementById("notif-promotional");
    promo.checked = true;
    promo.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(patched).toEqual({ promotional: true });
    expect(document.getElementById("notif-prefs-status").textContent).toMatch(/Saved/);
    expect(document.getElementById("notif-hostDigest").checked).toBe(true);
  });

  test("recommendation toggle saves via PUT /api/auth/update with recommendationEmailOptOut", async () => {
    let captured = null;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/auth/update" && opts && opts.method === "PUT") {
          captured = JSON.parse(opts.body);
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    const rec = document.getElementById("recommendation-email-toggle");
    rec.checked = false; // user opts OUT
    rec.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(captured).toEqual({ recommendationEmailOptOut: true });
  });
});

describe("profile — data export + delete", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("Download My Data triggers blob URL + revoke", async () => {
    loadProfile({
      authFetch: async (url) => {
        if (url === "/api/me/export") return { ok: true, status: 200, json: async () => ({ ok: true, data: { profile: {}, bookings: [], experiences: [] } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    globalThis.URL.createObjectURL.mockClear();
    globalThis.URL.revokeObjectURL.mockClear();
    document.getElementById("export-btn").click();
    await flush();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
    expect(document.getElementById("action-status").textContent).toMatch(/Export downloaded/);
  });

  test("Delete account: confirm + OTP token → POST /delete-account", async () => {
    vi.useFakeTimers();
    let captured = null;
    loadProfile({
      confirm: async () => true,
      otpVerify: async () => "otp_del",
      authFetch: async (url, opts) => {
        if (url === "/api/auth/delete-account" && opts && opts.method === "POST") {
          captured = { url, body: JSON.parse(opts.body), idem: opts.idempotencyKey };
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("delete-btn").click();
    await vi.advanceTimersByTimeAsync(800);
    expect(captured.body).toEqual({ otpToken: "otp_del" });
    expect(captured.idem).toBe("idem-1");
    expect(__navigatedTo).toBe("index.html");
    vi.useRealTimers();
  });

  test("Delete: confirm rejected → no POST", async () => {
    let posted = false;
    loadProfile({
      confirm: async () => false,
      authFetch: async (url, opts) => {
        if (url === "/api/auth/delete-account" && opts && opts.method === "POST") posted = true;
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("delete-btn").click();
    await flush();
    expect(posted).toBe(false);
  });
});

describe("profile — host verification (KYC)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test("'verified' status hides the card and shows verified line", async () => {
    loadProfile({
      authFetch: async (url) => {
        if (url === "/api/host/verification/status") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { hostVerification: { status: "verified" } } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    expect(document.getElementById("host-verification-status-line").textContent).toMatch(/verified host/i);
    expect(document.getElementById("host-verification-card").classList.contains("hidden")).toBe(true);
  });

  test("'rejected' status reveals card with rejection note", async () => {
    loadProfile({
      authFetch: async (url) => {
        if (url === "/api/host/verification/status") {
          return { ok: true, status: 200, json: async () => ({ ok: true, data: { hostVerification: { status: "rejected", note: "blurry photo" } } }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    expect(document.getElementById("host-verification-status-line").textContent).toMatch(/rejected, blurry photo/i);
    expect(document.getElementById("host-verification-card").classList.contains("hidden")).toBe(false);
  });

  test("submit with no ID type shows error, no POST", async () => {
    let posted = false;
    loadProfile({
      authFetch: async (url, opts) => {
        if (url === "/api/host/verification/request" && opts && opts.method === "POST") posted = true;
        if (url === "/api/host/verification/status") return { ok: true, status: 200, json: async () => ({ ok: true, data: { hostVerification: { status: "none" } } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });
    await flush();
    document.getElementById("kyc-submit-btn").click();
    await flush();
    expect(posted).toBe(false);
    expect(document.getElementById("kyc-error").textContent).toMatch(/Choose an ID type/);
  });
});
