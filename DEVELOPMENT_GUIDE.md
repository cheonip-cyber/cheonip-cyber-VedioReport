# KHNP AI VideoReport — 코드 구조 분석 & 개발 프롬프트 가이드

## 1. 프로젝트 아키텍처 개요

```
cheonip-cyber-VedioReport/
├── types.ts               # 전역 타입 정의
├── constants.ts           # AI 모델명, 시스템 프롬프트 상수
├── App.tsx                # 앱 오케스트레이터 (상태 관리 + 흐름 제어)
├── index.tsx / index.css  # 진입점
├── components/
│   ├── InputSection.tsx   # Step 1: 문서 업로드 + 텍스트 입력 UI
│   └── Storyboard.tsx     # Step 2~4: 스토리보드 검토 / 생성 / 완료 UI
└── services/
    ├── gemini.ts          # Gemini API 호출 (플래닝·이미지·TTS)
    ├── audioUtils.ts      # PCM 디코딩, WAV 변환, 피크 정규화
    ├── pdfUtils.ts        # PDF → 이미지 추출 (pdf.js)
    └── videoExporter.ts   # Canvas + MediaRecorder 영상 합성
```

---

## 2. 데이터 흐름

```
[사용자 파일/텍스트]
       ↓
InputSection.tsx  →  onPlanGenerate(text, fileData, originalFile)
       ↓
App.tsx::handlePlanGenerate
  ├─ extractImagesFromPdf()    → docImages[] (PDF 내 이미지 저장)
  └─ generateStoryPlan()       → PlanResponseItem[]
       ↓
StoryboardFrame[] 생성 (id, script, visualPrompt, ...)
       ↓
Storyboard.tsx (REVIEW 단계 — 사용자가 편집 가능)
       ↓
App.tsx::handleGenerateMedia
  ├─ generateFrameAudio(script)   → audioUrl (Blob URL)
  └─ generateFrameImage(prompt)   → visualUrl (base64 data URI)
       ↓
Storyboard.tsx (COMPLETED 단계)
       ↓
App.tsx::handleExportVideo
  └─ exportVideo(frames)   → MP4/WebM 다운로드
```

---

## 3. 핵심 타입 구조 (`types.ts`)

```typescript
StoryboardFrame {
  id: string                          // crypto.randomUUID()
  frameNumber: number
  script: string                      // 내레이션 대본
  visualPrompt: string               // 이미지 생성 프롬프트 (한국어)
  visualType: 'IMAGE'
  visualSourceType: 'AI' | 'DOC' | 'UPLOAD'  // 이미지 출처
  audioGenerated: boolean
  visualGenerated: boolean
  audioUrl?: string                   // Blob URL
  visualUrl?: string                  // Blob URL 또는 base64 data URI
  isGenerating: boolean
  estimatedDuration?: number         // 초 단위 (script.length / 4, 최소 3)
  error?: string
  caption?: string                   // 영상 자막
}

GenerationStep = 'INPUT' | 'PLANNING' | 'REVIEW' | 'GENERATING' | 'COMPLETED'
```

---

## 4. 단계별 개발 프롬프트

새 기능을 추가할 때 AI에게 전달할 프롬프트 템플릿입니다.
각 섹션 상단의 **"[프롬프트]"** 블록을 그대로 복사해 사용하세요.

---

### 4-1. 새로운 Gemini API 서비스 함수 추가

**[프롬프트]**
```
이 프로젝트는 React + TypeScript + Vite 기반이며, Gemini API는 services/gemini.ts에 집중되어 있습니다.
getClient() 함수로 GoogleGenAI 인스턴스를 가져오고, 모델명은 constants.ts에 상수로 분리합니다.

다음 함수를 services/gemini.ts에 추가해 주세요:
- 함수명: generate<기능명>
- 역할: <기능 설명>
- 입력: <파라미터>
- 출력: Promise<<반환 타입>>
- 사용할 모델: constants.ts의 <MODEL_*> 상수

규칙:
1. getClient()로 ai 인스턴스 생성
2. 모델명은 상수 참조 (문자열 직접 사용 금지)
3. 실패 시 명확한 Error 메시지 throw
4. 반환 타입 인터페이스를 types.ts에 추가
```

**패턴 예시 (gemini.ts):**
```typescript
// 1. constants.ts에 모델 상수 추가
export const MODEL_XXX = 'gemini-x-xxx';

// 2. types.ts에 반환 타입 추가
export interface XxxResponseItem { field: string; }

// 3. gemini.ts에 함수 추가
export const generateXxx = async (input: string): Promise<XxxResponseItem[]> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL_XXX,
    contents: { parts: [{ text: input }] },
    config: { responseMimeType: "application/json", responseSchema: { ... } }
  });
  if (response.text) return JSON.parse(response.text);
  throw new Error("Failed to generate xxx");
};
```

---

### 4-2. StoryboardFrame에 새 필드 추가

