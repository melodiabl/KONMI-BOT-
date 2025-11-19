// api-providers.js
// Utilidades para manejar múltiples APIs con fallback automático y formato unificado

import axios from 'axios'
import logger from '../config/logger.js'
import { getSpotifyAccessToken } from './spotify-auth.js'
import { buildYtDlpCookieArgs } from './cookies.js'
import { tmpdir } from 'os';
import { join as pathJoin } from 'path';
import { mkdir, rm } from 'fs/promises';

/**
 * Axios por defecto
 */
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'KonmiBot/2.x (+https://example.local)'
  },
  validateStatus: (s) => s >= 200 && s < 500
})

// yt-dlp tuning variables for YouTube reliability on VPS
const DEFAULT_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const YTDLP_USER_AGENT = process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || DEFAULT_WEB_UA
const YTDLP_EXTRACTOR_ARGS_BASE = process.env.YTDLP_EXTRACTOR_ARGS || process.env.YOUTUBE_EXTRACTOR_ARGS || 'youtube:player_client=android'
const YTDLP_PO_TOKEN = process.env.YTDLP_PO_TOKEN || process.env.YOUTUBE_PO_TOKEN || ''
const buildExtractorArgs = () => {
  let base = YTDLP_EXTRACTOR_ARGS_BASE || ''
  // Asegurar defaults útiles si no están presentes
  if (!/player_client=/.test(base)) base = base ? `${base},youtube:player_client=android` : 'youtube:player_client=android'
  if (!YTDLP_PO_TOKEN) return base
  const sep = base.includes(',') || base.includes(':') ? ',' : ''
  return `${base}${sep}youtube:po_token=android.gvs+${YTDLP_PO_TOKEN}`
}

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
      name: 'Vreden',
      url: (url) => `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: Boolean(data?.status),
        video: data?.result?.video || data?.result?.download,
        thumbnail: data?.result?.thumbnail || data?.result?.cover || data?.result?.image,
        title: data?.result?.title,
        author: data?.result?.author || data?.result?.username,
        description: data?.result?.description
      })
    },
    {
      name: 'TikWM',
      url: (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.code === 0,
        video: data?.data?.play,
        thumbnail: data?.data?.cover || data?.data?.origin_cover || data?.data?.dynamic_cover,
        music: data?.data?.music,
        title: data?.data?.title,
        author: data?.data?.author?.unique_id,
        description: data?.data?.title
      })
    },
    {
      name: 'DownloaderBot',
      url: (url) => `https://downloaderbot.my.id/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: (data) => ({
        success: data?.status === 'success',
        video: data?.result?.video,
        thumbnail: data?.result?.thumbnail || data?.result?.cover,
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
        thumbnail: data?.result?.thumbnail || data?.result?.thumb || data?.result?.image,
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
        thumbnail: data?.result?.thumbnail || data?.result?.thumb,
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
    // Preferir proveedores locales primero (sin depender de APIs externas)
    {
      name: 'yt-dlp (local)',
      method: 'LOCAL__YTDLP_URL',
      url: (videoUrl, options = {}) => ({ url: videoUrl, __ytdlpType: options.type || 'audio' }),
      parse: (data) => data
    },
    // Fallback final local: ytdl-core (obtiene URL directa del mejor audio)
    {
      name: 'ytdl-core (local url)',
      method: 'LOCAL__YTDL_URL',
      url: (videoUrl, options = {}) => videoUrl,
      parse: (data) => data
    },
    {
      name: 'Piped.video',
      timeoutMs: 5000,
      url: (videoUrl, options = {}) => {
        try {
          const u = new URL(videoUrl)
          let vid = u.searchParams.get('v')
          if (!vid && /youtu\.be$/i.test(u.hostname)) {
            const p = u.pathname.split('/').filter(Boolean)
            if (p[0]) vid = p[0]
          }
          if (!vid) {
            const m = (videoUrl || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)
            vid = m ? m[1] : null
          }
          if (!vid) throw new Error('videoId no encontrado')
          return { url: `https://piped.video/api/v1/streams/${vid}`, __yt_requested_type: options.type || 'video' }
        } catch (e) { throw e }
      },
      parse: (data, extra) => {
        const want = (extra && extra.__yt_requested_type) || 'video'
        if (want === 'audio') {
          const a = Array.isArray(data?.audioStreams) ? data.audioStreams : []
          const best = a?.[0]?.url || null
          return { success: Boolean(best), download: best, quality: a?.[0]?.quality }
        }
        const v = Array.isArray(data?.videoStreams) ? data.videoStreams : []
        const bestVideo = v?.[0]?.url || data?.hls || null
        return { success: Boolean(bestVideo), download: bestVideo, quality: v?.[0]?.quality }
      }
    },
    {
      name: 'Piped.mha.fi',
      timeoutMs: 5000,
      url: (videoUrl, options = {}) => {
        try {
          const u = new URL(videoUrl)
          let vid = u.searchParams.get('v')
          if (!vid && /youtu\.be$/i.test(u.hostname)) {
            const p = u.pathname.split('/').filter(Boolean)
            if (p[0]) vid = p[0]
          }
          if (!vid) {
            const m = (videoUrl || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)
            vid = m ? m[1] : null
          }
          if (!vid) throw new Error('videoId no encontrado')
          return { url: `https://piped.mha.fi/api/v1/streams/${vid}`, __yt_requested_type: options.type || 'video' }
        } catch (e) { throw e }
      },
      parse: (data, extra) => {
        const want = (extra && extra.__yt_requested_type) || 'video'
        if (want === 'audio') {
          const a = Array.isArray(data?.audioStreams) ? data.audioStreams : []
          const best = a?.[0]?.url || null
          return { success: Boolean(best), download: best, quality: a?.[0]?.quality }
        }
        const v = Array.isArray(data?.videoStreams) ? data.videoStreams : []
        const bestVideo = v?.[0]?.url || data?.hls || null
        return { success: Boolean(bestVideo), download: bestVideo, quality: v?.[0]?.quality }
      }
    },
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
      timeoutMs: 3500,
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
    },
  ],

  youtubeSearch: [
    // yt-dlp local search (sin APIs de terceros)
    {
      name: 'yt-dlp (search local)',
      method: 'LOCAL__YTDLP_SEARCH',
      url: (query) => `ytsearch10:${query}`,
      parse: (data) => data,
    },
    // Piped Search (instancias públicas)
    {
      name: 'Piped.video Search',
      timeoutMs: 5000,
      url: (query) => `https://piped.video/api/v1/search?q=${encodeURIComponent(query)}&region=US`,
      parse: (data) => {
        const items = Array.isArray(data) ? data : []
        const vids = items.filter(i => (i?.type||'').toLowerCase()==='video')
        if (!vids.length) return { success: false }
        const map = vids.map(v=>({
          title: v?.title,
          url: v?.url?.startsWith('http') ? v.url : (v?.url ? `https://youtube.com${v.url}` : undefined),
          videoId: v?.url?.includes('watch?v=') ? (v.url.split('v=')[1]||'').split('&')[0] : undefined,
          duration: v?.duration,
          views: v?.views,
          author: v?.uploaderName || v?.uploader,
          thumbnail: Array.isArray(v?.thumbnailUrl) ? v.thumbnailUrl[0] : v?.thumbnail,
        }))
        return { success: true, results: map }
      }
    },
    {
      name: 'Piped.mha.fi Search',
      timeoutMs: 5000,
      url: (query) => `https://piped.mha.fi/api/v1/search?q=${encodeURIComponent(query)}&region=US`,
      parse: (data) => {
        const items = Array.isArray(data) ? data : []
        const vids = items.filter(i => (i?.type||'').toLowerCase()==='video')
        if (!vids.length) return { success: false }
        const map = vids.map(v=>({
          title: v?.title,
          url: v?.url?.startsWith('http') ? v.url : (v?.url ? `https://youtube.com${v.url}` : undefined),
          videoId: v?.url?.includes('watch?v=') ? (v.url.split('v=')[1]||'').split('&')[0] : undefined,
          duration: v?.duration,
          views: v?.views,
          author: v?.uploaderName || v?.uploader,
          thumbnail: Array.isArray(v?.thumbnailUrl) ? v.thumbnailUrl[0] : v?.thumbnail,
        }))
        return { success: true, results: map }
      }
    },
    {
      name: 'Piped.kavin Search',
      timeoutMs: 5000,
      url: (query) => `https://pipedapi.kavin.rocks/api/v1/search?q=${encodeURIComponent(query)}&region=US`,
      parse: (data) => {
        const items = Array.isArray(data) ? data : []
        const vids = items.filter(i => (i?.type||'').toLowerCase()==='video')
        if (!vids.length) return { success: false }
        const map = vids.map(v=>({
          title: v?.title,
          url: v?.url?.startsWith('http') ? v.url : (v?.url ? `https://youtube.com${v.url}` : undefined),
          videoId: v?.url?.includes('watch?v=') ? (v.url.split('v=')[1]||'').split('&')[0] : undefined,
          duration: v?.duration,
          views: v?.views,
          author: v?.uploaderName || v?.uploader,
          thumbnail: Array.isArray(v?.thumbnailUrl) ? v.thumbnailUrl[0] : v?.thumbnail,
        }))
        return { success: true, results: map }
      }
    },
    // Abhi API como respaldo
    {
      name: 'AbhiAPI',
      timeoutMs: 6000,
      url: (query) => `https://abhi-api.vercel.app/api/search/yts?text=${encodeURIComponent(query)}`,
      parse: (data) => {
        const r = data?.result
        if (!r?.url) return { success: false }
        return {
          success: true,
          results: [
            {
              title: r.title,
              url: r.url,
              videoId: (r.url || '').split('v=')[1] || undefined,
              duration: r.duration,
              views: r.views,
              author: r.channel,
              thumbnail: r.thumbnail,
    },
    // Último recurso local: paquete yt-search (no playlist)
    {
      name: 'yt-search (local)',
      method: 'LOCAL__YTSEARCH',
      url: (query) => query,
      parse: (data) => data,
    },
  ],
        }
      },
    },
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
    // Proveedor oficial con Client Credentials
    {
      name: 'Spotify API',
      // Dinámico: inyecta Bearer token
      headers: async () => {
        try {
          const token = await getSpotifyAccessToken()
          if (!token) return null
          return { Authorization: `Bearer ${token}` }
        } catch (e) {
          // Propagar para que el fallback pruebe el siguiente proveedor
          throw new Error(e?.message || 'spotify token error')
        }
      },
      // Acepta texto o URL de track
      url: async (query) => {
        const q = String(query || '').trim()
        // URL o URI -> extraer ID
        const match = q.match(/(?:track\/(\w+)|spotify:track:(\w+))/i)
        if (match && (match[1] || match[2])) {
          const id = (match[1] || match[2])
          return `https://api.spotify.com/v1/tracks/${id}`
        }
        // Búsqueda normal
        const search = encodeURIComponent(q)
        return `https://api.spotify.com/v1/search?type=track&limit=1&q=${search}`
      },
      parse: (data) => {
        const track = data?.tracks?.items?.[0] || data // soporta /search y /tracks/{id}
        if (!track?.name) return { success: false }
        const artists = Array.isArray(track.artists) ? track.artists.map(a => a?.name).filter(Boolean).join(', ') : undefined
        const album = track.album || {}
        const cover = Array.isArray(album.images) && album.images.length ? album.images[0].url : undefined
        return {
          success: true,
          title: track.name,
          artists,
          album: album?.name,
          duration_ms: track.duration_ms,
          release_date: album?.release_date,
          cover_url: cover,
          popularity: typeof track.popularity === 'number' ? track.popularity : undefined,
          preview_url: track.preview_url || undefined,
          url: track?.external_urls?.spotify
        }
      }
    },
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
async function doRequest(provider, url, body, extraCtx) {
  // Provider local (yt-search) como último recurso
  if (provider?.method === 'LOCAL__YTSEARCH') {
    try {
      const mod = await import('yt-search')
      const ytSearch = mod.default || mod
      const r = await ytSearch(url) // aquí url es el query
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
  // Proveedor local: ytdl-core para obtener URL directa
  if (provider?.method === 'LOCAL__YTDL_URL') {
    try {
      const mod = await import('ytdl-core')
      const ytdl = mod.default || mod
      const info = await ytdl.getInfo(url)
      let chosen
      try {
        chosen = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      } catch (_) {
        // fallback simple
        const only = (info.formats || []).filter((f) => f.hasAudio && !f.hasVideo)
        chosen = only?.[0]
      }
      const direct = chosen?.url
      return {
        data: { __local: true, success: Boolean(direct), download: direct, quality: chosen?.audioBitrate },
        status: 200,
      }
    } catch (e) {
      throw new Error('ytdl-core url falló: ' + (e?.message || e))
    }
  }

// Proveedor local: yt-dlp-exec para obtener URL directa robusta o descargar localmente
if (provider?.method === 'LOCAL__YTDLP_URL') {
    let tempDir = null;
    try {
        const onProgress = extraCtx?.onProgress;
        const want = (extraCtx && (extraCtx.__ytdlpType || extraCtx.type)) || 'audio';
        const isAudioDownload = want === 'audio';

        if (isAudioDownload) {
            tempDir = pathJoin(tmpdir(), `konmi-dl-${Date.now()}-${Math.random().toString(16).slice(2)}`);
            await mkdir(tempDir, { recursive: true });
        }

        let ytdlp;
        try {
            const execMod = await import('yt-dlp-exec');
            ytdlp = execMod.default || execMod;
        } catch (_) {
            ytdlp = null;
        }

        const __cookieArgs = (() => { try { return buildYtDlpCookieArgs() } catch { return [] } })()
        const __hasCookies = Array.isArray(__cookieArgs) && __cookieArgs.length > 0
        const __envExt = process.env.YTDLP_EXTRACTOR_ARGS || ''
        const __dynExtractor = __hasCookies
            ? (!__envExt || /player_client=android/i.test(__envExt) ? 'youtube:player_client=web_safari' : __envExt)
            : (__envExt || 'youtube:player_client=android')

        const optsBase = {
            noWarnings: true,
            preferFreeFormats: false,
            retries: 1,
            quiet: true,
            userAgent: YTDLP_USER_AGENT,
            extractorArgs: __dynExtractor,
            sleepInterval: process.env.YTDLP_SLEEP_INTERVAL && String(process.env.YTDLP_SLEEP_INTERVAL).trim(),
            maxSleepInterval: process.env.YTDLP_SLEEP_MAX && String(process.env.YTDLP_SLEEP_MAX).trim(),
            limitRate: process.env.YTDLP_RATE_LIMIT && String(process.env.YTDLP_RATE_LIMIT).trim(),
            concurrentFragments: process.env.YTDLP_CONCURRENT_FRAGMENTS && String(process.env.YTDLP_CONCURRENT_FRAGMENTS).trim(),
            referer: process.env.YTDLP_REFERER && String(process.env.YTDLP_REFERER).trim(),
            httpChunkSize: process.env.YTDLP_HTTP_CHUNK_SIZE && String(process.env.YTDLP_HTTP_CHUNK_SIZE).trim(),
        };

        if (isAudioDownload) {
            optsBase.printJson = true;
            optsBase.output = pathJoin(tempDir, '%(title)s.%(ext)s');
            optsBase.extractAudio = true;
            optsBase.audioFormat = 'mp3';
            optsBase.embedThumbnail = true;
        } else {
            optsBase.dumpSingleJson = true;
        }

        try {
            const fsMod = await import('fs');
            const fs = fsMod.default || fsMod;
            const cookieFile = process.env.YOUTUBE_COOKIES_FILE || process.env.YT_COOKIES_FILE;
            if (cookieFile && (fs.existsSync?.(cookieFile) || fs.default?.existsSync?.(cookieFile))) {
                optsBase.cookies = cookieFile;
            } else if (process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES) {
                optsBase.addHeader = [`Cookie: ${process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES}`];
            }
        } catch {}

        let info;
        const formatCandidates = isAudioDownload
            ? ['bestaudio[ext=m4a]/bestaudio/best']
            : want === 'audio'
                ? ['bestaudio[ext=m4a]/bestaudio/best', 'bestaudio/best', 'best']
                : ['best[ext=mp4]/bv*+ba/b', 'bv*+ba/b', 'best'];

        if (ytdlp) {
            let lastErrExec;
            for (const fmt of formatCandidates) {
                try {
                    info = await ytdlp(url, { ...optsBase, format: fmt });
                    if (info) break;
                } catch (e) {
                    lastErrExec = e;
                    const msg = String(e?.message || e || '');
                    if (/Requested format is not available|no such format|No video formats|Requested format/i.test(msg)) {
                        continue;
                    }
                    throw e;
                }
            }
            if (!info && lastErrExec) throw lastErrExec;
        } else {
            const { spawn } = await import('child_process');
            const cookieArgs = [];
            try {
                const fsMod = await import('fs');
                const fs = fsMod.default || fsMod;
                const envP = process.env.YOUTUBE_COOKIES_FILE || process.env.YT_COOKIES_FILE;
                const candidates = [
                    envP,
                    '/home/admin/all_cookies.txt',
                    '/home/admin/KONMI-BOT-/backend/full/all_cookies.txt',
                    '/home/admin/all_cookie.txt',
                    '/home/admin/KONMI-BOT-/backend/full/all_cookie.txt',
                ].filter(Boolean);
                let picked = null;
                for (const p of candidates) {
                    try { if (p && (fs.existsSync?.(p) || fs.default?.existsSync?.(p))) { picked = p; break } } catch {}
                }
                if (picked) {
                    cookieArgs.push('--cookies', picked);
                } else if (process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES) {
                    cookieArgs.push('--add-header', `Cookie: ${process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES}`);
                }
            } catch {}

            const buildArgs = (fmt) => {
                const fs = (() => { try { const m = require('fs'); return m.default || m } catch { return {} } })();
                const base = [
                    ...(() => { try { return String(process.env.YTDLP_IGNORE_CONFIG || '').toLowerCase() === 'true' ? ['--ignore-config'] : [] } catch { return [] } })(),
                    '--no-warnings',
                    '--retries', '1',
                    '-f', fmt,
                    '--user-agent', YTDLP_USER_AGENT,
                    '--extractor-args', __dynExtractor,
                    ...(() => { try { const cfg = process.env.YTDLP_CONFIG_FILE && String(process.env.YTDLP_CONFIG_FILE).trim(); return (cfg && (fs.existsSync?.(cfg) || fs.default?.existsSync?.(cfg))) ? ['--config-location', cfg] : [] } catch { return [] } })(),
                    ...(process.env.YTDLP_SLEEP_INTERVAL ? ['--sleep-interval', String(process.env.YTDLP_SLEEP_INTERVAL)] : []),
                    ...(process.env.YTDLP_SLEEP_MAX ? ['--max-sleep-interval', String(process.env.YTDLP_SLEEP_MAX)] : []),
                    ...(process.env.YTDLP_RATE_LIMIT ? ['--limit-rate', String(process.env.YTDLP_RATE_LIMIT)] : []),
                    ...(process.env.YTDLP_CONCURRENT_FRAGMENTS ? ['--concurrent-fragments', String(process.env.YTDLP_CONCURRENT_FRAGMENTS)] : []),
                    ...(process.env.YTDLP_REFERER ? ['--referer', String(process.env.YTDLP_REFERER)] : []),
                    ...(process.env.YTDLP_HTTP_CHUNK_SIZE ? ['--http-chunk-size', String(process.env.YTDLP_HTTP_CHUNK_SIZE)] : []),
                    ...(process.env.YTDLP_BUFFER_SIZE ? ['--buffer-size', String(process.env.YTDLP_BUFFER_SIZE)] : []),
                    ...(process.env.YTDLP_RETRIES ? ['--retries', String(process.env.YTDLP_RETRIES)] : []),
                    ...(process.env.YTDLP_FRAGMENT_RETRIES ? ['--fragment-retries', String(process.env.YTDLP_FRAGMENT_RETRIES)] : []),
                    ...((String(process.env.YTDLP_FORCE_IPV4 || '').toLowerCase() === 'true') ? ['-4'] : []),
                    ...cookieArgs,
                ];

                if (isAudioDownload) {
                    base.push(
                        '--extract-audio',
                        '--audio-format', 'mp3',
                        '--embed-thumbnail',
                        '--print-json',
                        '-o', pathJoin(tempDir, '%(title)s.%(ext)s')
                    );
                } else {
                    base.push('--dump-single-json');
                }
                base.push(url);
                return base;
            };

            const tryCmd = async (cmd, args) => new Promise((resolve, reject) => {
                const p = spawn(cmd, args, { windowsHide: true });
                let out = '';
                let err = '';
                p.stdout.on('data', (d) => out += d.toString());
                p.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (onProgress && str.includes('[download]')) {
                        const match = str.match(/(\d+\.\d+)%|\s(\d+)%/);
                        if (match) {
                            onProgress(parseFloat(match[1] || match[2]));
                        }
                    }
                    err += str;
                });
                p.on('error', (e) => reject(e));
                p.on('close', (code) => {
                    if (code === 0) {
                        try {
                            resolve(JSON.parse(out));
                        } catch (e) {
                            reject(new Error('yt-dlp JSON parse fail'));
                        }
                    } else {
                        reject(new Error(err || ('exit ' + code)));
                    }
                });
            });

            const binEnv = process.env.YTDLP_PATH || process.env.YTDLP_BIN || null;
            const candidates = [];
            if (binEnv) candidates.push(binEnv);
            try {
                if (process.platform === 'win32') {
                    const localBin = 'bin\\yt-dlp.exe';
                    const fsMod = await import('fs');
                    const fs = fsMod.default || fsMod;
                    if (fs.existsSync?.(localBin) || fs.default?.existsSync?.(localBin)) {
                        candidates.push(localBin);
                    }
                }
            } catch {}
            candidates.push('yt-dlp', 'yt');
            let lastErr;

            for (const c of candidates) {
                for (const fmt of formatCandidates) {
                    const args = buildArgs(fmt);
                    try {
                        info = await tryCmd(c, args);
                        lastErr = null;
                        break;
                    } catch (e) {
                        lastErr = e;
                        const msg = String(e?.message || e || '');
                        if (/Requested format is not available|no such format|No video formats|Requested format/i.test(msg)) {
                            continue;
                        }
                        break;
                    }
                }
                if (info) break;
            }

            if (!info) {
                const pyCandidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
                for (const py of pyCandidates) {
                    for (const fmt of formatCandidates) {
                        const args = buildArgs(fmt);
                        try {
                            info = await tryCmd(py, ['-m', 'yt_dlp', ...args]);
                            lastErr = null;
                            break;
                        } catch (e) {
                            lastErr = e;
                            const msg = String(e?.message || e || '');
                            if (/Requested format is not available|no such format|No video formats|Requested format/i.test(msg)) {
                                continue;
                            }
                            break;
                        }
                    }
                    if (info) break;
                }
            }
            if (!info) throw lastErr || new Error('yt-dlp no disponible en PATH');
        }

        if (isAudioDownload) {
            const filePath = info?._filename;
            if (filePath) {
                return {
                    data: {
                        __local: true,
                        success: true,
                        download: { url: filePath, isLocal: true },
                        title: info?.title,
                        quality: info?.quality,
                        tempDir: tempDir // Pasar el dir para limpieza posterior
                    },
                    status: 200
                };
            }
            throw new Error('No se pudo obtener la ruta del archivo descargado.');
        }

        const pickFromFormats = (formats, predicate) => {
            if (!Array.isArray(formats)) return null;
            const list = formats.filter(predicate);
            return list.length ? list.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0] : null;
        };

        let chosenUrl = null;
        if (Array.isArray(info?.requested_downloads) && info.requested_downloads.length) {
            chosenUrl = info.requested_downloads[0]?.url || null;
        }
        if (!chosenUrl && Array.isArray(info?.requested_formats)) {
            chosenUrl = info.requested_formats[0]?.url || null;
        }
        if (!chosenUrl && info?.url) chosenUrl = info.url;
        if (!chosenUrl && Array.isArray(info?.formats)) {
            if (want === 'audio') {
                const f = pickFromFormats(info.formats, f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
                chosenUrl = f?.url || null;
            } else {
                const f = pickFromFormats(info.formats, f => (f.ext === 'mp4' || /mp4|m4v/i.test(f.ext)) && (f.vcodec && f.vcodec !== 'none'));
                chosenUrl = f?.url || null;
            }
        }
        return { data: { __local: true, success: Boolean(chosenUrl), download: { url: chosenUrl }, title: info?.title, quality: info?.quality }, status: 200 };
    } catch (e) {
        if (tempDir) {
            try { await rm(tempDir, { recursive: true, force: true }); } catch {}
        }
        throw new Error((e && e.stderr) ? String(e.stderr).slice(0, 200) : (e?.message || e));
    }
}

  // Proveedor local: yt-dlp para búsqueda (ytsearchN:query)
  if (provider?.method === 'LOCAL__YTDLP_SEARCH') {
    try {
      // url aquí es el término completo como "ytsearch10:query"
      const execMod = await import('child_process')
      const fsMod = await import('fs')
      const pathMod = await import('path')
      const { spawn } = execMod
      const fs = fsMod.default || fsMod
      const path = pathMod.default || pathMod

      // Construir argumentos comunes: ignorar config de usuario, cookies, UA, extractor-args, IPv4, etc.
      const commonArgs = []
      try { if (String(process.env.YTDLP_IGNORE_CONFIG || '').toLowerCase() === 'true') commonArgs.push('--ignore-config') } catch {}
      // Cookies: helper unificado (archivo/header/browser)
      try { const cArgs = buildYtDlpCookieArgs(); if (Array.isArray(cArgs) && cArgs.length) commonArgs.push(...cArgs) } catch {}
      // UA y extractor-args
      if (YTDLP_USER_AGENT) commonArgs.push('--user-agent', YTDLP_USER_AGENT)
        const cookiesPresent = commonArgs.some((v) => v === '--cookies' || v === '--add-header' || v === '--cookies-from-browser')
        const envExtSearch = process.env.YTDLP_EXTRACTOR_ARGS || ''
        const dynExtractor = cookiesPresent
          ? (!envExtSearch || /player_client=android/i.test(envExtSearch) ? 'youtube:player_client=web_safari' : envExtSearch)
          : (envExtSearch || 'youtube:player_client=android')
      if (dynExtractor) commonArgs.push('--extractor-args', dynExtractor)
      // Opcionales de red
      try {
        if (process.env.YTDLP_BUFFER_SIZE) commonArgs.push('--buffer-size', String(process.env.YTDLP_BUFFER_SIZE))
        if (process.env.YTDLP_RETRIES) commonArgs.push('--retries', String(process.env.YTDLP_RETRIES))
        if (process.env.YTDLP_FRAGMENT_RETRIES) commonArgs.push('--fragment-retries', String(process.env.YTDLP_FRAGMENT_RETRIES))
        if (String(process.env.YTDLP_FORCE_IPV4 || '').toLowerCase() === 'true') commonArgs.push('-4')
        if (process.env.YTDLP_HTTP_CHUNK_SIZE) commonArgs.push('--http-chunk-size', String(process.env.YTDLP_HTTP_CHUNK_SIZE))
        if (process.env.YTDLP_CONCURRENT_FRAGMENTS) commonArgs.push('--concurrent-fragments', String(process.env.YTDLP_CONCURRENT_FRAGMENTS))
        // Config opcional externa
        const cfg = process.env.YTDLP_CONFIG_FILE && String(process.env.YTDLP_CONFIG_FILE).trim()
        if (cfg && (fs.existsSync?.(cfg) || fs.default?.existsSync?.(cfg))) commonArgs.push('--config-location', cfg)
      } catch {}

      const runOnce = (cmd, args, extra = []) => new Promise((resolve, reject) => {
        try {
          const p = spawn(cmd, [...extra, ...args], { windowsHide: true })
          let out = ''
          let err = ''
          p.stdout.on('data', (d) => (out += d.toString()))
          p.stderr.on('data', (d) => (err += d.toString()))
          p.on('error', (e) => reject(e))
          p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || ('exit ' + code)))))
        } catch (e) { reject(e) }
      })

      const buildArgs = (args) => [...args, '--flat-playlist', '-J', url]
      const selectCandidates = () => {
        const list = []
        if (process.env.YTDLP_PATH) list.push({ cmd: process.env.YTDLP_PATH, extra: [] })
        if (process.env.YTDLP_BIN) list.push({ cmd: process.env.YTDLP_BIN, extra: [] })
        try {
          if (process.platform === 'win32') {
            const localExe = path.join(process.cwd(), 'backend', 'full', 'bin', 'yt-dlp.exe')
            if (fs.existsSync?.(localExe) || fs.default?.existsSync?.(localExe)) list.push({ cmd: localExe, extra: [] })
          }
        } catch {}
        list.push({ cmd: 'yt-dlp', extra: [] }, { cmd: 'yt', extra: [] })
        return list
      }
      const pyCands = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']

      async function runSearch(args) {
        const baseArgs = buildArgs(args)
        let output = null
        let lastErr = null
        for (const c of selectCandidates()) {
          try { output = await runOnce(c.cmd, baseArgs, c.extra); lastErr = null; break } catch (e) { lastErr = e }
        }
        if (output == null) {
          for (const py of pyCands) {
            try { output = await runOnce(py, buildArgs(['-m','yt_dlp', ...args])); lastErr = null; break } catch (e) { lastErr = e }
          }
        }
        if (output == null) throw lastErr || new Error('yt-dlp no disponible en PATH')
        let json
        try { json = JSON.parse(output) } catch (e) { throw new Error('yt-dlp search JSON inválido') }
        const entries = Array.isArray(json?.entries) ? json.entries : []
        const mapped = entries.map((v) => {
          let url = v?.webpage_url || (v?.url && v.url.startsWith?.('http') ? v.url : undefined)
          if (!url && v?.id) url = `https://www.youtube.com/watch?v=${v.id}`
          return {
            title: v?.title,
            url,
            videoId: v?.id,
            duration: v?.duration,
            views: v?.view_count,
            author: v?.uploader,
            thumbnail: v?.thumbnail,
          }
        })
        const results = mapped.filter((r) => {
          if (!r?.url) return false
          const u = String(r.url)
          const isWatch = /youtube\.com\/watch\?/.test(u) && /[?&]v=/.test(u)
          const isShort = /youtube\.com\/shorts\//.test(u) || /youtu\.be\//.test(u)
          const isPlaylistOnly = /youtube\.com\/(playlist|channel|@)/.test(u) && !isWatch && !isShort
          return (isWatch || isShort) && !isPlaylistOnly
        })
        return results
      }

      // 1) Intento con cookies/UA/extractor calculados
      let results = await runSearch(commonArgs)
      // 2) Si no hay resultados, reintentar sin cookies y con extractor web
      if (!results.length) {
        const stripped = (() => {
          const out = []
          for (let i=0; i<commonArgs.length; i++) {
            const a = commonArgs[i]
            if (a === '--cookies' || a === '--add-header') { i++; continue }
            if (a === '--cookies-from-browser') { continue }
            if (a === '--extractor-args') { i++; out.push('--extractor-args', 'youtube:player_client=web,lang=en,gl=US'); continue }
            out.push(a)
          }
          // Si no había extractor-args, añadir uno web explícito
          if (!out.includes('--extractor-args')) out.push('--extractor-args', 'youtube:player_client=web,lang=en,gl=US')
          return out
        })()
        try { results = await runSearch(stripped) } catch {}
      }
      return { data: { __local: true, success: results.length > 0, results }, status: 200 }
    } catch (e) {
      throw new Error('yt-dlp search falló: ' + (e?.message || e))
    }
  }

  // Headers dinámicos: admitir función async para proveedores con OAuth
  let dynHeaders = {}
  try {
    if (typeof provider?.headers === 'function') {
      const h = await provider.headers()
      if (h === null) throw new Error('headers-missing')
      dynHeaders = h || {}
    } else if (provider?.headers) {
      dynHeaders = provider.headers
    }
  } catch (e) {
    throw new Error('No se pudieron preparar headers: ' + (e?.message || e))
  }

  if (provider?.method === 'POST') {
    return http.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        ...dynHeaders
      },
      timeout: provider?.timeoutMs || 10000,
    })
  }
  return http.get(url, { headers: dynHeaders, timeout: provider?.timeoutMs || 10000 })
}

