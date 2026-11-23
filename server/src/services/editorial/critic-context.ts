import type { ScenePlan } from '../scene-plan.js';
import { identifyDocumentaryChannel, type DocumentaryChannel } from './documentary-topic-vetter.js';

export function clip(value: string | undefined, limit: number): string {
  if (!value) return '';
  return value.length <= limit ? value : `${value.slice(0, limit)}\n[truncated]`;
}

export function channelFor(channelName?: string, channelGuidance?: string): DocumentaryChannel {
  return identifyDocumentaryChannel(channelName, channelGuidance);
}

export function sceneDigest(plan: ScenePlan, maxPerScene = 1600) {
  return plan.scenes.map((scene, index) => ({
    id: scene.id,
    index: index + 1,
    chapter: scene.chapter,
    role: scene.role,
    duration: scene.duration,
    mediaType: scene.mediaType || 'image',
    narration: clip(scene.narration, maxPerScene),
  }));
}

export function channelEditorialRules(channel: DocumentaryChannel): string {
  if (channel === 'ancient-dharma') {
    return [
      'Ancient Dharma rules: sacred epic lore from Ramayana, Mahabharata, Puranas and Vedic tradition.',
      'Narration must be noble, elevated, devotional Hindi in Devanagari with danda (।) pauses.',
      'Banned street slang includes तू, तेरा, तुझे, अरे, काय रे.',
      'Distinguish traditional belief from historical evidence. Never fabricate verse numbers, citations, dates or scripture quotations.',
      'Characters, relationships, divine weapons and chronology must stay consistent with the selected epic and tradition.',
    ].join(' ');
  }
  if (channel === 'against-the-odds') {
    return [
      'Against the Odds rules: verified survival and disaster documentary in clinical, factual English.',
      'Preserve chronology, true knowledge states and uncertainty. Never invent quotations, telemetry, rescuers or suffering.',
      'Flag any claim that the supplied research does not support, especially specific numbers, times or dialogue.',
    ].join(' ');
  }
  return 'Follow the channel template and keep every factual claim grounded in the supplied research. Distinguish verified facts from interpretation.';
}
