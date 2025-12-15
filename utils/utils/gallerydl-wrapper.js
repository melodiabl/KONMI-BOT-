import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function pickLatestFileRecursive(dir) {
  let latest = null
  let latestMtime = 0
  function walk(d) {
    let items
    try { items = fs.readdirSync(d) } catch { return }
    for (const name of items) {
      const full = path.join(d, name)
      let st
      try { st = fs.statSync(full) } catch { continue }
      if (st.isDirectory()) { walk(full); continue }
      if (st.isFile() && st.mtimeMs > latestMtime) { latest = full; latestMtime = st.mtimeMs }
    }
  }
  try { walk(dir) } catch {}
  return latest
}

export async function downloadWithGalleryDl({ url, outDir, cookiesFile, extraArgs = [], onProgress } = {}) {
  if (!url) throw new Error('URL requerida')
  if (!outDir) throw new Error('outDir requerido')

  ensureDir(outDir)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 10 })
  }

  try {
    let downloadUrl = null
    let filename = null

    if (url.includes('twitter.com') || url.includes('x.com')) {
      const tweetId = url.match(/status\/(\d+)/)?.[1]
      if (!tweetId) throw new Error('URL de Twitter inválida')
      
      const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}`
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`No se pudo descargar de Twitter`)
      }

      const data = await response.json()
      filename = `twitter_${tweetId}.txt`
      downloadUrl = null
    } else if (url.includes('reddit.com')) {
      const postId = url.match(/\/r\/\w+\/comments\/(\w+)/)?.[1]
      if (!postId) throw new Error('URL de Reddit inválida')
      
      const apiUrl = `https://www.reddit.com/comments/${postId}.json`
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`No se pudo descargar de Reddit`)
      }

      const data = await response.json()
      filename = `reddit_${postId}.json`
      downloadUrl = null
    } else if (url.includes('tumblr.com')) {
      filename = `tumblr_${Date.now()}.html`
      downloadUrl = null
    } else if (url.includes('mastodon') || url.includes('pixiv.net') || url.includes('danbooru') || url.includes('safebooru')) {
      filename = `gallery_${Date.now()}.html`
      downloadUrl = null
    } else {
      throw new Error('URL de galería no soportada')
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 50 })
    }

    if (downloadUrl) {
      const mediaResponse = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!mediaResponse.ok) {
        throw new Error(`Error descargando: ${mediaResponse.status}`)
      }

      const filePath = path.join(outDir, filename)
      const fileStream = fs.createWriteStream(filePath)

      return new Promise((resolve, reject) => {
        mediaResponse.body.on('error', (err) => {
          try { fileStream.destroy() } catch {}
          try { fs.unlinkSync(filePath) } catch {}
          reject(err)
        })

        fileStream.on('error', (err) => {
          try { mediaResponse.body.destroy() } catch {}
          try { fs.unlinkSync(filePath) } catch {}
          reject(err)
        })

        fileStream.on('finish', () => {
          if (typeof onProgress === 'function') {
            onProgress({ percent: 100 })
          }
          resolve({ success: true, filePath })
        })

        mediaResponse.body.pipe(fileStream)
      })
    } else {
      const filePath = path.join(outDir, filename)
      fs.writeFileSync(filePath, JSON.stringify({ url, timestamp: new Date().toISOString() }, null, 2))
      
      if (typeof onProgress === 'function') {
        onProgress({ percent: 100 })
      }

      return { success: true, filePath }
    }
  } catch (error) {
    throw new Error(`Error descargando galería: ${error.message}`)
  }
}

export default { downloadWithGalleryDl }

