import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withScope, schema, type Tx } from "../db";
import type { Actor } from "../context";
import { storage } from "../storage";
import { AppError, notFound } from "../errors";
import { hmac, safeEqual } from "../auth/crypto";
import { env } from "../env";
import { projectVisible, requestVisible, taskVisible } from "../authz";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const signatures: { mime: string; ext: string[]; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: ["pdf"], test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: ["png"], test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: ["gif"], test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { mime: "image/webp", ext: ["webp"], test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "video/mp4", ext: ["mp4", "mov"], test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  {
    mime: "application/vnd.openxmlformats-officedocument",
    ext: ["docx", "xlsx", "pptx"],
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  { mime: "application/zip", ext: ["zip"], test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: "text/plain", ext: ["txt", "csv", "md"], test: (b) => !b.subarray(0, 4096).includes(0) },
];

const officeMime: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  md: "text/markdown",
};

/** Content sniffing + extension agreement. Unknown or mismatched types are rejected. */
export function detectFileType(filename: string, data: Buffer): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  for (const s of signatures) {
    if (s.ext.includes(ext) && s.test(data)) return officeMime[ext] ?? s.mime;
  }
  throw new AppError("invalid", "file_type");
}

/** Placeholder scanner: marks files clean. Swap for ClamAV/vendor scanning before production. */
async function scan(data: Buffer): Promise<"clean" | "infected"> {
  return data.length >= 0 ? "clean" : "infected";
}

export type IncomingFile = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

export function isFile(v: unknown): v is IncomingFile {
  return typeof v === "object" && v !== null && "arrayBuffer" in v && "name" in v && typeof (v as IncomingFile).size === "number" && (v as IncomingFile).size > 0;
}

/** Validates and stores files outside the DB transaction; returns metadata to insert inside it. */
export async function prepareUploads(tenantId: string, files: IncomingFile[]) {
  const out: { filename: string; mime: string; size: number; storageKey: string; sha256: string; scanState: "clean" | "infected" }[] = [];
  for (const f of files.slice(0, 10)) {
    if (f.size > MAX_UPLOAD_BYTES) throw new AppError("invalid", "file_too_large");
    const data = Buffer.from(await f.arrayBuffer());
    const filename = f.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180) || "file";
    const mime = detectFileType(filename, data);
    const scanState = await scan(data);
    if (scanState !== "clean") throw new AppError("invalid", "file_type");
    const storageKey = await storage().put(tenantId, data);
    out.push({ filename, mime, size: data.length, storageKey, sha256: createHash("sha256").update(data).digest("hex"), scanState });
  }
  return out;
}

export async function insertAttachments(
  tx: Tx,
  actor: Actor,
  prepared: Awaited<ReturnType<typeof prepareUploads>>,
  link: { requestId?: string | null; taskId?: string | null; projectId?: string | null; deliverableId?: string | null; clientOrgId?: string | null; visibility: "internal" | "client" },
) {
  if (!prepared.length) return [];
  return tx
    .insert(schema.attachments)
    .values(
      prepared.map((p) => ({
        tenantId: actor.tenant.id,
        clientOrgId: link.clientOrgId ?? null,
        requestId: link.requestId ?? null,
        taskId: link.taskId ?? null,
        projectId: link.projectId ?? null,
        deliverableId: link.deliverableId ?? null,
        uploadedBy: actor.user.id,
        visibility: link.visibility,
        ...p,
      })),
    )
    .returning();
}

/** Short-lived, user-bound signed URL. The route re-checks permissions anyway. */
export function signedFileUrl(slug: string, fileId: string, userId: string, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(env.appSecret, `${fileId}:${userId}:${exp}`);
  return `/api/files/${encodeURIComponent(slug)}/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(fileId: string, userId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmac(env.appSecret, `${fileId}:${userId}:${exp}`), sig);
}

/** Loads an attachment only if the actor may read it (RLS + parent visibility). */
export async function loadReadableAttachment(actor: Actor, fileId: string) {
  return withScope(actor.scope, async (tx) => {
    const [a] = await tx.select().from(schema.attachments).where(eq(schema.attachments.id, fileId)).limit(1);
    if (!a || a.scanState !== "clean") throw notFound();
    if (actor.isStaff) {
      const checks: Promise<unknown[]>[] = [];
      if (a.taskId) checks.push(tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, a.taskId), taskVisible(actor))));
      if (a.requestId) checks.push(tx.select({ id: schema.requests.id }).from(schema.requests).where(and(eq(schema.requests.id, a.requestId), requestVisible(actor))));
      if (a.projectId) checks.push(tx.select({ id: schema.projects.id }).from(schema.projects).where(and(eq(schema.projects.id, a.projectId), projectVisible(actor))));
      const isLogo = actor.tenant.theme.logoFileId === a.id;
      if (!isLogo) {
        if (!checks.length) throw notFound();
        const results = await Promise.all(checks);
        if (results.some((r) => r.length === 0)) throw notFound();
      }
    } else if (!a.requestId) {
      throw notFound();
    }
    return a;
  });
}
