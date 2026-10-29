import { describe, expect, it } from "vitest";
import { as, expectCode, outbox, schema, sql, systemDb } from "./helpers";
import * as requests from "@/server/services/requests";
import * as tasks from "@/server/services/tasks";
import * as delivery from "@/server/services/delivery";
import * as deps from "@/server/services/dependencies";
import { processDeliveries, processOutbox } from "@/server/notify/worker";

async function newRequest(title: string) {
  const sara = await as("sara@cedar.test", "north-studio");
  return requests.submitRequest(sara, { title, objective: "Test objective", requestedDueDate: "2030-01-10" });
}

describe("request lifecycle", () => {
  it("submits with only the 5 core fields, unique reference, server-derived client org", async () => {
    const sara = await as("sara@cedar.test", "north-studio");
    const [river] = await systemDb().select().from(schema.clientOrganizations).where(sql`name = 'River'`);
    // A forged clientOrgId from a client is ignored.
    const r = await requests.submitRequest(sara, { title: "Banner", objective: "Promote sale", clientOrgId: river.id, requestedFlexible: "on" });
    expect(r.publicRef).toMatch(/^NS-\d+$/);
    expect(r.clientOrgId).toBe(sara.clientOrgId);
    expect(r.status).toBe("new");
    expect(r.requestedFlexible).toBe(true);
    expect((await outbox("request.submitted", r.id)).length).toBe(1);
  });

  it("triage: needs info → requester answers → back to triage; accept keeps requested vs committed distinct", async () => {
    const r = await newRequest("Triage flow");
    const karim = await as("karim@northstudio.test", "north-studio");
    const sara = await as("sara@cedar.test", "north-studio");
    await requests.requestInfo(karim, r.id, "Which sizes?");
    expect((await requests.getRequestForClient(sara, r.publicRef)).publicStatus).toBe("waiting_on_you");
    await requests.clientReply(sara, r.id, "1080x1080");
    const after = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(after.status).toBe("triage");
    expect(after.firstResponseAt).not.toBeNull();
    await expectCode(requests.acceptRequest(karim, r.id, { ownerId: karim.user.id }), "commitment_required");
    const acc = await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedDueDate: "2030-01-20" });
    expect(acc.requestedDueDate).toBe("2030-01-10");
    expect(acc.committedDueDate).toBe("2030-01-20");
    const client = await requests.getRequestForClient(sara, r.publicRef);
    expect(client.committedDueDate).toBe("2030-01-20");
    expect(client.ownerName).toBe("Karim Saleh");
  });

  it("members cannot accept or deliver unless delegated; clients cannot triage", async () => {
    const r = await newRequest("Permissions");
    const lina = await as("lina@northstudio.test", "north-studio");
    const sara = await as("sara@cedar.test", "north-studio");
    await expectCode(requests.acceptRequest(lina, r.id, { ownerId: lina.user.id, committedFlexible: "on" }), "forbidden");
    await expectCode(requests.acceptRequest(sara, r.id, { ownerId: sara.user.id, committedFlexible: "on" }), "forbidden");
    await expectCode(delivery.deliverRequest(sara, r.id, { title: "x", note: "y" }), "forbidden");
  });

  it("task Done never delivers; only explicit Deliver notifies once per version", async () => {
    const r = await newRequest("Delivery flow");
    const karim = await as("karim@northstudio.test", "north-studio");
    await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedFlexible: "on" });
    const t1 = await tasks.createTask(karim, { title: "Do it", requestId: r.id });
    await tasks.updateTask(karim, t1.id, { status: "done" });
    expect(await outbox("request.delivered", r.id)).toHaveLength(0);
    let row = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(row.status).toBe("accepted");

    await expectCode(delivery.deliverRequest(karim, r.id, { title: "Empty" }), "deliver_needs_content");
    const d1 = await delivery.deliverRequest(karim, r.id, { title: "V1", note: "Here it is", requestApproval: "on" });
    expect(d1.deliverable.version).toBe(1);
    expect(await outbox("request.delivered", r.id)).toHaveLength(1);

    // Worker runs twice: client still gets exactly one in-app + one email for v1.
    await processOutbox(200);
    await processOutbox(200);
    await processDeliveries(200);
    await processDeliveries(200);
    const sara = await as("sara@cedar.test", "north-studio");
    const inApp = await systemDb().select().from(schema.notifications).where(sql`${schema.notifications.userId} = ${sara.user.id} and ${schema.notifications.type} = 'request.delivered' and ${schema.notifications.params}->>'ref' = ${r.publicRef}`);
    expect(inApp).toHaveLength(1);
    const emails = await systemDb().select().from(schema.notificationDeliveries).where(sql`${schema.notificationDeliveries.userId} = ${sara.user.id} and template = 'request.delivered' and channel = 'email' and idempotency_key like ${"request.delivered:" + r.id + ":v1%"}`);
    expect(emails).toHaveLength(1);
    expect(emails[0].status).toBe("sent");
    // The non-approver Cedar contact (Maya) is not the requester → no delivery notice.
    const maya = await as("maya@cedar.test", "north-studio");
    const mayaN = await systemDb().select().from(schema.notifications).where(sql`${schema.notifications.userId} = ${maya.user.id} and ${schema.notifications.params}->>'ref' = ${r.publicRef}`);
    expect(mayaN).toHaveLength(0);
    // River never hears about Cedar's delivery.
    const adam = await as("adam@river.test", "north-studio");
    const adamN = await systemDb().select().from(schema.notifications).where(sql`${schema.notifications.userId} = ${adam.user.id} and ${schema.notifications.params}->>'ref' = ${r.publicRef}`);
    expect(adamN).toHaveLength(0);
    row = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(row.status).toBe("delivered");
  });

  it("approval is bound to a version: stale decisions are rejected, revisions go back to work", async () => {
    const r = await newRequest("Approval flow");
    const karim = await as("karim@northstudio.test", "north-studio");
    const sara = await as("sara@cedar.test", "north-studio");
    const maya = await as("maya@cedar.test", "north-studio");
    await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedFlexible: "on" });
    const d1 = await delivery.deliverRequest(karim, r.id, { title: "V1", note: "first", requestApproval: "on" });
    // Maya is a Cedar contact without approval rights.
    await expectCode(delivery.decideApproval(maya, { approvalId: d1.approvalId, version: 1, decision: "approved" }), "forbidden");
    await expectCode(delivery.decideApproval(sara, { approvalId: d1.approvalId, version: 2, decision: "approved" }), "stale_version");
    await expectCode(delivery.decideApproval(sara, { approvalId: d1.approvalId, version: 1, decision: "changes_requested" }), "reason_required");
    await delivery.decideApproval(sara, { approvalId: d1.approvalId, version: 1, decision: "changes_requested", note: "Bigger logo" });
    let row = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(row.status).toBe("in_progress");
    const d2 = await delivery.deliverRequest(karim, r.id, { title: "V2", note: "second", requestApproval: "on" });
    expect(d2.deliverable.version).toBe(2);
    // The old approval link can no longer change anything.
    await expectCode(delivery.decideApproval(sara, { approvalId: d1.approvalId, version: 1, decision: "approved" }), "stale_version");
    await delivery.decideApproval(sara, { approvalId: d2.approvalId, version: 2, decision: "approved" });
    const [v1] = await systemDb().select().from(schema.deliverables).where(sql`request_id = ${r.id} and version = 1`);
    expect(v1.status).toBe("changes_requested");
    row = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(row.status).toBe("delivered");
  });

  it("commitment changes need a reason and are visible + notified", async () => {
    const r = await newRequest("Commitment change");
    const karim = await as("karim@northstudio.test", "north-studio");
    await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedDueDate: "2030-02-01" });
    await expectCode(requests.changeCommitment(karim, r.id, { committedDueDate: "2030-02-10" }), "invalid");
    await requests.changeCommitment(karim, r.id, { committedDueDate: "2030-02-10", reason: "Printer delay" });
    expect(await outbox("request.commitment_changed", r.id)).toHaveLength(1);
    const sara = await as("sara@cedar.test", "north-studio");
    const c = await requests.getRequestForClient(sara, r.publicRef);
    expect(c.committedDueDate).toBe("2030-02-10");
    expect(c.messages.some((m) => m.body === "Printer delay")).toBe(true);
  });

  it("one request can carry several tasks and an external dependency without new client tickets", async () => {
    const r = await newRequest("Multi task");
    const karim = await as("karim@northstudio.test", "north-studio");
    await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedFlexible: "on" });
    for (const title of ["Copy", "Design", "QA"]) await tasks.createTask(karim, { title, requestId: r.id });
    await deps.createDependency(karim, { requestId: r.id, title: "Print quote", partyType: "external", partyName: "PrintCo", blocking: "on" });
    const sara = await as("sara@cedar.test", "north-studio");
    const mine = await requests.listRequests(sara);
    expect(mine.filter((x) => x.title === "Multi task")).toHaveLength(1);
    expect(await tasks.listTasks(karim, { requestId: r.id })).toHaveLength(3);
  });

  it("an email provider failure never rolls back the business change and retries without duplicates", async () => {
    const r = await newRequest("Provider failure");
    const karim = await as("karim@northstudio.test", "north-studio");
    process.env.MOCK_EMAIL_FAIL = "1";
    await requests.acceptRequest(karim, r.id, { ownerId: karim.user.id, committedFlexible: "on" });
    await processOutbox(200);
    await processDeliveries(200);
    delete process.env.MOCK_EMAIL_FAIL;
    const row = (await systemDb().select().from(schema.requests).where(sql`id = ${r.id}`))[0];
    expect(row.status).toBe("accepted");
    const sara = await as("sara@cedar.test", "north-studio");
    const pending = await systemDb().select().from(schema.notificationDeliveries).where(sql`user_id = ${sara.user.id} and template = 'request.accepted' and idempotency_key like ${"request.accepted:" + r.id + "%"}`);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("failed");
    await systemDb().update(schema.notificationDeliveries).set({ nextAttemptAt: new Date(0) }).where(sql`id = ${pending[0].id}`);
    await processDeliveries(200);
    await processDeliveries(200);
    const after = await systemDb().select().from(schema.notificationDeliveries).where(sql`id = ${pending[0].id}`);
    expect(after[0].status).toBe("sent");
    expect(after[0].attempts).toBe(2);
  });
});

describe("simple work mode", () => {
  it("tasks work without requests; request features are refused", async () => {
    const dana = await as("dana@smallteam.test", "small-team");
    const t = await tasks.createTask(dana, { title: "Standalone task" });
    await tasks.updateTask(dana, t.id, { status: "done" });
    await expectCode(requests.submitRequest(dana, { title: "x", objective: "y" }), "requests_disabled");
    await expectCode(requests.listRequests(dana), "requests_disabled");
  });
});
