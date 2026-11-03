// @ts-check
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
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
