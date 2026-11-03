// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, createClient, DEFAULT_API_URL, tokenSafeUrl } from "../src/api.js";
import { OPERATIONS } from "../src/operations.js";
import { fakeApi } from "./helpers.js";

describe("the API client", () => {
  it("calls an operation by id: path parameters encoded, empty query values left out", async () => {
    const api = fakeApi({ "GET /products": () => ({ body: { data: [] } }) });
    const client = createClient({ fetch: api.fetch, userAgent: "test" });
    await client.call("listProducts", { query: { q: "notes", limit: 5, cursor: undefined, category: "" } });
    assert.equal(api.calls[0]?.url.href, `${DEFAULT_API_URL}/products?q=notes&limit=5`);
    // (no such route in the fake: only the URL it asked for matters here)
    await client.call("getProduct", { params: { slug: "a b/c" } }).catch(() => {});
    assert.equal(api.calls[1]?.url.pathname, "/v1/products/a%20b%2Fc");
  });

  it("names itself, asks for JSON and sends the token only when it has one", async () => {
    const api = fakeApi({ "GET /me": () => ({ body: { data: {} } }), "POST /drafts": () => ({ body: { data: {} } }) });
    await createClient({ fetch: api.fetch, userAgent: "makerradar-cli/test" }).call("getMe");
    await createClient({ fetch: api.fetch, userAgent: "makerradar-cli/test", token: "mr_secret" }).call("createDraft", {
      body: { url: "https://acme.example" },
    });
    const [anonymous, signed] = api.calls;
    assert.equal(anonymous?.headers.get("user-agent"), "makerradar-cli/test");
    assert.equal(anonymous?.headers.get("accept"), "application/json");
    assert.equal(anonymous?.headers.get("authorization"), null);
    assert.equal(signed?.headers.get("authorization"), "Bearer mr_secret");
    assert.equal(signed?.headers.get("content-type"), "application/json");
    assert.deepEqual(signed?.body, { url: "https://acme.example" });
  });

  it("turns the API's error body into an ApiError with its code, hint, docs and Retry-After", async () => {
    const api = fakeApi({
      "GET /products": () => ({
        status: 429,
        headers: { "retry-after": "12" },
        body: { error: "rate_limited", message: "Slow down.", hint: "Wait a little.", docs: "https://d.test" },
      }),
    });
    const err = await createClient({ fetch: api.fetch, userAgent: "t" }).call("listProducts").catch((e) => e);
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 429);
    assert.equal(err.code, "rate_limited");
    assert.equal(err.message, "Slow down.");
    assert.equal(err.hint, "Wait a little.");
    assert.equal(err.docs, "https://d.test");
    assert.equal(err.retryAfter, 12);
  });

  it("says when the API can't be reached", async () => {
    const client = createClient({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      userAgent: "t",
    });
    const err = await client.call("listCategories").catch((e) => e);
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "network");
    assert.match(err.message, /Couldn't reach api\.makerradar\.io/);
  });

  it("takes a raw path with or without the /v1 prefix", async () => {
    const api = fakeApi({ "GET /categories": () => ({ body: { data: [] } }) });
    const client = createClient({ fetch: api.fetch, userAgent: "t", apiUrl: "https://api.example.test/v1/" });
    await client.request("GET", "/categories");
    await client.request("GET", "/v1/categories");
    assert.deepEqual(
      api.calls.map((c) => c.url.href),
      ["https://api.example.test/v1/categories", "https://api.example.test/v1/categories"],
    );
  });

  it("declares every operation with a method and an absolute path", () => {
    for (const [id, op] of Object.entries(OPERATIONS)) {
      assert.match(op.method, /^(GET|POST|PUT|PATCH|DELETE)$/, id);
      assert.match(op.path, /^\//, id);
    }
  });

  it("treats an answer that stops mid-body as unreachable, not a crash", async () => {
    /** @type {typeof fetch} */
    const fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":'));
            controller.error(new Error("socket hang up"));
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const err = await createClient({ fetch, userAgent: "test" })
      .call("listProducts")
      .catch((e) => e);
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 0);
    assert.equal(err.code, "network");
    assert.match(err.message, /stopped answering/);
  });

  it("refuses to hold a token for a plain-http API that isn't this machine", () => {
    assert.throws(
      () => createClient({ apiUrl: "http://api.example.test/v1", token: "mr_x", userAgent: "test" }),
      /plain http/,
    );
    assert.ok(createClient({ apiUrl: "http://localhost:5281/v1", token: "mr_x", userAgent: "test" }));
    assert.ok(createClient({ apiUrl: "http://api.example.test/v1", userAgent: "test" }));
    assert.equal(tokenSafeUrl("https://api.makerradar.io/v1"), true);
    assert.equal(tokenSafeUrl("http://dev.localhost:5281/v1"), true);
    assert.equal(tokenSafeUrl("http://localhost.evil.test/v1"), false);
    assert.equal(tokenSafeUrl("ftp://api.makerradar.io"), false);
  });
});
