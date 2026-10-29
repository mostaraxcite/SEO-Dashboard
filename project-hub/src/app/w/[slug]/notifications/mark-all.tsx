"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "@/app/notification-actions";

export function MarkAllRead({ slug, label }: { slug: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button loading={pending} onClick={() => start(() => markNotificationsRead(slug))}>
      {label}
    </Button>
  );
}
