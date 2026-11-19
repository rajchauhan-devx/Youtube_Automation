import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Code,
  FileCode,
  Play,
  BarChart3,
  Type,
  Layers,
  Wand2,
  CheckCircle2,
  ArrowRight,
  Eye,
  Sliders,
  FolderOpen,
} from 'lucide-react';
import { OPEN_SOURCE_LOTTIE_CATALOG } from '../../lib/lottie-engine';
import { LottieMotionPlayer } from '../preview/LottieMotionPlayer';

export type TemplateCategory = 'all' | 'titles' | 'charts' | 'callouts' | 'effects' | 'lottie';

interface OpenSourceTemplateItem {
  id: string;
  name: string;
  category: 'titles' | 'charts' | 'callouts' | 'effects';
  filename: string;
  type: 'remotion' | 'lottie';
  description: string;
  tags: string[];
  parameters: string[];
}

const REMOTION_TEMPLATES_LIST: OpenSourceTemplateItem[] = [
  // Titles & Intros
  {
    id: 'cinematic-title-intro',
    name: 'Cinematic Title Intro',
    category: 'titles',
    filename: 'src/templates/open-source/cinematic-title-intro.tsx',
    type: 'remotion',
    description: 'Full-bleed cinematic title opener with soft letter-spacing easing and camera drift.',
    tags: ['Remotion', 'Title', 'Cinematic', 'Opener'],
    parameters: ['title', 'subtitle', 'color', 'fontSize', 'durationInFrames'],
  },
  {
    id: 'chapter-title',
    name: 'Chapter Title & Section Reveal',
    category: 'titles',
    filename: 'src/templates/open-source/chapter-title.tsx',
    type: 'remotion',
    description: 'Clean chapter number with horizontal divider rule and descriptive sub-headline.',
    tags: ['Remotion', 'Chapter', 'Divider', 'Section'],
    parameters: ['chapterNumber', 'title', 'subtitle', 'accentColor'],
  },
  {
    id: 'typewriter-subtitle',
    name: 'Typewriter Kinetic Subtitle',
    category: 'titles',
    filename: 'src/templates/open-source/typewriter-subtitle.tsx',
    type: 'remotion',
    description: 'Dynamic character-by-character typewriter reveal with blinking terminal cursor.',
    tags: ['Remotion', 'Typewriter', 'Text', 'Hook'],
    parameters: ['text', 'speed', 'cursorColor', 'fontFamily'],
  },
  {
    id: 'animated-text',
    name: 'Kinetic Word Spring',
    category: 'titles',
    filename: 'src/templates/open-source/animated-text.tsx',
    type: 'remotion',
    description: 'Spring-damped bouncy headline text animation for high viewer retention.',
    tags: ['Remotion', 'Kinetic', 'Typography', 'Retention'],
    parameters: ['headline', 'springConfig', 'highlightColor'],
  },
  {
    id: 'bounce-text',
    name: 'Bounce Elastic Typography',
    category: 'titles',
    filename: 'src/templates/open-source/bounce-text.tsx',
    type: 'remotion',
    description: 'Playful elastic bounce text for energetic shorts, facts, and announcements.',
    tags: ['Remotion', 'Bounce', 'Shorts', 'Energy'],
    parameters: ['text', 'bounceHeight', 'damping', 'textColor'],
  },
  {
    id: 'glitch-text',
    name: 'High-Tech RGB Glitch Text',
    category: 'titles',
    filename: 'src/templates/open-source/glitch-text.tsx',
    type: 'remotion',
    description: 'Digital RGB displacement glitch with scanlines for cyber and intense moments.',
    tags: ['Remotion', 'Glitch', 'RGB', 'Cyber'],
    parameters: ['text', 'intensity', 'glitchInterval', 'scanlines'],
  },

  // Data & Charts
  {
    id: 'chart-animation',
    name: 'Animated Multi-Bar Chart',
    category: 'charts',
    filename: 'src/templates/open-source/chart-animation.tsx',
    type: 'remotion',
    description: 'Staggered bar graph with animated percentage height and numeric value labels.',
    tags: ['Remotion', 'Bar Chart', 'Statistics', 'Comparison'],
    parameters: ['dataSeries', 'barColor', 'labelColor', 'maxValue'],
  },
  {
    id: 'line-chart',
    name: 'Dynamic Trend Line Graph',
    category: 'charts',
    filename: 'src/templates/open-source/line-chart.tsx',
    type: 'remotion',
    description: 'Smooth SVG bezier path drawing of time-series data with pulsed milestone points.',
    tags: ['Remotion', 'Line Graph', 'Timeline', 'Finance'],
    parameters: ['points', 'strokeWidth', 'lineColor', 'showDots'],
  },
  {
    id: 'donut-chart',
    name: 'Donut Share of Whole Breakdown',
    category: 'charts',
    filename: 'src/templates/open-source/donut-chart.tsx',
    type: 'remotion',
    description: 'Circular radial donut chart showing percentage distributions and categories.',
    tags: ['Remotion', 'Donut', 'Percentage', 'Infographic'],
    parameters: ['slices', 'cutoutRatio', 'legendPosition'],
  },
  {
    id: 'circular-progress',
    name: 'Circular Progress Ring',
    category: 'charts',
    filename: 'src/templates/open-source/circular-progress.tsx',
    type: 'remotion',
    description: 'Radial progress meter filling from 0 to target value with big center number.',
    tags: ['Remotion', 'Gauge', 'Progress', 'Metric'],
    parameters: ['percentage', 'strokeWidth', 'glowColor', 'unit'],
  },
  {
    id: 'comparison-chart',
    name: 'Side-by-Side Comparison Matrix',
    category: 'charts',
    filename: 'src/templates/open-source/comparison-chart.tsx',
    type: 'remotion',
    description: 'Two-column versus breakdown with pros/cons checkmarks and contrasting accents.',
    tags: ['Remotion', 'Versus', 'Comparison', 'Matrix'],
    parameters: ['itemA', 'itemB', 'metrics', 'accentA', 'accentB'],
  },
  {
    id: 'stat-counter',
    name: 'Rolling Stat Counter',
    category: 'charts',
    filename: 'src/templates/open-source/stat-counter.tsx',
    type: 'remotion',
    description: 'Fast numerical count-up with formatted separators and contextual unit badge.',
    tags: ['Remotion', 'Counter', 'Numbers', 'Highlight'],
    parameters: ['startValue', 'endValue', 'suffix', 'durationInFrames'],
  },
  {
    id: 'progress-steps',
    name: 'Numbered Step Milestones',
    category: 'charts',
    filename: 'src/templates/open-source/progress-steps.tsx',
    type: 'remotion',
    description: 'Step 1-2-3 sequential journey with connecting lines and active step glows.',
    tags: ['Remotion', 'Workflow', 'Steps', 'How-To'],
    parameters: ['steps', 'activeStepIndex', 'stepColor'],
  },

  // Lower Thirds & Callouts
  {
    id: 'lower-third',
    name: 'Speaker Lower Third Banner',
    category: 'callouts',
    filename: 'src/templates/open-source/lower-third.tsx',
    type: 'remotion',
    description: 'Professional speaker introduction with animated accent block and role title.',
    tags: ['Remotion', 'Lower Third', 'Speaker', 'Documentary'],
    parameters: ['name', 'title', 'accentColor', 'placement'],
  },
  {
    id: 'quote-card',
    name: 'Cinematic Pull Quote Card',
    category: 'callouts',
    filename: 'src/templates/open-source/quote-card.tsx',
    type: 'remotion',
    description: 'Elegant parchment/dark card with quotation marks, author credit, and fine rule.',
    tags: ['Remotion', 'Quote', 'Scripture', 'Wisdom'],
    parameters: ['quoteText', 'author', 'source', 'themeBg'],
  },
  {
    id: 'notification-pop',
    name: 'Social Notification Pill',
    category: 'callouts',
    filename: 'src/templates/open-source/notification-pop.tsx',
    type: 'remotion',
    description: 'Modern iOS/Android style floating notification with icon and slide-in bounce.',
    tags: ['Remotion', 'Notification', 'Popup', 'Modern'],
    parameters: ['icon', 'title', 'message', 'badgeCount'],
  },
  {
    id: 'subscribe-reminder',
    name: 'YouTube Subscribe Bell Prompt',
    category: 'callouts',
    filename: 'src/templates/open-source/subscribe-reminder.tsx',
    type: 'remotion',
    description: 'Animated subscribe button, mouse cursor click effect, and notification bell ding.',
    tags: ['Remotion', 'Subscribe', 'CTA', 'YouTube'],
    parameters: ['channelName', 'avatarUrl', 'buttonColor'],
  },
  {
    id: 'text-highlight',
    name: 'Marker Pen Highlight Reveal',
    category: 'callouts',
    filename: 'src/templates/open-source/text-highlight.tsx',
    type: 'remotion',
    description: 'Hand-drawn fluorescent highlighter streak behind critical spoken phrases.',
    tags: ['Remotion', 'Highlight', 'Marker', 'Emphasis'],
    parameters: ['phrase', 'markerColor', 'strokeRadius'],
  },

  // Transitions & Effects
  {
    id: 'split-screen',
    name: 'Dual Split Screen Comparison',
    category: 'effects',
    filename: 'src/templates/open-source/split-screen.tsx',
    type: 'remotion',
    description: '50/50 dual-frame split screen with border glow for simultaneous perspectives.',
    tags: ['Remotion', 'Split Screen', 'Layout', 'Dual'],
    parameters: ['leftContent', 'rightContent', 'dividerColor'],
  },
  {
    id: 'image-comparison-slider',
    name: 'Before / After Comparison Slider',
    category: 'effects',
    filename: 'src/templates/open-source/image-comparison-slider.tsx',
    type: 'remotion',
    description: 'Interactive animated wipe reveal contrasting past era with modern day.',
    tags: ['Remotion', 'Before/After', 'Slider', 'Archaeology'],
    parameters: ['beforeImage', 'afterImage', 'sliderSpeed'],
  },
  {
    id: 'spotlight-reveal',
    name: 'Focus Spotlight Dimming',
    category: 'effects',
    filename: 'src/templates/open-source/spotlight-reveal.tsx',
    type: 'remotion',
    description: 'Radial vignette spotlight highlighting specific artifacts while darkening background.',
    tags: ['Remotion', 'Spotlight', 'Focus', 'Vignette'],
    parameters: ['targetCoordinates', 'spotlightRadius', 'dimOpacity'],
  },
  {
    id: 'sound-wave',
    name: 'Dynamic Audio Sound Waveform',
    category: 'effects',
    filename: 'src/templates/open-source/sound-wave.tsx',
    type: 'remotion',
    description: 'Real-time reacting audio equalizer bars synchronized with narration.',
    tags: ['Remotion', 'Waveform', 'Audio', 'Voice'],
    parameters: ['barsCount', 'waveColor', 'amplitude'],
  },
  {
    id: 'matrix-rain',
    name: 'Digital Code Stream Cascade',
    category: 'effects',
    filename: 'src/templates/open-source/matrix-rain.tsx',
    type: 'remotion',
    description: 'Falling green/gold vertical characters for technological or code scenes.',
    tags: ['Remotion', 'Matrix', 'Rain', 'Code'],
    parameters: ['characters', 'fallSpeed', 'glowColor'],
  },
  {
    id: 'particle-explosion',
    name: 'Celebration Particle Burst',
    category: 'effects',
    filename: 'src/templates/open-source/particle-explosion.tsx',
    type: 'remotion',
    description: 'Kinetic particle burst for climactic realizations, victory, and big reveals.',
    tags: ['Remotion', 'Particles', 'Burst', 'Climax'],
    parameters: ['particleCount', 'colorPalette', 'spreadRadius'],
  },
];

