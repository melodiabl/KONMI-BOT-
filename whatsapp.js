// ============================================
// AGREGAR ESTA FUNCIÓN AL INICIO DE whatsapp.js
// (Justo después de las imports y antes de loadBaileys)
// ============================================

/**
 * Extrae texto de TODOS los formatos de mensaje de WhatsApp
 * Incluye: texto normal, botones, listas, interactivos, etc.
 */
function extractTextFromMessage(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return '';

      // 1. Texto normal primero
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        obj.documentMessage?.caption ||
        obj.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        ''
      );
      if (base) return String(base).trim();

      // 2. Botones clásicos
      const btnId =
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId;
      if (btnId) return String(btnId).trim();

      // 3. LISTA CLÁSICA - CRÍTICO PARA GRUPOS
      const listResp = obj.listResponseMessage;
      if (listResp) {
        const rowId =
          listResp.singleSelectReply?.selectedRowId ||
          listResp.singleSelectReply?.selectedId ||
          listResp.title;
        if (rowId) return String(rowId).trim();
      }

      // 4. RESPUESTA INTERACTIVA (nuevo formato WhatsApp)
      const intResp = obj.interactiveResponseMessage;
      if (intResp) {
        // 4a. Native Flow Response
        if (intResp.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson);
            const id = params?.id || params?.command || params?.rowId || params?.row_id;
            if (id && typeof id === 'string') return String(id).trim();
          } catch { }
        }

        // 4b. List Response dentro de Interactive
        if (intResp.listResponseMessage?.singleSelectReply) {
          const rowId = intResp.listResponseMessage.singleSelectReply.selectedRowId;
          if (rowId && typeof rowId === 'string') return String(rowId).trim();
        }

        // 4c. Body text (último recurso)
        if (intResp.body?.text) {
          return String(intResp.body.text).trim();
        }
      }

      // 5. MENSAJE INTERACTIVO (estructura de envío)
      const intMsg = obj.interactiveMessage;
      if (intMsg) {
        // 5a. Reply con selectedRowId
        const selectedRowId =
          intMsg.replyMessage?.selectedRowId ||
          intMsg.selectedRowId ||
          intMsg.nativeFlowResponseMessage?.selectedRowId;

        if (selectedRowId && typeof selectedRowId === 'string') {
          return String(selectedRowId).trim();
        }

        // 5b. Display text
        const displayText =
          intMsg.replyMessage?.selectedDisplayText ||
          intMsg.body?.selectedDisplayText ||
          intMsg.body?.text;
        if (displayText && typeof displayText === 'string') {
          return String(displayText).trim();
        }

        // 5c. Native Flow Buttons
        const nativeFlowMsg = intMsg.nativeFlowMessage;
        if (nativeFlowMsg && Array.isArray(nativeFlowMsg.buttons)) {
          for (const btn of nativeFlowMsg.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson);
                const id =
                  params?.selectedButtonId ||
                  params?.response?.selectedRowId ||
                  params?.id ||
                  params?.command;
                if (id) return String(id).trim();
              } catch { }
            }
          }
        }

        // 5d. Params JSON directo
        const paramsJson = intMsg.nativeFlowResponseMessage?.paramsJson;
        if (paramsJson && typeof paramsJson === 'string') {
          try {
            const params = JSON.parse(paramsJson);
            const id = params?.id || params?.command || params?.rowId || params?.row_id;
            if (id) return String(id).trim();
          } catch { }
        }
      }

      return '';
    };

    const m = message?.message || {};
    let out = pick(m);
    if (out) return out;

    // Revisar mensajes anidados (viewOnce / ephemeral)
    const inner =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null;

    if (inner) {
      out = pick(inner);
      if (out) return out;

      const inner2 =
        inner.viewOnceMessage?.message ||
        inner.viewOnceMessageV2?.message ||
        inner.ephemeralMessage?.message ||
        null;

      if (inner2) {
        out = pick(inner2);
        if (out) return out;
      }
    }

    return '';
  } catch (e) {
    logMessage('ERROR', 'EXTRACT-TEXT', 'Error extrayendo texto', { error: e?.message });
    return '';
  }
}

// ============================================
// REEMPLAZAR LA FUNCIÓN handleMessage COMPLETA
// Busca "export async function handleMessage" y reemplaza TODO hasta el final
// ============================================

