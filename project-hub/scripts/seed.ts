/**
 * Development/demo seed. ALL DATA IS SYNTHETIC — fictional people, companies and briefs.
 * The "Jazeera Pilot" tenant only uses the confirmed brand color token; no logo, fonts,
 * employee data or business documents are included.
 *
 * Every demo account uses the password below. Never run against production.
 */
import { loadEnv } from "./env";
loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

export const DEMO_PASSWORD = "demo-password-2026";

const { systemDb, schema, closeDb } = await import("../src/server/db");
const { sql, eq } = await import("drizzle-orm");
const { hashPassword } = await import("../src/server/auth/password");
const { bootstrapTenant } = await import("../src/server/services/bootstrap");
const { actorByEmail } = await import("../src/server/testing");
const projects = await import("../src/server/services/projects");
const tasks = await import("../src/server/services/tasks");
const requests = await import("../src/server/services/requests");
const delivery = await import("../src/server/services/delivery");
const deps = await import("../src/server/services/dependencies");
const { processOutbox, processDeliveries } = await import("../src/server/notify/worker");
const { brandPalette } = await import("../src/lib/color");

const db = systemDb();
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);

async function reset() {
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

const pw = await hashPassword(DEMO_PASSWORD);
async function user(email: string, name: string, locale: "en" | "ar" = "en") {
  const [u] = await db.insert(schema.users).values({ email, name, passwordHash: pw, locale, emailVerifiedAt: new Date() }).returning();
  return u;
}
async function member(tenantId: string, userId: string, role: (typeof schema.memberships.$inferInsert)["role"], title?: string) {
  await db.insert(schema.memberships).values({ tenantId, userId, role, title });
}
async function clientOrg(tenantId: string, name: string, type: "external" | "department") {
  const [c] = await db.insert(schema.clientOrganizations).values({ tenantId, name, type }).returning();
  return c;
}
async function contact(tenantId: string, clientOrgId: string, userId: string, canApprove = true) {
  await member(tenantId, userId, "client");
  await db.insert(schema.clientContacts).values({ tenantId, clientOrgId, userId, canApprove });
}

await reset();
console.log("Seeding synthetic demo data…");

// ─── People ─────────────────────────────────────────────────────────────
const demo = await user("demo@projecthub.test", "Demo Manager");
// North Studio (fictional agency)
const nadia = await user("nadia@northstudio.test", "Nadia Haddad");
const karim = await user("karim@northstudio.test", "Karim Saleh");
const lina = await user("lina@northstudio.test", "Lina Farouk");
const yousef = await user("yousef@northstudio.test", "Yousef Amin");
const sara = await user("sara@cedar.test", "Sara Khoury");
const maya = await user("maya@cedar.test", "Maya Rizk");
const adam = await user("adam@river.test", "Adam Nasser");
// Jazeera Pilot (synthetic people)
const pilotAdmin = await user("admin@jazeera-pilot.test", "مسؤول المنصة", "ar");
const huda = await user("huda@jazeera-pilot.test", "هدى القحطاني", "ar");
const faisal = await user("faisal@jazeera-pilot.test", "فيصل الحربي", "ar");
const reem = await user("reem@jazeera-pilot.test", "ريم العتيبي", "ar");
const majed = await user("majed@jazeera-pilot.test", "ماجد الدوسري", "ar");
const khalid = await user("khalid@sales.jazeera-pilot.test", "خالد (المبيعات)", "ar");
const noura = await user("noura@product.jazeera-pilot.test", "نورة (المنتجات)", "ar");
// Small Team Studio
const dana = await user("dana@smallteam.test", "Dana Park");
const tom = await user("tom@smallteam.test", "Tom Reyes");

// ─── Tenants ────────────────────────────────────────────────────────────
const north = await bootstrapTenant(db, { name: "North Studio", slug: "north-studio", kind: "agency", mode: "requests", timezone: "Asia/Dubai", isDemo: true, requestPrefix: "NS" });
const jazeera = await bootstrapTenant(db, {
  name: "Jazeera Pilot",
  slug: "jazeera-pilot",
  kind: "internal",
  mode: "requests",
  timezone: "Asia/Riyadh",
  defaultLocale: "ar",
  isDemo: true,
  requestPrefix: "REQ",
  // Confirmed token from the January 2025 guidelines (dark green). No logo/fonts shipped.
  theme: { brandColor: brandPalette("#124734")!.input, displayName: "Jazeera Pilot", welcomeAr: "أخبرنا بما تحتاجه من فريق التسويق.", welcomeEn: "Tell the marketing team what you need." },
  features: { sla: true, approvals: true, sms: true },
});
const small = await bootstrapTenant(db, { name: "Small Team Studio", slug: "small-team", kind: "team", mode: "simple", timezone: "Europe/London", isDemo: true });

await member(north.id, nadia.id, "owner", "Founder");
await member(north.id, karim.id, "manager", "Account lead");
await member(north.id, lina.id, "member", "Designer");
await member(north.id, yousef.id, "member", "Copywriter");
await member(north.id, demo.id, "admin");
const cedar = await clientOrg(north.id, "Cedar", "external");
const river = await clientOrg(north.id, "River", "external");
await contact(north.id, cedar.id, sara.id, true);
await contact(north.id, cedar.id, maya.id, false);
await contact(north.id, river.id, adam.id, true);

await member(jazeera.id, pilotAdmin.id, "owner");
await member(jazeera.id, huda.id, "manager", "قائدة فريق التسويق");
await member(jazeera.id, faisal.id, "member", "المحتوى");
await member(jazeera.id, reem.id, "member", "التصميم");
await member(jazeera.id, majed.id, "member", "الرقمي");
await member(jazeera.id, demo.id, "manager");
const depts: Record<string, string> = {};
for (const [en] of [["Sales"], ["Marketing"], ["Product"], ["Showrooms"], ["Projects"], ["Digital"], ["CX"], ["Procurement"], ["IT"], ["Leadership"]]) {
  depts[en] = (await clientOrg(jazeera.id, en, "department")).id;
}
await contact(jazeera.id, depts.Sales, khalid.id, true);
await contact(jazeera.id, depts.Product, noura.id, true);
// Pilot SLA: 1 business day first response, 2 business days triage (example policy, not contractual).
await db.update(schema.slaPolicies).set({ firstResponseMinutes: 540, triageMinutes: 1080 }).where(eq(schema.slaPolicies.tenantId, jazeera.id));
await db
  .update(schema.notificationSettings)
  .set({ sms: { enabled: true, provider: "mock", senderId: "JZ-PILOT", allowedEvents: ["request.delivered", "approval.requested"], monthlySegmentQuota: 500, costPerSegmentUsd: 0.05, recipientCooldownMinutes: 60, quietHoursStart: 21 * 60, quietHoursEnd: 8 * 60 } })
  .where(eq(schema.notificationSettings.tenantId, jazeera.id));

await member(small.id, dana.id, "owner");
await member(small.id, tom.id, "member");
await member(small.id, demo.id, "admin");

// ─── North Studio work ──────────────────────────────────────────────────
{
  const k = await actorByEmail("karim@northstudio.test", "north-studio");
  const pCedar = await projects.createProject(k, { name: "Cedar — Autumn social", clientOrgId: cedar.id, targetDate: day(18), description: "Autumn collection social content across Instagram and TikTok." });
  const pRiver = await projects.createProject(k, { name: "River — Website refresh", clientOrgId: river.id, targetDate: day(30), access: "members" });
  await projects.createProject(k, { name: "North — Portfolio site", targetDate: day(45), status: "planned" });

  const s = await actorByEmail("sara@cedar.test", "north-studio");
  const cats = await db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.tenantId, north.id));
  const creative = cats.find((c) => c.key === "creative")!;
  const r1 = await requests.submitRequest(s, {
    categoryId: creative.id,
    title: "6 Instagram posts for the autumn collection",
    objective: "Drive store visits for the autumn launch weekend.",
    details: "Warm tones, show the three hero products. Captions in English and Arabic.",
    requestedDueDate: day(10),
    answers: { channel: "instagram", quantity: "6" },
  });
  await requests.acceptRequest(k, r1.id, { ownerId: karim.id, committedDueDate: day(12), committedFlexible: false, projectId: pCedar.id, note: "Thanks Sara — we'll share the first round next week." });
  const t1 = await tasks.createTask(k, { title: "Write captions (EN/AR)", requestId: r1.id, assigneeId: yousef.id, dueDate: day(3) });
  const t2 = await tasks.createTask(k, { title: "Design 6 posts — round 1", requestId: r1.id, assigneeId: lina.id, dueDate: day(5), description: "Use the approved autumn palette from Cedar's brief. Square 1080×1080." });
  await tasks.createTask(k, { title: "Hero product photos", parentTaskId: t2.id, assigneeId: lina.id, dueDate: day(2) });
  await tasks.createTask(k, { title: "Layout grid preview", parentTaskId: t2.id, assigneeId: lina.id });
  await tasks.updateTask(k, t1.id, { status: "in_progress" });
  await tasks.addTaskComment(k, t2.id, "Internal: Cedar's previous agency used too much orange — keep it warm but neutral.");
  const lAct = await actorByEmail("lina@northstudio.test", "north-studio");
  await tasks.addTaskComment(lAct, t2.id, "Waiting for the product photos from Cedar before I can finalize posts 4–6.");
  await deps.createDependency(k, { requestId: r1.id, taskId: t2.id, title: "Product photos for the 3 hero items", partyType: "client", partyName: "Cedar", dueDate: day(1), blocking: true, impact: "Posts 4–6 can't be finalized." });
  await requests.addRequestNote(k, r1.id, "Budget conversation stays internal. Client approved scope of 6 posts.");
  await requests.staffReply(k, r1.id, "Could you share the hero product photos by tomorrow? Posts 4–6 depend on them.");
  await requests.clientReply(s, r1.id, "Uploading them this afternoon. Please keep the logo small.");

  const r2 = await requests.submitRequest(s, { categoryId: cats.find((c) => c.key === "campaign")!.id, title: "Winter teaser campaign", objective: "Build awareness before the winter drop.", requestedFlexible: true });
  void r2;
  const a = await actorByEmail("adam@river.test", "north-studio");
  const r3 = await requests.submitRequest(a, { categoryId: cats.find((c) => c.key === "web")!.id, title: "Update pricing section on landing page", objective: "Reflect the new 2027 plans.", details: "Three plans instead of four. Keep the FAQ.", requestedDueDate: day(7) });
  await requests.acceptRequest(k, r3.id, { ownerId: karim.id, committedDueDate: day(9), committedFlexible: false, projectId: pRiver.id });
  const t3 = await tasks.createTask(k, { title: "Update pricing table component", requestId: r3.id, assigneeId: lina.id, dueDate: day(4) });
  await tasks.updateTask(k, t3.id, { status: "done" });
  await delivery.deliverRequest(k, r3.id, { title: "Pricing section — staging link", note: "The new pricing section is live on staging for your review.", linkUrl: "https://staging.example.com/pricing", requestApproval: true });
}

