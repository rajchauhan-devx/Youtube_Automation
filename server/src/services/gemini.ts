const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'model';
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatResponse {
  id: string;
  choices: {
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function formatGeminiModel(modelName?: string): string {
  if (!modelName) return 'gemini-3.6-flash';
  if (
    modelName.includes('deepseek') ||
    modelName.includes('gpt') ||
    modelName.includes('claude') ||
    modelName.startsWith('ollama/') ||
    modelName.includes('qwen')
  ) {
    return 'gemini-3.6-flash';
  }
  return modelName;
}

function buildGeminiPayload(req: ChatRequest) {
  let systemInstruction: string | undefined = undefined;
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  for (const msg of req.messages) {
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

  // Ensure at least one content part exists
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  const payload: any = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.max_tokens ?? 8192,
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
      ...(req.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema } : {}),
    },
  };

  if (systemInstruction) {
    payload.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  return payload;
}

export async function chat(apiKey: string, req: ChatRequest): Promise<ChatResponse> {
  const model = formatGeminiModel(req.model);
  const payload = buildGeminiPayload(req);
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  let res: Response | undefined;
  let retryDelayMs = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    req.signal?.throwIfAborted();
    if (attempt > 0) {
      const delay = retryDelayMs || (res?.status === 429 ? Math.min(30000, 3000 * Math.pow(2, attempt - 1)) : 1500 * Math.pow(2, attempt - 1));
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(req.signal?.reason); };
        const timer = setTimeout(() => { req.signal?.removeEventListener('abort', abort); resolve(); }, delay);
        req.signal?.addEventListener('abort', abort, { once: true });
      });
      req.signal?.throwIfAborted();
    }
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: req.signal,
      });
      if (res.ok) break;
      if (![429, 500, 502, 503].includes(res.status)) break;
      if (res.status === 429) {
        const detail = await res.clone().text();
        if (/PerDay|requests per day|daily quota/i.test(detail)) break;
        const seconds = Number(detail.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
        retryDelayMs = seconds ? Math.min(60000, (seconds + 1) * 1000) : 0;
      } else retryDelayMs = 0;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }

  if (!res || !res.ok) {
    const text = res ? await res.text() : 'No response';
    throw new Error(`Gemini API error ${res?.status || 500}: ${text}`);
  }

  const data: any = await res.json();
  const candidate = data.candidates?.[0];
  const textContent = candidate?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text || '').join('') || '';
  const finishReason = candidate?.finishReason || 'STOP';

  return {
    id: `gemini-${Date.now()}`,
    choices: [
      {
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason: finishReason.toLowerCase(),
      },
    ],
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}
