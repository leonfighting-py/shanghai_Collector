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

| 变量 | 必须 | 说明 |
|------|------|------|
| `DATABASE_URL` | 线上必须 | Supabase Postgres 连接串（见下方） |
| `COLLECT_SECRET` | 建议 | 保护 `/api/collect`、`/api/cleanup` 手动调用 |
| `LLM_DEDUPE_ENABLED` | 否 | 小模型二次去重，默认 `false` |

**不需要** Supabase 的 Project URL、anon key、JWT secret。本项目用 `pg` 直连 Postgres。

### Supabase 连接串在哪找

1. 打开 Supabase 项目首页
2. 点右上角绿色 **Connect** 按钮
3. 复制 **URI**：
   - **Direct connection（5432）** → 本地开发、GitHub Actions 采集
   - **Transaction pooler（6543）** → Vercel 部署
4. 把 `[YOUR-PASSWORD]` 换成数据库密码（忘了可在 Database settings 里 Reset）

## 数据接口

- `GET /`：活动首页，默认展示未来 14 天
- `GET /api/events?week=YYYY-MM-DD&category=演出音乐&search=爵士`：查询活动（`week` 为窗口起始日）
- `POST /api/collect`：采集并发布（Vercel 免费档会超时，请用 GitHub Actions）
- `POST /api/cleanup`：清理 60 天以前活动、90 天以前采集日志

## 免费部署（Vercel + Supabase + GitHub Actions）

```text
访客 → Vercel（Next.js 首页 + /api/events）
         ↓
      Supabase Postgres

GitHub Actions（每两日）→ npm run collect → Supabase
GitHub Actions（每两月）→ npm run cleanup → Supabase
```

### 1. Supabase

- 创建项目（你已有：`zvlnemhtzxtxaaxulodg`）
- 首次 `npm run collect` 会自动建表

### 2. Vercel

1. [vercel.com](https://vercel.com) → Import GitHub 仓库 `shanghai_Collector`
2. Environment Variables：
   - `DATABASE_URL` = Supabase **Transaction pooler（6543）** 连接串
   - `COLLECT_SECRET` = 随机字符串（可选）
3. Deploy

### 3. GitHub Actions

仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 值 |
|--------|-----|
| `DATABASE_URL` | Supabase **Direct connection（5432）** 连接串 |

采集默认定时：每两日 01:00 UTC。也可在 Actions 页手动 **Run workflow** 触发首次采集。

### 4. 本地验证

```bash
npm run collect   # 写入 Supabase
npm run dev       # 打开 http://localhost:3000 查看真实数据
```

## 后端数据结构

- `source_configs`：采集源配置
- `collection_runs`：每次采集任务状态
- `raw_events`：原始召回候选
- `events`：去重后发布的活动

## 第一版边界

- 只抓公开网页，登录、验证码、强反爬页面先跳过并记录失败
- 必须具备标题、时间、地点、分类、报名链接、来源，缺字段不发布
- 去重先用规则硬去重，小模型二次去重默认关闭
