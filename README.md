# www.haoduobao.com.cn

浙江好多宝品牌管理有限公司现有官网 `www.haoduobao888.com` 的静态发布版本，用于先在 GitHub Pages 验证真机效果，再将 `www.haoduobao.com.cn` 接入阿里云 DNS。

## 快照范围

- 中文与英文共 210 个公开页面
- 93 个商品详情的中英文页面
- 1,113 个本地图片、图标、字体及页面资源
- 首页、栏目页、商品页、新闻页、品牌/服务页及其响应式手机布局
- 原站导航、轮播、悬浮联系方式、手机底栏、表单外观和验证码外观
- `sitemap.xml`、`robots.txt`、canonical 与 Open Graph 地址已指向新域名

## 本地验证

```bash
npm run validate
python3 -m http.server 4174 --directory site
```

打开 `http://127.0.0.1:4174/`。

## 更新快照

```bash
npm run mirror
npm run validate
```

`cache/` 仅用于本地抓取加速，不提交到 GitHub。`site/` 是 GitHub Pages 的完整发布目录。

## 域名切换

第一次发布先不配置自定义域名，以便通过项目的 `github.io` 地址完成浏览器与真机验证。本站使用 GitHub Actions 发布，因此自定义域名需要在 GitHub Pages 设置或 API 中配置，发布目录不依赖 `CNAME` 文件。

确认预览后，在 GitHub Pages 中设置 `www.haoduobao.com.cn`，再于阿里云 DNS 添加 `www` CNAME 和根域名 A 记录；GitHub Pages 会把根域名自动跳转到 `www`，并在 DNS 生效后签发 HTTPS 证书。
