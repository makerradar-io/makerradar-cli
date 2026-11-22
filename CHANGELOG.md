# Changelog

## Unreleased

- `makerradar run <tool> [field=value …]`: the generators and calculators (`POST /v1/tools/{tool}`,
  the tools `makerradar tools` marks `makerradar run`): UTM links, meta tags, schema markup,
  hreflang, Open Graph image, favicon, slugs, word counts, keyword density, headlines, security.txt,
  the launch timeline, the quietest launch weeks and the founder calculators. Fields as
  `name=value` (a name given twice is a list; `true` / `false` are switches) or the body as JSON
  with `--data` (JSON, `@file`, `-`). What the tool built goes to stdout, its labels and remarks to
  stderr. A bad slug, field or `--data` is exit 2 without a call. Release it once the API serves
  those tools.
- `makerradar check` prints a report's table (the headings a page has, each link's rel, each
  response header), so the new page audits read whole in a terminal.
- `makerradar perks`: what this week's launches can win — each place's rewards and the partner perks
  booked into it (a partner's offer labelled as its own words, unverified), and who's booked next.
  Calls `getPerks` (`GET /v1/perks`); release it once the API serves that operation, since the
  contract test checks the live document.
- A token with spaces, line breaks or other characters a token never has (from `--token`,
  `MAKERRADAR_TOKEN` or the saved config) is refused up front (exit 2), naming where it came from but
  never echoing it; a network error never quotes the token either, in the CLI or `mcp serve`.
- `makerradar mcp stdio` no longer prints a placeholder `MAKERRADAR_TOKEN`: left as is, it overrode
  the token `login` saved and broke every account call.
- With `--json`, a usage mistake is JSON on stderr too (`{"error":"usage","status":null,…}`).
  `api --data @file` that can't be read is a usage mistake (exit 2), not a stack trace; a declined or
  expired `login` is the API saying no (exit 1), not a usage mistake.
- Every value the API sends is printed through `clean()`, cursors, counts and unknown check statuses
  included, and `mcp serve` strips control characters from the server's messages it logs.
- Release workflow: actions pinned to commit SHAs, `mcp-publisher` pinned to a release (never
  `@latest`), and `id-token: write` only on the npm job.

- `makerradar robots`: robots.txt rules for AI crawlers from the site's AI crawler robots.txt
  generator (`POST /v1/tools/ai-robots-txt-generator`): a preset (`allow-all`, `block-training`,
  `block-all`), per-crawler `--block` / `--allow`, `--disallow` paths, `--sitemap` and Content
  Signals (`--signals`). Only the file goes to stdout, so `> robots.txt` saves it; what it blocks
  and any input it ignored go to stderr. A wrong preset or signal is exit 2 without a call.
- `makerradar check` also runs the new `redirect-checker` and `serp-preview` tools, and points to
  `makerradar robots` for the generator. `makerradar tools` says which command runs each tool.

- `makerradar check <url> [--tool <slug>]`: run any of the site's free tools (`POST /v1/tools/{tool}`)
  — on-page SEO by default — and print each check as GOOD / IMPROVE / FIX with its fix, then
  whether the site is listed (and its claim link). `makerradar tools` lists them;
  `makerradar keywords <words>` runs the keyword generator. `--json` prints the API's answer.
- `skills/`: `check-a-site` and `find-products` mirror the site's current text (every free tool).

- `skills/`: one folder per skill the site serves (`find-products`, `list-a-product`,
  `connect-account`, `check-a-site`), mirrored from `/.well-known/agent-skills/index.json` by
  `npm run sync:skills` (digests verified; `--check` in CI fails on drift). `skills/makerradar` stays
  the hand-written overview and now covers the free site checks (`check_*` MCP tools,
  `POST /v1/tools/{tool}`).
- `.claude-plugin/plugin.json` + `.mcp.json`: the repo installs as a Claude Code plugin too.

- The repository is an Agent Plugin (agent-plugins.org 1.0.0): `plugin.json`, `mcp.json` naming
  both servers, and `skills/makerradar/SKILL.md`, so plugin clients and the Cursor directory can
  install it from the repo. `npm version` keeps `plugin.json`'s version in step.

## 0.2.0

The repository becomes the public home of MakerRadar's MCP server.

- `makerradar mcp serve [--account]`: the MCP server over stdio — a bridge that relays each
  JSON-RPC message to the remote server (`/mcp`, or `/mcp/account` with your token) and prints every
  answer, for clients that can only start a local command and for catalogs that list installable
  servers. `makerradar mcp stdio` prints its config.
- `server.json`: the MCP Registry entry (`io.makerradar/mcp`) — both remotes and this package as the
  stdio option; `npm version` keeps the package version in it in step (`npm run sync:server-json`).
- `glama.json` (maintainers) and `mcpName` in `package.json` (how the registry checks the package
  is ours); `mcp-server` / `model-context-protocol` npm keywords; badges in the README.
- A release workflow: a `vX.Y.Z` tag publishes to npm with provenance, then publishes `server.json`
  to the MCP Registry (secrets `NPM_TOKEN`, `MCP_REGISTRY_PRIVATE_KEY`).

## 0.1.1

Security and reliability fixes.

- `MAKERRADAR_TOKEN` is sent only to the API the environment names (`MAKERRADAR_API_URL`, or
  production): an `--api-url` pointing elsewhere no longer receives it. `--token` is unchanged.
- A token is never sent over plain http, except to localhost; `login` refuses a plain-http API.
- An empty or blank `MAKERRADAR_*` variable (and `XDG_CONFIG_HOME` / `APPDATA`) counts as unset.
- `login` keeps waiting through a busy API (5xx, 429) or a dropped connection, backing off, until
  the code expires; its first step retries a busy API three times.
- A request that stalls mid-answer is reported as unreachable (exit 1) instead of crashing; the
  30-second timeout covers the whole answer.
- The config file is written atomically (a new 0600 file renamed over the old), so a crash or a
  full disk never leaves it half-written.

## 0.1.0

First release.

- Directory: `search`, `product`, `alternatives`, `categories`, `launches`, `pricing`, `draft`.
- Account: `login` (device flow, scoped agent token), `whoami`, `listings`, `logout`.
- Agents and developers: `mcp` (setup for Claude Code, Claude Desktop, Cursor, VS Code, Windsurf),
  `api` (any public endpoint), `--json` everywhere, stable exit codes.