// ─── Jazeera Pilot work (synthetic) ─────────────────────────────────────
{
  const h = await actorByEmail("huda@jazeera-pilot.test", "jazeera-pilot");
  const kh = await actorByEmail("khalid@sales.jazeera-pilot.test", "jazeera-pilot");
  const cats = await db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.tenantId, jazeera.id));
  const campaign = cats.find((c) => c.key === "campaign")!;
  const r = await requests.submitRequest(kh, {
    categoryId: campaign.id,
    title: "نبي حملة للمعارض الـ20 قبل الشتا",
    objective: "نبغى نزيد زيارات المعارض ونبيع دهانات الشتاء",
    details: "نحتاج بوسترات وستاندات لكل المعارض العشرين + منشورات سوشال. العرض خصم 15% على مجموعة الشتاء",
    requestedDueDate: day(21),
    answers: { region: "national", product: "مجموعة الشتاء" },
  });
  const p = await projects.createProject(h, { name: "حملة الشتاء — المعارض", clientOrgId: depts.Sales, targetDate: day(25) });
  await requests.acceptRequest(h, r.id, { ownerId: faisal.id, committedDueDate: day(24), committedFlexible: false, priority: "high", projectId: p.id, note: "تم القبول. فيصل هو جهة التواصل، والموعد الملتزم به بعد مراجعة النطاق." });
  const ta = await tasks.createTask(h, { title: "كتابة رسائل الحملة (عربي/إنجليزي)", requestId: r.id, assigneeId: faisal.id, dueDate: day(4), teamLabel: "المحتوى" });
  const tb = await tasks.createTask(h, { title: "تصميم البوستر الرئيسي والستاند", requestId: r.id, assigneeId: reem.id, dueDate: day(8), teamLabel: "التصميم" });
  await tasks.createTask(h, { title: "تكييف التصاميم لمقاسات المعارض", requestId: r.id, assigneeId: reem.id, dueDate: day(12), teamLabel: "التصميم" });
  await tasks.createTask(h, { title: "منشورات السوشال للحملة", requestId: r.id, assigneeId: majed.id, dueDate: day(14), teamLabel: "الرقمي" });
  await tasks.updateTask(h, ta.id, { status: "in_progress" });
  await deps.createDependency(h, { requestId: r.id, taskId: tb.id, title: "عروض أسعار الطباعة لـ20 معرضًا", partyType: "department", partyName: "المشتريات", ownerId: huda.id, dueDate: day(3), blocking: true, impact: "لا يمكن تأكيد مواعيد التركيب بدون عروض الأسعار." });
  await deps.createDependency(h, { requestId: r.id, title: "قائمة المعارض ومقاسات الواجهات", partyType: "department", partyName: "المبيعات الإقليمية", dueDate: day(2), blocking: true, impact: "التكييف ينتظر المقاسات." });
  const f = await actorByEmail("faisal@jazeera-pilot.test", "jazeera-pilot");
  await requests.addRequestNote(f, r.id, "تم الاتفاق مع خالد على أن الخصم 15% فقط على مجموعة الشتاء.");
  await requests.addRequestNote(f, r.id, "ننتظر المشتريات لعروض الطباعة، تأخرت يومين.");
  await requests.staffReply(f, r.id, "نحتاج قائمة المعارض العشرين ومقاسات الواجهات من فريق المبيعات الإقليمي لو سمحت.");

  const no = await actorByEmail("noura@product.jazeera-pilot.test", "jazeera-pilot");
  await requests.submitRequest(no, { categoryId: cats.find((c) => c.key === "design_content")!.id, title: "تصاميم إطلاق منتج الدهان المقاوم للرطوبة", objective: "تعريف العملاء بالمنتج الجديد قبل الصيف", requestedFlexible: true, answers: { usage: "social" } });
}

