import { GoogleGenerativeAI } from '@google/generative-ai';

let cachedClient = null;

function resolveGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY || null;
}

export function getGeminiClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el entorno');
  }

  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

export function getGeminiModel(model = 'gemini-pro') {
  return getGeminiClient().getGenerativeModel({ model });
}

export function hasGeminiApiKey() {
  return Boolean(resolveGeminiApiKey());
}
