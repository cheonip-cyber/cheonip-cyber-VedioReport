export enum FrameType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export interface StoryboardFrame {
  id: string;
  frameNumber: number;
  script: string;
  visualPrompt: string;
  visualType: FrameType;
  
  // New fields for image source selection
  visualSourceType: 'AI' | 'DOC' | 'UPLOAD'; 
  
  audioGenerated: boolean;
  visualGenerated: boolean;
  audioUrl?: string; // Blob URL for playback
  visualUrl?: string; // Blob URL or base64 data URI
  isGenerating: boolean;
  estimatedDuration?: number; // Estimated duration in seconds based on script length
  error?: string;
  caption?: string; // Subtitle text for the frame
}

export type GenerationStep = 'INPUT' | 'PLANNING' | 'REVIEW' | 'GENERATING' | 'COMPLETED';

export interface PlanResponseItem {
  script: string;
  visualPrompt: string;
  visualType: 'IMAGE' | 'VIDEO';
  // Optional: suggested page number if AI detects it, though we rely on user selection
  relevantPageNumber?: number; 
}

export interface GoogleMediaPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
  text?: string;
}

// Global declaration for AI Studio key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}