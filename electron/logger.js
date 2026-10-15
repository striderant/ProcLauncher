// File logger: mirrors launcher activity to per-day log files under
// <userData>/logs (launcher-YYYY-MM-DD.log), keeping the last 7 days.
// Safe to call before initLogger() - lines then go to the console only.

const fs = require('fs');
const path = require('path');

const RETENTION_DAYS = 7;

let logDir = null;
let stream = null;
let streamDay = '';

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function pruneOldLogs() {
  let files = [];
  try { files = fs.readdirSync(logDir); } catch { return; }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of files) {
    if (!/^launcher-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    const full = path.join(logDir, file);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
    } catch {}
  }
}

function ensureStream() {
  if (!logDir) return null;
  const today = dayStamp();
  if (!stream || streamDay !== today) {
    try { if (stream) stream.end(); } catch {}
    stream = null;
    try {
      stream = fs.createWriteStream(path.join(logDir, `launcher-${today}.log`), { flags: 'a' });
      stream.on('error', () => { stream = null; });
      streamDay = today;
    } catch {
      stream = null;
    }
  }
  return stream;
}

function closeLogger() {
  try {
    if (stream) stream.end();
  } catch {}
  stream = null;
}

function initLogger(userDataDir) {
  try {
    logDir = path.join(userDataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    pruneOldLogs();
  } catch (err) {
    console.error('Logger init failed:', err.message);
    logDir = null;
  }
}

function write(level, message) {
  const text = `[${new Date().toISOString()}] [${level}] ${message}`;
  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'debug' ? console.debug : console.log;
  try { consoleFn(text); } catch {}
  const out = ensureStream();
  if (out) {
    try { out.write(`${text}\n`); } catch {}
  }
}

function info(message) { write('info', message); }
function success(message) { write('success', message); }
function warn(message) { write('warn', message); }
function error(message) { write('error', message); }
function debug(message) { write('debug', message); }

// Raw game process output: file only, never the main-process console.
function game(message) {
  const out = ensureStream();
  if (!out) return;
  try { out.write(`[${new Date().toISOString()}] [game] ${message}\n`); } catch {}
}

module.exports = { initLogger, closeLogger, info, success, warn, error, debug, game };
