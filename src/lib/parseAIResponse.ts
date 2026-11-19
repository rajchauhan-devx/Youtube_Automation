import { MotionScriptHint, type MotionScriptHintData } from '@tubeflow/editing-contracts';

export interface ParsedMetadata {
  index: number;
  type: string;
  scene?: string;
  title?: string;
  detail?: string;
  assetPrompt?: string;
  raw: string;
  motionPlan?: MotionScriptHintData;
}

export interface ParsedAIResponse {
  script: string;
  ttsText: string;
  imagePrompts: string[];
  metadata?: ParsedMetadata[];
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^\s*```[a-z]*\n?/gim, '').replace(/\n?```\s*$/gim, '');
}

function findImagePrompts(text: string): string[] {
  const prompts: string[] = [];

  // Strategy 1: Look for <image_prompt[N]> or <video_prompt[N]> or <image_promptN> tags
  const imageTagRegex = /<(?:image_prompt|video_prompt)(?:\[\d+\]|\d+)?[^>]*>(?:[\s\S]*?#(?:image|video)\s*\d+)?\s*([\s\S]*?)<\/(?:image_prompt|video_prompt)(?:\[\d+\]|\d+)?\s*>/gi;
  let tagMatch;
  while ((tagMatch = imageTagRegex.exec(text)) !== null) {
    const content = tagMatch[1].replace(/<\/?(?:image_prompt|video_prompt)(?:\[\d+\]|\d+)*\b[^>]*>/gi, '').trim();
    if (content.length > 0) prompts.push(content);
  }
  if (prompts.length > 0) return prompts;

  // Strategy 2: Look for "IMAGE N" or "Image N" headers followed by content with "Prompt:" line
  const imageHeaderRegex = /(?:^|\n)(?:#{0,3}\s*)?(?:IMAGE|Image)\s+(\d+)[^\n]*\n([\s\S]*?)(?=(?:#{0,3}\s*)?(?:IMAGE|Image)\s+\d+|\n#{1,3}\s+|\n<\/|$)/gi;
  let match;
  while ((match = imageHeaderRegex.exec(text)) !== null) {
    const block = match[2].trim();
    // Try to find "Prompt:" line within the block
    const promptMatch = block.match(/Prompt:\s*([\s\S]*?)(?=Continuity Lock:|Negative Prompt:|$)/i);
    if (promptMatch) {
      prompts.push(promptMatch[1].trim());
    } else {
      // Use the whole block as a prompt (clean it up)
      const cleaned = block
        .split('\n')
        .filter(l => !l.match(/^(Purpose|Narration covered|New information|Visual category|Visual mode|Evidence basis|Character reference|Motion recommendation|Continuity Lock|Negative Prompt):/i))
        .join('\n')
        .trim();
      if (cleaned.length > 20) prompts.push(cleaned);
    }
  }
  if (prompts.length > 0) return prompts;

  // Strategy 3: Look for numbered items in an images section
  const imagesSection = text.match(/(?:<images>|(?:#{1,3}\s*(?:.*?image.*?prompt|.*?visual.*?prompt|.*?images))[\s\S]*?)(?:<\/images>|(?=#{1,3}\s)|$)/i);
  if (imagesSection) {
    const block = stripMarkdownFences(imagesSection[0]);
    const lines = block.split('\n').map(l => l.replace(/^\d+[.)]\s*/, '').trim()).filter(l => l.length > 20);
    if (lines.length > 0) return lines;
  }

  // Strategy 4: Look for sentences that describe visuals (long descriptive sentences with visual keywords)
  const visualKeywords = /\b(cinematic|illustration|depicting|scene|character|visual| shot|close-up|wide shot|render|portrait|landscape|ancient|medieval|warrior|king|palace|army|battle|temple|forest|river|mountain|sunset|sunrise|dramatic|lighting|composition|foreground|background|figure|expression|costume|attire|weapon|sword|shield)\b/i;
  const sentences = text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 50 && visualKeywords.test(s));
  if (sentences.length >= 3) return sentences;

  // Strategy 5: Split by double newlines and find descriptive paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 50 && visualKeywords.test(p));
  if (paragraphs.length > 0) return paragraphs;

  return prompts;
}

export function extractScriptTagContent(text: string): string {
  const scriptMatch = text.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i);
  return scriptMatch ? stripMarkdownFences(scriptMatch[1]).trim() : '';
}

function findNarration(text: string): string {
  // Narration is deliberately strict: only the explicit <script> tag is valid.
  return extractScriptTagContent(text);
}

function findScript(text: string): string {
  // Strategy 1: Find <script> tags
  const taggedScript = extractScriptTagContent(text);
  if (taggedScript) return taggedScript;

  // Strategy 2: Find script section
  const sectionNames = ['Script', 'Final Script', 'Shorts Script', 'YouTube Script', 'Hindi Script'];
  for (const name of sectionNames) {
    const regex = new RegExp(`(?:#{1,3}\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:：-]*\\n)([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i');
    const match = text.match(regex);
    if (match && match[1].trim().length > 20) {
      return stripMarkdownFences(match[1]).trim();
    }
  }

  // Strategy 3: If no script section found, use the full response
  return text.trim();
}

export function findMetadata(text: string): ParsedMetadata[] {
  const list: ParsedMetadata[] = [];
  if(text.trimStart().startsWith('{')) {
    try {
      const plan=JSON.parse(text);
      for(const [i,scene] of (plan.scenes||[]).entries())for(const raw of scene.motionGraphics||[]) {
        const parsed=MotionScriptHint.safeParse(raw);
        if(parsed.success)list.push({index:i+1,scene:String(i+1),type:'motion',title:parsed.data.intent,raw:JSON.stringify(raw),motionPlan:parsed.data});
      }
    } catch { /* A streamed response may still be incomplete. */ }
    return list;
  }
  const regex = /<(?:metadata|motion_graphic|overlay)(?:\[\d+\]|\d+)?[^>]*>([\s\S]*?)<\/(?:metadata|motion_graphic|overlay)(?:\[\d+\]|\d+)?\s*>/gi;
  let m;
  let idx = 1;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[1].trim();
    const tagMatch = m[0].match(/<(?:metadata|motion_graphic|overlay)(?:\[(\d+)\]|(\d+))?/i);
    const tagNum = tagMatch ? (tagMatch[1] || tagMatch[2]) : undefined;
    if (raw.startsWith('{')) {
      try {
        const parsed = MotionScriptHint.safeParse(JSON.parse(raw));
        if (parsed.success) list.push({ index: Number(tagNum) || idx++, scene: tagNum, type: 'motion', title: parsed.data.intent, raw, motionPlan: parsed.data });
      } catch { /* Leave malformed metadata visible in the original response. */ }
      continue;
    }
    const templateMatch = raw.match(/(?:template|templateId):\s*([^\n]+)/i);
    const typeMatch = raw.match(/type:\s*([^\n]+)/i);
    const sceneMatch = raw.match(/(?:Scene|#scene|#image)[:\s]+\s*([^\n]+)/i);
    const titleMatch = raw.match(/title:\s*([^\n]+)/i);
    const labelMatch = raw.match(/label:\s*([^\n]+)/i);
    const detailMatch = raw.match(/detail:\s*([^\n]+)/i);
    const metricMatch = raw.match(/(?:metric|statValue|value):\s*([^\n]+)/i);
    const unitMatch = raw.match(/(?:unit|statUnit):\s*([^\n]+)/i);
    const quoteMatch = raw.match(/quote:\s*([^\n]+)/i);
    const cueMatch = raw.match(/cue:\s*([^\n]+)/i);
    const assetPromptMatch = raw.match(/Asset\s*Prompt:\s*([\s\S]*?)(?=(?:\n[A-Z][a-z]+:|$))/i);
    const whenMatch = raw.match(/(?:When|Timing):\s*([^\n]+)/i);
    const whereMatch = raw.match(/(?:Where|Position|Placement):\s*([^\n]+)/i);
    const visualMatch = raw.match(/(?:Visual|Concept|Style):\s*([^\n]+)/i);

    const templateName = templateMatch ? templateMatch[1].trim() : (typeMatch ? typeMatch[1].trim() : 'dynamic_motion');
    const rawType = templateName;
    const typeKey = rawType.toLowerCase().replace(/[\s-]+/g, '_');
    const titleVal = titleMatch ? titleMatch[1].trim() : (labelMatch ? labelMatch[1].trim() : '');
    const detailVal = detailMatch ? detailMatch[1].trim() : (metricMatch ? (unitMatch ? `${metricMatch[1].trim()} ${unitMatch[1].trim()}` : metricMatch[1].trim()) : (visualMatch ? visualMatch[1].trim() : ''));
    const sceneVal = sceneMatch ? sceneMatch[1].trim() : (tagNum || String(idx));
    const quoteVal = quoteMatch ? quoteMatch[1].trim() : (cueMatch ? cueMatch[1].trim() : (whenMatch ? whenMatch[1].trim() : titleVal));
    const items = titleVal ? [{ text: titleVal, ...(detailVal ? { detail: detailVal } : {}) }] : [];

    const positionRaw = whereMatch ? whereMatch[1].trim().toLowerCase() : 'auto';
    const validPositions = ['auto', 'top', 'bottom', 'left', 'right', 'center'] as const;
    const position = validPositions.find((p) => positionRaw.includes(p)) || 'auto';

    const parsedPlan: MotionScriptHintData | undefined = titleVal ? {
      version: 1,
      templateId: typeKey,
      type: typeKey,
      intent: `${rawType.replace(/_/g, ' ')}: ${titleVal}`,
      quote: quoteVal,
      position,
      durationSec: 4.5,
      layout: 'auto',
      content: { items, links: [] }
    } : undefined;

    list.push({
      index: tagNum ? Number(tagNum) : idx++,
      type: rawType,
      scene: sceneVal,
      title: titleVal || undefined,
      detail: detailVal || undefined,
      assetPrompt: assetPromptMatch ? assetPromptMatch[1].trim() : undefined,
      raw,
      motionPlan: parsedPlan,
    });
  }
  return list;
}

export function parseAIResponse(text: string): ParsedAIResponse {
  const cleaned = text.trim();

  return {
    script: findScript(cleaned),
    ttsText: findNarration(cleaned),
    imagePrompts: findImagePrompts(cleaned),
    metadata: findMetadata(cleaned),
  };
}
