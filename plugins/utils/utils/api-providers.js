// api-providers.js - Versión SIN PYTHON (Pterodactyl friendly)
import axios from 'axios'
import logger from '../../config/logger.js'
import { getSpotifyAccessToken } from './spotify-auth.js'
import ytdl from 'ytdl-core'
import fs from 'fs/promises'
import { downloadWithYtDlp } from './ytdlp-wrapper.js'

/* ===== Sistema de Logs para API Providers ===== */
const LOG_COLORS = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[34m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  SUCCESS: '\x1b[32m',
  API: '\x1b[35m',
  RESET: '\x1b[0m'
}

const LOG_ICONS = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  SUCCESS: '✅',
  API: '🌐'
}

function logAPI(level, source, message, data = null) {
  const timestamp = new Date().toISOString()
  const color = LOG_COLORS[level] || LOG_COLORS.RESET
  const icon = LOG_ICONS[level] || '•'
  const reset = LOG_COLORS.RESET

  let logMsg = `${color}${icon} [${timestamp}] [API:${source}] ${message}${reset}`

  if (data) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
    logMsg += `\n${color}${dataStr}${reset}`
  }

  console.log(logMsg)
}

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'KonmiBot/2.x (+https://example.local)'
  },
  validateStatus: (s) => s >= 200 && s < 500
})

