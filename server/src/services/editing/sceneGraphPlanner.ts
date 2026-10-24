import type { EditingProject, ScenePlan } from '@tubeflow/editing-contracts';

export type EditorialCategory =
  | 'metric'      // Scale, quantity, official record, casualty count, distance
  | 'timeline'    // Historical anchor, BCE date, elapsed survival time
  | 'comparison'  // Before vs After, Option A vs Option B
  | 'spatial_map' // Trajectory, origin to destination, coordinates
  | 'evidence'    // Primary quote, decree, rule, dispatch, black-box teletype
  | 'none';       // Clean scene - visual storytelling should breathe

export interface EditorialBeatPlan {
  sceneId: string;
  category: EditorialCategory;
  warrantsGraphic: boolean;
  intent: string;
  supportingText: string;
  extractedFacts: {
    title?: string;
    value?: number;
    unit?: string;
    label?: string;
    dateText?: string;
    quote?: string;
    source?: string;
  };
}

/**
 * Editorial Intent Analyzer
 * Rule: Default to NO graphic unless the scene has high informational density or proof moments.
 */
export function planEditorialBeat(
  scene: ScenePlan,
  project: EditingProject,
  sceneIndex: number,
  totalScenes: number
): EditorialBeatPlan {
  const sceneTiming = project.inputs.sceneTiming?.find((st) =>
    st.sceneId === scene.id ||
    st.promptIndex === sceneIndex ||
    st.sceneId === `scene_${String(sceneIndex + 1).padStart(3, '0')}` ||
    st.sceneId === `scene-${sceneIndex}`
  ) || project.inputs.sceneTiming?.[sceneIndex];
  const text = sceneTiming?.text || '';

  // 1. Check if scene mentions metrics/quantities
  const metricMatch = text.match(/\b([\d,.]+)\s*(feet|ft|meters|km|miles|seconds|sec|hours|days|years|bce|ce|percent|%|mph|knots|degrees)\b/i);
  if (metricMatch) {
    const rawNum = metricMatch[1].replace(/,/g, '');
    const numVal = parseFloat(rawNum);
    if (!isNaN(numVal)) {
      return {
        sceneId: scene.id,
        category: 'metric',
        warrantsGraphic: true,
        intent: `Scale & Quantity: ${metricMatch[0]}`,
        supportingText: text,
        extractedFacts: {
          value: numVal,
          unit: metricMatch[2].toUpperCase(),
          label: 'VERIFIED RECORD',
        },
      };
    }
  }

  // 2. Check if scene mentions explicit dates / timeline anchors
  const dateMatch = text.match(/\b(\d{1,4}\s*(?:BCE|CE|BC|AD)|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+\d{2,4})?|\b\d{4}\b)|(?:^|[^\p{L}\p{N}])(त्रेता\s*युग|द्वापर\s*युग|सत्य\s*युग|कलि\s*युग|प्राचीन\s*काल)(?=[^\p{L}\p{N}]|$)/iu);
  if (dateMatch && !/\b(202[0-9]|199[0-9])\b/.test(dateMatch[0])) {
    const matchedDate = (dateMatch[1] || dateMatch[2] || dateMatch[0]).trim();
    return {
      sceneId: scene.id,
      category: 'timeline',
      warrantsGraphic: true,
      intent: `Timeline Anchor: ${matchedDate}`,
      supportingText: text,
      extractedFacts: {
        dateText: matchedDate.toUpperCase(),
        title: 'ऐतिहासिक कालक्रम // CHRONOLOGY',
      },
    };
  }

  // 3. Check if scene mentions rules, decrees, laws, or protocols
  const ruleMatch = text.match(/\b(rule\s*(?:zero|\d+)|decree|protocol|directive|mandate|law|command)\b[:\s-]*([^.,;\n]+)?|(?:^|[^\p{L}\p{N}])(वाल्मीकि\s*रामायण|रामायण|महाभारत|वेद|उपनिषद|पुराण|शास्त्र\s*प्रमाण|राजकीय\s*संदेश)(?=[^\p{L}\p{N}]|$)/iu);
  if (ruleMatch) {
    const matchedRule = (ruleMatch[1] || ruleMatch[3] || ruleMatch[0]).trim();
    return {
      sceneId: scene.id,
      category: 'evidence',
      warrantsGraphic: true,
      intent: `Primary Directive: ${matchedRule}`,
      supportingText: text,
      extractedFacts: {
        title: matchedRule.toUpperCase(),
        label: 'शास्त्र प्रमाण // CANONICAL EVIDENCE',
        quote: ruleMatch[2]?.trim(),
      },
    };
  }

  // 4. Check for first scene title establishment
  if (sceneIndex === 0) {
    const cleanTitle = (project.inputs.narrationText.split(/[.\n]/)[0] || 'CHRONICLE').slice(0, 48);
    return {
      sceneId: scene.id,
      category: 'evidence',
      warrantsGraphic: true,
      intent: 'Chapter Title Establishment',
      supportingText: text,
      extractedFacts: {
        title: cleanTitle.toUpperCase(),
        label: 'CHAPTER RECORD',
      },
    };
  }

  // 5. Default: NO graphic. Let the cinematography breathe.
  return {
    sceneId: scene.id,
    category: 'none',
    warrantsGraphic: false,
    intent: 'Cinematic breathing room - no overlay needed',
    supportingText: text,
    extractedFacts: {},
  };
}
