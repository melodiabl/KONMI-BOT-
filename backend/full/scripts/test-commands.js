// scripts/test-commands.js
// Valida que el registry cargue y que los handlers básicos respondan
// Ejecuta comandos en contexto privado (fromMe) y en grupo (admin y bot admin)

import 'dotenv/config'

const log = (...a) => console.log('[test-cmd]', ...a)

function onlyDigits(v) { return String(v || '').replace(/\D/g, '') }

function buildMockSock({ owner = '595974154768', bot = '5491112345678', admins = [] } = {}) {
  const ownerJid = `${owner}@s.whatsapp.net`
  const botJid = `${bot}@s.whatsapp.net`
  const adminSet = new Set([ownerJid, botJid, ...admins])
  return {
    user: { id: botJid },
    async sendMessage() { /* no-op */ },
    async readMessages() { /* no-op */ },
    async groupMetadata(jid) {
      return {
        id: jid,
        subject: 'Test Group',
        participants: [
          { id: ownerJid, admin: 'admin' },
          { id: botJid, admin: 'admin' },
        ],
      }
    },
    async groupSettingUpdate() { /* no-op */ },
    async groupUpdateSubject() { /* no-op */ },
    async groupUpdateDescription() { /* no-op */ },
    async groupInviteCode() { return 'TESTCODE' },
    async groupParticipantsUpdate() { /* no-op */ },
  }
}

function buildCtx({ sock, kind = 'private', text = '/help' }) {
  const owner = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '595974154768')
  const usuario = `${owner}@s.whatsapp.net`
  if (kind === 'group') {
    return {
      sock,
      remoteJid: '12345-67890@g.us',
      usuario,
      isGroup: true,
      message: { key: { fromMe: false, participant: usuario } },
      text,
    }
  }
  return {
    sock,
    remoteJid: usuario,
    usuario,
    isGroup: false,
    message: { key: { fromMe: true } },
    text,
  }
}

async function main() {
  const { getCommandRegistry } = await import('../commands/registry/index.js')
  const reg = getCommandRegistry()
  const keys = Array.from(reg.keys()).sort()
  log(`Comandos en registry: ${keys.length}`)

  const sock = buildMockSock({
    owner: onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '595974154768') || '595974154768',
    bot: onlyDigits(process.env.TEST_BOT_NUMBER || process.env.OWNER_WHATSAPP_NUMBER || '') || '5491112345678',
  })
  const pv = buildCtx({ sock, kind: 'private', text: '/help' })
  const gp = buildCtx({ sock, kind: 'group', text: '/admins' })

  const skipPattern = /(video|music|tiktok|instagram|facebook|twitter|pinterest|yt|descarga|download|broadcast|promo|update|actualizar|restart|shutdown|stop|pair|qr|code)/i
  let ok = 0, fail = 0, skipped = 0

  let i = 0
  for (const k of keys) {
    const entry = reg.get(k)
    const category = String(entry?.category || '')
    if (skipPattern.test(k)) { skipped++; continue }
    try {
      const ctx = category === 'group' ? gp : pv
      const res = await entry.handler({ ...ctx, command: k, args: [] })
      // Aceptamos: objeto resultado o array de objetos
      const valid = res === undefined || typeof res === 'object' || Array.isArray(res)
      if (!valid) throw new Error('resultado inválido')
      ok++
    } catch (e) {
      fail++
      console.error(`Fallo en ${k}:`, e?.message || e)
    }
    i++
    if (i % 1 === 0) log(`cmd ${i}/${keys.length}: ${k}`)
  }

  log(`Resumen: OK=${ok} | FAIL=${fail} | SKIPPED=${skipped}`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
