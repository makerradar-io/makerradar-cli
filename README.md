# MakerRadar CLI

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
| `makerradar mcp [client]` | Connect an AI assistant to MakerRadar's MCP server: `claude-code`, `claude-desktop`, `cursor`, `vscode`, `windsurf` |
| `makerradar api <METHOD> <path>` | Call any [public API](https://api.makerradar.io/v1/openapi.json) endpoint and print its JSON. `--data` takes JSON, `@file` or `-` (stdin); your token is sent when you're logged in |

```bash
makerradar search crm --platform ios --limit 5
makerradar product https://makerradar.io/p/acme-analytics
makerradar launches 2026-W45 --json
makerradar draft https://acme.example --tagline "Invoices in one click"
makerradar api PATCH /me/listings/prd_123 --data '{"tagline":"Invoices in one click"}'
makerradar mcp claude-code
```

## Signing in

`makerradar login` uses the device flow: it prints a link and a short code, you open the link, sign
in to MakerRadar, check the code and approve. The CLI then gets an **agent token** for your account
(`mr_…`). It's never your password or session, and you can revoke it any time in **Dashboard › AI
agents**.

The token is saved to `~/.config/makerradar/config.json` (`%APPDATA%\makerradar\config.json` on
Windows), readable only by you. Tokens are kept per API URL, so a staging login never stands in
for production. In CI or for an agent, pass a token with `MAKERRADAR_TOKEN` instead.

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
| `MAKERRADAR_TOKEN` | | An agent token (`--token`); otherwise the one `login` saved |
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
```

No dependencies. The CLI calls only MakerRadar's public, versioned API (`/v1`). Every endpoint it
uses is listed in [`src/operations.js`](src/operations.js), and the contract test checks each one
against [the published OpenAPI document](https://api.makerradar.io/v1/openapi.json) every day.

Bugs and ideas: [open an issue](https://github.com/makerradar-io/makerradar-cli/issues).

## License

[MIT](LICENSE)
