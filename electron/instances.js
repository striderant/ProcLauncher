// Instance configuration & local state system.
// One folder per instance at <minecraft>/instances/<id>/ containing:
//   instance.json  - the state schema (name, icon, versions, mods, ...)
//   mods/          - this instance's mods (also its --gameDir: saves, config, ...)
// Shared caches (libraries/, assets/, versions/, natives/, java/) stay at the
// minecraft root; only the gameDir is isolated per instance.

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DISABLED_SUFFIX = '.disabled';

function getInstancesDir(rootPath) {
  return path.join(rootPath, 'instances');
}

function getInstanceDir(rootPath, id) {
  return path.join(getInstancesDir(rootPath), String(id));
}

function getIndexPath(rootPath) {
  return path.join(getInstancesDir(rootPath), 'index.json');
}

function readRecord(instanceDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(instanceDir, 'instance.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRecord(instanceDir, data) {
  fs.mkdirSync(instanceDir, { recursive: true });
  const file = path.join(instanceDir, 'instance.json');
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'instance';
  return slug;
}

function uniqueSlug(rootPath, base) {
  let slug = base;
  let n = 2;
  while (fs.existsSync(getInstanceDir(rootPath, slug))) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultRecord({ id, name, icon, minecraft_version, customJvmArgs }) {
  const stamp = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: String(name || 'Unnamed').slice(0, 60),
    icon: String(icon || 'Grass').slice(0, 24),
    minecraft_version: String(minecraft_version || ''),
    loader_type: 'fabric',
    loader_version: '',
    fabric_profile_id: '',
    customJvmArgs: customJvmArgs || '',
    modrinth_project_ids: [],
    mods: {},
    createdAt: stamp,
    lastPlayedAt: null,
  };
}

function summarize(record) {
  const mods = Object.values(record.mods || {});
  return {
    id: record.id,
    name: record.name,
    icon: record.icon,
    minecraft_version: record.minecraft_version,
    loader_type: record.loader_type,
    loader_version: record.loader_version,
    fabric_profile_id: record.fabric_profile_id,
    modCount: mods.length,
    enabledCount: mods.filter(m => m.enabled !== false).length,
    lastPlayedAt: record.lastPlayedAt || null,
  };
}

function listInstances(rootPath) {
  const dir = getInstancesDir(rootPath);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir)) {
    if (item === 'index.json') continue;
    const itemPath = path.join(dir, item);
    let stat = null;
    try { stat = fs.statSync(itemPath); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const record = readRecord(itemPath);
    if (record) out.push(summarize(record));
  }
  out.sort((a, b) => {
    if (a.lastPlayedAt && b.lastPlayedAt) return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    if (a.lastPlayedAt) return -1;
    if (b.lastPlayedAt) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return out;
}

function getInstance(rootPath, id) {
  const record = readRecord(getInstanceDir(rootPath, id));
  if (!record) throw new Error(`Instance "${id}" was not found.`);
  return record;
}

function createInstance(rootPath, { name, icon, minecraft_version, customJvmArgs }) {
  if (!String(name || '').trim()) throw new Error('Instance name is required.');
  if (!String(minecraft_version || '').trim()) throw new Error('Minecraft version is required.');
  const id = uniqueSlug(rootPath, slugify(name));
  const instanceDir = getInstanceDir(rootPath, id);
  const record = defaultRecord({ id, name: name.trim(), icon, minecraft_version: minecraft_version.trim(), customJvmArgs });
  writeRecord(instanceDir, record);
  ensureModsDir(instanceDir);
  return record;
}

const PATCH_KEYS = new Set([
  'name', 'icon', 'minecraft_version', 'loader_version', 'fabric_profile_id',
  'customJvmArgs', 'lastPlayedAt',
]);

function updateInstance(rootPath, id, patch) {
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  for (const [key, value] of Object.entries(patch || {})) {
    if (!PATCH_KEYS.has(key)) continue;
    if (key === 'name' && !String(value || '').trim()) throw new Error('Instance name is required.');
    record[key] = typeof value === 'string' ? value.slice(0, key === 'customJvmArgs' ? 2000 : 120) : value;
  }
  // RAM/resolution are global Settings now - strip any legacy per-instance values.
  delete record.ram;
  delete record.resolution;
  // Changing the MC version invalidates the pinned loader profile.
  if (patch && typeof patch.minecraft_version === 'string') {
    record.loader_version = '';
    record.fabric_profile_id = '';
  }
  writeRecord(instanceDir, record);
  return record;
}

function deleteInstance(rootPath, id) {
  const instanceDir = getInstanceDir(rootPath, id);
  if (!fs.existsSync(instanceDir)) throw new Error(`Instance "${id}" was not found.`);
  fs.rmSync(instanceDir, { recursive: true, force: true });
  let selectedId = getSelectedId(rootPath);
  if (selectedId === id) {
    const remaining = listInstances(rootPath);
    selectedId = remaining[0]?.id || null;
    setSelectedId(rootPath, selectedId);
  }
  return { deleted: id, selectedId };
}

function getSelectedId(rootPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(getIndexPath(rootPath), 'utf8'));
    return typeof parsed?.selectedId === 'string' ? parsed.selectedId : null;
  } catch {
    return null;
  }
}

