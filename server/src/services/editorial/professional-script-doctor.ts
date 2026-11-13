import { z } from 'zod';
import { validatedModelJson } from '../model-json.js';
import type { ScenePlan, NarrationScene } from '../scene-plan.js';
import { identifyDocumentaryChannel, type DocumentaryChannel, type FiveActRetentionStoryMap } from './documentary-topic-vetter.js';

export interface GateAuditResult {
  score: number; // 0-25
  findings: string[];
  flawedSceneIds: string[];
}

export interface ScriptDoctorAuditReport {
  passNumber: number;
  totalScore: number; // 0-100
  passed: boolean;
  channel: DocumentaryChannel;
  gate1_hook: GateAuditResult;
  gate2_curiosityChain: GateAuditResult;
  gate3_dictionAndCadence: GateAuditResult;
  gate4_climaxAndOutro: GateAuditResult;
  deadZonesDetected: { startSceneId: string; endSceneId: string; reason: string }[];
  rewritePrescription: string;
  scenesToRepair: string[];
}

export interface ScriptDoctorResult {
  success: boolean;
  finalScore: number;
  initialScore: number;
  iterationsCount: number;
  scoreProgression: { pass: number; score: number }[];
  finalScenePlan: ScenePlan;
  auditReport: ScriptDoctorAuditReport;
  editorialNotes: string[];
}

const AuditResponseSchema = z.object({
  gate1_hook: z.object({
    score: z.number().min(0).max(25),
    findings: z.array(z.string().trim().min(1)).max(6),
    flawedSceneIds: z.array(z.string().trim()).max(5),
  }),
  gate2_curiosityChain: z.object({
    score: z.number().min(0).max(25),
    findings: z.array(z.string().trim().min(1)).max(6),
    flawedSceneIds: z.array(z.string().trim()).max(15),
  }),
  gate3_dictionAndCadence: z.object({
    score: z.number().min(0).max(25),
    findings: z.array(z.string().trim().min(1)).max(6),
    flawedSceneIds: z.array(z.string().trim()).max(15),
  }),
  gate4_climaxAndOutro: z.object({
    score: z.number().min(0).max(25),
    findings: z.array(z.string().trim().min(1)).max(6),
    flawedSceneIds: z.array(z.string().trim()).max(5),
  }),
  deadZonesDetected: z.array(
    z.object({
      startSceneId: z.string().trim(),
      endSceneId: z.string().trim(),
      reason: z.string().trim(),
    })
  ).max(5),
  rewritePrescription: z.string().trim().min(5),
  scenesToRepair: z.array(z.string().trim()).max(20),
});

/**
 * Evaluates a draft ScenePlan against the 4 YouTube High-Retention Gates.
 */
