import { TRIGGERS, SCENE_FALLBACK, type GraphicKind, type Zone, type Entrance } from "./triggers.js";

export interface SceneToken {
  id: string;
  text: string;
  start: number; // seconds, aligned with contracts Token.start
  end: number; // seconds
}

export interface MotionDirective {
  id: string;
  sceneId: string;
  sceneIndex: number;
  triggerWord: string; // original-cased narration word
  triggerPhrase: string; // matched dictionary phrase (lowercase)
  startMs: number;
  durationMs: number;
  graphic: GraphicKind;
  zone: Zone;
  fallbackZone: Zone;
  anchor: { type: "none" } | { type: "subjectBox" };
  entrance: Entrance;
}

const MAX_PER_SCENE = 3;
const MIN_GAP_MS = 800;
const EDGE_MS = 500;

const norm = (s: string) => s.toLocaleLowerCase("en").replace(/[’‘]/g, "'");

function firstWord(phrase: string): string {
  return phrase.split(/\s+/)[0].replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}

/** Whole-word match for single words (avoids "up" matching "support"); substring for phrases. */
function matchIndex(sentence: string, phrase: string): number {
  if (phrase.includes(" ")) return sentence.indexOf(phrase);
  const m = sentence.match(
    new RegExp(`(^|[^a-z0-9'])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9']|$)`, "i"),
  );
  return m ? (m.index ?? 0) + m[1].length : -1;
}

export interface DirectInput {
  sceneId: string;
  sceneIndex: number;
  sceneStartMs: number;
  sceneEndMs: number;
  tokens: SceneToken[]; // in speaking order
}

/** Deterministic sentence -> directives. Same inputs -> same outputs, no I/O. */
export function directScene(input: DirectInput): MotionDirective[] {
  const { sceneId, sceneIndex, sceneStartMs, sceneEndMs } = input;
  const sentence = norm(input.tokens.map((t) => t.text).join(" "));
  const byWord = new Map<string, SceneToken[]>();
  for (const t of input.tokens) {
    const w = norm(t.text).replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
    if (!w) continue;
    const list = byWord.get(w) ?? [];
    list.push(t);
    byWord.set(w, list);
  }
  // First in-window occurrence per word: edge-clipped tokens never anchor graphics.
  const inWindow = (w: string) => (byWord.get(w) ?? []).find((t) => {
    const ms = Math.round(t.start * 1000);
    return ms >= sceneStartMs + EDGE_MS && ms <= sceneEndMs - EDGE_MS;
  });
  const candidates: MotionDirective[] = [];
  TRIGGERS.forEach((trigger, ti) => {
    let best: { at: number; phrase: string } | undefined;
    for (const phrase of trigger.match) {
      const at = matchIndex(sentence, phrase);
      if (at >= 0 && (!best || at < best.at)) best = { at, phrase };
    }
    if (!best) return;
    const token = inWindow(firstWord(best.phrase));
    if (!token) return;
    const startMs = Math.round(token.start * 1000);
    candidates.push({
      id: `m${sceneIndex}-${ti}`,
      sceneId,
      sceneIndex,
      triggerWord: token.text,
      triggerPhrase: best.phrase,
      startMs,
      durationMs: trigger.durationMs,
      graphic: trigger.graphic,
      zone: trigger.zone,
      fallbackZone: trigger.zone,
      anchor: trigger.anchorSubject ? { type: "subjectBox" } : { type: "none" },
      entrance: trigger.entrance,
    });
  });
  candidates.sort((a, b) => a.startMs - b.startMs);
  const accepted: MotionDirective[] = [];
  for (const c of candidates) {
    if (accepted.length >= MAX_PER_SCENE) break;
    if (accepted.some((a) => Math.abs(a.startMs - c.startMs) < MIN_GAP_MS)) continue;
    accepted.push(c);
  }
  if (accepted.length) {
    accepted.forEach((d, i) => {
      d.id = `m${sceneIndex}-${i}`;
    });
    return accepted;
  }
  // Scene-type fallback: one text-free graphic shortly after the scene starts.
  const fallbackGraphic = (() => {
    for (const fb of SCENE_FALLBACK) {
      if (fb.match.some((w) => matchIndex(sentence, w) >= 0)) return fb.graphic;
    }
    return sceneIndex === 0 ? ("burst" as const) : null;
  })();
  if (!fallbackGraphic) return [];
  const at = sceneStartMs + (sceneIndex === 0 ? 200 : 300);
  if (at > sceneEndMs - EDGE_MS) return [];
  return [
    {
      id: `m${sceneIndex}-0`,
      sceneId,
      sceneIndex,
      triggerWord: "",
      triggerPhrase: "scene",
      startMs: at,
      durationMs: 1400,
      graphic: fallbackGraphic,
      zone: fallbackGraphic === "cash" ? "center" : fallbackGraphic === "alert" ? "top-right" : "center",
      fallbackZone: "center",
      anchor: { type: "none" },
      entrance: "spring-pop",
    },
  ];
}
