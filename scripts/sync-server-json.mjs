// @ts-check
/**
 * Keep `server.json` (the MCP Registry entry) in step with `package.json`: the npm package it
 * names ships at this version. Runs from `npm version` (the `version` script), or by hand:
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
