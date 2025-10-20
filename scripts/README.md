# 📚 Scripts del Proyecto

Directorio de scripts organizados por funcionalidad para el mantenimiento, validación y deployment del proyecto.

---

## 📁 Estructura de Directorios

```
scripts/
├── encoding/          # Scripts de validación y corrección de codificación
├── git-hooks/         # Configuración de hooks de Git
├── legacy-fixes/      # Scripts de corrección legacy (históricos)
├── deployment/        # Scripts de deployment y configuración de servidores
└── testing/           # Scripts de testing y validación
```

---

## 🔤 encoding/ - Codificación y Validación de Archivos

Scripts para asegurar que todos los archivos del proyecto mantengan codificación UTF-8 correcta, con emojis, acentos y caracteres especiales preservados.

### `check-encoding.mjs`
**Valida codificación UTF-8 en archivos**

```bash
# Verificar archivos staged (pre-commit)
node scripts/encoding/check-encoding.mjs

# Verificar todo el proyecto
node scripts/encoding/check-encoding.mjs --all

# Modo silencioso
node scripts/encoding/check-encoding.mjs --all --quiet
```

**Qué hace:**
- ✅ Valida que archivos sean UTF-8 estricto
- 🚫 Ignora binarios automáticamente
- 📊 Reporta archivos con codificación incorrecta
- 🎯 Usa fallback de filesystem si git falla

**Cuándo usar:**
- Pre-commit (automático)
- Después de editar archivos con otros editores
- Para auditar el proyecto completo

---

### `fix-encoding.mjs`
**Convierte archivos a UTF-8**

```bash
# Ver qué se convertiría (simulación)
node scripts/encoding/fix-encoding.mjs --all --dry-run

# Convertir realmente
node scripts/encoding/fix-encoding.mjs --all

# Convertir archivos específicos
node scripts/encoding/fix-encoding.mjs archivo1.js archivo2.js
```

**Qué hace:**
- 🔧 Detecta Windows-1252, ISO-8859-1, UTF-16
- 🔄 Convierte a UTF-8 sin BOM
- ⚠️ Reporta archivos que no pudo convertir
- 🎯 Quita BOM si existe

**Cuándo usar:**
- Después de recibir archivos de Windows con ANSI
- Si detectas caracteres corruptos (tipo: doble codificación UTF-8)
- Después de copiar código de fuentes externas

---

### `verify-all-files.mjs`
**Verificación exhaustiva de integridad de archivos**

```bash
# Verificación completa
node scripts/encoding/verify-all-files.mjs

# Con detalles de cada archivo
node scripts/encoding/verify-all-files.mjs --verbose

# Reparar problemas automáticamente
node scripts/encoding/verify-all-files.mjs --fix

# Archivo específico
node scripts/encoding/verify-all-files.mjs backend/full/handler.js
```

**Qué hace:**
- 😀 Detecta y valida emojis
- 🇪🇸 Valida acentos españoles (á, é, í, ó, ú, ñ, ¿, ¡)
- 🔍 Detecta secuencias corruptas (doble codificación, caracteres reemplazo)
- 📏 Valida fin de línea (LF vs CRLF mixto)
- 🧹 Detecta espacios trailing
- ✨ Reporta estadísticas completas

**Cuándo usar:**
- ✅ **Diariamente** para verificar integridad
- 🚨 Antes de commits importantes
- 🔧 Después de merge conflicts
- 📊 Para auditoría completa del proyecto

**Salida ejemplo:**
```
📊 RESUMEN DE VERIFICACIÓN:

   Archivos analizados:       260
   ✅ Sin problemas:          260
   ⚠️  Con advertencias:       0
   ❌ Con errores:            0
   📦 Binarios ignorados:     0
   😀 Emojis encontrados:     2748
   🇪🇸 Acentos españoles:     2729

   ⏱️  Tiempo: 0.19s

✅ TODOS LOS ARCHIVOS ESTÁN CORRECTOS
```

---

### `clean-invisibles.js`
**Limpia caracteres invisibles y de control**

```bash
# Limpiar archivos staged
node scripts/encoding/clean-invisibles.js

# Solo verificar (no modificar)
node scripts/encoding/clean-invisibles.js --check

# Modo silencioso
node scripts/encoding/clean-invisibles.js --quiet
```

