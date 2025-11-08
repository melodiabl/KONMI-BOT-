import '../config.js';
import axios from 'axios';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
if (!key) {
  console.error('No API key detected in backend/full/.env');
  process.exit(2);
}

async function fetchList(version) {
  const url = `https://generativelanguage.googleapis.com/${version}/models?key=${key}`;
  const res = await axios.get(url, { timeout: 15000 });
  return res?.data?.models || [];
}

async function main() {
  try {
    let models = await fetchList('v1');
    if (!models?.length) {
      models = await fetchList('v1beta');
    }
    console.log('Models count:', models.length);
    const names = models.map((m) => m.name).slice(0, 20);
    console.log('First models:', names);
    process.exit(0);
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    console.error('ListModels error:', msg);
    process.exit(1);
  }
}

main();