export async function auditScriptRetention(options: {
  scenePlan: ScenePlan;
  channelName?: string;
  channelGuidance?: string;
  storyMap?: FiveActRetentionStoryMap;
  passNumber?: number;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<ScriptDoctorAuditReport> {
  const channel = identifyDocumentaryChannel(options.channelName, options.channelGuidance);
  const passNumber = options.passNumber || 1;
  const scenesSummary = options.scenePlan.scenes.map((s, idx) => ({
    id: s.id,
    index: idx + 1,
    chapter: s.chapter,
    narration: s.narration,
    duration: s.duration,
    words: s.narration.trim().split(/\s+/).length,
  }));

  const channelRules =
    channel === 'against-the-odds'
      ? `CHANNEL AUDIT RULES: Against the Odds (True Survival / Disaster Documentary)
- GATE 1 (Hook): Must open immediately at the documented physical predicament. No generic greetings, no early childhood backstory. First 2 scenes must establish the danger and limiting option.
- GATE 2 (Curiosity Chain): Trace cause-and-effect: Danger -> failed options -> escalating constraints -> breakthrough. Flag any 'dead zone' (>45s of static background without new action/obstacle).
- GATE 3 (Diction & Cadence): Strictly fact-grounded English, clinical present-tense, verifiable telemetry. ZERO fabricated survivor quotes or melodrama. Sentences must be 8-14 words, punchy and breath-friendly.
- GATE 4 (Climax & Outro): Climax must land near 85-90% runtime. No 'In conclusion' triggers. Close with 1 case-specific question about a documented turning point or decision.`
      : channel === 'ancient-dharma'
      ? `CHANNEL AUDIT RULES: Ancient Dharma (Sanatana Dharma Sacred Epic Lore)
- GATE 1 (Hook): Must open immediately with a high-stakes sacred dilemma, divine vow (Pratigya), or cosmic paradox. First 2 scenes must create intense devotion and curiosity.
- GATE 2 (Curiosity Chain): Progression through sacred lore with continuous emotional stakes. Flag any dead zone where the story loses dramatic momentum.
- GATE 3 (Diction & Cadence): Strictly noble, elevated, scriptural Hindi (Devanagari). STRICTLY BAN cheap street slang ('तू', 'तेरा', 'तुझे', 'अरे', 'काय रे'). Use profound words and sacred danda (।) for natural pauses.
- GATE 4 (Climax & Outro): Climax must fulfill the divine promise before the outro. Outro must flow seamlessly into one respectful Hindi invitation to like, subscribe and comment without saying 'निष्कर्षतः'.`
      : `CHANNEL AUDIT RULES: High-Retention Long Video Documentary
- GATE 1: Hook & stakes in first 2 scenes.
- GATE 2: Continuous narrative momentum; no dead zones.
- GATE 3: Natural cadence, breath pauses, active verbs.
- GATE 4: Strong climax near end; smooth seamless CTA.`;

  const prompt = [
    `You are the Chief Script Doctor and YouTube Retention Auditor.`,
    `Audit this long-form script draft (Pass #${passNumber}) strictly against the 4 YouTube Retention Gates.`,
    channelRules,
    options.storyMap ? `Intended 5-Act Retention Story Map:\n${JSON.stringify(options.storyMap, null, 2)}` : '',
    `Script Scenes to Audit (${scenesSummary.length} scenes, ~${Math.round(scenesSummary.reduce((a, b) => a + (b.duration || 6), 0))}s runtime):\n${JSON.stringify(scenesSummary, null, 2)}`,
    `For each gate, award a score from 0 to 25 based on uncompromising quality.
If scenes fail, list their exact IDs in flawedSceneIds.
If total score is < 90, formulate an exacting rewritePrescription detailing how to fix the lagging scenes.
Return ONLY valid JSON matching the schema.`,
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
            'You are a rigorous YouTube documentary script doctor. Evaluate objectively, score strictly, and identify specific flawed scenes.',
        },
        { role: 'user', content: prompt },
      ],
    },
    AuditResponseSchema,
    'Script Retention Audit'
  );

  const totalScore =
    parsed.gate1_hook.score +
    parsed.gate2_curiosityChain.score +
    parsed.gate3_dictionAndCadence.score +
    parsed.gate4_climaxAndOutro.score;

  const passed = totalScore >= 90 && parsed.deadZonesDetected.length === 0;

  return {
    passNumber,
    totalScore,
    passed,
    channel,
    gate1_hook: parsed.gate1_hook,
    gate2_curiosityChain: parsed.gate2_curiosityChain,
    gate3_dictionAndCadence: parsed.gate3_dictionAndCadence,
    gate4_climaxAndOutro: parsed.gate4_climaxAndOutro,
    deadZonesDetected: parsed.deadZonesDetected,
    rewritePrescription: parsed.rewritePrescription,
    scenesToRepair: [
      ...new Set([
        ...parsed.scenesToRepair,
        ...parsed.gate1_hook.flawedSceneIds,
        ...parsed.gate2_curiosityChain.flawedSceneIds,
        ...parsed.gate3_dictionAndCadence.flawedSceneIds,
        ...parsed.gate4_climaxAndOutro.flawedSceneIds,
      ]),
    ],
  };
}

const RepairScenesOutputSchema = z.object({
  repairedScenes: z.array(
    z.object({
      id: z.string().trim(),
      narration: z.string().trim().min(5),
      imagePrompt: z.string().trim().min(10),
      videoPrompt: z.string().trim().optional(),
      explanationOfFix: z.string().trim(),
    })
  ).min(1),
});

/**
 * Repairs only the flawed scenes identified by the Script Doctor, preserving the strong scenes.
 */
