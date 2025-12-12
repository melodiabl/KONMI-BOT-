#!/usr/bin/env node

/**
 * Script de verificación de refactorización
 * Verifica que todos los cambios se hayan aplicado correctamente
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function checkFile(filePath, description) {
  const fullPath = path.join(rootDir, filePath)
  if (fs.existsSync(fullPath)) {
    log(`✅ ${description}`, 'green')
    checks.passed++
    return true
  } else {
    log(`❌ ${description} - ARCHIVO NO ENCONTRADO: ${filePath}`, 'red')
    checks.failed++
    return false
  }
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    log(`❌ ${description} - ARCHIVO NO ENCONTRADO: ${filePath}`, 'red')
    checks.failed++
    return false
  }

  const content = fs.readFileSync(fullPath, 'utf-8')
  if (content.includes(searchString)) {
    log(`✅ ${description}`, 'green')
    checks.passed++
    return true
  } else {
    log(`❌ ${description} - CONTENIDO NO ENCONTRADO`, 'red')
    checks.failed++
    return false
  }
}

function checkNoMojibake(filePath, description) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    log(`❌ ${description} - ARCHIVO NO ENCONTRADO: ${filePath}`, 'red')
    checks.failed++
    return false
  }

  const content = fs.readFileSync(fullPath, 'utf-8')
  const mojibakePatterns = [
    /ƒ"û‹÷\?/g,
    /ƒ>"/g,
    /ÐYs®/g,
    /ƒsÿ‹÷\?/g,
    /ƒo\./g,
    /OcurriÇü/g,
    /nÇ§mero/g,
    /dÇðas/g,
    /leÇðdo/g,
  ]

  const foundMojibake = mojibakePatterns.filter((pattern) => pattern.test(content))

  if (foundMojibake.length === 0) {
    log(`✅ ${description} - Sin caracteres corruptos`, 'green')
    checks.passed++
    return true
  } else {
    log(`⚠️ ${description} - ENCONTRADOS CARACTERES CORRUPTOS`, 'yellow')
    checks.warnings++
    return false
  }
}

function checkLogging(filePath, description) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    log(`❌ ${description} - ARCHIVO NO ENCONTRADO: ${filePath}`, 'red')
    checks.failed++
    return false
  }

  const content = fs.readFileSync(fullPath, 'utf-8')
  const hasLogger = content.includes('logger.') || content.includes('logCommand')
  const hasMetadata = content.includes('metadata:')

  if (hasLogger && hasMetadata) {
    log(`✅ ${description} - Logging y metadata implementados`, 'green')
    checks.passed++
    return true
  } else {
    log(
      `⚠️ ${description} - Logging: ${hasLogger ? '✓' : '✗'}, Metadata: ${hasMetadata ? '✓' : '✗'}`,
      'yellow'
    )
    checks.warnings++
    return false
  }
}

// ============================================
// INICIO DE VERIFICACIONES
// ============================================

log('\n' + '='.repeat(60), 'cyan')
log('🔍 VERIFICACIÓN DE REFACTORIZACIÓN - KONMI BOT', 'cyan')
log('='.repeat(60) + '\n', 'cyan')

// 1. Verificar archivos nuevos
log('📁 Verificando archivos nuevos...', 'blue')
checkFile('src/utils/command-helpers.js', 'Helpers centralizados')
checkFile('REFACTORING_SUMMARY.md', 'Resumen de refactorización')
checkFile('src/utils/COMMAND_HELPERS_GUIDE.md', 'Guía de helpers')
log('')

// 2. Verificar archivos refactorizados
log('🔧 Verificando archivos refactorizados...', 'blue')
checkFile('src/commands/ban.js', 'Comando ban.js')
checkFile('src/commands/admin.js', 'Comando admin.js')
checkFile('src/commands/moderation.js', 'Comando moderation.js')
checkFile('src/commands/groups.js', 'Comando groups.js')
checkFile('src/commands/chat-management.js', 'Comando chat-management.js')
log('')

// 3. Verificar contenido de helpers
log('📦 Verificando contenido de command-helpers.js...', 'blue')
checkFileContent('src/utils/command-helpers.js', 'export const onlyDigits', 'Función onlyDigits')
checkFileContent('src/utils/command-helpers.js', 'export function isValidJid', 'Función isValidJid')
checkFileContent('src/utils/command-helpers.js', 'export function extractTargetJid', 'Función extractTargetJid')
checkFileContent('src/utils/command-helpers.js', 'export function successResponse', 'Función successResponse')
checkFileContent('src/utils/command-helpers.js', 'export function errorResponse', 'Función errorResponse')
checkFileContent('src/utils/command-helpers.js', 'export function logCommandExecution', 'Función logCommandExecution')
log('')

// 4. Verificar ausencia de mojibake
log('🔤 Verificando codificación de caracteres...', 'blue')
checkNoMojibake('src/commands/ban.js', 'ban.js')
checkNoMojibake('src/commands/admin.js', 'admin.js')
checkNoMojibake('src/commands/moderation.js', 'moderation.js')
checkNoMojibake('src/commands/groups.js', 'groups.js')
checkNoMojibake('src/commands/chat-management.js', 'chat-management.js')
log('')

// 5. Verificar logging
log('📊 Verificando logging y metadata...', 'blue')
checkLogging('src/commands/ban.js', 'ban.js')
checkLogging('src/commands/admin.js', 'admin.js')
checkLogging('src/commands/moderation.js', 'moderation.js')
checkLogging('src/commands/groups.js', 'groups.js')
checkLogging('src/commands/chat-management.js', 'chat-management.js')
log('')

// 6. Verificar importaciones
log('📥 Verificando importaciones...', 'blue')
checkFileContent('src/commands/ban.js', "import { successResponse, errorResponse", 'Importaciones en ban.js')
checkFileContent('src/commands/admin.js', "import logger from '../config/logger.js'", 'Logger en admin.js')
checkFileContent('src/commands/moderation.js', "import { validateAdminPermission", 'Helpers en moderation.js')
checkFileContent('src/commands/groups.js', "import { extractUserInfo", 'Helpers en groups.js')
checkFileContent('src/commands/chat-management.js', "import { extractUserInfo", 'Helpers en chat-management.js')
log('')

// 7. Verificar emojis
log('🎨 Verificando emojis consistentes...', 'blue')
checkFileContent('src/commands/ban.js', '❌', 'Emoji de error')
checkFileContent('src/commands/ban.js', '���', 'Emoji de éxito')
checkFileContent('src/commands/admin.js', '🔍', 'Emoji de debug')
checkFileContent('src/commands/moderation.js', '⚠️', 'Emoji de advertencia')
checkFileContent('src/commands/groups.js', '👢', 'Emoji de expulsión')
log('')

// 8. Verificar metadata
log('📋 Verificando metadata en respuestas...', 'blue')
checkFileContent('src/commands/ban.js', 'metadata: {', 'Metadata en ban.js')
checkFileContent('src/commands/admin.js', 'metadata: {', 'Metadata en admin.js')
checkFileContent('src/commands/moderation.js', 'metadata: {', 'Metadata en moderation.js')
checkFileContent('src/commands/groups.js', 'metadata: {', 'Metadata en groups.js')
checkFileContent('src/commands/chat-management.js', 'metadata: {', 'Metadata en chat-management.js')
log('')

// ============================================
// RESUMEN
// ============================================

log('='.repeat(60), 'cyan')
log('📊 RESUMEN DE VERIFICACIÓN', 'cyan')
log('='.repeat(60), 'cyan')

log(`✅ Verificaciones pasadas: ${checks.passed}`, 'green')
log(`❌ Verificaciones fallidas: ${checks.failed}`, checks.failed > 0 ? 'red' : 'green')
log(`⚠️ Advertencias: ${checks.warnings}`, checks.warnings > 0 ? 'yellow' : 'green')

const total = checks.passed + checks.failed + checks.warnings
const percentage = Math.round((checks.passed / total) * 100)

log(`\n📈 Progreso: ${percentage}% (${checks.passed}/${total})`, 'cyan')

if (checks.failed === 0 && checks.warnings === 0) {
  log('\n🎉 ¡REFACTORIZACIÓN COMPLETADA EXITOSAMENTE!', 'green')
  log('Todos los cambios se han aplicado correctamente.\n', 'green')
  process.exit(0)
} else if (checks.failed === 0) {
  log('\n⚠️ REFACTORIZACIÓN COMPLETADA CON ADVERTENCIAS', 'yellow')
  log('Revisa las advertencias anteriores.\n', 'yellow')
  process.exit(0)
} else {
  log('\n❌ REFACTORIZACIÓN INCOMPLETA', 'red')
  log('Hay errores que necesitan ser corregidos.\n', 'red')
  process.exit(1)
}
