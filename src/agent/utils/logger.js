/**
 * Simple standardized logger. Format: [ISO_TIMESTAMP] LEVEL component | message | key=value
 * All in one line for easy parsing and reading.
 */

function ts() {
    return new Date().toISOString();
}

function formatData(data) {
    if (data == null || Object.keys(data).length === 0) return '';
    const parts = Object.entries(data).map(([k, v]) => `${k}=${String(v)}`);
    return ' | ' + parts.join(' ');
}

/**
 * @param {string} component - e.g. 'server', 'ingest', 'setup', 'seed', 'rag', 'voyage'
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {Record<string, string|number|boolean>} [data] - optional key-value pairs
 */
function log(component, level, message, data = {}) {
    const line = `[${ts()}] ${level.padEnd(5)} ${component} | ${message}${formatData(data)}`;
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);
}

export const logger = {
    info: (component, message, data) => log(component, 'INFO', message, data),
    warn: (component, message, data) => log(component, 'WARN', message, data),
    error: (component, message, data) => log(component, 'ERROR', message, data),
};
