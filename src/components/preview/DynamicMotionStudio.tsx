import { useState } from 'react';
import {
  Sparkles,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Palette,
  Maximize2,
  Gauge,
  Layers,
  Wand2,
} from 'lucide-react';
import type { Script } from '../../data';
import type { DynamicMotionGraphicData } from '@tubeflow/editing-contracts';
import { DynamicMotionPlayer } from './DynamicMotionPlayer';

interface DynamicMotionStudioProps {
  script: Script;
  onUpdateScript?: (patch: Partial<Script>) => void;
}

const STYLE_PRESETS = [
  { id: 'vedic-gold', label: 'Vedic Gold', desc: '24k Gold & Solar Aura', icon: '🌟' },
  { id: 'celestial-cyan', label: 'Celestial Cyan', desc: 'Cosmic Blue & Starlight', icon: '🌌' },
  { id: 'rudra-fire', label: 'Rudra Fire', desc: 'Shiva Tandava & Blazing Embers', icon: '🔥' },
  { id: 'mystic-amethyst', label: 'Mystic Amethyst', desc: 'Deep Violet & Ethereal Resonance', icon: '🔮' },
];

export function DynamicMotionStudio({
  script,
  onUpdateScript,
}: DynamicMotionStudioProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string>('vedic-gold');
  const [selectedGraphicIndex, setSelectedGraphicIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Dynamic motion graphics stored on script or state
  const graphics: DynamicMotionGraphicData[] = (script as any).dynamicMotionGraphics || [];

  // Extract scenes from script response or prompt
  function extractSceneInputs() {
    const scenes: Array<{ sceneIndex: number; narration: string; visualPrompt: string; durationSec: number }> = [];

    // Parse image prompts
    const imagePrompts: string[] = script.imagePrompts || [];
    const narrationText = script.narration || script.extractedScript || script.aiResponse || '';

    // Split narration into sentences / scenes or match with image prompts
    const sentences = narrationText
      .split(/(?<=[।.\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    const count = Math.max(imagePrompts.length, sentences.length, 3);
    for (let i = 0; i < count; i++) {
      scenes.push({
        sceneIndex: i,
        narration: sentences[i] || `Scene ${i + 1} sacred narrative beat`,
        visualPrompt: imagePrompts[i] || `Scene ${i + 1} Vedic cinematic visuals`,
        durationSec: 6.4,
      });
    }

    return scenes;
  }

  async function handleAIDecideMotion(overrideScenes?: any[]) {
    setIsGenerating(true);
    setError(null);
    try {
      const scenes = overrideScenes || extractSceneInputs();
      const channelName = (script as any).channelName || 'Ancient Dharma';

      const themeInstruction = `Visual Theme Preset: ${selectedTheme.toUpperCase()}. Ensure colors, glowing drop-shadows, and energy particle styling match this aesthetic.`;
      const combinedInstructions = [themeInstruction, customPrompt.trim()].filter(Boolean).join('\n');

      const res = await fetch('/api/editing/dynamic-motion/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes,
          channelName,
          customInstructions: combinedInstructions || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to generate motion graphics: HTTP ${res.status}`);
      }

      const data = await res.json();
      const newGraphics: DynamicMotionGraphicData[] = data.graphics || [];

      if (overrideScenes && overrideScenes.length === 1) {
        // Single scene re-code: merge into existing graphics array
        const updatedTarget = newGraphics[0];
        if (updatedTarget) {
          const merged = [...graphics];
          const targetIdx = merged.findIndex((g) => g.sceneIndex === overrideScenes[0].sceneIndex);
          if (targetIdx !== -1) {
            merged[targetIdx] = updatedTarget;
          } else {
            merged.push(updatedTarget);
          }
          if (onUpdateScript) {
            onUpdateScript({ ...(script as any), dynamicMotionGraphics: merged });
          }
        }
      } else {
        if (onUpdateScript) {
          onUpdateScript({
            ...(script as any),
            dynamicMotionGraphics: newGraphics,
          });
        }
        setSelectedGraphicIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate dynamic motion graphics');
    } finally {
      setIsGenerating(false);
      setGeneratingSceneIdx(null);
    }
  }

  async function handleRegenerateSingleBeat(sceneIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    const allScenes = extractSceneInputs();
    const targetScene = allScenes.find((s) => s.sceneIndex === sceneIndex) || allScenes[sceneIndex] || {
      sceneIndex,
      narration: `Scene ${sceneIndex + 1} narrative beat`,
      visualPrompt: `Scene ${sceneIndex + 1} visuals`,
      durationSec: 6.4,
    };
    setGeneratingSceneIdx(sceneIndex);
    await handleAIDecideMotion([targetScene]);
  }

  function handleAdjustScale(multiplier: number) {
    if (!activeGraphic || !onUpdateScript) return;
    const currentScale = activeGraphic.placement.scale || 1.0;
    const newScale = Math.min(1.6, Math.max(0.6, Math.round((currentScale * multiplier) * 10) / 10));
    
    // Patch CSS transform of the graphic
    const updated = {
      ...activeGraphic,
      placement: { ...activeGraphic.placement, scale: newScale },
      render: {
        ...activeGraphic.render,
        css: activeGraphic.render.css.replace(/transform:\s*([^;]+);/g, (match, p1) => {
          if (p1.includes('scale(')) {
            return `transform: ${p1.replace(/scale\([^)]+\)/, `scale(${newScale})`)};`;
          }
          return `transform: ${p1} scale(${newScale});`;
        }),
      },
    };
    const newGraphics = [...graphics];
    newGraphics[selectedGraphicIndex] = updated;
    onUpdateScript({ ...(script as any), dynamicMotionGraphics: newGraphics });
  }

  function handleAdjustPosition(newPos: 'top' | 'center' | 'bottom') {
    if (!activeGraphic || !onUpdateScript) return;
    const topVal = newPos === 'top' ? '15%' : newPos === 'bottom' ? '72%' : '40%';
    const updated = {
      ...activeGraphic,
      placement: { ...activeGraphic.placement, position: newPos },
      render: {
        ...activeGraphic.render,
        css: activeGraphic.render.css.replace(/top:\s*[^;]+;/g, `top: ${topVal};`),
      },
    };
    const newGraphics = [...graphics];
    newGraphics[selectedGraphicIndex] = updated;
    onUpdateScript({ ...(script as any), dynamicMotionGraphics: newGraphics });
  }

  // Get background image for current selected graphic's scene
  const activeGraphic = graphics[selectedGraphicIndex] || graphics[0];
  const sceneIdx = activeGraphic ? (typeof activeGraphic.sceneIndex === 'number' ? activeGraphic.sceneIndex : 0) : 0;
  const activeBackgroundImage =
    (script.generatedImages && script.generatedImages[sceneIdx]?.url) || undefined;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-[#141009]/95 to-[#0b0805]/95 shadow-xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-glow">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-amber-100">
                Real-Time Dynamic Motion Graphics
              </h3>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                100% Real Visual Vectors &amp; GSAP
              </span>
            </div>
            <p className="text-xs text-amber-200/60">
              Zero static templates · Dynamic animated SVGs, contra-rotating rings, telemetry dials &amp; shockwaves.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAIDecideMotion()}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 px-4 py-2 text-xs font-bold text-black shadow-lg shadow-amber-500/20 hover:brightness-110 active:scale-95 disabled:opacity-50 transition"
          >
            {isGenerating ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                AI Deciding &amp; Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 fill-current" />
                {graphics.length > 0 ? 'Re-generate All Motion Graphics' : 'AI Decide & Generate Motion Graphics'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg border border-amber-500/20 p-2 text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 transition"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      {isOpen && (
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Style Preset Selector Bar */}
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-black/40 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-amber-200">
                <Palette className="h-3.5 w-3.5 text-amber-400" />
                Visual Theme Preset
              </span>
              <span className="text-[11px] text-gray-400">
                Applied during real-time visual code synthesis
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLE_PRESETS.map((preset) => {
                const isActive = selectedTheme === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedTheme(preset.id)}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition ${
                      isActive
                        ? 'border-amber-400 bg-amber-500/20 text-white shadow-md shadow-amber-500/10'
                        : 'border-white/10 bg-surface/50 text-gray-300 hover:border-amber-500/30 hover:bg-surface/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-200">
                      <span>{preset.icon}</span>
                      <span>{preset.label}</span>
                    </div>
                    <span className="mt-0.5 text-[10px] text-gray-400 leading-tight">
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {graphics.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-amber-100">
                No Motion Graphics Generated Yet
              </h4>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-amber-200/70">
                Click <strong>"AI Decide &amp; Generate Motion Graphics"</strong> above. The AI will inspect the script scenes, decide the key dramatic beats, pick when and where to trigger, and dynamically synthesize the Hyperframes motion overlay.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-amber-300/80">
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Concentric Contra-Rotating Chakras
                </span>
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Cosmic Telemetry &amp; Speed Gauges
                </span>
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Dynamic Leader-Line Schematics
                </span>
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Sonic Energy Shockwave Bursts
                </span>
              </div>
            </div>
          ) : (
            /* Active Decided Graphics View */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: List of Decided Graphics */}
              <div className="space-y-3 lg:col-span-5">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-200/80 mb-1">
                  <span>AI Decided Graphics ({graphics.length})</span>
                  <span className="text-[11px] text-amber-400">Real-Time GSAP Timelines</span>
                </div>

                <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {graphics.map((g, idx) => {
                    const isSelected = idx === selectedGraphicIndex;
                    const isSceneRegenerating = generatingSceneIdx === g.sceneIndex;
                    return (
                      <div
                        key={g.id || idx}
                        onClick={() => setSelectedGraphicIndex(idx)}
                        className={`group relative cursor-pointer rounded-xl border p-3.5 transition ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                            : 'border-amber-500/20 bg-surface/40 hover:border-amber-500/40 hover:bg-surface/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                            {g.type.replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono text-gray-400">
                              Scene {g.sceneIndex} · {g.durationSec}s
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleRegenerateSingleBeat(g.sceneIndex, e)}
                              disabled={isGenerating}
                              title="Re-code this visual beat with AI"
                              className="rounded border border-amber-500/30 bg-black/40 p-1 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition disabled:opacity-50"
                            >
                              <Wand2 className={`h-3 w-3 ${isSceneRegenerating ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <h5 className="mt-2 text-sm font-bold text-white line-clamp-1">
                          {g.title}
                        </h5>

                        {g.detail && (
                          <p className="mt-0.5 text-xs text-amber-200/70 line-clamp-1">
                            {g.detail}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-amber-500/10 pt-2 text-[10px] text-gray-400">
                          <span>
                            <strong>When:</strong> "{g.cuePhrase ? g.cuePhrase.slice(0, 24) : 'Beat start'}…"
                          </span>
                          <span>·</span>
                          <span>
                            <strong>Where:</strong> {g.placement.position.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Optional Custom Instructions / Tweak Prompt */}
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/40 p-3">
                  <label className="block text-[11px] font-semibold text-amber-200/80 mb-1.5">
                    Tweak / Custom Motion Guidance (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g. Accelerate rotation to 1440deg, add sonic shockwaves..."
                      className="flex-1 rounded-lg border border-amber-500/30 bg-surface px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleAIDecideMotion()}
                      disabled={isGenerating}
                      className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Interactive Preview Player & Tuning */}
              <div className="lg:col-span-7 flex flex-col items-center">
                {activeGraphic ? (
                  <div className="w-full max-w-[340px]">
                    <div className="mb-2 flex items-center justify-between text-xs text-amber-200/80">
                      <span className="flex items-center gap-1.5">
                        <Play className="h-3 w-3 fill-current text-amber-400" />
                        Live 60fps Dynamic Preview
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {activeGraphic.visualConcept?.slice(0, 32)}…
                      </span>
                    </div>

                    <DynamicMotionPlayer
                      graphic={activeGraphic}
                      backgroundImageUrl={activeBackgroundImage}
                      aspectRatio="9:16"
                    />

                    {/* Live Fine-Tuning Controls Panel */}
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-black/60 p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-amber-200">
                        <span className="flex items-center gap-1">
                          <Sliders className="h-3 w-3 text-amber-400" />
                          Live Layout &amp; Scale Adjuster
                        </span>
                        <span className="text-gray-400">
                          Scale: {activeGraphic.placement.scale || 1.0}x
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Scale Controls */}
                        <div className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-surface/50 px-2 py-1.5">
                          <span className="text-[10px] text-gray-400">Size:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleAdjustScale(0.9)}
                              className="rounded bg-black/40 px-2 py-0.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustScale(1.1)}
                              className="rounded bg-black/40 px-2 py-0.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Position Selector */}
                        <div className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-surface/50 px-2 py-1.5">
                          <span className="text-[10px] text-gray-400">Pos:</span>
                          <div className="flex items-center gap-1 text-[10px]">
                            {(['top', 'center', 'bottom'] as const).map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => handleAdjustPosition(p)}
                                className={`rounded px-1.5 py-0.5 capitalize transition ${
                                  activeGraphic.placement.position === p
                                    ? 'bg-amber-500/30 text-amber-200 font-bold'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                              >
                                {p[0].toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-amber-500/15 bg-black/50 p-2.5 text-xs text-amber-200/70">
                      <p className="font-semibold text-amber-200 text-[11px] mb-0.5">
                        🎨 AI Visual Director Concept:
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        {activeGraphic.visualConcept || 'Pure visual vector motion graphic dynamically compiled for this scene beat.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-xs text-gray-500">
                    Select a graphic to preview
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
