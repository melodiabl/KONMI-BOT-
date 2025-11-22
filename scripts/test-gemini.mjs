import '../config.js';

const mask = (v) => (v ? String(v).slice(0, 6) + '...' : '(empty)');

async function main() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
  console.log('[test] GEMINI key present =', Boolean(key), 'value =', mask(key));
  if (!key) {
    console.log('[test] No API key detected from backend/full/.env');
    process.exit(2);
  }

  try {
    const { chatWithAI } = await import('../gemini-ai-handler.js');
    const res = await chatWithAI('ping de prueba', 'CLI-test');
    console.log('[test] chatWithAI result:', res);
    process.exit(res?.success ? 0 : 3);
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    console.error('[test] Error invoking chatWithAI:', msg);
    process.exit(1);
  }
}

main();

