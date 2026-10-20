import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ImageMotion, validateProject, type EditingProject } from '@tubeflow/editing-contracts';
import { store } from '../store.js';
import { nextRevision } from './repository.js';
import { registerFonts } from './media.js';
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const MotionStyleSettings = z.strictObject({ accent: color, text: color, background: color, font: z.enum(['latin', 'devanagari']), motion: ImageMotion, strength: z.number().min(0).max(0.2) });
export const MotionStyle = z.strictObject({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), settings: MotionStyleSettings });
export function listMotionStyles() { return z.array(MotionStyle).parse(store.get('motion-presets')); }
export function saveMotionStyle(name: string, settings: unknown) {
  const styles = listMotionStyles(), existing = styles.find(style => style.name.toLowerCase() === name.trim().toLowerCase());
  if (!existing && styles.length >= 50) throw new Error('Keep at most 50 saved motion styles.');
  const style = MotionStyle.parse({ id: existing?.id || randomUUID(), name, settings });
  store.add('motion-presets', style); return style;
}
export function applyMotionStyle(input: EditingProject, id: string) {
  const preset = listMotionStyles().find(style => style.id === id); if (!preset) throw new Error('Motion style not found');
  const project = nextRevision(input), { settings } = preset;
  project.style.colors = { ...project.style.colors, accent: settings.accent, text: settings.text, background: settings.background };
  const fonts = registerFonts(); if (settings.font === 'devanagari') fonts.reverse();
  project.style.fontAssetIds = fonts.map(font => font.id);
  project.assetIds = [...new Set([...project.assetIds, ...project.style.fontAssetIds])];
  for (const artifact of project.artifacts) {
    delete artifact.visualReview;
    for (const layer of artifact.graphic?.composition?.layers || []) { layer.motion = settings.motion; layer.strength = settings.strength; }
  }
  project.diagnostics = project.diagnostics.filter(note => !note.code.startsWith('VISUAL_REVIEW_'));
  return validateProject(project);
}
