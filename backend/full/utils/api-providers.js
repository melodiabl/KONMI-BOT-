// api-providers.js
// Utilidades para manejar múltiples APIs con fallback automático y formato unificado

import axios from 'axios'
import logger from '../config/logger.js'

/**
 * Axios por defecto
 */
const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'KonmiBot/2.x (+https://example.local)'
  },
  validateStatus: (s) => s >= 200 && s < 500
})

/**
 * Lee una API key de env y sólo usa el proveedor si está presente.
 * Retorna `headers` para la petición o `null` si no hay key.
 */
function headerIfEnv(varName, headerName, prefix = '') {
  const key = process.env[varName]
  if (!key) return null
  return { [headerName]: prefix ? `${prefix}${key}` : key }
}

/**
 * Estructura estándar de respuesta que todos los parsers deben respetar:
 * {
 *   success: boolean,
 *   // campos opcionales según el tipo:
 *   video?, image?, music?, download?, quality?, filename?,
 *   title?, author?, description?, duration?, views?,
 *   type?, url?, caption?, results?,
 *   city?, country?, temperature?, humidity?, windSpeed?,
 *   quote?, fact?, question?, correct_answer?, incorrect_answers?,
 *   nsfw?, subreddit?,
 *   provider: string
 * }
 */

export const API_PROVIDERS = {
  tiktok: [
    {
      name: 'TikWM',
      url: (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.code === 0,
        video: data?.data?.play,
        music: data?.data?.music,
        title: data?.data?.title,
        author: data?.data?.author?.unique_id,
        description: data?.data?.title
      })
    },
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        video: data?.result?.video || data?.result?.download,
        title: data?.result?.title,
        author: data?.result?.author || data?.result?.username,
        description: data?.result?.description
      })
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.status === 'success',
        video: data?.result?.video,
        title: data?.result?.title,
        author: data?.result?.author,
        description: data?.result?.desc
      })
    }
  ],

  instagram: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/instagram?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        type: data?.result?.type,
        url: data?.result?.url || data?.result?.image || data?.result?.video,
        image: data?.result?.image,
        video: data?.result?.video,
        author: data?.result?.username || data?.result?.author,
        caption: data?.result?.caption || data?.result?.description
      })
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/instagram?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.status === 'success',
        type: data?.result?.type,
        url: data?.result?.url,
        author: data?.result?.username,
        caption: data?.result?.caption
      })
    }
  ],

  facebook: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        video: data?.result?.video || data?.result?.download || data?.result?.url,
        title: data?.result?.title || data?.result?.description,
        duration: data?.result?.duration,
        author: data?.result?.author
      })
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/facebook?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.status === 'success',
        video: data?.result?.video,
        title: data?.result?.title,
        duration: data?.result?.duration
      })
    }
  ],

  twitter: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/twitter?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        type: data?.result?.type,
        video: data?.result?.video || data?.result?.url,
        image: data?.result?.image,
        author: data?.result?.username || data?.result?.author,
        text: data?.result?.text || data?.result?.description
      })
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/twitter?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.status === 'success',
        type: data?.result?.type,
        video: data?.result?.video,
        image: data?.result?.image,
        author: data?.result?.username,
        text: data?.result?.text
      })
    }
  ],

  youtube: [
    {
      name: 'Vreden',
      url: (videoUrl, options = {}) => {
        const type = options.type || 'video'
        return `https://api.vreden.my.id/api/ytdl?url=${encodeURIComponent(videoUrl)}&type=${type}`
      },
      parse: (data) => ({
        success: Boolean(data?.status),
        download: data?.result?.download?.url,
        quality: data?.result?.download?.quality,
        filename: data?.result?.download?.filename,
        title: data?.result?.title,
        duration: data?.result?.duration,
        views: data?.result?.views
      })
    },
    {
      name: 'DownloaderBot',
      url: (videoUrl, options = {}) => {
        const type = options.type || 'video'
        return `https://downloaderbot.my.id/api/youtube/download?url=${encodeURIComponent(videoUrl)}&type=${type}`
      },
      parse: (data) => ({
        success: data?.status === 'success',
        download: data?.result?.url,
        quality: data?.result?.quality,
        title: data?.result?.title
      })
    }
  ],

  youtubeSearch: [
    {
      name: 'Vreden',
      url: (query) => `https://api.vreden.my.id/api/ytsearch?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: Boolean(data?.status) && Array.isArray(data?.result) && data.result.length > 0,
        results: (data?.result || []).map((v) => ({
          title: v?.title,
          url: v?.url,
          videoId: v?.videoId,
          duration: v?.duration?.timestamp,
          views: v?.views,
          author: v?.author?.name,
          thumbnail: v?.thumbnail?.url
        }))
      })
    },
    {
      name: 'DownloaderBot',
      url: (query) => `https://downloaderbot.my.id/api/youtube/search?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: data?.status === 'success' && Array.isArray(data?.results) && data.results.length > 0,
        results: (data?.results || []).map((v) => ({
          title: v?.title,
          url: v?.url,
          videoId: v?.id,
          duration: v?.duration,
          views: v?.views,
          author: v?.channel,
          thumbnail: v?.thumbnail
        }))
      })
    },
    // Fallback local sin depender de dominios externos (requiere: npm i yt-search)
    {
      name: 'yt-search (local)',
      url: async (query) => ({ url: query, __localYT__: true }),
      parse: (data) => data,
      method: 'LOCAL__YTSEARCH'
    }
  ],

  pinterest: [
    {
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/pinterest?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        image: data?.result?.image || data?.result?.url,
        title: data?.result?.title,
        description: data?.result?.description
      })
    },
    {
      name: 'PinterestAPI',
      url: (url) => `https://api.pinterestdownloader.com/pinterest?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.success),
        image: data?.data?.image,
        title: data?.data?.title
      })
    }
  ],

  spotify: [
    {
      name: 'Vreden',
      url: (query) => `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(query)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        title: data?.result?.title,
        artists: data?.result?.artists,
        album: data?.result?.album,
        duration_ms: data?.result?.duration_ms,
        release_date: data?.result?.release_date,
        cover_url: data?.result?.cover_url,
        download: data?.result?.download,
        preview_url: data?.result?.preview_url
      })
    }
  ],

  translate: [
    {
      name: 'LibreTranslate',
      method: 'POST',
      url: () => 'https://libretranslate.de/translate',
      body: (text, options = {}) => ({
        q: text,
        source: options.sourceLang || 'auto',
        target: options.targetLang || 'es',
        format: 'text'
      }),
      parse: (data) => ({
        success: Boolean(data?.translatedText),
        translatedText: data?.translatedText,
        detectedLanguage: data?.detectedLanguage?.language
      })
    },
    {
      name: 'MyMemoryTranslate',
      url: (text, options = {}) => {
        const source = options.sourceLang || 'auto'
        const target = options.targetLang || 'es'
        return `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`
      },
      parse: (data) => ({
        success: data?.responseStatus === 200,
        translatedText: data?.responseData?.translatedText,
        detectedLanguage: data?.responseData?.detectedLanguage
      })
    }
  ],

  weather: [
    {
      name: 'OpenMeteo',
      url: async (city) => {
        const geoResponse = await http.get(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`
        )
        if (!geoResponse?.data?.results?.[0]) {
          throw new Error('Ciudad no encontrada')
        }
        const { latitude, longitude, name, country } = geoResponse.data.results[0]
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
        return { url: weatherUrl, cityName: name, country }
      },
      parse: (data, extra) => ({
        success: Boolean(data?.current),
        city: extra?.cityName,
        country: extra?.country,
        temperature: data?.current?.temperature_2m,
        humidity: data?.current?.relative_humidity_2m,
        windSpeed: data?.current?.wind_speed_10m,
        weatherCode: data?.current?.weather_code,
        units: data?.current_units
      })
    },
    {
      name: 'WeatherAPI',
      url: (city) => `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      parse: (data) => ({
        success: Array.isArray(data?.current_condition),
        city: data?.nearest_area?.[0]?.areaName?.[0]?.value,
        country: data?.nearest_area?.[0]?.country?.[0]?.value,
        temperature: data?.current_condition?.[0]?.temp_C,
        humidity: data?.current_condition?.[0]?.humidity,
        windSpeed: data?.current_condition?.[0]?.windspeedKmph,
        description: data?.current_condition?.[0]?.weatherDesc?.[0]?.value,
        feelsLike: data?.current_condition?.[0]?.FeelsLikeC
      })
    }
  ],

  quote: [
    {
      name: 'QuotableAPI',
      url: () => 'https://api.quotable.io/random',
      parse: (data) => ({
        success: Boolean(data?.content),
        quote: data?.content,
        author: data?.author,
        tags: data?.tags
      })
    },
    {
      name: 'ZenQuotes',
      url: () => 'https://zenquotes.io/api/random',
      parse: (data) => ({
        success: Array.isArray(data) && data.length > 0,
        quote: data?.[0]?.q,
        author: data?.[0]?.a
      })
    }
  ],

  fact: [
    {
      name: 'UselessFacts',
      url: () => 'https://uselessfacts.jsph.pl/random.json?language=en',
      parse: (data) => ({
        success: Boolean(data?.text),
        fact: data?.text
      })
    },
    {
      name: 'RandomFact',
      // Sólo usar si hay API key real
      headers: headerIfEnv('NINJAS_API_KEY', 'X-Api-Key') || undefined,
      url: () => 'https://api.api-ninjas.com/v1/facts?limit=1',
      parse: (data) => ({
        success: Array.isArray(data) && data.length > 0,
        fact: data?.[0]?.fact
      })
    }
  ],

  trivia: [
    {
      name: 'OpenTriviaDB',
      url: () => 'https://opentdb.com/api.php?amount=1&type=multiple',
      parse: (data) => ({
        success: data?.response_code === 0,
        question: data?.results?.[0]?.question,
        correct_answer: data?.results?.[0]?.correct_answer,
        incorrect_answers: data?.results?.[0]?.incorrect_answers,
        category: data?.results?.[0]?.category,
        difficulty: data?.results?.[0]?.difficulty
      })
    }
  ],

  meme: [
    {
      name: 'MemeAPI',
      url: () => 'https://meme-api.com/gimme',
      parse: (data) => ({
        success: Boolean(data?.url),
        image: data?.url,
        title: data?.title,
        author: data?.author,
        subreddit: data?.subreddit,
        nsfw: data?.nsfw
      })
    },
    {
      name: 'ImgFlip',
      url: () => 'https://api.imgflip.com/get_memes',
      parse: (data) => {
        if (!data?.success || !data?.data?.memes?.length) return { success: false }
        const m = data.data.memes[Math.floor(Math.random() * data.data.memes.length)]
        return { success: true, image: m.url, title: m.name, id: m.id }
      }
    }
  ]
}

/**
 * Realiza una petición HTTP teniendo en cuenta método, body y headers del provider
 */
async function doRequest(provider, url, body) {
  // Provider local (yt-search) como último recurso
  if (provider?.method === 'LOCAL__YTSEARCH') {
    try {
      const mod = await import('yt-search')
      const ytSearch = mod.default || mod
<<<<<<< HEAD
      const r = await ytSearch(url) // aquí la url es el query
=======
      const r = await ytSearch(url) // aquí url es el query
>>>>>>> c06b4ece5887b887078a86e7c9f8ff739c4f1877
      const list = Array.isArray(r?.videos) ? r.videos : []
      return {
        data: {
          __local: true,
          success: list.length > 0,
          results: list.map((v) => ({
            title: v?.title,
            url: v?.url,
            videoId: v?.videoId,
            duration: v?.timestamp,
            views: v?.views,
            author: v?.author?.name,
            thumbnail: v?.thumbnail
          }))
        },
        status: 200
      }
    } catch (e) {
      throw new Error('yt-search local falló: ' + (e?.message || e))
    }
  }

  if (provider?.method === 'POST') {
    return http.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        ...(provider?.headers || {})
      }
    })
  }
  return http.get(url, { headers: provider?.headers || {} })
}

