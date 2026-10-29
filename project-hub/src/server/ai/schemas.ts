import { z } from "zod";

/** Every AI output is validated against these schemas before anyone sees it. */

const sourceId = z.string().max(80);

export const summarySchema = z.object({
  state: z.string().max(400),
  decisions: z.array(z.string().max(300)).max(4),
  changes: z.array(z.string().max(300)).max(4),
  blockers: z.array(z.string().max(300)).max(4),
  nextAction: z.string().max(300).nullable(),
  evidence: z.array(sourceId).max(12),
  insufficient: z.boolean(),
});

export const briefSchema = z.object({
  title: z.string().min(1).max(160),
  objective: z.string().min(1).max(500),
  details: z.string().max(3000),
  suggestedCategoryKey: z.string().max(60).nullable(),
  questions: z.array(z.string().max(240)).max(3),
  uncertainties: z.array(z.string().max(200)).max(4),
});

export const tasksSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(800),
        proposedTeam: z.string().max(60).nullable(),
        dependsOn: z.array(z.number().int().min(0).max(7)).max(4),
      }),
    )
    .min(1)
    .max(8),
  uncertainties: z.array(z.string().max(200)).max(4),
  evidence: z.array(sourceId).max(12),
});

export const nextStepsSchema = z.object({
  steps: z
    .array(z.object({ action: z.string().max(240), reason: z.string().max(300), evidence: z.array(sourceId).max(4) }))
    .max(3),
  missing: z.array(z.string().max(200)).max(4),
  insufficient: z.boolean(),
});

export const schemas = {
  summarize: summarySchema,
  improve_brief: briefSchema,
  suggest_tasks: tasksSchema,
  next_steps: nextStepsSchema,
} as const;

export type Feature = keyof typeof schemas;
export type Output<F extends Feature> = z.infer<(typeof schemas)[F]>;

export const PROMPT_VERSION: Record<Feature, string> = {
  summarize: "summarize-v1",
  improve_brief: "brief-v1",
  suggest_tasks: "tasks-v1",
  next_steps: "next-v1",
};
