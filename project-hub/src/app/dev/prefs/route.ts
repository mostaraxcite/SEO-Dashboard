import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { systemDb, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth/session";
import { env } from "@/server/env";

/** Development-only helper for screenshot/E2E scripts: sets the signed-in user's locale/theme. */
export async function GET(req: NextRequest) {
  if (!env.devToolsEnabled) return new NextResponse("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const locale = req.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  const theme = req.nextUrl.searchParams.get("theme");
  await systemDb().update(schema.users).set({ locale, theme: theme === "dark" || theme === "light" ? theme : "system" }).where(eq(schema.users.id, user.id));
  return NextResponse.json({ ok: true });
}
