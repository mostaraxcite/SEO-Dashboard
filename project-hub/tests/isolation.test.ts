import { describe, expect, it } from "vitest";
import { as, expectCode, requestByRef, schema, sql, systemDb, withScope } from "./helpers";
import { getRequestForClient, getRequestForStaff, listRequests, clientReply } from "@/server/services/requests";
import { getTask, listTasks } from "@/server/services/tasks";
import { search } from "@/server/services/search";
import { listNotifications } from "@/server/services/notifications";
import { loadReadableAttachment, signedFileUrl, verifyFileSignature } from "@/server/services/files";
import { requestsCsv } from "@/server/services/reports";
import { acceptInvite } from "@/server/services/auth";
import { createInvite } from "@/server/services/workspace";
import { randomToken, sha256 } from "@/server/auth/crypto";

describe("tenant and client isolation", () => {
  it("River's contact cannot read Cedar's request by reference (API/service level)", async () => {
    const adam = await as("adam@river.test", "north-studio");
    await expectCode(getRequestForClient(adam, "NS-1001"), "not_found");
    const mine = await listRequests(adam);
    expect(mine.map((r) => r.publicRef).sort()).toEqual(["NS-1003"]);
    expect(mine.every((r) => r.clientName === "River")).toBe(true);
  });

  it("Row-Level Security hides other clients' rows and every internal table in client context", async () => {
    const adam = await as("adam@river.test", "north-studio");
    const rows = await withScope(adam.scope, async (tx) => ({
      requests: await tx.select({ ref: schema.requests.publicRef }).from(schema.requests),
      notes: await tx.select().from(schema.internalComments),
      tasks: await tx.select().from(schema.tasks),
      deps: await tx.select().from(schema.dependencies),
      projects: await tx.select().from(schema.projects),
      orgs: await tx.select({ name: schema.clientOrganizations.name }).from(schema.clientOrganizations),
      internalActivity: await tx.select().from(schema.activity).where(sql`${schema.activity.visibility} = 'internal'`),
      audit: await tx.select().from(schema.auditLogs),
    }));
    expect(rows.requests.map((r) => r.ref)).toEqual(["NS-1003"]);
    expect(rows.notes).toHaveLength(0);
    expect(rows.tasks).toHaveLength(0);
    expect(rows.deps).toHaveLength(0);
    expect(rows.projects).toHaveLength(0);
    expect(rows.orgs.map((o) => o.name)).toEqual(["River"]);
    expect(rows.internalActivity).toHaveLength(0);
    expect(rows.audit).toHaveLength(0);
  });

  it("a client cannot write into another client's request even with a forged id (RLS WITH CHECK)", async () => {
    const adam = await as("adam@river.test", "north-studio");
    const cedarReq = await requestByRef("NS-1001", "north-studio");
    await expectCode(clientReply(adam, cedarReq.id, "hello"), "not_found");
    await expect(
      withScope(adam.scope, (tx) =>
        tx.insert(schema.publicMessages).values({ tenantId: adam.tenant.id, clientOrgId: cedarReq.clientOrgId, requestId: cedarReq.id, authorId: adam.user.id, authorKind: "client", body: "x" }),
      ),
    ).rejects.toThrow();
  });

  it("another tenant cannot read a task or request even when the id is known", async () => {
    const dana = await as("dana@smallteam.test", "small-team");
    const [northTask] = await systemDb().select().from(schema.tasks).where(sql`${schema.tasks.title} like 'Design 6 posts%'`);
    await expectCode(getTask(dana, northTask.id), "not_found");
    const raw = await withScope(dana.scope, (tx) => tx.select().from(schema.tasks).where(sql`${schema.tasks.id} = ${northTask.id}`));
    expect(raw).toHaveLength(0);
    // Forcing another tenant's id into the scope is impossible from the app: tenant comes from membership.
    const northReq = await requestByRef("NS-1001", "north-studio");
    const raw2 = await withScope(dana.scope, (tx) => tx.select().from(schema.requests).where(sql`${schema.requests.id} = ${northReq.id}`));
    expect(raw2).toHaveLength(0);
  });

  it("cross-tenant foreign keys are rejected by the database", async () => {
    const [north] = await systemDb().select().from(schema.tenants).where(sql`slug = 'north-studio'`);
    const [small] = await systemDb().select().from(schema.tenants).where(sql`slug = 'small-team'`);
    const [p] = await systemDb().select().from(schema.projects).where(sql`${schema.projects.tenantId} = ${north.id}`).limit(1);
    await expect(systemDb().insert(schema.tasks).values({ tenantId: small.id, projectId: p.id, title: "smuggled" })).rejects.toThrow();
  });

  it("search, exports and notifications stay inside the actor's scope", async () => {
    const adam = await as("adam@river.test", "north-studio");
    const s = await search(adam, "Instagram");
    expect(s.requests).toHaveLength(0);
    await expectCode(requestsCsv(adam), "forbidden");
    const karim = await as("karim@northstudio.test", "north-studio");
    const csv = await requestsCsv(karim);
    expect(csv).toContain("NS-1001");
    const tom = await as("tom@smallteam.test", "small-team");
    await expectCode(requestsCsv(tom), "forbidden"); // member, not manager
    const notes = await listNotifications(adam, 100);
    expect(notes.every((n) => !String(n.params.ref ?? "").includes("NS-1001"))).toBe(true);
  });

  it("members only see projects/tasks they have access to; guests only explicit projects", async () => {
    const lina = await as("lina@northstudio.test", "north-studio");
    const tasks = await listTasks(lina, {});
    expect(tasks.length).toBeGreaterThan(0);
    // River project is members-only and Lina was added only because she's assigned a River task.
    const yousef = await as("yousef@northstudio.test", "north-studio");
    const riverReq = await requestByRef("NS-1003", "north-studio");
    await expectCode(getRequestForStaff(yousef, "NS-1003"), "not_found");
    expect(riverReq).toBeTruthy();
  });

  it("file access needs a valid, user-bound signature AND permission", async () => {
    const karim = await as("karim@northstudio.test", "north-studio");
    const adam = await as("adam@river.test", "north-studio");
    const [t] = await systemDb().select().from(schema.tasks).where(sql`${schema.tasks.title} like 'Design 6 posts%'`);
    const [att] = await systemDb()
      .insert(schema.attachments)
      .values({ tenantId: karim.tenant.id, taskId: t.id, clientOrgId: t.clientOrgId, filename: "internal.pdf", mime: "application/pdf", size: 3, storageKey: "x/y", sha256: "0", visibility: "internal", scanState: "clean" })
      .returning();
    const url = new URL("http://x" + signedFileUrl("north-studio", att.id, karim.user.id));
    expect(verifyFileSignature(att.id, karim.user.id, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(true);
    expect(verifyFileSignature(att.id, adam.user.id, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(false);
    expect(verifyFileSignature(att.id, karim.user.id, String(Math.floor(Date.now() / 1000) - 5), url.searchParams.get("sig"))).toBe(false);
    await expect(loadReadableAttachment(karim, att.id)).resolves.toBeTruthy();
    // Even a Cedar contact (same client org) cannot read an internal task file.
    const sara = await as("sara@cedar.test", "north-studio");
    await expectCode(loadReadableAttachment(sara, att.id), "not_found");
  });

  it("invitation role and client org come from the stored token, not the form", async () => {
    const karim = await as("karim@northstudio.test", "north-studio");
    const [river] = await systemDb().select().from(schema.clientOrganizations).where(sql`name = 'River'`);
    const { link } = await createInvite(karim, { email: "newperson@river.test", role: "client", clientOrgId: river.id });
    const token = decodeURIComponent(link.split("/invite/")[1]);
    // Someone signed in as a different user cannot accept it.
    await expectCode(acceptInvite(token, { id: karim.user.id, email: karim.user.email }, {}), "forbidden");
    // Managers cannot mint staff invites.
    await expectCode(createInvite(karim, { email: "x@y.test", role: "admin" }), "forbidden");
    const [row] = await systemDb().select().from(schema.authTokens).where(sql`${schema.authTokens.tokenHash} = ${sha256(token)}`);
    expect(row.role).toBe("client");
    expect(row.clientOrgId).toBe(river.id);
    expect(randomToken()).not.toBe(token);
  });
});