**Qué hace:**
- 🧹 Elimina zero-width characters
- 🚫 Quita caracteres de control Unicode
- 📝 Preserva caracteres válidos (tab, newline)
- ⚡ Integrado en pre-commit hook

**Cuándo usar:**
- Automático en cada commit
- Si copias texto de web/PDF
- Si ves caracteres raros invisibles

---

## 🔗 git-hooks/ - Hooks de Git

### `setup-git-hooks.js`
**Instala hooks de Git para protección automática**

```bash
# Instalar/reinstalar hooks
node scripts/git-hooks/setup-git-hooks.js

# O usar el comando npm
npm run hooks:install
```

**Qué hace:**
- ✅ Instala pre-commit hook en `.git/hooks/`
- 🔒 Bloquea commits con codificación incorrecta
- 🧹 Limpia caracteres invisibles automáticamente
- 🔄 Ejecuta verificaciones antes de cada commit

**Hook instalado ejecuta:**
1. `check-encoding.mjs` - valida UTF-8
2. `clean-invisibles.js` - limpia caracteres invisibles
3. Si hay problemas, corrige y aborta commit para revisar

**Cuándo usar:**
- ✅ Después de clonar el repo
- 🔄 Si actualizas la lógica de hooks
- 🆕 Al configurar nuevo entorno de desarrollo

---

## 🔧 legacy-fixes/ - Scripts de Corrección Legacy

Scripts históricos usados para corregir problemas específicos del código. **No usar en desarrollo normal.**

**Archivos:**
- `apply-fixes-commands-files.mjs` - Aplica correcciones a comandos
- `final-fix-lock-handlers.mjs` - Corrige lock handlers
- `fix-addaporte-send.mjs` - Corrige función addaporte
- `fix-descargar-text.mjs` - Corrige texto de descarga
- `fix-guardar-remove-legacy.mjs` - Elimina código legacy de guardar
- `fix-multiline-texts.mjs` - Corrige textos multilínea
- `fix-remove-old-guardar.mjs` - Elimina guardar antiguo
- `fix-syntax-extras.mjs` - Correcciones de sintaxis
- `fix-whatsapp-cleanups.mjs` - Limpieza de código WhatsApp
- `patch-add-guardar-media.mjs` - Añade guardar media
- `patch-add-guardar-media2.mjs` - Añade guardar media v2
- `patch-whatsapp-owner-addaporte.js/mjs` - Parches de addaporte
- `update-lock-handlers-logger.mjs` - Actualiza logger de lock handlers
- `update-lock-handlers.mjs` - Actualiza lock handlers

⚠️ **Advertencia:** Estos scripts modifican código directamente. Solo ejecutar si sabes qué hacen.

---

## 🚀 deployment/ - Scripts de Deployment

### `setup-hetzner.sh`
**Configura servidor Hetzner para deployment**

```bash
bash scripts/deployment/setup-hetzner.sh
```

**Qué hace:**
- 📦 Instala dependencias del servidor
- 🐳 Configura Docker y Docker Compose
- 🔒 Configura firewall y seguridad
- 🌐 Configura Nginx como reverse proxy

**Cuándo usar:**
- Al provisionar nuevo servidor Hetzner
- Al reinstalar servidor desde cero

---

## 🧪 testing/ - Scripts de Testing

### `test-api.js`
**Testing manual de API endpoints**

```bash
node scripts/testing/test-api.js
```

**Qué hace:**
- 🔌 Prueba endpoints de la API
- ✅ Valida respuestas y códigos HTTP
- 📊 Muestra resultados formateados

**Cuándo usar:**
- Desarrollo de nuevos endpoints
- Debugging de API
- Validación después de cambios

---

## 🎯 Comandos NPM Rápidos

En `package.json` están configurados estos atajos:

### Codificación
```bash
npm run encoding:check        # Verificar codificación UTF-8
npm run encoding:fix          # Convertir a UTF-8
npm run encoding:verify       # Verificación exhaustiva (emojis, acentos)
npm run encoding:verify-fix   # Verificar y reparar
npm run clean:invisibles      # Limpiar caracteres invisibles
npm run clean:check          # Solo verificar invisibles
```

