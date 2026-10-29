"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { createProjectAction } from "@/app/w/[slug]/actions";

export function NewProjectButton({ slug, clients, clientLabel }: { slug: string; clients: { id: string; name: string }[]; clientLabel: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProjectAction.bind(null, slug), null);
  useEffect(() => {
    if (state?.ok && state.data) router.push(`/w/${slug}/projects/${state.data.id}`);
  }, [state, router, slug]);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="h-4 w-4" /> {t("project.newProject")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("project.newProject")} closeLabel={t("common.close")}>
        <form action={action} className="space-y-3.5">
          <Field label={t("project.name")} htmlFor="np-name" error={fe.name}>
            <Input id="np-name" name="name" required maxLength={160} placeholder={t("project.namePlaceholder")} dir="auto" autoFocus />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {clients.length ? (
              <Field label={clientLabel} htmlFor="np-client">
                <Select id="np-client" name="clientOrgId" defaultValue="">
                  <option value="">{t("project.noClient")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label={t("project.targetDate")} htmlFor="np-date" optional optionalLabel={t("common.optional")}>
              <Input id="np-date" name="targetDate" type="date" />
            </Field>
            <Field label={t("project.access")} htmlFor="np-access">
              <Select id="np-access" name="access" defaultValue="workspace">
                <option value="workspace">{t("project.accessWorkspace")}</option>
                <option value="members">{t("project.accessMembers")}</option>
              </Select>
            </Field>
          </div>
          <Field label={t("common.description")} htmlFor="np-desc" optional optionalLabel={t("common.optional")}>
            <Textarea id="np-desc" name="description" rows={3} maxLength={5000} dir="auto" />
          </Field>
          {state && !state.ok && !Object.keys(fe).length ? <p className="text-sm text-danger">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectStatusSelect({ slug, id, value, disabled }: { slug: string; id: string; value: string; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <Select
      aria-label={t("common.status")}
      defaultValue={value}
      disabled={disabled}
      className="h-8 w-36 text-sm"
      onChange={async (e) => {
        const { updateProjectAction } = await import("@/app/w/[slug]/actions");
        await updateProjectAction(slug, id, { status: e.target.value });
      }}
    >
      {(["planned", "active", "on_hold", "completed", "archived"] as const).map((s) => (
        <option key={s} value={s}>
          {t(`project.status.${s}`)}
        </option>
      ))}
    </Select>
  );
}
