import '../config.js';
import { getGeminiModel } from '../gemini-client.js';

const mask = (v) => (v ? String(v).slice(0, 6) + '...' : '(empty)');

async function main() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
  console.log('[sdk] GEMINI key present =', Boolean(key), 'value =', mask(key));
  if (!key) process.exit(2);
  try {
    const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash');
    const model = getGeminiModel(modelName);
    const result = await model.generateContent('ping de prueba SDK');
    const text = (await result.response).text();
    console.log('[sdk] OK. Text length:', text?.length || 0);
    process.exit(0);
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    console.error('[sdk] Error:', msg);
    process.exit(1);
  }
}

main();
