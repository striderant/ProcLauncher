const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { streamDownload, validateJar } = require('./downloads');

const CURRENT_OS = process.platform === 'win32' ? 'windows'
                 : process.platform === 'darwin' ? 'osx'
                 : 'linux';
const IS_64BIT = process.arch === 'x64' || process.arch === 'arm64';

function getLibraryArtifact(lib, rootPath) {
  let url = null;
  let relPath = null;

  if (lib.downloads?.artifact?.url) {
    url = lib.downloads.artifact.url;
    relPath = lib.downloads.artifact.path || url;
  } else if (lib.downloads?.artifact?.path) {
    relPath = lib.downloads.artifact.path;
    url = `https://libraries.minecraft.net/${relPath}`;
  } else if (lib.name) {
    const parts = lib.name.split(':');
    if (parts.length >= 3) {
      const group = parts[0].replace(/\./g, '/');
      const name = parts[1];
      const version = parts[2];
      const filename = `${name}-${version}.jar`;
      relPath = `${group}/${name}/${version}/${filename}`;
      url = lib.url
        ? `${lib.url.replace(/\/?$/, '/')}${relPath}`
        : `https://libraries.minecraft.net/${relPath}`;
    }
  } else if (lib.url) {
    url = lib.url;
    relPath = url;
  }

  if (!url || !relPath) return null;

  const prefixes = [
    'https://libraries.minecraft.net/',
    'https://repo1.maven.org/maven2/',
    'https://maven.minecraftforge.net/',
    'https://maven.neoforged.net/releases/',
    'https://repo.maven.apache.org/maven2/'
  ];

  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      relPath = url.substring(prefix.length);
      break;
    }
  }

  if (relPath.includes('://')) {
    relPath = relPath.split('://')[1].split('/').slice(1).join('/');
  }
  
  if (!relPath || relPath === '/' || relPath.trim() === '') return null;

  const localPath = path.join(rootPath, 'libraries', relPath);
  return { url, localPath };
}

async function ensureLibrary(lib, rootPath, event) {
  const artifact = getLibraryArtifact(lib, rootPath);
  if (!artifact) return null;
  const { url, localPath } = artifact;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  
  if (fs.existsSync(localPath)) {
    if (fs.statSync(localPath).isDirectory()) {
      event.sender.send('log', { type: 'error', message: `Path collision: ${localPath} is a directory, expected a file.` });
      return null;
    }
    const valid = await validateJar(localPath);
    if (valid) return localPath;
    event.sender.send('log', { type: 'warn', message: `Corrupted library, re-downloading: ${path.basename(localPath)}` });
    try {
      fs.unlinkSync(localPath);
    } catch (err) {
      event.sender.send('log', { type: 'error', message: `Failed to delete corrupted library: ${err.message}` });
      return null;
    }
  }
  event.sender.send('log', { type: 'info', message: `Downloading library: ${lib.name || path.basename(localPath)}` });
  try {
    await streamDownload(url, localPath, null);
    const valid = await validateJar(localPath);
    if (!valid) throw new Error('Downloaded JAR is invalid');
    return localPath;
  } catch (err) {
    event.sender.send('log', { type: 'warn', message: `Failed to download ${lib.name}: ${err.message}` });
    const fallbackUrls = [
      url.replace('https://libraries.minecraft.net', 'https://repo1.maven.org/maven2'),
      url.replace('https://maven.minecraftforge.net', 'https://repo1.maven.org/maven2')
    ];
    for (const fallbackUrl of fallbackUrls) {
      if (fallbackUrl === url) continue;
      try {
        await streamDownload(fallbackUrl, localPath, null);
        const valid = await validateJar(localPath);
        if (valid) {
          event.sender.send('log', { type: 'success', message: `Downloaded from fallback: ${path.basename(localPath)}` });
          return localPath;
        }
      } catch {}
    }
    return null;
  }
}

