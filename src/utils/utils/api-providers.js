// api-providers.js
// Utilidades para manejar múltiples APIs con fallback automático y formato unificado

import axios from 'axios'
import logger from '../../config/logger.js'
import { getSpotifyAccessToken } from './spotify-auth.js'
import { buildYtDlpCookieArgs } from './cookies.js'
import { downloadWithYtDlp } from './ytdlp-wrapper.js'
import { tmpdir } from 'os';
import { join as pathJoin, basename } from 'path';
import { mkdir, rm, readdir, stat } from 'fs/promises';
import ffmpegPath from 'ffmpeg-static'; // <--- Importado
import ytdl from 'ytdl-core'
import { Readable } from 'stream'
import { createWriteStream } from 'fs'

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

// yt-dlp tuning variables
const DEFAULT_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const YTDLP_USER_AGENT = process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || DEFAULT_WEB_UA
const YTDLP_EXTRACTOR_ARGS_BASE = process.env.YTDLP_EXTRACTOR_ARGS || process.env.YOUTUBE_EXTRACTOR_ARGS || 'youtube:player_client=android'
const YTDLP_PO_TOKEN = process.env.YTDLP_PO_TOKEN || process.env.YOUTUBE_PO_TOKEN || ''

function headerIfEnv(varName, headerName, prefix = '') {
  const key = process.env[varName]
  if (!key) return null
  return { [headerName]: prefix ? `${prefix}${key}` : key }
}

function buildYtDlpExecCookieOpts() {
  const args = buildYtDlpCookieArgs()
  if (!Array.isArray(args) || args.length < 2) return {}
  const [flag, value] = args
  if (!value) return {}
  if (flag === '--cookies') return { cookies: value }
  if (flag === '--cookies-from-browser') return { cookiesFromBrowser: value }
  if (flag === '--add-header') return { addHeader: [value] }
  return {}
}

