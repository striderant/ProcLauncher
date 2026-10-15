// Launcher-level preferences, readable from both the renderer (settings UI)
// and the main process (tray behavior, update channel at startup/quit time).
// Stored as JSON at <userData>/launcher.json with atomic tmp-rename writes.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  uiMode: 'tele',          // 'tele' | 'classic'
  closeBehavior: 'quit',   // 'quit' | 'tray'
  updateChannel: 'stable', // 'stable' | 'beta'
};

function getPrefsPath(userDataDir) {
  return path.join(userDataDir, 'launcher.json');
}

function sanitize(raw) {
  const prefs = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return prefs;
  if (raw.uiMode === 'tele' || raw.uiMode === 'classic') prefs.uiMode = raw.uiMode;
  if (raw.closeBehavior === 'quit' || raw.closeBehavior === 'tray') prefs.closeBehavior = raw.closeBehavior;
  if (raw.updateChannel === 'stable' || raw.updateChannel === 'beta') prefs.updateChannel = raw.updateChannel;
  return prefs;
}

function getPrefs(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(getPrefsPath(userDataDir), 'utf8'));
    return sanitize(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

function setPrefs(userDataDir, patch) {
  const next = sanitize({ ...getPrefs(userDataDir), ...(patch || {}) });
  const file = getPrefsPath(userDataDir);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
  return next;
}

module.exports = { DEFAULTS, getPrefs, setPrefs };
