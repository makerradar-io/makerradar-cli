// @ts-check
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * An environment variable's value, or undefined when it's unset, empty or only spaces — so
 * `MAKERRADAR_TOKEN=` in a CI file means "no token", not a token of "".
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
export function envValue(env, name) {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Where the CLI keeps the agent token a person approved: one small JSON file, readable by its owner
 * only (0600, in a 0700 directory). `MAKERRADAR_CONFIG` names another file; on Windows it's under
 * `%APPDATA%`, elsewhere `$XDG_CONFIG_HOME` (default `~/.config`). A token is kept per API URL, so
 * a staging login never stands in for production.
 *
 * @param {Record<string, string | undefined>} env
 * @param {NodeJS.Platform} [platform]
 */
export function configPath(env, platform = process.platform) {
  const named = envValue(env, "MAKERRADAR_CONFIG");
  if (named) return named;
  const base =
    platform === "win32"
      ? envValue(env, "APPDATA") || join(homedir(), "AppData", "Roaming")
      : envValue(env, "XDG_CONFIG_HOME") || join(homedir(), ".config");
  return join(base, "makerradar", "config.json");
}

/**
 * @typedef {object} SavedToken
 * @property {string} token
 * @property {string[]} scopes
 * @property {string | null} expiresAt
 * @property {string | null} handle
 * @property {string} savedAt
 */

/** @typedef {{ tokens?: Record<string, SavedToken> }} Config */

/** The saved config, or an empty one when there's none (or it isn't readable JSON). */
export async function readConfig(/** @type {string} */ path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return /** @type {Config} */ (parsed && typeof parsed === "object" ? parsed : {});
  } catch {
    return /** @type {Config} */ ({});
  }
}

/**
 * Write the config for its owner's eyes only, atomically: the new file is written beside the old one
 * (created 0600, so the token is never readable by others even for a moment) and renamed over it. A
 * crash or a full disk mid-write leaves the old config, never half a file.
 */
export async function writeConfig(/** @type {string} */ path, /** @type {Config} */ config) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(temp, 0o600).catch(() => {});
    await rename(temp, path);
  } catch (err) {
    await rm(temp, { force: true }).catch(() => {});
    throw err;
  }
}

/** The saved token for this API, or null. */
export async function savedToken(/** @type {string} */ path, /** @type {string} */ apiUrl) {
  const config = await readConfig(path);
  return config.tokens?.[apiUrl] ?? null;
}

/** Save the token for this API (replacing any before it). */
export async function saveToken(
  /** @type {string} */ path,
  /** @type {string} */ apiUrl,
  /** @type {SavedToken} */ saved,
) {
  const config = await readConfig(path);
  await writeConfig(path, { ...config, tokens: { ...config.tokens, [apiUrl]: saved } });
}

/** Forget this API's token; the file goes when nothing is left in it. Whether there was one. */
export async function forgetToken(/** @type {string} */ path, /** @type {string} */ apiUrl) {
  const config = await readConfig(path);
  if (!config.tokens?.[apiUrl]) return false;
  const { [apiUrl]: _gone, ...rest } = config.tokens;
  if (Object.keys(rest).length === 0) await rm(path, { force: true });
  else await writeConfig(path, { ...config, tokens: rest });
  return true;
}
