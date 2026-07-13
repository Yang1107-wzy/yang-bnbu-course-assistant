import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  RELEASE_ASSETS,
  RELEASE_VERSION,
  checksumFile,
  formatChecksums
} from "./release_package.js";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDirectory = join(root, "release");
const bundleName = `yang-bnbu-course-assistant-v${RELEASE_VERSION}`;
const bundleDirectory = join(releaseDirectory, bundleName);
const distUserscript = join(root, "dist", RELEASE_ASSETS.userscript);
const releaseUserscript = join(releaseDirectory, RELEASE_ASSETS.userscript);
const archive = join(releaseDirectory, RELEASE_ASSETS.archive);

const publicSourceEntries = [
  ".github",
  "src",
  "tests",
  "tools",
  "docs",
  ".gitignore",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "build.mjs",
  "course_targets.example.json",
  "eslint.config.js",
  "package-lock.json",
  "package.json"
];

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(join(bundleDirectory, "dist"), { recursive: true });

for (const entry of publicSourceEntries) {
  await cp(join(root, entry), join(bundleDirectory, entry), { recursive: true });
}
await cp(distUserscript, join(bundleDirectory, "dist", RELEASE_ASSETS.userscript));
await cp(distUserscript, releaseUserscript);

await run("zip", ["-X", "-q", "-r", RELEASE_ASSETS.archive, bundleName], { cwd: releaseDirectory });
await rm(bundleDirectory, { recursive: true, force: true });

const checksums = await Promise.all([
  checksumFile(releaseUserscript, RELEASE_ASSETS.userscript),
  checksumFile(archive, RELEASE_ASSETS.archive)
]);
await writeFile(join(releaseDirectory, RELEASE_ASSETS.checksums), formatChecksums(checksums), "utf8");

console.log(JSON.stringify({ version: RELEASE_VERSION, assets: RELEASE_ASSETS, checksums }, null, 2));
