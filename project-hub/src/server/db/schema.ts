import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  date,
  numeric,
  index,
  unique,
  uniqueIndex,
  foreignKey,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/*
 * Conventions
 * - Every tenant-owned table has `tenant_id` and a UNIQUE (tenant_id, id) so other
 *   tables can reference it with a composite foreign key. That makes cross-tenant
 *   references impossible at the database level.
 * - Row-Level Security policies live in drizzle/0001_security.sql.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export type TenantMode = "simple" | "requests";
export type TenantKind = "agency" | "internal" | "team";
export type Role = "owner" | "admin" | "manager" | "member" | "client" | "guest";

export type TenantTheme = {
  brandColor?: string | null;
  logoFileId?: string | null;
  displayName?: string | null;
  welcomeEn?: string | null;
  welcomeAr?: string | null;
  emailFromDisplay?: string | null;
};
export type TenantFeatures = {
  sla: boolean;
  approvals: boolean;
  sms: boolean;
  requireApprovalToDeliver: boolean;
  reviewWindowDays: number;
};

// ─── Identity ────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    locale: text("locale").notNull().default("en"),
    theme: text("theme").notNull().default("system"),
    phoneE164: text("phone_e164"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull(), // magic_link | invite
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role"),
    clientOrgId: uuid("client_org_id"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    redirectTo: text("redirect_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_email_idx").on(t.email)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ─── Tenancy ─────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  mode: text("mode").$type<TenantMode>().notNull().default("simple"),
  kind: text("kind").$type<TenantKind>().notNull().default("team"),
  timezone: text("timezone").notNull().default("UTC"),
  defaultLocale: text("default_locale").notNull().default("en"),
  theme: jsonb("theme").$type<TenantTheme>().notNull().default({}),
  features: jsonb("features")
    .$type<TenantFeatures>()
    .notNull()
    .default({ sla: false, approvals: true, sms: false, requireApprovalToDeliver: false, reviewWindowDays: 7 }),
  requestPrefix: text("request_prefix").notNull().default("REQ"),
  nextRequestNumber: integer("next_request_number").notNull().default(1001),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    title: text("title"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("memberships_tenant_user").on(t.tenantId, t.userId), unique().on(t.tenantId, t.id)],
);

export const clientOrganizations = pgTable(
  "client_organizations",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<"external" | "department">().notNull().default("external"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.tenantId, t.id), unique("client_org_name").on(t.tenantId, t.name)],
);

/** Client membership is separate from tenant membership. One client org per user per tenant. */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    canApprove: boolean("can_approve").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("client_contacts_tenant_user").on(t.tenantId, t.userId),
    foreignKey({ columns: [t.tenantId, t.clientOrgId], foreignColumns: [clientOrganizations.tenantId, clientOrganizations.id] }).onDelete("cascade"),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.tenantId, t.id), unique("teams_name").on(t.tenantId, t.name)],
);

// ─── Work ────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<"planned" | "active" | "on_hold" | "completed" | "archived">().notNull().default("active"),
    /** workspace: all staff (not guests) can see it; members: only project members + managers. */
    access: text("access").$type<"workspace" | "members">().notNull().default("workspace"),
    targetDate: date("target_date"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("projects_tenant_status").on(t.tenantId, t.status),
    index("projects_tenant_client").on(t.tenantId, t.clientOrgId),
    foreignKey({ columns: [t.tenantId, t.clientOrgId], foreignColumns: [clientOrganizations.tenantId, clientOrganizations.id] }),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    foreignKey({ columns: [t.tenantId, t.projectId], foreignColumns: [projects.tenantId, projects.id] }).onDelete("cascade"),
  ],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    labelEn: text("label_en").notNull(),
    labelAr: text("label_ar").notNull(),
    helpEn: text("help_en").notNull().default(""),
    helpAr: text("help_ar").notNull().default(""),
    icon: text("icon").notNull().default("circle"),
    position: integer("position").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    fields: jsonb("fields").$type<CategoryField[]>().notNull().default([]),
    defaultOwnerId: uuid("default_owner_id").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.tenantId, t.id), unique("service_categories_key").on(t.tenantId, t.key)],
);

export type CategoryField = {
  key: string;
  type: "text" | "select" | "date";
  labelEn: string;
  labelAr: string;
  options?: { value: string; labelEn: string; labelAr: string }[];
  required?: boolean;
  /** One-level conditional visibility: show when another field equals a value. */
  showWhen?: { field: string; equals: string } | null;
};

export type InternalRequestStatus =
  | "new"
  | "triage"
  | "needs_info"
  | "accepted"
  | "declined"
  | "in_progress"
  | "in_review"
  | "ready_to_deliver"
  | "delivered"
  | "closed";