const DEFAULT_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
    // Este provider local de ytdl-core queda sin usar directamente porque ahora
    // la descarga principal la maneja downloadYouTube() con yt-dlp + ytdl-core.
    // Lo dejamos comentado para evitar duplicar lógica.
    //
    // {
    //   name: 'ytdl-core (local url)',
    //   method: 'LOCAL__YTDL_URL',
    //   url: (videoUrl, options = {}) => videoUrl,
    //   parse: (data) => data
    // },
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
    }
  ],

  youtubeSearch: [
    {
      name: 'yt-search (local)',
      method: 'LOCAL__YTSEARCH',
      url: (query) => query,
      parse: (data) => data
    },
    {
      name: 'Piped.video Search',
      timeoutMs: 5000,
      url: (query) => `https://piped.video/api/v1/search?q=${encodeURIComponent(query)}&region=US`,
      parse: (data) => {
        const items = Array.isArray(data) ? data : []
        const vids = items.filter(i => (i?.type || '').toLowerCase() === 'video')
        if (!vids.length) return { success: false }
        return {
          success: true,
          results: vids.map(v => ({
            title: v?.title,
            url: v?.url?.startsWith('http') ? v.url : (v?.url ? `https://youtube.com${v.url}` : undefined),
            videoId: v?.url?.includes('watch?v=') ? (v.url.split('v=')[1] || '').split('&')[0] : undefined,
            duration: v?.duration,
            views: v?.views,
            author: v?.uploaderName || v?.uploader,
            thumbnail: Array.isArray(v?.thumbnailUrl) ? v.thumbnailUrl[0] : v?.thumbnail
          }))
        }
      }
    },
    {
      name: 'AbhiAPI',
      timeoutMs: 6000,
      url: (query) => `https://abhi-api.vercel.app/api/search/yts?text=${encodeURIComponent(query)}`,
      parse: (data) => {
        const r = data?.result
        if (!r?.url) return { success: false }
        return {
          success: true,
          results: [{
            title: r.title,
            url: r.url,
            videoId: (r.url || '').split('v=')[1] || undefined,
            duration: r.duration,
            views: r.views,
            author: r.channel,
            thumbnail: r.thumbnail
          }]
        }
      }
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
    }
  ],

  spotify: [
    {
      name: 'Spotify API',
      headers: async () => {
        try {
          const token = await getSpotifyAccessToken()
          if (!token) return null
          return { Authorization: `Bearer ${token}` }
        } catch (e) { throw new Error(e?.message || 'spotify token error') }
      },
      url: async (query) => {
        const q = String(query || '').trim()
        const match = q.match(/(?:track\/(\w+)|spotify:track:(\w+))/i)
        if (match && (match[1] || match[2])) {
          return `https://api.spotify.com/v1/tracks/${match[1] || match[2]}`
        }
        return `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`
      },
      parse: (data) => {
        const track = data?.tracks?.items?.[0] || data
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
    }
  ],

  weather: [
    {
      name: 'WeatherAPI',
      url: (city) => `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      parse: (data) => ({
        success: Array.isArray(data?.current_condition),
        city: data?.nearest_area?.[0]?.areaName?.[0]?.value,
        temperature: data?.current_condition?.[0]?.temp_C,
        description: data?.current_condition?.[0]?.weatherDesc?.[0]?.value
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
        author: data?.author
      })
    }
  ],

  fact: [
    {
      name: 'UselessFacts',
      url: () => 'https://uselessfacts.jsph.pl/random.json?language=en',
      parse: (data) => ({ success: Boolean(data?.text), fact: data?.text })
    }
  ],

  trivia: [
    {
      name: 'OpenTriviaDB',
      url: () => 'https://opentdb.com/api.php?amount=1&type=multiple',
      parse: (data) => ({
        success: data?.response_code === 0,
        question: data?.results?.[0]?.question,
        correct_answer: data?.results?.[0]?.correct_answer
      })
    }
  ],

  meme: [
    {
      name: 'MemeAPI',
      url: () => 'https://meme-api.com/gimme',
      parse: (data) => ({ success: Boolean(data?.url), image: data?.url, title: data?.title })
    }
  ]
}

/* ========== DO REQUEST & FALLBACK ========== */

async function doRequest(provider, url, body, extraCtx) {
  // Logging reducido para evitar spam
  // logAPI('INFO', provider.name, `🔄 Attempting request`)

  // LOCAL__YTSEARCH (yt-search lib)
  if (provider?.method === 'LOCAL__YTSEARCH') {
    try {
      logAPI('DEBUG', 'yt-search', 'Executing local yt-search')
      const mod = await import('yt-search')
      const ytSearch = mod.default || mod
      const r = await ytSearch(url)
      const list = Array.isArray(r?.videos) ? r.videos : []
      logAPI('SUCCESS', 'yt-search', `Found ${list.length} results`)
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
      logAPI('ERROR', 'yt-search', 'Local search failed', { error: e?.message })
      throw new Error('yt-search local falló: ' + (e?.message || e))
    }
  }

  // LOCAL__YTDL_URL (ya no usado porque comentamos el provider,
  // pero dejamos el código por si lo reactivas en el futuro)
  if (provider?.method === 'LOCAL__YTDL_URL') {
    try {
      logAPI('DEBUG', 'ytdl-core', 'Attempting ytdl-core download', { url })
      const info = await ytdl.getInfo(url, {
        requestOptions: { headers: { 'user-agent': DEFAULT_WEB_UA } }
      })

      logAPI('DEBUG', 'ytdl-core', `Got info for video: ${info.videoDetails?.title}`)

      let chosen
      try {
        chosen = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
        logAPI('SUCCESS', 'ytdl-core', 'Format chosen: highestaudio')
      } catch (_) {
        chosen = (info.formats || []).filter((f) => f.hasAudio && !f.hasVideo)?.[0]
        logAPI('WARN', 'ytdl-core', 'Fallback to first audio-only format')
      }

      const direct = chosen?.url
      if (!direct) {
        logAPI('ERROR', 'ytdl-core', 'No direct URL found')
        throw new Error('No direct URL')
      }

      logAPI('SUCCESS', 'ytdl-core', 'Got direct URL', { quality: chosen?.audioBitrate })

      return {
        data: { __local: true, success: Boolean(direct), download: direct, quality: chosen?.audioBitrate },
        status: 200
      }
    } catch (e) {
      logAPI('ERROR', 'ytdl-core', 'ytdl-core failed', {
        error: e?.message,
        statusCode: e?.statusCode
      })
      throw new Error('ytdl-core url falló: ' + (e?.message || e))
    }
  }

  // HTTP requests normales
  let dynHeaders = {}
  if (typeof provider?.headers === 'function') {
    try {
      dynHeaders = (await provider.headers()) || {}
      logAPI('DEBUG', provider.name, 'Dynamic headers loaded')
    } catch (e) {
      logAPI('WARN', provider.name, 'Failed to load dynamic headers', { error: e?.message })
    }
  } else if (provider?.headers) {
    dynHeaders = provider.headers
  }

  if (provider?.method === 'POST') {
    logAPI('INFO', provider.name, 'Sending POST request')
    return http.post(url, body, { headers: { ...dynHeaders }, timeout: provider?.timeoutMs || 10000 })
  }

  // logAPI('INFO', provider.name, 'Sending GET request')
  return http.get(url, { headers: dynHeaders, timeout: provider?.timeoutMs || 10000 })
}

/* ========== DESCARGA YOUTUBE COMO BUFFER (SOLO YTDL-CORE) ========== */

async function downloadYouTubeAsBuffer(videoUrl, type = 'audio', onProgress) {
  try {
    logAPI('INFO', 'ytdl-buffer', 'Starting ytdl-core buffer download', {
      url: videoUrl,
      type
    })

    const info = await ytdl.getInfo(videoUrl, {
      requestOptions: {
        headers: { 'user-agent': DEFAULT_WEB_UA }
      }
    })

    logAPI('DEBUG', 'ytdl-buffer', 'Got video info', {
      title: info.videoDetails?.title,
      duration: info.videoDetails?.lengthSeconds,
      formats: info.formats?.length
    })

    let chosen

    if (type === 'audio') {
      try {
        chosen = ytdl.chooseFormat(info.formats, {
          quality: 'highestaudio',
          filter: 'audioonly'
        })
        logAPI('SUCCESS', 'ytdl-buffer', 'Audio format chosen')
      } catch (_) {
        chosen = (info.formats || []).filter((f) => f.hasAudio && !f.hasVideo)?.[0]
        logAPI('WARN', 'ytdl-buffer', 'Using fallback audio format')
      }
    } else {
      try {
        chosen = ytdl.chooseFormat(info.formats, { quality: 'highest' })
        logAPI('SUCCESS', 'ytdl-buffer', 'Video format chosen')
      } catch (_) {
        chosen = (info.formats || []).filter((f) => f.hasVideo)?.[0]
        logAPI('WARN', 'ytdl-buffer', 'Using fallback video format')
      }
    }

    if (!chosen?.url) {
      logAPI('ERROR', 'ytdl-buffer', 'No valid format found')
      throw new Error('No se encontró formato válido')
    }

    const totalBytes = Number(chosen.contentLength || chosen.clen || 0) || 0

    logAPI('INFO', 'ytdl-buffer', 'Starting stream download', {
      quality: chosen.quality,
      container: chosen.container,
      totalBytes: totalBytes || 'desconocido'
    })

    const stream = ytdl.downloadFromInfo(info, { format: chosen })
    const chunks = []

    let downloadedBytes = 0
    let lastNotified = 0

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk)
        downloadedBytes += chunk.length

        const now = Date.now()

        // Notificar como máximo ~1 vez por segundo
        if (typeof onProgress === 'function' && now - lastNotified > 1000) {
          lastNotified = now

          let percent = null
          if (totalBytes > 0) {
            percent = Math.max(
              0,
              Math.min(100, (downloadedBytes / totalBytes) * 100)
            )
          }

          onProgress({
            percent,
            downloadedBytes,
            totalBytes,
            status: 'descargando'
          })
        }
      })

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks)

        logAPI('SUCCESS', 'ytdl-buffer', 'Download completed', {
          bufferSize: `${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
          downloadedBytes,
          totalBytes,
          title: info.videoDetails?.title
        })

        // Aseguramos 100% al final
        if (typeof onProgress === 'function') {
          onProgress({
            percent: 100,
            downloadedBytes,
            totalBytes,
            status: 'completado'
          })
        }

        resolve({
          success: true,
          download: buffer,
          quality: chosen.quality,
          title: info.videoDetails?.title,
          duration: info.videoDetails?.lengthSeconds
        })
      })

      stream.on('error', (err) => {
        logAPI('ERROR', 'ytdl-buffer', 'Stream error', {
          error: err.message,
          statusCode: err?.statusCode
        })

        reject(new Error('Error descargando: ' + err.message))
      })
    })
  } catch (error) {
    logAPI('ERROR', 'ytdl-buffer', 'Complete failure', {
      error: error.message,
      statusCode: error?.statusCode
    })

    logger.error('Error en downloadYouTubeAsBuffer:', error.message)
    throw error
  }
}

