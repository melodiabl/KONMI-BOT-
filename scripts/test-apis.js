// test-apis.js
// Script para probar todas las APIs y verificar que funcionan correctamente

import {
  downloadTikTok,
  downloadInstagram,
  downloadFacebook,
  downloadTwitter,
  downloadPinterest,
  searchYouTubeMusic,
  downloadYouTube,
  searchSpotify,
  translateText,
  getWeather,
  getRandomQuote,
  getRandomFact,
  getTrivia,
  getRandomMeme,
} from '../utils/api-providers.js';

const TEST_URLS = {
  tiktok: 'https://www.tiktok.com/@example/video/123',
  instagram: 'https://www.instagram.com/p/ABC123/',
  facebook: 'https://www.facebook.com/watch/?v=123456',
  twitter: 'https://twitter.com/user/status/123456',
  pinterest: 'https://www.pinterest.com/pin/123456/',
};

const TEST_QUERIES = {
  youtube: 'javascript tutorial',
  spotify: 'despacito',
  weather: 'Madrid',
  translate: 'Hello world',
};

console.log('🧪 INICIANDO PRUEBAS DE APIs\n');
console.log('=' .repeat(60));

// Test TikTok
async function testTikTok() {
  console.log('\n📹 PROBANDO: TikTok Download');
  console.log('-'.repeat(60));
  try {
    const result = await downloadTikTok(TEST_URLS.tiktok);
    console.log('✅ TikTok:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Video: ${result.video ? 'OK' : 'NO'}`);
      console.log(`   Autor: ${result.author || 'N/A'}`);
    }
  } catch (error) {
    console.log('❌ TikTok: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Instagram
async function testInstagram() {
  console.log('\n📸 PROBANDO: Instagram Download');
  console.log('-'.repeat(60));
  try {
    const result = await downloadInstagram(TEST_URLS.instagram);
    console.log('✅ Instagram:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Tipo: ${result.type}`);
      console.log(`   URL: ${result.url ? 'OK' : 'NO'}`);
    }
  } catch (error) {
    console.log('❌ Instagram: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Facebook
async function testFacebook() {
  console.log('\n📘 PROBANDO: Facebook Download');
  console.log('-'.repeat(60));
  try {
    const result = await downloadFacebook(TEST_URLS.facebook);
    console.log('✅ Facebook:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Video: ${result.video ? 'OK' : 'NO'}`);
    }
  } catch (error) {
    console.log('❌ Facebook: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Twitter
async function testTwitter() {
  console.log('\n🐦 PROBANDO: Twitter/X Download');
  console.log('-'.repeat(60));
  try {
    const result = await downloadTwitter(TEST_URLS.twitter);
    console.log('✅ Twitter:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Tipo: ${result.type}`);
    }
  } catch (error) {
    console.log('❌ Twitter: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Pinterest
async function testPinterest() {
  console.log('\n📌 PROBANDO: Pinterest Download');
  console.log('-'.repeat(60));
  try {
    const result = await downloadPinterest(TEST_URLS.pinterest);
    console.log('✅ Pinterest:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Imagen: ${result.image ? 'OK' : 'NO'}`);
    }
  } catch (error) {
    console.log('❌ Pinterest: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test YouTube Search
async function testYouTubeSearch() {
  console.log('\n🔎 PROBANDO: YouTube Search');
  console.log('-'.repeat(60));
  try {
    const result = await searchYouTubeMusic(TEST_QUERIES.youtube);
    console.log('✅ YouTube Search:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success && result.results.length > 0) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Resultados: ${result.results.length}`);
      console.log(`   Primer video: ${result.results[0].title.substring(0, 50)}...`);
    }
  } catch (error) {
    console.log('❌ YouTube Search: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test YouTube Download
async function testYouTubeDownload() {
  console.log('\n⬇️  PROBANDO: YouTube Download');
  console.log('-'.repeat(60));
  try {
    // Primero buscar un video
    const searchResult = await searchYouTubeMusic('test');
    if (searchResult.success && searchResult.results.length > 0) {
      const videoUrl = searchResult.results[0].url;
      const result = await downloadYouTube(videoUrl, 'audio');
      console.log('✅ YouTube Download:', result.success ? 'FUNCIONA' : 'FALLÓ');
      if (result.success) {
        console.log(`   Proveedor: ${result.provider}`);
        console.log(`   Audio: ${result.download ? 'OK' : 'NO'}`);
        console.log(`   Calidad: ${result.quality || 'N/A'}`);
      }
    } else {
      console.log('⚠️  YouTube Download: No se pudo buscar video para probar');
    }
  } catch (error) {
    console.log('❌ YouTube Download: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Spotify
async function testSpotify() {
  console.log('\n🎵 PROBANDO: Spotify Search');
  console.log('-'.repeat(60));
  try {
    const result = await searchSpotify(TEST_QUERIES.spotify);
    console.log('✅ Spotify:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Título: ${result.title}`);
      console.log(`   Artista: ${result.artists}`);
    }
  } catch (error) {
    console.log('❌ Spotify: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Translate
async function testTranslate() {
  console.log('\n🌐 PROBANDO: Translation');
  console.log('-'.repeat(60));
  try {
    const result = await translateText(TEST_QUERIES.translate, 'es');
    console.log('✅ Translate:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Original: ${TEST_QUERIES.translate}`);
      console.log(`   Traducido: ${result.translatedText}`);
      console.log(`   Idioma detectado: ${result.detectedLanguage || 'auto'}`);
    }
  } catch (error) {
    console.log('❌ Translate: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Weather
async function testWeather() {
  console.log('\n🌤️  PROBANDO: Weather');
  console.log('-'.repeat(60));
  try {
    const result = await getWeather(TEST_QUERIES.weather);
    console.log('✅ Weather:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Ciudad: ${result.city}, ${result.country}`);
      console.log(`   Temperatura: ${result.temperature}°C`);
      console.log(`   Humedad: ${result.humidity}%`);
    }
  } catch (error) {
    console.log('❌ Weather: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Quote
async function testQuote() {
  console.log('\n💭 PROBANDO: Random Quote');
  console.log('-'.repeat(60));
  try {
    const result = await getRandomQuote();
    console.log('✅ Quote:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Frase: "${result.quote.substring(0, 60)}..."`);
      console.log(`   Autor: ${result.author}`);
    }
  } catch (error) {
    console.log('❌ Quote: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Fact
async function testFact() {
  console.log('\n🤓 PROBANDO: Random Fact');
  console.log('-'.repeat(60));
  try {
    const result = await getRandomFact();
    console.log('✅ Fact:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Dato: "${result.fact.substring(0, 60)}..."`);
    }
  } catch (error) {
    console.log('❌ Fact: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Trivia
async function testTrivia() {
  console.log('\n🎯 PROBANDO: Trivia');
  console.log('-'.repeat(60));
  try {
    const result = await getTrivia();
    console.log('✅ Trivia:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Pregunta: ${result.question.substring(0, 60)}...`);
      console.log(`   Categoría: ${result.category}`);
      console.log(`   Dificultad: ${result.difficulty}`);
    }
  } catch (error) {
    console.log('❌ Trivia: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Meme
async function testMeme() {
  console.log('\n😂 PROBANDO: Random Meme');
  console.log('-'.repeat(60));
  try {
    const result = await getRandomMeme();
    console.log('✅ Meme:', result.success ? 'FUNCIONA' : 'FALLÓ');
    if (result.success) {
      console.log(`   Proveedor: ${result.provider}`);
      console.log(`   Título: ${result.title}`);
      console.log(`   Imagen: ${result.image ? 'OK' : 'NO'}`);
    }
  } catch (error) {
    console.log('❌ Meme: ERROR');
    console.log(`   Error: ${error.message}`);
  }
}

// Ejecutar todas las pruebas
async function runAllTests() {
  const tests = [
    { name: 'TikTok', fn: testTikTok, critical: false },
    { name: 'Instagram', fn: testInstagram, critical: false },
    { name: 'Facebook', fn: testFacebook, critical: false },
    { name: 'Twitter', fn: testTwitter, critical: false },
    { name: 'Pinterest', fn: testPinterest, critical: false },
    { name: 'YouTube Search', fn: testYouTubeSearch, critical: true },
    { name: 'YouTube Download', fn: testYouTubeDownload, critical: true },
    { name: 'Spotify', fn: testSpotify, critical: false },
    { name: 'Translate', fn: testTranslate, critical: true },
    { name: 'Weather', fn: testWeather, critical: true },
    { name: 'Quote', fn: testQuote, critical: false },
    { name: 'Fact', fn: testFact, critical: false },
    { name: 'Trivia', fn: testTrivia, critical: false },
    { name: 'Meme', fn: testMeme, critical: false },
  ];

  const results = {
    passed: 0,
    failed: 0,
    total: tests.length,
  };

  for (const test of tests) {
    try {
      await test.fn();
      results.passed++;
    } catch (error) {
      results.failed++;
      console.error(`\n❌ Error crítico en ${test.name}:`, error.message);
    }
    // Pequeña pausa entre tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Resumen final
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('='.repeat(60));
  console.log(`✅ Exitosas: ${results.passed}/${results.total}`);
  console.log(`❌ Fallidas: ${results.failed}/${results.total}`);
  console.log(`📈 Porcentaje: ${Math.round((results.passed / results.total) * 100)}%`);
  console.log('='.repeat(60));

  if (results.passed === results.total) {
    console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON!\n');
  } else if (results.passed >= results.total * 0.7) {
    console.log('\n✅ La mayoría de las pruebas pasaron correctamente.\n');
  } else {
    console.log('\n⚠️  Algunas APIs pueden no estar funcionando correctamente.\n');
  }

  console.log('💡 NOTAS:');
  console.log('   - Algunas URLs de prueba pueden no ser válidas');
  console.log('   - Las APIs externas pueden estar temporalmente inactivas');
  console.log('   - El sistema de fallback cambiará automáticamente a otras APIs');
  console.log('   - Revisa los logs individuales para más detalles\n');
}

// Modo de prueba individual
async function runIndividualTest(testName) {
  const tests = {
    tiktok: testTikTok,
    instagram: testInstagram,
    facebook: testFacebook,
    twitter: testTwitter,
    pinterest: testPinterest,
    youtube: testYouTubeSearch,
    ytdl: testYouTubeDownload,
    spotify: testSpotify,
    translate: testTranslate,
    weather: testWeather,
    quote: testQuote,
    fact: testFact,
    trivia: testTrivia,
    meme: testMeme,
  };

  const test = tests[testName.toLowerCase()];
  if (!test) {
    console.log(`❌ Test no encontrado: ${testName}`);
    console.log(`\n📋 Tests disponibles: ${Object.keys(tests).join(', ')}\n`);
    return;
  }

  await test();
}

// CLI
const args = process.argv.slice(2);

if (args.length > 0) {
  const testName = args[0];
  console.log(`🧪 Ejecutando test: ${testName}\n`);
  runIndividualTest(testName)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
} else {
  runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
