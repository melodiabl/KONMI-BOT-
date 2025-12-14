// src/commands/provaportes.js
import db from '../database/db.js';

async function provAportes(ctx) {
    const { sender, pushName } = ctx;
    const phone = sender || ctx.participant || remoteJid;

    // Simplified ensureProveedor logic for command module
    const normalized = String(phone).replace(/\D/g, '');
    let prov = await db("proveedores").where({ phone: normalized }).first();
    if (!prov) {
        return { text: "ℹ️ No tienes aportes registrados todavía como proveedor." };
    }

    const rows = await db("proveedor_contenidos").select("*").where({ proveedor_id: prov.id }).orderBy("created_at", "desc").limit(10);
    if (!rows || rows.length === 0) {
        return { text: "ℹ️ No tienes aportes registrados todavía como proveedor." };
    }

    let text = "📦 *Tus Aportes como Proveedor*\n\n";
    for (const r of rows) {
        const createdAt = new Date(r.created_at).toLocaleString("es-ES");
        const typeLabel = r.type === "media" ? "🖼 Media" : "💬 Texto";
        text += `• [${r.id}] ${typeLabel}\n   ${createdAt}\n`;
    }
    return { text };
}

export default {
    name: 'provaportes',
    description: 'Muestra tus aportes como proveedor.',
    category: 'proveedores',
    handler: provAportes
};