export const requests = pgTable(
  "requests",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    publicRef: text("public_ref").notNull(),
    clientOrgId: uuid("client_org_id"),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    categoryId: uuid("category_id"),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    details: text("details").notNull().default(""),
    linkUrl: text("link_url"),
    requestedDueDate: date("requested_due_date"),
    requestedFlexible: boolean("requested_flexible").notNull().default(false),
    committedDueDate: date("committed_due_date"),
    committedFlexible: boolean("committed_flexible").notNull().default(false),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id"),
    projectId: uuid("project_id"),
    priority: text("priority").$type<"normal" | "high">().notNull().default("normal"),
    status: text("status").$type<InternalRequestStatus>().notNull().default("new"),
    pendingQuestion: text("pending_question"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    formSnapshot: jsonb("form_snapshot").$type<{ categoryKey: string | null; categoryVersion: number | null; fields: CategoryField[] }>(),
    declineReasonPublic: text("decline_reason_public"),
    declineReasonInternal: text("decline_reason_internal"),
    revision: integer("revision").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reviewWindowEndsAt: timestamp("review_window_ends_at", { withTimezone: true }),
    reopenedCount: integer("reopened_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    unique("requests_number").on(t.tenantId, t.number),
    index("requests_tenant_status").on(t.tenantId, t.status),
    index("requests_tenant_client").on(t.tenantId, t.clientOrgId),
    index("requests_requester").on(t.tenantId, t.requesterId),
    foreignKey({ columns: [t.tenantId, t.clientOrgId], foreignColumns: [clientOrganizations.tenantId, clientOrganizations.id] }),
    foreignKey({ columns: [t.tenantId, t.categoryId], foreignColumns: [serviceCategories.tenantId, serviceCategories.id] }),
    foreignKey({ columns: [t.tenantId, t.projectId], foreignColumns: [projects.tenantId, projects.id] }),
    foreignKey({ columns: [t.tenantId, t.teamId], foreignColumns: [teams.tenantId, teams.id] }),
  ],
);

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    requestId: uuid("request_id"),
    parentTaskId: uuid("parent_task_id"),
    clientOrgId: uuid("client_org_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    teamLabel: text("team_label"),
    dueDate: date("due_date"),
    position: integer("position").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("tasks_tenant_assignee").on(t.tenantId, t.assigneeId, t.status),
    index("tasks_tenant_project").on(t.tenantId, t.projectId),
    index("tasks_tenant_request").on(t.tenantId, t.requestId),
    foreignKey({ columns: [t.tenantId, t.projectId], foreignColumns: [projects.tenantId, projects.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }),
    foreignKey({ columns: [t.tenantId, t.parentTaskId], foreignColumns: [t.tenantId, t.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.clientOrgId], foreignColumns: [clientOrganizations.tenantId, clientOrganizations.id] }),
  ],
);

/** Client-visible conversation on a request. Separate table from internal notes by design. */
export const publicMessages = pgTable(
  "public_messages",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    requestId: uuid("request_id").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorKind: text("author_kind").$type<"staff" | "client" | "system">().notNull(),
    kind: text("kind").$type<"message" | "question" | "answer" | "update">().notNull().default("message"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("public_messages_request").on(t.tenantId, t.requestId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
  ],
);

/** Staff-only notes on tasks and requests. Never readable in client context (RLS). */
export const internalComments = pgTable(
  "internal_comments",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id"),
    taskId: uuid("task_id"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("internal_comments_task").on(t.tenantId, t.taskId, t.createdAt),
    index("internal_comments_request").on(t.tenantId, t.requestId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.taskId], foreignColumns: [tasks.tenantId, tasks.id] }).onDelete("cascade"),
  ],
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    requestId: uuid("request_id").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    linkUrl: text("link_url"),
    status: text("status").$type<"draft" | "delivered" | "approved" | "changes_requested" | "superseded">().notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deliveredBy: uuid("delivered_by").references(() => users.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    unique("deliverables_version").on(t.requestId, t.version),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    requestId: uuid("request_id"),
    taskId: uuid("task_id"),
    projectId: uuid("project_id"),
    deliverableId: uuid("deliverable_id"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    visibility: text("visibility").$type<"internal" | "client">().notNull().default("internal"),
    scanState: text("scan_state").$type<"pending" | "clean" | "infected" | "error">().notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("attachments_request").on(t.tenantId, t.requestId),
    index("attachments_task").on(t.tenantId, t.taskId),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.taskId], foreignColumns: [tasks.tenantId, tasks.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.projectId], foreignColumns: [projects.tenantId, projects.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.deliverableId], foreignColumns: [deliverables.tenantId, deliverables.id] }).onDelete("cascade"),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    requestId: uuid("request_id").notNull(),
    deliverableId: uuid("deliverable_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<"pending" | "approved" | "changes_requested" | "superseded">().notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("approvals_request").on(t.tenantId, t.requestId),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.deliverableId], foreignColumns: [deliverables.tenantId, deliverables.id] }).onDelete("cascade"),
  ],
);

