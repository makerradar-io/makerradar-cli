// @ts-check
import { ApiError } from "./api.js";
import { forgetToken, saveToken, savedToken } from "./config.js";
import { clean, pricingLabel, table, tierLabel, truncate } from "./format.js";
import { SCOPES } from "./operations.js";

/** A mistake in how the command was called (exit code 2). */
export class UsageError extends Error {
  constructor(/** @type {string} */ message, /** @type {string | undefined} */ command) {
    super(message);
    this.name = "UsageError";
    this.command = command;
  }
}

/**
 * @typedef {object} Context
 * @property {import("./api.js").Client} client
 * @property {(line?: string) => void} out stdout
 * @property {(line?: string) => void} err stderr (instructions, progress)
 * @property {import("./format.js").Styles} s
 * @property {boolean} json
 * @property {string} configFile
 * @property {"flag" | "env" | "saved" | null} tokenSource
 * @property {(ms: number) => Promise<void>} sleep
 * @property {() => Date} now
 * @property {() => Promise<string>} readStdin
 * @property {(path: string) => Promise<string>} readFile
 * @property {(token: string) => import("./api.js").Client} withToken A client for a new token.
 */

/**
 * @typedef {object} Command
 * @property {string} name
 * @property {string} args
 * @property {string} summary
 * @property {string} group
 * @property {string[]} [options] Command options it takes (beyond the global ones).
 * @property {string[]} [examples]
 * @property {string} [details]
 * @property {(ctx: Context, args: string[], flags: Record<string, any>) => Promise<void>} run
 */

/** Print `body` as JSON (agents read this). */
function printJson(/** @type {Context} */ ctx, /** @type {unknown} */ body) {
  ctx.out(JSON.stringify(body, null, 2));
}

/** A product slug from a slug or a product page URL (`https://makerradar.io/p/<slug>`). */
export function slugFrom(/** @type {string | undefined} */ input) {
  const value = (input ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parts = new URL(value).pathname.split("/").filter(Boolean);
      const at = parts.indexOf("p");
      return at >= 0 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : null;
    } catch {
      return null;
    }
  }
  return /^[a-z0-9][a-z0-9-]*$/i.test(value) ? value.toLowerCase() : null;
}

