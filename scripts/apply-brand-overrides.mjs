#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { computeBrandVersion } from "./brand-version.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const siteDir = path.join(projectDir, "site");
const brandDir = path.join(projectDir, "brand");
const overrideDir = path.join(brandDir, "overrides");
const staticDir = path.join(projectDir, "static");

const desktopStem = "ABUIABAEGAAgkJygqAYozI2QhAUw7Aw4hww";
const desktopWidth = 1644;
const desktopHeight = 722;
const cnMobileStem = "ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ";
const enMobileStem = "ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw";
const faviconStem = "ABUIABAEGAAgy__5qAYo3OqrHzDwDDiQDg";

const brandFilenames = [
  `${desktopStem}!1000x1000.png.webp`,
  `${desktopStem}!1500x1500.png.webp`,
  `${desktopStem}!200x200.png.webp`,
  `${desktopStem}!400x400.png.webp`,
  `${desktopStem}!600x600.png.webp`,
  `${desktopStem}!800x800.png.webp`,
  `${desktopStem}.png.webp`,
  `${desktopStem}.png`,
  `${cnMobileStem}!200x200.png.webp`,
  `${cnMobileStem}!400x400.png.webp`,
  `${cnMobileStem}!600x600.png.webp`,
  `${cnMobileStem}.png.webp`,
  `${cnMobileStem}.png`,
  `${enMobileStem}!200x200.png.webp`,
  `${enMobileStem}!400x400.png.webp`,
  `${enMobileStem}!600x600.png.webp`,
  `${enMobileStem}.png.webp`,
  `${enMobileStem}.png`,
  `${faviconStem}.ico`,
].sort((a, b) => b.length - a.length);

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function ensureParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function brandContentType(localPath) {
  if (localPath.endsWith(".webp")) return "image/webp";
  if (localPath.endsWith(".png")) return "image/png";
  if (localPath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function updateBrandMarkup(html, brandVersion) {
  let updated = html
    .replaceAll('"w":1644,"h":1543,"psrc":', '"w":1644,"h":722,"psrc":')
    .replaceAll('"w":1644,"h":723,"psrc":', '"w":1644,"h":722,"psrc":')
    .replaceAll('"cflw":1644,"cflh":1543', '"cflw":1644,"cflh":722')
    .replaceAll('"cflw":1644,"cflh":723', '"cflw":1644,"cflh":722')
    .replaceAll('"lh":1543,"lw":1644', '"lh":722,"lw":1644')
    .replaceAll('"lh":723,"lw":1644', '"lh":722,"lw":1644')
    .replaceAll('"lh":752,"lw":2168', '"lh":341,"lw":776')
    .replaceAll('"lh":107,"lw":679', '"lh":341,"lw":776');

  updated = updated
    .replace(/\?brand=[A-Za-z0-9_-]+/g, `?brand=${brandVersion}`)
    .replace(
      /static-enhancements\.css(?:\?v=[^"']+)?/g,
      `static-enhancements.css?v=${brandVersion}`,
    )
    .replace(
      /static-enhancements\.js(?:\?v=[^"']+)?/g,
      `static-enhancements.js?v=${brandVersion}`,
    );

  updated = updated.replace(
    /(id="jz_website_title"[^>]*style="height:(\d+)px;"><div class="logo_wrap" style="width:)[^;]+/g,
    (_match, prefix, height) =>
      `${prefix}${(Number(height) * desktopWidth) / desktopHeight}px`,
  );

  for (const filename of brandFilenames) {
    const matcher = new RegExp(`${escapeRegExp(filename)}(?![.!?])`, "g");
    updated = updated.replace(matcher, `${filename}?brand=${brandVersion}`);
  }
  return updated;
}

async function copyNamedBrandAssets() {
  const copies = [
    [path.join(brandDir, "haoduobao-logo.png"), "haoduobao-logo.png"],
    [path.join(brandDir, "haoduobao-favicon.png"), "haoduobao-favicon.png"],
    [
      path.join(
        overrideDir,
        "assets/source/31624010.s21i.faiusr.com/5",
        `${faviconStem}.ico`,
      ),
      "haoduobao-favicon.ico",
    ],
  ];
  for (const [sourcePath, filename] of copies) {
    const data = await fs.readFile(sourcePath);
    for (const destinationDir of [staticDir, path.join(siteDir, "assets", "site")]) {
      const destinationPath = path.join(destinationDir, filename);
      await ensureParent(destinationPath);
      await fs.writeFile(destinationPath, data);
    }
  }

  for (const filename of ["static-enhancements.css", "static-enhancements.js"]) {
    const sourcePath = path.join(staticDir, filename);
    const destinationPath = path.join(siteDir, "assets", "site", filename);
    await ensureParent(destinationPath);
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function main() {
  const brandVersion = await computeBrandVersion(projectDir);
  const manifestPath = path.join(siteDir, "mirror-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const assetByPath = new Map(manifest.assets.map((asset) => [asset.localPath, asset]));

  const overridePaths = (await walkFiles(overrideDir)).sort();
  let addedAssets = 0;
  for (const localPath of overridePaths) {
    let asset = assetByPath.get(localPath);
    if (!asset) {
      if (!localPath.startsWith("assets/source/")) {
        throw new Error(`Brand override cannot be mapped to a source URL: ${localPath}`);
      }
      const key = localPath.slice("assets/source/".length);
      asset = {
        key,
        sourceUrl: `https://${key}`,
        localPath,
        contentType: brandContentType(localPath),
        bytes: 0,
        sha256: "",
      };
      manifest.assets.push(asset);
      assetByPath.set(localPath, asset);
      addedAssets += 1;
    }
    const data = await fs.readFile(path.join(overrideDir, localPath));
    const destinationPath = path.join(siteDir, localPath);
    await ensureParent(destinationPath);
    await fs.writeFile(destinationPath, data);
    asset.bytes = data.length;
    asset.sha256 = sha256(data);
    asset.contentType = brandContentType(localPath);
  }

  let updatedPages = 0;
  for (const page of manifest.pages) {
    const pagePath = path.join(siteDir, page.localPath);
    const original = await fs.readFile(pagePath, "utf8");
    const updated = updateBrandMarkup(original, brandVersion);
    if (updated !== original) {
      await fs.writeFile(pagePath, updated);
      updatedPages += 1;
    }
    const data = Buffer.from(updated);
    page.bytes = data.length;
    page.sha256 = sha256(data);
  }

  await copyNamedBrandAssets();

  manifest.brand = {
    version: brandVersion,
    master: "brand/haoduobao-logo.png",
    overrides: overridePaths,
  };
  manifest.totals.assets = manifest.assets.length;
  manifest.totals.assetBytes = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(
    `Applied Haoduobao brand ${brandVersion}: ${overridePaths.length} assets ` +
      `(${addedAssets} added to the mirror), ` +
      `${updatedPages} changed pages, ${manifest.pages.length} verified page hashes.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
