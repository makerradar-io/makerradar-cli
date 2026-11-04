# Changelog

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
