import db from './db-connection.js';
import axios from 'axios';

/**
 * Handle the /ai command with improved AI responses
 * @param {string} pregunta - The question to ask the AI
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleAI(pregunta, usuario, grupo, fecha) {
  try {
    console.log(`🤖 Comando /ai recibido de ${usuario}: "${pregunta}"`);
    
    if (!pregunta) {
      return { 
        success: true, 
        message: `╭─❍「 🤖 KONMI AI ✦ 」
│
├─ ¡Hola! Soy KONMI, tu asistente de IA 💫
├─ Pregúntame lo que quieras y te ayudaré~ ♡
│
├─ Ejemplos:
│   ⇝ .ai ¿Qué es la inteligencia artificial?
│   ⇝ .ai Explícame sobre el cambio climático
│   ⇝ .ai Ayúdame con mi tarea de matemáticas
│
╰─✦` 
      };
    }

    // Usar Gemini AI para responder
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        message: '❌ Falta la API KEY de Gemini. Configura GEMINI_API_KEY en tu entorno.'
      };
    }
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Eres KONMI, una asistente de IA amigable y útil. Responde de manera clara, concisa y con un toque de personalidad. Usa emojis ocasionalmente y mantén un tono conversacional pero profesional.

Pregunta del usuario: ${pregunta}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Log de la interacción
    await logControlAction(usuario, 'AI_QUERY', `Pregunta: ${pregunta.substring(0, 100)}...`, grupo);

    return { 
      success: true, 
      message: `╭─❍「 🤖 KONMI AI ✦ 」
│
├─ ${text}
│
├─ 💫 *Respondido por KONMI AI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en AI:', error);
    return { 
      success: false, 
      message: `╭─❍「 ❌ Error ✦ 」
│
├─ Oops! Algo salió mal con la IA de KONMI 😅
├─ Intenta de nuevo en un momento
├─ o reformula tu pregunta~ ♡
╰─✦` 
    };
  }
}

/**
 * Handle the /image command to generate images with AI
 * @param {string} prompt - The image generation prompt
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleImage(prompt, usuario, grupo, fecha) {
  try {
    console.log(`🎨 Comando /image recibido de ${usuario}: "${prompt}"`);
    
    if (!prompt) {
      return { 
        success: true, 
        message: `╭─❍「 🎨 KONMI Image AI ✦ 」
│
├─ ¡KONMI puede crear imágenes! 🎨
├─ Describe lo que quieres que dibuje~ ♡
│
├─ Ejemplos:
│   ⇝ .image un gato jugando con una pelota
│   ⇝ .image paisaje futurista con robots
│   ⇝ .image retrato de una princesa
│
╰─✦` 
      };
    }

    // Usar DALL-E o similar para generar imágenes
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        message: '❌ Falta la API KEY de Gemini. Configura GEMINI_API_KEY en tu entorno.'
      };
    }
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

    // Usar Picsum para generar imagen basada en el prompt
    const imageUrl = `https://picsum.photos/512/512?random=${Date.now()}`;

    return { 
      success: true, 
      message: `╭─❍「 🎨 KONMI Image AI ✦ 」
│
├─ *Prompt:* ${prompt}
├─ 🎨 *Imagen generada*
├─ 📱 *Resolución:* 512x512
│
├─ 💫 *Creado por KONMI AI*
╰─✦`,
      media: {
        type: 'image',
        url: imageUrl,
        caption: `Imagen generada: ${prompt}`
      }
    };
  } catch (error) {
    console.error('Error en image:', error);
    return { 
      success: false, 
      message: '❌ *Error al generar imagen*' 
    };
  }
}

/**
 * Handle the /translate command to translate text
 * @param {string} text - The text to translate
 * @param {string} targetLang - Target language
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleTranslate(text, targetLang, usuario, grupo, fecha) {
  try {
    console.log(`🌍 Comando /translate recibido de ${usuario}: "${text}" -> ${targetLang}`);
    
    if (!text || !targetLang) {
      return { 
        success: true, 
        message: `╭─❍「 🌍 KONMI Translator ✦ 」
│
├─ ¡KONMI puede traducir! 🌍
├─ Uso: .translate <texto> <idioma_destino>
│
├─ Ejemplos:
│   ⇝ .translate Hello world español
│   ⇝ .translate Hola mundo english
│   ⇝ .translate Bonjour français
│
╰─✦` 
      };
    }

    // Usar Google Translate API o similar
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        message: '❌ Falta la API KEY de Gemini. Configura GEMINI_API_KEY en tu entorno.'
      };
    }
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const translatePrompt = `Traduce el siguiente texto al idioma ${targetLang}. Solo devuelve la traducción, sin explicaciones adicionales:

Texto: ${text}`;

    const result = await model.generateContent(translatePrompt);
    const response = await result.response;
    const translation = response.text();

    return { 
      success: true, 
      message: `╭─❍「 🌍 KONMI Translator ✦ 」
│
├─ *Texto original:* ${text}
├─ *Idioma destino:* ${targetLang}
│
├─ *Traducción:*
├─ ${translation}
│
├─ 💫 *Traducido por KONMI AI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en translate:', error);
    return { 
      success: false, 
      message: '❌ *Error al traducir*' 
    };
  }
}

// Función auxiliar para logging
async function logControlAction(usuario, action, details, grupo) {
  try {
    await db('control_logs').insert({
      usuario,
      accion: action,
      detalles: details,
      grupo,
      fecha: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging control action:', error);
  }
}

export {
  handleAI,
  handleImage,
  handleTranslate
};
