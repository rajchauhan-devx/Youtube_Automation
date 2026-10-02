import type { EditingProject } from '@tubeflow/editing-contracts';

export type MotionTheme = 'devotional' | 'modern' | 'documentary' | 'nature' | 'mystery' | 'dramatic' | 'neutral';
const palettes: Record<MotionTheme, { accent: string; text: string; background: string }> = {
  devotional: { accent: '#e8a368', text: '#fff8ef', background: '#281b24' },
  modern: { accent: '#69d6ec', text: '#f5fbff', background: '#101d31' },
  documentary: { accent: '#7fc5bd', text: '#f5f8f7', background: '#172627' },
  nature: { accent: '#9dd7a5', text: '#f5fff3', background: '#17251e' },
  mystery: { accent: '#b9a5e9', text: '#faf7ff', background: '#211b34' },
  dramatic: { accent: '#f08c8c', text: '#fff8f7', background: '#2c171c' },
  neutral: { accent: '#8bb9e8', text: '#f7faff', background: '#192333' },
};
const patterns: { theme: MotionTheme; regex: RegExp }[] = [
  { theme: 'devotional', regex: /\b(god|gods|goddess|deity|temple|prayer|devotion|spiritual|sacred|ramayana|krishna|shiva)\b|भगवान|देवता|देवी|मंदिर|भक्ति|राम|कृष्ण|शिव/u },
  { theme: 'modern', regex: /\b(modern|technology|startup|city|urban|future|digital|cyber|robot|office)\b|आधुनिक|तकनीक|शहर|भविष्य/u },
  { theme: 'documentary', regex: /\b(documentary|history|historical|archive|research|investigation|interview|evidence|war)\b|इतिहास|दस्तावेज़|जांच|युद्ध/u },
  { theme: 'nature', regex: /\b(nature|forest|wildlife|earth|ocean|river|mountain|environment)\b|प्रकृति|जंगल|समुद्र|नदी|पहाड़/u },
  { theme: 'mystery', regex: /\b(mystery|secret|unknown|hidden|suspense|haunted)\b|रहस्य|गुप्त|अज्ञात/u },
  { theme: 'dramatic', regex: /\b(crime|danger|battle|revenge|horror|tragedy|disaster)\b|अपराध|खतरा|लड़ाई|बदला|त्रासदी/u },
];

export function inferMotionTheme(text: string): MotionTheme {
  const source = text.toLocaleLowerCase();
  let best: MotionTheme = 'neutral', score = 0;
  for (const { theme, regex } of patterns) {
    const hits = [...source.matchAll(new RegExp(regex.source, 'gu'))].length;
    if (hits > score) { best = theme; score = hits; }
  }
  return best;
}

export function applyMotionTheme(project: EditingProject, theme: MotionTheme): void {
  project.style.colors = { ...project.style.colors, ...palettes[theme] };
  project.style.shapeTreatment = `${theme} story graphics with restrained, readable motion`;
}
