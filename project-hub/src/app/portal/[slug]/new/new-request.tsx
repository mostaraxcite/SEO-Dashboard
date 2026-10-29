"use client";
import { RequestForm, type FormCategory } from "@/components/portal/request-form";
import { submitRequestAction } from "../actions";

export function NewRequestClient(props: { slug: string; categories: FormCategory[]; initialCategory: string | null; aiEnabled: boolean; responsePolicy: string | null }) {
  return <RequestForm {...props} submit={(fd) => submitRequestAction(props.slug, fd)} requestHref={(ref) => `/portal/${props.slug}/requests/${ref}`} />;
}
