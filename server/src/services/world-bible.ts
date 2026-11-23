import { z } from 'zod';

export interface CharacterSpec {
  name: string;
  aliases: string[];
  ageRange: string;
  complexion: string;
  physique: string;
  attire: string;
  propsAndArmor: string;
  forbiddenFeatures: string[];
  lockedPromptSnippet: string;
}

export interface WorldBible {
  era_setting: string;
  eraSetting: string;
  characters: Record<string, CharacterSpec>;
}

export const CANONICAL_MYTHOLOGY_CHARACTERS: Record<string, CharacterSpec> = {
  ram: {
    name: 'Shri Rama',
    aliases: ['rama', 'ram', 'raghava', 'ramachandra', 'श्रीराम', 'राम'],
    ageRange: '28-32 years old',
    complexion: 'deep blue-black complexion ("megha-shyam")',
    physique: 'tall, dignified royal warrior poise, calm omniscient lotus eyes',
    attire: 'ascetic saffron bark-cloth dhoti or royal yellow silk, sacred thread (janeu)',
    propsAndArmor: 'legendary Kodanda/Sharanga bow, quiver of golden arrows, gold ornaments',
    forbiddenFeatures: ['peacock feather', 'blue flute', 'modern armor', 'krishna crown'],
    lockedPromptSnippet: 'Shri Rama: 28-32 years old, majestic deep blue-black complexion ("megha-shyam"), serene divine lotus eyes, long dark hair in ascetic forest topknot or golden crown, saffron bark-cloth dhoti and sacred thread, holding his Sharanga bow with calm authority; strictly NO peacock feather, strictly authentic Treta Yuga Vedic appearance',
  },
  krishna: {
    name: 'Shri Krishna',
    aliases: ['krishna', 'shri krishna', 'vasudeva', 'govinda', 'madhava', 'श्रीकृष्ण', 'कृष्ण', 'वासुदेव'],
    ageRange: '30-35 years old',
    complexion: 'transcendent dark blue-black complexion radiating divine luminescence',
    physique: 'athletic grace, gentle omniscient smile, radiating transcendental serenity',
    attire: 'resplendent pitambari golden-yellow silk dhoti, jeweled golden armlets',
    propsAndArmor: 'golden mukut crown adorned with a single iridescent peacock feather, Kaustubha gem glowing at chest, Sudarshana chakra aura',
    forbiddenFeatures: ['bow and quiver', 'angry scowl', 'modern clothing'],
    lockedPromptSnippet: 'Shri Krishna: 30-35 years old, transcendent dark blue-black complexion radiating soft divine luminescence, gentle knowing smile, yellow pitambari silk dhoti, golden mukut with single vibrant peacock feather, Kaustubha gem at chest, divine aura',
  },
  karna: {
    name: 'Karna',
    aliases: ['karna', 'radheya', 'angaraj', 'karn', 'कर्ण', 'राधेय', 'अंगराज'],
    ageRange: '30-35 years old',
    complexion: 'radiant golden-bronze sun-kissed complexion',
    physique: 'towering muscular warrior physique, imposing noble countenance',
    attire: 'crimson warrior attire, royal sash, ornate golden armbands',
    propsAndArmor: 'divine celestial golden Kavach armor fused seamlessly to his chest and radiant Kundala earrings glowing with solar energy, golden chariot',
    forbiddenFeatures: ['peacock feather', 'modern armor', 'weak posture'],
    lockedPromptSnippet: 'Karna (Radheya): 30-35 years old, radiant golden-bronze complexion, solar aura, towering muscular physique, divine celestial golden Kavach armor fused to chest, glowing golden Kundala earrings, crimson warrior attire, unyielding tragic nobility',
  },
  bali: {
    name: 'Bali (Vali)',
    aliases: ['bali', 'vali', 'vaali', 'वानरराज बालि', 'बालि', 'वाली'],
    ageRange: 'mature divine warrior king',
    complexion: 'radiant golden-tan fur with gleaming celestial luster',
    physique: 'towering, muscular divine vanara warrior monarch, terrifying physical strength',
    attire: 'celestial golden torque necklace (Kanchan Mala granted by Indra), jeweled royal armlets and royal red dhoti',
    propsAndArmor: 'golden crown, Indra\'s invulnerable celestial necklace',
    forbiddenFeatures: ['ordinary monkey', 'gorilla', 'chimpanzee', 'old human man', 'tail-less human', 'tail between legs', 'primitive ape'],
    lockedPromptSnippet: 'Bali (Vanara King): mythological divine vanara warrior monarch, towering muscular physique with radiant golden-tan fur, regal fierce simian countenance, wearing Indra\'s celestial golden necklace (Kanchan Mala) and royal golden crown, crimson royal dhoti; strictly divine mythological vanara warrior form, strictly NO ordinary zoo monkey, NO gorilla, NO ape, NO ordinary human',
  },
  sugriva: {
    name: 'Sugriva',
    aliases: ['sugriva', 'sugreev', 'सुग्रीव', 'वानरराज सुग्रीव'],
    ageRange: 'mature divine vanara king',
    complexion: 'radiant golden-yellow fur with warm solar sheen',
    physique: 'athletic, noble vanara warrior, regal posture',
    attire: 'golden royal mukut crown, pearl necklace, ochre-gold silk dhoti',
    propsAndArmor: 'royal golden crown, divine gada (mace)',
    forbiddenFeatures: ['ordinary monkey', 'gorilla', 'wings', 'modern clothing'],
    lockedPromptSnippet: 'Sugriva: divine mythological vanara warrior king, lustrous golden-yellow fur, noble regal expression, royal golden crown and gold ornaments, ochre-gold dhoti; strictly authentic Treta Yuga vanara form, strictly NO zoo monkey, NO gorilla, NO ape',
  },
  hanuman: {
    name: 'Hanuman',
    aliases: ['hanuman', 'maruti', 'bajrangbali', 'anjaneya', 'pawanputra', 'हनुमान', 'बजरंगबली'],
    ageRange: 'divine immortal warrior',
    complexion: 'radiant golden-orange fur with glowing divine aura',
    physique: 'colossal muscular divine vanara warrior, long curled tail streaming with wind energy',
    attire: 'sacred thread across chest, golden mukut crown, bright crimson dhoti',
    propsAndArmor: 'divine golden gada (mace)',
    forbiddenFeatures: ['wings', 'feathers', 'ordinary monkey', 'gorilla', 'demonic face'],
    lockedPromptSnippet: 'Hanuman: divine vanara warrior, radiant golden-orange fur, towering muscular torso with sacred janeu thread, golden crown and crimson dhoti, long curled tail, wielding divine golden gada; strictly NO wings, NO feathers, wingless divine form',
  },
};

