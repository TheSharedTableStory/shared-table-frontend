const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.thesharedtablestory.com";
const EMAIL = "admin@thesharedtablestory.com";
const PASSWORD = "Rudraisago0db@y";
const TARGET_ID = "6997d05815d8200898200611"; // User 1 (Abhi MO)
const OUT = path.join(__dirname);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log("Logging in as admin...");
  await page.goto(BASE + "/login.html", { waitUntil: "networkidle" });
  await page.fill("#form-login input[type='email']", EMAIL);
  await page.fill("#form-login input[type='password']", PASSWORD);
  await page.click("#form-login button[type='submit']");
  await page.waitForURL("**/index.html**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("Logged in:", page.url());

  // View User 1's profile as admin (admin bypasses discoverable check)
  console.log("Viewing User 1 profile as admin...");
  await page.goto(BASE + "/public-profile.html?id=" + TARGET_ID, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const blockBtn = document.getElementById("block-user-btn");
    const joinText = document.getElementById("host-join-date-text");
    const shareBtn = document.getElementById("share-profile-btn");
    const locationEl = document.getElementById("host-location");
    return {
      blockBtn: blockBtn ? { hidden: blockBtn.classList.contains("hidden"), text: blockBtn.textContent.trim(), visible: blockBtn.offsetParent !== null } : "NOT FOUND",
      joinDate: joinText ? joinText.textContent : "NOT FOUND",
      shareBtn: shareBtn ? { visible: shareBtn.offsetParent !== null } : "NOT FOUND",
      location: locationEl ? locationEl.textContent.trim() : "NOT FOUND"
    };
  });
  console.log("DOM:", JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(OUT, "FINAL_F2_admin_view.png"), fullPage: true });
  console.log("Screenshot: FINAL_F2_admin_view.png");

  await browser.close();
})();
