// api-providers.js
// Utilidades para manejar múltiples APIs con fallback automático y formato unificado

import axios from 'axios'
import logger from '../config/logger.js'
import { getSpotifyAccessToken } from './spotify-auth.js'

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
    }
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

  // Proveedor local: yt-dlp-exec para obtener URL directa robusta
  if (provider?.method === 'LOCAL__YTDLP_URL') {
    try {
      let ytdlp
      try {
        const execMod = await import('yt-dlp-exec')
        ytdlp = execMod.default || execMod
      } catch (_) {
        ytdlp = null
      }
      const want = (extraCtx && (extraCtx.__ytdlpType || extraCtx.type)) || 'audio'
      const opts = {
        dumpSingleJson: true,
        noWarnings: true,
        preferFreeFormats: false,
        // Elegir formatos progresivos para descarga directa
        format: want === 'audio' ? 'bestaudio[ext=m4a]/bestaudio/best' : 'best[ext=mp4]/best',
        retries: 1,
        quiet: true,
      }
      let info
      if (ytdlp) {
        info = await ytdlp(url, opts)
      } else {
        const { spawn } = await import('child_process')
        const commonArgs = [
          '--dump-single-json',
          '--no-warnings',
          '--retries', '1',
          '-f', opts.format,
          url,
        ]
        const tryCmd = async (cmd, args) => new Promise((resolve, reject) => {
          const p = spawn(cmd, args, { windowsHide: true })
          let out = ''
          let err = ''
          p.stdout.on('data', (d) => out += d.toString())
          p.stderr.on('data', (d) => err += d.toString())
          p.on('error', (e) => reject(e))
          p.on('close', (code) => {
            if (code === 0) {
              try { resolve(JSON.parse(out)) } catch (e) { reject(new Error('yt-dlp JSON parse fail')) }
            } else reject(new Error(err || ('exit '+code)))
          })
        })

        const binEnv = process.env.YTDLP_PATH || process.env.YTDLP_BIN || null
        const candidates = []
        if (binEnv) candidates.push(binEnv)
        candidates.push('yt-dlp', 'yt')
        let lastErr
        for (const c of candidates) {
          try { info = await tryCmd(c, commonArgs); lastErr = null; break } catch (e) { lastErr = e }
        }
        if (!info) {
          const pyCandidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
          for (const py of pyCandidates) {
            try { info = await tryCmd(py, ['-m', 'yt_dlp', ...commonArgs]); lastErr = null; break } catch (e) { lastErr = e }
          }
        }
        if (!info) throw lastErr || new Error('yt-dlp no disponible en PATH')
      }
      const pickFromFormats = (formats, predicate) => {
        if (!Array.isArray(formats)) return null
        const list = formats.filter(predicate)
        if (!list.length) return null
        return list.sort((a,b)=> (b.abr||b.tbr||0) - (a.abr||a.tbr||0))[0]
      }
      let chosenUrl = null
      if (Array.isArray(info?.requested_downloads) && info.requested_downloads.length) {
        chosenUrl = info.requested_downloads[0]?.url || null
      }
      if (!chosenUrl && Array.isArray(info?.requested_formats)) {
        chosenUrl = info.requested_formats[0]?.url || null
      }
      if (!chosenUrl && info?.url) chosenUrl = info.url
      if (!chosenUrl && Array.isArray(info?.formats)) {
        if (want === 'audio') {
          const f = pickFromFormats(info.formats, f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
          chosenUrl = f?.url || null
        } else {
          const f = pickFromFormats(info.formats, f => (f.ext === 'mp4' || /mp4|m4v/i.test(f.ext)) && (f.vcodec && f.vcodec !== 'none'))
          chosenUrl = f?.url || null
        }
      }
      return { data: { __local: true, success: Boolean(chosenUrl), download: chosenUrl, title: info?.title, quality: info?.quality }, status: 200 }
    } catch (e) {
      throw new Error((e && e.stderr) ? String(e.stderr).slice(0,200) : (e?.message || e))
    }
  }

  // Proveedor local: yt-dlp para búsqueda (ytsearchN:query)
  if (provider?.method === 'LOCAL__YTDLP_SEARCH') {
    try {
      // url aquí es el término completo como "ytsearch10:query"
      const execMod = await import('child_process')
      const { spawn } = execMod
      const args = ['-J', url]
      const cmd = process.env.YTDLP_PATH || 'yt-dlp'
      const p = spawn(cmd, args, { windowsHide: true })
      let out = ''
      let err = ''
      await new Promise((resolve, reject) => {
        p.stdout.on('data', (d) => (out += d.toString()))
        p.stderr.on('data', (d) => (err += d.toString()))
        p.on('error', (e) => reject(e))
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || ('exit ' + code)))))
      })
      let json
      try { json = JSON.parse(out) } catch (e) { throw new Error('yt-dlp search JSON inválido') }
      const entries = Array.isArray(json?.entries) ? json.entries : []
      const results = entries.map((v) => ({
        title: v?.title,
        url: v?.webpage_url || (v?.url && v.url.startsWith('http') ? v.url : undefined),
        videoId: v?.id,
        duration: v?.duration,
        views: v?.view_count,
        author: v?.uploader,
        thumbnail: v?.thumbnail,
      }))
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
export async function downloadWithFallback(type, param, options = {}) {
  let providers = API_PROVIDERS[type]
  if (!providers?.length) throw new Error('Tipo de API no soportado: ' + type)

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

      const { data, status } = await doRequest(provider, url, body, extra)

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