async function downloadLibraries(event, versionJson, rootPath) {
  if (!versionJson.libraries || !Array.isArray(versionJson.libraries)) {
    event.sender.send('log', { type: 'info', message: 'No libraries to download' });
    return;
  }
  const libsDir = path.join(rootPath, 'libraries');
  fs.mkdirSync(libsDir, { recursive: true });
  let totalLibs = 0;
  let downloadedLibs = 0;
  for (const lib of versionJson.libraries) {
    if (!checkLibraryRules(lib.rules)) continue;
    if (getLibraryArtifact(lib, rootPath)) totalLibs++;
  }
  event.sender.send('log', { type: 'info', message: `Checking ${totalLibs} libraries...` });
  for (const lib of versionJson.libraries) {
    if (!checkLibraryRules(lib.rules)) continue;
    const libPath = await ensureLibrary(lib, rootPath, event);
    if (libPath) {
      downloadedLibs++;
      event.sender.send('launch-progress', {
        type: 'libraries',
        percent: Math.round((downloadedLibs / totalLibs) * 100),
        current: `${downloadedLibs}/${totalLibs}`
      });
    }
  }
  event.sender.send('log', { type: 'success', message: `Libraries ready (${downloadedLibs}/${totalLibs} downloaded)` });
}

async function downloadAssets(event, versionJson, rootPath) {
  const assetIndex = versionJson.assetIndex;
  if (!assetIndex || !assetIndex.id) {
    event.sender.send('log', { type: 'warn', message: 'No asset index defined, skipping assets' });
    return;
  }
  const assetsDir = path.join(rootPath, 'assets');
  const indexDir = path.join(assetsDir, 'indexes');
  const objectsDir = path.join(assetsDir, 'objects');
  fs.mkdirSync(indexDir, { recursive: true });
  fs.mkdirSync(objectsDir, { recursive: true });
  const indexPath = path.join(indexDir, `${assetIndex.id}.json`);
  if (!fs.existsSync(indexPath)) {
    let indexUrl = assetIndex.url;
    if (!indexUrl) {
      indexUrl = `https://piston-meta.mojang.com/v1/packages/${assetIndex.id}/${assetIndex.id}.json`;
    }
    event.sender.send('log', { type: 'info', message: `Downloading asset index: ${assetIndex.id}` });
    try {
      const response = await axios.get(indexUrl, { timeout: 30000 });
      fs.writeFileSync(indexPath, JSON.stringify(response.data, null, 2));
    } catch (err) {
      event.sender.send('log', { type: 'error', message: `Failed to download asset index: ${err.message}` });
      return;
    }
  }
  let indexData;
  try {
    indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (err) {
    event.sender.send('log', { type: 'error', message: `Failed to parse asset index: ${err.message}` });
    return;
  }
  const objects = indexData.objects || {};
  const totalAssets = Object.keys(objects).length;
  let downloadedAssets = 0;
  for (const [assetPath, assetInfo] of Object.entries(objects)) {
    const hash = assetInfo.hash;
    const subPath = hash.substring(0, 2);
    const assetFile = path.join(objectsDir, subPath, hash);
    if (!fs.existsSync(assetFile)) {
      fs.mkdirSync(path.dirname(assetFile), { recursive: true });
      const url = `https://resources.download.minecraft.net/${subPath}/${hash}`;
      try {
        await streamDownload(url, assetFile, null);
        downloadedAssets++;
        if (downloadedAssets % 100 === 0) {
          event.sender.send('log', { type: 'info', message: `Downloaded ${downloadedAssets}/${totalAssets} assets` });
        }
        event.sender.send('launch-progress', {
          type: 'assets',
          percent: Math.round((downloadedAssets / totalAssets) * 100)
        });
      } catch (err) {
        event.sender.send('log', { type: 'warn', message: `Failed to download asset ${hash}: ${err.message}` });
      }
    }
  }
  if (downloadedAssets > 0) {
    event.sender.send('log', { type: 'success', message: `Assets ready (${downloadedAssets} new downloads)` });
  } else {
    event.sender.send('log', { type: 'info', message: `All assets already present` });
  }
}

function checkLibraryRules(rules) {
  if (!rules || !Array.isArray(rules)) return true;
  let allowed = false;
  for (const rule of rules) {
    const action = rule.action === 'allow';
    let applies = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== CURRENT_OS) applies = false;
      if (rule.os.arch) {
        const is64 = IS_64BIT;
        if (rule.os.arch === 'x86' && is64) applies = false;
        if (rule.os.arch === 'x64' && !is64) applies = false;
      }
    }
    if (applies) allowed = action;
  }
  return allowed;
}