export const OpenSourceTemplatesGallery: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return REMOTION_TEMPLATES_LIST.filter((item) => {
      const matchesCat =
        selectedCategory === 'all'
          ? true
          : selectedCategory === 'lottie'
          ? false
          : item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const lottieItems = useMemo(() => {
    if (selectedCategory !== 'all' && selectedCategory !== 'lottie') return [];
    return OPEN_SOURCE_LOTTIE_CATALOG.filter((t) => {
      return (
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [selectedCategory, searchQuery]);

  const totalCount = REMOTION_TEMPLATES_LIST.length + OPEN_SOURCE_LOTTIE_CATALOG.length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-surface/85 p-6 shadow-card backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Open-Source Motion Graphics Library
              </h2>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                {totalCount} Ready-to-Use Templates
              </span>
            </div>
            <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
              Standardized, code-driven video templates directly imported from open-source GitHub ecosystems (Remotion + Lottie).
              All templates support parameter injection and dynamic channel color themes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs text-gray-300">
              <FolderOpen className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono text-[11px] text-muted">src/templates/open-source/ (81 .tsx)</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs text-gray-300">
              <FolderOpen className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono text-[11px] text-muted">public/lottie-templates/ (7 .json)</span>
            </div>
          </div>
        </div>

        {/* Search & Categories Bar */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-background/50 p-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'all'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setSelectedCategory('titles')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'titles'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              <Type className="h-3.5 w-3.5" />
              Titles &amp; Intros
            </button>
            <button
              onClick={() => setSelectedCategory('charts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'charts'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Charts &amp; Data
            </button>
            <button
              onClick={() => setSelectedCategory('callouts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'callouts'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Lower Thirds
            </button>
            <button
              onClick={() => setSelectedCategory('effects')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'effects'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Transitions &amp; FX
            </button>
            <button
              onClick={() => setSelectedCategory('lottie')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === 'lottie'
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-muted hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Lottie Vector ({OPEN_SOURCE_LOTTIE_CATALOG.length})
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search 80+ templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border/80 bg-background/60 py-1.5 pl-9 pr-3 text-xs text-white placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* LOTTIE SECTION (If selected or in 'all') */}
      {lottieItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              ⚡ Open-Source Lottie Vector Graphics ({lottieItems.length})
            </h3>
            <span className="text-[11px] text-muted">Vector JSON · 100% themeable</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lottieItems.map((lot) => (
              <div
                key={lot.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-surface/75 p-4 transition hover:border-amber-500/50 hover:shadow-card"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20 uppercase">
                      Lottie Vector
                    </span>
                    <span className="text-[10px] font-mono text-muted">{lot.defaultDurationSec}s</span>
                  </div>

                  {/* Live Lottie Player Box */}
                  <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-background/50 border border-border/50">
                    <LottieMotionPlayer
                      templateId={lot.id}
                      primaryColor="#FDE047"
                      accentColor="#F59E0B"
                      width={120}
                      height={120}
                    />
                  </div>

                  <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition">
                    {lot.name}
                  </h4>
                  <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">
                    {lot.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted font-mono">
                  <span className="truncate">{lot.path}</span>
                  <span className="text-emerald-400 font-semibold">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REMOTION TEMPLATES GRID */}
      {filteredItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
              ⚛️ Remotion React Components ({filteredItems.length})
            </h3>
            <span className="text-[11px] text-muted">Pure TSX · Parameterized props</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((tpl) => {
              const isSelected = selectedItem === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedItem(isSelected ? null : tpl.id)}
                  className={`group relative flex flex-col justify-between cursor-pointer rounded-xl border p-4 transition ${
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-glow'
                      : 'border-border/80 bg-surface/75 hover:border-accent/50 hover:shadow-card'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent border border-accent/20 uppercase">
                        React / Remotion
                      </span>
                      <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted">
                        .tsx
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white group-hover:text-accent transition">
                      {tpl.name}
                    </h4>
                    <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {tpl.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-background/50 px-1.5 py-0.5 text-[10px] text-muted border border-border/40"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-muted text-[10px] truncate max-w-[170px]">
                        {tpl.id}.tsx
                      </span>
                      <span className="flex items-center gap-1 text-accent text-xs font-semibold">
                        <Sliders className="h-3 w-3" />
                        Props
                      </span>
                    </div>

                    {isSelected && (
                      <div className="mt-3 rounded-lg bg-background/80 p-2.5 border border-border/60 animate-fade-in text-[11px]">
                        <p className="font-semibold text-white mb-1.5">Accepted AI Parameters:</p>
                        <div className="flex flex-wrap gap-1">
                          {tpl.parameters.map((param) => (
                            <span
                              key={param}
                              className="font-mono text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded"
                            >
                              {param}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filteredItems.length === 0 && lottieItems.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-border/80 bg-surface/75">
          <p className="text-sm font-semibold text-gray-300">No open-source templates match "{searchQuery}"</p>
          <p className="text-xs text-muted mt-1">Try searching for "chart", "title", "quote", or "lower".</p>
        </div>
      )}
    </div>
  );
};
