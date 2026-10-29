import { test, expect, type Page } from "@playwright/test";

const PW = "demo-password-2026";

async function login(page: Page, email: string, locale: "en" | "ar" = "en") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  await page.goto(`/dev/prefs?locale=${locale}&theme=light`);
}

test("agency demo: Cedar requests → manager accepts, AI suggests tasks, delivers → Cedar approves", async ({ page, browser }) => {
  const title = `E2E posts ${Date.now()}`;
  // 1. Client submits with 5 simple fields and AI brief help.
  await login(page, "sara@cedar.test");
  await page.goto("/portal/north-studio/new?category=creative");
  await page.fill("#rf-title", title);
  await page.fill("#rf-objective", "Promote the new store");
  await page.fill("#rf-details", "need some posts for insta. warm colors");
  await page.getByRole("button", { name: "Improve with AI" }).click();
  await expect(page.getByText("AI-generated · Review before use")).toBeVisible();
  await expect(page.getByText("Questions to answer")).toBeVisible();
  await page.getByRole("button", { name: "Use this version" }).click();
  await expect(page.getByRole("button", { name: "Restore original" })).toBeVisible();
  await page.getByLabel("I'm flexible").check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  const ref = (await page.locator("p.tnum").first().textContent())!.trim();
  expect(ref).toMatch(/^NS-\d+$/);

  // 2. Manager triages, accepts with an owner and committed date.
  const staff = await (await browser.newContext()).newPage();
  await login(staff, "karim@northstudio.test");
  await staff.goto("/w/north-studio/inbox");
  await staff.getByRole("link", { name: title }).click();
  await staff.selectOption("#tr-owner", { label: "Karim Saleh" });
  await staff.fill("#tr-date", "2030-03-01");
  await staff.getByRole("button", { name: "Accept", exact: true }).last().click();
  await expect(staff.getByText("Accepted").first()).toBeVisible();

  // 3. AI suggests tasks; nothing is created until Review & create.
  await staff.goto(`/w/north-studio/requests/${ref}?tab=work`);
  await expect(staff.getByText("No tasks yet.")).toBeVisible();
  await staff.getByRole("button", { name: "Suggest tasks" }).click();
  await expect(staff.getByText("AI never proposes dates or people.")).toBeVisible();
  await staff.getByRole("button", { name: /^Create \d+ tasks$/ }).click();
  await expect(staff.getByText("No tasks yet.")).toBeHidden();

  // 4. Explicit Deliver with a note.
  await staff.getByRole("button", { name: "Start work" }).click();
  await staff.getByRole("button", { name: "Deliver" }).first().click();
  await staff.fill("#dl-title", "Round 1");
  await staff.fill("#dl-note", "First round attached as link");
  await staff.fill("#dl-link", "https://example.com/round1");
  await staff.getByRole("button", { name: "Deliver version 1" }).click();
  await expect(staff.getByText("Delivered", { exact: true }).first()).toBeVisible();

  // 5. Client approves version 1.
  await page.goto(`/portal/north-studio/requests/${ref}`);
  await expect(page.locator("#deliv-h")).toContainText("Version 1");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
});

test("River cannot open Cedar's request by URL", async ({ page }) => {
  await login(page, "adam@river.test");
  await page.goto("/portal/north-studio/requests/NS-1001");
  await expect(page.getByText("Not found")).toBeVisible();
  await expect(page.getByText("6 Instagram posts")).toHaveCount(0);
  // And can't reach the staff workspace.
  await page.goto("/w/north-studio/requests/NS-1001");
  await expect(page).toHaveURL(/\/portal\/north-studio/);
});

test("small team: create a task and complete it without requests @mobile", async ({ page }) => {
  await login(page, "dana@smallteam.test");
  await page.goto("/w/small-team");
  const title = `E2E task ${Date.now()}`;
  await page.getByPlaceholder("What needs to be done?").first().fill(title);
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `Mark done: ${title}` }).click();
  await expect(page.getByRole("button", { name: `Reopen: ${title}` })).toBeVisible();
  await page.goto("/w/small-team/inbox");
  await expect(page.getByText("Not found")).toBeVisible();
});

test("Arabic RTL layout for the Jazeera portal", async ({ page }) => {
  await login(page, "khalid@sales.jazeera-pilot.test", "ar");
  await page.goto("/portal/jazeera-pilot");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "ماذا تحتاج؟" })).toBeVisible();
});
