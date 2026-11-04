// @ts-check

/**
 * A stdio ↔ Streamable HTTP bridge for MakerRadar's MCP server (`makerradar mcp serve`).
 *
 * The server itself is remote (https://api.makerradar.io/mcp); clients that can only start a local
 * command — and the directories that only list installable servers — run this instead. It reads
 * newline-delimited JSON-RPC from stdin, POSTs each message to the server, and writes every message
 * the server answers (a JSON body, or the events of a `text/event-stream`) to stdout, one per line.
 * Nothing is interpreted: tools, prompts and errors are the server's own.
 *
 * A token (for `/mcp/account`) is sent as `Authorization: Bearer …`, the server's `Mcp-Session-Id`
 * is kept for the session, and the negotiated `MCP-Protocol-Version` is echoed on later calls.
 */

/** The protocol version the bridge asks for when it hasn't negotiated one yet. */
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

/** JSON-RPC's "server error" range: the bridge's own failures (HTTP status, unreachable host). */
const BRIDGE_ERROR = -32000;

/**
 * @typedef {object} BridgeOptions
 * @property {string} url The MCP endpoint (`…/mcp` or `…/mcp/account`).
 * @property {string | null} [token] An agent token for the account endpoint.
 * @property {string} userAgent
 * @property {AsyncIterable<string | Uint8Array>} stdin
 * @property {{ write(chunk: string): unknown }} stdout
 * @property {(line: string) => void} log Diagnostics (stderr): never stdout, which is the protocol.
 * @property {typeof fetch} [fetch]
 */

/**
 * Split a `text/event-stream` body into the JSON-RPC messages it carries (one per `data:` event;
 * multi-line data is joined with newlines, as the SSE spec says).
 * @param {string} text
 */
export function sseMessages(text) {
  /** @type {string[]} */
  const messages = [];
  /** @type {string[]} */
  let data = [];
  const flush = () => {
    if (data.length) messages.push(data.join("\n"));
    data = [];
  };
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    if (rawLine === "") {
      flush();
      continue;
    }
    if (rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? "" : rawLine.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  }
  flush();
  return messages;
}

/** The lines of a stream of chunks, without their newline; a last line without one is yielded too. */
async function* lines(/** @type {AsyncIterable<string | Uint8Array>} */ source) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of source) {
    rest += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let at = rest.indexOf("\n");
    while (at !== -1) {
      yield rest.slice(0, at);
      rest = rest.slice(at + 1);
      at = rest.indexOf("\n");
    }
  }
  rest += decoder.decode();
  if (rest) yield rest;
}

/**
 * Run the bridge until stdin closes. Returns 0, or 1 when the endpoint isn't a URL.
 * @param {BridgeOptions} opts
 */
export async function runBridge(opts) {
  try {
    new URL(opts.url);
  } catch {
    opts.log(`Not a URL: ${opts.url}`);
    return 1;
  }
  const doFetch = opts.fetch ?? fetch;
  /** @type {string | null} */
  let sessionId = null;
  let protocolVersion = DEFAULT_PROTOCOL_VERSION;
  const emit = (/** @type {string} */ message) => opts.stdout.write(`${message}\n`);

  for await (const line of lines(opts.stdin)) {
    const text = line.trim();
    if (!text) continue;
    /** @type {any} */
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      opts.log("Ignored a line that isn't JSON.");
      continue;
    }
    const id = message && typeof message === "object" && "id" in message ? message.id : undefined;
    const isRequest = id !== undefined && id !== null && typeof message.method === "string";
    if (isRequest && message.method === "initialize" && typeof message.params?.protocolVersion === "string") {
      protocolVersion = message.params.protocolVersion;
    }

    /** @type {Record<string, string>} */
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": protocolVersion,
      "user-agent": opts.userAgent,
    };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (sessionId) headers["mcp-session-id"] = sessionId;

    /** @type {Response} */
    let res;
    try {
      res = await doFetch(opts.url, { method: "POST", headers, body: text });
    } catch (e) {
      const reason = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
      fail(isRequest ? id : undefined, `Couldn't reach ${new URL(opts.url).host}: ${reason}`);
      continue;
    }
    const newSession = res.headers.get("mcp-session-id");
    if (newSession) sessionId = newSession;

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) detail += `: ${body.message}`;
        else if (body?.error?.message) detail += `: ${body.error.message}`;
      } catch {
        // No readable body: the status is the message.
      }
      fail(isRequest ? id : undefined, detail);
      continue;
    }
    if (res.status === 202 || res.status === 204) continue; // A notification or a response: nothing comes back.

    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const body = await res.text();
    if (type.startsWith("text/event-stream")) {
      for (const event of sseMessages(body)) {
        const out = asMessages(event);
        if (out) out.forEach(emit);
      }
    } else if (body.trim()) {
      const out = asMessages(body);
      if (out) out.forEach(emit);
      else fail(isRequest ? id : undefined, "The server's answer isn't JSON.");
    }
    // The server read the `initialize` result's protocol version too; keep echoing what we asked for.
  }
  return 0;

  /** Answer a failed request with a JSON-RPC error (a notification's failure is only logged). */
  function fail(/** @type {unknown} */ id, /** @type {string} */ detail) {
    opts.log(detail);
    if (id !== undefined) {
      emit(JSON.stringify({ jsonrpc: "2.0", id, error: { code: BRIDGE_ERROR, message: detail } }));
    }
  }
}

/** A JSON text as the JSON-RPC message(s) it holds (a batch is spread), serialised one per line. */
function asMessages(/** @type {string} */ text) {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((m) => JSON.stringify(m));
  } catch {
    return null;
  }
}
