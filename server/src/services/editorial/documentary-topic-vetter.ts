import { z } from 'zod';
import { validatedModelJson } from '../model-json.js';
import { syncTopicNotes, repeatedTopic } from '../topic-notes.js';

export type DocumentaryChannel = 'against-the-odds' | 'ancient-dharma' | 'general-documentary';

export interface RetentionScorecard {
  hookCuriosityScore: number;     // 0-25
  pacingDensityScore: number;     // 0-25
  stakesAndConflictScore: number; // 0-25
  sourceAndCanonDepthScore: number; // 0-25
  totalScore: number;             // 0-100
  verdict: 'exceptional' | 'strong' | 'weak';
  strengths: string[];
  weaknesses: string[];
}

export interface FiveActRetentionStoryMap {
  coreViewerPromise: string;
  act1_hook: {
    timeframe: '0:00 - 1:30';
    name: string;
    description: string;
    retentionTrigger: string;
  };
  act2_escalation: {
    timeframe: '1:30 - 4:30';
    name: string;
    description: string;
    retentionTrigger: string;
  };
  act3_midpoint_reversal: {
    timeframe: '4:30 - 7:00';
    name: string;
    description: string;
    retentionTrigger: string;
  };
  act4_climax: {
    timeframe: '7:00 - 9:15';
    name: string;
    description: string;
    retentionTrigger: string;
  };
  act5_payoff_outro: {
    timeframe: '9:15 - End';
    name: string;
    description: string;
    retentionTrigger: string;
  };
  curiosityLoops: {
    timestampApprox: string;
    openQuestion: string;
    promisedPayoff: string;
  }[];
}

export interface VettedTopicResult {
  channel: DocumentaryChannel;
  topic: string;
  angle: string;
  scorecard: RetentionScorecard;
  storyMap: FiveActRetentionStoryMap;
  searchTitleCandidates: string[];
  thumbnailVisualHook: string;
  reason: string;
}

export function identifyDocumentaryChannel(channelName = '', guidance = ''): DocumentaryChannel {
  const combined = `${channelName} ${guidance}`.toLowerCase();
  if (/ancient dharma|sanatan|vedic|ramayan|mahabharat|puran/i.test(combined)) {
    return 'ancient-dharma';
  }
  if (/against the odds|survival|expedition|disaster|rescue|resilience/i.test(combined)) {
    return 'against-the-odds';
  }
  return 'general-documentary';
}

const ScorecardSchema = z.object({
  hookCuriosityScore: z.number().min(0).max(25),
  pacingDensityScore: z.number().min(0).max(25),
  stakesAndConflictScore: z.number().min(0).max(25),
  sourceAndCanonDepthScore: z.number().min(0).max(25),
  strengths: z.array(z.string().trim().min(1)).min(1).max(5),
  weaknesses: z.array(z.string().trim().min(1)).max(5),
});

