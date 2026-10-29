// usage: node shot.mjs email path out.png [--ar] [--dark] [--mobile] [--full]
import { chromium } from "@playwright/test";
const [email, path, out, ...flags] = process.argv.slice(2);
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const mobile = flags.includes("--mobile");
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  colorScheme: flags.includes("--dark") ? "dark" : "light",
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await page.goto(base + "/login");
await page.fill("#email", email);
await page.fill("#password", "demo-password-2026");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("button[type=submit]")]);
const loc = flags.includes("--ar") ? "ar" : "en";
await ctx.addCookies([{ name: "ph_locale", value: loc, url: base }]);
// set user preference through UI-equivalent action: hit a tiny endpoint by evaluating fetch isn't available; use preference action via menu is complex -> use DB-less cookie only when logged out. For logged-in users we call the helper route.
await page.goto(base + `/dev/prefs?locale=${loc}&theme=${flags.includes("--dark") ? "dark" : "light"}`);
await page.goto(base + path, { waitUntil: "networkidle" });
if (flags.includes("--click")) {
  const i = flags.indexOf("--click");
  for (const sel of flags[i + 1].split("|")) { await page.click(sel); await page.waitForTimeout(900); }
}
await page.screenshot({ path: out, fullPage: flags.includes("--full") });
console.log("saved", out, page.url());
await browser.close();