/* ========== FALLBACK GENÉRICO ========== */

export async function downloadWithFallback(type, param, options = {}, onProgress) {
  let providers = API_PROVIDERS[type]
  if (!providers?.length) {
    logAPI('ERROR', 'FALLBACK', 'Unsupported API type', { type })
    throw new Error('Tipo de API no soportado: ' + type)
  }

  logAPI('INFO', 'FALLBACK', `Starting fallback chain for ${type}`, {
    providers: providers.map(p => p.name),
    param: typeof param === 'string' ? param.substring(0, 100) : 'complex',
    options
  })

  const errors = []

  for (const provider of providers) {
    if (provider.headers === null) continue

    try {
      logAPI('INFO', 'FALLBACK', `Trying provider: ${provider.name}`)

      let url
      let extra = {}

      if (typeof provider.url === 'function') {
        const res = await provider.url(param, options)
        if (res && typeof res === 'object' && res.url) {
          url = res.url
          extra = res
        } else {
          url = res
        }
      } else {
        url = provider.url
      }

      const body = typeof provider.body === 'function' ? provider.body(param, options) : provider.body

      const { data, status } = await doRequest(provider, url, body, { ...extra, onProgress })

      logAPI('DEBUG', 'FALLBACK', `Response received from ${provider.name}`, {
        status,
        hasData: !!data,
        isLocal: data?.__local
      })

      const parsed = data?.__local ? data : (provider.parse?.(data, extra) || { success: false })

      if (parsed && parsed.success) {
        logAPI('SUCCESS', 'FALLBACK', `✅ Provider ${provider.name} succeeded!`, {
          provider: provider.name,
          httpStatus: status
        })

        return { ...parsed, provider: provider.name, httpStatus: status }
      }

      throw new Error('Respuesta no exitosa de la API (' + provider.name + ')')
    } catch (err) {
      const errorMsg = provider.name + ': ' + (err?.message || 'Error desconocido')
      errors.push(errorMsg)

      logAPI('ERROR', 'FALLBACK', `Provider ${provider.name} failed`, {
        error: err?.message,
        statusCode: err?.response?.status,
        stack: err?.stack?.split('\n').slice(0, 3).join('\n')
      })

      continue
    }
  }

  logAPI('ERROR', 'FALLBACK', `❌ ALL PROVIDERS FAILED for ${type}`, {
    totalProviders: providers.length,
    errors: errors
  })

  throw new Error('Todos los proveedores fallaron:\n' + errors.join('\n'))
}

