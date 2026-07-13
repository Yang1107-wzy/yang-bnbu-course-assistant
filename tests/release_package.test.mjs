import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RELEASE_ASSETS,
  RELEASE_VERSION,
  checksumFile,
  formatChecksums,
  validateArchiveEntries
} from "../tools/release_package.js";

test("defines the three v1.2.0 GitHub Release assets", () => {
  assert.equal(RELEASE_VERSION, "1.2.0");
  assert.deepEqual(RELEASE_ASSETS, {
    userscript: "yang-bnbu-course-assistant.user.js",
    archive: "yang-bnbu-course-assistant-v1.2.0.zip",
    checksums: "SHA256SUMS.txt"
  });
});

test("accepts the source bundle allowlist and rejects private or generated paths", () => {
  const root = "yang-bnbu-course-assistant-v1.2.0/";
  assert.doesNotThrow(() => validateArchiveEntries([
    `${root}README.md`,
    `${root}LICENSE`,
    `${root}src/config_manager.js`,
    `${root}dist/yang-bnbu-course-assistant.user.js`
  ]));
  for (const forbidden of [".git/config", "node_modules/pkg/index.js", "PROJECT_MEMORY.md", "docs/superpowers/plan.md", "release/file.zip"]) {
    assert.throws(() => validateArchiveEntries([`${root}${forbidden}`]), /forbidden-release-path/);
  }
});

test("generates deterministic lowercase SHA-256 checksum lines", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yang-release-test-"));
  const first = join(directory, "first.txt");
  const second = join(directory, "second.txt");
  await writeFile(first, "abc", "utf8");
  await writeFile(second, "Yang", "utf8");

  const checksums = await Promise.all([
    checksumFile(first, "first.txt"),
    checksumFile(second, "second.txt")
  ]);
  assert.deepEqual(checksums[0], {
    name: "first.txt",
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  });
  assert.match(formatChecksums(checksums), /^[a-f0-9]{64}  first\.txt\n[a-f0-9]{64}  second\.txt\n$/);
});
