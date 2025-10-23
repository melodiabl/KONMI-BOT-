// spotify-auth.js
// Helper para autenticación Client Credentials con la API oficial de Spotify

import axios from 'axios'

let cachedToken = null
let tokenExpiresAt = 0 // epoch ms

function hasCreds() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
}

export function spotifyCredsPresent() {
  return hasCreds()
}

export async function getSpotifyAccessToken() {
  if (!hasCreds()) return null

  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const url = 'https://accounts.spotify.com/api/token'
  const params = new URLSearchParams()
  params.set('grant_type', 'client_credentials')

  const resp = await axios.post(url, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`
    },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  })

  if (resp.status !== 200 || !resp?.data?.access_token) {
    const msg = resp?.data?.error_description || resp?.data?.error || `HTTP ${resp.status}`
    throw new Error('Spotify token failed: ' + msg)
  }

  cachedToken = resp.data.access_token
  const expiresIn = Number(resp.data.expires_in || 3600)
  tokenExpiresAt = now + expiresIn * 1000
  return cachedToken
}

export function _debugResetSpotifyToken() {
  cachedToken = null
  tokenExpiresAt = 0
}

export default {
  spotifyCredsPresent,
  getSpotifyAccessToken,
}

