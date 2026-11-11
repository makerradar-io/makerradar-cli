// @ts-check
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

/**
 * The skills folder: one SKILL.md per skill, its frontmatter naming its folder, and every skill the
 * mirrored index lists present with the digest the index states (the index and the files come from
 * one `npm run sync:skills`). `skills/makerradar/SKILL.md` is the hand-written umbrella.
 */
const root = new URL("../skills/", import.meta.url);
const skills = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("skills/", () => {
  it("has a SKILL.md per folder whose frontmatter names the folder", () => {
    assert.ok(skills.length >= 2);
    for (const name of skills) {
      const text = readFileSync(new URL(`${name}/SKILL.md`, root), "utf8");
      const match = text.match(/^---\nname: ([a-z0-9-]+)\n(?:description: .+\n)+---\n/s);
      assert.ok(match, `${name}: frontmatter with name and description`);
      assert.equal(match?.[1], name, `${name}: frontmatter name is its folder`);
    }
  });

  it("mirrors every skill the index lists, byte for byte", () => {
    const indexFile = new URL("index.json", root);
    assert.ok(existsSync(indexFile), "skills/index.json (from sync-skills)");
    const index = JSON.parse(readFileSync(indexFile, "utf8"));
    assert.ok(Array.isArray(index.skills) && index.skills.length > 0);
    for (const entry of index.skills) {
      const text = readFileSync(new URL(`${entry.name}/SKILL.md`, root), "utf8");
      const digest = `sha256:${createHash("sha256").update(text).digest("hex")}`;
      assert.equal(digest, entry.digest, `${entry.name}: digest`);
      assert.ok(entry.url.endsWith(`/.well-known/agent-skills/${entry.name}/SKILL.md`));
    }
    assert.ok(skills.includes("makerradar"), "the umbrella skill stays");
  });
});
