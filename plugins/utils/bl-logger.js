// BL-themed Professional Logger
import chalk from 'chalk';

// Colores temática BL - tonos rosados, púrpuras y azules suaves
const colors = {
    // Colores principales
    primary: chalk.hex('#FF69B4'),      // Rosa vibrante
    secondary: chalk.hex('#DDA0DD'),    // Plum suave
    accent: chalk.hex('#87CEEB'),       // Sky blue

    // Estados
    success: chalk.hex('#98FB98'),      // Verde pastel
    warning: chalk.hex('#FFB6C1'),      // Rosa claro
    error: chalk.hex('#FF6B9D'),        // Rosa intenso
    info: chalk.hex('#B19CD9'),         // Lavanda

    // Elementos UI
    border: chalk.hex('#DDA0DD'),       // Plum
    text: chalk.hex('#F8F8FF'),         // Ghost white
    muted: chalk.hex('#C8A2C8'),        // Lilac
    highlight: chalk.hex('#FF1493'),    // Deep pink

    // Gradientes simulados
    gradient1: chalk.hex('#FF69B4'),    // Rosa
    gradient2: chalk.hex('#DDA0DD'),    // Plum
    gradient3: chalk.hex('#87CEEB'),    // Sky blue
};

// Símbolos temáticos BL
const symbols = {
    heart: '💖',
    sparkle: '✨',
    star: '⭐',
    flower: '🌸',
    butterfly: '🦋',
    crown: '👑',
    gem: '💎',
    ribbon: '🎀',
    cherry: '🍒',
    moon: '🌙',
    success: '💕',
    warning: '💫',
    error: '💔',
    info: '🌟',
    loading: '🌸',
    database: '💎',
    server: '👑',
    auth: '🔐',
    bot: '🤖',
    connection: '💝'
};

class BLLogger {
    constructor() {
        this.startTime = Date.now();
    }

    // Crear banner principal
    createBanner(title, subtitle = '') {
        const width = 60;
        const border = colors.border('═'.repeat(width));
        const titleLine = this.centerText(colors.primary.bold(title), width);
        const subtitleLine = subtitle ? this.centerText(colors.secondary(subtitle), width) : '';

        console.log('\n' + colors.border('╔') + border + colors.border('╗'));
        console.log(colors.border('║') + titleLine + colors.border('║'));
        if (subtitle) {
            console.log(colors.border('║') + subtitleLine + colors.border('║'));
        }
        console.log(colors.border('╚') + border + colors.border('╝') + '\n');
    }

    // Centrar texto
    centerText(text, width) {
        const cleanText = text.replace(/\u001b\[[0-9;]*m/g, ''); // Remover códigos ANSI
        const padding = Math.max(0, width - cleanText.length);
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }

    getCleanLength(text) {
        return text.replace(/\u001b\[[0-9;]*m/g, '').length;
    }

    // Logs con estilo
    success(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.success(symbols.success);
        const msg = colors.success(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    error(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.error(symbols.error);
        const msg = colors.error(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    warning(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.warning(symbols.warning);
        const msg = colors.warning(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    info(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.info(symbols.info);
        const msg = colors.info(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    loading(message) {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.accent(symbols.loading);
        const msg = colors.accent(message);
        console.log(`${timestamp} ${icon} ${msg}`);
    }

    // Logs especializados
    database(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.primary(symbols.database);
        const msg = colors.primary(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    server(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.highlight(symbols.server);
        const msg = colors.highlight(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    auth(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.secondary(symbols.auth);
        const msg = colors.secondary(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    bot(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.accent(symbols.bot);
        const msg = colors.accent(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    connection(message, details = '') {
        const timestamp = colors.muted(this.getTimestamp());
        const icon = colors.primary(symbols.connection);
        const msg = colors.primary(message);
        const det = details ? colors.muted(` ${details}`) : '';
        console.log(`${timestamp} ${icon} ${msg}${det}`);
    }

    // Crear menú estilizado
    createMenu(title, options) {
        const width = 50;
        const border = colors.border('═'.repeat(width));

        console.log(colors.border('╔') + border + colors.border('╗'));
        console.log(colors.border('║') + this.centerText(colors.primary.bold(`${symbols.crown} ${title} ${symbols.crown}`), width) + colors.border('║'));
        console.log(colors.border('╠') + border + colors.border('╣'));

        options.forEach((option, index) => {
            const optionText = `${colors.accent((index + 1) + ')')} ${colors.text(option.text)} ${colors.muted(option.icon || '')}`;
            const padding = ' '.repeat(Math.max(0, width - this.getCleanLength(optionText)));
            console.log(colors.border('║') + ` ${optionText}${padding} ` + colors.border('║'));
        });

        console.log(colors.border('╚') + border + colors.border('╝'));
    }

    // Crear sección informativa
    createInfoSection(title, items) {
        console.log(colors.border('─'.repeat(50)));
        console.log(colors.primary.bold(`${symbols.gem} ${title}`));
        items.forEach(item => {
            const key = colors.secondary(item.key + ':');
            const value = colors.text(item.value);
            const status = item.status ? (item.status === 'ok' ? colors.success(' ✓') : colors.error(' ✗')) : '';
            console.log(`${key} ${value}${status}`);
        });
        console.log(colors.border('─'.repeat(50)));
    }

    // Utilidades
    getTimestamp() {
        return new Date().toLocaleTimeString('es-ES', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    getCleanLength(text) {
        return text.replace(/\u001b\[[0-9;]*m/g, '').length;
    }

    // Separador decorativo
    separator() {
        console.log(colors.muted('─'.repeat(60)));
    }

    // Línea en blanco estilizada
    space() {
        console.log('');
    }
}

// Instancia global
const logger = new BLLogger();

export default logger;
export { colors, symbols };
