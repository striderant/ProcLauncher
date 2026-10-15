const { contextBridge, ipcRenderer, shell } = require('electron');

const accountsApi = {
  list: () => ipcRenderer.invoke('accounts:list'),
  getSelected: () => ipcRenderer.invoke('accounts:getSelected'),
  createOffline: (username) => ipcRenderer.invoke('accounts:createOffline', username),
  startMicrosoftLogin: () => ipcRenderer.invoke('accounts:startMicrosoftLogin'),
  cancelMicrosoftLogin: () => ipcRenderer.invoke('accounts:cancelMicrosoftLogin'),
  refreshMicrosoft: (id) => ipcRenderer.invoke('accounts:refreshMicrosoft', id),
  select: (id) => ipcRenderer.invoke('accounts:select', id),
  remove: (id) => ipcRenderer.invoke('accounts:remove', id),
  onMicrosoftStatus: (callback) => {
    const subscription = (_event, message) => callback(message);
    ipcRenderer.on('accounts:microsoftStatus', subscription);
    return () => ipcRenderer.removeListener('accounts:microsoftStatus', subscription);
  },
  onMicrosoftCode: (callback) => {
    const subscription = (_event, code) => callback(code);
    ipcRenderer.on('accounts:microsoftCode', subscription);
    return () => ipcRenderer.removeListener('accounts:microsoftCode', subscription);
  },
};

contextBridge.exposeInMainWorld('launcher', {
  accounts: accountsApi,
  getPrefs: () => ipcRenderer.invoke('launcher:getPrefs'),
  getVersion: () => ipcRenderer.invoke('launcher:getVersion'),
  setPrefs: (patch) => ipcRenderer.invoke('launcher:setPrefs', patch),
});

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  openGameFolder: () => ipcRenderer.invoke('open-game-folder'),
  openVersionsFolder: () => ipcRenderer.invoke('open-versions-folder'),
  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
  
  getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions'),
  getSystemMemory: () => ipcRenderer.invoke('system:getMemory'),
  fetchAllVanillaVersions: () => ipcRenderer.invoke('fetch-all-vanilla-versions'),
  installModrinthVersion: (versionId) => ipcRenderer.invoke('install-modrinth-version', versionId),
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),
  cancelLaunch: () => ipcRenderer.invoke('cancel-launch'),
  checkForUpdates: () => ipcRenderer.invoke('launcher:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('launcher:download-update'),
  installUpdate: () => ipcRenderer.invoke('launcher:install-update'),

  accounts: accountsApi,

  instance: {
    list: () => ipcRenderer.invoke('instance:list'),
    get: (id) => ipcRenderer.invoke('instance:get', id),
    getSelected: () => ipcRenderer.invoke('instance:getSelected'),
    create: (fields) => ipcRenderer.invoke('instance:create', fields),
    update: (id, patch) => ipcRenderer.invoke('instance:update', id, patch),
    delete: (id) => ipcRenderer.invoke('instance:delete', id),
    select: (id) => ipcRenderer.invoke('instance:select', id),
    getMods: (id) => ipcRenderer.invoke('instance:getMods', id),
    listLocalMods: () => ipcRenderer.invoke('instance:listLocalMods'),
    addLocalMod: (id, payload) => ipcRenderer.invoke('instance:addLocalMod', id, payload),
    setModEnabled: (id, filename, enabled) => ipcRenderer.invoke('instance:setModEnabled', id, filename, enabled),
    deleteMod: (id, filename) => ipcRenderer.invoke('instance:deleteMod', id, filename),
    checkModUpdates: (id) => ipcRenderer.invoke('instance:checkModUpdates', id),
    updateMod: (id, projectId) => ipcRenderer.invoke('instance:updateMod', id, projectId),
    openModsFolder: (id) => ipcRenderer.invoke('instance:openModsFolder', id),
    planUpgrade: (id, targetMc) => ipcRenderer.invoke('instance:planUpgrade', id, targetMc),
    upgradeInstance: (payload) => ipcRenderer.invoke('instance:upgradeInstance', payload),
  },

  onLaunchProgress: (callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('launch-progress', subscription);
    return () => ipcRenderer.removeListener('launch-progress', subscription);
  },
  
  onLaunchStarted: (callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('launch-started', subscription);
    return () => ipcRenderer.removeListener('launch-started', subscription);
  },
  
  onLaunchFinished: (callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('launch-finished', subscription);
    return () => ipcRenderer.removeListener('launch-finished', subscription);
  },
  
  onLog: (callback) => {
    const subscription = (event, log) => callback(log);
    ipcRenderer.on('log', subscription);
    return () => ipcRenderer.removeListener('log', subscription);
  },

  onUpdate: (callback) => {
    const subscription = (event, info) => callback(info);
    ipcRenderer.on('launcher:update', subscription);
    return () => ipcRenderer.removeListener('launcher:update', subscription);
  },
});
