// Self-update engine built on electron-updater: checks the GitHub Releases
// feed (latest.yml, no API rate limits), downloads the NSIS installer in the
// background, and stages it until the user clicks install (quitAndInstall).
// The renderer drives the whole flow through a top-right circle; this module
// only emits state events: available -> downloading(%) -> downloaded | error.
// Deps are injected so the mapping is unit-testable without Electron.
function loadAutoUpdater() {
  try {
    return require('electron-updater').autoUpdater;
  } catch {
    return null;
  }
}

function createUpdater({ app, getPrefs, logger, send }) {
  let wired = false;
  let pendingVersion = null;

  const log = logger || console;

  function getAutoUpdater() {
    if (!app.isPackaged) return null;
    const autoUpdater = loadAutoUpdater();
    if (!autoUpdater) {
      log.warn('Auto-updater unavailable: electron-updater could not be loaded.');
      return null;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.allowPrerelease = getPrefs(app.getPath('userData')).updateChannel === 'beta';
    autoUpdater.logger = log;
    if (!wired) {
      wired = true;
      autoUpdater.on('checking-for-update', () => {
        const channel = getPrefs(app.getPath('userData')).updateChannel;
        log.info(`Checking for updates (${channel} channel)...`);
      });
      autoUpdater.on('update-available', (info) => {
        pendingVersion = info?.version || null;
        log.info(`Update available: v${pendingVersion}`);
        send({ state: 'available', version: pendingVersion });
      });
      autoUpdater.on('update-not-available', () => {
        log.info('Launcher is up to date.');
        send({ state: 'none' });
      });
      autoUpdater.on('download-progress', (progress) => {
        send({
          state: 'downloading',
          percent: Math.round(progress?.percent || 0),
          version: pendingVersion,
        });
      });
      autoUpdater.on('update-downloaded', (info) => {
        pendingVersion = info?.version || pendingVersion;
        log.info(`Update downloaded: v${pendingVersion}`);
        send({ state: 'downloaded', version: pendingVersion });
      });
      autoUpdater.on('error', (err) => {
        const message = err?.message || String(err);
        log.warn(`Update failed: ${message}`);
        send({ state: 'error', error: message });
      });
    }
    return autoUpdater;
  }

  return {
    checkForUpdates(manual = false) {
      const autoUpdater = getAutoUpdater();
      if (!autoUpdater) {
        if (manual) log.info('Update checks only run in packaged builds.');
        return { checked: false };
      }
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn(`Update check failed: ${err?.message || err}`);
      });
      return { checked: true };
    },

    async downloadUpdate() {
      const autoUpdater = getAutoUpdater();
      if (!autoUpdater) throw new Error('Updates can only be downloaded in a packaged build.');
      await autoUpdater.downloadUpdate();
      return { started: true };
    },

    installUpdate() {
      const autoUpdater = getAutoUpdater();
      if (!autoUpdater) throw new Error('Updates can only be installed from a packaged build.');
      autoUpdater.quitAndInstall(false, true);
      return { installing: true };
    },

    // Test seam: clear wired listeners + pending version.
    _resetForTests() {
      wired = false;
      pendingVersion = null;
    },
  };
}

module.exports = { createUpdater };
