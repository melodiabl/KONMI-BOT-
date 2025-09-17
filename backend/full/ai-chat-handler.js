import { getGeminiModel, hasGeminiApiKey } from './gemini-client.js';

/**
 * Responder preguntas generales usando Gemini AI
 */
async function chatWithAI(message, context = '') {
  try {
    if (!hasGeminiApiKey()) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no está configurada'
      };
    }

    const model = getGeminiModel('gemini-pro');

    const prompt = `
Eres KONMI BOT, un asistente especializado en manhwas, webtoons y contenido de entretenimiento asiático. 

Contexto: ${context || 'Consulta general'}

Pregunta del usuario: "${message}"

Responde de manera útil, concisa y amigable. Si la pregunta es sobre manhwas, webtoons, o contenido similar, proporciona información detallada. Si no es sobre estos temas, responde de manera general pero útil.

Mantén las respuestas en español y con un tono profesional pero cercano. Limita la respuesta a máximo 500 caracteres.

Responde directamente sin prefijos como "Respuesta:" o similares.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return {
      success: true,
      response: text,
      model: 'gemini-pro'
    };

  } catch (error) {
    console.error('Error en chat con IA:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analizar contenido de manhwa con IA
 */
async function analyzeManhwaContent(message, filename = '') {
  try {
    if (!hasGeminiApiKey()) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no está configurada'
      };
    }

    const model = getGeminiModel('gemini-pro');

    const prompt = `
Analiza el siguiente contenido para extraer información sobre manhwa/webtoon:

MENSAJE: "${message}"
ARCHIVO: "${filename}"

Extrae y devuelve SOLO un objeto JSON con esta estructura:
{
  "titulo": "título detectado o 'Desconocido'",
  "tipo": "capítulo|extra|ilustración|pack|desconocido",
  "capitulo": "número de capítulo o null",
  "confianza": 0.0-1.0,
  "descripcion": "descripción breve del contenido"
}

REGLAS:
- Si detectas títulos conocidos de manhwa (Jinx, Painter of the Night, BJ Alex, etc.), úsalos
- Para "tipo": usa "capítulo" si hay números, "extra" para contenido adicional, "ilustración" para imágenes, "pack" para colecciones
- "confianza" debe ser alta (>0.8) solo si estás muy seguro
- Responde SOLO con el JSON, sin texto adicional
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      const cleanText = text.replace(/```json|```/g, '').trim();
      const aiResult = JSON.parse(cleanText);
      
      return {
        success: true,
        data: {
          titulo: aiResult.titulo || 'Desconocido',
          tipo: aiResult.tipo || 'desconocido',
          capitulo: aiResult.capitulo || null,
          confianza: aiResult.confianza || 0.5,
          descripcion: aiResult.descripcion || '',
          fuente: 'gemini-ai'
        }
      };
    } catch (parseError) {
      console.error('Error parseando respuesta de Gemini:', parseError);
      return {
        success: false,
        error: 'Respuesta de IA no válida',
        rawResponse: text
      };
    }

  } catch (error) {
    console.error('Error con Gemini AI:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generar respuesta inteligente para comandos del bot
 */
async function generateBotResponse(command, context = '') {
  try {
    if (!hasGeminiApiKey()) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no está configurada'
      };
    }

    const model = getGeminiModel('gemini-pro');

    const prompt = `
Eres KONMI BOT, un bot de WhatsApp especializado en manhwas y contenido de entretenimiento.

Comando recibido: "${command}"
Contexto: ${context || 'Sin contexto específico'}

Genera una respuesta útil y apropiada para este comando. Si es una pregunta, respóndela. Si es una solicitud, explica cómo ayudar.

Mantén las respuestas concisas (máximo 300 caracteres) y en español.

Responde directamente sin prefijos.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return {
      success: true,
      response: text,
      model: 'gemini-pro'
    };

  } catch (error) {
    console.error('Error generando respuesta del bot:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export {
  chatWithAI,
  analyzeManhwaContent,
  generateBotResponse
};









