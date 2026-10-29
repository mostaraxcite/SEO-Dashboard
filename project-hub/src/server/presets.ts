import type { CategoryField, TenantKind } from "./db/schema";

export type CategoryPreset = {
  key: string;
  labelEn: string;
  labelAr: string;
  helpEn: string;
  helpAr: string;
  icon: string;
  fields: CategoryField[];
};

const notSure = { value: "not_sure", labelEn: "Not sure", labelAr: "لست متأكدًا" };

/** Marketing preset used by the Jazeera pilot (synthetic, configurable — not an org chart). */
export const marketingPreset: CategoryPreset[] = [
  {
    key: "campaign",
    labelEn: "Campaign & launch",
    labelAr: "حملة وإطلاق",
    helpEn: "A campaign, product launch or promotion across channels.",
    helpAr: "حملة أو إطلاق منتج أو عرض عبر عدة قنوات.",
    icon: "megaphone",
    fields: [
      { key: "campaign_start", type: "date", labelEn: "Campaign start", labelAr: "بداية الحملة" },
      { key: "product", type: "text", labelEn: "Product or range", labelAr: "المنتج أو المجموعة" },
      {
        key: "region",
        type: "select",
        labelEn: "Region",
        labelAr: "المنطقة",
        options: [
          { value: "national", labelEn: "National", labelAr: "على مستوى المملكة" },
          { value: "central", labelEn: "Central", labelAr: "الوسطى" },
          { value: "western", labelEn: "Western", labelAr: "الغربية" },
          { value: "eastern", labelEn: "Eastern", labelAr: "الشرقية" },
          { value: "southern", labelEn: "Southern", labelAr: "الجنوبية" },
          notSure,
        ],
      },
    ],
  },
  {
    key: "design_content",
    labelEn: "Design & content",
    labelAr: "تصميم ومحتوى",
    helpEn: "Visuals, copy, video or social content.",
    helpAr: "تصاميم أو نصوص أو فيديو أو محتوى للتواصل الاجتماعي.",
    icon: "palette",
    fields: [
      {
        key: "usage",
        type: "select",
        labelEn: "Where will it be used?",
        labelAr: "أين سيُستخدم؟",
        options: [
          { value: "social", labelEn: "Social media", labelAr: "التواصل الاجتماعي" },
          { value: "print", labelEn: "Print / showroom", labelAr: "مطبوعات / معارض" },
          { value: "digital", labelEn: "Website / digital ads", labelAr: "الموقع / إعلانات رقمية" },
          notSure,
        ],
      },
      { key: "print_size", type: "text", labelEn: "Print size, if known", labelAr: "مقاس الطباعة إن كان معروفًا", showWhen: { field: "usage", equals: "print" } },
    ],
  },
  {
    key: "event_showroom",
    labelEn: "Event / showroom",
    labelAr: "فعالية / معرض",
    helpEn: "Showroom activation, exhibition or event support.",
    helpAr: "تفعيل في المعارض أو مشاركة في فعالية.",
    icon: "store",
    fields: [
      { key: "event_date", type: "date", labelEn: "Event date", labelAr: "تاريخ الفعالية" },
      { key: "locations", type: "text", labelEn: "Locations / number of showrooms", labelAr: "المواقع / عدد المعارض" },
    ],
  },
  {
    key: "digital",
    labelEn: "Website & digital",
    labelAr: "الموقع والرقمي",
    helpEn: "Website updates, landing pages, digital campaigns.",
    helpAr: "تحديثات الموقع، صفحات هبوط، حملات رقمية.",
    icon: "globe",
    fields: [{ key: "page_url", type: "text", labelEn: "Page or URL, if existing", labelAr: "الصفحة أو الرابط إن وُجد" }],
  },
  {
    key: "partnership_pr",
    labelEn: "Partnership / PR",
    labelAr: "شراكات / علاقات عامة",
    helpEn: "Sponsorship, partnership or press communication.",
    helpAr: "رعاية أو شراكة أو تواصل إعلامي.",
    icon: "handshake",
    fields: [],
  },
  { key: "other", labelEn: "Other", labelAr: "أخرى", helpEn: "Not sure? Describe it in your words.", helpAr: "لست متأكدًا؟ صفه بكلماتك.", icon: "circle-help", fields: [] },
];

export const agencyPreset: CategoryPreset[] = [
  {
    key: "campaign",
    labelEn: "New campaign",
    labelAr: "حملة جديدة",
    helpEn: "Plan and produce a new campaign.",
    helpAr: "تخطيط وإنتاج حملة جديدة.",
    icon: "megaphone",
    fields: [{ key: "launch", type: "date", labelEn: "Planned launch", labelAr: "موعد الإطلاق المخطط" }],
  },
  {
    key: "creative",
    labelEn: "Creative asset",
    labelAr: "تصميم إبداعي",
    helpEn: "Social posts, ads, visuals, video.",
    helpAr: "منشورات، إعلانات، تصاميم، فيديو.",
    icon: "palette",
    fields: [
      {
        key: "channel",
        type: "select",
        labelEn: "Main channel",
        labelAr: "القناة الرئيسية",
        options: [
          { value: "instagram", labelEn: "Instagram", labelAr: "إنستغرام" },
          { value: "tiktok", labelEn: "TikTok", labelAr: "تيك توك" },
          { value: "x", labelEn: "X", labelAr: "إكس" },
          { value: "multi", labelEn: "Several channels", labelAr: "عدة قنوات" },
          notSure,
        ],
      },
      { key: "quantity", type: "text", labelEn: "How many?", labelAr: "كم العدد؟" },
    ],
  },
  { key: "web", labelEn: "Website / landing page", labelAr: "موقع / صفحة هبوط", helpEn: "New page or changes to a site.", helpAr: "صفحة جديدة أو تعديلات على موقع.", icon: "globe", fields: [{ key: "page_url", type: "text", labelEn: "Page URL, if existing", labelAr: "رابط الصفحة إن وُجد" }] },
  { key: "change", labelEn: "Change request", labelAr: "طلب تعديل", helpEn: "Adjust something already delivered.", helpAr: "تعديل على عمل تم تسليمه.", icon: "pen-line", fields: [] },
  { key: "reporting", labelEn: "Reporting / analysis", labelAr: "تقارير / تحليل", helpEn: "Performance report or analysis.", helpAr: "تقرير أداء أو تحليل.", icon: "chart-column", fields: [] },
  { key: "other", labelEn: "Other", labelAr: "أخرى", helpEn: "Describe it in your words.", helpAr: "صفه بكلماتك.", icon: "circle-help", fields: [] },
];

export const generalPreset: CategoryPreset[] = [
  { key: "project", labelEn: "New project", labelAr: "مشروع جديد", helpEn: "Something bigger with several steps.", helpAr: "عمل أكبر من عدة خطوات.", icon: "folder-plus", fields: [] },
  { key: "small_task", labelEn: "Small task", labelAr: "مهمة صغيرة", helpEn: "A quick, well-defined job.", helpAr: "عمل سريع وواضح.", icon: "square-check", fields: [] },
  { key: "feedback", labelEn: "Feedback / change", labelAr: "ملاحظات / تعديل", helpEn: "Change something that exists.", helpAr: "تعديل على شيء موجود.", icon: "pen-line", fields: [] },
  { key: "other", labelEn: "Other", labelAr: "أخرى", helpEn: "Describe it in your words.", helpAr: "صفه بكلماتك.", icon: "circle-help", fields: [] },
];

export function presetFor(kind: TenantKind): CategoryPreset[] {
  return kind === "internal" ? marketingPreset : kind === "agency" ? agencyPreset : generalPreset;
}