const StoryMapSchema = z.object({
  coreViewerPromise: z.string().trim().min(5),
  act1_hook: z.object({
    timeframe: z.literal('0:00 - 1:30'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    retentionTrigger: z.string().trim().min(1),
  }),
  act2_escalation: z.object({
    timeframe: z.literal('1:30 - 4:30'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    retentionTrigger: z.string().trim().min(1),
  }),
  act3_midpoint_reversal: z.object({
    timeframe: z.literal('4:30 - 7:00'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    retentionTrigger: z.string().trim().min(1),
  }),
  act4_climax: z.object({
    timeframe: z.literal('7:00 - 9:15'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    retentionTrigger: z.string().trim().min(1),
  }),
  act5_payoff_outro: z.object({
    timeframe: z.literal('9:15 - End'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    retentionTrigger: z.string().trim().min(1),
  }),
  curiosityLoops: z.array(
    z.object({
      timestampApprox: z.string().trim(),
      openQuestion: z.string().trim(),
      promisedPayoff: z.string().trim(),
    })
  ).min(2).max(6),
});

const TopicVettingOutputSchema = z.object({
  topic: z.string().trim().min(3),
  angle: z.string().trim().min(5),
  scorecard: ScorecardSchema,
  storyMap: StoryMapSchema,
  searchTitleCandidates: z.array(z.string().trim().min(5)).min(2).max(5),
  thumbnailVisualHook: z.string().trim().min(5),
  reason: z.string().trim().min(5),
});

/**
 * Evaluates and elevates a topic to professional YouTube documentary standard,
 * scoring it across retention gates and structuring a 5-Act retention story map.
 */
export async function vetHighRetentionTopic(options: {
  topic?: string;
  channelName?: string;
  channelGuidance?: string;
  instructions?: string;
  duration?: number;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<VettedTopicResult> {
  const notes = syncTopicNotes();
  const channel = identifyDocumentaryChannel(
    options.channelName || notes.name,
    options.channelGuidance || notes.guidance
  );
  const targetDuration = Math.max(180, options.duration || 600);
  const requested = options.topic?.trim();

  const channelRules =
    channel === 'against-the-odds'
      ? `CHANNEL PROFILE: Against the Odds (High-Stakes True Survival & Resilience Documentaries).
CRITERIA FOR 90+ RETENTION:
1. Grounded in a documented real-life incident with verifiable timeline, physical constraints, geography, and equipment telemetry.
2. Must have severe life-or-death stakes, escalating constraints (weather, darkness, depleting air/fuel/water), and an impossible choice.
3. Midpoint Reversal: A moment where the initial survival plan fails or rescue encounters catastrophic difficulty.
4. Zero fabricated melodrama or made-up quotes. High suspense comes strictly from real facts and knowledge states.`
      : channel === 'ancient-dharma'
      ? `CHANNEL PROFILE: Ancient Dharma (Sanatana Dharma, Sacred Epic History & Spiritual Wisdom).
CRITERIA FOR 90+ RETENTION:
1. Grounded in authentic sacred lore of the Valmiki Ramayana, Vyasa Mahabharata, or Puranas.
2. High-Stakes Divine Dilemma: Extreme moral conflict, sacred vows (Pratigya), sacrifice, or divine confrontation (e.g. Lakshman's 14-year vigil, Bhishma's dilemma, Krishna-Arjuna dialogue, Sita's trial).
3. Strictly NO modern satellite/carbon-dating pseudosciences, and strictly BANNED modern street slang.
4. Deep emotional resonance, dharmic truth, and awe-inspiring sacred narrative depth.`
      : `CHANNEL PROFILE: High-Retention Long-Form Documentary.
CRITERIA FOR 90+ RETENTION:
1. High-concept core question with an irresistible curiosity gap.
2. Pacing density: New information or escalation every 60-90 seconds to prevent mid-video drop-off.
3. Substantial depth to sustain ${targetDuration} seconds without repetition.`;

  const prompt = [
    `You are the Chief Story Editor and YouTube Retention Showrunner for this channel.`,
    `Goal: Vet, score, and architect an exceptional, high-retention 5-Act long video story (${targetDuration}s).`,
    channelRules,
    `Already exported topics in channel history: ${JSON.stringify(notes.topics.map((t) => t.topic).slice(-25))}`,
    options.instructions ? `User instructions / preferences: ${options.instructions}` : '',
    requested
      ? `The user requested this topic: "${requested}".
Elevate this topic into its sharpest, highest-retention documentary angle, score its retention viability, and build its complete 5-Act Retention Story Map.`
      : `The user wants you to select the single best fresh, original topic with the highest viral retention potential for this channel. Avoid any topic already in history.`,
    `Score the topic strictly across the 4 retention gates (0-25 each, total 100):
- hookCuriosityScore (0-25): How irresistible is the opening hook and mystery in the first 15 seconds?
- pacingDensityScore (0-25): Can the story sustain escalation every 60-90 seconds for ${targetDuration}s without padding?
- stakesAndConflictScore (0-25): Are the stakes life-or-death, moral, or cosmic?
- sourceAndCanonDepthScore (0-25): Is there deep verifiable archival facts or authentic scriptural canon?
The totalScore must reflect the sum. Provide strengths and any weaknesses.

Build the 5-Act Retention Story Map:
- act1_hook ('0:00 - 1:30'): The immediate crisis, contradiction, or dilemma.
- act2_escalation ('1:30 - 4:30'): Complications, failing options, deepening trap.
- act3_midpoint_reversal ('4:30 - 7:00'): Unexpected twist, catastrophic breakdown, or hidden revelation.
- act4_climax ('7:00 - 9:15'): Supreme stand, decisive action, or divine vow fulfillment.
- act5_payoff_outro ('9:15 - End'): Earned consequence, philosophical truth, and seamless CTA.
- curiosityLoops: 2-4 specific curiosity hooks with promised payoffs.`,
    `Return ONLY a valid JSON object matching the requested schema.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const parsed = await validatedModelJson(
    {
      model: options.model,
      apiKey: options.apiKey,
      signal: options.signal,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert YouTube documentary showrunner and retention architect. Return only valid JSON conforming strictly to the schema.',
        },
        { role: 'user', content: prompt },
      ],
    },
    TopicVettingOutputSchema,
    'High-Retention Topic Vetting'
  );

  const total =
    parsed.scorecard.hookCuriosityScore +
    parsed.scorecard.pacingDensityScore +
    parsed.scorecard.stakesAndConflictScore +
    parsed.scorecard.sourceAndCanonDepthScore;

  const verdict: 'exceptional' | 'strong' | 'weak' =
    total >= 90 ? 'exceptional' : total >= 75 ? 'strong' : 'weak';

  const scorecard: RetentionScorecard = {
    ...parsed.scorecard,
    totalScore: total,
    verdict,
  };

  return {
    channel,
    topic: parsed.topic,
    angle: parsed.angle,
    scorecard,
    storyMap: parsed.storyMap,
    searchTitleCandidates: parsed.searchTitleCandidates,
    thumbnailVisualHook: parsed.thumbnailVisualHook,
    reason: parsed.reason,
  };
}
