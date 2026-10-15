const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRequiredJavaVersion } = require('../electron/java');

describe('java version mapping', () => {
  const cases = [
    ['1.8.9', 8],
    ['1.12.2', 8],
    ['1.16.5', 8],
    ['1.17.1', 17],
    ['1.18.2', 17],
    ['1.20.1', 17],
    ['1.20.5', 17],
    ['1.21', 21],
    [null, 17],
    ['', 17],
  ];
  for (const [mc, expected] of cases) {
    it(`${mc || '(empty)'} -> Java ${expected}`, () => {
      assert.equal(getRequiredJavaVersion(mc), expected);
    });
  }
});
