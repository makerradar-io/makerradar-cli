// @ts-check
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, it } from "node:test";
import { isoWeekYear, slugFrom, weekSlug } from "../src/commands.js";
import { fakeApi, PRODUCT, run, tempConfig } from "./helpers.js";

const ESC = "\u001b";

describe("directory commands", () => {
  it("search prints each product and the next page's cursor, filters passed through", async () => {
    const api = fakeApi({
      "GET /products": () => ({ body: { data: [PRODUCT], nextCursor: "abc" } }),
    });
    const r = await run(["search", "privacy", "analytics", "--use-case", "web-analytics", "--limit", "5"], api);
    assert.equal(r.code, 0);
    assert.equal(api.calls[0]?.url.searchParams.get("q"), "privacy analytics");
    assert.equal(api.calls[0]?.url.searchParams.get("useCase"), "web-analytics");
    assert.equal(api.calls[0]?.url.searchParams.get("limit"), "5");
    assert.match(r.stdout, /Acme Analytics {2}▲ 7 · Freemium/);
    assert.match(r.stdout, /https:\/\/makerradar\.io\/p\/acme-analytics/);
    assert.match(r.stdout, /--cursor abc/);
  });

  it("never lets a maker's text drive the terminal", async () => {
    const hostile = {
      ...PRODUCT,
      name: `Evil${ESC}[2J${ESC}]8;;https://phish.test${ESC}\\Co`,
      tagline: "Looks ‮harmless‬\u0007",
    };
    const api = fakeApi({ "GET /products": () => ({ body: { data: [hostile], nextCursor: null } }) });
    const r = await run(["search"], api);
    assert.equal(r.code, 0);
    assert.ok(!r.stdout.includes(ESC), "no escape sequences");
    assert.ok(!/[‪-‮\u0007]/.test(r.stdout), "no bidi overrides or bells");
    assert.match(r.stdout, /Evil\[2J\]8;;https:\/\/phish\.test\\Co/);
  });

  it("--json prints the API's answer as is (control characters escaped by JSON)", async () => {
    const body = { data: [{ ...PRODUCT, name: `A${ESC}B` }], nextCursor: null };
    const api = fakeApi({ "GET /products": () => ({ body }) });
    const r = await run(["search", "--json"], api);
    assert.deepEqual(JSON.parse(r.stdout), body);
    assert.ok(!r.stdout.includes(ESC));
  });

  it("product takes a slug or its page URL, and labels the maker's description", async () => {
    const api = fakeApi({
      "GET /products/acme-analytics": () => ({
        body: {
          data: {
            ...PRODUCT,
            descriptionMd: "Counts visits without cookies.",
            domain: "acme.example",
            claimed: true,
            ratingCount: 2,
            ratingSum: 9,
            tags: [{ slug: "analytics", name: "Analytics" }],
            links: [{ kind: "github", url: "https://github.com/acme/analytics" }],
          },
        },
      }),
    });
    const r = await run(["product", "https://makerradar.io/p/acme-analytics"], api);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Rating +4\.5 from 2 reviews/);
    assert.match(r.stdout, /written by the maker, unverified/);
    assert.match(r.stdout, /github +https:\/\/github\.com\/acme\/analytics/);
    assert.equal((await run(["product", "not a slug!"], api)).code, 2);
  });

  it("launches: this week, or a week by number, ISO week or slug — paid tiers disclosed", async () => {
    const launch = { slug: "acme", name: "Acme", tagline: "x", tier: "featured", upvoteCount: 3, commentCount: 1, url: "u" };
    const api = fakeApi({
      "GET /launches/current": () => ({ body: { data: { week: "week-45-2026", launches: [launch] } } }),
      "GET /launches/week-41-2026": () => ({
        body: { data: { week: "week-41-2026", label: "Week 41", status: "closed", url: "u", launches: [] } },
      }),
    });
    const now = await run(["launches"], api);
    assert.match(now.stdout, /This week \(week-45-2026\)/);
    assert.match(now.stdout, /Featured · paid/);
    for (const week of ["41", "W41", "2026-W41", "week-41-2026"]) {
      const r = await run(["launches", week], api);
      assert.equal(r.code, 0, week);
      assert.match(r.stdout, /Week 41 \(closed\)/);
    }
    assert.equal((await run(["launches", "next"], api)).code, 2);
  });

  it("check runs the SEO check by default and prints each fix, then the listing hook", async () => {
    const report = {
      tool: "seo-checker",
      url: "https://acme.example/",
      finalUrl: "https://acme.example/",
      score: 70,
      checks: [
        { id: "title", status: "fail", label: "Title", detail: `No <title>${ESC}[2J.`, fix: "Add a title." },
        { id: "h1", status: "pass", label: "H1", detail: "One H1.", fix: null },
      ],
      toolUrl: "https://makerradar.io/tools/seo-checker",
      listing: { listed: false, submitUrl: "https://makerradar.io/submit?url=acme.example" },
    };
    const api = fakeApi({ "POST /tools/seo-checker": () => ({ body: { data: report } }) });
    const r = await run(["check", "acme.example"], api);
    assert.equal(r.code, 0);
    assert.deepEqual(api.calls[0]?.body, { url: "acme.example" });
    assert.match(r.stdout, /70\/100/);
    assert.match(r.stdout, /FIX\s+Title/);
    assert.match(r.stdout, /Fix: Add a title\./);
    assert.match(r.stdout, /List it free: https:\/\/makerradar\.io\/submit/);
    assert.ok(!r.stdout.includes(ESC));

    const json = await run(["check", "acme.example", "--json"], api);
    assert.deepEqual(JSON.parse(json.stdout), { data: report });
  });

  it("check --tool picks any tool; the listing line names the claim link", async () => {
    const api = fakeApi({
      "POST /tools/sitemap-checker": () => ({
        body: {
          data: {
            tool: "sitemap-checker",
            url: "https://acme.example",
            score: 100,
            checks: [],
            listing: {
              listed: true,
              productUrl: "https://makerradar.io/p/acme",
              claimable: true,
              claimUrl: "https://makerradar.io/p/acme/claim",
            },
          },
        },
      }),
    });
    const r = await run(["check", "acme.example", "--tool", "sitemap-checker"], api);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Listed on MakerRadar: https:\/\/makerradar\.io\/p\/acme/);
    assert.match(r.stdout, /Claim it: https:\/\/makerradar\.io\/p\/acme\/claim/);
  });

  it("check refuses a missing address or a bad tool before calling anything", async () => {
    const api = fakeApi({});
    for (const argv of [["check"], ["check", "acme.example", "--tool", "../x"], ["check", "a.b", "--tool", "keyword-generator"]]) {
      const r = await run(argv, api);
      assert.equal(r.code, 2, argv.join(" "));
    }
    assert.equal(api.calls.length, 0);
  });

  it("check passes the API's refusal through (exit 1)", async () => {
    const api = fakeApi({
      "POST /tools/seo-checker": () => ({
        status: 403,
        body: { error: "forbidden", message: "The site's robots.txt doesn't let us fetch that page.", hint: "", docs: "" },
      }),
    });
    const r = await run(["check", "acme.example"], api);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /robots\.txt/);
  });

  it("tools lists every tool and marks the ones that need a login", async () => {
    const api = fakeApi({
      "GET /tools": () => ({
        body: {
          data: [
            { tool: "seo-checker", name: "SEO checker", input: "url", requiresToken: false },
            { tool: "keyword-generator", name: "Keyword generator", input: "seed", requiresToken: false },
            { tool: "domain-rating-checker", name: "Domain rating checker", input: "domain", requiresToken: true },
            { tool: "ai-robots-txt-generator", name: "AI robots.txt generator", input: "options", requiresToken: false },
            { tool: "launch-directory-planner", name: "Directory planner", input: "options", requiresToken: false },
          ],
        },
      }),
    });
    const r = await run(["tools"], api);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /seo-checker\s+SEO checker/);
    assert.match(r.stdout, /domain-rating-checker\s+Domain rating checker\s+needs login/);
    assert.match(r.stdout, /keyword-generator\s+Keyword generator\s+makerradar keywords/);
    assert.match(r.stdout, /ai-robots-txt-generator\s+AI robots\.txt generator\s+makerradar robots/);
    assert.match(r.stdout, /launch-directory-planner\s+Directory planner\s+on the site or the API/);
  });

  it("keywords sends the words as the seed and prints each group", async () => {
    const api = fakeApi({
      "POST /tools/keyword-generator": () => ({
        body: {
          data: {
            tool: "keyword-generator",
            seed: "invoicing software",
            groups: [{ intent: "buyer", title: "Buyer keywords", phrases: ["best invoicing software"] }],
          },
        },
      }),
    });
    const r = await run(["keywords", "invoicing", "software"], api);
    assert.equal(r.code, 0);
    assert.deepEqual(api.calls[0]?.body, { seed: "invoicing software" });
    assert.match(r.stdout, /Buyer keywords\n  best invoicing software/);
  });

  it("robots sends the choices, prints only the file on stdout and the notes on stderr", async () => {
    const api = fakeApi({
      "POST /tools/ai-robots-txt-generator": () => ({
        body: {
          data: {
            tool: "ai-robots-txt-generator",
            robotsTxt: "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n",
            blocked: ["GPTBot"],
            allowed: ["OAI-SearchBot"],
            dropped: ["path \"admin\": must start with \"/\""],
            toolUrl: "https://makerradar.io/tools/ai-robots-txt-generator",
          },
        },
      }),
    });
    const r = await run(
      [
        "robots",
        "--preset",
        "block-training",
        "--block",
        "GPTBot,CCBot",
        "--allow",
        "OAI-SearchBot",
        "--disallow",
        "admin",
        "--signals",
        "search,ai-input",
      ],
      api,
    );
    assert.equal(r.code, 0);
    assert.deepEqual(api.calls[0]?.body, {
      preset: "block_training",
      crawlers: { GPTBot: "block", CCBot: "block", "OAI-SearchBot": "allow" },
      disallowPaths: ["admin"],
      contentSignals: { search: true, aiInput: true, aiTrain: false },
    });
    assert.equal(r.stdout, "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n");
    assert.match(r.stderr, /Blocks 1: GPTBot/);
    assert.match(r.stderr, /Ignored: path "admin"/);
    const json = await run(["robots", "--json"], api);
    assert.equal(JSON.parse(json.stdout).data.blocked[0], "GPTBot");
    assert.deepEqual(api.calls[1]?.body, {});
  });

  it("robots refuses a wrong preset or signal before calling, and check points to it", async () => {
    const api = fakeApi({});
    assert.equal((await run(["robots", "--preset", "block-some"], api)).code, 2);
    assert.equal((await run(["robots", "--signals", "maybe"], api)).code, 2);
    assert.equal((await run(["robots", "--block", "GPTBot", "--allow", "GPTBot"], api)).code, 2);
    const check = await run(["check", "acme.com", "--tool", "ai-robots-txt-generator"], api);
    assert.equal(check.code, 2);
    assert.match(check.stderr, /makerradar robots/);
    assert.equal(api.calls.length, 0);
  });

  it("draft sends the site and the optional fields, and gives the review link", async () => {
    const api = fakeApi({
      "POST /drafts": () => ({
        status: 201,
        body: { data: { status: "drafted", message: "Drafted.", reviewUrl: "https://makerradar.io/d/x", expiresAt: "2026-11-10T00:00:00Z" } },
      }),
    });
    const r = await run(["draft", "https://acme.example", "--tagline", "Invoices in one click"], api);
    assert.equal(r.code, 0);
    assert.deepEqual(api.calls[0]?.body, { url: "https://acme.example", tagline: "Invoices in one click" });
    assert.match(r.stdout, /Review and submit: https:\/\/makerradar\.io\/d\/x/);
    assert.equal((await run(["draft", "acme.example"], api)).code, 2);
  });

  it("mcp prints each client's setup for the API in use", async () => {
    const api = fakeApi({});
    const r = await run(["mcp", "--json", "--api-url", "https://api.staging.example/v1"], api);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.public, "https://api.staging.example/mcp");
    assert.equal(parsed.account, "https://api.staging.example/mcp/account");
    assert.ok(parsed.clients["claude-code"].text.includes("claude mcp add --transport http makerradar"));
    assert.equal((await run(["mcp", "emacs"], api)).code, 2);
    assert.equal(api.calls.length, 0);
  });
});

