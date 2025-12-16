import os from "os";  
import { exec } from "child_process";  
  
console.log("🚀 Iniciando servidor...");  
  
// DETECTAR ARCH  
const arch = os.arch();  
  
if (arch === "arm64") {  
    console.log("🛑 ARM64 detectado — bloqueando Puppeteer y Chromium.");  
  
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";  
    process.env.PUPPETEER_SKIP_DOWNLOAD = "true";  
    process.env.PUPPETEER_EXECUTABLE_PATH = "/usr/bin/chromium";  
  
    console.log("✔ Variables aplicadas correctamente.");  
} else {  
    console.log("✔ Arquitectura compatible con Puppeteer.");  
}  
  
// ===============================  
//  📦 INSTALAR DEPENDENCIAS  
// ===============================  
console.log("📦 Instalando dependencias (npm install + dotenv)...");  
  
// Instala dotenv  
exec("npm install dotenv", (err, stdout, stderr) => {  
    if (err) {  
        console.error("❌ Error durante la instalación:", err);  
        return;  
    }  
  
    console.log(stdout);  
    if (stderr) console.error(stderr);  
  
    console.log("✔ Dependencias instaladas.");  
  
    // ===============================  
    //  ▶ EJECUTAR BOT DESPUÉS  
    // ===============================  
    console.log("▶ Ejecutando index.js...");  
  
    exec("npm start", (err2, stdout2, stderr2) => {  
        if (err2) {  
            console.error("❌ Error al iniciar index.js:", err2);  
            return;  
        }  
  
        console.log(stdout2);  
        if (stderr2) console.error(stderr2);  
    });  
});