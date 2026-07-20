export type Section = 'shorts' | 'long';
export type Tab = 'scripts' | 'preview' | 'assets' | 'editor' | 'export';
export type ScriptStatus = 'active' | 'draft';
export type AssetKind = 'image' | 'audio' | 'video';

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
  researchPrompt: string;
  imagePrompt: string;
  ttsPrompt: string;
  videoRules: string;
  metadataPrompt: string;
  duration: 15 | 30 | 60;
  chapters?: string[];
}

export interface PipelineStep {
  id: string;
  label: string;
  status: 'done' | 'pending' | 'running';
  content: string;
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
        id: 's1',
        name: 'AI News in 30s',
        lastUsed: '2h ago',
        status: 'active',
        locked: true,
        researchPrompt: 'Find trending AI news from the last 24 hours',
        imagePrompt: 'Futuristic AI visuals, blue tones, clean',
        ttsPrompt: 'Energetic male voice, fast pace',
        videoRules: 'Cut every 2s, captions always on',
        metadataPrompt: 'Clickable title under 60 chars',
        duration: 30,
      },
      {
        id: 's2',
        name: 'Tech Tips Quick',
        lastUsed: '1d ago',
        status: 'draft',
        locked: false,
        researchPrompt: 'Search productivity hacks',
        imagePrompt: 'Minimal desk setup shots',
        ttsPrompt: 'Calm female voice',
        videoRules: 'Cut every 3s',
        metadataPrompt: 'How-to style title',
        duration: 15,
      },
      {
        id: 's3',
        name: 'Gadget Reviews',
        lastUsed: '4d ago',
        status: 'draft',
        locked: false,
        researchPrompt: 'Latest gadget releases',
        imagePrompt: 'Product on white',
        ttsPrompt: 'Neutral voice',
        videoRules: 'Cut every 2s',
        metadataPrompt: 'Review title',
        duration: 60,
      },
    ],
    pipeline: [
      { id: 'p1', label: 'Research', status: 'done', content: 'Found 12 trending topics. Top: "GPT-5 announced", "Apple Vision Pro 2 leaks", "Tesla robotaxi launch"' },
      { id: 'p2', label: 'Script', status: 'done', content: 'Hook: "AI just changed everything..." Body: 3 key points. CTA: subscribe.' },
      { id: 'p3', label: 'Images', status: 'done', content: '8 images generated, 9:16 format, blue tech aesthetic' },
      { id: 'p4', label: 'Audio', status: 'running', content: 'Generating TTS... 65% complete' },
      { id: 'p5', label: 'Storyboard', status: 'pending', content: 'Waiting for audio' },
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
        id: 's1',
        name: 'Travel Vlog Script',
        lastUsed: '5h ago',
        status: 'active',
        locked: true,
        researchPrompt: 'Trending travel destinations 2026',
        imagePrompt: 'Cinematic travel shots, warm tones',
        ttsPrompt: 'Adventurous voice, medium pace',
        videoRules: 'Cut every 3s, text overlays',
        metadataPrompt: 'Destination + hook title',
        duration: 60,
      },
      {
        id: 's2',
        name: 'Food Spots',
        lastUsed: '2d ago',
        status: 'draft',
        locked: false,
        researchPrompt: 'Best street food cities',
        imagePrompt: 'Food closeups, vibrant',
        ttsPrompt: 'Friendly voice',
        videoRules: 'Cut every 2s',
        metadataPrompt: 'Food list title',
        duration: 30,
      },
      {
        id: 's3',
        name: 'City Guides',
        lastUsed: '1w ago',
        status: 'draft',
        locked: false,
        researchPrompt: 'Hidden gems in major cities',
        imagePrompt: 'City aerial shots',
        ttsPrompt: 'Informative voice',
        videoRules: 'Cut every 4s',
        metadataPrompt: 'City name + guide',
        duration: 60,
      },
      {
        id: 's4',
        name: 'Budget Travel',
        lastUsed: '2w ago',
        status: 'draft',
        locked: false,
        researchPrompt: 'Cheap travel hacks',
        imagePrompt: 'Budget-friendly visuals',
        ttsPrompt: 'Casual voice',
        videoRules: 'Cut every 2s',
        metadataPrompt: 'Budget + destination',
        duration: 15,
      },
    ],
    pipeline: [
      { id: 'p1', label: 'Research', status: 'done', content: 'Found 8 trending destinations. Top: "Bali hidden beaches", "Lisbon cafes", "Tokyo at night"' },
      { id: 'p2', label: 'Script', status: 'done', content: 'Hook: "This place will blow your mind..." 3 destinations, CTA.' },
      { id: 'p3', label: 'Images', status: 'running', content: 'Generating 6 images... 40% complete' },
      { id: 'p4', label: 'Audio', status: 'pending', content: 'Waiting for images' },
      { id: 'p5', label: 'Storyboard', status: 'pending', content: 'Waiting for audio' },
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