/**
 * Intenta descargar desde múltiples APIs con fallback automático
 * @param {string} type - Tipo de API (tiktok, instagram, etc.)
 * @param {string|object} param - URL o parámetro para la API
 * @param {object} options - Opciones adicionales
 * @returns {Promise<object>} Resultado parseado + {provider}
 */
export async function downloadWithFallback(type, param, options = {}, onProgress) {
  let providers = API_PROVIDERS[type]
  if (!providers?.length) throw new Error('Tipo de API no soportado: ' + type)

  // Forzar modo local si MEDIA_LOCAL_ONLY=true: usar solo providers con method LOCAL__*
  const localOnly = String(process.env.MEDIA_LOCAL_ONLY || 'false').toLowerCase() === 'true'
  if (localOnly) {
    providers = providers.filter(p => typeof p?.method === 'string' && p.method.startsWith('LOCAL__'))
  }

  // Política para YouTube: permitir deshabilitar providers locales (yt-dlp/ytdl-core/yt-search)
  const ytRemoteOnly = String(process.env.YT_REMOTE_ONLY || 'false').toLowerCase() === 'true'
  if (ytRemoteOnly && (type === 'youtube' || type === 'youtubeSearch')) {
    providers = providers.filter(p => p.method !== 'LOCAL__YTDLP_URL' && p.method !== 'LOCAL__YTDL_URL' && p.method !== 'LOCAL__YTSEARCH')
  }

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

      const { data, status } = await doRequest(provider, url, body, { ...extra, onProgress })

      const parsed = data?.__local ? data : (provider.parse?.(data, extra) || { success: false })

      if (parsed && parsed.success) {
        logger.info?.('✅ Descarga exitosa con ' + provider.name)
        return { ...parsed, provider: provider.name, httpStatus: status }
      }

      throw new Error('Respuesta no exitosa de la API (' + provider.name + ')')
    } catch (err) {
      const msg = provider.name + ': ' + (err?.message || 'Error desconocido')
      logger.warn?.('⚠️ Fallo con ' + msg)
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

export async function downloadYouTube(url, type = 'audio', onProgress) {
  return downloadWithFallback('youtube', url, { type }, onProgress)
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
