import { getXkiroModels } from '../services/xkiro-models.js';
import { normalizeScenePlanResponse } from '../services/scene-plan-format.js';
import { currentWorkspace } from '../services/workspace.js';
import { Router } from 'express';
import { parseScenePlan, spokenText } from '../services/scene-plan.js';
import { chat, formatGeminiModel } from '../services/gemini.js';
import { generateLongScenePlan, longGenerationDuration } from '../services/long-script-generation.js';
import { repairVisualPrompts } from '../services/visual-prompt-repair.js';
import { store } from '../services/store.js';
import { validateEditingSettings } from '../services/auto-edit.js';
import { planReliableEdit } from '../services/ai-edit.js';
import { isOpenCodeModel } from '../services/opencode-models.js';
import { streamOpenCode, streamReasoning } from '../services/opencode.js';
import { reasoningProvider, GROQ_MODELS, OPENROUTER_MODELS } from '../services/reasoning-models.js';
import { isLocalModel, LOCAL_MODELS } from '../services/local-models.js';
import { streamLocal } from '../services/ollama.js';

export const llmRouter = Router();

llmRouter.get('/models/xkiro', async (_req, res) => {
  try { res.json({ models: await getXkiroModels() }); }
  catch { res.status(502).json({ error: 'Could not load Xkiro models. Try again shortly.' }); }
});

llmRouter.post('/editing-plan', async (req, res) => {
  if (currentWorkspace().profile === 'shorts') { res.status(400).json({ error: 'Use the scene editor in Mixed Media or Long Video.' }); return; }
  const script = store.getById<any>('scripts', req.body?.scriptId);
  if (!script?.scenePlan) { res.status(404).json({ error: 'Extract a scene plan first.' }); return; }
  let settings;
  try { settings = validateEditingSettings(req.body?.editing); }
  catch { res.status(400).json({ error: 'Invalid editing settings.' }); return; }
  const model = req.body?.model || script.model || process.env.GEMINI_EDIT_MODEL || 'gemini-3.6-flash';
  let xkiroModels: Awaited<ReturnType<typeof getXkiroModels>> = [];
  if (reasoningProvider(model) === 'xkiro') {
    try { xkiroModels = await getXkiroModels(); }
    catch { res.status(502).json({ error: 'Could not load Xkiro models.' }); return; }
  }
  if (typeof model !== 'string' || (!/^gemini-[a-z0-9.-]+$/.test(model) && ![...GROQ_MODELS, ...OPENROUTER_MODELS, ...LOCAL_MODELS, ...xkiroModels].some(item => item.id === model))) {
    res.status(400).json({ error: 'Select a supported editing model.' }); return;
  }
  const provider = reasoningProvider(model);
  const label = isLocalModel(model) ? 'Ollama' : provider === 'groq' ? 'Groq' : provider === 'openrouter' ? 'OpenRouter' : provider === 'xkiro' ? 'Xkiro' : 'Gemini';
  const apiKey = provider === 'xkiro' ? process.env.XKIRO_API_KEY : provider === 'groq' ? process.env.GROQ_API_KEY : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : getApiKey(req);
  if (!apiKey && !isLocalModel(model)) { res.status(401).json({ error: `Add your ${label} API key in server settings.` }); return; }
  try {
    const result = await planReliableEdit(apiKey || '', script.scenePlan, settings, script.generatedAudio?.[0]?.sync, model);
    if (JSON.stringify(store.getById<any>('scripts', script.id)?.scenePlan) !== JSON.stringify(script.scenePlan)) { res.status(409).json({ error: 'The scene plan changed. Request a new editing plan.' }); return; }
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const hint = isLocalModel(model) ? detail : /429|rate.limit/i.test(detail) ? 'Rate or token limit reached. Wait a minute or choose another provider.'
      : /503|UNAVAILABLE/i.test(detail) ? 'The model is busy. Try again or choose another provider.'
      : /401|403/i.test(detail) ? 'Check the API key and model access in your provider account.'
      : /timeout|abort/i.test(detail) ? 'The request timed out. Try another model.'
      : /incomplete|JSON|unsupported|Unexpected/i.test(detail) ? 'The model returned an incomplete or invalid editing plan. Try another model.'
      : 'The request failed. Try another model.';
    res.status(502).json({ error: `${label}: ${hint} Your current settings are unchanged.` });
  }
});

function getApiKey(req: any): string {
  return (
    (req.headers['x-api-key'] as string) ||
    process.env.GEMINI_API_KEY ||
    ''
  );
}

llmRouter.post('/chat', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing Gemini API key' });
      return;
    }
    const result = await chat(apiKey, req.body);
    res.json(result);
  } catch (err: any) {
    console.error('LLM chat error:', err);
    res.status(500).json({ error: err.message || 'LLM request failed' });
  }
});

