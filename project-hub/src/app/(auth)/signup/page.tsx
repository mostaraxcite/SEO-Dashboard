import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <AuthShell wide>
      <SignupForm />
    </AuthShell>
  );
}
