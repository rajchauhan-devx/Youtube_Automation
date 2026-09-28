import { useState, useRef, useEffect } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "@tubeflow/video-composition";
import type { ArtifactComposition } from "@tubeflow/editing-contracts";
import { useEditingProject } from "../../hooks/useEditingProject";
import { editingRequest, type EditingPayload } from "../../services/editingApi";
import { useWorkspaceApi } from "../../services/workspaceApi";
import { GEMINI_MODELS, type Script } from "../../data";
import { LOCAL_MODELS } from "../../../server/src/services/local-models";
import { OPENCODE_MODELS } from "../../../server/src/services/opencode-models";
import { GROQ_MODELS, OPENROUTER_MODELS } from "../../../server/src/services/reasoning-models";

const activeStates = ["queued", "running", "cancel_requested"];
export function ArtifactsTab({
  script,
  onUpdate,
  editor = false,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => unknown;
  editor?: boolean;
}) {
  const [model, setModel] = useState("");
  const state = useEditingProject(script?.id, script?.editingProjectId, model || undefined),
    { data, fetch } = state,
    { profile } = useWorkspaceApi();
  const [audio, setAudio] = useState(
      script?.generatedAudio?.[0]?.filename || "",
    ),
    [style, setStyle] = useState(""),
    [density, setDensity] = useState<"subtle" | "balanced" | "expressive">(
      "balanced",
    ),
    [busy, setBusy] = useState(false),
    [frame, setFrame] = useState(0),
    [selected, setSelected] = useState(""),
    player = useRef<PlayerRef>(null);
  const p = data?.project,
    job = data?.jobs
      .filter((j) => j.revisionId === data.currentRevisionId && activeStates.includes(j.state))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    lastJob = data?.jobs
      .filter((j) => j.revisionId === data.currentRevisionId || j.resultRevisionId === data.currentRevisionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    ready = p?.status === "ready" || p?.status === "partial",
    allInspectionFailed = p?.status === "partial" && !p.artifacts.length &&
      !!p.scenes.length && p.sceneOutcomes?.length === p.scenes.length &&
      p.sceneOutcomes.every(outcome => outcome.state === "failed") &&
      p.analyses.every(analysis => analysis.description.startsWith("Image inspection unavailable"));
  useEffect(() => {
    if (!script?.generatedAudio?.some(a => a.filename === audio)) setAudio(script?.generatedAudio?.[0]?.filename || "");
  }, [script?.id, script?.generatedAudio, audio]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const listener = ({ detail }: { detail: { frame: number } }) =>
      setFrame(detail.frame);
    instance.addEventListener("frameupdate", listener);
    return () => instance.removeEventListener("frameupdate", listener);
  }, [p?.revisionId]);
  if (!script)
    return (
      <p className="p-6 text-gray-400">
        Select a script to create a visual edit.
      </p>
    );
  const currentScript = script;
  async function act(work: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    state.setError("");
    try {
      await work();
      if (refresh) await state.refresh();
    } catch (e) {
      state.setError(e instanceof Error ? e.message : "Visual editing failed");
    } finally {
      setBusy(false);
    }
  }
  async function generate(mode: "ai" | "simple" = "ai") {
    await act(async () => {
      const selectedAudio = currentScript.generatedAudio?.find(
        (a) => a.filename === audio,
      );
      if (!selectedAudio) throw new Error("Select narration audio first.");
      const inputs = {
        scriptId: currentScript.id,
        audioFilename: audio,
        language: selectedAudio.language,
        imageIndexes: (currentScript.generatedImages || [])
          .filter(
            (i) => i.status === "done" && i.url,
          )
          .map((i) => i.index),
        aspect: profile === "shorts" ? "9:16" : "16:9",
        fps: 30,
        settings: {
          stylePreference: style,
          density,
          maxProviderCalls: Math.min(2000, 3 + (currentScript.generatedImages?.length || 1) * 12),
          maxGeneratedAssets: 4,
          ...(model ? { aiModel: model } : {}),
        },
      };
      const reuseCurrentMedia = mode === "simple" && p && data && !data.stale &&
        p.revisionId === data.currentRevisionId && p.inputs.audioFilename === audio &&
        p.inputs.width === (profile === "shorts" ? 1080 : 1920);
      const created = reuseCurrentMedia
          ? data
          : p && data
          ? await editingRequest<EditingPayload>(
              fetch,
              `/projects/${p.id}/revisions`,
              { expectedRevisionId: data.currentRevisionId, inputs },
            )
          : await editingRequest<EditingPayload>(fetch, "/projects", inputs);
      state.setSelectedRevision("");
      state.setProjectId(created.project.id);
      state.setData(created);
      await onUpdate({ editingProjectId: created.project.id });
      if (mode === "simple") {
        const finished = await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}/simple`, {
          expectedRevisionId: created.project.revisionId,
        });
        state.setData(finished);
      } else {
        await editingRequest(fetch, `/projects/${created.project.id}/generate`, {
          expectedRevisionId: created.project.revisionId,
        });
      }
    }, mode === "ai");
  }
  async function reset() {
    if (!p || !data) return;
    setBusy(true);
    state.setError("");
    try {
      const fresh = await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/reset`, {
        expectedRevisionId: data.currentRevisionId,
      });
      state.setSelectedRevision("");
      state.setData(fresh);
      setSelected("");
      setFrame(0);
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Could not clear artifacts");
    } finally {
      setBusy(false);
    }
  }
  const download = data?.jobs
    .filter(
      (j) =>
        j.operation === "render" &&
        j.state === "succeeded" &&
        j.revisionId === p?.revisionId,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const button =
    "rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40 hover:bg-blue-500";
  return (
    <div className="space-y-5 p-2 text-gray-200">
      <div>
        <h2 className="text-xl font-semibold">
          {editor ? "Enhanced timeline & export" : "Artifacts"}
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          One click processes every image and video scene. AI decides where an explanation helps; no artifact prompts are required.
        </p>
      </div>
      {state.error && (
        <div
          role="alert"
          className="rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-200"
        >
          {state.error}
        </div>
      )}
      {!!state.capabilities?.missing.length && (
        <div className="rounded border border-amber-800 bg-amber-950/20 p-3 text-sm">
          <strong>Setup needed</strong>
          <ul className="mt-2 list-inside list-disc">
            {state.capabilities.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {!state.capabilities && !state.error && <p className="text-sm text-gray-400">Checking visual editing model and server settings...</p>}
      {state.capabilities?.ready && state.capabilities.provider && (
        <p className="text-sm text-emerald-300">
          {state.capabilities.provider}
          {state.capabilities.models?.planner &&
            ` · ${state.capabilities.models.planner.replace(/^ollama\//, "")}`}
          {state.capabilities.provider.startsWith("Local") &&
            " · Runs on this computer without an API key"}
        </p>
      )}
      {state.capabilities?.ready && !state.capabilities.modelsVerified &&
        <p className="text-xs text-amber-300">This provider's image and JSON support has not been verified here. Generation may fail if the selected model lacks either capability.</p>}
      {!editor && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
          <div className="md:col-span-2 text-sm text-gray-300">
            <p className="font-medium">How Artifacts works</p>
            <p className="mt-1 text-gray-400">Generate scene images or clips and narration in Generation first. Here, choose the narration and AI model. The model adds optional on-screen explanations. Review the result below, then export its video.</p>
          </div>
          <label className="text-sm md:col-span-2">
            Visual editing AI model
            <select aria-label="Visual editing AI model" className="mt-1 w-full rounded bg-bg p-2" value={model} onChange={e => setModel(e.target.value)}>
              <option value="">Server default</option>
              <optgroup label="Local Ollama">{LOCAL_MODELS.filter(item => !item.id.endsWith(":thinking")).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
              <optgroup label="Google Gemini">{GEMINI_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
              <optgroup label="OpenCode (Requires External API Access)">{OPENCODE_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
              <optgroup label="Groq">{GROQ_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
              <optgroup label="OpenRouter">{OPENROUTER_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
            </select>
            <span className="mt-1 block text-xs text-gray-400">The model needs image input and JSON output. Configure its API key in server/.env; Gemini and OpenRouter can also use the key saved in app settings.</span>
            {model === "groq/qwen/qwen3.8-27b" && <span className="mt-1 block text-xs text-emerald-300">Groq lists this model as supporting images and structured JSON. Account access and limits can vary.</span>}
            {model.startsWith("opencode/") && <span className="mt-1 block text-xs text-amber-300">OpenCode free tier restricts direct API calls from external apps. Use Gemini (recommended), Ollama, or OpenRouter unless you have paid OpenCode API access.</span>}
            {p?.settings.aiModel && <span className="mt-1 block text-xs text-gray-400">Current saved edit uses {p.settings.aiModel}. The selection above applies to a new edit.</span>}
          </label>
          <label className="text-sm">
            Narration language & voice
            <select
              aria-label="Narration language and voice"
              className="mt-1 w-full rounded bg-bg p-2"
              value={audio}
              onChange={(e) => setAudio(e.target.value)}
            >
              <option value="">Select generated narration</option>
              {script.generatedAudio?.map((a) => (
                <option key={a.filename} value={a.filename}>
                  {a.language === "hi" ? "Hindi" : "English"} ·{" "}
                  {a.voiceName || a.voice || a.filename}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Visual density
            <select
              className="mt-1 w-full rounded bg-bg p-2"
              value={density}
              onChange={(e) => setDensity(e.target.value as typeof density)}
            >
              <option value="subtle">Subtle</option>
              <option value="balanced">Balanced</option>
              <option value="expressive">Expressive</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Art direction <span className="text-gray-500">(optional)</span>
            <input
              className="mt-1 w-full rounded bg-bg p-2"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Warm museum annotations, or let the story guide the style"
              maxLength={2000}
            />
          </label>
          <div className="md:col-span-2">
            {(!script.generatedImages?.length || !script.generatedAudio?.length) &&
              <p className="mb-2 text-sm text-amber-300">Generate at least one scene image or clip and a matching narration in Generation before creating this edit.</p>}
            <button
              className={button}
              disabled={
                busy ||
                !!job ||
                !state.capabilities?.ready ||
                !audio ||
                !script.generatedImages?.length
              }
              onClick={() => void generate()}
            >
              Generate all artifacts
            </button>
            <span className="ml-3 text-xs text-gray-500">
              AI chooses the scenes, creates graphics, and checks and repairs them automatically.
            </span>
            <div className="mt-3">
              <button
                type="button"
                className={button}
                disabled={busy || !!job || !audio || !script.generatedImages?.length}
                onClick={() => void generate("simple")}
              >
                Create simple captions (fast)
              </button>
              <p className="mt-1 text-xs text-gray-400">Uses the saved narration to place readable captions without an AI model. Original images, clips, and audio stay in the video. This does not create custom AI diagrams.</p>
            </div>
            {p && <div className="mt-3">
              <button type="button" className="rounded-md border border-amber-700 px-3 py-2 text-sm text-amber-200 disabled:opacity-40 hover:bg-amber-950/40"
                disabled={busy || !!job} onClick={() => void reset()}>
                Clear artifacts and start fresh
              </button>
              <p className="mt-1 text-xs text-gray-400">Clears the current edit and failed progress. Your scene media, narration, and older revisions stay available. Then click Generate all artifacts.</p>
            </div>}
          </div>
        </div>
      )}
      {job && (
        <div
          role="status"
          className="flex items-center justify-between rounded border border-blue-900 bg-blue-950/20 p-3"
        >
          <span>
            {job.stage}
            {job.total ? ` · ${job.completed}/${job.total}` : ""}
          </span>
          <button
            disabled={job.state === "cancel_requested"}
            className="text-sm text-red-300"
            onClick={() =>
              void act(() =>
                editingRequest(fetch, `/jobs/${job.id}/cancel`, {}),
              )
            }
          >
            {job.state === "cancel_requested" ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      )}
      {lastJob &&
        !job &&
        ["needs_configuration", "interrupted", "failed"].includes(
          lastJob.state,
        ) && (
          <div className="rounded border border-amber-800 p-3 text-sm">
            <p className="font-semibold">Job using {p?.settings.aiModel || "server default"}: {lastJob.state.replace(/_/g, " ")}</p>
            <p>{lastJob.error || "The visual editing job stopped."}</p>
            <button
              className={`${button} mt-2`}
              disabled={busy}
              onClick={() =>
                void act(() =>
                  editingRequest(fetch, `/jobs/${lastJob.id}/resume`, {}),
                )
              }
            >
              Resume
            </button>
          </div>
        )}
      {data?.stale && (
        <p className="rounded bg-amber-950/30 p-3 text-sm text-amber-200">
          This revision uses earlier script inputs. Generate a new visual edit
          to use the latest narration and images.
        </p>
      )}
      {ready && !job && p && (
        <div role="status" className={"rounded border p-3 text-sm " + (p.status === "partial" ? "border-amber-700 text-amber-200" : "border-emerald-800 text-emerald-200")}>
          <strong>{p.status === "partial" ? "Finished with incomplete scenes" : "Artifact generation complete"}</strong>
          <p>{p.artifacts.length} artifacts created. {p.sceneOutcomes?.filter(o => o.state === "not_needed").length || 0} scenes need no extra graphics. {p.sceneOutcomes?.filter(o => o.state === "failed").length || 0} scenes incomplete.</p>
          {p.status === "partial" && p.artifacts.length > 0 && <p>Accepted artifacts and the full video are preserved. Generate again to retry failed scenes.</p>}
        </div>
      )}
      {allInspectionFailed && p && (
        <div role="alert" className="rounded border border-amber-700 bg-amber-950/20 p-3 text-sm text-amber-200">
          <strong>No scenes could be inspected</strong>
          <p>The selected model did not produce usable image analysis, so no artifacts were made. Choose another visual editing model and click Generate all artifacts. This attempt made {lastJob?.usage.filter(item => item.operation === "analyze").length || 0} inspection requests; further retries with the same model may use more provider quota.</p>
        </div>
      )}
      {p && data && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            <label className="block text-sm text-gray-400">
              Preview / export revision
              <select
                aria-label="Preview and export revision"
                className="mt-1 w-full rounded bg-surface p-2"
                value={state.selectedRevision}
                onChange={(event) =>
                  state.setSelectedRevision(event.target.value)
                }
              >
                <option value="">Current revision</option>
                {data.revisions
                  .filter(
                    (rev) =>
                      ["ready", "partial"].includes(rev.status) &&
                      rev.revisionId !== data.currentRevisionId,
                  )
                  .map((rev) => (
                    <option key={rev.revisionId} value={rev.revisionId}>
                      {rev.revisionId.slice(0, 8)} · {rev.language} ·{" "}
                      {rev.audioFilename}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex justify-center rounded-lg border border-border bg-black p-2">
              <Player
                key={p.revisionId}
                ref={player}
                component={VideoComposition}
                inputProps={{ project: p, assets: data.assets }}
                durationInFrames={p.inputs.durationFrames}
                fps={p.inputs.fps}
                compositionWidth={p.inputs.width}
                compositionHeight={p.inputs.height}
                controls
                style={{
                  width: "100%",
                  maxWidth: p.inputs.width > p.inputs.height ? "100%" : 340,
                }}
              />
            </div>
            <p className="text-xs text-gray-400">
              {(frame / p.inputs.fps).toFixed(1)} /{" "}
              {(p.inputs.durationFrames / p.inputs.fps).toFixed(1)} s ·{" "}
              {p.inputs.language === "hi" ? "Hindi" : "English"} · Revision{" "}
              {p.revisionId.slice(0, 8)}
              {!ready ? " · Draft" : ""}
            </p>
            <div
              className="space-y-2 rounded border border-border p-3"
              aria-label="Enhanced project timeline"
            >
              <input
                aria-label="Timeline playhead"
                type="range"
                min={0}
                max={p.inputs.durationFrames - 1}
                value={frame}
                onChange={(e) => {
                  const f = Number(e.target.value);
                  setFrame(f);
                  player.current?.seekTo(f);
                }}
                className="w-full"
              />
              <div className="flex h-9 gap-px">
                {p.scenes.map((s, i) => (
                  <button
                    key={s.id}
                    style={{
                      width: `${(100 * (s.endFrame - s.startFrame)) / p.inputs.durationFrames}%`,
                    }}
                    className="truncate rounded bg-slate-700 px-1 text-xs"
                    onClick={() => player.current?.seekTo(s.startFrame)}
                  >
                    Scene {i + 1}
                  </button>
                ))}
              </div>
              <div className="relative h-8">
                {p.artifacts.map((a) => (
                  <button
                    title={a.intent}
                    key={a.id}
                    className={`absolute h-7 truncate rounded px-1 text-xs ${a.enabled ? "bg-violet-700" : "bg-gray-700 opacity-40"}`}
                    style={{
                      left: `${(100 * a.startFrame) / p.inputs.durationFrames}%`,
                      width: `${(100 * (a.endFrame - a.startFrame)) / p.inputs.durationFrames}%`,
                    }}
                    onClick={() => {
                      setSelected(a.id);
                      player.current?.seekTo(a.startFrame);
                    }}
                  >
                    {a.intent}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={button}
                disabled={!ready || busy || !!job}
                onClick={() =>
                  void act(() =>
                    editingRequest(fetch, `/projects/${p.id}/render`, {
                      revisionId: p.revisionId,
                    }),
                  )
                }
              >
                Export this revision as MP4
              </button>
              {download?.outputUrl && (
                <a
                  href={download.outputUrl}
                  download
                  className="text-sm text-blue-300 underline"
                >
                  Download MP4
                </a>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Export uses this revision, its selected audio, and the same
              composition as the player.
            </p>
          </div>
          <div className="space-y-3">
            {!allInspectionFailed && p.scenes.map((scene, index) => {
              const artifacts = p.artifacts.filter(
                (a) => a.sceneId === scene.id,
              );
              return (
                <section key={scene.id}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-400">
                    Scene {index + 1}
                    {p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.state === "failed" ? " — Incomplete" : ""}
                    {p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.state === "not_needed" ? " — Clean media" : ""}
                  </h3>
                  {!artifacts.length && (
                    <p className="mb-3 text-xs text-gray-500">
                      {ready
                        ? p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.reason || "Original scene media preserved cleanly."
                        : "Design pending."}
                    </p>
                  )}
                  {artifacts.map((a) => (
                    <ArtifactCard
                      key={`${p.revisionId}-${a.id}`}
                      artifact={a}
                      thumbnail={data.artifactPreviews[a.id]}
                      fps={p.inputs.fps}
                      selected={selected === a.id}
                      busy={
                        busy || !!job || p.revisionId !== data.currentRevisionId
                      }
                      phrase={a.narrativeRefs
                        .map(
                          (id) =>
                            p.alignment.tokens.find((t) => t.id === id)?.text,
                        )
                        .join(" ")}
                      onSelect={() => {
                        setSelected(a.id);
                        player.current?.seekTo(a.startFrame);
                      }}
                      onToggle={() =>
                        act(async () => {
                          state.setData(
                            await editingRequest<EditingPayload>(
                              fetch,
                              `/projects/${p.id}/artifacts/${a.id}`,
                              {
                                expectedRevisionId: p.revisionId,
                                enabled: !a.enabled,
                              },
                              "PATCH",
                            ),
                          );
                        })
                      }
                      onRevise={(instruction) =>
                        act(() =>
                          editingRequest(
                            fetch,
                            `/projects/${p.id}/artifacts/${a.id}/revise`,
                            { expectedRevisionId: p.revisionId, instruction },
                          ),
                        )
                      }
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {!!p?.diagnostics.length && (
        <details className="rounded border border-border p-3 text-sm">
          <summary>{p.diagnostics.length} editing notes and fallbacks</summary>
          <ul className="mt-3 space-y-2">
            {p.diagnostics.map((d, i) => (
              <li key={i}>
                <strong>{d.code}</strong>: {d.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function ArtifactCard({
  artifact: a,
  fps,
  phrase,
  busy,
  selected,
  onSelect,
  onToggle,
  onRevise,
  thumbnail,
}: {
  artifact: ArtifactComposition;
  fps: number;
  phrase: string;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => Promise<unknown>;
  onRevise: (instruction: string) => Promise<unknown>;
  thumbnail?: string;
}) {
  const [instruction, setInstruction] = useState("");
  return (
    <div
      className={`mb-3 space-y-2 rounded-lg border p-3 ${selected ? "border-violet-500" : "border-border"} bg-surface`}
    >
      {thumbnail && (
        <button className="block w-full" onClick={onSelect}>
          <img
            src={thumbnail}
            alt={a.intent}
            className="max-h-28 w-full rounded bg-black object-contain"
          />
        </button>
      )}
      <button className="text-left text-sm font-medium" onClick={onSelect}>
        {a.intent}
      </button>
      <p className="text-xs text-gray-500">
        {(a.startFrame / fps).toFixed(1)}–{(a.endFrame / fps).toFixed(1)} s ·{" "}
        {a.enabled ? "Ready" : "Disabled"}
      </p>
      <p className="line-clamp-3 text-xs text-gray-400">{phrase}</p>
      <button
        className="mr-3 text-xs text-blue-300 disabled:opacity-40"
        disabled={busy}
        onClick={() => void onToggle()}
      >
        {a.enabled ? "Disable" : "Enable"}
      </button>
      <button
        className="text-xs text-blue-300 disabled:opacity-40"
        disabled={busy}
        onClick={() =>
          void onRevise(
            "Regenerate this composition with a different arrangement while preserving its meaning and evidence.",
          )
        }
      >
        Regenerate
      </button>
      <textarea
        aria-label="Revise artifact"
        className="w-full rounded bg-bg p-2 text-sm"
        rows={2}
        maxLength={2000}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Magnify the detail, or reduce the movement…"
      />
      <button
        className="text-xs text-violet-300 disabled:opacity-40"
        disabled={busy || !instruction.trim()}
        onClick={() => void onRevise(instruction)}
      >
        Apply revision
      </button>
    </div>
  );
}