llmRouter.post('/extract', async (req, res) => {
  const rawText = req.body?.rawText;
  if (typeof rawText !== 'string' || !rawText.trim()) { res.status(400).json({ error: 'rawText is required' }); return; }
  try {
    const plan = parseScenePlan(rawText, req.body?.useTimelineNarration === true);
    const profile = currentWorkspace().profile;
    if (profile === 'mixed' && plan.scenes.some(scene => !scene.mediaType)) throw new Error('Mixed Media requires an image or video mediaType on every scene. Use the shared scene-plan format.');
    res.json({ script: spokenText(plan), ttsText: spokenText(plan), imagePrompts: plan.scenes.map(scene => scene.imagePrompt), scenePlan: plan,
      normalizedResponse: normalizeScenePlanResponse(rawText, plan) });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scene plan' }); }
});

llmRouter.post('/repair-visual-prompts', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) { res.status(401).json({ error: 'Missing Gemini API key' }); return; }
  const { rawText, prompt, model } = req.body || {};
  if (typeof rawText !== 'string' || typeof prompt !== 'string' || typeof model !== 'string' || !model.startsWith('gemini-')) {
    res.status(400).json({ error: 'A response, original prompt and Gemini model are required.' }); return;
  }
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  try {
    const plan = await repairVisualPrompts(apiKey, parseScenePlan(rawText), prompt, model, controller.signal);
    res.json({ rawText: JSON.stringify(plan) });
  } catch (error) {
    if (!controller.signal.aborted) res.status(502).json({ error: error instanceof Error ? error.message : 'Could not expand visual prompts' });
  } finally { res.off('close', disconnect); }
});

llmRouter.post('/scene-analysis', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { script, narration, imagePrompts = [], duration = 30 } = req.body || {};
    const count = Array.isArray(imagePrompts) ? imagePrompts.length : 0;

    const allowedTransitions = [
      'fade', 'fadeblack', 'fadewhite', 'slideleft', 'slideright',
      'slideup', 'slidedown', 'wipeleft', 'wiperight', 'circleopen',
      'circleclose', 'dissolve'
    ];
    const allowedEffects = [
      'crash-zoom', 'slow-zoom-in', 'slow-zoom-out', 'drift-left', 'drift-right',
      'zoom-in', 'zoom-out', 'pan-left', 'pan-right',
      'pan-up', 'pan-down', 'ken-burns-in', 'ken-burns-out', 'hold'
    ];
    const allowedColorGrades = ['teal-orange', 'warm-vintage', 'vibrant', 'dramatic-noir', 'clean'];

    function generateFallback(numImages: number, totalDuration: number) {
      const perImage = Math.max(1.5, Math.round((totalDuration / Math.max(1, numImages)) * 10) / 10);
      const transitionsList: string[] = [];
      const effectsList: string[] = [];
      const timingsList: number[] = [];

      for (let i = 0; i < numImages; i++) {
        timingsList.push(perImage);
        effectsList.push(allowedEffects[i % allowedEffects.length]);
        if (i < numImages - 1) {
          transitionsList.push(allowedTransitions[i % allowedTransitions.length]);
        }
      }

      return {
        transitions: transitionsList,
        effects: effectsList,
        timings: timingsList,
        pacing: perImage < 3 ? 'fast-cut' : 'cinematic',
        mood: 'epic',
        colorGrade: 'teal-orange',
      };
    }

    if (count === 0) {
      res.json(generateFallback(0, duration));
      return;
    }

    if (!apiKey) {
      res.json(generateFallback(count, duration));
      return;
    }

    try {
      const prompt = `Given this video script and ${count} scene images, suggest visual pacing, image camera motions, transitions between scenes, cinematic color grade, and video mood.

Target Duration: ~${duration} seconds.
Script/Narration: "${narration || script || ''}"
Image Prompts:
${imagePrompts.map((p: string, i: number) => `[Image ${i + 1}]: ${p}`).join('\n')}

Output JSON format:
{
  "transitions": [array of ${Math.max(0, count - 1)} transition strings picked from: ${allowedTransitions.join(', ')}],
  "effects": [array of ${count} motion effect strings picked from: ${allowedEffects.join(', ')}],
  "timings": [array of ${count} duration numbers in seconds summing close to ${duration}],
  "pacing": "fast-cut" or "cinematic",
  "mood": "epic" | "upbeat" | "calm" | "suspense" | "emotional" | "neutral",
  "colorGrade": "teal-orange" | "warm-vintage" | "vibrant" | "dramatic-noir" | "clean"
}`;

      const result = await chat(apiKey, {
        model: 'gemini-3.6-flash',
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: `You are an expert video director for ${currentWorkspace().profile !== 'shorts' ? 'long-form landscape YouTube videos with clear chapters and sustained pacing' : 'viral YouTube Shorts'}. Return ONLY a single valid JSON object, no markdown fences.` },
          { role: 'user', content: prompt },
        ],
      });

      const content = result.choices?.[0]?.message?.content || '';
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const transitions = Array.isArray(parsed.transitions)
        ? parsed.transitions.map((t: string) => (allowedTransitions.includes(t) ? t : 'fade'))
        : [];
      while (transitions.length < Math.max(0, count - 1)) {
        transitions.push(allowedTransitions[transitions.length % allowedTransitions.length]);
      }

      const effects = Array.isArray(parsed.effects)
        ? parsed.effects.map((e: string) => (allowedEffects.includes(e) ? e : 'zoom-in'))
        : [];
      while (effects.length < count) {
        effects.push(allowedEffects[effects.length % allowedEffects.length]);
      }

      const timings = Array.isArray(parsed.timings) && parsed.timings.length === count
        ? parsed.timings.map((t: any) => Math.max(1, Number(t) || duration / count))
        : Array(count).fill(Math.round((duration / count) * 10) / 10);

      const colorGrade = typeof parsed.colorGrade === 'string' && allowedColorGrades.includes(parsed.colorGrade)
        ? parsed.colorGrade
        : (parsed.mood === 'suspense' || parsed.mood === 'epic' ? 'teal-orange' : parsed.mood === 'calm' ? 'warm-vintage' : 'vibrant');

      res.json({
        transitions,
        effects,
        timings,
        pacing: parsed.pacing || (duration / count < 3 ? 'fast-cut' : 'cinematic'),
        mood: parsed.mood || 'epic',
        colorGrade,
      });
    } catch (llmErr) {
      console.warn('Scene analysis LLM fallback used:', llmErr);
      res.json(generateFallback(count, duration));
    }
  } catch (err: any) {
    console.error('Scene analysis error:', err);
    res.status(500).json({ error: err.message || 'Scene analysis failed' });
  }
});