function buildExtractorArgs() {
  const list = []
  if (YTDLP_EXTRACTOR_ARGS_BASE) list.push(YTDLP_EXTRACTOR_ARGS_BASE)
  if (YTDLP_PO_TOKEN) list.push(`youtube:po_token=${YTDLP_PO_TOKEN}`)
  if (!list.length) return undefined
  return list.length === 1 ? list[0] : list
}

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
    // Piped deshabilitado temporalmente por errores de provider
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
    // yt-dlp local search
    {
      name: 'yt-dlp (search local)',
      method: 'LOCAL__YTDLP_SEARCH',
      url: (query) => `ytsearch10:${query}`,
      parse: (data) => data,
    },
    // Piped Search
    {
      name: 'Piped.video Search',
      timeoutMs: 5000,
      url: (query) => `https://piped.video/api/v1/search?q=${encodeURIComponent(query)}&region=US`,
      parse: (data) => {
        const items = Array.isArray(data) ? data : []
        const vids = items.filter(i => (i?.type||'').toLowerCase()==='video')
        if (!vids.length) return { success: false }
        return { success: true, results: vids.map(v=>({
          title: v?.title,
          url: v?.url?.startsWith('http') ? v.url : (v?.url ? `https://youtube.com${v.url}` : undefined),
          videoId: v?.url?.includes('watch?v=') ? (v.url.split('v=')[1]||'').split('&')[0] : undefined,
          duration: v?.duration,
          views: v?.views,
          author: v?.uploaderName || v?.uploader,
          thumbnail: Array.isArray(v?.thumbnailUrl) ? v.thumbnailUrl[0] : v?.thumbnail,
        }))}
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
          results: [{
            title: r.title,
            url: r.url,
            videoId: (r.url || '').split('v=')[1] || undefined,
            duration: r.duration,
            views: r.views,
            author: r.channel,
            thumbnail: r.thumbnail,
          }]
        }
      },
    },
    // Último recurso local: paquete yt-search
    {
      name: 'yt-search (local)',
      method: 'LOCAL__YTSEARCH',
      url: (query) => query,
      parse: (data) => data,
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
    },
  ],

  weather: [
    {
      name: 'WeatherAPI',
      url: (city) => `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      parse: (data) => ({
        success: Array.isArray(data?.current_condition),
        city: data?.nearest_area?.[0]?.areaName?.[0]?.value,
        temperature: data?.current_condition?.[0]?.temp_C,
        description: data?.current_condition?.[0]?.weatherDesc?.[0]?.value,
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

/**
 * Helper para verificar existencia de archivo
 */
async function fileExists(path) {
    try { await stat(path); return true; } catch { return false; }
}

/**
 * Realiza una petición HTTP
 */
async function doRequest(provider, url, body, extraCtx) {
  // Proveedor local (yt-search)
  if (provider?.method === 'LOCAL__YTSEARCH') {
    try {
      const mod = await import('yt-search')
      const ytSearch = mod.default || mod
      const r = await ytSearch(url)
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
    } catch (e) { throw new Error('yt-search local falló: ' + (e?.message || e)) }
  }

  // Proveedor local: ytdl-core
  if (provider?.method === 'LOCAL__YTDL_URL') {
    try {
      const mod = await import('ytdl-core')
      const ytdl = mod.default || mod
      const info = await ytdl.getInfo(url)
      let chosen
      try { chosen = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' }) } 
      catch (_) { chosen = (info.formats || []).filter((f) => f.hasAudio && !f.hasVideo)?.[0] }
      const direct = chosen?.url
      return {
        data: { __local: true, success: Boolean(direct), download: direct, quality: chosen?.audioBitrate },
        status: 200,
      }
    } catch (e) { throw new Error('ytdl-core url falló: ' + (e?.message || e)) }
  }

  // Proveedor local: yt-dlp con soporte para progreso en tiempo real
  if (provider?.method === 'LOCAL__YTDLP_URL') {
    let tempDir = null;
    try {
        const onProgress = extraCtx?.onProgress;
        const want = (extraCtx && (extraCtx.__ytdlpType || extraCtx.type)) || 'audio';
        const isAudioDownload = want === 'audio';
        const isVideoDownload = want === 'video';
        const isUrlOnly = !isAudioDownload && !isVideoDownload;

        // Configuración de carpeta temporal para descargas
        if (isAudioDownload || isVideoDownload) {
            tempDir = pathJoin(tmpdir(), `konmi-dl-${Date.now()}-${Math.random().toString(16).slice(2)}`);
            await mkdir(tempDir, { recursive: true });
        }

        // Solo usar downloadWithYtDlp si es descarga de audio o video
        if (isAudioDownload || isVideoDownload) {
            try {
                const downloadResult = await downloadWithYtDlp({
                    url,
                    outDir: tempDir,
                    audioOnly: isAudioDownload,
                    format: undefined,
                    onProgress: (info) => {
                        if (typeof onProgress === 'function') {
                            onProgress({
                                percent: info?.percent || 0,
                                status: info?.status || 'descargando',
                                downloaded: info?.downloaded || 0,
                                total: info?.total || 0,
                                speed: info?.speed || 'N/A',
                                eta: info?.eta || ''
                            });
                        }
                    },
                    ffmpegPath: ffmpegPath
                });

                if (downloadResult?.success && downloadResult?.filePath) {
                    return {
                        data: {
                            __local: true,
                            success: true,
                            download: { url: downloadResult.filePath, isLocal: true },
                            tempDir: tempDir
                        },
                        status: 200
                    };
                }
                throw new Error('yt-dlp no retornó archivo válido');
            } catch (error) {
                // Fallback a yt-dlp-exec si downloadWithYtDlp falla
                console.warn('downloadWithYtDlp falló, intentando yt-dlp-exec:', error?.message);
            }
        }

        // Fallback para URLs solo (sin descarga local) usando yt-dlp-exec
        try {
            const execMod = await import('yt-dlp-exec');
            const ytdlp = execMod.default || execMod;

            const cookieOpts = buildYtDlpExecCookieOpts();
            const extractorArgs = buildExtractorArgs();
            const optsBase = {
                noWarnings: true,
                preferFreeFormats: false,
                retries: 1,
                quiet: true,
                dumpSingleJson: true,
                userAgent: YTDLP_USER_AGENT,
                extractorArgs,
                ...cookieOpts
            };

            if (ytdlp) {
                const info = await ytdlp(url, optsBase);
                let chosenUrl = null;
                if (Array.isArray(info?.requested_downloads) && info.requested_downloads.length) {
                    chosenUrl = info.requested_downloads[0]?.url || null;
                }
                if (!chosenUrl && Array.isArray(info?.requested_formats)) {
                    chosenUrl = info.requested_formats[0]?.url || null;
                }
                if (chosenUrl) {
                    return {
                        data: {
                            __local: true,
                            success: true,
                            download: chosenUrl,
                            title: info?.title
                        },
                        status: 200
                    };
                }
            }
        } catch (_) {
            // Ignorar fallback silenciosamente si falla
        }

        throw new Error('No se pudo descargar el contenido (ambos métodos fallaron)');

    } catch (e) {
        if (tempDir) { try { await rm(tempDir, { recursive: true, force: true }); } catch {} }
        throw new Error((e && e.stderr) ? String(e.stderr).slice(0, 200) : (e?.message || e));
    }
  }

  // Proveedor local: yt-dlp search
  if (provider?.method === 'LOCAL__YTDLP_SEARCH') {
      try {
          const execMod = await import('child_process');
          const util = await import('util');
          const execPromise = util.promisify(execMod.exec);
          // Ejecución simple para búsqueda
          const { stdout } = await execPromise(`yt-dlp "ytsearch10:${url}" --flat-playlist -J --no-warnings`);
          const json = JSON.parse(stdout);
          const entries = json.entries || [];
          const results = entries.map(v => ({
              title: v.title,
              url: v.url,
              videoId: v.id,
              duration: v.duration,
              views: v.view_count,
              author: v.uploader
          }));
          return { data: { __local: true, success: results.length > 0, results }, status: 200 };
      } catch(e) { throw new Error('yt-dlp search error: ' + e.message); }
  }

  // Peticiones HTTP normales
  let dynHeaders = {}
  if (typeof provider?.headers === 'function') {
      try { dynHeaders = (await provider.headers()) || {} } catch {}
  } else if (provider?.headers) { dynHeaders = provider.headers }

  if (provider?.method === 'POST') {
    return http.post(url, body, { headers: { ...dynHeaders }, timeout: provider?.timeoutMs || 10000 })
  }
  return http.get(url, { headers: dynHeaders, timeout: provider?.timeoutMs || 10000 })
}

/**
 * Intenta descargar desde múltiples APIs con fallback automático
 */
export async function downloadWithFallback(type, param, options = {}, onProgress) {
  let providers = API_PROVIDERS[type]
  if (!providers?.length) throw new Error('Tipo de API no soportado: ' + type)

  const errors = []

  for (const provider of providers) {
    if (provider.headers === null) continue

    try {
      let url
      let extra = {}

      if (typeof provider.url === 'function') {
        const res = await provider.url(param, options)
        if (res && typeof res === 'object' && res.url) { url = res.url; extra = res } 
        else { url = res }
      } else { url = provider.url }

      const body = typeof provider.body === 'function' ? provider.body(param, options) : provider.body
      const { data, status } = await doRequest(provider, url, body, { ...extra, onProgress })
      const parsed = data?.__local ? data : (provider.parse?.(data, extra) || { success: false })

      if (parsed && parsed.success) {
        return { ...parsed, provider: provider.name, httpStatus: status }
      }
      throw new Error('Respuesta no exitosa de la API (' + provider.name + ')')
    } catch (err) {
      errors.push(provider.name + ': ' + (err?.message || 'Error desconocido'))
      continue
    }
  }
  throw new Error('Todos los proveedores fallaron:\n' + errors.join('\n'))
}

/**
 * Descarga audio/video de YouTube usando ytdl-core directamente como Buffer
 */
async function downloadYouTubeAsBuffer(videoUrl, type = 'audio', onProgress) {
  try {
    const info = await ytdl.getInfo(videoUrl, {
      requestOptions: {
        headers: { 'user-agent': DEFAULT_WEB_UA }
      }
    });
    let chosen;
    
    if (type === 'audio') {
      try {
        chosen = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
      } catch (_) {
        chosen = (info.formats || []).filter((f) => f.hasAudio && !f.hasVideo)?.[0];
      }
    } else {
      try {
        chosen = ytdl.chooseFormat(info.formats, { quality: 'highest' });
      } catch (_) {
        chosen = (info.formats || []).filter((f) => f.hasVideo)?.[0];
      }
    }

    if (!chosen?.url) {
      throw new Error('No se encontró formato válido');
    }

    const stream = ytdl.downloadFromInfo(info, { format: chosen });
    const chunks = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        if (typeof onProgress === 'function') {
          onProgress({ percent: (chunks.length % 100) });
        }
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          success: true,
          download: buffer,
          quality: chosen.quality,
          title: info.videoDetails?.title,
          duration: info.videoDetails?.lengthSeconds
        });
      });

      stream.on('error', (err) => {
        reject(new Error('Error descargando: ' + err.message));
      });
    });
  } catch (error) {
    logger.error('Error en downloadYouTubeAsBuffer:', error.message);
    throw error;
  }
}

// Exportaciones
export async function searchYouTubeMusic(query) { return downloadWithFallback('youtubeSearch', query) }
export async function downloadYouTube(url, type = 'audio', onProgress) {
  try {
    return await downloadYouTubeAsBuffer(url, type, onProgress);
  } catch (error) {
    logger.warn('ytdl-core falló, intentando fallback:', error.message);
    return downloadWithFallback('youtube', url, { type }, onProgress);
  }
}
export async function downloadTikTok(url) { return downloadWithFallback('tiktok', url) }
export async function downloadInstagram(url) { return downloadWithFallback('instagram', url) }
export async function downloadFacebook(url) { return downloadWithFallback('facebook', url) }
export async function downloadTwitter(url) { return downloadWithFallback('twitter', url) }
export async function downloadPinterest(url) { return downloadWithFallback('pinterest', url) }
export async function searchSpotify(query) { return downloadWithFallback('spotify', query) }
export async function translateText(text, targetLang, sourceLang) { return downloadWithFallback('translate', text, { sourceLang, targetLang }) }
export async function getWeather(city) { return downloadWithFallback('weather', city) }
export async function getRandomQuote() { return downloadWithFallback('quote', null) }
export async function getRandomFact() { return downloadWithFallback('fact', null) }
export async function getTrivia() { return downloadWithFallback('trivia', null) }
export async function getRandomMeme() { return downloadWithFallback('meme', null) }

export default {
  API_PROVIDERS,
  downloadWithFallback,
  searchYouTubeMusic,
  downloadYouTube,
  searchSpotify
}
