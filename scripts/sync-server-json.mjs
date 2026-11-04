// @ts-check
/**
 * Keep `server.json` (the MCP Registry entry) and `plugin.json` (the Agent Plugins manifest) in
 * step with `package.json`: the npm package the registry entry names ships at this version. Runs from `npm version` (the `version` script), or by hand:
 * `npm run sync:server-json`. `test/server-json.test.js` fails when they drift.
 */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const path = new URL("server.json", root);
const server = JSON.parse(readFileSync(path, "utf8"));

let changed = false;
for (const entry of server.packages ?? []) {
  if (entry.registryType === "npm" && entry.identifier === pkg.name && entry.version !== pkg.version) {
    entry.version = pkg.version;
    changed = true;
  }
}
if (changed) {
  writeFileSync(path, `${JSON.stringify(server, null, 2)}\n`);
  console.log(`server.json: npm package ${pkg.name} → ${pkg.version}`);
}

// The Agent Plugins manifest (`plugin.json`, read by the Cursor directory and other plugin
// clients) carries the same version.
const pluginPath = new URL("plugin.json", root);
const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
if (plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
  console.log(`plugin.json: version → ${pkg.version}`);
}
