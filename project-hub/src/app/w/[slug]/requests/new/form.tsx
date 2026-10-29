"use client";
import { RequestForm, type FormCategory } from "@/components/portal/request-form";
import { staffSubmitRequestAction } from "../../actions";

export function StaffNewRequest({ slug, categories, clients, aiEnabled }: { slug: string; categories: FormCategory[]; clients: { id: string; name: string }[]; aiEnabled: boolean }) {
  return (
    <RequestForm
      slug={slug}
      categories={categories}
      clients={clients}
      initialCategory={null}
      aiEnabled={aiEnabled}
      responsePolicy={null}
      submit={(fd) => staffSubmitRequestAction(slug, fd)}
      requestHref={(ref) => `/w/${slug}/requests/${ref}`}
    />
  );
}
