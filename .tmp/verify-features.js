const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.thesharedtablestory.com";
const API = "https://api.thesharedtablestory.com";
const EMAIL = "ammo23649@gmail.com";
const PASSWORD = "P@ssw0rd";
const OUT = path.join(__dirname);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Step 1: Login
  console.log("1. Logging in...");
  await page.goto(BASE + "/login.html", { waitUntil: "networkidle" });
  await page.fill("#form-login input[type='email']", EMAIL);
  await page.fill("#form-login input[type='password']", PASSWORD);
  await page.click("#form-login button[type='submit']");
  await page.waitForURL("**/index.html**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("   Logged in. URL:", page.url());

  // Step 2: Get own user ID for public profile
  let myUserId = "";
  try {
    const sess = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("tsts_user") || "{}"); } catch (_) { return {}; }
    });
    myUserId = sess._id || sess.id || "";
    console.log("   User ID:", myUserId);
  } catch (_) {}

  // F5 + F6 + F3 + F2: Public Profile (own profile)
  if (myUserId) {
    console.log("2. Public profile (F5 join date, F6 location, F3 share, F2 block)...");
    await page.goto(BASE + "/public-profile.html?id=" + myUserId, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, "F5_F6_F3_F2_public_profile.png"), fullPage: true });
    console.log("   Screenshot saved: F5_F6_F3_F2_public_profile.png");
  }

  // F7: My Bookings tab badges
  console.log("3. My Bookings (F7 tab badges)...");
  await page.goto(BASE + "/my-bookings.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "F7_my_bookings.png"), fullPage: true });
  console.log("   Screenshot saved: F7_my_bookings.png");

  // F1: Connections search
  console.log("4. Connections (F1 search)...");
  await page.goto(BASE + "/connections.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "F1_connections.png"), fullPage: true });
  console.log("   Screenshot saved: F1_connections.png");

  // F4: Change Password form on profile page
  console.log("5. Profile page (F4 change password, F6 location edit)...");
  await page.goto(BASE + "/profile.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "F4_F6_profile.png"), fullPage: true });
  console.log("   Screenshot saved: F4_F6_profile.png");

  // F4 backend: Test change-password with wrong old password (should fail with INVALID_PASSWORD)
  console.log("6. API test: change-password with wrong old password...");
  try {
    const cookies = await context.cookies(API);
    const accessCookie = cookies.find(c => c.name === "tsts_access" || c.name === "tsts_auth");
    const csrfCookie = cookies.find(c => c.name === "tsts_csrf");

    // Use page.evaluate to call the API with cookies
    const apiResult = await page.evaluate(async () => {
      try {
        const res = await fetch("https://api.thesharedtablestory.com/api/auth/change-password", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: "WrongPassword123", newPassword: "NewP@ssw0rd" })
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      } catch (e) { return { error: e.message }; }
    });
    console.log("   API response (wrong password):", JSON.stringify(apiResult));
  } catch (e) {
    console.log("   API test error:", e.message);
  }

  await browser.close();
  console.log("\nDone! All screenshots saved to:", OUT);
})();
