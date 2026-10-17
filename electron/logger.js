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
    if (!/^(launcher-\d{4}-\d{2}-\d{2}|game-.+)\.log$/.test(file)) continue;
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

// Open a dedicated per-launch log file for the game's stdout/stderr. The game
// process is handed this file descriptor and writes to it directly, so its
// output does not depend on the launcher staying alive. Returns { file, fd }
// or null when logging is unavailable (caller should fall back to 'ignore').
function openGameLog(label) {
  if (!logDir) return null;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = String(label || 'game').replace(/[^a-z0-9._-]/gi, '_').slice(0, 64) || 'game';
    const file = path.join(logDir, `game-${safe}-${stamp}.log`);
    const fd = fs.openSync(file, 'a');
    return { file, fd };
  } catch {
    return null;
  }
}

// Poll a growing log file and emit each complete line via onLine. Used to
// mirror the detached game's file output back into the UI. Returns a stop().
function tailFile(filePath, onLine, intervalMs = 200) {
  let offset = 0;
  let pending = '';
  let stopped = false;
  const readOnce = () => {
    let stat;
    try { stat = fs.statSync(filePath); } catch { return; }
    if (stat.size <= offset) return;
    let fd;
    try { fd = fs.openSync(filePath, 'r'); } catch { return; }
    try {
      const len = stat.size - offset;
      const buf = Buffer.allocUnsafe(len);
      const readBytes = fs.readSync(fd, buf, 0, len, offset);
      offset += readBytes;
      pending += buf.toString('utf8', 0, readBytes);
      let idx;
      while ((idx = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, idx).replace(/\r$/, '');
        pending = pending.slice(idx + 1);
        if (line.length) { try { onLine(line); } catch {} }
      }
    } finally {
      try { fs.closeSync(fd); } catch {}
    }
  };
  const read = () => { if (!stopped) readOnce(); };
  const timer = setInterval(read, intervalMs);
  if (timer.unref) timer.unref();
  read();
  return () => {
    if (stopped) return;
    readOnce(); // final read so bytes appended since the last poll are not lost
    stopped = true;
    clearInterval(timer);
    const tail = pending.replace(/\r$/, '');
    pending = '';
    if (tail.length) { try { onLine(tail); } catch {} }
  };
}

module.exports = { initLogger, closeLogger, info, success, warn, error, debug, game, openGameLog, tailFile };
