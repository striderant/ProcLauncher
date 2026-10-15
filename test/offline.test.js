const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { offlineUuid, validateUsername, createOfflineAccount } = require('../electron/accounts/offlineAccount');

describe('offline accounts', () => {
  it('rejects bad usernames', () => {
    assert.throws(() => validateUsername('ab'), /3-16 characters/);
    assert.throws(() => validateUsername('has space'), /3-16 characters/);
    assert.equal(validateUsername('  Steve_123  '), 'Steve_123');
  });

  it('generates stable dashed UUIDs that strip to 32 hex', () => {
    const a = offlineUuid('Steve');
    const b = offlineUuid('Steve');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(a.replace(/-/g, '').length, 32);
    assert.notEqual(offlineUuid('Steve'), offlineUuid('Alex'));
  });

  it('creates accounts with ids and avatars', () => {
    const account = createOfflineAccount('Steve');
    assert.equal(account.type, 'offline');
    assert.ok(account.id.startsWith('offline:'));
    assert.ok(account.avatarUrl.includes('Steve'));
  });
});
