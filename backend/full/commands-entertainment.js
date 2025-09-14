import db from './db-connection.js';
import axios from 'axios';

/**
 * Handle the /weather command to get weather information
 * @param {string} city - The city to get weather for
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleWeather(city, usuario, grupo, fecha) {
  try {
    console.log(`🌤️ Comando /weather recibido de ${usuario}: "${city}"`);
    
    if (!city) {
      return { 
        success: true, 
        message: `╭─❍「 🌤️ KONMI Weather ✦ 」
│
├─ ¡KONMI puede predecir el clima! 🌤️
├─ Dame el nombre de una ciudad~ ♡
│
├─ Ejemplos:
│   ⇝ .weather Madrid
│   ⇝ .weather New York
│   ⇝ .weather Tokyo
│
╰─✦` 
      };
    }

    // Simular datos de clima (en producción usar API real)
    const temperatures = [15, 18, 22, 25, 28, 30, 32, 35];
    const descriptions = ['soleado', 'parcialmente nublado', 'nublado', 'lluvioso', 'tormentoso'];
    const humidities = [30, 45, 60, 75, 90];
    
    const temp = temperatures[Math.floor(Math.random() * temperatures.length)];
    const feelsLike = temp + Math.floor(Math.random() * 5) - 2;
    const humidity = humidities[Math.floor(Math.random() * humidities.length)];
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    const windSpeed = Math.floor(Math.random() * 20) + 5;

    return { 
      success: true, 
      message: `╭─❍「 🌤️ *${city}* Weather ✦ 」
│
├─ 🌡️ *Temperatura:* ${temp}°C
├─ 🤔 *Sensación térmica:* ${feelsLike}°C
├─ 💧 *Humedad:* ${humidity}%
├─ 💨 *Viento:* ${windSpeed} km/h
├─ ☁️ *Descripción:* ${description}
│
├─ 💫 *Información de KONMI Weather*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en weather:', error);
    return { 
      success: true, 
      message: `╭─❍「 ❌ Error ✦ 」
│
├─ No pude obtener el clima de "${city}" 😔
├─ Verifica que el nombre de la ciudad sea correcto
├─ o intenta con otra ciudad~ ♡
╰─✦` 
    };
  }
}

/**
 * Handle the /quote command to get inspirational quotes
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleQuote(usuario, grupo, fecha) {
  try {
    console.log(`💭 Comando /quote recibido de ${usuario}`);
    
    const res = await axios.get('https://api.quotable.io/random');
    const quote = res.data;
    
    return { 
      success: true, 
      message: `╭─❍「 💭 KONMI Quote ✦ 」
│
├─ "${quote.content}"
│
├─ — *${quote.author}*
├─ 📊 *Longitud:* ${quote.length} caracteres
├─ 🏷️ *Tags:* ${quote.tags.join(', ')}
│
├─ 💫 *Inspirado por KONMI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en quote:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener cita*' 
    };
  }
}

/**
 * Handle the /fact command to get random facts
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleFact(usuario, grupo, fecha) {
  try {
    console.log(`📚 Comando /fact recibido de ${usuario}`);
    
    const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=es');
    const fact = res.data;
    
    return { 
      success: true, 
      message: `╭─❍「 📚 KONMI Fact ✦ 」
│
├─ ${fact.text}
│
├─ 💫 *Dato curioso de KONMI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en fact:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener dato*' 
    };
  }
}

/**
 * Handle the /trivia command to get trivia questions
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleTrivia(usuario, grupo, fecha) {
  try {
    console.log(`🧠 Comando /trivia recibido de ${usuario}`);
    
    const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple&lang=es');
    const trivia = res.data.results[0];
    
    const options = trivia.incorrect_answers.concat(trivia.correct_answer);
    const shuffledOptions = options.sort(() => Math.random() - 0.5);
    
    let optionsText = '';
    shuffledOptions.forEach((option, index) => {
      optionsText += `${String.fromCharCode(65 + index)}. ${option}\n`;
    });
    
    return { 
      success: true, 
      message: `╭─❍「 🧠 KONMI Trivia ✦ 」
│
├─ *Categoría:* ${trivia.category}
├─ *Dificultad:* ${trivia.difficulty}
│
├─ *Pregunta:*
├─ ${trivia.question}
│
├─ *Opciones:*
├─ ${optionsText}
├─ 💫 *Trivia de KONMI*
╰─✦`,
      triviaAnswer: trivia.correct_answer
    };
  } catch (error) {
    console.error('Error en trivia:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener trivia*' 
    };
  }
}

/**
 * Handle the /horoscope command to get horoscope
 * @param {string} sign - The zodiac sign
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleHoroscope(sign, usuario, grupo, fecha) {
  try {
    console.log(`🔮 Comando /horoscope recibido de ${usuario}: "${sign}"`);
    
    if (!sign) {
      return { 
        success: true, 
        message: `╭─❍「 🔮 KONMI Horoscope ✦ 」
│
├─ ¡KONMI puede leer las estrellas! 🔮
├─ Dame tu signo zodiacal~ ♡
│
├─ Signos disponibles:
│   ⇝ .horoscope aries
│   ⇝ .horoscope tauro
│   ⇝ .horoscope geminis
│   ⇝ .horoscope cancer
│   ⇝ .horoscope leo
│   ⇝ .horoscope virgo
│   ⇝ .horoscope libra
│   ⇝ .horoscope escorpio
│   ⇝ .horoscope sagitario
│   ⇝ .horoscope capricornio
│   ⇝ .horoscope acuario
│   ⇝ .horoscope piscis
│
╰─✦` 
      };
    }

    // Simular horóscopo (en producción usar API real)
    const horoscopes = {
      aries: "Hoy las estrellas te favorecen para tomar decisiones importantes. Tu energía está en su punto más alto.",
      tauro: "Es un buen día para disfrutar de las cosas simples de la vida. La paciencia será tu mejor aliada.",
      geminis: "La comunicación será clave hoy. Expresa tus ideas con claridad y escucha a los demás.",
      cancer: "Tus emociones están muy presentes hoy. Confía en tu intuición para guiarte.",
      leo: "Es tu momento de brillar. No tengas miedo de mostrar tu verdadero yo.",
      virgo: "La organización y el detalle serán importantes hoy. Planifica bien tu día.",
      libra: "Busca el equilibrio en todas las áreas de tu vida. La armonía te traerá paz.",
      escorpio: "Tu intensidad natural te ayudará a resolver situaciones complejas hoy.",
      sagitario: "La aventura te llama. No tengas miedo de explorar nuevas posibilidades.",
      capricornio: "Tu determinación te llevará lejos hoy. Mantén el enfoque en tus objetivos.",
      acuario: "Tu creatividad está en su mejor momento. Aprovecha para innovar.",
      piscis: "Tu sensibilidad te ayudará a conectar con los demás de manera profunda."
    };

    const signLower = sign.toLowerCase();
    const horoscope = horoscopes[signLower] || "Signo no reconocido. Intenta con otro signo zodiacal.";

    return { 
      success: true, 
      message: `╭─❍「 🔮 *${sign.toUpperCase()}* Horoscope ✦ 」
│
├─ ${horoscope}
│
├─ 💫 *Predicción de KONMI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en horoscope:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener horóscopo*' 
    };
  }
}

export {
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope
};
