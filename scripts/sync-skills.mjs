// @ts-check
/**
 * Mirror the agent skills the site serves into `skills/<name>/SKILL.md`.
 *
 * The source of truth is the product (private monorepo): it renders every SKILL.md from code and
 * serves them with digests at `/.well-known/agent-skills/index.json`. Skill registries crawl GitHub,
 * not the site, so this public repo carries copies — generated, never hand-written, so they can't
 * drift. `skills/makerradar/SKILL.md` is the one hand-written file: the umbrella that points here.
 *
 *   node scripts/sync-skills.mjs            # fetch, verify each digest, write the files
 *   node scripts/sync-skills.mjs --check    # CI: exit 1 when a served skill differs from its copy
 *
 * A skill in this repo that the site doesn't serve yet (shipped here ahead of a deploy) is a
 * warning, not a failure; a served skill whose copy differs, or is missing, fails `--check`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const SITE = process.env.MAKERRADAR_SITE_URL ?? "https://makerradar.io";
const INDEX_URL = `${SITE}/.well-known/agent-skills/index.json`;
const root = new URL("../", import.meta.url);
const skillsDir = new URL("skills/", root);
const check = process.argv.includes("--check");

/** The hand-written umbrella skill — never synced. */
const UMBRELLA = "makerradar";

const sha256 = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "makerradar-cli sync-skills" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

const index = JSON.parse(await fetchText(INDEX_URL));
if (!Array.isArray(index.skills)) throw new Error(`${INDEX_URL}: no skills[]`);

let drift = 0;
const served = new Set();
for (const entry of index.skills) {
  const { name, url, digest } = entry;
  if (typeof name !== "string" || !/^[a-z0-9-]+$/.test(name)) throw new Error(`bad skill name ${name}`);
  served.add(name);
  const text = await fetchText(url);
  if (sha256(text) !== digest) throw new Error(`${name}: digest mismatch (index says ${digest})`);
  const dir = new URL(`${name}/`, skillsDir);
  const file = new URL("SKILL.md", dir);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === text) continue;
  drift += 1;
  if (check) {
    console.error(`${name}: ${current === null ? "missing" : "differs from the served SKILL.md"}`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text);
  console.log(`skills/${name}/SKILL.md: ${current === null ? "added" : "updated"}`);
}

const indexFile = new URL("index.json", skillsDir);
const indexText = `${JSON.stringify(index, null, 2)}\n`;
if (!existsSync(indexFile) || readFileSync(indexFile, "utf8") !== indexText) {
  if (check) {
    drift += 1;
    console.error("skills/index.json differs from the served index");
  } else {
    writeFileSync(indexFile, indexText);
    console.log("skills/index.json: updated");
  }
}

for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === UMBRELLA || served.has(dir.name)) continue;
  console.warn(`skills/${dir.name}: in this repo but not served by ${SITE} yet (ahead of a deploy?)`);
}

if (check && drift > 0) {
  console.error(`\n${drift} skill file(s) drifted — run \`npm run sync:skills\` and commit.`);
  process.exit(1);
}
console.log(check ? "skills are in step with the site" : "done");
