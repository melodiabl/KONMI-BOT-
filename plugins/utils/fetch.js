// utils/fetch.js
// Wrapper para fetch con configuración por defecto

export default async function fetch(url, options = {}) {
  const defaultOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      ...options.headers
    },
    timeout: 10000,
    ...options
  };

  try {
    const response = await globalThis.fetch(url, defaultOptions);
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Exportar también como named export
export { fetch };
