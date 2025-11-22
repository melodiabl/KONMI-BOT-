#!/usr/bin/env node
import os from 'os'
import fs from 'fs'
import path from 'path'
import ytdlp from 'yt-dlp-exec'
import '../src/config/config.js'
import { buildYtDlpCookieArgs } from '../src/utils/utils/cookies.js'

function log(...a){ console.log('[diag:yt]', ...a) }
function fail(msg){ console.error('[diag:yt] ERROR:', msg); process.exitCode = 1 }

const cookieArgs = () => { try { return buildYtDlpCookieArgs() } catch { return [] } }

async function main(){
  log('Platform:', process.platform, os.release())
  log('Node:', process.version)

  let version
  try {
    version = await ytdlp.exec(['--version'])
  } catch (e) {
    fail('yt-dlp no encontrado via yt-dlp-exec: ' + e.message);
    return
  }

  if (!version) {
    fail('yt-dlp no encontrado via yt-dlp-exec'); return
  }
  log('yt-dlp:', version.trim())
  log('bin: via yt-dlp-exec package')

  // Test search
  const cargs = cookieArgs()
  const hasCookies = Array.isArray(cargs) && cargs.length > 0
  let extractor = process.env.YTDLP_EXTRACTOR_ARGS || ''
  if (hasCookies) {
    if (!extractor || /player_client=android/i.test(extractor)) extractor = 'youtube:player_client=web_safari'
  } else {
    if (!extractor) extractor = 'youtube:player_client=android'
  }
  const buildArgs = (extra=[]) => [
    '--ignore-config',
    ...extra,
    '--user-agent', (process.env.YTDLP_USER_AGENT || (hasCookies
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
      : 'com.google.android.youtube/19.09.37 (Linux; U; Android 13) gzip')),
    '--extractor-args', extractor,
    '--flat-playlist',
    '-J', 'ytsearch10:tears'
  ]
  
  let run1
  try {
    run1 = await ytdlp.exec(buildArgs(cargs))
  } catch (e) {
    fail('yt-dlp search (con cookies) falló:\n' + e.stderr)
  }

  let n = 0
  if (run1) {
    try { const j = JSON.parse(run1||'{}'); n = Array.isArray(j.entries) ? j.entries.length : 0 } catch {}
  }
  log('yt-dlp search (cookies) entries =', n)

  if (n === 0) {
    // Retry no-cookies with web extractor
    const noCookies = (arr)=>{
      const out=[]; for (let i=0;i<arr.length;i++){ const a=arr[i]; if(a==='--cookies'||a==='--add-header'){i++;continue} if(a==='--cookies-from-browser'){continue} if(a==='--extractor-args'){i++; out.push('--extractor-args','youtube:player_client=web_safari'); continue} out.push(a)} if(!out.includes('--extractor-args')) out.push('--extractor-args','youtube:player_client=web_safari'); return out }
    const args2 = noCookies(buildArgs([]))
    
    let run2
    try {
        run2 = await ytdlp.exec(args2)
    } catch (e) {
        fail('yt-dlp search (no-cookies) falló:\n' + (e.stderr))
        return
    }

    if (run2) {
      try { const j2 = JSON.parse(run2||'{}'); const n2 = Array.isArray(j2.entries) ? j2.entries.length : 0; log('yt-dlp search (no-cookies) entries =', n2) } catch { fail('JSON inválido en salida (no-cookies)') }
    }
  }
}

main().catch(e=>{ fail(e?.message||e) })