function setSelectedId(rootPath, id) {
  if (id != null) getInstance(rootPath, id); // validates existence
  fs.mkdirSync(getInstancesDir(rootPath), { recursive: true });
  fs.writeFileSync(getIndexPath(rootPath), JSON.stringify({ selectedId: id || null }, null, 2), 'utf8');
  return id || null;
}

function ensureModsDir(instanceDir) {
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  return modsDir;
}

function syncProjectIds(record) {
  const ids = new Set();
  for (const mod of Object.values(record.mods || {})) {
    if (mod?.project_id) ids.add(mod.project_id);
  }
  record.modrinth_project_ids = [...ids];
}

function registerMod(rootPath, id, { filename, project_id, version_id, version_number }) {
  if (!filename) throw new Error('Mod filename is required.');
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  record.mods = record.mods || {};
  const prev = record.mods[filename] || {};
  record.mods[filename] = {
    project_id: project_id || prev.project_id || null,
    version_id: version_id || prev.version_id || null,
    version_number: version_number || prev.version_number || null,
    enabled: prev.enabled !== false,
    updated_at: nowIso(),
  };
  syncProjectIds(record);
  writeRecord(instanceDir, record);
  return record.mods[filename];
}

function baseNameOf(filename) {
  const name = String(filename || '');
  return name.endsWith(DISABLED_SUFFIX) ? name.slice(0, -DISABLED_SUFFIX.length) : name;
}

function setModEnabled(rootPath, id, filename, enabled) {
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  const modsDir = ensureModsDir(instanceDir);
  const base = baseNameOf(filename);
  if (!base.toLowerCase().endsWith('.jar')) throw new Error('Only .jar mods can be toggled.');
  const enabledPath = path.join(modsDir, base);
  const disabledPath = path.join(modsDir, `${base}${DISABLED_SUFFIX}`);
  const wantEnabled = Boolean(enabled);

  if (wantEnabled) {
    if (!fs.existsSync(enabledPath) && fs.existsSync(disabledPath)) {
      if (fs.existsSync(enabledPath)) throw new Error(`${base} already exists.`);
      fs.renameSync(disabledPath, enabledPath);
    } else if (!fs.existsSync(enabledPath)) {
      throw new Error(`${base} was not found in this instance.`);
    }
  } else {
    if (fs.existsSync(enabledPath) && !fs.existsSync(disabledPath)) {
      fs.renameSync(enabledPath, disabledPath);
    } else if (!fs.existsSync(disabledPath)) {
      throw new Error(`${base} was not found in this instance.`);
    }
  }

  record.mods = record.mods || {};
  const prev = record.mods[base] || { project_id: null, version_id: null, version_number: null };
  record.mods[base] = { ...prev, enabled: wantEnabled, updated_at: nowIso() };
  syncProjectIds(record);
  writeRecord(instanceDir, record);
  return record.mods[base];
}

