# 上海每周活动雷达

一个轻量全栈 MVP，用来每周自动聚合上海演出音乐、展览、线下活动和高校公开讲座。

## 本地运行

```bash
npm install
npm run dev
```

没有 `DATABASE_URL` 时，首页会展示内置样例数据，便于先看页面。接入 Postgres 后，`/api/collect` 会写入真实活动数据。

## 环境变量

- `DATABASE_URL`：Postgres 连接串。
- `COLLECT_SECRET`：保护采集入口 `/api/collect`。
- `WEB_BASE_URL`：Render Cron 调用 Web Service 时使用的线上地址。
- `LLM_DEDUPE_ENABLED`：是否启用小模型二次去重，默认 `false`。
- `DEDUPER_MODEL`：预留的小模型名称，例如 `gpt-5-nano`。
- `OPENAI_API_KEY`：未来启用 LLM 去重时使用。

## 数据接口

- `GET /`：活动首页，默认展示本周。
- `GET /api/events?week=YYYY-MM-DD&category=演出音乐&search=爵士`：查询活动。
- `POST /api/collect`：采集公开网页并发布本周数据。请求头需要 `x-collect-secret`。
- `POST /api/cleanup`：清理 60 天以前活动数据和 90 天以前采集日志。请求头需要 `x-collect-secret`。

## 后端数据结构

- `source_configs`：采集源配置，后续可把手写 source 迁到数据库管理。
- `collection_runs`：每次采集任务的状态、失败源、raw 数量和发布数量。
- `raw_events`：原始召回候选，字段不完整也保留，便于排查漏召回和误过滤。
- `events`：最终发布活动，去重后供前端读取。

## 部署到 Render

1. 在 Render 使用 `render.yaml` 创建 Blueprint。
2. 创建后把 Web Service 的线上地址填入 Cron Job 的 `WEB_BASE_URL`。
3. 确保 Web Service 和 Cron Job 使用同一个 `COLLECT_SECRET`。
4. 采集 Cron 默认每周一 01:00 UTC 运行；后续要改日更，只需要调整 `render.yaml` 里的 `schedule`。
5. 清理 Cron 默认每两个月运行一次，删除 60 天以前活动数据。

## 第一版边界

- 只抓公开网页，登录、验证码、强反爬页面先跳过并记录失败。
- 必须具备标题、时间、地点、分类、报名链接、来源，缺字段不发布。
- 去重先用标题+日期+地点硬去重，再用同日、同分类、相似标题和相似地点做规则兜底。
- 小模型二次去重接口已预留，但默认关闭；后续只处理规则不确定的候选对。
