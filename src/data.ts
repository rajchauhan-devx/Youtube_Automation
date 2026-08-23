export type Section = 'shorts' | 'long';
export type Tab = 'scripts' | 'preview' | 'assets' | 'generation' | 'editor' | 'export';
export type ScriptStatus = 'active' | 'draft';
export type AssetKind = 'image' | 'audio' | 'video';
export interface PromptBlock {
  id: string;
  name: string;
  type?: string;
  content: string;
}

export interface Channel {
  id: string;
  name: string;
  color: string;
  avatar: string;
}

export interface Script {
  id: string;
  name: string;
  lastUsed: string;
  status: ScriptStatus;
  locked: boolean;
  prompts: PromptBlock[];
  howItWorks: string;
  duration: 15 | 30 | 60;
  chapters?: string[];
  content?: string;
  topicName?: string;
  aiInstructions?: string;
  aiResponse?: string;
  extractedScript?: string;
  imagePrompts?: string[];
  narration?: string;
  generatedImages?: GeneratedImage[];
  generatedAudio?: GeneratedAudio[];
  pipeline?: PipelineStep[];
}

export interface PipelineStep {
  id: string;
  label: string;
  status: 'done' | 'pending' | 'running' | 'error' | 'warning';
  summary: string;
  inputLog: string;
  outputPreview: string;
}

export interface GeneratedImage {
  index: number;
  prompt: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  url?: string;
  seed?: number;
  error?: string;
  errorCode?: string;
  attempts?: number;
  elapsedMs?: number;
}

export interface GeneratedAudio {
  language: 'hi' | 'en';
  voice?: string;
  voiceName?: string;
  url: string;
  filename: string;
  elapsedMs?: number;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  duration?: string;
  color: string;
}

export interface Clip {
  id: string;
  track: 'video' | 'broll' | 'audio' | 'caption';
  start: number;
  length: number;
  label: string;
  color: string;
}

export interface ChannelData {
  scripts: Script[];
  pipeline: PipelineStep[];
  images: Asset[];
  audio: Asset[];
  videos: Asset[];
  clips: Clip[];
}

export const channels: Channel[] = [
  { id: 'ch1', name: 'Pixel Pulse', color: '#3b82f6', avatar: 'PP' },
  { id: 'ch2', name: 'Neon Nomad', color: '#10b981', avatar: 'NN' },
];

