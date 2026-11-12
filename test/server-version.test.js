import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextServerVersion, parseVersion } from "../scripts/server-version.mjs";

describe("nextServerVersion", () => {
  it("moves the server version by the package's step", () => {
    assert.equal(nextServerVersion("1.0.0", "0.3.0", "0.4.0"), "1.1.0");
    assert.equal(nextServerVersion("1.1.0", "0.4.0", "0.4.1"), "1.1.1");
    assert.equal(nextServerVersion("1.1.1", "0.4.1", "1.0.0"), "2.0.0");
    assert.equal(nextServerVersion("1.2.3", "0.4.1", "0.5.0"), "1.3.0");
  });

  it("leaves it alone when the package didn't move, and bumps the patch when it can't tell", () => {
    assert.equal(nextServerVersion("1.0.0", "0.3.0", "0.3.0"), "1.0.0");
    assert.equal(nextServerVersion("1.0.0", "0.0.0-stage", "0.0.1"), "1.0.1");
    assert.equal(nextServerVersion("1.0.0", undefined, "0.4.0"), "1.0.1");
    assert.throws(() => nextServerVersion("latest", "0.3.0", "0.4.0"), /major\.minor\.patch/);
  });

  it("reads major.minor.patch, ignoring a pre-release suffix", () => {
    assert.deepEqual(parseVersion("0.0.0-stage"), [0, 0, 0]);
    assert.equal(parseVersion("v1"), null);
  });
});
