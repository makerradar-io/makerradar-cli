// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { DEFAULT_API_URL } from "../src/api.js";
import { OPERATIONS } from "../src/operations.js";

/**
 * The contract: every operation the CLI calls exists in the API's published description, at the
 * same method and path. Runs with `npm run test:contract` (CI runs it daily) against
 * production's https://api.makerradar.io/v1/openapi.json, or `MAKERRADAR_OPENAPI` (a URL or a
 * file). Skipped in a plain `npm test`, which never reaches the network.
 */
const source = process.env.MAKERRADAR_OPENAPI || `${DEFAULT_API_URL}/openapi.json`;
const enabled = process.env.MAKERRADAR_CONTRACT === "1" || Boolean(process.env.MAKERRADAR_OPENAPI);

async function loadDocument() {
  if (!/^https?:\/\//.test(source)) return JSON.parse(await readFile(source, "utf8"));
  const res = await fetch(source, { headers: { accept: "application/json" } });
  assert.equal(res.status, 200, `${source} answered ${res.status}`);
  return res.json();
}

describe("the API contract", { skip: !enabled && "set MAKERRADAR_CONTRACT=1 to check the live API" }, () => {
  it("has every operation the CLI calls, at the same method and path, not deprecated", async () => {
    const doc = await loadDocument();
    /** @type {Map<string, { method: string, path: string, deprecated: boolean }>} */
    const published = new Map();
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(/** @type {Record<string, any>} */ (item))) {
        if (op?.operationId) {
          published.set(op.operationId, { method: method.toUpperCase(), path, deprecated: Boolean(op.deprecated) });
        }
      }
    }
    for (const [id, op] of Object.entries(OPERATIONS)) {
      const found = published.get(id);
      assert.ok(found, `${id} is gone from the API`);
      assert.equal(found.method, op.method, `${id}: method`);
      assert.equal(found.path, op.path, `${id}: path`);
      assert.equal(found.deprecated, false, `${id} is deprecated: move off it before its Sunset date`);
    }
  });
});
