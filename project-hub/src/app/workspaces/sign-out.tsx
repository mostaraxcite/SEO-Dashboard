"use client";
import { signOut } from "@/app/(auth)/actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className="text-fg-2 hover:text-fg hover:underline">
        {label}
      </button>
    </form>
  );
}
