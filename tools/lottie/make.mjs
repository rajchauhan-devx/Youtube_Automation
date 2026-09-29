/** Procedural, original Lottie library for the Motion Pack.
 *
 *  These animations are authored here (no downloads, no licenses to clear) and
 *  kept tiny (<10KB each). Run: `node tools/lottie/make.mjs`.
 *  Output: server/assets/lottie/*.json (committed, CC0 — see LICENSES.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOLD = [0.949, 0.741, 0.396, 1];
const DARK = [0.102, 0.102, 0.102, 1];
const GREEN = [0.133, 0.773, 0.367, 1];
const DARK_GREEN = [0.078, 0.325, 0.18, 1];
const AMBER = [0.961, 0.62, 0.043, 1];
const WHITE = [1, 1, 1, 1];

const v = (x, y) => [x, y, 0];
const kf = (t, s, e) => (e === undefined ? { t, s } : { t, s, e, o: { x: [0.3], y: [1] }, i: { x: [0.7], y: [0] } });
const stat = (k) => ({ a: 0, k });
// lottie-web requires every non-final keyframe to carry an end value AND
// easing; without them interpolation collapses (full-viewport fills).
const anim = (keys) => ({
  a: 1,
  k: keys.map((k, i) =>
    i === keys.length - 1
      ? k
      : {
          e: keys[i + 1].s,
          o: { x: [0.3], y: [1] },
          i: { x: [0.7], y: [0] },
          ...k,
        },
  ),
});

const layer = (ind, nm, ks, shapes, op = 60) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1,
  ks: {
    o: ks.o ?? stat(100),
    r: ks.r ?? stat(0),
    p: ks.p ?? stat(v(150, 150)),
    a: ks.a ?? stat(v(0, 0)),
    s: ks.s ?? stat(v(100, 100)),
  },
  ao: 0, shapes, ip: 0, op, st: 0, bm: 0,
});
const group = (nm, items) => ({ ty: "gr", nm, it: [...items, tr()] });
const tr = (p = [0, 0]) => ({ ty: "tr", p: stat(p), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100), nm: "T" });
const shp = (pts, closed = false) => ({
  ty: "sh", nm: "path",
  ks: stat({ i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]), v: pts.map((p) => [p[0], p[1]]), c: closed }),
});
const stroke = (c, w) => ({ ty: "st", c: stat(c), o: stat(100), w: stat(w), lc: 2, lj: 2, nm: "stroke" });
const fill = (c) => ({ ty: "fl", c: stat(c), o: stat(100), nm: "fill" });
const ellipse = (w, h) => ({ ty: "el", d: 1, s: stat([w, h]), p: stat([0, 0]), nm: "ellipse" });
const rect = (w, h, r) => ({ ty: "rc", d: 1, s: stat([w, h]), p: stat([0, 0]), r: stat(r), nm: "rect" });
const trim = (sKeys, eKeys) => ({ ty: "tm", s: anim(sKeys), e: anim(eKeys), o: stat(0), m: 1, nm: "trim" });
const doc = (nm, w, h, layers, op = 60) => ({
  v: "5.7.4", fr: 30, ip: 0, op, w, h, nm, ddd: 0, assets: [], layers,
});

const arrowUp = () =>
  doc("arrow-up", 300, 300, [
    layer(1, "shaft", { p: anim([kf(0, v(150, 210), v(150, 130)), kf(30, v(150, 130), v(150, 150)), kf(45, v(150, 150))]) }, [
      group("g", [shp([[0, 70], [0, -50]]), stroke(GOLD, 16)]),
    ]),
    layer(2, "head", { p: anim([kf(0, v(150, 210), v(150, 130)), kf(30, v(150, 130), v(150, 150)), kf(45, v(150, 150))]) }, [
      group("g", [shp([[-32, -16], [0, -50], [32, -16]]), stroke(GOLD, 16)]),
    ]),
  ]);

const arrowDown = () =>
  doc("arrow-down", 300, 300, [
    layer(1, "shaft", { p: anim([kf(0, v(150, 90), v(150, 170)), kf(30, v(150, 170), v(150, 150)), kf(45, v(150, 150))]) }, [
      group("g", [shp([[0, -70], [0, 50]]), stroke(GOLD, 16)]),
    ]),
    layer(2, "head", { p: anim([kf(0, v(150, 90), v(150, 170)), kf(30, v(150, 170), v(150, 150)), kf(45, v(150, 150))]) }, [
      group("g", [shp([[-32, 16], [0, 50], [32, 16]]), stroke(GOLD, 16)]),
    ]),
  ]);

const arrowCurved = () =>
  doc("arrow-curved", 300, 300, [
    layer(1, "curve", {}, [
      group("g", [
        { ...shp([[40, 90], [40, 20], [110, 20], [110, -60]]), ks: { a: 0, k: { i: [[0, 0], [50, 0], [0, 0], [0, 0]], o: [[0, 0], [-50, 0], [0, 0], [0, 0]], v: [[-70, 60], [-70, -10], [10, -10], [10, -70]], c: false } } },
        stroke(GOLD, 14),
        trim([kf(0, [0]), kf(30, [0])], [kf(0, [8]), kf(30, [100])]),
      ]),
    ]),
    layer(2, "head", { o: anim([kf(0, [0]), kf(24, [0]), kf(34, [100])]) }, [
      group("g", [shp([[-24, -46], [10, -70], [34, -36]]), stroke(GOLD, 14)]),
    ], 60),
  ]);

const popBurst = () => {
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    rays.push(
      layer(10 + i, `ray${i}`, { p: anim([kf(0, v(150, 150), v(150 + dx * 110, 150 + dy * 110)), kf(30, v(150 + dx * 110, 150 + dy * 110))]), o: anim([kf(0, [100]), kf(30, [0])]) }, [
        group("g", [{ ...shp([[0, 0], [dx * 34, dy * 34]]), ks: stat({ i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[0, 0], [dx * 34, dy * 34]], c: false }) }, stroke(GOLD, 12)]),
      ], 32),
    );
  }
  return doc("pop-burst", 300, 300, [
    layer(1, "ring", { s: anim([kf(0, [8, 8, 100], [115, 115, 100]), kf(24, [115, 115, 100])]), o: anim([kf(0, [100]), kf(28, [0])]) }, [
      group("g", [ellipse(150, 150), stroke(GOLD, 12)]),
    ], 30),
    ...rays,
  ], 32);
};

const confettiBurst = () => {
  const cols = [GOLD, GREEN, WHITE, AMBER];
  const bits = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const dist = 90 + (i % 4) * 22;
    bits.push(
      layer(10 + i, `bit${i}`, {
        p: anim([kf(0, v(150, 150), v(150 + Math.cos(a) * dist, 150 + Math.sin(a) * dist + 40)), kf(40, v(150 + Math.cos(a) * dist, 150 + Math.sin(a) * dist + 40))]),
        r: anim([kf(0, [i * 20], [i * 20 + 200]), kf(40, [i * 20 + 200])]),
        o: anim([kf(0, [100]), kf(34, [100]), kf(44, [0])]),
      }, [group("g", [rect(16, 10, 3), fill(cols[i % 4])])], 46),
    );
  }
  return doc("confetti-burst", 300, 300, bits, 46);
};

const checkmark = () =>
  doc("checkmark", 300, 300, [
    layer(1, "ring", { s: anim([kf(0, [20, 20, 100], [108, 108, 100]), kf(18, [108, 108, 100]), kf(26, [100, 100, 100])]) }, [
      group("g", [ellipse(170, 170), stroke(GREEN, 14)]),
    ]),
    layer(2, "tick", {}, [
      group("g", [
        shp([[-52, 6], [-16, 42], [56, -42]]),
        stroke(GREEN, 22),
        trim([kf(0, [0]), kf(30, [0])], [kf(6, [4]), kf(28, [100])]),
      ]),
    ]),
  ]);

const alertBadge = () =>
  doc("alert-badge", 300, 300, [
    layer(1, "tri", { s: anim([kf(0, [100, 100, 100]), kf(12, [108, 108, 100]), kf(24, [100, 100, 100]), kf(36, [108, 108, 100]), kf(48, [100, 100, 100])]) }, [
      group("g", [shp([[0, -95], [88, 70], [-88, 70]], true), fill(AMBER), stroke(DARK, 10)]),
    ]),
    layer(2, "mark", {}, [
      group("g", [shp([[0, -38], [0, 18]]), stroke(DARK, 20)]),
      group("dot", [{ ...ellipse(22, 22), p: stat([0, 48]) }, fill(DARK)]),
    ]),
  ]);

const lightbulb = () =>
  doc("lightbulb", 300, 300, [
    layer(1, "bulb", {}, [
      group("g", [ellipse(120, 120), fill([0.988, 0.878, 0.278, 1]), stroke(DARK, 8)]),
    ]),
    layer(2, "base", {}, [
      group("g", [rect(56, 44, 8), fill(DARK)]),
    ]),
    layer(3, "rays", { o: anim([kf(0, [40]), kf(15, [100]), kf(30, [40]), kf(45, [100]), kf(59, [40])]) }, [
      group("rays", [
        { ...shp([[-95, -95], [-72, -72]]), ks: stat({ i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[-95, -95], [-72, -72]], c: false }) },
        stroke(GOLD, 12),
      ]),
      group("rays2", [
        { ...shp([[95, -95], [72, -72]]), ks: stat({ i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[95, -95], [72, -72]], c: false }) },
        stroke(GOLD, 12),
      ]),
      group("rays3", [
        { ...shp([[0, -128], [0, -100]]), ks: stat({ i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[0, -128], [0, -100]], c: false }) },
        stroke(GOLD, 12),
      ]),
    ]),
  ]);

const cashBurst = () => {
  const coins = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const dist = 80 + (i % 3) * 25;
    coins.push(
      layer(10 + i, `coin${i}`, {
        p: anim([kf(0, v(150, 150), v(150 + Math.cos(a) * dist, 150 + Math.sin(a) * dist)), kf(32, v(150 + Math.cos(a) * dist, 150 + Math.sin(a) * dist))]),
        s: anim([kf(0, [0, 0, 100], [100, 100, 100]), kf(16, [100, 100, 100])]),
        o: anim([kf(0, [100]), kf(30, [100]), kf(40, [0])]),
      }, [group("g", [ellipse(i % 2 ? 44 : 34, i % 2 ? 44 : 34), fill(i % 2 ? GREEN : DARK_GREEN), stroke(WHITE, 5)])], 42),
    );
  }
  return doc("cash-burst", 300, 300, [
    layer(1, "core", { s: anim([kf(0, [30, 30, 100], [105, 105, 100]), kf(16, [105, 105, 100]), kf(24, [100, 100, 100])]) }, [
      group("g", [ellipse(110, 110), fill(DARK_GREEN), stroke(GREEN, 10)]),
    ]),
    ...coins,
  ], 42);
};

const subscribeButton = () =>
  doc("subscribe-button", 300, 200, [
    layer(1, "btn", { s: anim([kf(0, [30, 30, 100], [104, 104, 100]), kf(16, [104, 104, 100]), kf(26, [100, 100, 100])]) }, [
      group("g", [rect(220, 96, 48), fill(GOLD), stroke(DARK, 8)]),
    ]),
    layer(2, "play", { s: anim([kf(10, [60, 60, 100]), kf(22, [100, 100, 100])]), o: anim([kf(0, [0]), kf(10, [0]), kf(16, [100])]) }, [
      group("g", [shp([[-18, -26], [-18, 26], [24, 0]], true), fill(DARK)]),
    ]),
  ]);

const scribbleUnderline = () =>
  doc("scribble-underline", 300, 120, [
    layer(1, "scribble", { p: stat(v(150, 60)) }, [
      group("g", [
        { ...shp([[10, 70], [80, 40], [150, 66], [220, 44], [290, 62]]), ks: { a: 0, k: { i: [[0, 0], [30, -14], [28, 12], [30, -10], [0, 0]], o: [[0, 0], [-30, 14], [-28, -12], [-30, 10], [0, 0]], v: [[-140, 10], [-70, -20], [0, 6], [70, -16], [140, 2]], c: false } } },
        stroke(GOLD, 13),
        trim([kf(0, [0]), kf(36, [0])], [kf(0, [6]), kf(36, [100])]),
      ]),
    ], 40),
  ], 40);

const LIB = {
  "arrow-up": arrowUp(),
  "arrow-down": arrowDown(),
  "arrow-curved": arrowCurved(),
  "pop-burst": popBurst(),
  "confetti-burst": confettiBurst(),
  "checkmark": checkmark(),
  "alert-badge": alertBadge(),
  "lightbulb": lightbulb(),
  "cash-burst": cashBurst(),
  "subscribe-button": subscribeButton(),
  "scribble-underline": scribbleUnderline(),
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "..", "server", "assets", "lottie");
fs.mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [name, docJson] of Object.entries(LIB)) {
  const file = path.join(outDir, `${name}.json`);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const next = `${JSON.stringify(docJson)}\n`;
  if (prev !== next) fs.writeFileSync(file, next);
  total += next.length;
  console.log(`${name}.json ${(next.length / 1024).toFixed(1)}KB`);
}
// Validate shape: every file parses and carries the required Lottie header.
for (const name of Object.keys(LIB)) {
  const d = JSON.parse(fs.readFileSync(path.join(outDir, `${name}.json`), "utf8"));
  if (!d.w || !d.h || !d.fr || !d.op || !Array.isArray(d.layers) || !d.layers.length) {
    throw new Error(`Invalid Lottie header in ${name}.json`);
  }
}
console.log(`lottie library: ${Object.keys(LIB).length} files, ${(total / 1024).toFixed(1)}KB total`);
