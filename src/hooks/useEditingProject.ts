import { useCallback, useEffect, useState } from "react";
import { useWorkspaceApi } from "../services/workspaceApi";
import {
  editingRequest,
  type EditingPayload,
  type EditingCapabilities,
} from "../services/editingApi";
export function useEditingProject(scriptId?: string, reference?: string) {
  const { fetch } = useWorkspaceApi(),
    [data, setData] = useState<EditingPayload>(),
    [error, setError] = useState(""),
    [capabilities, setCapabilities] = useState<EditingCapabilities>(),
    [projectId, setProjectId] = useState(reference);
  const [selectedRevision, setSelectedRevision] = useState("");
  useEffect(() => {
    setProjectId(reference);
    setData(undefined);
    setError("");
    setSelectedRevision("");
  }, [scriptId, reference, fetch]);
  useEffect(() => {
    const abort = new AbortController();
    editingRequest<EditingCapabilities>(
      fetch,
      "/capabilities",
      undefined,
      "GET",
      abort.signal,
    )
      .then(setCapabilities)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [fetch]);
  useEffect(() => {
    if (!scriptId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        let id = projectId;
        if (!id) {
          const list = await editingRequest<{
            projects: { id: string; createdAt: string }[];
          }>(
            fetch,
            `/projects?scriptId=${encodeURIComponent(scriptId!)}`,
            undefined,
            "GET",
            abort.signal,
          );
          id = list.projects.sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )[0]?.id;
          if (id && !abort.signal.aborted) setProjectId(id);
        }
        if (id) {
          const next = await editingRequest<EditingPayload>(
            fetch,
            `/projects/${id}${selectedRevision ? `/revisions/${selectedRevision}` : ""}`,
            undefined,
            "GET",
            abort.signal,
          );
          if (!abort.signal.aborted) {
            setData((previous) =>
              previous?.project.revisionId === next.project.revisionId
                ? {
                    ...next,
                    project: previous.project,
                    assets: previous.assets,
                  }
                : next,
            );
          }
        }
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load project");
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [fetch, scriptId, projectId, selectedRevision]);
  const refresh = useCallback(async () => {
    if (projectId)
      setData(
        await editingRequest<EditingPayload>(
          fetch,
          `/projects/${projectId}${selectedRevision ? `/revisions/${selectedRevision}` : ""}`,
        ),
      );
  }, [fetch, projectId, selectedRevision]);
  return {
    data,
    setData,
    error,
    setError,
    capabilities,
    projectId,
    setProjectId,
    refresh,
    fetch,
    selectedRevision,
    setSelectedRevision,
  };
}
