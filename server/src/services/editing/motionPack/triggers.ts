/** Motion Pack trigger dictionary (deterministic, no AI).
 *
 * Labels on vector badges must be traceable to the narration (see
 * evidence.ts): they reuse the matched trigger word verbatim, a digit, or
 * punctuation with no word content ("!", "$"). Lottie graphics carry no text
 * and need no provenance; every graphic also gets a library sound effect.
 */

export type GraphicKind =
  | "badge"
  | "arrow-up"
  | "arrow-down"
  | "arrow-curved"
  | "alert"
  | "lightbulb"
  | "cash"
  | "number"
  | "burst"
  | "underline";

export type Zone =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type Entrance = "spring-pop" | "slide-in" | "draw-on";

export interface Trigger {
  match: string[];
  graphic: GraphicKind;
  zone: Zone;
  durationMs: number;
  entrance: Entrance;
  /** When true the director asks placement.ts to anchor the tip on the vision subject box. */
  anchorSubject?: boolean;
}

export const TRIGGERS: Trigger[] = [
  { match: ["subscribe", "follow"], graphic: "badge", zone: "bottom-right", durationMs: 2500, entrance: "spring-pop" },
  { match: ["link in description", "link below", "link in bio"], graphic: "arrow-down", zone: "bottom-center", durationMs: 1600, entrance: "draw-on" },
  { match: ["warning", "mistake", "avoid", "don't", "never"], graphic: "alert", zone: "top-right", durationMs: 1400, entrance: "spring-pop" },
  { match: ["growth", "increase", "higher", "up", "skyrocket"], graphic: "arrow-up", zone: "top-right", durationMs: 1400, entrance: "draw-on", anchorSubject: true },
  { match: ["idea", "tip", "secret"], graphic: "lightbulb", zone: "top-left", durationMs: 1400, entrance: "spring-pop" },
  { match: ["money", "revenue", "profit", "earn", "income"], graphic: "cash", zone: "center", durationMs: 1200, entrance: "spring-pop" },
  { match: ["step one", "step two", "step three", "first,", "second,", "third,"], graphic: "number", zone: "center-left", durationMs: 1500, entrance: "spring-pop" },
  { match: ["comment", "like", "share"], graphic: "badge", zone: "bottom-center", durationMs: 1600, entrance: "slide-in" },
  { match: ["remember", "important", "key point", "note this"], graphic: "underline", zone: "bottom-center", durationMs: 1500, entrance: "draw-on" },
];

/** Scene-level fallback mapping used when no keyword hits (text-free shapes only). */
export const SCENE_FALLBACK: Array<{ match: string[]; graphic: GraphicKind }> = [
  { match: ["money", "revenue", "profit", "price", "cost"], graphic: "cash" },
  { match: ["warning", "mistake", "avoid", "danger", "risk"], graphic: "alert" },
  { match: ["idea", "tip", "secret"], graphic: "lightbulb" },
];

/** Words that render a caption page in the accent color (trigger nouns + numbers). */
export const EMPHASIS_WORDS = new Set([
  "growth", "increase", "money", "revenue", "profit", "earn", "income",
  "idea", "tip", "secret", "warning", "mistake", "subscribe", "follow",
  "one", "two", "three", "first", "second", "third", "1", "2", "3",
]);

const ORDINALS: Record<string, string> = {
  "step one": "1", "step two": "2", "step three": "3",
  "first,": "1", "second,": "2", "third,": "3",
};

/** Label text for a graphic given the matched phrase and the narration word.
 *  Always returns narration vocabulary (or a digit/punctuation) so that
 *  validateNarrativeLabels passes. Returns null for text-free graphics. */
export function labelFor(graphic: GraphicKind, phrase: string, word: string): string | null {
  switch (graphic) {
    case "badge":
      return word;
    case "number":
      return ORDINALS[phrase] || word;
    case "alert":
      return "!";
    case "cash":
      return "$";
    default:
      return null;
  }
}
