import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { resolveActor } from "@/server/context";
import { systemDb, schema } from "@/server/db";
import { storage } from "@/server/storage";

/** Workspace logo for any member of that workspace (staff or client). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await resolveActor(slug);
  const fileId = actor?.tenant.theme.logoFileId;
  if (!actor || !fileId) return new NextResponse("Not found", { status: 404 });
  const [a] = await systemDb()
    .select()
    .from(schema.attachments)
    .where(and(eq(schema.attachments.id, fileId), eq(schema.attachments.tenantId, actor.tenant.id), eq(schema.attachments.scanState, "clean")));
  if (!a || !a.mime.startsWith("image/")) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await storage().read(a.storageKey), {
    headers: { "Content-Type": a.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
