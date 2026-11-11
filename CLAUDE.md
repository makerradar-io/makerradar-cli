# makerradar-cli — agent guide

The official MakerRadar CLI, published on npm as `makerradar`. Public repo; the product itself
lives in a private monorepo. This CLI is an ordinary client of the **public, versioned API**
(`https://api.makerradar.io/v1`, described by `/v1/openapi.json`) and nothing else.

## Rules

- **No dependencies.** Node ≥ 20 built-ins only (`fetch`, `node:util` `parseArgs`, `node:test`).
  Plain ESM JavaScript with `// @ts-check` + JSDoc; no build step: what's in `bin/` and `src/` is
  what ships.
- **Every endpoint is in `src/operations.js`**, by its OpenAPI `operationId`. Call it with
  `client.call(id, …)`, never a hand-built URL. `test/contract.test.js` checks the table against
  the live document (CI, daily). A `/v1` endpoint is only retired after a `Deprecation`/`Sunset`
  notice, and the contract test fails on a deprecated one, so move off it then.
- **Every string from the API is printed through `clean()`** (`src/format.js`): makers write that
  text, and a terminal obeys escape sequences. `--json` prints the body as is (JSON escapes them).
- **Stable for agents:** `--json` = the API's own JSON on stdout; errors on stderr (JSON with
  `--json`); exit 0 done · 1 the API refused or was unreachable · 2 a usage mistake, which never
  calls the API.
- **The token is never printed** and lives only in the config file (0600, written atomically) or
  `MAKERRADAR_TOKEN`. It goes out only over https (plain http to localhost alone: `tokenSafeUrl`),
  and `MAKERRADAR_TOKEN` only to the API the environment names, never to a different `--api-url`.
  The CLI never asks for a password and never pays: checkouts hand the person a payment page.
- Paid placements are disclosed (`tierLabel`: "Featured · paid"). Maker descriptions are labelled
  "written by the maker, unverified".

## Adding a command

1. Add its operation(s) to `OPERATIONS` (exact `operationId`, method, path from the OpenAPI doc).
2. Add an entry to `COMMANDS` in `src/commands.js` (name, args, group, summary, options, examples,
   `run`); add any new option to `OPTIONS` in `src/cli.js`.
3. Test it in `test/cli.test.js` against `fakeApi` (no network), including `--json` and an error.
4. Update `README.md` and `CHANGELOG.md`. The site's `/cli` page lists the commands too.

## The MCP server's public home

The server runs remotely (private monorepo); this repo represents it everywhere a listing wants a
repository: `server.json` is the MCP Registry entry (`io.makerradar/mcp` — both remotes, plus this
package as the stdio option, `makerradar mcp serve`), `glama.json` names the maintainers, and
`package.json`'s `mcpName` must equal `server.json`'s `name` (the registry checks the published
package for it). The repo is also an Agent Plugin (agent-plugins.org): `plugin.json`, `mcp.json` (both remotes,
`streamable-http`) and `skills/` — a change to a server URL or a tool's role goes
in all of them. `skills/makerradar/SKILL.md` is the one hand-written skill (the overview); every
other `skills/<name>/SKILL.md` and `skills/index.json` are **mirrored from the site**
(`/.well-known/agent-skills/index.json`, rendered from the product's code) by
`npm run sync:skills` — never edit them here; CI's `skills` job runs `--check` on every push and
daily and fails on drift. A skill shipped here before the site serves it is a warning, not a
failure. `.claude-plugin/plugin.json` + `.mcp.json` make the same repo a Claude Code plugin;
`npm version` keeps that manifest's version in step too. `test/server-json.test.js` holds them together; `npm version` runs
`scripts/sync-server-json.mjs` so the versions in `server.json` and `plugin.json` follow. The bridge
(`src/mcp-bridge.js`) interprets nothing: stdio in, the server's own answers out.

## Releasing

Tagging a version releases it — `.github/workflows/release.yml` publishes to npm (with provenance)
and then publishes `server.json` to the MCP Registry. It needs two repository secrets, set once:
`NPM_TOKEN` (a granular npm token that may publish `makerradar`, bypassing 2FA) and
`MCP_REGISTRY_PRIVATE_KEY` (the ed25519 private key, 64 hex characters, whose public half
makerradar.io serves at `/.well-known/mcp-registry-auth` from the product repo's
`MCP_REGISTRY_PUBLIC_KEY`). Both keys live in the owner's password manager; never in a file here.

```bash
npm test && MAKERRADAR_CONTRACT=1 npm run test:contract
npm version <patch|minor|major>   # bumps package.json + server.json, commits, tags
git push --follow-tags            # the tag starts the release workflow
```

Or through a pull request: bump `version` in `package.json`, run `npm run sync:server-json`, and
turn the CHANGELOG's `## Unreleased` into the new version; once it's merged, from an up-to-date `main`:
`git tag vX.Y.Z && git push origin vX.Y.Z`. Don't also run `npm version` then: it would bump a second
time.

By hand, without the workflow: `npm publish` (add `--otp=<code>` for 2FA), then from this directory
`mcp-publisher login http --domain makerradar.io --private-key <hex>` and `mcp-publisher publish`
(`go install github.com/modelcontextprotocol/registry/cmd/publisher@latest` installs it). The
registry validates the npm package's `mcpName`, so npm always comes first. A change to `server.json`
that isn't a release (a new remote, description or icon) is published by running the workflow by
hand (Actions › Release › Run workflow), which skips npm.
