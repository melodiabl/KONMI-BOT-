import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function addSampleData() {
  try {
    console.log(' Agregando datos de ejemplo...');

    // Agregar manhwas de ejemplo
    const manhwas = [
      {
        titulo: 'Attack on Titan',
        autor: 'Hajime Isayama',
        genero: 'Accion, Drama',
        estado: 'Finalizado',
        descripcion: 'La humanidad lucha contra titanes gigantes',
        url: 'https://example.com/aot',
        fecha_registro: new Date().toISOString(),
        usuario_registro: 'Melodia'
      },
      {
        titulo: 'One Piece',
        autor: 'Eiichiro Oda',
        genero: 'Aventura, Comedia',
        estado: 'En emision',
        descripcion: 'Las aventuras de Monkey D. Luffy en busca del One Piece',
        url: 'https://example.com/onepiece',
        fecha_registro: new Date().toISOString(),
        usuario_registro: 'Melodia'
      },
      {
        titulo: 'Demon Slayer',
        autor: 'Koyoharu Gotouge',
        genero: 'Serie - Accion',
        estado: 'Finalizado',
        descripcion: 'Tanjiro lucha contra demonios para salvar a su hermana',
        url: 'https://example.com/demonslayer',
        fecha_registro: new Date().toISOString(),
        usuario_registro: 'Melodia'
      },
      {
        titulo: 'Jujutsu Kaisen',
        autor: 'Gege Akutami',
        genero: 'Serie - Sobrenatural',
        estado: 'En emision',
        descripcion: 'Estudiantes luchan contra maldiciones sobrenaturales',
        url: 'https://example.com/jjk',
        fecha_registro: new Date().toISOString(),
        usuario_registro: 'Melodia'
      }
    ];

    for (const manhwa of manhwas) {
      await db('manhwas').insert(manhwa);
    }

    // Agregar aportes de ejemplo
    const aportes = [
      {
        contenido: 'Nuevo capitulo de Attack on Titan disponible',
        tipo: 'manga',
        usuario: '1234567890',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString(),
        pdf_generado: null
      },
      {
        contenido: 'Ilustracion de Mikasa Ackerman',
        tipo: 'ilustracion',
        usuario: '0987654321',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString(),
        pdf_generado: null
      },
      {
        contenido: 'Pack de wallpapers de One Piece',
        tipo: 'pack',
        usuario: '1122334455',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString(),
        pdf_generado: null
      }
    ];

    for (const aporte of aportes) {
      await db('aportes').insert(aporte);
    }

    // Agregar pedidos de ejemplo
    const pedidos = [
      {
        texto: 'Busco el manga completo de Naruto',
        estado: 'pendiente',
        usuario: '1234567890',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString()
      },
      {
        texto: 'Necesito ilustraciones de Dragon Ball',
        estado: 'completado',
        usuario: '0987654321',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString()
      }
    ];

    for (const pedido of pedidos) {
      await db('pedidos').insert(pedido);
    }

    // Agregar votaciones de ejemplo
    const votaciones = [
      {
        titulo: 'Cual es tu anime favorito?',
        descripcion: 'Vota por tu anime favorito de la temporada',
        opciones: JSON.stringify(['Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'One Piece']),
        fecha_inicio: new Date().toISOString(),
        fecha_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias despues
        estado: 'activa',
        creador: 'Melodia'
      },
      {
        titulo: 'Que tipo de contenido prefieres?',
        descripcion: 'Ayudanos a saber que contenido te gusta mas',
        opciones: JSON.stringify(['Manga', 'Ilustraciones', 'Packs', 'Videos']),
        fecha_inicio: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 dias atras
        fecha_fin: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 dias despues
        estado: 'activa',
        creador: 'Melodia'
      }
    ];

    for (const votacion of votaciones) {
      await db('votaciones').insert(votacion);
    }

    // Agregar algunos votos de ejemplo
    const votos = [
      { votacion_id: 1, usuario: '1234567890', opcion: 'Attack on Titan', fecha: new Date().toISOString() },
      { votacion_id: 1, usuario: '0987654321', opcion: 'Demon Slayer', fecha: new Date().toISOString() },
      { votacion_id: 1, usuario: '1122334455', opcion: 'Attack on Titan', fecha: new Date().toISOString() },
      { votacion_id: 2, usuario: '1234567890', opcion: 'Manga', fecha: new Date().toISOString() },
      { votacion_id: 2, usuario: '0987654321', opcion: 'Ilustraciones', fecha: new Date().toISOString() }
    ];

    for (const voto of votos) {
      await db('votos').insert(voto);
    }

    // Agregar logs de ejemplo
    const logs = [
      {
        tipo: 'comando',
        comando: '/manhwas',
        usuario: '1234567890',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString()
      },
      {
        tipo: 'comando',
        comando: '/series',
        usuario: '0987654321',
        grupo: '120363123456789@g.us',
        fecha: new Date().toISOString()
      },
      {
        tipo: 'sistema',
        comando: 'conexion_exitosa',
        usuario: 'bot',
        grupo: null,
        fecha: new Date().toISOString()
      }
    ];

    for (const log of logs) {
      await db('logs').insert(log);
    }

      // ...existing code...
    console.log(' Datos de ejemplo agregados exitosamente');
    console.log(' Resumen de datos agregados:');
    console.log('   - 4 manhwas/series');
    console.log('   - 3 aportes');
    console.log('   - 2 pedidos');
    console.log('   - 2 votaciones');
    console.log('   - 5 votos');
    console.log('   - 3 logs');

  } catch (error) {
    console.error(' Error agregando datos de ejemplo:', error);
    process.exit(1);
  }
}

// Ejecutar la funcion
addSampleData();
