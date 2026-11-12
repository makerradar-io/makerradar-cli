// @ts-check
/**
 * Keep `server.json` (the MCP Registry entry) and `plugin.json` (the Agent Plugins manifest) in
 * step with `package.json`: the npm package the registry entry names ships at this version, and the
 * entry's own `version` moves with it (`nextServerVersion`: the registry refuses a version it
 * already has). Runs from `npm version` (the `version` script), or by hand:
 * `npm run sync:server-json`. `test/server-json.test.js` fails when they drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { nextServerVersion } from "./server-version.mjs";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const path = new URL("server.json", root);
const server = JSON.parse(readFileSync(path, "utf8"));

/** @type {string | undefined} */
let previous;
for (const entry of server.packages ?? []) {
  if (entry.registryType === "npm" && entry.identifier === pkg.name && entry.version !== pkg.version) {
    previous = entry.version;
    entry.version = pkg.version;
  }
}
if (previous !== undefined) {
  const before = server.version;
  server.version = nextServerVersion(server.version, previous, pkg.version);
  writeFileSync(path, `${JSON.stringify(server, null, 2)}\n`);
  console.log(`server.json: npm package ${pkg.name} → ${pkg.version}`);
  console.log(`server.json: version ${before} → ${server.version}`);
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

// The Claude Code plugin manifest carries the same version.
const claudePluginPath = new URL(".claude-plugin/plugin.json", root);
const claudePlugin = JSON.parse(readFileSync(claudePluginPath, "utf8"));
if (claudePlugin.version !== pkg.version) {
  claudePlugin.version = pkg.version;
  writeFileSync(claudePluginPath, `${JSON.stringify(claudePlugin, null, 2)}\n`);
  console.log(`.claude-plugin/plugin.json: version → ${pkg.version}`);
}
