"use client";
import { useState } from "react";
import { Menu as MenuIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { useI18n } from "@/components/i18n-provider";

/** Off-canvas navigation for small screens; opens from the reading-start side. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="tap inline-flex h-10 w-10 items-center justify-center rounded-md text-spine-muted hover:bg-spine-hover hover:text-on-spine lg:hidden" aria-label={t("common.menu")}>
        <MenuIcon className="h-5 w-5" />
      </DialogTrigger>
      <DialogContent title={t("common.menu")} side="start" className="border-0 bg-spine">
        <div onClickCapture={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)} className="h-full">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
