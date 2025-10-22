import './config.js';
import axios from 'axios';

// Nota: no cacheamos la API key en carga de módulo para respetar
// cambios del entorno y el orden de carga de dotenv.
function resolveGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GENAI_API_KEY ||
    null
  );
}

function resolveModelCandidates() {
  const fromEnv = (process.env.GEMINI_MODEL || '').trim();
  const base = [
    // Modelos más recientes primero, según disponibilidad lista
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    // Modelos 1.5 como fallback
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
  ];
  return fromEnv ? [fromEnv, ...base.filter((m) => m !== fromEnv)] : base;
}

const GEMINI_ENDPOINT_FACTORIES = [
  (model) => `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
  (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
];

async function generateWithGemini({ apiKey, prompt }) {
  const models = resolveModelCandidates();
  const headers = { 'Content-Type': 'application/json' };
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  let lastError = null;

  for (const makeUrl of GEMINI_ENDPOINT_FACTORIES) {
    for (const model of models) {
      const url = makeUrl(model) + `?key=${apiKey}`;
      try {
        const response = await axios.post(url, body, { headers, timeout: 15000 });
        const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text, model, endpoint: url.includes('/v1/') ? 'v1' : 'v1beta' };
        lastError = new Error('Respuesta vacía de la IA');
      } catch (err) {
        const msg = err?.response?.data?.error?.message || err?.message || String(err);
        const code = err?.response?.status;
        // Si el error es de modelo no encontrado/soportado, intentar siguiente combinación
        if (
          msg?.toLowerCase?.().includes('not found') ||
          msg?.toLowerCase?.().includes('not supported') ||
          code === 404
        ) {
          lastError = new Error(`${msg} (model=${model})`);
          continue;
        }
        // Para 403/401/400 también probamos los demás modelos/versions, pero guardamos el último detalle
        lastError = new Error(`${msg} (model=${model})`);
      }
    }
  }
  throw lastError || new Error('No se pudo generar respuesta con Gemini');
}

export async function analyzeContentWithAI(content, filename = '') {
  try {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no configurada'
      };
    }

    const prompt = `
Analiza el siguiente contenido de un mensaje de WhatsApp y clasificalo:

Contenido del mensaje: "${content}"
Nombre del archivo: "${filename}"

Responde en formato JSON con la siguiente estructura:
{
  "tipo": "manhwa|serie|extra|ilustracion|pack|anime|otros",
  "titulo": "Titulo detectado o null",
  "capitulo": "Numero de capitulo detectado o null",
  "confianza": 0-100,
  "descripcion": "Breve descripcion del contenido"
}

Reglas de clasificacion:
- Si menciona "manhwa", "manga", "comic"  tipo: "manhwa"
- Si menciona "serie", "episodio", "temporada"  tipo: "serie"
- Si menciona "ilustracion", "fanart", "arte" -> tipo: "ilustracion"
- Si menciona "pack", "coleccion"  tipo: "pack"
- Si menciona "anime", "animacion"  tipo: "anime"
- Por defecto: "extra"

Busca numeros que parezcan capitulos (ej: "cap 45", "episodio 12", "volumen 3").
Extrae titulos que parezcan nombres de obras.
`;

    const { text: aiResponse, model } = await generateWithGemini({ apiKey, prompt });

    if (!aiResponse) {
      return {
        success: false,
        error: 'No se recibio respuesta de la IA'
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
        throw new Error('No se encontro JSON valido');
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
      },
      model
    };

  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error('Error en analyzeContentWithAI:', detail);
    return {
      success: false,
      error: detail
    };
  }
}

export async function chatWithAI(message, context = '') {
  try {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no esta configurada'
      };
    }

    const prompt = `
Eres un asistente de IA amigable para un bot de WhatsApp llamado KONMI-BOT.
Contexto: ${context}

Pregunta del usuario: ${message}

Responde de forma clara, concisa y util. Si la pregunta es sobre manhwas, series, o contenido multimedia, se especifico.
Manten un tono amigable y profesional.
`;

    const { text: aiResponse, model } = await generateWithGemini({ apiKey, prompt });

    if (!aiResponse) {
      return {
        success: false,
        error: 'No se recibio respuesta de la IA'
      };
    }

    return {
      success: true,
      response: aiResponse,
      model
    };

  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error('Error en chatWithAI:', detail);
    return {
      success: false,
      error: detail
    };
  }
}

export async function analyzeManhwaContent(content) {
  try {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'GEMINI_API_KEY no configurada'
      };
    }

    const prompt = `
Analiza si el siguiente contenido es de un manhwa y extrae informacion:

Contenido: "${content}"

Responde en formato JSON:
{
  "es_manhwa": true/false,
  "titulo": "Titulo del manhwa o null",
  "capitulo": "Numero de capitulo o null",
  "autor": "Autor si se menciona o null",
  "genero": "Genero si se detecta o null"
}
`;

    const { text: aiResponse, model } = await generateWithGemini({ apiKey, prompt });
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      analysis,
      model
    };

  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    return { success: false, error: detail };
  }
}
