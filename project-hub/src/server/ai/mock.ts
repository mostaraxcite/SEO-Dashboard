import "server-only";
import { hasArabic, type AiContext, type ContextItem } from "./context";
import type { Feature, Output } from "./schemas";
import type { AiProvider, AiResult } from "./types";
import { makeT } from "@/i18n";

/**
 * Deterministic, offline provider for development, demos and tests.
 * It reads only the permission-filtered context it is given, cites real item ids,
 * never invents dates or people, and is clearly labelled "Mock provider" in the UI.
 */
export class MockProvider implements AiProvider {
  name = "mock";
  modelFor(feature: Feature) {
    return `mock-${feature}`;
  }

  async generate<F extends Feature>(feature: F, ctx: AiContext): Promise<AiResult<F>> {
    const ar = ctx.locale === "ar";
    let output: unknown;
    switch (feature) {
      case "summarize":
        output = summarize(ctx, ar);
        break;
      case "improve_brief":
        output = improveBrief(ctx);
        break;
      case "suggest_tasks":
        output = suggestTasks(ctx, ar);
        break;
      case "next_steps":
        output = nextSteps(ctx, ar);
        break;
    }
    const chars = JSON.stringify(ctx).length;
    return { output: output as Output<F>, model: this.modelFor(feature), inputTokens: Math.ceil(chars / 4), outputTokens: 200, costUsd: 0 };
  }
}