async function repairFlawedScenes(options: {
  scenePlan: ScenePlan;
  auditReport: ScriptDoctorAuditReport;
  channelName?: string;
  channelGuidance?: string;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<ScenePlan> {
  const channel = identifyDocumentaryChannel(options.channelName, options.channelGuidance);
  const targetIds = new Set(options.auditReport.scenesToRepair);
  const scenesToFix = options.scenePlan.scenes.filter((s) => targetIds.has(s.id));
  if (!scenesToFix.length) return options.scenePlan;

  const prompt = [
    `You are the Expert Documentary Script Doctor executing Pass #${options.auditReport.passNumber + 1} repairs.`,
    `Channel: ${channel}`,
    `Audit Score: ${options.auditReport.totalScore}/100. Target: 90+/100.`,
    `Script Doctor Prescription:\n${options.auditReport.rewritePrescription}`,
    `Scenes requiring repair (${scenesToFix.length} scenes):\n${JSON.stringify(scenesToFix, null, 2)}`,
    channel === 'ancient-dharma'
      ? 'MANDATORY: Ensure elevated noble Hindi (Devanagari), zero banned slang, profound scriptural gravitas, breath-friendly cadence (8-14 words per sentence with danda ।).'
      : channel === 'against-the-odds'
      ? 'MANDATORY: Strictly verifiable facts, clinical present-tense suspense, true knowledge states, zero fabricated quotes.'
      : '',
    `Rewrite ONLY these ${scenesToFix.length} scenes to eliminate all audit findings. Return their exact IDs, improved narrations, and updated imagePrompts/videoPrompts.`,
    `Return ONLY JSON matching the schema.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const repaired = await validatedModelJson(
    {
      model: options.model,
      apiKey: options.apiKey,
      signal: options.signal,
      messages: [
        {
          role: 'system',
          content: 'You are an elite script doctor executing targeted scene repairs to achieve 90+ retention.',
        },
        { role: 'user', content: prompt },
      ],
    },
    RepairScenesOutputSchema,
    'Script Scene Repair'
  );

  const repairMap = new Map(repaired.repairedScenes.map((r) => [r.id, r]));

  const updatedScenes: NarrationScene[] = options.scenePlan.scenes.map((s) => {
    const fix = repairMap.get(s.id);
    if (!fix) return s;
    return {
      ...s,
      narration: fix.narration,
      imagePrompt: fix.imagePrompt || s.imagePrompt,
      ...(s.mediaType === 'video' && fix.videoPrompt ? { videoPrompt: fix.videoPrompt } : {}),
    };
  });

  return {
    ...options.scenePlan,
    scenes: updatedScenes,
  };
}

/**
 * Runs the iterative Script Doctor loop until the script achieves a 90+ retention score
 * or completes maximum iterations (up to 3 passes).
 */
export async function runIterativeScriptDoctor(options: {
  scenePlan: ScenePlan;
  channelName?: string;
  channelGuidance?: string;
  storyMap?: FiveActRetentionStoryMap;
  maxIterations?: number;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onPassProgress?: (pass: number, score: number, findings: string[]) => void;
}): Promise<ScriptDoctorResult> {
  const maxLoops = Math.min(3, Math.max(1, options.maxIterations || 3));
  let currentPlan = options.scenePlan;
  let latestAudit: ScriptDoctorAuditReport | null = null;
  const scoreProgression: { pass: number; score: number }[] = [];
  const editorialNotes: string[] = [];

  for (let pass = 1; pass <= maxLoops; pass++) {
    options.signal?.throwIfAborted();

    const audit = await auditScriptRetention({
      scenePlan: currentPlan,
      channelName: options.channelName,
      channelGuidance: options.channelGuidance,
      storyMap: options.storyMap,
      passNumber: pass,
      model: options.model,
      apiKey: options.apiKey,
      signal: options.signal,
    });

    latestAudit = audit;
    scoreProgression.push({ pass, score: audit.totalScore });
    options.onPassProgress?.(pass, audit.totalScore, [
      ...audit.gate1_hook.findings,
      ...audit.gate2_curiosityChain.findings,
      ...audit.gate3_dictionAndCadence.findings,
      ...audit.gate4_climaxAndOutro.findings,
    ]);

    editorialNotes.push(
      `Pass #${pass} Retention Score: ${audit.totalScore}/100 [Hook: ${audit.gate1_hook.score}/25, Chain: ${audit.gate2_curiosityChain.score}/25, Diction: ${audit.gate3_dictionAndCadence.score}/25, Climax: ${audit.gate4_climaxAndOutro.score}/25]`
    );

    // If score >= 90 and passed, we have achieved high retention perfection!
    if (audit.passed || pass === maxLoops || audit.scenesToRepair.length === 0) {
      if (audit.passed) {
        editorialNotes.push(`🎉 Verified Perfect Master Script (Score ${audit.totalScore}/100) achieved on Pass #${pass}.`);
      }
      break;
    }

    // Otherwise, execute targeted repairs on flawed scenes and iterate
    editorialNotes.push(`Executing targeted repairs on ${audit.scenesToRepair.length} scenes: ${audit.scenesToRepair.join(', ')}`);
    currentPlan = await repairFlawedScenes({
      scenePlan: currentPlan,
      auditReport: audit,
      channelName: options.channelName,
      channelGuidance: options.channelGuidance,
      model: options.model,
      apiKey: options.apiKey,
      signal: options.signal,
    });
  }

  const initialScore = scoreProgression[0]?.score || 0;
  const finalScore = scoreProgression[scoreProgression.length - 1]?.score || initialScore;

  return {
    success: finalScore >= 85,
    finalScore,
    initialScore,
    iterationsCount: scoreProgression.length,
    scoreProgression,
    finalScenePlan: currentPlan,
    auditReport: latestAudit!,
    editorialNotes,
  };
}
