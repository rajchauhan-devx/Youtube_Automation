import { store } from './store.js';
import { currentWorkspace } from './workspace.js';
import { getGeminiApiKey, chat } from './gemini.js';
import { parseSimpleTagPackage } from './simple-tag-package.js';
import { compileMotionTemplate, resolveCanonicalTemplateId, MOTION_TEMPLATE_CATALOG, deriveShortLabel } from './dynamic-motion-engine.js';
import { reviewAndFixMotionGraphics } from './motion-graphics-reviewer.js';
import type { DynamicMotionGraphicData } from '@tubeflow/editing-contracts';

export interface MotionDirectorSceneUpgrade {
  sceneIndex: number;
  template: string;
  metric?: string;
  unit?: string;
  label: string;
  placement: 'top' | 'top-right' | 'top-left' | 'center' | 'bottom-right' | 'bottom-left';
  cue: string;
  directorRationale: string;
  visualImpact: string;
}

export interface MotionDirectorReport {
  directorVision: string;
  channelProfile: string;
  sceneUpgrades: MotionDirectorSceneUpgrade[];
  totalScenes: number;
  activeGraphicsCount: number;
  breathingRoomScenes: number;
  completedAt: string;
}

export interface RunMotionDirectorOptions {
  scriptId: string;
  channelName?: string;
  channelProfile?: string;
  customInstructions?: string;
  apiKey?: string;
  model?: string;
}

/**
 * AI MOTION GRAPHICS DIRECTOR:
 * Deeply re-examines the completed video script after preview generation.
 * Eliminates 100% of boring text boxes and paragraph cards, and assigns
 * authentic, high-impact vector motion graphics (Radar HUDs, Route Trajectories,
 * EKG Pulse Monitors, Circular Gauges, Verified Seals, Victory Crests, 3D CAD Wireframes).
 */
