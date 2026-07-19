#!/usr/bin/env node

import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { computeBrandVersion } from "./brand-version.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const siteDir = path.join(projectDir, "site");
const staticDir = path.join(projectDir, "static");
const cacheDir = path.join(projectDir, "cache");

const sourceOrigin = "http://www.haoduobao888.com";
const sourceHostnames = new Set(["haoduobao888.com", "www.haoduobao888.com"]);
const targetOrigin = "https://www.haoduobao.com.cn";
const runtimeAssetUrls = [
  "https://0.ss.508sys.com/image/rimage/fromSite/loading/dot.gif",
  "https://0.ss.508sys.com/image/rimage/module/online_map/marker_red_sprite.png",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ!200x200.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ!400x400.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ!600x600.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw!200x200.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw!400x400.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw!600x600.png.webp",
  "https://31624010.s21i.faiusr.com/4/ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw.png.webp",
];
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 HaoduobaoStaticMirror/1.0";

const textEncoder = new TextEncoder();
let sourceIpPromise;

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFile(filePath, data) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, data);
}

function decodeResponseStream(response) {
  const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "br") return response.pipe(zlib.createBrotliDecompress());
  if (encoding === "deflate") return response.pipe(zlib.createInflate());
  if (encoding === "gzip") return response.pipe(zlib.createGunzip());
  return response;
}

function requestSource(options) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      options,
      (response) => {
        const stream = decodeResponseStream(response);
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", reject);
        stream.on("end", () => {
          const data = Buffer.concat(chunks);
          const headers = new Map(
            Object.entries(response.headers).map(([name, value]) => [
              name.toLowerCase(),
              Array.isArray(value) ? value.join(", ") : String(value ?? ""),
            ]),
          );
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: response.statusMessage ?? "",
            headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
            async arrayBuffer() {
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
            async text() {
              return data.toString("utf8");
            },
          });
        });
      },
    );
    request.setTimeout(60_000, () => request.destroy(new Error("Source request timed out")));
    request.on("error", reject);
  });
}

async function fetchSourceDirect(urlLike) {
  const url = new URL(urlLike, sourceOrigin);
  const headers = {
    Accept: "*/*",
    "Accept-Encoding": "br, gzip, deflate",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Host: "www.haoduobao888.com",
    "User-Agent": userAgent,
  };

  try {
    const proxied = await requestSource({
      host: "127.0.0.1",
      port: 10808,
      path: url.href,
      headers,
    });
    if (proxied.ok) return proxied;
  } catch {
    // Continue through the source's alternate edge when the local proxy is unavailable.
  }

  sourceIpPromise ??= dns.resolve4("haoduobao888.com").then((addresses) => {
    if (addresses.length === 0) throw new Error("No source IPv4 address found");
    return addresses[0];
  });
  const sourceIp = await sourceIpPromise;
  return requestSource({
    host: sourceIp,
    port: 80,
    path: `${url.pathname}${url.search}`,
    headers,
  });
}

