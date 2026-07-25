import { Router, Request } from 'express';
import { chat } from '../services/openrouter.js';

export const llmRouter = Router();

function getApiKey(req: Request): string {
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
  } catch (err: unknown) {
    console.error('LLM chat error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'LLM request failed' });
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
  "ttsText": "the clean, paste-ready narration/voiceover text only — no scene labels, no timestamps, no stage directions",
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
  } catch (err: unknown) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Extraction failed' });
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
          } catch {
          // ignore parse errors
        }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream failed' })}\n\n`);
    res.end();
  }
});
