import React from "react";
import type { EditingProject, AssetRecord } from "@tubeflow/editing-contracts";
import type { LegacyCamera } from "./legacy-camera.js";

export type CompositionProps = {
  project: EditingProject;
  assets: Record<string, { url: string; record: AssetRecord }>;
  legacyCameras?: Record<string, LegacyCamera>;
};

export function VideoComposition(_props: CompositionProps) {
  return null;
}

export function ArtifactsOverlay(_props: CompositionProps) {
  return null;
}