// Make on-disk state match the record flags (rename .jar <-> .jar.disabled).
// Used right before launch so the game always sees the intended mod set.
function enforceModStates(rootPath, id) {
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  const modsDir = ensureModsDir(instanceDir);
  record.mods = record.mods || {};
  let changed = false;
  for (const [base, meta] of Object.entries(record.mods)) {
    if (!base.toLowerCase().endsWith('.jar')) continue;
    const wantEnabled = meta?.enabled !== false;
    const enabledPath = path.join(modsDir, base);
    const disabledPath = path.join(modsDir, `${base}${DISABLED_SUFFIX}`);
    try {
      if (wantEnabled && !fs.existsSync(enabledPath) && fs.existsSync(disabledPath)) {
        fs.renameSync(disabledPath, enabledPath);
        changed = true;
      } else if (!wantEnabled && fs.existsSync(enabledPath) && !fs.existsSync(disabledPath)) {
        fs.renameSync(enabledPath, disabledPath);
        changed = true;
      }
    } catch {}
  }
  if (changed) {
    record.updated_at = nowIso();
    writeRecord(instanceDir, record);
  }
  return changed;
}

function deleteMod(rootPath, id, filename) {
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  const modsDir = ensureModsDir(instanceDir);
  const base = baseNameOf(filename);
  for (const candidate of [base, `${base}${DISABLED_SUFFIX}`]) {
    try { fs.rmSync(path.join(modsDir, candidate), { force: true }); } catch {}
  }
  if (record.mods) delete record.mods[base];
  syncProjectIds(record);
  writeRecord(instanceDir, record);
  return true;
}

// Reconcile instance.json with what's actually on disk: register untracked
// jars (project_id null = manually added), drop records for missing files.
function syncModsFromDisk(rootPath, id) {
  const instanceDir = getInstanceDir(rootPath, id);
  const record = getInstance(rootPath, id);
  const modsDir = ensureModsDir(instanceDir);
  record.mods = record.mods || {};
  const seen = new Set();
  for (const file of fs.readdirSync(modsDir)) {
    const full = path.join(modsDir, file);
    let stat = null;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    const lower = file.toLowerCase();
    const isDisabled = lower.endsWith('.jar.disabled');
    if (!lower.endsWith('.jar') && !isDisabled) continue;
    const base = isDisabled ? file.slice(0, -DISABLED_SUFFIX.length) : file;
    seen.add(base);
    if (!record.mods[base]) {
      record.mods[base] = {
        project_id: null,
        version_id: null,
        version_number: null,
        enabled: !isDisabled,
        updated_at: nowIso(),
      };
    } else if (record.mods[base].enabled !== !isDisabled) {
      // Disk is source of truth for the flag; a crash mid-rename shouldn't desync.
      record.mods[base].enabled = !isDisabled;
      record.mods[base].updated_at = nowIso();
    }
  }
  for (const key of Object.keys(record.mods)) {
    if (!seen.has(key)) delete record.mods[key];
  }
  syncProjectIds(record);
  writeRecord(instanceDir, record);
  return record;
}

function getMods(rootPath, id) {
  const record = syncModsFromDisk(rootPath, id);
  return Object.entries(record.mods || {})
    .map(([filename, meta]) => ({ filename, ...(meta || {}) }))
    .sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
}

