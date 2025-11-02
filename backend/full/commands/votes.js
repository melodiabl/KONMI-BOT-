// commands/votes.js
// Votaciones básicas

import db from '../db.js'

async function ensureTables(){
  try{
    if(!(await db.schema.hasTable('votaciones'))){
      await db.schema.createTable('votaciones',t=>{ t.increments('id'); t.string('tema'); t.json('opciones'); t.boolean('abierta').defaultTo(true); t.string('grupo'); t.timestamp('creada_en').defaultTo(db.fn.now()) })
    }
    if(!(await db.schema.hasTable('votos'))){
      await db.schema.createTable('votos',t=>{ t.increments('id'); t.integer('votacion_id'); t.string('usuario'); t.integer('opcion'); t.timestamp('fecha').defaultTo(db.fn.now()) })
    }
  }catch{}
}

export async function crear({ args, remoteJid }){
  await ensureTables()
  const raw=(args||[]).join(' ').trim()
  const parts=raw.split('|').map(s=>s.trim()).filter(Boolean)
  if(parts.length<3) return { success:true, message:'ℹ️ Uso: /crearvotacion <tema>|<op1>|<op2>[|op3...]' }
  const tema=parts[0]; const opciones=parts.slice(1)
  try{ const [id]=await db('votaciones').insert({ tema, opciones: JSON.stringify(opciones), grupo: remoteJid, abierta:true }); return { success:true, message:`🗳️ Votación #${id}: ${tema}\nOpciones: ${opciones.map((o,i)=>`${i+1}. ${o}`).join('\n')}` } }catch{ return { success:false, message:'⚠️ Error creando votación.' } }
}

export async function votar({ args, usuario, remoteJid }){
  await ensureTables()
  const num = parseInt((args||[])[0]||'0',10)
  if(!num) return { success:true, message:'ℹ️ Uso: /votar <número de opción>' }
  try{
    const v = await db('votaciones').where({ grupo: remoteJid, abierta:true }).orderBy('creada_en','desc').first()
    if(!v) return { success:true, message:'ℹ️ No hay votación abierta.' }
    const opts = JSON.parse(v.opciones||'[]')
    if(num<1||num>opts.length) return { success:true, message:'ℹ️ Opción inválida.' }
    await db('votos').insert({ votacion_id: v.id, usuario, opcion: num })
    return { success:true, message:`✅ Voto registrado: ${opts[num-1]}` }
  }catch{ return { success:false, message:'⚠️ Error registrando voto.' } }
}

export async function cerrar({ remoteJid }){
  await ensureTables()
  try{
    const v = await db('votaciones').where({ grupo: remoteJid, abierta:true }).orderBy('creada_en','desc').first()
    if(!v) return { success:true, message:'ℹ️ No hay votación abierta.' }
    await db('votaciones').where({ id: v.id }).update({ abierta:false })
    const votos = await db('votos').where({ votacion_id: v.id })
    const opts = JSON.parse(v.opciones||'[]')
    const conteo = Array(opts.length).fill(0); votos.forEach(x=>{ if(x.opcion>=1 && x.opcion<=opts.length) conteo[x.opcion-1]++ })
    let msg = `🗳️ Resultado: ${v.tema}\n\n` + opts.map((o,i)=>`${i+1}. ${o}: ${conteo[i]} voto(s)`).join('\n')
    return { success:true, message: msg }
  }catch{ return { success:false, message:'⚠️ Error cerrando votación.' } }
}

export default { crear, votar, cerrar }

