import { z } from 'zod';
import { SFX_NAMES, POPUP_SHAPES, POPUP_PLACEMENTS, canonicalSfx } from './style-kit.js';

export const DynamicMotionPlacement = z.strictObject({
  position: z.enum([
    'auto',
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'custom',
  ]).default('auto'),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  width: z.number().min(0).max(100).optional(),
  height: z.number().min(0).max(100).optional(),
  scale: z.number().min(0.2).max(3.0).optional(),
  speedMultiplier: z.number().min(0.2).max(5.0).optional(),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type DynamicMotionPlacementData = z.infer<typeof DynamicMotionPlacement>;

export const DynamicMotionRender = z.strictObject({
  html: z.string(),
  css: z.string(),
  js: z.string(),
});
export type DynamicMotionRenderData = z.infer<typeof DynamicMotionRender>;

export const DynamicMotionSfx = z.strictObject({
  kind: z.preprocess((v) => canonicalSfx(typeof v === 'string' ? v : undefined), z.enum(SFX_NAMES)).default('whoosh'),
  startSec: z.number().min(0).optional(),
  volume: z.number().min(0).max(1).default(0.7),
});
export type DynamicMotionSfxData = z.infer<typeof DynamicMotionSfx>;

export const DynamicMotionVfx = z.strictObject({
  tilt3d: z.boolean().default(false),
  tiltAngleX: z.number().min(-90).max(90).optional(),
  tiltAngleY: z.number().min(-90).max(90).optional(),
  particles: z.boolean().default(false),
  particleCount: z.number().min(0).max(100).optional(),
  lensflare: z.boolean().default(false),
  bloomIntensity: z.number().min(0).max(3).optional(),
});
export type DynamicMotionVfxData = z.infer<typeof DynamicMotionVfx>;

export const DynamicMotionTheme = z.strictObject({
  palette: z.array(z.string()).max(10).optional(),
  fontFamily: z.string().max(100).optional(),
  glowColor: z.string().max(80).optional(),
  stylePreset: z.string().max(80).optional(),
});
export type DynamicMotionThemeData = z.infer<typeof DynamicMotionTheme>;

export const DynamicMotionGraphic = z.strictObject({
  id: z.string().min(1).max(120),
  sceneIndex: z.number().int().min(0),
  sceneId: z.string().max(120).optional(),
  type: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  detail: z.string().max(2000).optional(),
  cuePhrase: z.string().max(500).optional(),
  startSec: z.number().min(0).optional(),
  durationSec: z.number().positive().max(60).optional(),
  placement: DynamicMotionPlacement,
  visualConcept: z.string().max(3000).optional(),
  theme: DynamicMotionTheme.optional(),
  sfx: DynamicMotionSfx.optional(),
  vfx: DynamicMotionVfx.optional(),
  render: DynamicMotionRender,
});
export type DynamicMotionGraphicData = z.infer<typeof DynamicMotionGraphic>;

export const ExtraPopupShape = z.enum(POPUP_SHAPES);
export type ExtraPopupShapeType = z.infer<typeof ExtraPopupShape>;

export const ExtraPopupPlacement = z.enum(POPUP_PLACEMENTS);
export type ExtraPopupPlacementType = z.infer<typeof ExtraPopupPlacement>;

export const ExtraPopupAssetSchema = z.strictObject({
  id: z.string().min(1),
  sceneIndex: z.number().int().min(0),
  cueWord: z.string().min(1),
  cueOffsetSec: z.number().min(0).default(1.0),
  durationSec: z.number().min(1.0).max(10.0).default(3.5),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(200).optional(),
  prompt: z.string().min(5),
  negativePrompt: z.string().optional(),
  shape: ExtraPopupShape.default('circle_medallion'),
  placement: ExtraPopupPlacement.default('top-right'),
  scalePercent: z.number().min(15).max(60).default(30),
  imageUrl: z.string().optional(),
  maskUrl: z.string().optional(),
  sfx: z.preprocess((v) => canonicalSfx(typeof v === 'string' ? v : undefined), z.enum(SFX_NAMES)).default('whoosh'),
  statValue: z.string().optional(),
  statUnit: z.string().optional(),
  badgeTag: z.string().optional(),
  archetype: z.string().optional(),
  status: z.enum(['pending', 'generating', 'ready', 'error']).default('pending'),
  error: z.string().optional(),
});
export type ExtraPopupAsset = z.infer<typeof ExtraPopupAssetSchema>;