const DECISION = /\b(approved?|agreed|decided|confirm(ed)?|final|go ahead|sign(ed)? off)\b|اعتمد|معتمد|تم الاتفاق|موافق|تمت الموافقة|نعتمد|قررنا/i;
const BLOCKER = /\b(block(ed|er)?|waiting|pending|stuck|delay(ed)?|can'?t|cannot|missing)\b|متوقف|بانتظار|ننتظر|تأخير|متأخر|ناقص|لم يصل/i;

const firstLine = (s: string, max = 160) => {
  const l = s.split("\n").find((x) => x.trim()) ?? s;
  return l.length > max ? l.slice(0, max).trim() + "…" : l.trim();
};

function conversational(items: ContextItem[]) {
  return items.filter((i) => ["message", "question", "answer", "update", "note", "comment"].includes(i.kind));
}

function summarize(ctx: AiContext, ar: boolean): Output<"summarize"> {
  const talk = conversational(ctx.items);
  const decisions = talk.filter((i) => DECISION.test(i.text)).slice(-2);
  const deps = ctx.items.filter((i) => i.kind === "dependency");
  const blockerTalk = talk.filter((i) => BLOCKER.test(i.text) && !decisions.includes(i)).slice(-1);
  const recent = talk.slice(-3);
  const raw = String(ctx.facts.status ?? "");
  const t = makeT(ar ? "ar" : "en");
  const status = ctx.resourceType === "task" ? t.dyn(`task.status.${raw}`, undefined, raw) : ctx.audience === "client" ? t.dyn(`request.public.${raw}`, undefined, raw) : t.dyn(`request.internal.${raw}`, undefined, raw);
  const openTasks = Number(ctx.facts.openTasks ?? 0);
  const state = ar
    ? `الحالة الحالية: ${status || "غير محددة"}${ctx.facts.committedDue ? ` · الموعد الملتزم به ${ctx.facts.committedDue}` : ""}${openTasks ? ` · ${openTasks} مهام مفتوحة` : ""}.`
    : `Currently ${status || "unknown"}${ctx.facts.committedDue ? ` · committed for ${ctx.facts.committedDue}` : ""}${openTasks ? ` · ${openTasks} open tasks` : ""}.`;
  const blockers = [
    ...deps.map((d) => (ar ? `بانتظار ${d.author}: ${firstLine(d.text, 120)}` : `Waiting on ${d.author}: ${firstLine(d.text, 120)}`)),
    ...blockerTalk.map((b) => firstLine(b.text, 140)),
  ].slice(0, 3);
  const nextAction = deps[0]
    ? ar
      ? `المتابعة مع ${deps[0].author} بخصوص: ${firstLine(deps[0].text, 100)}`
      : `Follow up with ${deps[0].author} on: ${firstLine(deps[0].text, 100)}`
    : ctx.facts.pendingQuestion
      ? ar
        ? "انتظار رد مقدم الطلب على السؤال المفتوح"
        : "Wait for the requester's answer to the open question"
      : openTasks
        ? ar
          ? "إكمال المهام المفتوحة حسب الأولوية"
          : "Complete the open tasks in order of due date"
        : null;
  const evidence = [...decisions, ...deps, ...blockerTalk, ...recent].map((i) => i.id);
  return {
    state,
    decisions: decisions.map((d) => firstLine(d.text, 180)),
    changes: recent.map((r) => `${r.author ? r.author + ": " : ""}${firstLine(r.text, 140)}`),
    blockers,
    nextAction,
    evidence: [...new Set(evidence)].slice(0, 12),
    insufficient: ctx.items.length < 2 && !ctx.facts.description,
  };
}

/** Light-touch cleanup: keeps the requester's words, fixes spacing/elongation, adds structure. */
function tidy(s: string) {
  return s
    .replace(/ـ+/g, "")
    .replace(/([!?.،؟])\1+/g, "$1")
    .replace(/(.)\1{3,}/g, "$1$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.!?،؟])/g, "$1")
    .trim();
}

function improveBrief(ctx: AiContext): Output<"improve_brief"> {
  const title = tidy(String(ctx.facts.title ?? ""));
  const objective = tidy(String(ctx.facts.objective ?? ""));
  const details = tidy(String(ctx.facts.details ?? ""));
  const all = `${title} ${objective} ${details}`;
  const ar = hasArabic(all) || ctx.locale === "ar";
  const lower = all.toLowerCase();
  const questions: string[] = [];
  const has = (re: RegExp) => re.test(lower);
  if (!has(/audience|customers?|target|for (whom|who)|جمهور|العملاء|الفئة|المستهدف|زبائن/)) questions.push(ar ? "من الجمهور المستهدف الأساسي؟" : "Who is the main audience?");
  if (!has(/size|format|instagram|story|post|banner|print|a\d|×|x\d|مقاس|حجم|منشور|ستوري|بنر|لوحة|طباعة/))
    questions.push(ar ? "ما الصيغ أو المقاسات المطلوبة (مثل منشورات، لوحات معارض، شاشات)؟" : "Which formats or sizes do you need (e.g. posts, showroom banners, screens)?");
  if (!has(/message|offer|discount|promo|رسالة|عرض|خصم|تخفيض/)) questions.push(ar ? "ما الرسالة أو العرض الرئيسي الذي يجب إبرازه؟" : "What is the key message or offer to highlight?");
  const cats = ctx.categories ?? [];
  const keywords: Record<string, RegExp> = {
    campaign: /campaign|launch|promo|حملة|إطلاق|عرض/,
    design_content: /design|visual|post|video|content|تصميم|منشور|فيديو|محتوى/,
    creative: /design|visual|post|video|creative|تصميم|منشور|فيديو/,
    event_showroom: /showroom|event|exhibition|معرض|معارض|فعالية/,
    digital: /website|landing|digital|seo|موقع|رقمي/,
    web: /website|landing|page|موقع|صفحة/,
    reporting: /report|analysis|تقرير|تحليل/,
    change: /change|edit|fix|تعديل|تغيير/,
  };
  const suggested = cats.find((c) => keywords[c.key]?.test(lower))?.key ?? null;
  const cleanTitle = title.length > 0 ? title.charAt(0).toUpperCase() + title.slice(1) : objective.slice(0, 80);
  return {
    title: cleanTitle.slice(0, 160) || (ar ? "طلب جديد" : "New request"),
    objective: (objective || title).slice(0, 500),
    details: details
      ? details
          .split(/(?<=[.!؟?])\s+|\n+/)
          .filter(Boolean)
          .map((l) => `• ${l.trim()}`)
          .join("\n")
          .slice(0, 3000)
      : "",
    suggestedCategoryKey: suggested,
    questions: questions.slice(0, 3),
    uncertainties: ctx.facts.requestedDue ? [] : [ar ? "لم يُحدد تاريخ مطلوب" : "No requested date given"],
  };
}

type Step = { en: string; ar: string; team: string | null; dEn: string; dAr: string };
const PLANS: Record<string, Step[]> = {
  campaign: [
    { en: "Confirm brief, key message and scope", ar: "تأكيد الموجز والرسالة الرئيسية والنطاق", team: "Marketing", dEn: "Agree objective, audience and channels with the requester.", dAr: "الاتفاق على الهدف والجمهور والقنوات مع مقدم الطلب." },
    { en: "Write campaign copy (AR/EN)", ar: "كتابة نصوص الحملة (عربي/إنجليزي)", team: "Content", dEn: "Headline, body copy and call to action in both languages.", dAr: "العنوان والنص الأساسي والدعوة لاتخاذ إجراء باللغتين." },
    { en: "Design key visual", ar: "تصميم الهوية البصرية للحملة", team: "Design", dEn: "Master visual for review before adaptation.", dAr: "تصميم رئيسي للمراجعة قبل التكييف." },
    { en: "Adapt visuals to required formats", ar: "تكييف التصاميم للمقاسات المطلوبة", team: "Design", dEn: "Produce each size/format listed in the brief.", dAr: "إنتاج كل مقاس أو صيغة مذكورة في الموجز." },
    { en: "Arrange production / printing", ar: "ترتيب الإنتاج / الطباعة", team: "Procurement", dEn: "Quotes and production slots; confirm lead time.", dAr: "عروض الأسعار ومواعيد الإنتاج وتأكيد مدة التوريد." },
    { en: "Internal review and handover", ar: "مراجعة داخلية وتسليم", team: "Marketing", dEn: "Final QA, then deliver to requester for approval.", dAr: "مراجعة الجودة النهائية ثم التسليم لمقدم الطلب للاعتماد." },
  ],
  creative: [
    { en: "Clarify brief and references", ar: "توضيح الموجز والمراجع", team: "Account", dEn: "Collect references, tone and mandatory elements.", dAr: "جمع المراجع والأسلوب والعناصر الإلزامية." },
    { en: "Write captions and on-image copy", ar: "كتابة النصوص والتعليقات", team: "Content", dEn: "Copy for each post, both languages if needed.", dAr: "نص لكل منشور وباللغتين عند الحاجة." },
    { en: "Design first round", ar: "تصميم الجولة الأولى", team: "Design", dEn: "Designs for each requested item.", dAr: "تصاميم لكل عنصر مطلوب." },
    { en: "Internal review", ar: "مراجعة داخلية", team: "Account", dEn: "Check brand, spelling and sizes.", dAr: "التحقق من الهوية والإملاء والمقاسات." },
    { en: "Deliver for client approval", ar: "التسليم لاعتماد العميل", team: "Account", dEn: "Share version 1 and collect feedback.", dAr: "مشاركة الإصدار الأول وجمع الملاحظات." },
  ],
  web: [
    { en: "Confirm page content and goals", ar: "تأكيد محتوى الصفحة وأهدافها", team: "Digital", dEn: "Sections, CTA and tracking needs.", dAr: "الأقسام والدعوة لاتخاذ إجراء ومتطلبات التتبع." },
    { en: "Prepare copy", ar: "تجهيز النصوص", team: "Content", dEn: "Page copy in required languages.", dAr: "نصوص الصفحة باللغات المطلوبة." },
    { en: "Design/update layout", ar: "تصميم أو تحديث التخطيط", team: "Design", dEn: "Desktop and mobile layouts.", dAr: "تخطيط لسطح المكتب والجوال." },
    { en: "Build and QA", ar: "التنفيذ والاختبار", team: "Digital", dEn: "Implement, test on mobile, check links and tracking.", dAr: "التنفيذ والاختبار على الجوال والتحقق من الروابط والتتبع." },
  ],
  general: [
    { en: "Clarify scope and success criteria", ar: "توضيح النطاق ومعايير النجاح", team: null, dEn: "Confirm what 'done' means with the requester.", dAr: "تأكيد معنى «الإنجاز» مع مقدم الطلب." },
    { en: "Produce first version", ar: "إنتاج النسخة الأولى", team: null, dEn: "Do the core work described in the brief.", dAr: "تنفيذ العمل الأساسي الموصوف في الموجز." },
    { en: "Review internally", ar: "مراجعة داخلية", team: null, dEn: "Peer review before sharing.", dAr: "مراجعة من زميل قبل المشاركة." },
    { en: "Prepare deliverable", ar: "تجهيز المخرج للتسليم", team: null, dEn: "Package files/links for delivery.", dAr: "تجهيز الملفات أو الروابط للتسليم." },
  ],
};

function suggestTasks(ctx: AiContext, ar: boolean): Output<"suggest_tasks"> {
  const key = String(ctx.facts.categoryKey ?? "");
  const text = `${ctx.facts.title ?? ""} ${ctx.facts.objective ?? ""} ${ctx.facts.description ?? ""}`.toLowerCase();
  const plan =
    PLANS[key === "design_content" ? "creative" : key === "event_showroom" ? "campaign" : key === "digital" ? "web" : key] ??
    (/campaign|حملة|showroom|معرض/.test(text) ? PLANS.campaign : /design|post|تصميم|منشور/.test(text) ? PLANS.creative : /website|page|موقع|صفحة/.test(text) ? PLANS.web : PLANS.general);
  const existing = new Set(ctx.items.filter((i) => i.kind === "task").map((i) => i.text.toLowerCase()));
  const steps = plan.filter((s) => !existing.has(s.en.toLowerCase()) && !existing.has(s.ar));
  const uncertainties: string[] = [];
  if (!ctx.facts.committedDue && !ctx.facts.requestedDue) uncertainties.push(ar ? "لا يوجد تاريخ مطلوب أو ملتزم به" : "No requested or committed date");
  if (!/\d/.test(text)) uncertainties.push(ar ? "الكميات أو المقاسات غير محددة" : "Quantities or sizes not specified");
  return {
    suggestions: steps.slice(0, 8).map((s, i) => ({
      title: ar ? s.ar : s.en,
      description: ar ? s.dAr : s.dEn,
      proposedTeam: s.team,
      dependsOn: i === 0 ? [] : [i - 1],
    })),
    uncertainties,
    evidence: [`${ctx.resourceType}:${ctx.resourceId}`],
  };
}

function nextSteps(ctx: AiContext, ar: boolean): Output<"next_steps"> {
  const steps: Output<"next_steps">["steps"] = [];
  const deps = ctx.items.filter((i) => i.kind === "dependency");
  for (const d of deps.slice(0, 2)) {
    steps.push({
      action: ar ? `تابع مع ${d.author}: ${firstLine(d.text, 100)}` : `Follow up with ${d.author}: ${firstLine(d.text, 100)}`,
      reason: ar ? "اعتمادية مفتوحة توقف العمل." : "An open dependency is blocking progress.",
      evidence: [d.id],
    });
  }
  if (ctx.facts.pendingQuestion && steps.length < 3)
    steps.push({ action: ar ? "انتظر إجابة مقدم الطلب أو ذكّره بلطف" : "Wait for the requester's answer, or send a gentle reminder", reason: ar ? "هناك سؤال مفتوح لمقدم الطلب." : "A question to the requester is still open.", evidence: [] });
  const overdue = ctx.items.filter((i) => i.kind === "task" && i.flag === "overdue");
  for (const t of overdue.slice(0, 3 - steps.length))
    steps.push({ action: ar ? `أعد جدولة أو أنجز: ${firstLine(t.text, 90)}` : `Finish or re-plan: ${firstLine(t.text, 90)}`, reason: ar ? "المهمة تجاوزت تاريخ الاستحقاق." : "This task is past its due date.", evidence: [t.id] });
  if (steps.length < 3 && Number(ctx.facts.openTasks ?? 0) === 0 && ctx.resourceType === "request" && ["accepted", "in_progress", "in_review", "ready_to_deliver"].includes(String(ctx.facts.status)))
    steps.push({ action: ar ? "جهّز المخرج واستخدم «تسليم»" : "Prepare the deliverable and use Deliver", reason: ar ? "لا توجد مهام مفتوحة؛ إنجاز المهام لا يُشعر العميل تلقائيًا." : "No open tasks remain; finishing tasks doesn't notify the requester.", evidence: [] });
  const missing: string[] = [];
  if (!ctx.facts.committedDue && ctx.resourceType === "request") missing.push(ar ? "لم يُحدد تاريخ ملتزم به" : "No committed date set");
  if (ctx.resourceType === "task" && !ctx.facts.assignee) missing.push(ar ? "المهمة غير مُسندة" : "Task has no assignee");
  return { steps: steps.slice(0, 3), missing, insufficient: steps.length === 0 };
}
