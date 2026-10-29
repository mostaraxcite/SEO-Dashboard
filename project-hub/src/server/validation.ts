import { z } from "zod";

const trim = (max: number) => z.string().trim().max(max);
export const text = (max = 200) => trim(max).min(1);
export const optionalText = (max = 5000) =>
  z.preprocess((v) => (v === null || v === undefined ? "" : v), trim(max));
export const nullableId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid().nullable());
export const id = z.uuid();
export const day = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);
export const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());
export const url = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), "errors.invalid").nullable(),
);
