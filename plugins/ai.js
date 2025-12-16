// commands/ai.js
// IA: chat y clasificación + Funcionalidades Wileys + Temática BL

import db from './database/db.js'
import { chatWithAI, analyzeManhwaContent, analyzeContentWithAI } from '../handler.js'

// Importaciones opcionales para IA avanzada
let Sentiment, natural, compromise, franc;

try {
  Sentiment = (await import('sentiment')).default;
} catch (e) {
  console.log('⚠️ sentiment no disponible, usando análisis básico');
}

try {
  natural = await import('natural');
} catch (e) {
  console.log('⚠️ natural no disponible, usando procesamiento básico');
}

try {
  compromise = (await import('compromise')).default;
} catch (e) {
  console.log('⚠️ compromise no disponible, usando análisis básico');
}

try {
  const francModule = await import('franc');
  franc = francModule.franc;
} catch (e) {
  console.log('⚠️ franc no disponible, usando detección básica de idioma');
}

// Funcionalidades Wileys completas + Temática BL integrada
const BL_AI_REACTIONS = ['🤖', '💖', '✨', '🧠', '💕', '🌸', '💝', '🌟', '🥰', '😍'];
const BL_AI_MESSAGES = {
  thinking: ['💖 Pensando con amor...', '✨ Procesando tu consulta...', '🌸 Analizando con cariño...'],
  success: ['✨ ¡Aquí tienes la respuesta! 💖', '🌸 ¡Listo! Espero que te ayude', '💕 ¡Perfecto! Con mucho amor'],
  error: ['🥺 Algo salió mal, pero no te rindas 💔', '😢 Error detectado, lo siento mucho', '💔 No pude completarlo, perdóname']
};

// Wileys: Reacciones automáticas BL mejoradas para IA
const addBLAIReaction = async (sock, message, type = 'ai') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      ai: ['🤖', '💖', '✨'],
      classify: ['📊', '🧠', '💕'],
      translate: ['🌐', '💖', '🌸'],
      analyze: ['🔍', '✨', '💝'],
      code: ['💻', '🌟', '💖']
    };

    const sequence = reactionSequences[type] || reactionSequences.ai;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_AI_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de IA
const decorateBLAIMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    brain: {
      header: '╔🧠═══════════════════════════════════════🧠╗',
      footer: '╚🧠═══════════════════════════════════════🧠╝',
      bullet: '🧠'
    },
    tech: {
      header: '╔💻═══════════════════════════════════════💻╗',
      footer: '╚💻═══════════════════════════════════════💻╝',
      bullet: '💻'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Wileys: Mostrar "pensando..." mientras procesa con temática BL
const showBLThinking = async (sock, remoteJid, duration = 3000) => {
  try {
    await sock.sendPresenceUpdate('composing', remoteJid);
    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', remoteJid);
    }, duration);
  } catch (error) {
    console.error('[BL_AI_THINKING] Error:', error);
  }
};

// Wileys: Mensaje de estado BL para IA
const createBLAIStatusMessage = (type) => {
  const messages = BL_AI_MESSAGES[type] || BL_AI_MESSAGES.thinking;
  return messages[Math.floor(Math.random() * messages.length)];
};

export async function ai(ctx) {
  const { args, sender, remoteJid, fecha, sock, message } = ctx;
  const pregunta = (args || []).join(' ').trim();
  if (!pregunta) return { success: true, message: decorateBLAIMessage('Uso de IA', 'ℹ️ Uso: /ai <pregunta>\n💡 Ejemplo: /ai ¿Cómo estás?', 'love') };

  // Funcionalidad Wileys: Reacción automática BL y mostrar "pensando..."
  await addBLAIReaction(sock, message, 'ai');
  await showBLThinking(sock, remoteJid, 2000);

  const aiResult = await chatWithAI(pregunta, `Usuario: ${sender}, Grupo: ${remoteJid}`);
  if (!aiResult?.success) return { success: false, message: decorateBLAIMessage('Error de IA', `⚠️ ${aiResult?.error || 'IA no disponible'}\n🥺 Intenta de nuevo más tarde`, 'love') };

  try {
    await db('logs').insert({ tipo: 'ai_command', comando: '/ai', usuario: sender, grupo: remoteJid, fecha: fecha || new Date().toISOString(), detalles: JSON.stringify({ pregunta, respuesta: aiResult.response, modelo: aiResult.model || 'gemini' }) });
  } catch (e) {
      console.error('Error al guardar log de IA:', e.message);
  }

  const responseMessage = decorateBLAIMessage('Respuesta de IA', `${aiResult.response}\n\n💖 _${aiResult.model || 'Gemini AI'}_`, 'brain');
  return { success: true, message: responseMessage };
}