async function fetchWithRetry(url, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const parsedUrl = new URL(url, sourceOrigin);
      const response = sourceHostnames.has(parsedUrl.hostname)
        ? await fetchSourceDirect(parsedUrl)
        : await fetch(parsedUrl, {
            redirect: "follow",
            signal: AbortSignal.timeout(60_000),
            headers: {
              "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
              "user-agent": userAgent,
            },
          });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
  throw new Error(`Fetch failed for ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  return response.text();
}

function isExpectedHtml(html) {
  return /<!doctype html>|<html[\s>]/i.test(html) && html.length >= 5_000;
}

async function fetchPageHtml(url, localPath) {
  const cachePath = path.join(cacheDir, "pages", localPath);
  try {
    const cached = await fs.readFile(cachePath, "utf8");
    if (isExpectedHtml(cached)) return cached;
  } catch {
    // The first run has no cache.
  }

  let lastError;
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    try {
      const html = await fetchText(url);
      if (!isExpectedHtml(html)) {
        throw new Error(`Unexpected HTML body (${html.length} bytes)`);
      }
      await writeFile(cachePath, html);
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 7) {
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
    }
  }

  throw new Error(`Unable to fetch page ${url}: ${lastError?.message ?? lastError}`);
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function normalizeSourcePageUrl(input) {
  const url = new URL(input, sourceOrigin);
  if (!sourceHostnames.has(url.hostname)) {
    throw new Error(`Unexpected page hostname: ${url.hostname}`);
  }
  url.protocol = "http:";
  url.hostname = "www.haoduobao888.com";
  url.hash = "";
  return url;
}

function localPagePath(urlLike) {
  const url = normalizeSourcePageUrl(urlLike);
  let pathname = url.pathname;

  if (["/", "/index.jsp", "/cn/index.jsp"].includes(pathname)) {
    return "index.html";
  }
  if (["/en", "/en/", "/en/index.jsp"].includes(pathname)) {
    return "en/index.html";
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  return pathname.replace(/^\/+/, "");
}

function publicPathForPage(urlLike) {
  const url = normalizeSourcePageUrl(urlLike);
  const pathname = url.pathname;
  if (["/", "/index.jsp", "/cn/index.jsp"].includes(pathname)) return "/";
  if (["/en", "/en/", "/en/index.jsp"].includes(pathname)) return "/en/";
  return pathname;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].trim(),
  );
}

function trimExtractedUrl(value) {
  return value
    .replaceAll("&amp;", "&")
    .replace(/&(url|title|desc|summary)=.*$/i, "")
    .replace(/[;,]+$/g, "")
    .replace(/&quot;.*$/g, "");
}

function canonicalAssetKey(urlLike) {
  const url = new URL(urlLike, sourceOrigin);
  url.hash = "";
  return `${url.hostname.toLowerCase()}${url.pathname}${url.search}`;
}

function shouldMirrorAsset(urlLike) {
  const url = new URL(urlLike, sourceOrigin);
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (hostname.endsWith(".faiusr.com")) return true;
  if (sourceHostnames.has(hostname) && pathname.endsWith("/validatecode.jsp")) {
    return true;
  }

  const isVisual = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(pathname);
  const isFont = /\.(?:eot|otf|ttf|woff2?)$/i.test(pathname);
  const isPlatformVisualPath = pathname.startsWith("/image/");
  const isPlatformFontPath = pathname.includes("/fontsicon");

  return isVisual || isFont || isPlatformVisualPath || isPlatformFontPath;
}

function extractAssetUrls(html) {
  const urls = new Map();
  const absolutePattern = /(?:https?:)?\/\/[a-z0-9.-]+(?::\d+)?\/[^\s"'<>\\)]*/gi;

  for (const match of html.matchAll(absolutePattern)) {
    const raw = trimExtractedUrl(match[0]);
    try {
      const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
      if (shouldMirrorAsset(normalized)) {
        urls.set(canonicalAssetKey(normalized), normalized);
      }
    } catch {
      // Ignore non-URL fragments embedded in editor content.
    }
  }

  const relativeCaptchaPattern = /\/validateCode\.jsp\?[^\s"'<>\\)]*/gi;
  for (const match of html.matchAll(relativeCaptchaPattern)) {
    const raw = trimExtractedUrl(match[0]);
    const normalized = new URL(raw, sourceOrigin).href;
    urls.set(canonicalAssetKey(normalized), normalized);
  }

  return urls;
}

const extensionByContentType = new Map([
  ["application/font-sfnt", ".ttf"],
  ["application/vnd.ms-fontobject", ".eot"],
  ["application/x-font-ttf", ".ttf"],
  ["font/otf", ".otf"],
  ["font/ttf", ".ttf"],
  ["font/woff", ".woff"],
  ["font/woff2", ".woff2"],
  ["image/avif", ".avif"],
  ["image/gif", ".gif"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/svg+xml", ".svg"],
  ["image/webp", ".webp"],
  ["image/x-icon", ".ico"],
]);

function sanitizeSegment(segment) {
  return segment.replace(/[^A-Za-z0-9._!~-]/g, "_");
}

function localAssetPath(urlLike, contentType) {
  const url = new URL(urlLike, sourceOrigin);
  const cleanSegments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(sanitizeSegment);

  if (cleanSegments.length === 0) cleanSegments.push("index");
  let filename = cleanSegments.at(-1);
  const hasKnownExtension = /\.(?:avif|eot|gif|ico|jpe?g|otf|png|svg|ttf|webp|woff2?)$/i.test(
    filename,
  );
  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  const inferredExtension = extensionByContentType.get(normalizedType) ?? ".bin";
  if (!hasKnownExtension) filename += inferredExtension;

  if (url.search) {
    const extension = path.posix.extname(filename);
    filename = `${filename.slice(0, -extension.length)}--${shortHash(url.search)}${extension}`;
  }
  cleanSegments[cleanSegments.length - 1] = filename;

  return path.posix.join("assets", "source", sanitizeSegment(url.hostname), ...cleanSegments);
}

const reusableContentTypes = [
  "application/octet-stream",
  ...extensionByContentType.keys(),
];

async function findExistingAsset(urlLike) {
  const seen = new Set();
  for (const contentType of reusableContentTypes) {
    const localPath = localAssetPath(urlLike, contentType);
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    try {
      const data = await fs.readFile(path.join(siteDir, localPath));
      return { data, localPath, contentType };
    } catch {
      // Try the next possible inferred extension.
    }
  }
  return null;
}

function relativeUrl(fromPagePath, toLocalPath) {
  const fromDir = path.posix.dirname(fromPagePath);
  const relative = path.posix.relative(fromDir, toLocalPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function rewriteAssetUrls(html, pagePath, assetMap) {
  const absolutePattern = /(?:https?:)?\/\/[a-z0-9.-]+(?::\d+)?\/[^\s"'<>\\)]*/gi;
  let rewritten = html.replace(absolutePattern, (rawValue) => {
    const raw = trimExtractedUrl(rawValue);
    let key;
    try {
      key = canonicalAssetKey(raw.startsWith("//") ? `https:${raw}` : raw);
    } catch {
      return rawValue;
    }
    const asset = assetMap.get(key);
    if (!asset) return rawValue;
    return rawValue.replace(raw, relativeUrl(pagePath, asset.localPath));
  });

  const relativeCaptchaPattern = /\/validateCode\.jsp\?[^\s"'<>\\)]*/gi;
  rewritten = rewritten.replace(relativeCaptchaPattern, (rawValue) => {
    const raw = trimExtractedUrl(rawValue);
    const key = canonicalAssetKey(new URL(raw, sourceOrigin).href);
    const asset = assetMap.get(key);
    if (!asset) return rawValue;
    return rawValue.replace(raw, relativeUrl(pagePath, asset.localPath));
  });

  return rewritten;
}

function resolveInternalSourceUrl(urlLike) {
  const url = normalizeSourcePageUrl(urlLike);
  const pathname = url.pathname;

  if (["/", "/index.jsp", "/cn/index.jsp"].includes(pathname)) {
    return { localPath: "index.html", search: url.search, hash: url.hash };
  }
  if (["/en", "/en/", "/en/index.jsp"].includes(pathname)) {
    return { localPath: "en/index.html", search: url.search, hash: url.hash };
  }
  return { localPath: localPagePath(url), search: url.search, hash: url.hash };
}

function rewriteInternalLinks(html, pagePath) {
  const sourceAbsolutePattern = /(?:https?:)?\/\/(?:www\.)?haoduobao888\.com(?:\/[^\s"'<>\\)]*)?/gi;
  let rewritten = html.replace(sourceAbsolutePattern, (rawValue) => {
    const raw = trimExtractedUrl(rawValue);
    try {
      const normalized = raw.startsWith("//") ? `http:${raw}` : raw;
      const target = resolveInternalSourceUrl(normalized);
      const local = relativeUrl(pagePath, target.localPath);
      return rawValue.replace(raw, `${local}${target.search}${target.hash}`);
    } catch {
      return rawValue;
    }
  });

  rewritten = rewritten.replace(
    /\bhref=(['"])(\/(?:cn\/index\.jsp|index\.jsp|en\/index\.jsp|en\/?))\1/gi,
    (_match, quote, sourcePath) => {
      const target = resolveInternalSourceUrl(`${sourceOrigin}${sourcePath}`);
      return `href=${quote}${relativeUrl(pagePath, target.localPath)}${quote}`;
    },
  );

  const encodedTargetOrigin = encodeURIComponent(targetOrigin);
  rewritten = rewritten
    .replaceAll("http%3A%2F%2Fwww.haoduobao888.com", encodedTargetOrigin)
    .replaceAll("http%3a%2f%2fwww.haoduobao888.com", encodedTargetOrigin.toLowerCase())
    .replaceAll("https%3A%2F%2Fwww.haoduobao888.com", encodedTargetOrigin)
    .replaceAll("https%3a%2f%2fwww.haoduobao888.com", encodedTargetOrigin.toLowerCase());

  return rewritten;
}

function updateMetadata(html, sourcePageUrl) {
  const canonical = `${targetOrigin}${publicPathForPage(sourcePageUrl)}`;
  let updated = html.replace(
    /<!--\s*<html><head><\/head><body><\/body><\/html>\s*-->/i,
    "",
  );
  updated = updated.replace(
    /<link\s+rel=(['"])canonical\1\s+href=(['"])[^'"]*\2\s*\/?>/i,
    `<link rel="canonical" href="${canonical}">`,
  );
  updated = updated.replace(
    /<meta\s+property=(['"])og:url\1\s+content=(['"])[^'"]*\2\s*\/?>/i,
    `<meta property="og:url" content="${canonical}">`,
  );
  const headStart = updated.toLowerCase().lastIndexOf("<head>");
  if (headStart !== -1) {
    const insertAt = headStart + "<head>".length;
    updated =
      updated.slice(0, insertAt) +
      '\n\t<meta name="generator" content="Haoduobao static mirror 2026-07-19">' +
      updated.slice(insertAt);
  }
  return updated;
}

function injectStaticEnhancements(html, pagePath, staticEnhancementVersion) {
  const scriptPath = `${relativeUrl(pagePath, "assets/site/static-enhancements.js")}?v=${staticEnhancementVersion}`;
  const cssPath = `${relativeUrl(pagePath, "assets/site/static-enhancements.css")}?v=${staticEnhancementVersion}`;
  let updated = html;
  const headEnd = updated.toLowerCase().lastIndexOf("</head>");
  if (headEnd !== -1) {
    updated =
      updated.slice(0, headEnd) +
      `\t<link rel="stylesheet" href="${cssPath}">\n` +
      updated.slice(headEnd);
  }
  const bodyEnd = updated.toLowerCase().lastIndexOf("</body>");
  if (bodyEnd !== -1) {
    updated =
      updated.slice(0, bodyEnd) +
      `\t<script defer src="${scriptPath}"></script>\n` +
      updated.slice(bodyEnd);
  }
  return updated;
}

async function main() {
  const staticEnhancementVersion = await computeBrandVersion(projectDir);
  await fs.mkdir(siteDir, { recursive: true });

  const [cnSitemap, enSitemap] = await Promise.all([
    fetchText(`${sourceOrigin}/sitemap.xml`),
    fetchText(`${sourceOrigin}/en/sitemap.xml`),
  ]);

  const pageUrlMap = new Map();
  for (const sitemapUrl of [...extractLocs(cnSitemap), ...extractLocs(enSitemap)]) {
    const url = normalizeSourcePageUrl(sitemapUrl);
    pageUrlMap.set(url.href, url);
  }
  const pageUrls = [...pageUrlMap.values()].sort((a, b) => a.pathname.localeCompare(b.pathname));

  process.stdout.write(`Fetching ${pageUrls.length} public pages...\n`);
  const pages = await mapPool(pageUrls, 3, async (url, index) => {
    const localPath = localPagePath(url);
    const html = await fetchPageHtml(url.href, localPath);
    if ((index + 1) % 25 === 0 || index + 1 === pageUrls.length) {
      process.stdout.write(`  ${index + 1}/${pageUrls.length}\n`);
    }
    return { sourceUrl: url, localPath, html };
  });

  const assetUrlMap = new Map();
  for (const page of pages) {
    for (const [key, value] of extractAssetUrls(page.html)) {
      assetUrlMap.set(key, value);
    }
  }
  for (const runtimeAssetUrl of runtimeAssetUrls) {
    assetUrlMap.set(canonicalAssetKey(runtimeAssetUrl), runtimeAssetUrl);
  }
  const assetEntries = [...assetUrlMap.entries()];
  process.stdout.write(`Fetching ${assetEntries.length} image/font assets...\n`);

  const assetResults = await mapPool(assetEntries, 12, async ([key, url], index) => {
    let fetchUrl = url;
    if (fetchUrl.startsWith("http://") && !sourceHostnames.has(new URL(fetchUrl).hostname)) {
      fetchUrl = `https://${fetchUrl.slice("http://".length)}`;
    }
    if (fetchUrl.startsWith("//")) fetchUrl = `https:${fetchUrl}`;

    const existing = await findExistingAsset(fetchUrl);
    let contentType;
    let data;
    let localPath;
    if (existing) {
      ({ contentType, data, localPath } = existing);
    } else {
      try {
        const response = await fetchWithRetry(fetchUrl);
        contentType = response.headers.get("content-type") ?? "application/octet-stream";
        data = Buffer.from(await response.arrayBuffer());
        localPath = localAssetPath(fetchUrl, contentType);
        await writeFile(path.join(siteDir, localPath), data);
      } catch (error) {
        process.stderr.write(`  skipped invalid asset ${fetchUrl}: ${error.message}\n`);
        return null;
      }
    }

    if ((index + 1) % 100 === 0 || index + 1 === assetEntries.length) {
      process.stdout.write(`  ${index + 1}/${assetEntries.length}\n`);
    }

    return {
      key,
      sourceUrl: fetchUrl,
      localPath,
      contentType,
      bytes: data.length,
      sha256: sha256(data),
    };
  });
  const mirroredAssets = assetResults.filter(Boolean);
  const assetMap = new Map(mirroredAssets.map((asset) => [asset.key, asset]));

  const pageManifest = [];
  for (const page of pages) {
    let html = rewriteAssetUrls(page.html, page.localPath, assetMap);
    html = rewriteInternalLinks(html, page.localPath);
    html = updateMetadata(html, page.sourceUrl);
    html = injectStaticEnhancements(html, page.localPath, staticEnhancementVersion);

    await writeFile(path.join(siteDir, page.localPath), html);
    pageManifest.push({
      sourceUrl: page.sourceUrl.href,
      publicPath: publicPathForPage(page.sourceUrl),
      localPath: page.localPath,
      bytes: textEncoder.encode(html).length,
      sha256: sha256(html),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemapUrls = pageManifest
    .map(
      (page) =>
        `  <url>\n    <loc>${targetOrigin}${page.publicPath}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n  </url>`,
    )
    .join("\n");
  await writeFile(
    path.join(siteDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${sitemapUrls}\n</urlset>\n`,
  );
  await writeFile(
    path.join(siteDir, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${targetOrigin}/sitemap.xml\n`,
  );
  await writeFile(path.join(siteDir, ".nojekyll"), "");
  await fs.rm(path.join(siteDir, "CNAME"), { force: true });
  await fs.cp(staticDir, path.join(siteDir, "assets", "site"), {
    recursive: true,
  });

  const assetBytes = mirroredAssets.reduce((sum, asset) => sum + asset.bytes, 0);
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceOrigin,
    targetOrigin,
    pages: pageManifest,
    assets: mirroredAssets,
    totals: {
      pages: pageManifest.length,
      assets: mirroredAssets.length,
      assetBytes,
    },
  };
  await writeFile(
    path.join(siteDir, "mirror-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stdout.write(
    `Mirror complete: ${pageManifest.length} pages, ${mirroredAssets.length} assets, ` +
      `${(assetBytes / 1024 / 1024).toFixed(1)} MiB.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
