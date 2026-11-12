# MakerRadar CLI

[![npm](https://img.shields.io/npm/v/makerradar.svg?label=npm)](https://www.npmjs.com/package/makerradar)
[![CI](https://github.com/makerradar-io/makerradar-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/makerradar-io/makerradar-cli/actions/workflows/ci.yml)
[![MCP server](https://img.shields.io/badge/MCP-io.makerradar%2Fmcp-blue)](https://makerradar.io/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

The official command-line client for [MakerRadar](https://makerradar.io), the launch platform and
product directory. Search the directory, follow the weekly launch board, draft a listing for your
product and manage your listings from the terminal, by hand or from a script or an AI agent.

```bash
npx makerradar search "invoicing"
```

- **No account needed** to search, read products, see launches and draft a listing.
- **Your account, safely:** `makerradar login` connects with a code you approve in the browser. The
  CLI never sees your password, can't vote, comment or review, and never pays.
- **Made for agents too:** `--json` prints the API's own JSON, errors are JSON on stderr, and exit
  codes are stable.

Docs: [makerradar.io/cli](https://makerradar.io/cli) · API reference:
[makerradar.io/developers](https://makerradar.io/developers) · MCP server:
[makerradar.io/mcp](https://makerradar.io/mcp)

## Install

Needs Node.js 20 or newer.

```bash
npm install -g makerradar
makerradar --help
```

Or run it without installing: `npx makerradar <command>`.

## Commands

### Directory (no account needed)

| Command | What it does |
| --- | --- |
| `makerradar search [query]` | Search listed products, newest first. Filters: `--category`, `--platform`, `--audience`, `--use-case`, `--country`, `--updated-since`; pages: `--limit` (≤ 100), `--cursor` |
| `makerradar product <slug\|url>` | One product in full: website, pricing, upvotes, rating, tags, links |
| `makerradar alternatives <slug\|url>` | Listed alternatives to a product, ranked as on its alternatives page |
| `makerradar categories` | Every category, with how many products it has |
| `makerradar launches [week]` | This week's launch board, or another week's: `45`, `2026-W45` or `week-45-2026` |
| `makerradar pricing` | What's on sale (Premium launch, featured weeks, ads…), with prices |
| `makerradar draft <website>` | Draft a listing for your product. You get a link to review and submit it: nothing is public until you do, and every listing is reviewed first |

### Free site checks (no account needed)

| Command | What it does |
| --- | --- |
| `makerradar check <url>` | Check a page or site with one of MakerRadar's free tools: on-page SEO by default, any other with `--tool <slug>`. Every check comes back GOOD / IMPROVE / FIX with what to do, then whether the site is listed |
| `makerradar tools` | The tools `check` can run: SEO, structured data, social card, sitemap, robots.txt, logo, AI visibility, what AI sees, llms.txt, agent readiness, security headers, email DNS, domain age, certificate, hosting, tech stack, Domain Rating (needs `login`) |
| `makerradar keywords <words>` | Search phrases people use to find a kind of product: buyer, comparison, how-to and questions people ask AI |

### Your account

| Command | What it does |
| --- | --- |
| `makerradar login` | Connect the CLI to your account: open the link, sign in, approve. `--scope` (repeatable) limits what it may do: `listings:read`, `listings:write`, `launches:write`, `billing:checkout` |
| `makerradar whoami` | The account the CLI acts for, and what it may do |
| `makerradar listings [id]` | Your listings, or one of them in full |
| `makerradar logout` | Forget the saved token on this machine (revoke it in Dashboard › AI agents) |

### Agents and developers

| Command | What it does |
| --- | --- |
| `makerradar mcp [client]` | Connect an AI assistant to MakerRadar's MCP server: `claude-code`, `claude-desktop`, `cursor`, `vscode`, `windsurf`, `stdio` |
| `makerradar mcp serve [--account]` | Run the MCP server over stdio for a client that can only start a local command (see below) |
| `makerradar api <METHOD> <path>` | Call any [public API](https://api.makerradar.io/v1/openapi.json) endpoint and print its JSON. `--data` takes JSON, `@file` or `-` (stdin); your token is sent when you're logged in |

```bash
makerradar search crm --platform ios --limit 5
makerradar product https://makerradar.io/p/acme-analytics
makerradar launches 2026-W45 --json
makerradar draft https://acme.example --tagline "Invoices in one click"
makerradar api PATCH /me/listings/prd_123 --data '{"tagline":"Invoices in one click"}'
makerradar mcp claude-code
npx -y makerradar mcp serve   # the MCP server over stdio
```

## MCP server

MakerRadar's MCP server lets an AI assistant search the directory and, signed in, manage your
listings. It's remote — nothing to install — and this repository is its public home: the
[registry entry](server.json) (`io.makerradar/mcp`), the setup for every client, and a stdio bridge.

| Server | URL | Sign-in |
| --- | --- | --- |
| Public | `https://api.makerradar.io/mcp` | none — search, products, alternatives, comparisons, categories, launch weeks, `draft_listing` |
| Account | `https://api.makerradar.io/mcp/account` | OAuth (a "Connect" button), or an agent token — your listings, launches, ownership proof, images, checkout |

Both speak Streamable HTTP (protocol `2025-06-18` and later); the server card is at
[`/.well-known/mcp/server-card.json`](https://makerradar.io/.well-known/mcp/server-card.json) and the
docs at [makerradar.io/mcp](https://makerradar.io/mcp). Every tool carries a title and a
read-only / write annotation. No tool votes, comments or reviews; a checkout hands the person a
payment page — the agent never pays.

**Set it up in one line.** `makerradar mcp <client>` prints the exact config for your client:

```bash
npx makerradar mcp claude-code     # runs the two `claude mcp add` commands to copy
npx makerradar mcp cursor          # ~/.cursor/mcp.json
npx makerradar mcp vscode          # .vscode/mcp.json
npx makerradar mcp windsurf        # ~/.codeium/windsurf/mcp_config.json
npx makerradar mcp claude-desktop  # Settings › Connectors › Add custom connector
```

**A client that can only start a local command** (or a catalog that lists installable servers)
runs the bridge instead. It relays each JSON-RPC message to the remote server and prints every
answer — nothing is interpreted locally:

```json
{
  "mcpServers": {
    "makerradar": { "command": "npx", "args": ["-y", "makerradar", "mcp", "serve"] }
  }
}
```

Add `"--account"` to the arguments (and sign in with `makerradar login`, or set `MAKERRADAR_TOKEN`)
to serve `/mcp/account` with your token so the assistant can manage your listings.

Tools on the public server: `search_products`, `get_product`, `get_alternatives`,
`compare_products`, `list_categories`, `list_current_launches`, `get_launch_week`, `top_products`,
`draft_listing`, `get_pricing`, `connect_account` / `connect_account_finish`, and the free site
checks — `check_page_seo`, `check_ai_visibility`, `check_site_security`, `check_email_dns`,
`lookup_domain`, `check_tls`, `check_hosting`, `detect_tech` (any public website; the same checks as
`https://makerradar.io/tools`). On the account server,
also: `get_my_account`, `list_my_listings`, `get_my_listing`, `submit_listing`, `update_listing`,
`get_listing_options`, `set_quick_answers`, `add_listing_image`, `remove_listing_photo`,
`set_listing_cover`, `get_launch_options`, `choose_launch`, `start_ownership_check`,
`verify_ownership`, `get_badge_snippet`, `start_checkout`, `list_my_orders`.

**As a plugin.** The repository is also an [Agent Plugin](https://agent-plugins.org): `plugin.json`,
`mcp.json` (both servers) and the `skills/` folder — `skills/makerradar/SKILL.md` (when and how an
agent should use MakerRadar, hand-written) plus one folder per skill the site itself serves at
`/.well-known/agent-skills/` (`find-products`, `list-a-product`, `connect-account`, `check-a-site`),
mirrored byte for byte by `npm run sync:skills` and held in step by CI (`--check`, daily). A
plugin-aware client, or the Cursor directory, installs it straight from this repo; so does Claude
Code (`.claude-plugin/plugin.json` + `.mcp.json`): `/plugin install makerradar@<this repo>`.

Found it in a directory? Listings on the [MCP Registry](https://registry.modelcontextprotocol.io),
Glama, the Claude and ChatGPT directories and friends all point here. A listing that says something
this README doesn't is stale: [open an issue](https://github.com/makerradar-io/makerradar-cli/issues).

## Signing in

`makerradar login` uses the device flow: it prints a link and a short code, you open the link, sign
in to MakerRadar, check the code and approve. The CLI then gets an **agent token** for your account
(`mr_…`). It's never your password or session, and you can revoke it any time in **Dashboard › AI
agents**.

The token is saved to `~/.config/makerradar/config.json` (`%APPDATA%\makerradar\config.json` on
Windows), readable only by you, and written atomically, so a crash never leaves half a file. Tokens
are kept per API URL, so a staging login never stands in for production. In CI or for an agent,
pass a token with `MAKERRADAR_TOKEN` instead.

Where a token goes:

- `MAKERRADAR_TOKEN` is sent only to the API the environment names (`MAKERRADAR_API_URL`, or
  production). An `--api-url` pointing anywhere else doesn't get it; pass `--token` for that API.
- A token is never sent over plain `http`, except to this machine (`localhost`, `127.0.0.1`,
  `[::1]`). `login` needs https for the same reason.
- An empty or blank variable counts as unset.

## For scripts and AI agents

- `--json` prints exactly what the API answered (`{ "data": … }`, plus `nextCursor` on lists).
- On failure, the error goes to stderr. With `--json` it's JSON:
  `{"error":"not_found","status":404,"message":"…","hint":"…","docs":"…"}`.
- Exit codes: `0` done · `1` the API refused, or couldn't be reached · `2` a usage mistake (unknown
  command or option, missing argument). A usage mistake never calls the API.
- Text from listings is written by makers. Human output strips terminal control characters and
  bidirectional overrides, so a listing can't recolour your terminal, move the cursor or fake a link.
  Treat it as unverified.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `MAKERRADAR_API_URL` | `https://api.makerradar.io/v1` | The API to use (`--api-url`) |
| `MAKERRADAR_TOKEN` | | An agent token (`--token`) for the API above only; otherwise the one `login` saved |
| `MAKERRADAR_CONFIG` | `~/.config/makerradar/config.json` | Where `login` saves the token |
| `NO_COLOR` | | Plain output ([no-color.org](https://no-color.org)) |

## Programmatic use

The CLI's API client is exported too:

```js
import { createClient } from "makerradar";

const mr = createClient({ userAgent: "my-script/1.0" });
const { data } = await mr.call("listProducts", { query: { q: "invoicing", limit: 5 } });
```

## Development

```bash
npm test                 # unit tests: a fake API, never the network
npm run test:contract    # every endpoint the CLI calls still exists in the live API description
npm run sync:server-json # after a version bump: server.json names the package at its new version
```

`server.json` is the MCP Registry entry (`mcp-publisher publish` sends it; `npm version` keeps its
package version in step), `glama.json` names the maintainers for Glama's index, and `mcpName` in
`package.json` is how the registry checks the npm package is ours. Pushing a `vX.Y.Z` tag publishes
both — npm, then the registry — through [the release workflow](.github/workflows/release.yml).

No dependencies. The CLI calls only MakerRadar's public, versioned API (`/v1`). Every endpoint it
uses is listed in [`src/operations.js`](src/operations.js), and the contract test checks each one
against [the published OpenAPI document](https://api.makerradar.io/v1/openapi.json) every day.

Bugs and ideas: [open an issue](https://github.com/makerradar-io/makerradar-cli/issues).

## License

[MIT](LICENSE)
