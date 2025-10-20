# 🛡️ GUÍA RÁPIDA: Edición Segura de Archivos

## ⚠️ PROBLEMA
Cuando editas archivos manualmente, se corrompen los emojis y acentos.

## ✅ SOLUCIÓN
Usa el script seguro que protege la codificación UTF-8.

---

## 🚀 Uso Rápido

```bash
# Editar con backup automático (RECOMENDADO)
npm run safe-edit backend/full/whatsapp.js --backup

# Editar sin backup
npm run safe-edit backend/full/handler.js
```

---

## 📋 Qué hace el script

✅ Valida UTF-8 **antes** de editar
✅ Crea backup si lo pides
✅ Abre en editor seguro (VS Code o Notepad++)
✅ Valida UTF-8 **después** de editar
✅ **Restaura backup** si se corrompe
✅ Ejecuta verificación completa

---

## 🎯 Comandos Útiles

```bash
# Verificar todo el proyecto
npm run encoding:verify

# Reparar problemas
npm run encoding:verify-fix

# Editar archivo seguro
npm run safe-edit archivo.js --backup
```

---

## 🔧 Configurar Editor (Una sola vez)

### VS Code (Ya está configurado ✅)
Solo ábrelo y úsalo. El proyecto tiene `.vscode/settings.json`.

### Notepad++ (Windows)
1. Configuración → Preferencias → Nuevo documento
2. **Codificación:** UTF-8 sin BOM
3. **Formato:** Unix (LF)

### Otros editores
Lee: `scripts/EDITOR-GUIDE.md`

---

## ❌ NO USAR

❌ **Notepad de Windows** - Corrompe automáticamente
❌ **WordPad** - No es para código
❌ **Word / Office** - Agrega formato invisible

---

## 🆘 Si ya corrompiste un archivo

```bash
# Ver qué está mal
npm run encoding:verify

# Intentar reparar
npm run encoding:verify-fix

# Si no funciona, restaurar de Git
git checkout archivo.js
```

---

## 📊 Estado Actual del Proyecto

✅ **197 archivos** validados
😀 **3,112 emojis** preservados
🇪🇸 **3,142 acentos** correctos
❌ **0 errores** de codificación

**Manténlo así usando el script seguro.**

---

## 💡 Recuerda

1. **Siempre usa** `npm run safe-edit` con `--backup`
2. **Nunca uses** Notepad de Windows
3. **Verifica después** con `npm run encoding:verify`

---

**Guía completa:** `scripts/EDITOR-GUIDE.md`
