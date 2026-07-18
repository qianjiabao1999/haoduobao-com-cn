#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const siteDir = path.join(projectDir, "site");
const expectedTargetOrigin = "https://haoduobao.com.cn";
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function readSiteFile(localPath) {
  return fs.readFile(path.join(siteDir, localPath));
}

async function fileExists(localPath) {
  try {
    await fs.access(path.join(siteDir, localPath));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(siteDir, "mirror-manifest.json"), "utf8"));

  assert(manifest.sourceOrigin === "http://www.haoduobao888.com", "source origin changed");
  assert(manifest.targetOrigin === expectedTargetOrigin, "target origin changed");
  assert(manifest.totals.pages === 210, `expected 210 pages, found ${manifest.totals.pages}`);
  assert(manifest.totals.assets === 1113, `expected 1113 assets, found ${manifest.totals.assets}`);
  assert(manifest.totals.assetBytes > 180 * 1024 * 1024, "asset snapshot is unexpectedly small");

  const pagePaths = new Set();
  const publicPaths = new Set();
  for (const page of manifest.pages) {
    pagePaths.add(page.localPath);
    publicPaths.add(page.publicPath);
    const data = await readSiteFile(page.localPath);
    const html = data.toString("utf8");
    assert(data.length === page.bytes, `${page.localPath}: byte count differs from manifest`);
    assert(sha256(data) === page.sha256, `${page.localPath}: hash differs from manifest`);
    assert(
      html.includes(`<link rel="canonical" href="${expectedTargetOrigin}${page.publicPath}">`),
      `${page.localPath}: canonical URL is missing or wrong`,
    );
    assert(
      (html.match(/static-enhancements\.css/g) ?? []).length === 1,
      `${page.localPath}: compatibility CSS is missing or duplicated`,
    );
    assert(
      (html.match(/static-enhancements\.js/g) ?? []).length === 1,
      `${page.localPath}: compatibility JS is missing or duplicated`,
    );
  }

  assert(pagePaths.size === 210, `expected 210 unique local page paths, found ${pagePaths.size}`);
  assert(publicPaths.size === 210, `expected 210 unique public paths, found ${publicPaths.size}`);

  const assetPaths = new Set();
  let verifiedAssetBytes = 0;
  for (const asset of manifest.assets) {
    assetPaths.add(asset.localPath);
    const data = await readSiteFile(asset.localPath);
    verifiedAssetBytes += data.length;
    assert(data.length === asset.bytes, `${asset.localPath}: byte count differs from manifest`);
    assert(sha256(data) === asset.sha256, `${asset.localPath}: hash differs from manifest`);
  }
  assert(assetPaths.size === 1113, `expected 1113 unique asset paths, found ${assetPaths.size}`);
  assert(
    verifiedAssetBytes === manifest.totals.assetBytes,
    "verified asset byte total differs from manifest",
  );

  const sitemap = await fs.readFile(path.join(siteDir, "sitemap.xml"), "utf8");
  const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert(sitemapLocs.length === 210, `expected 210 sitemap URLs, found ${sitemapLocs.length}`);
  assert(new Set(sitemapLocs).size === 210, "sitemap contains duplicate URLs");
  assert(
    sitemapLocs.every((url) => url.startsWith(`${expectedTargetOrigin}/`)),
    "sitemap contains a URL outside the target domain",
  );

  for (const required of [
    ".nojekyll",
    "index.html",
    "en/index.html",
    "robots.txt",
    "assets/site/captcha.png",
    "assets/site/static-enhancements.css",
    "assets/site/static-enhancements.js",
  ]) {
    assert(await fileExists(required), `required file is missing: ${required}`);
  }

  if (failures.length > 0) {
    process.stderr.write(`Validation failed (${failures.length}):\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Validated ${manifest.totals.pages} pages, ${manifest.totals.assets} local assets, ` +
      `${(verifiedAssetBytes / 1024 / 1024).toFixed(1)} MiB, and ${sitemapLocs.length} sitemap URLs.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
