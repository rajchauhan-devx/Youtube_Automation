import type { EditingProject, JobRecord } from "@tubeflow/editing-contracts";
import type { CompositionProps } from "@tubeflow/video-composition";
import { getApiKey } from "./api";
export interface EditingPayload {
  project: EditingProject;
  assets: CompositionProps["assets"];
  jobs: JobRecord[];
  stale: boolean;
  currentRevisionId: string;
  artifactPreviews: Record<string, string>;
  revisions: Array<{
    revisionId: string;
    status: EditingProject["status"];
    createdAt: string;
    language: string;
    audioFilename: string;
  }>;
}
export interface EditingCapabilities {
  ready: boolean;
  missing: string[];
  alignment: string;
  grounding: boolean;
  artifactGeneration: boolean;
  modelsVerified: boolean;
  provider?: string;
  models?: { planner: string; vision: string; review: string };
}
export async function editingRequest<T>(
  fetcher: typeof fetch,
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetcher(`/api/editing${path}`, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      ...(method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Visual editing request failed");
  return data as T;
}
