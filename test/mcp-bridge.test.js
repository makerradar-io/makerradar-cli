// @ts-check
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBridge, sseMessages } from "../src/mcp-bridge.js";
import { fakeApi, run } from "./helpers.js";

const URL_ = "https://api.example/mcp";

/** stdin as a client would write it: one JSON-RPC message per line. */
async function* stdinOf(/** @type {unknown[]} */ messages) {
  for (const m of messages) yield `${JSON.stringify(m)}\n`;
}

function capture() {
  let text = "";
  return {
    write(/** @type {string} */ chunk) {
      text += chunk;
      return true;
    },
    get text() {
      return text;
    },
    get lines() {
      return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
  };
}

/**
 * An MCP server over fetch: answers by `method`. A handler returns a Response.
 * @param {(message: any, req: { headers: Headers }) => Response | Promise<Response>} answer
 */
function fakeServer(answer) {
  /** @type {{ headers: Headers, body: any }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetch = async (_input, init = {}) => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));
    calls.push({ headers, body });
    return answer(body, { headers });
  };
  return { fetch, calls };
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
const listTools = { jsonrpc: "2.0", id: 2, method: "tools/list" };

describe("mcp serve (the stdio bridge)", () => {
  it("relays JSON answers, swallows 202s, and sends the headers the server expects", async () => {
    const server = fakeServer((m) => {
      if (m.method === "initialize") {
        return Response.json(
          { jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "x" } } },
          { headers: { "mcp-session-id": "sess-1" } },
        );
      }
      if (!("id" in m)) return new Response(null, { status: 202 });
      return Response.json({ jsonrpc: "2.0", id: m.id, result: { tools: [] } });
    });
    const stdout = capture();
    const logs = /** @type {string[]} */ ([]);
    const code = await runBridge({
      url: URL_,
      token: "mr_secret",
      userAgent: "t/1",
      stdin: stdinOf([initialize, initialized, listTools]),
      stdout,
      log: (l) => logs.push(l),
      fetch: server.fetch,
    });
    assert.equal(code, 0);
    assert.deepEqual(
      stdout.lines.map((m) => m.id),
      [1, 2],
      "one line per answer, nothing for the notification",
    );
    assert.deepEqual(logs, []);
    const first = server.calls[0];
    assert.equal(first?.headers.get("authorization"), "Bearer mr_secret");
    assert.equal(first?.headers.get("accept"), "application/json, text/event-stream");
    assert.equal(first?.headers.get("mcp-protocol-version"), "2025-11-25");
    assert.equal(first?.headers.get("content-type"), "application/json");
    assert.equal(first?.headers.get("mcp-session-id"), null, "no session before the server gave one");
    assert.equal(server.calls[2]?.headers.get("mcp-session-id"), "sess-1");
    assert.deepEqual(server.calls[2]?.body, listTools, "the message goes through untouched");
  });

  it("spreads an event-stream answer into one line per message", async () => {
    const server = fakeServer((m) => {
      const sse = [
        ": keep-alive",
        "",
        "event: message",
        `data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } })}`,
        "",
        "data: {\"jsonrpc\":\"2.0\",",
        `data:  "id":${m.id},"result":{"tools":[]}}`,
        "",
      ].join("\n");
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    });
    const stdout = capture();
    await runBridge({ url: URL_, userAgent: "t/1", stdin: stdinOf([listTools]), stdout, log: () => {}, fetch: server.fetch });
    assert.equal(stdout.lines.length, 2);
    assert.equal(stdout.lines[0].method, "notifications/progress");
    assert.deepEqual(stdout.lines[1], { jsonrpc: "2.0", id: 2, result: { tools: [] } });
  });

  it("turns an HTTP failure or an unreachable host into a JSON-RPC error for that request", async () => {
    let calls = 0;
    const stdout = capture();
    const logs = /** @type {string[]} */ ([]);
    await runBridge({
      url: URL_,
      userAgent: "t/1",
      stdin: stdinOf([listTools, initialized, { ...listTools, id: 3 }]),
      stdout,
      log: (l) => logs.push(l),
      fetch: async () => {
        calls++;
        if (calls === 1) return Response.json({ error: "unauthorized", message: "Sign in first." }, { status: 401 });
        if (calls === 2) return Response.json({ error: "rate_limited" }, { status: 429 });
        throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.example") });
      },
    });
    assert.equal(stdout.lines.length, 2, "the notification's failure is only logged");
    assert.equal(stdout.lines[0].id, 2);
    assert.equal(stdout.lines[0].error.code, -32000);
    assert.match(stdout.lines[0].error.message, /HTTP 401: Sign in first\./);
    assert.equal(stdout.lines[1].id, 3);
    assert.match(stdout.lines[1].error.message, /Couldn't reach api\.example: getaddrinfo ENOTFOUND/);
    assert.equal(logs.length, 3);
  });

  it("ignores blank and non-JSON lines, and refuses a URL that isn't one", async () => {
    const stdout = capture();
    const logs = /** @type {string[]} */ ([]);
    async function* junk() {
      yield "\n   \nnot json\n";
    }
    const code = await runBridge({ url: URL_, userAgent: "t/1", stdin: junk(), stdout, log: (l) => logs.push(l), fetch: async () => assert.fail("no call") });
    assert.equal(code, 0);
    assert.equal(stdout.text, "");
    assert.deepEqual(logs, ["Ignored a line that isn't JSON."]);
    assert.equal(await runBridge({ url: "nope", userAgent: "t/1", stdin: junk(), stdout, log: () => {} }), 1);
  });

  it("parses event streams per the spec (comments, CRLF, multi-line data)", () => {
    assert.deepEqual(sseMessages(": hi\r\ndata: a\r\ndata: b\r\n\r\nevent: x\ndata:c\n"), ["a\nb", "c"]);
    assert.deepEqual(sseMessages(""), []);
  });
});

describe("makerradar mcp serve", () => {
  it("bridges stdin to the public server of the API in use", async () => {
    const server = fakeServer((m) => Response.json({ jsonrpc: "2.0", id: m.id, result: { ok: true } }));
    const r = await run(["mcp", "serve", "--api-url", "https://api.staging.example/v1"], {
      fetch: server.fetch,
      stdin: `${JSON.stringify(listTools)}\n`,
    });
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.stdout), { jsonrpc: "2.0", id: 2, result: { ok: true } });
    assert.equal(server.calls[0]?.headers.get("authorization"), null, "the public server gets no token");
  });

  it("--account needs a token and sends it to /mcp/account", async () => {
    const api = fakeApi({});
    const refused = await run(["mcp", "serve", "--account"], api);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /makerradar login/);
    assert.equal(api.calls.length, 0);

    /** @type {{ url: string, auth: string | null }[]} */
    const seen = [];
    const r = await run(["mcp", "serve", "--account"], {
      fetch: async (input, init = {}) => {
        seen.push({ url: String(input), auth: new Headers(init.headers).get("authorization") });
        return Response.json({ jsonrpc: "2.0", id: 2, result: {} });
      },
      env: { MAKERRADAR_TOKEN: "mr_env" },
      stdin: `${JSON.stringify(listTools)}\n`,
    });
    assert.equal(r.code, 0);
    assert.deepEqual(seen, [{ url: "https://api.makerradar.io/mcp/account", auth: "Bearer mr_env" }]);
  });

  it("--account is only for serve, and serve takes no client", async () => {
    const api = fakeApi({});
    assert.equal((await run(["mcp", "cursor", "--account"], api)).code, 2);
    assert.equal((await run(["mcp", "serve", "cursor"], api)).code, 2);
  });
});
