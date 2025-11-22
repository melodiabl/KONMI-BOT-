const logger = {
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },
  info: (...args) => {
    console.log('[INFO]', ...args);
  },
  debug: (...args) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[DEBUG]', ...args);
    }
  },
  log: (...args) => {
    console.log(...args);
  }
};

export default logger;
