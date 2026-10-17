// Unit: the game process must be spawned fully detached so it survives the
// launcher quitting. Output goes to a per-launch log file (tailed back into the
// UI) instead of pipes back to the launcher process, which would tie the game's
// lifetime to the launcher and break when the launcher exits.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// eslint-disable-next-line global-require
const launch = require('../electron/launch');
// eslint-disable-next-line global-require
const logger = require('../electron/logger');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeChild() {
  return { pid: 4242, killed: false, on() {}, kill() {}, unref() { this.unreffed = true; } };
}

describe('detached game spawn', () => {
  it('spawns detached, unreffed, and never piped back to the launcher', () => {
    let captured = null;
    const child = fakeChild();
    const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return child; };

    const { stopTail } = launch.spawnDetachedGame({
      javaPath: 'java',
      args: ['-version'],
      cwd: 'C:/games',
      label: 'detach-test',
      spawnFn,
    });
    stopTail();

    assert.equal(captured.cmd, 'java');
    assert.deepEqual(captured.args, ['-version']);
    assert.equal(captured.opts.cwd, 'C:/games');
    assert.equal(captured.opts.detached, true);
    assert.equal(captured.opts.windowsHide, false);
    assert.notEqual(captured.opts.stdio, 'pipe');
    assert.notEqual(captured.opts.stdio[1], 'pipe');
    assert.notEqual(captured.opts.stdio[2], 'pipe');
    assert.equal(child.unreffed, true);
  });

  it('falls back to ignored stdio when logging is unavailable', () => {
    // No initLogger in this test: logger has no log dir.
    let captured = null;
    const spawnFn = (cmd, args, opts) => { captured = { opts }; return fakeChild(); };
    launch.spawnDetachedGame({ javaPath: 'java', args: [], cwd: '.', label: 'x', spawnFn });
    assert.deepEqual(captured.opts.stdio, ['ignore', 'ignore', 'ignore']);
  });
});

describe('detached game log file + tail', () => {
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-gamelog-'));
    logger.initLogger(dir);
  });
  after(() => {
    logger.closeLogger();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('redirects stdio to a file fd and tails complete lines into the UI', async () => {
    const received = [];
    let captured = null;
    const spawnFn = (cmd, args, opts) => { captured = { opts }; return fakeChild(); };

    const { stopTail, gameLog } = launch.spawnDetachedGame({
      javaPath: 'java',
      args: [],
      cwd: dir,
      label: 'tail-test',
      spawnFn,
      onOutput: (message) => received.push(message),
    });

    assert.ok(gameLog && gameLog.file.startsWith(dir));
    assert.equal(typeof captured.opts.stdio[1], 'number');
    assert.equal(captured.opts.stdio[1], captured.opts.stdio[2]);

    fs.appendFileSync(gameLog.file, 'line one\nline two\n');
    await delay(500);
    assert.deepEqual(received, ['line one', 'line two']);

    // A trailing partial line is flushed when the tail stops.
    fs.appendFileSync(gameLog.file, 'partial no newline');
    stopTail();
    assert.ok(received.includes('partial no newline'));
  });
});
