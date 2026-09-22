/** Check only structure explicitly requested by the user; impose no output format. */
export function incompleteResponse(prompt: string, response: string): string | undefined {
  const sections = (text: string) => [...text.matchAll(/^\s*#{1,6}\s+SECTION\s+(\d+)\b/gim)].map(match => match[1]);
  const requested = [...new Set(sections(prompt))];
  const received = new Set(sections(response));
  if (requested.length > 1) {
    const missing = requested.filter(id => !received.has(id));
    if (missing.length) return `Missing requested sections: ${missing.join(', ')}`;
  }
  for (const tag of ['long_video', 'image_prompt', 'script']) {
    const opens = (response.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || []).length;
    const closes = (response.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    if (opens > closes) return `Unfinished <${tag}> block`;
  }
  return undefined;
}