/* ========== EXPORTS DE ALTO NIVEL ========== */

export async function searchYouTubeMusic(query) {
  logAPI('INFO', 'EXPORT', 'searchYouTubeMusic called', { query: query?.substring(0, 50) })
  return downloadWithFallback('youtubeSearch', query)
}

export async function downloadYouTube(url, type = 'audio', onProgress) {
  logAPI('INFO', 'EXPORT', 'downloadYouTube called', {
    url: url?.substring(0, 100),
    type
  })

  const isAudio = type === 'audio'

  // 1) PRIMER INTENTO: yt-dlp binario (alta calidad con ffmpeg-static)
  try {
    logAPI('INFO', 'EXPORT', 'Trying yt-dlp binary first', {
      url,
      type
    })

    const dl = await downloadWithYtDlp({
      url,
      outDir: '/tmp/konmi-yt',
      audioOnly: isAudio,
      highQuality: true,
      onProgress
    })

    if (dl?.success && dl.filePath) {
      const buffer = await fs.readFile(dl.filePath).catch(() => null)

      // Limpieza best effort
      try {
        await fs.unlink(dl.filePath)
      } catch {}

      if (!buffer) {
        throw new Error('No se pudo leer el archivo descargado')
      }

      logAPI('SUCCESS', 'EXPORT', 'downloadYouTube succeeded via yt-dlp binary', {
        isAudio,
        fileSizeMB: (buffer.length / 1024 / 1024).toFixed(2)
      })

      return {
        success: true,
        download: buffer,
        quality: dl.quality || (isAudio ? 'bestaudio' : 'best')
      }
    }

    logAPI('WARN', 'EXPORT', 'yt-dlp returned no file, falling back', { dl })
  } catch (error) {
    const msg = String(error?.message || '')
    logAPI('WARN', 'EXPORT', 'yt-dlp binary failed', {
      error: msg
    })
    // NO lanzamos todavía, seguimos con ytdl-core
  }

  // 2) SEGUNDO INTENTO: ytdl-core (buffer directo)
  try {
    const result = await downloadYouTubeAsBuffer(url, type, onProgress)
    logAPI('SUCCESS', 'EXPORT', 'downloadYouTube succeeded via ytdl-buffer fallback')
    return result
  } catch (error) {
    const msg = String(error?.message || '')
    logAPI('WARN', 'EXPORT', 'ytdl-core fallback failed, trying HTTP providers', {
      error: msg
    })
    // Seguimos con fallback HTTP
  }

  // 3) ÚLTIMO INTENTO: proveedores HTTP (Piped, Vreden, etc.)
  const fb = await downloadWithFallback('youtube', url, { type }, onProgress)
  return fb
}

