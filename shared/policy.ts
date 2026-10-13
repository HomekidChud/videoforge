import { z } from "zod";

export const restrictionsSchema = z.object({
  expiresAt: z.number().int().positive().nullable().default(null),
  allowedOrigins: z.array(z.string().url().refine(v => new URL(v).origin === v, "Use an exact origin without a path or trailing slash")).max(20).default([]),
  projectIds: z.array(z.string().regex(/^[a-f0-9]{12}$/)).max(100).nullable().default(null),
  requestsPerMinute: z.number().int().min(1).max(10000).nullable().default(null),
  allowUpload: z.boolean().default(true),
  allowRender: z.boolean().default(true),
  allowDelete: z.boolean().default(true),
}).strict();
export type KeyRestrictions = z.infer<typeof restrictionsSchema>;
export const DEFAULT_RESTRICTIONS = restrictionsSchema.parse({});
