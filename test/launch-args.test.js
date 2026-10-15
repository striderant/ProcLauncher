const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitArgumentString,
  replaceArgumentTokens,
  evaluateArgumentEntries,
  removeJsonManagedJvmArgs,
} = require('../electron/launch');
const { checkRules } = require('../electron/libraries');

describe('launch argument helpers', () => {
  it('splits quoted argument strings', () => {
    assert.deepEqual(splitArgumentString('--username "Steve Doe" --width 854'), [
      '--username', 'Steve Doe', '--width', '854',
    ]);
    assert.deepEqual(splitArgumentString(''), []);
    assert.deepEqual(splitArgumentString(null), []);
  });

  it('replaces ${tokens} and leaves unknown ones', () => {
    assert.equal(
      replaceArgumentTokens('--user ${auth_player_name} --x ${missing}', { auth_player_name: 'Alex' }),
      '--user Alex --x ${missing}'
    );
    assert.equal(replaceArgumentTokens(42, {}), 42);
  });

  it('evaluates entries with rules and token replacement', () => {
    const out = evaluateArgumentEntries(
      [
        '--plain',
        { rules: [{ action: 'allow', os: { name: 'windows' } }], value: '--win-only' },
        { rules: [{ action: 'allow', os: { name: 'osx' } }], value: '--mac-only' },
        { rules: [{ action: 'disallow', os: { name: 'windows' } }], value: '--not-win' },
        { value: ['--a', '--b ${auth_player_name}'] },
      ],
      { auth_player_name: 'Alex' }
    );
    // Default-deny when no rule matches (also gates feature-flagged args
    // like --demo), so expectations differ per OS.
    const expected = process.platform === 'win32'
      ? ['--plain', '--win-only', '--a', '--b Alex']
      : process.platform === 'darwin'
        ? ['--plain', '--mac-only', '--a', '--b Alex']
        : ['--plain', '--a', '--b Alex'];
    assert.deepEqual(out, expected);
  });

  it('checkRules defaults closed then opens on allow', () => {
    assert.equal(checkRules(undefined), true);
    assert.equal(checkRules([{ action: 'allow' }]), true);
    assert.equal(checkRules([{ action: 'disallow' }]), false);
  });

  it('strips JVM args the launcher manages itself', () => {
    assert.deepEqual(
      removeJsonManagedJvmArgs(['-Xmx2G', '-cp', 'ignored.jar', '-Djava.library.path=x', '-Dkeep=1']),
      ['-Xmx2G', '-Dkeep=1']
    );
  });
});
