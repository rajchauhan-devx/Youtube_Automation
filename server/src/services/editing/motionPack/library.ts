import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveAsset } from "../repository.js";
import type { AssetRecord } from "@tubeflow/editing-contracts";

/** Procedural Motion Pack libraries (see server/assets/LICENSES.md).
 *  Registration is content-addressed and idempotent: identical bytes always
 *  resolve to identical asset IDs, so builds stay deterministic. Local disk
 *  reads only — never network, never a model. */
export const LOTTIE_FILES = [
  "arrow-up",
  "arrow-down",
  "arrow-curved",
  "pop-burst",
  "confetti-burst",
  "checkmark",
  "alert-badge",
  "lightbulb",
  "cash-burst",
  "subscribe-button",
  "scribble-underline",
] as const;

export type LottieName = (typeof LOTTIE_FILES)[number];

export const SFX_FILES = {
  pop: { file: "pop.wav", duration: 0.3 },
  whoosh: { file: "whoosh.wav", duration: 0.7 },
  ding: { file: "ding.wav", duration: 0.6 },
} as const;

export type SfxName = keyof typeof SFX_FILES;

const assetsDir = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "assets");

let cache: { lottie: Record<string, AssetRecord>; sfx: Record<string, AssetRecord> } | undefined;

export function ensureMotionLibraries(): {
  lottie: Record<string, AssetRecord>;
  sfx: Record<string, AssetRecord>;
} {
  if (cache) return cache;
  const lottie: Record<string, AssetRecord> = {};
  const sfx: Record<string, AssetRecord> = {};
  const dir = assetsDir();
  // A corrupt/missing library file must never break a build: that graphic
  // simply falls back to its vector version (or silence for sounds).
  for (const name of LOTTIE_FILES) {
    try {
      const file = path.join(dir, "lottie", `${name}.json`);
      if (!fs.existsSync(file)) continue;
      const bytes = fs.readFileSync(file);
      JSON.parse(bytes.toString("utf8")); // fail fast on corrupt library data
      lottie[name] = saveAsset(bytes, {
        mime: "application/json",
        alpha: false,
        method: "fixture",
        providerVersion: "motion-pack-lottie-v1",
        license: "CC0-1.0",
        attribution: "Procedural original (tools/lottie/make.mjs)",
      });
    } catch {
      // Fall through to the vector fallback for this graphic.
    }
  }
  for (const [name, meta] of Object.entries(SFX_FILES)) {
    try {
      const file = path.join(dir, "sfx", meta.file);
      if (!fs.existsSync(file)) continue;
      sfx[name] = saveAsset(fs.readFileSync(file), {
        mime: "audio/wav",
        duration: meta.duration,
        alpha: false,
        method: "fixture",
        providerVersion: "motion-pack-sfx-v1",
        license: "CC0-1.0",
        attribution: "Procedural original (tools/sfx/make.mjs)",
      });
    } catch {
      // Graphics without their sound still render.
    }
  }
  cache = { lottie, sfx };
  return cache;
}