function resolveRuleFeatures() {
  return {
    is_demo_user: false,
    has_custom_resolution: true,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false,
  };
}

function checkRules(rules, features = resolveRuleFeatures()) {
  if (!rules || !Array.isArray(rules)) return true;
  let allowed = false;
  for (const rule of rules) {
    let applies = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== CURRENT_OS) applies = false;
      if (rule.os.arch) {
        const is64 = IS_64BIT;
        if (rule.os.arch === 'x86' && is64) applies = false;
        if (rule.os.arch === 'x64' && !is64) applies = false;
      }
    }
    if (rule.features) {
      for (const [feature, required] of Object.entries(rule.features)) {
        if (Boolean(features[feature]) !== Boolean(required)) applies = false;
      }
    }
    if (applies) allowed = rule.action === 'allow';
  }
  return allowed;
}

function getNativeClassifier(lib) {
  if (!lib.natives) return null;
  let classifier = lib.natives[CURRENT_OS];
  if (!classifier) return null;
  const arch = IS_64BIT ? '64' : '32';
  classifier = classifier.replace('${arch}', arch);
  return classifier;
}

function isNativeFile(filename) {
  const lower = filename.toLowerCase();
  return lower.endsWith('.dll') || lower.endsWith('.so') || lower.endsWith('.dylib') || lower.endsWith('.jnilib');
}

function getFileHash(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(data).digest('hex');
  } catch { return null; }
}

function getNativesDir(versionPath) {
  return path.join(versionPath, 'natives');
}

function loadNativesManifest(nativesDir) {
  const manifestPath = path.join(nativesDir, '.natives_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return {}; }
  }
  return {};
}

function saveNativesManifest(nativesDir, manifest) {
  const manifestPath = path.join(nativesDir, '.natives_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function extractNativeJar(jarPath, destDir, libName, event, extractSpec) {
  const excludes = extractSpec?.exclude ?? ['META-INF/'];
  try {
    const zip = new AdmZip(jarPath);
    const entries = zip.getEntries();
    let extractedCount = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!isNativeFile(entry.entryName)) continue;
      const entryName = entry.entryName.replace(/\\/g, '/');
      const excluded = excludes.some(ex => entryName.startsWith(ex));
      if (excluded) continue;
      zip.extractEntryTo(entry, destDir, false, true);
      extractedCount++;
    }
    if (extractedCount > 0 && event) {
      event.sender.send('log', { type: 'debug', message: `Extracted ${extractedCount} native(s) from ${libName}` });
    }
    return extractedCount;
  } catch (err) {
    if (event) {
      event.sender.send('log', { type: 'warn', message: `Failed to extract natives from ${libName}: ${err.message}` });
    }
    return 0;
  }
}

async function downloadNativeLibrary(lib, classifier, rootPath, event) {
  let nativeInfo = lib.downloads?.classifiers?.[classifier] ?? null;
  if (!nativeInfo && lib.name) {
    const parts = lib.name.split(':');
    if (parts.length >= 3) {
      const [groupRaw, artifactId, version] = parts;
      const group = groupRaw.replace(/\./g, '/');
      const filename = `${artifactId}-${version}-${classifier}.jar`;
      const relPath = `${group}/${artifactId}/${version}/${filename}`;
      nativeInfo = {
        path: relPath,
        _candidateUrls: [
          `https://libraries.minecraft.net/${relPath}`,
          `https://repo1.maven.org/maven2/${relPath}`,
          `https://maven.minecraftforge.net/${relPath}`,
        ],
      };
    }
  }
  if (!nativeInfo) return null;
  let libPath;
  if (nativeInfo.path) {
    libPath = path.join(rootPath, 'libraries', nativeInfo.path);
  } else if (nativeInfo.url) {
    const urlPath = new URL(nativeInfo.url).pathname;
    libPath = path.join(rootPath, 'libraries', urlPath.substring(1));
  } else {
    return null;
  }
  if (fs.existsSync(libPath)) {
    const valid = await validateJar(libPath);
    if (valid) return libPath;
    fs.unlinkSync(libPath);
  }
  fs.mkdirSync(path.dirname(libPath), { recursive: true });
  const urlsToTry = nativeInfo._candidateUrls || [
    nativeInfo.url,
    nativeInfo.path ? `https://libraries.minecraft.net/${nativeInfo.path}` : null,
    nativeInfo.path ? `https://repo1.maven.org/maven2/${nativeInfo.path}` : null,
    nativeInfo.path ? `https://maven.minecraftforge.net/${nativeInfo.path}` : null,
  ].filter(Boolean);
  for (const url of urlsToTry) {
    try {
      await streamDownload(url, libPath, null);
      const valid = await validateJar(libPath);
      if (valid) return libPath;
    } catch (err) {
      if (fs.existsSync(libPath)) fs.unlinkSync(libPath);
    }
  }
  return null;
}

