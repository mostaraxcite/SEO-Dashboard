# Project Hub — Implementation plan & architecture decisions

Source of truth: the Master Build Specification (Oct 2026) plus the "Mandatory Design Direction" brief.
This file records what exists, what is built, the key decisions, and what is blocked.

## 0. Repository audit (M0)

- The repository `mostaraxcite/SEO-Dashboard` contained an unrelated SEO ETL/React dashboard.
  Project Hub is a **greenfield app in `project-hub/`**; the legacy folders are untouched.
- Tooling available: Node 22, npm 10, PostgreSQL 16, Chromium + Playwright.
- No existing schema, auth, or deployment config to respect.

## 1. Stack (ADR-001)

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 16 App Router, React 19, TypeScript strict | Spec default; server components keep data and authorization on the server |
| DB | PostgreSQL 16 + Drizzle ORM + SQL migrations | Typed queries, readable SQL migrations, RLS-friendly |
| Isolation | App-layer authorization **and** Postgres Row-Level Security | Defense in depth (see §3) |
| UI | Tailwind CSS v4 tokens + Radix primitives + Lucide | Accessible primitives, our own visual identity |
| Fonts | IBM Plex Sans + IBM Plex Sans Arabic (OFL, self-hosted via @fontsource) | Licensed for redistribution; no runtime Google calls |
| Validation | Zod 4 on every action and every AI output | |
| Auth | First-party session auth: scrypt passwords for staff, single-use magic links for everyone, invite tokens | No vendor lock-in; SSO/Entra adapter is a later, per-tenant config |
| Jobs | Transactional outbox table + worker (`FOR UPDATE SKIP LOCKED`), idempotency keys, backoff, dead letter | Notification failure never rolls back business state |
| Files | Private storage driver (local disk in dev; S3-compatible interface) + HMAC-signed, short-lived download URLs re-checked against permissions | |
| AI | Server-only `AiProvider` interface: deterministic **mock** (default) + Anthropic adapter enabled only with an approved key | Provider-neutral, testable offline |
| Email / SMS | `EmailProvider` (mock mailbox, SMTP) and `SmsProvider` (mock only) | Live sending requires verified senders — not claimed |
| Tests | Vitest integration tests on a real Postgres; Playwright for screenshots/E2E | |

The user's design brief overrides the PRD's "Inter + indigo" suggestion: Deep Ink `#273A37`, Clay `#9D573F`, Warm Canvas `#F7F6F2`, IBM Plex.

## 2. Domain decisions

- Request ≠ Project ≠ Task ≠ Approval ≠ Dependency ≠ Deliverable — each is its own table.
- Task `done` never delivers. Only `deliverRequest()` (authorized role, versioned deliverable) emits `request.delivered`.
- Requested due date and committed due date are separate columns; committed changes need a reason and are audited.
- Public conversation (`public_messages`) and internal notes (`internal_comments`) are **separate tables**, so nothing becomes public by toggling a checkbox. Clients cannot `SELECT` internal tables at the database level.
- Client organization ≠ tenant. Internal-mode tenants label client organizations "Departments".
- Tenant modes: `simple` (projects/tasks only) and `requests` (portal, inbox, clients, approvals). Optional SLA and SMS are feature flags.

## 3. Security model

- Tenant is resolved from the URL slug **and** a server-checked membership. `tenant_id` is never read from form input.
- Three DB settings per transaction: `app.tenant_id`, `app.user_id`, `app.client_org_id`. RLS policies:
  - every tenant table: `tenant_id = app.tenant_id`;
  - client contacts: only their own client org rows; staff-only tables (tasks, internal comments, dependencies, projects, SLA, AI runs, audit) return nothing.
- The app connects as `projecthub_app` (no BYPASSRLS, not table owner). Migrations, auth bootstrap and the worker use the owner role.
- Cross-object foreign keys are composite `(tenant_id, id)` so a row can never point to another tenant's row.
- Sessions: 32-byte random token in an httpOnly SameSite=Lax cookie; only its SHA-256 is stored. Magic-link and invite tokens are single-use, hashed, expiring; magic links need a POST confirm (mail scanners can't consume them).
- Invites bind email, tenant, role and client org server-side; editing hidden fields cannot change them.
- Rate limits on login, magic links, AI actions. Immutable `audit_logs` (trigger blocks UPDATE/DELETE).
- Uploads: size cap, MIME sniffing allowlist, scan state (mock scanner) before staff download/AI extraction.

## 4. AI design

- Four P0 features: Summarize, Improve brief, Suggest tasks, Next steps. Explicit click only, no chat.
- Context is built server-side from data **the invoking actor can read** (same queries as the UI, under RLS). Untrusted text is wrapped as data; the system prompt forbids following embedded instructions; the model has no tools.
- Outputs are validated with Zod (one retry), stored as `ai_drafts`, and never applied automatically. Apply goes through the same service functions as manual edits, with a stale-revision check.
- `ai_runs` logs actor, feature, model, prompt version, tokens, estimated cost and status — not the source text.
- Per-tenant toggle per feature, monthly action limit, spend cap and per-user hourly limit. Cached by context digest.

## 5. Milestones

| Milestone | Scope |
|---|---|
| M1 | Auth, workspaces, memberships, RLS, design system, AppShell, projects/tasks/subtasks/comments/files, AI skeleton + mock |
| Design gate | Dashboard (My Work), Task detail with AI, Client portal — AR/EN, light/dark, mobile |
| M2 | 5-field intake, Improve brief, My requests, Inbox triage, accept/needs-info/decline, Suggest tasks → Review & create |
| M3 | Deliverables (versioned), explicit Deliver, approvals/revisions, in-app + email via outbox |
| M4 | Service presets, SLA business calendar, dependencies, reports + CSV, SMS mock with consent/quota/cooldown gates |
| M5 | Isolation/IDOR/prompt-injection tests, Playwright E2E, docs, backup/restore |

## 6. Blocked / needs owner decision

- AI provider key + vendor terms/data-processing approval (mock used until then).
- Email provider, verified sending domain (mock mailbox until then).
- SMS provider, Saudi sender registration, consent policy (mock only; no live SMS claimed).
- Jazeera logo/brand files and Arboria font licence; legal authorization for a production Jazeera tenant. The pilot tenant uses the confirmed colors and a text monogram only.
- Production hosting, data residency, retention policy, PDPL review.
- Product name/domain (working name "Project Hub").
