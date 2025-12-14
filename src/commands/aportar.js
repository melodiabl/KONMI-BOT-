// src/commands/aportar.js
import db from '../database/db.js';
import { processWhatsAppMedia } from '../services/file-manager.js';

async function aportar(ctx) {
    const { sock, remoteJid, sender, pushName, message } = ctx;
    const phone = sender || ctx.participant || remoteJid;

    // Simplified ensureProveedor logic for command module
    const normalized = String(phone).replace(/\D/g, '');
    let prov = await db("proveedores").where({ phone: normalized }).first();
    if (!prov) {
        const [id] = await db("proveedores").insert({ phone: normalized, name: pushName || null, role: "provider", active: true }, ["id"]);
        prov = await db("proveedores").where({ id: id.id || id }).first();
    }

    const processed = await processWhatsAppMedia(sock, message, { basePath: "./media/proveedores" });
    if (!processed || (!processed.text && !processed.filePath)) {
        return { text: "⚠️ No encontré contenido válido en tu mensaje para registrar como aporte." };
    }

    const [id] = await db("proveedor_contenidos").insert({
        proveedor_id: prov.id,
        type: processed.filePath ? "media" : "text",
        content: processed.text || null,
        media_path: processed.filePath || null,
        media_type: processed.mimetype || null,
    }, ["id"]);

    return { text: `✅ ¡Gracias por tu contenido como proveedor!\nID: ${id.id || id}` };
}

export default {
    name: 'aportar',
    description: 'Aporta contenido como proveedor.',
    category: 'proveedores',
    handler: aportar
};
