// Global download-task tracker: mod installs, mod updates and instance
// upgrades register here so a persistent bubble can show progress no matter
// which page is open. Main-process progress events update by kind; renderer
// call sites finish their own task ids (idempotent).
import { useSyncExternalStore } from 'react';

let nextId = 1;
const tasks = new Map(); // id -> { id, kind, label, percent, done, failed }
const listeners = new Set();
// Cached snapshot: useSyncExternalStore requires getSnapshot to return the
// same reference unless data changed - a fresh array every call loops forever.
let snapshot = [];

function emit() {
  snapshot = [...tasks.values()];
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

function scheduleRemoval(id, delay) {
  setTimeout(() => {
    if (tasks.delete(id)) emit();
  }, delay);
}

export function subscribeDownloads(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getDownloadTasks() {
  return snapshot;
}

export function useDownloadTasks() {
  return useSyncExternalStore(subscribeDownloads, getDownloadTasks);
}

export function pushDownloadTask(kind, label, extra = {}) {
  const id = nextId++;
  tasks.set(id, { id, kind, label, percent: 0, done: false, failed: false, iconUrl: null, instanceIcon: null, ...extra });
  emit();
  return id;
}

export function updateDownloadTask(id, percent) {
  const t = tasks.get(id);
  if (!t || t.done) return;
  t.percent = Math.min(100, Math.max(0, Math.round(percent)));
  if (t.percent >= 100) {
    t.done = true;
    t.doneText = t.doneText || defaultDoneText(t, true);
    scheduleRemoval(id, 3200);
  }
  emit();
}

// Feed a main-process progress event into the latest unfinished task of that
// kind, creating a generically-labelled one if the renderer hasn't yet.
export function updateLatestDownload(kind, percent, fallbackLabel) {
  const list = [...tasks.values()];
  let target = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].kind === kind && !list[i].done) { target = list[i]; break; }
  }
  if (!target) {
    const id = nextId++;
    target = { id, kind, label: fallbackLabel, percent: 0, done: false, failed: false };
    tasks.set(id, target);
  }
  updateDownloadTask(target.id, percent);
}

function defaultDoneText(task, ok) {
  if (task.kind === 'upgrade') return ok ? 'Upgraded' : 'Upgrade failed';
  if (/^updating /i.test(task.label)) return ok ? 'Updated' : 'Update failed';
  return ok ? 'Downloaded' : 'Download failed';
}

export function finishDownloadTask(id, ok = true, doneText, detail) {
  const t = tasks.get(id);
  if (!t || t.done) return;
  t.done = true;
  t.failed = !ok;
  if (ok) t.percent = 100;
  t.doneText = doneText || defaultDoneText(t, ok);
  t.detail = detail ? String(detail).slice(0, 120) : null;
  emit();
  scheduleRemoval(id, ok ? 3200 : 3500);
}
