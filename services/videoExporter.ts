import { StoryboardFrame, FrameType } from "../types";

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const exportVideo = async (frames: StoryboardFrame[]): Promise<void> => {
  if (frames.length === 0) return;

  // 1. Setup Canvas (720p)
  const width = 1280;
  const height = 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  
  // Fill black background initially
  if (ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Setup Audio & Recorder
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const canvasStream = canvas.captureStream(30); // 30 FPS
  
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'; // Fallback
  }

  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  // 3. Process Frames Sequentially
  for (const frame of frames) {
    if (!frame.audioUrl || !frame.visualUrl) continue;

    try {
      const audioBuffer = await loadAudio(frame.audioUrl, audioCtx);
      const audioDurationMs = audioBuffer.duration * 1000;

      // Play Audio
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      source.start();

      // Render Visuals
      if (frame.visualType === FrameType.IMAGE) {
        const img = await loadImage(frame.visualUrl);
        // Center image with "contain" fit
        if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
            
            // Simple cover/contain logic (here we force stretch or use 16:9 aspect)
            // Since we generated 16:9 images, drawImage covers well.
            ctx.drawImage(img, 0, 0, width, height);
        }
        await wait(audioDurationMs);

      } else {
        // VIDEO Handling
        const video = document.createElement("video");
        video.src = frame.visualUrl;
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.loop = true; // Loop video if audio is longer
        
        await video.play();

        const startTime = Date.now();
        while (Date.now() - startTime < audioDurationMs) {
          if (ctx) ctx.drawImage(video, 0, 0, width, height);
          await wait(1000 / 30); // ~30 FPS draw loop
        }
        video.pause();
        video.remove();
      }
      
      // Small buffer between slides? Optional.
      await wait(100);

    } catch (e) {
      console.error(`Error processing frame ${frame.frameNumber}`, e);
    }
  }

  // 4. Stop and Download
  recorder.stop();
  await new Promise((resolve) => (recorder.onstop = resolve));

  const blob = new Blob(chunks, { type: "video/webm" });

  const fileName = 'samsotta_VideoReport.webm';

  // 5. Save File (Supports Folder Selection via API if available)
  if ('showSaveFilePicker' in window) {
    try {
        const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
                description: 'WebM Video',
                accept: { 'video/webm': ['.webm'] },
            }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (err: any) {
        if (err.name !== 'AbortError') {
            console.error('File save failed', err);
            // Fallback to auto download if picker fails but not cancelled
            downloadAuto(blob, fileName);
        }
    }
  } else {
    // Fallback for browsers without File System Access API
    downloadAuto(blob, fileName);
  }

  // Cleanup
  audioCtx.close();
};

const downloadAuto = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};