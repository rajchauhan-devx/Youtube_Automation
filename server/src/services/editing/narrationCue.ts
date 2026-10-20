type TimedToken = { text: string; start: number; end: number };
const words = (text: string) => text.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];

/** Match an entire, contiguous phrase, including phrases spanning alignment tokens. */
export function narrationCue(tokens: TimedToken[], quote: string) {
  const phrase = words(quote);
  if (!phrase.length) return;
  const sequence = tokens.flatMap(token => words(token.text).map(word => ({ word, token })));
  for (let i = 0; i <= sequence.length - phrase.length; i++) {
    if (phrase.every((word, offset) => sequence[i + offset].word === word)) {
      return { start: sequence[i].token.start, end: sequence[i + phrase.length - 1].token.end };
    }
  }
}