// ─── Small team (Simple Work) ───────────────────────────────────────────
{
  const d = await actorByEmail("dana@smallteam.test", "small-team");
  const p = await projects.createProject(d, { name: "Website relaunch", targetDate: day(20), description: "New site with case studies and a booking form." });
  const t1 = await tasks.createTask(d, { title: "Write homepage copy", projectId: p.id, assigneeId: tom.id, dueDate: day(-1) });
  const t2 = await tasks.createTask(d, { title: "Pick a booking tool", projectId: p.id, assigneeId: dana.id, dueDate: day(2) });
  await tasks.createTask(d, { title: "Case study: bakery rebrand", projectId: p.id, assigneeId: tom.id, dueDate: day(6) });
  await tasks.createTask(d, { title: "Compare 3 booking tools", parentTaskId: t2.id, assigneeId: dana.id });
  await tasks.updateTask(d, t1.id, { status: "in_progress" });
  const tAct = await actorByEmail("tom@smallteam.test", "small-team");
  await tasks.addTaskComment(tAct, t1.id, "Draft is 80% done — waiting on the final tagline decision.");
  await tasks.addTaskComment(d, t1.id, "Decided: go with “Design that books”. Approved.");
  await tasks.createTask(d, { title: "Renew domain", assigneeId: dana.id, dueDate: day(1) });
}

// Backdate a little so timelines read naturally.
await db.execute(sql`update requests set submitted_at = submitted_at - interval '2 days', created_at = created_at - interval '2 days' where tenant_id = ${jazeera.id}`);
await db.execute(sql`update activity set created_at = created_at - interval '1 day' where type = 'request.submitted'`);

await processOutbox(200);
await processDeliveries(200);
void ago;
await closeDb();
console.log(`Done. Sign in with any demo account, password: ${DEMO_PASSWORD}`);
console.log("  demo@projecthub.test (all workspaces) · karim@northstudio.test · sara@cedar.test · adam@river.test");
console.log("  huda@jazeera-pilot.test · khalid@sales.jazeera-pilot.test · dana@smallteam.test");
