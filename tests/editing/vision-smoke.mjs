/** Offline vision validation: 5 varied images -> schema-valid sidecars.
 *
 *  Run: node tests/editing/vision-smoke.mjs
 *  Asserts the analyze.py contract (version, normalized 0-1 boxes, ranked
 *  empty cells) with and without ML backends installed. A clip-level temporal
 *  sidecar is validated through the batch (directory) mode.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OUT = path.resolve("artifacts/vision-smoke");
fs.mkdirSync(OUT, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });
const py = (args) => execFileSync("python", ["tools/vision/analyze.py", ...args], { stdio: "pipe" }).toString();
const CELLS = new Set(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]);

const sources = [
  ["solid", ["-f", "lavfi", "-i", "color=c=0x1c2935:s=1080x1920", "-frames:v", "1"]],
  ["gradient", ["-f", "lavfi", "-i", "gradients=s=1080x1920:speed=0.2", "-frames:v", "1"]],
  ["testsrc", ["-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30", "-frames:v", "1"]],
  ["mandelbrot", ["-f", "lavfi", "-i", "mandelbrot=s=640x480", "-frames:v", "1"]],
  ["rgbtest", ["-f", "lavfi", "-i", "rgbtestsrc=s=1280x720:r=30", "-frames:v", "1"]],
];

const boxOk = (b) =>
  typeof b?.x === "number" && typeof b?.y === "number" &&
  typeof b?.w === "number" && typeof b?.h === "number" &&
  b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1.000001 && b.y + b.h <= 1.000001;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};

for (const [name, args] of sources) {
  const img = path.join(OUT, `${name}.png`);
  const sidecar = path.join(OUT, `${name}.vision.json`);
  ff([...args, img]);
  const log = py(["--input", img, "--output", sidecar]);
  const doc = JSON.parse(fs.readFileSync(sidecar, "utf8"));
  check(`${name}: exit ok`, true, log.trim());
  check(`${name}: version/header`, doc.version === 1 && doc.width > 0 && doc.height > 0, `${doc.width}x${doc.height}`);
  check(`${name}: boxes normalized`, [...doc.faces, ...doc.subjects].every(boxOk), `${doc.faces.length} faces, ${doc.subjects.length} subjects`);
  check(
    `${name}: empty cells ranked`,
    Array.isArray(doc.emptyCells) && doc.emptyCells.length === 9 && doc.emptyCells.every((c) => CELLS.has(c)),
    doc.emptyCells.slice(0, 3).join(","),
  );
}

// Temporal batch mode over a sampled clip.
const framesDir = path.join(OUT, "clip-frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30", "-t", "3", "-vf", "fps=1,scale=640:-1", "-q:v", "3", path.join(framesDir, "frame_%04d.jpg")]);
const clipSidecar = path.join(OUT, "clip.vision.json");
console.log(py(["--input", framesDir, "--output", clipSidecar, "--fps", "1"]).trim());
const clip = JSON.parse(fs.readFileSync(clipSidecar, "utf8"));
check("clip: temporal header", clip.version === 1 && clip.sampleFps === 1 && clip.durationMs === 3000, `${clip.frames?.length} frames`);
check("clip: frames ordered", Array.isArray(clip.frames) && clip.frames.length === 3 && clip.frames.every((f, i) => f.tMs === i * 1000));
check("clip: frame entries valid", clip.frames.every((f) => [...f.faces, ...f.subjects].every(boxOk) && f.emptyCells.length === 9));

if (failures) {
  console.error(`VISION_SMOKE_FAIL (${failures})`);
  process.exit(1);
}
console.log("VISION_SMOKE_PASS");
