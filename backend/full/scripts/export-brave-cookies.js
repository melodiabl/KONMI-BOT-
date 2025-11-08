#!/usr/bin/env node
// Export Brave cookies for youtube.com into Netscape file backend/full/all_cookies.txt
// Requires Python + browser-cookie3. Installs the lib automatically with pip --user.

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function log(...a) { console.log('[cookies:brave]', ...a) }
function err(...a) { console.error('[cookies:brave]', ...a) }

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'backend', 'full', 'all_cookies.txt')

function findPython() {
  const cands = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python', 'py']
  for (const cmd of cands) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true })
    if (!r.error && (r.status === 0 || typeof r.status === 'undefined')) return cmd
  }
  return null
}

function runPy(py, args, opts={}) {
  return spawnSync(py, args, { encoding: 'utf8', windowsHide: true, ...opts })
}

function ensureBrowserCookie3(py) {
  const test = runPy(py, ['-c', 'import browser_cookie3; print("ok")'])
  if (!test.error && test.status === 0 && /ok/.test(test.stdout||'')) return true
  log('Instalando browser-cookie3 con pip --user...')
  const pip = runPy(py, ['-m', 'pip', 'install', '--user', 'browser-cookie3'])
  if (pip.error || pip.status !== 0) {
    err('No se pudo instalar browser-cookie3 con pip. Detalles:\n', pip.stderr || pip.stdout)
    return false
  }
  return true
}

function exportCookies(py) {
  const code = `
import sys, time
try:
    import browser_cookie3 as bc
except Exception as e:
    print('ERR:browser_cookie3 not available', e)
    sys.exit(2)

def to_netscape(jar):
    out = ['# Netscape HTTP Cookie File', '']
    count = 0
    for c in jar:  # c is http.cookiejar.Cookie
        try:
            domain = ('.' + c.domain.lstrip('.')) if c.domain else '.youtube.com'
            flag = 'TRUE' if domain.startswith('.') else 'FALSE'
            path = c.path or '/'
            secure = 'TRUE' if c.secure else 'FALSE'
            expires = str(int(c.expires or (time.time()+180*24*3600)))
            name = c.name or ''
            value = c.value or ''
            out.append('\t'.join([domain, flag, path, secure, expires, name, value]))
            count += 1
        except Exception:
            continue
    return '\n'.join(out), count

try:
    # Preferir cookies de YouTube
    jar = bc.brave(domain_name='.youtube.com')
except Exception:
    jar = bc.brave()
txt, n = to_netscape(jar)
with open(sys.argv[1], 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt)
print('OK', n)
`
  const res = runPy(py, ['-c', code, OUT])
  if (res.error || res.status !== 0) {
    err('Fallo exportando cookies:', res.stderr || res.stdout)
    return false
  }
  if (!/OK\s+\d+/.test(res.stdout || '')) {
    err('Exportación no confirmó OK. Salida:\n' + (res.stdout || res.stderr))
    return false
  }
  return true
}

// Main
;(function main(){
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }) } catch {}
  const py = findPython()
  if (!py) {
    err('Python no encontrado. Instala Python e inténtalo de nuevo.')
    process.exit(1)
  }
  if (!ensureBrowserCookie3(py)) process.exit(2)
  if (!exportCookies(py)) process.exit(3)
  // Sanear: asegurarse sin BOM
  try {
    const buf = fs.readFileSync(OUT)
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      fs.writeFileSync(OUT, buf.slice(3))
    }
  } catch {}
  log('Cookies exportadas a', OUT)
  process.exit(0)
})()

