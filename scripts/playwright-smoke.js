async (page) => {
  const origin = "http://127.0.0.1:4174";
  const cases = [
    { viewport: [1440, 1000], paths: [
      "/",
      "/h-col-102.html",
      "/h-col-103.html",
      "/h-col-104.html",
      "/h-col-105.html",
      "/h-col-107.html",
      "/h-col-108.html",
      "/sys-pd/13.html",
      "/sys-nd/14.html",
      "/en/",
      "/en/sys-pd/13.html",
    ] },
    { viewport: [390, 844], paths: [
      "/",
      "/h-col-105.html",
      "/h-col-108.html",
      "/sys-pd/13.html",
      "/en/",
    ] },
  ];
  const results = [];

  for (const testCase of cases) {
    await page.setViewportSize({ width: testCase.viewport[0], height: testCase.viewport[1] });
    for (const pathname of testCase.paths) {
      const failedLocalRequests = [];
      const onResponse = (response) => {
        const url = response.url();
        if (url.startsWith(origin) && response.status() >= 400) {
          failedLocalRequests.push({ status: response.status(), url });
        }
      };
      page.on("response", onResponse);
      const response = await page.goto(`${origin}${pathname}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.evaluate(async () => {
        const step = Math.max(400, Math.round(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 35));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => ({
        title: document.title,
        mirror: document.documentElement.dataset.staticMirror,
        bodyTextLength: document.body?.innerText.trim().length ?? 0,
        images: document.images.length,
        brokenImages: [...document.images]
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src),
        remoteMediaImages: [...document.images]
          .map((image) => image.currentSrc || image.src)
          .filter(
            (url) =>
              /^https?:\/\//.test(url) &&
              !url.startsWith(location.origin) &&
              !/^https:\/\/(?:api\.map\.baidu\.com|apimaponline\d+\.bdimg\.com)\//.test(url),
          ),
        documentHeight: document.documentElement.scrollHeight,
      }));
      page.off("response", onResponse);

      results.push({
        viewport: testCase.viewport.join("x"),
        pathname,
        status: response?.status() ?? null,
        ...state,
        failedLocalRequests: failedLocalRequests.filter(
          ({ url }) =>
            !/\/(?:ajax|rajax|api\/guest|validateCode\.jsp)(?:[/?]|$)/i.test(url) &&
            !/\.(?:jpe?g|png)\.webp(?:[?#]|$)/i.test(url),
        ),
      });
    }
  }

  const failures = results.filter(
    (result) =>
      result.status !== 200 ||
      result.mirror !== "ready" ||
      result.bodyTextLength === 0 ||
      result.brokenImages.length > 0 ||
      result.remoteMediaImages.length > 0 ||
      result.failedLocalRequests.length > 0,
  );

  return { cases: results.length, failures, results };
}
