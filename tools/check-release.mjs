import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  RELEASE_ASSETS,
  RELEASE_VERSION,
  checksumFile,
  formatChecksums,
  validateArchiveEntries
} from "./release_package.js";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDirectory = join(root, "release");
const expectedAssets = Object.values(RELEASE_ASSETS).sort();
assert.deepEqual((await readdir(releaseDirectory)).sort(), expectedAssets, "release directory must contain exactly three public assets");

const archivePath = join(releaseDirectory, RELEASE_ASSETS.archive);
const { stdout } = await run("unzip", ["-Z1", archivePath]);
const entries = stdout.trim().split(/\r?\n/).filter(Boolean);
validateArchiveEntries(entries);

const bundleRoot = `yang-bnbu-course-assistant-v${RELEASE_VERSION}/`;
for (const required of [
  `${bundleRoot}README.md`,
  `${bundleRoot}LICENSE`,
  `${bundleRoot}src/config_manager.js`,
  `${bundleRoot}dist/${RELEASE_ASSETS.userscript}`
]) {
  assert.ok(entries.includes(required), `release archive is missing ${required}`);
}

const checksums = await Promise.all([
  checksumFile(join(releaseDirectory, RELEASE_ASSETS.userscript), RELEASE_ASSETS.userscript),
  checksumFile(archivePath, RELEASE_ASSETS.archive)
]);
const checksumText = await readFile(join(releaseDirectory, RELEASE_ASSETS.checksums), "utf8");
assert.equal(checksumText, formatChecksums(checksums), "SHA256SUMS.txt does not match release assets");

console.log(`release safety check passed (${entries.length} archive entries)`);
