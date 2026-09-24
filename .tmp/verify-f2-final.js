const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.thesharedtablestory.com";
const EMAIL = "ammo23649@gmail.com";
const PASSWORD = "P@ssw0rd";
const USER2_ID = "6997c00c15d82008982004a0";
const OUT = path.join(__dirname);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log("Logging in...");
  await page.goto(BASE + "/login.html", { waitUntil: "networkidle" });
  await page.fill("#form-login input[type='email']", EMAIL);
  await page.fill("#form-login input[type='password']", PASSWORD);
  await page.click("#form-login button[type='submit']");
  await page.waitForURL("**/index.html**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Verify deploy
  const versionCheck = await page.evaluate(async () => {
    try {
      const res = await fetch("/public-profile.html");
      const html = await res.text();
      const match = html.match(/public-profile\.js\?v=([a-zA-Z0-9]+)/);
      return match ? match[1] : "NOT FOUND";
    } catch (_) { return "ERROR"; }
  });
  console.log("Frontend version:", versionCheck);

  if (versionCheck !== "20260305b") {
    console.log("Deploy not yet live. Exiting.");
    await browser.close();
    return;
  }

  // F2: View other user's profile
  console.log("Viewing other user profile for F2 block...");
  await page.goto(BASE + "/public-profile.html?id=" + USER2_ID, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const blockInfo = await page.evaluate(() => {
    const btn = document.getElementById("block-user-btn");
    return {
      exists: !!btn,
      hidden: btn ? btn.classList.contains("hidden") : null,
      text: btn ? btn.textContent.trim() : null,
      visible: btn ? (btn.offsetParent !== null) : null
    };
  });
  console.log("Block button:", JSON.stringify(blockInfo));

  await page.screenshot({ path: path.join(OUT, "FINAL_F2_block_other_user.png"), fullPage: true });
  console.log("Screenshot: FINAL_F2_block_other_user.png");

  // Also take own profile for F5 visual proof
  let myUserId = "";
  try {
    const sess = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("tsts_user") || "{}"); } catch (_) { return {}; }
    });
    myUserId = sess._id || sess.id || "";
  } catch (_) {}

  if (myUserId) {
    console.log("Own profile for F5...");
    await page.goto(BASE + "/public-profile.html?id=" + myUserId, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, "FINAL_F5_join_date.png"), fullPage: true });
    console.log("Screenshot: FINAL_F5_join_date.png");
  }

  await browser.close();
  console.log("Done!");
})();