**[프롬프트]**
```
types.ts의 StoryboardFrame 인터페이스에 새 필드를 추가하고,
관련 코드를 모두 업데이트해 주세요.

추가할 필드:
- 필드명: <fieldName>
- 타입: <타입>
- 선택/필수: optional(?)
- 초기값: <값>

업데이트가 필요한 위치:
1. types.ts — 인터페이스에 필드 추가
2. App.tsx — handlePlanGenerate() 내 newFrames 생성 시 초기값 설정
3. App.tsx — handleUpdateFrame()에서 해당 필드 변경 시 파생값 재계산 필요 여부 확인
4. Storyboard.tsx — 해당 필드를 표시하거나 편집하는 UI 추가
5. videoExporter.ts — 영상 합성 시 해당 필드를 활용하는 경우 반영
```

**패턴 예시:**
```typescript
// types.ts
export interface StoryboardFrame {
  // ... 기존 필드 ...
  newField?: string;  // 추가
}

// App.tsx — handlePlanGenerate 내
const newFrames: StoryboardFrame[] = planItems.map((item, index) => ({
  // ... 기존 필드 ...
  newField: undefined,  // 초기값
}));

// App.tsx — handleUpdateFrame 내 (파생값이 있을 경우)
if (updates.newField !== undefined) {
  updatedFrame.derivedField = compute(updates.newField);
}
```

---

### 4-3. GenerationStep 단계 추가

**[프롬프트]**
```
types.ts의 GenerationStep 타입에 새 단계를 추가하고,
App.tsx의 JSX 분기와 흐름 제어 함수를 수정해 주세요.

추가할 단계: '<NEW_STEP>'
이 단계에서 표시할 컴포넌트: <ComponentName>
이전 단계: <PREV_STEP>
다음 단계: <NEXT_STEP>
이 단계로 전환하는 트리거: <트리거 설명>

규칙:
1. types.ts — GenerationStep 유니온 타입에 추가
2. App.tsx — setStep('<NEW_STEP>')을 호출하는 핸들러 추가
3. App.tsx — JSX에서 step === '<NEW_STEP>' 분기 추가
4. 새 컴포넌트가 필요하면 components/<ComponentName>.tsx 생성
```

**패턴 예시:**
```typescript
// types.ts
export type GenerationStep = 'INPUT' | 'PLANNING' | 'REVIEW' | 'NEW_STEP' | 'GENERATING' | 'COMPLETED';

// App.tsx — 핸들러
const handleGoToNewStep = () => {
  setStep('NEW_STEP');
};

// App.tsx — JSX
{step === 'NEW_STEP' && (
  <NewStepComponent onNext={handleNextAction} onBack={() => setStep('REVIEW')} />
)}
```

---

### 4-4. 새 UI 컴포넌트 추가 (Storyboard 패턴)

**[프롬프트]**
```
components/ 디렉터리에 새 컴포넌트를 추가해 주세요.
기존 Storyboard.tsx 및 InputSection.tsx의 스타일 패턴을 따릅니다.

컴포넌트명: <ComponentName>
역할: <역할 설명>

Props 인터페이스:
- <propName>: <타입> — <설명>

규칙:
1. React.FC<PropsInterface> 형태로 작성
2. Tailwind CSS 클래스 사용 (인라인 style 최소화)
3. 상태(useState)는 컴포넌트 내부에서 관리, 상위로 올릴 상태만 Props로 전달
4. 비동기 작업은 App.tsx 핸들러에서 처리하고 컴포넌트는 콜백만 호출
5. isGenerating/isLoading 상태에 따른 UI 피드백(스피너, disabled) 반드시 구현
6. 에러 상태(error?: string)는 프레임 카드 하단에 빨간 텍스트로 표시
```

**Props 패턴:**
```typescript
interface ComponentNameProps {
  data: StoryboardFrame[];
  isLoading: boolean;
  onAction: (id: string, value: string) => void;
  onComplete: () => void;
}

const ComponentName: React.FC<ComponentNameProps> = ({ data, isLoading, onAction, onComplete }) => {
  const [localState, setLocalState] = useState(false);
  // ...
};
export default ComponentName;
```

---

### 4-5. 비동기 생성 + 재시도 로직 추가

**[프롬프트]**
```
App.tsx의 generateWithRetry 패턴을 활용하여,
새로운 생성 작업에 API 429(Rate Limit) 자동 재시도 로직을 적용해 주세요.

생성 작업: <작업 설명>
업데이트 대상 상태: <상태명>
상태 업데이트 함수: updateFrameState(id, { ... })

구현 위치: handleGenerateMedia() 내 tasks 배열에 추가하거나,
           handleRegenerateFrame()에 새 타입으로 분기 추가

규칙:
1. generateWithRetry(() => task(), statusCallback) 래퍼 사용
2. 성공 시 updateFrameState(id, { generated: true, url, error: undefined })
3. 실패 시 Error를 상위로 throw (Promise.allSettled가 캐치)
4. isGenerating 플래그를 try/finally로 반드시 해제
```

