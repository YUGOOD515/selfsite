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

网站包含序言、VERDANT、CryptoFactor、SCENT DIALOGUE、MovieDB、StudyJourney、QuantChain、汽车研究、《雾港七日》与联系十页。QuantChain 位于 Forecasts meet context（汽车研究）之前，展示供应链数字化与企业现金持有研究，按顺序选用 quantchain 演示稿的第 2、3、4、5、8、10、16、22 页。SCENT DIALOGUE 位于 CryptoFactor 与 MovieDB 之间，展示欧莱雅 BrandStorm 2026 中国赛区 Top 200 经历、香氛概念方案及证书。VERDANT 位于项目展示首位，介绍 Hackathon S1 & ETH Wuhan 获奖经历、加密货币数字指纹及 WebMCP，标题链接至项目展示站。项目页左侧为功能介绍，右侧叠放项目截图；汽车研究页叠放五张图表，《雾港七日》页可切换场景档案、结局画面和三列两行的人物立绘。点击任意项目图片时，选中卡片通过单段变换移到视口中央并放大，文字、其余卡片及分类按钮同步淡出位移；页面双栏与页面高度保持原位，图片边框按图片比例与可用视口适配。等待超过 300ms 才显示 Lucide 转圈与“原图加载中”，期间保留预览图；原图解码后隐藏等待提示并与预览图交叉淡化，加载失败时停止等待并保留预览图。点击关闭按钮或按 Escape 时，图片反向缩回卡片原位置，文字与其余卡片同步恢复；切换页面或进入目录时立即清理动画、等待计时器与预览状态。减少动态效果模式使用静态等待图标并直接切换。

十个页面沿竖直方向连续排列。鼠标滚轮按一次手势切换到相邻页，使用浏览器原生平滑滚动；触控板与触屏保留原生跟手滚动和惯性，松手后通过 CSS Scroll Snap 自动吸附到页面边界，单次滑动不会直接跨过整页。内容超过一屏时仍可在页内滚动。移动端内容页与主画布使用 100svh 稳定布局高度，避免浏览器地址栏伸缩改变页面边界；目录覆盖层保留 100dvh，随当前可视区域调整，并保留底部安全区留白。滚轮与触控板依据滚动单位、步长及连续事件特征区分，无法确定的细粒度输入优先保留原生行为。目录导航、站内链接和地址 hash 可直接定位页面；系统减少动态效果偏好会关闭逐页缓动。

每个内容页均可通过左上角的“目录页”按钮进入完整目录。目录沿用内容页版心、字体与配色，序言、项目区域、联系入口上下排列并左对齐，项目区域按内容宽度排列，项目之间水平间距固定为 64px，空间不足时整组自动换行，各行无需对齐列线；目录大标题使用项目页的小标题并带箭头，下方小字使用项目页的大标题。复用首页与联系页的正文和小字样式，中文采用较粗字重，具体联系方式集中在最后的联系页，项目列表直接读取各项目页的标题，按上述对应关系同步文字，并用圆点定位图标标记当前页。目录固定在内容画布上方：打开时内容页保持不动，桌面端目录由上向下覆盖，移动端从左侧滑入；选择条目后，目标页在下层直接就位，目录沿原方向退回（桌面端向上、移动端向左）。返回按钮或 Escape 回到原页面。原生 dialog 管理键盘焦点与背景交互，目录内部可滚动；减少动态效果模式直接切换。

