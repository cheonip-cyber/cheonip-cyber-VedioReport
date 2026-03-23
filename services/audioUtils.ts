export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * [원인 3 수정] 피크 정규화 (Peak Normalization)
 * TTS API는 컷마다 다른 볼륨으로 오디오를 생성하는 변동성이 있음.
 * 이 함수는 각 컷의 오디오에서 가장 큰 샘플값(피크)을 찾아
 * 모든 샘플을 targetPeak 기준으로 스케일링하여 볼륨을 통일함.
 *
 * 예: 피크가 0.5인 조용한 컷 → 모든 샘플을 1.9배 증폭 → 피크 0.95
 *     피크가 0.9인 큰 컷    → 모든 샘플을 1.05배 증폭 → 피크 0.95
 *
 * @param buffer 정규화할 AudioBuffer
 * @param targetPeak 목표 피크값 (0.0~1.0, 기본 0.95 — 클리핑 방지를 위해 1.0 미만 권장)
 */
export function normalizeAudioBuffer(buffer: AudioBuffer, targetPeak: number = 0.95): AudioBuffer {
  let maxPeak = 0;

  // 1단계: 전체 샘플에서 최대 절댓값(피크) 탐색
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  // 피크가 너무 작으면(무음에 가까운 경우) 정규화 생략 — 0으로 나누기 방지
  if (maxPeak < 0.0001) return buffer;

  // 2단계: 목표 피크에 맞게 모든 샘플 스케일링
  const gain = targetPeak / maxPeak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = Math.max(-1, Math.min(1, channelData[i] * gain));
    }
  }

  return buffer;
}

/**
 * [버그 수정] 기존 코드는 pos 변수를 WAV 헤더 쓰기 offset과 샘플 인덱스로 혼용하여
 * WAV 데이터 영역 쓰기가 잘못된 위치에서 시작되는 버그가 있었음.
 * 수정: 헤더 쓰기(pos)와 샘플 데이터 쓰기(sampleIndex / byteOffset)를 완전히 분리.
 */
export async function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
  const numOfChan = buffer.numberOfChannels;
  const numSamples = buffer.length; // 채널당 샘플 수
  const dataByteLength = numSamples * numOfChan * 2; // 16-bit = 2 bytes/sample
  const totalLength = 44 + dataByteLength;
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // --- WAV 헤더 쓰기 (pos: 헤더 전용 포인터) ---
  let pos = 0;
  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); // "RIFF"
  setUint32(totalLength - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * numOfChan * 2);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(dataByteLength);

  // --- PCM 샘플 데이터 쓰기 (byteOffset: 데이터 전용, 항상 44부터 시작) ---
  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let byteOffset = 44;
  for (let sampleIndex = 0; sampleIndex < numSamples; sampleIndex++) {
    for (let ch = 0; ch < numOfChan; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][sampleIndex]));
      const pcm = (s < 0 ? s * 32768 : s * 32767) | 0;
      view.setInt16(byteOffset, pcm, true);
      byteOffset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}