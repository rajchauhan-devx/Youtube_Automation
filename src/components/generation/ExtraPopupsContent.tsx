import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Plus,
  Trash2,
  RotateCcw,
  Eye,
  Upload,
  Volume2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Zap,
} from 'lucide-react';
import type { Script, ExtraPopupAsset, ExtraPopupShapeType, ExtraPopupPlacementType } from '../../data';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { playSynthesizedSfx } from '../preview/DynamicMotionPlayer';
import { ExtraPopupOverlay } from '../preview/ExtraPopupOverlay';

export interface ExtraPopupsContentProps {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}

const SHAPE_OPTIONS: { id: ExtraPopupShapeType; label: string }[] = [
  { id: 'circle_medallion', label: 'Circle (Vedic Gold)' },
  { id: 'tactical_hexagon', label: 'Hexagon (Cyber HUD)' },
  { id: 'museum_glass_card', label: 'Glass Card (Archival)' },
  { id: 'magnifying_loupe', label: 'Detail Loupe (Lens)' },
  { id: 'cutout_relic', label: 'Cutout (Floating Relic)' },
];

const PLACEMENT_OPTIONS: { id: ExtraPopupPlacementType; label: string }[] = [
  { id: 'top-right', label: 'Top-Right' },
  { id: 'top-left', label: 'Top-Left' },
  { id: 'bottom-right', label: 'Bottom-Right' },
  { id: 'bottom-left', label: 'Bottom-Left' },
  { id: 'center-right', label: 'Center-Right' },
  { id: 'center-left', label: 'Center-Left' },
];

const SFX_OPTIONS = [
  { id: 'sacred_bell', label: 'Golden Bell (528Hz)' },
  { id: 'bubble_pop', label: 'Satisfying Pop' },
  { id: 'crystal_ting', label: 'Crystal Ting' },
  { id: 'whoosh', label: 'Velvet Air Whoosh' },
  { id: 'camera_click', label: 'Macro Lens Snap' },
  { id: 'telemetry_chirp', label: 'Dream Arpeggio' },
  { id: 'energy_hum', label: 'Deep Resonance' },
  { id: 'impact_boom', label: 'Cinematic Sub' },
  { id: 'none', label: 'Muted' },
];