async function setupNatives(versionJson, versionPath, rootPath, event) {
  const nativesDir = getNativesDir(versionPath);
  fs.mkdirSync(nativesDir, { recursive: true });
  const manifest = loadNativesManifest(nativesDir);
  let needsExtraction = false;
  let totalNatives = 0;
  let processedNatives = 0;
  let extractedCount = 0;
  const requiredNatives = [];
  for (const lib of versionJson.libraries || []) {
    const classifier = getNativeClassifier(lib);
    if (classifier && checkLibraryRules(lib.rules)) {
      requiredNatives.push({ lib, classifier });
      totalNatives++;
    }
  }
  if (totalNatives === 0) {
    event.sender.send('log', { type: 'info', message: 'No native libraries required' });
    return nativesDir;
  }
  for (const { lib, classifier } of requiredNatives) {
    const libName = lib.name || 'unknown-library';
    try {
      const nativeJarPath = await downloadNativeLibrary(lib, classifier, rootPath, event);
      if (!nativeJarPath) continue;
      const currentHash = getFileHash(nativeJarPath);
      const previousHash = manifest[libName];
      if (!previousHash || currentHash !== previousHash) needsExtraction = true;
    } catch { needsExtraction = true; }
  }
  const existingNatives = fs.readdirSync(nativesDir).filter(f => isNativeFile(f));
  if (existingNatives.length === 0) needsExtraction = true;
  if (!needsExtraction) {
    event.sender.send('log', { type: 'info', message: `Native libraries already extracted (${existingNatives.length} files)` });
    return nativesDir;
  }
  event.sender.send('log', { type: 'info', message: `Extracting native libraries to ${path.basename(nativesDir)}...` });
  for (const file of fs.readdirSync(nativesDir)) {
    if (file !== '.natives_manifest.json') {
      try { fs.unlinkSync(path.join(nativesDir, file)); } catch {}
    }
  }
  const newManifest = {};
  for (const { lib, classifier } of requiredNatives) {
    const libName = lib.name || 'unknown-library';
    try {
      const nativeJarPath = await downloadNativeLibrary(lib, classifier, rootPath, event);
      if (!nativeJarPath) continue;
      const count = await extractNativeJar(nativeJarPath, nativesDir, libName, event, lib.extract);
      extractedCount += count;
      const hash = getFileHash(nativeJarPath);
      if (hash) newManifest[libName] = hash;
      processedNatives++;
      event.sender.send('launch-progress', { type: 'natives', percent: Math.round((processedNatives / totalNatives) * 100) });
    } catch (err) {
      event.sender.send('log', { type: 'warn', message: `Error processing native ${libName}: ${err.message}` });
    }
  }
  saveNativesManifest(nativesDir, newManifest);
  event.sender.send('log', { type: 'success', message: `Native libraries ready (${extractedCount} files extracted)` });
  return nativesDir;
}

module.exports = { CURRENT_OS, IS_64BIT, getLibraryArtifact, ensureLibrary, downloadLibraries, downloadAssets, checkLibraryRules, resolveRuleFeatures, checkRules, getNativeClassifier, isNativeFile, getFileHash, getNativesDir, loadNativesManifest, saveNativesManifest, extractNativeJar, downloadNativeLibrary, setupNatives };
