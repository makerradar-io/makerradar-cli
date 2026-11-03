// @ts-check
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ApiError, createClient, DEFAULT_API_URL, tokenSafeUrl } from "./api.js";
import { COMMANDS, UsageError } from "./commands.js";
import { configPath, envValue, savedToken } from "./config.js";
import { clean, styles } from "./format.js";

export const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const DOCS_URL = "https://makerradar.io/cli";
const REPO_URL = "https://github.com/makerradar-io/makerradar-cli";
const USER_AGENT = `makerradar-cli/${VERSION} (+${REPO_URL})`;

/** Every option any command takes; each command lists the ones it accepts beyond the globals. */
const OPTIONS = /** @type {const} */ ({
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  "api-url": { type: "string" },
  token: { type: "string" },
  limit: { type: "string" },
  cursor: { type: "string" },
  category: { type: "string" },
  platform: { type: "string" },
  audience: { type: "string" },
  "use-case": { type: "string" },
  country: { type: "string" },
  "updated-since": { type: "string" },
  name: { type: "string" },
  tagline: { type: "string" },
  description: { type: "string" },
  client: { type: "string" },
  scope: { type: "string", multiple: true },
  data: { type: "string" },
});
const GLOBAL_OPTIONS = new Set(["json", "help", "version", "api-url", "token"]);

/**
 * @typedef {object} Io
 * @property {{ write(chunk: string): unknown, isTTY?: boolean }} stdout
 * @property {{ write(chunk: string): unknown, isTTY?: boolean }} stderr
 * @property {Record<string, string | undefined>} env
 * @property {typeof fetch} [fetch]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => Date} [now]
 * @property {() => Promise<string>} [readStdin]
 */

function topHelp(/** @type {import("./format.js").Styles} */ s) {
  const lines = [
    `${s.bold("makerradar")} — the MakerRadar CLI ${s.dim(`v${VERSION}`)}`,
    "Search the MakerRadar launch directory and manage your listings from the terminal.",
    "",
    `Usage: makerradar <command> [options]`,
  ];
  let group = "";
  for (const c of COMMANDS) {
    if (c.group !== group) {
      group = c.group;
      lines.push("", s.bold(group));
    }
    lines.push(`  ${`${c.name} ${c.args}`.trim().padEnd(24)}  ${c.summary}`);
  }
  lines.push(
    "",
    s.bold("Options"),
    "  --json                    Machine-readable output (the API's own JSON)",
    `  --api-url <url>           API base (default ${DEFAULT_API_URL}; env MAKERRADAR_API_URL)`,
    "  --token <token>           An agent token to use (env MAKERRADAR_TOKEN; else the one `login` saved)",
    "  -h, --help                Help for a command: makerradar <command> --help",
    "  -v, --version             The CLI's version",
    "",
    `Docs: ${DOCS_URL}  ·  API: ${DEFAULT_API_URL}/openapi.json`,
  );
  return lines.join("\n");
}

function commandHelp(
  /** @type {import("./commands.js").Command} */ c,
  /** @type {import("./format.js").Styles} */ s,
) {
  const lines = [`Usage: makerradar ${`${c.name} ${c.args}`.trim()} [options]`, "", c.summary + "."];
  if (c.details) lines.push("", c.details);
  if (c.options?.length) {
    lines.push("", s.bold("Options"));
    for (const name of c.options) {
      const def = /** @type {Record<string, { type: string, multiple?: boolean }>} */ (OPTIONS)[name];
      lines.push(`  --${name}${def.type === "string" ? " <value>" : ""}${def.multiple ? " (repeatable)" : ""}`);
    }
  }
  if (c.examples?.length) lines.push("", s.bold("Examples"), ...c.examples.map((e) => `  ${e}`));
  lines.push("", s.dim("Also: --json, --api-url, --token. Docs: " + DOCS_URL));
  return lines.join("\n");
}

/** Read all of stdin (for `api --data -`). */
async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Run the CLI. Returns the exit code: 0 done, 1 the API (or the network) refused, 2 a usage mistake.
 * @param {string[]} argv The arguments after `makerradar`.
 * @param {Io} io
 */
