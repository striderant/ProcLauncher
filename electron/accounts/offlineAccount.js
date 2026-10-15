const crypto = require('crypto');

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 3-16 characters and contain only letters, numbers, or underscores.');
  }
  return username;
}

// Equivalent to Java UUID.nameUUIDFromBytes("OfflinePlayer:" + username).
function offlineUuid(username) {
  const bytes = crypto.createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createOfflineAccount(value) {
  const username = validateUsername(value);
  const uuid = offlineUuid(username);
  return {
    id: `offline:${uuid}`,
    type: 'offline',
    username,
    uuid,
    avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
}

module.exports = { createOfflineAccount, offlineUuid, validateUsername };
