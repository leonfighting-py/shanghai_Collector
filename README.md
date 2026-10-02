# 上海未来两周活动雷达

一个轻量全栈 MVP，用来自动聚合上海未来两周的演出音乐、展览、线下活动和高校公开讲座。

## 本地运行

```bash
npm install
cp .env.example .env   # 填入 Supabase DATABASE_URL
npm run dev
```

没有 `DATABASE_URL` 时，首页会展示内置样例数据。接入 Supabase Postgres 后，运行 `npm run collect` 写入真实活动。

## 环境变量

| 变量               | 必须   | 说明                                                |
| ---------------- | ---- | ------------------------------------------------- |
| `DATABASE_URL` | 线上必须 | Supabase Postgres 连接串（见下方） |
| `COLLECT_SECRET` | 建议 | 保护 `/api/collect`、`/api/cleanup` 手动调用（未配置时接口直接拒绝） |
| `LLM_EXTRACT_ENABLED` | 否 | 通用 LLM 抽取（`parser: llmExtract` 的源），需配合 `SILICONFLOW_API_KEY` |
| `LLM_BUDGET_MAX_CALLS` | 否 | 单次采集周期 LLM 调用次数上限，默认 1000；超额软熔断（后续批次跳过并记入 failures，采集不中断，已抓数据照常发布）。可用 `LLM_BUDGET_ENABLED=false` 关闭 |
| `NEXT_PUBLIC_SITE_URL` | 否 | 站点基址，用于 RSS / sitemap / llms.txt 生成绝对链接，默认 `https://news.leoncoooolest.com` |

**不需要** Supabase 的 Project URL、anon key、JWT secret。本项目用 `pg` 直连 Postgres。

### Supabase 连接串在哪找

1. 打开 Supabase 项目首页
2. 点右上角绿色 **Connect** 按钮
3. 复制 **URI**：

   * **Direct connection（5432）** → 本地开发、GitHub Actions 采集

   * **Transaction pooler（6543）** → Vercel 部署
4. 把 `[YOUR-PASSWORD]` 换成数据库密码（忘了可在 Database settings 里 Reset）

## 数据接口

- `GET /`：活动首页，默认展示未来 14 天
- `GET /api/events?week=YYYY-MM-DD&category=演出音乐&search=爵士`：查询活动（`week` 为窗口起始日）
- `GET /feed.xml?category=展览`：RSS 2.0 订阅源（可按分类过滤）
- `GET /sitemap.xml`、`GET /robots.txt`：搜索引擎收录
- `GET /llms.txt`：面向 AI agent 的纯文本站点说明（分类、API 用法、字段）

采集与清理只通过 GitHub Actions 调用本地脚本（`npm run collect` / `npm run cleanup`），Worker 上不暴露任何管理接口。

## 免费部署（Cloudflare Workers + Supabase + GitHub Actions）

```text
访客 → Cloudflare Workers（news.leoncoooolest.com）
         ↓ Hyperdrive
      Supabase Postgres

GitHub Actions（每两日）→ npm run collect → Supabase
```

### Cloudflare（推荐，当前线上）

1. 安装依赖：`npm install`
2. 创建 Hyperdrive（一次性）：

   ```bash
   npx wrangler hyperdrive create news-collector-supabase \
     --connection-string="$DATABASE_URL" --caching-disabled
   ```

   把返回的 `id` 填入 `wrangler.jsonc` 的 `hyperdrive` 绑定。
3. 本地预览：`cp .dev.vars.example .dev.vars` 并填入 `DATABASE_URL`
4. 构建并部署：

   ```bash
   export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$DATABASE_URL"
   npm run build:cloudflare
   npm run deploy:cloudflare
   ```

自定义域名在 `wrangler.jsonc` 的 `routes` 中配置（当前：`news.leoncoooolest.com`）。

## 免费部署（Vercel + Supabase + GitHub Actions）

```text
访客 → Vercel（Next.js 首页 + /api/events）
         ↓
      Supabase Postgres

GitHub Actions（每两日）→ npm run collect → Supabase
GitHub Actions（每两月）→ npm run cleanup → Supabase
```

### 1. Supabase

* 创建项目（你已有：`zvlnemhtzxtxaaxulodg`）

* 首次 `npm run collect` 会自动建表

### 2. Vercel

