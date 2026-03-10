const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.thesharedtablestory.com";
const API = "https://api.thesharedtablestory.com";
const EMAIL = "ammo23649@gmail.com";
const PASSWORD = "P@ssw0rd";
const USER2_ID = ""; // will be filled after login
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

  let myUserId = "";
  try {
    const sess = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("tsts_user") || "{}"); } catch (_) { return {}; }
    });
    myUserId = sess._id || sess.id || "";
  } catch (_) {}
  console.log("User ID:", myUserId);

  // Check API response for createdAt
  if (myUserId) {
    const apiData = await page.evaluate(async (uid) => {
      try {
        const res = await window.authFetch("/api/users/" + uid + "/profile", { method: "GET" });
        return await res.json();
      } catch (e) { return { error: e.message }; }
    }, myUserId);
    console.log("Profile API response:", JSON.stringify(apiData, null, 2));

    // Check DOM for join date element
    const joinDateInfo = await page.evaluate(() => {
      const wrap = document.getElementById("host-join-date");
      const text = document.getElementById("host-join-date-text");
      return {
        wrapExists: !!wrap,
        textExists: !!text,
        wrapHidden: wrap ? wrap.classList.contains("hidden") : null,
        textContent: text ? text.textContent : null,
        wrapHTML: wrap ? wrap.outerHTML : null
      };
    });
    console.log("Join date DOM:", JSON.stringify(joinDateInfo, null, 2));
  }

  // Now visit User 2's profile (aok49682) to verify F2 block button
  // First find User 2's ID
  const user2Data = await page.evaluate(async () => {
    try {
      // Search for user 2 by trying to load their profile via handle or connection
      // Let's check connections list for another user
      const res = await window.authFetch("/api/social/connections", { method: "GET" });
      const data = await res.json();
      return data;
    } catch (e) { return { error: e.message }; }
  });
  console.log("Connections:", JSON.stringify(user2Data, null, 2).slice(0, 500));

  // Check F7: Verify tab text content
  await page.goto(BASE + "/my-bookings.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const tabInfo = await page.evaluate(() => {
    const tabs = document.querySelectorAll("[role='tablist'] button, .tab-btn, [data-tab]");
    const tabTexts = [];
    tabs.forEach(t => tabTexts.push(t.textContent.trim()));
    // Also check the specific tab elements
    const tripTab = document.querySelector("[data-tab='trips']") || document.getElementById("tab-trips");
    const hostTab = document.querySelector("[data-tab='host']") || document.getElementById("tab-host");
    return {
      allTabs: tabTexts,
      tripTabText: tripTab ? tripTab.textContent.trim() : null,
      hostTabText: hostTab ? hostTab.textContent.trim() : null
    };
  });
  console.log("Tab info:", JSON.stringify(tabInfo));

  await browser.close();
})();