export async function main(argv, io) {
  const out = (/** @type {string} */ line = "") => io.stdout.write(`${line}\n`);
  const err = (/** @type {string} */ line = "") => io.stderr.write(`${line}\n`);
  const s = styles(io.stdout, io.env);
  const es = styles(io.stderr, io.env);

  /** @type {{ values: Record<string, any>, positionals: string[] }} */
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    err(`${es.red("Error:")} ${e instanceof Error ? e.message : String(e)}`);
    err("Run `makerradar --help` for the commands and their options.");
    return 2;
  }
  const { values: flags, positionals } = parsed;
  if (flags.version) {
    out(VERSION);
    return 0;
  }
  const [name, ...args] = positionals;
  if (!name || name === "help") {
    const target = name === "help" ? COMMANDS.find((c) => c.name === args[0]) : undefined;
    out(target ? commandHelp(target, s) : topHelp(s));
    return 0;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    err(`${es.red("Error:")} unknown command "${clean(name)}".`);
    err("Run `makerradar --help` for the commands.");
    return 2;
  }
  if (flags.help) {
    out(commandHelp(command, s));
    return 0;
  }
  const stray = Object.keys(flags).filter((f) => !GLOBAL_OPTIONS.has(f) && !command.options?.includes(f));
  if (stray.length) {
    err(`${es.red("Error:")} ${command.name} doesn't take --${stray.join(", --")}.`);
    err(`Run \`makerradar ${command.name} --help\`.`);
    return 2;
  }

  // The API the environment names: MAKERRADAR_TOKEN belongs to it, and only to it.
  const envApiUrl = (envValue(io.env, "MAKERRADAR_API_URL") || DEFAULT_API_URL).replace(/\/+$/, "");
  const apiUrl = (flags["api-url"]?.trim() || envApiUrl).replace(/\/+$/, "");
  for (const [label, url] of [
    ["--api-url", apiUrl],
    ["MAKERRADAR_API_URL", envApiUrl],
  ]) {
    try {
      new URL(url);
    } catch {
      err(`${es.red("Error:")} ${label} isn't a URL: ${clean(url)}`);
      return 2;
    }
  }
  const origin = (/** @type {string} */ url) => new URL(url).origin;
  const configFile = configPath(io.env);
  /** @type {"flag" | "env" | "saved" | null} */
  let tokenSource = null;
  /** @type {string | null} */
  let token = null;
  /** Why a token that was there isn't being sent (said when a command needs one). */
  let tokenNote = /** @type {string | null} */ (null);
  const envToken = envValue(io.env, "MAKERRADAR_TOKEN");
  if (flags.token?.trim()) {
    token = flags.token.trim();
    tokenSource = "flag";
  } else if (envToken && origin(envApiUrl) === origin(apiUrl)) {
    token = envToken;
    tokenSource = "env";
  } else {
    if (envToken) {
      // An exported token is for the API the environment names; --api-url pointing elsewhere (a
      // typo, a copied command, someone else's server) must not receive it.
      tokenNote = `MAKERRADAR_TOKEN is for ${origin(envApiUrl)}, so it isn't sent to ${origin(apiUrl)}. Pass --token for that API, or log in to it.`;
    }
    const saved = await savedToken(configFile, apiUrl);
    if (saved?.token) {
      token = saved.token;
      tokenSource = "saved";
    }
  }
  if (token && !tokenSafeUrl(apiUrl)) {
    tokenNote = `Not sending your token over plain http to ${new URL(apiUrl).host}: use an https API URL (plain http is only for localhost).`;
    token = null;
    tokenSource = null;
  }
  const clientFor = (/** @type {string | null} */ t) =>
    createClient({ apiUrl, token: t, fetch: io.fetch, userAgent: USER_AGENT });

  /** @type {import("./commands.js").Context} */
  const ctx = {
    client: clientFor(token),
    out,
    err,
    s,
    json: Boolean(flags.json),
    configFile,
    tokenSource,
    tokenNote,
    sleep: io.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: io.now ?? (() => new Date()),
    readStdin: io.readStdin ?? readAllStdin,
    readFile: (path) => readFile(path, "utf8"),
    withToken: (t) => clientFor(t),
  };

  try {
    await command.run(ctx, args, flags);
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(`${es.red("Error:")} ${e.message}`);
      return 2;
    }
    if (e instanceof ApiError) {
      if (ctx.json) {
        err(JSON.stringify({ error: e.code, status: e.status, message: e.message, hint: e.hint, docs: e.docs }));
      } else {
        err(`${es.red("Error:")} ${clean(e.message)}`);
        if (e.hint) err(`  ${clean(e.hint)}`);
        if (e.code === "unauthorized" && ctx.tokenSource === "saved") {
          err("  Your saved token no longer works: run `makerradar login` again.");
        }
        if (e.code === "unauthorized" && ctx.tokenNote) err(`  ${ctx.tokenNote}`);
        if (e.docs) err(es.dim(`  Docs: ${clean(e.docs)}`));
      }
      return 1;
    }
    throw e;
  }
}
