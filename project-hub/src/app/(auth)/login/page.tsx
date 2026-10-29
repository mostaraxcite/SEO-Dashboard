import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";
import { env } from "@/server/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user && !next) redirect("/workspaces");
  return (
    <AuthShell>
      <LoginForm next={next ?? ""} devMailbox={env.devToolsEnabled} />
    </AuthShell>
  );
}
