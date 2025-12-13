// src/utils/text-extractor.js
// ============================================
// EXTRACTOR DE TEXTO UNIFICADO - PRODUCCIÓN
// ============================================

export function normalizeIncomingText(text) {
  try {
    if (text == null) return '';
    let s = String(text);
    s = s.normalize('NFKC');
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    s = s.replace(/\r\n/g, '\n');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim();
  } catch {
    return String(text || '').trim();
  }
}

export function extractText(message) {
  try {
    if (!message || typeof message !== 'object') return '';
    const m = message?.message || message;
    if (!m || typeof m !== 'object') return '';

    const extract = (obj) => {
      if (!obj || typeof obj !== 'object') return '';

      // 1️⃣ TEXTO BÁSICO
      const basic = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        obj.documentMessage?.caption ||
        obj.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        obj.audioMessage?.caption ||
        ''
      );
      if (basic) return normalizeIncomingText(basic);

      // 2️⃣ BOTONES CLÁSICOS
      const btn = (
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId ||
        ''
      );
      if (btn) return normalizeIncomingText(btn);

      // 3️⃣ LISTA CLÁSICA (CRÍTICO)
      const list = obj.listResponseMessage;
      if (list) {
        const rowId = (
          list.singleSelectReply?.selectedRowId ||
          list.singleSelectReply?.selectedId ||
          list.title ||
          ''
        );
        if (rowId) return normalizeIncomingText(rowId);
      }

      // 4️⃣ INTERACTIVE RESPONSE
      const intResp = obj.interactiveResponseMessage;
      if (intResp) {
        // 4a. Native Flow
        if (intResp.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson);
            const id = (
              params?.id ||
              params?.command ||
              params?.rowId ||
              params?.row_id ||
              params?.selectedButtonId ||
              params?.selectedRowId ||
              ''
            );
            if (id && typeof id === 'string') return normalizeIncomingText(id);
          } catch {}
        }

        // 4b. List Response
        if (intResp.listResponseMessage?.singleSelectReply) {
          const rowId = intResp.listResponseMessage.singleSelectReply.selectedRowId;
          if (rowId && typeof rowId === 'string') return normalizeIncomingText(rowId);
        }

        // 4c. Body
        const body = intResp.body?.text || intResp.header?.title || '';
        if (body) return normalizeIncomingText(body);
      }

      // 5️⃣ INTERACTIVE MESSAGE
      const intMsg = obj.interactiveMessage;
      if (intMsg) {
        const selectedRowId = (
          intMsg.replyMessage?.selectedRowId ||
          intMsg.selectedRowId ||
          intMsg.nativeFlowResponseMessage?.selectedRowId ||
          ''
        );
        if (selectedRowId && typeof selectedRowId === 'string') {
          return normalizeIncomingText(selectedRowId);
        }

        const displayText = (
          intMsg.replyMessage?.selectedDisplayText ||
          intMsg.body?.selectedDisplayText ||
          intMsg.body?.text ||
          intMsg.header?.title ||
          ''
        );
        if (displayText && typeof displayText === 'string') {
          return normalizeIncomingText(displayText);
        }

        const nativeFlow = intMsg.nativeFlowMessage;
        if (nativeFlow && Array.isArray(nativeFlow.buttons)) {
          for (const btn of nativeFlow.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson);
                const id = (
                  params?.selectedButtonId ||
                  params?.response?.selectedRowId ||
                  params?.id ||
                  params?.command ||
                  ''
                );
                if (id) return normalizeIncomingText(id);
              } catch {}
            }
          }
        }

        const paramsJson = intMsg.nativeFlowResponseMessage?.paramsJson;
        if (paramsJson && typeof paramsJson === 'string') {
          try {
            const params = JSON.parse(paramsJson);
            const id = (
              params?.id ||
              params?.command ||
              params?.rowId ||
              params?.row_id ||
              ''
            );
            if (id) return normalizeIncomingText(id);
          } catch {}
        }
      }

      // 6️⃣ POLL
      const poll = obj.pollUpdateMessage;
      if (poll) {
        const votes = poll.vote?.selectedOptions || [];
        if (votes.length > 0) return normalizeIncomingText(votes[0] || '');
      }

      return '';
    };

    let text = extract(m);
    if (text) return text;

    // Mensajes anidados
    const nested = (
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null
    );

    if (nested) {
      text = extract(nested);
      if (text) return text;

      const nested2 = (
        nested.viewOnceMessage?.message ||
        nested.viewOnceMessageV2?.message ||
        nested.ephemeralMessage?.message ||
        null
      );

      if (nested2) {
        text = extract(nested2);
        if (text) return text;
      }
    }

    return '';
  } catch (error) {
    if (process.env.TRACE_TEXT_EXTRACTION === 'true') {
      console.error('❌ [extractText]:', error.message);
    }
    return '';
  }
}

export function isCommand(text) {
  if (!text || typeof text !== 'string') return false;
  return /^[\\/!.#?$~]/.test(text.trim());
}

export function parseCommand(text) {
  const normalized = normalizeIncomingText(text);
  if (!normalized) return { command: '', args: [], raw: '' };
  if (!isCommand(normalized)) return { command: '', args: [], raw: normalized };

  const parts = normalized.split(/\s+/);
  const first = parts.shift() || '';
  const command = first.replace(/^[\\/!.#?$~]+/, '').toLowerCase();

  return {
    command: command ? `/${command}` : '',
    args: parts,
    raw: normalized
  };
}

export default {
  extractText,
  normalizeIncomingText,
  isCommand,
  parseCommand
};