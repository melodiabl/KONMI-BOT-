import os from 'os'

const cpuCount = typeof os.cpus === 'function' ? os.cpus().length : 2
const DEFAULT_MEDIA_LIMIT = Number.isFinite(cpuCount) ? Math.max(2, Math.min(6, cpuCount)) : 3
const MEDIA_MAX_CONCURRENCY = parseInt(process.env.MEDIA_MAX_CONCURRENCY || DEFAULT_MEDIA_LIMIT, 10)

class Limiter {
  constructor(limit = 3) {
    this.limit = Math.max(1, Number(limit) || 1)
    this.active = 0
    this.queue = []
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active++
      let released = false
      return () => { if (!released) { released = true; this._release() } }
    }
    return await new Promise(resolve => {
      this.queue.push(() => {
        this.active++
        let released = false
        resolve(() => { if (!released) { released = true; this._release() } })
      })
    })
  }

  _release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) {
      try { next() } catch {}
    }
  }
}

export const mediaLimiter = new Limiter(MEDIA_MAX_CONCURRENCY)

export default { mediaLimiter }

