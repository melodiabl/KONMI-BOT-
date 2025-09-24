import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function analyzeContentWithAI(content, filename = '') {
  try {
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no configurada'
      };
    }

    const prompt = `
Analiza el siguiente contenido de un mensaje de WhatsApp y clasifícalo:

Contenido del mensaje: "${content}"
Nombre del archivo: "${filename}"

Responde en formato JSON con la siguiente estructura:
{
  "tipo": "manhwa|serie|extra|ilustracion|pack|anime|otros",
  "titulo": "Título detectado o null",
  "capitulo": "Número de capítulo detectado o null",
  "confianza": 0-100,
  "descripcion": "Breve descripción del contenido"
}

Reglas de clasificación:
- Si menciona "manhwa", "manga", "comic" → tipo: "manhwa"
- Si menciona "serie", "episodio", "temporada" → tipo: "serie"
- Si menciona "ilustracion", "fanart", "arte" → tipo: "ilustracion"
- Si menciona "pack", "coleccion" → tipo: "pack"
- Si menciona "anime", "animacion" → tipo: "anime"
- Por defecto: "extra"

Busca números que parezcan capítulos (ej: "cap 45", "episodio 12", "volumen 3").
Extrae títulos que parezcan nombres de obras.
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      return {
        success: false,
        error: 'No se recibió respuesta de la IA'
      };
    }

    // Parsear la respuesta JSON
    let analysis;
    try {
      // Extraer JSON de la respuesta
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se encontró JSON válido');
      }
    } catch (parseError) {
      console.error('Error parseando respuesta AI:', parseError);
      return {
        success: false,
        error: 'Error parseando respuesta de la IA'
      };
    }

    return {
      success: true,
      analysis: {
        tipo: analysis.tipo || 'extra',
        titulo: analysis.titulo || null,
        capitulo: analysis.capitulo || null,
        confianza: analysis.confianza || 50,
        descripcion: analysis.descripcion || content
      }
    };

  } catch (error) {
    console.error('Error en analyzeContentWithAI:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function chatWithAI(message, context = '') {
  try {
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no está configurada'
      };
    }

    const prompt = `
Eres un asistente de IA amigable para un bot de WhatsApp llamado KONMI-BOT.
Contexto: ${context}

Pregunta del usuario: ${message}

Responde de forma clara, concisa y útil. Si la pregunta es sobre manhwas, series, o contenido multimedia, sé específico.
Mantén un tono amigable y profesional.
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      return {
        success: false,
        error: 'No se recibió respuesta de la IA'
      };
    }

    return {
      success: true,
      response: aiResponse,
      model: 'gemini-1.5-flash'
    };

  } catch (error) {
    console.error('Error en chatWithAI:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function analyzeManhwaContent(content) {
  try {
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no configurada'
      };
    }

    const prompt = `
Analiza si el siguiente contenido es de un manhwa y extrae información:

Contenido: "${content}"

Responde en formato JSON:
{
  "es_manhwa": true/false,
  "titulo": "Título del manhwa o null",
  "capitulo": "Número de capítulo o null",
  "autor": "Autor si se menciona o null",
  "genero": "Género si se detecta o null"
}
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      analysis
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
