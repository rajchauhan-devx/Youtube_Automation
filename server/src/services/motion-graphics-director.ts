import { store } from './store.js';
import { currentWorkspace } from './workspace.js';
import { getGeminiApiKey, chat } from './gemini.js';
import { parseSimpleTagPackage } from './simple-tag-package.js';
import { compileMotionTemplate, resolveCanonicalTemplateId } from './dynamic-motion-engine.js';
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

  // 2. Perform Deep Director Re-Examination Pass with Gemini
  let directorPlan: { directorVision: string; upgrades: MotionDirectorSceneUpgrade[] } | null = null;

  if (effectiveKey) {
    try {
      const sceneDescriptions = scenes.map((s, idx) => {
        const existingMg = s.motionGraphics?.[0];
        return `SCENE ${idx + 1}:
- Narration: "${s.narration}"
- Visual Shot: "${s.imagePrompt || s.videoPrompt || ''}"
- Current Overlay Hint: ${existingMg ? `template=${existingMg.templateId || existingMg.type}, label=${existingMg.label || existingMg.title}, metric=${existingMg.metric || existingMg.detail}` : 'None'}`;
      }).join('\n\n');

      const systemPrompt = `You are the Master Motion Graphics & VFX Director (inspired by top-tier Vox, Lemmino, MagnatesMedia, and Apple Keynote presentations).
You are conducting a thorough, deep-dive VISUAL RE-EXAMINATION of a completed video script and its scene beats.

YOUR SOLE MISSION:
1. ELIMINATE 100% OF BORING TEXT BOXES, TITLE CARDS, PARAGRAPH BLOCKS, AND LOWER THIRDS.
2. EVERY OVERLAY MUST BE A PURE VISUAL VECTOR MOTION GRAPHIC.
3. Overlays must NEVER cover the focal subject or caption zones. Use transparent vector graphics with glowing lines, dials, sweeps, waveforms, and badges.
4. BREATHING ROOM: Not every scene needs a graphic! Scenes where visual footage should speak for itself MUST use "none". (Ideal density: 50% to 75% of scenes have a graphic).

SUPPORTED PURE VISUAL TEMPLATES (Pick the best match for each scene beat):
- "particle_explosion": Energetic particle blast, shockwave ring & radiating embers. Ideal for climaxes, major impacts, breakthroughs, explosive reveals.
- "liquid_wave": Fluid undulating sine wave liquid surge. Ideal for ocean voyages, fluid dynamics, tension surges.
- "area_chart": Analytical area metric chart with gradient fill & reveal line. Ideal for survival curves, probability tracking, analytics.
- "matrix_rain": Cascading digital rain cipher stream. Ideal for intelligence decrypts, digital espionage, codebreaking.
- "bokeh_circles": Floating ethereal glowing orbs. Ideal for sacred reveals, wonder, atmospheric emotion.
- "radar_compass": Naval / Polar / Tactical Radar Compass HUD with 360° rotating azimuth sweep and degree marks. Ideal for expeditions, survival navigation, tracking location.
- "route_trajectory": Map trajectory route arc across distances (e.g. 800 NM, chariot path, flight trajectory).
- "heartbeat_pulse": Oscilloscope EKG waveform pulse monitor with glowing lead dot and BPM telemetry. Ideal for crisis, tension, survival panic, polygraph stress.
- "sound_wave": 32-bar audio equalizer / wiretap frequency spectrum. Ideal for radio distress, audio intercept, atmospheric suspense.
- "circular_progress": 360° circular biometric survival gauge or speedometer dial with percentage / rate. Ideal for biometrics, odds, pressure, engine speed.
- "verified_seal": Emerald / Royal Verified Seal with shockwave pulse ring (e.g. 0 Lost, Authenticated, Verified Case). Ideal for milestone resolutions and proof.
- "victory_crest": Golden laurel victory crest with light flare or divine aura. Ideal for climax and triumph.
- "sniper_lock": Tactical corner framing brackets snapping inward with crosshair reticle and rangefinder. Ideal for target context and subject lock.
- "chakra_mandala": Rotating 12-spoke Vedic solar chakra mandala with sacred geometry rings. Ideal for Ancient Dharma divine reveals and cosmic yuga epochs.
- "temple_architecture": 3D CAD wireframe blueprint with precision dimension callout (e.g. 14.2 mm). Ideal for engineering, mechanism explainer, architecture.
- "magnifying_glass": Precision optical inspection loupe with realistic reflection glare. Ideal for forensic evidence, close-up inspection.
- "redacted_stamp": Stamped classified / declassified archival stamp.
- "none": Leave scene clean for pure footage.

CHANNEL IDENTITY: "${effectiveChannel}" (Profile: ${effectiveProfile})
- Against the Odds: Focus on radar HUDs, route trajectory arcs, EKG pulse waves, survival gauges (94%), and emerald 0-lost seals.
- Ancient Dharma: Focus on rotating chakra mandalas, sacred map paths, yuga timelines, divine weapon showcases, and golden victory crests.
- Talvora: Focus on audio wiretap waveforms, heartbeat EKG pulse waves, noir loupes, and case file verified seals.
- Curious Cutaways: Focus on 3D CAD blueprints, dimension callouts (14.2mm), flow dials, and cross-section tags.

EXAMINE EVERY SCENE THOROUGHLY AND OUTPUT ONLY A VALID JSON OBJECT (no markdown outside the JSON):
{
  "directorVision": "Multi-sentence artistic summary of the motion graphics direction for this video...",
  "upgrades": [
    {
      "sceneIndex": 0,
      "template": "radar_compass",
      "metric": "-40°C",
      "unit": "C",
      "label": "POLAR AZIMUTH // 78°S",
      "placement": "top-right",
      "cue": "exact phrase from scene narration",
      "directorRationale": "Opens with immediate tactical stakes using a glowing naval radar HUD rather than a generic text title.",
      "visualImpact": "Pure vector cyan HUD sweep with degree markers"
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

    const sceneOverlay = {
      templateId: canonicalTemplate,
      type: canonicalTemplate,
      metric: upgrade.metric,
      unit: upgrade.unit,
      label: upgrade.label,
      title: upgrade.label,
      detail: upgrade.metric ? (upgrade.unit ? `${upgrade.metric} ${upgrade.unit}` : upgrade.metric) : undefined,
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
          title: upgrade.label,
          detail: sceneOverlay.detail || upgrade.label,
          badge: upgrade.unit || (upgrade.metric ? `${upgrade.metric}` : undefined),
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
${mg.metric ? `metric: ${mg.metric}\n` : ''}${mg.unit ? `unit: ${mg.unit}\n` : ''}label: ${mg.label || mg.title || 'KEY INTEL'}
placement: ${mg.placement || 'top-right'}
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
 * Deterministic Heuristic Director Plan:
 * Guarantees high-impact visual graphics tailored to channel profiles even offline.
 */
function generateHeuristicDirectorPlan(
  scenes: any[],
  profile: string,
  channel: string
): { directorVision: string; upgrades: MotionDirectorSceneUpgrade[] } {
  const upgrades: MotionDirectorSceneUpgrade[] = [];

  const profileTemplates = {
    against_the_odds: [
      { template: 'radar_compass', label: 'POLAR AZIMUTH // 78°S', metric: '-40°C', unit: 'C', placement: 'top-right' },
      { template: 'route_trajectory', label: 'DRIFT TRAJECTORY', metric: '800 NM', unit: 'NM', placement: 'top' },
      { template: 'heartbeat_pulse', label: 'CRITICAL VITALS', metric: '148 BPM', unit: 'BPM', placement: 'center' },
      { template: 'circular_progress', label: 'SURVIVAL MARGIN', metric: '6%', unit: '%', placement: 'top-right' },
      { template: 'verified_seal', label: 'MISSION ACCOMPLISHED', metric: '0 LOST', unit: '', placement: 'center' },
    ],
    ancient_dharma: [
      { template: 'chakra_mandala', label: 'अखण्ड साधना // कालचक्र', metric: '१४ वर्ष', unit: '', placement: 'center' },
      { template: 'temple_architecture', label: 'नागर वास्तु शिल्प', metric: '१०८ दिशा', unit: '', placement: 'top-right' },
      { template: 'historical_timeline', label: 'त्रेता युग कालक्रम', metric: 'त्रेता युग', unit: '', placement: 'bottom-right' },
      { template: 'divine_weapon_showcase', label: 'दिव्यास्त्र // पिनाक', metric: 'अमोघ तेज', unit: '', placement: 'center' },
      { template: 'victory_crest', label: 'सत्य सनातन विजय', metric: 'धर्म विजय', unit: '', placement: 'center' },
    ],
    talvora: [
      { template: 'sound_wave', label: 'AUDIO INTERCEPT // FREQUENCY', metric: '42.8 kHz', unit: 'kHz', placement: 'top' },
      { template: 'sniper_lock', label: 'SURVEILLANCE LOCK', metric: 'TARGET ACQUIRED', unit: '', placement: 'center' },
      { template: 'heartbeat_pulse', label: 'POLYGRAPH // STRESS', metric: 'DECEPTION DETECTED', unit: '', placement: 'center' },
      { template: 'magnifying_glass', label: 'FORENSIC EVIDENCE', metric: 'LATENT PRINT', unit: '', placement: 'center' },
      { template: 'verified_seal', label: 'CASE CLOSED', metric: 'CONFIRMED', unit: '', placement: 'center' },
    ],
    blender_3d: [
      { template: 'temple_architecture', label: '3D CAD WIREFRAME', metric: '14.2 mm', unit: 'mm', placement: 'top-right' },
      { template: 'circular_progress', label: 'OSCILLATION SPEED', metric: '28,800 VPH', unit: 'VPH', placement: 'center' },
      { template: 'route_trajectory', label: 'GEAR TOOTH AXIS', metric: '0.02 mm TOLERANCE', unit: '', placement: 'top' },
      { template: 'gauge_needle', label: 'TORQUE / PRESSURE', metric: '8.4 Nm', unit: 'Nm', placement: 'top-right' },
      { template: 'verified_seal', label: 'TOLERANCE VERIFIED', metric: 'PASSED', unit: '', placement: 'center' },
    ]
  };

  const pool = profileTemplates[profile as keyof typeof profileTemplates] || profileTemplates.against_the_odds;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const narration = sc.narration || '';
    // Every 4th scene can be breathing room if scene count > 4
    if (scenes.length > 4 && i % 4 === 3) {
      upgrades.push({
        sceneIndex: i,
        template: 'none',
        label: 'BREATHING ROOM',
        placement: 'center',
        cue: '',
        directorRationale: 'Letting video footage breathe without overlay clutter.',
        visualImpact: 'Clean footage'
      });
      continue;
    }

    const tpl = pool[i % pool.length];
    upgrades.push({
      sceneIndex: i,
      template: tpl.template,
      metric: tpl.metric,
      unit: tpl.unit,
      label: tpl.label,
      placement: tpl.placement as any,
      cue: narration.slice(0, 25),
      directorRationale: `Directed cinematic visual graphic for Scene ${i + 1} (${channel}). Zero text boxes.`,
      visualImpact: `Vector ${tpl.template.replace(/_/g, ' ')} overlay`
    });
  }

  return {
    directorVision: `Heuristic Director vision for ${channel}: high-energy transparent vector overlays customized to scene cadence.`,
    upgrades,
  };
}
