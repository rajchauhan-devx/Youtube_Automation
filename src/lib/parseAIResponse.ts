export interface ParsedAIResponse {
  script: string;
  ttsText: string;
  imagePrompts: string[];
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^\s*```[a-z]*\n?/gim, '').replace(/\n?```\s*$/gim, '');
}

function findImagePrompts(text: string): string[] {
  const prompts: string[] = [];

  // Strategy 1: Look for <image_prompt> tags
  const imageTagRegex = /<image_prompt>(?:\s*#image\s*\d+)?\s*([\s\S]*?)<\/image_prompt>/gi;
  let tagMatch;
  while ((tagMatch = imageTagRegex.exec(text)) !== null) {
    const content = tagMatch[1].trim();
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

  // Strategy 1: Find <tts> tags
  const ttsMatch = text.match(/<tts>([\s\S]*?)<\/tts>/i);
  if (ttsMatch) return stripMarkdownFences(ttsMatch[1]).trim();

  // Strategy 2: Find TTS/Narration/Voiceover section
  const sectionNames = [
    'TTS Script', 'TTS', 'ElevenLabs Script', 'Voiceover Script',
    'Narration Script', 'Spoken Script', 'Narration', 'Voiceover',
    'paste-ready script', 'final narration', 'spoken narration'
  ];
  for (const name of sectionNames) {
    const regex = new RegExp(`(?:#{1,3}\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:：-]*\\n)([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i');
    const match = text.match(regex);
    if (match && match[1].trim().length > 20) {
      return stripMarkdownFences(match[1]).trim();
    }
  }

  // Strategy 3: Find narration under scene descriptions
  const sceneNarration = text.match(/Narration:\s*\n?([\s\S]*?)(?=Duration:|Visual:|Camera:|On-screen|SCENE|\n\n)/gi);
  if (sceneNarration && sceneNarration.length > 0) {
    const narrationParts = sceneNarration.map(m => {
      const content = m.replace(/^Narration:\s*\n?/i, '').trim();
      return content;
    }).filter(p => p.length > 10);
    if (narrationParts.length > 0) return narrationParts.join('\n\n');
  }

  // Strategy 4: Find sections that look like spoken text (short sentences, Hindi/English mix)
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 500);
  const spokenLike = lines.filter(l =>
    !l.match(/^(#{|---|\*\*|Purpose:|Visual:|Camera:|Duration:|Evidence|Emotion:|Narrative|Character|Prompt:|Negative|Continuity|Section|Scene|Beat|Motion)/i) &&
    !l.match(/^\d+\.\s/) &&
    !l.match(/^[-*•]\s/)
  );
  if (spokenLike.length >= 3) {
    // Find contiguous blocks of spoken-like text
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of spokenLike) {
      if (line.length > 20) {
        current.push(line);
      } else if (current.length > 0) {
        blocks.push(current.join(' '));
        current = [];
      }
    }
    if (current.length > 0) blocks.push(current.join(' '));
    if (blocks.length > 0) return blocks.join('\n\n');
  }

  return '';
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

export function parseAIResponse(text: string): ParsedAIResponse {
  const cleaned = text.trim();

  return {
    script: findScript(cleaned),
    ttsText: findNarration(cleaned),
    imagePrompts: findImagePrompts(cleaned),
  };
}
