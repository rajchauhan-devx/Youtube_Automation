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
  Layers,
  Wand2,
  Type,
  Volume2,
  ShieldCheck,
  Zap,
  Check,
  Eye,
  AlertCircle,
} from 'lucide-react';
import type { Script } from '../../data';
import type { DynamicMotionGraphicData, ExtraPopupAsset } from '@tubeflow/editing-contracts';
import { DynamicMotionPlayer, playSynthesizedSfx } from './DynamicMotionPlayer';

interface DynamicMotionStudioProps {
  script: Script;
  onUpdateScript?: (patch: Partial<Script>) => void;
}

const STYLE_PRESETS = [
  { id: 'vedic-gold', label: 'Vedic Gold', desc: 'Ancient Dharma & Solar Aura', icon: '🌟', channel: 'Ancient Dharma' },
  { id: 'tactical-cyber', label: 'Rule Zero HUD', desc: 'Tactical Cyan & Biometrics', icon: '🎯', channel: 'Rule Zero' },
  { id: 'archival-compass', label: 'Against the Odds', desc: 'Brass Compass & Topography', icon: '🧭', channel: 'Against the Odds' },
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
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState<'idle' | 'orchestrating' | 'verifying' | 'done'>('idle');
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string>('vedic-gold');
  const [activeTab, setActiveTab] = useState<'graphics' | 'popups'>('graphics');
  const [selectedGraphicIndex, setSelectedGraphicIndex] = useState<number>(0);
  const [selectedPopupIndex, setSelectedPopupIndex] = useState<number>(0);
  const [showVerificationReport, setShowVerificationReport] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dynamic motion graphics and extra popups stored on script
  const graphics: DynamicMotionGraphicData[] = (script as any).dynamicMotionGraphics || [];
  const popups: ExtraPopupAsset[] = (script as any).extraPopups || [];
  const verification = (script as any).twoStepVerification;

  // Extract scenes from script response or prompt
  function extractSceneInputs() {
    const scenes: Array<{ sceneIndex: number; narration: string; visualPrompt: string; durationSec: number }> = [];
    const imagePrompts: string[] = script.imagePrompts || [];
    const narrationText = script.narration || script.extractedScript || script.aiResponse || '';

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

  /**
   * Complete 2-Step AI Orchestration & Full-Script Verification Engine:
   * Step 1: Decides & places motion graphics AND extra popups where & how to use.
   * Step 2: Runs a full verification pass: checks mistakes, audits retention, refines cues & timing.
   */
  async function handleTwoStepVerification() {
    setIsVerifying(true);
    setVerifyStep('orchestrating');
    setError(null);

    try {
      const activePreset = STYLE_PRESETS.find((p) => p.id === selectedTheme);
      const channelName = activePreset?.channel || (script as any).channelName || 'Ancient Dharma';

      // Step indicator simulation for snappy feedback
      setTimeout(() => {
        setVerifyStep('verifying');
      }, 1400);

      const res = await fetch('/api/editing/two-step-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          channelName,
          theme: selectedTheme,
          customInstructions: customPrompt.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Two-step verification failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (onUpdateScript && data.script) {
        onUpdateScript({
          ...data.script,
          dynamicMotionGraphics: data.dynamicMotionGraphics || data.script.dynamicMotionGraphics,
          extraPopups: data.extraPopups || data.script.extraPopups,
          twoStepVerification: data.report || data.script.twoStepVerification,
        });
      }

      setVerifyStep('done');
      setSelectedGraphicIndex(0);
      setSelectedPopupIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete two-step verification');
      setVerifyStep('idle');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleAIDecideMotion(overrideScenes?: any[]) {
    setIsGenerating(true);
    setError(null);
    try {
      const scenes = overrideScenes || extractSceneInputs();
      const activePreset = STYLE_PRESETS.find((p) => p.id === selectedTheme);
      const channelName = activePreset?.channel || (script as any).channelName || 'Ancient Dharma';

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

  function handleUpdateCopy(newTitle: string, newDetail?: string) {
    if (!activeGraphic || !onUpdateScript) return;
    let updatedHtml = activeGraphic.render.html;
    if (activeGraphic.title && newTitle) {
      updatedHtml = updatedHtml.split(activeGraphic.title).join(newTitle);
    }
    if (activeGraphic.detail && newDetail !== undefined) {
      updatedHtml = updatedHtml.split(activeGraphic.detail).join(newDetail);
    }
    const updated = {
      ...activeGraphic,
      title: newTitle,
      detail: newDetail,
      render: {
        ...activeGraphic.render,
        html: updatedHtml,
      },
    };
    const newGraphics = [...graphics];
    newGraphics[selectedGraphicIndex] = updated;
    onUpdateScript({ ...(script as any), dynamicMotionGraphics: newGraphics });
  }

  function handleToggle3D(enabled: boolean) {
    if (!activeGraphic || !onUpdateScript) return;
    const currentVfx = activeGraphic.vfx || { tilt3d: false, particles: true, lensflare: true };
    const updatedVfx = { ...currentVfx, tilt3d: enabled };
    let updatedCss = activeGraphic.render.css;
    if (!enabled) {
      updatedCss = updatedCss.replace(/rotateX\([^)]+\)/g, 'rotateX(0deg)').replace(/rotateY\([^)]+\)/g, 'rotateY(0deg)');
    } else {
      updatedCss = updatedCss.replace(/rotateX\([^)]+\)/g, 'rotateX(-14deg)').replace(/rotateY\([^)]+\)/g, 'rotateY(10deg)');
    }
    const updated = {
      ...activeGraphic,
      vfx: updatedVfx,
      render: {
        ...activeGraphic.render,
        css: updatedCss,
      },
    };
    const newGraphics = [...graphics];
    newGraphics[selectedGraphicIndex] = updated;
    onUpdateScript({ ...(script as any), dynamicMotionGraphics: newGraphics });
  }

  function handleToggleLensFlare(enabled: boolean) {
    if (!activeGraphic || !onUpdateScript) return;
    const currentVfx = activeGraphic.vfx || { tilt3d: true, particles: true, lensflare: true };
    const updatedVfx = { ...currentVfx, lensflare: enabled };
    const updated = {
      ...activeGraphic,
      vfx: updatedVfx,
      render: {
        ...activeGraphic.render,
        css: activeGraphic.render.css.replace(
          /\.dm-lens-flare\s*\{[^}]*\}/g,
          `.dm-lens-flare { display: ${enabled ? 'block' : 'none'} !important; }`
        ),
      },
    };
    const newGraphics = [...graphics];
    newGraphics[selectedGraphicIndex] = updated;
    onUpdateScript({ ...(script as any), dynamicMotionGraphics: newGraphics });
  }

  // Active items for playback
  const activeGraphic = graphics[selectedGraphicIndex] || graphics[0];
  const activePopup = popups[selectedPopupIndex] || popups.find(p => p.sceneIndex === activeGraphic?.sceneIndex);

  const activeSceneIdx = activeTab === 'popups' && activePopup
    ? activePopup.sceneIndex
    : activeGraphic
      ? (typeof activeGraphic.sceneIndex === 'number' ? activeGraphic.sceneIndex : 0)
      : 0;

  const activeBackgroundImage =
    (script.generatedImages && script.generatedImages[activeSceneIdx]?.url) || undefined;

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
                AI Preview Motion &amp; Retention Studio
              </h3>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                2-Step Verification Enabled
              </span>
            </div>
            <p className="text-xs text-amber-200/60">
              AI decides where &amp; how to use motion graphics + popups, then re-runs to audit mistakes, retention &amp; timing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Main 2-Step Verification & Orchestration Trigger */}
          <button
            type="button"
            onClick={handleTwoStepVerification}
            disabled={isVerifying || isGenerating}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 px-4 py-2 text-xs font-black text-black shadow-lg shadow-amber-500/25 hover:brightness-110 active:scale-95 disabled:opacity-50 transition"
            title="AI decides motion graphics & popups, then verifies the whole script in a 2-step audit"
          >
            {isVerifying ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                {verifyStep === 'orchestrating'
                  ? 'Step 1/2: Orchestrating Overlays…'
                  : 'Step 2/2: Verifying Script & Cues…'}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>AI 2-Step Verify &amp; Orchestrate</span>
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
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TWO-STEP VERIFICATION & RETENTION REPORT CARD */}
          {verification && (
            <div className="mb-5 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-200">
                    Two-Step Verification &amp; Retention Audit Passed
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Retention Score: {verification.retentionScore}/100
                  </span>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 capitalize">
                    Hook: {verification.hookStrength}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVerificationReport(!showVerificationReport)}
                  className="text-[11px] text-emerald-400/80 hover:text-emerald-300 font-semibold"
                >
                  {showVerificationReport ? 'Hide Audit Details' : 'View Audit Details'}
                </button>
              </div>

              {showVerificationReport && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Mistakes Corrected */}
                  <div className="rounded-lg border border-emerald-500/15 bg-black/40 p-3">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-[11px] mb-2">
                      <Check className="h-3.5 w-3.5" />
                      Script Proofreading &amp; Pacing
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-gray-300 leading-relaxed">
                      {verification.mistakesCorrected?.map((m: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">✦</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Retention Findings */}
                  <div className="rounded-lg border border-amber-500/15 bg-black/40 p-3">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px] mb-2">
                      <Zap className="h-3.5 w-3.5" />
                      Retention &amp; Curiosity Dynamics
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-gray-300 leading-relaxed">
                      {verification.retentionFindings?.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">✦</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Overlay Synchronizations */}
                  <div className="rounded-lg border border-cyan-500/15 bg-black/40 p-3">
                    <div className="flex items-center gap-1.5 font-bold text-cyan-300 text-[11px] mb-2">
                      <Layers className="h-3.5 w-3.5" />
                      Synchronized Overlays
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-gray-300 leading-relaxed">
                      {verification.overlayAdjustments?.map((a: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-cyan-400 mt-0.5">✦</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
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
                Applied to animated SVGs and Popups during AI orchestration
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {STYLE_PRESETS.map((preset) => {
                const isActive = selectedTheme === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedTheme(preset.id)}
                    className={`flex flex-col items-start rounded-lg border p-2 text-left transition ${
                      isActive
                        ? 'border-amber-400 bg-amber-500/20 text-white shadow-md shadow-amber-500/10'
                        : 'border-white/10 bg-surface/50 text-gray-300 hover:border-amber-500/30 hover:bg-surface/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-200">
                      <span>{preset.icon}</span>
                      <span className="truncate">{preset.label}</span>
                    </div>
                    <span className="mt-0.5 text-[10px] text-gray-400 leading-tight truncate w-full">
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {graphics.length === 0 && popups.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-amber-100">
                AI Ready to Decide &amp; Verify All Overlays
              </h4>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-amber-200/70">
                Click <strong>"AI 2-Step Verify &amp; Orchestrate"</strong> above. The AI will inspect your entire script right here in the Preview page, determine where and how to trigger <strong>motion graphics &amp; popups</strong>, and then run a second verification pass to catch script mistakes and optimize viewer retention.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-amber-300/80">
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Step 1: Real Animated SVGs &amp; Retention Callouts
                </span>
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Step 2: Proofreading, Pacing &amp; Retention Audit
                </span>
                <span className="rounded-md border border-amber-500/30 bg-black/40 px-2 py-1">
                  ✦ Zero Outside Configuration Needed
                </span>
              </div>
            </div>
          ) : (
            /* Active Decided Graphics & Popups View */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Overlay Selector Tabs & Beat List */}
              <div className="space-y-3 lg:col-span-5">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('graphics')}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        activeTab === 'graphics'
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Layers className="h-3 w-3" />
                      Motion Graphics ({graphics.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('popups')}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        activeTab === 'popups'
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Zap className="h-3 w-3" />
                      Retention Popups ({popups.length})
                    </button>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">Verified</span>
                </div>

                {activeTab === 'graphics' ? (
                  /* Motion Graphics List */
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
                                Scene {g.sceneIndex + 1} · {g.durationSec}s
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
                              <strong>Cue:</strong> "{g.cuePhrase ? g.cuePhrase.slice(0, 24) : 'Beat start'}…"
                            </span>
                            <span>·</span>
                            <span>Starts: {(g.startSec || 1.0).toFixed(1)}s</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Retention Popups List */
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {popups.map((p, idx) => {
                      const isSelected = idx === selectedPopupIndex;
                      return (
                        <div
                          key={p.id || idx}
                          onClick={() => setSelectedPopupIndex(idx)}
                          className={`group relative cursor-pointer rounded-xl border p-3.5 transition ${
                            isSelected
                              ? 'border-yellow-400 bg-yellow-500/15 shadow-lg shadow-yellow-500/10'
                              : 'border-yellow-500/20 bg-surface/40 hover:border-yellow-500/40 hover:bg-surface/70'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300 uppercase tracking-wider">
                              {(p.archetype || p.shape).replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px] font-mono text-gray-400">
                              Scene {p.sceneIndex + 1} · {(p.cueOffsetSec || 1.0).toFixed(1)}s
                            </span>
                          </div>

                          <h5 className="mt-2 text-sm font-bold text-white line-clamp-1">
                            {p.title || p.badgeTag || 'Retention Callout'}
                          </h5>

                          {p.statValue && (
                            <p className="mt-0.5 text-xs font-semibold text-yellow-300">
                              {p.statValue} {p.statUnit || ''}
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-yellow-500/10 pt-2 text-[10px] text-gray-400">
                            <span>
                              <strong>Trigger Cue:</strong> "{p.cueWord || 'Spoken beat'}"
                            </span>
                            <span>·</span>
                            <span>Placement: {p.placement}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Custom Guidance Prompt Bar */}
                <div className="rounded-xl border border-amber-500/20 bg-black/40 p-3">
                  <label className="text-[11px] font-semibold text-amber-200 block mb-1">
                    Custom AI Refinement Guidance (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g. Focus on ancient astronomical dials, high energy pacing..."
                      className="flex-1 rounded-lg border border-amber-500/30 bg-surface px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleTwoStepVerification}
                      disabled={isVerifying}
                      className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
                    >
                      Re-Verify
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
                        Live Synchronized Preview
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Scene {activeSceneIdx + 1}
                      </span>
                    </div>

                    <DynamicMotionPlayer
                      graphic={activeGraphic}
                      backgroundImageUrl={activeBackgroundImage}
                      aspectRatio="9:16"
                      extraPopup={
                        popups.find((p) => p.sceneIndex === activeSceneIdx) || activePopup
                      }
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
                              -
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

                        {/* Position Controls */}
                        <div className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-surface/50 px-2 py-1.5">
                          <span className="text-[10px] text-gray-400">Position:</span>
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

                    {/* Quick Live Text & Copy Editor */}
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-black/60 p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-amber-200">
                        <span className="flex items-center gap-1">
                          <Type className="h-3 w-3 text-amber-400" />
                          Content &amp; Text Copy (Live)
                        </span>
                        <span className="text-[10px] text-amber-400/80">Instant Live Update</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Title</label>
                          <input
                            type="text"
                            value={activeGraphic.title || ''}
                            onChange={(e) => handleUpdateCopy(e.target.value, activeGraphic.detail)}
                            className="w-full rounded border border-amber-500/30 bg-surface px-2.5 py-1 text-xs text-white outline-none focus:border-amber-400 font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Subtitle / Metric</label>
                          <input
                            type="text"
                            value={activeGraphic.detail || ''}
                            onChange={(e) => handleUpdateCopy(activeGraphic.title, e.target.value)}
                            className="w-full rounded border border-amber-500/30 bg-surface px-2.5 py-1 text-xs text-amber-200/90 outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Cinematic VFX & 3D Depth Toggles */}
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-black/60 p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-amber-200">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3 text-amber-400" />
                          Cinematic VFX &amp; 3D Depth
                        </span>
                        <span className="text-[10px] font-mono text-cyan-300">GPU Accelerated</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggle3D(!activeGraphic.vfx?.tilt3d)}
                          className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 transition ${
                            activeGraphic.vfx?.tilt3d
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                              : 'border-amber-500/20 bg-surface/40 text-gray-400'
                          }`}
                        >
                          <span className="text-[11px]">3D Tilt</span>
                          <span className="text-[10px] font-mono">{activeGraphic.vfx?.tilt3d ? 'ON' : 'OFF'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleLensFlare(!activeGraphic.vfx?.lensflare)}
                          className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 transition ${
                            activeGraphic.vfx?.lensflare
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold'
                              : 'border-amber-500/20 bg-surface/40 text-gray-400'
                          }`}
                        >
                          <span className="text-[11px]">Lens Flare</span>
                          <span className="text-[10px] font-mono">{activeGraphic.vfx?.lensflare ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Audio Sound Effect Cue Card */}
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/20 bg-black/60 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                          <Volume2 className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <span className="font-bold text-amber-200 text-[11px] block">
                            SFX: {(activeGraphic.sfx?.kind || 'whoosh').replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Cue at {(activeGraphic.sfx?.startSec ?? activeGraphic.startSec ?? 1.0).toFixed(1)}s
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => playSynthesizedSfx(activeGraphic.sfx?.kind || 'whoosh', activeGraphic.sfx?.volume || 0.7)}
                        className="rounded bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30 transition shadow-sm"
                      >
                        Play SFX
                      </button>
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
                    Select a graphic or popup to preview
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
