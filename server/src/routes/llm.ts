import { Router } from 'express';
import { chat } from '../services/openrouter.js';

export const llmRouter = Router();

function getApiKey(req: any): string {
  return (req.headers['x-api-key'] as string) || process.env.OPENROUTER_API_KEY || '';
}

llmRouter.post('/chat', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key' });
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
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key' });
      return;
    }
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      res.status(400).json({ error: 'rawText is required' });
      return;
    }

    const result = await chat(apiKey, {
      model: 'deepseek/deepseek-v4-flash',
      temperature: 0,
      max_tokens: 8192,
      messages: [
        {
          role: 'system',
          content: `You extract structured assets from a YouTube script-generation document. The input format varies between responses — headings, numbering, and section names may differ. The document may contain explicit tag markers: <image_prompt> (with optional #image N numbering) wraps each image prompt, and <script> wraps the spoken narration. Read the whole document and identify the content by MEANING, not by exact keywords.

Return ONLY a single valid JSON object, no markdown fences, no commentary, in this exact shape:
{
  "script": "the full narrative/scene-by-scene script text — prefer content inside <script> tags if present, otherwise extract by meaning",
  "ttsText": "the narration/voiceover text optimized for text-to-speech (no scene labels, no timestamps, no stage directions). Use commas for natural breath pauses, ellipses for suspense, and exclamation marks for emphasis. Ensure short, punchy sentences that sound conversational and engaging when spoken aloud like a top YouTuber speaking to the camera.",
  "imagePrompts": ["prompt for image 1", "prompt for image 2", ...]
}

Rules:
- imagePrompts must contain ONLY the actual AI image-generation prompt text for each image (the descriptive visual prompt), one string per image, in order. Prefer content inside <image_prompt> tags (one string per tag). Do not include labels like "Purpose:", "Narration covered:", "Character reference:", scene numbers, or negative prompts as separate array entries — merge continuity/negative-prompt detail into the same string as its image only if useful, otherwise omit it.
- If there is no image prompt section, return an empty array.
- If there is no separate narration/TTS section, use the closest match (e.g. a paste-ready voiceover block) or derive clean spoken narration from the script.
- Do not invent content that isn't in the source text.`,
        },
        { role: 'user', content: rawText },
      ],
    });

    const content = result.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json({
      script: parsed.script || '',
      ttsText: parsed.ttsText || '',
      imagePrompts: Array.isArray(parsed.imagePrompts) ? parsed.imagePrompts : [],
    });
  } catch (err: any) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
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
      'zoom-in', 'zoom-out', 'pan-left', 'pan-right',
      'pan-up', 'pan-down', 'ken-burns-in', 'hold'
    ];

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
      const prompt = `Given this video script and ${count} scene images, suggest visual pacing, image camera motions, transitions between scenes, and video mood.

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
  "mood": "epic" | "upbeat" | "calm" | "suspense" | "emotional" | "neutral"
}`;

      const result = await chat(apiKey, {
        model: 'deepseek/deepseek-v4-flash',
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: 'You are an expert video director for viral YouTube Shorts. Return ONLY a single valid JSON object, no markdown fences.' },
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

      res.json({
        transitions,
        effects,
        timings,
        pacing: parsed.pacing || (duration / count < 3 ? 'fast-cut' : 'cinematic'),
        mood: parsed.mood || 'epic',
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
  const apiKey = getApiKey(req);
  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  const { messages, model } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'Tubeflow',
      },
      body: JSON.stringify({
        model: model || 'deepseek/deepseek-v4-flash',
        messages,
        temperature: 0.7,
        max_tokens: 32768,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.write(`data: ${JSON.stringify({ error: `API error ${response.status}: ${text}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (content) {
              res.write(`data: ${JSON.stringify({ token: content, finishReason })}\n\n`);
            }
            if (finishReason && finishReason !== 'stop') {
              res.write(`data: ${JSON.stringify({ finishReason })}\n\n`);
            }
          } catch { }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message || 'Stream failed' })}\n\n`);
    res.end();
  }
});
