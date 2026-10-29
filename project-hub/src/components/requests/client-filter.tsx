"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";

/** Agency/department filter, kept in the URL so views are shareable. */
export function ClientFilter({ clients, value, label }: { clients: { id: string; name: string }[]; value: string; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { t } = useI18n();
  if (!clients.length) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <Select
        value={value}
        className="h-8 w-44 text-sm"
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          if (e.target.value) next.set("client", e.target.value);
          else next.delete("client");
          router.push(`${path}?${next.toString()}`);
        }}
      >
        <option value="">{t("common.all")}</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
