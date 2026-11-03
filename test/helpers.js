// @ts-check
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";

/**
 * A stand-in for the API: routes are "METHOD /path" → a handler returning `{ status?, body,
 * headers? }`. Every request is recorded. No test reaches the network.
 * @param {Record<string, (req: { url: URL, method: string, headers: Headers, body: any }) => any>} routes
 */
export function fakeApi(routes) {
  /** @type {{ url: URL, method: string, headers: Headers, body: any }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const req = { url, method, headers, body };
    calls.push(req);
    const key = `${method} ${url.pathname.replace(/^\/v1/, "")}`;
    const handler = routes[key];
    if (!handler) {
      return Response.json(
        { error: "not_found", message: `No route ${key}`, hint: "Check the path.", docs: "https://example.test/docs" },
        { status: 404 },
      );
    }
    const answer = await handler(req);
    return Response.json(answer.body, { status: answer.status ?? 200, headers: answer.headers });
  };
  return { fetch, calls };
}

/** A captured stream. */
function capture() {
  let text = "";
  return {
    write(/** @type {string} */ chunk) {
      text += chunk;
      return true;
    },
    isTTY: false,
    get text() {
      return text;
    },
  };
}

/** A fresh config file path (in its own temp directory). */
export async function tempConfig() {
  const dir = await mkdtemp(join(tmpdir(), "makerradar-cli-"));
  return join(dir, "nested", "config.json");
}

/**
 * Run the CLI as a user would, with a fake API and a temp config.
 * @param {string[]} argv
 * @param {{ fetch: typeof fetch, env?: Record<string, string | undefined>, config?: string, now?: Date, stdin?: string }} opts
 */
export async function run(argv, opts) {
  const stdout = capture();
  const stderr = capture();
  const config = opts.config ?? (await tempConfig());
  let clock = opts.now?.getTime() ?? Date.parse("2026-11-03T10:00:00Z");
  const code = await main(argv, {
    stdout,
    stderr,
    env: { MAKERRADAR_CONFIG: config, ...opts.env },
    fetch: opts.fetch,
    // Time moves only when the CLI waits, so polling tests are instant.
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => new Date(clock),
    readStdin: async () => opts.stdin ?? "",
  });
  return { code, stdout: stdout.text, stderr: stderr.text, config };
}

/** One product as `GET /products` lists it. */
export const PRODUCT = {
  slug: "acme-analytics",
  name: "Acme Analytics",
  tagline: "Privacy-first analytics for indie SaaS",
  websiteUrl: "https://acme.example",
  pricingModel: "freemium",
  totalUpvotes: 7,
  logoUrl: null,
  publishedAt: "2026-10-20T09:00:00Z",
  updatedAt: "2026-10-21T09:00:00Z",
  url: "https://makerradar.io/p/acme-analytics",
};
