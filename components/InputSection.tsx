import React, { useState, useRef, ChangeEvent } from 'react';
import mammoth from 'mammoth';

interface InputSectionProps {
  onPlanGenerate: (text: string, file?: { mimeType: string, data: string }) => void;
  isLoading: boolean;
}

const InputSection: React.FC<InputSectionProps> = ({ onPlanGenerate, isLoading }) => {
  const [text, setText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; mimeType: string; data: string } | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessingFile(true);
    try {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = (reader.result as string).split(',')[1];
          setAttachedFile({
            name: file.name,
            mimeType: 'application/pdf',
            data: base64String
          });
          setIsProcessingFile(false);
        };
        reader.readAsDataURL(file);
      } else if (file.name.endsWith('.docx')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            setText((prev) => (prev ? prev + '\n\n' : '') + result.value);
            setAttachedFile(null);
          } catch (err) {
            console.error("Word parse error", err);
            alert("Word 파일 변환 중 오류가 발생했습니다.");
          } finally {
            setIsProcessingFile(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setText((prev) => (prev ? prev + '\n\n' : '') + content);
          setAttachedFile(null);
          setIsProcessingFile(false);
        };
        reader.readAsText(file);
      } else {
        alert("지원되지 않는 파일 형식입니다. (PDF, Word, Text 파일만 가능)");
        setIsProcessingFile(false);
      }
    } catch (error) {
      console.error(error);
      setIsProcessingFile(false);
    }
  };

  const removeAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isUploadActive = isDragging;
  const uploadZoneClass = isUploadActive
    ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01] shadow-inner'
    : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50 hover:shadow-md';

  const isButtonDisabled = (!text.trim() && !attachedFile) || isLoading || isProcessingFile;
  const buttonClass = isButtonDisabled
    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0';

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Hero Header */}
      <div className="text-center mb-12 animate-fadeIn">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
            AI SAM VideoReport
          </span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          복잡한 교육 자료를 업로드하세요. <br className="hidden md:block"/>
          AI가 분석하여 <strong>대본, 이미지, 영상, 음성</strong>이 포함된 <br className="md:hidden"/>완벽한 비디오 리포트를 생성합니다.
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 overflow-hidden transition-all hover:shadow-indigo-500/10">
        {/* Decorative Top Border */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

        <div className="p-8 md:p-10">
            <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                     </svg>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">1. 자료 분석 및 기획</h2>
                    <p className="text-sm text-slate-500">AI가 문서를 분석하여 스토리보드를 설계합니다.</p>
                </div>
            </div>

            {/* File Upload Zone */}
            <div 
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ease-in-out cursor-pointer group mb-8 ${uploadZoneClass}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept=".pdf,.docx,.txt,.md"
                    onChange={handleFileSelect}
                />
                
                {isProcessingFile ? (
                    <div className="flex flex-col items-center justify-center gap-4 text-indigo-600 py-4">
                        <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="font-semibold animate-pulse">파일 내용을 읽는 중입니다...</span>
                    </div>
                ) : attachedFile ? (
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-white border border-indigo-100 shadow-sm px-6 py-4 rounded-xl flex items-center gap-4">
                            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-slate-800">{attachedFile.name}</p>
                                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    업로드 완료
                                </p>
                            </div>
                            <button onClick={removeAttachment} className="ml-4 p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-500 py-4">
                        <div className="mb-4 inline-flex items-center justify-center h-16 w-16 rounded-full bg-slate-50 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all duration-300">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <p className="text-lg font-medium text-slate-700 mb-1">파일을 여기에 드래그하거나 클릭하세요</p>
                        <p className="text-sm text-slate-400">지원 형식: PDF, DOCX, TXT, MD</p>
                    </div>
                )}
            </div>

            {/* Text Area */}
            <div className="relative group">
                <label className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold text-slate-500 uppercase tracking-wide group-focus-within:text-indigo-600 transition-colors">
                    직접 입력 또는 추가 지시사항
                </label>
                <textarea
                    className="w-full h-40 p-5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none resize-none text-slate-700 leading-relaxed placeholder-slate-400 shadow-sm"
                    placeholder={attachedFile ? "파일이 첨부되었습니다. AI에게 추가로 지시할 사항이 있다면 입력하세요 (예: '챕터 2 내용을 중심으로 요약해줘')." : "위에 파일을 업로드 하거나, 이곳에 분석할 텍스트를 직접 붙여 넣으세요."}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={isLoading}
                ></textarea>
            </div>
            
            {/* Generate Button */}
            <div className="mt-8">
                <button
                onClick={() => onPlanGenerate(text, attachedFile ? { mimeType: attachedFile.mimeType, data: attachedFile.data } : undefined)}
                disabled={isButtonDisabled}
                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform flex items-center justify-center gap-3 ${buttonClass}`}
                >
                {isLoading ? (
                    <>
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>분석 및 스토리보드 생성 중...</span>
                    </>
                ) : (
                    <>
                    <span>스토리보드 생성 시작</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    </>
                )}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default InputSection;