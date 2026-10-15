// Unit: main-side launch concurrency guard. A second launch while one is in
// flight must be rejected with ALREADY_LAUNCHING instead of spawning a
// second game process (which would orphan the first child reference).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
// eslint-disable-next-line global-require
const launch = require('../electron/launch');

describe('launch concurrency guard', () => {
  it('acquires and releases cleanly', () => {
    assert.equal(launch.isLaunchInFlight(), false);
    assert.equal(launch.tryAcquireLaunch(), true);
    assert.equal(launch.isLaunchInFlight(), true);
    assert.equal(launch.tryAcquireLaunch(), false);
    launch.releaseLaunch();
    assert.equal(launch.isLaunchInFlight(), false);
    assert.equal(launch.tryAcquireLaunch(), true);
    launch.releaseLaunch();
  });

  it('rejects a concurrent launch with a coded error before doing any work', async () => {
    assert.equal(launch.tryAcquireLaunch(), true);
    try {
      // No event/options needed: the guard throws before touching them.
      await assert.rejects(launch.launchCustomClient(), /already in progress/);
    } finally {
      launch.releaseLaunch();
    }
  });

  it('carries the ALREADY_LAUNCHING code for handler mapping', async () => {
    launch.tryAcquireLaunch();
    try {
      const err = await launch.launchCustomClient().catch(e => e);
      assert.equal(err.code, 'ALREADY_LAUNCHING');
    } finally {
      launch.releaseLaunch();
    }
  });
});
