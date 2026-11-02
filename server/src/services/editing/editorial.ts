import { Artifact, type EditingProject } from '@tubeflow/editing-contracts';
import { narrationCue } from './narrationCue.js';
import { sceneNarration, type Proposal } from './motionPackArtifacts.js';
import { motionAsset } from './motionAssets.js';
import type { MotionContext } from './motionProvider.js';

const normalized = (value: string) => value.normalize('NFKC').replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x966)).replace(/[,\s]/g, '').toLocaleLowerCase();

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000,
  // Complete Hindi numbers 0-100 + scale factors
  शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29, तीस: 30,
  इकतीस: 31, बत्तीस: 32, तैंतीस: 33, चौंतीस: 34, पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38, उनतालीस: 39, चालीस: 40,
  इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चवालीस: 44, पैंतालीस: 45, छियालीस: 46, सैंतालीस: 47, अड़तालीस: 48, उनचास: 49, पचास: 50,
  इक्यावन: 51, बावन: 52, तिरपन: 53, चौवन: 54, पचपन: 55, छप्पन: 56, सत्तावन: 57, अट्ठावन: 58, उनसठ: 59, साठ: 60,
  इकसठ: 61, बासठ: 62, तिरसठ: 63, चौंसठ: 64, पैंसठ: 65, छियासठ: 66, सरसठ: 67, अड़सठ: 68, उनहत्तर: 69, सत्तर: 70,
  इकहत्तर: 71, बहत्तर: 72, तिहत्तर: 73, चौहत्तर: 74, पचहत्तर: 75, छिहत्तर: 76, सतहत्तर: 77, अठहत्तर: 78, उन्यासी: 79, अस्सी: 80,
  इक्यासी: 81, बयासी: 82, तिरासी: 83, त्रासी: 83, चौरासी: 84, पचासी: 85, छियासी: 86, सत्तासी: 87, अठासी: 88, नवासी: 89, नब्बे: 90,
  इक्यानवे: 91, बानवे: 92, तिरानवे: 93, चौरानवे: 94, पचानवे: 95, छियानवे: 96, सत्तानवे: 97, अट्ठानवे: 98, निन्यानवे: 99,
  सौ: 100, हजार: 1000, हज़ार: 1000, लाख: 100000, करोड़: 10000000
};

function extractSpokenNumbers(text: string): Set<string> {
  const spokenNumbers = new Set<string>(normalized(text).match(/\d+(?:\.\d+)?/g) || []);
  const words = text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);

  let currentVal = 0;
  let totalVal = 0;
  let inNumber = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const val = WORD_NUMBERS[w];
    if (val !== undefined) {
      inNumber = true;
      spokenNumbers.add(String(val));

      // Year format: e.g. "nineteen" (19) followed by "eighty three" (83) -> 1983
      if (val >= 11 && val <= 20 && i + 1 < words.length) {
        const nextVal = WORD_NUMBERS[words[i + 1]];
        if (nextVal !== undefined && nextVal >= 20 && nextVal <= 99) {
          spokenNumbers.add(String(val * 100 + nextVal));
        }
      }

      if (val === 100) {
        currentVal = (currentVal === 0 ? 1 : currentVal) * 100;
      } else if (val >= 1000) {
        totalVal += (currentVal === 0 ? 1 : currentVal) * val;
        currentVal = 0;
      } else {
        currentVal += val;
      }
    } else {
      if (inNumber) {
        const combined = totalVal + currentVal;
        if (combined > 0) spokenNumbers.add(String(combined));
        currentVal = 0;
        totalVal = 0;
        inNumber = false;
      }
    }
  }

  if (inNumber) {
    const combined = totalVal + currentVal;
    if (combined > 0) spokenNumbers.add(String(combined));
  }

  return spokenNumbers;
}

export async function compileEditorial(project: EditingProject, proposal: Proposal, ctx: MotionContext, id = `graphic-${proposal.sceneId}`) {
  if (!proposal.sequence || proposal.kind !== 'composition') throw new Error('Editorial sequences require an explicit supported composition brief.');
  const scene = project.scenes.find(s => s.id === proposal.sceneId);
  if (!scene) throw new Error('Unknown editorial scene');
  const cue = narrationCue(project.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id)), proposal.quote);
  if (!cue) throw new Error('Editorial sequence has no exact spoken evidence');
  const narration = sceneNarration(project, scene.id), sequence = proposal.sequence;
  const spokenNumbers = extractSpokenNumbers(narration);
  for (const fact of sequence.facts) {
    const digits = normalized(`${fact.value} ${fact.label}`).match(/\d+(?:\.\d+)?/g);
    if (digits ? digits.some(value => !spokenNumbers.has(value)) : !normalized(narration).includes(normalized(fact.value)))
      throw new Error(`Unsupported display value: ${fact.value}. Use a number or phrase actually spoken in this scene.`);
  }
  if (['impact', 'measure'].includes(sequence.template) && !sequence.facts.length) throw new Error('A numeric reveal requires a supported display fact.');
  if (['impact', 'measure'].includes(sequence.template) && !/\d/u.test(normalized(sequence.facts[0]?.value || '')))
    throw new Error('A scale/statistic sequence requires an actual spoken number, not a caption disguised as a graphic.');
  if (sequence.template === 'assembly' && !/interlock|joint|tongue|groove|जोड़|इंटरलॉक/iu.test(narration))
    throw new Error('The joining diagram requires a narration beat explicitly about joints or interlocking parts.');
  if (sequence.direction === 'incline' && !/ramp|incline|slope|रैंप|ढलान/iu.test(narration))
    throw new Error('An inclined process stage requires an explicitly narrated ramp or incline.');
  const { assetPrompt, ...spec } = sequence;
  let subjectAssetId: string | undefined;
  if (assetPrompt) {
    const asset = await motionAsset(project, assetPrompt, ctx); subjectAssetId = asset.id;
    project.assetIds = [...new Set([...project.assetIds, asset.id])];
  }
  const startFrame = project.alignment.mode === 'approximate' ? scene.startFrame : Math.max(scene.startFrame, Math.round(cue.start * project.inputs.fps));
  const endFrame = sequence.template === 'impact' ? Math.min(scene.endFrame, startFrame + Math.round(project.inputs.fps * 3.6)) : scene.endFrame;
  if (endFrame - startFrame < project.inputs.fps * (['process', 'assembly'].includes(sequence.template) ? 3 : 2))
    throw new Error('This sequence needs more reading and animation time than the spoken cue leaves.');
  return Artifact.parse({ id, sceneId: scene.id, enabled: true, intent: `Editorial ${sequence.template}: ${sequence.headline}`,
    narrativeRefs: scene.narrativeRefs, startFrame, endFrame, priority: 6, nodes: [], assetRequestIds: [],
    graphic: { kind: 'composition', title: proposal.title, detail: '', bounds: { x: 0, y: 0, width: project.inputs.width, height: project.inputs.height },
      composition: { version: 1, treatment: 'cinematic', layout: 'cutaway', emphasis: 'none', layers: [], editorial: { ...spec, ...(subjectAssetId ? { subjectAssetId } : {}) } } } });
}
