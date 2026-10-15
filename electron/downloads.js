const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const AdmZip = require('adm-zip');

async function validateJar(jarPath) {
  try {
    if (!fs.existsSync(jarPath) || fs.statSync(jarPath).isDirectory()) return false;
    const stats = fs.statSync(jarPath);
    if (stats.size === 0) return false;
    const zip = new AdmZip(jarPath);
    zip.getEntries();
    return true;
  } catch {
    return false;
  }
}

async function streamDownload(url, destPath, onProgress) {
  let response;
  try {
    response = await axios({ method: 'get', url, responseType: 'stream', timeout: 30000 });
  } catch (err) {
    if (url.includes('neoforged.net')) {
      const mirror = url.replace('https://maven.neoforged.net/releases', 'https://maven.creeperhost.net/release');
      response = await axios({ method: 'get', url: mirror, responseType: 'stream' });
    } else {
      throw err;
    }
  }
  const totalSize = parseInt(response.headers['content-length'], 10) || 0;
  let downloaded = 0;
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalSize && onProgress) onProgress(Math.round((downloaded / totalSize) * 100));
    });
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function extractZipNative(zipPath, targetDir) {
  const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force`;
  await execPromise(`powershell -Command "${psCommand}"`);
}

module.exports = { streamDownload, validateJar, extractZipNative };
