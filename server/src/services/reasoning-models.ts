export const GROQ_MODELS = [
  { id: 'groq/openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
  { id: 'groq/openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
  { id: 'groq/qwen/qwen3.8-27b', name: 'Qwen 3.8 27B' },
].map(model => ({ ...model, badge: 'Reasoning · Free tier', description: 'Groq reasoning model; free account limits apply.' }));

export const OPENROUTER_MODELS = [
  { id: 'openrouter/qwen/qwen3.8-27b:free', name: 'Qwen 3.8 27B Free' },
  { id: 'openrouter/deepseek/deepseek-v4-flash-0731:free', name: 'DeepSeek V4 Flash Free' },
  { id: 'openrouter/z-ai/glm-5.2:free', name: 'GLM 5.2 Free' },
  { id: 'openrouter/nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning Free' },
  { id: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra Free' },
].map(model => ({ ...model, badge: 'Reasoning · Free', description: 'OpenRouter free reasoning model; rate limits apply.' }));

export function reasoningProvider(model: unknown): 'groq' | 'openrouter' | undefined {
  if (typeof model !== 'string') return;
  if (model.startsWith('groq/')) return 'groq';
  if (model.startsWith('openrouter/')) return 'openrouter';
}