export const STRICT_NEGATIVE_VISUAL_RULES = 'Strictly NO text, NO captions, NO labels, NO watermarks, NO typography, NO split-screen, NO collage, NO comic panels, NO stacked multi-image grids, NO modern anachronisms (NO modern clothing, NO sunglasses, NO metal tripods, NO electricity, NO modern boats, NO watches).';

/**
 * Builds or selects the locked World Bible for an episode topic.
 */
export function buildWorldBibleForTopic(topic: string): WorldBible {
  const era = 'Authentic Treta Yuga and Dvapara Yuga ancient India, sacred sal and teakwood forests, majestic sandstone architecture, stone temple sanctums with warm diya lighting, dusty riverbanks, zero modern objects';
  return {
    era_setting: era,
    eraSetting: era,
    characters: CANONICAL_MYTHOLOGY_CHARACTERS,
  };
}

/**
 * Injects locked character bibles and era consistency rules into scene prompts.
 */
export function injectWorldBibleIntoPrompt(prompt: string, bible = buildWorldBibleForTopic('')): string {
  let enriched = prompt.trim();

  // 1. Identify which characters appear in the prompt
  const lower = enriched.toLowerCase();
  for (const [key, spec] of Object.entries(bible.characters)) {
    const isPresent = spec.aliases.some((alias) => {
      const reg = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return reg.test(lower);
    });

    if (isPresent) {
      // If character is present and locked snippet is not already in prompt, append it
      if (!enriched.includes(spec.lockedPromptSnippet)) {
        enriched = `${enriched}. Character Continuity: ${spec.lockedPromptSnippet}.`;
      }
    }
  }

  // 2. Ensure era setting and strict negative constraints are present
  if (!/strictly NO text|NO typography/i.test(enriched)) {
    enriched = `${enriched} ${STRICT_NEGATIVE_VISUAL_RULES}`;
  }

  return enriched.replace(/\s{2,}/g, ' ').trim();
}
