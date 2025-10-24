function renderBar(percent, length = 20) {
  const total = Math.max(4, length);
  const pct = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const filled = Math.round((pct / 100) * total);
  const bar = '▓'.repeat(filled).padEnd(total, '░');
  return bar;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function createProgressNotifier({
  resolveSocket,
  chatId,
  quoted = null,
  title = 'Procesando',
  icon = '',
  barLength = 20
} = {}) {
  if (typeof resolveSocket !== 'function' || !chatId) {
    const noop = async () => {};
    return { update: noop, complete: noop, fail: noop };
  }

  let messageRef = null;
  let lastPercent = 0;

  const border = `+${'-'.repeat(barLength)}+`;

  const render = (percent, status, details = [], accent = icon) => {
    const header = `${accent} ${title}`.trim();
    const bar = renderBar(percent, barLength);
    const percentLabel = `${String(percent).padStart(3, ' ')}%`;
    const barLine = `|${bar}| ${percentLabel}`;

    const lines = [header, border, barLine, border, ` ${status}`];
    details.filter(Boolean).forEach((line) => {
      lines.push(`  ${line}`);
    });
    return lines.join('\n');
  };

  async function send(percent, status, options = {}) {
    lastPercent = clampPercent(percent);
    const details = Array.isArray(options.details)
      ? options.details.filter(Boolean).map(String)
      : options.details
        ? [String(options.details)]
        : [];

    const text = render(lastPercent, status, details, options.icon || icon);
    const payload = { text };
    if (options.contextInfo) {
      payload.contextInfo = options.contextInfo;
    }

    try {
      const sock = await resolveSocket();
      if (!sock || typeof sock.sendMessage !== 'function') return messageRef;

      if (messageRef?.key) {
        const edited = await sock.sendMessage(chatId, { ...payload, edit: messageRef.key });
        if (edited?.key) messageRef = edited;
      } else {
        messageRef = await sock.sendMessage(chatId, payload, quoted ? { quoted } : undefined);
      }
    } catch (error) {
      console.error(' Progress notifier error:', error?.message || error);
    }

    return messageRef;
  }

  return {
    update(percent, status, options = {}) {
      return send(percent, status, options);
    },
    complete(status = 'Completado ', options = {}) {
      return send(100, status, options);
    },
    fail(reason = 'Error', options = {}) {
      const message = reason.startsWith('') ? reason : ` ${reason}`;
      return send(lastPercent || 0, message, options);
    }
  };
}

export default createProgressNotifier;
