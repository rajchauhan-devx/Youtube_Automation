import { defaultGoogleVoice } from './voice-settings.js';
import { z } from 'zod';
import { editingPreset, validateEditingSettings, type EditingSettings } from './auto-edit.js';
import { SELECTIVE_MOTION_DIRECTION, isImageOnlyShorts } from './motion-editorial-policy.js';
import { defaultPresenter, type PresenterSettings } from './presenter-settings.js';

export const VoiceProvider = z.enum(['default', 'google', 'edge', 'openrouter', 'omni']);

export const PresenterSettingsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  avatarId: z.string().default('avatar_013'),
  style: z.enum(['card', 'green-screen', 'transparent']).default('transparent'),
  widthPercent: z.number().min(10).max(100).default(35),
  bottomPercent: z.number().min(0).max(80).default(2),
  marginPercent: z.number().min(0).max(100).default(0),
  horizontalPercent: z.number().min(0).max(100).default(100).optional(),
  crop: z.strictObject({
    x: z.number().min(0).max(90).default(32),
    y: z.number().min(0).max(90).default(2),
    width: z.number().min(10).max(100).default(40),
    height: z.number().min(10).max(100).default(67),
  }).default({ x: 32, y: 2, width: 40, height: 67 }),
  silenceGate: z.boolean().default(false),
  silenceThresholdDb: z.number().min(-55).max(-25).default(-40),
});

export const AutoPilotSettingsSchema = z.strictObject({
  version: z.literal(1),
  media: z.strictObject({
    imageProvider: z.enum(['google', 'cloudflare', 'local']),
    imageQuality: z.enum(['fast', 'standard', 'high']),
    seedMode: z.enum(['random', 'fixed']), seed: z.number().int().min(0).max(2147483647),
    flowEnabled: z.boolean(), flowResolution: z.enum(['720p', '1080p']),
    flowDuration: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    allowImageFallback: z.boolean(),
  }),
  voice: z.strictObject({
    provider: VoiceProvider, language: z.enum(['auto', 'en', 'hi']), voiceId: z.string().trim().min(1).max(150),
    rate: z.number().int().min(-25).max(35), pitch: z.number().int().min(-12).max(12),
    speed: z.number().min(0.75).max(1.5),
  }),
  captions: z.enum(['off', 'plain', 'motion']),
  graphics: z.strictObject({
    enabled: z.boolean(), mode: z.enum(['images', 'callouts']), density: z.enum(['subtle', 'balanced', 'expressive']),
    treatment: z.enum(['auto', 'archival', 'cinematic', 'map']),
    style: z.string().trim().min(1).max(2000),
    model: z.string().max(150).refine(value => !value || /^gemini-[a-z0-9.-]+$/i.test(value), 'Select a Gemini vision model.'),
  }),
  editing: z.strictObject({
    mode: z.enum(['story', 'custom', 'off']),
    settings: z.custom<EditingSettings>(value => {
      try { validateEditingSettings(value); return true; } catch { return false; }
    }, 'Invalid editing settings.'),
  }),
  audio: z.strictObject({
    music: z.enum(['auto', 'none', 'calm', 'cinematic', 'epic', 'upbeat']),
    musicVolume: z.number().min(0).max(1), voiceVolume: z.number().min(0).max(2),
  }),
  youtube: z.strictObject({
    enabled: z.boolean().default(true),
    privacyStatus: z.enum(['private', 'unlisted', 'public']),
    publishMode: z.enum(['now', 'schedule']).default('now'),
    scheduledPublishAt: z.string().max(100).default(''),
  }).superRefine((value, ctx) => {
    if (value.enabled && value.publishMode === 'schedule' && !Number.isFinite(Date.parse(value.scheduledPublishAt))) {
      ctx.addIssue({ code: 'custom', path: ['scheduledPublishAt'], message: 'Choose a valid scheduled publication time.' });
    }
  }),
  presenter: PresenterSettingsSchema.default(defaultPresenter()),
});
export type AutoPilotSettings = z.infer<typeof AutoPilotSettingsSchema>;

export function defaultAutoPilotSettings(script: { section?: string; name?: string; prompts?: { content?: string }[]; videoImportsEnabled?: boolean; enableSubtitles?: boolean; editing?: EditingSettings; presenter?: PresenterSettings; generatedAudio?: { voice?: string; language?: string }[]; youtubeExport?: { privacyStatus?: 'private' | 'unlisted' | 'public'; publishMode?: 'now' | 'schedule'; scheduledPublishAt?: string }; ttsVolume?: number } = {}): AutoPilotSettings {
  const imageOnly = isImageOnlyShorts(script, script.section || 'shorts');
  return {
    version: 1,
    media: { imageProvider: 'google', imageQuality: 'standard', seedMode: 'random', seed: 42, flowEnabled: !imageOnly, flowResolution: '720p', flowDuration: 8, allowImageFallback: true },
    voice: { provider: 'google', language: 'auto', voiceId: defaultGoogleVoice(script.generatedAudio?.[0]?.language === 'hi' ? 'hi' : 'en'), rate: 0, pitch: 0, speed: 1 },
    captions: script.enableSubtitles === true ? 'motion' : 'off',
    graphics: { enabled: false, mode: 'images', density: 'subtle', treatment: 'auto', style: SELECTIVE_MOTION_DIRECTION, model: '' },
    editing: { mode: script.editing?.enabled ? 'custom' : 'story', settings: script.editing || { ...editingPreset('cinematic'), motion: 'balanced', transitionSeconds: 0.35, bookendFades: false, colorLook: 'none' } },
    audio: { music: 'auto', musicVolume: 0.10, voiceVolume: script.ttsVolume ?? 1 },
    youtube: {
      enabled: true,
      privacyStatus: script.youtubeExport?.privacyStatus || 'private',
      publishMode: script.youtubeExport?.publishMode || 'now',
      scheduledPublishAt: script.youtubeExport?.scheduledPublishAt || (script.youtubeExport?.publishMode === 'schedule' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : ''),
    },
    presenter: script.presenter ? { ...defaultPresenter(), ...script.presenter } : defaultPresenter(),
  };
}

export function narrationOptions(settings: AutoPilotSettings, detectedLanguage: 'en' | 'hi') {
  const voice = settings.voice;
  return {
    ...(voice.provider === 'default' ? {} : { provider: voice.provider }),
    language: voice.language === 'auto' ? detectedLanguage : voice.language,
    voice: voice.voiceId,
    rate: `${voice.rate >= 0 ? '+' : ''}${voice.rate}%`, pitch: `${voice.pitch >= 0 ? '+' : ''}${voice.pitch}Hz`,
    speed: voice.speed,
  };
}
