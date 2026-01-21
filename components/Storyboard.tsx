import React from 'react';
import { StoryboardFrame, FrameType } from '../types';
import { PLACEHOLDER_IMAGE } from '../constants';

interface StoryboardProps {
  frames: StoryboardFrame[];
  onGenerateMedia: () => void;
  isGenerating: boolean;
  onUpdateFrame: (id: string, updates: Partial<StoryboardFrame>) => void;
  onExportVideo?: () => void;
  isExporting?: boolean;
  isExportComplete?: boolean;
  onReset?: () => void;
}

const Storyboard: React.FC<StoryboardProps> = ({ 
    frames, 
    onGenerateMedia, 
    isGenerating, 
    onUpdateFrame,
    onExportVideo,
    isExporting,
    isExportComplete,
    onReset
}) => {
  
  const completedCount = frames.filter(f => f.visualGenerated && f.audioGenerated).length;
  const progress = Math.round((completedCount / frames.length) * 100);
  const isAllComplete = progress === 100 && frames.length > 0;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
       <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 sticky top-4 z-10 flex flex-col xl:flex-row justify-between items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            2. 스토리보드 확인 및 생성
          </h2>
          <p className="text-sm text-slate-500">각 장면의 대본과 프롬프트를 확인하세요. '미디어 생성'을 누르면 AI가 콘텐츠를 만듭니다.</p>
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
                {isGenerating ? '개별 미디어 생성 중...' : isAllComplete ? '미디어 생성 완료' : '최종 확인 및 미디어 생성'}
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
                            Restart
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
                                    다운로드 완료 (다시 받기)
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    통합 영상 다운로드
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
            <div className="w-full md:w-5/12 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 relative min-h-[250px] group">
                {frame.visualGenerated && frame.visualUrl ? (
                    frame.visualType === FrameType.VIDEO ? (
                        <video 
                            src={frame.visualUrl} 
                            controls 
                            className="w-full h-full object-cover"
                            poster={PLACEHOLDER_IMAGE}
                        />
                    ) : (
                        <img 
                            src={frame.visualUrl} 
                            alt={`Frame ${index + 1}`} 
                            className="w-full h-full object-cover"
                        />
                    )
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white p-4 text-center">
                        {frame.isGenerating ? (
                             <div className="flex flex-col items-center gap-2">
                                <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm">미디어 생성 중...</span>
                             </div>
                        ) : (
                            <div className="opacity-50">
                                <p className="font-bold text-lg mb-1">Scene #{index + 1}</p>
                                <p className="text-xs text-slate-300">{frame.visualType} Preview Area</p>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Type Badge */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm uppercase font-bold">
                    {frame.visualType}
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-slate-800">장면 #{index + 1}</h3>
                    <select 
                        disabled={isGenerating || frame.visualGenerated}
                        value={frame.visualType}
                        onChange={(e) => onUpdateFrame(frame.id, { visualType: e.target.value as FrameType })}
                        className="text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50 text-slate-600"
                    >
                        <option value={FrameType.IMAGE}>이미지</option>
                        <option value={FrameType.VIDEO}>비디오 (Veo)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">내레이션 대본 (Script)</label>
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
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">시각 프롬프트 (Visual Prompt)</label>
                    <textarea 
                         disabled={isGenerating}
                        value={frame.visualPrompt}
                        onChange={(e) => onUpdateFrame(frame.id, { visualPrompt: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                        rows={2}
                    />
                </div>
                
                {frame.error && (
                  <div className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                    Error: {frame.error}
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Storyboard;