export async function handleMessage(message, customSock = null, prefix = '', runtimeContext = {}) {
  const s = customSock || sock;
  if (!s || !message || !message.key) return;

  const { remoteJid } = message.key;
  if (!remoteJid) return;

  const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
  const isChannel = typeof remoteJid === 'string' && remoteJid.endsWith('@newsletter');
  const fromMe = !!message?.key?.fromMe;

  // ✅ USAR LA FUNCIÓN CORRECTA DE EXTRACCIÓN
  const rawText = extractTextFromMessage(message);
  const pushName = message?.pushName || null;

  // ✅ LOG DE DEBUG CRÍTICO
  if (process.env.TRACE_ROUTER === 'true') {
    logMessage('DEBUG', 'MESSAGE', 'Texto extraído del mensaje', {
      rawText,
      length: rawText.length,
      isCommand: /^[\\/!.#?$~]/.test(rawText),
      remoteJid,
      fromMe
    });
  }

  const isCommand = /^[\\/!.#?$~]/.test(rawText);

  const messageType = isChannel ? 'CHANNEL' : (isGroup ? 'GROUP' : 'DM');
  const messageSource = fromMe ? 'FROM_BOT' : 'FROM_USER';

  // Normalizar botJid
  const botJidRaw = s.user?.id;
  let botJid = botJidRaw;

  if (botJidRaw && typeof jidNormalizedUser === 'function') {
    try {
      botJid = jidNormalizedUser(botJidRaw);
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidNormalizedUser falló: ${e.message}`);
    }
  }

  if (botJid === botJidRaw && typeof jidDecode === 'function') {
    try {
      const decoded = jidDecode(botJidRaw);
      if (decoded && decoded.user && decoded.server) {
        botJid = `${decoded.user}@${decoded.server}`;
      }
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidDecode falló: ${e.message}`);
    }
  }

  if (botJid === botJidRaw && botJidRaw) {
    const match = String(botJidRaw).match(/^(\d+)/);
    if (match) {
      botJid = `${match[1]}@s.whatsapp.net`;
    }
  }

  let botNumber = null;
  try {
    botNumber = botJid ? (typeof jidDecode === 'function' ? jidDecode(botJid)?.user : null) : null;
    if (!botNumber) {
      botNumber = onlyDigits(botJid || '');
    }
  } catch {
    botNumber = onlyDigits(botJid || '');
  }

  const sender = isGroup ? message.key.participant || remoteJid : remoteJid;
  let senderNumber = null;
  try {
    senderNumber = sender ? (typeof jidDecode === 'function' ? jidDecode(sender)?.user : null) : null;
    if (!senderNumber) {
      senderNumber = onlyDigits(sender || '');
    }
  } catch {
    senderNumber = onlyDigits(sender || '');
  }

  const chatName = await resolveChatName(remoteJid, s, isGroup ? null : pushName);
  const senderName = await resolveChatName(sender, s, pushName);
  const chatDisplay = getDisplayChat(remoteJid, chatName);
  const senderLabel = senderName || senderNumber || sender || 'desconocido';

  let ownerNumber = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '');
  if (!ownerNumber && botNumber) {
    ownerNumber = botNumber;
  }
  const isOwner = !!(ownerNumber && senderNumber && senderNumber === ownerNumber);

  const allowMessageLog = shouldLog('INFO', messageType) && (!MINIMAL_LOGS || !fromMe);

  if (allowMessageLog && isCommand) {
    prettyPrintMessageLog({
      remoteJid,
      chatName,
      senderNumber,
      senderName,
      text: rawText,
      isCommand,
      isGroup,
      isChannel,
      fromMe
    });
  }

  let isAdmin = false;
  let isBotAdmin = false;
  let groupMetadata = null;

  if (isCommand) {
    const commandName = rawText.split(/\s+/)[0];
    logMessage('COMMAND', messageType, `Comando detectado: ${commandName}`, {
      fullText: rawText,
      sender: senderNumber,
      isOwner,
      isGroup
    });
  }

  if (isGroup && isCommand) {
    try {
      groupMetadata = await s.groupMetadata(remoteJid);
      cacheChatName(remoteJid, groupMetadata?.subject);

      const isParticipantBot = (participant) => {
        if (!participant) return false;
        const pid = participant.id;
        const pLid = participant.lid;
        if (pid === botJid || pid === botJidRaw) return true;
        if (pLid && (pLid === botJid || pLid === botJidRaw)) return true;
        if (botNumber) {
          const pidNum = onlyDigits(pid || '');
          const pLidNum = pLid ? onlyDigits(pLid) : null;
          if (pidNum === botNumber || pLidNum === botNumber) return true;
        }
        return false;
      };

      const participantInfo = (groupMetadata.participants || []).find((p) => {
        return p.id === sender || p.lid === sender;
      });
      isAdmin = !!participantInfo && (participantInfo.admin === 'admin' || participantInfo.admin === 'superadmin');

      let botInfo = (groupMetadata.participants || []).find(isParticipantBot);
      if (botInfo) {
        isBotAdmin = botInfo.admin === 'admin' || botInfo.admin === 'superadmin';
      } else if (isOwner) {
        isBotAdmin = true;
      }
    } catch (e) {
      logMessage('WARN', 'METADATA', `Error obteniendo metadata: ${e.message}`);
    }
  }

  let usuarioName = null;
  try {
    if (isGroup && groupMetadata && Array.isArray(groupMetadata.participants)) {
      const p = groupMetadata.participants.find((x) => x?.id === sender);
      usuarioName = p?.notify || p?.name || null;
    }
  } catch (e) {}

  // ✅ CONTEXTO COMPLETO CON TEXTO EXTRAÍDO
  const ctx = {
    sock: s,
    message,
    key: message.key,
    remoteJid,
    sender,
    senderNumber,
    text: rawText, // ✅ CRÍTICO: Pasar el texto extraído
    isGroup,
    isChannel,
    fromMe,
    botJid,
    botNumber,
    isOwner,
    isAdmin,
    isBotAdmin,
    groupMetadata,
    pushName,
    usuarioName,
    participant: message.key.participant || null,
    ...runtimeContext,
  };

  // Filtro de mensajes propios
  if (fromMe) {
    const isCmd = /^[\/!.#?$~]/.test(rawText);
    const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase();
    if (!(mode === 'all' || (mode === 'commands' && isCmd))) {
      return;
    }
  }

  // Auto-read
  const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true';
  if (autoRead && message?.key?.id) {
    try {
      await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }]);
    } catch (e) {}
  }

  // ✅ DISPATCH MEJORADO
  try {
    let dispatch = null;

    if (global.__APP_DISPATCH && typeof global.__APP_DISPATCH === 'function') {
      dispatch = global.__APP_DISPATCH;
    } else {
      try {
        const routerResolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath);
        const mod = await tryImportModuleWithRetries(routerResolved, { retries: 3, timeoutMs: 20000, backoffMs: 1000 });
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default;
        if (dispatch) {
          global.__APP_ROUTER_MODULE = mod;
          global.__APP_DISPATCH = dispatch;
          logMessage('SUCCESS', 'ROUTER', 'dispatch cargado correctamente y cacheado');
        }
      } catch (e) {
        logMessage('ERROR', 'ROUTER', 'Error importando router dinámico', { error: e?.message });
      }
    }

    if (typeof dispatch === 'function') {
      const handled = await dispatch(ctx, runtimeContext);

      if (process.env.TRACE_ROUTER === 'true') {
        logMessage('INFO', 'DISPATCH', `Resultado: ${handled === true ? '✅ MANEJADO' : '⏭️ NO MANEJADO'}`, {
          command: rawText.split(/\s+/)[0],
          handled
        });
      }

      const replyFallback = String(process.env.REPLY_ON_UNMATCHED || 'false').toLowerCase() === 'true';
      if (replyFallback && handled !== true && !fromMe) {
        const isMentioned = (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(s.user.id);
        if (!isGroup || isMentioned) {
          global.__fallbackTs = global.__fallbackTs || new Map();
          if (Date.now() - (global.__fallbackTs.get(remoteJid) || 0) > 60000) {
            await safeSend(s, remoteJid, { text: '👋 Envíame un comando. Usa /menu o /help' }, { quoted: message });
            global.__fallbackTs.set(remoteJid, Date.now());
          }
        }
      }
    }
  } catch (e) {
    logMessage('ERROR', 'HANDLER', 'Error en dispatch', { error: e?.message, stack: e?.stack });
  }
}