export async function clasificar(ctx) {
  const { args, sender, remoteJid, fecha, sock, message } = ctx;
  const texto = (args || []).join(' ').trim();
  if (!texto) return { success: true, message: decorateBLAIMessage('Uso de Clasificar', 'ℹ️ Uso: /clasificar <texto>\n💡 Ejemplo: /clasificar Este es un manhwa BL', 'brain') };

  // Funcionalidad Wileys: Reacción automática BL
  await addBLAIReaction(sock, message, 'classify');
  await showBLThinking(sock, remoteJid, 1500);

  let res = await analyzeManhwaContent(texto);
  if (!res?.success) res = await analyzeContentWithAI(texto, '');
  if (!res?.success) return { success: false, message: decorateBLAIMessage('Error de Clasificación', `⚠️ Error IA: ${res?.error || 'no disponible'}\n🥺 Intenta con otro texto`, 'love') };

  const data = res.analysis || {};
  const classificationContent = [
    `• Título: ${data.titulo || 'N/A'}`,
    `• Tipo: ${data.tipo || 'extra'}`,
    data.capitulo ? `• Capítulo: ${data.capitulo}` : null,
    `• Confianza: ${Math.round(data.confianza || 50)}%`,
  ].filter(Boolean);

  try {
    await db('logs').insert({ tipo: 'clasificar_command', comando: '/clasificar', usuario: sender, grupo: remoteJid, fecha: fecha || new Date().toISOString(), detalles: JSON.stringify({ texto, resultado: data }) });
  } catch (e) {
      console.error('Error al guardar log de clasificación:', e.message);
  }

  const responseMessage = decorateBLAIMessage('Clasificación de IA', classificationContent, 'brain');
  return { success: true, message: responseMessage };
}

// =========================
// FUNCIONALIDADES WILEYS ADICIONALES PARA IA
// =========================

export async function resume(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const texto = args.join(' ').trim();

  if (!texto) {
    return { text: decorateBLAIMessage('Uso de Resume', '❌ Uso: /resume <texto largo>\n💡 Ejemplo: /resume Este es un texto muy largo que quiero resumir...', 'love') };
  }

  await addBLAIReaction(sock, message, 'analyze');
  await showBLThinking(sock, remoteJid, 2000);

  const prompt = `Resume el siguiente texto en máximo 3 puntos principales:\n\n${texto}`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: decorateBLAIMessage('Error de Resume', `⚠️ Error: ${aiResult?.error || 'IA no disponible'}\n🥺 Intenta con otro texto`, 'love') };
  }

  return {
    text: decorateBLAIMessage('Resumen', aiResult.response, 'brain')
  };
}

export async function translate(ctx) {
  const { args, sock, message, remoteJid } = ctx;

  if (args.length < 2) {
    return { text: decorateBLAIMessage('Uso de Translate', '❌ Uso: /translate <idioma> <texto>\n💡 Ejemplo: /translate english Hola mundo', 'love') };
  }

  const idioma = args[0];
  const texto = args.slice(1).join(' ');

  await addBLAIReaction(sock, message, 'translate');
  await showBLThinking(sock, remoteJid, 1500);

  const prompt = `Traduce el siguiente texto al ${idioma}:\n\n${texto}`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: decorateBLAIMessage('Error de Traducción', `⚠️ Error: ${aiResult?.error || 'IA no disponible'}\n🥺 Intenta de nuevo`, 'love') };
  }

  return {
    text: decorateBLAIMessage(`Traducción (${idioma})`, aiResult.response, 'brain')
  };
}

export async function explain(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const concepto = args.join(' ').trim();

  if (!concepto) {
    return { text: '❌ Uso: /explain <concepto>\nEjemplo: /explain inteligencia artificial' };
  }

  await addAIReaction(sock, message, '🧠');
  await showThinking(sock, remoteJid, 2500);

  const prompt = `Explica de manera simple y clara qué es: ${concepto}`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: `⚠️ Error: ${aiResult?.error || 'IA no disponible'}` };
  }

  return {
    text: `🧠 *Explicación:*\n\n${aiResult.response}`
  };
}

export async function listClasificados() {
  try {
    const rows = await db('aportes').where({ fuente: 'auto_proveedor' }).select('contenido', 'tipo', 'fecha', 'metadata').orderBy('fecha', 'desc').limit(20);
    if (!rows.length) return { success: true, message: '📂 No hay contenido clasificado aún.' };

    let text = '📂 *Últimas clasificaciones automáticas*\n\n';
    rows.forEach((r, i) => {
      let meta = {};
      try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch {}
      const titulo = meta.titulo || r.contenido || 'Sin título';
      const tipo = r.tipo || meta.tipo || 'extra';
      const fec = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '';
      text += `${i + 1}. *${titulo}*\n   › _${tipo}_ ${fec ? `| ${fec}` : ''}\n`;
    });

    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error al listar las clasificaciones.' };
  }
}

