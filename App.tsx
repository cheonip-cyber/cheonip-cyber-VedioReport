import React, { useState, useEffect, useRef } from 'react';
import InputSection from './components/InputSection';
import Storyboard from './components/Storyboard';
import { StoryboardFrame, GenerationStep } from './types';
import { generateStoryPlan, generateFrameImage, generateFrameAudio, FileData } from './services/gemini';
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
  const [docImages, setDocImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportComplete, setIsExportComplete] = useState(false);
  // [수정] 영상 내보내기 진행률 표시
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    const checkKey = async () => {
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
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (err) {
        console.error("Error opening API key selection dialog:", err);
      }
    } else {
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!envKey || envKey === '') {
        if (window.location.hostname !== 'localhost') {
          alert("API 키가 설정되지 않았습니다. Vercel 설정에서 GEMINI_API_KEY 환경 변수를 등록해주세요.");
        }
      }
    }
  };

  const handlePlanGenerate = async (text: string, fileData?: FileData, originalFile?: File) => {
    if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
    }

    setIsLoading(true);
    setDocImages([]);

    try {
      if (originalFile && originalFile.type === 'application/pdf') {
        try {
            const images = await extractImagesFromPdf(originalFile);
            setDocImages(images);
        } catch (e) {
            console.warn("Could not extract PDF images", e);
        }
      }

      const planItems = await generateStoryPlan(text, fileData);
      
      const newFrames: StoryboardFrame[] = planItems.map((item, index) => ({
        id: crypto.randomUUID(),
        frameNumber: index + 1,
        script: item.script,
        visualPrompt: item.visualPrompt,
        visualType: 'IMAGE' as const,
        visualSourceType: 'AI',
        audioGenerated: false,
        visualGenerated: false,
        isGenerating: false,
        estimatedDuration: calculateDuration(item.script),
        caption: item.script
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
            if (updates.script !== undefined) {
                updatedFrame.estimatedDuration = calculateDuration(updates.script);
            }
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

      handleUpdateFrame(id, { isGenerating: true, error: undefined });

      try {
          if (type === 'AUDIO') {
              const audioUrl = await generateFrameAudio(frame.script);
              handleUpdateFrame(id, { audioUrl, audioGenerated: true, isGenerating: false });
          } else {
              const visualUrl = await generateFrameImage(frame.visualPrompt);
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
        const errMsg = error.message || JSON.stringify(error);
        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          let delayMs = 30000;
          const match = errMsg.match(/retry in (\d+(\.\d+)?)s/);
          if (match && match[1]) {
             delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
          } else if (errMsg.includes('45s')) {
             delayMs = 46000;
          }
          if (delayMs < 5000) delayMs = 10000;

          const seconds = Math.ceil(delayMs / 1000);
          onStatusUpdate(`⚠️ API 사용량 한도 초과. ${seconds}초 후 자동으로 재시도합니다...`);
          await wait(delayMs);
          onStatusUpdate(`재시도 중...`);
        } else {
          throw error;
        }
      }
    }
  };

  /**
   * [핵심 수정] stale closure 문제 해결.
   *
   * 기존 문제:
   *  - handleGenerateMedia 시작 시점의 frames 스냅샷으로 for...of를 순회함.
   *  - React의 setState는 비동기이므로, updateFrameState 호출 결과가 다음 루프 반복에
   *    반영되지 않아 이미 완료된 프레임을 다시 생성하거나, 완료 감지가 틀어짐.
   *  - frames를 최신 상태로 읽으려면 setFrames의 함수형 업데이트 + ref를 활용해야 함.
   *
   * 해결: framesRef를 통해 항상 최신 frames를 참조하고,
   *       완료 여부를 ref 기반으로 판단.
   */
  const framesRef = useRef<StoryboardFrame[]>(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);

  const handleGenerateMedia = async () => {
    if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
    }

    setStep('GENERATING');

    // frames의 id 목록을 확정 (시작 시점 기준)
    const frameIds = framesRef.current.map(f => f.id);

    const updateFrameState = (id: string, updates: Partial<StoryboardFrame>) => {
        setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    for (const id of frameIds) {
      // [수정] 매 반복마다 framesRef에서 최신 상태를 읽음
      const frame = framesRef.current.find(f => f.id === id);
      if (!frame) continue;

      const isAudioReady = frame.audioGenerated;
      const isVisualReady = frame.visualGenerated &&
          (frame.visualSourceType === 'AI' ? !!frame.visualUrl : true);

      if (isAudioReady && isVisualReady) continue;

      updateFrameState(id, { isGenerating: true, error: undefined });

      try {
          if (!frame.audioGenerated) {
              await generateWithRetry(
                  async () => {
                      const audioUrl = await generateFrameAudio(frame.script);
                      updateFrameState(id, { audioUrl, audioGenerated: true, error: undefined });
                  },
                  (status) => updateFrameState(id, { error: status })
              );
          }

          // [수정] 최신 frame 다시 조회 (오디오 생성 후 상태가 바뀌었을 수 있음)
          const latestFrame = framesRef.current.find(f => f.id === id);
          if (!latestFrame) continue;

          if (latestFrame.visualSourceType === 'AI' && !latestFrame.visualGenerated) {
              await generateWithRetry(
                  async () => {
                      const visualUrl = await generateFrameImage(latestFrame.visualPrompt);
                      updateFrameState(id, { visualUrl, visualGenerated: true, error: undefined });
                  },
                  (status) => updateFrameState(id, { error: status })
              );
          } else if (
              (latestFrame.visualSourceType === 'DOC' || latestFrame.visualSourceType === 'UPLOAD') &&
              latestFrame.visualUrl
          ) {
              updateFrameState(id, { visualGenerated: true });
          }

      } catch (e: any) {
          console.error(`Error generating frame ${frame.frameNumber}:`, e);
          updateFrameState(id, { error: e.message || 'Generation failed' });
      } finally {
          updateFrameState(id, { isGenerating: false });
      }

      await wait(1000);
    }

    setStep('COMPLETED');
  };

  const handleExportVideo = async () => {
    setIsExporting(true);
    setExportProgress({ current: 0, total: frames.length });
    try {
        await exportVideo(frames, (current, total) => {
            setExportProgress({ current, total });
        });
        setIsExportComplete(true);
    } catch (e: any) {
        console.error("Export failed", e);
        alert(`영상 통합 중 오류가 발생했습니다.\n\n${e.message || e}`);
    } finally {
        setIsExporting(false);
        setExportProgress(null);
    }
  };

  const handleReset = () => {
    setStep('INPUT');
    setFrames([]);
    setDocImages([]);
    setIsLoading(false);
    setIsExporting(false);
    setIsExportComplete(false);
    setExportProgress(null);
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

      {/* 영상 내보내기 진행률 오버레이 */}
      {isExporting && exportProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
            <div className="text-4xl mb-4">🎬</div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">영상 통합 중...</h3>
            <p className="text-sm text-slate-500 mb-4">
              컷 {exportProgress.current} / {exportProgress.total} 처리 중
            </p>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${exportProgress.total > 0 ? Math.round((exportProgress.current / exportProgress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-3">브라우저 탭을 닫거나 이동하지 마세요.</p>
          </div>
        </div>
      )}

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
                onRegenerateFrame={handleRegenerateFrame}
            />
        )}

      </main>
    </div>
  );
};
