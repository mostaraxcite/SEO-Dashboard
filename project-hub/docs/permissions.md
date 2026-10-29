# Permissions matrix

Enforced in `src/server/authz.ts` + services, and again by Postgres RLS (`drizzle/0001_security.sql`).

| Action / data | Owner/Admin | Manager | Member | Guest | Client contact (same org) | Other client / tenant |
|---|---|---|---|---|---|---|
| Workspace settings, team invites, roles | Yes | — | — | — | — | Never |
| Invite client contacts | Yes | Yes | — | — | — | Never |
| See all projects / tasks | Yes | Yes | Workspace-visible projects + own/assigned | Explicit, unexpired project membership | Never | Never |
| Create/edit tasks | Yes | Yes | Within visible scope | Within member projects | Never | Never |
| Read internal notes, tasks, dependencies | Yes | Yes | Within scope | Within scope | **Never** (RLS: staff-only tables) | Never |
| Read client-visible request, public conversation, delivered files | Yes | Yes | Owned / assigned / linked project | — | Own client org only | Never |
| Triage (accept / decline / commit date) | Yes | Yes | — | — | — | Never |
| Ask for info, reply publicly | Yes | Yes | If request owner | — | Reply/answer | Never |
| Change commitment, move status | Yes | Yes | If request owner | — | — | Never |
| **Deliver** | Yes | Yes | If request owner (unless "managers only" is on) | — | — | Never |
| Approve / request changes | — | — | — | — | Contacts with "can approve" | Never |
| Reports, CSV export | Yes | Yes | — | — | — | Never |
| AI: Summarize | Own visible data | Same | Same | Same | Own org's public data only | Never |
| AI: Improve brief | Yes | Yes | Yes | — | If enabled for requesters | Never |
| AI: Suggest tasks / What's next | Yes | Yes | Within scope (apply needs work rights) | Within scope | — | Never |
| Files | Signed URL bound to user + re-checked visibility | | | | Client-visible files of own org | Never |
