import React, { useState, useEffect } from 'react';
import InputSection from './components/InputSection';
import Storyboard from './components/Storyboard';
import { StoryboardFrame, GenerationStep, FrameType } from './types';
import { generateStoryPlan, generateFrameImage, generateFrameVideo, generateFrameAudio, FileData } from './services/gemini';
import { exportVideo } from './services/videoExporter';
import { extractImagesFromPdf } from './services/pdfUtils';

// Helper to calculate estimated duration (Korean speaking rate ~4 chars/sec, min 3s)
const calculateDuration = (text: string): number => {
    return Math.max(3, Math.ceil(text.length / 4));
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const App: React.FC = () => {
  const [step, setStep] = useState<GenerationStep>('INPUT');
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [docImages, setDocImages] = useState<string[]>([]); // Stores extracted images from PDF
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportComplete, setIsExportComplete] = useState(false);

  useEffect(() => {
    // Check for Paid API Key selection (Required for Veo)
    const checkKey = async () => {
      // Wait a bit for aistudio to be injected if it's not there yet
      if (!window.aistudio) {
        for (let i = 0; i < 10; i++) {
          await wait(100);
          if (window.aistudio) break;
        }
      }

      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for non-AI Studio environments (like Vercel or Localhost)
        // If process.env.GEMINI_API_KEY is injected by the build tool, we consider it has a key
        const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (envKey && envKey !== '') {
          setHasApiKey(true);
        } else {
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          setHasApiKey(isLocal);
        }
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    console.log("Attempting to open API key selection dialog...");
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        console.log("API key selection dialog opened/closed");
        setHasApiKey(true);
      } catch (err) {
        console.error("Error opening API key selection dialog:", err);
      }
    } else {
      console.warn("window.aistudio.openSelectKey is not available");
      // If we are on Vercel/Production and have an env key, we don't need to alert
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!envKey || envKey === '') {
        if (window.location.hostname !== 'localhost') {
          alert("API 키가 설정되지 않았습니다. Vercel 설정에서 GEMINI_API_KEY 환경 변수를 등록해주세요.");
        }
      }
    }
  };

  const handlePlanGenerate = async (text: string, fileData?: FileData, originalFile?: File) => {
    // Check for API Key selection first (Required for paid models in shared environment)
    if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
        // After selection, we proceed. Even if hasApiKey is still false due to race condition, 
        // the platform will have injected the key into process.env.API_KEY.
    }

    setIsLoading(true);
    setDocImages([]); // Reset previous images

    try {
      // 1. If PDF, extract images in background
      if (originalFile && originalFile.type === 'application/pdf') {
        try {
            const images = await extractImagesFromPdf(originalFile);
            setDocImages(images);
        } catch (e) {
            console.warn("Could not extract PDF images", e);
        }
      }

      // 2. Generate Plan
      const planItems = await generateStoryPlan(text, fileData);
      
      const newFrames: StoryboardFrame[] = planItems.map((item, index) => ({
        id: crypto.randomUUID(),
        frameNumber: index + 1,
        script: item.script,
        visualPrompt: item.visualPrompt,
        visualType: item.visualType === 'VIDEO' ? FrameType.VIDEO : FrameType.IMAGE,
        visualSourceType: 'AI', // Default to AI
        audioGenerated: false,
        visualGenerated: false,
        isGenerating: false,
        estimatedDuration: calculateDuration(item.script),
        caption: item.script // Initialize caption with script
      }));

      setFrames(newFrames);
      setStep('REVIEW');
    } catch (error) {
      console.error(error);
      alert('스토리보드 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateFrame = (id: string, updates: Partial<StoryboardFrame>) => {
    setFrames(prev => prev.map(f => {
        if (f.id === id) {
            const updatedFrame = { ...f, ...updates };
            // If script changed, recalculate estimated duration
            if (updates.script !== undefined) {
                updatedFrame.estimatedDuration = calculateDuration(updates.script);
            }
            // If visual type changed, clear the generated visual so user knows to regenerate
            if (updates.visualType !== undefined && updates.visualType !== f.visualType) {
                updatedFrame.visualUrl = undefined;
                updatedFrame.visualGenerated = false;
            }
            return updatedFrame;
        }
        return f;
    }));
  };

  const handleRegenerateFrame = async (id: string, type: 'AUDIO' | 'VISUAL') => {
      const frame = frames.find(f => f.id === id);
      if (!frame) return;

      // Set generating state for this frame
      handleUpdateFrame(id, { isGenerating: true, error: undefined });

      try {
          if (type === 'AUDIO') {
              const audioUrl = await generateFrameAudio(frame.script);
              handleUpdateFrame(id, { audioUrl, audioGenerated: true, isGenerating: false });
          } else {
              let visualUrl = '';
              if (frame.visualType === FrameType.VIDEO) {
                  visualUrl = await generateFrameVideo(frame.visualPrompt);
              } else {
                  visualUrl = await generateFrameImage(frame.visualPrompt);
              }
              handleUpdateFrame(id, { visualUrl, visualGenerated: true, isGenerating: false });
          }
      } catch (e: any) {
          console.error(`Error regenerating frame ${frame.frameNumber}:`, e);
          handleUpdateFrame(id, { error: e.message || 'Regeneration failed', isGenerating: false });
      }
  };

  const generateWithRetry = async (
    task: () => Promise<any>,
    onStatusUpdate: (msg: string) => void
  ) => {
    while (true) {
      try {
        return await task();
      } catch (error: any) {
        // Check for Rate Limit (429) or Quota Exceeded
        const errMsg = error.message || JSON.stringify(error);
        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          
          // Try to extract delay from message "Please retry in 45.255s"
          let delayMs = 30000; // Default 30s
          const match = errMsg.match(/retry in (\d+(\.\d+)?)s/);
          if (match && match[1]) {
             delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // Add 1s buffer
          } else if (errMsg.includes('45s')) {
             delayMs = 46000;
          }

          // Safety clamp
          if (delayMs < 5000) delayMs = 10000;

          const seconds = Math.ceil(delayMs / 1000);
          onStatusUpdate(`⚠️ API 사용량 한도 초과. ${seconds}초 후 자동으로 재시도합니다...`);
          
          await wait(delayMs);
          onStatusUpdate(`재시도 중...`);
        } else {
          // If not a rate limit error, rethrow
          throw error;
        }
      }
    }
  };

  const handleGenerateMedia = async () => {
    if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
    }

    setStep('GENERATING');
    
    // Helper to update state inside async operations
    const updateFrameState = (id: string, updates: Partial<StoryboardFrame>) => {
        setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    // Process frames sequentially to avoid hitting rate limits instantly
    for (const frame of frames) {
        // Skip if done
        const isAudioReady = frame.audioGenerated;
        const isVisualReady = frame.visualGenerated && 
            (frame.visualSourceType === 'AI' ? !!frame.visualUrl : true);
            
        if (isAudioReady && isVisualReady) continue;

        updateFrameState(frame.id, { isGenerating: true, error: undefined });

        try {
            // 1. Generate Audio (with retry)
            if (!frame.audioGenerated) {
                await generateWithRetry(
                    async () => {
                        const audioUrl = await generateFrameAudio(frame.script);
                        updateFrameState(frame.id, { audioUrl, audioGenerated: true, error: undefined });
                    },
                    (status) => updateFrameState(frame.id, { error: status }) // Show waiting status in error field temporarily
                );
            }

            // 2. Generate Visual (with retry)
            if (frame.visualSourceType === 'AI' && !frame.visualGenerated) {
                await generateWithRetry(
                    async () => {
                        let visualUrl = '';
                        if (frame.visualType === FrameType.VIDEO) {
                            visualUrl = await generateFrameVideo(frame.visualPrompt);
                        } else {
                            visualUrl = await generateFrameImage(frame.visualPrompt);
                        }
                        updateFrameState(frame.id, { visualUrl, visualGenerated: true, error: undefined });
                    },
                    (status) => updateFrameState(frame.id, { error: status })
                );
            } else if ((frame.visualSourceType === 'DOC' || frame.visualSourceType === 'UPLOAD') && frame.visualUrl) {
                // Manually selected, just mark done
                updateFrameState(frame.id, { visualGenerated: true });
            }

        } catch (e: any) {
            console.error(`Error generating frame ${frame.frameNumber}:`, e);
            updateFrameState(frame.id, { error: e.message || 'Generation failed' });
        } finally {
            updateFrameState(frame.id, { isGenerating: false });
        }
        
        // Small delay between frames to be nice to the API
        if (!frame.audioGenerated || !frame.visualGenerated) {
           await wait(1000);
        }
    }
    
    // Check if truly completed or partial fail
    setStep('COMPLETED');
  };

  const handleExportVideo = async () => {
    setIsExporting(true);
    try {
        await exportVideo(frames);
        setIsExportComplete(true);
    } catch (e) {
        console.error("Export failed", e);
        alert("영상 통합 중 오류가 발생했습니다.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleReset = () => {
    setStep('INPUT');
    setFrames([]);
    setDocImages([]);
    setIsLoading(false);
    setIsExporting(false);
    setIsExportComplete(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              KHNP AI Instructional Video Production System
            </span>
          </div>
          
          {!hasApiKey && window.aistudio && (
            <button 
                onClick={handleSelectKey}
                className="text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-medium hover:bg-amber-200 transition-colors"
            >
                ⚠️ API 키 선택 필요
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {step === 'INPUT' && (
          <InputSection onPlanGenerate={handlePlanGenerate} isLoading={isLoading} />
        )}

        {(step === 'REVIEW' || step === 'GENERATING' || step === 'COMPLETED') && (
            <Storyboard 
                frames={frames} 
                docImages={docImages}
                onGenerateMedia={handleGenerateMedia} 
                isGenerating={step === 'GENERATING'}
                onUpdateFrame={handleUpdateFrame}
                onExportVideo={handleExportVideo}
                isExporting={isExporting}
                isExportComplete={isExportComplete}
                onReset={handleReset}
            />
        )}

      </main>
    </div>
  );
};