// =========================
// FUNCIONALIDADES IA AVANZADAS WILEYS
// =========================

export async function sentiment(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const texto = args.join(' ').trim();

  if (!texto) {
    return { text: '❌ Uso: /sentiment <texto>\nEjemplo: /sentiment Me encanta este producto, es increíble' };
  }

  await addAIReaction(sock, message, '😊');
  await showThinking(sock, remoteJid, 1500);

  try {
    if (!Sentiment) {
      return {
        success: false,
        message: '❌ Análisis de sentimientos no disponible. Instala: npm install sentiment'
      };
    }

    // Usar librería Sentiment real para análisis
    const sentiment = new Sentiment();
    const result = sentiment.analyze(texto);

    // Detectar idioma
    let detectedLang = 'unknown';
    let langName = 'Desconocido';

    if (franc) {
      detectedLang = franc(texto);
      langName = detectedLang === 'spa' ? 'Español' : detectedLang === 'eng' ? 'Inglés' : 'Desconocido';
    }

    // Clasificar sentimiento
    let classification = 'NEUTRO';
    let emoji = '😐';
    let confidence = Math.abs(result.score);

    if (result.score > 2) {
      classification = 'MUY POSITIVO';
      emoji = '😍';
    } else if (result.score > 0) {
      classification = 'POSITIVO';
      emoji = '😊';
    } else if (result.score < -2) {
      classification = 'MUY NEGATIVO';
      emoji = '😢';
    } else if (result.score < 0) {
      classification = 'NEGATIVO';
      emoji = '😞';
    }

    // Calcular puntuación del 1 al 10
    const score = Math.max(1, Math.min(10, 5 + (result.score * 0.8)));

    // Palabras clave encontradas
    const positiveWords = result.positive.length > 0 ? result.positive.join(', ') : 'Ninguna';
    const negativeWords = result.negative.length > 0 ? result.negative.join(', ') : 'Ninguna';

    return {
      success: true,
      message: `😊 *Análisis de Sentimientos Avanzado*\n\n📝 **Texto:** "${texto}"\n\n${emoji} **Resultado:** ${classification}\n📊 **Puntuación:** ${score.toFixed(1)}/10\n🎯 **Confianza:** ${confidence}\n🌍 **Idioma:** ${langName}\n\n📈 **Detalles:**\n• Palabras positivas: ${positiveWords}\n• Palabras negativas: ${negativeWords}\n• Total palabras: ${texto.split(' ').length}\n• Puntuación bruta: ${result.score}`
    };
  } catch (error) {
    console.error('Error en análisis de sentimientos:', error);
    return { success: false, message: '❌ Error analizando sentimientos' };
  }
}

export async function grammar(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const texto = args.join(' ').trim();

  if (!texto) {
    return { text: '❌ Uso: /grammar <texto>\nEjemplo: /grammar Hola como estas todo bien' };
  }

  await addAIReaction(sock, message, '✏️');
  await showThinking(sock, remoteJid, 2000);

  const prompt = `Corrige la gramática, ortografía y puntuación del siguiente texto en español. Proporciona la versión corregida y explica los errores encontrados:\n\n"${texto}"`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: `⚠️ Error: ${aiResult?.error || 'IA no disponible'}` };
  }

  return {
    text: `✏️ *Corrección Gramatical*\n\n📝 Original: "${texto}"\n\n${aiResult.response}`
  };
}

export async function code(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const descripcion = args.join(' ').trim();

  if (!descripcion) {
    return { text: '❌ Uso: /code <descripción>\nEjemplo: /code función para ordenar un array en JavaScript' };
  }

  await addAIReaction(sock, message, '💻');
  await showThinking(sock, remoteJid, 3000);

  const prompt = `Genera código limpio y bien comentado para: "${descripcion}". Incluye explicación de cómo funciona y ejemplos de uso si es apropiado.`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: `⚠️ Error: ${aiResult?.error || 'IA no disponible'}` };
  }

  return {
    text: `💻 *Generador de Código*\n\n📋 Solicitud: "${descripcion}"\n\n${aiResult.response}`
  };
}

