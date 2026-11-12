// @ts-check
/**
 * The MCP Registry refuses a `server.json` whose `version` it already has, so every release of
 * the npm package it names needs a new server version too. The server version moves by the same
 * step as the package: a major package release bumps its major, a minor its minor, anything else
 * its patch. Pure, so `test/server-version.test.js` can pin it.
 */

/** "1.2.3" (a pre-release or build suffix ignored) → [1, 2, 3]; null if it isn't one. */
export function parseVersion(/** @type {unknown} */ v) {
  const m = typeof v === "string" ? /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * The server version after the package moved from `fromPackage` to `toPackage`: `server` bumped by
 * the same step. Unchanged when the package didn't move; a patch bump when either package version
 * can't be read (better a new version than a refused publish).
 * @param {string} server
 * @param {string | undefined} fromPackage
 * @param {string} toPackage
 */
export function nextServerVersion(server, fromPackage, toPackage) {
  const current = parseVersion(server);
  if (!current) throw new Error(`server.json's version "${server}" isn't major.minor.patch`);
  if (fromPackage === toPackage) return server;
  const from = parseVersion(fromPackage);
  const to = parseVersion(toPackage);
  const [major, minor, patch] = current;
  if (from && to && to[0] !== from[0]) return `${major + 1}.0.0`;
  if (from && to && to[1] !== from[1]) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