export async function runMotionGraphicsDirector(
  opts: RunMotionDirectorOptions
): Promise<{ script: any; graphics: DynamicMotionGraphicData[]; report: MotionDirectorReport }> {
  const { scriptId, channelName, channelProfile, customInstructions, apiKey, model } = opts;
  const script = store.getById<any>('scripts', scriptId);
  if (!script) {
    throw new Error(`Script not found: ${scriptId}`);
  }

  const effectiveKey = getGeminiApiKey(apiKey);
  const workspaceProfile = currentWorkspace().profile;
  const effectiveProfile = channelProfile || script.section || workspaceProfile || 'against_the_odds';
  const effectiveChannel = channelName || script.name || (effectiveProfile === 'ancient_dharma' ? 'Ancient Dharma' : 'Against the Odds');

  console.log(`[motion-director] Starting Deep Visual Re-Examination for script ${scriptId} [${effectiveProfile}]...`);

  // 1. Extract scenes & current tags
  let scenes: any[] = [];
  let parsedPackage: any = null;
  const rawText = script.aiResponse || script.extractedScript || script.narration || '';

  try {
    parsedPackage = parseSimpleTagPackage(rawText, { isImageOnly: true });
    scenes = parsedPackage.scenes || [];
  } catch (err) {
    console.warn('[motion-director] Could not parse simple tag package, falling back to scenePlan:', err);
    if (Array.isArray(script.scenePlan?.scenes)) {
      scenes = script.scenePlan.scenes;
    }
  }

  if (scenes.length === 0) {
    throw new Error('Script does not contain readable scenes. Generate a preview script first.');
  }

  // Decide FRESH from content every run: previous overlay hints/tags are output of an
  // earlier pass and would otherwise lock every video into the same template sequence.
  scenes = scenes.map((s: any) => {
    const { motionGraphics: _ignored, ...rest } = s;
    void _ignored;
    return { ...rest };
  });

  // 2. Perform Deep Director Re-Examination Pass with Gemini
  let directorPlan: { directorVision: string; upgrades: MotionDirectorSceneUpgrade[] } | null = null;

  if (effectiveKey) {
    try {
      const sceneDescriptions = scenes.map((s: any, idx: number) => {
        return `SCENE ${idx + 1}:
- Narration: "${s.narration}"
- Visual Shot: "${s.imagePrompt || s.videoPrompt || ''}"`;
      }).join('\n\n');

      const catalog = MOTION_TEMPLATE_CATALOG.map(t => `- "${t.id}": ${t.look}`).join('\n');

      const systemPrompt = `You are the Master Motion Graphics & VFX Director (inspired by top-tier Vox, Lemmino, MagnatesMedia, and Apple Keynote presentations).
You are conducting a thorough, deep-dive VISUAL RE-EXAMINATION of a completed video script and its scene beats.

YOUR SOLE MISSION:
1. ELIMINATE 100% OF BORING TEXT BOXES, TITLE CARDS, PARAGRAPH BLOCKS, AND LOWER THIRDS.
2. Overlays must NEVER cover the focal subject or caption zones. Use transparent vector graphics with glowing lines, dials, sweeps, and waveforms.
3. MATCH CONTENT: the template must be justified by what is literally happening in the narration/visual shot of that scene (a voyage → route_trajectory; a vital-sign crisis → heartbeat_pulse; a percentage → circular_progress; a money figure → metric_ticker; a machine cutaway → temple_architecture; a decryption → matrix_rain).
4. VARY: never use the same template on more than ~40% of scenes and never fall into a repeating sequence.
5. BREATHING ROOM: scenes where the footage already tells the story get template "none". Target 50-75% of scenes carrying a graphic; the rest stay clean.
6. MINIMAL TEXT: "label" is OPTIONAL and must be at most 3-4 words grounded in that scene's narration (an entity name, a place, or a metric). Omit "label" entirely when a pure visual works. NEVER invent generic labels like "KEY INTEL", "CORE EVIDENCE" or "BREAKING".
7. "metric" (optional): a number+unit that actually appears in that scene's narration (e.g. "-40°C", "800 NM", "94%"). Omit when no number exists.
8. "cue" must be an EXACT contiguous phrase copied from that scene's narration (max 12 words).

RENDERABLE TEMPLATE CATALOG (choose only from these ids):
${catalog}

CHANNEL IDENTITY: "${effectiveChannel}" (Profile: ${effectiveProfile}) — bias template choices toward the channel's visual identity but never at the cost of content relevance.

OUTPUT ONLY A VALID JSON OBJECT (no markdown outside the JSON):
{
  "directorVision": "Multi-sentence artistic summary of the motion graphics direction for this video...",
  "upgrades": [
    {
      "sceneIndex": 0,
      "template": "<template id from the catalog, or \"none\">",
      "metric": "<optional number+unit copied from this scene's narration>",
      "unit": "<optional unit>",
      "label": "<optional 2-4 word label grounded in this scene's narration, or omit>",
      "placement": "top-right",
      "cue": "<exact contiguous phrase copied from this scene's narration>",
      "directorRationale": "Why this template serves this scene's story beat.",
      "visualImpact": "What the viewer sees on screen."
    }
  ]
}`;

      const res = await chat(effectiveKey, {
        model: model || 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the full script and scene breakdown to re-examine:\n\n${sceneDescriptions}\n\nCustom Director Instructions: ${customInstructions || 'Ensure zero text boxes; assign only pure visual motion graphics.'}` }
        ],
        json: true,
        temperature: 0.4,
      });

      const content = res?.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.upgrades)) {
          directorPlan = {
            directorVision: parsed.directorVision || 'Cinematic transparent vector motion graphics pass.',
            upgrades: parsed.upgrades,
          };
        }
      }
    } catch (llmErr) {
      console.warn('[motion-director] LLM director pass error, using heuristic director fallback:', llmErr);
    }
  }

  // 3. Fallback Heuristic Director if LLM was unavailable or failed
  if (!directorPlan) {
    directorPlan = generateHeuristicDirectorPlan(scenes, effectiveProfile, effectiveChannel);
  }

  // 4. Compile the Director's Motion Graphics and Update Scenes
  const compiledGraphics: DynamicMotionGraphicData[] = [];
  const updatedScenes = [...scenes];

  for (const upgrade of directorPlan.upgrades) {
    const sIdx = upgrade.sceneIndex;
    const scene = updatedScenes[sIdx];
    if (!scene) continue;

    const canonicalTemplate = resolveCanonicalTemplateId(upgrade.template);
    if (canonicalTemplate === 'none' || canonicalTemplate === 'skip') {
      scene.motionGraphics = [{ templateId: 'none', type: 'none' }];
      continue;
    }

    const narration = scene.narration || '';
    const cleanCue = upgrade.cue || narration.slice(0, 30);
    const label = typeof upgrade.label === 'string' ? upgrade.label.trim().slice(0, 40) : '';
    const detail = upgrade.metric ? (upgrade.unit && !upgrade.metric.includes(upgrade.unit) ? `${upgrade.metric} ${upgrade.unit}`.trim() : upgrade.metric) : undefined;

    const sceneOverlay = {
      source: 'director',
      templateId: canonicalTemplate,
      type: canonicalTemplate,
      metric: upgrade.metric,
      unit: upgrade.unit,
      label: label || undefined,
      title: label || undefined,
      detail,
      placement: upgrade.placement || 'top-right',
      cuePhrase: cleanCue,
      cue: cleanCue,
      directorRationale: upgrade.directorRationale,
    };

    scene.motionGraphics = [sceneOverlay];

    // Compile into production GSAP/HyperFrames vector graphic
    try {
      const compiled = compileMotionTemplate(
        {
          templateId: canonicalTemplate,
          sceneIndex: sIdx,
          title: label,
          detail,
          badge: upgrade.unit || undefined,
          statValue: upgrade.metric,
          statUnit: upgrade.unit,
          placement: upgrade.placement as any,
          cuePhrase: cleanCue,
          startSec: 1.0,
          durationSec: 4.5,
        },
        effectiveProfile
      );
      compiledGraphics.push(compiled);
    } catch (compErr) {
      console.warn(`[motion-director] Error compiling template ${canonicalTemplate} for scene ${sIdx}:`, compErr);
    }
  }

  // 5. Reconstruct updated script text with revised <overlay[N]> tags
  let upgradedAiResponse = script.aiResponse || '';
  for (let i = 0; i < updatedScenes.length; i++) {
    const sc = updatedScenes[i];
    const mg = sc.motionGraphics?.[0];
    const sceneNum = i + 1;

    const numberedTagRegex = new RegExp(
      `<(?:overlay|motion_graphic|metadata)\\s*(?:\\[\\s*${sceneNum}\\s*\\]|${sceneNum}(?![\\d\\]])|(?:\\s+(?:id|scene|index)=["']?${sceneNum}["']?))[^>]*>[\\s\\S]*?<\\/(?:overlay|motion_graphic|metadata)(?:\\s*(?:\\[\\s*${sceneNum}\\s*\\]|${sceneNum}(?![\\d\\]])|\\b))?\\s*>`,
      'i'
    );
    const unnumberedTagRegex = new RegExp(
      `<(?:overlay|motion_graphic|metadata)\\b[^>]*>[\\s\\S]*?<\\/(?:overlay|motion_graphic|metadata)\\s*>`,
      'i'
    );

    if (!mg || mg.templateId === 'none') {
      const noneBlock = `<overlay[${sceneNum}]>\ntemplate: none\n</overlay[${sceneNum}]>`;
      if (numberedTagRegex.test(upgradedAiResponse)) {
        upgradedAiResponse = upgradedAiResponse.replace(numberedTagRegex, noneBlock);
      } else if (unnumberedTagRegex.test(upgradedAiResponse)) {
        upgradedAiResponse = upgradedAiResponse.replace(unnumberedTagRegex, noneBlock);
      }
      continue;
    }

    const overlayBlock = `<overlay[${sceneNum}]>
template: ${mg.templateId}
${mg.metric ? `metric: ${mg.metric}\n` : ''}${mg.unit ? `unit: ${mg.unit}\n` : ''}${(mg.label || mg.title) ? `label: ${mg.label || mg.title}\n` : ''}placement: ${mg.placement || 'top-right'}
cue: ${mg.cuePhrase || sc.narration?.slice(0, 25) || ''}
</overlay[${sceneNum}]>`;

    if (numberedTagRegex.test(upgradedAiResponse)) {
      upgradedAiResponse = upgradedAiResponse.replace(numberedTagRegex, overlayBlock);
    } else if (unnumberedTagRegex.test(upgradedAiResponse)) {
      upgradedAiResponse = upgradedAiResponse.replace(unnumberedTagRegex, overlayBlock);
    } else {
      // Append right after the corresponding image prompt tag
      const promptRegex = new RegExp(`(<\\/(?:image_prompt|video_prompt)(?:\\[\\s*${sceneNum}\\s*\\]|\\s*${sceneNum}(?![\\d\\]]))\\s*>)`, 'i');
      if (promptRegex.test(upgradedAiResponse)) {
        upgradedAiResponse = upgradedAiResponse.replace(promptRegex, `$1\n\n${overlayBlock}`);
      } else {
        upgradedAiResponse += `\n\n${overlayBlock}`;
      }
    }
  }

  // 6. Build the Director's Audit Report
  const report: MotionDirectorReport = {
    directorVision: directorPlan.directorVision,
    channelProfile: effectiveProfile,
    sceneUpgrades: directorPlan.upgrades,
    totalScenes: scenes.length,
    activeGraphicsCount: compiledGraphics.length,
    breathingRoomScenes: scenes.length - compiledGraphics.length,
    completedAt: new Date().toISOString(),
  };

  // 7. Persist to store (wiping out any lingering legacy text cards)
  const updatedScript = {
    ...script,
    aiResponse: upgradedAiResponse,
    scenePlan: {
      ...(script.scenePlan || {}),
      version: 1,
      title: script.scenePlan?.title || script.name || 'Directed Episode',
      scenes: updatedScenes,
    },
    dynamicMotionGraphics: compiledGraphics,
    extraPopups: [], // WIPE OUT giant dark text cards!
    editingProjectId: undefined, // WIPE OUT legacy documentary text cards!
    motionDirectorReport: report,
  };

  store.add('scripts', updatedScript);
  console.log(`[motion-director] Director pass complete! Compiled ${compiledGraphics.length} pure visual motion graphics.`);

  // 8. AUTOMATIC AI VISUAL REVIEWER PASS:
  // Inspects from a user's point of view: checks safe zones, screen edge clipping,
  // focal subject occlusion, and sizing problems, and auto-fixes all of them before finishing.
  console.log(`[motion-director] Launching AI Visual Reviewer & Auto-Fixer pass...`);
  try {
    const reviewResult = await reviewAndFixMotionGraphics({
      scriptId,
      aspectRatio: '9:16',
      channelProfile: effectiveProfile,
      apiKey,
      model,
    });
    return {
      script: reviewResult.script,
      graphics: reviewResult.graphics,
      report,
    };
  } catch (revErr) {
    console.warn('[motion-director] Reviewer pass encountered non-blocking warning, returning directed script:', revErr);
    return {
      script: updatedScript,
      graphics: compiledGraphics,
      report,
    };
  }
}

/**
 * Deterministic Heuristic Director Plan (offline fallback):
 * Content-driven — matches templates to narration keywords, derives labels from
 * the actual narration, and rotates through the full catalog with a stable
 * per-script seed so different videos never share the same fixed sequence.
 */
function generateHeuristicDirectorPlan(
  scenes: any[],
  profile: string,
  channel: string
): { directorVision: string; upgrades: MotionDirectorSceneUpgrade[] } {
  const upgrades: MotionDirectorSceneUpgrade[] = [];

  // Channel-identity template pools — used as ordering preference, not as a fixed sequence.
  const profilePools: Record<string, string[]> = {
    against_the_odds: ['radar_compass', 'circular_progress', 'heartbeat_pulse', 'route_trajectory', 'sniper_lock', 'metric_ticker', 'verified_seal', 'alert_exclamation', 'gauge_needle', 'redacted_stamp'],
    ancient_dharma: ['chakra_mandala', 'sanskrit_shloka_reveal', 'temple_architecture', 'historical_timeline', 'divine_weapon_showcase', 'victory_crest', 'ancient_scroll_unfurl', 'ancient_india_map', 'cosmic_universe_explainer', 'sacred_geometry_yantra'],
    talvora: ['sound_wave', 'heartbeat_pulse', 'magnifying_glass', 'sniper_lock', 'redacted_stamp', 'verified_seal', 'question_mark', 'location_pin'],
    blender_3d: ['temple_architecture', 'gauge_needle', 'circular_progress', 'metric_ticker', 'box_highlight', 'route_trajectory', 'verified_seal'],
  };
  const pool = profilePools[profile] || profilePools.against_the_odds;

  // Narration-keyword → template affinities (checked before the profile pool).
  const keywordAffinities: Array<[RegExp, string]> = [
    [/(?:ship|voyage|ocean|sailed|crossed|route|march|journey|expedition|मार्ग|यात्रा)/i, 'route_trajectory'],
    [/(?:heart|pulse|bpm|vitals|cardiac|panic|breath|दिल|धड़कन)/i, 'heartbeat_pulse'],
    [/(?:\d+\s?%|percent|odds|probability|chance|margin|प्रतिशत)/i, 'circular_progress'],
    [/(?:\$|%|\d{2,}|crore|million|billion|surge|price|cost|करोड़|लाख)/i, 'metric_ticker'],
    [/(?:radar|navigate|compass|azimuth|bearing|coordinates|दिशा)/i, 'radar_compass'],
    [/(?:temple|machine|engine|blueprint|structure|architecture|wireframe|मन्दिर|शिल्प)/i, 'temple_architecture'],
    [/(?:timeline|era|epoch|century|years later|युग|कालक्रम)/i, 'historical_timeline'],
    [/(?:secret|classified|hidden|declassified|rahasya|रहस्य|गुप्त)/i, 'redacted_stamp'],
    [/(?:verified|proven|confirmed|authenticated|प्रमाणित)/i, 'verified_seal'],
    [/(?:victory|triumph|won|defeated|conquer|विजय)/i, 'victory_crest'],
    [/(?:exploded|blast|impact|crash|eruption|explosion|विस्फोट)/i, 'particle_explosion'],
    [/(?:wave|flood|tsunami|liquid|water surge|बाढ़|लहर)/i, 'liquid_wave'],
    [/(?:radio|signal|frequency|intercept|wiretap|संकेत)/i, 'sound_wave'],
    [/(?:where|location|place|city|reached|स्थान|स्थल)/i, 'location_pin'],
    [/(?:why|how|what|who|mystery|question|unknown|क्यों|कैसे)/i, 'question_mark'],
    [/(?:manuscript|scripture|scroll|verse|shloka|mantra|श्लोक|पाण्डुलिपि)/i, 'ancient_scroll_unfurl'],
    [/(?:deity|god|goddess|avatar|incarnation|revealed|देवी|अवतार)/i, 'divine_character_intro'],
    [/(?:warn|danger|hazard|critical|risk|चेतावनी|खतरा)/i, 'alert_exclamation'],
    [/(?:idea|realized|discovered|breakthrough|eureka|खोज)/i, 'idea_lightbulb'],
    [/(?:chart|data|statistics|trend|graph|आँकड़े)/i, 'area_chart'],
  ];

  // Stable per-script rotation seed so each video gets a different sequence.
  const joined = scenes.map((s) => s.narration || '').join('|').slice(0, 4000);
  let seed = 5381;
  for (let i = 0; i < joined.length; i++) seed = ((seed << 5) + seed + joined.charCodeAt(i)) >>> 0;

  const usedCounts = new Map<string, number>();
  let poolCursor = seed % pool.length;

  const pickTemplate = (narration: string, i: number): string => {
    for (const [pattern, template] of keywordAffinities) {
      if (pattern.test(narration)) {
        // Avoid hammering one affinity template on every matching scene
        const count = usedCounts.get(template) || 0;
        if (count < Math.max(2, Math.ceil(scenes.length / 4))) {
          usedCounts.set(template, count + 1);
          return template;
        }
        break;
      }
    }
    const template = pool[Math.floor(poolCursor) % pool.length];
    poolCursor += 1 + (seed % 3); // uneven stride breaks fixed cycles
    return template;
  };

  const placements = ['top-right', 'top-left', 'top', 'center'] as const;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const narration = sc.narration || '';

    // Breathing room: keep ~1/3 of later scenes clean when the video is long enough
    if (scenes.length >= 4 && i % 3 === 2) {
      upgrades.push({
        sceneIndex: i,
        template: 'none',
        label: '',
        placement: 'center',
        cue: '',
        directorRationale: 'Letting the footage breathe without overlay clutter.',
        visualImpact: 'Clean footage'
      });
      continue;
    }

    const template = i === 0
      ? pool[seed % pool.length] // hook scene still comes from the channel pool
      : pickTemplate(narration, i);
    const metricMatch = narration.match(/[-+]?\d[\d,.]*\s?(?:°\s?[CF]|%|NM|km|kg|bpm|kHz|VPH|mm|crore|लाख|करोड़|वर्ष)?/i);
    const metric = metricMatch ? metricMatch[0].trim() : '';
    const label = deriveShortLabel(narration, 3) || '';

    upgrades.push({
      sceneIndex: i,
      template,
      metric: metric || undefined,
      unit: '',
      label,
      placement: placements[(i + seed) % placements.length] as any,
      cue: narration.slice(0, 25),
      directorRationale: `Content-matched visual graphic for Scene ${i + 1} (${channel}).`,
      visualImpact: `Vector ${template.replace(/_/g, ' ')} overlay`
    });
  }

  return {
    directorVision: `Heuristic Director vision for ${channel}: narration-matched transparent vector overlays with breathing room and minimal text.`,
    upgrades,
  };
}
