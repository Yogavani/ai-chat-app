import API from "./api";

type GenerateImageBody = {
  prompt: string;
  numSteps?: number;
  guidance?: number;
  width?: number;
  height?: number;
};

type GenerateImageResponse = {
  message?: string;
  imageBase64?: string;
  mimeType?: string;
};

export const generateAIImage = async (body: GenerateImageBody) => {
  const response = await API.post<GenerateImageResponse>("/ai/generate-image", body);
  return response.data;
};
