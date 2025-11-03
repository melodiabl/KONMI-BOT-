// utils/messaging.js
// Ayudas para construir payloads Baileys ricos

export function buildVCard({ displayName, fullName, organization, phone, phones = [], email, url }) {
  const name = fullName || displayName || 'Contacto'
  const org = organization || ''
  const tel = phone || phones[0]
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${name};;;;`,
    `FN:${name}`,
    org ? `ORG:${org}` : null,
    tel ? `TEL;type=CELL;type=VOICE;waid=${String(tel).replace(/\D/g,'')}:${tel}` : null,
    email ? `EMAIL;type=INTERNET:${email}` : null,
    url ? `URL:${url}` : null,
    'END:VCARD',
  ].filter(Boolean)
  return lines.join('\n')
}

export function toContactsPayload(result) {
  try {
    if (result.type === 'contact') {
      const c = result.contact || result.card || {}
      const vcard = c.vcard || buildVCard({
        displayName: c.displayName || c.name,
        fullName: c.fullName || c.name,
        organization: c.organization,
        phone: c.phone || (Array.isArray(c.phones) ? c.phones[0] : undefined),
        email: c.email,
        url: c.url,
      })
      const displayName = c.displayName || c.name || 'Contacto'
      return { contacts: { displayName, contacts: [{ vcard }] } }
    }
    if (result.type === 'contacts') {
      const list = Array.isArray(result.contacts) ? result.contacts : []
      const vcards = list.map((c) => ({
        vcard: c.vcard || buildVCard({
          displayName: c.displayName || c.name,
          fullName: c.fullName || c.name,
          organization: c.organization,
          phone: c.phone || (Array.isArray(c.phones) ? c.phones[0] : undefined),
          email: c.email,
          url: c.url,
        })
      }))
      const displayName = result.displayName || `Contactos (${vcards.length})`
      return { contacts: { displayName, contacts: vcards } }
    }
  } catch {}
  return null
}

export default { buildVCard, toContactsPayload }

