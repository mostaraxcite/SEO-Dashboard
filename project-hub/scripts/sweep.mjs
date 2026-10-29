// Visits routes as a user and reports HTTP status + page errors. usage: node scripts/sweep.mjs email path1 path2 ...
import { chromium } from "@playwright/test";
const [email, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(base + "/login");
await page.fill("#email", email);
await page.fill("#password", "demo-password-2026");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
for (const p of paths) {
  errors.length = 0;
  const res = await page.goto(base + p, { waitUntil: "networkidle" });
  const h1 = await page.locator("h1").first().textContent().catch(() => "");
  console.log(`${res?.status()} ${p} — ${h1?.trim().slice(0, 50)}${errors.length ? "  ERR: " + errors.join(" | ") : ""}`);
}
await browser.close();
