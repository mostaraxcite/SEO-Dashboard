import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { systemDb, schema } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Development-only view of mock email/SMS. Disabled in production unless explicitly enabled. */
export default async function DevMailbox() {
  if (!env.devToolsEnabled) notFound();
  const rows = await systemDb().select().from(schema.devMessages).orderBy(desc(schema.devMessages.createdAt)).limit(60);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold">Mock mailbox (development)</h1>
      <p className="mb-6 text-sm text-muted">Email and SMS sent by the mock providers. Nothing here left the server.</p>
      <ul className="space-y-3">
        {rows.map((m) => (
          <li key={m.id} className="rounded-lg border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded bg-neutral-soft px-1.5 py-0.5 font-medium uppercase">{m.channel}</span>
              <span dir="ltr">{m.to}</span>
              <span className="ms-auto">{m.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</span>
            </div>
            {m.subject ? <p className="mt-1.5 font-medium" dir="auto">{m.subject}</p> : null}
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-fg-2" dir="auto">
              {linkify(m.body)}
            </pre>
          </li>
        ))}
      </ul>
    </main>
  );
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")} className="text-accent underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
