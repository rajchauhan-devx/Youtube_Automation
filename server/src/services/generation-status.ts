import { SCENE_PLAN_FORMAT_MARKER } from './scene-plan-format.js';

/** Check only structure explicitly requested by the user; impose no output format.
 * In free-chat mode the template's own instructional headings are NOT treated
 * as required output sections (a 55KB template mentions dozens of SECTIONs in
 * prose) — only genuinely unclosed tags count as truncation. */
export function incompleteResponse(prompt: string, response: string, freeChat = false): string | undefined {
  // Raw structured JSON is validated as a whole by generationIssue. Literal
  // markup in editorial notes must not be counted as response containers.
  if (prompt.includes(SCENE_PLAN_FORMAT_MARKER) && response.trimStart().startsWith('{')) return undefined;

  // Strip inline code and markdown fences so conversational mentions of tags
  // (e.g. `<script>`, `<image_prompt0>`, `<image_prompt[N]>`) inside prose
  // do not trigger false unclosed-tag errors.
  const clean = response
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');

  const sections = (text: string) => [...text.matchAll(/^\s*#{1,6}\s+[^\n]*?\bSECTION\s+(\d+[A-Z]?)\b/gim)].map(match => match[1].toUpperCase());
  const requested = [...new Set(sections(prompt))];
  const received = new Set(sections(clean));
  if (!freeChat && !prompt.includes(SCENE_PLAN_FORMAT_MARKER) && requested.length > 1) {
    const missing = requested.filter(id => !received.has(id));
    if (missing.length) return `Missing requested sections: ${missing.join(', ')}`;
  }
  for (const tag of ['long_video', 'shorts', 'audio_prompt', 'scene', 'narration', 'image_prompt', 'video_prompt', 'thumbnail_prompt', 'script']) {
    const opens = (clean.match(new RegExp(`<${tag}(?:\\d+)?(?:\\s+[^>]*)?>`, 'gi')) || []).length;
    const closes = (clean.match(new RegExp(`</${tag}(?:\\d+)?\\s*>`, 'gi')) || []).length;
    if (opens > closes) return `Unfinished <${tag}> block`;
  }
  if (prompt.includes(SCENE_PLAN_FORMAT_MARKER) && !/<(?:script|narration|long_video)\b/i.test(clean) && !clean.trimStart().startsWith('{')) return 'Missing <script> narration block';
  return undefined;
}

/** Detect shortcut placeholders where the model skips writing the actual
 * asset blocks (e.g. "[...Repeat for images 1-15...]"). Response-only check:
 * never run this on the template prompt itself. */
export function placeholderResponse(response: string): string | undefined {
  const patterns = [
    /\[\s*\.\.\.\s*[^\]]*(repeat|continue|same|rest\b)[^\]]*\]/i,
    /\brepeat for (the remaining|images?)\b/i,
    /\bfollowing the same \w+ standard\b/i,
    /\b(no need to repeat|omitted for brevity|truncated for brevity)\b/i,
  ];
  if (patterns.some(pattern => pattern.test(response))) {
    return 'The response uses placeholder text instead of complete asset blocks. Every <image_prompt> block must be written in full.';
  }
  // Declared image count with far fewer actual blocks is the same shortcut.
  const declared = response.match(/SECTION\s+3\s+[^\n]*?\(\s*(\d+)\s+total\s*\)/i)?.[1]
    || response.match(/(\d+)\s+image_prompts?\s+(?:in total|total)/i)?.[1];
  if (declared) {
    const blocks = (response.match(/<image_prompt\b/gi) || []).length;
    if (blocks > 0 && blocks < Number(declared)) {
      return `Section 3 declares ${declared} images but only ${blocks} <image_prompt> block${blocks === 1 ? ' is' : 's are'} written. The remaining blocks must be written in full.`;
    }
  }
  return undefined;
}
