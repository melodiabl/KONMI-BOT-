import antibanSystem from './anti-ban.js'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const ANTIBAN_ENABLED = process.env.ANTIBAN_ENABLED !== 'false'
const COMMAND_DELAY_MS = parseInt(process.env.ANTIBAN_COMMAND_DELAY_MS || '200', 10)
const DEBUG_LOG = process.env.ANTIBAN_DEBUG_LOG === 'true'

class AntibanMiddleware {
  constructor() {
    this.lastCommandTime = 0
    this.commandQueue = []
  }

  async applyCommandDelay() {
    if (!ANTIBAN_ENABLED || COMMAND_DELAY_MS <= 0) {
      return
    }

    const timeSinceLastCommand = Date.now() - this.lastCommandTime
    const delayNeeded = COMMAND_DELAY_MS - timeSinceLastCommand

    if (delayNeeded > 0) {
      if (DEBUG_LOG) {
        logger.debug(`Anti-ban: Applying delay of ${delayNeeded}ms`)
      }
      await new Promise((r) => setTimeout(r, delayNeeded))
    }

    this.lastCommandTime = Date.now()
  }

  async wrapCommand(commandFn, context) {
    if (!ANTIBAN_ENABLED) {
      return commandFn()
    }

    try {
      await this.applyCommandDelay()

      if (DEBUG_LOG) {
        logger.debug(`Executing command: ${context?.command || 'unknown'}`)
      }

      const result = await commandFn()
      return result
    } catch (error) {
      if (error.toString().includes('rate')) {
        logger.warn(`Rate limit error in command: ${context?.command || 'unknown'}`)
        if (error.toString().includes('overlimit')) {
          logger.error('WhatsApp rate-overlimit detected. Implement backoff.')
        }
      }
      throw error
    }
  }

  async executeWithRateLimit(operation, operationType = 'default') {
    if (!ANTIBAN_ENABLED) {
      return operation()
    }

    return antibanSystem.executeWithRateLimit(operation, operationType, {
      rateLimit: parseInt(process.env.ANTIBAN_RATE_LIMIT_PER_MIN || '10', 10),
      windowMs: 60000,
      maxRetries: parseInt(process.env.ANTIBAN_MAX_RETRIES || '3', 10),
    })
  }
}

export const antibanMiddleware = new AntibanMiddleware()

export async function withAntiban(commandFn, commandName = 'unknown') {
  return antibanMiddleware.wrapCommand(commandFn, { command: commandName })
}

export async function withRateLimit(operation, operationType = 'default') {
  return antibanMiddleware.executeWithRateLimit(operation, operationType)
}

export default antibanMiddleware