export function ExtraPopupsContent({ script, onUpdate }: ExtraPopupsContentProps) {
  const { fetch: apiFetch } = useWorkspaceApi();

  const [isScanning, setIsScanning] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<'cloudflare' | 'local' | 'google' | 'pollinations'>('pollinations');
  const [activeModalPopup, setActiveModalPopup] = useState<ExtraPopupAsset | null>(null);
  const [bgImageError, setBgImageError] = useState(false);
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New popup form state
  const [newPopupScene, setNewPopupScene] = useState<number>(0);
  const [newPopupTitle, setNewPopupTitle] = useState('');
  const [newPopupCue, setNewPopupCue] = useState('');
  const [newPopupShape, setNewPopupShape] = useState<ExtraPopupShapeType>('circle_medallion');
  const [newPopupPlacement, setNewPopupPlacement] = useState<ExtraPopupPlacementType>('top-right');
  const [newPopupSfx, setNewPopupSfx] = useState('whoosh');

  if (!script) {
    return (
      <div className="flex h-64 flex-col items-center justify-center p-6 text-gray-400">
        <Sparkles className="h-8 w-8 text-gray-500 mb-2" />
        <p>Select or create a script to manage Extra Popups.</p>
      </div>
    );
  }

  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const scenes = script.scenePlan?.scenes || [];
  const pendingCount = popups.filter(p => p.status !== 'ready').length;

  // Helper to find background scene image
  const getSceneBackgroundImage = (sceneIndex: number): string | null => {
    const generated = script.generatedImages?.find(img => img.index === sceneIndex);
    if (generated?.url && !generated.url.endsWith('.mp4')) return generated.url;
    // fallback to any ready image in generatedImages
    const anyImage = script.generatedImages?.find(img => img.url && !img.url.endsWith('.mp4'));
    return anyImage?.url || null;
  };

  const handleScanScript = async () => {
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch('/api/extra-popups/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to detect popups');
      onUpdate({ extraPopups: data.popups });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error scanning script for popups');
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerateSingle = async (popup: ExtraPopupAsset) => {
    setGeneratingId(popup.id);
    setErrorMessage(null);
    try {
      const res = await apiFetch('/api/extra-popups/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          popupId: popup.id,
          prompt: popup.prompt,
          provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      const updated = popups.map(p => (p.id === popup.id ? data.popup : p));
      onUpdate({ extraPopups: updated });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed generating popup image');
      const updated = popups.map(p =>
        p.id === popup.id ? { ...p, status: 'error' as const, error: err?.message } : p
      );
      onUpdate({ extraPopups: updated });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch('/api/extra-popups/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch generation failed');
      onUpdate({ extraPopups: data.popups });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed batch generation');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleUpdatePopup = async (updated: Partial<ExtraPopupAsset> & { id: string }) => {
    const existing = popups.find(p => p.id === updated.id);
    if (!existing) return;
    const merged = { ...existing, ...updated };
    const nextList = popups.map(p => (p.id === updated.id ? merged : p));
    onUpdate({ extraPopups: nextList });

    try {
      await apiFetch('/api/extra-popups/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, popup: merged }),
      });
    } catch (err) {
      console.warn('Background update sync failed:', err);
    }
  };

  const handleDeletePopup = async (popupId: string) => {
    const nextList = popups.filter(p => p.id !== popupId);
    onUpdate({ extraPopups: nextList });
    try {
      await apiFetch(`/api/extra-popups/${script.id}/${popupId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Background delete sync failed:', err);
    }
  };

  const handleFileUpload = (popupId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await apiFetch('/api/extra-popups/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id, popupId, base64Data }),
        });
        const data = await res.json();
        if (res.ok && data.popup) {
          const nextList = popups.map(p => (p.id === popupId ? data.popup : p));
          onUpdate({ extraPopups: nextList });
        }
      } catch (err) {
        console.error('File upload failed:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateCustomPopup = async () => {
    if (!newPopupTitle.trim()) return;
    try {
      const res = await apiFetch('/api/extra-popups/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          popup: {
            sceneIndex: newPopupScene,
            title: newPopupTitle.trim(),
            cueWord: newPopupCue.trim() || newPopupTitle.trim(),
            shape: newPopupShape,
            placement: newPopupPlacement,
            sfx: newPopupSfx,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.popup) {
        onUpdate({ extraPopups: [...popups, data.popup] });
        setIsAddModalOpen(false);
        setNewPopupTitle('');
        setNewPopupCue('');
      }
    } catch (err) {
      console.error('Create popup failed:', err);
    }
  };

  const enhancePromptDirectives = (popup: ExtraPopupAsset) => {
    const subject = popup.title || popup.cueWord || 'macro relic detail';
    const enhanced = `Isolated macro studio close-up of ${subject}, sacred craftsmanship, deep obsidian and antique gold sheen, micro-fissures with subtle glowing diya amber embers, razor-sharp tactile texture, centered composition, shallow depth of field, clean dark studio backdrop, 8k photorealistic.`;
    handleUpdatePopup({ id: popup.id, prompt: enhanced });
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-surface p-4 sm:p-6">
      {/* Top Header / Action Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Sparkles className="h-5 w-5 text-accent" />
            Extra Popups Studio
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Retention-driven visual inset detail callouts &amp; macro spotlight assets that pop over your scene video.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Provider Selector with Feature Labels */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs text-gray-300">
            <span className="text-gray-400">Engine:</span>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as any)}
              className="bg-transparent font-medium text-white outline-none cursor-pointer"
            >
              <option value="pollinations" className="bg-surface2 text-white">Pollinations AI (Fast / Zero Setup)</option>
              <option value="cloudflare" className="bg-surface2 text-white">Cloudflare FLUX.1 (Schnell 12B)</option>
              <option value="google" className="bg-surface2 text-white">Google Imagen 3 (Studio 8K)</option>
              <option value="local" className="bg-surface2 text-white">Local ComfyUI (Offline GPU)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={handleScanScript}
            disabled={isScanning || scenes.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-accent/20 border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Scan Narration for Popups
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs font-medium text-white hover:bg-surface3 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Custom Popup
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={handleGenerateAll}
              disabled={isGeneratingAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isGeneratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-white" />}
              Generate All ({pendingCount} Pending)
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-2 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Popups Card List */}
      {popups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-accent/10 p-3 text-accent mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No Extra Popups yet</h3>
          <p className="mt-1 max-w-sm text-xs text-gray-400">
            Click &quot;Scan Narration for Popups&quot; to automatically detect concrete relics, materials, and items from your script, or add one manually.
          </p>
          <button
            type="button"
            onClick={handleScanScript}
            disabled={isScanning || scenes.length === 0}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-accent/90 transition-all"
          >
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Scan Script Narration Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {popups.map(popup => {
            const isGenerating = generatingId === popup.id || (isGeneratingAll && popup.status === 'generating');

            return (
              <div
                key={popup.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface2/50 p-4 transition-all hover:border-accent/40"
              >
                {/* Scene & Timing Badge Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent">
                      Scene {popup.sceneIndex + 1}
                    </span>
                    <span className="text-[11px] font-medium text-gray-400">
                      Cue: &quot;<span className="text-gray-200">{popup.cueWord}</span>&quot; (+{popup.cueOffsetSec}s)
                    </span>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5">
                    {popup.status === 'ready' && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    )}
                    {isGenerating && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-accent animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating
                      </span>
                    )}
                    {popup.status === 'pending' && !isGenerating && (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 font-medium">
                        Pending
                      </span>
                    )}
                    {popup.status === 'error' && !isGenerating && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                        <AlertCircle className="h-3 w-3" /> Error
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Card Body */}
                <div className="flex gap-4">
                  {/* Left: Shape/Mask Thumbnail Preview */}
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-black/60 shadow-inner">
                    {popup.imageUrl ? (
                      <img
                        src={popup.imageUrl}
                        alt={popup.title}
                        className={`h-full w-full object-cover ${
                          popup.shape === 'circle_medallion'
                            ? 'rounded-full border-2 border-amber-500/80'
                            : popup.shape === 'tactical_hexagon'
                            ? 'border-2 border-cyan-500/80'
                            : 'rounded-xl border border-white/20'
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-2 text-center text-[10px] text-gray-500">
                        <Sparkles className="h-5 w-5 mb-1 opacity-40" />
                        <span>Pending</span>
                      </div>
                    )}
                  </div>

                  {/* Middle / Right: Configuration Fields */}
                  <div className="flex flex-1 flex-col gap-2 min-w-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={popup.title}
                        onChange={e => handleUpdatePopup({ id: popup.id, title: e.target.value })}
                        placeholder="Title label"
                        className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-white outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        value={popup.subtitle || ''}
                        onChange={e => handleUpdatePopup({ id: popup.id, subtitle: e.target.value })}
                        placeholder="Subtitle (e.g. Mohs Hardness: 7)"
                        className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-gray-300 outline-none focus:border-accent"
                      />
                    </div>

                    {/* Shape, Placement & SFX Selectors with Crisp Short Labels */}
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={popup.shape}
                        onChange={e =>
                          handleUpdatePopup({ id: popup.id, shape: e.target.value as ExtraPopupShapeType })
                        }
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] text-gray-200 outline-none truncate"
                      >
                        {SHAPE_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id} className="bg-surface2 text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={popup.placement}
                        onChange={e =>
                          handleUpdatePopup({ id: popup.id, placement: e.target.value as ExtraPopupPlacementType })
                        }
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] text-gray-200 outline-none truncate"
                      >
                        {PLACEMENT_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id} className="bg-surface2 text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <select
                          value={popup.sfx || 'whoosh'}
                          onChange={e => handleUpdatePopup({ id: popup.id, sfx: e.target.value as any })}
                          className="flex-1 rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] text-gray-200 outline-none truncate"
                        >
                          {SFX_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id} className="bg-surface2 text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          title="Test SFX Sound"
                          onClick={() => playSynthesizedSfx(popup.sfx, 0.5)}
                          className="rounded-md border border-border bg-surface p-1 text-gray-400 hover:text-white hover:border-accent"
                        >
                          <Volume2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Macro Prompt Input with Quick Enhance Action */}
                    <div className="relative">
                      <textarea
                        rows={2}
                        value={popup.prompt}
                        onChange={e => handleUpdatePopup({ id: popup.id, prompt: e.target.value })}
                        placeholder="1:1 Macro Studio Generation Prompt..."
                        className="w-full resize-none rounded-md border border-border bg-surface p-2 pr-16 text-[11px] text-gray-300 outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => enhancePromptDirectives(popup)}
                        title="Enhance with 8K Macro Studio Directives"
                        className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold text-accent hover:bg-accent/30 transition-all"
                      >
                        <Zap className="h-2.5 w-2.5" /> Macro
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* Live Preview Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModalPopup(popup);
                        setBgImageError(false);
                        setPreviewKey(k => k + 1);
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline transition-all"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Live Preview
                    </button>

                    {/* Upload Custom Image */}
                    <label className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-white transition-colors">
                      <Upload className="h-3.5 w-3.5 text-gray-400" />
                      Upload PNG
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleFileUpload(popup.id, e)}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeletePopup(popup.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      title="Delete Popup"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGenerateSingle(popup)}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-accent/90 transition-all disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : popup.status === 'ready' ? (
                        <RotateCcw className="h-3 w-3" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {popup.status === 'ready' ? 'Re-roll' : 'Generate Now'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Preview Modal with Authentic Scene Background */}
      {activeModalPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative flex flex-col items-center rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex w-full items-center justify-between pb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Live Extra Popup Inspection</h3>
                <p className="text-xs text-gray-400">9:16 Shorts phone container simulation with real scene footage backdrop &amp; SFX.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalPopup(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-surface2 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Simulated 9:16 Phone Canvas */}
            <div className="relative h-[480px] w-[270px] overflow-hidden rounded-2xl border-2 border-zinc-700 bg-zinc-950 shadow-2xl">
              {/* Authentic Scene Background Footage / Image */}
              {getSceneBackgroundImage(activeModalPopup.sceneIndex) && !bgImageError ? (
                <img
                  src={getSceneBackgroundImage(activeModalPopup.sceneIndex)!}
                  alt=""
                  onError={() => setBgImageError(true)}
                  className="absolute inset-0 h-full w-full object-cover brightness-[0.72] contrast-105"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-black to-zinc-950 p-4 flex flex-col justify-between">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    Scene {activeModalPopup.sceneIndex + 1}
                  </div>
                  <div className="text-[11px] text-zinc-400 italic line-clamp-3 bg-black/40 p-2 rounded-lg border border-white/5">
                    &quot;{scenes[activeModalPopup.sceneIndex]?.narration}&quot;
                  </div>
                </div>
              )}

              {/* YouTube Shorts UI Overlay Simulation (Safe zone marks) */}
              <div className="pointer-events-none absolute right-2.5 bottom-12 flex flex-col items-center gap-3 opacity-60">
                <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm" />
                <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm" />
                <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm" />
              </div>

              {/* Render Animated Overlay */}
              <ExtraPopupOverlay
                key={previewKey}
                popup={activeModalPopup}
                playState="playing"
                scaleMultiplier={0.9}
                enableSfx={true}
              />
            </div>

            {/* Spoken Narration Context Callout */}
            {scenes[activeModalPopup.sceneIndex]?.narration && (
              <div className="mt-3 max-w-[270px] rounded-lg bg-surface2/80 border border-border px-3 py-2 text-center">
                <div className="text-[10px] font-semibold text-accent mb-0.5">
                  Cue Word: &quot;{activeModalPopup.cueWord}&quot; (+{activeModalPopup.cueOffsetSec}s)
                </div>
                <div className="text-[11px] text-gray-200 line-clamp-2 italic">
                  &quot;{scenes[activeModalPopup.sceneIndex].narration}&quot;
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewKey(k => k + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-accent/90 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Replay Animation
              </button>
              <button
                type="button"
                onClick={() => setActiveModalPopup(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-gray-300 hover:bg-surface2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Popup Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h3 className="text-sm font-bold text-white">Add Custom Extra Popup</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-surface2 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-gray-300">Assign to Scene</label>
                <select
                  value={newPopupScene}
                  onChange={e => setNewPopupScene(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none cursor-pointer"
                >
                  {scenes.map((s, idx) => (
                    <option key={idx} value={idx}>
                      Scene {idx + 1}: {(s.narration || s.imagePrompt || '').slice(0, 45)}...
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-300">Popup Title (Clean Noun)</label>
                <input
                  type="text"
                  value={newPopupTitle}
                  onChange={e => setNewPopupTitle(e.target.value)}
                  placeholder="e.g. Sacred Black Granite"
                  className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-300">Spoken Cue Word</label>
                <input
                  type="text"
                  value={newPopupCue}
                  onChange={e => setNewPopupCue(e.target.value)}
                  placeholder="e.g. काला ग्रेनाइट"
                  className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-300">Frame Shape</label>
                  <select
                    value={newPopupShape}
                    onChange={e => setNewPopupShape(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    {SHAPE_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300">Screen Placement</label>
                  <select
                    value={newPopupPlacement}
                    onChange={e => setNewPopupPlacement(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    {PLACEMENT_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-300">Entrance Sound Effect (SFX)</label>
                <select
                  value={newPopupSfx}
                  onChange={e => setNewPopupSfx(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface2 p-2 text-xs text-white outline-none cursor-pointer"
                >
                  {SFX_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomPopup}
                disabled={!newPopupTitle.trim()}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-accent/90 disabled:opacity-50"
              >
                Add Popup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
