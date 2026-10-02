import { useEffect, useState } from 'react';
import { GEMINI_MODELS } from '../../data';
import { LOCAL_MODELS, isLocalModel } from '../../../server/src/services/local-models';
import { OPENCODE_MODELS, isOpenCodeModel } from '../../../server/src/services/opencode-models';
import { GROQ_MODELS, OPENROUTER_MODELS, reasoningProvider } from '../../../server/src/services/reasoning-models';

export const SCRIPT_MODELS = [...LOCAL_MODELS, ...GEMINI_MODELS, ...OPENCODE_MODELS, ...GROQ_MODELS, ...OPENROUTER_MODELS];
const PROVIDERS = { ollama: LOCAL_MODELS, gemini: GEMINI_MODELS, opencode: OPENCODE_MODELS, groq: GROQ_MODELS, openrouter: OPENROUTER_MODELS };

export function ScriptModelSelector({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const [xkiroModels, setXkiroModels] = useState<{ id: string; name: string; badge: string }[]>([]);
  const [catalogStatus, setCatalogStatus] = useState('Loading Xkiro models?');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogStatus('Loading Xkiro models?');
    fetch('/api/llm/models/xkiro', { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { setXkiroModels(data.models); setCatalogStatus(data.models.length ? '' : 'No supported Xkiro chat models available.'); })
      .catch(() => { if (!controller.signal.aborted) { setXkiroModels([]); setCatalogStatus('Could not load Xkiro models.'); } });
    return () => controller.abort();
  }, [retry]);
  const providers = { ...PROVIDERS, xkiro: xkiroModels };
  const openCode = isOpenCodeModel(value);
  const provider = isLocalModel(value) ? 'ollama' : reasoningProvider(value) || (openCode ? 'opencode' : 'gemini');
  const models = providers[provider];
  const selectClass = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent';
  return <div className="space-y-2">
    <label className="block text-xs text-gray-400">Provider
      <select aria-label="AI provider" className={`${selectClass} mt-1`} value={provider} onChange={event => onChange(providers[event.target.value as keyof typeof providers][0].id)}>
        <option value="xkiro" disabled={!xkiroModels.length}>Xkiro</option>
        <option value="gemini">Google Gemini</option>
        <option value="ollama">Local · Ollama</option>
        <option value="groq">Groq · Free tier reasoning</option>
        <option value="openrouter">OpenRouter · Free reasoning</option>
        <option value="opencode">OpenCode · Free models</option>
      </select>
    </label>
    {provider === 'ollama' && <p className="text-[11px] text-gray-400">Runs on your computer. Fast mode is recommended for scripts; Thinking takes longer. Stop Chatterbox and image generation first to free GPU memory. Use shorter prompts for local generation.</p>}
    {(provider === 'groq' || provider === 'openrouter') && <p className="text-[11px] text-gray-400">Thinking enabled. Only the final script is displayed. Free request and token limits apply.</p>}
    {provider === 'xkiro' && <p className="text-[11px] text-gray-400">Live chat catalog. Uses XKIRO_API_KEY in server/.env. Paid and premium models require account access.</p>}
    {catalogStatus && <p className="text-[11px] text-gray-400">{catalogStatus} <button type="button" onClick={() => setRetry(count => count + 1)}>Retry</button></p>}
    <label className="block text-xs text-gray-400">Model
      <select aria-label="AI model" className={`${selectClass} mt-1`} value={models.some(model => model.id === value) ? value : ''} disabled={!models.length} onChange={event => onChange(event.target.value)}>
        {!models.some(model => model.id === value) && <option value="" disabled>Select a supported model</option>}
        {models.map(model => <option key={model.id} value={model.id}>{model.name}{provider === 'xkiro' ? ` (${model.badge})` : ''}</option>)}
      </select>
    </label>
    {openCode && <p className="text-[11px] text-amber-400">OpenCode currently restricts free models to use within OpenCode. Direct requests from this app may be blocked. Select Gemini if generation is denied.</p>}
  </div>;
}