export const dependencies = pgTable(
  "dependencies",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id"),
    taskId: uuid("task_id"),
    title: text("title").notNull(),
    partyType: text("party_type").$type<"team" | "department" | "client" | "external">().notNull(),
    partyName: text("party_name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    impact: text("impact").notNull().default(""),
    blocking: boolean("blocking").notNull().default(true),
    status: text("status").$type<"open" | "resolved" | "cancelled">().notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    index("dependencies_request").on(t.tenantId, t.requestId),
    index("dependencies_task").on(t.tenantId, t.taskId),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.taskId], foreignColumns: [tasks.tenantId, tasks.id] }).onDelete("cascade"),
  ],
);

/** Human-readable timeline. `public` rows are shown to the request's client. */
export const activity = pgTable(
  "activity",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    requestId: uuid("request_id"),
    taskId: uuid("task_id"),
    projectId: uuid("project_id"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    visibility: text("visibility").$type<"public" | "internal">().notNull().default("internal"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_request").on(t.tenantId, t.requestId, t.createdAt),
    index("activity_task").on(t.tenantId, t.taskId, t.createdAt),
    index("activity_project").on(t.tenantId, t.projectId, t.createdAt),
  ],
);

/** Immutable security/audit trail. UPDATE/DELETE blocked by trigger. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_tenant_created").on(t.tenantId, t.createdAt)],
);

// ─── Notifications ───────────────────────────────────────────────────────

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    actorId: uuid("actor_id"),
    status: text("status").$type<"pending" | "processing" | "done" | "dead">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("outbox_pending").on(t.status, t.nextAttemptAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    type: text("type").notNull(),
    params: jsonb("params").$type<Record<string, string | null>>().notNull().default({}),
    href: text("href").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("notifications_event_user").on(t.eventId, t.userId), index("notifications_user").on(t.tenantId, t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    channel: text("channel").$type<"in_app" | "email" | "sms">().notNull(),
    mode: text("mode").$type<"immediate" | "digest" | "off">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId, t.eventType, t.channel] })],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"email" | "sms">().notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    template: text("template").notNull(),
    params: jsonb("params").$type<Record<string, string | null>>().notNull().default({}),
    status: text("status").$type<"queued" | "sending" | "sent" | "failed" | "dead" | "skipped" | "digest_pending">().notNull().default("queued"),
    skipReason: text("skip_reason"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    segments: integer("segments"),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }),
    consentSnapshot: jsonb("consent_snapshot").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("deliveries_pending").on(t.status, t.nextAttemptAt), index("deliveries_tenant").on(t.tenantId, t.createdAt)],
);

export const smsConsents = pgTable(
  "sms_consents",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    purpose: text("purpose").notNull().default("transactional"),
    source: text("source").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sms_consents_user").on(t.tenantId, t.userId)],
);

export type SmsSettings = {
  enabled: boolean;
  provider: "mock" | "none";
  senderId: string | null;
  allowedEvents: string[];
  monthlySegmentQuota: number;
  costPerSegmentUsd: number;
  recipientCooldownMinutes: number;
  quietHoursStart: number; // minutes from midnight, tenant tz
  quietHoursEnd: number;
};

export const notificationSettings = pgTable("notification_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  sms: jsonb("sms")
    .$type<SmsSettings>()
    .notNull()
    .default({
      enabled: false,
      provider: "none",
      senderId: null,
      allowedEvents: ["request.delivered", "approval.requested"],
      monthlySegmentQuota: 0,
      costPerSegmentUsd: 0.05,
      recipientCooldownMinutes: 60,
      quietHoursStart: 21 * 60,
      quietHoursEnd: 8 * 60,
    }),
  updatedAt: updatedAt(),
});

/** Development-only sink for mock email and SMS so demos are inspectable. */
export const devMessages = pgTable("dev_messages", {
  id: id(),
  tenantId: uuid("tenant_id"),
  channel: text("channel").notNull(),
  to: text("to").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ─── SLA ─────────────────────────────────────────────────────────────────

export const slaPolicies = pgTable("sla_policies", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  firstResponseMinutes: integer("first_response_minutes").notNull().default(540),
  triageMinutes: integer("triage_minutes").notNull().default(1080),
  warnAtPercent: integer("warn_at_percent").notNull().default(75),
  pauseTriageOnNeedsInfo: boolean("pause_triage_on_needs_info").notNull().default(true),
  updatedAt: updatedAt(),
});

export const businessCalendars = pgTable("business_calendars", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull(),
  workDays: jsonb("work_days").$type<number[]>().notNull(), // ISO weekday 1=Mon … 7=Sun
  startMinute: integer("start_minute").notNull().default(8 * 60),
  endMinute: integer("end_minute").notNull().default(17 * 60),
  holidays: jsonb("holidays").$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

export const slaInstances = pgTable(
  "sla_instances",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    metric: text("metric").$type<"first_response" | "triage">().notNull(),
    targetMinutes: integer("target_minutes").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedBusinessMinutes: integer("paused_business_minutes").notNull().default(0),
    metAt: timestamp("met_at", { withTimezone: true }),
    breachedAt: timestamp("breached_at", { withTimezone: true }),
    warnedAt: timestamp("warned_at", { withTimezone: true }),
    status: text("status").$type<"running" | "paused" | "met" | "breached">().notNull().default("running"),
  },
  (t) => [
    unique("sla_request_metric").on(t.requestId, t.metric),
    index("sla_running").on(t.status),
    foreignKey({ columns: [t.tenantId, t.requestId], foreignColumns: [requests.tenantId, requests.id] }).onDelete("cascade"),
  ],
);

// ─── AI ──────────────────────────────────────────────────────────────────

export type AiFeature = "summarize" | "improve_brief" | "suggest_tasks" | "next_steps";

export const aiSettings = pgTable("ai_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  features: jsonb("features")
    .$type<Record<AiFeature, boolean>>()
    .notNull()
    .default({ summarize: true, improve_brief: true, suggest_tasks: true, next_steps: true }),
  clientsMayUse: boolean("clients_may_use").notNull().default(true),
  monthlyActionLimit: integer("monthly_action_limit").notNull().default(500),
  monthlySpendCapUsd: numeric("monthly_spend_cap_usd", { precision: 10, scale: 2 }).notNull().default("25"),
  perUserHourlyLimit: integer("per_user_hourly_limit").notNull().default(30),
  includeAttachmentNames: boolean("include_attachment_names").notNull().default(true),
  updatedAt: updatedAt(),
});

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    actorId: uuid("actor_id").notNull(),
    feature: text("feature").$type<AiFeature>().notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    sourceRevision: text("source_revision"),
    inputDigest: text("input_digest").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").$type<"ok" | "cached" | "error" | "rejected">().notNull(),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_runs_tenant_created").on(t.tenantId, t.createdAt), index("ai_runs_actor").on(t.actorId, t.createdAt)],
);