describe("errors", () => {
  it("an API refusal is exit 1 with its message and hint; --json puts the error on stderr", async () => {
    const api = fakeApi({
      "GET /products": () => ({
        status: 400,
        body: { error: "invalid", message: "q: at least 2 characters.", hint: "Search for a word.", docs: "https://d.test" },
      }),
    });
    const human = await run(["search", "x"], api);
    assert.equal(human.code, 1);
    assert.match(human.stderr, /Error: q: at least 2 characters\.\n {2}Search for a word\./);
    const machine = await run(["search", "x", "--json"], api);
    assert.equal(machine.code, 1);
    assert.equal(machine.stdout, "");
    assert.deepEqual(JSON.parse(machine.stderr), {
      error: "invalid",
      status: 400,
      message: "q: at least 2 characters.",
      hint: "Search for a word.",
      docs: "https://d.test",
    });
  });

  it("a usage mistake is exit 2 and calls nothing", async () => {
    const api = fakeApi({});
    for (const argv of [["frobnicate"], ["search", "--nope"], ["categories", "--limit", "3"], ["api", "FETCH", "/x"]]) {
      assert.equal((await run(argv, api)).code, 2, argv.join(" "));
    }
    assert.equal(api.calls.length, 0);
  });
});

describe("the account", () => {
  const approved = { status: "approved", message: "ok", token: "mr_live_secret", tokenType: "Bearer", scopes: ["listings:read"], expiresAt: null };

  function accountApi(answers = [{ status: "pending", message: "wait" }, approved]) {
    const queue = [...answers];
    return fakeApi({
      "POST /agent/connect": () => ({
        body: {
          data: {
            deviceCode: "dev_1",
            userCode: "ABCD-EFGH",
            verificationUri: "https://makerradar.io/connect",
            verificationUriComplete: "https://makerradar.io/connect?code=ABCD-EFGH",
            expiresIn: 600,
            interval: 5,
            message: "Open the link",
          },
        },
      }),
      "POST /agent/token": () => {
        const next = queue.shift();
        return next?.status === "rate_limited"
          ? { status: 429, body: { error: "rate_limited", message: "Too fast", hint: "", docs: "" } }
          : { body: { data: next } };
      },
      "GET /me": ({ headers }) =>
        headers.get("authorization") === "Bearer mr_live_secret"
          ? {
              body: {
                data: {
                  handle: "dana",
                  name: "Dana",
                  ready: true,
                  finishSetupUrl: null,
                  agent: { name: "MakerRadar CLI", scopes: ["listings:read"] },
                  dashboardUrl: "https://makerradar.io/dashboard/agents",
                },
              },
            }
          : { status: 401, body: { error: "unauthorized", message: "Sign in", hint: "Connect first.", docs: "" } },
      "GET /me/listings": () => ({
        body: { data: [{ id: "prd_1", name: "Acme", status: "approved", statusLabel: "Live", manageUrl: "https://m.test" }] },
      }),
    });
  }

  it("login waits for approval, saves the token for its owner only, and never prints it", async () => {
    const api = accountApi();
    const config = await tempConfig();
    const r = await run(["login", "--scope", "listings:read", "--client", "My laptop"], { ...api, config });
    assert.equal(r.code, 0);
    assert.deepEqual(api.calls[0]?.body, { client: "My laptop", scopes: ["listings:read"] });
    assert.match(r.stderr, /https:\/\/makerradar\.io\/connect\?code=ABCD-EFGH/);
    assert.match(r.stderr, /ABCD-EFGH/);
    assert.match(r.stdout, /Connected as @dana/);
    assert.ok(!(r.stdout + r.stderr).includes("mr_live_secret"), "the token is never printed");
    if (process.platform !== "win32") assert.equal((await stat(config)).mode & 0o777, 0o600);

    // Saved: the next command sends it.
    const me = await run(["whoami"], { ...api, config });
    assert.equal(me.code, 0);
    assert.match(me.stdout, /@dana \(Dana\)/);
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), "Bearer mr_live_secret");
    assert.match((await run(["listings"], { ...api, config })).stdout, /prd_1 +Live +Acme/);

    // Logged out: forgotten.
    const out = await run(["logout"], { ...api, config });
    assert.match(out.stdout, /forgotten on this machine/);
    assert.match(out.stdout, /dashboard\/agents/);
    assert.equal((await run(["whoami"], { ...api, config })).code, 2);
  });

  it("backs off when asked to, and saves nothing when the person declines", async () => {
    const slowed = accountApi([{ status: "rate_limited" }, approved]);
    assert.equal((await run(["login"], slowed)).code, 0);

    const config = await tempConfig();
    const declined = accountApi([{ status: "denied", message: "No" }]);
    const r = await run(["login"], { ...declined, config });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /declined/);
    assert.equal((await run(["whoami"], { ...declined, config })).code, 2);
  });

  it("refuses an unknown scope before asking anyone", async () => {
    const api = accountApi();
    assert.equal((await run(["login", "--scope", "admin"], api)).code, 2);
    assert.equal(api.calls.length, 0);
  });

  it("uses --token over MAKERRADAR_TOKEN over the saved token", async () => {
    const api = accountApi();
    await run(["whoami", "--token", "mr_flag"], { ...api, env: { MAKERRADAR_TOKEN: "mr_env" } });
    await run(["whoami"], { ...api, env: { MAKERRADAR_TOKEN: "mr_env" } });
    assert.deepEqual(
      api.calls.map((c) => c.headers.get("authorization")),
      ["Bearer mr_flag", "Bearer mr_env"],
    );
  });

  it("keeps an exported MAKERRADAR_TOKEN to the API the environment names", async () => {
    const api = accountApi();
    const env = { MAKERRADAR_TOKEN: "mr_env" };
    // --api-url elsewhere (a typo, a copied command, someone else's server): not sent, and said so.
    const elsewhere = await run(["whoami", "--api-url", "https://api.evil.test/v1"], { ...api, env });
    assert.equal(elsewhere.code, 2);
    assert.match(elsewhere.stderr, /MAKERRADAR_TOKEN is for https:\/\/api\.makerradar\.io, so it isn't sent to https:\/\/api\.evil\.test/);
    assert.equal(api.calls.length, 0);
    // A public command there goes out without it.
    await run(["search", "--api-url", "https://api.evil.test/v1"], { ...api, env });
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), null);
    // The environment's own API (another path on it included) gets it; --token is always explicit.
    await run(["whoami", "--api-url", "https://api.makerradar.io/v1/"], { ...api, env });
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), "Bearer mr_env");
    const staging = { MAKERRADAR_TOKEN: "mr_env", MAKERRADAR_API_URL: "https://api.staging.test/v1" };
    await run(["whoami"], { ...api, env: staging });
    assert.equal(api.calls.at(-1)?.url.host, "api.staging.test");
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), "Bearer mr_env");
    await run(["whoami", "--api-url", "https://api.evil.test/v1", "--token", "mr_flag"], { ...api, env });
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), "Bearer mr_flag");
  });

  it("never sends a token over plain http, except to this machine", async () => {
    const api = accountApi();
    const r = await run(["whoami", "--api-url", "http://api.example.test/v1", "--token", "mr_flag"], api);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Not sending your token over plain http to api\.example\.test/);
    assert.equal(api.calls.length, 0);
    // Nor through `api`: the call goes out bare, and the 401 says why.
    const bare = await run(["api", "GET", "/me", "--api-url", "http://api.example.test/v1", "--token", "mr_flag"], api);
    assert.equal(api.calls.at(-1)?.headers.get("authorization"), null);
    assert.match(bare.stderr, /plain http/);
    // Logging in over plain http would put the device code and the new token on the wire.
    const login = await run(["login", "--api-url", "http://api.example.test/v1"], api);
    assert.equal(login.code, 2);
    assert.match(login.stderr, /Logging in needs https/);
    // A local API in development is fine.
    for (const local of ["http://localhost:5281/v1", "http://127.0.0.1:5281/v1", "http://[::1]:5281/v1"]) {
      await run(["whoami", "--api-url", local, "--token", "mr_flag"], api);
      assert.equal(api.calls.at(-1)?.headers.get("authorization"), "Bearer mr_flag", local);
    }
  });

  it("treats an empty or blank variable as unset", async () => {
    const api = accountApi();
    const r = await run(["whoami"], { ...api, env: { MAKERRADAR_TOKEN: "  ", MAKERRADAR_API_URL: "" } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /makerradar login/);
    assert.equal(api.calls.length, 0);
    await run(["search"], { ...api, env: { MAKERRADAR_API_URL: " " } });
    assert.equal(api.calls.at(-1)?.url.host, "api.makerradar.io");
  });

  it("keeps a login going when the API is busy or a connection drops", async () => {
    let starts = 0;
    let polls = 0;
    const api = fakeApi({
      "POST /agent/connect": () =>
        ++starts === 1
          ? { status: 503, body: { error: "unavailable", message: "Busy", hint: "", docs: "" } }
          : {
              body: {
                data: {
                  deviceCode: "dev_1",
                  userCode: "ABCD-EFGH",
                  verificationUri: "https://makerradar.io/connect",
                  verificationUriComplete: "https://makerradar.io/connect?code=ABCD-EFGH",
                  expiresIn: 600,
                  interval: 5,
                },
              },
            },
      "POST /agent/token": () => {
        polls++;
        if (polls === 1) return { status: 502, body: { error: "unavailable", message: "Bad gateway", hint: "", docs: "" } };
        if (polls === 2) throw new TypeError("fetch failed");
        return { body: { data: approved } };
      },
      "GET /me": () => ({ body: { data: { handle: "dana", dashboardUrl: null } } }),
    });
    const config = await tempConfig();
    const r = await run(["login"], { ...api, config });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(starts, 2);
    assert.equal(polls, 3);
    assert.match(r.stderr, /The API is busy; trying again/);
    assert.match(r.stdout, /Connected as @dana/);
    // A refusal still ends it at once.
    const refused = accountApi([{ status: "denied", message: "No" }]);
    assert.equal((await run(["login"], refused)).code, 2);
  });

  it("writes the config atomically: nothing left beside it, still for its owner only", async () => {
    const config = await tempConfig();
    await run(["login"], { ...accountApi(), config });
    await run(["login"], { ...accountApi(), config });
    assert.deepEqual(await readdir(dirname(config)), ["config.json"]);
    if (process.platform !== "win32") assert.equal((await stat(config)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(config, "utf8")).tokens["https://api.makerradar.io/v1"].token, "mr_live_secret");
  });

  it("says how to sign in when an account command has no token", async () => {
    const r = await run(["listings"], accountApi());
    assert.equal(r.code, 2);
    assert.match(r.stderr, /makerradar login/);
  });
});

