import { useState, useRef, useEffect } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "@tubeflow/video-composition";
import type { ArtifactComposition } from "@tubeflow/editing-contracts";
import { useEditingProject } from "../../hooks/useEditingProject";
import { editingRequest, type EditingPayload } from "../../services/editingApi";
import { useWorkspaceApi } from "../../services/workspaceApi";
import type { Script } from "../../data";

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
  const state = useEditingProject(script?.id, script?.editingProjectId),
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
      .filter((j) => activeStates.includes(j.state))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    lastJob = data?.jobs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    ready = p?.status === "ready" || p?.status === "partial";
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
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    state.setError("");
    try {
      await work();
      await state.refresh();
    } catch (e) {
      state.setError(e instanceof Error ? e.message : "Visual editing failed");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
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
        },
      };
      const created =
        p && data
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
      await editingRequest(fetch, `/projects/${created.project.id}/generate`, {
        expectedRevisionId: created.project.revisionId,
      });
    });
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
      {state.capabilities?.ready && state.capabilities.provider && (
        <p className="text-sm text-emerald-300">
          {state.capabilities.provider}
          {state.capabilities.models?.planner &&
            ` · ${state.capabilities.models.planner.replace(/^ollama\//, "")}`}
          {state.capabilities.provider.startsWith("Local") &&
            " · Runs on this computer without an API key"}
        </p>
      )}
      {!editor && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
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
            <button
              className={button}
              disabled={
                busy ||
                !!job ||
                !state.capabilities?.ready ||
                !audio
              }
              onClick={() => void generate()}
            >
              Generate all artifacts
            </button>
            <span className="ml-3 text-xs text-gray-500">
              AI chooses the scenes, creates graphics, and checks and repairs them automatically.
            </span>
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
            <p>{lastJob.error || lastJob.state}</p>
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
          {p.status === "partial" && <p>Accepted artifacts and the full video are preserved. Generate again to retry; failed scenes are listed below.</p>}
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
            {p.scenes.map((scene, index) => {
              const artifacts = p.artifacts.filter(
                (a) => a.sceneId === scene.id,
              );
              return (
                <section key={scene.id}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-400">
                    Scene {index + 1}{p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.state === "failed" ? " ? Incomplete" : ""}
                  </h3>
                  {!artifacts.length && (
                    <p className="mb-3 text-xs text-gray-500">
                      {ready
                        ? p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.reason || "No artifact saved for this scene. Check diagnostics for earlier revisions."
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