### Git Hooks
```bash
npm run hooks:install         # Instalar hooks de Git
```

### Testing
```bash
npm run test:api             # Probar API manualmente
```

---

## 🛡️ Sistema de Protección Instalado

El proyecto tiene **3 capas de protección** contra corrupción de archivos:

### 1. Editor (VS Code)
- **Archivo:** `.vscode/settings.json`
- **Efecto:** Fuerza UTF-8 y LF en el editor
- **Automático:** ✅ Al abrir el proyecto

### 2. Git
- **Archivos:** `.gitattributes`, `.editorconfig`
- **Efecto:** Normaliza EOL y declara UTF-8 en Git
- **Automático:** ✅ Al hacer commits

### 3. Pre-commit Hook
- **Archivo:** `.git/hooks/pre-commit`
- **Efecto:** Bloquea commits con problemas de codificación
- **Automático:** ✅ En cada commit

---

## 🔍 Workflow Recomendado

### Desarrollo Diario
```bash
# Al empezar el día (opcional, pero recomendado)
npm run encoding:verify

# Desarrollar normalmente...

# Antes de commit importante
npm run encoding:verify-fix

# Git commit (hook se ejecuta automáticamente)
git commit -m "mensaje"
```

### Después de Merge/Pull
```bash
# Verificar integridad después de merge
npm run encoding:verify

# Si hay problemas, reparar
npm run encoding:verify-fix
```

### Configuración Inicial (nuevo dev)
```bash
# 1. Instalar hooks
npm run hooks:install

# 2. Configurar Git
git config core.autocrlf false

# 3. Verificar todo está OK
npm run encoding:verify
```

---

## 🆘 Resolución de Problemas

### "Se detectaron caracteres corruptos (doble codificación)"
```bash
# Reparar automáticamente
npm run encoding:verify-fix

# O manualmente
npm run encoding:fix
```

### "Archivos con codificación no UTF-8"
```bash
# Convertir a UTF-8
npm run encoding:fix
```

### "Mixed line endings (CRLF/LF)"
```bash
# Reparar con --fix
npm run encoding:verify-fix

# O configurar Git correctamente
git config core.autocrlf false
```

### "Hook pre-commit no funciona"
```bash
# Reinstalar hook
npm run hooks:install

# Verificar que existe
ls -la .git/hooks/pre-commit
```

---

## 📊 Estadísticas del Proyecto

Última verificación completa:
- ✅ **260 archivos** validados
- 😀 **2,748 emojis** preservados correctamente
- 🇪🇸 **2,729 acentos** y caracteres especiales correctos
- ❌ **0 errores** de codificación
- ⚠️ **0 advertencias**

---

## 🔐 Garantías de Integridad

Con el sistema instalado, está **garantizado** que:

- ✅ Todos los archivos permanecen en UTF-8
- ✅ Emojis se preservan correctamente
- ✅ Acentos españoles no se corrompen
- ✅ Caracteres invisibles se eliminan
- ✅ Fin de línea normalizado (LF)
- ✅ No puedes commitear archivos con problemas

---

## 📝 Notas Importantes

1. **Nunca** edites archivos con Notepad (usa VS Code, Sublime, etc.)
2. **Siempre** verifica después de copiar código de fuentes externas
3. **Mantén** Git configurado con `core.autocrlf false` en Windows
4. **Ejecuta** `encoding:verify` regularmente
5. **No borres** el pre-commit hook

---

## 🤝 Contribuir

Al contribuir al proyecto:

1. Instala los hooks: `npm run hooks:install`
2. Configura Git: `git config core.autocrlf false`
3. Verifica antes de PR: `npm run encoding:verify`
4. Los commits serán bloqueados si hay problemas de codificación

---

## 📚 Recursos Adicionales

- [UTF-8 vs Windows-1252](https://en.wikipedia.org/wiki/Windows-1252)
- [Git Line Endings](https://docs.github.com/en/get-started/getting-started-with-git/configuring-git-to-handle-line-endings)
- [EditorConfig](https://editorconfig.org/)
- [Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)

---

**Última actualización:** Enero 2025
**Mantenedor:** Sistema de protección de codificación
**Estado:** ✅ Activo y funcionando