import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MODEL_PLANNING, MODEL_IMAGE, MODEL_TTS, SYSTEM_INSTRUCTION_PLANNER } from "../constants";
import { PlanResponseItem } from "../types";
import { decode, decodeAudioData, audioBufferToWav } from "./audioUtils";

const getClient = () => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
      console.warn("API Key is missing. Please select an API key using the dialog.");
  }
  return new GoogleGenAI({ apiKey: key || '' });
};

// Explicitly set a stable voice to prevent inconsistency
const VOICE_NAME = 'Zephyr';

export interface FileData {
  mimeType: string;
  data: string; // Base64
}

export const generateStoryPlan = async (documentText: string, file?: FileData): Promise<PlanResponseItem[]> => {
  const ai = getClient();
  
  const parts: any[] = [];

  if (file) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    });
  }

  if (documentText) {
    parts.push({ text: `다음 문서를 바탕으로 교육용 영상 제작을 위한 스토리보드를 작성해줘:\n\n${documentText}` });
  } else if (file) {
    parts.push({ text: `첨부된 문서를 바탕으로 교육용 영상 제작을 위한 스토리보드를 작성해줘.` });
  }

  if (parts.length === 0) {
    throw new Error("No content provided");
  }

  const response = await ai.models.generateContent({
    model: MODEL_PLANNING,
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_PLANNER,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            script: { type: Type.STRING, description: "한국어 내레이션 대본" },
            visualPrompt: { type: Type.STRING, description: "이미지 생성을 위한 한국어 시각 묘사 프롬프트. 피사체, 구도, 색감, 조명, 분위기를 상세하게 기술." }
          },
          required: ["script", "visualPrompt"]
        }
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text) as PlanResponseItem[];
  }
  throw new Error("Failed to generate plan");
};

export const generateFrameImage = async (prompt: string): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
        imageConfig: {
            aspectRatio: "16:9",
            imageSize: "2K"
        }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const generateFrameAudio = async (text: string): Promise<string> => {
  const ai = getClient();
  
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE_NAME }
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffer = await decodeAudioData(
    decode(base64Audio),
    audioContext,
    24000,
    1
  );
  
  const wavBlob = await audioBufferToWav(audioBuffer);
  return URL.createObjectURL(wavBlob);
};