// @ts-check

/**
 * Output helpers. Everything a listing says was written by its maker, and a terminal obeys escape
 * sequences: `clean` strips control characters (ESC included — no recolouring, cursor moves or fake
 * hyperlinks) and bidirectional overrides (no text that reads differently than it is) before any
 * API text is printed. `--json` output needs none of this: JSON escapes them.
 */

// C0 and C1 controls (but \t and \n when multiline), DEL, and the bidi embeddings/overrides/isolates.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;
const CONTROL_ONE_LINE = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/** Text from the API, safe to print: control characters out; one line unless `multiline`. */
export function clean(/** @type {unknown} */ value, { multiline = false } = {}) {
  const text = value === null || value === undefined ? "" : String(value);
  return multiline
    ? text.replace(/\r\n?/g, "\n").replace(CONTROL, "")
    : text.replace(/\s+/g, " ").replace(CONTROL_ONE_LINE, "").trim();
}

/**
 * Styling for a terminal that wants it: none when output isn't a TTY, `NO_COLOR` is set
 * (https://no-color.org) or `TERM=dumb`.
 * @param {{ isTTY?: boolean }} stream
 * @param {Record<string, string | undefined>} env
 */
export function styles(stream, env) {
  const on = Boolean(stream.isTTY) && !env.NO_COLOR && env.TERM !== "dumb";
  /** @param {string} open @param {string} close */
  const wrap = (open, close) => (/** @type {string} */ s) =>
    on ? `\u001b[${open}m${s}\u001b[${close}m` : s;
  return {
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
    green: wrap("32", "39"),
    yellow: wrap("33", "39"),
    red: wrap("31", "39"),
    cyan: wrap("36", "39"),
  };
}

/** @typedef {ReturnType<typeof styles>} Styles */

/** Columns padded to their widest cell (the last column isn't padded). */
export function table(/** @type {string[][]} */ rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, [...cell].length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => (i === row.length - 1 ? cell : cell + " ".repeat(widths[i] - [...cell].length)))
        .join("  "),
    )
    .join("\n");
}

/** A long text cut at a word, with an ellipsis. */
export function truncate(/** @type {string} */ text, /** @type {number} */ max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const PRICING = { free: "Free", freemium: "Freemium", paid: "Paid", open_source: "Open source" };

/** A pricing model as the site writes it. */
export function pricingLabel(/** @type {string} */ model) {
  return /** @type {Record<string, string>} */ (PRICING)[model] ?? clean(model);
}

/** A launch tier, with paid placements disclosed as such (the site's rule). */
export function tierLabel(/** @type {string} */ tier) {
  if (tier === "featured") return "Featured · paid";
  if (tier === "premium") return "Premium · paid";
  return "";
}
