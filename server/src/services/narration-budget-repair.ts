import { chat } from './gemini.js';
import { validateScenePlan, spokenText, type ScenePlan } from './scene-plan.js';
import { narrationWordBudget } from './script-generation.js';

export async function repairNarrationBudget(apiKey: string, input: ScenePlan, duration: number, template: string,
  model: string, signal?: AbortSignal, generate = chat) {
  const plan = structuredClone(validateScenePlan(input));
  const budget = narrationWordBudget(duration);
  for (let attempt = 0; attempt < 5; attempt++) {
    signal?.throwIfAborted();
    const count = spokenText(plan).split(/\s+/u).filter(Boolean).length;
    if (count >= budget.minimum && count <= budget.maximum) return plan;
    const target = Math.round((budget.minimum + budget.maximum) / 2);
    const perScene = Math.round(target / plan.scenes.length);
    const adjustment = count > budget.maximum
      ? `Remove approximately ${count - target} spoken words across this part. The upper limit is strict; keeping the previous wording unchanged fails validation.`
      : `Add approximately ${target - count} spoken words across this part, developing only its existing events.`;
    // A free-text request cannot enforce a word count. After two attempts,
    // constrain individual word items, then join them without cutting speech.
    const counted = attempt >= 2;
    const minimumWords = Math.ceil(budget.minimum / plan.scenes.length);
    const maximumWords = Math.floor(budget.maximum / plan.scenes.length);
    const narrationSchema = counted
      ? { narrationWords: { type: 'array', minItems: minimumWords, maxItems: maximumWords,
          items: { type: 'string', pattern: '^\\S+$' }, description: 'One spoken word with attached punctuation per item. Never include whitespace within an item.' } }
      : { narration: { type: 'string' } };
    const response = await generate(apiKey, { model, signal, max_tokens: 8192, json: true,
      jsonSchema: { type: 'object', properties: { scenes: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, ...narrationSchema,
      }, required: ['id', counted ? 'narrationWords' : 'narration'] } } }, required: ['scenes'] },
      messages: [
        { role: 'system', content: `Edit only the supplied spoken narration. Keep every scene ID and scene order, story event, factual claim, speaker identity, emotional beat and original language. Preserve chronology and match the same existing visual moment. The current part has ${count} words; it needs ${budget.minimum}–${budget.maximum} words total for ${duration} seconds. Target ${target} words total, approximately ${perScene} spoken words per scene, with natural variation for the hook or CTA. Count words separated by spaces, including in Hindi. ${adjustment} ${count > budget.maximum ? 'Condense naturally without losing the key facts.' : 'Develop existing events with specific meaningful detail; do not add invented facts, repeated hooks or filler.'} Return all scenes as id/narration only. Use speech and punctuation only, no tags, stage directions, labels or counting notes. Each narration must be at most 700 characters.` },
        { role: 'user', content: `${template}\n\nNARRATION REPAIR ONLY: this is a finished part with fixed scenes. Change no assets or metadata.${counted ? `\nCounted transport overrides the narration string: return each scene as id and narrationWords, an array of ${minimumWords}–${maximumWords} single spoken words, with punctuation attached. One word per item; no whitespace inside items. These words will be joined into natural narration. Preserve the original language and events.` : ''}\n${JSON.stringify(plan.scenes.map(({id,chapter,narration,imagePrompt,role})=>({id,chapter,narration,imagePrompt,role})))}` },
      ],
    });
    if (response.choices[0]?.finish_reason?.toUpperCase() !== 'STOP') continue;
    let edits: any;
    try { edits = JSON.parse(response.choices[0]?.message?.content || ''); } catch { continue; }
    if (!Array.isArray(edits.scenes) || edits.scenes.length !== plan.scenes.length) continue;
    const next = plan.scenes.map(scene => {
      const matches = edits.scenes.filter((edit: any) => edit?.id === scene.id);
      if (matches.length !== 1) return scene;
      const edit = matches[0];
      const narration = counted
        ? Array.isArray(edit.narrationWords) && edit.narrationWords.length >= minimumWords && edit.narrationWords.length <= maximumWords
          && edit.narrationWords.every((word: unknown) => typeof word === 'string' && /^\S+$/u.test(word)) ? edit.narrationWords.join(' ') : undefined
        : edit.narration;
      return typeof narration === 'string' ? { ...scene, narration } : scene;
    });
    try { validateScenePlan({ ...plan, scenes: next }); plan.scenes = next; } catch { /* Retry unsafe or overlong speech. */ }
  }
  const count = spokenText(plan).split(/\s+/u).filter(Boolean).length;
  if (count < budget.minimum || count > budget.maximum) throw new Error(`Narration still has ${count} words; this part needs ${budget.minimum}–${budget.maximum}.`);
  return plan;
}