/**
 * Intenta descargar desde múltiples APIs con fallback automático
 * @param {string} type - Tipo de API (tiktok, instagram, etc.)
 * @param {string|object} param - URL o parámetro para la API
 * @param {object} options - Opciones adicionales
 * @returns {Promise<object>} Resultado parseado + {provider}
 */
export async function downloadWithFallback(type, param, options = {}) {
  const providers = API_PROVIDERS[type]
  if (!providers?.length) throw new Error('Tipo de API no soportado: ' + type)

  const errors = []

  for (const provider of providers) {
    // Si el proveedor requiere una API key y no está, saltar
    if (provider.headers === null) continue

    try {
      logger.info?.('Intentando con ' + provider.name + ' para ' + type)

      let url
      let extra = {}

      if (typeof provider.url === 'function') {
        let res
        try {
          res = await provider.url(
            param,
            options?.type,
            options?.sourceLang,
            options?.targetLang,
            options
          )
        } catch (urlError) {
          throw new Error('No se pudo construir URL para ' + provider.name + ': ' + (urlError?.message || urlError))
        }

        if (res && typeof res === 'object' && res.url) {
          url = res.url
          extra = res
        } else {
          url = res
        }
      } else {
        url = provider.url
      }

      const body = typeof provider.body === 'function'
        ? provider.body(param, options)
        : provider.body

      const { data, status } = await doRequest(provider, url, body)

      const parsed = data?.__local ? data : (provider.parse?.(data, extra) || { success: false })

      if (parsed && parsed.success) {
<<<<<<< HEAD
        logger.info?.('Descarga exitosa con ' + provider.name)
=======
        logger.info?.('✅ Descarga exitosa con ' + provider.name)
>>>>>>> c06b4ece5887b887078a86e7c9f8ff739c4f1877
        return { ...parsed, provider: provider.name, httpStatus: status }
      }

      throw new Error('Respuesta no exitosa de la API (' + provider.name + ')')
    } catch (err) {
      const msg = provider.name + ': ' + (err?.message || 'Error desconocido')
<<<<<<< HEAD
      logger.warn?.('Fallo con ' + msg)
=======
      logger.warn?.('⚠️ Fallo con ' + msg)
>>>>>>> c06b4ece5887b887078a86e7c9f8ff739c4f1877
      errors.push(msg)
      continue
    }
  }

  throw new Error('Todos los proveedores fallaron:\n' + errors.join('\n'))
}

