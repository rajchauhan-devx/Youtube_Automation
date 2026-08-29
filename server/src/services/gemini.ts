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
  if (modelName.includes('deepseek') || modelName.includes('gpt') || modelName.includes('claude')) {
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  const candidate = data.candidates?.[0];
  const textContent = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';
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