// Local mod library: every .jar found across all instance mods folders
// (plus the legacy shared folder), de-duplicated by filename. Powers the
// "add downloaded mods" picker so mods never need re-downloading.
function listLocalMods(rootPath) {
  const out = [];
  const seen = new Set();
  const recordsById = new Map();
  for (const summary of listInstances(rootPath)) {
    try { recordsById.set(summary.id, getInstance(rootPath, summary.id)); } catch {}
  }
  const pushDir = (modsDir, sourceId, sourceName) => {
    let files = [];
    try {
      if (!fs.existsSync(modsDir)) return;
      files = fs.readdirSync(modsDir);
    } catch { return; }
    for (const file of files) {
      const lower = file.toLowerCase();
      const isDisabled = lower.endsWith('.jar.disabled');
      if (!lower.endsWith('.jar') && !isDisabled) continue;
      const base = isDisabled ? file.slice(0, -DISABLED_SUFFIX.length) : file;
      const key = base.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = (sourceId && recordsById.get(sourceId)?.mods?.[base]) || {};
      out.push({
        filename: base,
        project_id: meta.project_id || null,
        version_number: meta.version_number || null,
        sourceInstanceId: sourceId,
        sourceInstanceName: sourceName,
      });
    }
  };
  // Global library first, so shared downloads win attribution.
  pushDir(path.join(rootPath, 'mods'), null, 'Library');
  for (const summary of listInstances(rootPath)) {
    pushDir(path.join(getInstanceDir(rootPath, summary.id), 'mods'), summary.id, summary.name);
  }
  out.sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
  return out;
}

// Copy an already-downloaded jar into an instance and register it
// (project metadata travels along, so update checks keep working).
function addLocalMod(rootPath, id, { filename, sourceInstanceId }) {
  if (!filename) throw new Error('Mod filename is required.');
  const base = baseNameOf(filename);
  if (!base.toLowerCase().endsWith('.jar')) throw new Error('Only .jar mods can be added.');
  const instanceDir = getInstanceDir(rootPath, id);
  getInstance(rootPath, id); // validates existence
  const modsDir = ensureModsDir(instanceDir);
  const destPath = path.join(modsDir, base);
  if (fs.existsSync(destPath) || fs.existsSync(`${destPath}${DISABLED_SUFFIX}`)) {
    const existing = (getInstance(rootPath, id).mods || {})[base];
    if (!existing) {
      const srcMeta = (sourceInstanceId && getInstance(rootPath, sourceInstanceId).mods?.[base]) || {};
      registerMod(rootPath, id, {
        filename: base,
        project_id: srcMeta.project_id || null,
        version_id: srcMeta.version_id || null,
        version_number: srcMeta.version_number || null,
      });
    }
    return { added: false, filename: base };
  }
  const srcDir = sourceInstanceId
    ? path.join(getInstanceDir(rootPath, sourceInstanceId), 'mods')
    : path.join(rootPath, 'mods');
  let srcPath = path.join(srcDir, base);
  if (!fs.existsSync(srcPath)) {
    const altPath = `${srcPath}${DISABLED_SUFFIX}`;
    if (!fs.existsSync(altPath)) throw new Error(`${base} was not found in the source folder.`);
    srcPath = altPath;
  }
  fs.copyFileSync(srcPath, destPath);
  let srcMeta = {};
  if (sourceInstanceId) {
    try { srcMeta = getInstance(rootPath, sourceInstanceId).mods?.[base] || {}; } catch {}
  }
  registerMod(rootPath, id, {
    filename: base,
    project_id: srcMeta.project_id || null,
    version_id: srcMeta.version_id || null,
    version_number: srcMeta.version_number || null,
  });
  return { added: true, filename: base };
}

