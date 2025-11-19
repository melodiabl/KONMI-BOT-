# 🔧 Guía de Configuración de Editores para UTF-8

**Problema:** Cuando editas archivos manualmente, los emojis y acentos se corrompen.
**Solución:** Configurar correctamente tu editor para UTF-8.

---

## 🚨 IMPORTANTE

**NUNCA uses Notepad de Windows** - Corrompe archivos automáticamente.

---

## ✅ Editores Recomendados

### 1. VS Code (RECOMENDADO) ⭐

**Instalación:**
1. Descarga desde: https://code.visualstudio.com/
2. Instala normalmente
3. **YA ESTÁ CONFIGURADO** - El proyecto tiene `.vscode/settings.json`

**Verificar configuración:**
```json
{
  "files.encoding": "utf8",
  "files.autoGuessEncoding": false,
  "files.eol": "\n"
}
```

**Cómo editar archivos:**
```bash
# Desde terminal en el proyecto
code backend/full/whatsapp.js

# O con el script seguro
npm run safe-edit backend/full/whatsapp.js --backup
```

**Verificar encoding en VS Code:**
- Mira la barra de estado (abajo a la derecha)
- Debe decir: `UTF-8` y `LF`
- Si dice otra cosa, haz click y selecciona `UTF-8` y `LF`

---

### 2. Notepad++ (Windows)

**Instalación:**
1. Descarga desde: https://notepad-plus-plus.org/
2. Instala normalmente

**Configuración obligatoria:**
1. Menú → `Configuración` → `Preferencias`
2. Pestaña `Nuevo documento`
3. **Codificación:** `UTF-8 sin BOM`
4. **Formato:** `Unix (LF)`
5. Click `Cerrar`

**Para cambiar archivo existente:**
1. Abre el archivo
2. Menú → `Codificación` → `Convertir a UTF-8 sin BOM`
3. Menú → `Edición` → `Formato de fin de línea` → `Unix (LF)`
4. Guarda

---

### 3. Sublime Text

**Configuración:**
1. Menú → `Preferences` → `Settings`
2. Agrega:
```json
{
  "default_encoding": "UTF-8",
  "default_line_ending": "unix",
  "show_encoding": true,
  "show_line_endings": true
}
```

**Para archivo actual:**
- `File` → `Save with Encoding` → `UTF-8`
- `View` → `Line Endings` → `Unix`

---

### 4. Atom

**Configuración:**
1. `File` → `Settings` → `Editor`
2. **Default Encoding:** `UTF-8`
3. **Preferred Line Ending:** `LF`

---

## ⚠️ Editores que NO debes usar

❌ **Notepad de Windows** - Corrompe UTF-8 automáticamente
❌ **WordPad** - No es para código
❌ **Word / Office** - Agrega formato invisible
❌ **Cualquier editor sin soporte UTF-8**

---

## 🛡️ Método Seguro para Editar

### Opción 1: Script Seguro (RECOMENDADO)

```bash
# Con backup automático
npm run safe-edit backend/full/whatsapp.js --backup

# Sin backup
npm run safe-edit backend/full/handler.js
```

**El script:**
- ✅ Valida UTF-8 antes de editar
- ✅ Crea backup si lo pides
- ✅ Abre en editor seguro (VS Code o Notepad++)
- ✅ Valida UTF-8 después de editar
- ✅ Restaura backup si se corrompe
- ✅ Ejecuta verificación completa

---

### Opción 2: Manual con Verificación

```bash
# 1. Verifica ANTES de editar
npm run encoding:verify backend/full/whatsapp.js

# 2. Edita el archivo (usa editor configurado UTF-8)
code backend/full/whatsapp.js

# 3. Verifica DESPUÉS de editar
npm run encoding:verify backend/full/whatsapp.js

# 4. Si hay problemas, repara
npm run encoding:verify-fix
```

---

## 🔍 Cómo Saber si un Archivo está Corrupto

### Señales de corrupción:

❌ Caracteres con doble codificación (ñ se ve como dos caracteres raros)
❌ Acentos corruptos (é aparece distorsionado)
❌ Vocales con tilde mal formadas
❌ Comillas y apóstrofes con símbolos extraños
❌ Caracteres de reemplazo (cuadros o signos de interrogación)
❌ Emojis aparecen como `??` o cuadros

### Verificar rápidamente:

```bash
# Verificar un archivo
npm run encoding:verify backend/full/whatsapp.js

# Verificar todo el proyecto
npm run encoding:verify
```

---

## 🔧 Reparar Archivos Corruptos

