/** Procedural SFX for the Motion Pack (no downloads, no licenses to clear).
 *
 *  Run: `node tools/sfx/make.mjs` (requires ffmpeg on PATH).
 *  Output: server/assets/sfx/*.wav, 44.1kHz mono 16-bit (committed, CC0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "server", "assets", "sfx");
fs.mkdirSync(outDir, { recursive: true });

const ff = (args) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });

// Short percussive pop (badge/number/burst entrances).
ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=0.3", "-af", "afade=t=out:st=0.12:d=0.18,volume=0.7", "-ar", "44100", "-ac", "1", path.join(outDir, "pop.wav")]);
// Airy whoosh swell (arrows/scribble/slide entrances).
ff(["-f", "lavfi", "-i", "anoisesrc=color=brown:duration=0.7:seed=7", "-af", "afade=t=in:st=0:d=0.35,afade=t=out:st=0.35:d=0.35,highpass=f=400,volume=0.8", "-ar", "44100", "-ac", "1", path.join(outDir, "whoosh.wav")]);
// Bright two-tone ding (alert/cash/lightbulb entrances).
ff([
  "-f", "lavfi", "-i", "sine=frequency=1318:duration=0.6",
  "-f", "lavfi", "-i", "sine=frequency=1975:duration=0.6",
  "-filter_complex", "[0:a]volume=0.55[a];[1:a]volume=0.3[b];[a][b]amix=inputs=2,afade=t=out:st=0.3:d=0.3",
  "-ar", "44100", "-ac", "1", path.join(outDir, "ding.wav"),
]);

for (const f of ["pop.wav", "whoosh.wav", "ding.wav"]) {
  const s = fs.statSync(path.join(outDir, f));
  console.log(`${f} ${(s.size / 1024).toFixed(0)}KB`);
}
console.log("sfx library ready");
