# folio. / 个人网站

纯 HTML、CSS 和 JavaScript，部署为 Cloudflare Workers Static Assets。站点文件位于 `my-site/public/`，不需要构建步骤或运行时框架。

## 本地预览与部署

```powershell
cd my-site
npm install
npx wrangler dev
```

本地预览通常位于 http://127.0.0.1:8787。首次部署前运行 `npx wrangler login` 完成 Cloudflare 授权，然后运行 `npx wrangler deploy`。

## 页面

网站包含序言、MovieDB、CryptoFactor、StudyJourney、联系五页。三个项目页左侧为功能介绍，右侧展示项目截图。点击缩略图可查看原图，点击关闭按钮或按 Escape 返回。

支持滚轮、方向键、Page Up/Down、Home/End、空格、触屏上下滑动和地址 hash 跳转。小屏内容超出时可在当前页滚动；系统减少动态效果偏好会关闭切换动画。

`my-site/public/assets/` 保存图片原图和缩略图。建筑照片来自 https://images.unsplash.com/photo-1487958449943-2429e8be8625 。

页面视觉效果由网站所有者检查。`output/playwright/` 中的旧记录属于先前页面版本，不能作为本轮视觉验收依据。
