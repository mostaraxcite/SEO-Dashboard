"use client";
import { Dialog as D, DropdownMenu as DM, Tooltip as TT, Popover as PO } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  closeLabel = "Close",
  side,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
  side?: "start";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[rgb(18_23_21/0.38)] animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface text-fg shadow-md border border-line animate-in focus:outline-none",
          side === "start"
            ? "inset-y-0 start-0 w-[min(18rem,86vw)] rounded-none border-y-0 border-s-0"
            : "left-1/2 top-[8vh] max-h-[84vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg",
          className,
        )}
      >
        <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", side === "start" && "sr-only")}>
          <div>
            <D.Title className="text-md font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg" aria-label={closeLabel}>
            <X className="h-4 w-4" />
          </D.Close>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto", side === "start" ? "" : "px-5 pb-5")}>{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-[12rem] rounded-lg border border-line bg-surface p-1 text-fg shadow-md animate-in", className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, className, ...p }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted",
        className,
      )}
      {...p}
    >
      {children}
    </DM.Item>
  );
}

export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2.5 py-1 text-xs text-muted">{children}</DM.Label>;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TT.Provider delayDuration={300}>
      <TT.Root>
        <TT.Trigger asChild>{children}</TT.Trigger>
        <TT.Portal>
          <TT.Content sideOffset={6} className="z-50 rounded-md bg-[color:var(--ink)] px-2 py-1 text-xs text-[color:var(--canvas)] shadow-md">
            {content}
          </TT.Content>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}

export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;
export function PopoverContent({ children, className, align = "end" }: { children: React.ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <PO.Portal>
      <PO.Content align={align} sideOffset={6} className={cn("z-50 rounded-lg border border-line bg-surface text-fg shadow-md animate-in focus:outline-none", className)}>
        {children}
      </PO.Content>
    </PO.Portal>
  );
}
