// limpiar-invisibles.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const EXTENSIONES = [".js", ".ts", ".tsx", ".json"]; // extensiones a limpiar
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROYECTO = __dirname; // pods cambiar a otra ruta si quers

function limpiarArchivo(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  // elimina caracteres invisibles excepto tab, enter y espacio normal
  content = content.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(` Limpiado: ${filePath}`);
  }
}

function recorrerDirectorio(dir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      recorrerDirectorio(fullPath);
    } else if (EXTENSIONES.includes(path.extname(fullPath))) {
      limpiarArchivo(fullPath);
    }
  }
}

// Ejecutar
recorrerDirectorio(PROYECTO);
console.log(" Limpieza completada.");
