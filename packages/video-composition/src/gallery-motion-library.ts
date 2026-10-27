import type { MotionLibraryTemplate, Recipe } from './motion-library.js';

const entry = (key: string, name: string, recipe: Recipe, minItems: number, maxItems: number, useWhen: string, avoidWhen = 'Unsupported facts, decorative clutter, or insufficient reading time.'): MotionLibraryTemplate => ({
  id: `ad_${key}`, name, recipe, category: 'reusable', minItems, maxItems, useWhen, avoidWhen,
  description: useWhen, keywords: [],
});

/** Production versions of all 30 gallery motions: supplied content, native editable nodes. */
export const GALLERY_MOTION_LIBRARY: readonly MotionLibraryTemplate[] = [
  entry('highlight_reticle', 'Highlight & Target Reticle', 'focus', 1, 2, 'Explain a narrated detail with a schematic focus ring.', 'Never imply tracking or attach to an unverified object; use restrained linework, no HUD.'),
  entry('map_route', 'Dynamic Map Route & Path', 'sequence', 2, 4, 'Show the explicitly narrated origin and destination or ordered stops.', 'No invented geography, coordinates, route lengths or boundaries.'),
  entry('lighting_sweep', 'Lighting & Reveal Sweep', 'underline', 1, 1, 'Soft line reveal emphasizing a short narrated phrase.', 'Do not invent solar alignment or measured light rays.'),
  entry('distance_caliper', 'Distance & Dimension Caliper', 'dimension', 1, 3, 'Emphasize an explicitly spoken distance or dimension.', 'No automatic measurement of footage or inferred conversions.'),
  entry('timeline_scrubber', 'Timeline & Era Scrubber', 'sequence', 2, 4, 'Show narrated dates in chronological order.', 'No invented dates or proportional spacing inferred from dates.'),
  entry('scale_scanner', 'Scale & Elevation Gauge', 'dimension', 1, 3, 'Explain a supplied height or depth with a schematic dimension rule.'),
  entry('radial_metric', 'Radial Stat Gauge', 'donut', 1, 1, 'Show an explicitly narrated percentage; item.value is required and must be 0–100.', 'No inferred percentage, invented denominator, or rolling electronic counter for Ancient Dharma.'),
  entry('magnifier_loupe', 'Inspection Focus Ring', 'focus', 1, 2, 'Draw attention to a narrated detail using a schematic circle.', 'This does not magnify footage or verify a real object location.'),
  entry('comparison_split', 'Side-by-Side Comparison Split', 'comparison', 2, 2, 'Contrast two explicitly narrated accounts or alternatives.'),
  entry('flow_vector', 'Flow & Movement Arrow', 'arrow', 1, 2, 'Explain a narrated direction or movement; labels must be spoken.', 'No invented velocity or claim to trace actual water or wind.'),
  entry('lower_third', 'Speaker lower third', 'lower-third', 1, 1, 'Introduce a spoken person or subject. Use text for name, optional detail for spoken role.'),
  entry('title_reveal', 'Cinematic title reveal', 'title', 1, 1, 'Introduce a narrated topic with an optional spoken subtitle.'),
  entry('pull_quote', 'Pull quote', 'quote', 1, 1, 'Emphasize an exact spoken quotation; attribution only if spoken.'),
  entry('keyword_underline', 'Keyword underline', 'underline', 1, 1, 'Underline a short important phrase present in the narration.'),
  entry('marker_highlight', 'Marker highlight', 'highlight', 1, 1, 'Emphasize a short narrated phrase with a brush-like rule, preserving visible footage.'),
  entry('typewriter', 'Typewriter reveal', 'reveal', 1, 1, 'Reveal a short spoken question or definition progressively.', 'Ancient Dharma uses a gentle phrase reveal, never a terminal or blinking cursor.'),
  entry('bullet_recap', 'Bullet-point recap', 'list', 2, 4, 'Summarize two to four short takeaways actually stated in this scene.'),
  entry('numbered_steps', 'Numbered steps', 'sequence', 2, 4, 'Show two to four explicitly ordered steps; preserve the narrated sequence.'),
  entry('chapter_marker', 'Chapter marker', 'title', 1, 1, 'Introduce a spoken chapter heading; optional detail must also be spoken.', 'Do not fabricate chapter numbers absent from narration.'),
  entry('source_credit', 'Source credit', 'lower-third', 1, 1, 'Credit a source actually named in the narration.', 'No fabricated archive names, page numbers, citations or verification badges.'),
  entry('location_pin', 'Location pin', 'pin', 1, 1, 'Introduce a place named in the narration, with optional spoken region.', 'Schematic label only; no inferred map coordinates or tracked attachment.'),
  entry('date_stamp', 'Date stamp', 'date', 1, 1, 'Introduce an exact spoken date or era and optional event description.'),
  entry('number_counter', 'Number count-up', 'quantity', 1, 1, 'Emphasize a stated quantity. Ancient Dharma holds the exact phrase without rolling numbers.'),
  entry('progress_bar', 'Progress bar', 'progress', 1, 1, 'Show an explicit percentage; item.value must match a percentage in item.text and be 0–100.'),
  entry('bar_chart', 'Bar comparison', 'bars', 2, 4, 'Compare two to four nonnegative supplied quantities in the SAME unit. Each text includes its number and unit, with matching item.value.', 'No inferred conversions, incompatible units, missing values or invented totals.'),
  entry('donut_chart', 'Donut percentage', 'donut', 1, 1, 'Show a stated share of a whole; item.value must match the percentage in item.text and be 0–100.'),
  entry('line_chart', 'Trend line', 'trend', 2, 4, 'Plot two to four explicitly ordered observations in the SAME unit. Each text includes the corresponding item.value. Equal observation spacing, zero baseline.', 'No invented data points, extrapolation, conversions or implied proportional time spacing.'),
  entry('cycle_loop', 'Cycle loop', 'cycle', 3, 4, 'Show three or four explicitly recurring stages in their narrated order.', 'Do not imply repetition unless the narration describes a cycle.'),
  entry('branch_diagram', 'Branching diagram', 'tree', 3, 5, 'Show a narrated parent concept and two to four children. Explicit links connect earlier parents to later children.'),
  entry('end_prompt', 'End-screen prompt', 'arrow', 1, 1, 'Emphasize a closing next action actually spoken in the narration.'),
];

export const canonicalMotionTemplateId = (id: string) => id.replace(/^(?:rz|ato)_/, 'ad_');
