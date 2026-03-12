import React, { useState } from 'react';
import { StoryboardFrame, FrameType } from '../types';
import { PLACEHOLDER_IMAGE } from '../constants';

interface StoryboardProps {
  frames: StoryboardFrame[];
  docImages?: string[]; // Rendered images from PDF pages
  onGenerateMedia: () => void;
  isGenerating: boolean;
  onUpdateFrame: (id: string, updates: Partial<StoryboardFrame>) => void;
  onExportVideo?: () => void;
  isExporting?: boolean;
  isExportComplete?: boolean;
  onReset?: () => void;
  onRegenerateFrame?: (id: string, type: 'AUDIO' | 'VISUAL') => void;
}

const Storyboard: React.FC<StoryboardProps> = ({ 
    frames, 
    docImages = [],
    onGenerateMedia, 
    isGenerating, 
    onUpdateFrame,
    onExportVideo,
    isExporting,
    isExportComplete,
    onReset,
    onRegenerateFrame
}) => {
  const [activeImageSelector, setActiveImageSelector] = useState<string | null>(null);
  const [dragOverFrameId, setDragOverFrameId] = useState<string | null>(null);

  const completedCount = frames.filter(f => f.visualGenerated && f.audioGenerated).length;
  const progress = Math.round((completedCount / frames.length) * 100);
  const isAllComplete = progress === 100 && frames.length > 0;

  // Calculate total duration
  const totalDuration = frames.reduce((acc, f) => acc + (f.estimatedDuration || 0), 0);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalSeconds = totalDuration % 60;
  const isOverTime = totalDuration > 180; // Changed to 3 minutes (180s)

  const handleSelectDocImage = (frameId: string, imageUrl: string) => {
    onUpdateFrame(frameId, { 
        visualSourceType: 'DOC', 
        visualUrl: imageUrl,
        visualGenerated: true, // Mark as ready immediately since we have the image
        visualType: FrameType.IMAGE // Force type to Image
    });
    setActiveImageSelector(null);
  };

  const processFile = (file: File, frameId: string) => {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                onUpdateFrame(frameId, {
                    visualSourceType: 'UPLOAD',
                    visualUrl: e.target.result as string,
                    visualGenerated: true,
                    visualType: FrameType.IMAGE
                });
            }
        };
        reader.readAsDataURL(file);
    } else {
        alert("이미지 파일만 업로드 가능합니다.");
    }
  };

  const handleDrop = (e: React.DragEvent, frameId: string) => {
    e.preventDefault();
    setDragOverFrameId(null);
    const file = e.dataTransfer.files?.[0];
    if (file) {
        processFile(file, frameId);
    }
  };

  const handlePaste = (e: React.ClipboardEvent, frameId: string) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
                processFile(file, frameId);
                e.preventDefault();
                return;
            }
        }
    }
  };

  const handleDragOver = (e: React.DragEvent, frameId: string) => {
    e.preventDefault();
    if (dragOverFrameId !== frameId) {
        setDragOverFrameId(frameId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
     e.preventDefault();
     setDragOverFrameId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, frameId: string) => {
      if (e.target.files && e.target.files[0]) {
          processFile(e.target.files[0], frameId);
      }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
       <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 sticky top-4 z-10 flex flex-col xl:flex-row justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            2. 스토리보드 ({frames.length}컷)
          </h2>
          <div className="flex items-center gap-3 text-sm">
             <span className={`font-bold px-2 py-0.5 rounded ${isOverTime ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                총 예상 시간: {totalMinutes}분 {totalSeconds}초 
                {isOverTime && ' (⚠️ 3분 초과)'}
             </span>
             <span className="text-slate-400">|</span>
             <span className="text-slate-500">3분 이내 권장</span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 justify-end">
            {isGenerating && (
                <div className="flex flex-col items-end mr-2">
                    <span className="text-xs font-bold text-indigo-600">생성 진행률 {progress}%</span>
                    <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{width: `${progress}%`}}></div>
                    </div>
                </div>
            )}
            
            <button
                onClick={onGenerateMedia}
                disabled={isGenerating || isAllComplete}
                className={`px-5 py-3 rounded-lg font-bold shadow-md transition-all whitespace-nowrap
                    ${isGenerating || isAllComplete
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed hidden xl:block' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg active:scale-95'}`}
            >
                {isGenerating ? '영상 생성 중...' : isAllComplete ? '모든 영상 생성 완료' : '🎬 최종 영상 생성'}
            </button>

            {/* Export & Restart Buttons */}
            {isAllComplete && (
                <div className="flex items-center gap-3 animate-fadeIn">
                     {/* Restart Button */}
                     {onReset && (
                        <button 
                            onClick={onReset}
                            className="px-5 py-3 rounded-lg font-bold text-slate-600 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-800 hover:shadow transition-all whitespace-nowrap"
                        >
                            처음으로
                        </button>
                     )}

                     {/* Export Button */}
                     {onExportVideo && (
                        <button
                            onClick={onExportVideo}
                            disabled={isExporting}
                            className={`px-6 py-3 rounded-lg font-bold shadow-md transition-all whitespace-nowrap flex items-center gap-2
                                ${isExporting
                                ? 'bg-amber-100 text-amber-700 cursor-not-allowed' 
                                : isExportComplete 
                                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                                    : 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-lg active:scale-95'}`}
                        >
                            {isExporting ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    영상 통합 중...
                                </>
                            ) : isExportComplete ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    다운로드 완료
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    최종 영상 다운로드
                                </>
                            )}
                        </button>
                     )}
                </div>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {frames.map((frame, index) => (
          <div key={frame.id} className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden flex flex-col md:flex-row">
            {/* Visual Section */}
            <div className="w-full md:w-5/12 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 relative min-h-[340px] group flex flex-col">
                
                {/* Visual Source Controls */}
                <div className="bg-white px-4 py-2 border-b border-slate-200 flex flex-wrap justify-between items-center z-10 shadow-sm gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase hidden sm:block">Visual Source</span>
                    <div className="flex gap-3 w-full sm:w-auto justify-end">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                                type="radio" 
                                name={`source-${frame.id}`}
                                className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                                checked={frame.visualSourceType === 'AI'}
                                onChange={() => onUpdateFrame(frame.id, { visualSourceType: 'AI' })}
                                disabled={isGenerating}
                            />
                            <span className={`text-xs font-medium ${frame.visualSourceType === 'AI' ? 'text-indigo-700' : 'text-slate-500'}`}>AI 자동생성</span>
                        </label>
                        
                        {/* Only show DOC option if images exist */}
                        {docImages.length > 0 && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name={`source-${frame.id}`}
                                    className="w-3.5 h-3.5 text-green-600 focus:ring-green-500 border-slate-300"
                                    checked={frame.visualSourceType === 'DOC'}
                                    onChange={() => onUpdateFrame(frame.id, { visualSourceType: 'DOC' })}
                                    disabled={isGenerating}
                                />
                                <span className={`text-xs font-medium ${frame.visualSourceType === 'DOC' ? 'text-green-700' : 'text-slate-500'}`}>문서 이미지</span>
                            </label>
                        )}

                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                                type="radio" 
                                name={`source-${frame.id}`}
                                className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500 border-slate-300"
                                checked={frame.visualSourceType === 'UPLOAD'}
                                onChange={() => onUpdateFrame(frame.id, { visualSourceType: 'UPLOAD' })}
                                disabled={isGenerating}
                            />
                            <span className={`text-xs font-medium ${frame.visualSourceType === 'UPLOAD' ? 'text-amber-700' : 'text-slate-500'}`}>직접 업로드</span>
                        </label>
                    </div>
                </div>

                <div className="relative flex-1 bg-slate-200 flex flex-col items-center justify-center p-4">
                    {frame.visualUrl ? (
                        frame.visualType === FrameType.VIDEO ? (
                            <video 
                                key={frame.visualUrl}
                                src={frame.visualUrl} 
                                controls 
                                playsInline
                                className="w-full h-full object-contain max-h-[280px]"
                                poster={PLACEHOLDER_IMAGE}
                            />
                        ) : (
                            <img 
                                src={frame.visualUrl} 
                                alt={`Frame ${index + 1}`} 
                                className="w-full h-full object-contain max-h-[280px] shadow-sm bg-white"
                            />
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-4 w-full h-full">
                            {frame.isGenerating ? (
                                <div className="flex flex-col items-center gap-2 text-indigo-600">
                                    <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-sm font-medium">AI 이미지 생성 중...</span>
                                </div>
                            ) : frame.visualSourceType === 'DOC' ? (
                                <div className="text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-sm">선택된 문서 이미지가 없습니다.</p>
                                    <button 
                                        onClick={() => setActiveImageSelector(frame.id)}
                                        className="mt-3 px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                    >
                                        이미지 선택하기 ({docImages.length})
                                    </button>
                                </div>
                            ) : frame.visualSourceType === 'UPLOAD' ? (
                                <div 
                                    className={`w-full h-full min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all outline-none ${dragOverFrameId === frame.id ? 'border-amber-500 bg-amber-50' : 'border-slate-300 hover:border-amber-400 hover:bg-slate-50'}`}
                                    onDrop={(e) => handleDrop(e, frame.id)}
                                    onDragOver={(e) => handleDragOver(e, frame.id)}
                                    onDragLeave={handleDragLeave}
                                    onPaste={(e) => handlePaste(e, frame.id)}
                                    onClick={() => document.getElementById(`file-${frame.id}`)?.click()}
                                    tabIndex={0} // Make focusable for paste
                                >
                                    <input 
                                        type="file" 
                                        id={`file-${frame.id}`}
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={(e) => handleFileSelect(e, frame.id)}
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 mb-2 transition-colors ${dragOverFrameId === frame.id ? 'text-amber-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <p className="text-sm font-medium text-slate-600">클릭, 드래그 또는 붙여넣기(Ctrl+V)</p>
                                    <p className="text-xs text-slate-400 mt-1">직접 캡처한 이미지를 넣으세요</p>
                                </div>
                            ) : (
                                <div className="text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                    </svg>
                                    <p className="text-sm">AI 생성을 대기 중입니다.</p>
                                    {/* Regenerate Button if failed or empty but not generating */}
                                    {!isGenerating && onRegenerateFrame && (
                                        <button 
                                            onClick={() => onRegenerateFrame(frame.id, 'VISUAL')}
                                            className="mt-3 px-4 py-2 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-200 transition-colors shadow-sm flex items-center gap-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            재생성
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Change/Regenerate Button Overlay */}
                    {!isGenerating && (
                        <div className="absolute top-2 right-2 flex gap-2">
                            {/* Regenerate Button for AI */}
                            {frame.visualSourceType === 'AI' && frame.visualUrl && onRegenerateFrame && (
                                <button 
                                    onClick={() => onRegenerateFrame(frame.id, 'VISUAL')}
                                    className="bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1.5 rounded backdrop-blur-sm flex items-center gap-1"
                                    title="이미지/비디오 재생성"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    재생성
                                </button>
                            )}
                            
                            {/* Change Button for DOC/UPLOAD */}
                            {(frame.visualSourceType === 'DOC' || frame.visualSourceType === 'UPLOAD') && frame.visualUrl && (
                                <button 
                                    onClick={() => frame.visualSourceType === 'DOC' ? setActiveImageSelector(frame.id) : document.getElementById(`file-${frame.id}`)?.click()}
                                    className="bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1.5 rounded backdrop-blur-sm flex items-center gap-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                    </svg>
                                    변경
                                    {frame.visualSourceType === 'UPLOAD' && (
                                        <input 
                                            type="file" 
                                            id={`file-${frame.id}`}
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={(e) => handleFileSelect(e, frame.id)}
                                        />
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        장면 #{index + 1}
                        <span className={`text-xs font-normal px-2 py-0.5 rounded ${frame.estimatedDuration && frame.estimatedDuration > 10 ? 'bg-red-100 text-red-600 font-bold' : 'bg-slate-100 text-slate-400'}`}>
                           ⏱️ 예상 {frame.estimatedDuration}초
                        </span>
                    </h3>
                    {frame.visualSourceType === 'AI' && (
                        <select 
                            disabled={isGenerating || frame.visualGenerated}
                            value={frame.visualType}
                            onChange={(e) => onUpdateFrame(frame.id, { visualType: e.target.value as FrameType })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50 text-slate-600"
                        >
                            <option value={FrameType.IMAGE}>이미지 장면 생성</option>
                            <option value={FrameType.VIDEO}>비디오 장면 생성</option>
                        </select>
                    )}
                </div>

                <div>
                    <div className="flex justify-between items-end mb-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase">내레이션 대본 (Script)</label>
                        <span className="text-[10px] text-slate-400">{frame.script.length}자</span>
                    </div>
                    <textarea 
                        disabled={isGenerating}
                        value={frame.script}
                        onChange={(e) => onUpdateFrame(frame.id, { script: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        rows={3}
                    />
                     {frame.audioGenerated && frame.audioUrl && (
                        <div className="mt-2 bg-indigo-50 p-2 rounded flex items-center gap-3">
                            <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center text-white shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 14H2a1 1 0 01-1-1V7a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <audio controls src={frame.audioUrl} className="w-full h-8" />
                            {!isGenerating && onRegenerateFrame && (
                                <button 
                                    onClick={() => onRegenerateFrame(frame.id, 'AUDIO')}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-colors"
                                    title="오디오 재생성"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Caption Editing Section */}
                <div>
                    <div className="flex justify-between items-end mb-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase">자막 (Caption)</label>
                    </div>
                    <textarea 
                        disabled={isGenerating}
                        value={frame.caption || frame.script} // Fallback to script if caption is undefined
                        onChange={(e) => onUpdateFrame(frame.id, { caption: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        rows={2}
                        placeholder="영상 하단에 표시될 자막을 입력하세요."
                    />
                </div>

                {/* Only show visual prompt if AI mode is selected */}
                {frame.visualSourceType === 'AI' && (
                    <div className="animate-fadeIn">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">시각 프롬프트 (Visual Prompt)</label>
                        <textarea 
                            disabled={isGenerating}
                            value={frame.visualPrompt}
                            onChange={(e) => onUpdateFrame(frame.id, { visualPrompt: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            rows={2}
                        />
                    </div>
                )}

                {/* Info message for DOC mode */}
                {frame.visualSourceType === 'DOC' && (
                     <div className="bg-green-50 p-3 rounded text-xs text-green-800 animate-fadeIn">
                        ℹ️ PDF에서 추출된 실제 이미지를 사용합니다. 좌측 화면에서 이미지를 선택해주세요.
                     </div>
                )}
                
                {frame.error && (
                  <div className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                    Error: {frame.error}
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>

      {/* Image Selection Modal */}
      {activeImageSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">문서 이미지 선택</h3>
                    <button onClick={() => setActiveImageSelector(null)} className="text-slate-400 hover:text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
                    {docImages.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {docImages.map((img, idx) => (
                                <div 
                                    key={idx} 
                                    className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-500 hover:shadow-xl transition-all bg-white"
                                    onClick={() => handleSelectDocImage(activeImageSelector, img)}
                                >
                                    <div className="aspect-video flex items-center justify-center bg-slate-50">
                                        <img src={img} alt={`Extracted ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="text-center py-20 text-slate-500">
                            <div className="bg-slate-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="font-bold text-slate-700">추출된 이미지가 없습니다.</p>
                            <p className="text-sm mt-1">이 PDF 파일에서 이미지 객체를 찾을 수 없습니다.</p>
                         </div>
                    )}
                </div>
                
                <div className="p-4 border-t border-slate-200 text-right bg-white">
                    <button 
                        onClick={() => setActiveImageSelector(null)}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        취소
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Storyboard;