// Unit: Microsoft auth error classification (user-facing messages) and the
// session-vs-transient predicate used for launch-time SESSION_EXPIRED.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
// eslint-disable-next-line global-require
const { classifyAuthError, isSessionError } = require('../electron/accounts/microsoftAuth');

describe('classifyAuthError', () => {
  it('maps XErr 2148916233 to the missing-Xbox-profile message', () => {
    const msg = classifyAuthError(new Error('Xbox Live authentication failed to obtain a XSTS token. XErr: 2148916233\n{"XErr":2148916233}'));
    assert.match(msg, /no Xbox profile/);
  });

  it('maps XErr 2148916238 to the child-account message', () => {
    const msg = classifyAuthError(new Error('XErr: 2148916238'));
    assert.match(msg, /child account/);
  });

  it('maps device-code expiry to a retry message', () => {
    assert.match(classifyAuthError(new Error('Authentication failed, timed out')), /timed out|expired/);
  });

  it('maps browser denial to an approval message', () => {
    assert.match(classifyAuthError(new Error('Failed to acquire authorization code from device token (authorization_denied) - ...')), /not approved/);
  });

  it('maps network failures to a connection message', () => {
    assert.match(classifyAuthError(new Error('fetch failed')), /internet connection/);
    assert.match(classifyAuthError(new Error('getaddrinfo ENOTFOUND login.live.com')), /internet connection/);
  });

  it('maps 401/403 to the no-license message', () => {
    assert.match(classifyAuthError(new Error('401 Unauthorized {"error":"ForbiddenOperationException"}')), /Java Edition/);
    assert.match(classifyAuthError(new Error('403 Forbidden {}')), /Java Edition/);
  });

  it('passes our own friendly errors through untouched', () => {
    const msg = 'This Microsoft account does not have a Minecraft: Java Edition profile.';
    const err = new Error(msg);
    err.friendly = true;
    assert.equal(classifyAuthError(err), msg);
  });

  it('frames unknown errors instead of leaking raw bodies', () => {
    const msg = classifyAuthError(new Error('500 Internal Server Error <html>...very long body...</html>'));
    assert.match(msg, /^Microsoft sign-in failed: /);
    assert.ok(msg.length <= 'Microsoft sign-in failed: '.length + 301);
  });
});

describe('isSessionError', () => {
  it('flags auth/session failures', () => {
    assert.equal(isSessionError(new Error('XErr: 2148916233')), true);
    assert.equal(isSessionError(new Error('401 Unauthorized {}')), true);
    assert.equal(isSessionError(new Error('Microsoft session expired.')), true);
    assert.equal(isSessionError(new Error('Microsoft credentials are missing.')), true);
  });

  it('does not flag network failures', () => {
    assert.equal(isSessionError(new Error('fetch failed')), false);
    assert.equal(isSessionError(new Error('getaddrinfo ENOTFOUND xboxlive.com')), false);
  });
});
