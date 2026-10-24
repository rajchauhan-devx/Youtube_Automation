import type {
  SceneGraphData,
  SceneGraphNodeData,
  SceneGraphThemeData,
  EditingProject,
  ScenePlan,
} from '@tubeflow/editing-contracts';
import type { EditorialBeatPlan } from './sceneGraphPlanner.js';

export function getChannelUniverseTheme(accountId?: string, channelName?: string): SceneGraphThemeData {
  const norm = `${accountId || ''} ${channelName || ''}`.toLowerCase();

  // Ancient Dharma / Devotional
  if (/dharma|vedic|usr_1787934167716|default/i.test(norm)) {
    return {
      name: 'ancient_dharma',
      primary: '#C59B52',     // Muted burnished gold
      accent: '#A05238',      // Earth pigment
      background: '#00000000', // 100% transparent cardless backdrop
      text: '#FFF3D7',
      fontFamily: "'Noto Sans Devanagari', serif",
      secondaryFont: "'Noto Sans Devanagari', serif",
      lineWeight: 2,
      radius: 6,
    };
  }

  // Rule Zero / Cyber / Tactical
  if (/rule.?zero|acct_3ea89878|tactical|cyber/i.test(norm)) {
    return {
      name: 'rule_zero',
      primary: '#00F0FF',     // Cyber Cyan
      accent: '#00FF66',      // Phosphor Green
      background: '#00000000', // 100% transparent cardless backdrop
      text: '#F0FBFF',
      fontFamily: "'JetBrains Mono', monospace",
      secondaryFont: "'JetBrains Mono', monospace",
      lineWeight: 2,
      radius: 0,
    };
  }

  // Against the Odds / Survival / Disaster
  if (/odds|acct_620a1d5e|survival|disaster/i.test(norm)) {
    return {
      name: 'against_the_odds',
      primary: '#FACC15',     // Industrial Hazard Yellow
      accent: '#EF4444',      // Emergency Red
      background: '#00000000', // 100% transparent cardless backdrop
      text: '#FFFFFF',
      fontFamily: "'Montserrat', 'Impact', sans-serif",
      secondaryFont: "'JetBrains Mono', monospace",
      lineWeight: 3,
      radius: 4,
    };
  }

  // Fallback
  return {
    name: 'documentary_standard',
    primary: '#F07835',
    accent: '#FFE600',
    background: '#00000000',
    text: '#FFFFFF',
    fontFamily: "'Montserrat', 'Inter', sans-serif",
    secondaryFont: "'JetBrains Mono', monospace",
    lineWeight: 2,
    radius: 6,
  };
}

/**
 * Procedural SceneGraph Designer
 * Constructs validated, schema-compliant SceneGraph primitives from editorial intent.
 */
export function designSceneGraph(
  plan: EditorialBeatPlan,
  scene: ScenePlan,
  project: EditingProject,
  theme: SceneGraphThemeData
): SceneGraphData | null {
  if (!plan.warrantsGraphic) return null;

  const fontAssetId = project.style.fontAssetIds[0] || 'font-main';
  const nodes: SceneGraphNodeData[] = [];

  // Safe portrait bounds for 1080x1920:
  // Center region between 20% (384px) and 75% (1440px)
  const bounds = {
    x: 80,
    y: plan.category === 'evidence' ? 420 : 680,
    width: 920,
    height: plan.category === 'metric' ? 240 : 320,
  };

  // Labels and metrics float directly over the footage; never add a container frame.

  // 2. Editorial Content Nodes
  if (plan.category === 'metric' && plan.extractedFacts.value !== undefined) {
    // Telemetry / Metric Odometer node
    nodes.push({
      id: 'metric-val',
      kind: 'metric',
      space: 'screen',
      zIndex: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
      opacity: 1,
      tracks: [],
      targetValue: plan.extractedFacts.value,
      startValue: 0,
      unit: plan.extractedFacts.unit || '',
      label: plan.extractedFacts.label || 'VERIFIED RECORD',
      bounds: { x: 44, y: 36, width: bounds.width - 88, height: bounds.height - 72 },
      decimals: plan.extractedFacts.value % 1 === 0 ? 0 : 2,
      style: {
        fontAssetId,
        fontSize: 56,
        fontWeight: '700',
        color: theme.primary,
        align: 'left',
        lineHeight: 1.1,
      },
    });
  } else {
    // Label & Headline text nodes
    const titleText = plan.extractedFacts.title || plan.intent;
    const labelText = plan.extractedFacts.label || 'HISTORICAL ARCHIVE';

    // Label tag
    nodes.push({
      id: 'tag-label',
      kind: 'text',
      space: 'screen',
      zIndex: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
      opacity: 1,
      tracks: [],
      text: labelText,
      bounds: { x: 44, y: 32, width: bounds.width - 88, height: 36 },
      style: {
        fontAssetId,
        fontSize: 30,
        fontWeight: '700',
        color: theme.primary,
        align: 'left',
        lineHeight: 1.2,
      },
    });

    // Main title
    nodes.push({
      id: 'main-title',
      kind: 'text',
      space: 'screen',
      zIndex: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
      opacity: 1,
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { frame: 5, value: 0, easing: { kind: 'linear' } },
            { frame: 15, value: 1, easing: { kind: 'linear' } },
          ],
        },
      ],
      text: titleText,
      bounds: { x: 44, y: 78, width: bounds.width - 88, height: 120 },
      style: {
        fontAssetId,
        fontSize: 34,
        fontWeight: '700',
        color: theme.text,
        align: 'left',
        lineHeight: 1.25,
      },
    });

    // Optional supporting quote / detail
    if (plan.extractedFacts.quote) {
      nodes.push({
        id: 'sub-quote',
        kind: 'text',
        space: 'screen',
        zIndex: 5,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 0.9,
        tracks: [],
        text: plan.extractedFacts.quote,
        bounds: { x: 44, y: 200, width: bounds.width - 88, height: 80 },
        style: {
          fontAssetId,
          fontSize: 18,
          fontWeight: '400',
          color: theme.text,
          align: 'left',
          lineHeight: 1.35,
        },
      });
    }
  }

  // 3. Sound cue for reveal
  const soundCues: SceneGraphData['soundCues'] = [];

  // 4. Evidence bindings
  const evidence = [
    {
      targetNodeId: nodes[0].id,
      sourceId: scene.id,
      narrationTokenIds: scene.narrativeRefs.slice(0, 4),
      verifiedValue: plan.extractedFacts.title || `${plan.extractedFacts.value || ''} ${plan.extractedFacts.unit || ''}`.trim(),
      status: 'verified' as const,
    },
  ];

  return {
    version: 1,
    seed: 42,
    bounds,
    theme,
    nodes,
    soundCues,
    evidence,
    capabilities: ['vector_geometry', 'dynamic_typography', 'metric_counter'],
  };
}
