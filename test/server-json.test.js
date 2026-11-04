// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { DEFAULT_API_URL } from "../src/api.js";
import { mcpSnippets } from "../src/commands.js";

/**
 * `server.json` is what `mcp-publisher publish` sends to the MCP Registry, and what the
 * directories that read the registry show. It must say what the CLI and the package say.
 */
describe("server.json (the MCP Registry entry)", () => {
  it("names the package at its current version, under the name npm vouches for", async () => {
    const server = JSON.parse(await readFile(new URL("../server.json", import.meta.url), "utf8"));
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(server.name, "io.makerradar/mcp");
    assert.equal(pkg.mcpName, server.name, "npm's mcpName is how the registry checks we own the package");
    const npm = server.packages.find((/** @type {any} */ p) => p.registryType === "npm");
    assert.equal(npm.identifier, pkg.name);
    assert.equal(npm.version, pkg.version, "run `npm run sync:server-json` after a version bump");
    assert.equal(npm.transport.type, "stdio");
    assert.deepEqual(
      npm.packageArguments.map((/** @type {any} */ a) => a.value),
      ["mcp", "serve"],
      "the stdio bridge is `makerradar mcp serve`",
    );
    assert.equal(server.repository.url, pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""));
  });

  it("points at the same servers the CLI configures clients with", async () => {
    const server = JSON.parse(await readFile(new URL("../server.json", import.meta.url), "utf8"));
    const origin = new URL(DEFAULT_API_URL).origin;
    assert.deepEqual(
      server.remotes.map((/** @type {any} */ r) => r.url),
      [`${origin}/mcp`, `${origin}/mcp/account`],
    );
    assert.ok(server.remotes.every((/** @type {any} */ r) => r.type === "streamable-http"));
    const snippets = mcpSnippets(`${origin}/mcp`, `${origin}/mcp/account`);
    assert.ok(snippets.cursor.text.includes(`${origin}/mcp/account`));
    assert.ok(server.description.length <= 100, "the registry caps the description at 100 characters");
    assert.equal(server.websiteUrl, "https://makerradar.io/mcp");
    assert.equal(server.icons[0].src, "https://makerradar.io/icons/icon-512.png");
  });
});
