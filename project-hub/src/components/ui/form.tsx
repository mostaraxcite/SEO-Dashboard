"use client";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-fg placeholder:text-muted transition-colors " +
  "hover:border-[color:var(--text-muted)] focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]/25 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...p },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, "py-2 leading-relaxed resize-y min-h-[2.25rem]", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        "h-9 appearance-none bg-no-repeat pe-8",
        "bg-[length:14px] [background-position:right_0.6rem_center] rtl:[background-position:left_0.6rem_center]",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23677570' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...p}
    >
      {children}
    </select>
  );
});

export function Checkbox({ label, help, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; help?: React.ReactNode }) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input id={p.id ?? id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[color:var(--brand)]" {...p} />
      <label htmlFor={p.id ?? id} className="text-fg leading-snug">
        {label}
        {help ? <span className="block text-sm text-muted mt-0.5">{help}</span> : null}
      </label>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  optional,
  optionalLabel,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
        {optional ? <span className="ms-1.5 font-normal text-muted">({optionalLabel ?? "optional"})</span> : null}
      </label>
      {children}
      {help && !error ? <p className="text-sm text-muted">{help}</p> : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
