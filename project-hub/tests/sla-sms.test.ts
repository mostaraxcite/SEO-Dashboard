import { describe, expect, it } from "vitest";
import { as, schema, sql, systemDb } from "./helpers";
import { addBusinessMinutes, businessMinutesBetween, type Calendar } from "@/server/sla/business-time";
import { afterQuietHours, processDeliveries, processOutbox, slaTick, smsBody } from "@/server/notify/worker";
import { smsSegments } from "@/server/notify/providers";
import * as requests from "@/server/services/requests";
import * as delivery from "@/server/services/delivery";
import { updateSms } from "@/server/services/account";
import { setPreference } from "@/server/services/notifications";
import { brandPalette, contrast } from "@/lib/color";

const riyadh: Calendar = { timezone: "Asia/Riyadh", workDays: [7, 1, 2, 3, 4], startMinute: 8 * 60, endMinute: 17 * 60, holidays: ["2026-11-03"] };

describe("business-time SLA math (Asia/Riyadh, Sun–Thu 08:00–17:00)", () => {
  it("counts only working minutes", () => {
    // Sunday 2026-11-01 10:00 Riyadh (07:00Z) → Sunday 12:00 = 120
    expect(businessMinutesBetween(new Date("2026-11-01T07:00:00Z"), new Date("2026-11-01T09:00:00Z"), riyadh)).toBe(120);
    // Thursday 16:00 → Sunday 09:00 = 60 (Thu) + 60 (Sun); Fri/Sat skipped
    expect(businessMinutesBetween(new Date("2026-10-29T13:00:00Z"), new Date("2026-11-01T06:00:00Z"), riyadh)).toBe(120);
    // Off-hours submission (Friday) starts counting Sunday 08:00
    expect(businessMinutesBetween(new Date("2026-10-30T10:00:00Z"), new Date("2026-11-01T06:00:00Z"), riyadh)).toBe(60);
  });
  it("skips holidays and adds business minutes across days", () => {
    // Monday 2026-11-02 16:00 + 2h → Tuesday is a holiday → Wednesday 09:00 (06:00Z)
    expect(addBusinessMinutes(new Date("2026-11-02T13:00:00Z"), 120, riyadh).toISOString()).toBe("2026-11-04T06:00:00.000Z");
  });
});

describe("SLA clocks", () => {
  it("auto receipt does not count as first response; staff reply does; warnings and breaches are deduplicated; triage pauses on needs-info", async () => {
    const khalid = await as("khalid@sales.jazeera-pilot.test", "jazeera-pilot");
    const huda = await as("huda@jazeera-pilot.test", "jazeera-pilot");
    const r = await requests.submitRequest(khalid, { title: "SLA test", objective: "x" });
    await processOutbox(200); // creates SLA instances; auto receipt sent
    let inst = await systemDb().select().from(schema.slaInstances).where(sql`request_id = ${r.id}`);
    expect(inst).toHaveLength(2);
    expect(inst.every((i) => i.status === "running" && !i.metAt)).toBe(true);
    // Push the clock far into the future: both breach once.
    const later = new Date(Date.now() + 30 * 86400000);
    await slaTick(later);
    await slaTick(later);
    inst = await systemDb().select().from(schema.slaInstances).where(sql`request_id = ${r.id}`);
    expect(inst.every((i) => i.status === "breached")).toBe(true);
    const breaches = await systemDb().select().from(schema.outboxEvents).where(sql`type = 'sla.breached' and payload->>'requestId' = ${r.id}`);
    expect(breaches).toHaveLength(2);
    // A fresh request: needs info pauses triage but first response is met by the question.
    const r2 = await requests.submitRequest(khalid, { title: "SLA pause", objective: "y" });
    await processOutbox(200);
    await requests.requestInfo(huda, r2.id, "Which branches?");
    await slaTick();
    inst = await systemDb().select().from(schema.slaInstances).where(sql`request_id = ${r2.id}`);
    expect(inst.find((i) => i.metric === "first_response")!.status).toBe("met");
    expect(inst.find((i) => i.metric === "triage")!.status).toBe("paused");
  });
});

