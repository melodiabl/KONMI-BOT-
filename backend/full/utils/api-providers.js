// api-providers.js
// Módulo de utilidades para manejar múltiples APIs con fallback automático

import axios from 'axios';
import logger from '../config/logger.js';

/**
 * Lista de APIs para descargas de redes sociales con fallback
 */
const API_PROVIDERS = {
  tiktok: [
    {
      name: 'TikWM',
      url: (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.code === 0,
        video: data.data?.play,
        music: data.data?.music,
        title: data.data?.title,
        author: data.data?.author?.unique_id,
        description: data.data?.title,
      }),
    },
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status,
        video: data.result?.video || data.result?.download,
        title: data.result?.title,
        author: data.result?.author || data.result?.username,
        description: data.result?.description,
      }),
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status === 'success',
        video: data.result?.video,
        title: data.result?.title,
        author: data.result?.author,
        description: data.result?.desc,
      }),
    },
  ],

  instagram: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/instagram?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status,
        type: data.result?.type,
        url: data.result?.url || data.result?.image || data.result?.video,
        image: data.result?.image,
        video: data.result?.video,
        author: data.result?.username || data.result?.author,
        caption: data.result?.caption || data.result?.description,
      }),
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/instagram?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status === 'success',
        type: data.result?.type,
        url: data.result?.url,
        author: data.result?.username,
        caption: data.result?.caption,
      }),
    },
  ],

  facebook: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status,
        video: data.result?.video || data.result?.download || data.result?.url,
        title: data.result?.title || data.result?.description,
        duration: data.result?.duration,
        author: data.result?.author,
      }),
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/facebook?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status === 'success',
        video: data.result?.video,
        title: data.result?.title,
        duration: data.result?.duration,
      }),
    },
  ],

  twitter: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/twitter?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status,
        type: data.result?.type,
        video: data.result?.video || data.result?.url,
        image: data.result?.image,
        author: data.result?.username || data.result?.author,
        text: data.result?.text || data.result?.description,
      }),
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/twitter?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status === 'success',
        type: data.result?.type,
        video: data.result?.video,
        image: data.result?.image,
        author: data.result?.username,
        text: data.result?.text,
      }),
    },
  ],

  youtube: [
    {
      name: 'Vreden',
      url: (videoUrl, type = 'video') => `https://api.vreden.my.id/api/ytdl?url=${encodeURIComponent(videoUrl)}&type=${type}`,
      parse: (data) => ({
        success: data.status,
        download: data.result?.download?.url,
        quality: data.result?.download?.quality,
        filename: data.result?.download?.filename,
        title: data.result?.title,
        duration: data.result?.duration,
        views: data.result?.views,
      }),
    },
    {
      name: 'DownloaderBot',
      url: (videoUrl, type = 'video') => `https://downloaderbot.my.id/api/youtube/download?url=${encodeURIComponent(videoUrl)}&type=${type}`,
      parse: (data) => ({
        success: data.status === 'success',
        download: data.result?.url,
        quality: data.result?.quality,
        title: data.result?.title,
      }),
    },
  ],

  youtubeSearch: [
    {
      name: 'Vreden',
      url: (query) => `https://api.vreden.my.id/api/ytsearch?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: data.status && data.result?.length > 0,
        results: data.result?.map(v => ({
          title: v.title,
          url: v.url,
          videoId: v.videoId,
          duration: v.duration?.timestamp,
          views: v.views,
          author: v.author?.name,
          thumbnail: v.thumbnail?.url,
        })) || [],
      }),
    },
    {
      name: 'DownloaderBot',
      url: (query) => `https://downloaderbot.my.id/api/youtube/search?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: data.status === 'success' && data.results?.length > 0,
        results: data.results?.map(v => ({
          title: v.title,
          url: v.url,
          videoId: v.id,
          duration: v.duration,
          views: v.views,
          author: v.channel,
          thumbnail: v.thumbnail,
        })) || [],
      }),
    },
  ],

  pinterest: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/pinterest?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.status,
        image: data.result?.image || data.result?.url,
        title: data.result?.title,
        description: data.result?.description,
      }),
    },
    {
      name: 'PinterestAPI',
      url: (url) => `https://api.pinterestdownloader.com/pinterest?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data.success,
        image: data.data?.image,
        title: data.data?.title,
      }),
    },
  ],

  spotify: [
    {
      name: 'Vreden',
      url: (query) => `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: data.status,
        title: data.result?.title,
        artists: data.result?.artists,
        album: data.result?.album,
        duration_ms: data.result?.duration_ms,
        release_date: data.result?.release_date,
        cover_url: data.result?.cover_url,
        download: data.result?.download,
        preview_url: data.result?.preview_url,
      }),
    },
  ],

  translate: [
    {
      name: 'LibreTranslate',
      url: () => 'https://libretranslate.de/translate',
      method: 'POST',
      body: (text, sourceLang = 'auto', targetLang = 'es') => ({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
      parse: (data) => ({
        success: !!data.translatedText,
        translatedText: data.translatedText,
        detectedLanguage: data.detectedLanguage?.language,
      }),
    },
    {
      name: 'MyMemoryTranslate',
      url: (text, sourceLang = 'auto', targetLang = 'es') =>
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`,
      parse: (data) => ({
        success: data.responseStatus === 200,
        translatedText: data.responseData?.translatedText,
        detectedLanguage: data.responseData?.detectedLanguage,
      }),
    },
  ],

  weather: [
    {
      name: 'OpenMeteo',
      url: async (city) => {
        // Primero geocodificar la ciudad
        const geoResponse = await axios.get(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`
        );

        if (!geoResponse.data.results?.[0]) {
          throw new Error('Ciudad no encontrada');
        }

        const { latitude, longitude, name, country } = geoResponse.data.results[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
        return { url: weatherUrl, cityName: name, country };
      },
      parse: (data, extra) => ({
        success: !!data.current,
        city: extra.cityName,
        country: extra.country,
        temperature: data.current?.temperature_2m,
        humidity: data.current?.relative_humidity_2m,
        windSpeed: data.current?.wind_speed_10m,
        weatherCode: data.current?.weather_code,
        units: data.current_units,
      }),
    },
    {
      name: 'WeatherAPI',
      url: (city) => `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      parse: (data) => ({
        success: !!data.current_condition,
        city: data.nearest_area?.[0]?.areaName?.[0]?.value,
        country: data.nearest_area?.[0]?.country?.[0]?.value,
        temperature: data.current_condition?.[0]?.temp_C,
        humidity: data.current_condition?.[0]?.humidity,
        windSpeed: data.current_condition?.[0]?.windspeedKmph,
        description: data.current_condition?.[0]?.weatherDesc?.[0]?.value,
        feelsLike: data.current_condition?.[0]?.FeelsLikeC,
      }),
    },
  ],

  quote: [
    {
      name: 'QuotableAPI',
      url: () => 'https://api.quotable.io/random',
      parse: (data) => ({
        success: !!data.content,
        quote: data.content,
        author: data.author,
        tags: data.tags,
      }),
    },
    {
      name: 'ZenQuotes',
      url: () => 'https://zenquotes.io/api/random',
      parse: (data) => ({
        success: Array.isArray(data) && data.length > 0,
        quote: data[0]?.q,
        author: data[0]?.a,
      }),
    },
  ],

  fact: [
    {
      name: 'UselessFacts',
      url: () => 'https://uselessfacts.jsph.pl/random.json?language=en',
      parse: (data) => ({
        success: !!data.text,
        fact: data.text,
      }),
    },
    {
      name: 'RandomFact',
      url: () => 'https://api.api-ninjas.com/v1/facts?limit=1',
      headers: { 'X-Api-Key': 'free' },
      parse: (data) => ({
        success: Array.isArray(data) && data.length > 0,
        fact: data[0]?.fact,
      }),
    },
  ],

  trivia: [
    {
      name: 'OpenTriviaDB',
      url: () => 'https://opentdb.com/api.php?amount=1&type=multiple',
      parse: (data) => ({
        success: data.response_code === 0,
        question: data.results?.[0]?.question,
        correct_answer: data.results?.[0]?.correct_answer,
        incorrect_answers: data.results?.[0]?.incorrect_answers,
        category: data.results?.[0]?.category,
        difficulty: data.results?.[0]?.difficulty,
      }),
    },
  ],

  meme: [
    {
      name: 'MemeAPI',
      url: () => 'https://meme-api.com/gimme',
      parse: (data) => ({
        success: !!data.url,
        image: data.url,
        title: data.title,
        author: data.author,
        subreddit: data.subreddit,
        nsfw: data.nsfw,
      }),
    },
    {
      name: 'ImgFlip',
      url: () => 'https://api.imgflip.com/get_memes',
      parse: (data) => {
        if (!data.success || !data.data?.memes?.length) {
          return { success: false };
        }
        const randomMeme = data.data.memes[Math.floor(Math.random() * data.data.memes.length)];
        return {
          success: true,
          image: randomMeme.url,
          title: randomMeme.name,
          id: randomMeme.id,
        };
      },
    },
  ],
};

/**
 * Intenta descargar desde múltiples APIs con fallback automático
 * @param {string} type - Tipo de API (tiktok, instagram, etc.)
 * @param {string|object} param - URL o parámetro para la API
 * @param {object} options - Opciones adicionales
 * @returns {Promise<object>} Resultado de la descarga
 */
export async function downloadWithFallback(type, param, options = {}) {
  const providers = API_PROVIDERS[type];

  if (!providers || providers.length === 0) {
    throw new Error(`Tipo de API no soportado: ${type}`);
  }

  const errors = [];

  for (const provider of providers) {
    try {
      logger.info(`Intentando descargar con ${provider.name} para ${type}`);

      let url;
      let extra = {};

      // Manejar URLs especiales como weather que requieren geocoding
      if (typeof provider.url === 'function') {
        const result = await provider.url(param, options.type);
        if (result && typeof result === 'object' && result.url) {
          url = result.url;
          extra = result;
        } else {
          url = result;
        }
      } else {
        url = provider.url;
      }

      let response;

      if (provider.method === 'POST') {
        const body = typeof provider.body === 'function'
          ? provider.body(param, options.sourceLang, options.targetLang)
          : provider.body;

        response = await axios.post(url, body, {
          headers: provider.headers || { 'Content-Type': 'application/json' },
          timeout: 15000,
        });
      } else {
        response = await axios.get(url, {
          headers: provider.headers || {},
          timeout: 15000,
        });
      }

      const parsedData = provider.parse(response.data, extra);

      if (parsedData.success) {
        logger.info(`✓ Descarga exitosa con ${provider.name}`);
        return { ...parsedData, provider: provider.name };
      } else {
        throw new Error('Respuesta no exitosa de la API');
      }

    } catch (error) {
      const errorMsg = `${provider.name}: ${error.message}`;
      logger.warn(`✗ Fallo con ${errorMsg}`);
      errors.push(errorMsg);
      continue;
    }
  }

  // Si todos los proveedores fallaron
  throw new Error(`Todos los proveedores fallaron:\n${errors.join('\n')}`);
}

/**
 * Busca música en YouTube
 * @param {string} query - Búsqueda
 * @returns {Promise<object>} Resultados
 */
export async function searchYouTubeMusic(query) {
  return downloadWithFallback('youtubeSearch', query);
}

/**
 * Descarga audio/video de YouTube
 * @param {string} url - URL del video
 * @param {string} type - 'audio' o 'video'
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadYouTube(url, type = 'audio') {
  return downloadWithFallback('youtube', url, { type });
}

/**
 * Descarga contenido de TikTok
 * @param {string} url - URL de TikTok
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadTikTok(url) {
  return downloadWithFallback('tiktok', url);
}

/**
 * Descarga contenido de Instagram
 * @param {string} url - URL de Instagram
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadInstagram(url) {
  return downloadWithFallback('instagram', url);
}

/**
 * Descarga video de Facebook
 * @param {string} url - URL de Facebook
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadFacebook(url) {
  return downloadWithFallback('facebook', url);
}

/**
 * Descarga contenido de Twitter/X
 * @param {string} url - URL de Twitter
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadTwitter(url) {
  return downloadWithFallback('twitter', url);
}

/**
 * Descarga imagen de Pinterest
 * @param {string} url - URL de Pinterest
 * @returns {Promise<object>} Resultado de descarga
 */
export async function downloadPinterest(url) {
  return downloadWithFallback('pinterest', url);
}

/**
 * Busca música en Spotify
 * @param {string} query - Búsqueda
 * @returns {Promise<object>} Resultado
 */
export async function searchSpotify(query) {
  return downloadWithFallback('spotify', query);
}

/**
 * Traduce texto
 * @param {string} text - Texto a traducir
 * @param {string} targetLang - Idioma destino (default: 'es')
 * @param {string} sourceLang - Idioma origen (default: 'auto')
 * @returns {Promise<object>} Resultado de traducción
 */
export async function translateText(text, targetLang = 'es', sourceLang = 'auto') {
  return downloadWithFallback('translate', text, { sourceLang, targetLang });
}

/**
 * Obtiene el clima de una ciudad
 * @param {string} city - Nombre de la ciudad
 * @returns {Promise<object>} Datos del clima
 */
export async function getWeather(city) {
  return downloadWithFallback('weather', city);
}

/**
 * Obtiene una frase/cita aleatoria
 * @returns {Promise<object>} Frase y autor
 */
export async function getRandomQuote() {
  return downloadWithFallback('quote', null);
}

/**
 * Obtiene un dato curioso aleatorio
 * @returns {Promise<object>} Dato curioso
 */
export async function getRandomFact() {
  return downloadWithFallback('fact', null);
}

/**
 * Obtiene una pregunta de trivia
 * @returns {Promise<object>} Pregunta de trivia
 */
export async function getTrivia() {
  return downloadWithFallback('trivia', null);
}

/**
 * Obtiene un meme aleatorio
 * @returns {Promise<object>} Meme
 */
export async function getRandomMeme() {
  return downloadWithFallback('meme', null);
}

export default {
  downloadWithFallback,
  searchYouTubeMusic,
  downloadYouTube,
  downloadTikTok,
  downloadInstagram,
  downloadFacebook,
  downloadTwitter,
  downloadPinterest,
  searchSpotify,
  translateText,
  getWeather,
  getRandomQuote,
  getRandomFact,
  getTrivia,
  getRandomMeme,
};
