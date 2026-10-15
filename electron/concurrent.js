// Bounded parallelism for per-item async fans (e.g. per-mod Modrinth
// queries: polite to the API, much faster than serial). Preserves input
// order; per-item rejections are returned as { __mapError } values so one
// bad item never aborts its siblings.
async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let next = 0;
  const workerCount = Math.min(Math.max(limit, 1), list.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < list.length) {
      const i = next++;
      try {
        out[i] = await fn(list[i], i);
      } catch (err) {
        out[i] = { __mapError: err };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { mapLimit };