describe("api", () => {
  it("passes any call through with the token, its JSON body from --data, a file or stdin", async () => {
    const api = fakeApi({
      "PATCH /me/listings/prd_1": ({ body }) => ({ body: { data: { ok: true, got: body } } }),
      "GET /products": ({ url }) => ({ body: { data: [], q: url.searchParams.get("q") } }),
    });
    const patched = await run(["api", "patch", "/me/listings/prd_1", "--data", '{"tagline":"New"}', "--token", "mr_t"], api);
    assert.equal(patched.code, 0);
    assert.deepEqual(JSON.parse(patched.stdout).data.got, { tagline: "New" });
    assert.equal(api.calls[0]?.headers.get("authorization"), "Bearer mr_t");
    const piped = await run(["api", "PATCH", "/v1/me/listings/prd_1", "--data", "-"], { ...api, stdin: '{"a":1}' });
    assert.deepEqual(JSON.parse(piped.stdout).data.got, { a: 1 });
    const listed = await run(["api", "GET", "/products?q=notes"], api);
    assert.equal(JSON.parse(listed.stdout).q, "notes");
    assert.equal((await run(["api", "POST", "/drafts", "--data", "{oops"], api)).code, 2);
  });
});

describe("helpers", () => {
  it("reads a slug from a slug or a product URL", () => {
    assert.equal(slugFrom("Acme-Analytics"), "acme-analytics");
    assert.equal(slugFrom("https://makerradar.io/p/acme-analytics?ref=x"), "acme-analytics");
    assert.equal(slugFrom("https://makerradar.io/category/x"), null);
    assert.equal(slugFrom("../etc"), null);
  });

  it("knows the ISO week-numbering year at the year's edges", () => {
    assert.equal(isoWeekYear(new Date("2027-01-01T12:00:00Z")), 2026); // a Friday: 2026-W53
    assert.equal(isoWeekYear(new Date("2025-12-29T12:00:00Z")), 2026); // a Monday: 2026-W01
    assert.equal(weekSlug("53", new Date("2027-01-01T12:00:00Z")), "week-53-2026");
    assert.equal(weekSlug("week-07-2026", new Date()), "week-7-2026");
  });
});