// ==== Wrappers específicos por plataforma ====
export async function searchYouTubeMusic(query) {
  return downloadWithFallback('youtubeSearch', query)
}

export async function downloadYouTube(url, type = 'audio') {
  return downloadWithFallback('youtube', url, { type })
}

export async function downloadTikTok(url) {
  return downloadWithFallback('tiktok', url)
}

export async function downloadInstagram(url) {
  return downloadWithFallback('instagram', url)
}

export async function downloadFacebook(url) {
  return downloadWithFallback('facebook', url)
}

export async function downloadTwitter(url) {
  return downloadWithFallback('twitter', url)
}

export async function downloadPinterest(url) {
  return downloadWithFallback('pinterest', url)
}

export async function searchSpotify(query) {
  return downloadWithFallback('spotify', query)
}

export async function translateText(text, targetLang = 'es', sourceLang = 'auto') {
  return downloadWithFallback('translate', text, { sourceLang, targetLang })
}

export async function getWeather(city) {
  return downloadWithFallback('weather', city)
}

export async function getRandomQuote() {
  return downloadWithFallback('quote', null)
}

export async function getRandomFact() {
  return downloadWithFallback('fact', null)
}

export async function getTrivia() {
  return downloadWithFallback('trivia', null)
}

export async function getRandomMeme() {
  return downloadWithFallback('meme', null)
}

export default {
  API_PROVIDERS,
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
  getRandomMeme
}

