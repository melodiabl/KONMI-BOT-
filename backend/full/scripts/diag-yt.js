#!/usr/bin/env node
import os from 'os'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import '../config.js'
import { buildYtDlpCookieArgs } from '../utils/cookies.js'

function log(...a){ console.log('[diag:yt]', ...a) }
function fail(msg){ console.error('[diag:yt] ERROR:', msg); process.exitCode = 1 }

function tryRun(cmd, args){
  try { return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true }) } catch(e){ return { error: e } }
}

function detectYtDlp(){
  const env = process.env.YTDLP_PATH || process.env.YT_DLP_PATH
  const cands = []
  if (env) cands.push(env)
  const winLocal = path.join(process.cwd(), 'backend', 'full', 'bin', 'yt-dlp.exe')
  const nixLocal = path.join(process.cwd(), 'backend', 'full', 'bin', 'yt-dlp')
  if (process.platform === 'win32' && fs.existsSync(winLocal)) cands.push(winLocal)
  if (process.platform !== 'win32' && fs.existsSync(nixLocal)) cands.push(nixLocal)
  cands.push('yt-dlp', 'yt')
  const py = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
  for (const cmd of cands){
    const r = tryRun(cmd, ['--version'])
    if (!r.error && (r.status === 0 || typeof r.status === 'undefined')) return { cmd, via: 'bin', out: (r.stdout||r.stderr||'').trim() }
  }
  for (const p of py){
    const r = tryRun(p, ['-m', 'yt_dlp', '--version'])
    if (!r.error && (r.status === 0 || typeof r.status === 'undefined')) return { cmd: p, via: 'python', out: (r.stdout||r.stderr||'').trim() }
  }
  return null
}

const cookieArgs = () => { try { return buildYtDlpCookieArgs() } catch { return [] } }

async function main(){
  log('Platform:', process.platform, os.release())
  log('Node:', process.version)
  const det = detectYtDlp()
  if (!det){ fail('yt-dlp no encontrado'); return }
  log('yt-dlp:', det.out)
  log('bin:', det.cmd, det.via)

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
  const run1 = det.via === 'python'
    ? tryRun(det.cmd, ['-m', 'yt_dlp', ...buildArgs(cargs)])
    : tryRun(det.cmd, buildArgs(cargs))
  let n = 0
  if (!run1.error && run1.status === 0) {
    try { const j = JSON.parse(run1.stdout||'{}'); n = Array.isArray(j.entries) ? j.entries.length : 0 } catch {}
  }
  log('yt-dlp search (cookies) entries =', n)
  if (n === 0) {
    // Retry no-cookies with web extractor
    const noCookies = (arr)=>{
      const out=[]; for (let i=0;i<arr.length;i++){ const a=arr[i]; if(a==='--cookies'||a==='--add-header'){i++;continue} if(a==='--cookies-from-browser'){continue} if(a==='--extractor-args'){i++; out.push('--extractor-args','youtube:player_client=web_safari'); continue} out.push(a)} if(!out.includes('--extractor-args')) out.push('--extractor-args','youtube:player_client=web_safari'); return out }
    const args2 = noCookies(buildArgs([]))
    const run2 = det.via === 'python'
      ? tryRun(det.cmd, ['-m','yt_dlp', ...args2])
      : tryRun(det.cmd, args2)
    if (!run2.error && run2.status === 0) {
      try { const j2 = JSON.parse(run2.stdout||'{}'); const n2 = Array.isArray(j2.entries) ? j2.entries.length : 0; log('yt-dlp search (no-cookies) entries =', n2) } catch { fail('JSON inválido en salida (no-cookies)') }
    } else {
      fail('yt-dlp search (no-cookies) falló:\n' + (run2.stderr || run2.stdout))
    }
  }
}

main().catch(e=>{ fail(e?.message||e) })
