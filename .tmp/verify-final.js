const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.thesharedtablestory.com";
const EMAIL = "ammo23649@gmail.com";
const PASSWORD = "P@ssw0rd";
const USER2_ID = "6997c00c15d82008982004a0"; // Connection user (Abhi M)
const OUT = path.join(__dirname);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log("1. Logging in...");
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
  console.log("   My user ID:", myUserId);

  // F5 + F6 + F3: Own public profile
  if (myUserId) {
    console.log("\n2. Own public profile (F5 join date, F6 location, F3 share)...");
    await page.goto(BASE + "/public-profile.html?id=" + myUserId, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);

    // Check API response
    const apiData = await page.evaluate(async (uid) => {
      try {
        const res = await window.authFetch("/api/users/" + uid + "/profile", { method: "GET" });
        return await res.json();
      } catch (e) { return { error: e.message }; }
    }, myUserId);
    console.log("   API createdAt:", apiData && apiData.data ? apiData.data.createdAt : "NOT FOUND");

    // Check DOM
    const domInfo = await page.evaluate(() => {
      const wrap = document.getElementById("host-join-date");
      const text = document.getElementById("host-join-date-text");
      const shareBtnEl = document.getElementById("share-profile-btn");
      const blockBtnEl = document.getElementById("block-user-btn");
      return {
        joinDateWrap: wrap ? { hidden: wrap.classList.contains("hidden"), html: wrap.outerHTML.slice(0, 200) } : "ELEMENT NOT FOUND",
        joinDateText: text ? text.textContent : "ELEMENT NOT FOUND",
        shareBtn: shareBtnEl ? { hidden: shareBtnEl.classList.contains("hidden"), visible: shareBtnEl.offsetParent !== null } : "NOT FOUND",
        blockBtn: blockBtnEl ? { hidden: blockBtnEl.classList.contains("hidden") } : "NOT FOUND"
      };
    });
    console.log("   DOM info:", JSON.stringify(domInfo, null, 2));

    await page.screenshot({ path: path.join(OUT, "FINAL_own_profile.png"), fullPage: true });
    console.log("   Screenshot: FINAL_own_profile.png");
  }

  // F2: Another user's profile (block button)
  console.log("\n3. Other user profile (F2 block button)...");
  await page.goto(BASE + "/public-profile.html?id=" + USER2_ID, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const otherDom = await page.evaluate(() => {
    const blockBtnEl = document.getElementById("block-user-btn");
    const joinWrap = document.getElementById("host-join-date");
    const joinText = document.getElementById("host-join-date-text");
    return {
      blockBtn: blockBtnEl ? { hidden: blockBtnEl.classList.contains("hidden"), text: blockBtnEl.textContent.trim() } : "NOT FOUND",
      joinDate: joinText ? joinText.textContent : "NOT FOUND",
      joinDateHidden: joinWrap ? joinWrap.classList.contains("hidden") : null
    };
  });
  console.log("   Other user DOM:", JSON.stringify(otherDom, null, 2));
  await page.screenshot({ path: path.join(OUT, "FINAL_other_profile.png"), fullPage: true });
  console.log("   Screenshot: FINAL_other_profile.png");

  // F7: My Bookings tab badges
  console.log("\n4. My Bookings (F7 tab badges)...");
  await page.goto(BASE + "/my-bookings.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const tabInfo = await page.evaluate(() => {
    const tripTab = document.getElementById("tab-trips");
    const hostTab = document.getElementById("tab-host");
    return {
      tripTabText: tripTab ? tripTab.textContent.trim() : "NOT FOUND",
      hostTabText: hostTab ? hostTab.textContent.trim() : "NOT FOUND"
    };
  });
  console.log("   Tab texts:", JSON.stringify(tabInfo));
  await page.screenshot({ path: path.join(OUT, "FINAL_my_bookings.png"), fullPage: true });

  // F1: Connections search
  console.log("\n5. Connections (F1 search)...");
  await page.goto(BASE + "/connections.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const searchInfo = await page.evaluate(() => {
    const input = document.getElementById("connections-search");
    const empty = document.getElementById("connections-search-empty");
    return {
      inputExists: !!input,
      placeholder: input ? input.placeholder : null,
      emptyExists: !!empty,
      emptyText: empty ? empty.textContent.trim() : null
    };
  });
  console.log("   Search DOM:", JSON.stringify(searchInfo));
  await page.screenshot({ path: path.join(OUT, "FINAL_connections.png"), fullPage: true });

  // F4 + F6 edit: Profile page
  console.log("\n6. Profile page (F4 change password, F6 location edit)...");
  await page.goto(BASE + "/profile.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const profileDom = await page.evaluate(() => {
    const cpBtn = document.getElementById("change-password-btn");
    const cpCurrent = document.getElementById("current-password");
    const cpNew = document.getElementById("new-password");
    const cpRepeat = document.getElementById("repeat-password");
    const locInput = document.getElementById("location");
    return {
      changePasswordBtn: cpBtn ? cpBtn.textContent.trim() : "NOT FOUND",
      currentPwField: !!cpCurrent,
      newPwField: !!cpNew,
      repeatPwField: !!cpRepeat,
      locationField: locInput ? { placeholder: locInput.placeholder, value: locInput.value } : "NOT FOUND",
      eyeToggles: document.querySelectorAll(".cp-eye-toggle").length
    };
  });
  console.log("   Profile DOM:", JSON.stringify(profileDom));
  await page.screenshot({ path: path.join(OUT, "FINAL_profile.png"), fullPage: true });

  await browser.close();
  console.log("\nAll done! Screenshots in:", OUT);
})();