/** The ISO week-numbering year of a date (the year its week's Thursday falls in). */
export function isoWeekYear(/** @type {Date} */ date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

/** A launch week as the API names it (`week-45-2026`) from `45`, `W45`, `2026-W45` or the slug. */
export function weekSlug(/** @type {string} */ input, /** @type {Date} */ now) {
  const s = input.trim().toLowerCase();
  let m = /^week-(\d{1,2})-(\d{4})$/.exec(s);
  if (m) return `week-${Number(m[1])}-${m[2]}`;
  m = /^(\d{4})-?w(\d{1,2})$/.exec(s);
  if (m) return `week-${Number(m[2])}-${m[1]}`;
  m = /^w?(\d{1,2})$/.exec(s);
  if (m) return `week-${Number(m[1])}-${isoWeekYear(now)}`;
  return null;
}

/** Ask for a token, or say how to get one. */
function requireToken(/** @type {Context} */ ctx, /** @type {string} */ name) {
  if (!ctx.tokenSource) {
    throw new UsageError(
      `${name} acts for your account: run \`makerradar login\` first (or pass --token / set MAKERRADAR_TOKEN).`,
      name,
    );
  }
}

function productLines(
  /** @type {Context} */ ctx,
  /** @type {any} */ p,
  /** @type {number | null} */ rank,
) {
  const { s } = ctx;
  const head = rank === null ? "" : `${String(rank).padStart(2)}. `;
  const meta = [`▲ ${p.totalUpvotes ?? p.upvoteCount ?? 0}`, pricingLabel(p.pricingModel)];
  ctx.out(`${head}${s.bold(clean(p.name))}  ${s.dim(meta.filter(Boolean).join(" · "))}`);
  const pad = " ".repeat(head.length);
  if (p.tagline) ctx.out(`${pad}${clean(p.tagline)}`);
  if (p.bestFor) ctx.out(`${pad}${s.dim(`Best for: ${clean(p.bestFor)}`)}`);
  ctx.out(`${pad}${s.cyan(clean(p.url))}`);
}

/** @type {Command[]} */
export const COMMANDS = [
  {
    name: "search",
    args: "[query]",
    group: "Directory (no account needed)",
    summary: "Search listed products (newest first)",
    options: ["limit", "cursor", "category", "platform", "audience", "use-case", "country", "updated-since"],
    examples: [
      'makerradar search "invoicing"',
      "makerradar search --category analytics --limit 10",
      "makerradar search crm --platform ios --json",
    ],
    details:
      "Keywords match a product's name or tagline. Filters combine: --category (a slug from `makerradar categories`), --platform, --audience, --use-case, --country (two-letter code or name) and --updated-since (an ISO time). Pages of up to 100 (--limit); pass the printed --cursor for the next.",
    async run(ctx, args, flags) {
      const q = args.join(" ").trim();
      const body = await ctx.client.call("listProducts", {
        query: {
          q: q || undefined,
          limit: flags.limit,
          cursor: flags.cursor,
          category: flags.category,
          platform: flags.platform,
          audience: flags.audience,
          useCase: flags["use-case"],
          country: flags.country,
          updatedSince: flags["updated-since"],
        },
      });
      if (ctx.json) return printJson(ctx, body);
      const items = body.data ?? [];
      if (items.length === 0) {
        ctx.out(q ? `Nothing listed matches "${clean(q)}".` : "Nothing listed matches.");
        return;
      }
      items.forEach((p, i) => {
        if (i > 0) ctx.out();
        productLines(ctx, p, null);
      });
      if (body.nextCursor) {
        ctx.out();
        ctx.out(ctx.s.dim(`More: add --cursor ${body.nextCursor}`));
      }
    },
  },
  {
    name: "product",
    args: "<slug|url>",
    group: "Directory (no account needed)",
    summary: "One product in full",
    examples: ["makerradar product acme-analytics", "makerradar product https://makerradar.io/p/acme-analytics --json"],
    async run(ctx, args) {
      const slug = slugFrom(args[0]);
      if (!slug) throw new UsageError("Name a product: its slug (acme-analytics) or page URL.", "product");
      const body = await ctx.client.call("getProduct", { params: { slug } });
      if (ctx.json) return printJson(ctx, body);
      const p = body.data;
      const { s } = ctx;
      ctx.out(`${s.bold(clean(p.name))} — ${clean(p.tagline)}`);
      ctx.out();
      const rating =
        p.ratingCount > 0
          ? `${(p.ratingSum / p.ratingCount).toFixed(1)} from ${p.ratingCount} review${p.ratingCount === 1 ? "" : "s"}`
          : "no reviews yet";
      /** @type {string[][]} */
      const rows = [
        ["Website", clean(p.websiteUrl ?? `${p.domain} (link withheld while it's checked)`)],
        ["Pricing", pricingLabel(p.pricingModel)],
        ["Upvotes", String(p.totalUpvotes)],
        ["Rating", rating],
        ["Owner", p.claimed ? "claimed by its maker" : "not claimed yet"],
      ];
      if (p.tags?.length) rows.push(["Tags", p.tags.map((/** @type {any} */ t) => clean(t.name)).join(", ")]);
      for (const link of p.links ?? []) rows.push([clean(link.kind), clean(link.url)]);
      rows.push(["Page", clean(p.url)]);
      ctx.out(table(rows.map(([k, v]) => [`  ${s.dim(k)}`, v])));
      const description = clean(p.descriptionMd, { multiline: true }).trim();
      if (description) {
        ctx.out();
        ctx.out(s.dim("About (written by the maker, unverified):"));
        ctx.out(truncate(description, 1200));
      }
    },
  },
  {
    name: "alternatives",
    args: "<slug|url>",
    group: "Directory (no account needed)",
    summary: "Listed alternatives to a product",
    options: ["limit"],
    examples: ["makerradar alternatives acme-analytics --limit 5"],
    async run(ctx, args, flags) {
      const slug = slugFrom(args[0]);
      if (!slug) throw new UsageError("Name a product: its slug or page URL.", "alternatives");
      const body = await ctx.client.call("listProductAlternatives", {
        params: { slug },
        query: { limit: flags.limit },
      });
      if (ctx.json) return printJson(ctx, body);
      const items = body.data ?? [];
      if (items.length === 0) return ctx.out("No alternatives listed yet.");
      items.forEach((p, i) => {
        if (i > 0) ctx.out();
        productLines(ctx, p, i + 1);
      });
    },
  },
  {
    name: "categories",
    args: "",
    group: "Directory (no account needed)",
    summary: "Every category, with how many products it has",
    examples: ["makerradar categories"],
    async run(ctx) {
      const body = await ctx.client.call("listCategories");
      if (ctx.json) return printJson(ctx, body);
      const rows = (body.data ?? []).map((/** @type {any} */ c) => [
        clean(c.name),
        ctx.s.dim(clean(c.slug)),
        String(c.productCount),
      ]);
      ctx.out(table([[ctx.s.bold("Category"), ctx.s.bold("Slug"), ctx.s.bold("Products")], ...rows]));
    },
  },
  {
    name: "launches",
    args: "[week]",
    group: "Directory (no account needed)",
    summary: "This week's launch board, or another week's",
    examples: ["makerradar launches", "makerradar launches 45", "makerradar launches 2026-W41 --json"],
    details: "A week is its number this year (45), an ISO week (2026-W45) or the site's slug (week-45-2026).",
    async run(ctx, args) {
      let body;
      if (args[0]) {
        const week = weekSlug(args[0], ctx.now());
        if (!week) throw new UsageError(`"${args[0]}" isn't a week: try 45, 2026-W45 or week-45-2026.`, "launches");
        body = await ctx.client.call("getLaunchWeek", { params: { week } });
      } else {
        body = await ctx.client.call("listCurrentLaunches");
      }
      if (ctx.json) return printJson(ctx, body);
      const board = body.data;
      const title = board.label ? `${clean(board.label)} (${clean(board.status)})` : `This week (${clean(board.week)})`;
      ctx.out(ctx.s.bold(title));
      const launches = board.launches ?? [];
      if (launches.length === 0) return ctx.out("No launches yet.");
      launches.forEach((/** @type {any} */ l, /** @type {number} */ i) => {
        ctx.out();
        const tier = tierLabel(l.tier);
        const meta = [`▲ ${l.upvoteCount}`, `${l.commentCount} comment${l.commentCount === 1 ? "" : "s"}`, tier]
          .filter(Boolean)
          .join(" · ");
        ctx.out(`${String(i + 1).padStart(2)}. ${ctx.s.bold(clean(l.name))}  ${ctx.s.dim(meta)}`);
        if (l.tagline) ctx.out(`    ${clean(l.tagline)}`);
        ctx.out(`    ${ctx.s.cyan(clean(l.url))}`);
      });
    },
  },
  {
    name: "pricing",
    args: "",
    group: "Directory (no account needed)",
    summary: "What's on sale (Premium launches, featured weeks, ads…), with prices",
    examples: ["makerradar pricing"],
    async run(ctx) {
      const body = await ctx.client.call("getPricing");
      if (ctx.json) return printJson(ctx, body);
      const items = body.data?.items ?? [];
      ctx.out(
        table([
          [ctx.s.bold("Item"), ctx.s.bold("Price"), ctx.s.bold("Id")],
          ...items.map((/** @type {any} */ item) => [
            clean(item.name),
            `${clean(item.price)}${item.byWeek ? " / week" : item.renews ? ` / ${clean(item.renews)}` : ""}`,
            ctx.s.dim(clean(item.id)),
          ]),
        ]),
      );
      if (body.data?.note) {
        ctx.out();
        ctx.out(ctx.s.dim(clean(body.data.note)));
      }
    },
  },
  {
    name: "draft",
    args: "<website>",
    group: "Directory (no account needed)",
    summary: "Draft a listing for your product, then review and submit it on the site",
    options: ["name", "tagline", "description"],
    examples: [
      "makerradar draft https://acme.example",
      'makerradar draft https://acme.example --name Acme --tagline "Invoices in one click"',
    ],
    details:
      "Nothing is published: you get a link (valid 7 days) to open, sign in, check the listing and submit it, and every listing is reviewed before it goes live. If the site is already listed you get its page instead.",
    async run(ctx, args, flags) {
      const url = (args[0] ?? "").trim();
      if (!/^https?:\/\//i.test(url)) throw new UsageError("Give your product's website, e.g. https://acme.example.", "draft");
      const body = await ctx.client.call("createDraft", {
        body: { url, name: flags.name, tagline: flags.tagline, description: flags.description },
      });
      if (ctx.json) return printJson(ctx, body);
      const d = body.data;
      // The API words its message for an agent relaying it; here the person reads it themselves.
      ctx.out(
        d.status === "drafted"
          ? "Drafted. Open the link, sign in, check the listing and submit it — nothing is public until you do, and it's reviewed first."
          : d.status === "listed"
            ? "That site is already listed."
            : clean(d.message),
      );
      if (d.reviewUrl) ctx.out(`\n  ${ctx.s.bold("Review and submit:")} ${ctx.s.cyan(clean(d.reviewUrl))}`);
      if (d.productUrl) ctx.out(`\n  ${ctx.s.bold("Its page:")} ${ctx.s.cyan(clean(d.productUrl))}`);
      if (d.expiresAt) ctx.out(ctx.s.dim(`  The link works until ${clean(d.expiresAt)}.`));
    },
  },
  {
    name: "login",
    args: "",
    group: "Your account",
    summary: "Connect the CLI to your MakerRadar account (you approve it in the browser)",
    options: ["client", "scope"],
    examples: ["makerradar login", "makerradar login --scope listings:read"],
    details: `You open a link, sign in and approve. The CLI gets an agent token for your account — never your password or session — saved for your eyes only. It can't vote, comment or review, and it never pays: a checkout hands you the payment page. Limit what it may do with --scope (repeatable: ${SCOPES.join(", ")}); revoke it any time in Dashboard › AI agents.`,
    async run(ctx, _args, flags) {
      const scopes = /** @type {string[] | undefined} */ (flags.scope);
      for (const scope of scopes ?? []) {
        if (!SCOPES.includes(/** @type {any} */ (scope))) {
          throw new UsageError(`Unknown scope "${scope}": one of ${SCOPES.join(", ")}.`, "login");
        }
      }
      const started = (
        await ctx.client.call("startAgentConnect", {
          body: { client: flags.client || "MakerRadar CLI", ...(scopes?.length ? { scopes } : {}) },
        })
      ).data;
      const { s } = ctx;
      ctx.err(`Open this page, sign in and approve ${clean(flags.client || "MakerRadar CLI")}:`);
      ctx.err(`  ${s.cyan(clean(started.verificationUriComplete))}`);
      ctx.err(`It shows the code ${s.bold(clean(started.userCode))} — check it matches.`);
      ctx.err(s.dim("Waiting for you to approve… (Ctrl-C to stop)"));
      let interval = Math.max(1, Number(started.interval) || 5);
      const deadline = ctx.now().getTime() + (Number(started.expiresIn) || 900) * 1000;
      for (;;) {
        await ctx.sleep(interval * 1000);
        if (ctx.now().getTime() > deadline) throw new UsageError("The code expired: run `makerradar login` again.", "login");
        let answer;
        try {
          answer = (await ctx.client.call("finishAgentConnect", { body: { deviceCode: started.deviceCode } })).data;
        } catch (err) {
          if (err instanceof ApiError && err.code === "rate_limited") {
            interval = Math.max(interval + 5, err.retryAfter ?? 0);
            continue;
          }
          throw err;
        }
        if (answer.status === "pending") continue;
        if (answer.status !== "approved" || !answer.token) {
          throw new UsageError(
            answer.status === "denied" ? "You declined the connection: nothing was saved." : clean(answer.message),
            "login",
          );
        }
        let handle = null;
        let dashboardUrl = null;
        try {
          const me = (await ctx.withToken(answer.token).call("getMe")).data;
          handle = me.handle ?? null;
          dashboardUrl = me.dashboardUrl ?? null;
        } catch {
          // The token works or it doesn't; whoami will say. Save it either way.
        }
        await saveToken(ctx.configFile, ctx.client.apiUrl, {
          token: answer.token,
          scopes: answer.scopes ?? scopes ?? [],
          expiresAt: answer.expiresAt ?? null,
          handle,
          savedAt: ctx.now().toISOString(),
        });
        if (ctx.json) {
          printJson(ctx, { status: "approved", handle, scopes: answer.scopes ?? [], expiresAt: answer.expiresAt ?? null, configFile: ctx.configFile });
          return;
        }
        ctx.out(`${s.green("✓")} Connected${handle ? ` as @${clean(handle)}` : ""}.`);
        if (answer.scopes?.length) ctx.out(s.dim(`  It may: ${answer.scopes.map(clean).join(", ")}`));
        ctx.out(s.dim(`  Token saved to ${ctx.configFile} (only you can read it).`));
        if (dashboardUrl) ctx.out(s.dim(`  Revoke it any time: ${clean(dashboardUrl)}`));
        return;
      }
    },
  },
  {
    name: "whoami",
    args: "",
    group: "Your account",
    summary: "The account the CLI acts for, and what it may do",
    examples: ["makerradar whoami"],
    async run(ctx) {
      requireToken(ctx, "whoami");
      const body = await ctx.client.call("getMe");
      if (ctx.json) return printJson(ctx, body);
      const me = body.data;
      const { s } = ctx;
      ctx.out(`${s.bold(me.handle ? `@${clean(me.handle)}` : clean(me.name ?? "Your account"))}${me.name && me.handle ? ` (${clean(me.name)})` : ""}`);
      /** @type {string[][]} */
      const rows = [
        ["Can list", me.ready ? "yes" : `not yet — finish setting up: ${clean(me.finishSetupUrl ?? me.dashboardUrl)}`],
        ["Connected as", clean(me.agent?.name ?? "—")],
        ["May", (me.agent?.scopes ?? []).map(clean).join(", ") || "—"],
        ["Dashboard", clean(me.dashboardUrl)],
      ];
      ctx.out(table(rows.map(([k, v]) => [`  ${s.dim(k)}`, v])));
    },
  },
  {
    name: "listings",
    args: "[id]",
    group: "Your account",
    summary: "Your listings, or one of them in full",
    examples: ["makerradar listings", "makerradar listings prd_123 --json"],
    async run(ctx, args) {
      requireToken(ctx, "listings");
      if (args[0]) {
        const body = await ctx.client.call("getMyListing", { params: { id: args[0] } });
        if (ctx.json) return printJson(ctx, body);
        const l = body.data;
        ctx.out(`${ctx.s.bold(clean(l.name))} — ${clean(l.statusLabel)}`);
        const rows = [
          ["Id", clean(l.id)],
          ["Tagline", clean(l.tagline)],
          ["Site", clean(l.domain)],
          ["Page", clean(l.url ?? "not public yet")],
          ["Manage", clean(l.manageUrl)],
        ].filter(([, v]) => v);
        ctx.out(table(rows.map(([k, v]) => [`  ${ctx.s.dim(k)}`, v])));
        ctx.out(ctx.s.dim("  Everything else: add --json."));
        return;
      }
      const body = await ctx.client.call("listMyListings");
      if (ctx.json) return printJson(ctx, body);
      const items = body.data ?? [];
      if (items.length === 0) return ctx.out("No listings yet: `makerradar draft <your website>` starts one.");
      ctx.out(
        table([
          [ctx.s.bold("Id"), ctx.s.bold("Status"), ctx.s.bold("Name"), ctx.s.bold("Manage")],
          ...items.map((/** @type {any} */ l) => [clean(l.id), clean(l.statusLabel), clean(l.name), ctx.s.cyan(clean(l.manageUrl))]),
        ]),
      );
    },
  },
  {
    name: "logout",
    args: "",
    group: "Your account",
    summary: "Forget the saved token on this machine",
    examples: ["makerradar logout"],
    async run(ctx) {
      let dashboardUrl = null;
      if (ctx.tokenSource === "saved") {
        try {
          dashboardUrl = (await ctx.client.call("getMe")).data?.dashboardUrl ?? null;
        } catch {
          // Already revoked or offline: forgetting it still works.
        }
      }
      const forgot = await forgetToken(ctx.configFile, ctx.client.apiUrl);
      if (ctx.json) return printJson(ctx, { forgot });
      ctx.out(forgot ? "Signed out: the token is forgotten on this machine." : "No saved token to forget.");
      if (forgot) {
        ctx.out(
          ctx.s.dim(
            `It still works wherever else it's stored until you revoke it in Dashboard › AI agents${dashboardUrl ? ` (${clean(dashboardUrl)})` : ""}.`,
          ),
        );
      }
    },
  },
  {
    name: "mcp",
    args: "[client]",
    group: "Agents & developers",
    summary: "Connect an AI assistant to MakerRadar's MCP server",
    examples: ["makerradar mcp", "makerradar mcp claude-code", "makerradar mcp cursor"],
    details:
      "Clients: claude-code, claude-desktop, cursor, vscode, windsurf. The public server needs no account; the account server signs you in (OAuth) the first time your assistant uses it.",
    async run(ctx, args) {
      const origin = new URL(ctx.client.apiUrl).origin;
      const publicUrl = `${origin}/mcp`;
      const accountUrl = `${origin}/mcp/account`;
      const snippets = mcpSnippets(publicUrl, accountUrl);
      const wanted = args[0]?.toLowerCase();
      if (wanted && !(wanted in snippets)) {
        throw new UsageError(`Unknown client "${args[0]}": one of ${Object.keys(snippets).join(", ")}.`, "mcp");
      }
      if (ctx.json) return printJson(ctx, { public: publicUrl, account: accountUrl, clients: snippets });
      const { s } = ctx;
      ctx.out(`${s.bold("Public server")} (search, products, launches — no account): ${s.cyan(publicUrl)}`);
      ctx.out(`${s.bold("Account server")} (your listings; signs you in): ${s.cyan(accountUrl)}`);
      for (const [name, snippet] of Object.entries(snippets)) {
        if (wanted && name !== wanted) continue;
        ctx.out();
        ctx.out(s.bold(snippet.title));
        ctx.out(snippet.text);
      }
    },
  },
  {
    name: "api",
    args: "<METHOD> <path>",
    group: "Agents & developers",
    summary: "Call any public API endpoint (prints its JSON)",
    options: ["data"],
    examples: [
      'makerradar api GET "/products?q=notes&limit=5"',
      'makerradar api PATCH /me/listings/prd_123 --data \'{"tagline":"Invoices in one click"}\'',
      "makerradar api POST /me/listings --data @listing.json",
    ],
    details:
      "Paths are relative to the API (/v1); the reference is https://api.makerradar.io/v1/openapi.json. Your saved token is sent when there is one. --data takes JSON, @file or - (stdin).",
    async run(ctx, args, flags) {
      const method = (args[0] ?? "").toUpperCase();
      const path = args[1] ?? "";
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) || !path.startsWith("/")) {
        throw new UsageError("Usage: makerradar api <GET|POST|PUT|PATCH|DELETE> </path?query> [--data JSON|@file|-]", "api");
      }
      let body;
      if (flags.data !== undefined) {
        const raw =
          flags.data === "-" ? await ctx.readStdin() : flags.data.startsWith("@") ? await ctx.readFile(flags.data.slice(1)) : flags.data;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new UsageError("--data isn't valid JSON.", "api");
        }
      }
      printJson(ctx, await ctx.client.request(method, path, body));
    },
  },
];

