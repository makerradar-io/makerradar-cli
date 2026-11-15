// @ts-check
import { OPERATIONS } from "./operations.js";

/** Production. Override with `--api-url` or `MAKERRADAR_API_URL` (e.g. staging). */
export const DEFAULT_API_URL = "https://api.makerradar.io/v1";

/** How long one request may take, body included, before it's abandoned. */
const TIMEOUT_MS = 30_000;

/** Hosts a token may reach over plain http: this machine only (a local API in development). */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Whether a token may be sent to this API: over https, or plain http to this machine only. Anything
 * else would put the token on the wire in the clear.
 */
export function tokenSafeUrl(/** @type {string} */ apiUrl) {
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (LOOPBACK.has(url.hostname) || url.hostname.endsWith(".localhost"));
}

/**
 * Whether a value can be an agent token: printable ASCII with no spaces, line breaks or other
 * controls (what an HTTP header may carry). Anything else is refused before it's sent, so a fetch
 * never fails with the token quoted in its message.
 */
export function tokenShapeOk(/** @type {string} */ token) {
  return /^[\x21-\x7e]+$/.test(token);
}

/**
 * A message with any token in it masked: the one in use, and whatever follows `Bearer` (a fetch
 * that refuses a header quotes the value it refused). For text that reaches a terminal, a log or an
 * AI client.
 */
export function redactToken(/** @type {string} */ text, /** @type {string | null | undefined} */ token) {
  const masked = token ? text.split(token).join("[token]") : text;
  return masked.replace(/Bearer\s+[^"']*/g, "Bearer [token]");
}

/**
 * A failed API call: the API's own error (`{ error, message, hint, docs }`), or a network failure
 * (`status` 0, `code` "network"). `login` also uses it for an answer that says no (declined, or a
 * code that ran out): the API was asked, so it's exit 1, not a usage mistake.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {{ error?: string, message?: string, hint?: string, docs?: string } | null} body
   * @param {string} [fallback]
   */
  constructor(status, body, fallback) {
    super(body?.message || fallback || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error ?? (status === 0 ? "network" : `http_${status}`);
    this.hint = body?.hint ?? null;
    this.docs = body?.docs ?? null;
    /** Seconds to wait before retrying (a 429's `Retry-After`), when the API said. */
    this.retryAfter = /** @type {number | null} */ (null);
  }
}

/**
 * @typedef {object} ClientOptions
 * @property {string} [apiUrl] The API base, `/v1` included.
 * @property {string | null} [token] An agent token (`mr_…`) for the account operations.
 * @property {typeof fetch} [fetch]
 * @property {string} userAgent
 */

/**
 * @typedef {object} CallOptions
 * @property {Record<string, string>} [params] Path parameters (`{slug}`).
 * @property {Record<string, string | number | undefined | null>} [query]
 * @property {unknown} [body] Sent as JSON.
 */

/** A client for the MakerRadar public API. Answers are the parsed JSON body (`{ data, … }`). */
export function createClient(/** @type {ClientOptions} */ opts) {
  const apiUrl = (opts.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch;
  // The caller drops a token it mustn't send; this is the last line, should one slip through.
  if (opts.token && !tokenSafeUrl(apiUrl)) {
    throw new Error(`Refusing to send a token over plain http to ${new URL(apiUrl).host}.`);
  }
  if (opts.token && !tokenShapeOk(opts.token)) {
    throw new Error("Refusing to send a token with spaces, line breaks or other characters a token never has.");
  }

  /**
   * @param {string} method
   * @param {string} pathAndQuery Relative to the API base (`/products?q=x`); a leading `/v1` is
   *   accepted too.
   * @param {unknown} [body]
   */
  async function request(method, pathAndQuery, body) {
    const basePath = new URL(apiUrl).pathname.replace(/\/+$/, "");
    const relative =
      basePath && pathAndQuery.startsWith(`${basePath}/`)
        ? pathAndQuery.slice(basePath.length)
        : pathAndQuery;
    const url = `${apiUrl}${relative.startsWith("/") ? "" : "/"}${relative}`;
    /** @type {Record<string, string>} */
    const headers = { accept: "application/json", "user-agent": opts.userAgent };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = redactToken(err instanceof Error ? err.message : String(err), opts.token);
      throw new ApiError(0, null, `Couldn't reach ${new URL(apiUrl).host}: ${reason}`);
    }
    let text;
    try {
      // The timeout covers the body too: a stalled answer is abandoned, not waited on forever.
      text = await res.text();
    } catch (err) {
      const reason = redactToken(err instanceof Error ? err.message : String(err), opts.token);
      throw new ApiError(0, null, `${new URL(apiUrl).host} stopped answering: ${reason}`);
    }
    /** @type {any} */
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      const error = new ApiError(
        res.status,
        parsed && typeof parsed === "object" ? parsed : null,
        `${method} ${relative} answered ${res.status}`,
      );
      const retry = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retry) && retry > 0) error.retryAfter = retry;
      throw error;
    }
    if (parsed === null && text) {
      throw new ApiError(res.status, null, `${method} ${relative} didn't answer with JSON`);
    }
    return parsed;
  }

  return {
    apiUrl,
    request,
    /**
     * Call one operation from `OPERATIONS`.
     * @param {import("./operations.js").OperationId} operationId
     * @param {CallOptions} [call]
     */
    call(operationId, call = {}) {
      const op = OPERATIONS[operationId];
      const path = op.path.replace(/\{(\w+)\}/g, (_, name) => {
        const value = call.params?.[name];
        if (!value) throw new Error(`${operationId}: missing ${name}`);
        return encodeURIComponent(value);
      });
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(call.query ?? {})) {
        if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
      }
      const qs = search.toString();
      return request(op.method, qs ? `${path}?${qs}` : path, call.body);
    },
  };
}

/** @typedef {ReturnType<typeof createClient>} Client */
