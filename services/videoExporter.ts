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

  // 1. Setup Canvas (1080p)
  const width = 1920;
  const height = 1080;
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
  let fileExtension = 'webm';

  if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      fileExtension = 'mp4';
  } else if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'; // Fallback
  }

  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();
  // Pause immediately to avoid recording black frames while loading assets
  recorder.pause();

  // 3. Process Frames Sequentially
  for (const frame of frames) {
    if (!frame.audioUrl || !frame.visualUrl) continue;

    try {
      // Load assets while recorder is PAUSED
      const audioBuffer = await loadAudio(frame.audioUrl, audioCtx);
      const audioDurationMs = audioBuffer.duration * 1000;

      let videoElement: HTMLVideoElement | null = null;
      let imgElement: HTMLImageElement | null = null;

      if (frame.visualType === FrameType.IMAGE) {
          imgElement = await loadImage(frame.visualUrl);
      } else {
          videoElement = document.createElement("video");
          videoElement.src = frame.visualUrl;
          videoElement.crossOrigin = "anonymous";
          videoElement.muted = true;
          videoElement.loop = true;
          // Wait for video to be ready
          await new Promise((resolve, reject) => {
              if (!videoElement) return reject();
              videoElement.onloadeddata = () => resolve(true);
              videoElement.onerror = reject;
          });
      }

      // Draw initial visual state to canvas BEFORE resuming
      if (ctx) {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, width, height);
          
          if (imgElement) {
              ctx.drawImage(imgElement, 0, 0, width, height);
          } else if (videoElement) {
              ctx.drawImage(videoElement, 0, 0, width, height);
          }
      }

      // Resume recorder now that visual is ready
      recorder.resume();

      // Play Audio
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      source.start();

      if (videoElement) {
          await videoElement.play();
      }

      const startTime = Date.now();
      
      // Animation Loop
      while (Date.now() - startTime < audioDurationMs) {
        if (ctx) {
            // Clear and redraw visual
            if (videoElement) {
                ctx.drawImage(videoElement, 0, 0, width, height);
            } else if (imgElement) {
                ctx.drawImage(imgElement, 0, 0, width, height);
            }

            // Draw Caption
            if (frame.caption) {
                const fontSize = 48;
                ctx.font = `bold ${fontSize}px "Noto Sans KR", sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                
                // Text Shadow / Outline
                ctx.lineWidth = 4;
                ctx.strokeStyle = "black";
                ctx.fillStyle = "white";

                const text = frame.caption;
                const maxWidth = width * 0.9;
                const x = width / 2;
                const y = height - 80;

                // Simple word wrap
                const words = frame.caption.split(' ');
                let line = '';
                const lines = [];

                for(let n = 0; n < words.length; n++) {
                  const testLine = line + words[n] + ' ';
                  const metrics = ctx.measureText(testLine);
                  const testWidth = metrics.width;
                  if (testWidth > maxWidth && n > 0) {
                    lines.push(line);
                    line = words[n] + ' ';
                  } else {
                    line = testLine;
                  }
                }
                lines.push(line);

                // Draw lines bottom-up
                lines.reverse().forEach((lineText, index) => {
                    const lineY = y - (index * (fontSize + 10));
                    ctx.strokeText(lineText, x, lineY);
                    ctx.fillText(lineText, x, lineY);
                });
            }
        }
        await wait(1000 / 30); // ~30 FPS
      }

      if (videoElement) {
          videoElement.pause();
          videoElement.remove();
      }
      
      // Pause recorder again while loading next frame
      recorder.pause();

    } catch (e) {
      console.error(`Error processing frame ${frame.frameNumber}`, e);
    }
  }

  // 4. Stop and Download
  if (recorder.state === 'paused') recorder.resume(); // Ensure we are active to stop
  recorder.stop();
  await new Promise((resolve) => (recorder.onstop = resolve));

  const blob = new Blob(chunks, { type: mimeType });
  const fileName = `samsotta_VideoReport.${fileExtension}`;

  // 5. Save File
  downloadAuto(blob, fileName);

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