import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MODEL_PLANNING, MODEL_IMAGE, MODEL_VIDEO, MODEL_TTS, SYSTEM_INSTRUCTION_PLANNER } from "../constants";
import { PlanResponseItem, StoryboardFrame, FrameType } from "../types";
import { decode, decodeAudioData, audioBufferToWav } from "./audioUtils";

const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface FileData {
  mimeType: string;
  data: string; // Base64
}

export const generateStoryPlan = async (documentText: string, file?: FileData): Promise<PlanResponseItem[]> => {
  const ai = getClient();
  
  const parts: any[] = [];

  // 1. Add File if present (PDF support)
  if (file) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    });
  }

  // 2. Add Text (Instructions or extracted text)
  // If a file is attached, this text acts as prompt/instruction.
  // If no file, this is the main content.
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
            script: { type: Type.STRING, description: "Korean narration script" },
            visualPrompt: { type: Type.STRING, description: "Detailed visual description in English for image generation" },
            visualType: { type: Type.STRING, enum: ["IMAGE", "VIDEO"], description: "Whether to generate an image or video" }
          },
          required: ["script", "visualPrompt", "visualType"]
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
            aspectRatio: "16:9"
        }
    }
  });

  // Extract image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const generateFrameVideo = async (prompt: string): Promise<string> => {
  const ai = getClient();
  
  // Veo generation requires polling
  let operation = await ai.models.generateVideos({
    model: MODEL_VIDEO,
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  // Polling loop
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed or returned no URI");

  // Fetch the actual video bytes using the API key
  const videoResponse = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  if (!videoResponse.ok) throw new Error("Failed to download generated video");
  
  const blob = await videoResponse.blob();
  return URL.createObjectURL(blob);
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
          prebuiltVoiceConfig: { voiceName: 'Kore' } // 'Kore' is a standard voice, assuming availability or fallback
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  // Decode and create Blob URL
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