llmRouter.post('/chat/stream', async (req, res) => {
  const local = isLocalModel(req.body?.model);
  const openCode = isOpenCodeModel(req.body?.model);
  const provider = reasoningProvider(req.body?.model);
  const apiKey = provider === 'xkiro' ? process.env.XKIRO_API_KEY : provider === 'groq' ? process.env.GROQ_API_KEY : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : openCode ? process.env.OPENCODE_API_KEY : getApiKey(req);
  if (!apiKey && !local) {
    res.status(401).json({ error: provider ? `Missing ${provider} API key in server settings` : openCode ? 'Missing OpenCode API key in server settings' : 'Missing Gemini API key' });
    return;
  }

  const { messages, model, temperature, max_tokens, jsonSchema } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (local || openCode || provider) {
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    res.on('close', disconnect);
    try {
      const request = { messages, model, temperature, max_tokens, signal: controller.signal };
      for await (const event of (local ? streamLocal(request) : (openCode ? streamOpenCode : streamReasoning)(apiKey!, request))) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (error) {
      if (!controller.signal.aborted) res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'OpenCode stream failed' })}\n\n`);
    } finally {
      res.off('close', disconnect);
      res.end();
    }
    return;
  }

  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  try {
    const request = { messages, model, temperature, max_tokens, jsonSchema, signal: controller.signal };
    const episodeDuration = longGenerationDuration(request);
    if (episodeDuration) {
      await generateLongScenePlan(apiKey!, request, episodeDuration, token => res.write(`data: ${JSON.stringify({ token })}\n\n`));
      res.write(`data: ${JSON.stringify({ finishReason: 'STOP', done: true })}\n\n`);
      res.end(); return;
    }
    const formattedModel = formatGeminiModel(model);
    
    // Build Gemini payload
    let systemInstruction: string | undefined = undefined;
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = systemInstruction ? `${systemInstruction}\n\n${msg.content}` : msg.content;
      } else {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: msg.content }],
        });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: max_tokens ?? 8192,
        ...(jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}),
      },
    };

    if (systemInstruction) {
      payload.system_instruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${formattedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    let response!: Response;
    for (let attempt = 0; attempt < 4; attempt++) {
      controller.signal.throwIfAborted();
      response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (response.ok) break;
      const detail = await response.text();
      const dailyQuota = /PerDay|requests per day|daily quota/i.test(detail);
      if (attempt === 3 || dailyQuota || ![429, 500, 502, 503].includes(response.status)) {
        res.write(`data: ${JSON.stringify({ error: `Gemini API error ${response.status}: ${detail}` })}\n\n`);
        res.end(); return;
      }
      const retrySeconds = Number(detail.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
      const waitMs = Math.min(60000, retrySeconds ? (retrySeconds + 1) * 1000 : 3000 * 2 ** attempt);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, waitMs);
        controller.signal.addEventListener('abort', abort, { once: true });
      });
    }

    if (!response.ok) {
      const text = await response.text();
      res.write(`data: ${JSON.stringify({ error: `Gemini API error ${response.status}: ${text}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response stream' })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finishReasonSeen = false;

    const forwardEvent = (eventBlock: string) => {
      const dataStr = eventBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();

      if (!dataStr || dataStr === '[DONE]') return;

      {
        let parsed;
        try { parsed = JSON.parse(dataStr); }
        catch { throw new Error('Received malformed provider stream data. Partial response was preserved.'); }
        if (parsed.error) throw new Error(parsed.error.message || 'Provider stream failed.');
        if (parsed.promptFeedback?.blockReason) throw new Error(`Provider stopped generation: ${parsed.promptFeedback.blockReason}`);
        const candidate = parsed.candidates?.[0];
        const token = candidate?.content?.parts
          ?.filter((part: { thought?: boolean }) => !part.thought)
          .map((part: { text?: string }) => part.text || '')
          .join('') || '';
        const finishReason = candidate?.finishReason;
        if (finishReason) finishReasonSeen = true;

        if (token || finishReason) {
          res.write(`data: ${JSON.stringify({ token, finishReason })}\n\n`);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      events.forEach(forwardEvent);
    }

    buffer += decoder.decode();
    if (buffer.trim()) forwardEvent(buffer);

    if (!finishReasonSeen) res.write(`data: ${JSON.stringify({ finishReason: 'STREAM_INTERRUPTED' })}\n\n`);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (!controller.signal.aborted) res.write(`data: ${JSON.stringify({ error: err.message || 'Stream failed' })}\n\n`);
    res.end();
  } finally {
    res.off('close', disconnect);
  }
});

llmRouter.post('/enhance-narration', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing Gemini API key' });
      return;
    }

    const { text, language = 'en', tone = 'storyteller' } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Narration text is required' });
      return;
    }

    const toneInstructions: Record<string, string> = {
      storyteller: 'Atmospheric, cinematic, suspenseful. Build tension before key reveals using dramatic pauses. Sound like a master documentary narrator (e.g., Vox, Kurzgesagt, or David Attenborough).',
      viral: 'Fast-paced, high-retention, dynamic and snappy. Short 4-8 word punchy sentences. High energy delivery like a top viral creator.',
      conversational: 'Casual, warm, authentic, and direct. Feels like an intimate podcast host or friend sharing an eye-opening story over coffee.',
      dramatic: 'Intense, emotional, solemn, and profound. Give every word gravity, using deliberate pregnant pauses for maximum psychological impact.',
    };

    const selectedTone = toneInstructions[tone] || toneInstructions.storyteller;
    const isHindi = language === 'hi';

    const systemPrompt = `You are an elite YouTube voiceover script doctor and vocal director.
Your mission is to rewrite the input narration into natural, human-grade spoken dialogue tailored specifically for the Chatterbox neural speech synthesizer.

Tone Target: ${selectedTone}
Language: ${isHindi ? 'Hindi (or conversational Hinglish as used in input)' : 'English'}

CRITICAL TTS FORMATTING RULES:
1. Short Spoken Cadence: Break long, dense, formal sentences into punchy spoken phrases. Humans speak in short thought-clusters, not academic paragraphs.
2. Natural Breath & Suspense Pauses: Insert exact pause tokens like [pause 300ms], [pause 600ms], [pause 1s], or ellipses (...) right before punchlines, surprises, reveals, or natural breath breaks.
3. Expressive Pitch Variation: Use exclamation marks (!) for authentic vocal energy and question marks (?) for rising pitch to engage the listener.
4. ABSOLUTELY NO STAGE DIRECTIONS: Never include [whispers], (laughs), [softly], [dramatic pause], [SFX: ...], "Narrator:", "Host:", or scene numbers.
5. NO MARKDOWN: Do not use bold (**), italics (*), bullet points (-), hashtags (#), backslashes (\\), or quotation marks around the output.
6. NO SSML / XML: Chatterbox is a neural flow model and does not use XML tags. Only use plain text with [pause Xms] markers and natural punctuation.
7. Preserve Core Message: Keep all facts, names, and narrative points intact—only elevate the rhythm, engagement, and vocal delivery.

Return ONLY the raw, speakable text. No introductory remarks, no quotes, no markdown fences.`;

    const result = await chat(apiKey, {
      model: 'gemini-3.6-flash',
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please optimize and enhance this narration for audio delivery:\n\n${text}` },
      ],
    });

    let enhanced = result.choices?.[0]?.message?.content || '';
    enhanced = enhanced.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    enhanced = enhanced.replace(/^["']|["']$/g, '').trim();

    res.json({ enhancedText: enhanced });
  } catch (err: any) {
    console.error('Enhance narration error:', err);
    res.status(500).json({ error: err.message || 'Failed to enhance narration' });
  }
});