### Si ya corrompiste un archivo:

```bash
# 1. Ver qué está mal
npm run encoding:verify

# 2. Intentar reparación automática
npm run encoding:verify-fix

# 3. Si no funciona, convertir manualmente
npm run encoding:fix
```

---

## 📋 Checklist antes de Editar

- [ ] ✅ Tengo VS Code o Notepad++ configurado
- [ ] ✅ Verifiqué que el archivo está en UTF-8
- [ ] ✅ Mi editor muestra `UTF-8` en la barra de estado
- [ ] ✅ Mi editor muestra `LF` en fin de línea
- [ ] ✅ Haré backup antes de editar (`--backup`)
- [ ] ✅ Verificaré después de editar

---

## 🎯 Workflow Recomendado

### Para ediciones pequeñas:

```bash
# Todo en uno con protección
npm run safe-edit archivo.js --backup
```

### Para ediciones grandes:

```bash
# 1. Crear backup manual
cp archivo.js archivo.js.backup

# 2. Verificar estado actual
npm run encoding:verify archivo.js

# 3. Editar con VS Code
code archivo.js

# 4. Verificar después
npm run encoding:verify archivo.js

# 5. Si todo OK, borrar backup
rm archivo.js.backup
```

---

## 🚑 Recuperación de Emergencia

### Si corrompiste un archivo importante:

```bash
# 1. NO hagas más ediciones

# 2. Busca el backup más reciente
ls -la *.backup*

# 3. Restaura el backup
cp archivo.js.backup-2025-01-XX archivo.js

# 4. Verifica la restauración
npm run encoding:verify archivo.js

# 5. Si no hay backup, usa Git
git checkout archivo.js
```

---

## 📊 Estadísticas del Proyecto

**Última verificación:**
- 📄 262 archivos validados
- 😀 3,004 emojis preservados
- 🇪🇸 3,009 acentos correctos
- ✅ 0 errores de codificación

**Estos se perderán si no usas UTF-8 correctamente.**

---

## 💡 Tips y Trucos

### Ver encoding de un archivo en terminal:

```bash
# Windows PowerShell
Get-Content archivo.js -Encoding UTF8

# Git Bash / Linux
file -i archivo.js
```

### Convertir archivo rápidamente:

```bash
# Con el script del proyecto
npm run encoding:fix archivo.js
```

### Verificar solo archivos modificados:

```bash
# Archivos staged en Git
git diff --cached --name-only | xargs -I {} npm run encoding:verify {}
```

---

## 🔗 Recursos Adicionales

- [UTF-8 Everywhere](http://utf8everywhere.org/)
- [VS Code Encoding](https://code.visualstudio.com/docs/editor/codebasics#_file-encoding-support)
- [Notepad++ Encoding](https://npp-user-manual.org/docs/preferences/#new-document)
- [Git Line Endings](https://docs.github.com/en/get-started/getting-started-with-git/configuring-git-to-handle-line-endings)

---

## ❓ FAQ

**P: ¿Por qué se corrompen mis archivos?**
R: Tu editor está guardando en Windows-1252 (ANSI) en lugar de UTF-8.

**P: ¿Puedo usar el Notepad de Windows?**
R: NO. NUNCA. Usa VS Code o Notepad++.

**P: ¿Qué es BOM y debo usarlo?**
R: BOM (Byte Order Mark) es una marca de UTF-8. NO lo uses (usa UTF-8 sin BOM).

**P: ¿LF o CRLF?**
R: Usa LF (Unix). El proyecto normaliza todo a LF.

**P: ¿Qué hago si el hook pre-commit rechaza mi commit?**
R: Significa que hay problemas de codificación. Ejecuta:
```bash
npm run encoding:verify-fix
git add -A
git commit
```

**P: ¿Puedo desactivar las verificaciones?**
R: Puedes, pero NO deberías. Te protegen contra corrupción.

**P: Mi editor dice UTF-8 pero igual se corrompe**
R: Usa `npm run safe-edit` que valida antes y después.

---

## 📞 Soporte

Si sigues teniendo problemas:

1. **Verifica tu editor:**
   ```bash
   npm run safe-edit --help
   ```

2. **Verifica el proyecto:**
   ```bash
   npm run encoding:verify
   ```

3. **Repara todo:**
   ```bash
   npm run encoding:verify-fix
   ```

4. **Reinstala protecciones:**
   ```bash
   npm run hooks:install
   git config core.autocrlf false
   ```

---

**Última actualización:** Enero 2025
**Versión:** 1.0
**Estado:** ✅ Activo
