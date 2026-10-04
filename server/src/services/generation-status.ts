import { SCENE_PLAN_FORMAT_MARKER } from './scene-plan-format.js';

/** Check only structure explicitly requested by the user; impose no output format.
 * In free-chat mode the template's own instructional headings are NOT treated
 * as required output sections (a 55KB template mentions dozens of SECTIONs in
 * prose) — only genuinely unclosed tags count as truncation. */
export function incompleteResponse(prompt: string, response: string, freeChat = false): string | undefined {
  // Raw structured JSON is validated as a whole by generationIssue. Literal
  // markup in editorial notes must not be counted as response containers.
  if (prompt.includes(SCENE_PLAN_FORMAT_MARKER) && response.trimStart().startsWith('{')) return undefined;
  const sections = (text: string) => [...text.matchAll(/^\s*#{1,6}\s+[^\n]*?\bSECTION\s+(\d+[A-Z]?)\b/gim)].map(match => match[1].toUpperCase());
  const requested = [...new Set(sections(prompt))];
  const received = new Set(sections(response));
  if (!freeChat && !prompt.includes(SCENE_PLAN_FORMAT_MARKER) && requested.length > 1) {
    const missing = requested.filter(id => !received.has(id));
    if (missing.length) return `Missing requested sections: ${missing.join(', ')}`;
  }
  for (const tag of ['long_video', 'shorts', 'audio_prompt', 'scene', 'narration', 'image_prompt', 'video_prompt', 'thumbnail_prompt', 'script']) {
    const opens = (response.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || []).length;
    const closes = (response.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    if (opens > closes) return `Unfinished <${tag}> block`;
  }
  if (prompt.includes(SCENE_PLAN_FORMAT_MARKER) && !/<long_video>/i.test(response) && !response.trimStart().startsWith('{')) return 'Missing shared <long_video> scene-plan block';
  return undefined;
}
