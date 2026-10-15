const fs = require('fs');
const path = require('path');
const { createOfflineAccount } = require('./offlineAccount');

class AccountStore {
  constructor(app, safeStorage) {
    this.safeStorage = safeStorage;
    this.directory = path.join(app.getPath('userData'), 'accounts');
    this.file = path.join(this.directory, 'accounts.json');
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        version: 1,
        selectedId: typeof parsed.selectedId === 'string' ? parsed.selectedId : null,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Unable to read account store:', error);
      return { version: 1, selectedId: null, accounts: [] };
    }
  }

  write(data) {
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    if (fs.existsSync(this.file)) fs.rmSync(this.file, { force: true });
    fs.renameSync(temporary, this.file);
  }

  summary(account, selectedId) {
    return {
      id: account.id,
      type: account.type,
      username: account.username,
      uuid: account.uuid,
      avatarUrl: account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/64`,
      selected: account.id === selectedId,
      lastUsedAt: account.lastUsedAt || account.createdAt || null,
    };
  }

  list() {
    const data = this.read();
    return data.accounts.map(account => this.summary(account, data.selectedId));
  }

  getSelected() {
    return this.list().find(account => account.selected) || null;
  }

  createOffline(username) {
    const account = createOfflineAccount(username);
    const data = this.read();
    const existingIndex = data.accounts.findIndex(item => item.id === account.id);
    if (existingIndex >= 0) {
      account.createdAt = data.accounts[existingIndex].createdAt || account.createdAt;
      data.accounts[existingIndex] = account;
    } else {
      data.accounts.push(account);
    }
    data.selectedId = account.id;
    this.write(data);
    return this.summary(account, data.selectedId);
  }

  protect(tokens) {
    if (!this.safeStorage?.isEncryptionAvailable()) {
      throw new Error('Secure operating-system credential storage is unavailable. Microsoft credentials were not saved.');
    }
    return {
      format: 'safeStorage',
      data: this.safeStorage.encryptString(JSON.stringify(tokens)).toString('base64'),
    };
  }

  unprotect(secret) {
    if (!secret || secret.format !== 'safeStorage' || !secret.data) throw new Error('Microsoft credentials are missing.');
    if (!this.safeStorage?.isEncryptionAvailable()) throw new Error('Secure credential storage is currently unavailable.');
    return JSON.parse(this.safeStorage.decryptString(Buffer.from(secret.data, 'base64')));
  }

  saveMicrosoft(result, existingId = null, select = true) {
    if (!result?.profile?.id || !result?.profile?.name || !result?.tokens?.authCache) {
      throw new Error('Microsoft login returned an incomplete profile.');
    }
    const id = existingId || `microsoft:${result.profile.id}`;
    const data = this.read();
    const previous = data.accounts.find(account => account.id === id);
    const account = {
      id,
      type: 'microsoft',
      username: result.profile.name,
      uuid: result.profile.id,
      avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(result.profile.id)}/64`,
      credential: this.protect(result.tokens),
      createdAt: previous?.createdAt || new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    const index = data.accounts.findIndex(item => item.id === id || (item.type === 'microsoft' && item.uuid === account.uuid));
    if (index >= 0) data.accounts[index] = account;
    else data.accounts.push(account);
    if (select) data.selectedId = account.id;
    this.write(data);
    return this.summary(account, data.selectedId);
  }

  select(id) {
    const data = this.read();
    const account = data.accounts.find(item => item.id === id);
    if (!account) throw new Error('Account not found.');
    account.lastUsedAt = new Date().toISOString();
    data.selectedId = id;
    this.write(data);
    return this.summary(account, data.selectedId);
  }

  remove(id) {
    const data = this.read();
    const index = data.accounts.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Account not found.');
    data.accounts.splice(index, 1);
    if (data.selectedId === id) {
      data.selectedId = data.accounts[0]?.id || null;
      if (data.accounts[0]) data.accounts[0].lastUsedAt = new Date().toISOString();
    }
    this.write(data);
    return { accounts: data.accounts.map(account => this.summary(account, data.selectedId)), selected: this.getSelected() };
  }

  getInternal(id) {
    const data = this.read();
    const account = data.accounts.find(item => item.id === id);
    if (!account) throw new Error('Account not found.');
    return {
      ...account,
      tokens: account.type === 'microsoft' ? this.unprotect(account.credential) : null,
    };
  }

  getSelectedInternal() {
    const data = this.read();
    if (!data.selectedId) return null;
    return this.getInternal(data.selectedId);
  }
}

module.exports = { AccountStore };
