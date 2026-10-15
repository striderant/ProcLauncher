// Unit: Mojang version-manifest cache - second call within TTL performs no
// HTTP, concurrent callers share one inflight request.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let calls;
let versions;
before(() => {
  calls = 0;
  const axiosPath = require.resolve('axios');
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        calls++;
        assert.match(url, /version_manifest/);
        await new Promise(r => setTimeout(r, 20));
        return { data: { latest: {}, versions: [] } };
      },
    },
  };
  // eslint-disable-next-line global-require
  versions = require('../electron/versions');
});

describe('fetchVersionManifest cache', () => {
  it('fetches once then serves from cache', async () => {
    calls = 0;
    versions._resetManifestCache();
    const a = await versions.fetchVersionManifest();
    const b = await versions.fetchVersionManifest();
    assert.equal(calls, 1);
    assert.equal(a, b);
  });

  it('dedupes concurrent callers into one request', async () => {
    calls = 0;
    versions._resetManifestCache();
    const results = await Promise.all([
      versions.fetchVersionManifest(),
      versions.fetchVersionManifest(),
      versions.fetchVersionManifest(),
      versions.fetchVersionManifest(),
      versions.fetchVersionManifest(),
    ]);
    assert.equal(calls, 1);
    for (const r of results) assert.equal(r, results[0]);
  });

  it('refetches after a reset', async () => {
    calls = 0;
    versions._resetManifestCache();
    await versions.fetchVersionManifest();
    assert.equal(calls, 1);
    versions._resetManifestCache();
    await versions.fetchVersionManifest();
    assert.equal(calls, 2);
  });
});