export async function downloadTikTok(url) {
  logAPI('INFO', 'EXPORT', 'downloadTikTok called')
  return downloadWithFallback('tiktok', url)
}

export async function downloadInstagram(url) {
  logAPI('INFO', 'EXPORT', 'downloadInstagram called')
  return downloadWithFallback('instagram', url)
}

export async function downloadFacebook(url) {
  logAPI('INFO', 'EXPORT', 'downloadFacebook called')
  return downloadWithFallback('facebook', url)
}

export async function downloadTwitter(url) {
  logAPI('INFO', 'EXPORT', 'downloadTwitter called')
  return downloadWithFallback('twitter', url)
}

export async function downloadPinterest(url) {
  logAPI('INFO', 'EXPORT', 'downloadPinterest called')
  return downloadWithFallback('pinterest', url)
}

export async function searchSpotify(query) {
  logAPI('INFO', 'EXPORT', 'searchSpotify called')
  return downloadWithFallback('spotify', query)
}

export async function translateText(text, targetLang, sourceLang) {
  logAPI('INFO', 'EXPORT', 'translateText called')
  return downloadWithFallback('translate', text, { sourceLang, targetLang })
}

export async function getWeather(city) {
  logAPI('INFO', 'EXPORT', 'getWeather called')
  return downloadWithFallback('weather', city)
}

export async function getRandomQuote() {
  logAPI('INFO', 'EXPORT', 'getRandomQuote called')
  return downloadWithFallback('quote', null)
}

export async function getRandomFact() {
  logAPI('INFO', 'EXPORT', 'getRandomFact called')
  return downloadWithFallback('fact', null)
}

export async function getTrivia() {
  logAPI('INFO', 'EXPORT', 'getTrivia called')
  return downloadWithFallback('trivia', null)
}

export async function getRandomMeme() {
  logAPI('INFO', 'EXPORT', 'getRandomMeme called')
  return downloadWithFallback('meme', null)
}

export default {
  API_PROVIDERS,
  downloadWithFallback,
  searchYouTubeMusic,
  downloadYouTube,
  searchSpotify
}

