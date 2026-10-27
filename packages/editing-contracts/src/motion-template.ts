import { z } from 'zod';

/** Content only: the renderer owns geometry and timing, never sample facts. */
export const MotionTemplateContent = z.strictObject({
  items: z.array(z.strictObject({
    text: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(160).optional(),
    // Numeric geometry only; the displayed phrase must contain this exact value.
    value: z.number().finite().min(0).max(1e9).optional(),
  })).min(1).max(7),
  links: z.array(z.strictObject({
    from: z.number().int().min(0).max(6),
    to: z.number().int().min(0).max(6),
  })).max(6).default([]),
});
export type MotionTemplateContentData = z.infer<typeof MotionTemplateContent>;

export const MotionPlacement = z.enum(['auto', 'top', 'bottom', 'left', 'right', 'center']);
export const MotionScriptHint = z.object({
  version: z.literal(1).optional(),
  intent: z.string().trim().min(1).max(300),
  templateId: z.string().regex(/^(?:(?:ad|rz|ato)_[a-z_]+|custom)$/).max(80).optional(),
  quote: z.string().trim().min(1).max(1500).optional(),
  position: MotionPlacement.optional(),
  durationSec: z.number().finite().min(1.5).max(15).optional(),
  layout: z.enum(['auto', 'horizontal', 'vertical']).optional(),
  content: MotionTemplateContent.optional(),
});
export type MotionScriptHintData = z.infer<typeof MotionScriptHint>;

export const MotionTemplateSelection = z.strictObject({
  id: z.string().regex(/^ad_[a-z_]+$/).max(80),
  version: z.literal(1),
  layout: z.enum(['horizontal', 'vertical', 'radial']),
});
