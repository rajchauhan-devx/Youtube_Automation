import { chat, getGeminiApiKey, type ChatMessage } from './gemini.js';
import { isLocalModel } from './local-models.js';
import { isOpenCodeModel } from './opencode-models.js';
import { streamLocal } from './ollama.js';
import { streamOpenCode, streamReasoning } from './opencode.js';
import { reasoningProvider } from './reasoning-models.js';
import type { Request } from 'express';
import { z } from 'zod';
import { geminiResponseSchema } from './editing/motionProvider.js';

export function modelCredential(model: string, req: Request): string {
  const provider = reasoningProvider(model);
  return (provider === 'xkiro' ? process.env.XKIRO_API_KEY : provider === 'groq' ? process.env.GROQ_API_KEY
    : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : isOpenCodeModel(model) ? process.env.OPENCODE_API_KEY
    : getGeminiApiKey(req.get('x-api-key'))) || '';
}

export async function modelJson(options: {
  model: string; apiKey: string; messages: ChatMessage[]; signal?: AbortSignal; maxTokens?: number; jsonSchema?: Record<string, unknown>;
}): Promise<unknown> {
  const { model, apiKey, messages, signal } = options;
  if (!apiKey && !isLocalModel(model)) throw new Error('Configure the selected model’s API key in Settings.');
  const request = { model, messages, temperature: 0.3, max_tokens: options.maxTokens || 8192, signal };
  let text = '';
  if (isLocalModel(model) || isOpenCodeModel(model) || reasoningProvider(model)) {
    for await (const event of isLocalModel(model) ? streamLocal(request) : (isOpenCodeModel(model) ? streamOpenCode : streamReasoning)(apiKey, request)) {
      if (event.token) text += event.token;
    }
  } else {
    text = (await chat(apiKey, { ...request, json: true, jsonSchema: options.jsonSchema })).choices?.[0]?.message?.content || '';
  }
  signal?.throwIfAborted();
  try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('The model returned incomplete or invalid retention data. Try again.'); }
}

/** Retry malformed required production fields once; never fabricate missing content. */
export async function validatedModelJson<T>(options: Parameters<typeof modelJson>[0], schema: z.ZodType<T>, label: string): Promise<T> {
  let messages = options.messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await modelJson({ ...options, messages, jsonSchema: geminiResponseSchema(schema) });
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const fields = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 12);
    if (attempt === 1) throw new Error(`${label} returned incomplete production data after one repair attempt (${fields.join('; ')}). Your saved work was preserved. Try the step again or select another model.`);
    messages = [...options.messages, { role: 'assistant', content: JSON.stringify(raw) },
      { role: 'user', content: `Repair the JSON response. These required fields are missing or invalid: ${fields.join('; ')}. Return the entire corrected JSON object, preserving all valid content. Do not return only a patch, omit scenes or invent factual details.` }];
  }
  throw new Error(`${label} could not be validated.`);
}
