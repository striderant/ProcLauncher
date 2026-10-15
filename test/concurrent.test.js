// Unit: bounded-parallel mapLimit - order preservation, concurrency cap,
// per-item error isolation.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
// eslint-disable-next-line global-require
const { mapLimit } = require('../electron/concurrent');

const tick = () => new Promise(r => setTimeout(r, 5));

describe('mapLimit', () => {
  it('preserves input order with parallel execution', async () => {
    const out = await mapLimit([3, 1, 2], 5, async (v) => {
      await new Promise(r => setTimeout(r, (4 - v) * 5));
      return v * 10;
    });
    assert.deepEqual(out, [30, 10, 20]);
  });

  it('caps concurrency at the limit', async () => {
    let live = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async (v) => {
      live++;
      peak = Math.max(peak, live);
      await tick();
      live--;
      return v;
    });
    assert.ok(peak <= 2, `peak concurrency ${peak} exceeded limit 2`);
    assert.ok(peak > 1, 'should actually run in parallel');
  });

  it('isolates per-item errors without aborting siblings', async () => {
    const out = await mapLimit(['a', 'b', 'c'], 3, async (v) => {
      if (v === 'b') throw new Error('bad bee');
      return v;
    });
    assert.equal(out[0], 'a');
    assert.equal(out[2], 'c');
    assert.match(out[1].__mapError.message, /bad bee/);
  });

  it('handles empty input and oversized limits', async () => {
    assert.deepEqual(await mapLimit([], 5, async v => v), []);
    assert.deepEqual(await mapLimit([1], 99, async v => v * 2), [2]);
  });
});
