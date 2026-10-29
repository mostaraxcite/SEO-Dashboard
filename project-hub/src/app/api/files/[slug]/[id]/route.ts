import { NextResponse, type NextRequest } from "next/server";
import { resolveActor } from "@/server/context";
import { loadReadableAttachment, verifyFileSignature } from "@/server/services/files";
import { storage } from "@/server/storage";
import { AppError } from "@/server/errors";

/**
 * Signed, short-lived, user-bound download. The signature alone is not enough:
 * the session must belong to the same user and the attachment is re-checked under RLS.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const actor = await resolveActor(slug);
  const sp = req.nextUrl.searchParams;
  if (!actor || !/^[0-9a-f-]{36}$/.test(id) || !verifyFileSignature(id, actor.user.id, sp.get("exp"), sp.get("sig"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const a = await loadReadableAttachment(actor, id);
    const body = await storage().read(a.storageKey);
    const inline = a.mime.startsWith("image/") || a.mime === "application/pdf";
    return new NextResponse(body, {
      headers: {
        "Content-Type": a.mime,
        "Content-Length": String(a.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