/** The setup for each MCP client. */
export function mcpSnippets(/** @type {string} */ publicUrl, /** @type {string} */ accountUrl) {
  const json = (/** @type {unknown} */ v) => JSON.stringify(v, null, 2);
  return {
    "claude-code": {
      title: "Claude Code",
      text: `claude mcp add --transport http makerradar ${publicUrl}\nclaude mcp add --transport http makerradar-account ${accountUrl}`,
    },
    "claude-desktop": {
      title: "Claude Desktop / claude.ai (Settings › Connectors › Add custom connector)",
      text: `URL: ${publicUrl}\n(for your listings, add a second one: ${accountUrl})`,
    },
    cursor: {
      title: "Cursor (~/.cursor/mcp.json)",
      text: json({ mcpServers: { makerradar: { url: publicUrl }, "makerradar-account": { url: accountUrl } } }),
    },
    vscode: {
      title: "VS Code (.vscode/mcp.json)",
      text: json({
        servers: {
          makerradar: { type: "http", url: publicUrl },
          "makerradar-account": { type: "http", url: accountUrl },
        },
      }),
    },
    windsurf: {
      title: "Windsurf (~/.codeium/windsurf/mcp_config.json)",
      text: json({ mcpServers: { makerradar: { serverUrl: publicUrl }, "makerradar-account": { serverUrl: accountUrl } } }),
    },
  };
}
