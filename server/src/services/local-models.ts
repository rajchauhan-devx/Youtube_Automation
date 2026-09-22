export const LOCAL_MODELS = [
  { id: 'ollama/qwen3.5:4b', name: 'Qwen 3.5 4B · Fast', thinking: false, badge: 'Local', description: 'Direct answers on this computer. No API key.' },
  { id: 'ollama/qwen3.5:4b:thinking', name: 'Qwen 3.5 4B · Thinking', thinking: true, badge: 'Local · Thinking', description: 'Slower reasoning mode. Uses the same downloaded model.' },
];
export const isLocalModel = (model: unknown): model is string => typeof model === 'string' && model.startsWith('ollama/');
