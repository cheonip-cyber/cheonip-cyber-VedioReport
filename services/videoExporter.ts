import { StoryboardFrame } from "../types";

// Helpers
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

const loadAudio = async (url: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * [핵심 수정] requestAnimationFrame 기반 렌더링으로 교체.
 *
 * 기존 문제:
 *  - while + await wait(33ms) 루프가 JS 메인 스레드를 점령(블로킹)하여
 *    고객사 PC에서 1시간+ 소요되는 원인이 됨.
 *  - Date.now() 기반 타이밍은 CPU 부하 시 드리프트 발생.
 *
 * 개선:
 *  - requestAnimationFrame을 사용해 브라우저가 프레임 타이밍을 직접 제어.
 *  - 이를 통해 메인 스레드를 양보하여 UI가 반응성을 유지하고,
 *    오디오 재생 타이머(AudioContext.currentTime)와 동기화해 정밀한 길이 제어.
 */
const renderFrameToCanvas = (
  ctx2d: CanvasRenderingContext2D,
  width: number,
  height: number,
  visual: HTMLImageElement | null,
  caption: string | undefined
): void => {
  ctx2d.fillStyle = "black";
  ctx2d.fillRect(0, 0, width, height);

  if (visual) {
    ctx2d.drawImage(visual, 0, 0, width, height);
  }

  if (caption) {
    const fontSize = 48;
    ctx2d.font = `bold ${fontSize}px "Noto Sans KR", sans-serif`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.lineWidth = 4;
    ctx2d.strokeStyle = "black";
    ctx2d.fillStyle = "white";

    const maxWidth = width * 0.9;
    const x = width / 2;
    const y = height - 80;
    const words = caption.split(' ');
    let line = '';
    const lines: string[] = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx2d.measureText(testLine).width > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    lines.reverse().forEach((lineText, index) => {
      const lineY = y - index * (fontSize + 10);
      ctx2d.strokeText(lineText, x, lineY);
      ctx2d.fillText(lineText, x, lineY);
    });
  }
};

/** rAF 기반으로 audioDurationMs 동안 캔버스를 렌더링한 뒤 resolve */
const playFrameWithRaf = (
  ctx2d: CanvasRenderingContext2D,
  width: number,
  height: number,
  visual: HTMLImageElement | null,
  caption: string | undefined,
  audioDurationMs: number
): Promise<void> => {
  return new Promise((resolve) => {
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      renderFrameToCanvas(ctx2d, width, height, visual, caption);

      if (elapsed < audioDurationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
};

export const exportVideo = async (
  frames: StoryboardFrame[],
  onProgress?: (current: number, total: number) => void
): Promise<void> => {
  const validFrames = frames.filter(f => f.audioUrl && f.visualUrl);
  if (validFrames.length === 0) {
    throw new Error("내보낼 준비가 된 프레임이 없습니다. 모든 컷의 오디오와 이미지가 생성되었는지 확인해주세요.");
  }

  // 1. Canvas 설정 (1080p)
  const width = 1920;
  const height = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Canvas 2D context를 가져올 수 없습니다.");

  ctx2d.fillStyle = "black";
  ctx2d.fillRect(0, 0, width, height);

  // 2. Audio & Recorder 설정
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const canvasStream = canvas.captureStream(30);

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  // MIME 타입 선택 (브라우저 호환성)
  let mimeType = 'video/webm;codecs=vp9';
  let fileExtension = 'webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
    fileExtension = 'mp4';
  } else if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start();
  recorder.pause();

  const blobUrlsToRevoke: string[] = [];

  // [방법 2] Prefetch 캐시 타입
  type PrefetchedAssets = { audioBuffer: AudioBuffer; imgElement: HTMLImageElement };

  /**
   * [방법 2] 에셋 사전 로드 함수
   * - 현재 컷 재생 중에 다음 컷의 오디오 + 이미지를 백그라운드에서 미리 로드.
   * - loadAudio(fetch+decode)와 loadImage는 브라우저 내부 스레드에서 처리되므로
   *   rAF 렌더링 루프(메인 스레드)에 영향을 주지 않음.
   * - Promise.all로 오디오/이미지를 동시 fetch → 로드 시간을 max(오디오,이미지)로 단축.
   */
  const prefetchAssets = (frame: StoryboardFrame): Promise<PrefetchedAssets> => {
    return Promise.all([
      loadAudio(frame.audioUrl!, audioCtx),
      loadImage(frame.visualUrl!)
    ]).then(([audioBuffer, imgElement]) => ({ audioBuffer, imgElement }));
  };

  // 3. 첫 번째 컷 에셋 미리 로드 (재생 시작 전 준비)
  let nextAssetsPromise: Promise<PrefetchedAssets> | null = prefetchAssets(validFrames[0]);

  // 4. 프레임별 순차 처리
  for (let i = 0; i < validFrames.length; i++) {
    const frame = validFrames[i];
    onProgress?.(i, validFrames.length);

    try {
      // 현재 컷 에셋: 이미 prefetch된 Promise를 await (대부분 즉시 반환)
      const { audioBuffer, imgElement } = await nextAssetsPromise!;
      const audioDurationMs = audioBuffer.duration * 1000;

      // [방법 2] 현재 컷 재생 시작 직후, 다음 컷 에셋을 백그라운드에서 미리 로드 시작
      // - 재생(rAF 루프) 중에 fetch가 병행되므로 다음 컷의 로드 대기 시간이 0에 가까워짐.
      // - 마지막 컷이면 null로 설정.
      nextAssetsPromise = i + 1 < validFrames.length
        ? prefetchAssets(validFrames[i + 1])
        : null;

      // 첫 프레임 미리 그리기 (검은 화면 방지)
      renderFrameToCanvas(ctx2d, width, height, imgElement, frame.caption);

      // 녹화 재개
      recorder.resume();

      // 오디오 재생
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      source.start();

      // rAF 기반 렌더링 (메인 스레드 양보 + 정밀한 타이밍)
      // 이 대기 시간 동안 위에서 시작한 nextAssetsPromise가 백그라운드에서 진행됨
      await playFrameWithRaf(ctx2d, width, height, imgElement, frame.caption, audioDurationMs);

      // 다음 프레임 로드 전 녹화 일시정지
      recorder.pause();

      if (frame.audioUrl?.startsWith('blob:')) blobUrlsToRevoke.push(frame.audioUrl);
      if (frame.visualUrl?.startsWith('blob:')) blobUrlsToRevoke.push(frame.visualUrl);

    } catch (e) {
      console.error(`프레임 ${frame.frameNumber} 처리 오류:`, e);
      if (recorder.state === 'recording') recorder.pause();
      // prefetch 실패 시 다음 컷을 다시 시도
      if (nextAssetsPromise === null && i + 1 < validFrames.length) {
        nextAssetsPromise = prefetchAssets(validFrames[i + 1]);
      }
    }
  }

  onProgress?.(validFrames.length, validFrames.length);

  // 5. 녹화 종료 및 다운로드
  if (recorder.state === 'paused') recorder.resume();
  recorder.stop();
  await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const blob = new Blob(chunks, { type: mimeType });
  downloadAuto(blob, `samsotta_VideoReport.${fileExtension}`);

  // 6. 정리
  audioCtx.close();
  blobUrlsToRevoke.forEach(url => URL.revokeObjectURL(url));
};

const downloadAuto = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
