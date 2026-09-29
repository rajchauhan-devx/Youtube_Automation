import type { SceneToken } from "./director.js";

export interface CaptionWord {
  id: string;
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface CaptionPage {
  words: CaptionWord[];
  start: number;
  end: number;
}

const MAX_WORDS = 4;
const MAX_SPAN_S = 1.2;
const MIN_PAGE_S = 0.35;

/** Group word tokens into TikTok-style pages: max 4 words or 1200ms per page. */
export function paginateCaptionTokens(tokens: SceneToken[], maxWords = MAX_WORDS, maxSpan = MAX_SPAN_S): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (!current.length) return;
    pages.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
    current = [];
  };
  for (const t of tokens) {
    const next = [...current, { id: t.id, text: t.text, start: t.start, end: t.end }];
    if (current.length >= maxWords || (next.length > 1 && next[next.length - 1].end - next[0].start > maxSpan)) {
      flush();
      current = [{ id: t.id, text: t.text, start: t.start, end: t.end }];
    } else {
      current = next;
    }
  }
  flush();
  // Merge trailing micro-pages backwards so every page holds the screen briefly.
  for (let i = pages.length - 1; i > 0; i--) {
    if (pages[i].end - pages[i].start < MIN_PAGE_S) {
      pages[i - 1] = {
        words: [...pages[i - 1].words, ...pages[i].words],
        start: pages[i - 1].start,
        end: pages[i].end,
      };
      pages.splice(i, 1);
    }
  }
  return pages;
}
