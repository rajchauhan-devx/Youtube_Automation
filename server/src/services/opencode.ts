import type { ChatRequest } from './gemini.js';
import { OPENCODE_MODELS } from './opencode-models.js';
import { GROQ_MODELS, OPENROUTER_MODELS, reasoningProvider } from './reasoning-models.js';

export async function* streamOpenCode(apiKey: string, req: ChatRequest) {
  yield* streamCompatible(apiKey, req, 'opencode');
}

export async function* streamReasoning(apiKey: string, req: ChatRequest) {
  const provider = reasoningProvider(req.model);
  if (!provider) throw new Error('Select a supported reasoning provider.');
  yield* streamCompatible(apiKey, req, provider);
}

async function* streamCompatible(apiKey: string, req: ChatRequest, provider: 'opencode' | 'groq' | 'openrouter') {
  const label = { opencode: 'OpenCode', groq: 'Groq', openrouter: 'OpenRouter' }[provider];
  const models = { opencode: OPENCODE_MODELS, groq: GROQ_MODELS, openrouter: OPENROUTER_MODELS }[provider];
  if (!models.some(model => model.id === req.model)) throw new Error(`Select an available ${label} free model.`);
  const model = req.model!.slice(provider.length + 1);
  const responses = provider === 'opencode' && model.startsWith('muse-spark-');
  const base = { opencode: 'https://opencode.ai/zen/v1', groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1' }[provider];
  const messages = req.messages.map(message => ({ ...message, role: message.role === 'model' ? 'assistant' : message.role }));
  const response = await fetch(`${base}/${responses ? 'responses' : 'chat/completions'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: req.signal,
    body: JSON.stringify({ model, stream: true,
      ...(provider === 'groq' ? { reasoning_effort: 'medium', include_reasoning: false } : {}),
      ...(provider === 'openrouter' ? { reasoning: { effort: 'medium', exclude: true }, provider: { max_price: { prompt: 0, completion: 0 } } } : {}),
      ...(responses
      ? { input: messages, max_output_tokens: req.max_tokens ?? 8192 }
      : { messages, max_tokens: req.max_tokens ?? (provider === 'groq' ? 4096 : 8192), temperature: req.temperature ?? 0.7 }) }),
  });
  if (!response.ok) {
    if (provider === 'opencode' && response.status === 403) {
      const body = await response.json().catch(() => null) as { error?: { type?: string } } | null;
      if (body?.error?.type === 'FreeTierError') throw new Error('OpenCode restricts its free tier to use within OpenCode. Direct generation from this app is not permitted by the provider. Select Gemini to continue.');
    }
    // Do not relay upstream bodies, which may contain request credentials.
    throw new Error(`${label} request failed (HTTP ${response.status}). ${response.status === 401 ? 'Check the server API key.' : response.status === 429 ? 'Rate or token limit reached. Wait briefly or select another provider.' : response.status === 403 ? 'Check model access and privacy settings in your provider account.' : 'The selected free model may be unavailable. Try another model.'}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label} did not provide a response stream.`);
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  function parse(block: string) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.error || event.type === 'error' || event.type === 'response.failed') throw new Error(`${label} generation failed. Try again or select another free model.`);
    const choice = event.choices?.[0];
    const token = responses ? (event.type === 'response.output_text.delta' ? event.delta : '') : choice?.delta?.content;
    const reason = responses ? (event.type === 'response.completed' ? 'stop' : event.type === 'response.incomplete' ? 'length' : undefined) : choice?.finish_reason;
    if (reason) finished = true;
    if (token || reason) return { token: token || '', finishReason: reason === 'length' ? 'MAX_TOKENS' : reason?.toUpperCase() };
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) { const event = parse(block); if (event) yield event; }
      if (done) break;
    }
    if (buffer.trim()) { const event = parse(buffer); if (event) yield event; }
    if (!finished) yield { token: '', finishReason: 'STREAM_INTERRUPTED' };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
