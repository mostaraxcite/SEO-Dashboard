import { NextResponse } from "next/server";
import { resolveActor } from "@/server/context";
import { requestsCsv } from "@/server/services/reports";
import { isManager } from "@/server/authz";

/** Manager-only, tenant-scoped CSV. Same authorization as the reports page. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await resolveActor(slug);
  if (!actor || !actor.isStaff || !isManager(actor)) return new NextResponse("Not found", { status: 404 });
  const csv = await requestsCsv(actor);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="requests-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
