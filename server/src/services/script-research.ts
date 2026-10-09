import { chat, formatGeminiModel, type ChatMessage } from './gemini.js';
import { isLocalModel } from './local-models.js';
import { streamLocal } from './ollama.js';
import { isOpenCodeModel } from './opencode-models.js';
import { streamOpenCode, streamReasoning } from './opencode.js';
import { reasoningProvider } from './reasoning-models.js';

export interface ResearchSource {
  title: string;
  url?: string;
  snippet?: string;
}

export interface ScriptResearchRequest {
  topic: string;
  template?: string;
  instructions?: string;
  duration?: number;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface ScriptResearchResult {
  researchData: string;
  sources: ResearchSource[];
  model: string;
}

export const RESEARCH_SYSTEM_PROMPT =
  'You are an elite documentary researcher, fact-checker, and story architect for video production. ' +
  'Before the scriptwriter generates the script and scene prompts, your job is to thoroughly research the requested topic and script requirements and compile a dense, factual, production-ready Research Dossier. ' +
  'Do NOT write the final <script>, <image_prompt>, or <video_prompt> tags yet. ' +
  'Instead, gather and organize all essential facts, real-world context, chronology, character/setting details, and narrative beats the scriptwriter must use to generate an authentic, accurate, high-retention response.';

/** Extract concise structural and thematic rules from a script template so the research pass targets what the script needs. */
export function summarizeTemplateForResearch(template = ''): string {
  const trimmed = template.trim();
  if (!trimmed) return 'Standard narrative video script with visual scene prompts.';
  const headings = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+|^\*\*[^*]+\*\*|^SECTION\s+\d+/i.test(line))
    .slice(0, 18);
  const excerpt = trimmed.slice(0, 1800);
  return [
    headings.length ? `Template Sections / Rules:\n${headings.join('\n')}` : '',
    `Template Excerpt:\n${excerpt}${trimmed.length > 1800 ? '\n[...]' : ''}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Query public encyclopedia search API for verified background context on the topic (best-effort, non-blocking fallback). */
export async function gatherTopicWebContext(topic: string, signal?: AbortSignal): Promise<ResearchSource[]> {
  const cleanQuery = topic
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s,\-'".]/gu, ' ')
    .trim()
    .slice(0, 160);
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const timeoutSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(4000),
  ]);

  try {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}` +
      `&srlimit=3&utf8=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'TubeFlowStudio/1.0 (Research Assistant)' },
      signal: timeoutSignal,
    });
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as {
      query?: { search?: { pageid?: number; title?: string; snippet?: string }[] };
    };
    const hits = (searchJson.query?.search || []).filter((item) => item?.title && item?.pageid);
    if (!hits.length) return [];

    const pageIds = hits.map((item) => item.pageid).join('|');
    const extractUrl =
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1` +
      `&pageids=${encodeURIComponent(pageIds)}&format=json&origin=*`;
    const extractRes = await fetch(extractUrl, {
      headers: { 'User-Agent': 'TubeFlowStudio/1.0 (Research Assistant)' },
      signal: timeoutSignal,
    });

    const pages: Record<string, { extract?: string }> = extractRes.ok
      ? (((await extractRes.json()) as { query?: { pages?: Record<string, { extract?: string }> } }).query?.pages || {})
      : {};

    return hits.map((hit) => {
      const rawExtract = pages[String(hit.pageid)]?.extract || '';
      const cleanSnippet = (rawExtract || (hit.snippet || '').replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700);
      const safeTitle = String(hit.title || '').trim();
      return {
        title: safeTitle,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(safeTitle.replace(/\s+/g, '_'))}`,
        snippet: cleanSnippet,
      };
    }).filter((item) => item.title && item.snippet);
  } catch {
    return [];
  }
}

export function buildResearchMessages(params: {
  topic: string;
  template?: string;
  instructions?: string;
  duration?: number;
  webSources?: ResearchSource[];
}): ChatMessage[] {
  const targetDuration = Number.isFinite(params.duration) && (params.duration || 0) > 0 ? Math.round(params.duration!) : 30;
  const templateSummary = summarizeTemplateForResearch(params.template);
  const webBlock =
    params.webSources && params.webSources.length > 0
      ? `\n\n## Retrieved Encyclopedia / Web Reference Extracts\n${params.webSources
          .map((src, idx) => `[Source ${idx + 1}: ${src.title}]${src.url ? ` (${src.url})` : ''}\n${src.snippet || ''}`)
          .join('\n\n')}`
      : '';

  const userPrompt = [
    `Research the following topic and script requirements before script generation begins.`,
    `Topic: ${params.topic.trim()}`,
    `Target Video Duration: ~${targetDuration} seconds`,
    params.instructions?.trim() ? `Additional User Instructions: ${params.instructions.trim()}` : '',
    `\n## Script Template Context & Requirements\n${templateSummary}`,
    webBlock,
    `\n## Required Research Output`,
    `Compile a comprehensive, structured Research Dossier with these 4 sections:`,
    `1. **Verified Facts, Background & Key Data**: Specific real-world facts, names, dates, locations, statistics, cause-and-effect relationships, and essential context related to "${params.topic.trim()}".`,
    `2. **Chronological Story Arc & Scene Beats (~${targetDuration}s)**: Map the researched facts into a compelling narrative progression (Hook -> Setup/Context -> Escalation/Turning Points -> Climax -> Resolution/Payoff) tailored to the script template and ~${targetDuration}s runtime.`,
    `3. **Visual & World-Building Canon**: Concrete visual reference details (setting/era, architecture, lighting/weather mood, wardrobe, props, and character appearance consistency) required for accurate <image_prompt> and <video_prompt> generation.`,
    `4. **Scriptwriter Directives**: Key factual anchors, terminology, and dramatic details that must be woven into the spoken <script> voiceover.`,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

async function runGeminiGroundedResearch(
  apiKey: string,
  modelName: string | undefined,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ text: string; groundedSources: ResearchSource[] }> {
  const model = formatGeminiModel(modelName);
  let systemInstruction: string | undefined;
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${msg.content}` : msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const basePayload: Record<string, unknown> = {
    contents,
    ...(systemInstruction ? { system_instruction: { parts: [{ text: systemInstruction }] } } : {}),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  };

  // Try with Google Search grounding enabled first so Gemini can pull live web facts when supported.
  try {
    const groundedRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, tools: [{ google_search: {} }] }),
      signal,
    });
    if (groundedRes.ok) {
      const data = (await groundedRes.json()) as any;
      const candidate = data?.candidates?.[0];
      const text =
        candidate?.content?.parts
          ?.filter((p: any) => !p.thought)
          .map((p: any) => p.text || '')
          .join('')
          .trim() || '';
      const chunks: any[] = candidate?.groundingMetadata?.groundingChunks || [];
      const groundedSources: ResearchSource[] = chunks
        .map((chunk: any) => ({
          title: String(chunk?.web?.title || '').trim(),
          url: typeof chunk?.web?.uri === 'string' && /^https?:\/\//i.test(chunk.web.uri) ? chunk.web.uri : undefined,
        }))
        .filter((src) => src.title);
      if (text) {
        return { text, groundedSources };
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  // Fallback to standard Gemini chat completion
  const fallback = await chat(apiKey, {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 4096,
    signal,
  });
  return {
    text: fallback.choices?.[0]?.message?.content?.trim() || '',
    groundedSources: [],
  };
}

export async function conductScriptResearch(req: ScriptResearchRequest): Promise<ScriptResearchResult> {
  const topic = (req.topic || '').trim();
  if (!topic) {
    throw new Error('Topic is required for script research');
  }

  const model = req.model || 'gemini-3.6-flash';
  const webSources = await gatherTopicWebContext(topic, req.signal);
  req.signal?.throwIfAborted();

  const messages = buildResearchMessages({
    topic,
    template: req.template,
    instructions: req.instructions,
    duration: req.duration,
    webSources,
  });

  const local = isLocalModel(model);
  const openCode = isOpenCodeModel(model);
  const provider = reasoningProvider(model);

  let researchText = '';
  const allSources: ResearchSource[] = [...webSources];

  try {
    if (local || openCode || provider) {
      const streamReq = {
        model,
        messages,
        temperature: 0.3,
        max_tokens: 3072,
        signal: req.signal,
      };
      const iterator = local
        ? streamLocal(streamReq)
        : (openCode ? streamOpenCode : streamReasoning)(req.apiKey || '', streamReq);
      for await (const event of iterator) {
        if (event.token) researchText += event.token;
      }
      researchText = researchText.trim();
    } else {
      const { text, groundedSources } = await runGeminiGroundedResearch(
        req.apiKey || '',
        model,
        messages,
        req.signal,
      );
      researchText = text;
      for (const gs of groundedSources) {
        if (!allSources.some((existing) => existing.url && existing.url === gs.url)) {
          allSources.push(gs);
        }
      }
    }
  } catch (error) {
    if (req.signal?.aborted) throw error;
    if (webSources.length > 0) {
      researchText = [
        `### Verified Topic Context (${topic})`,
        ...webSources.map((src) => `- **${src.title}**: ${src.snippet}`),
      ].join('\n\n');
    } else {
      throw error;
    }
  }

  if (!researchText && webSources.length > 0) {
    researchText = [
      `### Verified Topic Context (${topic})`,
      ...webSources.map((src) => `- **${src.title}**: ${src.snippet}`),
    ].join('\n\n');
  }

  return {
    researchData: researchText,
    sources: allSources.slice(0, 8),
    model,
  };
}
