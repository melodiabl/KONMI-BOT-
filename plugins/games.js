// =========================
// PLUGIN DE JUEGOS - Funcionalidades Wileys + Temática BL
// =========================

// Funcionalidades Wileys completas + Temática BL integrada
const BL_GAME_REACTIONS = ['🎮', '💖', '✨', '🎯', '💕', '🌸', '💝', '🌟', '🥰', '😍'];
const BL_GAME_MESSAGES = {
  playing: ['💖 ¡Jugando con amor!', '✨ ¡Que tengas suerte!', '🌸 ¡Diviértete mucho!'],
  win: ['🎉 ¡Ganaste! ¡Eres increíble! 💖', '✨ ¡Victoria! ¡Lo hiciste genial!', '🌸 ¡Perfecto! ¡Eres el mejor!'],
  lose: ['🥺 No ganaste esta vez, pero no te rindas 💔', '😢 Casi lo logras, inténtalo de nuevo', '💔 No fue tu turno, pero sigue intentando']
};

// Wileys: Reacciones automáticas BL mejoradas para juegos
const addBLGameReaction = async (sock, message, type = 'game') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      game: ['🎮', '💖', '✨'],
      win: ['🎉', '💖', '🌟'],
      lose: ['🥺', '💔', '🌸'],
      dice: ['🎲', '💕', '✨'],
      card: ['🃏', '💖', '🌸']
    };

    const sequence = reactionSequences[type] || reactionSequences.game;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_GAME_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de juegos
const decorateBLGameMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    game: {
      header: '╔🎮═══════════════════════════════════════🎮╗',
      footer: '╚🎮═══════════════════════════════════════🎮╝',
      bullet: '🎮'
    },
    win: {
      header: '╔🎉═══════════════════════════════════════🎉╗',
      footer: '╚🎉═══════════════════════════════════════🎉╝',
      bullet: '🎉'
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

// Wileys: Mensaje de estado BL para juegos
const createBLGameStatusMessage = (type) => {
  const messages = BL_GAME_MESSAGES[type] || BL_GAME_MESSAGES.playing;
  return messages[Math.floor(Math.random() * messages.length)];
};

/**
 * Piedra, papel o tijera
 */
export async function rps(ctx) {
  const { sock, message } = ctx;
  const choices = ["piedra", "papel", "tijera"];
  const userChoice = (ctx.args[0] || "").toLowerCase();

  if (!userChoice) {
    return {
      text: decorateBLGameMessage('Piedra, Papel o Tijera', 'Uso: /rps <opción>\n\nOpciones:\n🪨 piedra\n📄 papel\n✂️ tijera\n\nEjemplo: /rps piedra', 'game')
    };
  }

  if (!choices.includes(userChoice)) {
    return {
      text: decorateBLGameMessage('Error', '❌ Opción inválida. Usa: piedra, papel o tijera\n🥺 Intenta de nuevo', 'love')
    };
  }

  // Funcionalidad Wileys: Reacción automática BL
  await addBLGameReaction(sock, message, 'game');

  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  const emojis = { piedra: "🪨", papel: "📄", tijera: "✂️" };

  let result;
  let resultType = 'game';
  if (userChoice === botChoice) {
    result = "🤝 ¡Empate! 💖";
  } else if (
    (userChoice === "piedra" && botChoice === "tijera") ||
    (userChoice === "papel" && botChoice === "piedra") ||
    (userChoice === "tijera" && botChoice === "papel")
  ) {
    result = "🎉 ¡Ganaste! ¡Eres increíble! 💖";
    resultType = 'win';
  } else {
    result = "😅 ¡Perdiste! Pero no te rindas 🥺💕";
    resultType = 'lose';
  }

  // Reacción adicional según resultado
  setTimeout(() => addBLGameReaction(sock, message, resultType), 1500);

  const gameContent = `👤 Tú: ${emojis[userChoice]} ${userChoice}\n🤖 Bot: ${emojis[botChoice]} ${botChoice}\n\n${result}`;

  return {
    text: decorateBLGameMessage('Piedra, Papel o Tijera', gameContent, resultType === 'win' ? 'win' : 'game')
  };
}

/**
 * Adivinar número
 */
export async function guess(ctx) {
  const { args, sock, message } = ctx;
  const userGuess = parseInt(args[0]);

  if (!userGuess || userGuess < 1 || userGuess > 100) {
    return {
      text: `🎯 *Adivina el Número*\n\n*Uso:* /guess <número>\n\n*Rango:* 1-100\n\n*Ejemplo:* /guess 50`
    };
  }

  // Funcionalidad Wileys: Reacción automática
  await addGameReaction(sock, message, '🎯');

  const botNumber = Math.floor(Math.random() * 100) + 1;
  const difference = Math.abs(userGuess - botNumber);

  let result;
  if (userGuess === botNumber) {
    result = "🎉 ¡PERFECTO! ¡Adivinaste el número exacto!";
  } else if (difference <= 5) {
    result = "🔥 ¡Muy cerca! Casi lo logras";
  } else if (difference <= 15) {
    result = "👍 Cerca, pero no tanto";
  } else {
    result = "❄️ Muy lejos del número";
  }

  return {
    text: `🎯 *Adivina el Número*\n\n👤 Tu número: ${userGuess}\n🤖 Mi número: ${botNumber}\n📊 Diferencia: ${difference}\n\n${result}`
  };
}

/**
 * Dados virtuales
 */
export async function dice(ctx) {
  const { args, sock, message } = ctx;
  const numDice = parseInt(args[0]) || 1;

  if (numDice < 1 || numDice > 6) {
    return {
      text: `🎲 *Dados Virtuales*\n\n*Uso:* /dice [cantidad]\n\n*Cantidad:* 1-6 dados\n\n*Ejemplo:* /dice 2`
    };
  }

  // Funcionalidad Wileys: Reacción automática
  await addGameReaction(sock, message, '🎲');

  const results = [];
  let total = 0;

  for (let i = 0; i < numDice; i++) {
    const roll = Math.floor(Math.random() * 6) + 1;
    results.push(roll);
    total += roll;
  }

  const diceEmojis = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const resultText = results.map(r => `${diceEmojis[r]} ${r}`).join("\n");

  return {
    text: `🎲 *Dados Virtuales*\n\n${resultText}\n\n📊 Total: ${total}${numDice > 1 ? ` (${numDice} dados)` : ""}`
  };
}

/**
 * Sorteo/Ruleta
 */
export async function sorteo(ctx) {
  const { args, sock, message } = ctx;

  if (args.length === 0) {
    return {
      text: `🎰 *Sorteo/Ruleta*\n\n*Uso:* /sorteo <opción1> <opción2> <opción3>...\n\n*Ejemplo:* /sorteo Pizza Hamburguesa Tacos Sushi`
    };
  }

  // Funcionalidad Wileys: Reacción automática
  await addGameReaction(sock, message, '🎰');

  const options = args;
  const winner = options[Math.floor(Math.random() * options.length)];

  return {
    text: `🎰 *Sorteo/Ruleta*\n\n🎯 *Opciones:*\n${options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}\n\n🏆 *Ganador:* ${winner}`
  };
}

/**
 * Moneda (cara o cruz)
 */
export async function coin(ctx) {
  const { sock, message } = ctx;

  // Funcionalidad Wileys: Reacción automática
  await addGameReaction(sock, message, '🪙');

  const result = Math.random() < 0.5 ? "cara" : "cruz";
  const emoji = result === "cara" ? "🪙" : "🔄";

  return {
    text: `🪙 *Lanzar Moneda*\n\n${emoji} Resultado: **${result.toUpperCase()}**`
  };
}

/**
 * Juego principal - menú de juegos
 */
export async function game(ctx) {
  return {
    text: `🎮 *MENÚ DE JUEGOS*\n\n🪨 */rps* <opción> - Piedra, papel o tijera\n🎯 */guess* <número> - Adivina el número (1-100)\n🎲 */dice* [cantidad] - Lanzar dados (1-6)\n🎰 */sorteo* <opciones> - Sorteo/ruleta\n🪙 */coin* - Lanzar moneda\n🎪 */hangman* <palabra> - Juego del ahorcado\n🧠 */memory* - Juego de memoria\n🃏 */blackjack* - Blackjack simple\n🎲 */lottery* - Lotería de números\n\n*Ejemplo:*\n/rps piedra\n/guess 50\n/dice 2\n/hangman javascript`
  };
}

// =========================
// NUEVOS JUEGOS WILEYS
// =========================

/**
 * Juego del ahorcado
 */
export async function hangman(ctx) {
  const { args, sock, message } = ctx;

  if (args.length === 0) {
    return {
      text: `🎪 *Juego del Ahorcado*\n\n*Uso:* /hangman <palabra>\n\n*Ejemplo:* /hangman javascript\n\n*Reglas:*\n• Adivina la palabra letra por letra\n• Tienes 6 intentos fallidos\n• Las palabras deben tener 3-15 caracteres`
    };
  }

  await addGameReaction(sock, message, '🎪');

  const word = args[0].toLowerCase();

  if (word.length < 3 || word.length > 15) {
    return { text: '❌ La palabra debe tener entre 3 y 15 caracteres' };
  }

  if (!/^[a-zA-Z]+$/.test(word)) {
    return { text: '❌ La palabra solo puede contener letras' };
  }

  const hiddenWord = word.replace(/./g, '_ ').trim();
  const hangmanStages = [
    '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```'
  ];

  return {
    text: `🎪 *Juego del Ahorcado*\n\n${hangmanStages[0]}\n\n📝 Palabra: ${hiddenWord}\n❤️ Vidas: 6\n🔤 Letras usadas: ninguna\n\n💡 *Instrucciones:*\nResponde con una letra para adivinar\nEjemplo: "a" o "e"`
  };
}

/**
 * Juego de memoria con secuencias
 */
export async function memory(ctx) {
  const { sock, message } = ctx;

  await addGameReaction(sock, message, '🧠');

  const sequence = [];
  const emojis = ['🔴', '🟡', '🟢', '🔵'];

  // Generar secuencia de 4 elementos
  for (let i = 0; i < 4; i++) {
    sequence.push(emojis[Math.floor(Math.random() * emojis.length)]);
  }

  return {
    text: `🧠 *Juego de Memoria*\n\n📋 *Instrucciones:*\nMemoriza esta secuencia y repítela:\n\n${sequence.join(' ')}\n\n⏰ Tienes 10 segundos para memorizarla...\n\n💡 Responde con los emojis en el mismo orden\nEjemplo: 🔴🟡🟢🔵`
  };
}

/**
 * Blackjack simple
 */
export async function blackjack(ctx) {
  const { args, sock, message } = ctx;

  await addGameReaction(sock, message, '🃏');

  const action = args[0]?.toLowerCase();

  if (!action || !['hit', 'stand', 'new'].includes(action)) {
    return {
      text: `🃏 *Blackjack*\n\n*Comandos:*\n/blackjack new - Nueva partida\n/blackjack hit - Pedir carta\n/blackjack stand - Plantarse\n\n*Objetivo:* Llegar a 21 sin pasarse\n*Valores:* A=1/11, J/Q/K=10`
    };
  }

  const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suits = ['♠️', '♥️', '♦️', '♣️'];

  const getRandomCard = () => {
    const card = cards[Math.floor(Math.random() * cards.length)];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    return `${card}${suit}`;
  };

  const getCardValue = (card) => {
    const value = card.replace(/[♠️♥️♦️♣️]/g, '');
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 11; // Simplificado
    return parseInt(value);
  };

  if (action === 'new') {
    const playerCards = [getRandomCard(), getRandomCard()];
    const dealerCards = [getRandomCard(), '🂠']; // Una carta oculta

    const playerValue = playerCards.reduce((sum, card) => sum + getCardValue(card), 0);

    return {
      text: `🃏 *Nueva Partida de Blackjack*\n\n👤 *Tus cartas:* ${playerCards.join(' ')}\n📊 *Tu puntuación:* ${playerValue}\n\n🤖 *Dealer:* ${dealerCards.join(' ')}\n\n${playerValue === 21 ? '🎉 ¡BLACKJACK! ¡Ganaste!' : '¿Qué quieres hacer?\n/blackjack hit - Pedir carta\n/blackjack stand - Plantarse'}`
    };
  }

  return {
    text: `🃏 *Blackjack*\n\n⚠️ Primero inicia una nueva partida con:\n/blackjack new`
  };
}

/**
 * Lotería de números
 */
export async function lottery(ctx) {
  const { args, sock, message } = ctx;

  await addGameReaction(sock, message, '🎲');

  if (args.length === 0) {
    return {
      text: `🎲 *Lotería de Números*\n\n*Uso:* /lottery <tus números>\n\n*Ejemplo:* /lottery 7 14 23 31 42\n\n*Reglas:*\n• Elige 5 números del 1 al 50\n• Separados por espacios\n• Ganas si aciertas 3 o más números`
    };
  }

  const userNumbers = args.slice(0, 5).map(n => parseInt(n)).filter(n => n >= 1 && n <= 50);

  if (userNumbers.length !== 5) {
    return { text: '❌ Debes elegir exactamente 5 números válidos (1-50)' };
  }

  // Generar números ganadores
  const winningNumbers = [];
  while (winningNumbers.length < 5) {
    const num = Math.floor(Math.random() * 50) + 1;
    if (!winningNumbers.includes(num)) {
      winningNumbers.push(num);
    }
  }

  const matches = userNumbers.filter(num => winningNumbers.includes(num));
  const matchCount = matches.length;

  let prize = '';
  if (matchCount === 5) prize = '🏆 ¡JACKPOT! ¡Todos los números!';
  else if (matchCount === 4) prize = '🥈 ¡Excelente! 4 números';
  else if (matchCount === 3) prize = '🥉 ¡Bien! 3 números';
  else if (matchCount === 2) prize = '👍 2 números - Casi';
  else prize = '😔 Sin suerte esta vez';

  return {
    text: `🎲 *Lotería de Números*\n\n🎯 *Números ganadores:*\n${winningNumbers.sort((a,b) => a-b).join(' - ')}\n\n🎫 *Tus números:*\n${userNumbers.sort((a,b) => a-b).join(' - ')}\n\n✨ *Coincidencias:* ${matchCount}/5\n${matches.length > 0 ? `🎯 Acertaste: ${matches.sort((a,b) => a-b).join(', ')}` : ''}\n\n${prize}`
  };
}

export default { rps, guess, dice, sorteo, coin, game, hangman, memory, blackjack, lottery };