export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    runId: uuid("run_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    feature: text("feature").$type<AiFeature>().notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    sourceRevision: text("source_revision"),
    inputDigest: text("input_digest").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"draft" | "applied" | "discarded">().notNull().default("draft"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("ai_drafts_digest").on(t.tenantId, t.feature, t.inputDigest)],
);

// Brand kits — schema prepared for P1/P2; no UI in the first release.
export const brandKits = pgTable(
  "brand_kits",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    clientOrgId: uuid("client_org_id"),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"draft" | "approved">().notNull().default("draft"),
    voice: text("voice").notNull().default(""),
    approvedBy: uuid("approved_by"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.clientOrgId], foreignColumns: [clientOrganizations.tenantId, clientOrganizations.id] }),
  ],
);

export const brandAssets = pgTable(
  "brand_assets",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    brandKitId: uuid("brand_kit_id").notNull(),
    fileId: uuid("file_id"),
    kind: text("kind").notNull(),
    licenseNote: text("license_note").notNull().default(""),
    approved: boolean("approved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [foreignKey({ columns: [t.tenantId, t.brandKitId], foreignColumns: [brandKits.tenantId, brandKits.id] }).onDelete("cascade")],
);

export const brandRules = pgTable(
  "brand_rules",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    brandKitId: uuid("brand_kit_id").notNull(),
    ruleType: text("rule_type").notNull(),
    ruleValue: text("rule_value").notNull(),
    sourceRef: text("source_ref"),
    verifiedBy: uuid("verified_by"),
    createdAt: createdAt(),
  },
  (t) => [foreignKey({ columns: [t.tenantId, t.brandKitId], foreignColumns: [brandKits.tenantId, brandKits.id] }).onDelete("cascade")],
);

export const entitlements = pgTable(
  "entitlements",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
