(() => {
  "use strict";

  const sourceOrigin = "http://www.haoduobao888.com";
  const sourceHosts = new Set(["haoduobao888.com", "www.haoduobao888.com"]);
  const currentScriptUrl = new URL(document.currentScript.src);
  const siteBaseUrl = new URL("../../", currentScriptUrl);
  const captchaUrl = new URL("captcha.png", currentScriptUrl).href;
  const runtimeImagePathByKey = new Map([
    [
      "0.ss.508sys.com/image/rimage/fromSite/loading/dot.gif",
      "assets/source/0.ss.508sys.com/image/rimage/fromSite/loading/dot.gif",
    ],
    [
      "0.ss.508sys.com/image/rimage/module/online_map/marker_red_sprite.png",
      "assets/source/0.ss.508sys.com/image/rimage/module/online_map/marker_red_sprite.png",
    ],
  ]);

  function toLocalSiteUrl(sourceUrl) {
    const url = new URL(sourceUrl);
    let pathname = url.pathname;
    if (["/", "/index.jsp", "/cn/index.jsp"].includes(pathname)) {
      pathname = "index.html";
    } else if (["/en", "/en/", "/en/index.jsp"].includes(pathname)) {
      pathname = "en/index.html";
    } else {
      pathname = pathname.replace(/^\/+/, "");
    }
    const local = new URL(pathname, siteBaseUrl);
    local.search = url.search;
    local.hash = url.hash;
    return local.href;
  }

  function fixAnchor(anchor) {
    const rawHref = anchor.getAttribute("href") || "";
    const phoneMatch = rawHref.match(
      /Mobi\.triggerServiceNumber\(\s*1\s*,\s*["']([0-9-]+)["']\s*\)/,
    );
    if (phoneMatch) {
      anchor.setAttribute("href", `tel:${phoneMatch[1]}`);
      return;
    }

    try {
      const url = new URL(anchor.href);
      if (sourceHosts.has(url.hostname)) {
        anchor.href = toLocalSiteUrl(url.href);
        return;
      }

      const isLegacyIndexPath = ["/index.jsp", "/cn/index.jsp", "/en/index.jsp"].includes(
        url.pathname,
      );
      if (url.origin === window.location.origin && isLegacyIndexPath) {
        anchor.href = toLocalSiteUrl(`${sourceOrigin}${url.pathname}${url.search}${url.hash}`);
        return;
      }

      const isKnownStaticPath =
        url.pathname === "/" ||
        /^\/(?:cn\/index\.jsp|index\.jsp|en\/?(?:index\.jsp)?|(?:en\/)?h-col-\d+\.html|(?:en\/)?sys-(?:nd|pd|por)\/\d+\.html)$/.test(
          url.pathname,
        );
      const alreadyUnderBase = url.pathname.startsWith(siteBaseUrl.pathname);
      if (
        url.origin === window.location.origin &&
        isKnownStaticPath &&
        siteBaseUrl.pathname !== "/" &&
        !alreadyUnderBase
      ) {
        anchor.href = toLocalSiteUrl(`${sourceOrigin}${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // Keep non-URL editor actions untouched.
    }
  }

  function fixImage(image) {
    if (image.matches("img.validateCode_img, img[src*='validateCode.jsp']")) {
      if (image.src !== captchaUrl) image.src = captchaUrl;
      return;
    }

    try {
      const url = new URL(image.src);
      const localPath = runtimeImagePathByKey.get(`${url.hostname}${url.pathname}`);
      if (!localPath) return;
      const localUrl = new URL(localPath, siteBaseUrl).href;
      if (image.src !== localUrl) image.src = localUrl;
    } catch {
      // Keep editor placeholders that are not valid URLs untouched.
    }
  }

  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.matches?.("a[href]")) fixAnchor(root);
    if (root.matches?.("img[src]")) fixImage(root);
    for (const anchor of root.querySelectorAll?.("a[href]") ?? []) fixAnchor(anchor);
    for (const image of root.querySelectorAll?.("img[src]") ?? []) fixImage(image);
  }

  scan(document);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") scan(record.target);
      for (const node of record.addedNodes) scan(node);
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["href", "src"],
    childList: true,
    subtree: true,
  });

  document.documentElement.dataset.staticMirror = "ready";
})();