// One-time migration: RAM/resolution moved to global Settings - strip any
// legacy per-instance values so launches can't accidentally use them.
function stripPerInstancePerfFields(rootPath) {
  const dir = getInstancesDir(rootPath);
  if (!fs.existsSync(dir)) return { stripped: 0 };
  let stripped = 0;
  for (const item of fs.readdirSync(dir)) {
    if (item === 'index.json') continue;
    const itemPath = path.join(dir, item);
    let stat = null;
    try { stat = fs.statSync(itemPath); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const record = readRecord(itemPath);
    if (!record) continue;
    if ('ram' in record || 'resolution' in record) {
      delete record.ram;
      delete record.resolution;
      writeRecord(itemPath, record);
      stripped += 1;
    }
  }
  return { stripped };
}

// One-time migration: move the legacy shared mods/ into a Default instance.
// Skipped once instances/ exists.
function migrateLegacyMods(rootPath, inferMcVersion) {
  if (fs.existsSync(getInstancesDir(rootPath))) return { migrated: false };
  const legacyModsDir = path.join(rootPath, 'mods');
  let jars = [];
  try {
    jars = fs.existsSync(legacyModsDir)
      ? fs.readdirSync(legacyModsDir).filter(f => f.toLowerCase().endsWith('.jar'))
      : [];
  } catch { jars = []; }

  const mcVersion = inferMcVersion || '';
  const id = uniqueSlug(rootPath, 'default');
  const record = defaultRecord({ id, name: 'Default', icon: 'Grass', minecraft_version: mcVersion });
  const instanceDir = getInstanceDir(rootPath, id);
  writeRecord(instanceDir, record);
  const modsDir = ensureModsDir(instanceDir);

  let moved = 0;
  for (const file of jars) {
    const src = path.join(legacyModsDir, file);
    const dest = path.join(modsDir, file);
    try {
      if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
        fs.renameSync(src, dest);
        moved += 1;
      }
    } catch {}
  }
  syncModsFromDisk(rootPath, id);
  setSelectedId(rootPath, id);
  return { migrated: true, instanceId: id, moved };
}

// Pure classification of one mod against a target MC version for upgrades.
// latest: the Modrinth query result (or null when none exists).
// fetchError: network failure message, if the query itself failed.
// Returns { filename, project_id, current_version, status, latest_version?,
// latest_version_id?, error? } where status is kept | updatable | failed | local.
function classifyModForTarget(filename, meta, latest, fetchError, targetMc) {
  const current = meta?.version_number || meta?.version_id || 'unknown';
  if (!meta?.project_id) {
    return { filename, project_id: null, current_version: current, status: 'local' };
  }
  if (fetchError) {
    return { filename, project_id: meta.project_id, current_version: current, status: 'failed', error: fetchError };
  }
  if (!latest?.id) {
    return {
      filename,
      project_id: meta.project_id,
      current_version: current,
      status: 'failed',
      error: `No build for ${targetMc}`,
    };
  }
  if (latest.id === meta.version_id) {
    return { filename, project_id: meta.project_id, current_version: current, status: 'kept' };
  }
  return {
    filename,
    project_id: meta.project_id,
    current_version: current,
    status: 'updatable',
    latest_version: latest.version_number || latest.id,
    latest_version_id: latest.id,
  };
}

// Copy one jar (either variant) between instance mods folders.
function copyModFile(rootPath, fromId, toId, filename) {
  const base = baseNameOf(filename);
  if (!base.toLowerCase().endsWith('.jar')) throw new Error('Only .jar mods can be copied.');
  const srcDir = path.join(getInstanceDir(rootPath, fromId), 'mods');
  const destDir = ensureModsDir(getInstanceDir(rootPath, toId));
  let srcPath = path.join(srcDir, base);
  if (!fs.existsSync(srcPath)) {
    const altPath = `${srcPath}${DISABLED_SUFFIX}`;
    if (!fs.existsSync(altPath)) throw new Error(`${base} was not found.`);
    srcPath = altPath;
  }
  const destPath = path.join(destDir, base);
  if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
  return base;
}

module.exports = {
  SCHEMA_VERSION,
  DISABLED_SUFFIX,
  getInstancesDir,
  getInstanceDir,
  listInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  getSelectedId,
  setSelectedId,
  ensureModsDir,
  registerMod,
  setModEnabled,
  enforceModStates,
  deleteMod,
  getMods,
  syncModsFromDisk,
  listLocalMods,
  addLocalMod,
  classifyModForTarget,
  copyModFile,
  migrateLegacyMods,
  stripPerInstancePerfFields,
};
