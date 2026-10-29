import "server-only";
import { schema, type Tx } from "../db";
import type { TenantFeatures, TenantKind, TenantMode, TenantTheme } from "../db/schema";
import { presetFor, type CategoryPreset } from "../presets";

type Db = Pick<Tx, "insert" | "select" | "update" | "execute">;

export type NewTenant = {
  name: string;
  slug: string;
  kind: TenantKind;
  mode: TenantMode;
  timezone?: string;
  defaultLocale?: "en" | "ar";
  theme?: TenantTheme;
  features?: Partial<TenantFeatures>;
  isDemo?: boolean;
  requestPrefix?: string;
  categories?: CategoryPreset[];
  workDays?: number[];
};

/** Creates a tenant with its default settings rows. Runs on the owner connection (signup, seed). */
export async function bootstrapTenant(db: Db, t: NewTenant) {
  const features: TenantFeatures = {
    sla: false,
    approvals: true,
    sms: false,
    requireApprovalToDeliver: false,
    reviewWindowDays: 7,
    ...(t.features ?? {}),
  };
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: t.name,
      slug: t.slug,
      kind: t.kind,
      mode: t.mode,
      timezone: t.timezone ?? "UTC",
      defaultLocale: t.defaultLocale ?? "en",
      theme: t.theme ?? {},
      features,
      isDemo: t.isDemo ?? false,
      requestPrefix: t.requestPrefix ?? "REQ",
    })
    .returning();
  await db.insert(schema.aiSettings).values({ tenantId: tenant.id });
  await db.insert(schema.notificationSettings).values({ tenantId: tenant.id });
  await db.insert(schema.slaPolicies).values({ tenantId: tenant.id });
  await db.insert(schema.businessCalendars).values({
    tenantId: tenant.id,
    timezone: tenant.timezone,
    workDays: t.workDays ?? (tenant.timezone === "Asia/Riyadh" ? [7, 1, 2, 3, 4] : [1, 2, 3, 4, 5]),
  });
  const cats = t.categories ?? presetFor(t.kind);
  if (cats.length) {
    await db.insert(schema.serviceCategories).values(
      cats.map((c, i) => ({ tenantId: tenant.id, key: c.key, labelEn: c.labelEn, labelAr: c.labelAr, helpEn: c.helpEn, helpAr: c.helpAr, icon: c.icon, position: i, fields: c.fields })),
    );
  }
  return tenant;
}

export function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "workspace";
}
