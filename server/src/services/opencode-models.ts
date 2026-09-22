// Free models verified against https://opencode.ai/docs/zen/.
export const OPENCODE_MODELS = [
  { id: 'opencode/mimo-v2.5-free', name: 'MiMo V2.5 Free' },
  { id: 'opencode/big-pickle', name: 'Big Pickle' },
  { id: 'opencode/ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash Fin Free' },
  { id: 'opencode/nemotron-3-ultra-free', name: 'Nemotron 3 Ultra Free' },
  { id: 'opencode/nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning Free' },
  { id: 'opencode/muse-spark-1.3-contributor-free', name: 'Muse Spark 1.3 Contributor Free' },
].map(model => ({ ...model, badge: 'Free', description: 'OpenCode Zen · Free model', recommended: false }));

export function isOpenCodeModel(model: unknown): model is string {
  return typeof model === 'string' && model.startsWith('opencode/');
}