describe("SMS gates (mock provider only)", () => {
  it("formats minimal, non-confidential messages and estimates Arabic segments", () => {
    const ar = smsBody("ar", "request.delivered", "REQ-1042", "JZ-PILOT");
    expect(ar).toContain("REQ-1042");
    expect(ar).not.toMatch(/https?:/);
    expect(smsSegments("Request REQ-1 is ready. Sign in to review. - X")).toBe(1);
    expect(smsSegments("ا".repeat(71))).toBe(2);
  });

  it("defers during quiet hours", () => {
    // 22:00 Riyadh (19:00Z) → next 08:00 Riyadh (05:00Z next day)
    const d = afterQuietHours("Asia/Riyadh", 21 * 60, 8 * 60, new Date("2026-11-01T19:00:00Z"));
    expect(d.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    const noon = new Date("2026-11-01T09:00:00Z");
    expect(afterQuietHours("Asia/Riyadh", 21 * 60, 8 * 60, noon)).toEqual(noon);
  });

  it("sends only with tenant opt-in + user opt-in + consent + quota, once per delivery version", async () => {
    const khalid = await as("khalid@sales.jazeera-pilot.test", "jazeera-pilot");
    const huda = await as("huda@jazeera-pilot.test", "jazeera-pilot");
    const deliverOnce = async (title: string) => {
      const r = await requests.submitRequest(khalid, { title, objective: "x" });
      await requests.acceptRequest(huda, r.id, { ownerId: huda.user.id, committedFlexible: "on" });
      await delivery.deliverRequest(huda, r.id, { title: "Done", note: "Ready" });
      await processOutbox(200);
      return r;
    };
    // Without user opt-in → skipped with a reason.
    const r1 = await deliverOnce("SMS 1");
    const [s1] = await systemDb().select().from(schema.notificationDeliveries).where(sql`channel = 'sms' and idempotency_key like ${"request.delivered:" + r1.id + "%"}`);
    expect(s1.status).toBe("skipped");
    expect(s1.skipReason).toBe("user_not_opted_in");
    // Opt in without consent → still skipped.
    await setPreference(khalid, { event: "request.delivered", channel: "sms", mode: "immediate" });
    const r2 = await deliverOnce("SMS 2");
    const [s2] = await systemDb().select().from(schema.notificationDeliveries).where(sql`channel = 'sms' and idempotency_key like ${"request.delivered:" + r2.id + "%"}`);
    expect(s2.skipReason).toBe("no_consent");
    // Consent with an E.164 number → queued (possibly deferred by quiet hours), then sent by the mock.
    await updateSms(khalid, { phone: "+966500000001", consent: "on" });
    const r3 = await deliverOnce("SMS 3");
    const [s3] = await systemDb().select().from(schema.notificationDeliveries).where(sql`channel = 'sms' and idempotency_key like ${"request.delivered:" + r3.id + "%"}`);
    expect(s3.status).toBe("queued");
    expect(s3.consentSnapshot).toMatchObject({ phone: "+966500000001" });
    await systemDb().update(schema.notificationDeliveries).set({ nextAttemptAt: new Date(0) }).where(sql`id = ${s3.id}`);
    await processDeliveries(200);
    const [sent] = await systemDb().select().from(schema.notificationDeliveries).where(sql`id = ${s3.id}`);
    expect(sent.status).toBe("sent");
    expect(sent.segments).toBeGreaterThan(0);
    // Cooldown: an immediate second delivery to the same person is skipped.
    const r4 = await deliverOnce("SMS 4");
    const [s4] = await systemDb().select().from(schema.notificationDeliveries).where(sql`channel = 'sms' and idempotency_key like ${"request.delivered:" + r4.id + "%"}`);
    expect(s4.skipReason).toBe("cooldown");
  });
});

describe("workspace brand colors keep accessible contrast", () => {
  it("adjusts light colors and keeps ≥4.5:1 for button labels in both themes", () => {
    for (const c of ["#124734", "#FFB71B", "#3DAE2B", "#EA0029", "#273A37", "#ffffff"]) {
      const p = brandPalette(c)!;
      expect(contrast(p.light.brand, p.light.on)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark.brand, p.dark.on)).toBeGreaterThanOrEqual(4.5);
    }
    expect(brandPalette("#FFB71B")!.adjusted).toBe(true);
    expect(brandPalette("not-a-color")).toBeNull();
  });
});
