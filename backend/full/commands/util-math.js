// commands/util-math.js — /calc expresiones aritméticas sencillas

function safeCalc(expr) {
  const s = String(expr||'').trim()
  if (!s) return null
  // Permitir solo dígitos, operadores básicos y paréntesis y punto decimal
  if (!/^[0-9+\-*/().\s%^]+$/.test(s)) return null
  // Reemplazar potencia ^ por **
  const js = s.replace(/\^/g, '**')
  // Evaluar con Function, sin acceso a scope externo
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${js})`)
  const res = fn()
  return Number.isFinite(res) ? res : null
}

export async function calc({ args }){
  const expr = (args||[]).join(' ').trim()
  if (!expr) return { success:true, message:'ℹ️ Uso: /calc [expresión]\nEj: /calc (2+3)*4^2/5', quoted:true }
  try {
    const val = safeCalc(expr)
    if (val == null) return { success:true, message:'⚠️ Expresión no válida', quoted:true }
    return { success:true, message:`🧮 ${expr} = ${val}`, quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ Error: ${e?.message||e}`, quoted:true }
  }
}

export default { calc }

