import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const RELEASE_VERSION = "1.2.0";
export const RELEASE_ASSETS = Object.freeze({
  userscript: "yang-bnbu-course-assistant.user.js",
  archive: `yang-bnbu-course-assistant-v${RELEASE_VERSION}.zip`,
  checksums: "SHA256SUMS.txt"
});

export const checksumFile = async (path, name) => ({
  name,
  sha256: createHash("sha256").update(await readFile(path)).digest("hex")
});

export const formatChecksums = (checksums) => `${checksums
  .map(({ sha256, name }) => `${sha256}  ${name}`)
  .join("\n")}\n`;

export const validateArchiveEntries = (entries) => {
  const forbidden = entries.find((entry) => (
    entry.startsWith("/")
    || entry.split("/").includes("..")
    || /\/(?:\.git|node_modules|release)(?:\/|$)/.test(entry)
    || /\/docs\/superpowers(?:\/|$)/.test(entry)
    || /\/PROJECT_MEMORY\.md$/.test(entry)
  ));
  if (forbidden) throw new Error(`forbidden-release-path:${forbidden}`);
  return true;
};