export async function analyze(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const texto = args.join(' ').trim();

  if (!texto) {
    return { text: '❌ Uso: /analyze <texto>\nEjemplo: /analyze El cambio climático es un problema global que requiere acción inmediata' };
  }

  await addAIReaction(sock, message, '🔍');
  await showThinking(sock, remoteJid, 2500);

  try {
    if (!compromise) {
      return {
        success: false,
        message: '❌ Análisis de texto avanzado no disponible. Instala: npm install compromise natural'
      };
    }

    // Análisis con Natural.js y Compromise
    const doc = compromise(texto);

    // Estadísticas básicas
    const wordCount = texto.split(/\s+/).length;
    const sentenceCount = texto.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgWordsPerSentence = (wordCount / sentenceCount).toFixed(1);

    // Detectar idioma
    let detectedLang = 'unknown';
    let langName = 'Desconocido';

    if (franc) {
      detectedLang = franc(texto);
      langName = detectedLang === 'spa' ? 'Español' : detectedLang === 'eng' ? 'Inglés' : 'Desconocido';
    }

    // Extraer entidades
    const people = doc.people().out('array');
    const places = doc.places().out('array');
    const organizations = doc.organizations().out('array');
    const topics = doc.topics().out('array');

    // Análisis de sentimientos
    let sentimentResult = { score: 0 };
    if (Sentiment) {
      const sentiment = new Sentiment();
      sentimentResult = sentiment.analyze(texto);
    }
    let sentimentLabel = 'Neutro';
    if (sentimentResult.score > 1) sentimentLabel = 'Positivo';
    else if (sentimentResult.score < -1) sentimentLabel = 'Negativo';

    // Palabras más frecuentes (excluyendo stop words)
    const words = texto.toLowerCase().match(/\b\w+\b/g) || [];
    const stopWords = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'al', 'del', 'los', 'las', 'una', 'como', 'pero', 'sus', 'han', 'me', 'si', 'sin', 'sobre', 'este', 'ya', 'todo', 'esta', 'cuando', 'muy', 'sin', 'puede', 'son', 'dos', 'también', 'fue', 'había', 'era', 'más', 'hasta', 'desde', 'está', 'mi', 'porque'];
    const filteredWords = words.filter(word => !stopWords.includes(word) && word.length > 2);
    const wordFreq = {};
    filteredWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    const topWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word, count]) => `${word} (${count})`);

    // Nivel de complejidad
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    let complexity = 'Básico';
    if (avgWordLength > 6 && avgWordsPerSentence > 15) complexity = 'Avanzado';
    else if (avgWordLength > 5 || avgWordsPerSentence > 12) complexity = 'Intermedio';

    return {
      success: true,
      message: `🔍 *Análisis Completo de Texto*\n\n📊 **Estadísticas:**\n• Palabras: ${wordCount}\n• Oraciones: ${sentenceCount}\n• Promedio palabras/oración: ${avgWordsPerSentence}\n• Idioma: ${langName}\n• Complejidad: ${complexity}\n\n💭 **Sentimiento:** ${sentimentLabel} (${sentimentResult.score})\n\n🏷️ **Entidades encontradas:**\n• Personas: ${people.length > 0 ? people.join(', ') : 'Ninguna'}\n• Lugares: ${places.length > 0 ? places.join(', ') : 'Ninguno'}\n• Organizaciones: ${organizations.length > 0 ? organizations.join(', ') : 'Ninguna'}\n\n🔤 **Palabras más frecuentes:**\n${topWords.join(', ')}\n\n📝 **Temas identificados:**\n${topics.length > 0 ? topics.join(', ') : 'Análisis general'}`
    };
  } catch (error) {
    console.error('Error en análisis de texto:', error);
    return { success: false, message: '❌ Error analizando texto' };
  }
}

export async function brainstorm(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const tema = args.join(' ').trim();

  if (!tema) {
    return { text: '❌ Uso: /brainstorm <tema>\nEjemplo: /brainstorm ideas para mejorar la productividad en el trabajo' };
  }

  await addAIReaction(sock, message, '💡');
  await showThinking(sock, remoteJid, 2000);

  const prompt = `Genera una lluvia de ideas creativas y prácticas sobre: "${tema}". Proporciona al menos 8 ideas diferentes, organizadas y explicadas brevemente.`;
  const aiResult = await chatWithAI(prompt);

  if (!aiResult?.success) {
    return { text: `⚠️ Error: ${aiResult?.error || 'IA no disponible'}` };
  }

  return {
    text: `💡 *Lluvia de Ideas*\n\n🎯 Tema: "${tema}"\n\n${aiResult.response}`
  };
}

export default { ai, clasificar, resume, translate, explain, listClasificados, sentiment, grammar, code, analyze, brainstorm };
