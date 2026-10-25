import { z } from 'zod';

/** Content only: the renderer owns geometry and timing, never sample facts. */
export const MotionTemplateContent = z.strictObject({
  items: z.array(z.strictObject({
    text: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(160).optional(),
  })).min(1).max(7),
  links: z.array(z.strictObject({
    from: z.number().int().min(0).max(6),
    to: z.number().int().min(0).max(6),
  })).max(6).default([]),
});
export type MotionTemplateContentData = z.infer<typeof MotionTemplateContent>;

export const MotionTemplateSelection = z.strictObject({
  id: z.string().regex(/^ad_[a-z_]+$/).max(80),
  version: z.literal(1),
  layout: z.enum(['horizontal', 'vertical', 'radial']),
});
