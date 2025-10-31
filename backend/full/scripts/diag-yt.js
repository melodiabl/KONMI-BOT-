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
    if (!extractor || /player_client=android/i.test(extractor)) extractor = 'youtube:player_client=web_safari,lang=en,gl=US'
  } else {
    if (!extractor) extractor = 'youtube:player_client=android,lang=en,gl=US'
  }
  const args = [
    '--ignore-config',
    ...cargs,
    '--user-agent', (process.env.YTDLP_USER_AGENT || (hasCookies
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
      : 'com.google.android.youtube/19.09.37 (Linux; U; Android 13) gzip')),
    '--extractor-args', extractor,
    '-J', 'ytsearch1:tears'
  ]
  const run = det.via === 'python'
    ? tryRun(det.cmd, ['-m', 'yt_dlp', ...args])
    : tryRun(det.cmd, args)
  if (run.error || run.status !== 0){
    fail('yt-dlp search falló:\n' + (run.stderr || run.stdout))
    return
  }
  try {
    const j = JSON.parse(run.stdout||'{}')
    const n = Array.isArray(j.entries) ? j.entries.length : 0
    log('yt-dlp search OK. entries =', n)
  } catch(e){ fail('JSON inválido en salida de yt-dlp') }
}

main().catch(e=>{ fail(e?.message||e) })
