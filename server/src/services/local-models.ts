export const LOCAL_MODELS = [
  { id: 'ollama/lfm2.5:8b-a1b-q4_K_M', name: 'LFM 2.5 8B · Best JSON', thinking: false, badge: 'Local · Recommended', description: 'Fast MoE model. Best for structured JSON output. No API key.' },
  { id: 'ollama/qwen3.5:4b', name: 'Qwen 3.5 4B · Fast', thinking: false, badge: 'Local', description: 'Direct answers on this computer. No API key.' },
  { id: 'ollama/qwen3.5:4b:thinking', name: 'Qwen 3.5 4B · Thinking', thinking: true, badge: 'Local · Thinking', description: 'Slower reasoning mode. Uses the same downloaded model.' },
];
export const isLocalModel = (model: unknown): model is string => typeof model === 'string' && model.startsWith('ollama/');