首页左侧为个人介绍，右侧为技能方向、技术栈与 Simon Sinek 引语。首页、目录与结尾共用字符流体背景，适配自 [23rd ASCII Fluid](https://23rd.dev/docs/components/ascii-fluid) 的零依赖 WebGL 引擎，源码位于 `public/vendor/ascii-fluid.js`，控制逻辑位于 `public/intro.js`。本地适配增加了初始字符场与缓慢补墨，限制为 30 fps 并限制像素比。通过 modulepreload 提前加载背景模块，并在初次加载时初始化首页、目录和结尾并绘制首帧，就绪后才显示画布；离屏保留已绘制内容，只有实际尺寸变化才调整画布并重绘。只持续运行可见页面的流体，切到后台时暂停，减少动态效果模式保留静止画面。WebGL 不可用时回退为纯色背景。建筑配图与配文已移除，原始素材仍保留在本地。

全站界面图标使用 [Lucide](https://lucide.dev/guide/) 1.54.0，按需打包 ArrowRight、CircleDot、List、LoaderCircle、X 五个图标与 SVG 工厂到 `public/vendor/lucide.js`，不依赖外部 CDN。公共封装位于 `public/icons.js`，浏览器标签图标使用内嵌的 Lucide CodeXml，完整许可保留在 `public/vendor/lucide-LICENSE.txt`。

`my-site/public/assets/` 保存图片原图和缩略图。画廊进入可见范围前才加载 WebP 缩略图，Galgame 的三个分类会一同预加载；大尺寸原图只在点击放大时请求。

汽车研究图表由 `scripts/build_auto_figures.py` 从本机项目工作簿及新闻归档汇总生成，网页只包含汇总图，不包含原始业务数据或新闻正文。全国新能源汽车产量来自国家统计局 2024、2025 年统计公报。样本和公式见 `docs/auto-figures.md`。使用安装了 `openpyxl` 的 Python 运行该脚本；若项目不在默认位置，先设置 `AUTO_RESEARCH_PROJECT` 为项目目录。

所有项目与游戏的 WebP 缩略图统一由 `python scripts/build_thumbnails.py` 从原图生成，需要 Pillow。缩略图与原图同名，仅扩展名改为 `.webp`；人物立绘上限为 480×720，其余图片为 960×600。可用 `--directory loreal` 只生成指定素材目录的缩略图，可搭配 `--files slide-02.png slide-03.png` 仅生成指定原图的缩略图，用 `--output <目录>` 指定生成目录，原图保留用于放大查看。

图片清单位于 `my-site/public/app.js` 的 `galleries`：每张图显式记录文件名、标题，可选叠放位置和来源链接。来源与图片绑定，增加图片不依赖预设总数；未指定位置时使用默认叠放位置。无论点击翻页、直接滚动还是地址跳转，离开页面都会清理放大预览；原图加载失败时显示提示并保留缩略图。

## Git 与本地素材

Git 只管理源码、配置和说明，不管理图片文件（包括 SVG 图表）。`my-site/public/assets/` 为本地发布素材；`assets-source/unused/` 保存当前页面不用的旧素材和 PNG 缩略图，位于发布目录之外。忽略规则统一位于根目录 `.gitignore`，文本文件统一使用 LF。

克隆仓库后须从本地素材备份恢复 `my-site/public/assets/`，再进行预览或部署。图表可由研究脚本重建，缩略图可由统一脚本重建；截图、立绘和建筑照片原图仍须单独保存。图片忽略规则影响 Git，不影响 Wrangler 发布本地 `public/` 目录。

页面视觉效果由网站所有者检查。`output/playwright/` 中的旧记录属于先前页面版本，不能作为本轮视觉验收依据。

素材命名统一为 `项目名_内容分类_说明.扩展名`；文件名变化必须同步图片清单、静态备用图与同名 WebP 缩略图。2026-10-09 的旧名、新名和 SHA-256 对照见 [素材重命名对照表](docs/asset-renames-2026-10-09.csv)。原图与已有缩略图仅重命名，内容保持不变；自动生成的汽车研究图表保留脚本的序号命名；QuantChain 演示稿保留 slide-XX 页码命名，以便核对选图。

联系页末尾沿用原“回到序言”的链接样式，致谢实际使用的 ASCII Fluid 背景组件、Lucide 图标及 Cloudflare Workers 静态资源服务，链接指向官方文档，并在新标签页打开。


<!-- archive-preparation:2026-10-14:start -->
## 使用与归档说明（2026-10-14）

my-site/public 是作品展示网站，包含项目介绍、图表与图片放大交互，使用 Wrangler 配置本地预览与发布。源图与网页展示资源分开放置。

### 结构与入口

- `README.md`：页面、素材恢复与预览说明。
- [my-site/package.json](my-site/package.json)：本地预览脚本。
- [my-site/wrangler.jsonc](my-site/wrangler.jsonc)：网站配置。
- [scripts/build_thumbnails.py](scripts/build_thumbnails.py)：缩略图生成。
- [scripts/build_auto_figures.py](scripts/build_auto_figures.py)：研究汇总图生成。
- [docs/auto-figures.md](docs/auto-figures.md)：图表口径。

### 使用前提

先按原 README 恢复 my-site/public/assets/；在 my-site 执行 npm ci、npm run dev 进行本地预览。缩略图脚本需 Pillow，研究图脚本需 openpyxl 和外部 AUTO_RESEARCH_PROJECT 数据；外部研究原件不在本目录。本轮未执行部署。

### 归档分工

**GitHub：** my-site 中 HTML / CSS / JavaScript、Wrangler 配置、依赖锁文件、scripts 和 docs，保留 Lucide 许可证。

**夸克网盘：** 审核后的 my-site/public/assets/ 可作必需配套素材包；assets-source/ 原图、证书、照片另作私人备份，检查展示与再分发权限后再选入分享包。

### 当前限制

现有 Git 忽略 public/assets，克隆后需资源还原；网页运行需要的图片不能只留下空目录。根目录未见独立项目许可证，发布前由作者决定。

本次仅完成本地结构、关键入口与依赖检查，以及 README 准备，未验证全部运行功能。本轮未创建 GitHub 仓库或夸克分享链接，也未上传本次归档；后续归档须经目录所有者批准。

作者自有内容尚未统一选择开源许可证；第三方源码和资源沿用原许可，目录内出现的第三方许可证不自动覆盖其他文件。
<!-- archive-preparation:2026-10-14:end -->
