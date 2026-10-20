export type AutoPilotStage =
  | 'idle'
  | 'plan_hooks'
  | 'research_script'
  | 'edit_retention'
  | 'extract_assets'
  | 'generate_images'
  | 'generate_audio'
  | 'plan_motion'
  | 'render_video'
  | 'review_retention'
  | 'upload_youtube'
  | 'completed'
  | 'error';

export interface AutoPilotLog {
  id: string;
  timestamp: string;
  stage: AutoPilotStage;
  message: string;
  type: 'info' | 'gemini' | 'success' | 'warn' | 'error';
}

export interface AutoPilotState {
  isActive: boolean;
  isPaused: boolean;
  isMinimized: boolean;
  stage: AutoPilotStage;
  stageIndex: number;
  totalStages: number;
  progressPercent: number;
  statusMessage: string;
  topic: string;
  scriptId: string | null;
  sceneCurrent?: number;
  sceneTotal?: number;
  logs: AutoPilotLog[];
  renderedVideoUrl?: string | null;
  youtubeVideoUrl?: string | null;
  error?: string | null;
}

export const AUTO_PILOT_STAGES: {
  id: AutoPilotStage;
  label: string;
  description: string;
  stepNumber: number;
}[] = [
  { id: 'plan_hooks', label: 'Hooks & Promise', description: 'Learns from profile performance and selects one of three honest opening hooks', stepNumber: 1 },
  {
    id: 'research_script',
    label: 'Script & Research',
    description: 'Checks profile notes, selects a fresh topic and writes a researched script',
    stepNumber: 2,
  },
  { id: 'edit_retention', label: 'Story Edit', description: 'Removes repetition and aligns scene narration and visuals with the promised payoff', stepNumber: 3 },
  {
    id: 'extract_assets',
    label: 'Asset Extraction',
    description: 'Deconstructs script into structured scenes, visual prompts and narration',
    stepNumber: 4,
  },
  {
    id: 'generate_images',
    label: 'Visual Generation',
    description: 'Generates cinematic visual keyframes for each scene via Google Cloud',
    stepNumber: 5,
  },
  {
    id: 'generate_audio',
    label: 'Voice Narration',
    description: 'Synthesizes narration with measured scene timing',
    stepNumber: 6,
  },
  {
    id: 'plan_motion',
    label: 'Documentary Visuals',
    description: 'Composes image inserts and detail highlights, then reviews rendered placement',
    stepNumber: 7,
  },
  {
    id: 'render_video',
    label: 'Render MP4',
    description: 'Assembles timeline and compiles final high-definition video',
    stepNumber: 8,
  },
  { id: 'review_retention', label: 'Final Review', description: 'Reviews sampled final frames and mixed audio before permitting upload', stepNumber: 9 },
  {
    id: 'upload_youtube',
    label: 'YouTube Export',
    description: 'Uploads the final video and records its topic in this profile’s notes',
    stepNumber: 10,
  },
];
