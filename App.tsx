import React, { useState, useEffect } from 'react';
import InputSection from './components/InputSection';
import Storyboard from './components/Storyboard';
import { StoryboardFrame, GenerationStep, FrameType } from './types';
import { generateStoryPlan, generateFrameImage, generateFrameVideo, generateFrameAudio, FileData } from './services/gemini';
import { exportVideo } from './services/videoExporter';

const App: React.FC = () => {
  const [step, setStep] = useState<GenerationStep>('INPUT');
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportComplete, setIsExportComplete] = useState(false);

  useEffect(() => {
    // Check for Paid API Key selection (Required for Veo)
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for dev environment without the wrapper, assume env key works
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success as per instructions
      setHasApiKey(true);
    }
  };

  const handlePlanGenerate = async (text: string, file?: FileData) => {
    setIsLoading(true);
    try {
      const planItems = await generateStoryPlan(text, file);
      
      const newFrames: StoryboardFrame[] = planItems.map((item, index) => ({
        id: crypto.randomUUID(),
        frameNumber: index + 1,
        script: item.script,
        visualPrompt: item.visualPrompt,
        visualType: item.visualType === 'VIDEO' ? FrameType.VIDEO : FrameType.IMAGE,
        audioGenerated: false,
        visualGenerated: false,
        isGenerating: false
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
    setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleGenerateMedia = async () => {
    if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
    }

    setStep('GENERATING');
    
    // Process frames sequentially to avoid rate limits (especially for video)
    // Or semi-parallel. Let's do parallel for Images/Audio, serial for Video.
    // For simplicity and robustness in this demo, we'll map through them.
    
    const framesToProcess = [...frames];

    // Helper to update state inside async operations
    const updateFrameState = (id: string, updates: Partial<StoryboardFrame>) => {
        setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const processFrame = async (frame: StoryboardFrame) => {
        if (frame.visualGenerated && frame.audioGenerated) return;

        updateFrameState(frame.id, { isGenerating: true, error: undefined });

        try {
            // 1. Generate Audio (Parallel-ish)
            const audioPromise = (async () => {
                if (!frame.audioGenerated) {
                    const audioUrl = await generateFrameAudio(frame.script);
                    updateFrameState(frame.id, { audioUrl, audioGenerated: true });
                }
            })();

            // 2. Generate Visual
            const visualPromise = (async () => {
                if (!frame.visualGenerated) {
                    let visualUrl = '';
                    if (frame.visualType === FrameType.VIDEO) {
                        visualUrl = await generateFrameVideo(frame.visualPrompt);
                    } else {
                        visualUrl = await generateFrameImage(frame.visualPrompt);
                    }
                    updateFrameState(frame.id, { visualUrl, visualGenerated: true });
                }
            })();

            await Promise.all([audioPromise, visualPromise]);

        } catch (e: any) {
            console.error(`Error generating frame ${frame.frameNumber}:`, e);
            updateFrameState(frame.id, { error: e.message || 'Generation failed' });
        } finally {
            updateFrameState(frame.id, { isGenerating: false });
        }
    };

    // Execute
    await Promise.all(framesToProcess.map(f => processFrame(f)));
    
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
              AI SAM VideoReport
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

export default App;