1. [vercel.com](https://vercel.com) → Import GitHub 仓库 `shanghai_Collector`
2. Environment Variables：

   * `DATABASE_URL` = Supabase **Transaction pooler（6543）** 连接串

   * `COLLECT_SECRET` = 随机字符串（可选）
3. Deploy

### 3. GitHub Actions

仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret         | 值                                        |
| -------------- | ---------------------------------------- |
| `DATABASE_URL` | Supabase **Direct connection（5432）** 连接串 |

采集默认定时：每两日 01:00 UTC。也可在 Actions 页手动 **Run workflow** 触发首次采集。

### 4. 本地验证

```bash
npm run collect   # 写入 Supabase
npm run dev       # 打开 http://localhost:3000 查看真实数据
```

## 微信小程序（微信云托管，免域名免备案）

```text
小程序 → wx.cloud.callContainer（微信私有协议，无需服务器域名/备案）
           ↓
        微信云托管 cloudrun/（Node + Express 薄查询层）
           ↓ pg 直连
        Supabase Postgres（与 Web 端同一份数据）

采集层不变：GitHub Actions → npm run collect → Supabase
```

小程序端**不需要自有域名、不需要 ICP 备案**：`callContainer` 走微信专线，`/api/events` 的参数与响应和 Web 端完全一致（14 天窗口 + 展览回看 60 天 + 讲座回看 30 天 + 规则去重 + 公开 DTO）。

### 1. 部署云托管服务（cloudrun/）

1. [微信云托管控制台](https://cloud.weixin.qq.com/cloudrun) 创建服务，名称 `events-api`
2. 上传方式二选一：
   - **绑定 GitHub 仓库**：选仓库 + 分支 `main`，端口 `80`。云托管只查找**仓库根目录**的 `Dockerfile`（根目录已放了一份，与 `cloudrun/Dockerfile` 内容一致），构建目录保持默认（仓库根），无需额外配置
   - **本地代码上传**：把仓库根目录打包上传，或新建版本时在高级设置里把 Dockerfile 路径填 `cloudrun/Dockerfile`
3. 环境变量：`DATABASE_URL` = Supabase **Transaction pooler（6543）** 连接串
4. 部署后用控制台「服务设置 - 公网访问」的默认域名验证：`curl https://<默认域名>/api/events`

> 服务复用主工程的 `src/lib/events.js` / `src/lib/dedupe.js`（纯函数），因此**构建目录必须是仓库根目录**，不能填 `cloudrun`。
> 根目录的 `.dockerignore` 已排除 `node_modules`、`.next` 等，构建上下文约 1 MB（不加会到 1.8 GB）。

本地验证（无需部署）：

```bash
cd cloudrun && npm install
PORT=8787 node --env-file=../.env server.js
curl http://localhost:8787/api/events
```

### 2. 配置小程序（miniprogram/）

1. 微信开发者工具导入 `miniprogram/` 目录，填入自己的 AppID（个人主体即可）
2. 在 `miniprogram/utils/config.js` 填写：
   - `CLOUD_ENV`：云托管环境 ID（控制台**右上角「环境」下拉**即可看到，当前已填 `prod-d2gcdfycq884b1e6b`）
   - `SERVICE`：服务名（默认 `events-api`，必须与控制台服务名逐字一致）

> 环境 ID 不要在别处找：微信云托管控制台没有「环境信息」板块，小程序后台（mp.weixin.qq.com）里也看不到云托管——两者是独立控制台。
3. 编译预览即可（`callContainer` 不受合法域名校验限制）

### 3. 报名链接跳转说明

个人主体小程序无法使用 web-view（且 web-view 也只能打开自有业务域名，第三方报名页任何主体都无法内嵌），因此报名跳转策略为：

- 大麦 / 活动行 / 秀动等平台小程序直达：在 `miniprogram/utils/registration.js` 的 `REGISTRY` 中补齐对应 `appId` 后自动启用
- 其余来源：复制报名链接到剪贴板，引导用户在浏览器打开

### 4. 待办（后续迭代）

- [ ] 实测活动行图片在小程序 `<image>` 下的防盗链表现（已做 `binderror` 降级隐藏）
- [ ] 补齐大麦 / 活动行 / 秀动小程序 appId，启用报名直达
- [ ] 订阅消息：活动开始前提醒（个人主体可用一次性订阅）

## 后端数据结构

* `source_configs`：采集源配置

* `collection_runs`：每次采集任务状态

* `raw_events`：原始召回候选

* `events`：去重后发布的活动

## 信源分级与 LLM 配置

**信源分级 T1/T2**：`SOURCE_SEEDS` 通过 `resolveSourceTier()` 自动分级——T1 为一手源（场馆官网、高校 `.edu.cn`、`.gov.cn`），T2 为聚合器（iMuseum、活动行、豆瓣等）。去重合并时 T1 的字段覆盖 T2（同一条活动优先采纳场馆信息），推荐评分对含 T1 来源的活动温和加权。

**提示词外置**：LLM 抽取的系统提示词放在 [`src/lib/parsers/prompts/llm-extract.md`](src/lib/parsers/prompts/llm-extract.md)，便于非工程同事审阅调优；运行时由 `llm-extract.js` 懒加载。

**预算熔断**：单次采集周期 LLM 调用受 `LLM_BUDGET_MAX_CALLS`（默认 1000）限制，超额软熔断——后续批次跳过并记入 failures，采集不中断、已抓数据照常发布。

**内容守门**：`isOffTopicEvent()` 在 `isPublishableEvent()` 统一拦截成人向、夜店拉客、擦边导览类条目（如 `BDSM Tour` / `Pub Crawl`）。聚合平台（Eventbrite 等）常被同一发布者灌入此类 Listing，此守门对所有源生效。

**源健康巡检**：`node scripts/source-health-check.js` 输出体检报告，含实时探活（逐源 fetch + parse）与最近 10 次 `collection_runs` 的历史失败趋势（发现持续/间歇故障源），写入 `scripts/source-health-report.{md,json}`。

**信源告警**：配置 `FEISHU_WEBHOOK_URL` 后，每次采集结束会把"需要人介入"的信号推到飞书群——同一信源连续失败 `ALERT_CONSECUTIVE_FAILURES`（默认 2）次、分类召回塌方、发布守门拦截；偶发单次超时不报，避免告警疲劳。另由 `.github/workflows/health.yml` 每周一推送一次体检报告。未配置 webhook 时全部静默跳过。

## 第一版边界

* 只抓公开网页，登录、验证码、强反爬页面先跳过并记录失败

* 必须具备标题、时间、地点、分类、报名链接、来源，缺字段不发布

* 去重先用规则硬去重，小模型二次去重默认关闭