**패턴 예시:**
```typescript
// handleGenerateMedia 내 tasks 배열에 추가
if (!frame.xxxGenerated) {
  tasks.push(
    generateWithRetry(
      async () => {
        const result = await generateXxx(frame.input);
        updateFrameState(id, { xxxUrl: result, xxxGenerated: true, error: undefined });
      },
      (status) => updateFrameState(id, { error: status })
    )
  );
}

// handleRegenerateFrame 내 분기 추가
if (type === 'XXX') {
  const result = await generateXxx(frame.input);
  handleUpdateFrame(id, { xxxUrl: result, xxxGenerated: true, isGenerating: false });
}
```

---

### 4-6. 오디오 처리 파이프라인 수정

**[프롬프트]**
```
services/audioUtils.ts와 services/gemini.ts의 generateFrameAudio를 수정해 주세요.

수정 내용: <수정 사항>

반드시 지켜야 할 규칙:
1. AudioContext 싱글턴(getAudioContext()) 유지 — 컷마다 새로 생성하면 볼륨 불일치 발생
2. 모든 오디오는 normalizeAudioBuffer(buffer, 0.95) 정규화 후 출력
3. TTS 응답은 base64 PCM → decode() → decodeAudioData() → normalizeAudioBuffer() → audioBufferToWav() → Blob URL 순으로 처리
4. 24000 Hz, 1채널(모노) 가정
5. videoExporter.ts의 loadAudio()에서도 같은 정규화 적용 확인
```

---

### 4-7. 영상 내보내기 수정

**[프롬프트]**
```
services/videoExporter.ts의 exportVideo 함수를 수정해 주세요.

수정 내용: <수정 사항>

반드시 지켜야 할 규칙:
1. Canvas 해상도 1920×1080 유지
2. MediaRecorder MIME 우선순위 유지:
   video/mp4;codecs=avc1,mp4a.40.2 → H.264+AAC mp4 (Windows 호환)
   → video/mp4;codecs=avc1.42E01E,mp4a.40.2
   → video/webm;codecs=vp9,opus
   → video/webm;codecs=vp8,opus
   → video/webm
3. requestAnimationFrame 기반 렌더링(playFrameWithRaf) 유지 — while+sleep 금지
4. 컷 간 묵음 간격: audioCtx.currentTime + 0.4초 예약 재생 (i>0일 때)
5. 에셋 prefetch(prefetchAssets) 패턴 유지로 다음 컷 미리 로드
6. onProgress?(current, total) 콜백으로 진행률 보고
```

---

### 4-8. 시스템 프롬프트(AI 지시) 수정

**[프롬프트]**
```
constants.ts의 SYSTEM_INSTRUCTION_PLANNER를 수정해 주세요.

수정 내용: <수정 사항>

반드시 지켜야 할 규칙:
1. 4가지 핵심 구조 유지:
   사건개요 → 원인/취약점 → 결과/조치 → 교훈
2. 프레임 수: 최소 10개 이상
3. 총 러닝타임: 180초 이내
4. 컷당 최대 10초 (약 30~40자 이내)
5. visualPrompt는 한국어로 작성 (한국 산업 현장 특화)
6. 'KHNP' 표기 강제 규칙 유지
7. JSON 응답 형식 유지 (responseMimeType: "application/json")
```

---

## 5. 자주 하는 실수 & 주의사항

| 실수 | 올바른 방법 |
|------|------------|
| `new AudioContext()` 매 호출 | `getAudioContext()` 싱글턴 사용 |
| `frames`를 클로저로 읽음 | `framesRef.current`로 최신값 참조 |
| 생성 루프 도중 취소 불가 | `cancelGenerationRef.current` 플래그 체크 |
| 모델명 문자열 직접 사용 | `constants.ts` 상수 참조 |
| 오디오 정규화 생략 | `normalizeAudioBuffer(buf, 0.95)` 항상 적용 |
| `while + sleep` 렌더링 | `requestAnimationFrame` 기반 `playFrameWithRaf` |
| `git add -A` 사용 | 파일명 명시해서 add |

---

## 6. 브랜치 & 커밋 규칙

- **개발 브랜치**: `claude/code-structure-prompts-DvvUv`
- **커밋 메시지 패턴**: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:` 접두어 사용
- **푸시**: `git push -u origin <branch-name>`

---

## 7. 환경 변수

| 변수 | 용도 |
|------|------|
| `GEMINI_API_KEY` 또는 `API_KEY` | Gemini API 키 |
| `IS_DEMO_MODE` (코드 내 상수) | `true` 시 컷 50%만 표시 (테스트용) |

- `.env.example` 참고
- AI Studio 환경: `window.aistudio.hasSelectedApiKey()` / `openSelectKey()` 사용