export const channelData: Record<string, ChannelData> = {
  ch1: {
    scripts: [
      {
        id: 'ch1-s1',
        name: 'AI News in 30s',
        lastUsed: '2h ago',
        status: 'active',
        locked: true,
        howItWorks: 'Research feeds the script, which drives image generation and TTS in parallel, then storyboards the cut.',
        prompts: [
          { id: 'pr1', name: 'Trending Research', content: 'Find trending AI news from the last 24 hours' },
          { id: 'pr2', name: 'Hook Script', content: 'Write a 30s hook + 3 key points + CTA' },
          { id: 'pr3', name: 'AI Visuals', content: 'Futuristic AI visuals, blue tones, clean' },
          { id: 'pr4', name: 'Energetic VO', content: 'Energetic male voice, fast pace' },
          { id: 'pr5', name: 'Clickable Title', content: 'Clickable title under 60 chars' },
        ],
        narration: 'Welcome back to Pixel Pulse! Today we are exploring incredible breakthroughs in artificial intelligence and automation that will re-define how content is created in 2026. Subscribe for daily tech updates!',
        extractedScript: 'Welcome back to Pixel Pulse! Today we are exploring incredible breakthroughs in artificial intelligence and automation that will re-define how content is created in 2026. Subscribe for daily tech updates!',
        imagePrompts: [
          'Futuristic AI brain render with glowing blue neural network connections',
          'Robotic hand interacting with holographic data stream in a modern lab',
          'Microscopic view of advanced quantum computing microchip with blue LED lighting',
        ],
        duration: 30,
      },
      {
        id: 'ch1-s2',
        name: 'Tech Tips Quick',
        lastUsed: '1d ago',
        status: 'draft',
        locked: false,
        howItWorks: '',
        narration: 'Here are 3 quick productivity hacks to speed up your digital workflow today.',
        extractedScript: 'Here are 3 quick productivity hacks to speed up your digital workflow today.',
        imagePrompts: ['Minimal desk setup with sleek workstation and ambient lighting'],
        prompts: [
          { id: 'pr1', name: 'Productivity Research', content: 'Search productivity hacks' },
          { id: 'pr2', name: 'Desk Visuals', content: 'Minimal desk setup shots' },
          { id: 'pr3', name: 'Calm VO', content: 'Calm female voice' },
        ],
        duration: 15,
      },
      {
        id: 'ch1-s3',
        name: 'Gadget Reviews',
        lastUsed: '4d ago',
        status: 'draft',
        locked: false,
        howItWorks: '',
        narration: 'Checking out the top 5 flagship gadgets releasing this month. Let us dive in.',
        extractedScript: 'Checking out the top 5 flagship gadgets releasing this month. Let us dive in.',
        imagePrompts: ['Futuristic wireless earbuds on clean white reflective surface'],
        prompts: [
          { id: 'pr1', name: 'Gadget Research', content: 'Latest gadget releases' },
          { id: 'pr2', name: 'Product Shots', content: 'Product on white' },
          { id: 'pr3', name: 'Neutral VO', content: 'Neutral voice' },
          { id: 'pr4', name: 'Review Title', content: 'Review title' },
        ],
        duration: 60,
      },
    ],
    pipeline: [
      { id: 'p1', label: 'Research', status: 'done', summary: 'Found 12 trending AI topics', inputLog: 'Query: trending AI news last 24h\nSources: 8 news APIs, 3 Reddit feeds', outputPreview: '1. GPT-5 announced\n2. Apple Vision Pro 2 leaks\n3. Tesla robotaxi launch\n...+9 more' },
      { id: 'p2', label: 'Script', status: 'done', summary: '30s script with hook + 3 points', inputLog: 'Topic: GPT-5 announcement\nStyle: energetic, 30s', outputPreview: 'Hook: "AI just changed everything..."\nPoint 1: ...\nPoint 2: ...\nCTA: subscribe' },
      { id: 'p3', label: 'Images', status: 'done', summary: '8 images generated, 9:16 blue tech', inputLog: 'Prompt: futuristic AI visuals, blue tones\nCount: 8, ratio: 9:16', outputPreview: '8 images saved to assets' },
      { id: 'p4', label: 'Audio', status: 'running', summary: 'Generating TTS... 65% complete', inputLog: 'Script: 30s\nVoice: energetic male', outputPreview: 'Processing... 65%' },
      { id: 'p5', label: 'Storyboard', status: 'pending', summary: 'Waiting for audio', inputLog: '', outputPreview: '' },
    ],
    images: [
      { id: 'i1', kind: 'image', name: 'AI brain render', color: '#3b82f6' },
      { id: 'i2', kind: 'image', name: 'Robot hand', color: '#6366f1' },
      { id: 'i3', kind: 'image', name: 'Circuit board', color: '#0ea5e9' },
      { id: 'i4', kind: 'image', name: 'Neural network', color: '#3b82f6' },
      { id: 'i5', kind: 'image', name: 'Data stream', color: '#0891b2' },
      { id: 'i6', kind: 'image', name: 'Chip closeup', color: '#4f46e5' },
    ],
    audio: [
      { id: 'a1', kind: 'audio', name: 'Voiceover take 1', duration: '0:28', color: '#10b981' },
      { id: 'a2', kind: 'audio', name: 'Voiceover take 2', duration: '0:31', color: '#10b981' },
      { id: 'a3', kind: 'audio', name: 'Background music', duration: '0:30', color: '#f59e0b' },
    ],
    videos: [
      { id: 'v1', kind: 'video', name: 'Intro clip', duration: '0:03', color: '#ef4444' },
      { id: 'v2', kind: 'video', name: 'B-roll tech', duration: '0:08', color: '#ec4899' },
    ],
    clips: [
      { id: 'c1', track: 'video', start: 0, length: 4, label: 'Intro', color: '#3b82f6' },
      { id: 'c2', track: 'video', start: 4, length: 6, label: 'Main', color: '#6366f1' },
      { id: 'c3', track: 'broll', start: 2, length: 3, label: 'B-roll', color: '#ec4899' },
      { id: 'c4', track: 'audio', start: 0, length: 10, label: 'VO', color: '#10b981' },
      { id: 'c5', track: 'caption', start: 0, length: 5, label: 'Hook', color: '#f59e0b' },
    ],
  },
  ch2: {
    scripts: [
      {
        id: 'ch2-s1',
        name: 'Travel Vlog Script',
        lastUsed: '5h ago',
        status: 'active',
        locked: true,
        howItWorks: 'Research picks destinations, script structures the vlog, images and audio generate in parallel, then storyboard assembles the cut.',
        prompts: [
          { id: 'pr1', name: 'Destination Research', content: 'Trending travel destinations 2026' },
          { id: 'pr2', name: 'Vlog Script', content: '60s vlog: hook + 3 destinations + CTA' },
          { id: 'pr3', name: 'Cinematic Shots', content: 'Cinematic travel shots, warm tones' },
          { id: 'pr4', name: 'Adventurous VO', content: 'Adventurous voice, medium pace' },
          { id: 'pr5', name: 'Destination Title', content: 'Destination + hook title' },
        ],
        duration: 60,
      },
      {
        id: 'ch2-s2',
        name: 'Food Spots',
        lastUsed: '2d ago',
        status: 'draft',
        locked: false,
        howItWorks: '',
        prompts: [
          { id: 'pr1', name: 'Street Food Research', content: 'Best street food cities' },
          { id: 'pr2', name: 'Food Visuals', content: 'Food closeups, vibrant' },
          { id: 'pr3', name: 'Friendly VO', content: 'Friendly voice' },
        ],
        duration: 30,
      },
      {
        id: 'ch2-s3',
        name: 'City Guides',
        lastUsed: '1w ago',
        status: 'draft',
        locked: false,
        howItWorks: '',
        prompts: [
          { id: 'pr1', name: 'Hidden Gems Research', content: 'Hidden gems in major cities' },
          { id: 'pr2', name: 'Aerial Shots', content: 'City aerial shots' },
          { id: 'pr3', name: 'Informative VO', content: 'Informative voice' },
          { id: 'pr4', name: 'City Guide Title', content: 'City name + guide' },
        ],
        duration: 60,
      },
      {
        id: 'ch2-s4',
        name: 'Budget Travel',
        lastUsed: '2w ago',
        status: 'draft',
        locked: false,
        howItWorks: '',
        prompts: [
          { id: 'pr1', name: 'Budget Hacks', content: 'Cheap travel hacks' },
          { id: 'pr2', name: 'Budget Visuals', content: 'Budget-friendly visuals' },
          { id: 'pr3', name: 'Casual VO', content: 'Casual voice' },
        ],
        duration: 15,
      },
    ],
    pipeline: [
      { id: 'p1', label: 'Research', status: 'done', summary: 'Found 8 trending destinations', inputLog: 'Query: trending travel 2026\nSources: travel blogs, Google Trends', outputPreview: '1. Bali hidden beaches\n2. Lisbon cafes\n3. Tokyo at night\n...+5 more' },
      { id: 'p2', label: 'Script', status: 'done', summary: '60s vlog script, 3 destinations', inputLog: 'Topic: trending destinations\nStyle: adventurous, 60s', outputPreview: 'Hook: "This place will blow your mind..."\nDest 1: ...\nDest 2: ...\nCTA: subscribe' },
      { id: 'p3', label: 'Images', status: 'running', summary: 'Generating 6 images... 40% complete', inputLog: 'Prompt: cinematic travel, warm tones\nCount: 6, ratio: 9:16', outputPreview: 'Processing... 40%' },
      { id: 'p4', label: 'Audio', status: 'error', summary: 'TTS API rate limited, retry needed', inputLog: 'Script: 60s\nVoice: adventurous', outputPreview: 'Error: 429 Too Many Requests' },
      { id: 'p5', label: 'Storyboard', status: 'pending', summary: 'Waiting for audio', inputLog: '', outputPreview: '' },
    ],
    images: [
      { id: 'i1', kind: 'image', name: 'Bali beach', color: '#10b981' },
      { id: 'i2', kind: 'image', name: 'Lisbon street', color: '#f59e0b' },
      { id: 'i3', kind: 'image', name: 'Tokyo night', color: '#ec4899' },
      { id: 'i4', kind: 'image', name: 'Mountain view', color: '#14b8a6' },
    ],
    audio: [
      { id: 'a1', kind: 'audio', name: 'Vlog voiceover', duration: '0:58', color: '#10b981' },
      { id: 'a2', kind: 'audio', name: 'Travel music', duration: '1:00', color: '#f59e0b' },
    ],
    videos: [
      { id: 'v1', kind: 'video', name: 'Drone shot', duration: '0:10', color: '#ef4444' },
      { id: 'v2', kind: 'video', name: 'Walking shot', duration: '0:06', color: '#ec4899' },
    ],
    clips: [
      { id: 'c1', track: 'video', start: 0, length: 5, label: 'Opening', color: '#10b981' },
      { id: 'c2', track: 'video', start: 5, length: 8, label: 'Dest 1', color: '#14b8a6' },
      { id: 'c3', track: 'broll', start: 3, length: 4, label: 'B-roll', color: '#ec4899' },
      { id: 'c4', track: 'audio', start: 0, length: 13, label: 'VO', color: '#f59e0b' },
      { id: 'c5', track: 'caption', start: 0, length: 6, label: 'Title', color: '#3b82f6' },
    ],
  },
};
