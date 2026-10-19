export type AutoPilotStage =
  | 'idle'
  | 'research_script'
  | 'extract_assets'
  | 'generate_images'
  | 'generate_audio'
  | 'plan_motion'
  | 'render_video'
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
  error?: string | null;
}

export const AUTO_PILOT_STAGES: {
  id: AutoPilotStage;
  label: string;
  description: string;
  stepNumber: number;
}[] = [
  {
    id: 'research_script',
    label: 'Script & Research',
    description: 'Gemini researches topic depth and writes a complete production script',
    stepNumber: 1,
  },
  {
    id: 'extract_assets',
    label: 'Asset Extraction',
    description: 'Deconstructs script into structured scenes, visual prompts and narration',
    stepNumber: 2,
  },
  {
    id: 'generate_images',
    label: 'Visual Generation',
    description: 'Generates cinematic visual keyframes for each scene via Google Cloud',
    stepNumber: 3,
  },
  {
    id: 'generate_audio',
    label: 'Voice Narration',
    description: 'Synthesizes narration with measured scene timing',
    stepNumber: 4,
  },
  {
    id: 'plan_motion',
    label: 'Documentary Visuals',
    description: 'Composes image inserts and detail highlights, then reviews rendered placement',
    stepNumber: 5,
  },
  {
    id: 'render_video',
    label: 'Render MP4',
    description: 'Assembles timeline and compiles final high-definition video',
    stepNumber: 6,
  },
];
