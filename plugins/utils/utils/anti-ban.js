import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const CACHE_TTL_MS = 5 * 60 * 1000
const REQUEST_DELAY_MS = 200
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

class AntibanSystem {
  constructor() {
    this.cache = new Map()
    this.requestQueue = []
    this.isProcessingQueue = false
    this.lastRequestTime = 0
    this.rateLimitBuckets = new Map()
    this.operationCounts = new Map()
  }

  clearExpiredCache() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        this.cache.delete(key)
      }
    }
  }

  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    })
  }

  getCache(key) {
    const entry = this.cache.get(key)
    if (!entry) return null

    const age = Date.now() - entry.timestamp
    if (age > CACHE_TTL_MS) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  async waitForDelay() {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime
    const delayNeeded = REQUEST_DELAY_MS - timeSinceLastRequest

    if (delayNeeded > 0) {
      await new Promise((r) => setTimeout(r, delayNeeded))
    }

    this.lastRequestTime = Date.now()
  }

  checkRateLimit(operationType, limit = 10, windowMs = 60000) {
    const now = Date.now()
    const key = `ratelimit:${operationType}`

    if (!this.rateLimitBuckets.has(key)) {
      this.rateLimitBuckets.set(key, { requests: [], windowStart: now })
    }

    const bucket = this.rateLimitBuckets.get(key)

    bucket.requests = bucket.requests.filter((t) => now - t < windowMs)

    if (bucket.requests.length >= limit) {
      const oldestRequest = bucket.requests[0]
      const waitTime = windowMs - (now - oldestRequest)
      return {
        allowed: false,
        waitTime,
        message: `Rate limit exceeded for ${operationType}. Wait ${Math.ceil(waitTime / 1000)}s.`,
      }
    }

    bucket.requests.push(now)
    return { allowed: true, waitTime: 0 }
  }

  async handleRateLimitError(error, retryCount = 0) {
    if (!error || !error.toString().includes('rate')) {
      return false
    }

    if (retryCount >= MAX_RETRIES) {
      logger.error('Max retries exceeded for rate limit error')
      return false
    }

    const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount)
    logger.warn(
      `Rate limit detected. Waiting ${backoffMs}ms before retry (attempt ${retryCount + 1}/${MAX_RETRIES})`
    )

    await new Promise((r) => setTimeout(r, backoffMs))
    return true
  }

  addToOperationCount(operationType) {
    const count = (this.operationCounts.get(operationType) || 0) + 1
    this.operationCounts.set(operationType, count)

    if (count % 10 === 0) {
      logger.info(`Operation count: ${operationType} = ${count}`)
    }
  }

  async executeWithRateLimit(
    operation,
    operationType = 'default',
    options = {}
  ) {
    const { rateLimit = 10, windowMs = 60000, maxRetries = MAX_RETRIES } =
      options

    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const rateLimitCheck = this.checkRateLimit(
        operationType,
        rateLimit,
        windowMs
      )

      if (!rateLimitCheck.allowed) {
        const waitTime = rateLimitCheck.waitTime
        logger.warn(`Rate limit: ${operationType}, waiting ${waitTime}ms`)
        await new Promise((r) => setTimeout(r, waitTime))
        continue
      }

      try {
        await this.waitForDelay()
        const result = await operation()
        this.addToOperationCount(operationType)
        return result
      } catch (error) {
        lastError = error
        const shouldRetry = await this.handleRateLimitError(error, attempt)

        if (!shouldRetry) {
          throw error
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} retries`)
  }

  async queryGroupMetadata(socket, groupJid) {
    const cacheKey = `groupmeta:${groupJid}`
    const cached = this.getCache(cacheKey)

    if (cached) {
      logger.debug(`Cache hit: ${groupJid}`)
      return cached
    }

    try {
      const metadata = await this.executeWithRateLimit(
        async () => {
          await this.waitForDelay()
          if (!socket.groupMetadata) {
            throw new Error('socket.groupMetadata not available')
          }
          return await socket.groupMetadata(groupJid)
        },
        'query_group_metadata',
        { rateLimit: 5, windowMs: 60000 }
      )

      this.setCache(cacheKey, metadata)
      return metadata
    } catch (error) {
      logger.error(`Error getting group metadata for ${groupJid}:`, error)
      throw error
    }
  }

  async fetchGroupParticipants(socket, groupJid) {
    const cacheKey = `participants:${groupJid}`
    const cached = this.getCache(cacheKey)

    if (cached) {
      logger.debug(`Cache hit for participants: ${groupJid}`)
      return cached
    }

    try {
      const metadata = await this.queryGroupMetadata(socket, groupJid)
      const participants = Object.values(metadata.participants || {})

      this.setCache(cacheKey, participants)
      return participants
    } catch (error) {
      logger.error(`Error fetching group participants for ${groupJid}:`, error)
      throw error
    }
  }

  getGroupInfoFromCache(groupJid) {
    const cacheKey = `groupmeta:${groupJid}`
    return this.getCache(cacheKey)
  }

  clearGroupCache(groupJid) {
    this.cache.delete(`groupmeta:${groupJid}`)
    this.cache.delete(`participants:${groupJid}`)
  }

  clearAllCache() {
    this.cache.clear()
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      operationCounts: Object.fromEntries(this.operationCounts),
      rateLimitBuckets: this.rateLimitBuckets.size,
    }
  }

  resetStats() {
    this.operationCounts.clear()
  }
}

const antibanSystem = new AntibanSystem()

setInterval(() => {
  antibanSystem.clearExpiredCache()
}, 60000)

export default antibanSystem
