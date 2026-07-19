import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";


async function walkFiles(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

export async function computeBrandVersion(projectDir) {
  const inputs = [
    "brand/haoduobao-logo.png",
    "static/static-enhancements.css",
    "static/static-enhancements.js",
  ];
  const overrideRoot = path.join(projectDir, "brand", "overrides");
  for (const relativePath of await walkFiles(overrideRoot)) {
    inputs.push(path.posix.join("brand/overrides", relativePath));
  }

  const hash = crypto.createHash("sha256");
  for (const relativePath of inputs.sort()) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(projectDir, relativePath)));
    hash.update("\0");
  }
  return `hdb-${hash.digest("hex").slice(0, 12)}`;
}
