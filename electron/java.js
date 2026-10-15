const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const { pipeline } = require('stream/promises');
const execPromise = promisify(exec);
const { streamDownload, validateJar, extractZipNative } = require('./downloads');

const ADOPTIUM_API = 'https://api.adoptium.net/v3';

function getRequiredJavaVersion(mcVersion) {
  if (!mcVersion) return 17;
  const match = mcVersion.match(/1\.(\d+)/);
  if (match) {
    const minor = parseInt(match[1]);
    if (minor <= 16) return 8;
    if (minor <= 20) return 17;
    return 21;
  }
  const majorMatch = mcVersion.match(/^(\d+)\./);
  if (majorMatch) {
    const major = parseInt(majorMatch[1]);
    if (major >= 21) return 21;
    if (major >= 17) return 17;
  }
  return 17;
}

function findJavaExe(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        const found = findJavaExe(full);
        if (found) return found;
      } else if (name === 'java.exe' && (dir.endsWith('bin') || full.includes('bin'))) {
        return full;
      }
    }
  } catch (err) {
    console.error('Error finding Java:', err);
  }
  return null;
}

async function getJavaPath(userDataDir, javaVersion = 17) {
  const javaDir = path.join(userDataDir, 'java', `jdk${javaVersion}`);
  const internal = findJavaExe(javaDir);
  if (internal) return { javaPath: internal, needsDownload: false };
  // Managed runtime wins (Prism/vanilla convention): system Java is only
  // acceptable when its major version matches what Minecraft needs.
  if (await systemJavaMatches(javaVersion)) return { javaPath: 'java', needsDownload: false };
  return { javaPath: 'java', needsDownload: true };
}

// Parses `java -version` output (which goes to stderr). Handles legacy
// "1.8.0_xxx" (→ 8) and modern "17.0.x" (→ 17) schemes.
function parseJavaMajor(output) {
  const m = String(output || '').match(/version "([^"]+)"/);
  if (!m) return null;
  const parts = m[1].split(/[._-]/);
  if (parts[0] === '1' && parts[1]) {
    const v = parseInt(parts[1], 10);
    return Number.isNaN(v) ? null : v;
  }
  const v = parseInt(parts[0], 10);
  return Number.isNaN(v) ? null : v;
}

async function systemJavaMatches(javaVersion, execFn = execPromise) {
  try {
    const { stdout, stderr } = await execFn('java -version');
    return parseJavaMajor(`${stdout || ''}\n${stderr || ''}`) === javaVersion;
  } catch {
    return false;
  }
}

async function fetchAdoptiumChecksum(binaryUrl) {
  const { data } = await axios.get(`${binaryUrl}.sha256.txt`, { timeout: 30000, responseType: 'text' });
  const hash = String(data || '').trim().split(/\s+/)[0];
  if (!/^[0-9a-fA-F]{64}$/.test(hash || '')) {
    throw new Error('Adoptium checksum response was not a SHA-256 hash.');
  }
  return hash.toLowerCase();
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  return pipeline(fs.createReadStream(filePath), hash).then(() => hash.digest('hex'));
}

async function downloadJava(event, userDataDir, javaVersion = 17) {
  const javaDir = path.join(userDataDir, 'java', `jdk${javaVersion}`);
  fs.mkdirSync(javaDir, { recursive: true });
  const existing = findJavaExe(javaDir);
  if (existing) return existing;
  event.sender.send('log', { type: 'info', message: `Downloading Java ${javaVersion} JDK...` });
  const url = `${ADOPTIUM_API}/binary/latest/${javaVersion}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`;
  const zipPath = path.join(userDataDir, `jdk${javaVersion}.zip`);
  try {
    await streamDownload(url, zipPath, (percent) => {
      event.sender.send('launch-progress', { type: 'java-download', percent });
    });
    event.sender.send('log', { type: 'info', message: `Verifying Java ${javaVersion} JDK checksum...` });
    const expected = await fetchAdoptiumChecksum(url);
    const actual = await sha256File(zipPath);
    if (actual !== expected) {
      try { fs.unlinkSync(zipPath); } catch {}
      throw new Error(`Java ${javaVersion} JDK download failed its integrity check and was discarded. Please try again.`);
    }
    event.sender.send('log', { type: 'info', message: `Extracting Java ${javaVersion} JDK...` });
    await extractZipNative(zipPath, javaDir);
    fs.unlinkSync(zipPath);
    const javaPath = findJavaExe(javaDir);
    if (!javaPath) throw new Error(`java.exe not found after extraction for JDK ${javaVersion}`);
    event.sender.send('log', { type: 'success', message: `Java ${javaVersion} JDK installed.` });
    return javaPath;
  } catch (err) {
    event.sender.send('log', { type: 'error', message: `Java ${javaVersion} JDK download failed: ${err.message}` });
    throw err;
  }
}

module.exports = { getRequiredJavaVersion, findJavaExe, getJavaPath, downloadJava, parseJavaMajor, systemJavaMatches, fetchAdoptiumChecksum, sha256File };
