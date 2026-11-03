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
- **The token is never printed** and lives only in the config file (0600) or `MAKERRADAR_TOKEN`.
  The CLI never asks for a password and never pays: checkouts hand the person a payment page.
- Paid placements are disclosed (`tierLabel`: "Featured · paid"). Maker descriptions are labelled
  "written by the maker, unverified".

## Adding a command

1. Add its operation(s) to `OPERATIONS` (exact `operationId`, method, path from the OpenAPI doc).
2. Add an entry to `COMMANDS` in `src/commands.js` (name, args, group, summary, options, examples,
   `run`); add any new option to `OPTIONS` in `src/cli.js`.
3. Test it in `test/cli.test.js` against `fakeApi` (no network), including `--json` and an error.
4. Update `README.md` and `CHANGELOG.md`. The site's `/cli` page lists the commands too.

## Releasing

```bash
npm test && MAKERRADAR_CONTRACT=1 npm run test:contract
npm version <patch|minor|major>   # bumps package.json, commits, tags
npm publish                       # as the makerradar npm org
git push --follow-tags
```
