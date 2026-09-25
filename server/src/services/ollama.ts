import type { ChatRequest } from './gemini.js';
import { LOCAL_MODELS } from './local-models.js';
import { presenterState } from './presenter-state.js';

const BASE = 'http://127.0.0.1:11434';

export async function* streamLocal(req: ChatRequest) {
  if (presenterState.editingRequests || presenterState.localRequests) throw new Error('Wait for the active local visual-editing or text generation request to finish.');
  presenterState.localRequests++;
  try { yield* streamLocalRequest(req); }
  finally { presenterState.localRequests--; }
}

async function* streamLocalRequest(req: ChatRequest) {
  const selected = LOCAL_MODELS.find(item => item.id === req.model);
  if (!selected) throw new Error('Select an installed local model.');
  const model = 'qwen3.5:4b';
  const context = 8192;
  const inputBytes = req.messages.reduce((size, message) => size + Buffer.byteLength(message.content, 'utf8') + 32, 0);
  // Conservative UTF-8 byte budget prevents silent loss of the original template.
  if (inputBytes > context - 1536) {
    throw new Error('This prompt is too long for the local model settings. Use a shorter template or generate one section at a time.');
  }
  const signal = AbortSignal.any([...(req.signal ? [req.signal] : []), AbortSignal.timeout(900000)]);
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ model, messages: req.messages.map(message => ({ ...message, role: message.role === 'model' ? 'assistant' : message.role })),
        stream: true, think: selected.thinking && !req.json, keep_alive: 0, ...(req.json ? { format: req.jsonSchema ?? 'json' } : {}),
        options: { num_ctx: context, num_predict: Math.min(req.max_tokens ?? 4096, 4096, context - inputBytes - 256), temperature: req.temperature ?? 0.7 } }),
    });
  } catch {
    if (signal.aborted) throw new Error('Local generation was cancelled or timed out.');
    throw new Error('Ollama is offline. Start Ollama on this computer and try again.');
  }
  if (!response.ok) throw new Error(response.status === 404 ? 'Download the local model with: ollama pull qwen3.5:4b' : `Ollama request failed (HTTP ${response.status}). Close other GPU models and try again.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ollama returned no response stream.');
  const decoder = new TextDecoder();
  let buffer = '', finished = false, hasContent = false;
  function parse(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error('Ollama could not generate the response. Check its status and available GPU memory.');
    if (event.done) finished = true;
    if (event.message?.content) hasContent = true;
    if (event.done && !hasContent) throw new Error('The local model used its token allowance without a final answer. Choose Qwen 3.5 4B · Fast or shorten the prompt.');
    return { token: event.message?.content || '', finishReason: event.done ? (event.done_reason === 'length' ? 'MAX_TOKENS' : 'STOP') : undefined };
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) { const event = parse(line); if (event) yield event; }
      if (done) break;
    }
    if (buffer.trim()) { const event = parse(buffer); if (event) yield event; }
    if (!finished) yield { token: '', finishReason: 'STREAM_INTERRUPTED' };
  } finally {
    await reader.cancel().catch(() => {}); reader.releaseLock();
    // Cancelled requests also release their model; this request contains no prompt.
    if (!finished) await fetch(`${BASE}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
}
